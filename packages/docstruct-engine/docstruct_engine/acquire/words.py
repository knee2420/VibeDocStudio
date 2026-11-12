"""Vector word extraction in upright PyMuPDF pt coordinates, reusing pdf_fidelity_engine."""
from __future__ import annotations

import re
from typing import Any, Optional

import pymupdf
from pdf_fidelity_engine.extract.char_normalizer import (
    PX,
    atoms_from_rawdict,
    deduplicate_faux_bold,
    is_cjk_garbled_token,
)
from pdf_fidelity_engine.fonts.registry import font_family, inspect_page_fonts

from ..ir.model import BBox, Ruling, Word

_NO_SPACE_BEFORE = frozenset({",", ".", ":", ";", ")", "]", "}", "%", "?", "!"})
_NO_SPACE_AFTER = frozenset({"(", "[", "{"})


def _transform_bbox_pt(bx_pt: BBox, rot_mat: pymupdf.Matrix, page_rect: pymupdf.Rect, rot: int) -> BBox:
    if not rot:
        return bx_pt
    r = (pymupdf.Rect(bx_pt) * rot_mat).normalize()
    x0 = max(0.0, min(float(page_rect.width), float(r.x0)))
    y0 = max(0.0, min(float(page_rect.height), float(r.y0)))
    x1 = max(x0, min(float(page_rect.width), float(r.x1)))
    y1 = max(y0, min(float(page_rect.height), float(r.y1)))
    return (round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2))


def _cluster_atoms_pt(atoms: list[Any], tol_pt: float = 1.6) -> list[list[Any]]:
    if not atoms:
        return []
    ordered = sorted(atoms, key=lambda a: (a.baseline / PX, a.x0 / PX))
    lines: list[list[Any]] = [[ordered[0]]]
    anchor_y = ordered[0].baseline / PX
    for atom in ordered[1:]:
        ay = atom.baseline / PX
        tol = max(tol_pt, min(atom.pt, lines[-1][0].pt) * 0.25)
        if abs(ay - anchor_y) <= tol:
            lines[-1].append(atom)
        else:
            lines.append([atom])
            anchor_y = ay
    return [sorted(ln, key=lambda a: (a.x0 / PX, a.origin_x / PX)) for ln in lines]


def _crosses_upright_wall(
    prev_bx: BBox,
    curr_bx: BBox,
    rulings: list[Ruling],
) -> bool:
    if not rulings:
        return False
    p_cx = (prev_bx[0] + prev_bx[2]) * 0.5
    p_cy = (prev_bx[1] + prev_bx[3]) * 0.5
    c_cx = (curr_bx[0] + curr_bx[2]) * 0.5
    c_cy = (curr_bx[1] + curr_bx[3]) * 0.5
    mid_x = (p_cx + c_cx) * 0.5
    mid_y = (p_cy + c_cy) * 0.5
    for r in rulings:
        if r.orient == "v" and (r.y1 - r.y0) >= 5.0:
            wx = (r.x0 + r.x1) * 0.5
            lo, hi = (p_cx, c_cx) if p_cx <= c_cx else (c_cx, p_cx)
            if lo < wx < hi and (r.y0 - 1.5) <= mid_y <= (r.y1 + 1.5):
                return True
        elif r.orient == "h" and (r.x1 - r.x0) >= 5.0:
            wy = (r.y0 + r.y1) * 0.5
            lo, hi = (p_cy, c_cy) if p_cy <= c_cy else (c_cy, p_cy)
            if lo < wy < hi and (r.x0 - 1.5) <= mid_x <= (r.x1 + 1.5):
                return True
    return False


def _find_occluded_char_boxes(
    page: pymupdf.Page,
    *,
    overlap_thresh: float = 0.45,
    max_fill_page_ratio: float = 0.45,
) -> list[tuple[str, BBox]]:
    """Find character boxes covered by subsequent opaque white vector fills in Z-order."""
    page_rect = page.rect
    page_area = max(1.0, abs(float(page_rect.width) * float(page_rect.height)))
    white_fills: list[tuple[int, pymupdf.Rect]] = []
    for d in page.get_drawings():
        fill = d.get("fill")
        if not isinstance(fill, (tuple, list)) or not fill:
            continue
        if min(float(v) for v in fill[:3]) < 0.98:
            continue
        raw_opacity = d.get("fill_opacity")
        opacity = 1.0 if raw_opacity is None else float(raw_opacity)
        if opacity < 0.9:
            continue
        rect = pymupdf.Rect(d["rect"])
        if rect.is_empty:
            continue
        if abs(rect.width * rect.height) >= max_fill_page_ratio * page_area:
            continue
        white_fills.append((int(d.get("seqno", -1)), rect))

    if not white_fills:
        return []

    occluded: list[tuple[str, BBox]] = []
    for sp in page.get_texttrace():
        sseq = int(sp.get("seqno", -1))
        sp_chars = list(sp.get("chars", ()))
        char_flags: list[tuple[str, BBox, bool]] = []
        has_occluded_non_space = False
        for ch_info in sp_chars:
            ch_code = int(ch_info[0])
            ch = chr(ch_code)
            cb = pymupdf.Rect(ch_info[3])
            carea = max(1e-6, abs(cb.width * cb.height))
            is_occ = False
            for dseq, drect in white_fills:
                if dseq <= sseq:
                    continue
                inter = cb & drect
                if not inter.is_empty and (abs(inter.width * inter.height) / carea) >= overlap_thresh:
                    is_occ = True
                    break
            if is_occ and not ch.isspace():
                has_occluded_non_space = True
            char_flags.append((ch, (float(cb.x0), float(cb.y0), float(cb.x1), float(cb.y1)), is_occ))

        for ch, bx, is_occ in char_flags:
            # Keep trailing space of an otherwise-visible span so slight overlap by the next span's white canvas doesn't erase a real space.
            if is_occ and (not ch.isspace() or has_occluded_non_space):
                occluded.append((ch, bx))

    return occluded


def _filter_occluded_atoms(
    atoms: list[Any],
    occluded_boxes: list[tuple[str, BBox]],
    *,
    px: float = PX,
) -> tuple[list[Any], int]:
    """Remove CharAtoms matching Z-order occluded texttrace boxes; return (kept, non_space_filtered_count)."""
    if not occluded_boxes or not atoms:
        return atoms, 0

    removed = [False] * len(atoms)
    filtered_non_space = 0
    for och, (ox0, oy0, ox1, oy1) in occluded_boxes:
        ocx = (ox0 + ox1) * 0.5
        ocy = (oy0 + oy1) * 0.5
        ow = max(1.0, ox1 - ox0)
        o_area = max(1e-6, (ox1 - ox0) * (oy1 - oy0))
        best_idx: Optional[int] = None
        best_key: Optional[tuple[float, float]] = None

        for ai, a in enumerate(atoms):
            if removed[ai] or a.c != och:
                continue
            ax0, ay0, ax1, ay1 = a.x0 / px, a.y0 / px, a.x1 / px, a.y1 / px
            acx = (ax0 + ax1) * 0.5
            acy = (ay0 + ay1) * 0.5
            ah = max(1.0, ay1 - ay0)
            if abs(acx - ocx) > max(2.5, ow * 0.65):
                continue
            if abs(acy - ocy) > max(4.5, ah * 0.45):
                continue

            if a.is_space:
                if abs(ax0 - ox0) <= 2.5 or abs(ax1 - ox1) <= 2.5:
                    score = abs(ax0 - ox0) + abs(acy - ocy)
                    key = (0.0, score)
                    if best_key is None or key < best_key:
                        best_key = key
                        best_idx = ai
                continue

            ix0, iy0 = max(ax0, ox0), max(ay0, oy0)
            ix1, iy1 = min(ax1, ox1), min(ay1, oy1)
            inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
            a_area = max(1e-6, (ax1 - ax0) * (ay1 - ay0))
            min_cov = inter / min(a_area, o_area)
            if min_cov < 0.35:
                continue
            dist = abs(ax0 - ox0) + abs(acy - ocy)
            key = (-round(min_cov, 4), dist)
            if best_key is None or key < best_key:
                best_key = key
                best_idx = ai

        if best_idx is not None:
            removed[best_idx] = True
            if not atoms[best_idx].is_space:
                filtered_non_space += 1

    kept = [a for idx, a in enumerate(atoms) if not removed[idx]]
    return kept, filtered_non_space


def _has_explicit_space_between(prev_a: Any, curr_a: Any, space_atoms: list[Any], em: float) -> bool:
    """Return True when raw PDF atoms include an explicit whitespace glyph between prev_a and curr_a."""
    if not space_atoms:
        return False
    tol_y = max(3.0, em * PX * 0.40)
    prev_cx = (prev_a.x0 + prev_a.x1) * 0.5
    curr_cx = (curr_a.x0 + curr_a.x1) * 0.5
    for sp in space_atoms:
        if abs(sp.baseline - prev_a.baseline) > tol_y:
            continue
        sp_cx = (sp.x0 + sp.x1) * 0.5
        if prev_cx <= sp_cx <= curr_cx and sp.x0 >= prev_a.x1 - 2.5 * PX and sp.x0 <= curr_a.x0 + 1.5 * PX:
            return True
    return False


def _has_trailing_space_after(atom: Any, space_atoms: list[Any], em: float) -> bool:
    """Return True when an explicit PDF whitespace atom immediately follows atom on the same baseline."""
    if not space_atoms:
        return False
    tol_y = max(3.0, em * PX * 0.40)
    for sp in space_atoms:
        if abs(sp.baseline - atom.baseline) > tol_y:
            continue
        if -1.5 * PX <= (sp.x0 - atom.x1) <= 3.0 * PX:
            return True
    return False


def _match_word_meta_tag(w: Word, entries: list[tuple[BBox, str, bool]], *, match_end: bool = False) -> Optional[bool]:
    """Match an upright atom-edge box against an extracted Word to recover space metadata."""
    if w.bbox is None or not w.text:
        return None
    wx0, wy0, wx1, wy1 = w.bbox
    for idx, (bx, ch, flag) in enumerate(entries):
        if match_end:
            if w.text[-1] != ch:
                continue
        elif w.text[0] != ch:
            continue
        cx = (bx[0] + bx[2]) * 0.5
        cy = (bx[1] + bx[3]) * 0.5
        if (wx0 - 0.8) <= cx <= (wx1 + 0.8) and (wy0 - 0.8) <= cy <= (wy1 + 0.8):
            entries.pop(idx)
            return flag
    return None


def extract_vector_words(
    page: pymupdf.Page,
    *,
    rulings: Optional[list[Ruling]] = None,
    space_ratio: float = 0.20,
    font_aliases: Optional[dict[str, str]] = None,
    stats_out: Optional[dict[str, int]] = None,
) -> list[Word]:
    """Extract normalized word tokens (`src='vec'`) in upright page coordinates (pt)."""
    font_meta = inspect_page_fonts(page)
    raw = page.get_text("rawdict")
    atoms = atoms_from_rawdict(raw, font_meta=font_meta)
    occluded_boxes = _find_occluded_char_boxes(page)
    filtered_atoms, occ_count = _filter_occluded_atoms(atoms, occluded_boxes, px=PX)
    if stats_out is not None:
        stats_out["occludedCharsFiltered"] = occ_count
    space_atoms = [a for a in filtered_atoms if a.is_space]
    cleaned = deduplicate_faux_bold(filtered_atoms)
    if not cleaned:
        return []

    space_before_tags: list[tuple[BBox, str, bool]] = []
    trailing_space_tags: list[tuple[BBox, str, bool]] = []
    words = _extract_vector_words_from_atoms(
        page,
        cleaned,
        font_meta=font_meta,
        space_atoms=space_atoms,
        rulings=rulings,
        space_ratio=space_ratio,
        font_aliases=font_aliases,
        space_before_tags=space_before_tags,
        trailing_space_tags=trailing_space_tags,
    )
    for w in words:
        sb = _match_word_meta_tag(w, space_before_tags, match_end=False)
        if sb is not None:
            w.spaceBefore = sb
        ts = _match_word_meta_tag(w, trailing_space_tags, match_end=True)
        if ts is True:
            w.trailingSpace = True
    return words


def _extract_vector_words_from_atoms(
    page: pymupdf.Page,
    cleaned: list[Any],
    *,
    font_meta: dict[str, Any],
    space_atoms: list[Any],
    rulings: Optional[list[Ruling]] = None,
    space_ratio: float = 0.20,
    font_aliases: Optional[dict[str, str]] = None,
    space_before_tags: Optional[list[tuple[BBox, str, bool]]] = None,
    trailing_space_tags: Optional[list[tuple[BBox, str, bool]]] = None,
) -> list[Word]:

    rule_list = rulings or []
    rot = int(page.rotation or 0)
    rot_mat = page.rotation_matrix
    page_rect = page.rect

    lines = _cluster_atoms_pt(cleaned)
    words_out: list[Word] = []
    seq = 0

    for line_idx, ln_atoms in enumerate(lines):
        # Compute upright display bbox per atom, while preserving natural reading order along line baseline
        pt_items: list[tuple[Any, BBox]] = []
        for a in ln_atoms:
            bx = _transform_bbox_pt(
                (a.x0 / PX, a.y0 / PX, a.x1 / PX, a.y1 / PX),
                rot_mat,
                page_rect,
                rot,
            )
            pt_items.append((a, bx))

        groups: list[list[tuple[Any, BBox]]] = [[pt_items[0]]]
        for a, bx in pt_items[1:]:
            prev_a, prev_bx = groups[-1][-1]
            em = max(prev_a.pt, a.pt, 6.0)
            # Measure character advance along the natural baseline in unrotated pt (handles 0/90/180/270 rotation)
            gap = (a.x0 - prev_a.x1) / PX

            should_split = False
            explicit_sp_val: Optional[bool] = None
            is_wrap_split = False
            if gap < -em * 0.8:
                should_split = True
                is_wrap_split = True
            elif _crosses_upright_wall(prev_bx, bx, rule_list):
                should_split = True
                explicit_sp_val = True
            elif a.c not in _NO_SPACE_BEFORE and not (prev_a.c in _NO_SPACE_AFTER and gap <= 0.45 * em):
                has_sp = _has_explicit_space_between(prev_a, a, space_atoms, em)
                if gap > space_ratio * em or (gap >= 0.08 * em and has_sp):
                    should_split = True
                    explicit_sp_val = has_sp
            if should_split:
                if is_wrap_split and trailing_space_tags is not None and _has_trailing_space_after(prev_a, space_atoms, em):
                    trailing_space_tags.append((prev_bx, prev_a.c, True))
                if space_before_tags is not None and explicit_sp_val is not None:
                    space_before_tags.append((bx, a.c, explicit_sp_val))
                groups.append([(a, bx)])
                continue
            groups[-1].append((a, bx))
        if trailing_space_tags is not None and pt_items:
            last_a, last_bx = pt_items[-1]
            if _has_trailing_space_after(last_a, space_atoms, max(last_a.pt, 6.0)):
                trailing_space_tags.append((last_bx, last_a.c, True))

        for grp in groups:
            txt = "".join(a.c for a, _ in grp).strip()
            if not txt:
                continue
            x0 = round(min(bx[0] for _, bx in grp), 2)
            y0 = round(min(bx[1] for _, bx in grp), 2)
            x1 = round(max(bx[2] for _, bx in grp), 2)
            y1 = round(max(bx[3] for _, bx in grp), 2)

            font_counts: dict[str, int] = {}
            for a, _ in grp:
                font_counts[a.font] = font_counts.get(a.font, 0) + 1
            dom_font = max(font_counts.items(), key=lambda kv: kv[1])[0]
            short = dom_font.split("+", 1)[-1]
            clean_short = re.sub(r"-WinCharSet[0-9A-F]+-H\d*$", "", short, flags=re.I)
            meta = font_meta.get(dom_font) or font_meta.get(short) or font_meta.get(clean_short) or {}
            css_font = font_family(dom_font, aliases=font_aliases, gdi_fallback=meta.get("inferredFamily"))

            missing_unicode = any(not a.has_to_unicode for a, _ in grp)
            needs_rev = missing_unicode or is_cjk_garbled_token(txt)
            seq_id = f"w{seq}"
            seq += 1
            first_a = grp[0][0]
            words_out.append(
                Word(
                    id=seq_id,
                    text=txt,
                    bbox=(x0, y0, max(x0, x1), max(y0, y1)),
                    conf=0.5 if needs_rev else 1.0,
                    src="vec",
                    font=css_font or dom_font,
                    size=round(float(first_a.pt), 2),
                    bold=any(bool(a.bold) for a, _ in grp),
                    italic=any(bool(a.italic) for a, _ in grp),
                    color=first_a.color,
                    needsReview=needs_rev,
                    baseline=round(float(first_a.baseline) / PX, 2),
                    lineHint=line_idx,
                )
            )

    return words_out
