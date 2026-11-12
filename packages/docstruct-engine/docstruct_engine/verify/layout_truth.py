"""Independent C0 page layout truth extraction from PDF stream / raster image.

Zero imports from ``docstruct_engine.blocks`` or ``docstruct_engine.tables`` so
C0 truth never shares structural heuristics with the system under test.
"""
from __future__ import annotations

import re
import statistics
from pathlib import Path
from typing import Any, Literal, Optional

import pymupdf
from PIL import Image
from pydantic import BaseModel, Field

from ..acquire.pdf.char_normalizer import atoms_from_rawdict
from ..acquire.pdf.char_types import CharAtom
from ..acquire.pdf.drawings import extract_drawings
from ..acquire.pdf.fonts import inspect_page_fonts
from ..acquire.pdf.metrics import PX_PER_PT

BBox = tuple[float, float, float, float]


class TruthSegment(BaseModel):
    bbox: BBox
    text: str
    sizePt: float
    bold: bool = False
    italic: bool = False
    color: str = "#000000"
    font: str = ""


class TruthLine(BaseModel):
    bbox: BBox
    baselinePt: float
    text: str
    sizePt: float
    bold: bool = False
    italic: bool = False
    color: str = "#000000"
    font: str = ""
    segments: list[TruthSegment] = Field(default_factory=list)
    hasHorizontalSplit: bool = False
    hasLeaderDots: bool = False


class TruthCell(BaseModel):
    r: int
    c: int
    bbox: BBox
    lineCount: int = 0
    text: str = ""
    padTopPt: float = 0.0
    padRightPt: float = 0.0
    padBottomPt: float = 0.0
    padLeftPt: float = 0.0
    bg: Optional[str] = None


class TruthTable(BaseModel):
    bbox: BBox
    nRows: int
    nCols: int
    rowHeightsPt: list[float] = Field(default_factory=list)
    colWidthsPt: list[float] = Field(default_factory=list)
    cells: list[TruthCell] = Field(default_factory=list)


class TruthPhotoRegion(BaseModel):
    bbox: BBox
    kind: Literal["image-xobject", "raster-photo"] = "raster-photo"


class PageLayoutTruth(BaseModel):
    pageIndex: int
    pageWidthPt: float
    pageHeightPt: float
    isScan: bool = False
    marginsPt: dict[str, float] = Field(default_factory=dict)
    dominantFontSizePt: Optional[float] = None
    fontSizesPt: list[float] = Field(default_factory=list)
    lineSpacingRatio: Optional[float] = None
    paraGapsPt: list[float] = Field(default_factory=list)
    lines: list[TruthLine] = Field(default_factory=list)
    horizontalGroupCount: int = 0
    tocLineCount: int = 0
    tables: list[TruthTable] = Field(default_factory=list)
    pageBgColor: Optional[str] = None
    panelCount: int = 0
    panelBoxes: list[BBox] = Field(default_factory=list)
    photoRegions: list[TruthPhotoRegion] = Field(default_factory=list)
    topBandText: str = ""
    bottomBandText: str = ""
    hasTopImageBand: bool = False
    hasBottomImageBand: bool = False
    rasterLineHeightsPt: list[float] = Field(default_factory=list)
    rasterPitchPt: Optional[float] = None
    estimatedScanFontPt: Optional[float] = None
    repeatedHeader: bool = False
    repeatedFooter: bool = False


_LEADER_RE = re.compile(r"(?:\.{3,}|…{2,}|-{4,}|_{4,}|·{3,})")


def _norm_band_text(txt: str) -> str:
    s = re.sub(r"\d+", "#", txt.strip())
    return re.sub(r"\s+", " ", s).strip()


def _cluster_coords(vals: list[float], tol: float = 2.0) -> list[float]:
    if not vals:
        return []
    s = sorted(vals)
    clusters: list[list[float]] = [[s[0]]]
    for v in s[1:]:
        if abs(v - clusters[-1][-1]) <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [round(sum(c) / len(c), 2) for c in clusters]


def _build_truth_lines(atoms: list[CharAtom]) -> list[TruthLine]:
    visible = [a for a in atoms if not a.is_space and a.c.strip()]
    if not visible:
        return []
    ordered = sorted(visible, key=lambda a: (a.baseline, a.x0))
    clusters: list[list[CharAtom]] = []
    anchors: list[tuple[float, float]] = []
    for a in ordered:
        tol = max(2.0, min(a.pt, 14.0) * 0.35 * PX_PER_PT)
        if not clusters or abs(a.baseline - anchors[-1][0]) > tol:
            clusters.append([a])
            anchors.append((a.baseline, a.pt))
        else:
            clusters[-1].append(a)
            mean_b = sum(c.baseline for c in clusters[-1]) / len(clusters[-1])
            anchors[-1] = (mean_b, min(anchors[-1][1], a.pt))

    lines: list[TruthLine] = []
    for cl in clusters:
        cl.sort(key=lambda c: c.x0)
        med_pt = statistics.median(c.pt for c in cl)
        split_gap_px = max(12.0, med_pt * PX_PER_PT * 2.2)

        raw_segs: list[list[CharAtom]] = [[cl[0]]]
        for c in cl[1:]:
            prev = raw_segs[-1][-1]
            if (c.x0 - prev.x1) > split_gap_px:
                raw_segs.append([c])
            else:
                raw_segs[-1].append(c)

        segs: list[TruthSegment] = []
        for s_atoms in raw_segs:
            parts: list[str] = [s_atoms[0].c]
            for prev_c, cur_c in zip(s_atoms, s_atoms[1:]):
                gap = cur_c.x0 - prev_c.x1
                em = max(cur_c.pt, prev_c.pt) * PX_PER_PT
                if gap > em * 0.22:
                    parts.append(" ")
                parts.append(cur_c.c)
            seg_text = "".join(parts).strip()
            s_pt = round(statistics.median(c.pt for c in s_atoms), 1)
            sx0 = min(c.x0 for c in s_atoms) / PX_PER_PT
            sy0 = min(c.y0 for c in s_atoms) / PX_PER_PT
            sx1 = max(c.x1 for c in s_atoms) / PX_PER_PT
            sy1 = max(c.y1 for c in s_atoms) / PX_PER_PT
            segs.append(
                TruthSegment(
                    bbox=(round(sx0, 2), round(sy0, 2), round(sx1, 2), round(sy1, 2)),
                    text=seg_text,
                    sizePt=s_pt,
                    bold=any(c.bold for c in s_atoms),
                    italic=any(c.italic for c in s_atoms),
                    color=s_atoms[0].color,
                    font=s_atoms[0].font,
                )
            )

        lx0 = min(s.bbox[0] for s in segs)
        ly0 = min(s.bbox[1] for s in segs)
        lx1 = max(s.bbox[2] for s in segs)
        ly1 = max(s.bbox[3] for s in segs)
        full_text = "   ".join(s.text for s in segs)
        has_split = len(segs) >= 2
        has_leader = bool(_LEADER_RE.search(full_text))
        lines.append(
            TruthLine(
                bbox=(round(lx0, 2), round(ly0, 2), round(lx1, 2), round(ly1, 2)),
                baselinePt=round(statistics.median(c.baseline for c in cl) / PX_PER_PT, 2),
                text=full_text,
                sizePt=round(med_pt, 1),
                bold=all(s.bold for s in segs),
                italic=all(s.italic for s in segs),
                color=segs[0].color,
                font=segs[0].font,
                segments=segs,
                hasHorizontalSplit=has_split,
                hasLeaderDots=has_leader,
            )
        )
    return lines


def _extract_orthogonal_tables(
    rules_pt: list[dict[str, float]],
    fills_pt: list[dict[str, Any]],
    lines: list[TruthLine],
) -> list[TruthTable]:
    """Independent simple orthogonal grid detector from H/V rulings."""
    hs = [r for r in rules_pt if r["orient"] == "h" and (r["x1"] - r["x0"]) >= 24.0]
    vs = [r for r in rules_pt if r["orient"] == "v" and (r["y1"] - r["y0"]) >= 12.0]
    if len(hs) < 2 or len(vs) < 2:
        return []

    # Group connected H/V rules by coarse vertical intervals into separate candidate regions.
    all_rules = hs + vs
    adj: list[list[int]] = [[] for _ in all_rules]
    for i, a in enumerate(all_rules):
        for j in range(i + 1, len(all_rules)):
            b = all_rules[j]
            if (
                a["x0"] <= b["x1"] + 3.0
                and a["x1"] + 3.0 >= b["x0"]
                and a["y0"] <= b["y1"] + 3.0
                and a["y1"] + 3.0 >= b["y0"]
            ):
                adj[i].append(j)
                adj[j].append(i)

    visited = [False] * len(all_rules)
    tables: list[TruthTable] = []
    for start in range(len(all_rules)):
        if visited[start]:
            continue
        stack = [start]
        visited[start] = True
        comp: list[dict[str, float]] = []
        while stack:
            cur = stack.pop()
            comp.append(all_rules[cur])
            for nxt in adj[cur]:
                if not visited[nxt]:
                    visited[nxt] = True
                    stack.append(nxt)
        c_hs = [r for r in comp if r["orient"] == "h"]
        c_vs = [r for r in comp if r["orient"] == "v"]
        if len(c_hs) < 2 or len(c_vs) < 2:
            continue

        row_ys = _cluster_coords([(r["y0"] + r["y1"]) * 0.5 for r in c_hs], tol=2.0)
        col_xs = _cluster_coords([(r["x0"] + r["x1"]) * 0.5 for r in c_vs], tol=2.0)
        if len(row_ys) < 2 or len(col_xs) < 2:
            continue
        tbbox: BBox = (col_xs[0], row_ys[0], col_xs[-1], row_ys[-1])
        if (tbbox[2] - tbbox[0]) < 30.0 or (tbbox[3] - tbbox[1]) < 14.0:
            continue

        row_heights = [round(row_ys[r + 1] - row_ys[r], 2) for r in range(len(row_ys) - 1)]
        col_widths = [round(col_xs[c + 1] - col_xs[c], 2) for c in range(len(col_xs) - 1)]
        cells: list[TruthCell] = []
        for r_idx in range(len(row_ys) - 1):
            for c_idx in range(len(col_xs) - 1):
                cbbox: BBox = (col_xs[c_idx], row_ys[r_idx], col_xs[c_idx + 1], row_ys[r_idx + 1])
                in_lines: list[TruthLine] = []
                for ln in lines:
                    lcx = (ln.bbox[0] + ln.bbox[2]) * 0.5
                    lcy = (ln.bbox[1] + ln.bbox[3]) * 0.5
                    if cbbox[0] - 1.5 <= lcx <= cbbox[2] + 1.5 and cbbox[1] - 1.5 <= lcy <= cbbox[3] + 1.5:
                        in_lines.append(ln)
                pt_top = pt_right = pt_bot = pt_left = 0.0
                if in_lines:
                    tx0 = min(ln.bbox[0] for ln in in_lines)
                    ty0 = min(ln.bbox[1] for ln in in_lines)
                    tx1 = max(ln.bbox[2] for ln in in_lines)
                    ty1 = max(ln.bbox[3] for ln in in_lines)
                    pt_top = round(max(0.0, ty0 - cbbox[1]), 1)
                    pt_right = round(max(0.0, cbbox[2] - tx1), 1)
                    pt_bot = round(max(0.0, cbbox[3] - ty1), 1)
                    pt_left = round(max(0.0, tx0 - cbbox[0]), 1)
                cell_bg: Optional[str] = None
                for fl in fills_pt:
                    if (
                        fl["x0"] <= cbbox[0] + 3.0
                        and fl["x1"] >= cbbox[2] - 3.0
                        and fl["y0"] <= cbbox[1] + 3.0
                        and fl["y1"] >= cbbox[3] - 3.0
                    ):
                        cell_bg = str(fl.get("color") or "")
                        break
                cells.append(
                    TruthCell(
                        r=r_idx,
                        c=c_idx,
                        bbox=cbbox,
                        lineCount=len(in_lines),
                        text=" ".join(ln.text for ln in in_lines).strip(),
                        padTopPt=pt_top,
                        padRightPt=pt_right,
                        padBottomPt=pt_bot,
                        padLeftPt=pt_left,
                        bg=cell_bg,
                    )
                )
        tables.append(
            TruthTable(
                bbox=tbbox,
                nRows=len(row_heights),
                nCols=len(col_widths),
                rowHeightsPt=row_heights,
                colWidthsPt=col_widths,
                cells=cells,
            )
        )
    return tables


def _analyze_raster_page(page: pymupdf.Page, *, dpi: int = 150) -> tuple[list[float], Optional[float], Optional[float], list[TruthPhotoRegion]]:
    """Independent ink-projection lines & photographic patch finder for scan pages."""
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    w_px, h_px = img.size
    scale_pt = 72.0 / float(dpi)
    px_bytes = img.tobytes()

    # Fast RGB scanline metrics: ink rows & chromatic block tiles.
    tile = max(16, int(round(12.0 / scale_pt)))  # ~12pt square grid
    cols = max(1, w_px // tile)
    rows = max(1, h_px // tile)
    photo_cells: list[tuple[int, int]] = []
    chroma_map: list[list[bool]] = [[False] * cols for _ in range(rows)]

    row_ink = [0] * h_px
    stride = w_px * 3
    for y in range(h_px):
        row_off = y * stride
        dark = 0
        for x in range(0, w_px, 2):
            off = row_off + x * 3
            r, g, b = px_bytes[off], px_bytes[off + 1], px_bytes[off + 2]
            lum = (r * 77 + g * 150 + b * 29) >> 8
            if lum < 210:
                dark += 2
        row_ink[y] = dark

    for tr in range(rows):
        for tc in range(cols):
            y0, y1 = tr * tile, min(h_px, (tr + 1) * tile)
            x0, x1 = tc * tile, min(w_px, (tc + 1) * tile)
            sat_sum = 0
            nonwhite = 0
            samples = 0
            for y in range(y0, y1, 3):
                row_off = y * stride
                for x in range(x0, x1, 3):
                    off = row_off + x * 3
                    r, g, b = px_bytes[off], px_bytes[off + 1], px_bytes[off + 2]
                    mx = max(r, g, b)
                    mn = min(r, g, b)
                    sat = mx - mn
                    samples += 1
                    if sat > 18:
                        sat_sum += sat
                    if mn < 235:
                        nonwhite += 1
            if samples > 0 and (nonwhite / samples) > 0.35 and (sat_sum / samples) > 22.0:
                chroma_map[tr][tc] = True
                photo_cells.append((tr, tc))

    # Connected component merge on colorful / continuous-tone tiles -> TruthPhotoRegion
    seen = [[False] * cols for _ in range(rows)]
    photo_regions: list[TruthPhotoRegion] = []
    for sr, sc in photo_cells:
        if seen[sr][sc]:
            continue
        q = [(sr, sc)]
        seen[sr][sc] = True
        r0 = r1 = sr
        c0 = c1 = sc
        count = 0
        while q:
            cr, cc = q.pop()
            count += 1
            r0, r1 = min(r0, cr), max(r1, cr)
            c0, c1 = min(c0, cc), max(c1, cc)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    nr, nc = cr + dr, cc + dc
                    if 0 <= nr < rows and 0 <= nc < cols and not seen[nr][nc] and chroma_map[nr][nc]:
                        seen[nr][nc] = True
                        q.append((nr, nc))
        bx0 = round(c0 * tile * scale_pt, 1)
        by0 = round(r0 * tile * scale_pt, 1)
        bx1 = round(min(w_px, (c1 + 1) * tile) * scale_pt, 1)
        by1 = round(min(h_px, (r1 + 1) * tile) * scale_pt, 1)
        if count >= 4 and (bx1 - bx0) >= 32.0 and (by1 - by0) >= 32.0:
            photo_regions.append(TruthPhotoRegion(bbox=(bx0, by0, bx1, by1), kind="raster-photo"))

    # Horizontal ink bands outside photo regions -> raster text lines
    photo_rows = set()
    for pr in photo_regions:
        py0_px = int(pr.bbox[1] / scale_pt)
        py1_px = int(pr.bbox[3] / scale_pt)
        photo_rows.update(range(max(0, py0_px), min(h_px, py1_px)))

    min_dark = max(8, int(w_px * 0.015))
    bands_px: list[tuple[int, int]] = []
    in_band = False
    b_start = 0
    for y in range(h_px):
        active = row_ink[y] >= min_dark and y not in photo_rows
        if active and not in_band:
            in_band = True
            b_start = y
        elif not active and in_band:
            in_band = False
            if (y - b_start) >= 4:
                bands_px.append((b_start, y))
    if in_band and (h_px - b_start) >= 4:
        bands_px.append((b_start, h_px))

    line_heights_pt = [round((y1 - y0) * scale_pt, 2) for y0, y1 in bands_px if 4.0 <= (y1 - y0) * scale_pt <= 36.0]
    pitches_pt: list[float] = []
    for (_, prev_y1), (cur_y0, cur_y1) in zip(bands_px, bands_px[1:]):
        prev_h = (bands_px[bands_px.index((cur_y0, cur_y1)) - 1][1] - bands_px[bands_px.index((cur_y0, cur_y1)) - 1][0]) * scale_pt
        cur_h = (cur_y1 - cur_y0) * scale_pt
        if prev_h <= 30.0 and cur_h <= 30.0:
            pitch = (cur_y1 - prev_y1) * scale_pt
            if 6.0 <= pitch <= 48.0:
                pitches_pt.append(pitch)

    pitch_med = round(statistics.median(pitches_pt), 2) if pitches_pt else None
    est_font = round(statistics.median(line_heights_pt) * 0.85, 1) if line_heights_pt else None
    return line_heights_pt, pitch_med, est_font, photo_regions


def extract_page_layout_truth(
    page: pymupdf.Page,
    page_index: int,
    *,
    bg_cover_ratio: float = 0.75,
) -> PageLayoutTruth:
    """Measure ground-truth typography, spacing, tables, panels, and photos directly from PDF."""
    pw = float(page.rect.width)
    ph = float(page.rect.height)
    fmeta = inspect_page_fonts(page)
    raw = page.get_text("rawdict")
    atoms = atoms_from_rawdict(raw, font_meta=fmeta)
    lines = _build_truth_lines(atoms)

    rules_px, fills_px = extract_drawings(page)
    rules_pt = [
        {
            "orient": str(r.get("orient", "h")),
            "x0": float(r["x"]) / PX_PER_PT,
            "y0": float(r["y"]) / PX_PER_PT,
            "x1": float(r["x1"]) / PX_PER_PT,
            "y1": float(r["y1"]) / PX_PER_PT,
        }
        for r in rules_px
    ]
    fills_pt = [
        {
            "x0": float(f["x"]) / PX_PER_PT,
            "y0": float(f["y"]) / PX_PER_PT,
            "x1": float(f["x1"]) / PX_PER_PT,
            "y1": float(f["y1"]) / PX_PER_PT,
            "color": str(f.get("color") or ""),
        }
        for f in fills_px
    ]

    page_area = max(1.0, pw * ph)
    page_bg: Optional[str] = None
    panel_boxes: list[BBox] = []
    for fl in fills_pt:
        fw = max(0.0, fl["x1"] - fl["x0"])
        fh = max(0.0, fl["y1"] - fl["y0"])
        col = fl["color"].lower()
        if not col or col in {"#ffffff", "#fefefe", "#fdfdfd"}:
            continue
        if (fw * fh) / page_area >= bg_cover_ratio:
            page_bg = fl["color"]
        elif fw >= 80.0 and fh >= 14.0:
            panel_boxes.append((round(fl["x0"], 1), round(fl["y0"], 1), round(fl["x1"], 1), round(fl["y1"], 1)))

    tables = _extract_orthogonal_tables(rules_pt, fills_pt, lines)
    photo_regions: list[TruthPhotoRegion] = []
    has_top_img = False
    has_bot_img = False
    for img_info in page.get_images(full=True):
        xref = img_info[0]
        for rect in page.get_image_rects(xref):
            iw = rect.width
            ih = rect.height
            if iw * ih >= page_area * 0.72:
                continue
            bx: BBox = (round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1))
            if rect.y1 <= ph * 0.16:
                has_top_img = True
            elif rect.y0 >= ph * 0.84:
                has_bot_img = True
            elif iw >= 24.0 and ih >= 24.0:
                photo_regions.append(TruthPhotoRegion(bbox=bx, kind="image-xobject"))

    is_scan = len(lines) == 0 and len(page.get_images(full=False)) > 0
    raster_heights: list[float] = []
    raster_pitch: Optional[float] = None
    est_scan_pt: Optional[float] = None
    if is_scan:
        raster_heights, raster_pitch, est_scan_pt, raster_photos = _analyze_raster_page(page)
        photo_regions = raster_photos

    # Filter non-table body lines for typography & spacing ground truth.
    def _in_table(ln: TruthLine) -> bool:
        cx = (ln.bbox[0] + ln.bbox[2]) * 0.5
        cy = (ln.bbox[1] + ln.bbox[3]) * 0.5
        return any(t.bbox[0] - 2.0 <= cx <= t.bbox[2] + 2.0 and t.bbox[1] - 2.0 <= cy <= t.bbox[3] + 2.0 for t in tables)

    non_table_lines = [ln for ln in lines if not _in_table(ln)]
    body_sizes = [ln.sizePt for ln in non_table_lines if ln.sizePt >= 6.0]
    dom_size = round(statistics.median(body_sizes), 1) if body_sizes else est_scan_pt
    distinct_sizes = sorted({round(ln.sizePt, 1) for ln in lines if ln.sizePt >= 6.0})

    line_ratios: list[float] = []
    para_gaps: list[float] = []
    for a, b in zip(non_table_lines, non_table_lines[1:]):
        if a.bbox[1] < ph * 0.12 or b.bbox[3] > ph * 0.88:
            continue
        dy = b.baselinePt - a.baselinePt
        if dy <= 0.0:
            continue
        ref_pt = max(6.0, min(a.sizePt, b.sizePt))
        ratio = dy / ref_pt
        if 0.9 <= ratio <= 2.3:
            line_ratios.append(ratio)
        elif 2.3 < ratio <= 8.0:
            para_gaps.append(round(dy - ref_pt * 1.2, 2))
    med_lh = round(statistics.median(line_ratios), 2) if line_ratios else None

    horiz_groups = sum(1 for ln in non_table_lines if ln.hasHorizontalSplit or ln.hasLeaderDots)
    toc_lines = sum(1 for ln in non_table_lines if ln.hasLeaderDots)

    margins: dict[str, float] = {}
    all_boxes = [ln.bbox for ln in lines] + [t.bbox for t in tables]
    if all_boxes:
        margins = {
            "left": round(max(0.0, min(b[0] for b in all_boxes)), 1),
            "top": round(max(0.0, min(b[1] for b in all_boxes)), 1),
            "right": round(max(0.0, pw - max(b[2] for b in all_boxes)), 1),
            "bottom": round(max(0.0, ph - max(b[3] for b in all_boxes)), 1),
        }

    top_lines = [ln.text for ln in lines if ln.bbox[3] <= ph * 0.12]
    bot_lines = [ln.text for ln in lines if ln.bbox[1] >= ph * 0.88]

    return PageLayoutTruth(
        pageIndex=page_index,
        pageWidthPt=round(pw, 2),
        pageHeightPt=round(ph, 2),
        isScan=is_scan,
        marginsPt=margins,
        dominantFontSizePt=dom_size,
        fontSizesPt=distinct_sizes,
        lineSpacingRatio=med_lh,
        paraGapsPt=para_gaps,
        lines=lines,
        horizontalGroupCount=horiz_groups,
        tocLineCount=toc_lines,
        tables=tables,
        pageBgColor=page_bg,
        panelCount=len(panel_boxes),
        panelBoxes=panel_boxes,
        photoRegions=photo_regions,
        topBandText=_norm_band_text(" ".join(top_lines)),
        bottomBandText=_norm_band_text(" ".join(bot_lines)),
        hasTopImageBand=has_top_img,
        hasBottomImageBand=has_bot_img,
        rasterLineHeightsPt=raster_heights,
        rasterPitchPt=raster_pitch,
        estimatedScanFontPt=est_scan_pt,
    )


def extract_doc_layout_truth(
    path: str | Path,
    *,
    page_indices: Optional[list[int]] = None,
    bg_cover_ratio: float = 0.75,
) -> list[PageLayoutTruth]:
    """Extract C0 PageLayoutTruth across pages and annotate repeated header/footer bands."""
    src = Path(path)
    wanted = set(page_indices) if page_indices else None
    results: list[PageLayoutTruth] = []
    with pymupdf.open(str(src)) as doc:
        for idx, page in enumerate(doc, start=1):
            if wanted is not None and idx not in wanted:
                continue
            results.append(extract_page_layout_truth(page, idx, bg_cover_ratio=bg_cover_ratio))

    if len(results) >= 2:
        top_counts: dict[str, int] = {}
        bot_counts: dict[str, int] = {}
        top_img_cnt = sum(1 for r in results if r.hasTopImageBand)
        bot_img_cnt = sum(1 for r in results if r.hasBottomImageBand)
        for r in results:
            if r.topBandText:
                top_counts[r.topBandText] = top_counts.get(r.topBandText, 0) + 1
            if r.bottomBandText:
                bot_counts[r.bottomBandText] = bot_counts.get(r.bottomBandText, 0) + 1
        for r in results:
            if (r.topBandText and top_counts.get(r.topBandText, 0) >= 2) or (r.hasTopImageBand and top_img_cnt >= 2):
                r.repeatedHeader = True
            if (r.bottomBandText and bot_counts.get(r.bottomBandText, 0) >= 2) or (r.hasBottomImageBand and bot_img_cnt >= 2):
                r.repeatedFooter = True
    return results
