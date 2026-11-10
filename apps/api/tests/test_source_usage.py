"""켜진 출처를 골고루 확인하는가 — 출처별 열람 집계 · 한 번의 재확인 · 매 턴 출처 목록.

특정 질문 문구로 판단하지 않는다: "켜져 있는데 열지 않은 출처" 라는 사실만 본다.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterator

from app.assistant.models import ContextItem
from app.assistant.use_cases.assistant_service import AssistantService, _Session
from app.assistant.workspace import (
    WORKBENCH_KIND,
    ResourceWorkspace,
    roster,
    source_usage,
    unused_sources,
)
from app.llm.models import EngineChoice


def _wb(refs: dict[str, str] | None = None, doc: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        doc=SimpleNamespace(title="보고서", doc_id="doc1") if doc else None,
        refs={rid: SimpleNamespace(title=title, pins=[]) for rid, title in (refs or {}).items()},
    )


def test_usage_counts_each_source_from_tool_records() -> None:
    wb = _wb({"refA": "투자 제안서", "refB": "공공 보고"})
    calls = [
        {"tool": "mcp_vibefs_1_wb_outline", "args": {"target": "doc"}},
        {"tool": "mcp_vibefs_1_wb_read", "args": {"anchor": "ref:refA#pin:p1"}},
        {"tool": "mcp_vibefs_1_ws_grep", "args": {"pattern": "결정"}},
    ]
    rows = {u.id: u for u in source_usage(wb, mounted=10, mcp_calls=calls, reads=[{"path": "a.md"}, {"path": "a.md"}])}
    assert rows["editor"].used and rows["editor"].detail == "개요만"
    assert rows["references"].used and rows["references"].detail.startswith("1/2")
    assert rows["resources"].used and rows["resources"].detail == "파일 1/10"
    assert unused_sources(rows.values()) == []


def test_unopened_sources_are_reported_and_client_tools_count() -> None:
    wb = _wb({"refA": "투자 제안서"})
    rows = source_usage(wb, mounted=5, mcp_calls=[], reads=[], client_calls=[("slot.read", {"slotId": "s1"})])
    by = {u.id: u for u in rows}
    assert by["editor"].used and not by["references"].used and not by["resources"].used
    assert [u.id for u in unused_sources(rows)] == ["references", "resources"]
    # 꺼진 출처(레퍼런스 없음 · 마운트 없음)는 '안 연 출처' 가 아니다
    assert unused_sources(source_usage(_wb(), mounted=0, mcp_calls=[], reads=[])) == [
        u for u in source_usage(_wb(), mounted=0, mcp_calls=[], reads=[]) if u.id == "editor"
    ]


def test_roster_lists_every_enabled_source() -> None:
    text = roster(_wb({"refA": "투자 제안서"}), "파일 12개", edit_scope="선택: s1")
    assert "에디터: 보고서" in text and "고칠 범위: 선택: s1" in text and "읽기는 문서 전체" in text
    assert "ref:refA" in text and "리소스 (사실 근거): 파일 12개" in text


# --- AssistantService: 한 번의 재확인 ----------------------------------------------------------------

class _Engine:
    def __init__(self, on_turn) -> None:
        self.choice = EngineChoice("agy_cli", "fake")
        self.turns: list[str] = []
        self._on_turn = on_turn

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        self.turns.append(text)
        self._on_turn(len(self.turns), text)
        yield {"type": "text_delta", "text": f"답 {len(self.turns)}."}
        yield {"type": "turn_done", "usage": {}, "durationMs": 1}

    def export_state(self) -> dict[str, Any]:
        return {"agy_conversation_id": "conv-1"}

    def close(self) -> None:
        pass


def _fixture(tmp_path: Path) -> tuple[Path, Path]:
    docs, refs = tmp_path / "documents", tmp_path / "references"
    (docs / "doc1").mkdir(parents=True)
    (docs / "doc1" / "document.vdoc.json").write_text(json.dumps({"docId": "doc1", "title": "보고서", "pages": [], "slots": {}}),
                                                     encoding="utf-8")
    (refs / "refA").mkdir(parents=True)
    (refs / "refA" / "ref.json").write_text(json.dumps({"refId": "refA", "kind": "pdf", "title": "투자 제안서"}), encoding="utf-8")
    (refs / "refA" / "extraction.json").write_text(json.dumps({"blocks": [{"id": "b1", "page": 1, "kind": "paragraph",
                                                                           "text": "결론부터", "html": "<p>결론부터</p>"}]}),
                                                   encoding="utf-8")
    return docs, refs


def test_composer_rechecks_once_when_an_enabled_source_was_never_opened(tmp_path: Path) -> None:
    docs, refs = _fixture(tmp_path)
    ws = ResourceWorkspace(state_dir=tmp_path / "ws", sandbox_dir=tmp_path / "sb", documents_root=docs, references_root=refs)

    def on_turn(n: int, _text: str) -> None:
        if n == 1:  # 문서 개요만 보고 답한다 — 레퍼런스는 안 연다
            ws.store.log_hook({"ev": "mcp", "tool": "wb_outline", "conv": "conv-1", "args": {"target": "doc"}})
        elif n == 2:  # 재확인을 받고 레퍼런스를 연다
            ws.store.log_hook({"ev": "mcp", "tool": "wb_read", "conv": "conv-1", "args": {"anchor": "ref:refA#blk:b1"}})

    engine = _Engine(on_turn)
    service = AssistantService(engines=SimpleNamespace(), policy=SimpleNamespace(), inline_model="m", workspace=ws)  # type: ignore[arg-type]
    service._sessions["s1"] = _Session(session_id="s1", engine=engine)  # type: ignore[arg-type]
    wb_ctx = ContextItem(kind=WORKBENCH_KIND, ref_id="wb:state", label="작업대",
                         content=json.dumps({"docId": "doc1", "scope": {"mode": "document"}, "references": [{"refId": "refA"}]}))

    events = list(service.send_message("s1", text="이 문서 다듬어줘", contexts=[wb_ctx], tools=[]))
    assert len(engine.turns) == 2
    assert "[출처 확인]" in engine.turns[1] and "ref:refA" in engine.turns[1]
    assert any(e["type"] == "status" and "열어 보지 않은 출처(레퍼런스)" in e["message"] for e in events)
    final = [e for e in events if e["type"] == "workspace_sources"][-1]["sources"]
    assert {s["id"]: s["used"] for s in final} == {"editor": True, "references": True, "resources": False}
    assert events[-1]["stopReason"] == "end_turn"

    # 다음 메시지: 지도 대신 켜진 출처 목록을 짧게 다시 붙이고, 재확인은 메시지마다 한 번뿐
    list(service.send_message("s1", text="고마워", contexts=[wb_ctx], tools=[]))
    assert "[켜진 출처" in engine.turns[2] and "ref:refA" in engine.turns[2]
    assert len(engine.turns) == 3  # 이번엔 아무 도구도 안 썼다 → 재확인하지 않는다


def test_overview_counts_as_editor_and_declared_skips_are_respected(tmp_path: Path) -> None:
    rows = {u.id: u for u in source_usage(_wb({"refA": "t"}), mounted=0,
                                          mcp_calls=[{"tool": "wb_overview", "args": {}}], reads=[])}
    assert rows["editor"].used and not rows["references"].used

    docs, refs = _fixture(tmp_path)
    ws = ResourceWorkspace(state_dir=tmp_path / "ws", sandbox_dir=tmp_path / "sb", documents_root=docs, references_root=refs)

    class _Declares(_Engine):
        def run_turn(self, text, cancel):
            self.turns.append(text)
            ws.store.log_hook({"ev": "mcp", "tool": "wb_overview", "conv": "conv-1", "args": {}})
            yield {"type": "text_delta", "text": "4쪽입니다.\n확인하지 않은 출처: 레퍼런스 — 쪽 수 질문이라 무관"}
            yield {"type": "turn_done", "usage": {}, "durationMs": 1}

    engine = _Declares(lambda n, t: None)
    service = AssistantService(engines=SimpleNamespace(), policy=SimpleNamespace(), inline_model="m", workspace=ws)  # type: ignore[arg-type]
    service._sessions["s1"] = _Session(session_id="s1", engine=engine)  # type: ignore[arg-type]
    wb_ctx = ContextItem(kind=WORKBENCH_KIND, ref_id="wb:state", label="작업대",
                         content=json.dumps({"docId": "doc1", "scope": {"mode": "document"}, "references": [{"refId": "refA"}]}))
    list(service.send_message("s1", text="몇 쪽이야?", contexts=[wb_ctx], tools=[]))
    assert len(engine.turns) == 1  # 이유를 밝혔으므로 재확인하지 않는다


def test_reference_depth_comes_from_the_rf_read_ledger() -> None:
    wb = SimpleNamespace(doc=None, refs={"refA": SimpleNamespace(title="t", pins=[{"pinId": "p1"}],
                                                                 blocks=[{"id": "b1"}, {"id": "b2"}, {"id": "b3"}])})
    rows = {u.id: u for u in source_usage(wb, mounted=0, mcp_calls=[{"tool": "rf_read", "args": {"anchor": "ref:refA#pin:p1"}}],
                                          reads=[], ref_reads=[{"refId": "refA", "blocks": ["b1"], "pins": ["p1"]}])}
    assert rows["references"].used and "핀 1/1" in rows["references"].detail and "덩어리 1/3" in rows["references"].detail
    mapped = {u.id: u for u in source_usage(wb, mounted=0, mcp_calls=[{"tool": "rf_map", "args": {}}], reads=[])}
    assert mapped["references"].used and "지도만" in mapped["references"].detail
