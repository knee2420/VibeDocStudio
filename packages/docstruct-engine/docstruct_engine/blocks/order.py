"""Column-aware reading order computation across all PageIR blocks."""
from __future__ import annotations

from typing import Optional

from ..ir.model import BlockIR, NoteBlock


def _block_y0(b: BlockIR) -> float:
    return b.bbox[1] if b.bbox is not None else 0.0


def _block_x0(b: BlockIR) -> float:
    return b.bbox[0] if b.bbox is not None else 0.0


def _block_center_x(b: BlockIR) -> float:
    return (b.bbox[0] + b.bbox[2]) * 0.5 if b.bbox is not None else 0.0


def _split_band_columns(band: list[BlockIR], content_x0: float, content_x1: float) -> list[list[BlockIR]]:
    span = content_x1 - content_x0
    if len(band) < 2 or span < 80.0:
        return [sorted(band, key=lambda b: (_block_y0(b), _block_x0(b), b.id))]

    # Only split on a clean vertical divider when no block in this band crosses it
    mid_lo = content_x0 + span * 0.25
    mid_hi = content_x0 + span * 0.75
    cand_xs: list[float] = []
    for b in band:
        if b.bbox is None:
            continue
        if mid_lo <= b.bbox[2] <= mid_hi:
            cand_xs.append(b.bbox[2] + 2.0)

    best_split: Optional[float] = None
    best_balance = float("inf")
    for sx in cand_xs:
        crossing = any(b.bbox is not None and b.bbox[0] < sx - 1.0 and b.bbox[2] > sx + 1.0 for b in band)
        if crossing:
            continue
        left = [b for b in band if _block_center_x(b) < sx]
        right = [b for b in band if _block_center_x(b) >= sx]
        if left and right:
            bal = abs(len(left) - len(right))
            if bal < best_balance:
                best_balance = bal
                best_split = sx

    if best_split is None:
        return [sorted(band, key=lambda b: (_block_y0(b), _block_x0(b), b.id))]

    left = sorted([b for b in band if _block_center_x(b) < best_split], key=lambda b: (_block_y0(b), _block_x0(b), b.id))
    right = sorted([b for b in band if _block_center_x(b) >= best_split], key=lambda b: (_block_y0(b), _block_x0(b), b.id))
    return [left, right]


def compute_reading_order(blocks: list[BlockIR], *, page_width: float) -> list[str]:
    """Compute column-aware top-to-bottom reading order placing headers first and footers last."""
    if not blocks:
        return []

    headers: list[BlockIR] = []
    footers: list[BlockIR] = []
    body: list[BlockIR] = []
    for b in blocks:
        if isinstance(b, NoteBlock) and b.noteKind == "header":
            headers.append(b)
        elif isinstance(b, NoteBlock) and b.noteKind == "footer":
            footers.append(b)
        else:
            body.append(b)

    headers.sort(key=lambda b: (_block_y0(b), _block_x0(b), b.id))
    footers.sort(key=lambda b: (_block_y0(b), _block_x0(b), b.id))

    if not body:
        return [b.id for b in headers + footers]

    boxed = [b for b in body if b.bbox is not None]
    if not boxed:
        return [b.id for b in headers + body + footers]

    cx0 = min(b.bbox[0] for b in boxed)  # type: ignore[index]
    cx1 = max(b.bbox[2] for b in boxed)  # type: ignore[index]
    c_width = max(page_width * 0.5, cx1 - cx0)
    mid_x = (cx0 + cx1) * 0.5

    body_sorted = sorted(body, key=lambda b: (_block_y0(b), _block_x0(b), b.id))

    # Full-width or centered solo-band blocks act as horizontal band separators across multi-column regions
    ordered_body: list[BlockIR] = []
    cur_band: list[BlockIR] = []

    def _flush_band() -> None:
        if not cur_band:
            return
        for col in _split_band_columns(cur_band, cx0, cx1):
            ordered_body.extend(col)
        cur_band.clear()

    for b in body_sorted:
        w = (b.bbox[2] - b.bbox[0]) if b.bbox is not None else c_width
        is_wide = w >= c_width * 0.62
        straddles_mid = b.bbox is not None and b.bbox[0] < mid_x < b.bbox[2]
        solo_y = b.bbox is not None and not any(
            other is not b
            and other.bbox is not None
            and min(b.bbox[3], other.bbox[3]) > max(b.bbox[1], other.bbox[1]) + 1.0
            for other in body_sorted
        )
        if is_wide or (straddles_mid and solo_y):
            _flush_band()
            ordered_body.append(b)
        else:
            cur_band.append(b)
    _flush_band()

    seen: set[str] = set()
    order: list[str] = []
    for b in headers + ordered_body + footers:
        if b.id not in seen:
            seen.add(b.id)
            order.append(b.id)
    for b in blocks:
        if b.id not in seen:
            seen.add(b.id)
            order.append(b.id)
    return order
