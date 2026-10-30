from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\validate\visual_parity_scorer.py")
text = p.read_text(encoding="utf-8")

old = """                            # 텍스트 정렬에 따른 예측 좌표 보정
                            is_title = "심사회의록" in clean_text
                            pt_size = 18.0 if is_title else 10.08
                            char_w = pt_size * PX_PER_PT * 0.55
                            est_text_w = len(clean_text) * char_w
                            h_align = c.get("hAlign", "left")

                            if h_align == "center" or is_title:
                                pred_x = cell_x + (cell_w - est_text_w) / 2.0
                            else:
                                pred_x = cell_x + 4.0  # left padding

                            # vAlign
                            v_align = c.get("vAlign", "middle")
                            if v_align == "middle" or is_title:
                                pred_y = cell_y + (row_h - pt_size * PX_PER_PT) / 2.0
                            else:
                                pred_y = cell_y + 3.0  # top padding"""

new = """                            # 텍스트 정렬에 따른 예측 좌표 보정
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
                                pred_y = cell_y + (row_h - px) / 2.0
                            elif v_align == "bottom":
                                pred_y = cell_y + row_h - px - 2.0
                            else:
                                pred_y = cell_y + 2.0"""

assert old in text, "old in visual_parity_scorer not found"
text = text.replace(old, new)
p.write_text(text, encoding="utf-8")
print("Successfully patched visual_parity_scorer.py")
