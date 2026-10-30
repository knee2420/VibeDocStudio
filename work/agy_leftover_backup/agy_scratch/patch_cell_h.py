from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\validate\visual_parity_scorer.py")
text = p.read_text(encoding="utf-8")

old = """                    for c in r.get("cells", []):
                        # 현재 행에서 이전 행의 rowSpan 에 의해 이미 점유된 열은 건너뜀
                        while col_idx in occupied_in_this_row:
                            col_idx += 1

                        c_span = int(c.get("colSpan", 1))
                        r_span = int(c.get("rowSpan", 1))

                        if r_span > 1:
                            for delta_r in range(1, r_span):
                                target_r = r_idx + delta_r
                                if target_r not in occupied_cols_by_row:
                                    occupied_cols_by_row[target_r] = []
                                for span_i in range(c_span):
                                    occupied_cols_by_row[target_r].append(col_idx + span_i)

                        cell_w = sum(col_widths[col_idx : col_idx + c_span])
                        cell_x = margin_left + sum(col_widths[:col_idx])
                        cell_y = curr_y"""

new = """                    # 행 높이 리스트 사전 계산
                    all_rows = sec.get("rows", [])
                    all_row_heights = [float(str(rw.get("height", "24px")).replace("px", "")) for rw in all_rows]

                    for c in r.get("cells", []):
                        while col_idx in occupied_in_this_row:
                            col_idx += 1

                        c_span = int(c.get("colSpan", 1))
                        r_span = int(c.get("rowSpan", 1))

                        if r_span > 1:
                            for delta_r in range(1, r_span):
                                target_r = r_idx + delta_r
                                if target_r not in occupied_cols_by_row:
                                    occupied_cols_by_row[target_r] = []
                                for span_i in range(c_span):
                                    occupied_cols_by_row[target_r].append(col_idx + span_i)

                        cell_w = sum(col_widths[col_idx : col_idx + c_span])
                        cell_h = sum(all_row_heights[r_idx : r_idx + r_span]) if r_span > 1 else row_h
                        cell_x = margin_left + sum(col_widths[:col_idx])
                        cell_y = curr_y"""

assert old in text, "old not found in scorer for cell_h"
text = text.replace(old, new)

# v_align 계산에서 row_h 대신 cell_h 사용
text = text.replace("pred_y = cell_y + (row_h - px) / 2.0", "pred_y = cell_y + (cell_h - px) / 2.0")
text = text.replace("pred_y = cell_y + row_h - px - 2.0", "pred_y = cell_y + cell_h - px - 2.0")
text = text.replace('"h": round(row_h, 2),', '"h": round(cell_h, 2),')

p.write_text(text, encoding="utf-8")
print("Successfully patched cell_h in visual_parity_scorer.py")
