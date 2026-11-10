"""색인 파이프라인 한 번 — 단계: 수집 → 분할 → (보강) → 조립 → 품질 → 쓰기.

이 함수는 동기 · 블로킹이다. 작업 큐(워커 스레드)가 부른다. 진행 상황은 `progress` 로,
중단은 `cancel` 로 주고받는다. 보강(LLM)은 조각 해시로 캐시되므로, 끊긴 작업을 다시 돌리거나
원문 일부만 바뀌었을 때는 바뀐 조각만 LLM 을 다시 부른다.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from .assemble import build_deck
from .contracts import (
    CARD_BATCH_SCHEMA,
    CARD_RULES_VERSION,
    SCHEMA_VERSION,
    Depth,
    ScopeProfile,
    Segment,
)
from .enrich import (
    CardEnricher,
    EnrichmentCache,
    batches,
    build_prompt,
    cache_key,
    parse_response,
)
from .ingest import ingest_sources
from .quality import evaluate
from .segment import segment_document
from .writer import assign_archive_paths, write_deck

logger = logging.getLogger(__name__)

Progress = Callable[[str, float, dict[str, Any]], None]


class IndexCancelled(Exception):
    pass


@dataclass
class IndexSpec:
    deck_id: str
    title: str
    source_paths: list[str]
    depth: Depth = "structural"
    language: str = "ko"
    profile: ScopeProfile = field(default_factory=ScopeProfile)
    llm_concurrency: int = 3


class FileProgress:
    """원본 파일별 진행 — 덱 하나에 파일이 여러 개일 때 "4개 중 몇 개 끝났나 · 각각 몇 %"를 화면에 준다.

    단위는 조각(segment): 보강(LLM)이 끝난 조각 수 / 그 파일의 조각 수. 구조 색인(LLM 없음)은 분할이 끝나면 완료.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._files: list[dict[str, Any]] = []
        self._by_doc: dict[int, dict[str, Any]] = {}

    def add(self, doc_no: int, path: str, title: str, segments: int) -> None:
        # 화면은 RM 과 같은 파일 이름으로 보여 준다 (문서 안 제목은 docTitle 로 따로)
        name = path.replace("\\", "/").rsplit("/", 1)[-1]
        entry = {"path": path, "title": name, "docTitle": title, "segments": segments, "done": 0, "status": "pending"}
        self._files.append(entry)
        self._by_doc[doc_no] = entry

    def skipped(self, path: str, reason: str) -> None:
        self._files.append({"path": path, "title": path.replace("\\", "/").rsplit("/", 1)[-1], "segments": 0, "done": 0,
                            "status": "skipped", "reason": reason})

    def advance(self, segments: list[Segment]) -> None:
        with self._lock:
            for seg in segments:
                entry = self._by_doc.get(seg.doc_no)
                if entry is not None and entry["done"] < entry["segments"]:
                    entry["done"] += 1
            for entry in self._by_doc.values():
                entry["status"] = _file_status(entry)

    def finish_all(self) -> None:
        with self._lock:
            for entry in self._by_doc.values():
                entry["done"] = entry["segments"]
                entry["status"] = "done"

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(e) for e in self._files]


def _file_status(entry: dict[str, Any]) -> str:
    if entry["segments"] == 0 or entry["done"] >= entry["segments"]:
        return "done"
    return "running" if entry["done"] > 0 else "pending"


@dataclass
class IndexOutcome:
    manifest: dict[str, Any]
    quality: dict[str, Any]
    usage: dict[str, Any]


def run_index(
    spec: IndexSpec,
    deck_dir: Path,
    *,
    enricher: Optional[CardEnricher] = None,
    cache: Optional[EnrichmentCache] = None,
    progress: Optional[Progress] = None,
    cancel: Optional[threading.Event] = None,
) -> IndexOutcome:
    started = time.monotonic()
    cancel = cancel or threading.Event()
    report = progress or (lambda stage, pct, detail: None)
    usage: dict[str, Any] = {"llmCalls": 0, "cacheHits": 0, "inputTokens": 0, "outputTokens": 0, "totalTokens": 0,
                             "llmSeconds": 0.0, "failedBatches": 0}

    def check() -> None:
        if cancel.is_set():
            raise IndexCancelled()

    report("ingest", 0.02, {})
    ingest = ingest_sources(spec.source_paths, spec.profile)
    check()
    if not ingest.docs:
        raise ValueError("색인할 수 있는 문서가 없습니다: " + "; ".join(f"{s['path']} ({s['reason']})" for s in ingest.skipped[:5]))
    report("segment", 0.08, {"fileCount": len(ingest.docs)})
    segmented: dict[int, tuple[list[Segment], list[str]]] = {}
    for doc in ingest.docs:
        segmented[doc.doc_no] = segment_document(doc, spec.profile)
    assign_archive_paths(ingest.docs, segmented)
    all_segments = [s for segs, _ in segmented.values() for s in segs]
    files = FileProgress()
    for doc in ingest.docs:
        files.add(doc.doc_no, doc.rel_path, doc.title, len(segmented[doc.doc_no][0]))
    for skip in ingest.skipped:
        files.skipped(skip.get("path", ""), skip.get("reason", ""))
    check()

    enrichments: dict[str, dict[str, Any]] = {}
    if spec.depth == "enriched" and enricher is not None:
        enrichments = _enrich(spec, all_segments, enricher, cache, usage, report, cancel, files)
    else:
        files.finish_all()
        report("segment", 0.1, {"files": files.snapshot()})
    check()

    files.finish_all()
    report("assemble", 0.9, {"segments": len(all_segments), "files": files.snapshot()})
    build = build_deck(ingest.docs, segmented, spec.profile, enrichments)
    quality = evaluate(build, ingest.docs, ingest, spec.profile)
    stats = {
        "files": len(ingest.docs),
        "skipped": len(ingest.skipped),
        "segments": len(build.segments),
        "sections": len(build.sections),
        "cards": len(build.cards),
        "enrichedCards": sum(1 for c in build.cards if c.depth == "enriched"),
        "tables": sum(1 for a in build.assets if a.kind == "table"),
        "figures": sum(1 for a in build.assets if a.kind == "figure"),
        "codeBlocks": sum(1 for a in build.assets if a.kind == "code"),
        "chars": sum(len(s.text) for s in build.segments),
    }
    manifest = {
        "schema": SCHEMA_VERSION,
        "rules": CARD_RULES_VERSION,
        "deckId": spec.deck_id,
        "title": spec.title,
        "sourcePaths": spec.source_paths,
        "depth": spec.depth,
        "language": spec.language,
        "model": getattr(enricher, "model", None) if spec.depth == "enriched" else None,
        "profile": spec.profile.to_dict(),
        "stats": stats,
        "sources": [{"path": d.rel_path, "kind": d.kind, "sha": d.sha, "title": d.title} for d in ingest.docs],
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "buildSeconds": round(time.monotonic() - started, 2),
        "usage": usage,
    }
    report("write", 0.96, stats)
    write_deck(deck_dir, build, manifest, quality)
    report("done", 1.0, stats)
    return IndexOutcome(manifest=manifest, quality=quality, usage=usage)


def _enrich(
    spec: IndexSpec,
    segments: list[Segment],
    enricher: CardEnricher,
    cache: Optional[EnrichmentCache],
    usage: dict[str, Any],
    report: Progress,
    cancel: threading.Event,
    files: Optional[FileProgress] = None,
) -> dict[str, dict[str, Any]]:
    model = getattr(enricher, "model", "llm")
    files = files or FileProgress()
    results: dict[str, dict[str, Any]] = {}
    todo: list[Segment] = []
    cached: list[Segment] = []
    for seg in segments:
        hit = cache.get(cache_key(seg, model, spec.language)) if cache else None
        if hit is not None:
            results[seg.segment_id] = hit
            usage["cacheHits"] += 1
            cached.append(seg)
        else:
            todo.append(seg)
    files.advance(cached)  # 캐시로 끝난 조각은 바로 완료
    groups = batches(todo)
    total = max(len(groups), 1)
    done = 0
    lock = threading.Lock()
    report("enrich", 0.1, {"batches": len(groups), "cached": usage["cacheHits"], "segments": len(segments),
                           "files": files.snapshot()})

    def work(batch: list[Segment]) -> dict[str, dict[str, Any]]:
        if cancel.is_set():
            return {}
        t0 = time.monotonic()
        data, meta = enricher.run(build_prompt(batch, spec.language), CARD_BATCH_SCHEMA)
        parsed = parse_response(batch, data)
        missing = [s for s in batch if s.segment_id not in parsed]
        # 한 번에 너무 많이 줘서 일부를 빼먹었으면, 빠진 조각만 한 번 더 (작은 배치로)
        if missing and len(batch) > 1 and not cancel.is_set():
            data2, meta2 = enricher.run(build_prompt(missing, spec.language), CARD_BATCH_SCHEMA)
            parsed.update(parse_response(missing, data2))
            meta = _merge_usage(meta, meta2)
        with lock:
            usage["llmCalls"] += int(meta.get("calls", 1))
            usage["inputTokens"] += int(meta.get("input_tokens", 0))
            usage["outputTokens"] += int(meta.get("output_tokens", 0))
            usage["totalTokens"] += int(meta.get("total_tokens", 0))
            usage["llmSeconds"] = round(usage["llmSeconds"] + (time.monotonic() - t0), 2)
            if not parsed:
                usage["failedBatches"] += 1
        if cache:
            for seg in batch:
                if seg.segment_id in parsed:
                    cache.put(cache_key(seg, model, spec.language), parsed[seg.segment_id])
        return parsed

    with ThreadPoolExecutor(max_workers=max(1, spec.llm_concurrency), thread_name_prefix="kdeck-enrich") as pool:
        futures = {pool.submit(work, b): b for b in groups}
        for fut in as_completed(futures):
            try:
                results.update(fut.result())
            except Exception as exc:  # 배치 하나의 실패가 덱 전체를 막지 않는다 (해당 카드는 결정적 카드로 남는다)
                logger.warning("[knowledge] 보강 배치 실패: %s", exc)
                with lock:
                    usage["failedBatches"] += 1
            done += 1
            # 실패한 배치의 조각도 결정적 카드로 끝나므로 "처리됨"으로 센다
            files.advance(futures[fut])
            report("enrich", 0.1 + 0.78 * done / total,
                   {"batches": len(groups), "done": done, "cards": len(results), "files": files.snapshot()})
            if cancel.is_set():
                for f in futures:
                    f.cancel()
                raise IndexCancelled()
    return results


def _merge_usage(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    out = dict(a)
    for key in ("input_tokens", "output_tokens", "total_tokens"):
        out[key] = int(a.get(key, 0)) + int(b.get(key, 0))
    out["calls"] = int(a.get("calls", 1)) + int(b.get("calls", 1))
    return out
