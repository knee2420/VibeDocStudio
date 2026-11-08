"""실제 볼트(사용자가 lab 에서 마운트하는 두 폴더)로 하는 평가 — 원본은 읽기만 한다.

    python evals/real_eval.py --label real-baseline

정답은 디스크에서 계산한다: `discussions/<날짜>/decisions/*.md` 가 결정 카드다 (lab 에서 확인한 관례).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from run_evals import report, run_one  # noqa: E402
from scenarios import answer_has, no_fabricated_ids  # noqa: E402

BASE = os.path.join("C:" + os.sep, "망고독 관련 자료", "프로젝트_매니지먼트", "What-s-in-my-head")
ROOTS = [os.path.join(BASE, "1.🎯(Project) 프로젝트", "🐕망고독 R&D 프로젝트 관리", "discussions"),
         os.path.join(BASE, "4.🗄️(Archive) 보관", "_에이전트 작업 공간")]
RESOURCES = HERE.parent / "state" / "projects" / "vproj-enterprise-architecture-suite" / "resources.json"


def _id_map() -> dict[str, str]:
    out: dict[str, str] = {}

    def walk(x):
        if isinstance(x, dict):
            p = x.get("pathOrUrl") or ""
            if p and not x.get("children") and any(p.startswith(r) for r in ROOTS) and os.path.isfile(p):
                out[p] = x["id"]
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(json.loads(RESOURCES.read_text(encoding="utf-8")))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="real")
    ap.add_argument("--base", default="http://localhost:8090")
    args = ap.parse_args()
    files = [os.path.join(dp, f) for r in ROOTS for dp, _, fs in os.walk(r) for f in fs]
    rel = {p: os.path.relpath(p, os.path.dirname(r)).replace(os.sep, "/") for r in ROOTS for p in files if p.startswith(r)}
    group_of = {rel[p]: hashlib.md5(open(p, "rb").read()).hexdigest() for p in files}
    decisions = sorted(rel[p] for p in files if re.search(r"/decisions/[^/]+\.md$", rel[p]))
    id_map = _id_map()
    payload = {"roots": [{"id": "", "path": r, "title": os.path.basename(r)} for r in ROOTS], "files": [], "idMap": id_map}

    def reads_decisions(r):
        need = {group_of[p] for p in decisions}
        got = {group_of[p] for p in r.rel_reads if p in group_of} & need
        return (len(got) == len(need), f"discussions 결정 카드 읽음: {len(got)}/{len(need)}")

    def claims(r):
        need = {group_of[p] for p in decisions}
        got = len({group_of[p] for p in r.rel_reads if p in group_of} & need)
        m = re.search(r"전수|모든\s*(결정|카드|Decision)|(\d+)\s*(개|장)[^\n]{0,12}(전부|모두|분석|검토)|빠짐없이", r.answer)
        if not m:
            return True, f"범위 주장 없음 ({got}/{len(need)})"
        return got == len(need), f"범위 주장 '{m.group(0)}' · 실제 {got}/{len(need)}"

    scenario = {
        "id": "R1-real-decision-standard",
        "skill": "실제 볼트(280개) · 묶음 종합 · 세대 차이 · 주장 범위",
        "prompt": "리소스의 Decision 들을 읽고 공통 형식과 차이를 정리해서, 앞으로 쓸 결정 카드 표준을 제안해줘.",
        "checks": [
            reads_decisions,
            claims,
            answer_has(r"(Boundary|실행 가이드라인|DoD)[^\n]{0,150}(없|빠|일부|추가|이후|나중|세대|버전|부터)|(초기|1세대|이전|09\.29|9월)[^\n]{0,150}(Boundary|실행 가이드라인|DoD)",
                       "세대 차이(실행 가이드라인이 나중에 추가) 지적"),
            no_fabricated_ids,
        ],
    }

    # run_one 은 함정 볼트 기준 경로 계산을 쓰므로, 실제 볼트용으로 상대 경로 함수를 바꿔 끼운다
    import run_evals
    run_evals._rel = lambda path: next((rel[p] for p in rel if os.path.normcase(p) == os.path.normcase(os.path.abspath(path))), path.replace("\\", "/"))
    out = HERE / "results" / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    out.mkdir(parents=True, exist_ok=True)
    print(f"[real] 결정 카드 {len(decisions)}개 · 파일 {len(files)}개 · id {len(id_map)}개", flush=True)
    result = run_one(args.base, scenario, payload, id_map, group_of, None)
    print(f"[real] → {'통과' if result['passed'] else '실패'} {result['score']} ({result['seconds']}s)", flush=True)
    report(args.label, [result], out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
