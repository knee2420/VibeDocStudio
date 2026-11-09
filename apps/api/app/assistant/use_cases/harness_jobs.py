"""일괄 채우기 작업 (`fill.scope`) — 범위(블록 · 페이지 · 문서)의 칸마다 하네스를 돌려 변경안을 쌓는다.

- 요청은 즉시 받고(작업 id), 뒤에서 워커 스레드가 칸마다 `HarnessService.run` 을 돈다 (동시 2칸).
- 칸 하나가 끝날 때마다 변경안을 **프로젝트 Staged 대기열에 덧붙인다** (`staging_sink`) — 화면은 진행 이벤트를
  받아 대기열을 다시 읽고, 캔버스 자리에서 diff 로 검토한다. 문서에는 아무것도 바로 쓰지 않는다.
- 칸 정보(대상 · 근거 · 기준 지문)는 프론트가 만들어 보낸다 (문서 원장 · 근거 해석이 화면에 있으므로).
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from ..harness import plain
from .harness_service import HarnessService

logger = logging.getLogger(__name__)

StagingSink = Callable[[str, list[dict[str, Any]]], Any]


class HarnessJobRunner:
    def __init__(self, harness: HarnessService, staging_sink: Optional[StagingSink] = None, concurrency: int = 2) -> None:
        self._harness = harness
        self._sink = staging_sink
        self._concurrency = max(1, concurrency)
        self._pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="harness-job")
        self._jobs: dict[str, dict[str, Any]] = {}
        self._cancels: dict[str, threading.Event] = {}
        self._cond = threading.Condition()

    # --- 요청 · 조회 -------------------------------------------------------------------

    def submit(self, payload: dict[str, Any]) -> dict[str, Any]:
        items = [i for i in payload.get("items") or [] if isinstance(i, dict) and (i.get("target") or {}).get("slotId")]
        if not items:
            raise ValueError("채울 칸이 없습니다.")
        job_id = f"hjob_{uuid.uuid4().hex[:10]}"
        job = {
            "jobId": job_id, "runId": payload.get("runId") or f"run-{uuid.uuid4().hex[:8]}",
            "harnessId": payload.get("harnessId") or "fill.slot", "projectId": payload.get("projectId"),
            "docId": payload.get("docId"), "total": len(items), "done": 0, "failed": 0, "staged": 0,
            "status": "running", "events": [], "createdAt": time.time(),
        }
        with self._cond:
            self._jobs[job_id] = job
            self._cancels[job_id] = threading.Event()
        self._pool.submit(self._run, job_id, items, payload)
        return self.get(job_id) or {}

    def get(self, job_id: str) -> Optional[dict[str, Any]]:
        job = self._jobs.get(job_id)
        return {k: v for k, v in job.items() if k != "events"} if job else None

    def cancel(self, job_id: str) -> Optional[dict[str, Any]]:
        event = self._cancels.get(job_id)
        if event:
            event.set()
        return self.get(job_id)

    def wait_events(self, job_id: str, after: int, timeout: float = 15.0) -> list[dict[str, Any]]:
        deadline = time.monotonic() + timeout
        with self._cond:
            while True:
                job = self._jobs.get(job_id)
                if job is None:
                    return []
                if len(job["events"]) > after:
                    return job["events"][after:]
                if job["status"] != "running" or time.monotonic() >= deadline:
                    return []
                self._cond.wait(timeout=min(1.0, deadline - time.monotonic()))

    # --- 실행 --------------------------------------------------------------------------

    def _emit(self, job_id: str, event: dict[str, Any]) -> None:
        with self._cond:
            job = self._jobs[job_id]
            job["events"].append({"seq": len(job["events"]) + 1, **event, "done": job["done"], "total": job["total"],
                                  "staged": job["staged"], "failed": job["failed"]})
            self._cond.notify_all()

    def _run(self, job_id: str, items: list[dict[str, Any]], payload: dict[str, Any]) -> None:
        job = self._jobs[job_id]
        cancel = self._cancels[job_id]
        self._emit(job_id, {"type": "started"})
        lock = threading.Lock()

        def one(item: dict[str, Any]) -> None:
            if cancel.is_set():
                return
            target = item["target"]
            result: dict[str, Any] | None = None
            error: str | None = None
            for event in self._harness.run(
                {"harnessId": job["harnessId"], "runId": job["runId"], "instruction": payload.get("instruction"), "target": target,
                 "evidence": item.get("evidence") or [], "deckIds": payload.get("deckIds") or []},
                cancel,
            ):
                if event.get("type") == "result":
                    result = event
                elif event.get("type") == "error":
                    error = event.get("message")
            change = self._staged_change(job, item, result) if result and result.get("html") else None
            with lock:
                job["done"] += 1
                if change:
                    job["staged"] += 1
                else:
                    job["failed"] += 1
            if change and self._sink and job.get("projectId"):
                try:
                    self._sink(job["projectId"], [change])
                except Exception as exc:  # 대기열 저장 실패는 그 칸만 실패로 센다
                    logger.warning("[harness-job] 대기열 덧붙이기 실패: %s", exc)
            self._emit(job_id, {"type": "item", "slotId": target.get("slotId"), "ok": bool(change), "diffId": (change or {}).get("diffId"),
                                "error": error, "warnings": (result or {}).get("warnings") or []})

        with ThreadPoolExecutor(max_workers=self._concurrency, thread_name_prefix="harness-slot") as pool:
            list(pool.map(one, items))
        job["status"] = "cancelled" if cancel.is_set() else "succeeded"
        self._emit(job_id, {"type": job["status"]})

    @staticmethod
    def _staged_change(job: dict[str, Any], item: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
        target = item["target"]
        html = str(result["html"])
        return {
            "diffId": f"stg-scope-{uuid.uuid4().hex[:10]}",
            "phase": "drafting",
            "targetKind": "slot-html",
            "targetId": target.get("slotId"),
            "title": f"[일괄 채우기] {target.get('label') or target.get('slotId')}",
            "beforeSummary": (plain(str(target.get("currentHtml") or ""))[:80]) or "(빈 슬롯)",
            "afterSummary": plain(html)[:110],
            "payload": {"slotId": target.get("slotId"), "html": html},
            "sourceReferenceIds": [],
            "docId": job.get("docId"),
            "baseHash": item.get("baseHash"),
            "runId": job["runId"],
            "harnessId": job["harnessId"],
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "evidence": result.get("evidence") or [],
            "warnings": result.get("warnings") or [],
        }
