"""agy 예열 풀의 상주 프로세스 상한 · 정리 계약 (실제 agy 대신 가짜 실행 파일)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

from app.llm.adapters.agy_stream import AgyConversation, WarmPool
from app.llm.models import EngineChoice

FAKE_AGY = """
import json, sys
print(json.dumps({"event": "init", "conversation_id": "conv-1"}), flush=True)
for line in sys.stdin:
    pass
"""


@pytest.fixture
def fake_agy(tmp_path: Path) -> str:
    script = tmp_path / "fake_agy.py"
    script.write_text(FAKE_AGY, encoding="utf-8")
    if sys.platform == "win32":
        launcher = tmp_path / "fake_agy.cmd"
        launcher.write_text(f'@"{sys.executable}" "{script}" %*\n', encoding="utf-8")
    else:
        launcher = tmp_path / "fake_agy"
        launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n', encoding="utf-8")
        launcher.chmod(0o755)
    return str(launcher)


def _alive(pool: WarmPool) -> int:
    with pool._lock:
        return sum(1 for spares in pool._spares.values() for p in spares if p.alive)


def _wait(pred, timeout: float = 10.0) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if pred():
            return True
        time.sleep(0.05)
    return pred()


def test_retarget_drops_previous_models_and_caps_total(fake_agy: str, tmp_path: Path) -> None:
    pool = WarmPool(fake_agy, tmp_path / "sandbox")
    try:
        for model in ("m-a", "m-b", "m-c", "m-d"):
            pool.retarget({model: 2})
        assert set(pool.status()) == {"m-d"}
        assert _alive(pool) == 2

        pool.retarget({"m-x": 2, "m-y": 2})
        assert pool.status()["m-x"]["target"] == 2
        assert "m-y" not in pool.status()  # 합계 상한(2)을 넘는 목표는 잘린다
        assert _alive(pool) <= WarmPool.MAX_TOTAL_SPARES
    finally:
        pool.shutdown()


def test_take_of_untargeted_model_does_not_add_permanent_spare(fake_agy: str, tmp_path: Path) -> None:
    pool = WarmPool(fake_agy, tmp_path / "sandbox")
    try:
        pool.retarget({"m-a": 1})
        proc = pool.take("m-other")
        time.sleep(0.3)
        assert "m-other" not in pool.status()
        proc.kill()
    finally:
        pool.shutdown()


def test_shutdown_kills_spares_and_blocks_new_spawns(fake_agy: str, tmp_path: Path) -> None:
    pool = WarmPool(fake_agy, tmp_path / "sandbox")
    pool.retarget({"m-a": 2})
    spares = list(pool._spares["m-a"])
    pool.shutdown()
    assert _wait(lambda: not any(p.alive for p in spares))
    pool.warm("m-a")
    pool.retarget({"m-a": 2})
    assert pool.status() == {}


def test_release_process_keeps_conversation_for_resume(fake_agy: str, tmp_path: Path) -> None:
    pool = WarmPool(fake_agy, tmp_path / "sandbox")
    try:
        conv = AgyConversation(pool, EngineChoice("agy_cli", "m-a"), idle_timeout=5)
        proc = conv._proc
        assert proc is not None and _wait(lambda: proc.ready)
        conv.release_process()
        assert conv._proc is None
        assert _wait(lambda: not proc.alive)
        assert conv.export_state() == {"agy_conversation_id": "conv-1"}
        conv.close()
    finally:
        pool.shutdown()
