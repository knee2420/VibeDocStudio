"""resource 검증기 — 사실의 출처: 적은 출처를 실제로 읽었나 · 출처를 적었나 · 근거에 없는 수치를 지어냈나."""
from __future__ import annotations

import os

from . import Candidate, Context, Report, gate_msg, num_core, nums


def sources_read_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    for src in cand.sources:
        if not src.startswith("res:"):
            continue
        p = src[4:].split("#")[0]
        np_ = os.path.normcase(os.path.normpath(p))
        if np_ not in ctx.read_paths and not any(rp.endswith(np_) for rp in ctx.read_paths):
            report.warnings.append(gate_msg("resource", "notRead", tag=cand.tag, path=p))


def sources_declared_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    if ctx.mode == "compose" and not cand.sources:
        report.warnings.append(gate_msg("resource", "noSources", tag=cand.tag))


def unsourced_numbers_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    if ctx.mode == "restore":
        return
    missing = sorted({n for n in nums(cand.text) if num_core(n) not in ctx.corpus_nums})
    if missing:
        report.warnings.append(gate_msg("resource", "unsourcedNumbers", tag=cand.tag, nums=", ".join(missing[:8])))


CANDIDATE_GATES = {
    "resource.sources_read": sources_read_gate,
    "resource.sources_declared": sources_declared_gate,
    "resource.unsourced_numbers": unsourced_numbers_gate,
}
