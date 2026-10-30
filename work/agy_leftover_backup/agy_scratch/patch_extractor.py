from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\measure\vector_grid_extractor.py")
text = p.read_text(encoding="utf-8")

old = """                is_header = bool(
                    (joined_text and len(joined_text) <= 15 and ("\\n" not in joined_text) and not any(ch.isdigit() for ch in joined_text))
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
                )"""

new = """                # 셀 내 텍스트의 실제 좌우/상하 여백 분석을 통한 결정론적 정렬 판정
                h_align = "center"
                v_align = "middle"
                if matched_atoms:
                    min_atom_x = min(a.x0 for a in matched_atoms)
                    max_atom_x = max(a.x1 for a in matched_atoms)
                    min_atom_y = min(a.y0 for a in matched_atoms)
                    max_atom_y = max(a.y1 for a in matched_atoms)

                    left_pad = min_atom_x - x_left
                    right_pad = x_right - max_atom_x
                    top_pad = min_atom_y - y_top
                    bottom_pad = cell_y_bottom - max_atom_y

                    if abs(left_pad - right_pad) <= 12.0:
                        h_align = "center"
                    elif left_pad < right_pad and (right_pad - left_pad) > 15.0:
                        h_align = "left"
                    elif right_pad < left_pad and (left_pad - right_pad) > 15.0:
                        h_align = "right"

                    if abs(top_pad - bottom_pad) <= 10.0:
                        v_align = "middle"
                    elif top_pad < bottom_pad and (bottom_pad - top_pad) > 12.0:
                        v_align = "top"
                    else:
                        v_align = "middle"

                is_header = bool(
                    (joined_text and len(joined_text) <= 15 and ("\\n" not in joined_text) and not any(ch.isdigit() for ch in joined_text))
                    or ("(인)" in joined_text or "(서명)" in joined_text)
                    or ("회의록" in joined_text or "회의" in joined_text or "공사명" in joined_text or "도면명" in joined_text or "제목" in joined_text or "내용" in joined_text or "분류" in joined_text or "일자" in joined_text or "번호" in joined_text or "작성자" in joined_text)
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
                        h_align=h_align,
                        v_align=v_align,
                    )
                )"""

assert old in text, "old not found"
text = text.replace(old, new)
p.write_text(text, encoding="utf-8")
print("Successfully patched vector_grid_extractor.py")
