"""로컬 파일 및 디렉토리 스캔 프로바이더 어댑터."""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from ..models import ResourceItem, ResourceSector
from ..ports import ResourceProvider

# 지원 및 텍스트 파싱 가능한 확장자
SUPPORTED_EXTENSIONS = {
    ".pdf", ".md", ".txt", ".json", ".csv", ".yaml", ".yml",
    ".png", ".jpg", ".jpeg", ".webp", ".svg",
    ".ts", ".tsx", ".js", ".jsx", ".py", ".html"
}


class FileDirectoryProvider(ResourceProvider):
    """로컬 파일 디렉토리를 재귀 스캔하여 계층형 ResourceItem 트리로 변환합니다."""

    def can_handle(self, source_type: str) -> bool:
        return source_type in ("file", "directory")

    def ingest(self, target: str | Path) -> list[ResourceItem]:
        root_path = Path(target).resolve()
        if not root_path.exists():
            return []

        if root_path.is_file():
            item = self._file_to_resource(root_path)
            return [item] if item else []

        # 디렉토리인 경우
        tree = self._scan_directory(root_path)
        return [tree] if tree else []

    def _scan_directory(self, dir_path: Path) -> ResourceItem | None:
        children: list[ResourceItem] = []
        try:
            entries = sorted(os.scandir(dir_path), key=lambda e: (not e.is_dir(), e.name.lower()))
        except PermissionError:
            return None

        for entry in entries:
            # 숨김 폴더나 노이즈 제외
            if entry.name.startswith((".", "__")) or entry.name in ("node_modules", "dist", ".git"):
                continue

            sub_path = Path(entry.path)
            if entry.is_dir():
                sub_dir = self._scan_directory(sub_path)
                if sub_dir:
                    children.append(sub_dir)
            elif entry.is_file():
                ext = sub_path.suffix.lower()
                if ext in SUPPORTED_EXTENSIONS or not ext:
                    file_item = self._file_to_resource(sub_path)
                    if file_item:
                        children.append(file_item)

        stat = dir_path.stat()
        return ResourceItem(
            id=f"dir_{uuid.uuid4().hex[:10]}",
            type="file",
            title=dir_path.name,
            path_or_url=str(dir_path),
            size_bytes=0,
            updated_at=int(stat.st_mtime * 1000),
            is_checked=True,
            sectors=[],
            children=children,
        )

    def _file_to_resource(self, file_path: Path) -> ResourceItem | None:
        try:
            stat = file_path.stat()
        except Exception:
            return None

        ext = file_path.suffix.lower()
        res_id = f"file_{uuid.uuid4().hex[:10]}"
        sectors: list[ResourceSector] = []

        # 텍스트 스니펫 미리보기 생성 (간단히 앞 500자)
        snippet = ""
        if ext in (".md", ".txt", ".json", ".csv", ".py", ".ts", ".tsx", ".yaml", ".yml"):
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    snippet = f.read(500).strip()
            except Exception:
                snippet = ""
        elif ext == ".pdf":
            snippet = f"PDF 문서: {file_path.name}"

        if snippet:
            sectors.append(ResourceSector(
                sector_id=f"sec_{uuid.uuid4().hex[:8]}",
                resource_id=res_id,
                title="개요 스니펫",
                text_snippet=snippet,
                page=1 if ext == ".pdf" else None,
            ))

        return ResourceItem(
            id=res_id,
            type="file",
            title=file_path.name,
            path_or_url=str(file_path),
            extension=ext,
            size_bytes=stat.st_size,
            updated_at=int(stat.st_mtime * 1000),
            is_checked=True,
            sectors=sectors,
            children=[],
        )

