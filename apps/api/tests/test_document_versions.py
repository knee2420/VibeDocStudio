"""문서 버전 — 문서 전체 보관 · 목록 · 꺼내기 · 이름 바꾸기 · 지우기 · 자동 보관 지점."""
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.documents.adapters import LocalVDocDocumentRepository
from app.documents.models import VDocAggregateRecord
from app.documents.use_cases.document_versions import MAX_AUTO_VERSIONS, DocumentVersionsUseCase
from main import app

client = TestClient(app)


def _doc(doc_id: str, body: str) -> dict:
    return {
        "version": "1.0.0",
        "docId": doc_id,
        "title": "버전 시험",
        "status": "Draft",
        "updatedAt": "",
        "variables": {},
        "pages": [{"pageId": "p1", "pageNumber": 1, "pageLabel": "1쪽", "headerSlotId": "", "footerSlotId": "", "blocks": []}],
        "slots": {"s1": {"slotId": "s1", "label": "본문", "role": "editable-slot", "content": body, "backDataRefs": []}},
        "backdata": {},
    }


def test_named_version_keeps_whole_document_and_can_be_read_back() -> None:
    doc = _doc("ver_doc_a", "<p>제출본 글</p>")
    rev = client.put("/api/documents/ver_doc_a", json={"document": doc}).json()["document"]["revision"]
    created = client.post("/api/documents/ver_doc_a/versions", json={"name": "1차 제출본", "note": "심사용"})
    assert created.status_code == 201
    v = created.json()
    assert v["kind"] == "named" and v["name"] == "1차 제출본" and v["rev"] == rev and v["pageCount"] == 1 and v["blockCount"] == 0 and v["chars"] == 4

    # 그 뒤 고쳐도 버전 안의 문서는 그대로
    doc["slots"]["s1"]["content"] = "<p>고친 글</p>"
    doc["pages"].append({"pageId": "p2", "pageNumber": 2, "pageLabel": "2쪽", "headerSlotId": "", "footerSlotId": "", "blocks": []})
    client.put("/api/documents/ver_doc_a", json={"document": doc, "baseRevision": rev})
    got = client.get(f"/api/documents/ver_doc_a/versions/{v['id']}").json()
    assert got["document"]["slots"]["s1"]["content"] == "<p>제출본 글</p>"
    assert len(got["document"]["pages"]) == 1

    listed = client.get("/api/documents/ver_doc_a/versions").json()["versions"]
    assert listed[0]["id"] == v["id"]  # 최신이 앞

    renamed = client.patch(f"/api/documents/ver_doc_a/versions/{v['id']}", json={"name": "최종 제출본"}).json()
    assert renamed["name"] == "최종 제출본"
    assert client.delete(f"/api/documents/ver_doc_a/versions/{v['id']}").status_code == 204
    assert client.get(f"/api/documents/ver_doc_a/versions/{v['id']}").status_code == 404


def _repo_with_doc(tmp_path: Path) -> LocalVDocDocumentRepository:
    repo = LocalVDocDocumentRepository(tmp_path)
    repo.save(VDocAggregateRecord(doc_id="d", payload={**_doc("d", "<p>a</p>"), "revision": 3}))
    return repo


def test_auto_checkpoint_only_after_a_pause(tmp_path: Path) -> None:
    repo = _repo_with_doc(tmp_path)
    uc = DocumentVersionsUseCase(repo)
    before = repo.get("d").payload
    first = uc.checkpoint_before_edit("d", before, "2026-11-16T05:00:00Z")
    assert first and first["kind"] == "auto" and first["reason"] == "편집 시작 전" and first["rev"] == 3
    assert uc.checkpoint_before_edit("d", before, "2026-11-16T05:20:00Z") is None  # 30분 안
    assert uc.checkpoint_before_edit("d", before, "2026-11-16T05:40:00Z") is not None  # 쉬었다 다시


def test_auto_versions_are_pruned_but_named_ones_stay(tmp_path: Path) -> None:
    repo = _repo_with_doc(tmp_path)
    uc = DocumentVersionsUseCase(repo)
    named = uc.create("d", name="제출본")
    for _ in range(MAX_AUTO_VERSIONS + 3):
        uc.create("d", kind="auto", reason="되돌리기 전")
    versions = repo.list_versions("d")
    assert sum(1 for v in versions if v["kind"] == "auto") == MAX_AUTO_VERSIONS
    assert any(v["id"] == named["id"] for v in versions)
