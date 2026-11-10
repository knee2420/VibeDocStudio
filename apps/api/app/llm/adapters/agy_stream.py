"""agy CLI 상주 프로세스 엔진 (`--input-format stream-json --output-format stream-json`).

실측(agy 1.4.10):
- 프로세스 기동 + 인증 + 도구 로딩에 약 5초. 요청마다 프로세스를 띄우면 이 비용을 매번 낸다.
- stream-json 모드는 stdin 한 줄(`{"event":"user","message":{...}}`)마다 한 턴을 돌리고
  `step_update`(text_delta · tool) 와 `result` 이벤트를 NDJSON 으로 흘린다.
- 같은 프로세스에서 다음 턴은 기동 비용 없이 바로 시작한다.

그래서:
1. Composer 세션은 프로세스 하나를 계속 붙잡는다 (대화 유지).
2. 예열 풀(WarmPool)이 모델별로 대기 프로세스를 하나씩 미리 띄워 둔다. 새 세션 · 인라인 실행은
   대기 프로세스를 가져가고, 풀은 뒤에서 하나를 다시 채운다.
3. 인라인 실행은 가져간 프로세스로 한 턴만 돌리고 버린다 (대화 오염 없음).
4. 중단은 프로세스를 죽이는 것뿐이다. 다음 턴에 `--conversation <id>` 로 다시 띄워 대화를 잇는다.
"""
from __future__ import annotations

import json
import logging
import queue
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Iterator, Optional

from app.core.process_tree import CREATE_NO_WINDOW, popen_tree

from ..models import EngineChoice
from .acp_client import scrub_surrogates

logger = logging.getLogger(__name__)

_EOF = object()


class AgyStreamProcess:
    """stream-json 모드로 떠 있는 agy 프로세스 하나."""

    def __init__(
        self,
        executable: str,
        model: str,
        cwd: Path,
        *,
        resume_conversation_id: Optional[str] = None,
    ) -> None:
        self.model = model
        self.spawned_at = time.monotonic()
        self.conversation_id: Optional[str] = resume_conversation_id
        self.turns = 0
        self._events: "queue.Queue[Any]" = queue.Queue()
        self._ready = threading.Event()
        cmd = [
            executable,
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--dangerously-skip-permissions",
            "--disable-slash-commands",
            "--model", model,
        ]
        if resume_conversation_id:
            cmd.extend(["--conversation", resume_conversation_id])
        cwd.mkdir(parents=True, exist_ok=True)
        # Job Object 로 묶어 API 프로세스가 강제 종료돼도 agy 트리가 고아로 남지 않게 한다.
        self._tree = popen_tree(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            cwd=str(cwd),
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=CREATE_NO_WINDOW,
        )
        self._proc = self._tree.proc
        self._reader = threading.Thread(target=self._read_loop, name=f"agy-reader-{self._proc.pid}", daemon=True)
        self._reader.start()

    # --- 수명 ---------------------------------------------------------------

    @property
    def alive(self) -> bool:
        return self._proc.poll() is None

    @property
    def ready(self) -> bool:
        return self._ready.is_set()

    def kill(self) -> None:
        self._tree.kill()  # agy 가 띄운 자손(도구 실행 셸 등)까지 함께 끝낸다
        try:
            if self._proc.stdin:
                self._proc.stdin.close()
        except OSError:
            pass

    def _read_loop(self) -> None:
        assert self._proc.stdout is not None
        try:
            for line in self._proc.stdout:
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(msg, dict):
                    continue
                if msg.get("event") == "init":
                    self.conversation_id = msg.get("conversation_id") or self.conversation_id
                    self._ready.set()
                    continue
                self._events.put(msg)
        except (OSError, ValueError):
            pass
        finally:
            self._ready.set()
            self._events.put(_EOF)

    # --- 턴 -------------------------------------------------------------------

    def run_turn(self, text: str, cancel: threading.Event, idle_timeout: float) -> Iterator[dict[str, Any]]:
        if not self.alive:
            yield {"type": "error", "message": "agy 프로세스가 종료되어 있습니다."}
            return
        # 이전 턴의 잔여 이벤트(중단 직후 등)를 비운다.
        while True:
            try:
                leftover = self._events.get_nowait()
            except queue.Empty:
                break
            if leftover is _EOF:
                yield {"type": "error", "message": "agy 프로세스가 종료되었습니다."}
                return
        payload = {"event": "user", "message": {"role": "user", "content": text}}
        try:
            assert self._proc.stdin is not None
            self._proc.stdin.write(scrub_surrogates(json.dumps(payload, ensure_ascii=False)) + "\n")
            self._proc.stdin.flush()
        except (OSError, ValueError) as exc:
            yield {"type": "error", "message": f"agy 입력 전송 실패: {exc}"}
            return
        self.turns += 1
        completed = False
        try:
            yield from self._consume_turn(cancel, idle_timeout)
            completed = True
        finally:
            # 소비자가 스트림을 중간에 닫으면(클라이언트 연결 끊김) 턴이 계속 돌지 않게 끊는다.
            if not completed:
                self.kill()

    def _consume_turn(self, cancel: threading.Event, idle_timeout: float) -> Iterator[dict[str, Any]]:
        started = time.monotonic()
        last_event = started
        first_token_ms: Optional[int] = None
        while True:
            if cancel.is_set():
                self.kill()
                yield {"type": "error", "message": "사용자가 실행을 중단했습니다.", "code": "interrupted"}
                return
            try:
                msg = self._events.get(timeout=0.2)
            except queue.Empty:
                if time.monotonic() - last_event > idle_timeout:
                    self.kill()
                    yield {"type": "error", "message": f"agy 응답이 {int(idle_timeout)}초 동안 없어 중단했습니다.", "code": "timeout"}
                    return
                continue
            last_event = time.monotonic()
            if msg is _EOF:
                yield {"type": "error", "message": "agy 프로세스가 응답 중에 종료되었습니다."}
                return
            event = msg.get("event")
            if event == "step_update":
                step = msg.get("step_update") or {}
                self.conversation_id = step.get("conversation_id") or self.conversation_id
                for normalized in _normalize_step(step):
                    if normalized["type"] == "text_delta" and first_token_ms is None:
                        first_token_ms = int((time.monotonic() - started) * 1000)
                    yield normalized
            elif event == "result":
                result = msg.get("result") or {}
                self.conversation_id = result.get("conversation_id") or self.conversation_id
                if str(result.get("status", "")).upper() not in ("SUCCESS", "OK", ""):
                    yield {"type": "error", "message": str(result.get("error") or "agy 가 오류를 반환했습니다.")}
                yield {
                    "type": "turn_done",
                    "usage": self._turn_usage(result.get("usage") or {}),
                    "durationMs": int((time.monotonic() - started) * 1000),
                    "firstTokenMs": first_token_ms,
                }
                return

    def _turn_usage(self, cumulative: dict[str, Any]) -> dict[str, Any]:
        """stream-json 의 `result.usage` 는 대화 누적값이다 (실측: 2턴째 input = 1턴 + 2턴). 이번 턴 몫만 돌려준다."""
        last = getattr(self, "_last_usage", None) or {}
        self._last_usage = dict(cumulative)
        out: dict[str, Any] = {}
        for key, value in cumulative.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                prev = last.get(key, 0)
                out[key] = value - prev if isinstance(prev, (int, float)) and value >= prev else value
            else:
                out[key] = value
        return out


def _normalize_step(step: dict[str, Any]) -> list[dict[str, Any]]:
    step_type = step.get("step_type")
    if step_type == "agent_response":
        delta = step.get("text_delta")
        return [{"type": "text_delta", "text": delta}] if delta else []
    if step_type == "tool":
        info = step.get("tool_info") or {}
        state = "done" if step.get("state") == "DONE" else "running"
        return [{
            "type": "agent_tool",
            "stepIndex": step.get("step_index"),
            "name": step.get("tool_name") or info.get("name") or "tool",
            "state": state,
            "params": info.get("parameters") or {},
            "output": str(info.get("output") or "")[:500],
        }]
    if step_type and step_type not in ("user_input",):
        thinking = step.get("thinking_delta") or step.get("thinking")
        if thinking:
            return [{"type": "thinking_delta", "text": str(thinking)}]
    return []


class WarmPool:
    """지금 쓰는 모델에 한해 대기 agy 프로세스를 미리 띄워 둔다.

    - 목표는 `retarget()` 이 통째로 바꾼다. 목록에서 빠진 모델의 대기 프로세스는 바로 내린다
      (예전에는 한 번이라도 고른 모델마다 대기 프로세스가 영구히 남아 모델을 바꿀수록 상주 agy 가 늘었다).
    - 전체 대기 수는 `MAX_TOTAL_SPARES` 를 넘지 않는다.
    - `take()` 는 준비된(init 받은) 대기 프로세스를 우선 가져가고, 목표 모델일 때만 뒤에서 보충한다.
    - keeper 스레드가 주기적으로 죽거나 오래된 대기 프로세스를 교체해, 오래 쉬었다 와도 기동 지연이 없다.
    - `shutdown()` 뒤에는 어떤 경로로도 새 프로세스를 띄우지 않는다.
    """

    KEEPER_INTERVAL_SECONDS = 20
    MAX_TOTAL_SPARES = 2

    def __init__(self, executable: str, cwd: Path, *, enabled: bool = True, max_age_seconds: float = 1800) -> None:
        self.executable = executable
        self.cwd = cwd
        self.enabled = enabled
        self.max_age_seconds = max_age_seconds
        self._spares: dict[str, list[AgyStreamProcess]] = {}
        self._targets: dict[str, int] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._keeper: Optional[threading.Thread] = None

    @property
    def cli_available(self) -> bool:
        return shutil.which(self.executable) is not None

    @property
    def active(self) -> bool:
        return self.enabled and not self._stop.is_set()

    def _fresh(self, proc: AgyStreamProcess) -> bool:
        return proc.alive and time.monotonic() - proc.spawned_at < self.max_age_seconds

    def retarget(self, targets: dict[str, int]) -> None:
        """모델별 대기 목표를 통째로 바꾸고 채운다. 합계는 `MAX_TOTAL_SPARES` 로 자른다."""
        if not self.active or not self.cli_available:
            return
        capped: dict[str, int] = {}
        budget = self.MAX_TOTAL_SPARES
        for model, want in targets.items():
            take = max(0, min(want, budget))
            if take:
                capped[model] = take
                budget -= take
        dropped: list[AgyStreamProcess] = []
        with self._lock:
            self._targets = capped
            for model in list(self._spares):
                pool = self._spares[model]
                keep = capped.get(model, 0)
                dropped.extend(pool[keep:])
                del pool[keep:]
                if not pool:
                    del self._spares[model]
        for proc in dropped:
            proc.kill()
        self._ensure_keeper()
        for model in capped:
            self.warm(model)

    def warm(self, model: str) -> None:
        """목표 모델의 대기 프로세스를 목표 개수까지 채운다 (목표에 없는 모델은 띄우지 않는다)."""
        if not self.active or not self.cli_available:
            return
        stale: list[AgyStreamProcess] = []
        with self._lock:
            want = self._targets.get(model, 0)
            pool = self._spares.setdefault(model, [])
            stale = [p for p in pool if not self._fresh(p)]
            pool[:] = [p for p in pool if self._fresh(p)]
            for _ in range(max(want - len(pool), 0)):
                if self._stop.is_set():
                    break
                try:
                    pool.append(AgyStreamProcess(self.executable, model, self.cwd))
                except OSError as exc:
                    logger.warning("[assistant] agy 예열 실패: %s", exc)
                    break
            if not pool:
                self._spares.pop(model, None)
        for proc in stale:
            proc.kill()

    def take(self, model: str, *, resume_conversation_id: Optional[str] = None) -> AgyStreamProcess:
        if resume_conversation_id:
            return AgyStreamProcess(self.executable, model, self.cwd, resume_conversation_id=resume_conversation_id)
        proc: Optional[AgyStreamProcess] = None
        with self._lock:
            pool = self._spares.get(model, [])
            usable = [p for p in pool if self._fresh(p)]
            if usable:
                proc = next((p for p in usable if p.ready), usable[0])
                pool.remove(proc)
            refill = model in self._targets
        if proc is None:
            proc = AgyStreamProcess(self.executable, model, self.cwd)
        if refill and self.active:
            threading.Thread(target=self.warm, args=(model,), daemon=True).start()
        return proc

    def _ensure_keeper(self) -> None:
        if self._keeper is not None:
            return

        def keep() -> None:
            while not self._stop.wait(self.KEEPER_INTERVAL_SECONDS):
                for model in list(self._targets):
                    try:
                        self.warm(model)
                    except Exception:  # keeper 는 죽지 않는다
                        logger.exception("[assistant] 예열 keeper 오류")

        self._keeper = threading.Thread(target=keep, name="agy-warm-keeper", daemon=True)
        self._keeper.start()

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                model: {
                    "spares": len(pool),
                    "ready": sum(1 for p in pool if p.alive and p.ready),
                    "target": self._targets.get(model, 0),
                }
                for model, pool in self._spares.items()
            }

    def shutdown(self) -> None:
        self._stop.set()
        with self._lock:
            procs = [proc for pool in self._spares.values() for proc in pool]
            self._spares.clear()
            self._targets.clear()
        for proc in procs:
            proc.kill()


class AgyConversation:
    """ConversationEngine 구현 — 프로세스가 죽으면 `--conversation` 으로 되살려 대화를 잇는다."""

    def __init__(
        self,
        pool: WarmPool,
        choice: EngineChoice,
        *,
        idle_timeout: float,
        resume_conversation_id: Optional[str] = None,
        single_turn: bool = False,
    ) -> None:
        self.choice = choice
        self._pool = pool
        self._idle_timeout = idle_timeout
        self._single_turn = single_turn
        self._conversation_id = resume_conversation_id
        self._proc: Optional[AgyStreamProcess] = None
        self._respawn: Optional[threading.Thread] = None
        self._closed = False
        if not resume_conversation_id:
            self._proc = pool.take(choice.model)

    def _respawn_in_background(self) -> None:
        """중단(프로세스 종료) 직후 대화를 이어 줄 프로세스를 미리 띄워 둔다 — 다음 질문의 기동 지연(~5초)을 없앤다."""
        if self._single_turn or self._closed or not self._conversation_id:
            return

        def spawn() -> None:
            try:
                proc = self._pool.take(self.choice.model, resume_conversation_id=self._conversation_id)
            except OSError as exc:
                logger.warning("[assistant] agy 재기동 실패: %s", exc)
                return
            if self._closed:
                proc.kill()
            else:
                self._proc = proc

        self._respawn = threading.Thread(target=spawn, name="agy-respawn", daemon=True)
        self._respawn.start()

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        if self._respawn is not None:
            self._respawn.join(timeout=30)
            self._respawn = None
        if self._proc is None or not self._proc.alive:
            resumed = self._conversation_id is not None
            self._proc = self._pool.take(self.choice.model, resume_conversation_id=self._conversation_id)
            if resumed:
                yield {"type": "status", "state": "resuming", "message": "agy 대화를 다시 연결하는 중…"}
        if not self._proc.ready:
            yield {"type": "status", "state": "spawning", "message": "agy 엔진을 기동하는 중…"}
        try:
            yield from self._proc.run_turn(text, cancel, self._idle_timeout)
        finally:
            self._conversation_id = self._proc.conversation_id or self._conversation_id
            if self._single_turn:
                self.close()
            elif not self._proc.alive:
                self._respawn_in_background()

    def release_process(self) -> None:
        """쉬는 동안 프로세스만 내린다. 다음 턴이 `--conversation` 으로 대화를 다시 잇는다."""
        if self._single_turn or self._closed:
            return
        proc = self._proc
        if proc is None or not proc.alive:
            return
        # 대화가 아직 없으면 다음 턴은 예열 풀에서 새 프로세스를 받는다.
        self._conversation_id = proc.conversation_id or self._conversation_id
        self._proc = None
        proc.kill()

    def export_state(self) -> dict[str, Any]:
        conv = (self._proc.conversation_id if self._proc else None) or self._conversation_id
        return {"agy_conversation_id": conv} if conv else {}

    def close(self) -> None:
        self._closed = True
        if self._proc is not None:
            self._proc.kill()
