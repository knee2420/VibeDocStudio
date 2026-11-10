"""동기 이벤트 제너레이터 → SSE 비동기 스트림 (모든 도메인 라우터가 같은 규칙으로 흘린다).

Starlette 는 클라이언트 연결이 끊기면 응답 태스크를 취소할 뿐, 스레드풀에서 돌던 동기 제너레이터를
닫지 않고 버린다. 그러면 제너레이터의 `finally`(세션 잠금 해제 · agy 프로세스 정리)가 영영 돌지 않는다.

그래서 제너레이터는 전용 스레드가 끝까지 소비하고(정리가 항상 실행된다), 응답 쪽은 큐에서 꺼내
보내기만 한다. 연결이 끊기면 `on_disconnect`(실행 취소 신호)를 불러 생산 스레드가 빨리 끝나게 한다.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any, AsyncIterator, Callable, Iterator, Optional

logger = logging.getLogger(__name__)

_DONE = object()

#: 프록시가 버퍼링하지 않게 하는 SSE 응답 헤더
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def encode(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


async def pump_events(
    events: Iterator[dict[str, Any]],
    on_disconnect: Optional[Callable[[], None]] = None,
) -> AsyncIterator[str]:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Any] = asyncio.Queue()
    finished = threading.Event()

    def produce() -> None:
        try:
            for event in events:
                loop.call_soon_threadsafe(queue.put_nowait, event)
        except Exception as exc:  # 스트림 도중 오류도 이벤트로 알린다 (HTTP 상태는 이미 200)
            logger.exception("[sse] 이벤트 생산 중 오류")
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "message": str(exc)})
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "turn_done", "stopReason": "error"})
        finally:
            finished.set()
            try:
                loop.call_soon_threadsafe(queue.put_nowait, _DONE)
            except RuntimeError:
                pass  # 이벤트 루프가 이미 닫혔다 (응답이 먼저 끝남)

    threading.Thread(target=produce, name="sse-producer", daemon=True).start()
    try:
        while True:
            item = await queue.get()
            if item is _DONE:
                break
            yield encode(item)
    finally:
        if not finished.is_set() and on_disconnect is not None:
            on_disconnect()


def sse_response(events: Iterator[dict[str, Any]], on_disconnect: Optional[Callable[[], None]] = None):
    """이벤트는 전용 스레드가 끝까지 소비한다 (연결이 끊겨도 세션 잠금 · 프로세스 정리가 실행된다)."""
    from fastapi.responses import StreamingResponse

    return StreamingResponse(pump_events(events, on_disconnect), media_type="text/event-stream", headers=SSE_HEADERS)
