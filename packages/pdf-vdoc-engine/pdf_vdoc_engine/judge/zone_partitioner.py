"""2단계(judge): 측정된 페이지 기하 구조를 `.vdoc` 레이아웃 블록 구획으로 판정한다."""
from __future__ import annotations

from ..models import (
    MeasuredGridTable,
    MeasuredPageGeometry,
    PartitionedZone,
    ZonePartitionResult,
)


def _has_merged_cells(table: MeasuredGridTable) -> bool:
    for row in table.rows:
        for cell in row.cells:
            if cell.col_span > 1 or cell.row_span > 1:
                return True
    return False


def partition_page_zones(geometry: MeasuredPageGeometry) -> ZonePartitionResult:
    """페이지의 자유 텍스트와 표 격자를 분석해 `.vdoc` 구획(Zone) 목록으로 분류한다."""
    zones: list[PartitionedZone] = []
    pnum = geometry.page_number

    # 1. 첫 번째 표 상단에 위치한 대표 표제부(form-title) 판정
    first_table_y = geometry.tables[0].y0 if geometry.tables else geometry.height_pt
    top_headings = [
        t for t in geometry.free_texts if t.y0 < first_table_y and t.font_size >= 13.0
    ]
    if top_headings:
        title_atom = max(top_headings, key=lambda item: item.font_size)
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_title",
                kind="form-title",
                title=title_atom.text,
                headline_text=title_atom.text,
            )
        )

    # 2. 표 구획 판정: 연속되거나 병합 셀이 포함된 행정 양식 틀은 `composite-form-frame`,
    #    단일 일반 표는 `structured-table`로 분류한다.
    if len(geometry.tables) > 1 or (
        len(geometry.tables) == 1 and _has_merged_cells(geometry.tables[0])
    ):
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_composite",
                kind="composite-form-frame",
                title="복합 양식 테이블 프레임",
                tables=geometry.tables,
            )
        )
    elif len(geometry.tables) == 1:
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_table_1",
                kind="structured-table",
                title="정밀 격자 표",
                tables=geometry.tables,
            )
        )

    # 3. 표 밖의 일반 본문 텍스트가 남아 있으면 `section-block`으로 묶는다.
    remaining_texts = [
        t.text
        for t in geometry.free_texts
        if t not in top_headings and t.text.strip()
    ]
    if remaining_texts:
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_section",
                kind="section-block",
                title="문서 본문 구획",
                headline_text="\n".join(remaining_texts),
            )
        )

    return ZonePartitionResult(page_number=pnum, zones=tuple(zones))
