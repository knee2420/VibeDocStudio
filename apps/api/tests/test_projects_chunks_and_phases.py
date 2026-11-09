"""projects 도메인, 4단계 Zoom 아웃라인, 레퍼런스 출처 기록, 10~20p 슬라이딩 윈도우 청크, 3-Phase AI Staging & 취소 통합 테스트."""
from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_projects_are_plain_work_projects_without_reference_fields() -> None:
    """레퍼런스는 프로젝트가 아니다 — 매니페스트에 참조 전용 · 참조 바인딩 필드가 없다."""
    res = client.get("/api/projects")
    assert res.status_code == 200
    projects = res.json()
    active_proj = next(p for p in projects if p["projectId"] == "vproj-enterprise-architecture-suite")
    assert "isReferenceOnly" not in active_proj
    assert "referenceProjectIds" not in active_proj
    assert client.put("/api/projects/vproj-enterprise-architecture-suite/references", json={}).status_code in (404, 405)


def test_project_outline_four_level_zoom_and_breadcrumbs() -> None:
    # Level 1: Project Root
    res_root = client.get("/api/projects/vproj-enterprise-architecture-suite/outline")
    assert res_root.status_code == 200
    body_root = res_root.json()
    assert body_root["activeZoomLevel"] == "project"
    assert len(body_root["breadcrumbs"]) == 1

    # Level 2: Zoom into Document node
    res_doc = client.get(
        "/api/projects/vproj-enterprise-architecture-suite/outline",
        params={"rootNodeId": "node-doc-minutes"},
    )
    assert res_doc.status_code == 200
    body_doc = res_doc.json()
    assert body_doc["activeZoomLevel"] == "document"
    assert [b["zoomLevel"] for b in body_doc["breadcrumbs"]] == [
        "project",
        "project",
        "document",
    ]
    node_ids = {n["nodeId"] for n in body_doc["nodes"]}
    assert "node-doc-minutes" in node_ids
    assert "node-page-minutes-p1" in node_ids
    assert "node-doc-proposal" not in node_ids


def test_insert_node_from_reference_anchor_keeps_provenance() -> None:
    """Phase 1 에서 레퍼런스 목차를 가져오면 출처가 레퍼런스 앵커로 남는다."""
    res = client.post(
        "/api/projects/vproj-enterprise-architecture-suite/commands",
        json={
            "kind": "insert_node",
            "title": "가용성 SLA 명세",
            "parentId": "node-doc-proposal",
            "provenanceSourceProjectId": "ref:ref-test",
            "provenanceSourceNodeId": "b3",
        },
    )
    assert res.status_code == 200
    node = next(n for n in res.json()["project"]["storylineNodes"] if n["title"] == "가용성 SLA 명세")
    assert node["provenanceSourceProjectId"] == "ref:ref-test"
    assert node["provenanceSourceNodeId"] == "b3"


def test_document_windowed_chunking_and_structural_patch() -> None:
    # Seed a multi-page document first
    catalog_res = client.get("/api/catalog/yesform-07-bansanghoe")
    assert catalog_res.status_code == 200
    vdoc = catalog_res.json()["document"]
    doc_id = "vdoc-chunk-test-01"
    vdoc["docId"] = doc_id

    save_res = client.put(f"/api/documents/{doc_id}", json={"document": vdoc})
    assert save_res.status_code == 200

    # Insert 2 storyline pages via structural patch
    for idx in range(1, 3):
        patch_res = client.patch(
            f"/api/documents/{doc_id}/structure",
            json={
                "operation": "insert_storyline_page",
                "payload": {
                    "pageId": f"story-page-{idx}",
                    "pageLabel": f"스토리라인 확장 섹션 {idx}",
                    "summary": f"섹션 {idx} 요약 본문",
                },
            },
        )
        assert patch_res.status_code == 200

    # Query windowed chunk (page 2..2)
    chunk_res = client.get(
        f"/api/documents/{doc_id}/chunks",
        params={"startPage": 2, "endPage": 2},
    )
    assert chunk_res.status_code == 200
    chunk = chunk_res.json()
    assert chunk["totalPages"] >= 3
    assert chunk["windowSize"] == 1
    assert chunk["topSpacerPx"] == 1147
    assert chunk["bottomSpacerPx"] >= 1147

    # Commit staged slot diff
    commit_res = client.patch(
        f"/api/documents/{doc_id}/structure",
        json={
            "operation": "commit_staged_slots",
            "payload": {
                "slotUpdates": [
                    {
                        "slotId": "story-page-1_body",
                        "content": "<p><strong>[Staged 승인 완료]</strong> 본문 반영</p>",
                    }
                ]
            },
        },
    )
    assert commit_res.status_code == 200
    assert (
        "Staged 승인 완료"
        in commit_res.json()["document"]["slots"]["story-page-1_body"]["content"]
    )


def test_three_phase_ai_staging_and_run_cancellation() -> None:
    # Phase 1 Storyline compose
    p1_res = client.post(
        "/api/ai/phase1/storyline",
        json={
            "projectId": "vproj-enterprise-architecture-suite",
            "prompt": "금융 클라우드 SLA와 보안 감사 체계를 결합한 목차 생성",
            "referenceNodes": [
                {
                    "nodeId": "ref1-sec-sla",
                    "title": "가용성 99.99% SLA 보장 명세",
                    "summary": "15분 이내 자동 페일오버",
                    "sourceProjectId": "ref:ref-test",
                    "recommendedTemplateId": "structured-table",
                }
            ],
        },
    )
    assert p1_res.status_code == 200
    p1_body = p1_res.json()
    assert p1_body["phase"] == "storylining"
    assert len(p1_body["stagedDiffs"]) == 1
    assert p1_body["stagedDiffs"][0]["targetKind"] == "outline-node"

    # Phase 2 Template recommendation
    p2_res = client.post(
        "/api/ai/phase2/templates",
        json={
            "projectId": "vproj-enterprise-architecture-suite",
            "docId": "vdoc-arch-minutes-01",
            "nodes": [
                {
                    "nodeId": "node-1",
                    "title": "연간 라이선스 단가 및 SLA 비교 매트릭스 표",
                    "summary": "정산 테이블",
                }
            ],
            "tuningPrompt": "정밀 비교 표 우선 배정",
        },
    )
    assert p2_res.status_code == 200
    p2_body = p2_res.json()
    assert p2_body["phase"] == "templating"
    assert p2_body["stagedDiffs"][0]["payload"]["templateKind"] == "structured-table"

    # Run Cancellation (Esc / Stop)
    run_id = p1_body["runId"]
    cancel_res = client.post(
        f"/api/ai/runs/{run_id}/cancel",
        json={"reason": "user_pressed_escape"},
    )
    assert cancel_res.status_code == 200
    cancel_body = cancel_res.json()
    assert cancel_body["runId"] == run_id
    assert cancel_body["status"] == "cancelled"

