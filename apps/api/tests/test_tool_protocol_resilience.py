"""tool_protocol & AssistantService malformed <tool_call> resilience tests."""
from __future__ import annotations

from app.assistant.tool_protocol import ToolCallExtractor


def test_extractor_reports_unclosed_tag_detail_on_truncated_large_call() -> None:
    ext = ToolCallExtractor(id_prefix="c0")
    huge_partial = '<tool_call>{"name": "assets.register", "arguments": {"asset": {"nodes": [' + ("x" * 3300)
    visible, calls = ext.feed(huge_partial)
    assert visible == ""
    assert calls == []
    assert ext.pending_name == "assets.register"
    assert ext.pending_chars > 3300

    tail, tail_calls = ext.flush()
    assert tail == ""
    assert tail_calls == []
    assert len(ext.malformed) == 1
    assert len(ext.malformed_details) == 1
    detail = ext.malformed_details[0]
    assert detail.name == "assets.register"
    assert detail.reason == "unclosed_tag"
    assert detail.chars > 3300


def test_extractor_reports_invalid_json_detail_with_tool_name() -> None:
    ext = ToolCallExtractor(id_prefix="c1")
    broken = '<tool_call>{"name": "assets.register", "arguments": {"title": "깨진표", bad_json}}</tool_call>'
    visible, calls = ext.feed(broken)
    assert visible == ""
    assert calls == []
    assert len(ext.malformed_details) == 1
    detail = ext.malformed_details[0]
    assert detail.name == "assets.register"
    assert detail.reason == "invalid_json"
    assert detail.chars > 0


def test_extractor_reports_missing_name_when_json_valid_but_no_name() -> None:
    ext = ToolCallExtractor(id_prefix="c2")
    _, calls = ext.feed('<tool_call>{"arguments": {"a": 1}}</tool_call>')
    assert calls == []
    assert len(ext.malformed_details) == 1
    assert ext.malformed_details[0].reason == "missing_name"


def test_extractor_still_parses_valid_compact_dsl_call_cleanly() -> None:
    ext = ToolCallExtractor(id_prefix="c3")
    raw = (
        '등록합니다.\n<tool_call>{"name": "assets.register", "arguments": {"title": "요구사항 목록표", '
        '"scope": "element", "dsl": ["<<view:table>> 요구사항 목록표", "  순번 | 구분", "  * {{seq}} | {{cat^}}"]}}</tool_call>'
    )
    visible, calls = ext.feed(raw)
    assert "등록합니다." in visible
    assert len(calls) == 1
    assert calls[0].name == "assets.register"
    assert calls[0].arguments["title"] == "요구사항 목록표"
    assert ext.malformed_details == []
