"""문서 생애(만들기 · 이름 · 복제 · 삭제)는 프로젝트 docIds 와 함께 움직인다 — 고아 문서가 생기지 않는다."""
from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
PROJECT = "vproj-enterprise-architecture-suite"


def _doc_ids() -> list[str]:
    return client.get(f"/api/projects/{PROJECT}").json()["docIds"]


def test_create_scroll_document_links_project_and_records_surface() -> None:
    res = client.post("/api/documents", json={"projectId": PROJECT, "title": "기술 블로그 초안", "surface": "scroll", "genre": "blog",
                                               "createdBy": "agent", "sessionId": "s1"})
    assert res.status_code == 201, res.text
    doc = res.json()["document"]
    assert doc["surface"]["kind"] == "scroll"
    assert doc["genre"] == "blog"
    assert doc["origin"]["createdBy"] == "agent" and doc["origin"]["sessionId"] == "s1"
    assert doc["projectId"] == PROJECT
    page = doc["pages"][0]
    assert page["hideHeaderFooter"] is True and page["pageRect"]["width"] == 720
    assert page["headerSlotId"] in doc["slots"] and page["footerSlotId"] in doc["slots"]
    assert doc["docId"] in _doc_ids()
    assert client.get(f"/api/documents/{doc['docId']}").status_code == 200


def test_create_rejects_unknown_project() -> None:
    assert client.post("/api/documents", json={"projectId": "nope-proj", "title": "x"}).status_code in (400, 404, 422)


def test_link_existing_document_to_project() -> None:
    # 프로젝트 없이 저장된 문서(PDF · .vdoc 가져오기로 생긴 고아)를 흉내 낸다
    orphan =client.put("/api/documents/orphan_doc_x", json={"document": {"title": "고아", "pages": [], "slots": {}}}).json()["docId"]
    assert orphan not in _doc_ids()
    linked = client.post(f"/api/documents/{orphan}/link", json={"projectId": PROJECT})
    assert linked.status_code == 200 and linked.json()["document"]["projectId"] == PROJECT
    assert orphan in _doc_ids()
    assert client.post(f"/api/documents/{orphan}/link", json={"projectId": "nope"}).status_code in (400, 404, 422)
    client.delete(f"/api/documents/{orphan}")


def test_rename_duplicate_delete_keep_project_links_consistent() -> None:
    doc_id = client.post("/api/documents", json={"projectId": PROJECT, "title": "주간 보고"}).json()["docId"]
    renamed = client.patch(f"/api/documents/{doc_id}/title", json={"title": "  주간   활동 보고서 "}).json()["document"]
    assert renamed["title"] == "주간 활동 보고서"
    assert renamed["surface"]["kind"] == "paged"

    copy = client.post(f"/api/documents/{doc_id}/duplicate", json={}).json()["document"]
    assert copy["docId"] != doc_id and copy["title"].endswith("(사본)")
    assert {doc_id, copy["docId"]} <= set(_doc_ids())

    gone = client.delete(f"/api/documents/{doc_id}")
    assert gone.status_code == 200 and gone.json()["unlinkedProjects"] == [PROJECT]
    assert doc_id not in _doc_ids() and copy["docId"] in _doc_ids()
    assert client.get(f"/api/documents/{doc_id}").status_code == 404
