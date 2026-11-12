"""P3 tests for verify_page/verify_doc pendingReads, reread_plan round bounds, patch apply, and WinRT OCR."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from docstruct_engine.acquire.ocr import WindowsOcrAdapter
from docstruct_engine.ir.model import (
    CellIR,
    DocIR,
    HeadingBlock,
    PageIR,
    PageSize,
    ParagraphBlock,
    Ruling,
    TableIR,
    Word,
)
from docstruct_engine.reread import apply_reread_patch, reread_plan
from docstruct_engine.verify import verify_doc, verify_page
from PIL import Image, ImageDraw, ImageFont


def _corrupted_and_clean_doc(tmp_path: Path) -> tuple[DocIR, Path]:
    words_p1 = [
        Word(id="w0", text="Overview", bbox=(60, 60, 140, 75), size=11.0),
        Word(id="w1", text="A", bbox=(60, 110, 90, 124)),
        Word(id="w2", text="B", bbox=(200, 110, 230, 124)),
        Word(id="w_orphan", text="Stray", bbox=(350, 300, 390, 315)),
    ]
    rulings_p1 = [
        Ruling(orient="h", x0=50, y0=100, x1=300, y1=100),
        Ruling(orient="h", x0=50, y0=140, x1=300, y1=140),
        Ruling(orient="h", x0=50, y0=180, x1=300, y1=180),
        Ruling(orient="v", x0=50, y0=100, x1=50, y1=180),
        Ruling(orient="v", x0=180, y0=100, x1=180, y1=180),
        Ruling(orient="v", x0=300, y0=100, x1=300, y1=180),
    ]
    tbl_p1 = TableIR(
        id="t0",
        bbox=(50, 100, 300, 180),
        nRows=2,
        nCols=2,
        colXs=[50, 180, 300],
        rowYs=[100, 140, 180],
        needsReview=True,
        cells=[
            CellIR(r=0, c=0, role="th", bbox=(50, 100, 180, 140), wordIds=["w1"], text="A"),
            CellIR(r=0, c=1, role="th", bbox=(180, 100, 300, 140), wordIds=["w2"], text="B"),
            CellIR(r=1, c=0, bbox=(50, 140, 180, 180), text=""),
            CellIR(r=1, c=1, bbox=(180, 140, 300, 180), text=""),
        ],
    )
    p0_p1 = ParagraphBlock(id="p0", bbox=(60, 60, 140, 75), wordIds=["w0"], text="Overview")
    page1 = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595, height=842),
        words=words_p1,
        rulings=rulings_p1,
        blocks=[p0_p1, tbl_p1],
        readingOrder=["p0", "t0"],
    )

    # Clean passing page with a table (exercises round-1 spot-check sampling)
    words_p2 = [
        Word(id="w0", text="Col1", bbox=(60, 110, 100, 124)),
        Word(id="w1", text="Col2", bbox=(200, 110, 240, 124)),
        Word(id="w2", text="V1", bbox=(60, 150, 90, 164)),
        Word(id="w3", text="V2", bbox=(200, 150, 230, 164)),
    ]
    rulings_p2 = list(rulings_p1)
    tbl_p2 = TableIR(
        id="t1",
        bbox=(50, 100, 300, 180),
        nRows=2,
        nCols=2,
        colXs=[50, 180, 300],
        rowYs=[100, 140, 180],
        cells=[
            CellIR(r=0, c=0, role="th", bbox=(50, 100, 180, 140), wordIds=["w0"], text="Col1"),
            CellIR(r=0, c=1, role="th", bbox=(180, 100, 300, 140), wordIds=["w1"], text="Col2"),
            CellIR(r=1, c=0, bbox=(50, 140, 180, 180), wordIds=["w2"], text="V1"),
            CellIR(r=1, c=1, bbox=(180, 140, 300, 180), wordIds=["w3"], text="V2"),
        ],
    )
    page2 = PageIR(
        pageIndex=2,
        sourceKind="pdf-vector",
        size=PageSize(width=595, height=842),
        words=words_p2,
        rulings=rulings_p2,
        blocks=[tbl_p2],
        readingOrder=["t1"],
    )

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (595, 842), color=(255, 255, 255)).save(cache_dir / "p1.png")
    Image.new("RGB", (595, 842), color=(255, 255, 255)).save(cache_dir / "p2.png")

    doc = DocIR(docId="testdoc", pages=[page1, page2])
    return doc, cache_dir


def test_verify_pending_reads_and_reread_plan_rounds(tmp_path: Path) -> None:
    doc, cache_dir = _corrupted_and_clean_doc(tmp_path)
    bundle = verify_doc(doc)
    assert not bundle.report.passed
    assert any(pr.pageIndex == 1 and pr.kind == "table_reread" and pr.blockId == "t0" for pr in bundle.pendingReads)
    assert any(pr.pageIndex == 1 and pr.kind == "page_blocks" for pr in bundle.pendingReads)

    prep2, pend2 = verify_page(doc.pages[1])
    assert prep2.ok and pend2 == []

    # Round 1: failure tasks + up to verifySampleMaxTables (1) passing sample table on p2
    tasks_r1 = reread_plan(doc, round_num=1, verification=bundle, cache_dir=cache_dir, sample_tables=True)
    assert any(t.pageIndex == 1 and t.kind == "table_reread" and t.cropPngPath for t in tasks_r1)
    assert any(t.pageIndex == 1 and t.kind == "page_blocks" and t.prompt for t in tasks_r1)
    sample_tasks = [t for t in tasks_r1 if t.pageIndex == 2 and "SAMPLE_SPOT_CHECK" in t.reasons]
    assert len(sample_tasks) == 1
    assert sample_tasks[0].cropPngPath and Path(sample_tasks[0].cropPngPath).is_file()

    # Round 2 still allowed; Round 3 stopped cleanly by maxRereadRounds=2
    tasks_r2 = reread_plan(doc, round_num=2, verification=bundle, cache_dir=cache_dir)
    assert len(tasks_r2) >= 2
    assert reread_plan(doc, round_num=3, verification=bundle, cache_dir=cache_dir) == []


def test_apply_reread_patch_relabels_block(tmp_path: Path) -> None:
    doc, _ = _corrupted_and_clean_doc(tmp_path)
    clean_p = doc.pages[1].model_copy(deep=True)
    # Add a paragraph block cleanly owning a word
    clean_p.words.append(Word(id="w99", text="Section Title", bbox=(60, 50, 180, 66)))
    clean_p.blocks.insert(0, ParagraphBlock(id="p99", bbox=(60, 50, 180, 66), wordIds=["w99"], text="Section Title"))
    clean_p.readingOrder.insert(0, "p99")

    updated, res = apply_reread_patch(
        clean_p,
        block_annotations=[{"blockId": "p99", "kind": "heading", "level": 2}],
    )
    assert res.ok and res.errors == []
    assert isinstance(updated.blocks[0], HeadingBlock)
    assert updated.blocks[0].level == 2


def test_windows_ocr_adapter_ko_and_en_numeric_retry(tmp_path: Path) -> None:
    img_path = tmp_path / "scan.png"
    Image.new("RGB", (600, 200), color=(255, 255, 255)).save(img_path)

    ko_payload = {
        "width": 600,
        "height": 200,
        "lines": [
            {
                "text": "2026년 100%",
                "words": [
                    {"text": "합계", "x": 40, "y": 40, "w": 60, "h": 24},
                    {"text": "|OO%", "x": 120, "y": 40, "w": 70, "h": 24},
                ],
            }
        ],
    }
    en_payload = {
        "width": 600,
        "height": 200,
        "lines": [
            {
                "text": "100%",
                "words": [
                    {"text": "100%", "x": 120, "y": 40, "w": 70, "h": 24},
                ],
            }
        ],
    }

    def fake_run(_path: Path, lang: str, *, timeout_s: float = 45.0) -> dict:
        return ko_payload if lang == "ko" else en_payload

    adapter = WindowsOcrAdapter()
    with patch("docstruct_engine.acquire.ocr._run_ps_ocr", side_effect=fake_run):
        words = adapter.recognize(img_path, (300.0, 100.0), dpi=144)

    assert len(words) == 2
    assert words[0].text == "합계" and words[0].src == "ocr"
    assert words[1].text == "100%" and words[1].conf >= 0.7


@pytest.mark.skipif(sys.platform != "win32" or shutil.which("powershell") is None, reason="Windows WinRT OCR only")
def test_real_windows_winrt_ocr_smoke(tmp_path: Path) -> None:
    img_path = tmp_path / "real_ocr.png"
    img = Image.new("RGB", (800, 240), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = None
    for font_cand in ("C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/arial.ttf"):
        if Path(font_cand).is_file():
            font = ImageFont.truetype(font_cand, 42)
            break
    draw.text((60, 80), "TEST 2026", fill=(0, 0, 0), font=font)
    img.save(img_path)

    adapter = WindowsOcrAdapter()
    words = adapter.recognize(img_path, (400.0, 120.0), dpi=144)
    joined = " ".join(w.text for w in words).upper()
    assert "TEST" in joined or "2026" in joined

