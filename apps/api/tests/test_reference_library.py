"""reference 도메인: 라이브러리 수집 → 해체(구조 추출 · 층위 측정) → 핀 → 프로젝트 연결 · 앵커.

레퍼런스는 vdoc 과 무관해야 하고(작업 문서 저장소에 아무것도 쓰지 않는다), 폴더 · 대량 자료는 받지 않는다.
"""
from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.assistant.workspace import patterns
from app.core.errors import NotFoundError, ValidationError
from app.reference.adapters import (
    HtmlStructureExtractor,
    LocalReferenceLibrary,
    MeasuredLayerAnalyzer,
    PyMuPdfExtractor,
)
from app.reference.models import ReferenceAnchor
from app.reference.use_cases import ReferenceLibraryService
from main import app


def _pdf_bytes() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 80), "1. Background", fontsize=20)
    page.insert_text((72, 120), "Most readers skim. We put the conclusion first and keep paragraphs short.", fontsize=10)
    page.insert_text((72, 140), "- Bullet item one", fontsize=10)
    page2 = doc.new_page()
    page2.insert_text((72, 80), "2. Plan", fontsize=20)
    page2.insert_text((72, 120), "Budget is 120 million won for 12 months.", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


class _Fetcher:
    def __init__(self, data: bytes = b"", content_type: str = "text/html", fail: bool = False) -> None:
        self.data, self.content_type, self.fail = data, content_type, fail

    def fetch(self, url: str) -> tuple[bytes, str]:
        if self.fail:
            raise OSError("network down")
        return self.data, self.content_type


def _service(tmp_path: Path, fetcher: _Fetcher | None = None) -> ReferenceLibraryService:
    return ReferenceLibraryService(
        library=LocalReferenceLibrary(tmp_path / "references"),
        pdf_extractor=PyMuPdfExtractor(),
        html_extractor=HtmlStructureExtractor(),
        fetcher=fetcher or _Fetcher(fail=True),
        analyzer=MeasuredLayerAnalyzer(patterns.measure, patterns.by_layer),
    )


def test_pdf_reference_is_decomposed_without_vdoc(tmp_path: Path) -> None:
    service = _service(tmp_path)
    item = service.add_file("guide.pdf", _pdf_bytes())
    assert item.status == "ready" and item.kind == "pdf" and item.page_count == 2 and item.title == "guide"

    extraction = service.extraction(item.ref_id)
    headings = [o["title"] for o in extraction["outline"]]
    assert headings == ["1. Background", "2. Plan"]
    kinds = {b["kind"] for b in extraction["blocks"]}
    assert {"heading", "paragraph"} <= kinds
    assert all(len(b["bbox"]) == 4 for b in extraction["blocks"])

    layers = service.layers(item.ref_id)
    assert layers["set"] == "document" and [l["id"] for l in layers["layers"]][:2] == ["D1", "D2"]
    assert layers["metrics"]["heading_sequence"] == ["1. Background", "2. Plan"]

    folder = tmp_path / "references" / "items" / item.ref_id
    assert sorted(p.name for p in folder.iterdir()) == ["extraction.json", "layers.json", "ref.json", "source.pdf"]
    assert not any("vdoc" in p.name for p in tmp_path.rglob("*"))


def test_web_reference_extracts_article_and_failed_fetch_can_be_retried(tmp_path: Path) -> None:
    html = ("<html><head><title>T</title><meta property='og:title' content='가을 여행지 3곳'></head><body>"
            "<nav>메뉴</nav><article><h2>첫째, 쉬는 법</h2><p>마음을 <strong>내려놓는</strong> 곳.</p>"
            "<ul><li>하나</li><li>둘</li></ul></article><footer>푸터</footer></body></html>").encode("utf-8")
    fetcher = _Fetcher(fail=True)
    service = _service(tmp_path, fetcher)
    failed = service.add_url("https://example.com/a")
    assert failed.status == "failed" and "network down" in failed.error

    fetcher.fail, fetcher.data = False, html
    item = service.reanalyze(failed.ref_id)
    assert item.ref_id == failed.ref_id and item.status == "ready" and item.title == "가을 여행지 3곳"
    extraction = service.extraction(item.ref_id)
    texts = [b["text"] for b in extraction["blocks"]]
    assert texts == ["첫째, 쉬는 법", "마음을 내려놓는 곳.", "하나", "둘"]  # nav · footer 는 뺀다
    assert "<b>내려놓는</b>" in extraction["article"]["html"]


def test_rejects_folders_and_unsupported_sources(tmp_path: Path) -> None:
    service = _service(tmp_path)
    with pytest.raises(ValidationError):
        service.add_file("C:/자료/폴더", b"")
    with pytest.raises(ValidationError):
        service.add_file("notes.docx", b"x")
    with pytest.raises(ValidationError):
        service.add_url("C:/local/file.pdf")
    with pytest.raises(NotFoundError):
        service.get("ref-missing")


def test_pins_bindings_and_anchors(tmp_path: Path) -> None:
    service = _service(tmp_path)
    item = service.add_file("guide.pdf", _pdf_bytes())
    pin = service.add_pin(item.ref_id, {"kind": "region", "page": 1, "bbox": [50, 80, 200, 900], "text": "결론 먼저", "layer": "D4"})
    assert pin.anchor == f"ref:{item.ref_id}#pin:{pin.pin_id}" and pin.label.startswith("1p")
    service.update_pin(item.ref_id, pin.pin_id, {"note": "이 순서를 쓴다", "layer": "D1"})
    assert service.list_pins(item.ref_id)[0].layer == "D1"
    with pytest.raises(ValidationError):
        service.add_pin(item.ref_id, {"kind": "region"})

    binding = service.bind("proj-a", item.ref_id)
    assert [e.ref_id for e in binding.entries] == [item.ref_id]
    binding = service.update_binding("proj-a", item.ref_id, layers={"D2": False})
    entry = binding.find(item.ref_id)
    assert entry is not None and not entry.layer_on("D2") and entry.layer_on("D1")
    assert service.binding("proj-b").entries == ()  # 라이브러리는 공용, 연결은 프로젝트별

    resolved = service.resolve_anchor(pin.anchor)
    assert resolved["page"] == 1 and resolved["bbox"] == [50, 80, 200, 900] and resolved["text"] == "결론 먼저"
    assert ReferenceAnchor.parse(f"ref:{item.ref_id}#p2#blk:b3").render() == f"ref:{item.ref_id}#p2#blk:b3"

    service.delete(item.ref_id)
    assert service.binding("proj-a").entries == () and service.list_items() == []


def test_reference_api_round_trip() -> None:
    client = TestClient(app)
    res = client.post("/api/reference/items/file", files={"file": ("brief.pdf", _pdf_bytes(), "application/pdf")})
    assert res.status_code == 200, res.text
    ref_id = res.json()["refId"]
    assert client.get(f"/api/reference/items/{ref_id}/source").headers["content-type"] == "application/pdf"
    assert client.get(f"/api/reference/items/{ref_id}/extraction").json()["outline"]
    view = client.put(f"/api/reference/projects/vproj-enterprise-architecture-suite/items/{ref_id}").json()
    assert view["entries"][-1]["item"]["refId"] == ref_id
    pin = client.post(f"/api/reference/items/{ref_id}/pins", json={"kind": "text", "page": 1, "text": "skim"}).json()
    assert client.get("/api/reference/resolve", params={"anchor": pin["anchor"]}).json()["text"] == "skim"
    assert client.post("/api/reference/items/file", files={"file": ("x.zip", b"PK", "application/zip")}).status_code == 400
    # 레퍼런스는 작업 문서 목록 · 서식 카탈로그에 나타나지 않는다
    assert ref_id not in client.get("/api/documents").text
    assert client.delete(f"/api/reference/items/{ref_id}").status_code == 200
    assert client.get(f"/api/reference/items/{ref_id}").status_code == 404


def test_reference_domain_imports_nothing_from_vdoc_or_other_domains() -> None:
    """import-linter 가 없어도 돌아가는 실제 검사: reference 는 vdoc · 다른 도메인을 import 하지 않는다."""
    import ast

    root = Path(__file__).resolve().parents[1] / "app" / "reference"
    banned = ("pdf_vdoc_engine", "app.documents", "app.catalog", "app.projects", "app.assistant", "app.resources")
    offenders = []
    for path in root.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = [node.module or ""] if isinstance(node, ast.ImportFrom) else [a.name for a in node.names] if isinstance(node, ast.Import) else []
            offenders += [f"{path.name}: {n}" for n in names if n.startswith(banned)]
    assert offenders == []
