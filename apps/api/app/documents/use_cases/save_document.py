"""유스케이스: `.vdoc` 작업 문서를 저장한다 — 버전 확인(낙관적 잠금) + 개정 이력 기록."""
from __future__ import annotations

from typing import Any, Iterable, Optional

from app.core.clock import utc_now_iso
from app.core.storage import safe_segment

from ..errors import VDocRevisionConflictError
from ..models import VDocAggregateRecord
from ..ports import VDocDocumentRepositoryPort
from ..revisions import build_revision_entry, coalesce


class SaveDocumentUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(
        self,
        doc_id: str,
        document: dict[str, Any],
        *,
        base_revision: Optional[int] = None,
        changes: Iterable[dict[str, Any]] = (),
    ) -> VDocAggregateRecord:
        normalized_id = safe_segment(doc_id)
        now = utc_now_iso()
        notes = list(changes)
        if not self._repository.exists(normalized_id):
            payload = {**document, "docId": normalized_id, "revision": 1}
            return self._repository.save(VDocAggregateRecord(doc_id=normalized_id, payload=payload).with_payload(payload, now=now))

        holder: dict[str, Any] = {}

        def mutate(current: VDocAggregateRecord) -> VDocAggregateRecord:
            current_rev = int(current.payload.get("revision") or 0)
            if base_revision is not None and base_revision != current_rev:
                raise VDocRevisionConflictError(
                    f"문서가 다른 곳에서 먼저 저장되었습니다 (서버 버전 {current_rev}, 보낸 기준 {base_revision}). "
                    "새로 불러온 뒤 다시 적용하세요."
                )
            payload = {**document, "docId": normalized_id, "revision": current_rev + 1}
            holder["entry"] = build_revision_entry(current.payload, payload, notes, rev=current_rev + 1, now=now)
            return current.with_payload(payload, now=now)

        updated = self._repository.update(normalized_id, mutate)
        entry = holder.get("entry")
        if entry:
            last = (self._repository.list_revisions(normalized_id, limit=1) or [None])[0]
            merged = coalesce(last, entry)
            if merged:
                self._repository.replace_last_revision(normalized_id, merged)
            else:
                self._repository.append_revision(normalized_id, entry)
        return updated


class ListRevisionsUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def execute(self, doc_id: str, *, slot_id: Optional[str] = None, limit: int = 100) -> list[dict[str, Any]]:
        entries = self._repository.list_revisions(safe_segment(doc_id), limit=2000 if slot_id else limit)
        if not slot_id:
            return entries[:limit]
        out = []
        for entry in entries:
            slots = [c for c in entry.get("slots", []) if c.get("slotId") == slot_id]
            if slots:
                out.append({**entry, "slots": slots})
            if len(out) >= limit:
                break
        return out
