"""PDF/스캔 docstruct-engine ↔ doc_text / vibefs hook / DocTools 통합 테스트."""
from __future__ import annotations

import copy
import time
from pathlib import Path
from typing import Any

import pymupdf
import pytest
from docstruct_engine.cache import doc_cache_dir, file_src_hash, load_page_ir
from docstruct_engine.ir.model import ParagraphBlock, TableIR, Word
from harness_kit import doc_text

from tests.test_compose_tools import FakeApi, FakeStore
from vibefs.doc_tools import DocTools
from vibefs.hook import decide
from vibefs.index import MountItem, WorkspaceIndex
from vibefs.store import WorkspaceStore


class _RealFsIndex:
    class _Entry:
        def __init__(self, rel: str, abs_path: str, rid: str) -> None:
            self.rel = rel
            self.abs_path = abs_path
            self.resource_id = rid

    def __init__(self, entries: list[tuple[str, Path, str]]) -> None:
        self.files = [self._Entry(rel, str(p.resolve()), rid) for rel, p, rid in entries]

    def get(self, path: str) -> _Entry | None:
        key = path.replace("\\", "/").lstrip("/")
        for entry in self.files:
            if entry.rel.replace("\\", "/") == key:
                return entry
        return None


def _draw_table(
    page: pymupdf.Page,
    x0: float,
    y0: float,
    col_widths: list[float],
    row_heights: list[float],
    cells: list[list[str | list[tuple[str, float]]]],
) -> None:
    xs = [x0]
    for w in col_widths:
        xs.append(xs[-1] + w)
    ys = [y0]
    for h in row_heights:
        ys.append(ys[-1] + h)
    for x in xs:
        page.draw_line((x, ys[0]), (x, ys[-1]), width=1.0)
    for y in ys:
        page.draw_line((xs[0], y), (xs[-1], y), width=1.0)
    for r, row in enumerate(cells):
        for c, val in enumerate(row):
            baseline_y = ys[r] + 15.0
            if isinstance(val, str):
                page.insert_text((xs[c] + 8.0, baseline_y), val, fontsize=10)
            else:
                for token, dx in val:
                    page.insert_text((xs[c] + 8.0 + dx, baseline_y), token, fontsize=10)


def _make_vector_pdf(path: Path) -> Path:
    doc = pymupdf.open()
    # Page 1: title + paragraph + ruled 2x2 table (cell (1,0) splits into 2 adjacent words)
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((60, 70), "1. Overview", fontsize=16)
    p1.insert_text((60, 105), "Alpha Beta Gamma overview sentence.", fontsize=11)
    _draw_table(
        p1,
        x0=60.0,
        y0=140.0,
        col_widths=[180.0, 180.0],
        row_heights=[24.0, 24.0],
        cells=[
            ["Item", "Owner"],
            [[("Task", 0.0), ("One", 38.0)], "Alice"],
        ],
    )
    # Page 2: second page with a 2x2 table for 2-reject fallback testing
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((60, 70), "2. Details", fontsize=16)
    p2.insert_text((60, 105), "Delta Epsilon summary paragraph.", fontsize=11)
    _draw_table(
        p2,
        x0=60.0,
        y0=140.0,
        col_widths=[160.0, 160.0],
        row_heights=[24.0, 24.0],
        cells=[
            ["Code", "Note"],
            ["K01", "Original"],
        ],
    )
    doc.save(str(path))
    doc.close()
    return path


def _make_scan_pdf(path: Path, png_tmp: Path) -> Path:
    src = pymupdf.open()
    pg = src.new_page(width=300, height=200)
    pg.draw_rect(pymupdf.Rect(20, 20, 260, 120), color=(0, 0, 0), width=1.0)
    pix = pg.get_pixmap(dpi=150)
    pix.save(str(png_tmp))
    src.close()

    doc = pymupdf.open()
    scan_page = doc.new_page(width=300, height=200)
    scan_page.insert_image(scan_page.rect, filename=str(png_tmp))
    doc.save(str(path))
    doc.close()
    return path


class _MockOcrPort:
    def __init__(self) -> None:
        self.calls: int = 0

    def recognize(
        self,
        image_path: Path,
        page_size_pt: tuple[float, float],
        *,
        dpi: int = 300,
    ) -> list[Word]:
        self.calls += 1
        assert image_path.is_file() and dpi > 0 and page_size_pt[0] > 0
        return [
            Word(id="w0", text="Hello", bbox=(30.0, 40.0, 80.0, 54.0), conf=0.95, src="ocr"),
            Word(id="w1", text="Scan", bbox=(88.0, 40.0, 130.0, 54.0), conf=0.92, src="ocr"),
        ]


def test_pdf_render_index_and_hook_png_exemption(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    derived = tmp_path / "derived"
    monkeypatch.setenv("VIBE_DERIVED_DIR", str(derived))

    mount_dir = tmp_path / "mount"
    mount_dir.mkdir()
    pdf_path = _make_vector_pdf(mount_dir / "spec.pdf")

    rendered = doc_text.render(str(pdf_path))
    assert rendered.kind == "pdf"
    assert "<!-- page 1 -->" in rendered.text and "<!-- page 2 -->" in rendered.text
    assert "[표 p1-1]" in rendered.text
    assert "Owner" in rendered.text and "Alice" in rendered.text

    derived_txt = doc_text.derived_path(str(pdf_path))
    assert derived_txt is not None and Path(derived_txt).is_file()
    assert doc_text.source_of(derived_txt) == str(pdf_path.resolve())

    items = [MountItem(str(mount_dir), "dir_1", "mount", kind="dir")]
    idx = WorkspaceIndex.build(items)
    entry = idx.get("mount/spec.pdf")
    assert entry is not None and entry.is_text

    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_mount("asst-1", items, "conv-1")

    redirect = decide(
        {"toolCall": {"name": "read_file", "args": {"Path": str(pdf_path)}}, "conversationId": "conv-1"},
        store,
    )
    assert redirect["decision"] == "allow"
    assert doc_text.source_of(redirect["overwrite"]["Path"]) == str(pdf_path.resolve())

    # docstruct PNG 캐시 허용 및 외부 PNG 차단 검증
    api = FakeApi()
    tools = DocTools(FakeStore({"projectId": "p1"}), "s1", index=_RealFsIndex([("mount/spec.pdf", pdf_path, "f1")]), api=api)  # type: ignore[arg-type]
    tools.call("dc_pdf_open", {"path": "mount/spec.pdf", "pages": "1"})
    src_hash = file_src_hash(str(pdf_path.resolve()))
    p1_png = doc_cache_dir(derived / "docstruct", src_hash) / "p1.png"
    assert p1_png.is_file()

    allow_png = decide(
        {"toolCall": {"name": "read_file", "args": {"Path": str(p1_png)}}, "conversationId": "conv-1"},
        store,
    )
    assert allow_png == {"decision": "allow"}

    external_png = tmp_path / "outside.png"
    external_png.write_bytes(b"\x89PNG\r\n\x1a\n")
    deny_ext = decide(
        {"toolCall": {"name": "read_file", "args": {"Path": str(external_png)}}, "conversationId": "conv-1"},
        store,
    )
    assert deny_ext["decision"] == "deny"


def test_doctools_pdf_workflow_verify_reconcile_and_inplace_reimport(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    derived = tmp_path / "derived"
    monkeypatch.setenv("VIBE_DERIVED_DIR", str(derived))

    pdf_path = _make_vector_pdf(tmp_path / "report.pdf")
    src_hash = file_src_hash(str(pdf_path.resolve()))
    cache_root = derived / "docstruct"
    cache_dir = doc_cache_dir(cache_root, src_hash)

    api = FakeApi()
    wb_store = FakeStore({"projectId": "proj-1", "references": []})
    index = _RealFsIndex([("docs/report.pdf", pdf_path, "file_pdf")])
    tools = DocTools(wb_store, "s1", index=index, api=api)  # type: ignore[arg-type]

    # 1) dc_pdf_open
    opened = tools.call("dc_pdf_open", {"path": "docs/report.pdf"})
    assert src_hash in opened and "vector" in opened
    p1_ir = load_page_ir(cache_dir, 1)
    p2_ir = load_page_ir(cache_dir, 2)
    assert p1_ir is not None and p2_ir is not None
    p1_tbl = next(b for b in p1_ir.blocks if isinstance(b, TableIR))
    p2_tbl = next(b for b in p2_ir.blocks if isinstance(b, TableIR))
    assert (cache_dir / "p1.png").is_file() and (cache_dir / "p2.png").is_file()

    # 2) dc_pdf_words (bbox filter inside cell (1,0) of page 1 table)
    c10 = next(c for c in p1_tbl.cells if c.r == 1 and c.c == 0)
    words_out = tools.call("dc_pdf_words", {"path": "docs/report.pdf", "page": 1, "bbox": list(c10.bbox or p1_tbl.bbox)})
    assert "Task" in words_out and "One" in words_out and len(c10.wordIds) == 2

    # 3) dc_table_propose: cross-cell fix rejected, contiguous multi-word fix accepted
    header_c00 = next(c for c in p1_tbl.cells if c.r == 0 and c.c == 0)
    header_c01 = next(c for c in p1_tbl.cells if c.r == 0 and c.c == 1)
    bad_tbl = tools.call(
        "dc_table_propose",
        {
            "path": "docs/report.pdf",
            "page": 1,
            "tableId": p1_tbl.id,
            "fixes": [{"wordIds": [header_c00.wordIds[0], header_c01.wordIds[0]], "text": "Merged"}],
        },
    )
    assert "1" in bad_tbl
    good_tbl = tools.call(
        "dc_table_propose",
        {
            "path": "docs/report.pdf",
            "page": 1,
            "tableId": p1_tbl.id,
            "fixes": [{"wordIds": list(c10.wordIds), "text": "Task One Corrected"}],
        },
    )
    assert "2x2" in good_tbl
    updated_p1 = load_page_ir(cache_dir, 1)
    assert updated_p1 is not None
    assert any(w.text == "Task One Corrected" for w in updated_p1.words)

    # 4) dc_table_propose 2-reject fallback on page 2
    p2_c00 = next(c for c in p2_tbl.cells if c.r == 0 and c.c == 0)
    p2_c01 = next(c for c in p2_tbl.cells if c.r == 0 and c.c == 1)
    rej1 = tools.call(
        "dc_table_propose",
        {
            "path": "docs/report.pdf",
            "page": 2,
            "tableId": p2_tbl.id,
            "fixes": [{"wordIds": [p2_c00.wordIds[0], p2_c01.wordIds[0]], "text": "Bad1"}],
        },
    )
    assert p2_tbl.id in rej1
    rej2 = tools.call(
        "dc_table_propose",
        {
            "path": "docs/report.pdf",
            "page": 2,
            "tableId": p2_tbl.id,
            "fixes": [{"wordIds": [p2_c00.wordIds[0], p2_c01.wordIds[0]], "text": "Bad2"}],
        },
    )
    assert p2_tbl.id in rej2
    fallback_p2 = load_page_ir(cache_dir, 2)
    assert fallback_p2 is not None
    fallback_tbl = next(b for b in fallback_p2.blocks if isinstance(b, TableIR) and b.id == p2_tbl.id)
    assert fallback_tbl.needsReview is True
    assert fallback_tbl.imageFallbackSrc and fallback_tbl.imageFallbackSrc.startswith("data:image/jpeg;base64,")

    # 5) dc_blocks_annotate (relabel paragraph -> heading + reorder, plus reject bad order)
    para_p1 = next(b for b in updated_p1.blocks if isinstance(b, ParagraphBlock))
    bad_ann = tools.call(
        "dc_blocks_annotate",
        {"path": "docs/report.pdf", "page": 1, "readingOrder": ["missing_id"]},
    )
    assert bad_ann and len(updated_p1.readingOrder) >= 1
    tools.call(
        "dc_blocks_annotate",
        {
            "path": "docs/report.pdf",
            "page": 1,
            "annotations": [{"blockId": para_p1.id, "kind": "heading", "headingLevel": 2, "text": "Updated Intro Heading"}],
            "readingOrder": list(reversed(updated_p1.readingOrder)),
        },
    )
    ann_p1 = load_page_ir(cache_dir, 1)
    assert ann_p1 is not None and ann_p1.readingOrder == list(reversed(updated_p1.readingOrder))

    # 6) dc_verify emits pending / sample tasks with readable crop PNGs inside docstruct cache
    verify_out = tools.call("dc_verify", {"path": "docs/report.pdf", "round": 1, "sampleTables": True})
    assert "report.pdf" in verify_out and (".png" in verify_out or "p1" in verify_out)

    # 7) dc_source_pages + dc_new + dc_import + in-place re-import replacement
    src_pages_out = tools.call("dc_source_pages", {"path": "docs/report.pdf"})
    assert "p1:" in src_pages_out and "p2:" in src_pages_out and "vector" in src_pages_out

    tools.call("dc_new", {"title": "PDF Import Draft", "surface": "paged", "genre": "report"})
    doc_id = wb_store.state["docId"]
    tools.call("dc_import", {"path": "docs/report.pdf", "pages": "1-2"})

    doc = api.docs[doc_id]
    assert len(doc["pages"]) == 2
    p1_vdoc_id_before = doc["pages"][0]["pageId"]
    p2_vdoc_id_before = doc["pages"][1]["pageId"]
    imports = doc["origin"]["imports"]
    assert len(imports) == 1 and len(imports[0]["pageMap"]) == 2
    # Page 2 table fell back to image -> image block with needsReview=True
    p2_img_blocks = [b for b in doc["pages"][1]["blocks"] if b["kind"] == "image"]
    assert p2_img_blocks and p2_img_blocks[0].get("needsReview") is True
    assert str(doc["slots"]).find("Task One Corrected") != -1

    # Re-edit page 1 table text and re-import ONLY page 1 -> replaces page 1 in-place!
    time.sleep(0.01)
    slots_before = copy.deepcopy(doc["slots"])
    assert slots_before  # non-empty
    tools.call(
        "dc_table_propose",
        {
            "path": "docs/report.pdf",
            "page": 1,
            "tableId": p1_tbl.id,
            "fixes": [{"wordIds": list(c10.wordIds), "text": "EditedInPlace"}],
        },
    )
    tools.call("dc_import", {"path": "docs/report.pdf", "pages": "1"})
    doc_after = api.docs[doc_id]
    assert len(doc_after["pages"]) == 2  # NOT 3!
    assert [p["pageNumber"] for p in doc_after["pages"]] == [1, 2]
    assert doc_after["pages"][0]["pageId"] != p1_vdoc_id_before
    assert doc_after["pages"][1]["pageId"] == p2_vdoc_id_before
    assert len(doc_after["origin"]["imports"]) == 2
    assert "EditedInPlace" in str(doc_after["slots"])
    assert "Task One Corrected" not in str(doc_after["slots"])  # pruned unused slots


def test_doctools_scan_pdf_mock_ocr_and_cache_recovery(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    derived = tmp_path / "derived"
    monkeypatch.setenv("VIBE_DERIVED_DIR", str(derived))

    scan_pdf = _make_scan_pdf(tmp_path / "scan.pdf", tmp_path / "scan_img.png")
    src_hash = file_src_hash(str(scan_pdf.resolve()))
    cache_dir = doc_cache_dir(derived / "docstruct", src_hash)

    mock_ocr = _MockOcrPort()
    api = FakeApi()
    tools = DocTools(
        FakeStore({"projectId": "proj-scan", "references": []}),
        "s1",
        index=_RealFsIndex([("scans/scan.pdf", scan_pdf, "file_scan")]),  # type: ignore[arg-type]
        api=api,  # type: ignore[arg-type]
        ocr_port=mock_ocr,
    )

    out = tools.call("dc_pdf_open", {"path": "scans/scan.pdf"})
    assert "scan" in out and mock_ocr.calls == 1
    pir = load_page_ir(cache_dir, 1)
    assert pir is not None and pir.sourceKind == "pdf-scan"
    assert [w.text for w in pir.words] == ["Hello", "Scan"]

    # Missing p1.ir.json -> on-demand rebuild via dc_pdf_words
    ir_file = cache_dir / "p1.ir.json"
    ir_file.unlink()
    words_out = tools.call("dc_pdf_words", {"path": "scans/scan.pdf", "page": 1})
    assert "Hello" in words_out and ir_file.is_file()

    # Corrupt p1.ir.json -> dc_pdf_open(force=True) rebuilds cleanly
    ir_file.write_text("{corrupt-json", encoding="utf-8")
    forced = tools.call("dc_pdf_open", {"path": "scans/scan.pdf", "force": True})
    assert "scan" in forced and load_page_ir(cache_dir, 1) is not None