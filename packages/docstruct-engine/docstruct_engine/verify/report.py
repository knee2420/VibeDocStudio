"""Page and document evaluation report models and threshold checks."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from ..ir.validate import ValidationResult
from .layout_checks import LayoutPageReport


class PageVerifyReport(BaseModel):
    pageIndex: int
    sourceKind: str
    ok: bool
    rulingLineF1: float = 1.0
    teds: Optional[float] = None
    tedsS: Optional[float] = None
    ned: Optional[float] = None
    fieldF1: Optional[float] = None
    ocrConfMean: Optional[float] = None
    lowConfWordCount: int = 0
    validation: ValidationResult
    missingLineBoxes: list[tuple[float, float, float, float]] = Field(default_factory=list)
    gateFailures: list[str] = Field(default_factory=list)
    layoutReport: Optional[LayoutPageReport] = None


class EvalReport(BaseModel):
    docId: str
    pages: list[PageVerifyReport] = Field(default_factory=list)
    passed: bool = True
    summary: dict[str, Any] = Field(default_factory=dict)


def format_eval_summary(report: EvalReport) -> str:
    lines = [f"Doc '{report.docId}' ({'PASS' if report.passed else 'FAIL'}): {len(report.pages)} pages"]
    for p in report.pages:
        parts = [f"p{p.pageIndex}", f"inv={'OK' if p.validation.ok else 'FAIL'}", f"lineF1={p.rulingLineF1:.3f}"]
        if p.teds is not None:
            parts.append(f"TEDS={p.teds:.3f}")
        if p.tedsS is not None:
            parts.append(f"TEDS-S={p.tedsS:.3f}")
        if p.ned is not None:
            parts.append(f"NED={p.ned:.3f}")
        if p.fieldF1 is not None:
            parts.append(f"fieldF1={p.fieldF1:.3f}")
        if p.gateFailures:
            parts.append(f"gaps={','.join(p.gateFailures)}")
        lines.append("  " + " | ".join(parts))
    return "\n".join(lines)

