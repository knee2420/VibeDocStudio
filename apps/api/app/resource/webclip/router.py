"""웹 스크랩(`.vclip/`) REST 라우터 (`/api/webclips`)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .extractor import scrape_web_clip
from .models import WebClipScrapeRequest, WebClipScrapeResponse

router = APIRouter()


@router.post("/scrape", response_model=WebClipScrapeResponse)
def scrape_clip(req: WebClipScrapeRequest) -> WebClipScrapeResponse:
    """공개 웹 URL 을 `.vclip/` 번들 페이로드(`clip.json` · `content.md` · 선택 스냅샷/이미지)로 수집한다."""
    try:
        return scrape_web_clip(
            url=req.url,
            mode=req.mode,
            title=req.title,
            source_method=req.sourceMethod,
            snippet=req.snippet,
            clip_id=req.clipId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
