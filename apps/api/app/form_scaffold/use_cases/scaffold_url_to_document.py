"""유스케이스: 웹페이지 URL(블로그 · 칼럼 · 아티클)을 `.vdoc` 페이지 목록으로 변환한다."""
from __future__ import annotations

from typing import Any, Literal, Optional

from webpage_fidelity_engine import (
    AssetFetcherPort,
    BrowserDomPort,
    WebFetcherPort,
    WebpageExtractOptions,
    run_webpage_extraction,
)

from app.core.errors import ValidationError
from app.core.storage import DOCUMENT_PREFIX, new_id


class ScaffoldUrlToDocumentUseCase:
    """웹 URL -> 멀티페이지 .vdoc 스캐폴딩 실행 유스케이스."""

    def __init__(
        self,
        *,
        fetcher: Optional[WebFetcherPort] = None,
        asset_fetcher: Optional[AssetFetcherPort] = None,
        browser_dom: Optional[BrowserDomPort] = None,
    ) -> None:
        self._fetcher = fetcher
        self._asset_fetcher = asset_fetcher
        self._browser_dom = browser_dom

    def execute(
        self,
        *,
        url: str,
        title: str = "",
        split_mode: Literal["height", "heading", "single"] = "height",
        target_height_px: int = 1500,
        include_images: bool = True,
        use_browser_fallback: bool = True,
    ) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
        """URL 을 추출하여 (vdoc, metrics_dict, warnings) 를 반환한다."""
        clean_url = (url or "").strip()
        if not clean_url:
            raise ValidationError("웹 주소를 입력해 주세요.")

        clamped_height = max(480, min(4000, int(target_height_px or 1500)))
        opts = WebpageExtractOptions(
            target_height_px=clamped_height,
            split_mode=split_mode,
            include_images=include_images,
            inline_images=True,
            generate_thumbnails=True,
            use_browser_fallback=use_browser_fallback,
        )
        doc_id = new_id(DOCUMENT_PREFIX)
        try:
            res = run_webpage_extraction(
                clean_url,
                doc_id=doc_id,
                title=title,
                options=opts,
                fetcher=self._fetcher,
                asset_fetcher=self._asset_fetcher,
                browser_dom=self._browser_dom,
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        except Exception as exc:
            raise ValidationError(f"웹페이지 추출 오류: {exc}") from exc

        return res.document, res.metrics.to_dict(), res.warnings

