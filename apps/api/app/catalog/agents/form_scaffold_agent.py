"""PDF 양식을 분석하여 고충실도 .vdoc 블록 및 슬롯으로 조립하는 스캐폴딩 에이전트.

pdf-vdoc-engine의 결정적 기하 추출과 규칙/의미론적 조항 위계 파티셔너를 결합하여,
여백(content_width) 내에 정규화된 프레임과 고충실도 Tiptap HTML을 생성한다.
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from typing import Any, Optional

import pymupdf
from pdf_vdoc_engine.assemble.vdoc_assembler import _assemble_table_section
from pdf_vdoc_engine.measure import extract_page_geometry_from_pdf

PX = 96.0 / 72.0


def _r(v: float) -> float:
    return round(float(v), 2)


def _get_font_family(font_name: str) -> str:
    fn_lower = font_name.lower()
    if "µ¸¿ò" in font_name or "dotum" in fn_lower:
        return "Dotum"
    if "times" in fn_lower:
        return "Times New Roman"
    if "batang" in fn_lower or "바탕" in font_name:
        return "Batang"
    return "GulimChe"


def _get_f_factor(font_name: str) -> float:
    if "times" in font_name.lower():
        return 1.1074
    return 1.0


class FormScaffoldAgent:
    """PDF 양식 의미론·기하 스캐폴더 (FormScaffoldAgentPort 구현체)."""

    def __init__(self, llm_harness: Optional[Any] = None) -> None:
        self._llm_harness = llm_harness

    def scaffold_document(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
    ) -> tuple[dict[str, Any], int, int]:
        """PDF 바이트를 파싱하여 완전한 .vdoc Document JSON과 통계(블록 수, 슬롯 수)를 반환한다."""
        if not pdf_bytes:
            raise ValueError("PDF payload is empty")

        doc_title = (title or "").strip() or "추출된 양식 문서"
        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        geometries = extract_page_geometry_from_pdf(pdf_bytes)

        pages: list[dict[str, Any]] = []
        slots: dict[str, dict[str, Any]] = {}
        total_blocks_count = 0

        for page_idx in range(len(pdf)):
            page_num = page_idx + 1
            page = pdf[page_idx]
            page_geom = geometries[page_idx] if page_idx < len(geometries) else None

            # 1. 페이지 크기 계산 (기본 A4 794x1123 px 정규화)
            w_px = _r(page.rect.width * PX)
            h_px = _r(page.rect.height * PX)
            if abs(w_px - 794.0) < 5.0 and abs(h_px - 1123.0) < 5.0:
                w_px, h_px = 794.0, 1123.0

            page_blocks: list[dict[str, Any]] = []

            # 2. 표 격자가 존재하는 경우 먼저 추출
            table_y_ranges: list[tuple[float, float]] = []
            if page_geom and page_geom.tables:
                for tbl_idx, table in enumerate(page_geom.tables):
                    tbl_sec = _assemble_table_section(table, slots)
                    tbl_blk_id = f"p{page_num}_tbl_{tbl_idx + 1}"
                    page_blocks.append(
                        {
                            "blockId": tbl_blk_id,
                            "kind": "structured-table",
                            "title": f"표 구획 {tbl_idx + 1}",
                            "columnWidths": tbl_sec["columnWidths"],
                            "rows": tbl_sec["rows"],
                            "locked": False,
                        }
                    )
                    table_y_ranges.append((table.y0 * PX, table.y1 * PX))

            # 3. 텍스트 스팬 및 줄(Line) 추출
            text_dict = page.get_text("dict")
            raw_spans: list[dict[str, Any]] = []
            for b in text_dict.get("blocks", []):
                if b.get("type") != 0:
                    continue
                for line_item in b.get("lines", []):
                    for s in line_item.get("spans", []):
                        stext = s.get("text", "")
                        if not stext.strip():
                            continue
                        bbox = s.get("bbox", (0, 0, 0, 0))
                        s_x0 = _r(bbox[0] * PX)
                        s_y0 = _r(bbox[1] * PX)
                        s_x1 = _r(bbox[2] * PX)
                        s_y1 = _r(bbox[3] * PX)

                        # 표 영역 내부에 들어간 텍스트는 표 셀에 포함되므로 건너뜀
                        is_inside_table = any(
                            (ty0 - 2.0) <= s_y0 <= (ty1 + 2.0)
                            for ty0, ty1 in table_y_ranges
                        )
                        if is_inside_table:
                            continue

                        raw_spans.append(
                            {
                                "text": stext,
                                "x": s_x0,
                                "y": s_y0,
                                "x1": s_x1,
                                "y1": s_y1,
                                "pt": _r(s.get("size", 10.0)),
                                "font": s.get("font", "GulimChe"),
                                "bold": "bold" in s.get("font", "").lower(),
                                "color": f"#{s.get('color', 0):06x}",
                            }
                        )

            # 수직 Y좌표 기준으로 시각적 줄(Visual Lines) 그룹화
            raw_spans.sort(key=lambda s: (s["y"], s["x"]))
            lines: list[list[dict[str, Any]]] = []
            curr_line: list[dict[str, Any]] = []
            curr_y: Optional[float] = None

            for sp in raw_spans:
                if curr_y is None or abs(sp["y"] - curr_y) < 3.0:
                    curr_line.append(sp)
                    curr_y = sp["y"] if curr_y is None else curr_y
                else:
                    lines.append(curr_line)
                    curr_line = [sp]
                    curr_y = sp["y"]
            if curr_line:
                lines.append(curr_line)

            # 4. 매크로 레이아웃(여백 및 유효 본문 폭) 계산
            if lines:
                body_xs = [ln[0]["x"] for ln in lines if ln[0]["pt"] <= 14.0]
                body_x1s = [ln[-1]["x1"] for ln in lines if ln[0]["pt"] <= 14.0]
                margin_left = min(body_xs) if body_xs else 94.43
                margin_right = (w_px - max(body_x1s)) if body_x1s else 94.19
                # 여백 정규화 가드
                margin_left = max(20.0, min(margin_left, 150.0))
                margin_right = max(20.0, min(margin_right, 150.0))
                content_w = _r(w_px - margin_left - margin_right)
            else:
                margin_left = 94.43
                margin_right = 94.19
                content_w = _r(w_px - margin_left - margin_right)

            # 5. 조항 및 제목 위계 기준 논리적 블록 분할
            article_pattern = re.compile(r"^제\s*\d+\s*조|^부\s*칙|^\[별표|^\d+\.\s|^[①-⑳]")
            block_line_groups: list[dict[str, Any]] = []
            current_group: list[list[dict[str, Any]]] = []
            current_title = "본문 구획"
            current_kind = "text"

            for line_idx, line in enumerate(lines):
                line_text = "".join(s["text"] for s in line).strip()
                line_pt = line[0]["pt"]

                # A. 표제부(문서 제목) 판정
                is_title_line = (
                    line_idx == 0 and line_pt >= 14.0
                ) or (line_idx < 3 and line_pt >= 15.0)

                # B. 조항 시작선 판정
                is_article_start = bool(article_pattern.match(line_text))

                if is_title_line:
                    if current_group:
                        block_line_groups.append(
                            {
                                "title": current_title,
                                "kind": current_kind,
                                "lines": current_group,
                            }
                        )
                        current_group = []
                    block_line_groups.append(
                        {
                            "title": line_text[:30],
                            "kind": "form-title",
                            "lines": [line],
                        }
                    )
                    current_title = "본문 구획"
                    current_kind = "text"
                elif is_article_start:
                    if current_group:
                        block_line_groups.append(
                            {
                                "title": current_title,
                                "kind": current_kind,
                                "lines": current_group,
                            }
                        )
                    current_group = [line]
                    current_title = line_text[:30]
                    current_kind = "text"
                else:
                    current_group.append(line)

            if current_group:
                block_line_groups.append(
                    {
                        "title": current_title,
                        "kind": current_kind,
                        "lines": current_group,
                    }
                )

            # 6. 각 블록을 정규화된 프레임과 Tiptap HTML로 조립
            for b_idx, b_info in enumerate(block_line_groups):
                blk_id = f"p{page_num}_blk_{b_idx + 1}"
                slot_id = f"slot_{blk_id}"
                b_lines = b_info["lines"]
                if not b_lines:
                    continue

                first_line = b_lines[0]
                frame_x = _r(margin_left)
                frame_y = _r(first_line[0]["y"])
                frame_w = _r(content_w)

                html_parts: list[str] = []
                prev_line_bottom = frame_y

                for l_idx, line in enumerate(b_lines):
                    l_pt = line[0]["pt"]
                    l_f = _get_f_factor(line[0]["font"])
                    l_h = _r(l_f * l_pt * PX)
                    l_top = _r(line[0]["y"])
                    top_gap = 0.0 if l_idx == 0 else max(0.0, _r(l_top - prev_line_bottom))

                    # 정렬 판정: 표제부 또는 중앙 배치인 경우
                    is_center = b_info["kind"] == "form-title" or (
                        abs((line[0]["x"] + line[-1]["x1"]) / 2.0 - w_px / 2.0) < 25.0
                        and l_pt >= 12.0
                    )
                    if is_center:
                        align_css = "text-align: center; margin-left: 0; margin-right: 0;"
                    else:
                        margin_left_px = max(0.0, _r(line[0]["x"] - frame_x))
                        align_css = f"text-align: left; margin-left: {margin_left_px}px;"

                    p_style = (
                        f"font-size: {l_pt}pt; "
                        f"line-height: {l_h}px; "
                        f"font-family: 'GulimChe', 'Dotum', sans-serif; "
                        f"margin: 0; "
                        f"margin-top: {top_gap}px; "
                        f"{align_css} "
                        f"white-space: pre; "
                        f"font-kerning: none; "
                        f"font-variant-ligatures: none;"
                    )

                    inner_html = ""
                    prev_s = None
                    for sp in line:
                        font_family = _get_font_family(sp["font"])
                        color = sp.get("color") or "#000000"
                        weight = "bold" if sp.get("bold") else "normal"
                        span_styles = [
                            f"font-size: {sp['pt']}pt",
                            f"font-family: {font_family}",
                            f"color: {color}",
                            f"font-weight: {weight}",
                        ]
                        if prev_s is not None:
                            dx = max(0.0, _r(sp["x"] - prev_s["x1"]))
                            if dx > 0.4:
                                span_styles.append(f"margin-left: {dx}px")

                        escaped_text = html.escape(sp["text"])
                        inner_html += f'<span style="{"; ".join(span_styles)}">{escaped_text}</span>'
                        prev_s = sp

                    html_parts.append(f'<p style="{p_style}">{inner_html}</p>')
                    prev_line_bottom = l_top + l_h

                full_html = "".join(html_parts)
                frame_h = max(24.0, _r(prev_line_bottom - frame_y))

                # 슬롯 등록
                slots[slot_id] = {
                    "slotId": slot_id,
                    "label": b_info["title"],
                    "role": "boilerplate" if b_info["kind"] == "form-title" else "editable-slot",
                    "content": full_html,
                    "constraints": {"locked": b_info["kind"] == "form-title"},
                    "backDataRefs": [],
                }

                # 블록 등록
                page_blocks.append(
                    {
                        "blockId": blk_id,
                        "kind": b_info["kind"],
                        "title": b_info["title"],
                        "slotId": slot_id,
                        "frame": {
                            "x": frame_x,
                            "y": frame_y,
                            "w": frame_w,
                            "h": frame_h,
                        },
                        "locked": False,
                    }
                )

            total_blocks_count += len(page_blocks)

            # 7. VDocPage 구조 조립
            header_slot_id = f"p{page_num}_slot_header"
            footer_slot_id = f"p{page_num}_slot_footer"
            slots[header_slot_id] = {
                "slotId": header_slot_id,
                "label": f"{page_num}페이지 머리글",
                "role": "boilerplate",
                "content": f"<p>{html.escape(doc_title)}</p>",
                "constraints": {"locked": True},
                "backDataRefs": [],
            }
            slots[footer_slot_id] = {
                "slotId": footer_slot_id,
                "label": f"{page_num}페이지 바닥글",
                "role": "boilerplate",
                "content": f"<p>- {page_num} -</p>",
                "constraints": {"locked": True},
                "backDataRefs": [],
            }

            pages.append(
                {
                    "pageId": f"page_{page_num}",
                    "pageNumber": page_num,
                    "pageLabel": f"{doc_title} ({page_num}p)",
                    "hideHeaderFooter": True,
                    "headerSlotId": header_slot_id,
                    "footerSlotId": footer_slot_id,
                    "blocks": page_blocks,
                    "pageRect": {
                        "width": w_px,
                        "height": h_px,
                        "unit": "pt",
                    },
                    "layout": {
                        "margin": {
                            "top": 90,
                            "right": int(margin_right),
                            "bottom": 90,
                            "left": int(margin_left),
                        },
                        "exactText": True,
                    },
                }
            )

        vdoc_doc: dict[str, Any] = {
            "version": "1.0.0",
            "docId": doc_id,
            "title": doc_title,
            "status": "Draft",
            "totalValueText": "Scaffolded .vdoc",
            "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "variables": {},
            "pages": pages,
            "slots": slots,
            "backdata": {},
        }

        return vdoc_doc, total_blocks_count, len(slots)
