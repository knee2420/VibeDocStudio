"""1단계(measure): PDF 벡터 선분 및 텍스트 좌표를 결정론적으로 측정·클러스터링한다."""
from __future__ import annotations

from typing import Iterable

import pymupdf

from ..models import (
    MeasuredGridCell,
    MeasuredGridRow,
    MeasuredGridTable,
    MeasuredPageGeometry,
    TextAtomPt,
)


def cluster_coordinates(values: Iterable[float], tolerance_pt: float = 1.5) -> tuple[float, ...]:
    """가까운 X 또는 Y 좌표들을 허용 오차(기본 ±1.5pt) 이내에서 하나의 격자선으로 병합한다."""
    sorted_vals = sorted(float(v) for v in values)
    if not sorted_vals:
        return ()
    clusters: list[list[float]] = [[sorted_vals[0]]]
    for val in sorted_vals[1:]:
        if abs(val - clusters[-1][-1]) <= tolerance_pt:
            clusters[-1].append(val)
        else:
            clusters.append([val])
    return tuple(round(sum(group) / len(group), 2) for group in clusters)


def _extract_text_atoms(page: pymupdf.Page) -> list[TextAtomPt]:
    atoms: list[TextAtomPt] = []
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            line_text = "".join(str(s.get("text", "")) for s in spans).strip()
            if not line_text:
                continue
            bbox = line.get("bbox", (0.0, 0.0, 0.0, 0.0))
            max_size = max(float(s.get("size", 9.0)) for s in spans)
            is_bold = any("bold" in str(s.get("font", "")).lower() for s in spans)
            atoms.append(
                TextAtomPt(
                    text=line_text,
                    x0=float(bbox[0]),
                    y0=float(bbox[1]),
                    x1=float(bbox[2]),
                    y1=float(bbox[3]),
                    font_size=round(max_size, 2),
                    is_bold=is_bold,
                )
            )
    return atoms


def _extract_tables_from_page(
    page: pymupdf.Page,
    all_atoms: list[TextAtomPt],
    page_number: int,
) -> tuple[list[MeasuredGridTable], list[TextAtomPt]]:
    """PyMuPDF의 표 탐색기와 좌표 클러스터링을 결합해 정밀 격자 표를 복원한다."""
    finder = page.find_tables()
    measured_tables: list[MeasuredGridTable] = []
    consumed_atom_indices: set[int] = set()

    for t_idx, table in enumerate(finder.tables):
        cells_bboxes = [c for c in table.cells if c is not None]
        if not cells_bboxes:
            continue

        xs = cluster_coordinates(
            [c[0] for c in cells_bboxes] + [c[2] for c in cells_bboxes],
            tolerance_pt=1.8,
        )
        ys = cluster_coordinates(
            [c[1] for c in cells_bboxes] + [c[3] for c in cells_bboxes],
            tolerance_pt=1.8,
        )
        if len(xs) < 2 or len(ys) < 2:
            continue

        col_widths_pt = tuple(round(xs[i + 1] - xs[i], 2) for i in range(len(xs) - 1))
        num_rows = len(ys) - 1
        num_cols = len(xs) - 1

        covered: set[tuple[int, int]] = set()
        rows_list: list[MeasuredGridRow] = []

        for r_idx in range(num_rows):
            y_top, y_bottom = ys[r_idx], ys[r_idx + 1]
            row_cells: list[MeasuredGridCell] = []

            for c_idx in range(num_cols):
                if (r_idx, c_idx) in covered:
                    continue
                x_left, x_right = xs[c_idx], xs[c_idx + 1]

                # 해당 시작점(x_left, y_top)과 가장 가까운 원본 셀 bbox 탐색
                matched_bbox = None
                for cb in cells_bboxes:
                    if abs(cb[0] - x_left) <= 2.5 and abs(cb[1] - y_top) <= 2.5:
                        matched_bbox = cb
                        break

                col_span = 1
                row_span = 1
                cell_x1 = x_right
                cell_y1 = y_bottom

                if matched_bbox is not None:
                    cell_x1 = float(matched_bbox[2])
                    cell_y1 = float(matched_bbox[3])
                    col_span = max(
                        1,
                        sum(
                            1
                            for k in range(c_idx, num_cols)
                            if xs[k + 1] <= cell_x1 + 2.5
                        ),
                    )
                    row_span = max(
                        1,
                        sum(
                            1
                            for k in range(r_idx, num_rows)
                            if ys[k + 1] <= cell_y1 + 2.5
                        ),
                    )

                for dr in range(row_span):
                    for dc in range(col_span):
                        covered.add((r_idx + dr, c_idx + dc))

                # 셀 내부에 속하는 텍스트 조각 수집
                cell_texts: list[str] = []
                for a_idx, atom in enumerate(all_atoms):
                    cx = (atom.x0 + atom.x1) / 2.0
                    cy = (atom.y0 + atom.y1) / 2.0
                    if x_left - 1.5 <= cx <= cell_x1 + 1.5 and y_top - 1.5 <= cy <= cell_y1 + 1.5:
                        consumed_atom_indices.add(a_idx)
                        cell_texts.append(atom.text)

                joined_text = "\n".join(cell_texts).strip()
                is_header = (r_idx == 0) or (c_idx == 0 and len(joined_text) <= 12)
                row_cells.append(
                    MeasuredGridCell(
                        row_index=r_idx,
                        col_index=c_idx,
                        col_span=col_span,
                        row_span=row_span,
                        x0=x_left,
                        y0=y_top,
                        x1=cell_x1,
                        y1=cell_y1,
                        text=joined_text,
                        is_header_candidate=is_header,
                    )
                )

            rows_list.append(
                MeasuredGridRow(
                    row_index=r_idx,
                    height_pt=round(y_bottom - y_top, 2),
                    cells=tuple(row_cells),
                )
            )

        measured_tables.append(
            MeasuredGridTable(
                table_id=f"p{page_number}_tbl_{t_idx + 1}",
                x0=xs[0],
                y0=ys[0],
                x1=xs[-1],
                y1=ys[-1],
                col_widths_pt=col_widths_pt,
                rows=tuple(rows_list),
            )
        )

    free_texts = [
        atom for idx, atom in enumerate(all_atoms) if idx not in consumed_atom_indices
    ]
    return measured_tables, free_texts


def extract_page_geometry_from_pdf(pdf_bytes: bytes) -> tuple[MeasuredPageGeometry, ...]:
    """PDF 바이트로부터 페이지별 기하 구조(표 격자 + 자유 텍스트)를 결정론적으로 추출한다."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pages: list[MeasuredPageGeometry] = []
    try:
        for idx, page in enumerate(doc):
            page_num = idx + 1
            rect = page.rect
            atoms = _extract_text_atoms(page)
            tables, free_texts = _extract_tables_from_page(page, atoms, page_num)
            pages.append(
                MeasuredPageGeometry(
                    page_number=page_num,
                    width_pt=round(float(rect.width), 2),
                    height_pt=round(float(rect.height), 2),
                    free_texts=tuple(free_texts),
                    tables=tuple(tables),
                )
            )
    finally:
        doc.close()
    return tuple(pages)

