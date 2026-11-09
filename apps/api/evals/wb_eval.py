"""작업대 평가 실행기 — 실행 중인 API(실제 agy ACP)에 작업대 · 리소스 첨부와 함께 요청을 보내고 채점한다.

    python evals/wb_eval.py --label wb-baseline [--only F1,RE] [--holdout include|only|exclude]

결과: evals/results/<label>-<시각>/{report.md, results.json}
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_vault  # noqa: E402
from build_workbench import ALPHA, BETA, DOCS, REFS, build  # noqa: E402
from run_evals import WS, _add_usage, _jsonl_since, _post  # noqa: E402
from wb_scenarios import SCENARIOS, WRun  # noqa: E402
from workbench import RefBook  # noqa: E402

PROPOSALS = WS / "proposals"


def _mount(kind: str | None) -> dict[str, Any] | None:
    if kind == "alpha":
        roots = [ALPHA / r for r in build_vault.ROOTS]
        files = [ALPHA / rel for rel in build_vault.FILES]
    elif kind == "beta":
        roots = [BETA / "research"]
        files = [p for p in (BETA / "research").rglob("*") if p.is_file()]
    else:
        return None
    id_map = {str(p.resolve()): "file_" + hashlib.md5(p.as_posix().encode()).hexdigest()[:10] for p in files}
    return {"roots": [{"id": "", "path": str(r.resolve()), "title": r.name} for r in roots], "files": [], "idMap": id_map}


def _ref_texts(wbp: dict[str, Any]) -> dict[str, str]:
    return {ref["refId"]: RefBook.load(str(REFS / ref["refId"])).text() for ref in wbp.get("references") or []}


def run_one(base: str, sc: dict[str, Any], model: str | None) -> dict[str, Any]:
    sid = json.loads(_post(base, "/api/assistant/sessions", {"model": model} if model else {}).read())["sessionId"]
    wbp = {**sc["wb"], "documentsRoot": str(DOCS.resolve()), "referencesRoot": str(REFS.resolve())}
    ctx = [{"kind": "workbench", "id": "wb:state", "label": "작업대", "content": json.dumps(wbp, ensure_ascii=False)}]
    mount = _mount(sc.get("res"))
    if mount:
        ctx.append({"kind": "resource-mount", "id": "rm:checked-resources", "label": "리소스", "content": json.dumps(mount, ensure_ascii=False)})
    started = time.time()
    events: list[dict[str, Any]] = []
    turns = sc.get("turns") or [sc["prompt"]]
    last_turn = 0
    for text in turns:
        last_turn = len(events)
        body = {"text": text, "contexts": ctx, "tools": [], **({"model": model} if model else {})}
        with _post(base, f"/api/assistant/sessions/{sid}/messages", body) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
    ended = time.time()
    try:
        urllib.request.urlopen(urllib.request.Request(base + f"/api/assistant/sessions/{sid}", method="DELETE"), timeout=30)
    except Exception:
        pass
    answer = "".join(e.get("text", "") for e in events[last_turn:] if e.get("type") == "text_delta")
    thinking = "".join(e.get("text", "") for e in events if e.get("type") == "thinking_delta")
    tools: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for e in events:
        if e.get("type") == "agent_tool":
            key = str(e.get("callId") or len(order))
            if key not in tools:
                order.append(key)
                tools[key] = dict(e)
            else:
                tools[key].update({k: v for k, v in e.items() if v not in (None, {}, "")})
    tool_list = [tools[k] for k in order]
    reads = [r for r in _jsonl_since(WS / "reads.jsonl", started - 1) if float(r.get("ts", 0)) <= ended + 1 and r.get("ok", True)]
    proposals = []
    folder = PROPOSALS / sid
    if folder.is_dir():
        for f in sorted(folder.glob("*.json")):
            proposals.append(json.loads(f.read_text(encoding="utf-8")))
        proposals.sort(key=lambda p: p.get("createdAt", 0))
    run = WRun(answer=answer, thinking=thinking, tools=tool_list, reads=[str(r.get("path")) for r in reads],
               proposals=proposals, ref_texts=_ref_texts(sc["wb"]))
    checks = []
    for check in sc["checks"]:
        try:
            ok, note = check(run)
        except Exception as exc:  # 채점기 오류도 기록
            ok, note = False, f"채점 오류: {exc}"
        checks.append({"ok": ok, "note": note, "bonus": "(가점)" in note})
    hooks = _jsonl_since(WS / "hook.jsonl", started - 1)
    usage = _add_usage([e.get("usage") or {} for e in events if e.get("type") == "turn_done"])
    return {
        "id": sc["id"], "area": sc["area"], "holdout": bool(sc.get("holdout")), "prompt": " → ".join(turns), "session": sid,
        "seconds": round(ended - started, 1), "usage": usage,
        "tools": [{"name": run.names()[i], "state": t.get("state"), "params": t.get("params"), "error": t.get("error")} for i, t in enumerate(tool_list)],
        "denies": [{"tool": h.get("tool"), "reason": h.get("reason")} for h in hooks if h.get("decision") == "deny"],
        "reads": sorted({os.path.basename(p) for p in run.reads}),
        "proposals": [{"id": p["id"], "status": p["status"], "mode": p["mode"], "n": len(p.get("candidates") or []),
                       "report": p.get("report"), "candidates": p.get("candidates")} for p in proposals],
        "checks": checks, "passed": all(c["ok"] for c in checks if not c["bonus"]),
        "score": f"{sum(c['ok'] for c in checks)}/{len(checks)}",
        "answer": answer, "thinking": thinking,
        "errors": [e.get("message") for e in events if e.get("type") == "error"],
    }


def report(label: str, results: list[dict[str, Any]], out: Path) -> None:
    def rate(rows):
        return f"{sum(r['passed'] for r in rows)}/{len(rows)}"
    tune = [r for r in results if not r["holdout"]]
    hold = [r for r in results if r["holdout"]]
    lines = [f"# 작업대 평가 — {label}", "", f"전체 {rate(results)} · 튜닝 세트 {rate(tune)} · 보류 세트 {rate(hold)}", "",
             "| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |", "|---|---|---|---|---|---|---|---|"]
    for r in results:
        u = r["usage"] or {}
        props = ",".join(f"{p['status']}:{p['n']}" for p in r["proposals"]) or "-"
        lines.append(f"| {r['id']}{' (보류)' if r['holdout'] else ''} | {r['area']} | {'✅' if r['passed'] else '❌'} | {r['score']} | "
                     f"{r['seconds']}s | {u.get('input_tokens', 0):,}/{u.get('cached_read_tokens', 0):,}/{u.get('output_tokens', 0):,} | "
                     f"{len(r['tools'])} | {props} |")
    for r in results:
        lines += ["", f"## {r['id']} — {r['area']}", f"> {r['prompt']}", ""]
        lines += [f"- {'✅' if c['ok'] else '❌'} {c['note']}" for c in r["checks"]]
        if r.get("errors"):
            lines.append(f"- ⚠️ 오류: {r['errors']}")
        lines += ["", "**도구**: " + " → ".join(f"{t['name']}{'✗' if t['state'] == 'error' else ''}" for t in r["tools"])]
        lines += ["", f"**읽은 원천**: {', '.join(r['reads']) or '없음'}"]
        for p in r["proposals"]:
            rep = p.get("report") or {}
            lines.append(f"- 후보 {p['id']} {p['status']} {p['n']}안 {p['mode']} · 오류 {len(rep.get('errors') or [])} · 경고 {len(rep.get('warnings') or [])}")
            for e in (rep.get("errors") or [])[:3]:
                lines.append(f"  - ✗ {e[:200]}")
        lines += ["", "<details><summary>생각</summary>", "", r["thinking"][:2500], "", "</details>", "", "**답변**", "", r["answer"][:2500]]
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")
    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="wb")
    ap.add_argument("--only", default="")
    ap.add_argument("--holdout", default="exclude", choices=["include", "only", "exclude"])
    ap.add_argument("--model", default=None)
    ap.add_argument("--base", default=os.environ.get("VIBE_API", "http://localhost:8090"))
    args = ap.parse_args()
    build()
    wanted = [s for s in SCENARIOS
              if (not args.only or any(s["id"].startswith(o) for o in args.only.split(",")))
              and (args.holdout == "include" or (args.holdout == "only") == bool(s.get("holdout")))]
    out = HERE / "results" / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    results = []
    for sc in wanted:
        print(f"[wb] {sc['id']} …", flush=True)
        try:
            results.append(run_one(args.base, sc, args.model))
            r = results[-1]
            print(f"[wb]   → {'통과' if r['passed'] else '실패'} {r['score']} ({r['seconds']}s)", flush=True)
        except Exception as exc:
            print(f"[wb]   → 오류: {exc}", flush=True)
            results.append({"id": sc["id"], "area": sc["area"], "holdout": bool(sc.get("holdout")), "prompt": sc.get("prompt", ""),
                            "error": str(exc), "passed": False, "score": "0", "seconds": 0, "usage": {}, "tools": [], "denies": [],
                            "reads": [], "proposals": [], "checks": [], "answer": "", "thinking": "", "errors": [str(exc)]})
        report(args.label, results, out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
