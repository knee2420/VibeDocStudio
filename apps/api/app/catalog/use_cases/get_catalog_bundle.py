"""유스케이스: 단일 카탈로그 번들(매니페스트 + `.vdoc` 문서)을 조회한다."""
from __future__ import annotations

from app.core.storage import safe_segment

from ..models import CatalogFormBundleRecord
from ..ports import CatalogRepositoryPort


class GetCatalogBundleUseCase:
    def __init__(self, repository: CatalogRepositoryPort) -> None:
        self._repository = repository

    def execute(self, catalog_id: str) -> CatalogFormBundleRecord:
        normalized_id = safe_segment(catalog_id)
        return self._repository.get_bundle(normalized_id)

