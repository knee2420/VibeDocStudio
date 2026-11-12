"""Checkpoint 1 tests for cache layout, unused grid cut pruning, and telemetry logging."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pymupdf

from docstruct_engine.build import build_doc_ir
from docstruct_engine.cache import doc_cache_dir, file_src_hash
from docstruct_engine.ir.model import Ruling
from docstruct_engine.tables.candidates import CandidateCell, TableCandidate
from docstruct_engine.tables.snap import snap_candidate_grid
from docstruct_engine.telemetry import summarize_doc_metrics


def test_doc_cache_dir_prevents_double_docstruct_nesting(tmp_path: Path) -> None:
    d1 = doc_cache_dir(tmp_path / "cache", "abc123")
    d2 = doc_cache_dir(tmp_path / "cache" / "docstruct", "abc123")
    assert d1 == tmp_path / "cache" / "docstruct" / "abc123"
    assert d2 == tmp_path / "cache" / "docstruct" / "abc123"


def test_snap_candidate_grid_prunes_unused_interior_cuts() -> None:
    cand = TableCandidate(
        id="t0",
        bbox=(36.0, 488.0, 563.0, 606.0),
        colXs=[36.0, 563.0],
        rowYs=[488.0, 530.0, 606.0],
        cells=[CandidateCell(r=0, c=0, rs=2, cs=1, bbox=(36.0, 488.0, 563.0, 606.0))],
    )
    rulings = [
        Ruling(orient="h", x0=36.0, y0=488.0, x1=563.0, y1=488.0),
        Ruling(orient="h", x0=36.0, y0=606.0, x1=563.0, y1=606.0),
        Ruling(orient="v", x0=36.0, y0=488.0, x1=36.0, y1=606.0),
        Ruling(orient="v", x0=563.0, y0=488.0, x1=563.0, y1=606.0),
    ]
    snapped = snap_candidate_grid(cand, rulings)
    assert snapped.rowYs == [488.0, 606.0]
    assert len(snapped.cells) == 1
    assert snapped.cells[0].rs == 1


def test_pipeline_emits_structured_telemetry_and_jsonl(tmp_path: Path, caplog) -> None:
    pdf_path = tmp_path / "sample.pdf"
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=300)
    page.draw_rect(pymupdf.Rect(40, 40, 320, 140), color=(0.0, 0.0, 0.0), fill=(1.0, 1.0, 1.0), width=0.5)
    page.draw_line((40, 90), (320, 90), color=(0.0, 0.0, 0.0), width=0.5)
    page.draw_line((160, 40), (160, 140), color=(0.0, 0.0, 0.0), width=0.5)
    page.insert_text((50, 70), "ColA", fontsize=10)
    page.insert_text((170, 70), "ColB", fontsize=10)
    page.insert_text((50, 120), "ValA", fontsize=10)
    page.insert_text((170, 120), "ValB", fontsize=10)
    doc.save(str(pdf_path))
    doc.close()

    cache_root = tmp_path / "cache"
    with caplog.at_level(logging.INFO, logger="docstruct_engine"):
        doc_ir = build_doc_ir(pdf_path, cache_root=cache_root)

    src_hash = file_src_hash(pdf_path)
    log_file = cache_root / "docstruct" / src_hash / "pipeline.jsonl"
    assert log_file.is_file()
    stages = [json.loads(ln)["stage"] for ln in log_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert "acquire" in stages
    assert "page_ir_saved" in stages
    assert "build_doc" in stages
    assert any("stage=acquire" in rec.message for rec in caplog.records)

    summary = summarize_doc_metrics(doc_ir)
    assert summary["totalTables"] == 1
    assert summary["pages"][0]["tableShapes"] == ["t0:2x2(4)"]

