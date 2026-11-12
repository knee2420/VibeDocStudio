"""WP7 verification loop and corrupted-input layout regression tests."""
from __future__ import annotations

import copy
import re
import sys
from pathlib import Path

_TESTS_DIR = Path(__file__).resolve().parent
if str(_TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(_TESTS_DIR))

from docstruct_engine import build_doc_ir
from docstruct_engine.compile.docstruct_vdoc import default_ocr_port, doc_ir_to_vdoc
from docstruct_engine.config import load_thresholds
from docstruct_engine.verify.layout_checks import evaluate_page_layout
from docstruct_engine.verify.layout_truth import extract_doc_layout_truth
from docstruct_engine.verify.verify import verify_doc, verify_page

from fixtures.layout import build_layout_fixture


def _build_clean_fixture(name: str, tmp_path: Path):
    pdf_path = build_layout_fixture(name, tmp_path)
    th = load_thresholds()
    bg_cover = float((th.get("layout") or {}).get("pageBgCoverRatio", 0.75))
    doc_ir = build_doc_ir(str(pdf_path), ocr_port=default_ocr_port(), render_png=False)
    truths = extract_doc_layout_truth(str(pdf_path), bg_cover_ratio=bg_cover)
    vdoc, creps = doc_ir_to_vdoc(doc_ir, title=name)
    return th, doc_ir, truths, vdoc, creps


def test_wp7_catches_three_corrupted_vdoc_mutations(tmp_path: Path) -> None:
    th = load_thresholds()

    # 1. Double cell padding on narrow_center_cell -> L2 wrap failure (or L7/L1) caught
    _, ir_n, tr_n, vd_n, cr_n = _build_clean_fixture("narrow_center_cell", tmp_path)
    clean_rep = evaluate_page_layout(
        tr_n[0],
        ir_n.pages[0],
        vd_n["pages"][0],
        vd_n["slots"],
        compiled_report=cr_n[0],
        thresholds=th,
    )
    assert clean_rep.ok

    bad_pad_page = copy.deepcopy(vd_n["pages"][0])
    for blk in bad_pad_page.get("blocks") or []:
        for row in blk.get("rows") or []:
            for cell in row.get("cells") or []:
                raw_pad = str(cell.get("padding") or "2px 4px 2px 4px")
                nums = [float(x) for x in re.findall(r"[0-9]+(?:\.[0-9]+)?", raw_pad)]
                while len(nums) < 4:
                    nums.append(nums[-1] if nums else 4.0)
                cell["padding"] = " ".join(f"{max(20.0, n * 2.0):.1f}px" for n in nums[:4])

    rep_pad = evaluate_page_layout(
        tr_n[0],
        ir_n.pages[0],
        bad_pad_page,
        vd_n["slots"],
        compiled_report=cr_n[0],
        thresholds=th,
    )
    assert not rep_pad.ok
    assert any(r.startswith(("L2_", "L7_", "L1_")) for r in rep_pad.reasons)

    # 2. Zero block spacing (spaceBefore = 0) on clause_paragraphs -> L5 failure caught
    _, ir_c, tr_c, vd_c, cr_c = _build_clean_fixture("clause_paragraphs", tmp_path)
    clean_c = evaluate_page_layout(
        tr_c[0],
        ir_c.pages[0],
        vd_c["pages"][0],
        vd_c["slots"],
        compiled_report=cr_c[0],
        thresholds=th,
    )
    assert clean_c.ok

    bad_gap_page = copy.deepcopy(vd_c["pages"][0])
    for blk in bad_gap_page.get("blocks") or []:
        blk["spaceBefore"] = 0.0

    rep_gap = evaluate_page_layout(
        tr_c[0],
        ir_c.pages[0],
        bad_gap_page,
        vd_c["slots"],
        compiled_report=cr_c[0],
        thresholds=th,
    )
    assert not rep_gap.ok
    assert any(r.startswith("L5_") for r in rep_gap.reasons)

    # 3. Strip page background on page_background_panel -> A2 failure caught
    _, ir_b, tr_b, vd_b, cr_b = _build_clean_fixture("page_background_panel", tmp_path)
    clean_b = evaluate_page_layout(
        tr_b[0],
        ir_b.pages[0],
        vd_b["pages"][0],
        vd_b["slots"],
        compiled_report=cr_b[0],
        thresholds=th,
    )
    assert clean_b.ok and clean_b.a2PageBgOk

    bad_bg_page = copy.deepcopy(vd_b["pages"][0])
    bad_bg_page.get("layout", {}).pop("background", None)

    rep_bg = evaluate_page_layout(
        tr_b[0],
        ir_b.pages[0],
        bad_bg_page,
        vd_b["slots"],
        compiled_report=cr_b[0],
        thresholds=th,
    )
    assert not rep_bg.ok
    assert not rep_bg.a2PageBgOk
    assert "A2_PAGE_BG_MISSING" in rep_bg.reasons


def test_wp7_verify_doc_attaches_layout_and_triage_skips_c3_c4(tmp_path: Path) -> None:
    th, doc_ir, truths, vdoc, creps = _build_clean_fixture("narrow_center_cell", tmp_path)
    bundle = verify_doc(doc_ir, thresholds=th)
    assert bundle.report.passed
    assert bundle.report.pages[0].layoutReport is not None
    assert bundle.report.pages[0].layoutReport.ok
    assert "layoutSummary" in (bundle.report.summary.get("docMetrics") or {})

    # C3-only failure (stripped CSS spaceBefore with clean C1 IR) must NOT enqueue a vision reread task
    _, ir_c, tr_c, vd_c, cr_c = _build_clean_fixture("clause_paragraphs", tmp_path)
    corrupted_vpg = copy.deepcopy(vd_c["pages"][0])
    corrupted_vpg["blocks"] = corrupted_vpg["blocks"][:1]
    corrupted_vpg["layout"] = dict(corrupted_vpg.get("layout") or {}, lineHeight="1.0")
    prep_c3, pend_c3 = verify_page(
        ir_c.pages[0],
        thresholds=th,
        layout_truth=tr_c[0],
        vdoc_page=corrupted_vpg,
        vdoc_slots=vd_c["slots"],
        compiled_report=cr_c[0],
    )
    assert not prep_c3.ok
    assert prep_c3.gateFailures
    assert pend_c3 == []

