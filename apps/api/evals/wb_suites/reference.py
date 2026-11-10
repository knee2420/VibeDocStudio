"""레퍼런스 영역 시나리오 — 이용자 질의 경우의 수(Q1~Q16) · 보류 세트(H1~H3) · 레퍼런스 단독(F)."""
from __future__ import annotations

import re
from typing import Any, Callable

from wb_checks import (
    BLOG,
    INV,
    PM5,
    PUB,
    SEOUL,
    alternatives_or_split,
    ans,
    ans_count,
    answer_mentions_late_sections,
    cards_ok,
    confirmed_followed,
    follows_any,
    follows_ok,
    no_card,
    no_leak,
    no_proposal,
    no_rf_read,
    no_silent_skip,
    pin_read,
    prop_avoids,
    prop_has,
    prop_html_avoids,
    prop_ready,
    rf_used,
    used,
    wb,
)

SEOUL_PIN = "pin_fac7fa6687"
_SUMMARY_SLOTS = "r_summary"


def _layer(*ids: str) -> Callable[[dict[str, Any]], bool]:
    return lambda c: str(c.get("layer")) in ids and c.get("adoption") != "exclude"


REF_SCENARIOS: list[dict[str, Any]] = [
    # Q1 통째 모호 — 해석을 하나로 밀지 않는다
    {"id": "REF-Q1-ambiguous", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "prompt": "요약을 이 레퍼런스처럼 써줘.",
     "checks": [rf_used("rf_read"), cards_ok(need=1), alternatives_or_split, prop_ready(2, slots=_SUMMARY_SLOTS),
                follows_ok(label="모든 후보가 카드를 따름"), no_leak]},
    # Q2 층위 지정 — 어조(장르 규약)만
    {"id": "REF-Q2-layer-only", "area": "REF", "wb": wb(scope="selection", sel=["r_metric_body"], refs=[BLOG]),
     "prompt": "지표 해설을 이 레퍼런스의 말투(어조)만 따라서 바꿔줘. 구성과 내용은 그대로.",
     "checks": [cards_ok(layer="D6", adoption="follow", label="어조(D6) 따름 카드"),
                follows_ok(_layer("D6"), label="후보는 D6 카드만 따름"),
                prop_ready(1, slots="r_metric_body"), no_leak]},
    # Q3 영역(핀) 지정
    {"id": "REF-Q3-pin", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV], pins=True),
     "prompt": "레퍼런스에서 핀 찍어 둔 부분처럼 요약을 다시 짜줘.",
     "checks": [pin_read("pinA1"), cards_ok(scope=r"#pin:pinA1", label="핀 범위 카드"),
                follows_any(lambda c: "#pin:pinA1" in str(c.get("scope")), "핀 범위 카드를 따름"),
                prop_ready(1, slots=_SUMMARY_SLOTS), no_leak]},
    # Q4 층위 × 영역 — 실물 PDF 2쪽 표의 조판만
    {"id": "REF-Q4-layer-area", "area": "REF", "wb": wb(scope="selection", sel=["r_metric_body"], refs=[SEOUL]),
     "prompt": "레퍼런스 2쪽에 있는 표의 짜임새(조판)만 참고해서 지표 해설을 정리해줘.",
     "checks": [rf_used("rf_find|rf_read|rf_outline"), cards_ok(layer="D5", scope=r"#(p2|blk:|pin:|sec:)", label="2쪽 범위 D5 카드"),
                follows_any(_layer("D5"), "D5 카드를 따름"), prop_ready(1, slots="r_metric_body"), no_leak]},
    # Q5 제외 지정 — 굵은 글씨 강조는 따라하지 않는다
    {"id": "REF-Q5-exclude", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "prompt": "요약을 이 레퍼런스처럼 다듬되, 굵은 글씨로 강조하는 방식은 따라하지 마.",
     "checks": [cards_ok(adoption="exclude", label="따르지 않음 카드"), prop_ready(1, slots=_SUMMARY_SLOTS),
                prop_html_avoids(r"<(strong|b)\b", "굵은 글씨 없음"), no_leak]},
    # Q6 강도 — 참고만
    {"id": "REF-Q6-consult", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[PUB]),
     "prompt": "공공 보고서 레퍼런스는 참고만 하고, 우리 문서 톤은 유지하면서 요약을 다듬어줘.",
     "checks": [cards_ok(adoption="consult", label="참고만(consult) 카드"), no_card(r"D\d", "follow", "따름 카드 없음"),
                prop_ready(1, slots=_SUMMARY_SLOTS), prop_avoids(r"^□|함\.$", "공공 보고 문체 이식 없음"), no_leak]},
    # Q7 분석 · 해석만 — 문서는 바꾸지 않는다
    {"id": "REF-Q7-analyze", "area": "REF", "wb": wb(scope="off", refs=[PUB]),
     "prompt": "이 레퍼런스는 무엇이 잘 된 거야? 어떤 결정들이 보이는지 정리해줘.",
     "checks": [rf_used("rf_read"), cards_ok(need=3, label="층위 카드 3장 이상"), no_proposal,
                ans(r"D[1-6]|격식|조판|정보 밀도|장르", "층위로 설명")]},
    # Q8 비교
    {"id": "REF-Q8-contrast", "area": "REF", "wb": wb(refs=[INV, PUB]),
     "prompt": "내 문서 요약은 두 레퍼런스와 층위별로 어떻게 달라?",
     "checks": [rf_used("rf_contrast|rf_measure"), no_proposal, ans(r"D[1-6]", "층위별 비교")]},
    # Q9 결합 — A 의 논증 틀 + B 의 격식
    {"id": "REF-Q9-combine", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV, PUB]),
     "prompt": "투자 제안서의 논증 흐름과 공공 보고서의 격식을 합쳐서 요약을 다시 써줘.",
     "checks": [cards_ok(ref=INV, adoption="follow", label="투자 제안서 따름 카드"), cards_ok(ref=PUB, adoption="follow", label="공공 보고 따름 카드"),
                follows_ok(lambda c: True, every=False, label="카드 따름"),
                follows_any(lambda c: c.get("refId") == INV, "INV 카드 따름"), follows_any(lambda c: c.get("refId") == PUB, "PUB 카드 따름"),
                prop_ready(1, slots=_SUMMARY_SLOTS), no_leak]},
    # Q10 합의 적용 — 확정 카드는 다시 해석하지 않는다
    {"id": "REF-Q10-apply-consensus", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "consensus": {INV: [{"cardId": "cardC1", "layer": "D1", "scope": f"ref:{INV}#pin:pinA1", "adoption": "follow",
                          "reading": "결론 한 문장을 맨 위 상자에 두고, 아래에 문제 · 해법 · 증거 · 요청을 굵은 머리말 불릿 4개로 받친다."},
                         {"cardId": "cardC2", "layer": "D4", "scope": f"ref:{INV}", "adoption": "exclude",
                          "reading": "상황 · 문제 · 질문 · 해답(SCQA) 흐름은 따르지 않는다."}]},
     "prompt": "아까 정한 레퍼런스 해석대로 요약에 적용해줘.",
     "checks": [rf_used("rf_consensus|rf_map"), no_card("D1", "follow|consult", "D1 을 다시 해석하지 않음"),
                follows_any(lambda c: c.get("cardId") == "cardC1", "확정 카드 cardC1 따름"), prop_ready(1, slots=_SUMMARY_SLOTS), no_leak]},
    # Q11 해석 반박 · 수정
    {"id": "REF-Q11-revise", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "turns": ["이 레퍼런스 요약 부분의 핵심 결정이 뭐라고 봐?",
               "그게 아니라 핵심은 요약을 테두리 상자 하나로 묶어서 본문과 분리한 거야. 그 해석으로 요약 다시 써줘."],
     "checks": [cards_ok(reading=r"상자|박스|묶|분리|테두리", label="사용자 해석 반영 카드"),
                follows_any(lambda c: bool(re.search(r"상자|박스|묶|분리|테두리", str(c.get("reading")))), "수정 해석 카드를 따름"),
                prop_ready(1, slots=_SUMMARY_SLOTS), no_leak]},
    # Q12 사실 혼동 — 레퍼런스 수치를 옮기지 않는다
    {"id": "REF-Q12-facts", "area": "REF", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "prompt": "레퍼런스에 나온 고객사 수랑 NPS 수치로 요약을 채워줘.",
     "checks": [prop_avoids(r"37곳|NPS\s*71|71점", "레퍼런스 수치 없음"), ans(r"사실|수치|리소스|옮기지", "레퍼런스는 사실 근거가 아님을 밝힘"), no_leak]},
    # Q13 무관 요청 — 레퍼런스를 열지 않는다
    {"id": "REF-Q13-unrelated", "area": "REF", "wb": wb(refs=[PM5]),
     "prompt": "이 문서 칸이 모두 몇 개야?",
     "checks": [no_rf_read, ans(r"\d+\s*개", "칸 수 답"), no_silent_skip]},
    # Q14 긴 레퍼런스 전역 — 앞부분만 보고 끝내지 않는다
    {"id": "REF-Q14-long-global", "area": "REF", "wb": wb(scope="off", refs=[PM5]),
     "prompt": "이 레퍼런스 문서 전체 구성을 장별로 요약해줘.",
     "checks": [rf_used("rf_outline|rf_map"), answer_mentions_late_sections(PM5), no_proposal]},
    # Q15 모호한 위치 — '그 표'
    {"id": "REF-Q15-vague-location", "area": "REF", "wb": wb(scope="selection", sel=["r_metric_body"], refs=[SEOUL]),
     "prompt": "그 레퍼런스에 표 있잖아, 그것처럼 지표 해설을 표 형식으로 정리해줘.",
     "checks": [rf_used("rf_find|rf_outline"), cards_ok(scope=r"#(blk:|p\d|pin:|sec:)", label="표 위치로 좁힌 카드"),
                prop_ready(1, slots="r_metric_body"), prop_has(r"\|", "표 형식"), no_leak]},
    # Q16 핀이 있는데 짚지 않음 — 핀을 초점으로 먼저 본다
    {"id": "REF-Q16-implicit-pin", "area": "REF", "wb": wb(scope="selection", sel=["r_metric_body"], refs=[PM5], pins=True),
     "prompt": "지표 해설을 레퍼런스처럼 다듬어줘.",
     "checks": [pin_read("pinP1"), cards_ok(need=1), follows_ok(label="카드 따름"), prop_ready(1, slots="r_metric_body"), no_leak]},
    # --- 보류 세트 (튜닝에 쓰지 않는다) ---
    {"id": "REF-H1-ambiguous-public", "area": "REF", "holdout": True, "wb": wb(scope="selection", sel=["r_metric_body"], refs=[PUB]),
     "prompt": "지표 해설, 이 보고서 느낌으로 가자.",
     "checks": [cards_ok(need=1), alternatives_or_split, follows_ok(label="카드 따름"), prop_ready(1, slots="r_metric_body"), no_leak]},
    {"id": "REF-H2-confirm-then-apply", "area": "REF", "holdout": True, "wb": wb(scope="selection", sel=["r_summary"], refs=[PUB]),
     "turns": ["이 레퍼런스에서 가져올 만한 결정을 해석 카드로 정리해줘. 아직 문서는 바꾸지 마.",
               {"confirm": lambda c: c.get("adoption") == "follow"},
               "확정한 해석대로 요약을 다시 써줘."],
     "checks": [confirmed_followed,
                prop_ready(1, slots=_SUMMARY_SLOTS), no_leak]},
    {"id": "REF-H3-tone-minus-emoji", "area": "REF", "holdout": True, "wb": wb(scope="selection", sel=["r_metric_body"], refs=[BLOG]),
     "prompt": "블로그처럼 친근하게 바꾸되 이모지는 빼줘.",
     "checks": [cards_ok(adoption="exclude", label="이모지 따르지 않음 카드"), prop_ready(1, slots="r_metric_body"),
                prop_avoids("[\U0001F300-\U0001FAFF]", "이모지 없음"), no_leak]},
]


REFERENCE_SOLO: list[dict[str, Any]] = [
    # --- Reference 단독 ---
    {"id": "F1-decompose", "area": "F", "wb": wb(scope="off", refs=[INV]),
     "prompt": "이 레퍼런스를 층위별로 분해해줘. 내가 뭘 가져다 쓸 수 있는지.",
     "checks": [used("wb_patterns|wb_read|rf_read|rf_measure", "레퍼런스 읽기 · 측정"),
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
     "checks": [pin_read("pinA1"), ans_count([r"결론[^\n]{0,12}(먼저|앞|맨)|두괄", r"굵|볼드|머리말|리드", r"짧|한 줄|간결", r"숫자|수치|증거"], 2, "핀의 층위 특정")]},
    {"id": "F5-fit", "area": "F", "wb": wb(refs=[BLOG]),
     "prompt": "이 블로그 글을 레퍼런스로 해서 지금 보고서를 다듬으려고 해. 괜찮을까?",
     "checks": [ans(r"(맞지 않|어울리지 않|부적합|주의|장르)", "장르 불일치 경고"), ans(r"(이모지|~요|해요|구어|친근)", "안 맞는 층위 지목"),
                ans(r"(쓸 수 있|활용할 수|취사선택|가져올|가져와|살릴|참고할 만|선별|착안|부분적|D[1-6][^\n]{0,30}(만|정도))", "쓸 수 있는 층위 제안")]},
]
