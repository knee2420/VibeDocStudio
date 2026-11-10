"""작업대 평가 실행기 — 실행 중인 API(실제 agy ACP)에 작업대 · 리소스 첨부와 함께 요청을 보내고 채점한다.

    python evals/wb_eval.py --label wb-baseline [--only F1,RE] [--holdout include|only|exclude]

결과: evals/results/<label>-<시각>/{report.md, results.json}
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_vault  # noqa: E402
from build_workbench import ALPHA, BETA, DOCS, REFS, build, write_binding  # noqa: E402
from run_evals import WS, _add_usage, _jsonl_since, _post  # noqa: E402
from wb_scenarios import SCENARIOS, WRun  # noqa: E402
from vibefs.workbench import RefBook  # noqa: E402

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


def _session_jsonl(name: str, sid: str) -> list[dict[str, Any]]:
    try:
        lines = (WS / name).read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    out = []
    for line in lines:
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("session") == sid:
            out.append(rec)
    return out


def _confirm(sid: str, project_id: str, refs: list[str], pick: Any) -> list[dict[str, Any]]:
    """사용자 대신 확정한다: 이 세션의 제안 카드 중 pick(카드) 이 고른 것을 바인딩에 확정 카드로 쓴다."""
    latest: dict[str, dict[str, Any]] = {}
    for rec in _session_jsonl("interpretations.jsonl", sid):
        latest[str(rec.get("cardId"))] = rec
    chosen = [c for c in latest.values() if pick(c)]
    consensus: dict[str, list[dict[str, Any]]] = {}
    for c in chosen:
        consensus.setdefault(str(c["refId"]), []).append({k: c.get(k) for k in ("cardId", "layer", "scope", "adoption", "reading",
                                                                                "evidence", "alternatives")})
    write_binding(project_id, consensus, refs)
    return chosen


def run_one(base: str, sc: dict[str, Any], model: str | None) -> dict[str, Any]:
    sid = json.loads(_post(base, "/api/assistant/sessions", {"model": model} if model else {}).read())["sessionId"]
    project_id = "evalproj_" + re.sub(r"[^\w-]", "_", sc["id"])
    ref_ids = [r["refId"] for r in sc["wb"].get("references") or []]
    write_binding(project_id, sc.get("consensus"), ref_ids)
    wbp = {**sc["wb"], "projectId": project_id, "documentsRoot": str(DOCS.resolve()), "referencesRoot": str(REFS.resolve())}
    ctx = [{"kind": "workbench", "id": "wb:state", "label": "작업대", "content": json.dumps(wbp, ensure_ascii=False)}]
    mount = _mount(sc.get("res"))
    if mount:
        ctx.append({"kind": "resource-mount", "id": "rm:checked-resources", "label": "리소스", "content": json.dumps(mount, ensure_ascii=False)})
    started = time.time()
    events: list[dict[str, Any]] = []
    turns = sc.get("turns") or [sc["prompt"]]
    last_turn = 0
    # 시나리오가 미리 심은 확정 카드도 '사용자가 확정한 카드' 다
    confirmed: list[dict[str, Any]] = [dict(c, refId=rid, status="confirmed") for rid, cs in (sc.get("consensus") or {}).items() for c in cs]
    for text in turns:
        if isinstance(text, dict) and "confirm" in text:
            confirmed += _confirm(sid, project_id, ref_ids, text["confirm"])
            continue
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
    sources = [e for e in events if e.get("type") == "workspace_sources"]
    cards = list({str(r.get("cardId")): r for r in _session_jsonl("interpretations.jsonl", sid)}.values())
    ref_reads = _session_jsonl("ref_reads.jsonl", sid)
    run = WRun(answer=answer, thinking=thinking, tools=tool_list, reads=[str(r.get("path")) for r in reads],
               proposals=proposals, ref_texts=_ref_texts(sc["wb"]), sources=(sources[-1].get("sources") if sources else []),
               cards=cards, ref_reads=ref_reads, confirmed=confirmed)
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
        "id": sc["id"], "area": sc["area"], "holdout": bool(sc.get("holdout")),
        "prompt": " → ".join(t if isinstance(t, str) else "[사용자 확정]" for t in turns), "session": sid,
        "cards": [{k: c.get(k) for k in ("cardId", "refId", "layer", "scope", "adoption", "reading", "alternatives")} for c in cards],
        "refReads": [{"refId": r.get("refId"), "anchor": r.get("anchor"), "n": len(r.get("blocks") or []), "pins": r.get("pins")}
                     for r in ref_reads],
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
        if r.get("refReads"):
            lines.append("**레퍼런스 읽기**: " + " · ".join(f"{x['anchor']}({x['n']}){'📌' if x.get('pins') else ''}" for x in r["refReads"]))
        for c in r.get("cards") or []:
            alts = f" · 대안 {len(c.get('alternatives') or [])}" if c.get("alternatives") else ""
            lines.append(f"- 카드 {c['cardId']} {c['layer']} {c['adoption']} {c['scope']}{alts} — {str(c.get('reading'))[:140]}")
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
    ap.add_argument("--jobs", type=int, default=1, help="동시에 돌릴 시나리오 수 (리소스 마운트 없는 시나리오에만 권장)")
    ap.add_argument("--base", default=os.environ.get("VIBE_API", "http://localhost:8090"))
    args = ap.parse_args()
    build()
    wanted = [s for s in SCENARIOS
              if (not args.only or any(s["id"].startswith(o) for o in args.only.split(",")))
              and (args.holdout == "include" or (args.holdout == "only") == bool(s.get("holdout")))]
    out = HERE / "results" / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    results = []

    def one(sc: dict[str, Any]) -> dict[str, Any]:
        print(f"[wb] {sc['id']} …", flush=True)
        try:
            r = run_one(args.base, sc, args.model)
            print(f"[wb]   {sc['id']} → {'통과' if r['passed'] else '실패'} {r['score']} ({r['seconds']}s)", flush=True)
            return r
        except Exception as exc:
            print(f"[wb]   {sc['id']} → 오류: {exc}", flush=True)
            return {"id": sc["id"], "area": sc["area"], "holdout": bool(sc.get("holdout")), "prompt": sc.get("prompt", ""),
                    "error": str(exc), "passed": False, "score": "0", "seconds": 0, "usage": {}, "tools": [], "denies": [],
                    "reads": [], "proposals": [], "checks": [], "answer": "", "thinking": "", "errors": [str(exc)]}

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        for r in pool.map(one, wanted):
            results.append(r)
            report(args.label, results, out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
