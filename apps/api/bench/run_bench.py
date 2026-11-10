"""Auto-Index 벤치마크 — 같은 질문을 세 방식으로 풀게 하고 정확도 · 출처 · 비용 · 속도를 잰다.

비교군 (모두 같은 agy 모델):
    indexed     스킬 + 하네스 + 색인: Composer 엔진(AssistantService) + `knowledge.*` 서버 도구 + 탐색 절차 스킬
    files       색인 파일만: agy 가 덱 폴더(index.md · sections · cards · archive)를 내장 파일 도구로 직접 읽는다
    raw         원문 직접 탐색: agy 가 원문 폴더(사본) 전체를 내장 파일 도구 · grep 으로 알아서 찾는다

    python bench/run_bench.py --corpus agy fsd --arms indexed raw files --depth enriched [--only agy-t1,agy-v1]

결과: bench/results/<타임스탬프>/{runs.jsonl, report.json, report.md}
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from common import (
    AGY,
    BENCH_DIR,
    CORPORA,
    MODEL,
    RESULTS,
    SANDBOX,
    STATE,
    deck_dir,
    deck_id,
    dump,
)

from app.llm.adapters import AssistantEngineProvider
from app.assistant.models import ContextItem
from app.assistant.use_cases import AssistantService
from app.llm.policy import (
    CLI_PROVIDER,
    GOOGLE_PROVIDER,
    RuntimeExecutionPolicy,
)
from app.core.process_tree import popen_tree
from app.resource.index.use_cases import KnowledgeToolbox

ANSWER_RULES = (
    "\n\n[답변 규칙] 한국어로 답한다. 근거가 된 위치를 반드시 출처로 남긴다"
    " (파일 경로와 줄, 또는 카드 id). 자료에서 찾지 못한 내용은 찾지 못했다고 쓴다."
)
SKILL_DIR = Path(__file__).resolve().parents[3] / ".agents" / "skills" / "knowledge_deck_reader"


@dataclass
class RunRecord:
    qid: str
    corpus: str
    arm: str
    qtype: str
    criterion: int
    ok: bool = True
    error: str = ""
    answer: str = ""
    seconds: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    tool_calls: int = 0
    rounds: int = 0
    read_chars: int = 0
    tools: list[str] = field(default_factory=list)
    # 채점
    fact_recall: float = 0.0
    facts_hit: list[int] = field(default_factory=list)
    correct: bool = False
    forbid_hit: list[str] = field(default_factory=list)
    citations: int = 0
    cited_sources: list[str] = field(default_factory=list)
    source_hit: bool = False
    answer_chars: int = 0


# --- 비교군: indexed (Composer 엔진 + 서버 도구) ----------------------------------------


class _BenchDeckFiles:
    def __init__(self, mapping: dict[str, Path]) -> None:
        self._m = mapping

    def deck_dir(self, did: str) -> Path:
        return self._m[did]

    def remove(self, did: str) -> None:  # pragma: no cover
        raise NotImplementedError


def make_service(depth: str) -> AssistantService:
    mapping = {deck_id(c, depth): deck_dir(c, depth) for c in CORPORA}
    toolbox = KnowledgeToolbox(files=_BenchDeckFiles(mapping), skill_dir=SKILL_DIR)
    policy = RuntimeExecutionPolicy(
        primary_provider=CLI_PROVIDER, fallback_provider=GOOGLE_PROVIDER, google_api_model="gemini-3.5-flash-lite",
        google_api_timeout_seconds=180, agent_cli_model=MODEL, agent_cli_timeout_seconds=300, agent_cli_bin=AGY,
    )
    engines = AssistantEngineProvider(agy_executable=AGY, sandbox_dir=SANDBOX / "assistant", external_llm_enabled=True,
                                      google_api_key=lambda: None, turn_idle_timeout_seconds=300)
    return AssistantService(engines=engines, policy=policy, inline_model=MODEL, server_tools=toolbox)


def run_indexed(service: AssistantService, corpus: str, depth: str, question: str, rec: RunRecord) -> None:
    did = deck_id(corpus, depth)
    t0 = time.monotonic()
    sid = service.create_session(CLI_PROVIDER, MODEL)["sessionId"]
    try:
        text: list[str] = []
        ctx = [ContextItem(kind="deck", ref_id=did, label=CORPORA[corpus]["title"])]
        for ev in service.send_message(sid, text=question + ANSWER_RULES, contexts=ctx, tools=[], mode="agent"):
            kind = ev.get("type")
            if kind == "text_delta":
                text.append(ev.get("text", ""))
            elif kind == "tool_call":
                rec.tool_calls += 1
                rec.tools.append(ev.get("name", ""))
            elif kind == "tool_result":
                rec.read_chars += int(ev.get("chars") or 0)
            elif kind == "agent_tool" and ev.get("state") == "done":
                rec.tools.append(f"builtin:{ev.get('name')}")
            elif kind == "error":
                rec.error = ev.get("message", "")
            elif kind == "turn_done":
                usage = ev.get("usage") or {}
                rec.input_tokens = int(usage.get("input_tokens") or 0)
                rec.output_tokens = int(usage.get("output_tokens") or 0)
                rec.total_tokens = int(usage.get("total_tokens") or 0)
                rec.rounds = int(ev.get("serverRounds") or 0) + 1
                rec.ok = ev.get("stopReason") == "end_turn"
        rec.answer = "".join(text)
    finally:
        service.close_session(sid)
        rec.seconds = round(time.monotonic() - t0, 2)


# --- 비교군: raw / files (agy 내장 도구로 폴더 직접 탐색) ---------------------------------


def run_agy_folder(cwd: Path, prompt: str, rec: RunRecord, timeout: int = 600) -> None:
    cmd = [AGY, "--dangerously-skip-permissions", "--disable-slash-commands", "--output-format", "stream-json", "--model", MODEL]
    t0 = time.monotonic()
    tree = popen_tree(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=str(cwd),
                      text=True, encoding="utf-8", errors="replace", creationflags=0x08000000 if sys.platform == "win32" else 0)
    killer = threading.Timer(timeout, tree.kill)
    killer.start()
    try:
        assert tree.proc.stdin is not None and tree.proc.stdout is not None
        tree.proc.stdin.write(prompt)
        tree.proc.stdin.close()
        texts: list[str] = []
        seen_steps: set[int] = set()
        for line in tree.proc.stdout:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("event") == "step_update":
                step = msg.get("step_update") or {}
                if step.get("step_type") == "agent_response" and step.get("text_delta"):
                    texts.append(step["text_delta"])
                elif step.get("step_type") == "tool" and step.get("state") == "DONE":
                    idx = step.get("step_index")
                    if idx in seen_steps:
                        continue
                    seen_steps.add(idx)
                    info = step.get("tool_info") or {}
                    rec.tool_calls += 1
                    rec.tools.append(step.get("tool_name") or info.get("name") or "tool")
                    rec.read_chars += len(str(info.get("output") or ""))
            elif msg.get("event") == "result":
                res = msg.get("result") or {}
                usage = res.get("usage") or {}
                rec.input_tokens = int(usage.get("input_tokens") or 0)
                rec.output_tokens = int(usage.get("output_tokens") or 0)
                rec.total_tokens = int(usage.get("total_tokens") or 0)
                rec.rounds = int(res.get("num_turns") or 0)
                rec.ok = str(res.get("status", "")).upper() == "SUCCESS"
                if not rec.ok:
                    rec.error = str(res.get("error") or res.get("status"))
                resp = res.get("response")
                rec.answer = resp if isinstance(resp, str) and resp.strip() else "".join(texts)
        tree.proc.wait(timeout=30)
    except Exception as exc:  # noqa: BLE001
        rec.ok = False
        rec.error = str(exc)
    finally:
        killer.cancel()
        rec.seconds = round(time.monotonic() - t0, 2)
        if not rec.answer:
            rec.ok = False


def raw_workspace(corpus: str) -> Path:
    """원문 사본 (agy 가 파일을 고쳐도 원본이 안전하게)."""
    target = STATE / "raw" / corpus
    src = Path(CORPORA[corpus]["path"])
    if not target.exists():
        shutil.copytree(src, target / src.name, ignore=shutil.ignore_patterns(".git", "node_modules"))
    return target


def files_workspace(corpus: str, depth: str) -> Path:
    target = STATE / "files" / f"{corpus}-{depth}"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(deck_dir(corpus, depth), target)
    return target


RAW_PROMPT = "현재 폴더에 문서 원문이 있다. 파일을 직접 찾아 읽고(검색 · grep 가능) 다음 질문에 답하라. 파일은 수정하지 마라.\n\n질문: {q}"
FILES_PROMPT = (
    "현재 폴더는 문서를 색인한 지식 덱이다: index.md(지도 · 목차 · 자산 목록 · 라우팅 표) → sections/SEC-NN.md(카드 목록)"
    " → cards/C-SS-NN.md(요약 · 요소 · 원문 링크) → archive/(원문 조각, grep 대상). index.md 부터 읽고 필요한 카드만 열어라."
    " 파일은 수정하지 마라.\n\n{skill}\n\n질문: {q}"
)


# --- 채점 ------------------------------------------------------------------------------

_KCARD = re.compile(r"vdoc:kcard/([\w\-]+):(C-\d{2}-\d{2})")
_CARD = re.compile(r"\b(C-\d{2}-\d{2})\b")
_PATH = re.compile(r"([\w\-./\\]+\.mdx?)(?::L?(\d+)(?:-L?(\d+))?)?", re.I)


def _card_sources(corpus: str, depth: str) -> dict[str, str]:
    path = deck_dir(corpus, depth) / "cards.json"
    if not path.exists():
        return {}
    return {c["cardId"]: c["anchor"]["source"] for c in json.loads(path.read_text(encoding="utf-8"))}


def grade(q: dict[str, Any], rec: RunRecord, card_src: dict[str, str]) -> None:
    ans = rec.answer or ""
    rec.answer_chars = len(ans)
    hits = []
    for idx, alts in enumerate(q["facts"]):
        if any(re.search(p, ans, re.I) for p in alts):
            hits.append(idx)
    rec.facts_hit = hits
    rec.fact_recall = round(len(hits) / max(len(q["facts"]), 1), 3)
    rec.forbid_hit = [p for p in q.get("forbid", []) if re.search(p, ans, re.I)]
    cited: list[str] = []
    marks = 0
    for _, cid in _KCARD.findall(ans):
        marks += 1
        cited.append(card_src.get(cid, cid))
    if not marks:
        for cid in _CARD.findall(ans):
            marks += 1
            cited.append(card_src.get(cid, cid))
    for m in _PATH.finditer(ans):
        marks += 1
        cited.append(m.group(1).replace("\\", "/"))
    rec.citations = marks
    rec.cited_sources = sorted(set(cited))
    blob = " ".join(rec.cited_sources) + " " + ans
    rec.source_hit = any(s.lower() in blob.lower() for s in q.get("sources", []))
    if q.get("negative"):
        rec.correct = rec.fact_recall >= 0.99 and not rec.forbid_hit
    else:
        rec.correct = rec.fact_recall >= 0.8 and not rec.forbid_hit


# --- 실행 ------------------------------------------------------------------------------


def load_questions(corpus: str, only: Optional[set[str]]) -> list[dict[str, Any]]:
    data = json.loads((BENCH_DIR / "testsets" / f"{corpus}.json").read_text(encoding="utf-8"))
    return [q for q in data["questions"] if not only or q["id"] in only]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", nargs="+", default=list(CORPORA))
    ap.add_argument("--arms", nargs="+", default=["indexed", "raw", "files"])
    ap.add_argument("--depth", default="enriched")
    ap.add_argument("--only", default="")
    ap.add_argument("--parallel", type=int, default=3)
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    only = {x for x in args.only.split(",") if x} or None
    out_dir = Path(args.out) if args.out else RESULTS / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    runs_path = out_dir / "runs.jsonl"
    service = make_service(args.depth) if "indexed" in args.arms else None
    lock = threading.Lock()
    jobs: list[tuple[str, dict[str, Any], str]] = []
    for corpus in args.corpus:
        for q in load_questions(corpus, only):
            for arm in args.arms:
                jobs.append((corpus, q, arm))
    skill = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    skill = re.sub(r"^---\n.*?\n---\n", "", skill, flags=re.S)

    def work(item: tuple[str, dict[str, Any], str]) -> RunRecord:
        corpus, q, arm = item
        rec = RunRecord(qid=q["id"], corpus=corpus, arm=arm, qtype=q["type"], criterion=int(q.get("criterion", 0)))
        try:
            if arm == "indexed":
                run_indexed(service, corpus, args.depth, q["question"], rec)
            elif arm == "raw":
                run_agy_folder(raw_workspace(corpus), RAW_PROMPT.format(q=q["question"]) + ANSWER_RULES, rec)
            elif arm == "files":
                ws = files_workspace(corpus, args.depth) if not (STATE / "files" / f"{corpus}-{args.depth}").exists() else STATE / "files" / f"{corpus}-{args.depth}"
                run_agy_folder(ws, FILES_PROMPT.format(q=q["question"], skill=skill) + ANSWER_RULES, rec)
        except Exception as exc:  # noqa: BLE001
            rec.ok, rec.error = False, f"{type(exc).__name__}: {exc}"
        grade(q, rec, _card_sources(corpus, args.depth))
        with lock:
            with runs_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(rec), ensure_ascii=False) + "\n")
            print(f"[{arm:7}] {q['id']:8} ok={rec.ok} correct={rec.correct} recall={rec.fact_recall:.2f} "
                  f"cit={rec.citations} {rec.seconds:.0f}s tok={rec.total_tokens} tools={rec.tool_calls}", flush=True)
        return rec

    for corpus in args.corpus:
        raw_workspace(corpus)
        if "files" in args.arms:
            files_workspace(corpus, args.depth)
    with ThreadPoolExecutor(max_workers=max(1, args.parallel)) as pool:
        records = list(pool.map(work, jobs))
    if service:
        service.shutdown()
    report = summarize(records)
    dump(out_dir / "report.json", report)
    (out_dir / "report.md").write_text(render_report(report, args), encoding="utf-8")
    print(f"report: {out_dir / 'report.md'}")


def _mean(xs: list[float]) -> float:
    return round(sum(xs) / len(xs), 3) if xs else 0.0


def _median(xs: list[float]) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    n = len(s)
    return round(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2, 2)


def summarize(records: list[RunRecord]) -> dict[str, Any]:
    by_arm: dict[str, list[RunRecord]] = {}
    for r in records:
        by_arm.setdefault(r.arm, []).append(r)

    def agg(rs: list[RunRecord]) -> dict[str, Any]:
        return {
            "n": len(rs),
            "accuracy": _mean([1.0 if r.correct else 0.0 for r in rs]),
            "factRecall": _mean([r.fact_recall for r in rs]),
            "sourceHit": _mean([1.0 if r.source_hit else 0.0 for r in rs]),
            "citations": _mean([r.citations for r in rs]),
            "distinctSources": _mean([len(r.cited_sources) for r in rs]),
            "secondsMedian": _median([r.seconds for r in rs]),
            "secondsMean": _mean([r.seconds for r in rs]),
            "tokensMean": _mean([r.total_tokens for r in rs]),
            "inputTokensMean": _mean([r.input_tokens for r in rs]),
            "toolCallsMean": _mean([r.tool_calls for r in rs]),
            "readCharsMean": _mean([r.read_chars for r in rs]),
            "errors": sum(1 for r in rs if not r.ok),
        }

    out: dict[str, Any] = {"arms": {arm: agg(rs) for arm, rs in by_arm.items()}, "byType": {}, "byCriterion": {}, "byCorpus": {}}
    for key, attr in (("byType", "qtype"), ("byCriterion", "criterion"), ("byCorpus", "corpus")):
        groups: dict[str, dict[str, list[RunRecord]]] = {}
        for r in records:
            groups.setdefault(str(getattr(r, attr)), {}).setdefault(r.arm, []).append(r)
        out[key] = {g: {arm: agg(rs) for arm, rs in arms.items()} for g, arms in sorted(groups.items())}
    out["questions"] = {}
    for r in records:
        out["questions"].setdefault(r.qid, {})[r.arm] = {
            "correct": r.correct, "recall": r.fact_recall, "citations": r.citations, "seconds": r.seconds,
            "tokens": r.total_tokens, "tools": r.tool_calls, "readChars": r.read_chars, "error": r.error[:200],
        }
    build = RESULTS / "build.json"
    out["build"] = json.loads(build.read_text(encoding="utf-8")) if build.exists() else {}
    return out


CRITERIA = {
    "1": "도표 · 그림 색인", "2": "목차 · 구조 문제", "3": "대충 묻기 · 없는 내용", "4": "분석의 체계성",
    "6": "작성 · citation 밀도", "7": "아웃라인",
}


def render_report(rep: dict[str, Any], args) -> str:  # noqa: ANN001
    arms = list(rep["arms"])
    lines = [f"# Auto-Index 벤치마크 ({datetime.now():%Y-%m-%d %H:%M})", "",
             f"- 모델: `{MODEL}` (모든 비교군 동일) · 말뭉치: {', '.join(args.corpus)} · 덱 깊이: {args.depth}", ""]
    head = "| 지표 | " + " | ".join(arms) + " |"
    sep = "|---|" + "---|" * len(arms)
    rows = [("정답률", "accuracy", "{:.0%}"), ("사실 재현율", "factRecall", "{:.0%}"), ("정답 출처 적중", "sourceHit", "{:.0%}"),
            ("출처 표기 수(평균)", "citations", "{:.1f}"), ("서로 다른 출처 수", "distinctSources", "{:.1f}"),
            ("소요 시간 중앙값(초)", "secondsMedian", "{:.1f}"), ("총 토큰(평균)", "tokensMean", "{:,.0f}"),
            ("도구 호출(평균)", "toolCallsMean", "{:.1f}"), ("읽은 분량(문자, 평균)", "readCharsMean", "{:,.0f}"), ("실패", "errors", "{}")]
    lines += ["## 전체", head, sep]
    for label, key, fmt in rows:
        lines.append(f"| {label} | " + " | ".join(fmt.format(rep["arms"][a][key]) for a in arms) + " |")
    lines += ["", "## 기준별 (정답률 / 사실 재현율 / 출처 수 / 토큰)", "| 기준 | " + " | ".join(arms) + " |", sep]
    for crit, by in rep["byCriterion"].items():
        cells = []
        for a in arms:
            m = by.get(a)
            cells.append(f"{m['accuracy']:.0%} / {m['factRecall']:.0%} / {m['citations']:.1f} / {m['tokensMean']:,.0f}" if m else "-")
        lines.append(f"| {crit}. {CRITERIA.get(crit, '')} | " + " | ".join(cells) + " |")
    lines += ["", "## 문항별 (정답 ✓ · 재현율 · 출처 · 초 · 토큰)", "| 문항 | " + " | ".join(arms) + " |", sep]
    for qid, by in rep["questions"].items():
        cells = []
        for a in arms:
            m = by.get(a)
            cells.append(f"{'✓' if m['correct'] else '✗'} {m['recall']:.0%} · {m['citations']} · {m['seconds']:.0f}s · {m['tokens']:,}" if m else "-")
        lines.append(f"| {qid} | " + " | ".join(cells) + " |")
    if rep.get("build"):
        lines += ["", "## 색인 비용 (1회)", "| 덱 | 시간(초) | LLM 호출 | 토큰 | 카드 | 표 | 그림 |", "|---|---|---|---|---|---|---|"]
        for name, b in rep["build"].items():
            u, s = b.get("usage", {}), b.get("stats", {})
            lines.append(f"| {name} | {b.get('wallSeconds')} | {u.get('llmCalls', 0)} | {u.get('totalTokens', 0):,} | {s.get('cards')} | {s.get('tables')} | {s.get('figures')} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
