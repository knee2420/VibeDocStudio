"""웹 스크랩(`.vclip/`) 도메인 계약 및 API 스키마.

로컬 볼트 폴더 번들(`.vclip/`)은 향후 DB + Object Storage 이관을 전제로 1:1 매핑된다:
- `clip.json`     → DB `web_clips` 메타 행 (`clipId` 불변 UUID)
- `content.md`    → DB 본문 텍스트 / 검색 인덱스 / 줄 앵커(`#L`) 정본
- `snapshot.html` → Object Storage 원형 HTML 스냅샷 (선택)
- `capture.png`   → Object Storage 캡처 증빙 (선택)
- `assets/*`      → Object Storage 로컬 보존 이미지 (선택)
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

VCLIP_PROTOCOL = "vibe-clip/1.0"

CaptureMode = Literal["bookmark", "content", "archive"]
CaptureStatus = Literal["full", "partial", "manual", "blocked-fallback"]
SourceMethod = Literal["research-auto", "user-url", "user-paste", "user-drop"]


class WebClipAssetMeta(BaseModel):
    id: str
    file: str
    originUrl: str = ""
    mime: str = "image/jpeg"
    caption: str = ""


class WebClipCaptureTileMeta(BaseModel):
    index: int
    file: str
    mime: str = "image/jpeg"
    width: int = 0
    height: int = 0
    scrollY: int = 0
    totalHeight: int = 0


class WebClipMeta(BaseModel):
    protocol: str = VCLIP_PROTOCOL
    clipId: str
    url: str
    canonicalUrl: str = ""
    domain: str = ""
    title: str = ""
    author: str = ""
    publishedAt: str = ""
    capturedAt: str = ""
    captureMode: CaptureMode = "content"
    sourceMethod: SourceMethod = "user-url"
    captureStatus: CaptureStatus = "full"
    captureNote: str = ""
    contentSha256: str = ""
    hasSnapshotHtml: bool = False
    hasCaptureImage: bool = False
    assets: list[WebClipAssetMeta] = Field(default_factory=list)
    captureTiles: list[WebClipCaptureTileMeta] = Field(default_factory=list)


class WebClipAssetPayload(BaseModel):
    id: str
    file: str
    mime: str
    base64: str
    originUrl: str = ""
    caption: str = ""


class WebClipCaptureTilePayload(WebClipCaptureTileMeta):
    base64: str


class WebClipScrapeRequest(BaseModel):
    url: str = Field(..., min_length=4, description="수집할 공개 http(s) URL")
    mode: CaptureMode = Field(default="content", description="bookmark(목록) | content(본문) | archive(원형 캡처+이미지)")
    title: str = Field(default="", description="명시적 제목 (생략 시 원문 제목)")
    sourceMethod: SourceMethod = Field(default="user-url")
    snippet: str = Field(default="", description="차단/목록 모드 시 폴백으로 보존할 검색 요약 스니펫")
    clipId: str = Field(default="", description="기존 .vclip 승격(rescrape) 시 유지할 불변 clipId")


class WebClipScrapeResponse(BaseModel):
    meta: WebClipMeta
    contentMd: str
    snapshotHtml: Optional[str] = None
    assets: list[WebClipAssetPayload] = Field(default_factory=list)
    captureTiles: list[WebClipCaptureTilePayload] = Field(default_factory=list)
    wordCount: int = 0
    stageUsed: str = "fast-http"
