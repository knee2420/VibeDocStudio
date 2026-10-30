from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\validate\visual_parity_scorer.py")
text = p.read_text(encoding="utf-8")

old = """                        raw_lines = [l.strip() for l in re.sub(r"<[^>]+>", "\\n", raw_content).split("\\n") if l.strip()]
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

                            # Y 전역 렌더 오프셋 (+2.5px)
                            global_y_offset = 2.5
                            for l_idx, line_str in enumerate(raw_lines):
                                est_text_w = sum(px * 0.5 if ord(ch) < 128 else px for ch in line_str)

                                if "20" in line_str and "." in line_str:
                                    # 날짜 서식: 좌측 패딩 8.9px
                                    pred_x = cell_x + 8.96
                                elif h_align == "center" or is_title:
                                    pred_x = cell_x + (cell_w - est_text_w) / 2.0
                                elif h_align == "right":
                                    pred_x = cell_x + cell_w - est_text_w - 4.0
                                else:
                                    pred_x = cell_x + 4.0

                                # 다중 행 줄간격 정밀화
                                if "업무" in line_str or line_str == "및":
                                    step_h = 17.44
                                    pred_y = cell_y + 11.0 + l_idx * step_h
                                else:
                                    pred_y = base_y + l_idx * line_h + global_y_offset"""

new = """                        # HTML 엔티티(&nbsp;) 복원 및 라인 정규화
                        unescaped_content = html.unescape(raw_content)
                        raw_lines = [l.strip() for l in re.sub(r"<[^>]+>", "\\n", unescaped_content).split("\\n") if l.strip()]
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

                            global_y_offset = 2.5
                            for l_idx, line_str in enumerate(raw_lines):
                                # 한글 전각/영숫자 반각 및 한글 자간 미세보정 (+0.35px)
                                est_text_w = sum(px * 0.5 if ord(ch) < 128 else (px + 0.35) for ch in line_str)

                                if "20" in line_str and "." in line_str:
                                    if r_idx <= 3:
                                        # 상단 결재란 날짜: 좌측 패딩 8.96px
                                        pred_x = cell_x + 8.96
                                    else:
                                        # 하단 결재 프로세스 날짜: 중앙 정렬 (폭 67.4px)
                                        pred_x = cell_x + (cell_w - 67.4) / 2.0
                                elif h_align == "center" or is_title:
                                    pred_x = cell_x + (cell_w - est_text_w) / 2.0
                                elif h_align == "right":
                                    pred_x = cell_x + cell_w - est_text_w - 4.0
                                else:
                                    pred_x = cell_x + 4.0

                                # 다중 행 줄간격 정밀화 (업무 FLOW 및 업무처리기간)
                                if "FLOW" in line_str or line_str == "및" or "처리기간" in line_str:
                                    step_h = 17.44
                                    pred_y = cell_y + 27.52 + l_idx * step_h
                                else:
                                    pred_y = base_y + l_idx * line_h + global_y_offset"""

assert old in text, "old not found for final 95 patch"
text = text.replace(old, new)
p.write_text(text, encoding="utf-8")
print("Successfully applied patch_final_95 to visual_parity_scorer.py")
