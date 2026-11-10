"""backdata 도메인 HTTP 요청·응답 스키마."""
from __future__ import annotations

from pydantic import BaseModel, Field


class BackdataImportRequest(BaseModel):
    source_title: str = Field(..., description="백데이터 원문 파일 또는 노트 제목")
    source_type: str = Field(default="markdown", description="markdown | transcript | pdf | sheet")
    raw_text: str = Field(..., description="단락 분할할 원문 텍스트")
    tags: list[str] = Field(default_factory=lambda: ["백데이터", "임포트"])


class BackdataChunkResponse(BaseModel):
    chunkId: str
    sourceTitle: str
    sourceType: str
    excerpt: str
    updatedAt: str
    tags: list[str]


class BackdataImportResponse(BaseModel):
    count: int
    chunks: list[BackdataChunkResponse]

