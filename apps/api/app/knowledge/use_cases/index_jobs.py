"""색인 작업 큐 — 요청은 즉시 받고(`queued`), 워커 스레드가 뒤에서 돌린다.

- 작업 상태 · 이벤트는 `JobStore` 에 영속된다. 서버가 재시작되면 끝나지 않은 작업을 다시 큐에 넣는다.
  다시 돌려도 LLM 보강은 조각 해시 캐시를 타므로, 끊기기 전에 만든 카드는 다시 부르지 않는다.
- 진행 이벤트는 구독자(SSE)에게 바로 흘리고, 덱 목록의 상태 · 진행률도 함께 갱신한다.
- API 이벤트 루프를 막지 않는다: 파이프라인은 전용 스레드 풀에서만 돈다.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from ..models import DeckStat, IndexJob, KnowledgeDeck, TopicNode
from ..pipeline import IndexCancelled, IndexSpec, ScopeProfile, run_index
from ..pipeline.reader import DeckReader
from ..ports import DeckFiles, DeckRegistry, EnricherFactory, EnrichmentCache, JobStore

logger = logging.getLogger(__name__)

#: 진행 이벤트를 디스크 · 목록에 반영하는 최소 간격 (초) — 보강 배치가 잘게 끝나도 쓰기가 몰리지 않게
_PERSIST_INTERVAL = 0.6


class IndexJobRunner:
    def __init__(
        self,
        *,
        registry: DeckRegistry,
        files: DeckFiles,
        jobs: JobStore,
        cache: EnrichmentCache,
        enricher_factory: EnricherFactory,
        max_parallel_jobs: int = 1,
        llm_concurrency: int = 3,
    ) -> None:
        self._registry = registry
        self._files = files
        self._jobs = jobs
        self._cache = cache
        self._enricher_factory = enricher_factory
        self._llm_concurrency = llm_concurrency
        self._pool = ThreadPoolExecutor(max_workers=max(1, max_parallel_jobs), thread_name_prefix="kdeck-job")
        self._cancels: dict[str, threading.Event] = {}
        self._cond = threading.Condition()
        self._seq: dict[str, int] = {}
        self._started = False
        self._closed = False

    # --- 수명 ---------------------------------------------------------------------

    def start(self) -> list[str]:
        """끝나지 않은 작업(서버가 꺼지기 전에 돌던 것 포함)을 다시 큐에 넣는다."""
        if self._started:
            return []
        self._started = True
        resumed = []
        for job in self._jobs.list_unfinished():
            job.status = "queued"
            job.stage = "resumed"
            self._jobs.save(job)
            self._emit(job, "resumed", {"attempts": job.attempts})
            self._enqueue(job)
            resumed.append(job.job_id)
        if resumed:
            logger.info("[knowledge] 끊긴 색인 작업 %d건을 이어서 돌립니다: %s", len(resumed), resumed)
        return resumed

    def shutdown(self) -> None:
        self._closed = True
        for event in self._cancels.values():
            event.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    # --- 요청 ---------------------------------------------------------------------

    def submit(
        self,
        *,
        project_id: str,
        title: str,
        source_paths: list[str],
        depth: str = "structural",
        language: str = "ko",
        profile: Optional[dict[str, Any]] = None,
        tags: Optional[list[str]] = None,
        deck_id: Optional[str] = None,
    ) -> tuple[KnowledgeDeck, IndexJob]:
        if depth not in ("structural", "enriched"):
            raise ValueError(f"알 수 없는 색인 깊이: {depth}")
        if depth == "enriched" and self._enricher_factory() is None:
            depth = "structural"  # LLM 이 꺼진 환경: 결정적 색인으로 내려간다 (이벤트로 알린다)
        deck = self._registry.get_deck(project_id, deck_id) if deck_id else None
        if deck is None:
            deck = KnowledgeDeck(project_id=project_id, title=title, source_paths=list(source_paths), tags=list(tags or []))
            if deck_id:
                deck.id = deck_id
        job = IndexJob(
            job_id=f"kjob_{uuid.uuid4().hex[:12]}",
            deck_id=deck.id,
            project_id=project_id,
            title=title or deck.title,
            source_paths=list(source_paths) or deck.source_paths,
            depth=depth,
            language=language,
            profile=dict(profile or deck.profile or {}),
        )
        deck.title = job.title
        deck.source_paths = job.source_paths
        deck.depth = depth
        deck.profile = job.profile
        deck.job_id = job.job_id
        deck.error = ""
        deck.stage = "queued"
        # 재색인이면 이전 덱을 그대로 쓸 수 있다 — 상태는 "indexing" 이지만 도구는 이전 빌드를 읽는다
        deck.status = "indexing" if self._files.deck_dir(deck.id).joinpath("deck.json").exists() else "queued"
        deck.progress = 0
        # 수집 전에는 고른 원본 경로를 "대기"로 보여 준다 (폴더면 분할 뒤 실제 파일 목록으로 바뀐다)
        deck.files = [_pending_file(p) for p in job.source_paths]
        deck.updated_at = int(time.time() * 1000)
        self._registry.upsert_deck(project_id, deck)
        self._jobs.save(job)
        self._emit(job, "queued", {"depth": depth})
        self._enqueue(job)
        return deck, job

    def cancel(self, job_id: str) -> Optional[IndexJob]:
        job = self._jobs.get(job_id)
        if job is None or job.terminal:
            return job
        event = self._cancels.get(job_id)
        if event:
            event.set()
        else:  # 아직 큐에서 기다리는 중
            self._finish(job, "cancelled", error="사용자가 취소했습니다.")
        return self._jobs.get(job_id)

    def get(self, job_id: str) -> Optional[IndexJob]:
        return self._jobs.get(job_id)

    def events(self, job_id: str, after: int = 0) -> list[dict[str, Any]]:
        return self._jobs.events(job_id, after)

    def wait(self, job_id: str, after: int, timeout: float = 15.0) -> list[dict[str, Any]]:
        """`after` 번째 이후 이벤트가 생길 때까지(또는 timeout) 기다린다 — SSE 펌프용."""
        deadline = time.monotonic() + timeout
        with self._cond:
            while True:
                found = self._jobs.events(job_id, after)
                if found:
                    return found
                job = self._jobs.get(job_id)
                remaining = deadline - time.monotonic()
                if job is None or job.terminal or remaining <= 0:
                    return []
                self._cond.wait(timeout=min(remaining, 1.0))

    # --- 실행 ---------------------------------------------------------------------

    def _enqueue(self, job: IndexJob) -> None:
        if self._closed:
            return
        self._cancels[job.job_id] = threading.Event()
        self._pool.submit(self._run, job.job_id)

    def _emit(self, job: IndexJob, kind: str, detail: dict[str, Any]) -> None:
        seq = self._seq.get(job.job_id)
        if seq is None:
            seq = len(self._jobs.events(job.job_id))
        seq += 1
        self._seq[job.job_id] = seq
        event = {"seq": seq, "type": kind, "jobId": job.job_id, "deckId": job.deck_id, "status": job.status,
                 "stage": job.stage, "progress": round(job.progress, 4), "detail": detail, "ts": int(time.time() * 1000)}
        self._jobs.append_event(job.job_id, event)
        with self._cond:
            self._cond.notify_all()

    def _update_deck(self, job: IndexJob, **fields: Any) -> None:
        deck = self._registry.get_deck(job.project_id, job.deck_id)
        if deck is None:
            return
        for key, value in fields.items():
            setattr(deck, key, value)
        deck.updated_at = int(time.time() * 1000)
        self._registry.upsert_deck(job.project_id, deck)

    def _run(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if job is None or job.terminal:
            return
        cancel = self._cancels.setdefault(job_id, threading.Event())
        if cancel.is_set():
            self._finish(job, "cancelled", error="사용자가 취소했습니다.")
            return
        job.status = "running"
        job.attempts += 1
        job.stage = "start"
        self._jobs.save(job)
        self._emit(job, "started", {"attempt": job.attempts})
        self._update_deck(job, status="indexing", stage="start", progress=1)

        enricher = self._enricher_factory() if job.depth == "enriched" else None
        if job.depth == "enriched" and enricher is None:
            self._emit(job, "warning", {"message": "외부 LLM 을 쓸 수 없어 구조 색인(LLM 없음)으로 만듭니다."})

        last_persist = [0.0]
        last_stage = [""]
        files: list[list[dict[str, Any]]] = [[]]

        def progress(stage: str, pct: float, detail: dict[str, Any]) -> None:
            job.stage = stage
            job.progress = pct
            if isinstance(detail.get("files"), list):
                files[0] = detail["files"]
            now = time.monotonic()
            # 단계가 바뀔 때도 저장 — 목록(새로고침)이 "수집 2%" 같은 지난 단계에 멈춰 있지 않게
            stage_changed = stage != last_stage[0]
            last_stage[0] = stage
            if stage_changed or stage in ("done", "write") or now - last_persist[0] >= _PERSIST_INTERVAL:
                last_persist[0] = now
                self._jobs.save(job)
                extra = {"files": files[0]} if files[0] else {}
                self._update_deck(job, status="indexing", stage=stage, progress=int(pct * 100), **extra)
            self._emit(job, "progress", detail)

        spec = IndexSpec(
            deck_id=job.deck_id,
            title=job.title,
            source_paths=job.source_paths,
            depth="enriched" if enricher else "structural",
            language=job.language,
            profile=ScopeProfile.from_dict(job.profile),
            llm_concurrency=self._llm_concurrency,
        )
        try:
            outcome = run_index(spec, self._files.deck_dir(job.deck_id), enricher=enricher, cache=self._cache,
                                progress=progress, cancel=cancel)
        except IndexCancelled:
            self._finish(job, "cancelled", error="사용자가 취소했습니다.")
            return
        except Exception as exc:
            logger.exception("[knowledge] 색인 실패 %s: %s", job_id, exc)
            self._finish(job, "failed", error=str(exc)[:500])
            return
        finally:
            self._cancels.pop(job_id, None)

        job.usage = outcome.usage
        stats = outcome.manifest.get("stats", {})
        quality = outcome.quality
        self._update_deck(
            job,
            status="ready",
            stage="done",
            progress=100,
            depth=spec.depth,
            stat=DeckStat.from_pipeline(stats),
            topics=_preview_topics(self._files.deck_dir(job.deck_id)),
            quality={
                "passed": quality.get("passed", False),
                "failing": [k for k, g in quality.get("gates", {}).items() if not g.get("pass")],
                "metrics": quality.get("metrics", {}),
            },
            built_at=outcome.manifest.get("builtAt", ""),
            error="",
            files=[{**f, "done": f.get("segments", 0), "status": "done"} if f.get("status") != "skipped" else f for f in files[0]],
        )
        self._finish(job, "succeeded")

    def _finish(self, job: IndexJob, status: str, *, error: str = "") -> None:
        job.status = status  # type: ignore[assignment]
        job.error = error
        job.finished_at = int(time.time() * 1000)
        if status == "succeeded":
            job.progress = 1.0
        self._jobs.save(job)
        self._emit(job, status, {"error": error} if error else {"usage": job.usage})
        if status != "succeeded":
            has_previous = self._files.deck_dir(job.deck_id).joinpath("deck.json").exists()
            # 재색인이 실패 · 취소돼도 이전 빌드는 계속 쓸 수 있다
            self._update_deck(job, status="ready" if has_previous else status, stage=status,
                              error=error, progress=100 if has_previous else int(job.progress * 100))


def _pending_file(path: str) -> dict[str, Any]:
    name = path.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
    return {"path": path, "title": name, "segments": 0, "done": 0, "status": "pending"}


def _preview_topics(deck_dir) -> list[TopicNode]:  # noqa: ANN001
    """목록 화면용 미리보기: 섹션 → 카드 제목 (섹션당 최대 40장)."""
    reader = DeckReader(deck_dir)
    if not reader.exists:
        return []
    out: list[TopicNode] = []
    titles = reader.card_titles()
    for sec in reader.sections_overview():
        out.append(TopicNode(
            id=sec["sectionId"],
            title=f"{sec['sectionId']} {sec['title']}",
            level=1,
            snippet=sec["source"],
            children=[TopicNode(id=cid, title=f"{cid} {titles.get(cid, '')}", level=2) for cid in sec["cardIds"][:40]],
        ))
    return out
