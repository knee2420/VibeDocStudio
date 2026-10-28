"""유스케이스: 등록된 카탈로그 서식 매니페스트 목록을 조회한다."""
from __future__ import annotations

from ..models import CatalogManifestRecord
from ..ports import CatalogRepositoryPort


class ListCatalogFormsUseCase:
    def __init__(self, repository: CatalogRepositoryPort) -> None:
        self._repository = repository

    def execute(self) -> list[CatalogManifestRecord]:
        return self._repository.list_manifests()

