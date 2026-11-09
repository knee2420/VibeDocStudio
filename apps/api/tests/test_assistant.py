"""assistant 도메인 — 도구 호출 프로토콜 · 세션 도구 왕복 · 인라인 실행 (오프라인 엔진)."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.assistant.tool_protocol import ToolCallExtractor
from main import app

client = TestClient(app)


def _events(response) -> list[dict]:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_extractor_handles_tags_split_across_chunks() -> None:
    ex = ToolCallExtractor()
    chunks = ["앞 문장 <to", 'ol_call>{"id": "a1", "name": "slot.read", ', '"arguments": {"slotId": "s1"}}</tool', "_call> 뒤"]
    visible, calls = "", []
    for chunk in chunks:
        text, found = ex.feed(chunk)
        visible += text
        calls += found
    tail, _ = ex.flush()
    visible += tail
    assert visible == "앞 문장  뒤"
    assert [(c.call_id, c.name, c.arguments) for c in calls] == [("a1", "slot.read", {"slotId": "s1"})]


def test_extractor_drops_unclosed_or_malformed_blocks() -> None:
    ex = ToolCallExtractor()
    text, calls = ex.feed("A<tool_call>not json</tool_call>B<tool_call>{\"name\":")
    tail, _ = ex.flush()
    assert text + tail == "AB"
    assert calls == []
    assert len(ex.malformed) == 2


def test_engines_report_offline_when_external_llm_disabled() -> None:
    body = client.get("/api/assistant/engines").json()
    assert body["externalLlmEnabled"] is False
    assert body["composer"]["provider"] == "offline"


def test_composer_session_tool_round_trip() -> None:
    session = client.post("/api/assistant/sessions", json={}).json()
    sid = session["sessionId"]
    tools = [{"name": "workspace.getState", "description": "현재 상태", "risk": "read", "inputSchema": {}}]

    first = _events(client.post(
        f"/api/assistant/sessions/{sid}/messages",
        json={
            "text": "상태 확인해줘 [[tool:workspace.getState]]",
            "contexts": [{"kind": "slot", "id": "s1", "label": "요약 슬롯", "content": "<p>본문</p>"}],
            "tools": tools,
        },
    ))
    kinds = [e["type"] for e in first]
    assert kinds[0] == "turn_start"
    call = next(e for e in first if e["type"] == "tool_call")
    assert call["name"] == "workspace.getState"
    assert "<tool_call>" not in "".join(e.get("text", "") for e in first if e["type"] == "text_delta")
    assert first[-1]["type"] == "turn_done" and first[-1]["stopReason"] == "tool_calls"

    second = _events(client.post(
        f"/api/assistant/sessions/{sid}/tool-results",
        json={"results": [{"id": call["id"], "name": call["name"], "ok": True, "output": {"phase": "drafting"}}]},
    ))
    assert "도구 결과를 확인했습니다." in "".join(e.get("text", "") for e in second if e["type"] == "text_delta")
    assert second[-1]["stopReason"] == "end_turn"

    assert client.delete(f"/api/assistant/sessions/{sid}").status_code == 204
    missing = client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "hi"})
    assert missing.status_code == 404


def test_inline_run_returns_clean_result() -> None:
    events = _events(client.post(
        "/api/assistant/inline/run",
        json={
            "actionId": "summarize",
            "instruction": "간결하게 요약해줘",
            "contexts": [{"kind": "slot", "id": "s1", "label": "슬롯", "content": "긴 본문"}],
            "outputFormat": "html",
        },
    ))
    result = next(e for e in events if e["type"] == "result")
    assert result["text"].startswith("<p>")
    assert events[-1]["stopReason"] == "end_turn"


def test_ui_and_stage_tools_do_not_block_the_turn() -> None:
    """ui · stage 도구는 결과를 기다리지 않는다 — 턴이 end_turn 으로 끝나고, 결과는 다음 메시지에 실린다."""
    sid = client.post("/api/assistant/sessions", json={}).json()["sessionId"]
    tools = [{"name": "canvas.selectSlot", "description": "이동", "risk": "ui", "inputSchema": {}}]
    events = _events(client.post(
        f"/api/assistant/sessions/{sid}/messages",
        json={"text": "보여줘 [[tool:canvas.selectSlot]]", "tools": tools},
    ))
    call = next(e for e in events if e["type"] == "tool_call")
    assert call["async"] is True
    assert events[-1]["stopReason"] == "end_turn"

    follow = _events(client.post(
        f"/api/assistant/sessions/{sid}/messages",
        json={
            "text": "다음",
            "tools": tools,
            "deferredResults": [{"id": call["id"], "name": call["name"], "ok": True, "output": {"selected": "s1"}}],
        },
    ))
    assert follow[-1]["stopReason"] == "end_turn"


def test_tool_manifest_is_rendered_as_compact_signatures() -> None:
    from app.assistant.models import ToolSpec
    from app.assistant.prompts import render_tools

    text = render_tools([ToolSpec("slot.read", "읽기", "read", {"type": "object", "properties": {"slotId": {"type": "string"}}, "required": ["slotId"]})])
    assert "slot.read(slotId*: string) [read]" in text
    assert "{" not in text.split("\n", 1)[1]


def test_attachment_role_and_handle_reach_the_prompt() -> None:
    from app.assistant.prompts import render_contexts
    from app.assistant.schemas import ContextItemPayload

    items = [
        ContextItemPayload(kind="block", id="blk_1", label='결정 "표"', content="r1: ...", role="target", handle="@블록1").to_model(),
        ContextItemPayload(kind="ref-region", id="doc:p1", label="참조1 p1 영역", content="본문", role="reference", handle="@영역1").to_model(),
        ContextItemPayload(kind="document", id="doc", label="열린 문서", content="docId", role="bogus").to_model(),
    ]
    rendered = render_contexts(items)
    assert 'kind="block" id="blk_1" label="결정 \'표\'" role="target" handle="@블록1"' in rendered
    assert 'role="reference" handle="@영역1"' in rendered
    # 모르는 역할 · 자동 첨부는 역할 없이
    assert '<context kind="document" id="doc" label="열린 문서">' in rendered


def test_slot_map_inline_format_is_accepted() -> None:
    from app.assistant.prompts import inline_message
    from app.assistant.schemas import InlineRunRequest

    request = InlineRunRequest.model_validate(
        {"instruction": "다듬어줘", "contexts": [], "outputFormat": "slot-map"}
    )
    assert request.outputFormat == "slot-map"
    message = inline_message("다듬어줘", [], "slot-map")
    assert "JSON 객체 하나만" in message and "slotId" in message
