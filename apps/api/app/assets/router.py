"""FastAPI router for AI-Native Structural Assets (`/api/assets`)."""
from __future__ import annotations

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from .schemas import (
    AssetApplyPreviewRequest,
    AssetApplyPreviewResponse,
    AssetParseFromBlockRequest,
    AssetParseFromRefRequest,
    AssetParseResponse,
    AssetRecommendSelectRequest,
    AssetRecommendSelectResponse,
)
from .use_cases import AssetAiService

router = APIRouter()


@router.post("/parse-from-block", response_model=AssetParseResponse)
@inject
def parse_asset_from_block(
    req: AssetParseFromBlockRequest,
    service: AssetAiService = Depends(Provide["asset_ai_service"]),
) -> AssetParseResponse:
    return service.parse_from_block(req)


@router.post("/parse-from-ref", response_model=AssetParseResponse)
@inject
def parse_asset_from_ref(
    req: AssetParseFromRefRequest,
    service: AssetAiService = Depends(Provide["asset_ai_service"]),
) -> AssetParseResponse:
    return service.parse_from_ref(req)


@router.post("/apply-preview", response_model=AssetApplyPreviewResponse)
@inject
def apply_asset_preview(
    req: AssetApplyPreviewRequest,
    service: AssetAiService = Depends(Provide["asset_ai_service"]),
) -> AssetApplyPreviewResponse:
    return service.apply_preview(req)


@router.post("/recommend-select", response_model=AssetRecommendSelectResponse)
@inject
def recommend_asset_select(
    req: AssetRecommendSelectRequest,
    service: AssetAiService = Depends(Provide["asset_ai_service"]),
) -> AssetRecommendSelectResponse:
    return service.recommend_select(req)
