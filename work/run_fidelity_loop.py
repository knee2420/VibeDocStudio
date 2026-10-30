"""PDF 한 장으로 CLI 시각 일치 루프를 API 없이 돌린다 (개발용).

    # 생성기만 (LLM 없이): 01 → 기본 분할안 · 기본 보정값 → 디버그 크롬 → 02 → 03 → 진단
    venv/python work/run_fidelity_loop.py --pdf <원본.pdf> --title "문서명" --no-agent
    # 진단의 처방을 그대로 몇 번 적용해 본다 (LLM 없이, 생성기 · 진단 검증용)
    venv/python work/run_fidelity_loop.py --pdf <원본.pdf> --no-agent --apply-prescriptions 3
    # 전체 루프 (agy CLI ReAct)
    venv/python work/run_fidelity_loop.py --pdf <원본.pdf> --title "문서명"

필요: 디버그 크롬(CDP 9222)과 studio(5180)가 떠 있어야 한다. 결과는 apps/api/state/agent_runs/<run_id>/.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(REPO / "apps" / "api"), str(REPO / "packages" / "agent-core"), str(REPO / "packages" / "pdf-vdoc-engine")]

from agent_core.react import LoopConfig, RunTrace  # noqa: E402

from app.catalog.agents.fidelity_loop import FidelityConfig, FidelityWorkspace  # noqa: E402
from app.catalog.agents.form_scaffold_agent import FormScaffoldAgent  # noqa: E402
from app.core.llm.execution_policy import CLI_PROVIDER, GOOGLE_PROVIDER, RuntimeExecutionPolicy  # noqa: E402

TOOLS = REPO / ".agents" / "tools" / "visual_fidelity"
SKILL = REPO / ".agents" / "skills" / "external_pm_08_visual_fidelity_replicator"
RUNS = REPO / "apps" / "api" / "state" / "agent_runs"


def short(obs: dict) -> str:
    keep = {k: obs.get(k) for k in ("iter", "verdict", "span_score", "spans_within_tol", "spans_total", "mean_abs_dx",
                                     "mean_abs_dy", "max_err", "fail_counts", "error")}
    lines = [json.dumps(keep, ensure_ascii=False)]
    for p in obs.get("prescriptions", []):
        lines.append(f"  처방 {p['id']} [{p['lesson']} {p['rule']}] {p['evidence']} → {json.dumps(p.get('action'), ensure_ascii=False)}")
    for e in obs.get("engine_issues", []):
        lines.append(f"  엔진 [{e['lesson']} {e['rule']}] {e['evidence'][:160]} | {e['fix']}")
    for b in obs.get("by_block", [])[:10]:
        lines.append(f"  블록 {b}")
    for i in obs.get("individual", [])[:6]:
        lines.append(f"  개별 {i}")
    for n in obs.get("notes", []):
        lines.append(f"  참고 {n}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--no-agent", action="store_true")
    ap.add_argument("--apply-prescriptions", type=int, default=0)
    ap.add_argument("--model", default="gemini-3.8-flash-medium")
    ap.add_argument("--max-steps", type=int, default=14)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(name)s %(message)s")

    pdf_bytes = Path(args.pdf).read_bytes()
    title = args.title or Path(args.pdf).stem
    policy = RuntimeExecutionPolicy(primary_provider=CLI_PROVIDER, fallback_provider=GOOGLE_PROVIDER,
                                    google_api_model=args.model, google_api_timeout_seconds=180,
                                    agent_cli_model=args.model, agent_cli_timeout_seconds=180, agent_cli_bin="agy")
    agent = FormScaffoldAgent(policy=policy, agent_runs_dir=RUNS, fidelity_tools_dir=TOOLS, fidelity_skill_dir=SKILL,
                              loop_config=LoopConfig(max_steps=args.max_steps, max_seconds=900, skill_chars=20000))
    doc_id = f"doc_dev_{uuid.uuid4().hex[:6]}"

    if not args.no_agent:
        doc, info = agent._run_fidelity_loop(pdf_bytes=pdf_bytes, doc_id=doc_id, doc_title=title)
        print(json.dumps({k: v for k, v in info.items() if k != "iterations"}, ensure_ascii=False, indent=1)[:4000])
        for it in info.get("iterations", []):
            print("  ", it)
        return

    run_id = f"dev-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:4]}"
    run_dir = RUNS / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "source.pdf").write_bytes(pdf_bytes)
    trace = RunTrace(run_dir, run_id)
    cache: dict = {}

    def build_vdoc() -> dict:
        if "d" not in cache:
            cache["d"], _, _ = agent._extract_deterministic_baseline(pdf_bytes=pdf_bytes, doc_id=doc_id, title=title)
        return json.loads(json.dumps(cache["d"]))

    ws = FidelityWorkspace(run_id=run_id, run_dir=run_dir, pdf_path=run_dir / "source.pdf", build_vdoc=build_vdoc,
                           trace=trace, config=FidelityConfig(tools_dir=TOOLS))
    print("truth:", json.dumps(ws.extract_truth(), ensure_ascii=False)[:1500])
    tools = ws.build_tools()
    obs = tools.run("evaluate", {}).observation
    print(short(obs))
    for _ in range(args.apply_prescriptions):
        actions = [p["action"] for p in obs.get("prescriptions", []) if p.get("action")]
        if not actions:
            break
        print("적용:", actions[0])
        tools.run(actions[0]["tool"], actions[0]["args"])
        obs = tools.run("evaluate", {}).observation
        print(short(obs))
    trace.close()
    print("run_dir:", run_dir)


if __name__ == "__main__":
    main()
