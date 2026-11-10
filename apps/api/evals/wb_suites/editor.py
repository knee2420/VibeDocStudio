"""에디터 영역 시나리오 — 에디터 단독 + 이력(E)."""
from __future__ import annotations

from typing import Any

from wb_checks import (
    ans,
    not_used,
    prop_avoids,
    prop_has,
    prop_ready,
    short_answer,
    used,
    wb,
)

EDITOR_SOLO: list[dict[str, Any]] = [
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
]
