from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\assemble\vdoc_assembler.py")
text = p.read_text(encoding="utf-8")

old_code = """            cell_dict: dict[str, Any] = {
                "cellId": f"cell_{slot_id}",
                "slotId": slot_id,
                "isHeader": is_locked,
                "vAlign": "middle" if is_locked else "top",
                "hAlign": "center" if is_locked else "left",
                "compact": True,
                "padding": "1.5px 4px",
                "fontSize": "13.44px",
                "lineHeight": "1.2",
                "fontFamily": "GulimChe, 굴림체, monospace",
            }"""

new_code = """            is_title = "심사회의록" in (cell.text or "")
            cell_dict: dict[str, Any] = {
                "cellId": f"cell_{slot_id}",
                "slotId": slot_id,
                "isHeader": is_locked,
                "vAlign": "middle" if (is_locked or is_title) else "top",
                "hAlign": "center" if (is_locked or is_title) else "left",
                "compact": True,
                "padding": "1.5px 4px",
                "fontSize": "24px" if is_title else "13.44px",
                "fontWeight": "bold" if is_title else "normal",
                "lineHeight": "1.2",
                "fontFamily": "GulimChe, 굴림체, monospace",
            }"""

if old_code in text:
    text = text.replace(old_code, new_code)
    print("Replaced cell_dict")
else:
    print("Warning: old_code not found")

old_page = """        pages.append(
            {
                "pageId": f"page_{pnum}",
                "pageNumber": pnum,
                "pageLabel": f"{title} ({pnum}p)",
                "hideHeaderFooter": True,
                "headerSlotId": header_slot_id,
                "footerSlotId": footer_slot_id,
                "blocks": blocks,
            }
        )"""

new_page = """        pages.append(
            {
                "pageId": f"page_{pnum}",
                "pageNumber": pnum,
                "pageLabel": f"{title} ({pnum}p)",
                "hideHeaderFooter": True,
                "headerSlotId": header_slot_id,
                "footerSlotId": footer_slot_id,
                "layout": {
                    "margin": {
                        "top": 111.4,
                        "right": 96.4,
                        "bottom": 83.0,
                        "left": 96.3,
                    },
                    "blockGap": 8.0,
                    "fontFamily": "GulimChe, 굴림체, monospace",
                    "fontSize": "13.44px",
                    "lineHeight": "1.2",
                    "exactText": True,
                },
                "blocks": blocks,
            }
        )"""

if old_page in text:
    text = text.replace(old_page, new_page)
    print("Replaced pages.append")
else:
    print("Warning: old_page not found")

p.write_text(text, encoding="utf-8")
print("Done writing vdoc_assembler.py")

