"""리소스 영역 시나리오 — 리소스 단독(R). R1~R5 는 run_evals.py 의 S1~S8 이 맡는다."""
from __future__ import annotations

from typing import Any

from wb_checks import (
    ans,
    reads_match,
    wb,
)

RESOURCE_SOLO: list[dict[str, Any]] = [
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
]
