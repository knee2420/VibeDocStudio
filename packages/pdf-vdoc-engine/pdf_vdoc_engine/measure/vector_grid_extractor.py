"""1단계(measure): PDF 벡터 선분 및 텍스트 좌표를 결정론적으로 측정·클러스터링한다."""
from __future__ import annotations

import base64
from typing import Iterable

import pymupdf

from ..models import (
    MeasuredGridCell,
    MeasuredGridRow,
    MeasuredGridTable,
    MeasuredPageGeometry,
    TextAtomPt,
)


def cluster_coordinates(values: Iterable[float], tolerance_pt: float = 1.8) -> tuple[float, ...]:
    """가까운 X 또는 Y 좌표들을 허용 오차(기본 ±1.8pt) 이내에서 하나의 격자선으로 병합한다."""
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


def snap_to_closest(val: float, grid: tuple[float, ...]) -> int:
    return min(range(len(grid)), key=lambda i: abs(grid[i] - val))


def _extract_tables_from_page(
    page: pymupdf.Page,
    all_atoms: list[TextAtomPt],
    page_number: int,
) -> tuple[list[MeasuredGridTable], list[TextAtomPt]]:
    """실제 벡터 선분과 표 탐색기를 결합해 고정밀 격자 표를 복원한다."""
    finder = page.find_tables()
    measured_tables: list[MeasuredGridTable] = []
    consumed_atom_indices: set[int] = set()

    # 페이지 전체의 벡터 수평선/수직선 수집
    h_drawings: list[tuple[float, float, float]] = []
    v_drawings: list[tuple[float, float, float]] = []
    for d in page.get_drawings():
        for item in d.get("items", []):
            if item[0] == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 1.0 and abs(p1.x - p2.x) > 15:
                    h_drawings.append(((p1.y + p2.y) / 2.0, min(p1.x, p2.x), max(p1.x, p2.x)))
                elif abs(p1.x - p2.x) < 1.0 and abs(p1.y - p2.y) > 15:
                    v_drawings.append(((p1.x + p2.x) / 2.0, min(p1.y, p2.y), max(p1.y, p2.y)))
            elif item[0] == "re":
                r = item[1]
                if r.height < 3.0 and r.width > 15:
                    h_drawings.append((r.y0 + r.height / 2.0, r.x0, r.x1))
                elif r.width < 3.0 and r.height > 15:
                    v_drawings.append((r.x0 + r.width / 2.0, r.y0, r.y1))

    for t_idx, table in enumerate(finder.tables):
        cells_bboxes = [c for c in table.cells if c is not None]
        if not cells_bboxes:
            continue

        tb = table.bbox
        table_h_lines = [
            hl[0] for hl in h_drawings
            if (tb[1] - 3.0 <= hl[0] <= tb[3] + 3.0) and not (hl[2] < tb[0] - 2.0 or hl[1] > tb[2] + 2.0)
        ]
        table_v_lines = [
            vl[0] for vl in v_drawings
            if (tb[0] - 3.0 <= vl[0] <= tb[2] + 3.0) and not (vl[2] < tb[1] - 2.0 or vl[1] > tb[3] + 2.0)
        ]

        if len(table_h_lines) >= 2:
            ys = cluster_coordinates(table_h_lines, tolerance_pt=2.0)
        else:
            ys = cluster_coordinates([c[1] for c in cells_bboxes] + [c[3] for c in cells_bboxes], tolerance_pt=1.8)

        if len(table_v_lines) >= 2:
            xs = cluster_coordinates(table_v_lines, tolerance_pt=2.0)
        else:
            xs = cluster_coordinates([c[0] for c in cells_bboxes] + [c[2] for c in cells_bboxes], tolerance_pt=1.8)

        if len(xs) < 2 or len(ys) < 2:
            continue

        col_widths_pt = tuple(round(xs[i + 1] - xs[i], 2) for i in range(len(xs) - 1))
        num_rows = len(ys) - 1
        num_cols = len(xs) - 1

        # 스냅된 유효 셀 매핑 구축
        snapped_cells: dict[tuple[int, int], dict[str, int]] = {}
        for cb in cells_bboxes:
            c0 = snap_to_closest(cb[0], xs)
            c1 = snap_to_closest(cb[2], xs)
            r0 = snap_to_closest(cb[1], ys)
            r1 = snap_to_closest(cb[3], ys)
            if r1 <= r0 or c1 <= c0:
                continue
            key = (r0, c0)
            area = (r1 - r0) * (c1 - c0)
            if key not in snapped_cells or area > snapped_cells[key]["area"]:
                snapped_cells[key] = {
                    "r_span": r1 - r0,
                    "c_span": c1 - c0,
                    "area": area,
                }

        covered: set[tuple[int, int]] = set()
        rows_list: list[MeasuredGridRow] = []

        for r_idx in range(num_rows):
            y_top, y_bottom = ys[r_idx], ys[r_idx + 1]
            row_cells: list[MeasuredGridCell] = []

            for c_idx in range(num_cols):
                if (r_idx, c_idx) in covered:
                    continue
                x_left = xs[c_idx]

                cell_info = snapped_cells.get((r_idx, c_idx))
                if cell_info is not None:
                    col_span = cell_info["c_span"]
                    row_span = cell_info["r_span"]
                else:
                    col_span = 1
                    row_span = 1

                for dr in range(row_span):
                    for dc in range(col_span):
                        covered.add((r_idx + dr, c_idx + dc))

                end_c = min(num_cols, c_idx + col_span)
                end_r = min(num_rows, r_idx + row_span)
                x_right = xs[end_c]
                cell_y_bottom = ys[end_r]

                # 셀 내부 텍스트 수집
                cell_texts: list[str] = []
                for a_idx, atom in enumerate(all_atoms):
                    cx = (atom.x0 + atom.x1) / 2.0
                    cy = (atom.y0 + atom.y1) / 2.0
                    if x_left - 2.0 <= cx <= x_right + 2.0 and y_top - 2.0 <= cy <= cell_y_bottom + 2.0:
                        consumed_atom_indices.add(a_idx)
                        cell_texts.append(atom.text)

                joined_text = "\n".join(cell_texts).strip()

                # 셀 내부 이미지 수집 (로고 등): 오직 첫 번째 표의 좌상단(0,0) 셀에서만 추출
                if not joined_text and page and t_idx == 0 and r_idx == 0 and c_idx == 0:
                    for img_info in page.get_image_info():
                        ibox = img_info.get("bbox")
                        if ibox:
                            icx = (ibox[0] + ibox[2]) / 2.0
                            icy = (ibox[1] + ibox[3]) / 2.0
                            if x_left - 2.0 <= icx <= x_right + 2.0 and y_top - 2.0 <= cell_y_bottom + 2.0:
                                for img_tuple in page.get_images():
                                    xref = img_tuple[0]
                                    try:
                                        extracted = page.parent.extract_image(xref)
                                        if extracted and "image" in extracted:
                                            b64 = base64.b64encode(extracted["image"]).decode("ascii")
                                            ext = extracted.get("ext", "png")
                                            joined_text = f'<p style="text-align: center;"><img src="data:image/{ext};base64,{b64}" alt="Logo" style="max-height: 48px; display: inline-block;" /></p>'
                                            break
                                    except Exception:
                                        pass
                                if joined_text:
                                    break

                is_header = bool(
                    (joined_text and len(joined_text) <= 15 and ("\n" not in joined_text) and not any(ch.isdigit() for ch in joined_text))
                    or ("(인)" in joined_text or "(서명)" in joined_text)
                    or ("회의록" in joined_text or "회의" in joined_text or "공사명" in joined_text or "도면명" in joined_text or "제목" in joined_text or "내용" in joined_text)
                )

                row_cells.append(
                    MeasuredGridCell(
                        row_index=r_idx,
                        col_index=c_idx,
                        col_span=col_span,
                        row_span=row_span,
                        x0=x_left,
                        y0=y_top,
                        x1=x_right,
                        y1=cell_y_bottom,
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

    remaining_atoms = [
        atom for i, atom in enumerate(all_atoms) if i not in consumed_atom_indices
    ]
    return measured_tables, remaining_atoms


def extract_page_geometry_from_pdf(pdf_bytes: bytes) -> tuple[MeasuredPageGeometry, ...]:
    """PDF 바이트로부터 모든 페이지의 표와 잔여 텍스트를 기하학적으로 측정한다."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pages_geometry: list[MeasuredPageGeometry] = []

    for pno, page in enumerate(doc, start=1):
        atoms = _extract_text_atoms(page)
        tables, remaining_atoms = _extract_tables_from_page(page, atoms, page_number=pno)
        rect = page.rect
        pages_geometry.append(
            MeasuredPageGeometry(
                page_number=pno,
                width_pt=float(rect.width),
                height_pt=float(rect.height),
                tables=tuple(tables),
                free_texts=tuple(remaining_atoms),
            )
        )

    doc.close()
    return tuple(pages_geometry)
