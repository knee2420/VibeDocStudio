"""webpage-fidelity-engine: 도메인 중립 웹페이지/블로그/칼럼 추출, 페이지 분할 및 .vdoc 조립 엔진."""
from __future__ import annotations

from .extract import (
    CssRuleIndex,
    DomNode,
    extract_article_ir,
    extract_ir_from_browser_snapshot,
    extract_metadata,
    extract_node_style,
    isolate_article_root,
    parse_html_dom,
    parse_inline_style,
    refine_article_nodes,
    walk_dom_to_nodes,
)
from .fetch import (
    AssetResolver,
    CdpBrowserDomFetcher,
    HttpWebFetcher,
    HttpxAssetFetcher,
    decode_html_bytes,
    pick_image_url,
    validate_public_http_url,
)
from .layout import (
    MappedBlock,
    PaginatedPage,
    assemble_webpage_vdoc,
    make_slot,
    map_nodes_to_blocks,
    paginate_mapped_blocks,
    render_page_thumbnail_data_url,
    sanitize_slot_html,
)
from .models import (
    BrowserElementGeometry,
    BrowserLayoutSnapshot,
    BrowserScreenshotTile,
    MeasuredRect,
    PageSplitMode,
    TextInlineStyle,
    WebArticleIR,
    WebImage,
    WebLinkCard,
    WebNode,
    WebNodeKind,
    WebpageExtractionResult,
    WebpageExtractOptions,
    WebpageQualityMetrics,
    WebTableCell,
)
from .pipeline import run_webpage_extraction
from .ports import (
    AssetFetcherPort,
    BrowserDomPort,
    BrowserLayoutPort,
    WebFetcherPort,
    WebpageRefinerPort,
)
from .verify import (
    REGISTERED_BLOCK_KINDS,
    compute_quality_metrics,
    validate_vdoc_document,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    # models & ports
    "PageSplitMode",
    "WebNodeKind",
    "WebpageExtractOptions",
    "MeasuredRect",
    "TextInlineStyle",
    "WebImage",
    "WebTableCell",
    "WebLinkCard",
    "WebNode",
    "BrowserElementGeometry",
    "BrowserLayoutSnapshot",
    "BrowserScreenshotTile",
    "WebArticleIR",
    "WebpageQualityMetrics",
    "WebpageExtractionResult",
    "WebFetcherPort",
    "AssetFetcherPort",
    "BrowserDomPort",
    "BrowserLayoutPort",
    "WebpageRefinerPort",
    # pipeline
    "run_webpage_extraction",
    # fetch
    "validate_public_http_url",
    "decode_html_bytes",
    "HttpWebFetcher",
    "HttpxAssetFetcher",
    "AssetResolver",
    "pick_image_url",
    "CdpBrowserDomFetcher",
    # extract
    "DomNode",
    "parse_html_dom",
    "CssRuleIndex",
    "parse_inline_style",
    "extract_node_style",
    "extract_metadata",
    "isolate_article_root",
    "walk_dom_to_nodes",
    "refine_article_nodes",
    "extract_ir_from_browser_snapshot",
    "extract_article_ir",
    # layout
    "MappedBlock",
    "PaginatedPage",
    "sanitize_slot_html",
    "make_slot",
    "map_nodes_to_blocks",
    "paginate_mapped_blocks",
    "render_page_thumbnail_data_url",
    "assemble_webpage_vdoc",
    # verify
    "REGISTERED_BLOCK_KINDS",
    "validate_vdoc_document",
    "compute_quality_metrics",
]
