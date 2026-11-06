"""문서 저장 버전(낙관적 잠금) · 개정 이력 · Staged 대기열 영속화."""
from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _doc(doc_id: str, body: str = "<p>처음</p>") -> dict:
    return {
        "version": "1.0.0",
        "docId": doc_id,
        "title": "개정 시험",
        "status": "Draft",
        "updatedAt": "",
        "variables": {"회의.일자": ""},
        "pages": [],
        "slots": {
            "s1": {"slotId": "s1", "label": "요약", "role": "editable-slot", "content": body, "backDataRefs": []},
            "s2": {"slotId": "s2", "label": "결론", "role": "editable-slot", "content": "", "backDataRefs": []},
        },
        "backdata": {},
    }


def _save(doc: dict, base: int | None, changes: list | None = None):
    return client.put(f"/api/documents/{doc['docId']}", json={"document": doc, "baseRevision": base, "changes": changes or []})


def test_save_increments_revision_and_rejects_stale_base() -> None:
    doc = _doc("rev_doc_a")
    first = _save(doc, None)
    assert first.status_code == 200
    rev1 = first.json()["document"]["revision"]
    second = _save({**doc, "title": "바뀜"}, rev1)
    assert second.status_code == 200 and second.json()["document"]["revision"] == rev1 + 1
    stale = _save({**doc, "title": "늦게 온 탭"}, rev1)  # 이미 rev1+1 이 저장됨
    assert stale.status_code == 409
    assert client.get("/api/documents/rev_doc_a").json()["document"]["title"] == "바뀜"


def test_revision_log_records_authors_and_coalesces_human_typing() -> None:
    doc = _doc("rev_doc_b")
    rev = _save(doc, None).json()["document"]["revision"]
    # 사람 타이핑 두 번 → 하나로 합쳐진다
    doc["slots"]["s1"]["content"] = "<p>처음 수정</p>"
    rev = _save(doc, rev).json()["document"]["revision"]
    doc["slots"]["s1"]["content"] = "<p>처음 수정 더</p>"
    rev = _save(doc, rev).json()["document"]["revision"]
    # AI 변경안 승인 → 하네스 · 실행이 남는다
    doc["slots"]["s2"]["content"] = "<p>AI 결론<sup data-cite=\"1\"></sup></p>"
    doc["variables"]["회의.일자"] = "2026-11-05"
    note = {"slotIds": ["s2"], "variables": ["회의.일자"], "author": "ai", "harnessId": "fill.slot", "runId": "run-1", "label": "[빈 칸 채우기] 결론"}
    _save(doc, rev, [note])

    revisions = client.get("/api/documents/rev_doc_b/revisions").json()["revisions"]
    assert revisions[0]["author"] == "ai" and revisions[0]["harnessId"] == "fill.slot" and revisions[0]["runId"] == "run-1"
    assert revisions[0]["slots"][0]["slotId"] == "s2" and revisions[0]["variables"][0]["after"] == "2026-11-05"
    human = revisions[1]
    assert human["author"] == "human" and len(revisions) == 2  # 타이핑 두 번이 하나로
    assert human["slots"][0]["before"] == "<p>처음</p>" and human["slots"][0]["after"] == "<p>처음 수정 더</p>"

    only_s1 = client.get("/api/documents/rev_doc_b/revisions", params={"slotId": "s1"}).json()["revisions"]
    assert len(only_s1) == 1 and all(c["slotId"] == "s1" for c in only_s1[0]["slots"])


def test_staging_queue_persists_per_project() -> None:
    change = {"diffId": "stg-1", "phase": "drafting", "targetKind": "slot-html", "targetId": "s1", "title": "t",
              "beforeSummary": "", "afterSummary": "", "payload": {"slotId": "s1", "html": "<p>x</p>"}, "sourceReferenceIds": []}
    assert client.put("/api/projects/proj_stage/staging", json={"changes": [change]}).status_code == 200
    appended = client.post("/api/projects/proj_stage/staging/append", json={"changes": [change, {**change, "diffId": "stg-2"}]}).json()
    assert [c["diffId"] for c in appended["changes"]] == ["stg-1", "stg-2"]  # 같은 id 는 한 번만
    assert len(client.get("/api/projects/proj_stage/staging").json()["changes"]) == 2
