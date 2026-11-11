"""vibefs MCP 서버 (stdio · JSON-RPC 한 줄씩) — agy 가 작업 폴더 플러그인으로 띄운다.

    python -I vibefs/__main__.py mcp --state <state/assistant/workspace> [--session <id>]

`app` 패키지를 import 하지 않는다 (agy 프로세스마다 하나씩 뜨므로 가볍게). 호출마다 `mounts.json` 을
다시 읽어, 사용자가 RM 체크를 바꾸면 agy 를 다시 띄우지 않아도 다음 호출부터 새 마운트를 본다.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback

from harness_kit import packs

from .doc_tools import DC_TOOL_SPECS, DocTools
from .index import WorkspaceIndex
from .proposals import ProposalStore
from .ref_tools import RF_TOOL_SPECS, RefTools, cards_for
from .store import WorkspaceStore
from .tools import TOOL_SPECS, WorkspaceTools
from .wb_tools import WB_TOOL_SPECS, WorkbenchTools
from .workbench import Workbench

PROTOCOL_VERSION = "2025-06-18"
CONV_META_KEYS = ("antigravity.google/root_conversation_id", "antigravity.google/conversation_id")


class Server:
    def __init__(self, state_dir: str, session_id: str = "") -> None:
        self.store = WorkspaceStore(state_dir)
        #: ACP 는 세션마다 이 서버를 따로 띄운다 — 띄울 때 받은 세션 id 로 마운트를 고정한다 (다른 세션 자료가 섞이지 않게)
        self.session_id = session_id
        self._cache: dict[str, tuple[float, WorkspaceIndex]] = {}
        self.proposals = ProposalStore(state_dir)

    def index_for(self, conversation_id: str) -> tuple[WorkspaceIndex, list[str]]:
        if self.session_id and conversation_id:
            # 대화 id 를 처음 알게 된 순간 세션에 묶어 둔다 — 훅(read_file 가드 · 원장)도 바로 같은 마운트를 쓰게 된다
            self.store.bind_conversation(self.session_id, conversation_id)
            self.store.bind_workbench_conversation(self.session_id, conversation_id)
        mount = self.store.mount_for(conversation_id or None, self.session_id or None)
        if mount is None:
            return WorkspaceIndex([]), []
        sig = mount.signature
        cached = self._cache.get(sig)
        # 파일이 바뀌었을 수 있으니 30초가 지나면 다시 만든다 (232개 기준 1초 안쪽)
        if cached is None or time.time() - cached[0] > 30:
            # idMap 이 있어야 폴더 단위 마운트의 파일에도 resourceId 가 붙는다 (모델이 vdoc:resource 링크를 지어내지 않게)
            self._cache = {sig: (time.time(), WorkspaceIndex.build(mount.items, id_map=getattr(mount, "id_map", None)))}
        return self._cache[sig][1], mount.conversation_ids

    def call(self, name: str, args: dict, meta: dict) -> str:
        conv = next((str(meta[k]) for k in CONV_META_KEYS if meta.get(k)), "")
        index, conv_ids = self.index_for(conv)
        ids = set(conv_ids) | ({conv} if conv else set())
        reads = lambda: self.store.reads(conversation_ids=ids)  # noqa: E731
        if DocTools.handles(name):
            session = self.session_id
            if not session:
                mount = self.store.mount_for(conv or None)
                session = mount.session_id if mount else ""
            tools = DocTools(self.store, session, index=index)
        elif WorkbenchTools.handles(name) or RefTools.handles(name):
            session = self.session_id
            if not session:
                mount = self.store.mount_for(conv or None)
                session = mount.session_id if mount else ""
            wb = Workbench.from_state(self.store.workbench_for(session))
            if RefTools.handles(name):
                tools = RefTools(wb, self.store, session_id=session, conversation_id=conv)
            else:
                line = (f"파일 {len(index.files)}개 · 루트 {len(index.roots)}개 (ws_overview · ws_collect · read_file)"
                        if index.files else "")
                tools = WorkbenchTools(wb, resource_line=line, reads=reads, proposals=self.proposals,
                                       session_id=session, conversation_id=conv,
                                       cards=lambda: cards_for(wb, self.store, session))
        else:
            tools = WorkspaceTools(index, reads=reads)
        started = time.time()
        try:
            return tools.call(name, args)
        finally:
            self.store.log_hook({"ev": "mcp", "tool": name, "conv": conv, "args": args, "ms": int((time.time() - started) * 1000)})


def _send(payload: dict) -> None:
    sys.stdout.buffer.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    state_dir = args[args.index("--state") + 1] if "--state" in args else os.getcwd()
    session_id = args[args.index("--session") + 1] if "--session" in args else os.environ.get("VIBE_WORKSPACE_SESSION", "")
    server = Server(state_dir, session_id)
    for raw in sys.stdin.buffer:
        try:
            msg = json.loads(raw.decode("utf-8"))
        except ValueError:
            continue
        mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
        if mid is None:
            continue  # 알림 (notifications/initialized 등)
        if method == "initialize":
            result = {"protocolVersion": params.get("protocolVersion") or PROTOCOL_VERSION,
                      "capabilities": {"tools": {}}, "serverInfo": {"name": "vibefs", "version": "1.0"},
                      "instructions": packs.message("core:messages.json", "sandbox.serverInstructions")}
        elif method == "tools/list":
            result = {"tools": [*TOOL_SPECS, *WB_TOOL_SPECS, *DC_TOOL_SPECS, *RF_TOOL_SPECS]}
        elif method == "tools/call":
            try:
                text = server.call(str(params.get("name") or ""), dict(params.get("arguments") or {}), dict(params.get("_meta") or {}))
                result = {"content": [{"type": "text", "text": text}]}
            except Exception as exc:  # 도구 오류는 모델에게 돌려준다 (서버는 살아 있다)
                detail = str(exc) if isinstance(exc, ValueError) else f"{type(exc).__name__}: {exc}"
                if not isinstance(exc, ValueError):
                    server.store.log_hook({"ev": "mcp_error", "trace": traceback.format_exc()[-1500:]})
                # ACP 는 실패 사유를 싣지 않는다 — 화면이 사유를 보여 줄 수 있게 남긴다 (tool_failure_reason)
                meta = dict(params.get("_meta") or {})
                conv = next((str(meta[k]) for k in CONV_META_KEYS if meta.get(k)), "")
                server.store.log_hook({"ev": "mcp_fail", "tool": str(params.get("name") or ""), "conv": conv, "reason": detail[:600]})
                result = {"content": [{"type": "text", "text": f"오류: {detail}"}], "isError": True}
        elif method == "ping":
            result = {}
        else:
            _send({"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"method not found: {method}"}})
            continue
        _send({"jsonrpc": "2.0", "id": mid, "result": result})
    return 0


