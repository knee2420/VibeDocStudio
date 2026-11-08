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
import os
import threading
import time
import uuid
from dataclasses import dataclass, field, replace
from typing import Any, Generator, Iterator, Optional

from app.core.llm.execution_policy import RuntimeExecutionPolicy

from ..errors import AssistantSessionNotFoundError
from ..models import ContextItem, EngineChoice, ToolCall, ToolSpec
from ..ports import ConversationEngine, EngineProvider, ServerToolbox
from ..prompts import (
    clean_inline_output,
    composer_message,
    inline_message,
    workspace_system_prompt,
)
from ..tool_protocol import ToolCallExtractor, render_tool_results
from ..workspace import (
    MOUNT_KIND,
    MountState,
    ResourceWorkspace,
    detect_full_read_intent,
    extract_citations,
    nudge_message,
    strip_recap,
    verify_citations,
)
from ..workspace.mapper import find_clusters, partition, target_entries

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 16
#: "전체를 확인" 요청인데 덜 읽고 끝냈을 때, 이어 읽게 하는 횟수 상한
MAX_COVERAGE_NUDGES = 2
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
    #: 리소스 작업 공간 (RM 에서 체크한 자료를 agy 가 직접 읽는다)
    mount: Optional[MountState] = None
    mount_briefed: str = ""
    #: 이번 메시지가 "전체를 확인" 하라는 요청인가 · 이어 읽게 한 횟수
    coverage_goal: bool = False
    coverage_nudges: int = 0
    last_read_count: int = 0
    target_subset: Optional[set[str]] = None
    target_name: Optional[str] = None
    #: 실행 구간(벽시계) — 대화 id 를 모르는 서브에이전트의 읽기를 이 세션 몫으로 칠 때 쓴다
    turn_windows: list[tuple[float, float]] = field(default_factory=list)
    conversation_ids: list[str] = field(default_factory=list)
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
        workspace: Optional[ResourceWorkspace] = None,
    ) -> None:
        self._engines = engines
        self._policy = policy
        self._inline_model = inline_model
        self._server = server_tools
        self._workspace = workspace
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
            **({"workspace": self._workspace.status()} if self._workspace else {}),
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
        sid = f"asst-{uuid.uuid4().hex[:12]}"
        sys_prompt = workspace_system_prompt(has_vibefs=bool(self._workspace))
        engine = self._engines.open_conversation(choice, lane="composer", session_id=sid, system_prompt=sys_prompt)
        session = _Session(session_id=sid, engine=engine)
        with self._lock:
            self._sessions[session.session_id] = session
        return {"sessionId": session.session_id, "provider": choice.provider, "model": choice.model}

    def close_session(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.cancel.set()
            session.engine.close()
            self._unmount(session_id)

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
        contexts, workspace_rules = self._mount_context(session, contexts)
        contexts, scope, server_specs = self._server_context(contexts, session.briefed)
        all_tools = [*tools, *server_specs]
        digest = _tools_hash(all_tools)
        include_tools = all_tools if digest != session.tools_hash else None
        session.tool_risks = {t.name: t.risk for t in all_tools}
        session.server_scope = scope
        skill = self._server.skill_text() if (self._server and scope and include_tools is not None) else ""
        # 규칙 · 도구 목록을 다시 보내는 턴(엔진 교체 등)에는 작업 공간 규칙도 다시 붙인다
        workspace_rules = workspace_rules or (session.mount is not None and include_tools is not None)
        message = composer_message(text, contexts, tools=include_tools, mode=mode, skill=skill, workspace=workspace_rules)
        clean_prompt = strip_recap(text)
        has_full_intent, target_cat = detect_full_read_intent(clean_prompt)
        session.coverage_goal = session.mount is not None and has_full_intent
        session.coverage_nudges = 0
        session.last_read_count = 0
        session.target_subset = None
        session.target_name = None

        if session.coverage_goal and session.mount is not None and target_cat:
            # 묶음 요청: 서식 · 예시는 빼고, 초안은 따로 세서 '본 대상' 만 다 읽었는지 본다
            name, primary, drafts, scaffolds = target_entries(session.mount.index, target_cat)
            if primary:
                session.target_name = name
                session.target_subset = {e.rel for e in primary}
                unique = len({e.md5 or e.key for e in primary})
                extra = []
                if drafts:
                    extra.append(f"초안 · 검토 중 {len(drafts)}개는 확정본이 아니다 (차이 · 이력 비교용으로만)")
                if scaffolds:
                    extra.append(f"서식 · 예시 {len(scaffolds)}개는 틀이지 내용이 아니다")
                guidance = (
                    f"[작업 공간 안내] 이번 요청은 '{name}' 묶음 전체를 다룬다 — 본 대상 {len(primary)}개 (고유 {unique}개).\n"
                    f"1) ws_collect(\"{target_cat}\")로 목록을 확정하고 2) 본 대상 고유 {unique}개를 모두 read_file 로 읽은 뒤 "
                    f"3) 공통점 · 차이(시기 · 폴더별로 달라지는 것)를 찾아 답하라. 일부만 읽고 일반화하지 마라."
                    + ("\n- " + "\n- ".join(extra) if extra else "")
                )
                message = f"{guidance}\n\n{message}"
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

    # --- 리소스 작업 공간 (RM 자료 마운트) ---------------------------------------------------

    def _mount_context(self, session: _Session, contexts: list[ContextItem]) -> tuple[list[ContextItem], bool]:
        """`resource-mount` 첨부 → 세션 마운트 갱신 + 본문을 지도로 바꾼다. (첨부, 이번 턴에 탐색 규칙을 붙일지)

        지도는 마운트가 바뀐 턴에만 보낸다 (같은 대화에는 이미 남아 있다). 첨부가 사라지면(RM 체크 해제) 마운트를 내린다.
        """
        mounts = [c for c in contexts if c.kind == MOUNT_KIND]
        rest = [c for c in contexts if c.kind != MOUNT_KIND]
        if self._workspace is None:
            return rest, False
        if not mounts:
            if session.mount is not None:
                self._unmount(session.session_id)
                session.mount = None
                session.mount_briefed = ""
            return rest, False
        items = []
        roots = []
        id_map = {}
        for c in mounts:
            p_items, p_roots, p_id_map = self._workspace.parse_payload(c.content)
            items.extend(p_items)
            roots.extend(p_roots)
            id_map.update(p_id_map)
        try:
            state = self._workspace.mount(
                session.session_id, items, self._conversation_id(session), roots=roots, id_map=id_map
            )
        except Exception as exc:  # 마운트가 실패해도 대화는 이어간다
            logger.warning("[assistant] 리소스 작업 공간 마운트 실패: %s", exc)
            return rest, False
        session.mount = state
        first = session.mount_briefed != state.signature
        if first:
            content = self._workspace.brief(state)
            session.mount_briefed = state.signature
        else:
            content = self._mount_snapshot(session, state)
        item = ContextItem(kind=MOUNT_KIND, ref_id="rm:workspace", label=f"리소스 작업 공간 ({len(state.index.files)}개 파일)",
                           content=content, role="reference")
        return [item, *rest], first

    def _mount_snapshot(self, session: _Session, state: MountState) -> str:
        """지도를 이미 보낸 뒤의 턴마다 붙는 짧은 현황판 (~600B): 루트 · 군집 · 지금까지 읽은 범위.

        한 줄 표식만 남기면 대화가 길어질수록 모델이 자료의 모양을 잊는다 (IDE 의 탐색기처럼 늘 보이게).
        """
        index = state.index
        roots = " · ".join(index.root_aliases.get(r, os.path.basename(r)) for r in index.roots) or "-"
        rows = [f"[작업 공간 현황] 루트: {roots} · 파일 {len(index.files)}개"]
        try:
            for cluster, entries in find_clusters(index)[:5]:
                primary, drafts, _ = partition(entries)
                rows.append(f"- {cluster.name}: 본 대상 {len(primary)}" + (f" / 초안 {len(drafts)}" if drafts else ""))
        except Exception as exc:  # 현황판 실패가 대화를 막지 않게
            logger.debug("[assistant] 작업 공간 현황 실패: %s", exc)
        try:  # 이번 요청 대상(subset)이 아니라 마운트 전체 기준
            cov = self._workspace.coverage(state, session.conversation_ids, session.turn_windows) if self._workspace else None
        except Exception:
            cov = None
        if cov is not None:
            info = cov.summary()
            rows.append(f"- 이 대화에서 읽은 파일: 끝까지 {info.get('uniqueFullyRead', 0)} · 일부 {len(cov.partial)} "
                        f"(전체 고유 {info.get('uniqueTotal', 0)})")
        rows.append("지도 전체 · 탐색 규칙은 앞부분에 있다 — 다시 보려면 ws_overview · ws_collect")
        return "\n".join(rows)

    def _conversation_id(self, session: _Session) -> Optional[str]:
        try:
            conv = (session.engine.export_state() or {}).get("agy_conversation_id")
        except Exception:
            return None
        return str(conv) if conv else None

    def _bind_conversation(self, session: _Session) -> None:
        if self._workspace is None or session.mount is None:
            return
        conv = self._conversation_id(session)
        if conv and conv not in session.conversation_ids:
            session.conversation_ids.append(conv)
            try:
                self._workspace.bind(session.session_id, conv)
            except OSError as exc:
                logger.warning("[assistant] 작업 공간 대화 연결 실패: %s", exc)

    def _unmount(self, session_id: str) -> None:
        if self._workspace is not None:
            try:
                self._workspace.unmount(session_id)
            except OSError:
                pass

    def _tool_failure_reason(self, session: _Session, event: dict[str, Any]) -> str:
        """실패한 agy 도구의 사유. ACP 는 사유를 싣지 않으므로 훅 로그 · 읽기 원장에서 찾는다."""
        fallback = "도구 실행이 실패했습니다 (사유를 받지 못함)."
        if self._workspace is None:
            return fallback
        conv = self._conversation_id(session)
        convs = [*session.conversation_ids, *([conv] if conv else [])]
        since = (session.turn_windows[-1][0] if session.turn_windows else time.time() - 600) - 5
        params = event.get("params") or {}
        try:
            reason = self._workspace.store.tool_failure_reason(
                convs, str(event.get("name") or ""), since, path_hint=str(params.get("Path") or "")
            )
        except Exception as exc:  # 사유 조회 실패가 대화를 막지 않게
            logger.debug("[assistant] 도구 실패 사유 조회 실패: %s", exc)
            reason = None
        return reason or fallback

    def _coverage(self, session: _Session):
        if self._workspace is None or session.mount is None:
            return None
        try:
            return self._workspace.coverage(
                session.mount,
                session.conversation_ids,
                session.turn_windows,
                subset=session.target_subset,
            )
        except Exception as exc:
            logger.warning("[assistant] 읽은 범위 계산 실패: %s", exc)
            return None

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
            # 실행 구간 (끝은 finally 에서 닫는다) — 서브에이전트 읽기를 이 세션 몫으로 칠 때 쓴다
            window_idx = len(session.turn_windows)
            session.turn_windows.append((time.time(), float("inf")))
            del session.turn_windows[:-50]
            window_idx = min(window_idx, len(session.turn_windows) - 1)
            self._bind_conversation(session)
            try:
                yield {
                    "type": "turn_start",
                    "provider": session.engine.choice.provider,
                    "model": session.engine.choice.model,
                }
                current = message
                turn_accumulated_text = ""
                while True:
                    calls, done, errored, model_text = yield from self._model_turn(session, current)
                    turn_accumulated_text += model_text
                    self._bind_conversation(session)
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
                    cov = self._coverage(session) if session.mount is not None else None
                    if cov is not None:
                        yield {"type": "workspace_coverage", **cov.summary()}
                        missing = len(cov.unread) + len(cov.partial)
                        current_read_count = len(cov.full) + len(cov.partial)
                        if (stop == "end_turn" and session.coverage_goal and missing
                                and session.coverage_nudges < MAX_COVERAGE_NUDGES and not session.cancel.is_set()):
                            if session.coverage_nudges >= 1 and current_read_count <= session.last_read_count:
                                logger.info("[assistant] 재촉 후 추가로 읽은 파일이 없어 재촉을 중단합니다 (read_count: %d).", current_read_count)
                            else:
                                session.coverage_nudges += 1
                                session.last_read_count = current_read_count
                                target_desc = f"{session.target_name} " if session.target_name else ""
                                yield {"type": "status", "state": "warning",
                                       "message": f"요청은 {target_desc}확인인데 아직 다 읽지 않은 파일이 {missing}개 있어 이어서 읽게 합니다 "
                                                  f"({session.coverage_nudges}/{MAX_COVERAGE_NUDGES})."}
                                current = nudge_message(cov)
                                continue
                    if turn_accumulated_text and self._workspace is not None:
                        citations = extract_citations(turn_accumulated_text)
                        if citations:
                            reads = self._workspace.store.reads(
                                conversation_ids=session.conversation_ids,
                                windows=session.turn_windows,
                            )
                            verified, warnings = verify_citations(
                                citations,
                                reads,
                                index=session.mount.index if session.mount else None,
                            )
                            yield {
                                "type": "citation_check",
                                "citations": [
                                    {
                                        "target": c.target,
                                        "start_line": c.start_line,
                                        "end_line": c.end_line,
                                        "label": c.label,
                                        "is_verified": c.is_verified,
                                        "warning": c.warning,
                                        "suggested_link": c.suggested_link,
                                        "is_broken_syntax": c.is_broken_syntax,
                                    }
                                    for c in verified
                                ],
                                "warnings": warnings,
                            }
                    yield {"type": "turn_done", **meta, "stopReason": stop}
                    return
            finally:
                if window_idx < len(session.turn_windows):
                    session.turn_windows[window_idx] = (session.turn_windows[window_idx][0], time.time())
                session.last_used = time.monotonic()
                session.lock.release()

        return stream()

    def _model_turn(
        self, session: _Session, message: str
    ) -> Generator[dict[str, Any], None, tuple[list[ToolCall], dict[str, Any], bool, str]]:
        """모델 한 턴: 텍스트 · 도구 호출 이벤트를 흘리고 (결과를 기다릴 도구 호출, 턴 메타, 오류 여부, 누적 텍스트)를 돌려준다."""
        extractor = ToolCallExtractor(id_prefix=f"c{session.tool_rounds}")
        calls: list[ToolCall] = []
        done: dict[str, Any] = {}
        errored = False
        reported = 0
        chunks: list[str] = []
        for event in session.engine.run_turn(message, session.cancel):
            kind = event.get("type")
            if kind == "text_delta":
                raw_chunk = event.get("text", "")
                visible, found = extractor.feed(raw_chunk)
                if visible:
                    chunks.append(visible)
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
            elif kind == "engine_session":
                # 엔진이 대화를 방금 만들었다 — 도구 호출이 오기 전에 작업 공간 마운트에 대화 id 를 묶는다
                # (안 묶으면 첫 턴의 훅 · MCP 가 어느 세션인지 몰라 다른 세션 마운트를 볼 수 있었다)
                self._bind_conversation(session)
            else:
                if kind == "error":
                    errored = True
                if kind == "agent_tool" and event.get("state") == "error" and not event.get("error"):
                    event = {**event, "error": self._tool_failure_reason(session, event)}
                yield event
        tail, _ = extractor.flush()
        if tail:
            chunks.append(tail)
            yield {"type": "text_delta", "text": tail}
        if extractor.malformed:
            yield {"type": "status", "state": "warning", "message": "형식이 잘못된 도구 호출을 무시했습니다."}
        return calls, done, errored and not calls, "".join(chunks)

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
        if target.provider == current.provider and hasattr(session.engine, "set_engine_choice"):
            session.engine.set_engine_choice(target)
            return
        state = session.engine.export_state() if target.provider == current.provider else None
        session.engine.close()
        sys_prompt = workspace_system_prompt(has_vibefs=bool(self._workspace))
        session.engine = self._engines.open_conversation(
            target,
            lane="composer",
            resume=state,
            session_id=session.session_id,
            system_prompt=sys_prompt,
        )
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
            self._unmount(session.session_id)
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
            self._unmount(session.session_id)
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
