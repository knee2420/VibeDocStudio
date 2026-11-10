"""RM 원장 유스케이스 — 자료 추가 · 재스캔 · 연결 해제 · 체크(Choice) · 발췌 섹터 · AI 맥락 묶음 · 원문 열람.

원장은 Resource(사실 근거)의 유일한 장부다. 프론트의 RM 패널 · Composer 리소스 칸 · AI 작업 공간
마운트가 모두 이 원장의 체크 상태를 읽는다.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Iterable

from app.core.errors import NotFoundError, ValidationError
from app.core.storage.ids import safe_segment

from ..models import ResourceItem, ResourceSector, ResourceSession
from ..ports import LedgerRepository, ResourceProvider

#: AI 맥락 묶음에 리소스 하나당 넣는 발췌 수
_SNIPPETS_PER_SOURCE = 5


# --- 트리 도우미 ---------------------------------------------------------------------------------

def find_item(items: list[ResourceItem], target_id: str) -> ResourceItem | None:
    for item in items:
        if item.id == target_id:
            return item
        if item.children:
            found = find_item(item.children, target_id)
            if found:
                return found
    return None


def _set_checked(item: ResourceItem, is_checked: bool) -> None:
    item.is_checked = is_checked
    for child in item.children:
        _set_checked(child, is_checked)


def checked_leaves(items: list[ResourceItem]) -> list[ResourceItem]:
    result: list[ResourceItem] = []
    for item in items:
        if item.is_checked:
            if not item.children:
                result.append(item)
            else:
                result.extend(checked_leaves(item.children))
    return result


def _remove_item(items: list[ResourceItem], target_id: str) -> bool:
    for i, item in enumerate(items):
        if item.id == target_id:
            items.pop(i)
            return True
        if item.children and _remove_item(item.children, target_id):
            return True
    return False


def _walk(items: Iterable[ResourceItem]) -> Iterable[ResourceItem]:
    for item in items:
        yield item
        yield from _walk(item.children)


def _state_map(items: list[ResourceItem]) -> dict[str, tuple[bool, list[ResourceSector]]]:
    """재스캔 전 체크 상태 · 섹터를 경로와 id 로 기억한다."""
    state: dict[str, tuple[bool, list[ResourceSector]]] = {}
    for node in _walk(items):
        state[node.path_or_url or node.id] = (node.is_checked, node.sectors)
        state[node.id] = (node.is_checked, node.sectors)
    return state


def _restore_state(items: list[ResourceItem], state: dict[str, tuple[bool, list[ResourceSector]]]) -> None:
    for node in _walk(items):
        key = node.path_or_url or node.id
        if key in state:
            node.is_checked, node.sectors = state[key]
        elif node.id in state:
            node.is_checked, node.sectors = state[node.id]


def _prepend_replacing_same_path(session: ResourceSession, new_items: list[ResourceItem]) -> None:
    existing_paths = {it.path_or_url for it in session.items if it.path_or_url}
    for item in new_items:
        if item.path_or_url and item.path_or_url in existing_paths:
            session.items = [it for it in session.items if it.path_or_url != item.path_or_url]
        session.items.insert(0, item)


# --- 유스케이스 ---------------------------------------------------------------------------------------

class ResourceLedgerService:
    def __init__(
        self,
        *,
        repository: LedgerRepository,
        files: ResourceProvider,
        web: ResourceProvider,
        uploads_root: Path,
    ) -> None:
        self._repo = repository
        self._files = files
        self._web = web
        self._uploads_root = uploads_root

    def session(self, project_id: str) -> ResourceSession:
        return self._repo.get_session(project_id)

    def ingest_directory(self, project_id: str, directory_path: str) -> ResourceSession:
        new_items = self._files.ingest(directory_path)
        if not new_items:
            raise ValidationError("디렉토리를 찾을 수 없거나 접근할 수 없습니다.")
        session = self._repo.get_session(project_id)
        _prepend_replacing_same_path(session, new_items)
        self._repo.save_session(session)
        return session

    def upload_file(self, project_id: str, filename: str | None, content: bytes) -> ResourceSession:
        upload_dir = self._uploads_root / safe_segment(project_id)
        upload_dir.mkdir(parents=True, exist_ok=True)
        # 브라우저가 보낸 이름에서 폴더 부분은 버린다 (업로드 폴더 밖에 쓰지 않게)
        name = Path((filename or "").replace("\\", "/")).name.strip()
        if not name or name in {".", ".."}:
            name = f"upload_{uuid.uuid4().hex[:8]}"
        file_path = upload_dir / name
        file_path.write_bytes(content)

        new_items = self._files.ingest(str(file_path))
        if not new_items:
            raise ValidationError("파일을 파싱하거나 추가할 수 없습니다.")
        session = self._repo.get_session(project_id)
        _prepend_replacing_same_path(session, new_items)
        self._repo.save_session(session)
        return session

    def ingest_url(self, project_id: str, url: str, title: str | None) -> ResourceSession:
        new_items = self._web.ingest(url, title)
        session = self._repo.get_session(project_id)
        for item in new_items:
            session.items.insert(0, item)
        self._repo.save_session(session)
        return session

    def rescan(self, project_id: str) -> ResourceSession:
        """등록된 로컬 디렉터리를 다시 읽어 파일 구조를 맞춘다 (체크 · 섹터 상태 보존)."""
        session = self._repo.get_session(project_id)
        state = _state_map(session.items)
        rescanned: list[ResourceItem] = []
        for item in session.items:
            if item.type == "file" and item.children is not None and item.path_or_url:
                p = Path(item.path_or_url)
                if p.exists() and p.is_dir():
                    fresh = self._files.ingest(str(p))
                    if fresh:
                        _restore_state(fresh, state)
                        rescanned.extend(fresh)
                        continue
            # 웹 소스 · 단일 파일 · 재스캔 실패는 그대로 둔다
            rescanned.append(item)
        session.items = rescanned
        self._repo.save_session(session)
        return session

    def decouple(self, project_id: str, item_id: str) -> ResourceSession:
        """원장에서 연결만 끊는다. 로컬 원본 파일은 지우지 않는다."""
        session = self._repo.get_session(project_id)
        if not _remove_item(session.items, item_id):
            raise NotFoundError("연결 해제할 리소스를 찾을 수 없습니다.")
        if session.active_resource_id == item_id:
            session.active_resource_id = session.items[0].id if session.items else None
        self._repo.save_session(session)
        return session

    def batch_decouple(self, project_id: str, item_ids: list[str]) -> ResourceSession:
        session = self._repo.get_session(project_id)
        removed_any = False
        for target_id in item_ids:
            if _remove_item(session.items, target_id):
                removed_any = True
        if not removed_any:
            raise NotFoundError("연결 해제할 리소스 항목을 찾지 못했습니다.")
        if session.active_resource_id in item_ids:
            session.active_resource_id = session.items[0].id if session.items else None
        self._repo.save_session(session)
        return session

    def toggle_choice(self, project_id: str, item_id: str, is_checked: bool, cascade: bool) -> ResourceSession:
        """체크(Choice) 상태를 바꾼다 — 원장의 체크를 바꾸는 유일한 길. `cascade` 면 하위 전체."""
        session = self._repo.get_session(project_id)
        target = find_item(session.items, item_id)
        if not target:
            raise NotFoundError("해당 리소스를 찾을 수 없습니다.")
        if cascade:
            _set_checked(target, is_checked)
        else:
            target.is_checked = is_checked
        self._repo.save_session(session)
        return session

    def add_sector(
        self,
        project_id: str,
        *,
        resource_id: str,
        text_snippet: str,
        title: str = "",
        page: int | None = None,
        bbox: list[int] | None = None,
        label: str = "",
    ) -> ResourceSector:
        """원문에서 발라낸 영역(BBox) · 텍스트를 카드(섹터)로 남긴다."""
        session = self._repo.get_session(project_id)
        target = find_item(session.items, resource_id)
        if not target:
            raise NotFoundError("해당 리소스를 찾을 수 없습니다.")
        sector = ResourceSector(
            sector_id=f"sec_{uuid.uuid4().hex[:8]}",
            resource_id=resource_id,
            title=title or "발췌 섹터",
            page=page,
            bbox=bbox,
            text_snippet=text_snippet,
            label=label,
        )
        target.sectors.insert(0, sector)
        self._repo.save_session(session)
        return sector

    def ai_context(self, project_id: str) -> dict[str, Any]:
        """체크된 리소스의 발췌 묶음 (Composer 용)."""
        session = self._repo.get_session(project_id)
        sources = [
            {
                "id": it.id,
                "title": it.title,
                "type": it.type,
                "snippets": [s.text_snippet for s in it.sectors if s.text_snippet][:_SNIPPETS_PER_SOURCE],
            }
            for it in checked_leaves(session.items)
        ]
        return {"totalSources": len(sources), "sources": sources}

    def raw_file(self, path: str) -> Path:
        """원장에 등록된 로컬 파일(또는 등록된 폴더 아래 파일)만 연다 — 임의 경로 읽기를 막는다."""
        target = Path(path)
        if not target.exists() or not target.is_file():
            raise NotFoundError("파일을 찾을 수 없습니다.")
        resolved = target.resolve()
        for session in self._repo.iter_sessions():
            for item in _walk(session.items):
                if item.type == "web" or not item.path_or_url:
                    continue
                registered = Path(item.path_or_url).resolve()
                if resolved == registered or (item.children and registered in resolved.parents):
                    return target
        uploads = self._uploads_root.resolve()
        if uploads in resolved.parents:
            return target
        raise NotFoundError("파일을 찾을 수 없습니다.")
