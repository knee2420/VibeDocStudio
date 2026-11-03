"""VibeDocStudio FastAPI 애플리케이션 엔트리 (`app.main`)."""
from __future__ import annotations

import logging
import shutil
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any, Optional

from agent_core.react import RunLogContextFilter
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.backdata import router as backdata_router_module
from app.bootstrap.container import Container
from app.catalog import router as catalog_router_module
from app.composer import router as composer_router_module
from app.core.config import settings
from app.core.llm.credentials import OsCredentialStore
from app.core.llm.execution_policy import (
    RuntimeExecutionPolicy,
    normalize_provider,
)
from app.documents import router as documents_router_module
from app.projects import router as projects_router_module

_credentials = OsCredentialStore()
_container = Container()
_runtime_policy: RuntimeExecutionPolicy = _container.runtime_policy()


class RuntimePolicyUpdateRequest(BaseModel):
    primaryProvider: Optional[str] = None
    fallbackProvider: Optional[str] = None
    primaryModel: Optional[str] = None
    fallbackModel: Optional[str] = None
    primaryTimeoutSeconds: Optional[int] = None
    fallbackTimeoutSeconds: Optional[int] = None


class GoogleApiKeyRequest(BaseModel):
    api_key: str



def _configure_logging() -> None:
    """앱 로그를 `state/log/api.log` 와 콘솔에 남긴다.

    줄마다 `run_id` · `step` 이 붙는다 (에이전트 실행 밖에서는 `-`). 실행 한 건의 상세
    (프롬프트 · 응답 · 도구 결과 · 측정 산출물)는 `state/agent_runs/<run_id>/` 에 따로 있다.
    """
    root_logger = logging.getLogger()
    if any(getattr(h, "_vibe_app_handler", False) for h in root_logger.handlers):
        return  # --reload 로 create_app 이 다시 불려도 핸들러를 겹쳐 달지 않는다
    log_dir = settings.storage.state / "log"
    log_dir.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [run=%(run_id)s step=%(step)s] [%(name)s] %(message)s")
    context = RunLogContextFilter()
    file_handler = RotatingFileHandler(log_dir / "api.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8")
    console_handler = logging.StreamHandler()
    for handler in (file_handler, console_handler):
        handler.setFormatter(formatter)
        handler.addFilter(context)
        handler._vibe_app_handler = True  # type: ignore[attr-defined]
        root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)


def create_app() -> FastAPI:
    settings.ensure_directories()

    _configure_logging()

    container = _container
    container.wire(
        modules=[
            catalog_router_module,
            documents_router_module,
            backdata_router_module,
            composer_router_module,
            projects_router_module,
        ]
    )

    application = FastAPI(
        title="VibeDocStudio API",
        version="0.2.0",
        description="Hexagonal Domain-Sliced API (catalog · documents · backdata · composer)",
    )
    application.state.container = container

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(
        catalog_router_module.router,
        prefix="/api/catalog",
        tags=["catalog"],
    )
    application.include_router(
        documents_router_module.router,
        prefix="/api/documents",
        tags=["documents"],
    )
    application.include_router(
        backdata_router_module.router,
        prefix="/api/backdata",
        tags=["backdata"],
    )
    application.include_router(
        composer_router_module.router,
        prefix="/api/ai",
        tags=["composer"],
    )
    application.include_router(
        projects_router_module.router,
        prefix="/api/projects",
        tags=["projects"],
    )

    @application.get("/api/health", tags=["health"])
    def health_check() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "vibe-doc-studio-api",
            "extension": ".vdoc",
            "domains": ["catalog", "documents", "backdata", "composer"],
            "models": {
                "tagger": settings.tagger_model,
                "composer": settings.composer_model,
                "pro": settings.pro_model,
                "lite": settings.lite_model,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @application.get("/api/runtime", tags=["runtime"])
    def get_runtime_dashboard() -> dict[str, Any]:
        return {
            "policy": {
                "primaryProvider": _runtime_policy.primary_provider,
                "fallbackProvider": _runtime_policy.fallback_provider,
                "primaryModel": _runtime_policy.primary_model,
                "fallbackModel": (
                    _runtime_policy.agent_cli_model
                    if _runtime_policy.is_google_primary
                    else _runtime_policy.google_api_model
                ),
                "primaryTimeoutSeconds": _runtime_policy.primary_timeout_seconds,
                "fallbackTimeoutSeconds": (
                    _runtime_policy.agent_cli_timeout_seconds
                    if _runtime_policy.is_google_primary
                    else _runtime_policy.google_api_timeout_seconds
                ),
                "agentCliBin": _runtime_policy.agent_cli_bin,
            },
            "googleConfigured": bool(_credentials.get_google_api_key()),
            "cliAvailable": bool(
                shutil.which(_runtime_policy.agent_cli_bin) or shutil.which("agy")
            ),
            "models": [
                {
                    "id": settings.tagger_model,
                    "name": settings.tagger_model,
                    "provider": "agy_cli",
                    "description": "초경량 로컬/고속 서식 태깅",
                },
                {
                    "id": settings.composer_model,
                    "name": settings.composer_model,
                    "provider": "agy_cli",
                    "description": "균형 잡힌 주력 서식 스캐폴더",
                    "recommended": True,
                },
                {
                    "id": settings.pro_model,
                    "name": settings.pro_model,
                    "provider": "agy_cli",
                    "description": "고난도 복합 조항 심층 분석",
                },
                {
                    "id": settings.lite_model,
                    "name": settings.lite_model,
                    "provider": "agy_cli",
                    "description": "초저비용 고속 분류",
                },
                {
                    "id": settings.composer_model,
                    "name": settings.composer_model,
                    "provider": "google_api",
                    "description": "Google Direct REST API 주력",
                    "recommended": True,
                },
                {
                    "id": settings.lite_model,
                    "name": settings.lite_model,
                    "provider": "google_api",
                    "description": "Google Direct REST API Fallback",
                },
            ],
        }

    @application.put("/api/runtime/policy", tags=["runtime"])
    def update_runtime_policy(req: RuntimePolicyUpdateRequest) -> dict[str, Any]:
        if req.primaryProvider:
            norm = normalize_provider(req.primaryProvider)
            if norm:
                _runtime_policy.primary_provider = norm
        if req.fallbackProvider:
            norm = normalize_provider(req.fallbackProvider)
            if norm:
                _runtime_policy.fallback_provider = norm
        if req.primaryModel:
            if _runtime_policy.is_google_primary:
                _runtime_policy.google_api_model = req.primaryModel
            else:
                _runtime_policy.agent_cli_model = req.primaryModel
        if req.fallbackModel:
            if _runtime_policy.is_google_primary:
                _runtime_policy.agent_cli_model = req.fallbackModel
            else:
                _runtime_policy.google_api_model = req.fallbackModel
        if req.primaryTimeoutSeconds:
            if _runtime_policy.is_google_primary:
                _runtime_policy.google_api_timeout_seconds = req.primaryTimeoutSeconds
            else:
                _runtime_policy.agent_cli_timeout_seconds = req.primaryTimeoutSeconds
        if req.fallbackTimeoutSeconds:
            if _runtime_policy.is_google_primary:
                _runtime_policy.agent_cli_timeout_seconds = req.fallbackTimeoutSeconds
            else:
                _runtime_policy.google_api_timeout_seconds = req.fallbackTimeoutSeconds

        return {
            "primaryProvider": _runtime_policy.primary_provider,
            "fallbackProvider": _runtime_policy.fallback_provider,
            "primaryModel": _runtime_policy.primary_model,
            "fallbackModel": (
                _runtime_policy.agent_cli_model
                if _runtime_policy.is_google_primary
                else _runtime_policy.google_api_model
            ),
            "primaryTimeoutSeconds": _runtime_policy.primary_timeout_seconds,
            "fallbackTimeoutSeconds": (
                _runtime_policy.agent_cli_timeout_seconds
                if _runtime_policy.is_google_primary
                else _runtime_policy.google_api_timeout_seconds
            ),
            "agentCliBin": _runtime_policy.agent_cli_bin,
        }

    @application.put("/api/providers/google-api", tags=["providers"])
    def configure_google_api(req: GoogleApiKeyRequest) -> dict[str, Any]:
        try:
            _credentials.set_google_api_key(req.api_key)
            return {"status": "ok", "configured": True}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete("/api/providers/google-api", tags=["providers"])
    def delete_google_api() -> Response:
        _credentials.delete_google_api_key()
        return Response(status_code=204)


    return application


app = create_app()
