from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\measure\vector_grid_extractor.py")
text = p.read_text(encoding="utf-8")

old_code = """        xs = cluster_coordinates(
            [c[0] for c in cells_bboxes] + [c[2] for c in cells_bboxes],
            tolerance_pt=1.8,
        )
        ys = cluster_coordinates(
            [c[1] for c in cells_bboxes] + [c[3] for c in cells_bboxes],
            tolerance_pt=1.8,
        )
        if len(xs) < 2 or len(ys) < 2:
            continue"""

new_code = """        # 1. 실제 벡터 드로잉의 수평/수직 선분을 추출하여 우선 격자선으로 사용
        tb = table.bbox
        h_drawings: list[tuple[float, float, float]] = []
        v_drawings: list[tuple[float, float, float]] = []
        for d in page.get_drawings():
            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) < 1.0 and abs(p1.x - p2.x) > 15:
                        h_drawings.append(((p1.y + p2.y) / 2.0, min(p1.x, p2.x), max(p1.x, p2.x)))
                    elif abs(p1.x - p2.x) < 1.0 and abs(p1.y - p2.y) > 15:
                        v_drawings.append(((p1.x + p2.x) / 2.0, min(p1.y, p2.y), max(p1.y, p2.y)))
                elif item[0] == "re":
                    r = item[1]
                    if r.height < 3.0 and r.width > 15:
                        h_drawings.append((r.y0 + r.height / 2.0, r.x0, r.x1))
                    elif r.width < 3.0 and r.height > 15:
                        v_drawings.append((r.x0 + r.width / 2.0, r.y0, r.y1))

        table_h_lines = [
            hl[0] for hl in h_drawings
            if (tb[1] - 3.0 <= hl[0] <= tb[3] + 3.0) and not (hl[2] < tb[0] - 2.0 or hl[1] > tb[2] + 2.0)
        ]
        table_v_lines = [
            vl[0] for vl in v_drawings
            if (tb[0] - 3.0 <= vl[0] <= tb[2] + 3.0) and not (vl[2] < tb[1] - 2.0 or vl[1] > tb[3] + 2.0)
        ]

        if len(table_h_lines) >= 2:
            ys = cluster_coordinates(table_h_lines, tolerance_pt=2.0)
        else:
            ys = cluster_coordinates(
                [c[1] for c in cells_bboxes] + [c[3] for c in cells_bboxes],
                tolerance_pt=1.8,
            )

        if len(table_v_lines) >= 2:
            xs = cluster_coordinates(table_v_lines, tolerance_pt=2.0)
        else:
            xs = cluster_coordinates(
                [c[0] for c in cells_bboxes] + [c[2] for c in cells_bboxes],
                tolerance_pt=1.8,
            )

        if len(xs) < 2 or len(ys) < 2:
            continue"""

if old_code in text:
    text = text.replace(old_code, new_code)
    p.write_text(text, encoding="utf-8")
    print("Successfully patched vector_grid_extractor.py")
else:
    print("Warning: old_code not found in vector_grid_extractor.py")

