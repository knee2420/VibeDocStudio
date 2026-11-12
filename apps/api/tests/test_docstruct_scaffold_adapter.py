"""DocStructScaffoldAgent 및 DocStructCatalogExtractorAdapter 단위·통합 테스트."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import pymupdf
from docstruct_engine.ir.model import Word
from fastapi.testclient import TestClient

from app.catalog.adapters import FilesystemCatalogRepository
from app.form_scaffold.adapters import DocStructScaffoldAgent
from app.llm.models import OneShotResult
from main import app

client = TestClient(app)


def _make_vector_table_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 72), "1. Overview", fontsize=16)
    page.insert_text((60, 108), "Standard specification body sentence.", fontsize=11)

    xs = [60.0, 240.0, 420.0]
    ys = [140.0, 168.0, 196.0]
    for x in xs:
        page.draw_line((x, ys[0]), (x, ys[-1]), width=1.0)
    for y in ys:
        page.draw_line((xs[0], y), (xs[-1], y), width=1.0)

    cells = [["ColA", "ColB"], ["Val1", "Val2"]]
    for r, row in enumerate(cells):
        for c, txt in enumerate(row):
            page.insert_text((xs[c] + 8.0, ys[r] + 18.0), txt, fontsize=10)
    return doc.tobytes()


def _make_scan_only_pdf() -> bytes:
    src = pymupdf.open()
    p = src.new_page(width=595, height=842)
    p.draw_rect(pymupdf.Rect(50, 50, 400, 120), color=(0.1, 0.1, 0.1), width=1.0)
    pix = p.get_pixmap(dpi=72)
    png_bytes = pix.tobytes("png")
    src.close()

    scan_doc = pymupdf.open()
    sp = scan_doc.new_page(width=595, height=842)
    sp.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=png_bytes)
    return scan_doc.tobytes()


class _FakeOcrPort:
    def __init__(self) -> None:
        self.called = False

    def recognize(
        self,
        image_path: Path,
        page_size_pt: tuple[float, float],
        *,
        dpi: int = 300,
    ) -> list[Word]:
        del image_path, page_size_pt, dpi
        self.called = True
        return [
            Word(
                id="ocr_1",
                text="ScannedTitle",
                bbox=(60.0, 60.0, 180.0, 82.0),
                size=16.0,
                bold=True,
                conf=0.95,
                src="ocr",
            ),
            Word(
                id="ocr_2",
                text="RecognizedTextLine",
                bbox=(60.0, 100.0, 220.0, 114.0),
                size=10.5,
                conf=0.92,
                src="ocr",
            ),
        ]


def test_docstruct_scaffold_agent_extracts_vector_table_and_blocks(tmp_path: Path) -> None:
    agent = DocStructScaffoldAgent(
        cache_root=tmp_path / "cache",
        work_root=tmp_path / "work",
        external_llm_enabled=False,
    )
    pdf_bytes = _make_vector_table_pdf()
    vdoc, checked_blocks, checked_slots, agent_run = agent.scaffold_document(
        pdf_bytes=pdf_bytes,
        doc_id="vdoc-vec-1",
        title="규격 문서",
        fidelity_mode="fast",
    )
    assert vdoc["docId"] == "vdoc-vec-1"
    assert vdoc["version"] == "1.0.0"
    assert vdoc["pages"][0]["pageLabel"] == "규격 문서 (1p)"
    assert checked_blocks >= 2
    assert checked_slots >= 4
    kinds = [b["kind"] for b in vdoc["pages"][0]["blocks"]]
    assert "structured-table" in kinds
    assert agent_run is not None
    assert agent_run["engine"] == "docstruct-engine"
    assert agent_run["rounds"] == 0
    assert agent_run["best"]["verdict"] == "PASS"


def test_docstruct_scaffold_agent_scan_pdf_uses_ocr_port(tmp_path: Path) -> None:
    fake_ocr = _FakeOcrPort()
    agent = DocStructScaffoldAgent(
        cache_root=tmp_path / "cache",
        work_root=tmp_path / "work",
        external_llm_enabled=False,
        ocr_port=fake_ocr,
    )
    vdoc, checked_blocks, _slots, agent_run = agent.scaffold_document(
        pdf_bytes=_make_scan_only_pdf(),
        doc_id="vdoc-scan-1",
        title="스캔 서식",
        fidelity_mode="fast",
    )
    assert fake_ocr.called is True
    assert checked_blocks >= 1
    assert agent_run is not None
    assert agent_run["sourceKinds"] == ["pdf-scan"]
    slots_text = " ".join(s.get("content", "") for s in vdoc["slots"].values())
    assert "ScannedTitle" in slots_text
    assert "RecognizedTextLine" in slots_text


def test_docstruct_scaffold_agent_runs_strict_vlm_reread_and_applies_table_patch(
    tmp_path: Path,
) -> None:
    captured_prompts: list[str] = []

    def fake_one_shot(prompt: str, **kwargs: Any) -> OneShotResult:
        del kwargs
        captured_prompts.append(prompt)
        return OneShotResult(
            ok=True,
            response={
                "html": (
                    "<table><thead><tr><th>ColA</th><th>ColB</th></tr></thead>"
                    "<tbody><tr><td>Val1</td><td>Val2</td></tr></tbody></table>"
                ),
                "fixes": [],
            },
        )

    agent = DocStructScaffoldAgent(
        cache_root=tmp_path / "cache",
        work_root=tmp_path / "work",
        external_llm_enabled=True,
        agentic_loop_enabled=True,
        one_shot=fake_one_shot,
        executable="agy",
        model="gemini-3.8-flash",
    )
    progress_stages: list[str] = []
    vdoc, checked_blocks, _slots, agent_run = agent.scaffold_document(
        pdf_bytes=_make_vector_table_pdf(),
        doc_id="vdoc-vlm-1",
        title="정밀 루프 테스트",
        fidelity_mode="strict",
        on_progress=lambda info: progress_stages.append(str(info.get("stage") or "")),
    )
    assert len(captured_prompts) >= 1
    assert "SAMPLE_SPOT_CHECK" in captured_prompts[0] or "table_reread" in captured_prompts[0]
    assert "rereading" in progress_stages
    assert checked_blocks >= 2
    assert agent_run is not None
    assert agent_run["rounds"] == 1
    assert agent_run["appliedPatches"] >= 1
    assert agent_run["best"]["verdict"] == "PASS"
    assert any(b["kind"] == "structured-table" for b in vdoc["pages"][0]["blocks"])


def test_docstruct_scaffold_agent_respects_cancellation(tmp_path: Path) -> None:
    agent = DocStructScaffoldAgent(
        cache_root=tmp_path / "cache",
        work_root=tmp_path / "work",
        external_llm_enabled=False,
    )
    cancel = threading.Event()
    cancel.set()
    vdoc, _blocks, _slots, agent_run = agent.scaffold_document(
        pdf_bytes=_make_vector_table_pdf(),
        doc_id="vdoc-cancel-1",
        title="취소 테스트",
        fidelity_mode="balanced",
        cancel_event=cancel,
    )
    assert vdoc["docId"] == "vdoc-cancel-1"
    assert agent_run is not None
    assert agent_run["status"] == "cancelled"


def test_docstruct_scaffold_agent_reread_page_blocks_upgrades_heading(
    tmp_path: Path,
) -> None:
    import re

    class _LowConfOcrPort:
        def recognize(
            self,
            image_path: Path,
            page_size_pt: tuple[float, float],
            *,
            dpi: int = 300,
        ) -> list[Word]:
            del image_path, page_size_pt, dpi
            return [
                Word(
                    id="ocr_low_1",
                    text="Section Header Target",
                    bbox=(60.0, 60.0, 220.0, 76.0),
                    size=10.5,
                    conf=0.50,
                    needsReview=True,
                    src="ocr",
                )
            ]

    seen_kinds: list[str] = []

    def fake_one_shot(prompt: str, **kwargs: Any) -> OneShotResult:
        del kwargs
        seen_kinds.append(prompt)
        match = re.search(r"-\s+([^\s(]+)\s+\(", prompt)
        bid = match.group(1) if match else ""
        return OneShotResult(
            ok=True,
            response={
                "annotations": [{"blockId": bid, "kind": "heading", "level": 2}],
                "fixes": [{"wordIds": ["ocr_low_1"], "text": "Confirmed Section Header"}],
            },
        )

    agent = DocStructScaffoldAgent(
        cache_root=tmp_path / "cache",
        work_root=tmp_path / "work",
        external_llm_enabled=True,
        agentic_loop_enabled=True,
        one_shot=fake_one_shot,
        ocr_port=_LowConfOcrPort(),
        executable="agy",
        model="gemini-3.8-flash",
    )
    vdoc, _blocks, _slots, agent_run = agent.scaffold_document(
        pdf_bytes=_make_scan_only_pdf(),
        doc_id="vdoc-pblk-1",
        title="블록 재분류 테스트",
        fidelity_mode="balanced",
    )
    assert len(seen_kinds) >= 1
    assert agent_run is not None
    assert agent_run["rounds"] >= 1
    assert agent_run["appliedPatches"] >= 1
    kinds = [b["kind"] for b in vdoc["pages"][0]["blocks"]]
    assert "heading" in kinds
    slots_text = " ".join(s.get("content", "") for s in vdoc["slots"].values())
    assert "Confirmed Section Header" in slots_text


def test_catalog_ingest_pdf_endpoint_uses_docstruct_engine(tmp_path: Path) -> None:
    repo = FilesystemCatalogRepository(catalog_root=tmp_path / "catalog")
    container = app.state.container
    container.catalog_repository.override(repo)
    try:
        pdf_bytes = _make_vector_table_pdf()
        res = client.post(
            "/api/catalog/ingest-pdf",
            files={"file": ("docstruct-form.pdf", pdf_bytes, "application/pdf")},
            data={"title": "DocStruct 카탈로그 양식", "category": "표준서식"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["catalogId"].startswith("cat-")
        assert body["title"] == "DocStruct 카탈로그 양식"
        assert body["checkedTables"] == 1
        assert body["checkedSlots"] >= 4
        kinds = [b["kind"] for b in body["document"]["pages"][0]["blocks"]]
        assert "structured-table" in kinds

        list_res = client.get("/api/catalog")
        assert list_res.status_code == 200
        matched = next((m for m in list_res.json() if m["catalogId"] == body["catalogId"]), None)
        assert matched is not None
        assert matched["sourceOrigin"] == "docstruct-engine"

        bundle_res = client.get(f"/api/catalog/{body['catalogId']}")
        assert bundle_res.status_code == 200
        assert bundle_res.json()["manifest"]["sourceOrigin"] == "docstruct-engine"
    finally:
        container.catalog_repository.reset_override()

