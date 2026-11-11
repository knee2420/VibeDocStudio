"""블록 매핑 · HTML 새니타이저 · 스키마 검증기 단위 테스트."""
from __future__ import annotations

from webpage_fidelity_engine.extract import extract_article_ir
from webpage_fidelity_engine.layout import map_nodes_to_blocks, sanitize_slot_html
from webpage_fidelity_engine.verify import (
    REGISTERED_BLOCK_KINDS,
    validate_vdoc_document,
)


def test_generic_flex_image_strip_preserves_aspect_ratios_without_260px_cap() -> None:
    html = """
    <html><body><article>
      <h1>비율 테스트</h1>
      <div style="display: flex">
        <div style="width: 60%"><img src="https://cdn.example.com/wide.jpg" width="1200" height="800" /></div>
        <div style="width: 40%"><img src="https://cdn.example.com/tall.jpg" width="800" height="800" /></div>
      </div>
    </article></body></html>
    """
    ir = extract_article_ir(html, url="https://example.com/flex-strip")
    assert [n.kind for n in ir.nodes] == ["heading", "image_strip"]
    mapped = map_nodes_to_blocks(ir, target_height_px=1500, inline_images=False)
    grid = next(m for m in mapped if m.block["kind"] == "columns-grid")
    assert grid.block["widths"] == ["1.5fr", "1.0fr"]
    assert grid.block["columns"][0]["image"]["maxHeight"] != "260px"
    assert grid.block["columns"][0]["image"]["objectFit"] == "contain"


def test_sanitize_slot_html_strips_scripts_events_and_wraps_plain_text() -> None:
    dirty = '<script>alert(1)</script><span onclick="evil()">안녕</span><a href="javascript:void(0)">링크</a>'
    cleaned = sanitize_slot_html(dirty)
    assert "<script" not in cleaned
    assert "onclick" not in cleaned
    assert "javascript:" not in cleaned
    assert cleaned.startswith("<p>")


def test_aria_role_table_maps_to_structured_table_block() -> None:
    html = """
    <html><body><article>
      <h1>비교표 테스트</h1>
      <div role="table">
        <div role="row"><div role="cell">사용 목적</div><div role="cell">처리 방식</div></div>
        <div role="row"><div role="cell">대화 이어가기</div><div role="cell">저장된 상태 복원</div></div>
      </div>
    </article></body></html>
    """
    ir = extract_article_ir(html, url="https://example.com/aria-table")
    assert [n.kind for n in ir.nodes] == ["heading", "table"]
    mapped = map_nodes_to_blocks(ir, inline_images=False)
    tbl = next(m for m in mapped if m.block["kind"] == "structured-table")
    assert len(tbl.block["rows"]) == 2
    assert len(tbl.block["columnWidths"]) == 2
    assert all(m.block["kind"] in REGISTERED_BLOCK_KINDS for m in mapped)


def test_validate_vdoc_document_catches_missing_slot() -> None:
    bad_doc = {
        "pages": [{"pageId": "p1", "headerSlotId": "missing_hdr", "footerSlotId": "f1", "blocks": []}],
        "slots": {"f1": {"slotId": "f1", "content": "<p></p>"}},
    }
    errs = validate_vdoc_document(bad_doc)
    assert any("missing_hdr" in e for e in errs)
