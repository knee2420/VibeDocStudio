"""Grid coordinate snapping, sliver deduplication, and full grid coverage normalization."""
from __future__ import annotations

from typing import Optional

from ..ir.model import BBox, Ruling
from .candidates import CandidateCell, TableCandidate


def _snap_axis(
    coords: list[float],
    targets: list[float],
    *,
    tol: float,
    page_max: Optional[float],
    min_step: float,
) -> tuple[list[float], dict[int, int]]:
    """Snap coordinates to closest target within `tol`, collapse `< min_step`, return old->new interval map."""
    if len(coords) < 2:
        return list(coords), {}

    snapped: list[float] = []
    for val in coords:
        best = val
        best_dist = tol + 1e-6
        for tgt in targets:
            d = abs(tgt - val)
            if d < best_dist:
                best_dist = d
                best = tgt
        if page_max is not None:
            best = max(0.0, min(page_max, best))
        snapped.append(round(best, 2))

    # Enforce monotone non-decreasing boundaries before collapsing slivers
    for i in range(1, len(snapped)):
        if snapped[i] < snapped[i - 1]:
            snapped[i] = snapped[i - 1]

    # Build collapsed coordinate list and old_coord_idx -> new_coord_idx map
    deduped: list[float] = [snapped[0]]
    coord_map: dict[int, int] = {0: 0}
    for i in range(1, len(snapped)):
        if snapped[i] - deduped[-1] < min_step and i < len(snapped) - 1:
            coord_map[i] = len(deduped) - 1
        elif snapped[i] - deduped[-1] < min_step:
            # Final trailing coordinate: merge backwards if previous boundary collapsed into end
            if len(deduped) >= 2:
                deduped[-1] = snapped[i]
                coord_map[i] = len(deduped) - 1
            else:
                coord_map[i] = len(deduped) - 1
        else:
            deduped.append(snapped[i])
            coord_map[i] = len(deduped) - 1

    # Ensure every original interval [i, i+1) maps cleanly
    old_n_intervals = len(coords) - 1
    new_n_intervals = max(0, len(deduped) - 1)
    interval_map: dict[int, int] = {}
    for old_i in range(old_n_intervals):
        ns = coord_map.get(old_i, 0)
        ne = coord_map.get(old_i + 1, ns)
        if ne > ns and 0 <= ns < new_n_intervals:
            interval_map[old_i] = ns
    return deduped, interval_map


def _normalize_cells(
    cells: list[CandidateCell],
    col_xs: list[float],
    row_ys: list[float],
    row_map: dict[int, int],
    col_map: dict[int, int],
) -> list[CandidateCell]:
    n_rows = max(0, len(row_ys) - 1)
    n_cols = max(0, len(col_xs) - 1)
    if n_rows == 0 or n_cols == 0:
        return []

    occupancy: list[list[bool]] = [[False] * n_cols for _ in range(n_rows)]
    out: list[CandidateCell] = []

    for cell in sorted(cells, key=lambda item: (item.r, item.c, -(item.rs * item.cs))):
        r_indices = [row_map[ri] for ri in range(cell.r, cell.r + cell.rs) if ri in row_map]
        c_indices = [col_map[ci] for ci in range(cell.c, cell.c + cell.cs) if ci in col_map]
        if not r_indices or not c_indices:
            continue
        r0, r1 = min(r_indices), max(r_indices) + 1
        c0, c1 = min(c_indices), max(c_indices) + 1
        rs, cs = r1 - r0, c1 - c0
        if rs <= 0 or cs <= 0:
            continue
        if any(occupancy[rr][cc] for rr in range(r0, r1) for cc in range(c0, c1)):
            continue
        for rr in range(r0, r1):
            for cc in range(c0, c1):
                occupancy[rr][cc] = True
        out.append(
            CandidateCell(
                r=r0,
                c=c0,
                rs=rs,
                cs=cs,
                bbox=(col_xs[c0], row_ys[r0], col_xs[c1], row_ys[r1]),
                borders=dict(cell.borders),
                bg=cell.bg,
            )
        )

    for rr in range(n_rows):
        for cc in range(n_cols):
            if not occupancy[rr][cc]:
                out.append(
                    CandidateCell(
                        r=rr,
                        c=cc,
                        rs=1,
                        cs=1,
                        bbox=(col_xs[cc], row_ys[rr], col_xs[cc + 1], row_ys[rr + 1]),
                    )
                )

    out.sort(key=lambda item: (item.r, item.c))
    return out


def _prune_unused_cuts(
    cells: list[CandidateCell],
    col_xs: list[float],
    row_ys: list[float],
) -> tuple[list[CandidateCell], list[float], list[float]]:
    """Collapse interior colXs/rowYs cuts that no cell starts or ends on (e.g., partial text underlines)."""
    if not cells or len(col_xs) < 2 or len(row_ys) < 2:
        return cells, col_xs, row_ys

    used_r = sorted({0, len(row_ys) - 1} | {c.r for c in cells} | {c.r + c.rs for c in cells})
    used_c = sorted({0, len(col_xs) - 1} | {c.c for c in cells} | {c.c + c.cs for c in cells})
    if len(used_r) == len(row_ys) and len(used_c) == len(col_xs):
        return cells, col_xs, row_ys

    new_rows = [row_ys[i] for i in used_r]
    new_cols = [col_xs[i] for i in used_c]
    r_remap = {old_i: new_i for new_i, old_i in enumerate(used_r)}
    c_remap = {old_i: new_i for new_i, old_i in enumerate(used_c)}

    pruned: list[CandidateCell] = []
    for cell in cells:
        r0 = r_remap[cell.r]
        r1 = r_remap[cell.r + cell.rs]
        c0 = c_remap[cell.c]
        c1 = c_remap[cell.c + cell.cs]
        pruned.append(
            CandidateCell(
                r=r0,
                c=c0,
                rs=max(1, r1 - r0),
                cs=max(1, c1 - c0),
                bbox=(new_cols[c0], new_rows[r0], new_cols[c1], new_rows[r1]),
                borders=dict(cell.borders),
                bg=cell.bg,
            )
        )
    pruned.sort(key=lambda item: (item.r, item.c))
    return pruned, new_cols, new_rows


def snap_candidate_grid(
    cand: TableCandidate,
    rulings: list[Ruling],
    *,
    snap_tol_pt: float = 1.8,
    min_cell_dim_pt: float = 2.0,
    page_size: Optional[tuple[float, float]] = None,
) -> TableCandidate:
    """Snap grid colXs/rowYs to overlapping rulings within `snap_tol_pt` and guarantee valid geometry."""
    bx = cand.bbox
    tw = max(1.0, bx[2] - bx[0])
    th = max(1.0, bx[3] - bx[1])

    v_targets = [
        (r.x0 + r.x1) * 0.5
        for r in rulings
        if r.orient == "v"
        and min(r.y1, bx[3] + snap_tol_pt) - max(r.y0, bx[1] - snap_tol_pt) >= min(8.0, th * 0.25)
    ]
    h_targets = [
        (r.y0 + r.y1) * 0.5
        for r in rulings
        if r.orient == "h"
        and min(r.x1, bx[2] + snap_tol_pt) - max(r.x0, bx[0] - snap_tol_pt) >= min(8.0, tw * 0.25)
    ]

    max_w = page_size[0] if page_size else None
    max_h = page_size[1] if page_size else None

    new_cols, col_map = _snap_axis(
        cand.colXs,
        v_targets,
        tol=snap_tol_pt,
        page_max=max_w,
        min_step=min_cell_dim_pt,
    )
    new_rows, row_map = _snap_axis(
        cand.rowYs,
        h_targets,
        tol=snap_tol_pt,
        page_max=max_h,
        min_step=min_cell_dim_pt,
    )

    if len(new_cols) < 2 or len(new_rows) < 2:
        return cand

    norm_cells = _normalize_cells(cand.cells, new_cols, new_rows, row_map, col_map)
    norm_cells, new_cols, new_rows = _prune_unused_cuts(norm_cells, new_cols, new_rows)
    snapped_bbox: BBox = (new_cols[0], new_rows[0], new_cols[-1], new_rows[-1])
    return TableCandidate(
        id=cand.id,
        bbox=snapped_bbox,
        colXs=new_cols,
        rowYs=new_rows,
        cells=norm_cells,
        hasRulings=cand.hasRulings,
        source=cand.source,
    )

