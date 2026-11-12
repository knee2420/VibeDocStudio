"""WP0 measurement tests: C0 truth, C3 prediction, C4 probe stub, and fixture regression traps."""
from __future__ import annotations

import sys
from pathlib import Path

_TESTS_DIR = Path(__file__).resolve().parent
if str(_TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(_TESTS_DIR))

import pytest

from docstruct_engine import build_doc_ir
from docstruct_engine.compile.docstruct_vdoc import doc_ir_pages_to_vdoc, finalize_vdoc_envelope
from docstruct_engine.config import load_thresholds
from docstruct_engine.verify.layout_checks import evaluate_page_layout, summarize_layout_suite
from docstruct_engine.verify.layout_measure import probe_vdoc_dom
from docstruct_engine.verify.layout_truth import extract_doc_layout_truth

from fixtures.layout import ALL_FIXTURE_NAMES, build_layout_fixture


def _eval_fixture(name: str, tmp_path: Path):
    pdf_path = build_layout_fixture(name, tmp_path)
    th = load_thresholds()
    bg_cover = float((th.get("layout") or {}).get("pageBgCoverRatio", 0.75))
    doc_ir = build_doc_ir(str(pdf_path), render_png=False)
    truths = extract_doc_layout_truth(str(pdf_path), bg_cover_ratio=bg_cover)
    vpages, vslots, creports = doc_ir_pages_to_vdoc(doc_ir.pages, title=name)
    _ = finalize_vdoc_envelope(vpages, vslots, title=name)
    reports = [
        evaluate_page_layout(
            tr,
            pir,
            vpg,
            vslots,
            compiled_report=crep,
            thresholds=th,
        )
        for tr, pir, vpg, crep in zip(truths, doc_ir.pages, vpages, creports)
    ]
    return doc_ir, truths, vpages, vslots, creports, reports


def test_wp0_all_fixtures_build_and_truth_extracts(tmp_path: Path) -> None:
    for name in ALL_FIXTURE_NAMES:
        pdf_path = build_layout_fixture(name, tmp_path)
        assert pdf_path.is_file()
        truths = extract_doc_layout_truth(str(pdf_path))
        assert len(truths) >= 1


def test_wp0_block_map_and_slot_map_populated(tmp_path: Path) -> None:
    doc_ir, _, vpages, _, creports, _ = _eval_fixture("narrow_center_cell", tmp_path)
    assert len(creports) == 1
    rep = creports[0]
    assert len(rep.blockMap) >= 1
    assert any(ir_id in rep.slotMap for ir_id in rep.blockMap)
    vdoc_block_ids = {b["blockId"] for b in vpages[0]["blocks"]}
    assert all(vb in vdoc_block_ids for vb in rep.blockMap.values())


def test_wp0_catches_known_baseline_layout_gaps(tmp_path: Path) -> None:
    # 1. narrow_center_cell: current S1 symmetric min(12, gap) padding + L2 wrap issue
    _, _, _, _, _, r_narrow = _eval_fixture("narrow_center_cell", tmp_path)
    assert any(not r.ok for r in r_narrow) or r_narrow[0].l2TableCellLineMatch < 1.0

    # 2. left_right_same_line: current S2 merges/stacks or misses columns-grid -> L3 < 1
    _, _, _, _, _, r_lr = _eval_fixture("left_right_same_line", tmp_path)
    assert not r_lr[0].ok
    assert r_lr[0].l3LineGroupF1 < 0.95

    # 3. page_background_panel: S10 missing background -> A2 fails
    _, _, _, _, _, r_bg = _eval_fixture("page_background_panel", tmp_path)
    assert not r_bg[0].a2PageBgOk

    # 4. running_header_logo: S6 multi-page logo+header not isolated uniformly -> A3 fails
    _, _, _, _, _, r_rh = _eval_fixture("running_header_logo", tmp_path)
    assert any(not r.a3HeaderFooterOk for r in r_rh)

    # 5. raster_text_photo: S9 scan OCR/figure photo separation defect -> L6 or L4
    _, truths_r, _, _, _, r_scan = _eval_fixture("raster_text_photo", tmp_path)
    assert len(truths_r[0].photoRegions) >= 1
    assert not r_scan[0].ok


def test_wp0_c4_probe_helper_stubbed() -> None:
    measured = probe_vdoc_dom(
        page_number=1,
        evaluator=lambda _js: {
            "sheetWidthPx": 794.0,
            "sheetHeightPx": 1123.0,
            "contentScrollHeightPx": 1180.0,
            "overflowPx": 57.0,
            "background": "rgb(255, 255, 255)",
            "cells": [
                {
                    "slotId": "s1",
                    "cellId": "c1",
                    "clientWidth": 60,
                    "clientHeight": 42,
                    "scrollHeight": 42,
                    "lineCount": 2,
                    "paddingTop": 4,
                    "paddingRight": 16,
                    "paddingBottom": 4,
                    "paddingLeft": 16,
                }
            ],
        },
    )
    assert measured is not None
    assert measured.hasOverflow is True
    assert measured.overflowPx == 57.0
    assert measured.cells[0].lineCount == 2


def test_wp0_suite_summary_counts(tmp_path: Path) -> None:
    reports = []
    for name in ("narrow_center_cell", "left_right_same_line"):
        _, _, _, _, _, reps = _eval_fixture(name, tmp_path)
        reports.extend(reps)
    summary = summarize_layout_suite(reports)
    assert summary["pages"] == 2
    assert "l2TableCellLineMatch" in summary