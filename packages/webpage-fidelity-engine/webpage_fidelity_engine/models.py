"""webpage-fidelity-engine 데이터 모델 (중간 IR · 옵션 · 메트릭 · 결과 번들)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

PageSplitMode = Literal["height", "heading", "single"]
WebNodeKind = Literal[
    "heading",
    "paragraph",
    "list",
    "quote",
    "code",
    "table",
    "image",
    "image_strip",
    "link_card",
    "divider",
]


@dataclass(frozen=True)
class WebpageExtractOptions:
    """웹페이지 추출 및 페이지 분할 옵션."""

    target_width_px: int = 794
    target_height_px: int = 1123
    split_mode: PageSplitMode = "height"
    include_images: bool = True
    inline_images: bool = True
    max_images: int = 60
    max_image_bytes: int = 3 * 1024 * 1024
    max_image_dim: int = 1200
    fetch_timeout_s: float = 12.0
    generate_thumbnails: bool = True
    use_browser_fallback: bool = True
    auto_launch_browser: bool = True
    browser_viewport_width: int = 1280
    cdp_http: str = "http://127.0.0.1:9222"
    allow_private_hosts: bool = False


@dataclass(frozen=True)
class MeasuredRect:
    """브라우저 `getBoundingClientRect()` 기준 요소 좌표 및 크기(px)."""

    x: float
    y: float
    width: float
    height: float


@dataclass
class TextInlineStyle:
    """CSS에서 추출한 Tiptap/VDoc 호환 스타일."""

    align: Optional[Literal["left", "center", "right", "justify"]] = None
    font_size_px: Optional[float] = None
    font_weight: Optional[str] = None
    color: Optional[str] = None
    bg_color: Optional[str] = None
    line_height: Optional[str] = None
    has_bottom_rule: bool = False
    has_left_border: bool = False
    has_box_border: bool = False
    border_color: Optional[str] = None
    underline_rule: bool = False


@dataclass
class WebImage:
    """추출된 이미지 메타 및 해소된 소스."""

    src: str
    resolved_src: str = ""
    alt: str = ""
    caption: str = ""
    width_px: int = 0
    height_px: int = 0
    image_bytes: Optional[bytes] = None
    mime_type: str = ""
    render_width_px: float = 0.0
    render_height_px: float = 0.0
    rect: Optional[MeasuredRect] = None


@dataclass
class WebTableCell:
    """표 셀 단위 데이터."""

    text: str
    html: str
    is_header: bool = False
    col_span: int = 1
    row_span: int = 1
    align: Literal["left", "center", "right"] = "left"


@dataclass
class WebLinkCard:
    """OG 링크 카드 / 북마크 카드 정보."""

    url: str
    title: str
    description: str = ""
    domain: str = ""
    thumbnail: Optional[WebImage] = None


@dataclass
class WebNode:
    """정규화된 웹 본문 블록 중간 표현(IR)."""

    kind: WebNodeKind
    text: str = ""
    html: str = ""
    level: int = 0
    ordered: bool = False
    items: list[str] = field(default_factory=list)
    item_htmls: list[str] = field(default_factory=list)
    rows: list[list[WebTableCell]] = field(default_factory=list)
    images: list[WebImage] = field(default_factory=list)
    link_card: Optional[WebLinkCard] = None
    style: TextInlineStyle = field(default_factory=TextInlineStyle)
    source_tag: str = ""
    rect: Optional[MeasuredRect] = None
    measured_height_px: Optional[float] = None
    column_widths_px: list[float] = field(default_factory=list)


@dataclass
class BrowserElementGeometry:
    """런타임 브라우저에서 실측된 단일 가시 요소 스냅샷."""

    kind_hint: str
    tag: str
    rect: MeasuredRect
    text: str = ""
    html: str = ""
    level: int = 0
    ordered: bool = False
    items: list[str] = field(default_factory=list)
    item_htmls: list[str] = field(default_factory=list)
    rows: list[list[WebTableCell]] = field(default_factory=list)
    image: Optional[WebImage] = None
    link_card: Optional[WebLinkCard] = None
    style: TextInlineStyle = field(default_factory=TextInlineStyle)
    line_count: int = 1


@dataclass
class BrowserLayoutSnapshot:
    """브라우저 CSS 레이아웃 엔진 실측 번들."""

    url: str
    title: str = ""
    site_name: str = ""
    author: str = ""
    description: str = ""
    html: str = ""
    raw_text_chars: int = 0
    body_font_size_px: float = 16.0
    root_rect: Optional[MeasuredRect] = None
    elements: list[BrowserElementGeometry] = field(default_factory=list)


@dataclass
class WebArticleIR:
    """본문 격리 및 사이트 프로파일 추출 결과."""

    url: str
    title: str
    site_name: str = ""
    author: str = ""
    description: str = ""
    profile_name: str = "generic"
    nodes: list[WebNode] = field(default_factory=list)
    raw_text_chars: int = 0
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WebpageQualityMetrics:
    """추출 커버리지 및 자산 해소 품질 지표."""

    profile_used: str
    raw_chars: int
    extracted_chars: int
    node_count: int
    block_count: int
    slot_count: int
    page_count: int
    image_total: int
    image_resolved: int
    image_failed: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "profileUsed": self.profile_used,
            "rawChars": self.raw_chars,
            "extractedChars": self.extracted_chars,
            "nodeCount": self.node_count,
            "blockCount": self.block_count,
            "slotCount": self.slot_count,
            "pageCount": self.page_count,
            "imageTotal": self.image_total,
            "imageResolved": self.image_resolved,
            "imageFailed": self.image_failed,
        }


@dataclass
class WebpageExtractionResult:
    """엔진 최종 출력 번들."""

    document: dict[str, Any]
    article: WebArticleIR
    metrics: WebpageQualityMetrics
    warnings: list[str] = field(default_factory=list)
