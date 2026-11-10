"""ACP (Agent Client Protocol) JSON-RPC 클라이언트 어댑터.

`agy acp --stdio --dangerously-skip-permissions` 서브프로세스와
LSP 스타일(Content-Length: <n>\\r\\n\\r\\n) JSON-RPC 2.0 프레이밍으로 통신한다.
"""
from __future__ import annotations

import concurrent.futures
import json
import logging
import queue
import re
import subprocess
import threading
from pathlib import Path
from typing import Any, Optional

from app.core.process_tree import CREATE_NO_WINDOW, popen_tree

logger = logging.getLogger(__name__)

_EOF = object()

_LONE_SURROGATE = re.compile(r"[\ud800-\udfff]")


def scrub_surrogates(text: str) -> str:
    """짝 없는 UTF-16 서로게이트(잘린 이모지 반쪽)를 U+FFFD 로 바꾼다 — UTF-8 로 인코딩할 수 있게."""
    return _LONE_SURROGATE.sub("\ufffd", text)


class AcpClient:
    """단일 agy ACP stdio 프로세스를 관리하는 JSON-RPC 클라이언트."""

    def __init__(
        self,
        executable: str = "agy",
        cwd: Optional[Path] = None,
        *,
        process_per_session: bool = False,
    ) -> None:
        self.executable = executable
        self.cwd = cwd or Path.cwd()
        self.process_per_session = process_per_session
        self._next_id = 1
        self._id_lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._pending_requests: dict[int, concurrent.futures.Future[dict[str, Any]]] = {}
        self._subscribers: dict[str, list[queue.Queue[Any]]] = {}
        self._sub_lock = threading.Lock()
        self._ready = threading.Event()
        self._closed = threading.Event()
        self._init_info: dict[str, Any] = {}

        cmd = [self.executable, "acp", "--stdio", "--dangerously-skip-permissions"]
        if self.process_per_session:
            cmd.append("--process-per-session")

        self.cwd.mkdir(parents=True, exist_ok=True)
        self._tree = popen_tree(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            cwd=str(self.cwd),
            creationflags=CREATE_NO_WINDOW,
        )
        self._proc = self._tree.proc

        self._reader = threading.Thread(
            target=self._read_loop,
            name=f"acp-reader-{self._proc.pid}",
            daemon=True,
        )
        self._reader.start()

        # handshake
        self._initialize()

    @property
    def alive(self) -> bool:
        return self._proc.poll() is None and not self._closed.is_set()

    @property
    def init_info(self) -> dict[str, Any]:
        return self._init_info

    def _next_request_id(self) -> int:
        with self._id_lock:
            rid = self._next_id
            self._next_id += 1
            return rid

    def _send_raw(self, msg: dict[str, Any]) -> None:
        if not self.alive:
            raise RuntimeError("ACP 프로세스가 종료되어 전송할 수 없습니다.")
        payload = scrub_surrogates(json.dumps(msg, ensure_ascii=False)).encode("utf-8")
        header = f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
        with self._write_lock:
            try:
                assert self._proc.stdin is not None
                self._proc.stdin.write(header + payload)
                self._proc.stdin.flush()
            except (OSError, ValueError) as exc:
                logger.error("[acp] 메시지 전송 실패: %s", exc)
                raise

    def request(self, method: str, params: Optional[dict[str, Any]] = None, timeout: Optional[float] = 60.0) -> dict[str, Any]:
        """JSON-RPC 요청을 보내고 응답을 기다린다. timeout=None 이면 시간 제한 없이 대기."""
        rid = self._next_request_id()
        fut: concurrent.futures.Future[dict[str, Any]] = concurrent.futures.Future()
        self._pending_requests[rid] = fut
        req: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": rid,
            "method": method,
        }
        if params is not None:
            req["params"] = params

        try:
            self._send_raw(req)
            if timeout is not None:
                return fut.result(timeout=timeout)
            return fut.result()
        except Exception:
            self._pending_requests.pop(rid, None)
            raise

    def notify(self, method: str, params: Optional[dict[str, Any]] = None) -> None:
        """JSON-RPC 알림(단방향)을 보낸다."""
        msg: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params is not None:
            msg["params"] = params
        self._send_raw(msg)

    def _initialize(self) -> None:
        resp = self.request(
            "initialize",
            {
                "protocolVersion": 1,
                "capabilities": {},
                "clientInfo": {"name": "VibeDocStudio", "version": "0.2.0"},
            },
            timeout=15.0,
        )
        if "error" in resp:
            raise RuntimeError(f"ACP initialize failed: {resp['error']}")
        self._init_info = resp.get("result", {})
        self._ready.set()
        logger.info("[acp] 서버 연결 성공: %s", self._init_info.get("agentInfo", {}))

    # --- 세션 구독 -------------------------------------------------------------

    def subscribe(self, session_id: str) -> queue.Queue[Any]:
        """세션 업데이트 알림을 수신할 큐를 등록한다."""
        q: queue.Queue[Any] = queue.Queue()
        with self._sub_lock:
            self._subscribers.setdefault(session_id, []).append(q)
        return q

    def unsubscribe(self, session_id: str, q: queue.Queue[Any]) -> None:
        with self._sub_lock:
            subs = self._subscribers.get(session_id, [])
            if q in subs:
                subs.remove(q)
            if not subs:
                self._subscribers.pop(session_id, None)

    # --- 읽기 루프 -------------------------------------------------------------

    def _read_loop(self) -> None:
        assert self._proc.stdout is not None
        stdout = self._proc.stdout
        try:
            while not self._closed.is_set():
                # Read LSP headers
                header_bytes = b""
                while b"\r\n\r\n" not in header_bytes:
                    chunk = stdout.read(1)
                    if not chunk:
                        return
                    header_bytes += chunk

                length: Optional[int] = None
                for line in header_bytes.decode("latin1", errors="replace").split("\r\n"):
                    if line.lower().startswith("content-length:"):
                        try:
                            length = int(line.split(":", 1)[1].strip())
                        except ValueError:
                            pass
                        break

                if length is None or length < 0:
                    continue

                body_bytes = b""
                while len(body_bytes) < length:
                    remaining = length - len(body_bytes)
                    chunk = stdout.read(remaining)
                    if not chunk:
                        return
                    body_bytes += chunk

                try:
                    msg = json.loads(body_bytes.decode("utf-8", errors="replace"))
                except ValueError:
                    continue

                if not isinstance(msg, dict):
                    continue

                self._dispatch_message(msg)
        except (OSError, ValueError) as exc:
            logger.debug("[acp] reader 종료: %s", exc)
        finally:
            self._closed.set()
            # 모든 대기 퓨처와 큐에 종료 전달
            for fut in list(self._pending_requests.values()):
                if not fut.done():
                    fut.set_exception(RuntimeError("ACP 프로세스가 종료되었습니다."))
            self._pending_requests.clear()
            with self._sub_lock:
                for q_list in self._subscribers.values():
                    for q in q_list:
                        q.put(_EOF)

    def _dispatch_message(self, msg: dict[str, Any]) -> None:
        # 1. 응답 (id 매칭)
        if "id" in msg and msg["id"] in self._pending_requests:
            fut = self._pending_requests.pop(msg["id"])
            if not fut.done():
                fut.set_result(msg)
            return

        # 2. 알림 (method 있음)
        method = msg.get("method")
        params = msg.get("params") or {}
        if method == "session/update":
            session_id = params.get("sessionId")
            if session_id:
                with self._sub_lock:
                    subscribers = list(self._subscribers.get(session_id, []))
                for q in subscribers:
                    q.put(params.get("update", {}))
            return

        # 3. 역방향 요청 (id 와 method 둘 다 있음)
        if "id" in msg and method:
            res_content: dict[str, Any] = {}
            if "permission" in method.lower():
                res_content = {"outcome": {"outcome": "approved"}}
            elif "readfile" in method.lower() or method == "fs/readFile":
                fpath = params.get("path") or ""
                try:
                    text_data = Path(fpath).read_text(encoding="utf-8", errors="replace")
                    res_content = {"content": text_data}
                except Exception as exc:
                    logger.warning("[acp] fs/readFile 실패: %s", exc)
                    res_content = {"error": str(exc)}
            resp = {"jsonrpc": "2.0", "id": msg["id"], "result": res_content}
            try:
                self._send_raw(resp)
            except Exception as exc:
                logger.warning("[acp] 역방향 요청 응답 전송 실패: %s", exc)

    # --- 상위 편의 메서드 -------------------------------------------------------

    def new_session(
        self,
        cwd: Path,
        mcp_servers: Optional[list[dict[str, Any]]] = None,
        meta: Optional[dict[str, Any]] = None,
        additional_directories: Optional[list[str | Path]] = None,
    ) -> dict[str, Any]:
        """새 세션을 열고 sessionId 및 가용 모델/옵션 목록을 돌려준다."""
        params: dict[str, Any] = {"cwd": str(cwd)}
        if mcp_servers:
            params["mcpServers"] = mcp_servers
        if meta:
            params["_meta"] = meta
        if additional_directories:
            params["additionalDirectories"] = [str(p) for p in additional_directories]
        res = self.request("session/new", params, timeout=30.0)
        if "error" in res:
            raise RuntimeError(f"session/new failed: {res['error']}")
        return res.get("result", {})

    def set_config_option(self, session_id: str, config_id: str, value: str) -> dict[str, Any]:
        """세션 옵션(model, thought_level 등)을 변경한다."""
        res = self.request(
            "session/set_config_option",
            {"sessionId": session_id, "configId": config_id, "value": value},
            timeout=15.0,
        )
        if "error" in res:
            logger.warning("[acp] set_config_option %s=%s 실패: %s", config_id, value, res["error"])
        return res.get("result", {})

    def prompt(self, session_id: str, prompt_text: str, timeout: Optional[float] = None) -> dict[str, Any]:
        """턴 실행(동기 요청 대기). 진행 알림은 subscribe 한 큐로 실시간 스트리밍된다."""
        res = self.request(
            "session/prompt",
            {
                "sessionId": session_id,
                "prompt": [{"type": "text", "text": prompt_text}],
            },
            timeout=timeout,
        )
        return res

    def close_session(self, session_id: str) -> None:
        """세션을 명시적으로 닫아 리소스를 해제한다."""
        try:
            self.request("session/close", {"sessionId": session_id}, timeout=10.0)
        except Exception as exc:
            logger.debug("[acp] session/close 무시된 오류: %s", exc)

    def cancel(self, session_id: str) -> None:
        """진행 중인 턴을 부드럽게 취소한다 (프로세스를 죽이지 않음)."""
        self.notify("session/cancel", {"sessionId": session_id})

    def close(self) -> None:
        self._closed.set()
        try:
            self._tree.kill()
        except Exception:
            pass
