"""단일 진입 파사드: 수집(fetch) → 격리·추출(extract) → 자산 해소(resolve) → 블록 매핑·분할(layout) → 검증(verify)."""
from __future__ import annotations

import uuid
from typing import Optional

from .extract.browser_layout_extractor import extract_ir_from_browser_snapshot
from .extract.site_profiles.registry import extract_article_ir
from .fetch.asset_resolver import AssetResolver, HttpxAssetFetcher
from .fetch.browser_fetcher import CdpBrowserDomFetcher
from .fetch.http_fetcher import (
    HttpWebFetcher,
    decode_html_bytes,
    validate_public_http_url,
)
from .layout.block_mapper import map_nodes_to_blocks
from .layout.paginator import paginate_mapped_blocks
from .layout.vdoc_assembler import assemble_webpage_vdoc
from .models import WebArticleIR, WebpageExtractionResult, WebpageExtractOptions
from .ports import (
    AssetFetcherPort,
    BrowserDomPort,
    BrowserLayoutPort,
    WebFetcherPort,
    WebpageRefinerPort,
)
from .verify.quality_metrics import compute_quality_metrics
from .verify.schema_validator import validate_vdoc_document


def _try_browser_extraction(
    resolved_url: str,
    *,
    opts: WebpageExtractOptions,
    browser_dom: Optional[BrowserDomPort | BrowserLayoutPort],
    allow_default_browser: bool,
) -> tuple[Optional[WebArticleIR], bool]:
    """브라우저 실측(`render_layout_snapshot`)을 우선 시도한다. `(article, attempted)` 반환."""
    dom_port = browser_dom
    if dom_port is None:
        if not allow_default_browser:
            return None, False
        dom_port = CdpBrowserDomFetcher(
            opts.cdp_http,
            auto_launch=opts.auto_launch_browser,
            allow_private_hosts=opts.allow_private_hosts,
        )

    snapshot_fn = getattr(dom_port, "render_layout_snapshot", None)
    if callable(snapshot_fn):
        snapshot = snapshot_fn(
            resolved_url,
            viewport_width=opts.browser_viewport_width,
            timeout_s=max(14.0, opts.fetch_timeout_s),
        )
        if snapshot and snapshot.elements:
            ir = extract_ir_from_browser_snapshot(snapshot, include_images=opts.include_images)
            if ir.nodes:
                return ir, True

    return None, True


def run_webpage_extraction(
    url: str = "",
    *,
    html: str | bytes = "",
    content_type: str = "",
    doc_id: str = "",
    title: str = "",
    options: Optional[WebpageExtractOptions] = None,
    fetcher: Optional[WebFetcherPort] = None,
    asset_fetcher: Optional[AssetFetcherPort] = None,
    browser_dom: Optional[BrowserDomPort | BrowserLayoutPort] = None,
    refiner: Optional[WebpageRefinerPort] = None,
) -> WebpageExtractionResult:
    """웹 URL(또는 HTML 원본)을 분석하여 페이지별 슬라이스된 `.vdoc` 문서를 반환한다."""
    opts = options or WebpageExtractOptions()
    resolved_url = (url or "").strip()
    article: Optional[WebArticleIR] = None
    browser_attempted = False

    if not html:
        if not resolved_url:
            raise ValueError("가져올 웹 주소(url) 또는 HTML 이 비어 있습니다.")

        # 1차 경로(방식 B): 브라우저 getBoundingClientRect + getComputedStyle 실측
        if opts.use_browser_fallback or browser_dom is not None:
            article, browser_attempted = _try_browser_extraction(
                resolved_url,
                opts=opts,
                browser_dom=browser_dom,
                allow_default_browser=(fetcher is None),
            )

        # 브라우저 실측이 비활성이거나 연결 실패한 경우 정적 HTTP + 휴리스틱(방식 A) 폴백
        if article is None:
            active_fetcher = fetcher or HttpWebFetcher(allow_private_hosts=opts.allow_private_hosts)
            raw_bytes, fetched_ct, final_url = active_fetcher.fetch(resolved_url, timeout_s=opts.fetch_timeout_s)
            resolved_url = final_url or resolved_url
            html_text = decode_html_bytes(raw_bytes, fetched_ct or content_type)
            article = extract_article_ir(html_text, url=resolved_url, include_images=opts.include_images)

            # SPA / JS 렌더링 페이지여서 정적 HTML 본문이 거의 없을 때 render_dom() 재시도
            extracted_text_len = sum(len((n.text or "").strip()) for n in article.nodes)
            if (
                (opts.use_browser_fallback or browser_dom is not None)
                and extracted_text_len < 120
                and len(article.nodes) <= 2
            ):
                dom_port = browser_dom or (
                    CdpBrowserDomFetcher(
                        opts.cdp_http,
                        auto_launch=opts.auto_launch_browser,
                        allow_private_hosts=opts.allow_private_hosts,
                    )
                    if fetcher is None
                    else None
                )
                render_dom_fn = getattr(dom_port, "render_dom", None) if dom_port is not None else None
                if callable(render_dom_fn):
                    rendered = render_dom_fn(resolved_url, timeout_s=max(10.0, opts.fetch_timeout_s))
                    if rendered and rendered[0]:
                        rendered_html, rendered_url = rendered
                        article = extract_article_ir(
                            rendered_html,
                            url=rendered_url or resolved_url,
                            include_images=opts.include_images,
                        )

            if browser_attempted:
                article.warnings.append("브라우저 실측 연결이 가능하지 않아 정적 구조 휴리스틱으로 추출했습니다.")
    else:
        if resolved_url:
            validate_public_http_url(resolved_url, allow_private_hosts=True)
        html_text = decode_html_bytes(html, content_type) if isinstance(html, bytes) else html
        article = extract_article_ir(html_text, url=resolved_url, include_images=opts.include_images)

    if not article.nodes:
        raise ValueError("해당 웹페이지에서 추출할 본문 블록을 찾지 못했습니다.")

    active_asset_fetcher: Optional[AssetFetcherPort] = None
    if opts.include_images and opts.inline_images:
        active_asset_fetcher = asset_fetcher or HttpxAssetFetcher(allow_private_hosts=opts.allow_private_hosts)

    resolver = AssetResolver(active_asset_fetcher)
    img_total, img_resolved, img_failed = resolver.resolve_article_images(
        article,
        inline_images=opts.inline_images,
        max_images=opts.max_images,
        max_bytes=opts.max_image_bytes,
        max_dim=opts.max_image_dim,
    )
    if img_failed > 0:
        article.warnings.append(f"일부 이미지({img_failed}건)를 불러오지 못해 제외하거나 원격 주소로 남겼습니다.")

    mapped_blocks = map_nodes_to_blocks(
        article,
        target_width_px=opts.target_width_px,
        target_height_px=opts.target_height_px,
        inline_images=opts.inline_images,
    )
    if not mapped_blocks:
        raise ValueError("추출된 본문을 편집 가능한 블록으로 변환하지 못했습니다.")

    doc_title = (title or "").strip() or article.title or "웹 문서"
    paginated = paginate_mapped_blocks(
        mapped_blocks,
        doc_title=doc_title,
        target_height_px=opts.target_height_px,
        split_mode=opts.split_mode,
    )

    resolved_doc_id = (doc_id or "").strip() or f"vdoc-{uuid.uuid4().hex[:10]}"
    document = assemble_webpage_vdoc(
        doc_id=resolved_doc_id,
        article=article,
        paginated_pages=paginated,
        options=opts,
        title_override=doc_title,
    )

    if refiner is not None:
        document = refiner.refine_document(document, article)

    schema_errors = validate_vdoc_document(document)
    if schema_errors:
        raise ValueError("생성된 문서 스키마 검증 실패: " + "; ".join(schema_errors[:3]))

    metrics = compute_quality_metrics(
        article,
        document,
        image_total=img_total,
        image_resolved=img_resolved,
        image_failed=img_failed,
    )
    return WebpageExtractionResult(
        document=document,
        article=article,
        metrics=metrics,
        warnings=list(article.warnings),
    )
