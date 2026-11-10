"""비동기 순차 PDF 스캐폴딩 작업 큐 (`ScaffoldJobRunner`).

- 1단계에서 사용자가 고른 페이지 목록만 `pymupdf` 로 1쪽씩 잘라 순차 실행한다.
- 디버그 크롬(CDP 9222) 및 CLI 하네스 충돌을 막기 위해 `max_workers=1` 로 직렬 처리한다.
- 진행 이벤트는 `events.jsonl` 에 영속화하고 SSE(`wait()`) 구독자에게 즉시 흘린다.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

import pymupdf

from app.core.clock import utc_now_iso
from app.core.storage.ids import DOCUMENT_PREFIX, new_id

from ..models import ScaffoldJob, ScaffoldPageTask
from ..ports import FormScaffoldAgentPort, ScaffoldJobStorePort

logger = logging.getLogger(__name__)

_JOB_PREFIX = "sjob"
_PROGRESS_SAVE_INTERVAL = 0.5


def _slice_pdf_page(pdf_bytes: bytes, page_number: int) -> bytes:
    """원본 PDF에서 1부터 세는 `page_number` 1쪽만 잘라 새 PDF 바이트를 만든다."""
    src = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    if page_number < 1 or page_number > len(src):
        raise ValueError(f"PDF 페이지 번호 범위 초과: {page_number} (1~{len(src)})")
    out = pymupdf.open()
    out.insert_pdf(src, from_page=page_number - 1, to_page=page_number - 1)
    return out.tobytes()


def _normalize_single_page_label(label: str, doc_title: str, page_number: int) -> str:
    clean = (label or "").strip()
    if clean.endswith("(1p)"):
        return f"{clean[:-4].rstrip()} ({page_number}p)".strip()
    return clean or f"{doc_title} ({page_number}p)"


class ScaffoldJobRunner:
    def __init__(
        self,
        *,
        store: ScaffoldJobStorePort,
        agent: FormScaffoldAgentPort,
        max_parallel_jobs: int = 1,
    ) -> None:
        self._store = store
        self._agent = agent
        self._pool = ThreadPoolExecutor(max_workers=max(1, max_parallel_jobs), thread_name_prefix="scaffold-job")
        self._cancels: dict[str, threading.Event] = {}
        self._cond = threading.Condition()
        self._seq: dict[str, int] = {}
        self._started = False
        self._closed = False

    # --- 수명 ---------------------------------------------------------------------

    def start(self) -> list[str]:
        if self._started:
            return []
        self._started = True
        resumed: list[str] = []
        for job in self._store.list_unfinished():
            for p in job.pages:
                if p.status == "running":
                    p.status = "queued"
                    p.stage = "queued"
                    p.message = "서버 재시작 후 이어서 대기 중"
            job.status = "queued"
            job.updated_at = utc_now_iso()
            self._store.save(job)
            self._emit(job, "job_resumed", {"job": job.to_dict(include_payload=False)})
            self._enqueue(job.job_id)
            resumed.append(job.job_id)
        if resumed:
            logger.info("[form_scaffold] 미완료 비동기 작업 %d건을 재개합니다: %s", len(resumed), resumed)
        return resumed

    def shutdown(self) -> None:
        self._closed = True
        for ev in self._cancels.values():
            ev.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    # --- 조회 · 요청 ---------------------------------------------------------------

    def list_jobs(self, *, target_doc_id: Optional[str] = None, limit: int = 30) -> list[ScaffoldJob]:
        return self._store.list_jobs(target_doc_id=target_doc_id, limit=limit)

    def get(self, job_id: str) -> Optional[ScaffoldJob]:
        return self._store.get(job_id)

    def events(self, job_id: str, after: int = 0) -> list[dict[str, Any]]:
        return self._store.events(job_id, after)

    def wait(self, job_id: str, after: int, timeout: float = 15.0) -> list[dict[str, Any]]:
        deadline = time.monotonic() + timeout
        with self._cond:
            while True:
                found = self._store.events(job_id, after)
                if found:
                    return found
                job = self._store.get(job_id)
                remaining = deadline - time.monotonic()
                if job is None or job.terminal or remaining <= 0:
                    return []
                self._cond.wait(timeout=min(remaining, 1.0))

    def submit(
        self,
        *,
        pdf_bytes: bytes,
        title: str,
        target_doc_id: str,
        selected_pages: list[dict[str, Any]],
        mode: str = "insert-pages",
        fidelity_mode: str = "balanced",
    ) -> ScaffoldJob:
        if not pdf_bytes:
            raise ValueError("Uploaded PDF payload is empty")
        if not selected_pages:
            raise ValueError("At least one page must be selected")

        src_pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        total_pdf_pages = len(src_pdf)
        clean_title = (title or "").strip() or "추출된 양식 문서"
        job_id = new_id(_JOB_PREFIX)
        now = utc_now_iso()

        page_tasks: list[ScaffoldPageTask] = []
        for item in selected_pages:
            page_num = int(item.get("pageNumber") or 0)
            if page_num < 1 or page_num > total_pdf_pages:
                raise ValueError(f"페이지 번호 범위 초과: {page_num} (1~{total_pdf_pages})")
            page_tasks.append(
                ScaffoldPageTask(
                    page_number=page_num,
                    placeholder_page_id=item.get("placeholderPageId"),
                    status="queued",
                    stage="queued",
                    message="순서 대기 중",
                    thumbnail=item.get("thumbnail"),
                )
            )

        self._store.save_source_pdf(job_id, pdf_bytes)
        job = ScaffoldJob(
            job_id=job_id,
            title=clean_title,
            target_doc_id=target_doc_id,
            mode=mode,
            fidelity_mode=fidelity_mode,
            status="queued",
            created_at=now,
            updated_at=now,
            pages=page_tasks,
        )
        self._store.save(job)
        self._emit(job, "job_queued", {"job": job.to_dict(include_payload=False)})
        self._enqueue(job_id)
        return job

    def cancel(self, job_id: str) -> Optional[ScaffoldJob]:
        job = self._store.get(job_id)
        if job is None:
            return None
        ev = self._cancels.get(job_id)
        if ev is not None:
            ev.set()
        if not job.terminal:
            job.status = "cancelled"
            job.updated_at = utc_now_iso()
            for p in job.pages:
                if p.status in ("queued", "running"):
                    p.status = "cancelled"
                    p.stage = "cancelled"
                    p.message = "사용자가 중단했습니다."
            self._store.save(job)
            self._emit(job, "job_cancelled", {"job": job.to_dict(include_payload=False)})
        return job

    def retry_page(self, job_id: str, page_number: int) -> Optional[ScaffoldJob]:
        job = self._store.get(job_id)
        if job is None:
            return None
        target = next((p for p in job.pages if p.page_number == page_number), None)
        if target is None:
            return None
        if job.status == "running" and target.status == "running":
            return job
        target.status = "queued"
        target.stage = "queued"
        target.error = None
        target.message = "재시도 대기 중"
        job.status = "queued"
        job.updated_at = utc_now_iso()
        self._store.save(job)
        self._emit(job, "page_retried", {"pageNumber": page_number, "placeholderPageId": target.placeholder_page_id})
        if job_id not in self._cancels:
            self._enqueue(job_id)
        return job

    # --- 내부 워커 ----------------------------------------------------------------

    def _enqueue(self, job_id: str) -> None:
        if self._closed:
            return
        self._cancels[job_id] = threading.Event()
        self._pool.submit(self._run, job_id)

    def _emit(self, job: ScaffoldJob, kind: str, detail: dict[str, Any]) -> None:
        seq = self._seq.get(job.job_id)
        if seq is None:
            seq = len(self._store.events(job.job_id))
        seq += 1
        self._seq[job.job_id] = seq
        event = {
            "seq": seq,
            "type": kind,
            "jobId": job.job_id,
            "targetDocId": job.target_doc_id,
            "status": job.status,
            "currentPageNumber": job.current_page_number,
            "completedCount": job.completed_count,
            "totalCount": job.total_count,
            "detail": detail,
            "ts": int(time.time() * 1000),
        }
        self._store.append_event(job.job_id, event)
        with self._cond:
            self._cond.notify_all()

    def _run(self, job_id: str) -> None:
        cancel = self._cancels.setdefault(job_id, threading.Event())
        try:
            job = self._store.get(job_id)
            if job is None or job.terminal:
                return
            if cancel.is_set():
                self._mark_cancelled(job)
                return

            pdf_bytes = self._store.load_source_pdf(job_id)
            job.status = "running"
            job.updated_at = utc_now_iso()
            self._store.save(job)
            self._emit(job, "job_started", {"totalCount": job.total_count})

            for idx, task in enumerate(job.pages):
                if cancel.is_set():
                    self._mark_cancelled(job)
                    return
                if task.status == "completed":
                    continue

                task.status = "running"
                task.stage = "extracting"
                task.error = None
                task.message = f"{task.page_number}페이지 추출 및 조판 준비 중"
                job.current_page_number = task.page_number
                job.updated_at = utc_now_iso()
                self._store.save(job)
                self._emit(
                    job,
                    "page_started",
                    {
                        "pageIndex": idx,
                        "pageNumber": task.page_number,
                        "placeholderPageId": task.placeholder_page_id,
                        "pageTask": task.to_dict(include_payload=False),
                    },
                )

                last_saved_at = 0.0

                def on_progress(info: dict[str, Any], *, t: ScaffoldPageTask = task, j: ScaffoldJob = job) -> None:
                    nonlocal last_saved_at
                    if cancel.is_set():
                        return
                    if "stage" in info:
                        t.stage = str(info["stage"])
                    if "iter" in info and info["iter"] is not None:
                        t.iter = int(info["iter"])
                    if "verdict" in info:
                        t.verdict = info["verdict"]
                    if "spanScore" in info:
                        t.span_score = info["spanScore"]
                    if "warnings" in info and isinstance(info["warnings"], list):
                        t.warnings = list(info["warnings"])
                    if "message" in info and info["message"]:
                        t.message = str(info["message"])
                    j.updated_at = utc_now_iso()
                    now_m = time.monotonic()
                    if now_m - last_saved_at >= _PROGRESS_SAVE_INTERVAL:
                        last_saved_at = now_m
                        self._store.save(j)
                    self._emit(
                        j,
                        "page_progress",
                        {
                            "pageNumber": t.page_number,
                            "placeholderPageId": t.placeholder_page_id,
                            "pageTask": t.to_dict(include_payload=False),
                        },
                    )

                try:
                    page_pdf = _slice_pdf_page(pdf_bytes, task.page_number)
                    vdoc, checked_blocks, checked_slots, agent_run = self._agent.scaffold_document(
                        pdf_bytes=page_pdf,
                        doc_id=new_id(DOCUMENT_PREFIX),
                        title=job.title,
                        fidelity_mode=job.fidelity_mode,
                        on_progress=on_progress,
                        cancel_event=cancel,
                    )
                    if cancel.is_set() or (agent_run and agent_run.get("status") == "cancelled"):
                        self._mark_cancelled(job)
                        return

                    extracted_page = (vdoc.get("pages") or [None])[0]
                    if not isinstance(extracted_page, dict):
                        raise RuntimeError("변환된 문서에 페이지가 없습니다.")

                    extracted_page["pageLabel"] = _normalize_single_page_label(
                        str(extracted_page.get("pageLabel") or ""),
                        job.title,
                        task.page_number,
                    )
                    best_info = (agent_run or {}).get("best") or {}
                    warnings = list((agent_run or {}).get("warnings") or [])
                    if len(extracted_page.get("blocks") or []) == 0 and not warnings:
                        warnings.append("추출된 블록이 없습니다. 원본 PDF의 텍스트 레이어를 확인하세요.")

                    task.status = "completed"
                    task.stage = "completed"
                    task.verdict = best_info.get("verdict") or task.verdict
                    task.span_score = best_info.get("spanScore") if best_info.get("spanScore") is not None else task.span_score
                    task.warnings = warnings
                    task.message = (
                        f"완료 ({len(extracted_page.get('blocks') or [])}개 블록)"
                        if not warnings
                        else warnings[0]
                    )
                    task.block_count = checked_blocks
                    task.slot_count = checked_slots
                    task.page = extracted_page
                    task.slots = dict(vdoc.get("slots") or {})
                    task.variables = dict(vdoc.get("variables") or {})
                    task.agent_run = agent_run
                    job.updated_at = utc_now_iso()
                    self._store.save(job)

                    self._emit(
                        job,
                        "page_completed",
                        {
                            "pageNumber": task.page_number,
                            "placeholderPageId": task.placeholder_page_id,
                            "pageTask": task.to_dict(include_payload=False),
                            "page": task.page,
                            "slots": task.slots,
                            "variables": task.variables,
                            "thumbnail": task.thumbnail,
                        },
                    )
                except Exception as exc:
                    if cancel.is_set():
                        self._mark_cancelled(job)
                        return
                    logger.exception("[form_scaffold] 페이지 %d 스캐폴딩 실패 (job=%s)", task.page_number, job_id)
                    task.status = "failed"
                    task.stage = "failed"
                    task.error = f"{type(exc).__name__}: {exc}"
                    task.message = "추출 중 오류가 발생했습니다."
                    job.updated_at = utc_now_iso()
                    self._store.save(job)
                    self._emit(
                        job,
                        "page_failed",
                        {
                            "pageNumber": task.page_number,
                            "placeholderPageId": task.placeholder_page_id,
                            "pageTask": task.to_dict(include_payload=False),
                            "error": task.error,
                        },
                    )

            job.current_page_number = None
            any_completed = any(p.status == "completed" for p in job.pages)
            job.status = "completed" if any_completed else "failed"
            if not any_completed:
                job.error = next((p.error for p in job.pages if p.error), "모든 페이지 추출에 실패했습니다.")
            job.updated_at = utc_now_iso()
            self._store.save(job)
            event_kind = "job_completed" if job.status == "completed" else "job_failed"
            self._emit(job, event_kind, {"job": job.to_dict(include_payload=False)})
        finally:
            self._cancels.pop(job_id, None)

    def _mark_cancelled(self, job: ScaffoldJob) -> None:
        job.status = "cancelled"
        job.current_page_number = None
        job.updated_at = utc_now_iso()
        for p in job.pages:
            if p.status in ("queued", "running"):
                p.status = "cancelled"
                p.stage = "cancelled"
                p.message = "사용자가 중단했습니다."
        self._store.save(job)
        self._emit(job, "job_cancelled", {"job": job.to_dict(include_payload=False)})

