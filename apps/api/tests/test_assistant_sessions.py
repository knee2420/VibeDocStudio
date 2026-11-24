"""기준점 세션(무마찰 디렉팅) 서버 몫 — 유지 세션 · 세션 목록 · 실행 슬롯 · 볼트 쓰기 잠금 (오프라인 엔진)."""
from __future__ import annotations

import json
import multiprocessing
import os
import threading
import time

from app.bootstrap.container import Container
from main import app

# 라우트에 묶이지 않은 별도 컨테이너 — 다른 테스트가 앱을 다시 만들어 배선이 바뀌어도 흔들리지 않는다
service = Container(settings=app.state.container.settings()).assistant_service()


def _new(**kwargs) -> str:
    return service.create_session(**kwargs)["sessionId"]


def test_retained_session_survives_idle_cleanup_but_plain_one_does_not() -> None:
    plain = _new()
    kept = _new(retain=True, label="근거 조사")
    listed = {s["sessionId"]: s for s in service.list_sessions()}
    assert listed[kept]["retained"] is True and listed[kept]["label"] == "근거 조사"
    assert listed[plain]["retained"] is False and listed[plain]["running"] is False
    # 한 시간 동안 아무도 쓰지 않은 것처럼
    for sid in (plain, kept):
        service._sessions[sid].last_used -= 60 * 60
    service.release_idle()
    assert plain not in service._sessions, "일반 세션은 30분 유휴 정리에서 닫힌다"
    assert kept in service._sessions, "기준점 세션은 사용자가 완료할 때 닫는다"
    # 하루 넘게 손대지 않으면 그때는 정리한다
    service._sessions[kept].last_used -= 25 * 60 * 60
    service.release_idle()
    assert kept not in service._sessions


def test_run_slot_full_reports_queued_and_interrupt_while_waiting_ends_turn() -> None:
    sid = _new(retain=True)
    session = service._sessions[sid]
    original = service._run_slots
    service._run_slots = threading.BoundedSemaphore(1)
    try:
        assert service._run_slots.acquire(blocking=False)  # 다른 세션이 슬롯을 쓰고 있다
        gen = service.send_message(sid, text="hi", contexts=[], tools=[])
        first = next(gen)
        assert first["type"] == "status" and first["state"] == "queued"
        # 기다리는 동안에는 세션이 실행 중으로 보인다 (잠금을 쥐고 있다)
        assert session.lock.locked()
        threading.Timer(0.2, session.cancel.set).start()
        rest = list(gen)
        assert rest[-1]["type"] == "turn_done" and rest[-1]["stopReason"] == "interrupted"
        assert not session.lock.locked(), "중단되면 세션 잠금을 놓는다"
        service._run_slots.release()
        # 슬롯이 비면 바로 시작하고, 끝나면 슬롯을 돌려준다
        events = list(service.send_message(sid, text="hi", contexts=[], tools=[]))
        assert events[0]["type"] == "turn_start"
        assert events[-1]["stopReason"] == "end_turn"
        assert service._run_slots.acquire(blocking=False), "끝난 턴은 슬롯을 돌려줬다"
        service._run_slots.release()
    finally:
        service._run_slots = original
        service.close_session(sid)


def test_queued_turn_starts_when_slot_frees() -> None:
    sid = _new()
    original = service._run_slots
    service._run_slots = threading.BoundedSemaphore(1)
    try:
        assert service._run_slots.acquire(blocking=False)
        gen = service.send_message(sid, text="hi", contexts=[], tools=[])
        assert next(gen)["state"] == "queued"
        threading.Timer(0.3, service._run_slots.release).start()
        started = time.monotonic()
        rest = list(gen)
        assert time.monotonic() - started >= 0.25
        assert rest[0]["type"] == "turn_start" and rest[-1]["stopReason"] == "end_turn"
    finally:
        service._run_slots = original
        service.close_session(sid)


def _hold_lock(state_dir: str, hold: float, ready) -> None:
    from vibefs.fslock import vault_write_lock

    with vault_write_lock(state_dir):
        ready.set()
        time.sleep(hold)


def _append_many(state_dir: str, tag: str, n: int) -> None:
    from vibefs.fs_tools import FsJournal
    from vibefs.fslock import vault_write_lock

    journal = FsJournal(state_dir)
    for i in range(n):
        with vault_write_lock(state_dir):
            journal.append({"ev": "batch", "batchId": f"{tag}-{i}", "payload": "x" * 2000})


def test_vault_write_lock_is_exclusive_across_processes(tmp_path) -> None:
    from vibefs.fslock import VaultBusyError, vault_write_lock

    ctx = multiprocessing.get_context("spawn")
    ready = ctx.Event()
    holder = ctx.Process(target=_hold_lock, args=(str(tmp_path), 1.0, ready))
    holder.start()
    try:
        assert ready.wait(20), "다른 프로세스가 잠금을 잡았다"
        try:
            with vault_write_lock(str(tmp_path), timeout=0.2):
                raise AssertionError("다른 프로세스가 쥔 잠금을 얻으면 안 된다")
        except VaultBusyError:
            pass
        with vault_write_lock(str(tmp_path), timeout=10):
            pass  # 놓은 뒤에는 얻는다
    finally:
        holder.join(20)


def test_journal_lines_stay_intact_with_concurrent_writers(tmp_path) -> None:
    ctx = multiprocessing.get_context("spawn")
    procs = [ctx.Process(target=_append_many, args=(str(tmp_path), f"p{k}", 40)) for k in range(3)]
    for p in procs:
        p.start()
    for p in procs:
        p.join(60)
        assert p.exitcode == 0
    with open(os.path.join(str(tmp_path), "fs_journal.jsonl"), encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    assert len(rows) == 120
    assert len({r["batchId"] for r in rows}) == 120


def test_session_routes_accept_retain_and_list() -> None:
    """라우트 계약 — 요청 본문의 retain · label 과 목록 응답 모양 (라우트가 쓰는 서비스는 앱 배선에 따른다)."""
    from fastapi.testclient import TestClient

    from app.assistant.schemas import CreateSessionRequest

    req = CreateSessionRequest(retain=True, label="x")
    assert req.retain is True and req.label == "x"
    assert CreateSessionRequest().retain is False
    paths = set((app.openapi().get("paths") or {}).keys())
    assert "/api/assistant/sessions" in paths
    assert "get" in app.openapi()["paths"]["/api/assistant/sessions"]
    body = TestClient(app).get("/api/assistant/sessions").json()
    assert isinstance(body["sessions"], list)
