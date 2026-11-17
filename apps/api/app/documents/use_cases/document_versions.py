"""유스케이스: 문서 버전 — 그 시점 문서 전체를 보관해 두고 언제든 그 상태로 되돌린다 (git 커밋처럼).

- named: 사람이 이름 · 메모를 붙여 남긴 버전 (제출본 · 검토 요청본).
- auto: 자동 보관 지점 — 한동안 쉬었다가 다시 고치기 직전 상태, 버전으로 되돌리기 직전 상태.
  자동 보관은 오래된 것부터 지워 개수를 넘지 않게 한다 (이름 붙인 버전은 지우지 않는다).
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional

from app.core.clock import utc_now_iso
from app.core.errors import ValidationError
from app.core.storage import safe_segment
from app.core.storage.ids import new_id

from ..errors import VDocDocumentNotFoundError
from ..ports import VDocDocumentRepositoryPort

VERSION_PREFIX = "ver"
#: 버전 종류 (블록 kind 와 다른 축이라 상수로 둔다).
NAMED = "named"
AUTO = "auto"
#: 마지막 보관 뒤 이만큼 쉬었다가 다시 고치면 고치기 직전 상태를 자동 보관한다.
AUTO_CHECKPOINT_GAP_SECONDS = 30 * 60
#: 자동 보관 지점 최대 개수 (넘으면 오래된 것부터 지운다).
MAX_AUTO_VERSIONS = 40


def _parse(at: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(at).replace("Z", "+00:00"))
    except ValueError:
        return None


def _text_chars(payload: dict[str, Any]) -> int:
    """대략의 분량 (글자 수, 태그 · 공백 제외) — 목록에서 버전 크기를 가늠하게."""
    total = 0
    for slot in (payload.get("slots") or {}).values():
        if isinstance(slot, dict):
            text = re.sub(r"<[^>]+>", "", str(slot.get("content", "")))
            total += len(re.sub(r"\s+", "", text))
    return total


def make_entry(payload: dict[str, Any], *, kind: str, name: str, note: str = "", reason: str = "", now: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": new_id(VERSION_PREFIX),
        "kind": kind,
        "name": name,
        "note": note,
        "reason": reason,
        "rev": int(payload.get("revision") or 0),
        "at": now or utc_now_iso(),
        "pageCount": len(payload.get("pages") or []),
        "blockCount": sum(len(p.get("blocks") or []) for p in (payload.get("pages") or []) if isinstance(p, dict)),
        "chars": _text_chars(payload),
    }


class DocumentVersionsUseCase:
    def __init__(self, repository: VDocDocumentRepositoryPort) -> None:
        self._repository = repository

    def list(self, doc_id: str) -> list[dict[str, Any]]:
        """최신이 앞."""
        return list(reversed(self._repository.list_versions(safe_segment(doc_id))))

    def create(self, doc_id: str, *, name: str = "", note: str = "", kind: str = NAMED, reason: str = "") -> dict[str, Any]:
        """지금 서버에 저장된 문서 전체를 버전으로 보관한다."""
        if kind not in {NAMED, AUTO}:
            raise ValidationError(f"Unknown version kind: {kind}")
        doc = safe_segment(doc_id)
        payload = self._repository.get(doc).payload
        entry = make_entry(payload, kind=kind, name=name.strip() or ("자동 보관" if kind == AUTO else "이름 없는 버전"), note=note.strip(), reason=reason)
        self._repository.add_version(doc, entry, payload)
        if kind == AUTO:
            self._prune(doc)
        return entry

    def get(self, doc_id: str, version_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        doc = safe_segment(doc_id)
        entry = next((v for v in self._repository.list_versions(doc) if v.get("id") == version_id), None)
        payload = self._repository.get_version_payload(doc, version_id) if entry else None
        if entry is None or payload is None:
            raise VDocDocumentNotFoundError(f"Version not found: {doc_id}/{version_id}")
        return entry, payload

    def update(self, doc_id: str, version_id: str, *, name: Optional[str] = None, note: Optional[str] = None) -> dict[str, Any]:
        patch: dict[str, Any] = {}
        if name is not None and name.strip():
            patch["name"] = name.strip()
            patch["kind"] = NAMED  # 자동 보관에 이름을 붙이면 지워지지 않는 버전이 된다
        if note is not None:
            patch["note"] = note.strip()
        hit = self._repository.update_version(safe_segment(doc_id), version_id, patch)
        if hit is None:
            raise VDocDocumentNotFoundError(f"Version not found: {doc_id}/{version_id}")
        return hit

    def delete(self, doc_id: str, version_id: str) -> None:
        if not self._repository.delete_version(safe_segment(doc_id), version_id):
            raise VDocDocumentNotFoundError(f"Version not found: {doc_id}/{version_id}")

    # --- 자동 보관 ----------------------------------------------------------

    def checkpoint_before_edit(self, doc_id: str, before: dict[str, Any], now: str) -> Optional[dict[str, Any]]:
        """글이 바뀌는 저장 직전에 부른다: 마지막 보관이 오래됐으면 고치기 전 상태를 자동 보관한다."""
        versions = self._repository.list_versions(doc_id)
        last = _parse(versions[-1]["at"]) if versions else None
        current = _parse(now)
        if last and current and (current - last).total_seconds() < AUTO_CHECKPOINT_GAP_SECONDS:
            return None
        entry = make_entry(before, kind=AUTO, name="자동 보관", reason="편집 시작 전", now=now)
        self._repository.add_version(doc_id, entry, before)
        self._prune(doc_id)
        return entry

    def _prune(self, doc_id: str) -> None:
        autos = [v for v in self._repository.list_versions(doc_id) if v.get("kind") == AUTO]
        for v in autos[: max(0, len(autos) - MAX_AUTO_VERSIONS)]:
            self._repository.delete_version(doc_id, v["id"])
