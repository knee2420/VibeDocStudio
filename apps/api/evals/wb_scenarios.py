"""작업대 평가 시나리오 모음 — 단독(R · F · E) · 조합(RE · FE · RF · RFE) · 이력 · 레퍼런스 질의(REF).

시나리오는 영역별로 `wb_suites/` 에 있고, 채점 기본기(WRun · Check · wb)는 `wb_checks.py` 에 있다.
여기서는 실행 순서만 정한다. holdout=True 인 시나리오는 엔진을 튜닝할 때 보지 않는다 (일반화 확인용).
"""
from __future__ import annotations

from typing import Any

from wb_checks import (  # noqa: F401  (wb_eval 이 WRun 을 여기서 가져간다)
    Check,
    WRun,
    wb,
)
from wb_suites.combined import CROSS, MIXED
from wb_suites.editor import EDITOR_SOLO
from wb_suites.reference import REF_SCENARIOS, REFERENCE_SOLO
from wb_suites.resource import RESOURCE_SOLO

SCENARIOS: list[dict[str, Any]] = [
    *REF_SCENARIOS,
    *MIXED,
    *RESOURCE_SOLO,
    *REFERENCE_SOLO,
    *EDITOR_SOLO,
    *CROSS,
]
