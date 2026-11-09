"""하네스 평가 실행기 — 실행 중인 API(실제 agy ACP 엔진)에 시나리오를 보내고, 이벤트 · 훅 로그 · 읽기 원장으로 채점한다.

    python evals/run_evals.py --label baseline [--only S1,S3] [--model gemini-3.8-flash] [--base http://localhost:8090]

결과: evals/results/<label>-<시각>/{report.md, results.json}
시나리오는 하나씩 순서대로 돈다 (읽기 원장을 실행 구간으로 나눠 채점하므로).
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

from build_vault import FILES, ROOTS, build  # noqa: E402
from scenarios import SCENARIOS, RunResult  # noqa: E402

API_ROOT = HERE.parent
STATE = API_ROOT / "state"
VAULT = STATE / "evals" / "vault"
WS = STATE / "assistant" / "workspace"


def _post(base: str, path: str, body: dict[str, Any], timeout: float = 1800) -> Any:
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout)


def _mount_payload() -> tuple[dict[str, Any], dict[str, str]]:
    id_map = {str((VAULT / rel).resolve()): "file_" + hashlib.md5(rel.encode()).hexdigest()[:10] for rel in FILES}
    roots = [{"id": "", "path": str((VAULT / r).resolve()), "title": Path(r).name} for r in ROOTS]
    return {"roots": roots, "files": [], "idMap": id_map}, id_map


def _jsonl_since(path: Path, since: float) -> list[dict[str, Any]]:
    out = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if float(rec.get("ts") or 0) >= since:
                out.append(rec)
    except OSError:
        pass
    return out


def _add_usage(parts: list[dict[str, Any]]) -> dict[str, Any]:
    total: dict[str, Any] = {}
    for part in parts:
        for key, value in part.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                total[key] = total.get(key, 0) + value
    return total


def _rel(path: str) -> str:
    try:
        return Path(path).resolve().relative_to(VAULT.resolve()).as_posix()
    except (ValueError, OSError):
        return path.replace("\\", "/")


def run_one(base: str, scenario: dict[str, Any], payload: dict[str, Any], id_map: dict[str, str],
            group_of: dict[str, str], model: str | None) -> dict[str, Any]:
    sid = json.loads(_post(base, "/api/assistant/sessions", {"model": model} if model else {}).read())["sessionId"]
    ctx = [{"kind": "resource-mount", "id": "rm:checked-resources", "label": "평가 볼트", "content": json.dumps(payload, ensure_ascii=False)}]
    started = time.time()
    events: list[dict[str, Any]] = []
    turns = scenario.get("turns") or [scenario["prompt"]]
    last_turn_start = 0
    for text in turns:
        last_turn_start = len(events)
        body = {"text": text, "contexts": ctx, "tools": [], **({"model": model} if model else {})}
        with _post(base, f"/api/assistant/sessions/{sid}/messages", body) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
    ended = time.time()
    # 세션을 닫아 마운트를 내린다 (남겨 두면 다른 세션 · lab 사용자 세션에 섞여 보일 수 있었다)
    try:
        urllib.request.urlopen(urllib.request.Request(base + f"/api/assistant/sessions/{sid}", method="DELETE"), timeout=30)
    except Exception:
        pass
    # 채점은 마지막 턴의 답으로 한다 (도구 · 읽기는 대화 전체)
    answer = "".join(e.get("text", "") for e in events[last_turn_start:] if e.get("type") == "text_delta")
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
    rel_reads = {_rel(str(r.get("path", ""))) for r in reads}
    read_groups = {group_of[p] for p in rel_reads if p in group_of}
    usage = next((e.get("usage") for e in reversed(events) if e.get("type") == "turn_done"), {}) or {}
    result = RunResult(answer=answer, thinking=thinking, tools=tool_list, reads=reads, read_groups=read_groups,
                       group_of=group_of, rel_reads=rel_reads, id_map=id_map, usage=usage, events=events)
    checks = []
    for check in scenario["checks"]:
        ok, note = check(result)
        checks.append({"ok": ok, "note": note, "bonus": "(가점)" in note})
    hooks = _jsonl_since(WS / "hook.jsonl", started - 1)
    denies = [h for h in hooks if h.get("decision") == "deny"]
    names = [str(t.get("name", "")) for t in tool_list]
    usage = _add_usage([e.get("usage") or {} for e in events if e.get("type") == "turn_done"])
    return {
        "id": scenario["id"], "skill": scenario["skill"], "prompt": " → ".join(turns), "session": sid,
        "seconds": round(ended - started, 1), "usage": usage,
        "tools": [{"name": t.get("name"), "state": t.get("state"), "params": t.get("params"), "error": t.get("error")} for t in tool_list],
        "vibefs_calls": sum(1 for n in names if n.startswith("mcp_vibefs") or n.startswith("ws_")),
        "read_calls": sum(1 for n in names if n == "read_file"),
        "denies": [{"tool": d.get("tool"), "reason": d.get("reason")} for d in denies],
        "files_read": sorted(rel_reads),
        "checks": checks,
        "passed": all(c["ok"] for c in checks if not c["bonus"]),
        "score": f"{sum(c['ok'] for c in checks)}/{len(checks)}",
        "answer": answer, "thinking": thinking,
        "notices": [e for e in events if e.get("type") in ("status", "error", "workspace_coverage", "citation_check")],
    }


def report(label: str, results: list[dict[str, Any]], out: Path) -> str:
    rows = ["| 시나리오 | 통과 | 점수 | 시간 | 입력/캐시/출력 토큰 | vibefs | read_file | 차단 |", "|---|---|---|---|---|---|---|---|"]
    for r in results:
        u = r["usage"] or {}
        rows.append(f"| {r['id']} | {'✅' if r['passed'] else '❌'} | {r['score']} | {r['seconds']}s | "
                    f"{u.get('input_tokens', 0):,}/{u.get('cached_read_tokens', 0):,}/{u.get('output_tokens', 0):,} | "
                    f"{r['vibefs_calls']} | {r['read_calls']} | {len(r['denies'])} |")
    parts = [f"# 하네스 평가 — {label}", "", f"통과 {sum(r['passed'] for r in results)}/{len(results)}", "", *rows, ""]
    for r in results:
        parts += [f"## {r['id']} — {r['skill']}", f"> {r['prompt']}", ""]
        parts += [f"- {'✅' if c['ok'] else '❌'} {c['note']}" for c in r["checks"]]
        parts += ["", "**도구 순서**", ""]
        parts += [f"{i + 1}. `{t['name']}` {t['state']} {json.dumps(t['params'], ensure_ascii=False)[:160]}"
                  + (f" — ⚠️ {t['error'][:160]}" if t.get("error") else "") for i, t in enumerate(r["tools"])]
        parts += ["", f"**읽은 파일 ({len(r['files_read'])})**: " + ", ".join(Path(p).name for p in r["files_read"]), ""]
        parts += ["<details><summary>생각</summary>", "", r["thinking"][:3000], "", "</details>", ""]
        parts += ["**답변**", "", r["answer"][:4000], ""]
    text = "\n".join(parts)
    (out / "report.md").write_text(text, encoding="utf-8")
    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="run")
    ap.add_argument("--only", default="")
    ap.add_argument("--model", default=None)
    ap.add_argument("--base", default=os.environ.get("VIBE_API", "http://localhost:8090"))
    args = ap.parse_args()
    build(VAULT)
    payload, id_map = _mount_payload()
    group_of = {rel: hashlib.md5((VAULT / rel).read_bytes()).hexdigest() for rel in FILES}
    wanted = [s for s in SCENARIOS if not args.only or any(s["id"].startswith(o) for o in args.only.split(","))]
    out = HERE / "results" / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    results = []
    for scenario in wanted:
        print(f"[eval] {scenario['id']} …", flush=True)
        try:
            results.append(run_one(args.base, scenario, payload, id_map, group_of, args.model))
            print(f"[eval]   → {'통과' if results[-1]['passed'] else '실패'} {results[-1]['score']} ({results[-1]['seconds']}s)", flush=True)
        except Exception as exc:  # 한 시나리오가 터져도 나머지는 돈다
            print(f"[eval]   → 오류: {exc}", flush=True)
            results.append({"id": scenario["id"], "skill": scenario["skill"],
                            "prompt": scenario.get("prompt") or " → ".join(scenario.get("turns") or []), "error": str(exc),
                            "passed": False, "score": "0", "seconds": 0, "usage": {}, "tools": [], "vibefs_calls": 0,
                            "read_calls": 0, "denies": [], "files_read": [], "checks": [], "answer": "", "thinking": "", "notices": []})
    report(args.label, results, out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
