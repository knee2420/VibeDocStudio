"""Tests for Korean markers, headings, list hanging indent reflow, captions, fields, two-column order, and cache."""
from __future__ import annotations

from pathlib import Path

import pymupdf
from docstruct_engine.build import build_doc_ir, build_page_ir
from docstruct_engine.ir.model import (
    CaptionBlock,
    FieldBlock,
    HeadingBlock,
    ListItemBlock,
    NoteBlock,
    PageSize,
    ParagraphBlock,
    Word,
)
from docstruct_engine.ir.validate import validate_page_ir


def test_headings_lists_fields_captions_and_two_column_reading_order() -> None:
    words = [
        # Full-width top heading (centered around x=297)
        Word(id="w0", text="1.", bbox=(210, 60, 228, 80), size=16.0, bold=True),
        Word(id="w1", text="사업", bbox=(234, 60, 275, 80), size=16.0, bold=True),
        Word(id="w2", text="개요", bbox=(281, 60, 330, 80), size=16.0, bold=True),
        # Left column list item with wrapped continuation line (hanging indent)
        Word(id="w3", text="가.", bbox=(50, 110, 66, 122), size=10.0),
        Word(id="w4", text="첫번째", bbox=(74, 110, 112, 122), size=10.0),
        Word(id="w5", text="항목입니다", bbox=(118, 110, 180, 122), size=10.0),
        Word(id="w6", text="계속", bbox=(74, 126, 98, 138), size=10.0),
        Word(id="w7", text="이어집니다", bbox=(104, 126, 175, 138), size=10.0),
        # Left column paragraph below list
        Word(id="w8", text="좌측", bbox=(50, 160, 80, 172), size=10.0),
        Word(id="w9", text="본문", bbox=(86, 160, 118, 172), size=10.0),
        Word(id="w10", text="문단", bbox=(124, 160, 160, 172), size=10.0),
        # Right column paragraph
        Word(id="w11", text="우측", bbox=(320, 110, 355, 122), size=10.0),
        Word(id="w12", text="칼럼", bbox=(361, 110, 395, 122), size=10.0),
        Word(id="w13", text="내용", bbox=(401, 110, 440, 122), size=10.0),
        # Right column circled list
        Word(id="w14", text="①", bbox=(320, 145, 332, 157), size=10.0),
        Word(id="w15", text="세부", bbox=(338, 145, 365, 157), size=10.0),
        Word(id="w16", text="사항", bbox=(371, 145, 410, 157), size=10.0),
        # Standalone sign field near bottom
        Word(id="w17", text="신청인:", bbox=(320, 680, 370, 694), size=10.0),
        Word(id="w18", text="____", bbox=(376, 680, 415, 694), size=10.0),
        Word(id="w19", text="(서명)", bbox=(420, 680, 460, 694), size=10.0),
        # Footnote / annotation + caption
        Word(id="w20", text="※", bbox=(50, 720, 62, 731), size=9.0),
        Word(id="w21", text="첨부", bbox=(68, 720, 95, 731), size=9.0),
        Word(id="w22", text="참조", bbox=(101, 720, 130, 731), size=9.0),
        Word(id="w23", text="표", bbox=(50, 500, 65, 512), size=10.0),
        Word(id="w24", text="1.", bbox=(70, 500, 84, 512), size=10.0),
        Word(id="w25", text="요약", bbox=(90, 500, 120, 512), size=10.0),
    ]

    page_ir = build_page_ir(
        words,
        [],
        page_index=1,
        page_size=PageSize(width=595, height=842),
    )
    assert validate_page_ir(page_ir).violations == []

    kinds = {b.id: b for b in page_ir.blocks}
    assert any(isinstance(b, HeadingBlock) and "사업 개요" in (b.text or "") for b in page_ir.blocks)
    list_blocks = [b for b in page_ir.blocks if isinstance(b, ListItemBlock)]
    assert len(list_blocks) == 2
    hang_item = next(b for b in list_blocks if b.marker == "가.")
    assert hang_item.hangingIndentPt >= 4.0
    assert "계속 이어집니다" in (hang_item.text or "")
    assert any(isinstance(b, FieldBlock) and b.fieldKind == "sign" for b in page_ir.blocks)
    assert any(isinstance(b, NoteBlock) for b in page_ir.blocks)
    assert any(isinstance(b, CaptionBlock) for b in page_ir.blocks)

    # Full-width heading precedes both columns; left column precedes right column in the two-column band
    ordered = [kinds[bid] for bid in page_ir.readingOrder]
    idx_head = next(i for i, b in enumerate(ordered) if isinstance(b, HeadingBlock))
    idx_left_p = next(i for i, b in enumerate(ordered) if isinstance(b, ParagraphBlock) and "좌측" in (b.text or ""))
    idx_right_p = next(i for i, b in enumerate(ordered) if isinstance(b, ParagraphBlock) and "우측" in (b.text or ""))
    assert idx_head < idx_left_p < idx_right_p


def test_build_doc_ir_caches_and_reloads(tmp_path: Path) -> None:
    pdf_path = tmp_path / "doc.pdf"
    doc = pymupdf.open()
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((72, 80), "Document Title", fontsize=18, fontname="helv")
    p1.insert_text((72, 120), "Body paragraph line one.", fontsize=10, fontname="helv")
    doc.save(str(pdf_path))
    doc.close()

    cache_root = tmp_path / "cache"
    ir1 = build_doc_ir(pdf_path, cache_root=cache_root)
    assert len(ir1.pages) == 1
    assert validate_page_ir(ir1.pages[0]).violations == []

    cache_dir = cache_root / "docstruct" / ir1.srcHash
    assert (cache_dir / "p1.ir.json").is_file()
    assert (cache_dir / "p1.png").is_file()
    assert (cache_dir / "p1.acq.json").is_file()

    # Second load reads cached p1.ir.json cleanly
    ir2 = build_doc_ir(pdf_path, cache_root=cache_root)
    assert ir2.pages[0].readingOrder == ir1.pages[0].readingOrder
