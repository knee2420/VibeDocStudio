"""실제 등록된 레퍼런스 10종(PDF 1~69p · 웹 16타일 캡처 · 레이아웃 전용 웹 · 정적 HTML 웹 · 핀 · 합의) 전수 정규화 테스트."""
from __future__ import annotations

from pathlib import Path

from app.reference.adapters.local_library import LocalReferenceLibrary
from app.reference.adapters.pdf_extractor import PyMuPdfExtractor
from app.reference.adapters.web_extractor import HtmlStructureExtractor, UrllibWebFetcher
from app.reference.use_cases.reference_service import ReferenceLibraryService

REAL_REFS_ROOT = Path(__file__).resolve().parents[1] / "data" / "knowledge" / "references"


def _service() -> ReferenceLibraryService:
    return ReferenceLibraryService(
        library=LocalReferenceLibrary(REAL_REFS_ROOT),
        pdf_extractor=PyMuPdfExtractor(),
        html_extractor=HtmlStructureExtractor(),
        fetcher=UrllibWebFetcher(),
    )


def test_all_registered_references_normalize_to_valid_ref_v1_ir() -> None:
    svc = _service()
    items = svc.list_items()
    assert len(items) >= 10, f"Expected >= 10 real registered references, found {len(items)}"

    docs = svc.list_normalized(project_id="vproj-enterprise-architecture-suite")
    assert len(docs) == len(items)

    surfaces: dict[str, int] = {}
    total_pins = 0
    total_consensus = 0

    for doc in docs:
        rid = doc["refId"]
        assert doc["version"] == 1
        assert doc["status"] != "failed", f"{rid} failed normalization"
        assert len(doc["frames"]) >= 1, f"{rid} has 0 frames"
        assert len(doc["blocks"]) >= 1, f"{rid} has 0 blocks"
        assert len(doc["layers"]) >= 1, f"{rid} has 0 layers"

        surface = doc["frames"][0]["surfaceKind"]
        surfaces[surface] = surfaces.get(surface, 0) + 1

        max_f = len(doc["frames"])
        for blk in doc["blocks"]:
            fi = blk["frameIndex"]
            assert 1 <= fi <= max_f, f"{rid}/{blk['id']}: frameIndex={fi} out of 1..{max_f}"
            bbox = blk["bbox"]
            assert isinstance(bbox, list) and len(bbox) == 4, f"{rid}/{blk['id']}: missing bbox"
            y0, x0, y1, x1 = bbox
            assert 0 <= y0 < y1 <= 1000, f"{rid}/{blk['id']}: invalid y bbox {bbox}"
            assert 0 <= x0 < x1 <= 1000, f"{rid}/{blk['id']}: invalid x bbox {bbox}"

        for pin in doc["pins"]:
            assert 1 <= pin["frameIndex"] <= max_f, f"{rid}/{pin['pinId']}: frameIndex out of range"
            assert pin["anchor"].startswith(f"ref:{rid}#pin:")
        total_pins += len(doc["pins"])
        total_consensus += len(doc["consensus"])

    # Verify all 3 real-world surface pipelines are covered across the 10-item corpus
    assert surfaces.get("pdf-page", 0) >= 6
    assert surfaces.get("web-tile", 0) >= 1
    assert surfaces.get("semantic-canvas", 0) >= 3
    assert total_pins >= 6
    assert total_consensus >= 1


def test_hakodate_web_shots_project_all_16_tiles_and_blocks_with_valid_bboxes() -> None:
    svc = _service()
    doc = svc.normalized("ref-1a1c928d201-5217d321")
    assert doc["source"]["originType"] == "web"
    assert doc["layerSet"] == "blog"
    assert len(doc["frames"]) == 16
    assert all(f["surfaceKind"] == "web-tile" for f in doc["frames"])
    assert all("/shots/shot_" in f["assetUrl"] for f in doc["frames"])
    assert len(doc["blocks"]) == 86
    assert all(b["bbox"] is not None for b in doc["blocks"])


def test_static_web_without_shots_projects_to_semantic_canvas_frames() -> None:
    svc = _service()
    doc = svc.normalized("ref-1a1befb4332-7eee76bf")
    assert doc["source"]["originType"] == "web"
    assert doc["frames"][0]["surfaceKind"] == "semantic-canvas"
    assert len(doc["blocks"]) == 37
    assert all(b["bbox"] is not None for b in doc["blocks"])


def test_large_69p_pdf_with_pins_normalizes_cleanly() -> None:
    svc = _service()
    doc = svc.normalized("ref-1a1cfbc6842-abd78415")
    assert doc["source"]["originType"] == "pdf"
    assert len(doc["frames"]) == 69
    assert len(doc["blocks"]) == 979
    assert len(doc["pins"]) == 5
