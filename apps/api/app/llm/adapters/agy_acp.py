"""ACP (Agent Client Protocol) 기반 ConversationEngine 구현.

`AcpClient` 를 통해 `session/new`, `session/prompt`, `session/cancel` 을 수행하고,
`session/update` 알림(`agent_thought_chunk`, `agent_message_chunk`, `tool_call`)을
`ConversationEngine` 표준 이벤트로 변환한다.
"""
from __future__ import annotations

import concurrent.futures
import logging
import queue
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterator, Optional

from ..models import EngineChoice
from .acp_client import _EOF, AcpClient

logger = logging.getLogger(__name__)

EXACT_MODEL_NAMES = {
    "gpt-oss-120b-medium",
    "gemini-3.8-flash",
    "gemini-4-argon",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "claude-sonnet-5-5",
    "claude-opus-5-5",
}


def _split_model_and_thought(model: str, default_thought: str = "medium") -> tuple[str, str]:
    """'gemini-3.8-flash-high' -> ('gemini-3.8-flash', 'high').

    gpt-oss-120b-medium 과 같은 고유 모델명은 접미사를 자르지 않고 보존한다.
    """
    if model in EXACT_MODEL_NAMES:
        return model, default_thought
    for level in ("-low", "-medium", "-high"):
        if model.endswith(level):
            base = model[: -len(level)]
            return base, level[1:]
    return model, default_thought


#: ACP `tool_call_update.status` → 앱 도구 카드 상태. agy 1.5.3 은 훅에 막힌 도구 · 없는 파일 읽기를 `failed` 로 보낸다.
_DONE_STATUSES = {"completed", "done", "success"}
_ERROR_STATUSES = {"failed", "error", "cancelled", "canceled", "rejected"}


def _tool_state(status: Any) -> str:
    st = str(status or "").lower()
    if st in _DONE_STATUSES:
        return "done"
    if st in _ERROR_STATUSES:
        return "error"
    return "running"


def _tool_error_text(update: dict[str, Any]) -> str:
    """실패한 도구 갱신에 실린 사유 (content 의 text · rawOutput 의 output/error). 없으면 빈 문자열."""
    parts: list[str] = []
    for block in update.get("content") or []:
        inner = block.get("content") if isinstance(block, dict) else None
        text = (inner or {}).get("text") if isinstance(inner, dict) else None
        if text and str(text).strip():
            parts.append(str(text).strip())
    raw = update.get("rawOutput")
    if isinstance(raw, dict):
        for key in ("error", "output", "message"):
            if raw.get(key) and str(raw[key]).strip():
                parts.append(str(raw[key]).strip())
    elif isinstance(raw, str) and raw.strip():
        parts.append(raw.strip())
    return " · ".join(dict.fromkeys(parts))[:500]


class AcpConversation:
    """ConversationEngine 프로토콜 구현 (ACP stdio)."""

    def __init__(
        self,
        client: AcpClient,
        choice: EngineChoice,
        sandbox_dir: Path,
        *,
        idle_timeout: float = 180.0,
        resume_session_id: Optional[str] = None,
        single_turn: bool = False,
        default_thought_level: str = "medium",
        mcp_servers: Optional[list[dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
        roots_provider: Optional[Callable[[], list[str]]] = None,
    ) -> None:
        self.choice = choice
        self._client = client
        self._sandbox_dir = sandbox_dir
        self._idle_timeout = idle_timeout
        self._single_turn = single_turn
        self._session_id: Optional[str] = resume_session_id
        self._mcp_servers = mcp_servers
        self._system_prompt = system_prompt
        self._roots_provider = roots_provider
        self._closed = False
        self._configured = False

        base_model, thought_level = _split_model_and_thought(choice.model, default_thought_level)
        self._base_model = base_model
        self._thought_level = thought_level

        if self._session_id:
            self._apply_config()

    def _ensure_session(self) -> None:
        if self._session_id is not None:
            return
        roots = self._roots_provider() if self._roots_provider else []
        meta = {"antigravity": {"systemPrompt": {"append": self._system_prompt}}} if self._system_prompt else None
        res = self._client.new_session(
            self._sandbox_dir,
            mcp_servers=self._mcp_servers,
            meta=meta,
            additional_directories=roots,
        )
        self._session_id = res.get("sessionId")
        if not self._session_id:
            raise RuntimeError(f"ACP session/new 에서 sessionId 를 받지 못했습니다: {res}")
        self._apply_config()
        #: 이번 run_turn 이 세션을 새로 만들었다 — 첫 이벤트로 알려서, 도구 호출 전에 작업 공간이 대화 id 를 묶게 한다
        self._session_announced = False

    def _apply_config(self) -> None:
        if not self._session_id or not self._client.alive:
            return
        try:
            self._client.set_config_option(self._session_id, "model", self._base_model)
            self._client.set_config_option(self._session_id, "thought_level", self._thought_level)
            self._configured = True
        except Exception as exc:
            logger.warning("[acp] config option 설정 실패: %s", exc)

    def set_engine_choice(self, choice: EngineChoice, thought_level: Optional[str] = None) -> None:
        """세션 도중 모델이나 생각 강도가 바뀌었을 때 configOption 을 갱신한다."""
        self.choice = choice
        base_model, thought = _split_model_and_thought(choice.model, thought_level or self._thought_level)
        self._base_model = base_model
        self._thought_level = thought
        self._apply_config()

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        if not self._client.alive:
            yield {"type": "error", "message": "ACP 프로세스가 종료되어 있습니다."}
            return
        try:
            self._ensure_session()
        except Exception as exc:
            logger.exception("[acp] session/new 실패: %s", exc)
            yield {"type": "error", "message": f"ACP 세션 초기화 실패: {exc}"}
            return
        if not self._session_id:
            yield {"type": "error", "message": "ACP 세션이 열려있지 않습니다."}
            return
        if not getattr(self, "_session_announced", True):
            self._session_announced = True
            yield {"type": "engine_session", "conversationId": self._session_id}

        if not self._configured:
            self._apply_config()

        event_queue = self._client.subscribe(self._session_id)
        started = time.monotonic()
        first_token_ms: Optional[int] = None
        completed = False

        # 비동기 요청 발행 (스레드에서 대기)
        fut: concurrent.futures.Future[dict[str, Any]] = concurrent.futures.Future()

        def do_prompt():
            try:
                res = self._client.prompt(self._session_id, text, timeout=None)
                fut.set_result(res)
            except Exception as exc:
                fut.set_exception(exc)

        prompt_thread = threading.Thread(target=do_prompt, name=f"acp-prompt-{self._session_id[:8]}", daemon=True)
        prompt_thread.start()

        try:
            last_event = time.monotonic()
            while True:
                # 1. 취소 신호 확인
                if cancel.is_set():
                    try:
                        self._client.cancel(self._session_id)
                    except Exception:
                        pass
                    yield {"type": "error", "message": "사용자가 실행을 중단했습니다.", "code": "interrupted"}
                    yield {
                        "type": "turn_done",
                        "stopReason": "interrupted",
                        "usage": {},
                        "durationMs": int((time.monotonic() - started) * 1000),
                    }
                    return

                # 2. 완료 여부 확인
                if fut.done() and event_queue.empty():
                    break

                # 3. 큐에서 업데이트 인출
                try:
                    update = event_queue.get(timeout=0.1)
                except queue.Empty:
                    if time.monotonic() - last_event > self._idle_timeout:
                        try:
                            self._client.cancel(self._session_id)
                        except Exception:
                            pass
                        yield {"type": "error", "message": f"ACP 응답이 {int(self._idle_timeout)}초 동안 없어 중단했습니다.", "code": "timeout"}
                        yield {
                            "type": "turn_done",
                            "stopReason": "timeout",
                            "usage": {},
                            "durationMs": int((time.monotonic() - started) * 1000),
                        }
                        return
                    continue

                if update is _EOF:
                    yield {"type": "error", "message": "ACP 프로세스가 응답 중에 종료되었습니다."}
                    yield {
                        "type": "turn_done",
                        "stopReason": "error",
                        "usage": {},
                        "durationMs": int((time.monotonic() - started) * 1000),
                    }
                    return

                last_event = time.monotonic()
                if not isinstance(update, dict):
                    continue

                session_update = update.get("sessionUpdate")

                # A. 생각 청크
                if session_update == "agent_thought_chunk":
                    content = update.get("content") or {}
                    chunk = content.get("text") or ""
                    if chunk:
                        yield {"type": "thinking_delta", "text": chunk}

                # B. 답변 텍스트 청크
                elif session_update == "agent_message_chunk":
                    content = update.get("content") or {}
                    chunk = content.get("text") or ""
                    if chunk:
                        if first_token_ms is None:
                            first_token_ms = int((time.monotonic() - started) * 1000)
                        yield {"type": "text_delta", "text": chunk}

                # C. 도구 호출 시작
                elif session_update == "tool_call":
                    yield {
                        "type": "agent_tool",
                        "callId": update.get("toolCallId"),
                        "name": update.get("name") or "tool",
                        "state": "running",
                        "params": update.get("args") or update.get("rawInput") or {},
                        "kind": update.get("kind"),
                        "title": update.get("title"),
                        "locations": update.get("locations"),
                    }

                # D. 도구 호출 완료/갱신
                elif session_update == "tool_call_update":
                    state = _tool_state(update.get("status"))
                    event = {
                        "type": "agent_tool",
                        "callId": update.get("toolCallId"),
                        "name": update.get("name") or "tool",
                        "state": state,
                        "params": update.get("args") or update.get("rawInput") or {},
                        "kind": update.get("kind"),
                        "title": update.get("title"),
                        "locations": update.get("locations"),
                    }
                    if state == "error":
                        # 사유가 실려 오면 쓴다. 비어 있으면(훅 차단 등) 상위 계층이 훅 로그에서 채운다.
                        event["error"] = _tool_error_text(update)
                    yield event

            # 4. 프롬프트 응답 처리
            try:
                res = fut.result(timeout=1.0)
            except Exception as exc:
                yield {"type": "error", "message": f"ACP prompt 실패: {exc}"}
                yield {
                    "type": "turn_done",
                    "stopReason": "error",
                    "usage": {},
                    "durationMs": int((time.monotonic() - started) * 1000),
                }
                return

            stop_reason = "end_turn"
            if "error" in res:
                err_msg = str(res["error"].get("message") or res["error"])
                yield {"type": "error", "message": f"ACP 오류: {err_msg}"}
                stop_reason = "error"

            raw_usage = (res.get("result") or {}).get("usage") or {}
            usage = {
                "input_tokens": raw_usage.get("inputTokens", raw_usage.get("input_tokens", 0)),
                "output_tokens": raw_usage.get("outputTokens", raw_usage.get("output_tokens", 0)),
                "thought_tokens": raw_usage.get("thoughtTokens", raw_usage.get("thought_tokens", 0)),
                "cached_read_tokens": raw_usage.get("cachedReadTokens", raw_usage.get("cached_read_tokens", 0)),
                "total_tokens": raw_usage.get("totalTokens", raw_usage.get("total_tokens", 0)),
            }
            yield {
                "type": "turn_done",
                "stopReason": stop_reason,
                "usage": usage,
                "durationMs": int((time.monotonic() - started) * 1000),
                "firstTokenMs": first_token_ms,
            }
            completed = True
        finally:
            self._client.unsubscribe(self._session_id, event_queue)
            if self._single_turn or not completed:
                if self._single_turn:
                    self.close()

    def export_state(self) -> dict[str, Any]:
        return {"acp_session_id": self._session_id, "agy_conversation_id": self._session_id} if self._session_id else {}

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._session_id and self._client.alive:
            self._client.close_session(self._session_id)
