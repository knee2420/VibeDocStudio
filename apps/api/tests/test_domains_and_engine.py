"""4대 헥사고날 도메인(`catalog`, `documents`, `backdata`, `composer`) 및 `pdf-vdoc-engine` 통합 테스트."""
from __future__ import annotations

from fastapi.testclient import TestClient
from pdf_vdoc_engine import (
    MeasuredGridCell,
    MeasuredGridRow,
    MeasuredGridTable,
    MeasuredPageGeometry,
    TextAtomPt,
    extract_vdoc_from_geometry,
    validate_vdoc_invariants,
)

from main import app

client = TestClient(app)


def test_health_endpoint_reports_all_domains_and_flagship_models() -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert set(body["domains"]) == {
        "catalog",
        "documents",
        "backdata",
        "composer",
        "projects",
        "resources",
        "knowledge",
        "runtime",
        "assistant",
        "reference",
    }
    assert body["models"]["composer"] == "Gemini-3.8-flash"
    assert body["models"]["tagger"] == "Gemma4 31b"


def test_catalog_domain_lists_and_validates_all_bundles() -> None:
    res = client.get("/api/catalog")
    assert res.status_code == 200
    manifests = res.json()
    catalog_ids = {m["catalogId"] for m in manifests}
    assert "yesform-07-bansanghoe" in catalog_ids
    assert "vibe-architecture-minutes" in catalog_ids

    bundle_res = client.get("/api/catalog/yesform-07-bansanghoe")
    assert bundle_res.status_code == 200
    vdoc = bundle_res.json()["document"]

    score = validate_vdoc_invariants(vdoc)
    assert score.valid, f"Validation errors: {score.errors}"
    assert score.grid_invariant_passed
    assert score.slot_integrity_passed
    assert score.checked_tables >= 5


def test_pdf_vdoc_engine_four_stage_pipeline_on_measured_geometry() -> None:
    geometry = MeasuredPageGeometry(
        page_number=1,
        width_pt=595.28,
        height_pt=841.89,
        free_texts=(
            TextAtomPt(
                text="반 상 회 회 의 록",
                x0=200.0,
                y0=40.0,
                x1=395.0,
                y1=64.0,
                font_size=18.0,
                is_bold=True,
            ),
        ),
        tables=(
            MeasuredGridTable(
                table_id="p1_tbl_1",
                x0=72.0,
                y0=90.0,
                x1=521.4,
                y1=210.0,
                col_widths_pt=(149.4, 150.0, 150.0),
                rows=(
                    MeasuredGridRow(
                        row_index=0,
                        height_pt=28.0,
                        cells=(
                            MeasuredGridCell(
                                row_index=0,
                                col_index=0,
                                col_span=1,
                                row_span=1,
                                x0=72.0,
                                y0=90.0,
                                x1=221.4,
                                y1=118.0,
                                text="성 명",
                                is_header_candidate=True,
                            ),
                            MeasuredGridCell(
                                row_index=0,
                                col_index=1,
                                col_span=2,
                                row_span=1,
                                x0=221.4,
                                y0=90.0,
                                x1=521.4,
                                y1=118.0,
                                text="비 고 (병합 헤더)",
                                is_header_candidate=True,
                            ),
                        ),
                    ),
                    MeasuredGridRow(
                        row_index=1,
                        height_pt=28.0,
                        cells=(
                            MeasuredGridCell(
                                row_index=1,
                                col_index=0,
                                col_span=1,
                                row_span=1,
                                x0=72.0,
                                y0=118.0,
                                x1=221.4,
                                y1=146.0,
                                text="101호 김철수",
                            ),
                            MeasuredGridCell(
                                row_index=1,
                                col_index=1,
                                col_span=1,
                                row_span=1,
                                x0=221.4,
                                y0=118.0,
                                x1=371.4,
                                y1=146.0,
                                text="(인)",
                            ),
                            MeasuredGridCell(
                                row_index=1,
                                col_index=2,
                                col_span=1,
                                row_span=1,
                                x0=371.4,
                                y0=118.0,
                                x1=521.4,
                                y1=146.0,
                                text="(서명)",
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )

    vdoc, score = extract_vdoc_from_geometry(
        geometries=(geometry,),
        doc_id="vdoc_test_extracted",
        title="반상회 회의록 테스트",
    )
    assert score.valid
    assert score.checked_tables == 1
    assert any(
        'data-vdoc-stamp="(인)"' in slot["content"]
        for slot in vdoc["slots"].values()
    )


def test_documents_backdata_and_composer_domains_end_to_end() -> None:
    # 1. Backdata import
    bd_res = client.post(
        "/api/backdata/import",
        json={
            "source_title": "10월_단지회의_메모.md",
            "source_type": "markdown",
            "raw_text": "후문 LED 보안등 12기를 전면 교체하기로 의결함.\n\n동절기 지하주차장 유도선 보수 실시.",
            "tags": ["회의록", "백데이터"],
        },
    )
    assert bd_res.status_code == 200
    chunks = bd_res.json()["chunks"]
    assert len(chunks) == 2

    # 2. Composer slot draft synthesis with provenance
    comp_res = client.post(
        "/api/ai/compose",
        json={
            "slotId": "bsh_agenda_body",
            "slotLabel": "협의 및 결의사항 본문",
            "currentContent": "<p>기존 초안</p>",
            "prompt": "3줄 개조식 불릿 변환",
            "presetId": "bullet-3",
            "backdata": chunks,
        },
    )
    assert comp_res.status_code == 200
    comp_body = comp_res.json()
    assert comp_body["slotId"] == "bsh_agenda_body"
    assert "<ul>" in comp_body["html"]
    assert comp_body["provenance"]["runId"].startswith("run-")

