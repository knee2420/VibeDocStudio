"""웹 URL 스크레이핑 및 아티클 프로바이더 어댑터."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.resources.models import ResourceItem, ResourceSector
from app.resources.ports import BaseResourceProvider


class WebArticleProvider(BaseResourceProvider):
    """웹 URL을 받아 아티클 ResourceItem으로 변환합니다."""

    def can_handle(self, source_type: str) -> bool:
        return source_type in ("web", "url")

    def ingest(self, target: str, custom_title: str | None = None) -> list[ResourceItem]:
        url = str(target).strip()
        parsed = urlparse(url)
        domain = parsed.netloc or "web"
        title = custom_title.strip() if custom_title else f"{domain} 아티클"

        res_id = f"web_{uuid.uuid4().hex[:10]}"
        now = int(datetime.now(timezone.utc).timestamp() * 1000)

        sector = ResourceSector(
            sector_id=f"sec_{uuid.uuid4().hex[:8]}",
            resource_id=res_id,
            title="웹 링크 원천",
            text_snippet=f"웹 원본 링크: {url}",
            label=domain,
        )

        item = ResourceItem(
            id=res_id,
            type="web",
            title=title,
            path_or_url=url,
            extension=".html",
            size_bytes=0,
            updated_at=now,
            is_checked=True,
            sectors=[sector],
            children=[],
        )
        return [item]

