"""Fillable field classification F1 evaluation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel

from ..ir.model import BBox, FieldBlock, PageIR, TableIR, bbox_iou


class FieldEvalResult(BaseModel):
    precision: float
    recall: float
    f1: float
    matched: int
    predCount: int
    goldCount: int


@dataclass
class _FieldItem:
    kind: str
    bbox: Optional[BBox]
    label: str


def _extract_fields(page: PageIR) -> list[_FieldItem]:
    items: list[_FieldItem] = []
    for blk in page.blocks:
        if isinstance(blk, FieldBlock):
            items.append(_FieldItem(kind=blk.fieldKind, bbox=blk.bbox, label=blk.label.strip()))
        elif isinstance(blk, TableIR):
            for cell in blk.cells:
                if cell.field is not None:
                    items.append(
                        _FieldItem(
                            kind=cell.field.kind,
                            bbox=cell.bbox,
                            label=cell.field.label.strip(),
                        )
                    )
    return items


def evaluate_fields(pred_page: PageIR, gold_page: PageIR, *, iou_thresh: float = 0.3) -> FieldEvalResult:
    preds = _extract_fields(pred_page)
    golds = _extract_fields(gold_page)
    if not preds and not golds:
        return FieldEvalResult(precision=1.0, recall=1.0, f1=1.0, matched=0, predCount=0, goldCount=0)
    if not preds or not golds:
        return FieldEvalResult(
            precision=0.0,
            recall=0.0,
            f1=0.0,
            matched=0,
            predCount=len(preds),
            goldCount=len(golds),
        )

    used_pred: set[int] = set()
    matched = 0
    for g in golds:
        best_pi: Optional[int] = None
        best_score = -1.0
        for pi, p in enumerate(preds):
            if pi in used_pred or p.kind != g.kind:
                continue
            if g.bbox is not None and p.bbox is not None:
                score = bbox_iou(g.bbox, p.bbox)
                if score >= iou_thresh and score > best_score:
                    best_score = score
                    best_pi = pi
            elif g.label and p.label and g.label == p.label:
                best_score = 1.0
                best_pi = pi
        if best_pi is not None:
            used_pred.add(best_pi)
            matched += 1

    precision = matched / len(preds)
    recall = matched / len(golds)
    f1 = (2.0 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return FieldEvalResult(
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1=round(f1, 4),
        matched=matched,
        predCount=len(preds),
        goldCount=len(golds),
    )

