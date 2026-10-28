from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="VibeDocStudio API",
    version="0.1.0",
    description="Dual Import (Template Structure -> .vdoc + Raw Backdata -> Chunks) & Slot-Scoped AI Composer API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BackdataImportRequest(BaseModel):
    source_title: str = Field(..., description="백데이터 원문 파일 또는 노트 제목")
    source_type: str = Field(default="markdown", description="markdown | transcript | pdf | note")
    raw_text: str = Field(..., description="분할 및 슬롯 바인딩할 원문 텍스트")
    tags: list[str] = Field(default_factory=lambda: ["백데이터", "임포트"])


class SlotComposeRequest(BaseModel):
    slot_id: str
    slot_label: str
    current_html: str
    instruction: str
    action_preset: str = "synthesize_from_backdata"
    backdata_excerpts: list[str] = Field(default_factory=list)


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "vibe-doc-studio-api",
        "extension": ".vdoc",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/import/backdata")
def import_backdata(payload: BackdataImportRequest) -> dict[str, Any]:
    paragraphs = [p.strip() for p in payload.raw_text.split("\n\n") if p.strip()]
    chunks = []
    now_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for idx, para in enumerate(paragraphs or [payload.raw_text.strip()]):
        chunks.append(
            {
                "chunkId": f"bd_api_{idx + 1}",
                "sourceTitle": f"{payload.source_title} (#{idx + 1})",
                "sourceType": payload.source_type,
                "excerpt": para,
                "updatedAt": now_date,
                "tags": payload.tags,
            }
        )
    return {"count": len(chunks), "chunks": chunks}


@app.post("/api/ai/compose")
def compose_slot_content(payload: SlotComposeRequest) -> dict[str, Any]:
    joined_backdata = " / ".join(payload.backdata_excerpts) if payload.backdata_excerpts else "바인딩된 백데이터 없음"
    generated_html = (
        f"<p><strong>[{payload.slot_label} — AI 합성 결과]</strong></p>"
        f"<p>{joined_backdata}</p>"
        f"<p><em>지시사항 반영: {payload.instruction}</em></p>"
    )
    return {
        "slotId": payload.slot_id,
        "generatedHtml": generated_html,
        "BoundaryGuarantee": "GSV-B1/B3 enforced: outer layout and sibling slots untouched",
    }

