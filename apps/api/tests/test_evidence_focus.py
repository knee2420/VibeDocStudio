"""근거 초점 · 무효화 — 덱 첨부의 재색인 감지 · 우선 카드 힌트, 근거 지문 검사, 스테이징 병합."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.assistant.models import ContextItem
from app.assistant.use_cases.assistant_service import AssistantService
from app.authoring.adapters.local_staging_store import LocalStagingStore
from app.authoring.use_cases.harness_service import HarnessService
from main import app

DECK_KIND = "deck"
CARD_KIND = "kcard"


class _FakeToolbox:
    def __init__(self) -> None:
        self.briefs = 0
        self.cards: dict[str, str] = {"d1:C-01-01": "sha-new"}

    def context_kind(self) -> str:
        return DECK_KIND

    def brief(self, deck_id: str) -> str:
        self.briefs += 1
        return f"지도 {deck_id}"

    def specs(self) -> list[dict[str, Any]]:
        return []

    def resolve_evidence(self, locators: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for loc in locators:
            sha = self.cards.get(loc["refId"])
            if sha:
                out.append({**loc, "sourceSha": sha})
        return out


def _deck(content: str) -> ContextItem:
    return ContextItem(kind=DECK_KIND, ref_id="d1", label="덱", content=content)


def test_deck_brief_resent_after_reindex_and_focus_hint() -> None:
    tools = _FakeToolbox()
    fake = SimpleNamespace(_server=tools)
    briefed: set[str] = set()
    run = AssistantService._server_context

    out, scope, _ = run(fake, [_deck("(덱)\nbuiltAt: t1\nfocusCards: C-01-01, C-02-03")], briefed)
    assert scope == ["d1"] and tools.briefs == 1
    assert "[우선 카드]" in out[0].content and "C-02-03" in out[0].content

    out, _, _ = run(fake, [_deck("(덱)\nbuiltAt: t1")], briefed)
    assert tools.briefs == 1 and "앞부분" in out[0].content and "[우선 카드]" not in out[0].content

    # 재색인 — builtAt 이 바뀌면 같은 대화라도 지도를 다시 보낸다
    out, _, _ = run(fake, [_deck("(덱)\nbuiltAt: t2")], briefed)
    assert tools.briefs == 2 and out[0].content.startswith("지도 d1")
    assert briefed == {"d1@t2"}


def test_evidence_status_marks_stale_and_missing() -> None:
    service = HarnessService(engines=None, policy=None, inline_model="m", server_tools=_FakeToolbox())  # type: ignore[arg-type]
    items = service.evidence_status([
        {"kind": CARD_KIND, "refId": "d1:C-01-01", "sourceSha": "sha-old"},
        {"kind": CARD_KIND, "refId": "d1:C-01-01", "sourceSha": "sha-new"},
        {"kind": CARD_KIND, "refId": "d1:C-09-09", "sourceSha": "x"},
        {"kind": "backdata", "refId": "c1"},
    ])
    assert [i["status"] for i in items] == ["stale", "ok", "missing"]


def test_evidence_status_endpoint_shape() -> None:
    res = TestClient(app).post("/api/assistant/evidence/status", json={"locators": [{"kind": "backdata", "refId": "c1"}]})
    assert res.status_code == 200 and res.json() == {"items": []}


def test_staging_merge_keeps_server_side_appends(tmp_path: Path) -> None:
    store = LocalStagingStore(tmp_path)
    store.replace("p", [{"diffId": "a"}, {"diffId": "b"}])
    store.append("p", [{"diffId": "job-1"}])  # 일괄 작업이 화면 몰래 덧붙임
    merged = store.merge("p", [{"diffId": "a", "note": "edited"}], removed=["b"])
    ids = [c["diffId"] for c in merged]
    assert ids == ["a", "job-1"] and merged[0]["note"] == "edited"


def test_deck_sections_mark_narrows_scope_and_rebriefs() -> None:
    tools = _FakeToolbox()
    fake = SimpleNamespace(_server=tools)
    briefed: set[str] = set()
    run = AssistantService._server_context
    _, scope, _ = run(fake, [_deck("(덱)\nbuiltAt: t1")], briefed)
    assert scope == ["d1"] and tools.briefs == 1
    _, scope, _ = run(fake, [_deck("(덱)\nbuiltAt: t1\nsections: SEC-01, SEC-03")], briefed)
    assert scope == ["d1#SEC-01,SEC-03"] and tools.briefs == 2  # 고른 섹션이 바뀌면 지도를 다시
    assert briefed == {"d1#SEC-01,SEC-03@t1"}
