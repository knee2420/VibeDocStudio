"""`data/runs/{run_id}/` 안의 **관측 자료**를 소유하는 단일 지점.

## 왜 따로 있는가

이 디렉터리에는 성격이 다른 두 묶음이 함께 산다.

    events.jsonl · snapshot.json · input.json   실행 생애주기 → agent_runtime 레포지토리
    meta.json · ledger.jsonl · snapshots.json · payloads/   관측 자료 → **이 모듈**

예전에는 후자를 아는 곳이 세 군데였다. `core/llm/tracer` 가 함수 안에서
`settings` 를 열어 `settings.storage.data / "runs" / run_id` 로 경로를 **지어냈고**,
inspector 서비스가 같은 파일 이름을 손으로 읽었으며, 삭제는 또 다른 곳에서
`shutil.rmtree` 로 했다. 레이아웃을 바꾸면 세 곳을 동시에 고쳐야 했고, 하나만
고치면 조용히 어긋났다 — inspector 의 "평면 키에서 복원한다"는 하위호환 분기가
그 사고의 흔적이다.

그래서 파일 이름을 아는 곳을 하나로 모은다. 루트는 스스로 만들지 않고
**컨테이너가 주입한다** (`60-data/rule.md` §4-4).
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any, Mapping, Optional

from app.core.storage.ids import safe_segment
from app.core.storage.payloads import externalize_span_dict, read_payload

logger = logging.getLogger(__name__)

META_FILE = "meta.json"
LEDGER_FILE = "ledger.jsonl"
SNAPSHOTS_FILE = "snapshots.json"


class RunObservationStore:
    """실행 한 건의 관측 자료를 쓰고 읽는다."""

    def __init__(self, runs_dir: Path) -> None:
        self._runs_dir = runs_dir

    # --- 위치 ----------------------------------------------------------

    def _existing_dir(self, run_id: str) -> Optional[Path]:
        try:
            candidate = self._runs_dir / safe_segment(run_id)
        except ValueError:
            return None
        return candidate if candidate.is_dir() else None

    def list_run_ids(self) -> list[str]:
        if not self._runs_dir.exists():
            return []
        return [entry.name for entry in self._runs_dir.iterdir() if entry.is_dir()]

    # --- 쓰기 ----------------------------------------------------------

    def ingest(
        self,
        telemetry_data: Any,
        *,
        run_id: Optional[str] = None,
        doc_id: Optional[str] = None,
        target_name: Optional[str] = None,
        primary_provider: Optional[str] = None,
    ) -> Optional[Path]:
        """엔진이 방출한 `PipelineTelemetry` 를 관측 자료로 영속화한다."""
        try:
            from agent_telemetry.contracts import PipelineTelemetry

            if isinstance(telemetry_data, dict):
                telemetry = PipelineTelemetry.model_validate(telemetry_data)
            elif isinstance(telemetry_data, PipelineTelemetry):
                telemetry = telemetry_data
            else:
                return None

            actual_run_id = run_id or telemetry.trace_id
            run_dir = self._runs_dir / safe_segment(actual_run_id)
            run_dir.mkdir(parents=True, exist_ok=True)

            self._write_ledger(run_dir, telemetry)
            self._write_snapshots(run_dir, telemetry)
            self._write_meta(
                run_dir,
                telemetry,
                run_id=actual_run_id,
                doc_id=doc_id,
                target_name=target_name,
                primary_provider=primary_provider,
            )

            logger.info(
                "[RunObservation] 계측 저장 완료: %s (status=%s, spans=%d, snapshots=%d)",
                actual_run_id,
                telemetry.status.value,
                len(telemetry.spans),
                len(telemetry.snapshots),
            )
            return run_dir

        except Exception as exc:
            # 계측 저장 실패가 본 작업을 막지는 않는다. 다만 **조용히** 넘어가지도
            # 않는다 — 예전에는 트레이스백 없이 한 줄만 남겨서, SpanMetadata 에
            # `.get()` 을 부르던 버그가 "계측이 그냥 안 생긴다"로만 보였다.
            logger.error(
                "[RunObservation] 계측 저장 실패 (run=%s): %s",
                run_id or getattr(telemetry_data, "trace_id", "?"),
                exc,
                exc_info=True,
            )
            return None

    @staticmethod
    def _write_ledger(run_dir: Path, telemetry: Any) -> None:
        """스팬과 시도를 덧붙이기 전용 원장으로 적는다.

        큰 문자열(프롬프트·모델 출력)은 원장에 싣지 않고 내용 해시로 밖에 저장한 뒤
        포인터만 남긴다. 원장 한 줄이 본문 사본을 들고 있으면 원장이 본문만큼
        커진다 — 실측 7.1MB 중 93%가 다섯 개 키였고, 그중 둘은 같은 데이터의
        사본이었다. (`app/core/storage/payloads.py`, `60-data/rule.md` §4-1)
        """
        with open(run_dir / LEDGER_FILE, "w", encoding="utf-8") as handle:
            for span in telemetry.spans:
                entry = {
                    "event_type": "span",
                    "timestamp": span.start_time.isoformat(),
                    "data": externalize_span_dict(span.model_dump(mode="json"), run_dir),
                }
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
            for attempt in telemetry.attempts:
                entry = {"event_type": "attempt", "data": attempt.model_dump(mode="json")}
                handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    @staticmethod
    def _write_snapshots(run_dir: Path, telemetry: Any) -> None:
        payload = [snap.model_dump(mode="json") for snap in telemetry.snapshots]
        with open(run_dir / SNAPSHOTS_FILE, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

    @classmethod
    def _write_meta(
        cls,
        run_dir: Path,
        telemetry: Any,
        *,
        run_id: str,
        doc_id: Optional[str],
        target_name: Optional[str],
        primary_provider: Optional[str],
    ) -> None:
        provider, model = cls._resolve_provider_and_model(telemetry, primary_provider)

        raw_target = getattr(telemetry, "target_name", None)
        resolved_target = (
            target_name
            if (raw_target in (None, "", "source.pdf") and target_name)
            else (raw_target or target_name)
        )

        meta_payload = {
            "run_id": run_id,
            "doc_id": doc_id,
            "domain": getattr(telemetry, "domain", "documents"),
            "workflow_name": getattr(telemetry, "workflow_name", "pipeline"),
            "workflow_label": getattr(telemetry, "workflow_label", "") or "",
            "target_name": resolved_target,
            "primary_provider": provider,
            "primary_model": model,
            "pipeline_name": telemetry.pipeline_name,
            "status": telemetry.status.value,
            "start_time": telemetry.start_time.isoformat(),
            "end_time": telemetry.end_time.isoformat() if telemetry.end_time else None,
            "total_latency_ms": telemetry.total_latency_ms,
            # 합산 사용량 전체. 예전에는 total/prompt/completion 세 개만 평면으로
            # 적어서 캐시·사고 토큰이 meta 에서 사라졌고, 소비자가 없는 `usage`
            # 키를 읽다가 전부 0 을 표시했다. 공급자 어휘 그대로 통째로 남긴다.
            "usage": telemetry.total_usage.model_dump(mode="json"),
            # 아래 세 개는 하위 호환. 새 소비자는 `usage` 를 읽는다.
            "total_tokens": telemetry.total_usage.total_tokens,
            "prompt_tokens": telemetry.total_usage.prompt_tokens,
            "completion_tokens": telemetry.total_usage.completion_tokens,
            "spans_count": len(telemetry.spans),
            "snapshots_count": len(telemetry.snapshots),
            "attempts_count": len(telemetry.attempts),
            "provenance": telemetry.provenance,
        }
        with open(run_dir / META_FILE, "w", encoding="utf-8") as handle:
            json.dump(meta_payload, handle, ensure_ascii=False, indent=2)

    @staticmethod
    def _resolve_provider_and_model(
        telemetry: Any, primary_provider: Optional[str]
    ) -> tuple[Optional[str], Optional[str]]:
        """기록된 것에서 공급자·모델을 찾는다. 마지막에만 모델명으로 추론한다."""
        primary_model = None
        if primary_provider is None:
            if telemetry.attempts:
                chosen = next(
                    (a for a in telemetry.attempts if getattr(a, "status", None) == "success"),
                    telemetry.attempts[0],
                )
                primary_provider = chosen.provider
                primary_model = chosen.model_name
            elif telemetry.provenance:
                primary_provider = telemetry.provenance.get("provider")
                primary_model = telemetry.provenance.get("model")

        if not primary_model and telemetry.provenance:
            primary_model = telemetry.provenance.get("model")

        # 스팬 목록에서 llm 스팬의 provider 및 model_name 탐색.
        #
        # `metadata` 는 `SpanMetadata` **모델**이지 딕셔너리가 아니다. 예전에는
        # `.get()` 을 불러서 AttributeError 가 났고, 광범위한 except 가 그것을
        # 삼켜 **계측 전체가 조용히 사라졌다.** outline 파이프라인은 provenance 에
        # model 이 있어 이 분기에 닿지 않아 드러나지 않았을 뿐이다.
        if not primary_provider or not primary_model:
            for span in telemetry.spans:
                span_type = getattr(span, "span_type", "")
                if span_type != "llm" and "LLM" not in getattr(span, "name", ""):
                    continue
                span_meta = getattr(span, "metadata", None)
                if span_meta is None:
                    continue
                # 모델이든 딕셔너리든 같은 방식으로 읽는다.
                meta_map = (
                    span_meta if isinstance(span_meta, dict) else span_meta.model_dump(mode="json")
                )
                extra = meta_map.get("extra") or {}
                if not primary_provider:
                    candidate = meta_map.get("provider") or extra.get("provider")
                    if candidate and candidate != "unknown":
                        primary_provider = candidate
                if not primary_model:
                    candidate = meta_map.get("model_name") or extra.get("model")
                    if candidate and candidate != "unknown":
                        primary_model = candidate

        # 모델명 기반 폴백 공급자 판정
        if not primary_provider and primary_model:
            lowered = str(primary_model).lower()
            if "low" in lowered or "cli" in lowered or "agy" in lowered:
                primary_provider = "agy_cli"
            elif "local" in lowered or "gemma" in lowered:
                primary_provider = "local"
            else:
                primary_provider = "google_genai"

        return primary_provider, primary_model

    # --- 읽기 ----------------------------------------------------------

    def meta(self, run_id: str) -> dict[str, Any]:
        run_dir = self._existing_dir(run_id)
        if run_dir is None:
            return {}
        loaded = self._read_json(run_dir / META_FILE, run_id)
        return loaded if isinstance(loaded, dict) else {}

    def spans(self, run_id: str) -> list[dict[str, Any]]:
        spans, _ = self._read_ledger(run_id)
        if spans:
            return spans
        # 원장이 없던 시절의 run 은 요약 안에 스팬을 인라인으로 들고 있다.
        inline = self.meta(run_id).get("spans")
        return inline if isinstance(inline, list) else []

    def attempts(self, run_id: str) -> list[dict[str, Any]]:
        _, attempts = self._read_ledger(run_id)
        return attempts

    def snapshots(self, run_id: str) -> list[dict[str, Any]]:
        run_dir = self._existing_dir(run_id)
        if run_dir is None:
            return []
        raw = self._read_json(run_dir / SNAPSHOTS_FILE, run_id)
        if isinstance(raw, dict):
            # 옛 기록은 `{stage_name: payload}` 딕셔너리다.
            return [
                {"stage_id": name, "stage_name": name, "payload": payload}
                for name, payload in raw.items()
            ]
        return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []

    def has_span_detail(self, run_id: str) -> bool:
        run_dir = self._existing_dir(run_id)
        return run_dir is not None and (run_dir / LEDGER_FILE).is_file()

    def payload(self, run_id: str, digest: str) -> Optional[str]:
        run_dir = self._existing_dir(run_id)
        if run_dir is None:
            return None
        return read_payload(run_dir, digest)

    # --- 삭제 ----------------------------------------------------------

    def delete(self, run_id: str) -> bool:
        run_dir = self._existing_dir(run_id)
        if run_dir is None:
            return False
        try:
            shutil.rmtree(run_dir)
        except OSError as exc:
            logger.error("[RunObservation] run 삭제 실패 (%s): %s", run_id, exc)
            return False
        logger.info("[RunObservation] run 삭제 완료: %s", run_id)
        return True

    def delete_for_document(self, doc_id: str) -> int:
        """문서 삭제를 실행 기록까지 연쇄시킨다.

        **프롬프트에는 문서 본문이 실린다.** 그 본문은 `payloads/` 에 내용 해시로
        외부화되어 남는다. 원본만 지우고 실행 기록을 남기면 지운 문서의 내용이
        계속 디스크에 있다. 예전 트레이스 연쇄 삭제가 지키려던 것이 이것인데,
        트레이스 자체가 쓰이지 않게 된 뒤로 그 연쇄는 빈 디렉터리를 뒤지는
        no-op 이 되어 있었다.
        """
        if not doc_id:
            return 0
        removed = 0
        for run_id in self.list_run_ids():
            if self.meta(run_id).get("doc_id") != doc_id:
                continue
            if self.delete(run_id):
                removed += 1
        return removed

    # --- 파일 ----------------------------------------------------------

    def _read_ledger(self, run_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        run_dir = self._existing_dir(run_id)
        if run_dir is None:
            return [], []
        spans: list[dict[str, Any]] = []
        attempts: list[dict[str, Any]] = []
        for item in self._read_jsonl(run_dir / LEDGER_FILE):
            event_type = item.get("event_type")
            data = item.get("data")
            if event_type == "span" and isinstance(data, dict):
                spans.append(data)
            elif event_type == "attempt" and isinstance(data, dict):
                attempts.append(data)
            elif event_type is None:
                # 이벤트 봉투가 없던 시절의 줄은 그 자체가 스팬이다.
                spans.append(item)
        return spans, attempts

    @staticmethod
    def _read_json(path: Path, run_id: str) -> Any:
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("[RunObservation] %s 해석 실패 (%s): %s", path.name, run_id, exc)
            return None

    @staticmethod
    def _read_jsonl(path: Path) -> list[dict[str, Any]]:
        if not path.is_file():
            return []
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("[RunObservation] %s 를 읽지 못했습니다: %s", path.name, exc)
            return []
        rows: list[dict[str, Any]] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                rows.append(parsed)
        return rows

    # --- 원장(월별) ----------------------------------------------------

    @staticmethod
    def ledger_by_run(ledger_dir: Path) -> Mapping[str, dict[str, Any]]:
        """월별 비용 원장을 `run_id` 로 색인한다.

        **비용의 정본은 원장이다** (`observability.md` §2-2). 같은 run 이 여러 번
        기록됐으면 마지막 줄이 최종이다.
        """
        indexed: dict[str, dict[str, Any]] = {}
        if not ledger_dir.exists():
            return indexed
        for path in sorted(ledger_dir.glob("*.jsonl")):
            for row in RunObservationStore._read_jsonl(path):
                run_id = row.get("run_id")
                if isinstance(run_id, str) and run_id:
                    indexed[run_id] = row
        return indexed
