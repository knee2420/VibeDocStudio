"""ACP 어댑터 및 이벤트 변환, 인용 검증 단위 테스트."""
from __future__ import annotations

import queue
import threading
from pathlib import Path

from app.assistant.workspace.citations import extract_citations, verify_citations
from app.llm.adapters.agy_acp import AcpConversation, _split_model_and_thought
from app.llm.models import EngineChoice


def test_split_model_and_thought():
    assert _split_model_and_thought("gemini-3.8-flash-low") == ("gemini-3.8-flash", "low")
    assert _split_model_and_thought("gemini-3.8-flash-medium") == ("gemini-3.8-flash", "medium")
    assert _split_model_and_thought("gemini-3.8-flash-high") == ("gemini-3.8-flash", "high")
    assert _split_model_and_thought("gemini-4-argon") == ("gemini-4-argon", "medium")
    assert _split_model_and_thought("claude-sonnet-5-5", default_thought="high") == ("claude-sonnet-5-5", "high")
    # gpt-oss-120b-medium 은 고유 모델명이므로 접미사가 잘리지 않는다
    assert _split_model_and_thought("gpt-oss-120b-medium") == ("gpt-oss-120b-medium", "medium")


def test_citation_extraction_and_verification():
    text = (
        "이 분석은 [규정 문서](file:///c:/workspace/docs/policy.md#L10-L25)에 따르며, "
        "세부 조항은 vdoc:resource/res-101 (L 50-60) 및 [첨부](vdoc:resource/res-102#L5)에 명시되어 있다."
    )
    citations = extract_citations(text)
    assert len(citations) == 3

    assert citations[0].target == "c:/workspace/docs/policy.md"
    assert citations[0].start_line == 10
    assert citations[0].end_line == 25

    assert citations[1].target == "res-101"
    assert citations[1].start_line == 50
    assert citations[1].end_line == 60

    assert citations[2].target == "res-102"
    assert citations[2].start_line == 5
    assert citations[2].end_line == 5

    # 검증: reads 에 policy.md L1-L100 만 있고 res-101 은 없는 경우
    reads = [
        {"path": "c:/workspace/docs/policy.md", "start": 1, "end": 100},
        {"path": "res-102", "start": 1, "end": 10},
    ]
    verified, warnings = verify_citations(citations, reads)
    assert verified[0].is_verified is True
    assert verified[1].is_verified is False
    assert verified[2].is_verified is True
    assert len(warnings) == 1
    assert "res-101" in warnings[0]


class FakeAcpClient:
    def __init__(self):
        self.alive = True
        self.config_options = {}
        self.cancelled = False
        self.closed_sessions = []
        self.subscriber_queues = []
        self.new_session_params = {}
        self.prompt_delay = 0.0
        self.prompt_error = None

    def new_session(self, cwd: Path, mcp_servers=None, meta=None, additional_directories=None):
        self.new_session_params = {
            "cwd": cwd,
            "mcp_servers": mcp_servers,
            "meta": meta,
            "additional_directories": additional_directories,
        }
        return {"sessionId": "test-sess-123"}

    def set_config_option(self, session_id: str, config_id: str, value: str):
        self.config_options[config_id] = value
        return {}

    def subscribe(self, session_id: str):
        q = queue.Queue()
        self.subscriber_queues.append(q)
        return q

    def unsubscribe(self, session_id: str, q):
        if q in self.subscriber_queues:
            self.subscriber_queues.remove(q)

    def prompt(self, session_id: str, prompt_text: str, timeout=None):
        if self.prompt_error:
            raise RuntimeError(self.prompt_error)
        # 모의 이벤트 발행
        for q in self.subscriber_queues:
            q.put({
                "sessionUpdate": "agent_thought_chunk",
                "content": {"type": "text", "text": "생각 중..."},
            })
            q.put({
                "sessionUpdate": "tool_call",
                "toolCallId": "c1",
                "name": "read_file",
                "args": {"Path": "test.txt", "StartLine": 1, "EndLine": 10},
            })
            q.put({
                "sessionUpdate": "tool_call_update",
                "toolCallId": "c1",
                "name": "read_file",
                "status": "completed",
            })
            q.put({
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": "답변입니다."},
            })
        return {
            "result": {
                "stopReason": "end_turn",
                "usage": {"inputTokens": 100, "outputTokens": 20, "thoughtTokens": 15, "cachedReadTokens": 5, "totalTokens": 135},
            }
        }

    def cancel(self, session_id: str):
        self.cancelled = True

    def close_session(self, session_id: str):
        self.closed_sessions.append(session_id)


def test_acp_conversation_events(tmp_path: Path):
    client = FakeAcpClient()
    choice = EngineChoice(provider="agy_cli", model="gemini-3.8-flash-high")
    conv = AcpConversation(
        client=client,  # type: ignore[arg-type]
        choice=choice,
        sandbox_dir=tmp_path,
        idle_timeout=10.0,
    )

    cancel = threading.Event()
    events = list(conv.run_turn("hello", cancel))

    assert client.config_options["model"] == "gemini-3.8-flash"
    assert client.config_options["thought_level"] == "high"

    types = [e["type"] for e in events]
    assert "thinking_delta" in types
    assert "agent_tool" in types
    assert "text_delta" in types
    assert "turn_done" in types

    done = next(e for e in events if e["type"] == "turn_done")
    assert done["usage"]["input_tokens"] == 100
    assert done["usage"]["thought_tokens"] == 15
    assert done["usage"]["cached_read_tokens"] == 5


def test_acp_conversation_mcp_and_system_prompt(tmp_path: Path):
    client = FakeAcpClient()
    choice = EngineChoice(provider="agy_cli", model="gemini-3.8-flash")
    mcp_specs = [{"name": "vibefs", "command": "python"}]
    roots = [str(tmp_path / "workspace_a")]
    conv = AcpConversation(
        client=client,  # type: ignore[arg-type]
        choice=choice,
        sandbox_dir=tmp_path,
        mcp_servers=mcp_specs,
        system_prompt="operating rules",
        roots_provider=lambda: roots,
    )
    # Lazy session: new_session 은 run_turn 때 불린다
    assert client.new_session_params == {}

    list(conv.run_turn("hello", threading.Event()))

    assert client.new_session_params["mcp_servers"] == mcp_specs
    assert client.new_session_params["meta"] == {"antigravity": {"systemPrompt": {"append": "operating rules"}}}
    assert client.new_session_params["additional_directories"] == roots

    conv.close()
    assert "test-sess-123" in client.closed_sessions


def test_acp_conversation_cancel(tmp_path: Path):
    client = FakeAcpClient()
    choice = EngineChoice(provider="agy_cli", model="gemini-3.8-flash")
    conv = AcpConversation(
        client=client,  # type: ignore[arg-type]
        choice=choice,
        sandbox_dir=tmp_path,
    )
    cancel = threading.Event()
    cancel.set()
    events = list(conv.run_turn("hello", cancel))
    assert client.cancelled is True
    assert any(e.get("code") == "interrupted" for e in events)
    assert events[-1]["type"] == "turn_done"
    assert events[-1]["stopReason"] == "interrupted"


def test_acp_conversation_prompt_error_yields_turn_done(tmp_path: Path):
    client = FakeAcpClient()
    client.prompt_error = "Server crashed"
    choice = EngineChoice(provider="agy_cli", model="gemini-3.8-flash")
    conv = AcpConversation(
        client=client,  # type: ignore[arg-type]
        choice=choice,
        sandbox_dir=tmp_path,
    )
    cancel = threading.Event()
    events = list(conv.run_turn("hello", cancel))
    assert any(e.get("type") == "error" and "Server crashed" in e.get("message", "") for e in events)
    assert events[-1]["type"] == "turn_done"
    assert events[-1]["stopReason"] == "error"


def test_failed_tool_updates_become_error_state(tmp_path: Path):
    """agy 는 훅에 막힌 도구를 `status: failed` 로 보낸다 — 예전에는 '진행 중' → '완료' 로 둔갑했다."""
    from app.llm.adapters.agy_acp import _tool_error_text, _tool_state

    assert _tool_state("completed") == "done" and _tool_state("failed") == "error"
    assert _tool_state("cancelled") == "error" and _tool_state("in_progress") == "running"
    assert _tool_error_text({"content": [{"type": "content", "content": {"type": "text", "text": ""}}], "rawOutput": {"output": ""}}) == ""
    assert _tool_error_text({"rawOutput": {"error": "boom"}}) == "boom"

    client = FakeAcpClient()

    def prompt(session_id, prompt_text, timeout=None):
        for q in client.subscriber_queues:
            q.put({"sessionUpdate": "tool_call", "toolCallId": "t1", "name": "mcp_vibefs_ws_tree", "rawInput": {"path": "discussions"}})
            q.put({"sessionUpdate": "tool_call_update", "toolCallId": "t1", "name": "mcp_vibefs_ws_tree", "status": "failed",
                   "content": [{"type": "content", "content": {"type": "text", "text": ""}}]})
        return {"result": {"stopReason": "end_turn", "usage": {}}}

    client.prompt = prompt  # type: ignore[method-assign]
    conv = AcpConversation(client=client, choice=EngineChoice("agy_cli", "gemini-3.8-flash"), sandbox_dir=tmp_path, idle_timeout=10.0)  # type: ignore[arg-type]
    events = [e for e in conv.run_turn("hi", threading.Event()) if e["type"] == "agent_tool"]
    assert [e["state"] for e in events] == ["running", "error"]
    assert events[-1]["error"] == ""  # 사유가 비어 있으면 상위 계층(AssistantService)이 훅 로그에서 채운다


def test_scrub_surrogates():
    from app.llm.adapters.acp_client import scrub_surrogates

    # 1. 짝 없는 서로게이트가 U+FFFD 로 치환되는지 확인
    assert scrub_surrogates("a\ud83db") == "a\ufffdb"

    # 2. 정상 이모지 및 한글 등은 그대로 유지되는지 확인
    assert scrub_surrogates("🐕망고독") == "🐕망고독"
    assert scrub_surrogates("🎯(Project)") == "🎯(Project)"
    assert scrub_surrogates("한글 텍스트 1234 !@#$") == "한글 텍스트 1234 !@#$"


def test_acp_client_send_raw_with_surrogates():
    from io import BytesIO
    from unittest.mock import MagicMock

    from app.llm.adapters.acp_client import AcpClient

    # 가짜 클라이언트 인스턴스 준비 (서브프로세스 띄우지 않고 _send_raw 만 검증)
    client = object.__new__(AcpClient)
    client._closed = threading.Event()
    client._write_lock = threading.Lock()
    fake_stdin = BytesIO()
    fake_proc = MagicMock()
    fake_proc.poll.return_value = None
    fake_proc.stdin = fake_stdin
    client._proc = fake_proc

    # 짝 없는 서로게이트가 포함된 메시지 전송
    msg = {"text": "x\ud83d"}
    client._send_raw(msg)

    # 예외 없이 유효한 UTF-8 바이트로 성공적으로 쓰였는지 확인
    data = fake_stdin.getvalue()
    assert len(data) > 0
    # UTF-8 로 디코딩 시 에러 없이 복원되어야 함
    decoded = data.decode("utf-8")
    assert "Content-Length:" in decoded
    assert "\ufffd" in decoded


def test_completed_tool_updates_include_output(tmp_path: Path):
    """완료된 ACP 도구 갱신의 출력(content/rawOutput)이 agent_tool.output 으로 전달되어야 프론트가 dc_new/dc_build/dc_use 를 감지한다."""
    from app.llm.adapters.agy_acp import _tool_output_text

    assert _tool_output_text({
        "content": [{"type": "content", "content": {"type": "text", "text": "새 문서를 만들었다: docId=vdoc-123"}}],
    }) == "새 문서를 만들었다: docId=vdoc-123"
    assert _tool_output_text({"rawOutput": {"output": "저장했다 (rev 2) [vdoc-123]"}}) == "저장했다 (rev 2) [vdoc-123]"
    assert _tool_output_text({"content": [], "rawOutput": {}}) == ""

    client = FakeAcpClient()

    def prompt(session_id, prompt_text, timeout=None):
        for q in client.subscriber_queues:
            q.put({"sessionUpdate": "tool_call", "toolCallId": "t1", "name": "mcp_vibefs_dc_new", "rawInput": {"title": "새 글"}})
            q.put({
                "sessionUpdate": "tool_call_update",
                "toolCallId": "t1",
                "name": "mcp_vibefs_dc_new",
                "status": "completed",
                "content": [{"type": "content", "content": {"type": "text", "text": "새 문서를 만들었다: docId=vdoc-abc-1"}}],
            })
        return {"result": {"stopReason": "end_turn", "usage": {}}}

    client.prompt = prompt  # type: ignore[method-assign]
    conv = AcpConversation(client=client, choice=EngineChoice("agy_cli", "gemini-3.8-flash"), sandbox_dir=tmp_path, idle_timeout=10.0)  # type: ignore[arg-type]
    events = [e for e in conv.run_turn("hi", threading.Event()) if e["type"] == "agent_tool"]
    assert [e["state"] for e in events] == ["running", "done"]
    assert events[-1]["output"] == "새 문서를 만들었다: docId=vdoc-abc-1"


