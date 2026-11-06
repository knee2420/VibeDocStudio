"""Composer 세션 · 인라인 액션 실행.

에이전트 루프의 주도권은 프론트에 있다. 서버는 한 번의 요청(메시지 또는 도구 결과)에 대해
모델이 멈출 때까지(답을 끝내거나 도구 호출을 내보낼 때까지) 이벤트를 흘린다.
도구 호출이 나오면 `turn_done.stopReason == "tool_calls"` 로 끝나고, 프론트가 도구를 실행해
`submit_tool_results` 로 결과를 보내면 같은 대화가 이어진다.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field, replace
from typing import Any, Generator, Iterator, Optional

from app.core.llm.execution_policy import RuntimeExecutionPolicy

from ..errors import AssistantSessionNotFoundError
from ..models import ContextItem, EngineChoice, ToolCall, ToolSpec
from ..ports import ConversationEngine, EngineProvider, ServerToolbox
from ..prompts import clean_inline_output, composer_message, inline_message
from ..tool_protocol import ToolCallExtractor, render_tool_results

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 16
SESSION_IDLE_SECONDS = 30 * 60
#: 이 시간 동안 쓰지 않은 세션은 agy 프로세스(개당 170MB 이상)만 내린다. 대화는 다음 턴에
#: `--conversation <id>` 로 다시 잇는다 (기동 약 5초).
PROCESS_IDLE_SECONDS = 10 * 60
#: 결과를 기다리지 않는 도구 위험도 — 프론트가 스트리밍 중 즉시 실행하고, 모델은 답변을 이어 쓴다.
ASYNC_RISKS = frozenset({"ui", "stage"})
#: 도구 블록 작성 진행 이벤트 간격 (문자 수).
PROGRESS_STEP_CHARS = 120


@dataclass
class _Session:
    session_id: str
    engine: ConversationEngine
    created_at: float = field(default_factory=time.monotonic)
    last_used: float = field(default_factory=time.monotonic)
    tools_hash: Optional[str] = None
    tool_risks: dict[str, str] = field(default_factory=dict)
    pending_calls: dict[str, ToolCall] = field(default_factory=dict)
    tool_rounds: int = 0
    mode: str = "agent"
    #: 서버 도구의 범위 (이번 메시지에 첨부된 덱 id 들)
    server_scope: list[str] = field(default_factory=list)
    #: 프론트 도구와 같은 응답에 섞여 나온 서버 도구 결과 — 프론트 결과가 오면 함께 모델에 보낸다
    carry_results: list[dict[str, Any]] = field(default_factory=list)
    #: 이 대화에 이미 지도 요약을 보낸 서버 첨부 (같은 대화에서는 다시 보내지 않는다 — 대화 기록에 남아 있다)
    briefed: set[str] = field(default_factory=set)
    cancel: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)


def _deck_marks(content: Optional[str]) -> dict[str, str]:
    """덱 첨부 본문의 표식 줄 (`builtAt: …`, `focusCards: …`)."""
    marks: dict[str, str] = {}
    for line in (content or "").splitlines():
        key, sep, value = line.partition(":")
        if sep and key.strip() in ("builtAt", "focusCards", "sections"):
            marks[key.strip()] = value.strip()
    return marks


def _focus_hint(focus_cards: str) -> str:
    cards = [c.strip() for c in focus_cards.split(",") if c.strip()][:12]
    if not cards:
        return ""
    return (
        f"\n[우선 카드] 사용자가 지금 작업 중인 칸의 근거 카드: {', '.join(cards)} "
        "— 이 카드부터 knowledge.cards 로 확인하고, 모자랄 때만 넓혀 찾아라."
    )


def _tools_hash(tools: list[ToolSpec]) -> str:
    raw = json.dumps(
        [(t.name, t.description, t.risk, t.input_schema) for t in tools],
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


class AssistantService:
    def __init__(
        self,
        engines: EngineProvider,
        policy: RuntimeExecutionPolicy,
        inline_model: str,
        server_tools: Optional[ServerToolbox] = None,
    ) -> None:
        self._engines = engines
        self._policy = policy
        self._inline_model = inline_model
        self._server = server_tools
        self._sessions: dict[str, _Session] = {}
        self._lock = threading.Lock()

    # --- 엔진 선택 ---------------------------------------------------------------

    def default_choice(self) -> EngineChoice:
        snap = self._policy.snapshot()
        return self._engines.resolve(snap.primary_provider, snap.primary_model)

    def inline_choice(self, model: Optional[str] = None) -> EngineChoice:
        snap = self._policy.snapshot()
        return self._engines.resolve(snap.primary_provider, model or self._inline_model)

    def engines_status(self) -> dict[str, Any]:
        # 열린 Composer 가 주기적으로 부르는 곳이라, 유휴 정리를 여기에 얹는다 (별도 타이머 없이).
        self.release_idle()
        choice = self.default_choice()
        inline = self.inline_choice()
        with self._lock:
            session_count = len(self._sessions)
        return {
            **self._engines.status(),
            "composer": {"provider": choice.provider, "model": choice.model},
            "inline": {"provider": inline.provider, "model": inline.model},
            "models": {
                "agy_cli": self._engines.available_models("agy_cli"),
                "google_api": self._engines.available_models("google_api"),
            },
            "sessions": session_count,
        }

    def warmup(self) -> dict[str, Any]:
        self.release_idle()
        composer = self.default_choice()
        inline = self.inline_choice()
        # 같은 모델을 함께 쓰면 대기 2개 — Composer 새 대화와 인라인 연속 실행이 서로 기동을 기다리지 않게.
        # 목표는 매번 통째로 바뀌므로, 예전에 고른 모델의 대기 프로세스는 여기서 내려간다.
        targets = {composer: 2} if inline == composer else {composer: 1, inline: 1}
        self._engines.warmup(targets)
        return {"composer": composer.model, "inline": inline.model}

    # --- 세션 --------------------------------------------------------------------

    def create_session(self, provider: Optional[str] = None, model: Optional[str] = None) -> dict[str, Any]:
        self.release_idle()
        snap = self._policy.snapshot()
        choice = self._engines.resolve(provider or snap.primary_provider, model or snap.primary_model)
        engine = self._engines.open_conversation(choice, lane="composer")
        session = _Session(session_id=f"asst-{uuid.uuid4().hex[:12]}", engine=engine)
        with self._lock:
            self._sessions[session.session_id] = session
        return {"sessionId": session.session_id, "provider": choice.provider, "model": choice.model}

    def close_session(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.cancel.set()
            session.engine.close()

    def interrupt(self, session_id: str) -> None:
        self._get(session_id).cancel.set()

    def interrupt_quietly(self, session_id: str) -> None:
        """클라이언트 연결이 끊겼을 때 — 세션이 이미 닫혔어도 조용히 넘어간다."""
        with self._lock:
            session = self._sessions.get(session_id)
        if session is not None:
            session.cancel.set()

    def send_message(
        self,
        session_id: str,
        *,
        text: str,
        contexts: list[ContextItem],
        tools: list[ToolSpec],
        mode: str = "agent",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        deferred_results: Optional[list[dict[str, Any]]] = None,
    ) -> Iterator[dict[str, Any]]:
        session = self._get(session_id)
        self._maybe_switch_engine(session, provider, model)
        contexts, scope, server_specs = self._server_context(contexts, session.briefed)
        all_tools = [*tools, *server_specs]
        digest = _tools_hash(all_tools)
        include_tools = all_tools if digest != session.tools_hash else None
        session.tool_risks = {t.name: t.risk for t in all_tools}
        session.server_scope = scope
        skill = self._server.skill_text() if (self._server and scope and include_tools is not None) else ""
        message = composer_message(text, contexts, tools=include_tools, mode=mode, skill=skill)
        if deferred_results:
            # 지난 답변 중 즉시 실행된 ui · stage 도구의 결과 — 모델이 실제로 일어난 일을 알게 한다.
            message = f"[지난 답변에서 실행된 도구 결과]\n{render_tool_results(deferred_results)}\n\n{message}"
        session.tools_hash = digest
        session.mode = mode
        session.tool_rounds = 0
        session.pending_calls.clear()
        session.carry_results = []
        return self._drive(session, message)

    def submit_tool_results(self, session_id: str, results: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
        session = self._get(session_id)
        unknown = [r["id"] for r in results if r["id"] not in session.pending_calls]
        if unknown:
            logger.info("[assistant] 알 수 없는 도구 결과 id 무시: %s", unknown)
        known = [*session.carry_results, *(r for r in results if r["id"] in session.pending_calls)]
        session.carry_results = []
        session.pending_calls.clear()
        session.tool_rounds += 1
        if session.tool_rounds > MAX_TOOL_ROUNDS:
            def limited() -> Iterator[dict[str, Any]]:
                yield {"type": "error", "message": f"도구 호출이 {MAX_TOOL_ROUNDS}회를 넘어 멈췄습니다."}
                yield {"type": "turn_done", "stopReason": "tool_limit", "usage": {}, "durationMs": 0}
            return limited()
        message = render_tool_results(known) + "\n\n위 도구 결과를 바탕으로 작업을 이어가라."
        return self._drive(session, message)

    # --- 서버 도구 (지식 덱 등) ------------------------------------------------------

    def _server_context(
        self, contexts: list[ContextItem], briefed: Optional[set[str]] = None
    ) -> tuple[list[ContextItem], list[str], list[ToolSpec]]:
        """서버 도구를 켜는 첨부(덱)가 있으면: 범위를 정하고, 첨부 본문을 서버가 아는 지도 요약으로 채운다.

        같은 대화에서 이미 요약을 보낸 덱은 짧은 표식만 보낸다 (덱이 자동 첨부라 매 메시지 수천 자가 붙던 비용).
        """
        briefed = briefed if briefed is not None else set()
        if self._server is None:
            return contexts, [], []
        kind = self._server.context_kind()
        scope: list[str] = []
        out: list[ContextItem] = []
        for item in contexts:
            if item.kind != kind:
                out.append(item)
                continue
            marks = _deck_marks(item.content)
            # 사용자가 RM 에서 섹션만 골랐으면 범위를 `덱#섹션,…` 으로 좁힌다 (도구가 그 섹션만 본다)
            sections = ",".join(s.strip() for s in marks.get("sections", "").split(",") if s.strip())
            ref = f"{item.ref_id}#{sections}" if sections else item.ref_id
            scope.append(ref)
            # 덱이 다시 색인되거나(builtAt) 고른 섹션이 바뀌면 같은 대화라도 지도를 새로 보낸다
            brief_key = f"{ref}@{marks.get('builtAt', '')}"
            focus_hint = _focus_hint(marks.get("focusCards", ""))
            if brief_key in briefed:
                content = "(섹션 지도는 이 대화 앞부분에 있다 — 필요하면 knowledge.toc)" + focus_hint
                out.append(replace(item, content=content, role="reference"))
                continue
            brief = None
            try:
                brief = self._server.brief(ref)
                if brief:
                    # 같은 덱의 예전 지도 표식은 지운다 — 재색인 뒤엔 새 지도가 기준
                    for old in [k for k in briefed if k.split("@", 1)[0].split("#", 1)[0] == item.ref_id]:
                        briefed.discard(old)
                    briefed.add(brief_key)
            except Exception as exc:  # 요약을 못 만들어도 대화는 이어간다
                logger.warning("[assistant] 서버 첨부 요약 실패 %s: %s", item.ref_id, exc)
            content = (brief or f"(덱 {item.ref_id} 은 아직 색인 중이거나 본체가 없다)") + focus_hint
            out.append(replace(item, content=content, role="reference"))
        if not scope:
            return contexts, [], []
        specs = [
            ToolSpec(name=s["name"], description=s.get("description", ""), risk=s.get("risk", "read"),
                     input_schema=s.get("inputSchema") or {})
            for s in self._server.specs()
        ]
        return out, list(dict.fromkeys(scope)), specs

    def _is_server_call(self, session: _Session, name: str) -> bool:
        return bool(self._server and session.server_scope and self._server.handles(name))

    def _run_server_call(self, session: _Session, call: ToolCall) -> tuple[dict[str, Any], dict[str, Any]]:
        started = time.monotonic()
        try:
            output = self._server.run(call.name, call.arguments, session.server_scope)  # type: ignore[union-attr]
            ok = True
        except Exception as exc:
            output, ok = f"{type(exc).__name__}: {exc}", False
        ms = int((time.monotonic() - started) * 1000)
        result = {"id": call.call_id, "name": call.name, "ok": ok, "output": output}
        preview = json.dumps(output, ensure_ascii=False, default=str)
        event = {"type": "tool_result", "id": call.call_id, "name": call.name, "ok": ok, "durationMs": ms,
                 "output": preview if len(preview) <= 6000 else preview[:6000] + "…", "chars": len(preview)}
        return result, event

    # --- 실행 루프 --------------------------------------------------------------------

    def _drive(self, session: _Session, message: str) -> Iterator[dict[str, Any]]:
        def stream() -> Iterator[dict[str, Any]]:
            # 잠금은 스트림이 실제로 시작될 때 잡는다 (시작 전에 끊긴 요청이 세션을 잠그지 않게).
            # 직전 실행이 중단 처리 중일 수 있으므로(agy 종료 · 정리) 잠깐 기다린다.
            if not session.lock.acquire(timeout=5):
                yield {"type": "error", "message": "이 세션은 이미 실행 중입니다.", "code": "busy"}
                yield {"type": "turn_done", "stopReason": "error", "usage": {}, "durationMs": 0}
                return
            session.cancel.clear()
            session.last_used = time.monotonic()
            started = time.monotonic()
            usage: dict[str, Any] = {}
            first_token: Optional[int] = None
            server_rounds = 0
            try:
                yield {
                    "type": "turn_start",
                    "provider": session.engine.choice.provider,
                    "model": session.engine.choice.model,
                }
                current = message
                while True:
                    calls, done, errored = yield from self._model_turn(session, current)
                    usage = _add_usage(usage, done.get("usage") or {})
                    if first_token is None and done.get("firstTokenMs") is not None:
                        first_token = int(done["firstTokenMs"])  # 첫 모델 턴 기준 (스트림 시작과 거의 같다)
                    server_calls = [c for c in calls if self._is_server_call(session, c.name)]
                    client_calls = [c for c in calls if not self._is_server_call(session, c.name)]
                    server_results: list[dict[str, Any]] = []
                    for call in server_calls:
                        if session.cancel.is_set():
                            break
                        result, event = self._run_server_call(session, call)
                        server_results.append(result)
                        yield event
                    meta = {"usage": usage, "durationMs": int((time.monotonic() - started) * 1000),
                            "firstTokenMs": first_token, "serverRounds": server_rounds}
                    if client_calls:
                        # 프론트 도구가 섞였다: 프론트 결과를 기다리고, 서버 결과는 그때 함께 보낸다
                        for call in client_calls:
                            session.pending_calls[call.call_id] = call
                        session.carry_results = server_results
                        yield {"type": "turn_done", **meta, "stopReason": "tool_calls"}
                        return
                    if server_results and not errored and not session.cancel.is_set():
                        server_rounds += 1
                        session.tool_rounds += 1
                        if session.tool_rounds > MAX_TOOL_ROUNDS:
                            yield {"type": "error", "message": f"도구 호출이 {MAX_TOOL_ROUNDS}회를 넘어 멈췄습니다."}
                            yield {"type": "turn_done", **meta, "stopReason": "tool_limit"}
                            return
                        current = render_tool_results(server_results) + "\n\n위 도구 결과를 바탕으로 작업을 이어가라."
                        continue
                    stop = "error" if errored else "end_turn"
                    yield {"type": "turn_done", **meta, "stopReason": stop}
                    return
            finally:
                session.last_used = time.monotonic()
                session.lock.release()

        return stream()

    def _model_turn(
        self, session: _Session, message: str
    ) -> Generator[dict[str, Any], None, tuple[list[ToolCall], dict[str, Any], bool]]:
        """모델 한 턴: 텍스트 · 도구 호출 이벤트를 흘리고 (결과를 기다릴 도구 호출, 턴 메타, 오류 여부)를 돌려준다."""
        extractor = ToolCallExtractor(id_prefix=f"c{session.tool_rounds}")
        calls: list[ToolCall] = []
        done: dict[str, Any] = {}
        errored = False
        reported = 0
        for event in session.engine.run_turn(message, session.cancel):
            kind = event.get("type")
            if kind == "text_delta":
                visible, found = extractor.feed(event.get("text", ""))
                if visible:
                    yield {"type": "text_delta", "text": visible}
                for call in found:
                    reported = 0
                    server = self._is_server_call(session, call.name)
                    is_async = not server and session.tool_risks.get(call.name) in ASYNC_RISKS
                    if not is_async:
                        calls.append(call)
                    ev = _call_event(call, is_async)
                    if server:
                        ev["server"] = True
                        ev["risk"] = "read"
                        ev["summary"] = self._server.describe(call.name, call.arguments)  # type: ignore[union-attr]
                    yield ev
                pending = extractor.pending_chars
                if pending and pending - reported >= PROGRESS_STEP_CHARS:
                    reported = pending
                    yield {"type": "tool_call_progress", "name": extractor.pending_name, "chars": pending}
            elif kind == "turn_done":
                done = event
            else:
                if kind == "error":
                    errored = True
                yield event
        tail, _ = extractor.flush()
        if tail:
            yield {"type": "text_delta", "text": tail}
        if extractor.malformed:
            yield {"type": "status", "state": "warning", "message": "형식이 잘못된 도구 호출을 무시했습니다."}
        return calls, done, errored and not calls

    # --- 인라인 액션 -------------------------------------------------------------

    def run_inline(
        self,
        *,
        instruction: str,
        contexts: list[ContextItem],
        output_format: str = "html",
        model: Optional[str] = None,
        cancel: Optional[threading.Event] = None,
    ) -> Iterator[dict[str, Any]]:
        choice = self.inline_choice(model)
        engine = self._engines.open_conversation(choice, lane="inline")
        message = inline_message(instruction, contexts, output_format)
        token = cancel or threading.Event()

        def stream() -> Iterator[dict[str, Any]]:
            pieces: list[str] = []
            done: dict[str, Any] = {"type": "turn_done", "usage": {}, "durationMs": 0}
            errored = False
            try:
                yield {"type": "turn_start", "provider": choice.provider, "model": choice.model}
                for event in engine.run_turn(message, token):
                    kind = event.get("type")
                    if kind == "text_delta":
                        pieces.append(event.get("text", ""))
                        yield event
                    elif kind == "turn_done":
                        done = {**done, **event}
                    elif kind == "agent_tool":
                        continue  # 인라인은 내장 도구를 쓰지 않는다 — 보여주지 않는다
                    else:
                        if kind == "error":
                            errored = True
                        yield event
                if not errored:
                    yield {"type": "result", "text": clean_inline_output("".join(pieces)), "format": output_format}
                yield {**done, "stopReason": "error" if errored else "end_turn"}
            finally:
                engine.close()

        return stream()

    # --- 내부 --------------------------------------------------------------------

    def _get(self, session_id: str) -> _Session:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise AssistantSessionNotFoundError(f"assistant session not found: {session_id}")
        return session

    def _maybe_switch_engine(self, session: _Session, provider: Optional[str], model: Optional[str]) -> None:
        if not provider and not model:
            return
        current = session.engine.choice
        target = self._engines.resolve(provider or current.provider, model or current.model)
        if target == current:
            return
        state = session.engine.export_state() if target.provider == current.provider else None
        session.engine.close()
        session.engine = self._engines.open_conversation(target, lane="composer", resume=state)
        session.tools_hash = None  # 새 엔진에는 규칙 · 도구 목록을 다시 알려 준다
        if state is None:
            session.briefed.clear()  # 대화 기록을 잇지 못하면 덱 지도도 다시 보낸다

    def release_idle(self) -> None:
        """오래 안 쓴 세션을 닫고, 잠깐 쉬는 세션은 엔진 프로세스만 내린다 (사용 중인 세션은 건드리지 않는다)."""
        now = time.monotonic()
        with self._lock:
            idle = [s for s in self._sessions.values() if not s.lock.locked()]
            stale = [s for s in idle if now - s.last_used > SESSION_IDLE_SECONDS]
            for session in stale:
                self._sessions.pop(session.session_id, None)
            stale_ids = {s.session_id for s in stale}
            resting = [s for s in idle if s.session_id not in stale_ids and now - s.last_used > PROCESS_IDLE_SECONDS]
        for session in stale:
            session.engine.close()
        for session in resting:
            release = getattr(session.engine, "release_process", None)
            if release is not None:
                release()

    def shutdown(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            session.cancel.set()
            session.engine.close()
        self._engines.shutdown()


def _call_event(call: ToolCall, is_async: bool = False) -> dict[str, Any]:
    return {"type": "tool_call", "id": call.call_id, "name": call.name, "arguments": call.arguments, "async": is_async}


def _add_usage(total: dict[str, Any], part: dict[str, Any]) -> dict[str, Any]:
    """여러 모델 턴(서버 도구 왕복)의 토큰 사용량을 더한다 — 숫자 필드만."""
    out = dict(total)
    for key, value in part.items():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            out[key] = out.get(key, 0) + value
    return out
