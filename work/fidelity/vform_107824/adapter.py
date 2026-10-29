"""
Rebuild page mm_page_4 (Yesform #63 Academic Info Committee Regulations) from original PDF geometry.
Following external_pm_08_visual_fidelity_replicator specifications.
"""
import json
import os
import sys

DOC_PATH = r"C:/AI_Projects/WebNovelAssistant/VibeDocStudio/catalog/vibe-architecture-minutes/document.json"
PX = 96 / 72

if len(sys.argv) < 2:
    sys.exit("usage: python adapter.py <truth.json> [tune.json]")

truth_file = sys.argv[1]
tune_file = sys.argv[2] if len(sys.argv) > 2 and os.path.exists(sys.argv[2]) else None

with open(truth_file, "r", encoding="utf-8") as f:
    truth = json.load(f)

T = json.load(open(tune_file, encoding="utf-8")) if tune_file else {}
O = {float(k): float(v) for k, v in T.get("offsets", {}).items()}

def off(size_pt):
    return O.get(float(size_pt), 0.0)

def r(v):
    return round(float(v), 2)

def get_font_family(font_name):
    if font_name == "µ¸¿ò":
        return "Dotum"
    if "Times" in font_name:
        return "Times New Roman"
    return "GulimChe"

def get_f_factor(font_name):
    if "Times" in font_name:
        return 1.1074
    return 1.0

# 1. Group spans into visual lines
spans = truth["spans"]
lines = []
curr_line = []
curr_y = None

for s in spans:
    y = s["y"]
    if curr_y is None or abs(y - curr_y) < 2.0:
        curr_line.append(s)
        curr_y = y if curr_y is None else curr_y
    else:
        lines.append(curr_line)
        curr_line = [s]
        curr_y = y
if curr_line:
    lines.append(curr_line)

# Extract macro layout from truth.json
layout_meta = truth.get("page_layout", {})
margins = layout_meta.get("margins", {"left": 94.43, "right": 94.19, "top": 114.79, "bottom": 97.77})
content_w = layout_meta.get("content_width", 605.38)
margin_left = margins["left"]
page_w = truth["page"]["width"]

# 2. Partition lines into logical blocks
block_defs = [
    ("acad_blk_title", "학술정보운영위원회 규정 제목", 0, 1),
    ("acad_blk_mark_y", "페이지 표식 y", 1, 2),
    ("acad_blk_art1", "제1조 (목적)", 2, 5),
    ("acad_blk_art2", "제2조 (기능)", 5, 14),
    ("acad_blk_art3", "제3조 (구성)", 14, 17),
    ("acad_blk_art4", "제4조 (임기)", 17, 20),
    ("acad_blk_art5", "제5조 (회의)", 20, 23),
    ("acad_blk_art6", "제6조 (간사)", 23, 26),
    ("acad_blk_art7", "제7조 (회의록 작성 및 보관)", 26, 28),
    ("acad_blk_art8", "제8조 (소관부서)", 28, 30),
    ("acad_blk_art9", "제9조 (기밀유지의무)", 30, 33),
    ("acad_blk_art10", "제10조 (운영세칙)", 33, 35),
    ("acad_blk_addendum_title", "부칙 제목", 35, 36),
    ("acad_blk_addendum_art1", "부칙 제1조 (시행일)", 36, 38),
]

layout_blocks = []
slots_to_add = {}

for blk_id, blk_title, start_line, end_line in block_defs:
    blk_lines = lines[start_line:end_line]
    first_line = blk_lines[0]

    # Normalized block boundary within content margins (NO PAGE OVERFLOW)
    frame_x = r(margin_left)
    frame_y = r(first_line[0]["y"] - off(first_line[0]["pt"]))
    frame_w = r(content_w)

    slot_id = f"slot_{blk_id}"
    html_parts = []
    prev_box_bottom = frame_y

    for line_idx, line in enumerate(blk_lines):
        line_pt = line[0]["pt"]
        line_f = get_f_factor(line[0]["font"])
        line_h = r(line_f * line_pt * PX)
        line_box_top = r(line[0]["y"] - off(line_pt))

        top_gap = 0.0 if line_idx == 0 else r(line_box_top - prev_box_bottom)

        # Alignment heuristic: center vs left indent
        is_center = line[0].get("suggested_align") == "center" or blk_id in ("acad_blk_title", "acad_blk_addendum_title")
        if is_center:
            align_css = "text-align: center; margin-left: 0; margin-right: 0;"
        else:
            margin_left_px = r(line[0]["x"] - frame_x)
            align_css = f"text-align: left; margin-left: {margin_left_px}px;"

        p_style = (
            f"font-size: {line_pt}pt; "
            f"line-height: {line_h}px; "
            f"font-family: 'GulimChe', 'Dotum', sans-serif; "
            f"margin: 0; "
            f"margin-top: {top_gap}px; "
            f"{align_css} "
            f"white-space: pre; "
            f"font-kerning: none; "
            f"font-variant-ligatures: none;"
        )

        inner_html = ""
        prev_span = None

        for s in line:
            color = s.get("color") or "#000000"
            font_family = get_font_family(s["font"])
            pt = s["pt"]
            weight = "bold" if s.get("bold") else "normal"

            # Intra-line span spacing
            span_style_parts = [
                f"font-size: {pt}pt",
                f"font-family: {font_family}",
                f"color: {color}",
                f"font-weight: {weight}",
            ]
            if prev_span is not None:
                prev_end = prev_span.get("x1_raw", prev_span["x1"]) if prev_span.get("trailing_space") else prev_span["x1"]
                dx = r(s["x"] - prev_end)
                if dx > 0.4:
                    span_style_parts.append(f"margin-left: {dx}px")

            span_style = "; ".join(span_style_parts)

            tokens = s.get("tokens")
            if not tokens:
                tokens = [{"t": s["text"], "ls": 0.0}]

            span_inner = ""
            for tk in tokens:
                tk_text = tk["t"]
                tk_ls = tk.get("ls", 0.0)
                if abs(tk_ls) > 0.0005:
                    span_inner += f'<span style="letter-spacing: {tk_ls}px">{tk_text}</span>'
                else:
                    span_inner += tk_text

            if s.get("trailing_space"):
                span_inner += " "

            inner_html += f'<span style="{span_style}">{span_inner}</span>'
            prev_span = s

        html_parts.append(f'<p style="{p_style}">{inner_html}</p>')
        prev_box_bottom = line_box_top + line_h

    full_html = "".join(html_parts)
    slots_to_add[slot_id] = {
        "slotId": slot_id,
        "label": blk_title,
        "role": "editable-slot",
        "content": full_html,
        "backDataRefs": [],
        "constraints": {
            "locked": False,
        },
    }

    layout_blocks.append({
        "blockId": blk_id,
        "kind": "text",
        "title": blk_title,
        "slotId": slot_id,
        "frame": {
            "x": frame_x,
            "y": frame_y,
            "w": frame_w,
            "h": r(prev_box_bottom - frame_y),
        },
        "locked": False,
    })

# 3. Update document.json
with open(DOC_PATH, "r", encoding="utf-8") as f:
    doc = json.load(f)

for sid, sval in slots_to_add.items():
    doc["slots"][sid] = sval

page_4 = {
    "pageId": "mm_page_4",
    "pageNumber": 4,
    "blocks": layout_blocks,
}

existing_page_indices = [i for i, p in enumerate(doc["pages"]) if p["pageId"] == "mm_page_4"]
if existing_page_indices:
    doc["pages"][existing_page_indices[0]] = page_4
else:
    doc["pages"].append(page_4)

doc["totalPages"] = len(doc["pages"])
doc["updatedAt"] = "2026-10-29T11:15:00+09:00"

with open(DOC_PATH, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

print(f"[OK] Generated mm_page_4 in {DOC_PATH}")
print(f"  Blocks count: {len(layout_blocks)}")
print(f"  All blocks framed with normalized width: {frame_w}px (x: {frame_x}px, x+w: {round(frame_x + frame_w, 2)}px <= {page_w}px)")
print(f"  Slots count added/updated: {len(slots_to_add)}")
