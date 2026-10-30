from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\assemble\vdoc_assembler.py")
text = p.read_text(encoding="utf-8")

old = """            is_title = "심사회의록" in (cell.text or "")
            cell_dict: dict[str, Any] = {
                "cellId": f"cell_{slot_id}",
                "slotId": slot_id,
                "isHeader": is_locked,
                "vAlign": "middle" if (is_locked or is_title) else "top",
                "hAlign": "center" if (is_locked or is_title) else "left",
                "compact": True,
                "padding": "3px 6px",
                "fontSize": "24px" if is_title else "13.44px",
                "fontWeight": "bold" if is_title else "normal",
                "lineHeight": "1.2",
                "fontFamily": "GulimChe, 굴림체, monospace",
            }"""

new = """            is_title = "심사회의록" in (cell.text or "")
            h_align = "center" if is_title else getattr(cell, "h_align", "center")
            v_align = "middle" if is_title else getattr(cell, "v_align", "middle")
            cell_dict: dict[str, Any] = {
                "cellId": f"cell_{slot_id}",
                "slotId": slot_id,
                "isHeader": is_locked,
                "vAlign": v_align,
                "hAlign": h_align,
                "compact": True,
                "padding": "1px 2px",
                "fontSize": "24px" if is_title else "13.44px",
                "fontWeight": "bold" if is_title else "normal",
                "lineHeight": "1.2",
                "fontFamily": "GulimChe, 굴림체, monospace",
            }"""

assert old in text, "old in vdoc_assembler not found"
text = text.replace(old, new)
p.write_text(text, encoding="utf-8")
print("Successfully patched vdoc_assembler.py")
