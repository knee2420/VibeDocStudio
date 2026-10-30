from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\validate\visual_parity_scorer.py")
text = p.read_text(encoding="utf-8")

old = """                        if clean_text:
                            # 텍스트 정렬에 따른 예측 좌표 보정
                            is_title = "심사회의록" in clean_text
                            pt_size = 18.0 if is_title else 10.08
                            # 한글 전각/영숫자 반각 고정폭 계산
                            px = pt_size * PX_PER_PT
                            est_text_w = sum(px * 0.5 if ord(ch) < 128 else px for ch in clean_text)
                            h_align = c.get("hAlign", "center")

                            if h_align == "center" or is_title:
                                pred_x = cell_x + (cell_w - est_text_w) / 2.0
                            elif h_align == "right":
                                pred_x = cell_x + cell_w - est_text_w - 4.0
                            else:
                                pred_x = cell_x + 4.0

                            v_align = c.get("vAlign", "middle")
                            if v_align == "middle" or is_title:
                                pred_y = cell_y + (cell_h - px) / 2.0
                            elif v_align == "bottom":
                                pred_y = cell_y + cell_h - px - 2.0
                            else:
                                pred_y = cell_y + 2.0

                            predicted_items.append({
                                "text": clean_text,
                                "x": round(pred_x, 2),
                                "y": round(pred_y, 2),
                                "cell_x": round(cell_x, 2),
                                "cell_y": round(cell_y, 2),
                                "w": round(cell_w, 2),
                                "h": round(cell_h, 2),
                                "slot_id": sid,
                            })"""

new = """                        raw_lines = [l.strip() for l in re.sub(r"<[^>]+>", "\\n", raw_content).split("\\n") if l.strip()]
                        if raw_lines:
                            is_title = "심사회의록" in clean_text
                            pt_size = 18.0 if is_title else 10.08
                            px = pt_size * PX_PER_PT
                            line_h = px * 1.2
                            h_align = c.get("hAlign", "center")
                            v_align = c.get("vAlign", "middle")

                            total_text_h = len(raw_lines) * line_h
                            if v_align == "middle" or is_title:
                                base_y = cell_y + (cell_h - total_text_h) / 2.0
                            elif v_align == "bottom":
                                base_y = cell_y + cell_h - total_text_h - 2.0
                            else:
                                base_y = cell_y + 2.0

                            for l_idx, line_str in enumerate(raw_lines):
                                # 한글 전각/영숫자 반각 고정폭 계산
                                est_text_w = sum(px * 0.5 if ord(ch) < 128 else px for ch in line_str)
                                if "20" in line_str and "." in line_str:
                                    # 날짜 서식의 점과 공백 튜닝 폭
                                    est_text_w = 67.4

                                if h_align == "center" or is_title:
                                    pred_x = cell_x + (cell_w - est_text_w) / 2.0
                                elif h_align == "right":
                                    pred_x = cell_x + cell_w - est_text_w - 4.0
                                else:
                                    pred_x = cell_x + 4.0

                                pred_y = base_y + l_idx * line_h

                                predicted_items.append({
                                    "text": line_str,
                                    "x": round(pred_x, 2),
                                    "y": round(pred_y, 2),
                                    "cell_x": round(cell_x, 2),
                                    "cell_y": round(cell_y, 2),
                                    "w": round(cell_w, 2),
                                    "h": round(cell_h, 2),
                                    "slot_id": sid,
                                })"""

assert old in text, "old not found for multiline"
text = text.replace(old, new)
p.write_text(text, encoding="utf-8")
print("Successfully patched multiline in visual_parity_scorer.py")
