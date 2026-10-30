"""Rebuild catalog page mm_page_3 (Atticus invoice) from the original PDF geometry.

[예시] external_pm_08 의 생성기(어댑터) 예시입니다. 2026-10-29 Atticus 청구서를 33/33 글자 ±1px 로 맞춘 그대로입니다.
  python atticus_vdoc_adapter.py <truth.json> [atticus_tune.json]
  - <truth.json>       01_extract_pdf_truth.py 출력 (spans[].tokens 를 자간으로 씀)
  - atticus_tune.json  02 --calibrate 로 잰 크기별 줄 상자 오프셋 {"offsets": {"9.6": -1, "8.0": -1}}
  - DOC 의 mm_page_3 을 덮어씁니다. 다른 문서에 쓰려면 블록 구성(company · billing · 표 · 바닥글)을 그 문서에 맞게 바꿉니다.
  - 아래 좌표 숫자는 truth.json 의 spans 에서 옮긴 값입니다. 손으로 짐작한 값이 아닙니다.

All coordinates are CSS px at 96 dpi on the 794 x 1123 sheet. Paragraph line-height is set to the
DejaVu Sans content height (ascent + descent = 1.1641 em) so a text line's box top equals the
PDF span's bbox top; margins between paragraphs come straight from the PDF y positions.
"""
import json, sys

DOC = r"C:/AI_Projects/WebNovelAssistant/VibeDocStudio/catalog/vibe-architecture-minutes/document.json"
FH = (1901 + 483) / 2048  # DejaVu Sans content-height factor
PX = 96 / 72

if len(sys.argv) < 2:
    sys.exit("usage: python atticus_vdoc_adapter.py <truth.json> [atticus_tune.json]")

# Tuning offsets found by measuring the rendered page (filled in by the fit loop).
T = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
def t(k, default=0.0): return T.get(k, default)

def r(v): return round(v, 3)

RUNS = [s for s in json.load(open(sys.argv[1], encoding="utf-8"))["spans"] if "tokens" in s]
# Text-box offset Chrome applies per font size (rect top - line top), measured; keyed by pt.
O = {float(k): v for k, v in T.get("offsets", {}).items()}
def off(size_pt): return O.get(size_pt, 0.0)

def tokens_for(text, near_y):
    cands = [rn for rn in RUNS if rn["text"] == text.strip()]
    if not cands: return [{"t": text, "ls": 0}]
    rn = min(cands, key=lambda rn: abs(rn["y"] - near_y))
    toks = rn["tokens"]
    if text.endswith(" ") and not toks[-1]["t"].isspace(): toks = toks + [{"t": " ", "ls": 0}]
    return toks

def para(runs, top_gap, size_pt, align=None, extra="", near_y=0.0):
    """runs: list of (text, {color, bold, link, underline}). top_gap: px above this line's box.
    Each word and space becomes its own span with the letter-spacing that puts it where the PDF did."""
    fpx = size_pt * PX
    # The paragraph's own font-size matches its text so the line strut adds no extra height.
    style = [f"font-size: {size_pt}pt", f"line-height: {r(FH * fpx)}px", "margin: 0", f"margin-top: {r(top_gap)}px"]
    if align: style.insert(0, f"text-align: {align}")
    if extra: style.append(extra)
    inner = ""
    for text, o in runs:
        color = o.get("color", "#383838")
        run_html = ""
        for tk in tokens_for(text, near_y):
            body = f"<strong>{tk['t']}</strong>" if o.get("bold") else tk["t"]
            ls = f"; letter-spacing: {tk['ls']}px" if abs(tk["ls"]) > 0.0005 else ""
            run_html += f'<span style="font-size: {size_pt}pt; color: {color}{ls}">{body}</span>'
        if o.get("link"): run_html = f'<a href="{o["link"]}">{run_html}</a>'
        if o.get("underline"): run_html = f"<u>{run_html}</u>"
        inner += run_html
    return f'<p style="{"; ".join(style)}">{inner}</p>', fpx * FH

def stack(lines, first_top, align=None):
    """lines: list of (text_top_px, size_pt, runs, extra). The frame sits at the first line box top."""
    html, y = "", first_top - off(lines[0][1])
    for i, (top, size, runs, extra) in enumerate(lines):
        box_top = top - off(size)
        gap = 0 if i == 0 else box_top - y
        p, h = para(runs, gap, size, align, extra, near_y=top)
        html += p
        y = box_top + h
    return html

def frame_y(text_top, size_pt): return r(text_top - off(size_pt))

C, B = "#383838", "#336699"

company = stack([
    (39.5, 7.8, [("August 25th 2026", {})], "margin-right: 3.9px"),
    (62.9, 9.6, [("Company info", {"color": B})], ""),
    (83.7, 9.6, [("Atticus LLC", {"bold": True})], ""),
    (99.7, 9.6, [("1309 Coffeen Ave. Ste. 2513", {})], ""),
    (115.7, 9.6, [("Sheridan", {})], ""),
    (131.7, 9.6, [("Wyoming, 82801", {})], ""),
    (147.7, 9.6, [("United States", {})], ""),
    (167.5, 6.6, [("Sales tax ID: VAT - EU372031974 UK - GB383499055", {})], ""),
    (196.6, 9.6, [("Invoice 000081709", {})], ""),
], 39.5, "right")

billing = stack([
    (243.0, 9.6, [("Billing info", {"color": B})], ""),
    (263.8, 9.6, [("qround", {})], ""),
    (279.8, 9.6, [("SEO MINGYU", {})], ""),
    (295.8, 9.6, [("seoul, 40-6", {})], ""),
    (311.8, 9.6, [("South Korea", {})], ""),
], 243.0)

total = stack([
    (243.0, 9.6, [("Total (USD)", {"color": B})], ""),
    (258.9, 16.8, [("$147.00", {})], ""),
    (289.2, 7.8, [("Paid via credit card", {})], ""),
], 243.0, "right")

footer = stack([
    (778.2, 8.4, [("Contact support: ", {"color": "#8c8c8c"}), ("support@atticus.io", {"color": "#2774a8", "link": "mailto:support@atticus.io"})], ""),
    (800.4, 6.6, [("Click here to manage your billing details and view purchase history", {"color": "#2774a8", "underline": True})], "color: #2774a8"),
    (837.3, 6.6, [("Your order was processed by ThriveCart. Copyright © 2026. All rights reserved.", {"color": "#999999"})], ""),
], 778.2, "center")

pageno = stack([(1085.1, 8.0, [("Page 1 of 1", {"color": "#000000"})], "")], 1085.1, "center")

def cell_html(size_pt, text, color=C, align=None, top_gap=0, near_y=0.0):
    return para([(text, {"color": color})], top_gap, size_pt, align, near_y=near_y)[0]

# Items table: x 80.4..712.6, header rule 2.4px #336699 at 377.3, item rule 0.8px #eee at 469.3.
item_html = cell_html(9.6, "Atticus", near_y=424.6) + para([("One-time payment ($147.00)", {})], (442.7 - off(6.6)) - (424.6 - off(9.6) + 9.6 * PX * FH), 6.6, near_y=442.7)[0]
hdr_pt = (389.4 - off(9.6)) - (377.3 + 2.4) + t("hdr_pt")
item_pt = (424.6 - off(9.6)) - (389.4 - off(9.6) + 9.6 * PX * FH) + t("item_pt")
item_pb = 469.3 - (442.7 - off(6.6) + 6.6 * PX * FH) + t("item_pb")
cols = [443.3, 94.5, 94.4]
pct = [f"{r(c / sum(cols) * 100)}%" for c in cols]
items_block = {
    "blockId": "att_blk_items_table", "kind": "structured-table", "title": "품목 명세서 (Invoice Line Items)",
    "frame": {"x": 80.4, "y": r(377.3 + t("items_y")), "w": 632.2},
    "columnWidths": pct,
    "borderRules": {"outer": "none", "rowBottom": "none", "vertical": "none", "headerBottom": "none"},
    "headerStyle": {"bg": "transparent", "fontWeight": "400"},
    "rows": [
        {"rowId": "att_row_head", "cells": [
            {"cellId": "att_c_th_1", "slotId": "att_slot_th_desc", "isHeader": True, "hAlign": "left", "padding": f"{r(hdr_pt)}px 0 0 4px", "borderTop": "2.4px solid #336699", "backgroundColor": "transparent"},
            {"cellId": "att_c_th_2", "slotId": "att_slot_th_amount", "isHeader": True, "hAlign": "right", "padding": f"{r(hdr_pt)}px 3.8px 0 0", "borderTop": "2.4px solid #336699", "backgroundColor": "transparent"},
            {"cellId": "att_c_th_3", "slotId": "att_slot_th_total", "isHeader": True, "hAlign": "right", "padding": f"{r(hdr_pt)}px 2.9px 0 0", "borderTop": "2.4px solid #336699", "backgroundColor": "transparent"},
        ]},
        {"rowId": "att_row_item1", "cells": [
            {"cellId": "att_c_td_1", "slotId": "att_slot_td_item1", "hAlign": "left", "padding": f"{r(item_pt)}px 0 {r(item_pb)}px 4px", "borderBottom": "0.8px solid #eeeeee"},
            {"cellId": "att_c_td_2", "slotId": "att_slot_td_amount1", "hAlign": "right", "padding": f"{r(item_pt)}px 3.9px 0 0", "borderBottom": "0.8px solid #eeeeee"},
            {"cellId": "att_c_td_3", "slotId": "att_slot_td_total1", "hAlign": "right", "padding": f"{r(item_pt)}px 3.9px 0 0", "borderBottom": "0.8px solid #eeeeee"},
        ]},
    ],
}

# Summary: x 523.7..716.6, label right edge 620.3, value right edge 708.5, 0.8px #eee rules.
sum_pt = (478.1 - off(8.4)) - 470.1 + t("sum_pt")
sum_pb = 500.5 - (478.1 - off(8.4) + 8.4 * PX * FH) + t("sum_pb")
summary_block = {
    "blockId": "att_blk_summary", "kind": "structured-table", "title": "합계 (Subtotal / Total)",
    "frame": {"x": 523.7, "y": r(470.1 + t("sum_y")), "w": 192.9},
    "columnWidths": [f"{r(96.6 / 192.9 * 100)}%", f"{r(96.3 / 192.9 * 100)}%"],
    "borderRules": {"outer": "none", "rowBottom": "none", "vertical": "none"},
    "rows": [
        {"rowId": "att_row_sub", "cells": [
            {"cellId": "att_c_sub_l", "slotId": "att_slot_td_label_sub", "hAlign": "right", "padding": f"{r(sum_pt)}px 0 {r(sum_pb)}px 0", "borderBottom": "0.8px solid #eeeeee"},
            {"cellId": "att_c_sub_v", "slotId": "att_slot_td_val_sub", "hAlign": "right", "padding": f"{r(sum_pt)}px 8.1px {r(sum_pb)}px 0", "borderBottom": "0.8px solid #eeeeee"},
        ]},
        {"rowId": "att_row_tot", "cells": [
            {"cellId": "att_c_tot_l", "slotId": "att_slot_td_label_tot", "hAlign": "right", "padding": f"{r(sum_pt)}px 0 {r(sum_pb)}px 0", "borderBottom": "0.8px solid #eeeeee"},
            {"cellId": "att_c_tot_v", "slotId": "att_slot_td_val_tot", "hAlign": "right", "padding": f"{r(sum_pt)}px 8.1px {r(sum_pb)}px 0", "borderBottom": "0.8px solid #eeeeee"},
        ]},
    ],
}

doc = json.load(open(DOC, encoding="utf-8"))
page = next(p for p in doc["pages"] if p["pageId"] == "mm_page_3")
S = doc["slots"]
def slot(sid, label, html, locked=True, role="editable-slot"):
    prev = S.get(sid, {})
    S[sid] = {"slotId": sid, "label": label, "role": prev.get("role", role), "content": html,
              "backDataRefs": prev.get("backDataRefs", []), "constraints": {"locked": locked} if locked else {}}

slot("att_slot_company_info", "공급자 정보", company)
slot("att_slot_billing_info", "청구 정보", billing, locked=False)
slot("att_slot_total_summary", "결제 총액", total, locked=False)
slot("att_slot_th_desc", "품목 헤더", cell_html(9.6, "Description", B, near_y=389.4))
slot("att_slot_th_amount", "금액 헤더", cell_html(9.6, "Amount", B, "right", near_y=389.4))
slot("att_slot_th_total", "합계 헤더", cell_html(9.6, "Total", B, "right", near_y=389.4))
slot("att_slot_td_item1", "품목 1", item_html, locked=False)
slot("att_slot_td_amount1", "품목 1 금액", cell_html(9.6, "$147.00", C, "right", near_y=424.6), locked=False)
slot("att_slot_td_total1", "품목 1 합계", cell_html(9.6, "$147.00", C, "right", near_y=424.6), locked=False)
slot("att_slot_td_label_sub", "소계 라벨", cell_html(8.4, "Subtotal:", C, "right", near_y=478.1))
slot("att_slot_td_val_sub", "소계", cell_html(8.4, "$147.00", C, "right", near_y=478.1), locked=False)
slot("att_slot_td_label_tot", "총계 라벨", cell_html(8.4, "Total:", C, "right", near_y=509.3))
slot("att_slot_td_val_tot", "총계", cell_html(8.4, "$147.00", C, "right", near_y=509.3), locked=False)
slot("att_slot_footer_meta", "하단 안내", footer)
slot("att_slot_pageno", "쪽 번호", pageno)

page["layout"] = {"exactText": True, "fontFamily": '"DejaVu Sans", sans-serif', "color": C, "fontSize": "9.6pt", "margin": {"top": 39.5, "right": 81.3, "bottom": 37.6, "left": 80.4}}
page["hideHeaderFooter"] = True
page["blocks"] = [
    {"blockId": "att_blk_logo", "kind": "image", "title": "로고", "src": "/atticus_logo.png", "alt": "Atticus",
     "width": "344.1px", "height": "79.2px", "objectFit": "fill", "align": "left", "frame": {"x": 80.4, "y": 93.2, "w": 344.1, "h": 79.2}},
    {"blockId": "att_blk_company", "kind": "text", "title": "공급자 정보", "slotId": "att_slot_company_info", "align": "right",
     "frame": {"x": r(712.7 - 320 + t("company_x")), "y": frame_y(39.5, 7.8), "w": 320}},
    {"blockId": "att_blk_billing", "kind": "text", "title": "청구 정보", "slotId": "att_slot_billing_info",
     "frame": {"x": r(80.4 + t("left_x")), "y": frame_y(243.0, 9.6), "w": 300}},
    {"blockId": "att_blk_total", "kind": "text", "title": "결제 총액", "slotId": "att_slot_total_summary", "align": "right",
     "frame": {"x": r(712.8 - 320 + t("company_x")), "y": frame_y(243.0, 9.6), "w": 320}},
    items_block,
    summary_block,
    {"blockId": "att_blk_footer", "kind": "text", "title": "하단 안내", "slotId": "att_slot_footer_meta", "align": "center",
     "frame": {"x": r(0 + t("center_x")), "y": frame_y(778.2, 8.4), "w": 793.3}},
    {"blockId": "att_blk_pageno", "kind": "text", "title": "쪽 번호", "slotId": "att_slot_pageno", "align": "center",
     "frame": {"x": r(0 + t("center_x")), "y": frame_y(1085.1, 8.0), "w": 793.3}},
]
json.dump(doc, open(DOC, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("written", len(page["blocks"]), "blocks")
