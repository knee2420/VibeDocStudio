"""FastAPI unit tests for AI-Native Structural Assets (`/api/assets`)."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _make_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("VIBE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("VIBE_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("VIBE_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("VIBE_EXTERNAL_LLM", "0")
    return TestClient(create_app(settings=Settings()))


def test_parse_asset_from_block_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _make_client(tmp_path, monkeypatch)
    resp = client.post(
        "/api/assets/parse-from-block",
        json={
            "title": "법률 및 고시 복합 표",
            "assetKind": "table",
            "targetKind": "structured-table",
            "outlineDsl": [
                "<<view:table:header>> 법률 및 고시",
                "  구분 | 항 목",
                "  법률 | <<cell>>",
                "    <<view:list>>",
                "      지능정보화 기본법",
                "      개인정보 보호법",
            ],
            "contextHint": "법률 및 고시 목록 표",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["engine"] == "fallback"
    assert body["title"]
    assert len(body["outlineDsl"]) >= 4
    assert any("{{" in line for line in body["outlineDsl"])
    assert body["nuance"]["summary"]
    assert len(body["nuance"]["structureRules"]) >= 1


def test_parse_asset_from_ref_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _make_client(tmp_path, monkeypatch)
    resp = client.post(
        "/api/assets/parse-from-ref",
        json={
            "refTitle": "사업 실적 증명서 서식",
            "assetKind": "a4-page",
            "extractedText": "[title] 사업 실적 증명서\n[table] 신청인 기본정보\n[table] 사업 이행 실적",
            "frameLabels": ["Page 1"],
            "sourceRef": "vault://refs/cert.ref",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["engine"] == "fallback"
    assert len(body["outlineDsl"]) >= 4
    assert body["nuance"]["summary"]


def test_apply_asset_preview_rich_cell_table_and_feedback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _make_client(tmp_path, monkeypatch)
    resp = client.post(
        "/api/assets/apply-preview",
        json={
            "assetId": "asset-table-category-rich-cell",
            "assetKind": "table",
            "assetTitle": "좌측 구분 + 우측 복합 셀 표",
            "assetNuance": {
                "summary": "좌측 분류와 우측 복합 셀(목록·이미지)을 조합하는 표",
                "structureRules": ["1행 상단 헤더 유지", "우측 셀에 <<cell>> + <<view:list>> 중첩"],
            },
            "assetOutlineDsl": [
                "<<view:table:header>> {{표 제목}}",
                "  {{구분}} | {{항 목}}",
                "  {{분류 1}} | <<cell>>",
                "    <<view:list>>",
                "      {{항목 1}}",
            ],
            "userOutlineDsl": [
                "<<view:table>> 사업 기본 정보",
                "  사업명 | 통합 AX 포털 사이트 구축",
                "  작성일 | 2025. 9. 19.",
            ],
            "userPlainText": "사업명 | 통합 AX 포털 사이트 구축\n작성일 | 2025. 9. 19.",
            "documentTitle": "통합 AX 포털 추진 계획",
            "targetScope": "block",
            "mode": "transform",
            "feedback": "비고 열 추가해줘",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["engine"] == "fallback"
    dsl_joined = "\n".join(body["outlineDsl"])
    assert "<<view:table:header>>" in dsl_joined
    assert "<<cell>>" in dsl_joined
    assert "통합 AX 포털 사이트 구축" in dsl_joined
    assert "비고" in dsl_joined
    assert "피드백 반영" in body["rationale"]
