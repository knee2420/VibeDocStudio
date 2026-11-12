"""Unit & integration tests for Checkpoint 2: Z-order occlusion, explicit spaces, and Korean continuation joins."""
from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from docstruct_engine.acquire.words import extract_vector_words
from docstruct_engine.blocks.markers import VisualLine, spans_from_words
from docstruct_engine.blocks.text_join import (
    join_lines_smart,
    join_words_smart,
    should_join_words_without_space,
)
from docstruct_engine.build import build_doc_ir
from docstruct_engine.ir.model import (
    BBox,
    PageIR,
    PageSize,
    ParagraphBlock,
    Word,
)


def _make_word(
    wid: str,
    text: str,
    bbox: BBox,
    *,
    bold: bool = False,
    font: str = "MalgunGothic",
    space_before: bool | None = None,
    trailing_space: bool | None = None,
) -> Word:
    return Word(
        id=wid,
        text=text,
        bbox=bbox,
        bold=bold,
        font=font,
        size=10.0,
        spaceBefore=space_before,
        trailingSpace=trailing_space,
    )


def test_zorder_white_fill_occlusion_filters_hidden_and_keeps_visible(tmp_path: Path) -> None:
    pdf_path = tmp_path / "occluded.pdf"
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=300)
    # Full-page white background fill (>45% page area) must never suppress text
    page.draw_rect(pymupdf.Rect(0, 0, 400, 300), fill=(1, 1, 1), color=None)
    page.insert_text((50, 100), "LEGACY", fontsize=12)
    # Subsequent opaque small white rect occludes LEGACY, then overlays CURRENT
    page.draw_rect(pymupdf.Rect(45, 85, 160, 108), fill=(1, 1, 1), color=None)
    page.insert_text((50, 100), "CURRENT", fontsize=12)
    page.insert_text((50, 150), "KEEPME", fontsize=12)
    doc.save(str(pdf_path))
    doc.close()

    cache_root = tmp_path / "cache" / "docstruct"
    doc_ir = build_doc_ir(pdf_path, cache_root=cache_root, force=True, render_png=False)
    pir = doc_ir.pages[0]
    joined = " ".join(w.text for w in pir.words)
    assert "LEGACY" not in joined
    assert "CURRENT" in joined
    assert "KEEPME" in joined
    assert pir.metrics is not None
    assert pir.metrics["occludedCharsFiltered"] == len("LEGACY")

    jsonl = (cache_root / doc_ir.srcHash / "pipeline.jsonl").read_text(encoding="utf-8").splitlines()
    acq_events = [json.loads(line) for line in jsonl if json.loads(line).get("stage") == "acquire"]
    assert acq_events and acq_events[0]["metrics"]["occludedCharsFiltered"] == len("LEGACY")


def test_zorder_white_fill_occlusion_rotated_page() -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=600)
    page.insert_text((100, 200), "HIDDEN", fontsize=12)
    page.draw_rect(pymupdf.Rect(95, 185, 180, 208), fill=(1, 1, 1), color=None)
    page.insert_text((100, 200), "VISIBLE", fontsize=12)
    page.set_rotation(90)

    stats: dict[str, int] = {}
    words = extract_vector_words(page, stats_out=stats)
    texts = [w.text for w in words]
    assert texts == ["VISIBLE"]
    assert stats["occludedCharsFiltered"] == len("HIDDEN")


def test_explicit_space_atom_splits_tight_words() -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=200)
    # Emit an explicit space glyph whose neighbor advance leaves only ~0.13*em visual gap (<0.20)
    page.insert_text((50, 100), "AB ", fontsize=10)
    page.insert_text((65.3, 100), "CD", fontsize=10)

    words = extract_vector_words(page)
    texts = [w.text for w in words]
    assert texts == ["AB", "CD"]
    assert words[1].spaceBefore is True


def test_korean_continuation_joins_and_negative_guards() -> None:
    # 1. Soft line-wrap joins
    wrap_cases = [
        ("작성하", "여", "작성하여"),
        ("임대사업자", "가", "임대사업자가"),
        ("행위", "를", "행위를"),
        ("특약", "으로", "특약으로"),
        ("부담", "한다.", "부담한다."),
        ("설명", "하고,", "설명하고,"),
    ]
    for l_txt, r_txt, expected in wrap_cases:
        w1 = _make_word("w1", l_txt, (400.0, 10.0, 500.0, 20.0))
        w2 = _make_word("w2", r_txt, (40.0, 24.0, 90.0, 34.0))
        assert join_words_smart([w1, w2]) == expected
        vl1 = VisualLine(words=[w1], bbox=w1.bbox, text=l_txt, baseline=20.0, font_size=10.0, bold=False)  # type: ignore[arg-type]
        vl2 = VisualLine(words=[w2], bbox=w2.bbox, text=r_txt, baseline=34.0, font_size=10.0, bold=False)  # type: ignore[arg-type]
        assert join_lines_smart([vl1, vl2], newline=False) == expected
        assert join_lines_smart([vl1, vl2], newline=True) == expected

    # 2. Same-line Bold -> Regular mid-word splits (spaceBefore=False + style change)
    bold_cases = [
        ("부담", "으로", "부담으로"),
        ("제시", "해야", "제시해야"),
        ("관리", "한다.", "관리한다."),
        ("가입", "을", "가입을"),
        ("임대보증금", "은", "임대보증금은"),
    ]
    for l_txt, r_txt, expected in bold_cases:
        w1 = _make_word("w1", l_txt, (100.0, 10.0, 140.0, 20.0), bold=True, font="MalgunGothicBold")
        w2 = _make_word("w2", r_txt, (143.5, 10.0, 170.0, 20.0), bold=False, font="MalgunGothic", space_before=False)
        assert join_words_smart([w1, w2]) == expected

    # 3. Strict negative guards: legitimate spaces MUST be kept
    guard_cases = [
        (_make_word("w1", "안", (100.0, 10.0, 110.0, 20.0), space_before=None),
         _make_word("w2", "된다.", (40.0, 24.0, 70.0, 34.0)), "안 된다."),
        (_make_word("w1", "내야", (100.0, 10.0, 120.0, 20.0)),
         _make_word("w2", "한다.", (124.0, 10.0, 150.0, 20.0), space_before=True), "내야 한다."),
        (_make_word("w1", "내게", (400.0, 10.0, 420.0, 20.0)),
         _make_word("w2", "할", (40.0, 24.0, 55.0, 34.0)), "내게 할"),
        (_make_word("w1", "연락", (400.0, 10.0, 420.0, 20.0), trailing_space=True),
         _make_word("w2", "할", (40.0, 24.0, 55.0, 34.0)), "연락 할"),
        (_make_word("w1", "등", (100.0, 10.0, 110.0, 20.0)),
         _make_word("w2", "설명의", (112.0, 10.0, 140.0, 20.0), bold=True, space_before=True), "등 설명의"),
        (_make_word("w1", "전대", (100.0, 10.0, 120.0, 20.0), bold=True),
         _make_word("w2", "하는", (125.0, 10.0, 145.0, 20.0), bold=False, space_before=True), "전대 하는"),
        (_make_word("w1", "예치한", (100.0, 10.0, 130.0, 20.0), bold=False),
         _make_word("w2", "임대보증금", (134.0, 10.0, 185.0, 20.0), bold=True, space_before=False), "예치한 임대보증금"),
    ]
    for w1, w2, expected in guard_cases:
        assert not should_join_words_without_space(w1, w2)
        assert join_words_smart([w1, w2]) == expected


def test_spans_from_words_and_vdoc_inline_html_no_space_across_style_flip() -> None:
    from docstruct_engine.compile.docstruct_vdoc import doc_ir_pages_to_vdoc

    w1 = _make_word("w1", "임대보증금", (50.0, 40.0, 100.0, 50.0), bold=True, font="MalgunGothicBold")
    w2 = _make_word("w2", "은", (104.0, 40.0, 114.0, 50.0), bold=False, font="MalgunGothic", space_before=False)
    w3 = _make_word("w3", "반환한다.", (118.0, 40.0, 160.0, 50.0), bold=False, font="MalgunGothic", space_before=True)
    spans = spans_from_words([w1, w2, w3])
    assert len(spans) == 2

    page_ir = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=[w1, w2, w3],
        blocks=[
            ParagraphBlock(
                id="p0",
                bbox=(50.0, 40.0, 160.0, 50.0),
                wordIds=["w1", "w2", "w3"],
                text=join_words_smart([w1, w2, w3]),
                spans=spans,
            )
        ],
        readingOrder=["p0"],
    )
    seq = iter(range(1, 20))
    _pages, slots, _ = doc_ir_pages_to_vdoc([page_ir], uid=lambda: str(next(seq)))
    html = "\n".join(str(s.get("content") or "") for s in slots.values())
    assert "<strong>임대보증금</strong>은 반환한다." in html

