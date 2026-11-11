"""추출 품질 지표(원문 텍스트 보존 · 이미지 해석률 · 블록/페이지 수) 계산기."""
from __future__ import annotations

from typing import Any

from ..models import WebArticleIR, WebpageQualityMetrics


def compute_quality_metrics(
    article: WebArticleIR,
    document: dict[str, Any],
    *,
    image_total: int,
    image_resolved: int,
    image_failed: int,
) -> WebpageQualityMetrics:
    extracted_chars = sum(len((n.text or "").strip()) for n in article.nodes)
    pages = document.get("pages") or []
    block_count = sum(len(p.get("blocks") or []) for p in pages)
    slot_count = len(document.get("slots") or {})
    return WebpageQualityMetrics(
        profile_used=article.profile_name,
        raw_chars=article.raw_text_chars,
        extracted_chars=extracted_chars,
        node_count=len(article.nodes),
        block_count=block_count,
        slot_count=slot_count,
        page_count=len(pages),
        image_total=image_total,
        image_resolved=image_resolved,
        image_failed=image_failed,
    )

