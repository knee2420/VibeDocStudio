"""실행 이력·승인·원장의 로컬 파일 구현.

디렉터리 규격:

    data/runs/{run_id}/events.jsonl     이력 (정본, append-only)
    data/runs/{run_id}/snapshot.json    폴드 결과 (읽기 최적화, 재생성 가능)
    data/runs/{run_id}/input.json       재개용 입력 스냅샷
    data/agreements/{agreement_id}.json 사람의 결정
    data/ledger/{YYYY-MM}.jsonl         토큰·비용 원장
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

from .events import AgentRunEvent, fold
from .models import AgentRun, AgentRunInput, Agreement, LedgerEntry
from .utils import (
    append_jsonl,
    read_json,
    read_jsonl,
    safe_segment,
    write_json,
)

logger = logging.getLogger(__name__)

EVENTS_FILE = "events.jsonl"
SNAPSHOT_FILE = "snapshot.json"
INPUT_FILE = "input.json"


class LocalAgentRunRepository:
    """이력을 정본으로 두고 스냅샷은 파생으로 유지한다."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir

    def _run_dir(self, run_id: str) -> Path:
        return self._base_dir / safe_segment(run_id)

    def append(self, run_id: str, event: AgentRunEvent) -> AgentRun:
        """이력에 한 줄 덧붙이고 갱신된 상태를 돌려준다."""
        run_dir = self._run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        append_jsonl(run_dir / EVENTS_FILE, event.model_dump(mode="json"))

        run = fold(run_id, self._read_events(run_dir))
        if run is None:  # 방금 썼으므로 정상 경로에서는 도달하지 않는다.
            raise RuntimeError(f"Run history vanished right after append: {run_id}")
        try:
            write_json(run_dir / SNAPSHOT_FILE, run.model_dump(mode="json"))
        except OSError as exc:
            logger.warning("[AgentRuns] 스냅샷 기록 일시 실패(이력에서 복원 가능, 무해함) %s: %s", run_id, exc)
        return run

    def get(self, run_id: str) -> AgentRun | None:
        run_dir = self._run_dir(run_id)
        snapshot = read_json(run_dir / SNAPSHOT_FILE)
        if snapshot:
            try:
                return AgentRun.model_validate(snapshot)
            except ValueError:
                logger.warning("[AgentRuns] 손상된 스냅샷을 이력에서 복원합니다: %s", run_id)
        # 스냅샷은 파생이다. 없거나 깨졌으면 이력에서 다시 만든다.
        return fold(run_id, self._read_events(run_dir))

    def save_input(self, run_id: str, payload: AgentRunInput) -> None:
        run_dir = self._run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        write_json(run_dir / INPUT_FILE, payload.model_dump(mode="json"))

    def get_input(self, run_id: str) -> AgentRunInput | None:
        raw = read_json(self._run_dir(run_id) / INPUT_FILE)
        if not raw:
            return None
        try:
            return AgentRunInput.model_validate(raw)
        except ValueError:
            return None

    def list_unfinished(self) -> list[AgentRun]:
        """종료되지 않은 실행. 부팅 시 고아 정리의 입력이다."""
        if not self._base_dir.exists():
            return []
        unfinished: list[AgentRun] = []
        for run_dir in self._base_dir.iterdir():
            if not run_dir.is_dir():
                continue
            run = self.get(run_dir.name)
            if run and not run.is_terminal:
                unfinished.append(run)
        return unfinished

    @staticmethod
    def _read_events(run_dir: Path) -> Iterator[AgentRunEvent]:
        for raw in read_jsonl(run_dir / EVENTS_FILE):
            try:
                yield AgentRunEvent.model_validate(raw)
            except ValueError:
                logger.warning("[AgentRuns] 해석할 수 없는 이력 줄을 건너뜁니다 (%s)", run_dir.name)


class LocalAgreementRepository:
    """사람의 결정을 파일로 남긴다. 발급 내용은 결정 시각 외에는 바뀌지 않는다."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir

    def _file(self, agreement_id: str) -> Path:
        return self._base_dir / f"{safe_segment(agreement_id)}.json"

    def create(self, agreement: Agreement) -> Agreement:
        self._base_dir.mkdir(parents=True, exist_ok=True)
        write_json(self._file(agreement.agreement_id), agreement.model_dump(mode="json"))
        return agreement

    def get(self, agreement_id: str) -> Agreement | None:
        raw = read_json(self._file(agreement_id))
        if not raw:
            return None
        try:
            return Agreement.model_validate(raw)
        except ValueError:
            return None

    def decide(self, agreement_id: str, approved: bool) -> Agreement | None:
        agreement = self.get(agreement_id)
        if agreement is None:
            return None
        if agreement.status != "pending":
            # 이미 내려진 결정은 다시 쓰지 않는다. 결정 기록은 불변이다.
            return agreement
        agreement.status = "approved" if approved else "declined"
        agreement.decided_at = datetime.now(timezone.utc)
        write_json(self._file(agreement_id), agreement.model_dump(mode="json"))
        return agreement

    def list_pending(self) -> list[Agreement]:
        if not self._base_dir.exists():
            return []
        pending: list[Agreement] = []
        for path in sorted(self._base_dir.glob("*.json")):
            agreement = self.get(path.stem)
            if agreement and agreement.status == "pending":
                pending.append(agreement)
        return pending


class LocalLedger:
    """월 단위 원장 파일. 덧붙이기만 하고 수정하지 않는다."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir

    def _file_for(self, moment: datetime) -> Path:
        return self._base_dir / f"{moment.strftime('%Y-%m')}.jsonl"

    def record(self, entry: LedgerEntry) -> None:
        try:
            append_jsonl(self._file_for(entry.recorded_at), entry.model_dump(mode="json"))
        except OSError as exc:
            # 원장 기록 실패가 본 작업을 막지는 않는다. 다만 조용히 넘기지도 않는다.
            logger.warning("[Ledger] 원장 기록 실패: %s", exc)

    def entries(self, limit: int = 200) -> Iterable[LedgerEntry]:
        if not self._base_dir.exists():
            return []
        collected: list[LedgerEntry] = []
        for path in sorted(self._base_dir.glob("*.jsonl"), reverse=True):
            for raw in read_jsonl(path):
                try:
                    collected.append(LedgerEntry.model_validate(raw))
                except ValueError:
                    continue
            if len(collected) >= limit:
                break
        collected.sort(key=lambda item: item.recorded_at, reverse=True)
        return collected[:limit]
