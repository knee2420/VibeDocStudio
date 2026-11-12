"""Canonical DocIR / PageIR Pydantic v2 models for PDF (vector/scan/hybrid) and HWPX."""
from __future__ import annotations

import math
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

BBox = tuple[float, float, float, float]


def bbox_center(bbox: BBox) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) * 0.5, (bbox[1] + bbox[3]) * 0.5)


def bbox_area(bbox: BBox) -> float:
    return max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1])


def bbox_iou(a: BBox, b: BBox) -> float:
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    if inter <= 0.0:
        return 0.0
    union = bbox_area(a) + bbox_area(b) - inter
    return inter / union if union > 0.0 else 0.0


def point_in_bbox(
    pt: tuple[float, float],
    bbox: BBox,
    *,
    tol: float = 0.0,
    inset: float = 0.0,
) -> bool:
    x0 = bbox[0] + inset - tol
    y0 = bbox[1] + inset - tol
    x1 = bbox[2] - inset + tol
    y1 = bbox[3] - inset + tol
    if x0 > x1 or y0 > y1:
        return False
    return x0 <= pt[0] <= x1 and y0 <= pt[1] <= y1


def _validate_bbox(bbox: Optional[BBox]) -> Optional[BBox]:
    if bbox is None:
        return None
    x0, y0, x1, y1 = (float(v) for v in bbox)
    for v in (x0, y0, x1, y1):
        if not math.isfinite(v):
            raise ValueError(f"Non-finite bbox coordinate: {bbox}")
    if x1 < x0 - 1e-4 or y1 < y0 - 1e-4:
        raise ValueError(f"Inverted bbox coordinates: {bbox}")
    return (x0, y0, max(x0, x1), max(y0, y1))


class Word(BaseModel):
    id: str
    text: str
    bbox: Optional[BBox] = None
    conf: float = Field(default=1.0, ge=0.0, le=1.0)
    src: Literal["vec", "ocr", "vlm", "hwpx"] = "vec"
    font: Optional[str] = None
    size: Optional[float] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    underline: Optional[bool] = None
    color: Optional[str] = None
    needsReview: bool = False
    baseline: Optional[float] = None
    lineHint: Optional[int] = None
    spaceBefore: Optional[bool] = None
    trailingSpace: Optional[bool] = None

    @model_validator(mode="after")
    def _check_word(self) -> "Word":
        self.bbox = _validate_bbox(self.bbox)
        return self


class Ruling(BaseModel):
    orient: Literal["h", "v"]
    x0: float
    y0: float
    x1: float
    y1: float
    thickness: float = 0.75
    style: Literal["solid", "dashed", "dotted", "double", "none"] = "solid"
    color: str = "#000000"

    @model_validator(mode="after")
    def _normalize_coords(self) -> "Ruling":
        if self.x1 < self.x0:
            self.x0, self.x1 = self.x1, self.x0
        if self.y1 < self.y0:
            self.y0, self.y1 = self.y1, self.y0
        return self


class Span(BaseModel):
    wordIds: list[str] = Field(default_factory=list)
    text: Optional[str] = None
    bold: bool = False
    italic: bool = False
    underline: bool = False
    color: Optional[str] = None
    size: Optional[float] = None
    font: Optional[str] = None
    bg: Optional[str] = None


class BorderEdge(BaseModel):
    style: Literal["solid", "dashed", "dotted", "double", "none"] = "solid"
    width: float = 1.0
    color: str = "#000000"

    def to_css(self) -> str:
        if self.style == "none" or self.width <= 0:
            return "none"
        w = int(round(self.width)) if abs(self.width - round(self.width)) < 1e-3 else round(self.width, 2)
        return f"{w}px {self.style} {self.color or '#000000'}"

    @classmethod
    def from_css(cls, value: Optional[str]) -> "BorderEdge":
        raw = (value or "").strip()
        if not raw or raw.lower() == "none":
            return cls(style="none", width=0.0, color="#000000")
        parts = raw.split()
        width = 1.0
        style = "solid"
        color = "#000000"
        if parts and parts[0].endswith("px"):
            try:
                width = float(parts[0][:-2])
            except ValueError:
                width = 1.0
        if len(parts) >= 2 and parts[1] in ("solid", "dashed", "dotted", "double", "none"):
            style = parts[1]  # type: ignore[assignment]
        if len(parts) >= 3:
            color = parts[2]
        return cls(style=style, width=width, color=color)  # type: ignore[arg-type]


class CellBorders(BaseModel):
    top: Optional[BorderEdge] = None
    right: Optional[BorderEdge] = None
    bottom: Optional[BorderEdge] = None
    left: Optional[BorderEdge] = None


class CellPadding(BaseModel):
    t: float = 0.0
    r: float = 0.0
    b: float = 0.0
    l: float = 0.0  # noqa: E741


class CellFont(BaseModel):
    family: Optional[str] = None
    color: Optional[str] = None
    size: Optional[float] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    underline: Optional[bool] = None


class CellFieldMeta(BaseModel):
    fieldId: Optional[str] = None
    kind: Literal["text", "date", "sign", "check", "choice"] = "text"
    label: str = ""
    placeholder: str = ""
    assigneeName: str = ""


class CellIR(BaseModel):
    r: int = Field(ge=0)
    c: int = Field(ge=0)
    rs: int = Field(default=1, ge=1)
    cs: int = Field(default=1, ge=1)
    role: Literal["th", "td"] = "td"
    bbox: Optional[BBox] = None
    wordIds: list[str] = Field(default_factory=list)
    text: Optional[str] = None
    html: Optional[str] = None
    paragraphs: Optional[list[dict[str, Any]]] = None
    align: Optional[Literal["left", "center", "right", "justify"]] = None
    valign: Optional[Literal["top", "middle", "bottom"]] = None
    bg: Optional[str] = None
    borders: Optional[CellBorders] = None
    padding: Optional[CellPadding] = None
    font: Optional[CellFont] = None
    lineHeight: Optional[float] = None
    nested: list["TableIR"] = Field(default_factory=list)
    continued: bool = False
    field: Optional[CellFieldMeta] = None
    conf: float = Field(default=1.0, ge=0.0, le=1.0)
    needsReview: bool = False

    @model_validator(mode="after")
    def _check_bbox(self) -> "CellIR":
        self.bbox = _validate_bbox(self.bbox)
        return self


class TableIR(BaseModel):
    id: str
    kind: Literal["table"] = "table"
    bbox: Optional[BBox] = None
    nRows: int = Field(ge=1)
    nCols: int = Field(ge=1)
    colXs: list[float] = Field(default_factory=list)
    rowYs: list[float] = Field(default_factory=list)
    widthRatio: Optional[list[float]] = None
    widthPt: Optional[float] = None
    borderRules: Optional[dict[str, Any]] = None
    title: Optional[str] = None
    cells: list[CellIR] = Field(default_factory=list)
    repeatHeader: bool = False
    needsReview: bool = False
    rawHtml: Optional[str] = None
    imageFallbackSrc: Optional[str] = None
    spaceBeforePt: float = 0.0

    @model_validator(mode="after")
    def _check_bbox(self) -> "TableIR":
        self.bbox = _validate_bbox(self.bbox)
        return self


CellIR.model_rebuild()
TableIR.model_rebuild()


class _TextBlockBase(BaseModel):
    id: str
    bbox: Optional[BBox] = None
    wordIds: list[str] = Field(default_factory=list)
    text: Optional[str] = None
    align: Optional[Literal["left", "center", "right", "justify"]] = None
    spans: list[Span] = Field(default_factory=list)
    needsReview: bool = False
    lineCount: Optional[int] = None
    linePitchPt: Optional[float] = None
    lineHeight: Optional[float] = None
    spaceBeforePt: float = 0.0
    fontSizePt: Optional[float] = None
    fontFamily: Optional[str] = None

    @model_validator(mode="after")
    def _check_bbox(self) -> "_TextBlockBase":
        self.bbox = _validate_bbox(self.bbox)
        return self


class HeadingBlock(_TextBlockBase):
    kind: Literal["heading"] = "heading"
    level: int = Field(default=1, ge=1, le=6)


class ParagraphBlock(_TextBlockBase):
    kind: Literal["paragraph"] = "paragraph"
    html: Optional[str] = None
    lineHeight: Optional[float] = None
    paragraphs: Optional[list[dict[str, Any]]] = None


class ListItemBlock(_TextBlockBase):
    kind: Literal["listItem"] = "listItem"
    marker: str = ""
    markerKind: Literal["bullet", "number", "korean", "paren", "circled", "alpha", "custom"] = "bullet"
    indentLevel: int = Field(default=0, ge=0)
    hangingIndentPt: float = Field(default=0.0, ge=0.0)


class CaptionBlock(_TextBlockBase):
    kind: Literal["caption"] = "caption"
    targetBlockId: Optional[str] = None


class NoteBlock(_TextBlockBase):
    kind: Literal["note"] = "note"
    noteKind: Literal["footnote", "annotation", "header", "footer"] = "annotation"
    imageSrc: Optional[str] = None


class LineGroupSegment(BaseModel):
    id: str
    bbox: BBox
    wordIds: list[str] = Field(default_factory=list)
    text: str = ""
    align: Literal["left", "center", "right"] = "left"
    widthRatio: float = Field(default=0.5, gt=0.0, le=1.0)
    fontSizePt: Optional[float] = None
    fontFamily: Optional[str] = None
    bold: bool = False
    color: Optional[str] = None
    spans: list[Span] = Field(default_factory=list)


class LineGroupBlock(BaseModel):
    id: str
    kind: Literal["line-group"] = "line-group"
    bbox: Optional[BBox] = None
    wordIds: list[str] = Field(default_factory=list)
    text: Optional[str] = None
    segments: list[LineGroupSegment] = Field(default_factory=list)
    layoutMode: Literal["columns", "toc"] = "columns"
    lineHeight: Optional[float] = None
    spaceBeforePt: float = 0.0
    needsReview: bool = False

    @model_validator(mode="after")
    def _check_bbox(self) -> "LineGroupBlock":
        self.bbox = _validate_bbox(self.bbox)
        return self


class FigureBlock(BaseModel):
    id: str
    kind: Literal["figure"] = "figure"
    bbox: Optional[BBox] = None
    figureKind: Literal["photo", "chart", "diagram", "stamp", "signature", "formula"] = "photo"
    keepText: bool = False
    alt: str = ""
    src: Optional[str] = None
    captionBlockId: Optional[str] = None
    needsReview: bool = False
    spaceBeforePt: float = 0.0

    @model_validator(mode="after")
    def _check_bbox(self) -> "FigureBlock":
        self.bbox = _validate_bbox(self.bbox)
        return self


class FieldBlock(_TextBlockBase):
    kind: Literal["field"] = "field"
    fieldKind: Literal["date", "sign", "box", "line"] = "line"
    label: str = ""
    assigneeName: str = ""
    placeholder: str = ""


BlockIR = Annotated[
    Union[
        TableIR,
        HeadingBlock,
        ParagraphBlock,
        ListItemBlock,
        CaptionBlock,
        NoteBlock,
        LineGroupBlock,
        FigureBlock,
        FieldBlock,
    ],
    Field(discriminator="kind"),
]


class PageSize(BaseModel):
    width: float = Field(gt=0.0)
    height: float = Field(gt=0.0)


class PageMargins(BaseModel):
    top: float = 0.0
    right: float = 0.0
    bottom: float = 0.0
    left: float = 0.0


class PageIR(BaseModel):
    version: str = "1.0"
    pageIndex: int = Field(ge=1)
    sourceKind: Literal["pdf-vector", "pdf-scan", "pdf-hybrid", "hwpx", "image"]
    size: PageSize
    margins: Optional[PageMargins] = None
    words: list[Word] = Field(default_factory=list)
    rulings: list[Ruling] = Field(default_factory=list)
    blocks: list[BlockIR] = Field(default_factory=list)
    readingOrder: list[str] = Field(default_factory=list)
    pageBgColor: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None


class DocIR(BaseModel):
    version: str = "1.0"
    docId: str = ""
    title: str = ""
    srcHash: str = ""
    sourcePath: Optional[str] = None
    pages: list[PageIR] = Field(default_factory=list)
