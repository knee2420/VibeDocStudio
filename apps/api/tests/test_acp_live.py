"""실제 agy ACP 서버 연동 라이브 테스트 (환경변수 VIBE_LIVE_AGY=1 일 때만 실행)."""
from __future__ import annotations

import os
import shutil
import threading
from pathlib import Path

import pytest

from app.assistant.adapters.acp_client import AcpClient
from app.assistant.adapters.agy_acp import AcpConversation
from app.assistant.models import EngineChoice

LIVE_AGY = os.environ.get("VIBE_LIVE_AGY") == "1"
AGY_BIN = shutil.which("agy")


@pytest.mark.skipif(not LIVE_AGY or not AGY_BIN, reason="VIBE_LIVE_AGY=1 및 agy 바이너리가 필요합니다.")
def test_live_acp_session_and_turn(tmp_path: Path):
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    workspace = tmp_path / "work"
    workspace.mkdir()
    (workspace / "test.txt").write_text("Hello Live ACP", encoding="utf-8")

    client = AcpClient(executable=AGY_BIN or "agy", cwd=sandbox)
    try:
        assert client.alive is True
        choice = EngineChoice(provider="agy_cli", model="gemini-3.8-flash")
        conv = AcpConversation(
            client=client,
            choice=choice,
            sandbox_dir=sandbox,
            roots_provider=lambda: [str(workspace)],
            system_prompt="[Live Test Rules]",
        )
        cancel = threading.Event()
        events = list(conv.run_turn("Say OK", cancel))
        assert any(e["type"] == "turn_done" for e in events)
        conv.close()
    finally:
        client.close()

