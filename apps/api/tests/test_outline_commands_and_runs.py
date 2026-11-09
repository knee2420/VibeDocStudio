"""서버 원장(SSOT) 계약: 아웃라인 노드 명령 · 협력적 실행 취소 · 페이지 창 투영 · 도메인 오류 번역."""
from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

PROJECT = "vproj-enterprise-architecture-suite"


def _command(body: dict, project_id: str = PROJECT):
    return client.post(f"/api/projects/{project_id}/commands", json=body)


def _nodes(project: dict) -> dict[str, dict]:
    return {n["nodeId"]: n for n in project["storylineNodes"]}


def test_seeded_projects_reference_existing_working_documents() -> None:
    project = client.get(f"/api/projects/{PROJECT}").json()
    for doc_id in project["docIds"]:
        assert client.get(f"/api/documents/{doc_id}").status_code == 200, doc_id


def test_insert_update_move_indent_and_cascade_delete() -> None:
    inserted = _command({"kind": "insert_node", "title": "새 섹션 A", "parentId": "node-doc-minutes"})
    assert inserted.status_code == 200, inserted.text
    a_id = inserted.json()["affectedNodeId"]
    b_id = _command({"kind": "insert_node", "title": "새 섹션 B", "parentId": "node-doc-minutes"}).json()[
        "affectedNodeId"
    ]
    nodes = _nodes(_command({"kind": "update_node", "nodeId": a_id, "patch": {"summary": "요약"}}).json()["project"])
    assert nodes[a_id]["summary"] == "요약"
    assert nodes[a_id]["depth"] == 2 and nodes[a_id]["zoomLevel"] == "page"

    # 들여쓰기: B 가 바로 위 형제 A 의 자식이 되고 깊이 · 줌이 따라 바뀐다.
    nodes = _nodes(_command({"kind": "indent_node", "nodeId": b_id, "delta": 1}).json()["project"])
    assert nodes[b_id]["parentId"] == a_id
    assert nodes[b_id]["depth"] == 3 and nodes[b_id]["zoomLevel"] == "slot"

    # 내어쓰기로 되돌리고, 형제 사이에서 위로 이동.
    project = _command({"kind": "indent_node", "nodeId": b_id, "delta": -1}).json()["project"]
    assert _nodes(project)[b_id]["parentId"] == "node-doc-minutes"
    project = _command({"kind": "move_node", "nodeId": b_id, "direction": -1}).json()["project"]
    siblings = [n["nodeId"] for n in project["storylineNodes"] if n["parentId"] == "node-doc-minutes"]
    assert siblings.index(b_id) < siblings.index(a_id)

    # 자식을 가진 노드를 지우면 자손도 함께 지워진다.
    _command({"kind": "indent_node", "nodeId": a_id, "delta": 1})
    deleted = _command({"kind": "delete_node", "nodeId": b_id}).json()["project"]
    assert a_id not in _nodes(deleted) and b_id not in _nodes(deleted)


def test_assign_template_and_phase_commands() -> None:
    project = _command(
        {"kind": "assign_template", "nodeId": "node-doc-invoice", "templateId": "columns-grid"}
    ).json()["project"]
    node = _nodes(project)["node-doc-invoice"]
    assert node["recommendedTemplateId"] == "columns-grid" and node["aiStatus"] == "applied"
    assert _command({"kind": "set_phase", "phase": "templating"}).json()["project"]["activePhase"] == "templating"


def test_commands_reject_invalid_input() -> None:
    assert _command({"kind": "delete_node", "nodeId": "node-proj-root"}).status_code == 400
    assert _command({"kind": "delete_node", "nodeId": "missing-node"}).status_code == 404
    assert _command({"kind": "unknown_kind"}).status_code == 422


def test_run_cancelled_before_completion_discards_result() -> None:
    run_id = "run-cancel-before-start"
    assert client.post(f"/api/ai/runs/{run_id}/cancel", json={"reason": "esc"}).status_code == 200
    res = client.post(
        "/api/ai/phase1/storyline",
        json={"projectId": PROJECT, "prompt": "목차", "runId": run_id},
    )
    assert res.status_code == 409

    # 같은 runId 를 다시 써도(취소 기록은 실행 종료 시 지워졌으므로) 정상 실행된다.
    again = client.post(
        "/api/ai/phase1/storyline",
        json={"projectId": PROJECT, "prompt": "목차", "runId": run_id},
    )
    assert again.status_code == 200
    assert again.json()["runId"] == run_id


def test_page_window_returns_only_slots_of_window_pages() -> None:
    doc = client.get("/api/documents/vdoc_meeting_minutes_1028").json()["document"]
    window = client.get(
        "/api/documents/vdoc_meeting_minutes_1028/chunks",
        params={"startPage": 1, "endPage": 1},
    ).json()
    assert window["windowSize"] == 1
    assert 0 < len(window["slots"]) < len(doc["slots"])
    assert window["pages"][0]["pageId"] == doc["pages"][0]["pageId"]


def test_document_list_uses_summary_sidecar() -> None:
    summaries = {s["docId"]: s for s in client.get("/api/documents").json()}
    assert summaries["vdoc_meeting_minutes_1028"]["pageCount"] == 5


def test_runtime_policy_update_is_encapsulated() -> None:
    res = client.put("/api/runtime/policy", json={"primaryProvider": "google-api", "primaryModel": "m-1"})
    assert res.status_code == 200
    body = res.json()
    assert body["primaryProvider"] == "google_api" and body["primaryModel"] == "m-1"
    assert client.put("/api/runtime/policy", json={"fallbackTimeoutSeconds": -5}).status_code == 400
    client.put("/api/runtime/policy", json={"primaryProvider": "agy_cli"})
