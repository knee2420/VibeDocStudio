"""수평 파이프라인 단계 간에 주고받는 불변 데이터 계약."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class TextAtomPt:
    """PDF 페이지 위에서 측정된 단일 텍스트 조각 (단위: pt)."""

    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    font_size: float = 9.0
    is_bold: bool = False


@dataclass(frozen=True)
class MeasuredGridCell:
    """수평·수직 선분 클러스터링으로 계산된 단일 또는 병합 격자 셀."""

    row_index: int
    col_index: int
    col_span: int
    row_span: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    is_header_candidate: bool = False


@dataclass(frozen=True)
class MeasuredGridRow:
    """측정된 표의 단일 행."""

    row_index: int
    height_pt: float
    cells: tuple[MeasuredGridCell, ...]


@dataclass(frozen=True)
class MeasuredGridTable:
    """클러스터링된 X·Y 그리드로부터 복원된 표 기하 구조."""

    table_id: str
    x0: float
    y0: float
    x1: float
    y1: float
    col_widths_pt: tuple[float, ...]
    rows: tuple[MeasuredGridRow, ...]


@dataclass(frozen=True)
class MeasuredPageGeometry:
    """1단계(measure)의 산출물: 페이지 크기, 표 밖의 텍스트, 복원된 표 목록."""

    page_number: int
    width_pt: float
    height_pt: float
    free_texts: tuple[TextAtomPt, ...]
    tables: tuple[MeasuredGridTable, ...]


ZoneKind = Literal["form-title", "composite-form-frame", "structured-table", "section-block"]


@dataclass(frozen=True)
class PartitionedZone:
    """2단계(judge)에서 판정된 단일 레이아웃 구획."""

    zone_id: str
    kind: ZoneKind
    title: str
    headline_text: str = ""
    tables: tuple[MeasuredGridTable, ...] = ()


@dataclass(frozen=True)
class ZonePartitionResult:
    """2단계(judge)의 산출물."""

    page_number: int
    zones: tuple[PartitionedZone, ...]


@dataclass(frozen=True)
class ValidationScore:
    """4단계(validate)의 무결성 및 기하 검증 결과."""

    valid: bool
    grid_invariant_passed: bool
    slot_integrity_passed: bool
    checked_tables: int
    checked_slots: int
    errors: tuple[str, ...] = field(default_factory=tuple)

