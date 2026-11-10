"""출처를 섞는 시나리오 — 출처 이름을 말하지 않는 요청(MIX) · 조합(RE · FE · RF · RFE)."""
from __future__ import annotations

from typing import Any

from wb_checks import (
    BLOG,
    INV,
    PUB,
    ans,
    ans_count,
    distinct_candidates,
    no_leak,
    no_silent_skip,
    prop_avoids,
    prop_has,
    prop_layers,
    prop_ready,
    reads_match,
    short_answer,
    sources_opened,
    used,
    wb,
)

MIXED: list[dict[str, Any]] = [
    # --- 섞인 출처 · 출처 이름을 말하지 않는 요청 (켜진 출처를 골고루 확인하는가) ---
    {"id": "MIX1-fill", "area": "MIX", "res": "alpha", "wb": wb(scope="selection", sel=["r_summary"], refs=[INV]),
     "prompt": "요약 칸 제대로 채워줘.",
     "checks": [sources_opened("editor|references|resources", "세 출처 모두 확인"), prop_ready(1, slots="r_summary"), no_leak,
                no_silent_skip]},
    {"id": "MIX2-polish", "area": "MIX", "res": "beta", "wb": wb(refs=[PUB]),
     "prompt": "이 보고서 이번 주 공유용으로 다듬어줘.",
     "checks": [sources_opened("editor|references|resources", "세 출처 모두 확인"), no_leak, no_silent_skip]},
    {"id": "MIX3-narrow", "area": "MIX", "res": "alpha", "wb": wb(refs=[BLOG]),
     "prompt": "이 문서 지금 몇 쪽이야?",
     # 좁은 질문: 정답을 내고, 관련 없는 출처를 괜히 읽지 않으며, 안 쓴 출처는 이유를 밝힌다
     "checks": [ans(r"4\s*쪽", "정답 4쪽"), sources_opened("editor", "에디터 확인"), reads_match(r".", "리소스 읽지 않음", none=True),
                no_silent_skip, short_answer()]},
    {"id": "MIX4h-metrics", "area": "MIX", "res": "beta", "wb": wb(scope="page", pages=["rp1"], refs=[INV, PUB]), "holdout": True,
     "prompt": "다음 주 경영진 보고용으로 지표 부분 보강해줘.",
     "checks": [sources_opened("editor|references|resources", "세 출처 모두 확인"), no_leak, no_silent_skip,
                reads_match(r"metrics|지표", "지표 원천 읽음")]},
]


CROSS: list[dict[str, Any]] = [
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
