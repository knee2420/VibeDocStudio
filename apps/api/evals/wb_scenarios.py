"""작업대 평가 시나리오 — 단독(R · F · E) · 조합(RE · FE · RF · RFE) · 이력.

holdout=True 인 시나리오는 엔진을 튜닝할 때 보지 않는다 (일반화 확인용). 채점은 규칙 기반이다.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "app" / "assistant" / "workspace"))

from build_workbench import REF_ONLY  # noqa: E402
from proposals import leaked_fragments  # noqa: E402
from workbench import plain  # noqa: E402


@dataclass
class WRun:
    answer: str
    thinking: str
    tools: list[dict[str, Any]]
    reads: list[str]
    proposals: list[dict[str, Any]]
    ref_texts: dict[str, str] = field(default_factory=dict)

    def names(self) -> list[str]:
        return [_short(str(t.get("name") or "")) for t in self.tools]

    def last_prop(self) -> Optional[dict[str, Any]]:
        ready = [p for p in self.proposals if p.get("status") == "ready"]
        return (ready or self.proposals or [None])[-1]

    def prop_texts(self) -> list[str]:
        p = self.last_prop()
        if not p:
            return []
        return ["\n".join(plain(str(h)) for h in (c.get("slots") or {}).values()) for c in p.get("candidates") or []]


Check = Callable[[WRun], tuple[bool, str]]


def _short(name: str) -> str:
    """mcp_vibefs_ab12_wb_read → wb_read"""
    m = re.search(r"(wb_\w+|ws_\w+)$", name)
    return m.group(1) if m else name


# --- 검사 ----------------------------------------------------------------------------------------

def used(names: str, label: str = "") -> Check:
    want = names.split("|")
    def check(r: WRun):
        hit = [n for n in r.names() if n in want]
        return bool(hit), f"{label or '도구 사용 ' + names}: {', '.join(hit) or '없음'}"
    return check


def not_used(prefixes: str, label: str) -> Check:
    bad = prefixes.split("|")
    def check(r: WRun):
        hit = [n for n in r.names() if any(n.startswith(b) for b in bad)]
        return not hit, f"{label}: {', '.join(hit) or '없음'}"
    return check


def ans(pattern: str, label: str) -> Check:
    rx = re.compile(pattern, re.S)
    def check(r: WRun):
        return bool(rx.search(r.answer)), f"{label}: {'있음' if rx.search(r.answer) else '없음'}"
    return check


def ans_count(patterns: list[str], need: int, label: str) -> Check:
    def check(r: WRun):
        hits = [p for p in patterns if re.search(p, r.answer)]
        return len(hits) >= need, f"{label}: {len(hits)}/{need} ({', '.join(hits[:6])})"
    return check


def prop_ready(min_cands: int = 1, mode: str = "", slots: str = "", label: str = "") -> Check:
    def check(r: WRun):
        p = r.last_prop()
        if not p:
            return False, f"{label or '후보 제안'}: wb_propose 없음"
        n = len(p.get("candidates") or [])
        ok = p.get("status") == "ready" and n >= min_cands and (not mode or p.get("mode") == mode)
        touched = {s for c in p.get("candidates") or [] for s in (c.get("slots") or {})}
        if slots:
            ok = ok and bool(touched) and touched <= set(slots.split(","))
        errs = "; ".join((p.get("report") or {}).get("errors") or [])[:160]
        return ok, f"{label or '후보 제안'}: {p.get('status')} · {n}안 · mode={p.get('mode')} · 칸={sorted(touched)}" + (f" · {errs}" if errs else "")
    return check


def prop_has(pattern: str, label: str, every: bool = False) -> Check:
    rx = re.compile(pattern, re.S)
    def check(r: WRun):
        texts = r.prop_texts()
        hits = [bool(rx.search(t)) for t in texts]
        ok = bool(texts) and (all(hits) if every else any(hits))
        return ok, f"{label}: {sum(hits)}/{len(texts)}안"
    return check


def prop_avoids(pattern: str, label: str) -> Check:
    rx = re.compile(pattern)
    def check(r: WRun):
        bad = [m.group(0) for t in r.prop_texts() for m in [rx.search(t)] if m]
        return not bad, f"{label}: {', '.join(bad[:4]) or '없음'}"
    return check


def no_leak(r: WRun) -> tuple[bool, str]:
    leaks = []
    for text in r.prop_texts():
        for rid, rtext in r.ref_texts.items():
            leaks += [f[:20] for f in leaked_fragments(text, rtext)]
            leaks += [w for w in REF_ONLY.get(rid, []) if w in text]
    return not leaks, f"레퍼런스 누출 0: {', '.join(leaks[:4]) or '없음'}"


def prop_layers(includes: str = "", excludes: str = "", label: str = "") -> Check:
    def check(r: WRun):
        p = r.last_prop()
        if not p:
            return False, f"{label or '층위'}: 후보 없음"
        layers = [str(x if not isinstance(x, dict) else f"{x.get('ref')}:{x.get('layer')}") for c in p.get("candidates") or []
                  for x in c.get("layers") or []]
        joined = " ".join(layers)
        ok = all(re.search(i, joined) for i in includes.split("|") if i) and not any(re.search(e, joined) for e in excludes.split("|") if e)
        return ok, f"{label or '층위'}: {joined[:160] or '없음'}"
    return check


def distinct_candidates(r: WRun) -> tuple[bool, str]:
    p = r.last_prop()
    if not p or len(p.get("candidates") or []) < 2:
        return False, "후보 간 차이: 후보 2개 미만"
    sets = [tuple(sorted(map(str, c.get("layers") or []))) for c in p["candidates"]]
    texts = r.prop_texts()
    def jac(a: str, b: str) -> float:
        ga = {a[i:i + 3] for i in range(len(a) - 2)}
        gb = {b[i:i + 3] for i in range(len(b) - 2)}
        return len(ga & gb) / max(1, len(ga | gb))
    sims = [jac(texts[i], texts[j]) for i in range(len(texts)) for j in range(i + 1, len(texts))]
    ok = len(set(sets)) == len(sets) and max(sims, default=0) < 0.85
    return ok, f"후보 간 차이: 층위 조합 {len(set(sets))}/{len(sets)} · 최대 유사도 {max(sims, default=0):.0%}"


def reads_match(pattern: str, label: str, none: bool = False) -> Check:
    rx = re.compile(pattern)
    def check(r: WRun):
        hit = [p for p in r.reads if rx.search(p)]
        ok = (not hit) if none else bool(hit)
        return ok, f"{label}: {len(hit)}건"
    return check


def short_answer(limit: int = 1500) -> Check:
    def check(r: WRun):
        return len(r.answer) <= limit, f"(가점) 답이 짧다 — 후보는 화면에 (답 {len(r.answer)}자)"
    return check


# --- 작업대 구성 ----------------------------------------------------------------------------------

def wb(doc: Optional[str] = "vdoc_eval_report", scope: str = "document", sel: Optional[list[str]] = None,
       refs: Optional[list[str]] = None, pins: bool = False, pages: Optional[list[str]] = None) -> dict[str, Any]:
    sc: dict[str, Any] = {"mode": scope}
    if scope == "selection" and sel:
        sc["slotIds"] = list(sel)
        sc["label"] = "선택: " + ", ".join(sel)
    if pages:
        sc["pageIds"] = pages
    return {"docId": doc, "scope": sc, "selection": sel or [],
            # pinIds: None = 그 레퍼런스의 핀 전부 · [] = 핀 없이
            "references": [{"refId": r, "pinIds": None if pins else []} for r in refs or []]}


INV, PUB, BLOG = "ref_eval_invest", "ref_eval_public", "ref_eval_blog"

SCENARIOS: list[dict[str, Any]] = [
    # --- Resource 단독 (R1~R5 는 run_evals.py 의 S1~S8 이 맡는다) ---
    {"id": "R6-conflict", "area": "R", "res": "beta", "wb": wb(scope="off"),
     "prompt": "리서치 자료끼리 서로 충돌하는 수치가 있어? 있으면 어느 쪽을 믿어야 해?",
     "checks": [ans(r"1,?200", "충돌값 1,200"), ans(r"1,?450", "충돌값 1,450"),
                ans(r"(로그|3월|최신|2025-03|구두|추정)", "어느 쪽이 맞는지 근거"), reads_match(r"metrics", "지표 파일 읽음")]},
    {"id": "R7-gap", "area": "R", "res": "beta", "wb": wb(scope="off"),
     "prompt": "이 리서치 자료로 매출까지 포함한 분기 사업 보고서를 쓰려면 뭐가 빠졌어?",
     "checks": [ans(r"매출[^\n]{0,40}(없|부재|빠|확인되지|찾지)", "매출 데이터 없음"), ans(r"(WAU|1,?450|템플릿 사용률|68%)", "있는 데이터 제시")]},
    {"id": "R5h-convention", "area": "R", "res": "beta", "wb": wb(scope="off"), "holdout": True,
     "prompt": "새 고객 인터뷰를 기록하려면 어느 폴더에 어떤 이름으로 둬야 해?",
     "checks": [ans(r"interviews", "interviews 폴더"), ans(r"(날짜|YYYY|2025-\d\d-\d\d)[^\n]{0,20}인터뷰", "날짜_인터뷰_회사 규칙")]},

    # --- Reference 단독 ---
    {"id": "F1-decompose", "area": "F", "wb": wb(scope="off", refs=[INV]),
     "prompt": "이 레퍼런스를 층위별로 분해해줘. 내가 뭘 가져다 쓸 수 있는지.",
     "checks": [used("wb_patterns|wb_read", "레퍼런스 읽기 · 측정"),
                ans_count([r"정보 밀도|스캐너", r"증명|근거", r"격식|메타", r"프레임|논증|SCQA|상황", r"조판|타이포|제목 계층", r"장르|어조|종결"], 5, "층위 5개 이상"),
                ans(r"\d", "측정값 근거"), ans(r"^(?!.*(4\.2조원|50억원)).*$", "(가점) 레퍼런스 고유 수치 미전달")]},
    {"id": "F2-compare", "area": "F", "wb": wb(scope="off", refs=[INV, PUB]),
     "prompt": "두 레퍼런스 뭐가 달라?",
     "checks": [ans_count([r"개조식|~함|함\.", r"결재|문서번호|메타", r"결론[^\n]{0,10}(먼저|앞)|두괄", r"SCQA|상황.{0,6}문제", r"볼드|굵", r"표"], 4, "층위 차이 4개 이상"),
                used("wb_compare|wb_patterns", "(가점) 측정 도구")]},
    {"id": "F3h-genre", "area": "F", "wb": wb(scope="off", refs=[INV, PUB, BLOG]), "holdout": True,
     "prompt": "세 레퍼런스의 공통점에서, 결정을 다루는 문서라면 기본으로 지켜야 할 것만 뽑아줘.",
     "checks": [ans_count([r"결정|결론", r"표", r"담당|책임", r"짧|간결", r"요약"], 3, "공통 기준 3개 이상")]},
    {"id": "F4-pin", "area": "F", "wb": wb(scope="off", refs=[INV], pins=True),
     "prompt": "이 핀 같은 느낌으로 가고 싶어.",
     "checks": [used("wb_read", "핀 읽기"), ans_count([r"결론[^\n]{0,12}(먼저|앞|맨)|두괄", r"굵|볼드|머리말|리드", r"짧|한 줄|간결", r"숫자|수치|증거"], 2, "핀의 층위 특정")]},
    {"id": "F5-fit", "area": "F", "wb": wb(refs=[BLOG]),
     "prompt": "이 블로그 글을 레퍼런스로 해서 지금 보고서를 다듬으려고 해. 괜찮을까?",
     "checks": [ans(r"(맞지 않|어울리지 않|부적합|주의|장르)", "장르 불일치 경고"), ans(r"(이모지|~요|해요|구어|친근)", "안 맞는 층위 지목"),
                ans(r"(쓸 수 있|활용할 수|취사선택|가져올|가져와|살릴|참고할 만|선별|착안|부분적|D[1-6][^\n]{0,30}(만|정도))", "쓸 수 있는 층위 제안")]},

    # --- Editor 단독 (+ 이력) ---
    {"id": "E1-scan", "area": "E", "wb": wb(),
     "prompt": "이 문서 훑어 읽기 좋은지 봐줘.",
     "checks": [ans(r"(요약|r_summary)", "요약 칸 지목"), ans(r"(굵|볼드|강조)", "볼드 남발 지적"), ans(r"\d+\s*(개|자|번|회)", "수치로 지적")]},
    {"id": "E2-trim", "area": "E", "wb": wb(scope="selection", sel=["r_metric_note"]),
     "prompt": "이 칸 분량 제한에 맞게 다듬어줘.",
     "checks": [prop_ready(1, slots="r_metric_note"), prop_has(r"템플릿", "핵심 낱말 유지"), short_answer()]},
    {"id": "E3-restore", "area": "E", "res": "beta", "wb": wb(scope="selection", sel=["r_summary"]),
     "prompt": "원래 본문으로 되돌려줘.",
     "checks": [prop_ready(1, mode="restore", slots="r_summary"), prop_has(r"템플릿 우선 제공", "처음 글 그대로"),
                not_used("ws_|read_file", "리소스 탐색 0회"), used("wb_history|wb_read", "이력 사용")]},
    {"id": "E3h-what-changed", "area": "E", "wb": wb(), "holdout": True,
     "prompt": "최근에 이 문서에서 뭐가 바뀌었어?",
     "checks": [ans(r"(요약|r_summary)", "바뀐 칸"), ans(r"(rev|개정|AI|4월 1일|2025-04-01)", "언제 · 누가")]},
    {"id": "E4h-restructure", "area": "E", "wb": wb(doc="vdoc_eval_blogpost"), "holdout": True,
     "prompt": "이 글이 결론부터 보이게 구조를 바꾼 안을 줘.",
     "checks": [prop_ready(1), prop_avoids(r"\d{2,}\s*%", "없던 수치 없음")]},
    {"id": "E5-consistency", "area": "E", "wb": wb(),
     "prompt": "문서 안에서 서로 어긋난 숫자 있어?",
     "checks": [ans(r"47", "47분"), ans(r"45", "45분"), ans(r"(지표 표|r_metric_table)", "표 칸 위치"), ans(r"(지표 해설|r_metric_body)", "해설 칸 위치")]},
    {"id": "E6-todo", "area": "E", "wb": wb(),
     "prompt": "아직 할 일 남은 칸 알려줘.",
     "checks": [ans(r"(r_dec_next|다음 결정|외부 검색)", "빈 칸"), ans(r"(r_metric_note|지표 주석|분량|80)", "분량 초과 칸"), ans(r"근거", "근거 없는 칸")]},

    # --- Resource + Editor ---
    {"id": "RE1-fill", "area": "RE", "res": "alpha", "wb": wb(scope="selection", sel=["r_dec_next"]),
     "prompt": "회의 결정으로 이 칸 채워줘.",
     "checks": [prop_ready(1, slots="r_dec_next"), prop_has(r"(보류|검토|초안|미확정)", "초안 상태 반영"),
                reads_match(r"D5_", "외부 검색 카드 읽음")]},
    {"id": "RE2-verify", "area": "RE", "res": "alpha", "wb": wb(),
     "prompt": "이 문서의 숫자들이 원천 자료랑 맞아?",
     "checks": [ans(r"12\s*명", "실측 12명"), ans(r"10\s*명", "문서의 10명 지적"), reads_match(r"기준선", "기준선 메모 읽음")]},
    {"id": "RE3-update", "area": "RE", "res": "alpha", "wb": wb(),
     "prompt": "원천의 최신 결정을 문서에 반영해줘.",
     "checks": [prop_ready(1), prop_has(r"사용량", "요금제 → 사용량 기반"), reads_match(r"D0?3_|Decision 03", "D03 읽음")]},
    {"id": "RE4h-outline", "area": "RE", "res": "beta", "wb": wb(doc="vdoc_eval_blogpost", scope="off"), "holdout": True,
     "prompt": "리서치 자료로 다음 분기 보고서 목차를 잡아줘.",
     "checks": [ans(r"(WAU|1,?450|템플릿 사용률|인터뷰)", "원천 사실 매핑"), ans(r"(\n\s*[-#\d]|\|)", "목차 구조")]},

    # --- Reference + Editor ---
    {"id": "FE1-genre-only", "area": "FE", "wb": wb(scope="selection", sel=["r_metric_body"], refs=[PUB]),
     "prompt": "공공 보고 레퍼런스의 장르 규약만 이 칸에 적용해줘. 내용은 그대로.",
     "checks": [prop_ready(1, mode="restyle", slots="r_metric_body"), prop_has(r"45", "45 보존", every=True), prop_has(r"10", "10 보존", every=True),
                prop_has(r"(함|임|음|됨)\s*[.。]?\s*($|\n)", "개조식 종결"), no_leak]},
    {"id": "FE2-three", "area": "FE", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV, PUB]),
     "prompt": "요약 칸 후보 3개 보여줘.",
     "checks": [prop_ready(3, slots="r_summary"), distinct_candidates, no_leak, prop_layers(r"D\d"), short_answer()]},
    {"id": "FE3-toggle", "area": "FE", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "turns": ["투자 제안서의 D1이랑 D4를 요약 칸에 적용해줘.", "D4는 빼고 다시."],
     "checks": [prop_ready(1, slots="r_summary"), prop_layers(includes="D1", excludes="D4", label="D4 제외 · D1 유지"), no_leak]},
    {"id": "FE4-gap", "area": "FE", "wb": wb(refs=[INV]),
     "prompt": "이 레퍼런스 대비 내 문서에 뭐가 부족해?",
     "checks": [ans_count([r"단락|문단", r"굵|볼드", r"결론|두괄", r"표|수치|숫자", r"제목|구조"], 3, "층위별 갭 3개 이상"), ans(r"\d", "측정값 비교")]},
    {"id": "FE5-template", "area": "FE", "wb": wb(scope="page", pages=["rp1"], refs=[PUB], pins=True),
     "prompt": "이 레퍼런스처럼 문서 정보랑 결재란 만들어줘.",
     "checks": [prop_ready(1, slots="r_meta,r_summary"), prop_has(r"(문서\s*번호|결재|담당|승인)", "구조 생성"), no_leak]},

    # --- Resource + Reference ---
    {"id": "RF1-frame", "area": "RF", "res": "alpha", "wb": wb(scope="off", refs=[INV]),
     "prompt": "회의 결정들을 이 제안서의 논리 순서로 다시 짜면 어떻게 될까?",
     "checks": [ans(r"(SCQA|상황[^\n]{0,20}문제|문제[^\n]{0,20}해답)", "프레임 명시"), ans(r"(사용량|요금제|온보딩|템플릿)", "원천 사실 매핑"),
                ans(r"^(?!.*(루미나랩스는|4\.2조원)).*$", "레퍼런스 사실 미사용")]},
    {"id": "RF2-proof", "area": "RF", "res": "beta", "wb": wb(scope="off", refs=[INV]),
     "prompt": "이 레퍼런스처럼 표로 숫자를 증명하려면 리서치 자료에 쓸 데이터가 있어?",
     "checks": [ans(r"1,?450|68%|31분", "있는 데이터"), ans(r"(없|부족|빠져|확인되지)", "없는 데이터 구분"), ans(r"^(?!.*210%).*$|210%[^\n]{0,80}(작년|지난해|전년|다른 기간|시점)|(작년|지난해|전년|다른 기간|시점)[^\n]{0,80}210%",
                                          "다른 기간 수치(210%)는 빼거나 시점 명시")]},

    # --- 셋 다 (+ 이력) ---
    {"id": "RFE1-draft", "area": "RFE", "res": "alpha", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV, PUB]),
     "prompt": "투자 제안서의 논리 틀(D4)과 공공 보고의 조판(D5)으로, 회의 결정 카드를 근거로 요약 초안 만들어줘.",
     "checks": [prop_ready(1, slots="r_summary"), prop_layers(includes=f"{INV}:D4|{PUB}:D5", label="A의 D4 + B의 D5"), no_leak,
                reads_match(r"D0?\d_|Decision \d+", "결정 카드 읽음")]},
    {"id": "RFE-P-three", "area": "RFE", "res": "beta", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV], pins=True),
     "prompt": "이 레퍼런스의 핀 영역을 참고해서 research 폴더에서 적절한 내용을 추려, 요약 칸에 어떻게 정리하면 좋을지 3안으로 제시해봐.",
     "checks": [prop_ready(3, slots="r_summary"), distinct_candidates, no_leak, reads_match(r"research", "리서치 원천 읽음"),
                prop_avoids(r"루미나|37곳|NPS", "핀 내용 미복사"), short_answer()]},
    {"id": "RFE3-swap", "area": "RFE", "wb": wb(scope="selection", sel=["r_metric_body"], refs=[INV, PUB]),
     "turns": ["투자 제안서 D1 스타일로 이 칸 다듬어줘. 내용은 그대로.", "레퍼런스를 공공 보고로 바꿔서 다시 적용해줘."],
     "checks": [prop_ready(1, mode="restyle", slots="r_metric_body"), prop_layers(includes=PUB, excludes=INV, label="공공 보고로 교체"),
                prop_has(r"45", "45 보존", every=True), no_leak]},
    {"id": "RFEH-restore-restyle", "area": "RFE", "wb": wb(scope="selection", sel=["r_summary"], refs=[PUB]),
     "turns": ["원래대로 되돌려줘.", "그 원래 글을 공공 보고 스타일로 다시 써줘."],
     "checks": [prop_ready(1, slots="r_summary"), prop_has(r"47", "원래 글의 47분 보존"), prop_has(r"템플릿", "원래 글 내용"),
                used("wb_history|wb_read", "이력 사용"), no_leak]},
]
