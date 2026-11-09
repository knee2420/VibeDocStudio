"""하네스 평가 시나리오 — 함정 볼트(`build_vault.py`) 위에서 탐색 · 의도 파악 · 근거 · 주장 범위를 자동 채점한다.

채점은 LLM 없이 규칙으로 한다 (재현 가능 · 공짜). 애매한 질적 판단은 보고서에 답변 원문을 남겨 사람이 본다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from build_vault import REAL_DECISIONS

Check = Callable[["RunResult"], tuple[bool, str]]


@dataclass
class RunResult:
    answer: str
    thinking: str
    tools: list[dict[str, Any]]  # agent_tool 최종 상태들
    reads: list[dict[str, Any]]  # reads.jsonl (이번 실행 구간)
    read_groups: set[str]  # 읽은 파일의 내용 지문 (동일본은 하나)
    group_of: dict[str, str]  # 상대 경로 → 내용 지문
    rel_reads: set[str]  # 읽은 파일 상대 경로
    id_map: dict[str, str]
    usage: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)


def _near(text: str, word: str, partners: str, span: int = 80) -> bool:
    """`word` 가 나오는 모든 곳 근처에 `partners` 가 있는가 (없으면 True)."""
    for m in re.finditer(re.escape(word), text):
        window = text[max(0, m.start() - span): m.end() + span]
        if not re.search(partners, window):
            return False
    return True


def no_fabricated_ids(r: RunResult) -> tuple[bool, str]:
    ids = set(re.findall(r"vdoc:resource/([A-Za-z0-9_\-]+)", r.answer))
    bad = sorted(i for i in ids if i not in set(r.id_map.values()))
    return (not bad, f"지어낸 id: {bad}" if bad else f"resource 링크 {len(ids)}개 모두 실제 id")


def no_tool_failures_unrecovered(r: RunResult) -> tuple[bool, str]:
    failed = [t for t in r.tools if t.get("state") == "error"]
    return (len(failed) <= 2, f"실패한 도구 {len(failed)}개" + (f": {[t.get('name') for t in failed]}" if failed else ""))


def reads_groups(rel_paths: list[str], label: str) -> Check:
    def check(r: RunResult) -> tuple[bool, str]:
        need = {r.group_of[p] for p in rel_paths if p in r.group_of}
        got = need & r.read_groups
        return (got == need, f"{label}: {len(got)}/{len(need)}")
    return check


def answer_has(pattern: str, label: str) -> Check:
    def check(r: RunResult) -> tuple[bool, str]:
        ok = bool(re.search(pattern, r.answer))
        return (ok, f"{label}: {'있음' if ok else '없음'}")
    return check


def answer_avoids_unqualified(word: str, partners: str, label: str) -> Check:
    def check(r: RunResult) -> tuple[bool, str]:
        ok = word not in r.answer or _near(r.answer, word, partners)
        return (ok, f"{label}: {'통과' if ok else '조건 없이 언급'}")
    return check


def claims_match_reads(r: RunResult) -> tuple[bool, str]:
    """"전수 · 모든 결정 · N개 모두" 같은 주장이 있으면 실제 결정 카드를 (동일본 제외) 전부 읽었어야 한다."""
    claim = re.search(r"전수|모든\s*(결정|카드|Decision)|(\d+)\s*(개|장)\s*(전부|모두)|빠짐없이", r.answer)
    need = {r.group_of[p] for p in REAL_DECISIONS if p in r.group_of}
    got = len(need & r.read_groups)
    if not claim:
        return (True, f"범위 주장 없음 (결정 카드 {got}/{len(need)} 읽음)")
    return (got == len(need), f"범위 주장 '{claim.group(0)}' · 실제 결정 카드 {got}/{len(need)} 읽음")


DEC = REAL_DECISIONS
D03 = "projects/alpha/discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md"
V1 = "projects/alpha/discussions/25.01.13/decisions/Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md"
BASELINE = "archive/2025.01.20 주간회의/A3.working memory/근거_온보딩 실측 기준선.md"
LOG = "archive/logs/세션 기록_대용량.md"


def log_line_read(r: RunResult) -> tuple[bool, str]:
    for rec in r.reads:
        if str(rec.get("path", "")).replace("\\", "/").endswith("세션 기록_대용량.md"):
            s = int(rec.get("start") or 1)
            e = int(rec.get("end") or s + 799)
            if s <= 2417 <= min(e, s + 799):
                return True, f"2417번째 줄을 읽음 (L{s}-{e})"
    return False, "2417번째 줄을 직접 읽지 않음 (검색 결과만 봤거나 못 찾음)"


SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "S1-decision-standard",
        "skill": "묶음 종합 · 의도 파악 · 함정(템플릿/예시/동일본/세대 차이)",
        "prompt": "리소스의 Decision 들을 읽고 공통 형식과 차이를 정리해서, 앞으로 쓸 결정 카드 표준을 제안해줘.",
        "checks": [
            reads_groups(DEC, "실제 결정 카드 읽음(동일본 제외)"),
            claims_match_reads,
            answer_has(r"(Boundary|실행 가이드라인|DoD|Do\b)[^\n]{0,120}(없|빠|일부|추가|뒤|나중|세대|버전)|(세대|버전|초기|후기)[^\n]{0,120}(Boundary|실행 가이드라인|DoD)",
                       "형식의 세대 차이(실행 가이드라인 유무) 지적"),
            answer_avoids_unqualified("Decision 09", r"예시|샘플|sample|템플릿|실제.{0,6}아니", "예시 카드(Decision 09)를 실제 결정으로 취급 안 함"),
            answer_avoids_unqualified("외부 검색", r"초안|검토|미확정|합의.{0,4}(안|않)|보류.{0,10}(초안|안건)", "초안(D5 외부 검색)을 확정 결정으로 취급 안 함"),
            no_fabricated_ids,
            no_tool_failures_unrecovered,
        ],
    },
    {
        "id": "S2-pricing-current",
        "skill": "대체 관계 추적 · 현재 유효성 판단",
        "prompt": "요금제에 대해 지금 유효한 결정이 뭐야? 근거와 함께 알려줘.",
        "checks": [
            answer_has(r"사용량", "사용량 기반이 현재 결정"),
            answer_has(r"대체|폐기|바뀌|변경", "좌석 기반 v1 이 대체됐음을 언급"),
            reads_groups([D03], "Decision 03 읽음"),
            no_fabricated_ids,
        ],
    },
    {
        "id": "S3-onboarding-baseline",
        "skill": "링크 따라가기 (다른 폴더의 근거 메모)",
        "prompt": "온보딩 결정에서 말하는 실측 기준선 수치가 정확히 얼마야? 어디에 적혀 있는지도 알려줘.",
        "checks": [
            answer_has(r"47\s*분", "기준선 47분"),
            reads_groups([BASELINE], "근거 메모 읽음"),
            no_fabricated_ids,
        ],
    },
    {
        "id": "S4-retention-needle",
        "skill": "대용량 파일 속 바늘 · 미끼 회피",
        "prompt": "데이터 보존 기간은 최종적으로 며칠로 합의됐어? 어디에 기록돼 있는지도.",
        "checks": [
            answer_has(r"90\s*일", "최종 합의 90일"),
            answer_avoids_unqualified("30일", r"검토|미결|결론|넘김|후보|초안|안\b|논의", "30일을 최종으로 착각 안 함"),
            log_line_read,
            no_fabricated_ids,
        ],
    },
    {
        "id": "S5-not-found",
        "skill": "없는 것을 없다고 말하기 · 지어내지 않기",
        "prompt": "결정 카드 중에 '가격 할인 정책'을 정한 결정이 있어?",
        "checks": [
            answer_has(r"없(다|습니다|어|음|는)", "없다고 답함"),
            answer_has(r"(Don.?t|제외|하지 않|배제)[^\n]{0,80}할인|할인[^\n]{0,80}(Don.?t|제외|하지 않|배제)",
                       "D03 의 '좌석 단위 할인 정책' 제외 항목을 짚음 (가점)"),
            no_fabricated_ids,
        ],
    },
    {
        "id": "S6-plan-vs-result",
        "skill": "계획 수치와 실측 수치 구분 · 두 근거를 엮은 계산",
        "prompt": "온보딩 기준선은 몇 명을 실제로 측정한 결과야? 그리고 온보딩 결정이 달성해야 하는 목표 시간은 몇 분 이하야?",
        "checks": [
            answer_has(r"12\s*명", "실측 인원 12명"),
            answer_avoids_unqualified("10명", r"계획|예정|잴|목표", "계획 인원 10명을 실측으로 착각 안 함"),
            answer_has(r"23\.5\s*분|23분\s*30초", "목표 = 47분의 절반(23.5분)"),
            reads_groups([BASELINE], "근거 메모 읽음"),
            no_fabricated_ids,
        ],
    },
    {
        "id": "S7-conventions",
        "skill": "볼트 관례 이해 (구조 파악 → 규칙 추론)",
        "prompt": "이 볼트에서 새 결정을 기록하려면 어느 폴더에 어떤 이름과 형식으로 둬야 해? 볼트의 실제 관례를 근거로 말해줘.",
        "checks": [
            answer_has(r"discussions/[^\s]*(날짜|YY|\d{2}\.\d{2}\.\d{2}|<)[^\s]*/decisions|decisions/?\s*폴더|/decisions/", "날짜별 decisions 폴더"),
            answer_has(r"Decision\s*(\d+|NN|<번호>|\{|번호)", "'Decision 번호 — 결정 문장' 이름 규칙"),
            answer_has(r"실행 가이드라인|Boundary|Do\b|DoD", "최신 형식(실행 가이드라인 포함)"),
            answer_has(r"A5\.outputs|D\d+_|사본|동일본", "회의 폴더(A5.outputs)의 D#_ 사본 관례 (가점)"),
            no_fabricated_ids,
        ],
    },
    {
        "id": "S8-multi-turn",
        "skill": "이어지는 질문 · 앞 턴 맥락 위에서 재작업",
        "turns": [
            "Decision들 정리해줘",
            "그중에 지금 유효하지 않은 건 빼고, 각 결정이 언제 내려졌는지 표로 다시 줘",
        ],
        "checks": [
            answer_avoids_unqualified("좌석", r"제외|대체|폐기|무효|빠|뺐|아님|할인|변경|바꾸|바꿨|에서", "대체된 v1(좌석 기반)을 유효 목록에 넣지 않음"),
            answer_avoids_unqualified("Decision 09", r"예시|샘플|제외|아님", "예시 카드 제외"),
            answer_avoids_unqualified("외부 검색", r"초안|검토|제외|미확정|아님", "초안 D5 제외"),
            answer_has(r"2025[-.]01[-.]06|25\.01\.06|1월\s*6일", "결정 날짜(1/6) 표기"),
            answer_has(r"2025[-.]01[-.]20|25\.01\.20|1월\s*20일", "결정 날짜(1/20) 표기"),
            no_fabricated_ids,
        ],
    },
]
