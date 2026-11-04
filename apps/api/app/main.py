"""VibeDocStudio FastAPI 애플리케이션 엔트리 (`app.main`).

조립 순서: 설정 → 컨테이너 → 라우터 wiring → 오류 번역기 → 작업 공간 시드.
도메인 라우트는 각 도메인의 `router.py` 에만 있다.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any

from agent_core.react import RunLogContextFilter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.assistant import router as assistant_router_module
from app.backdata import router as backdata_router_module
from app.bootstrap.container import Container
from app.bootstrap.error_handlers import register_error_handlers
from app.bootstrap.workspace_seed import (
    migrate_legacy_references,
    seed_documents,
    seed_projects,
)
from app.catalog import router as catalog_router_module
from app.composer import router as composer_router_module
from app.core.config import Settings, get_settings
from app.documents import router as documents_router_module
from app.projects import router as projects_router_module
from app.runtime import router as runtime_router_module

#: (라우터 모듈, URL 접두사, 태그). 도메인을 추가하면 여기 한 줄만 늘린다.
_DOMAIN_ROUTERS = (
    (catalog_router_module, "/api/catalog", "catalog"),
    (documents_router_module, "/api/documents", "documents"),
    (backdata_router_module, "/api/backdata", "backdata"),
    (composer_router_module, "/api/ai", "composer"),
    (projects_router_module, "/api/projects", "projects"),
    (runtime_router_module, "/api", "runtime"),
    (assistant_router_module, "/api/assistant", "assistant"),
)


def _configure_logging(settings: Settings) -> None:
    """앱 로그를 `state/log/api.log` 와 콘솔에 남긴다.

    줄마다 `run_id` · `step` 이 붙는다 (에이전트 실행 밖에서는 `-`). 실행 한 건의 상세
    (프롬프트 · 응답 · 도구 결과 · 측정 산출물)는 `state/agent_runs/<run_id>/` 에 따로 있다.
    """
    root_logger = logging.getLogger()
    if any(getattr(h, "_vibe_app_handler", False) for h in root_logger.handlers):
        return  # --reload 로 create_app 이 다시 불려도 핸들러를 겹쳐 달지 않는다
    log_dir = settings.storage.log
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


def _seed_workspace(container: Container) -> None:
    seed_projects(container.project_repository())
    migrate_legacy_references(container.project_repository())
    seed_documents(
        container.project_repository(),
        container.document_repository(),
        container.catalog_repository(),
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    settings.ensure_directories()
    _configure_logging(settings)

    container = Container(settings=settings)
    container.wire(modules=[module for module, _, _ in _DOMAIN_ROUTERS])

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if settings.external_llm_enabled:
            container.assistant_service().warmup()  # 첫 질문 전에 agy 를 예열 (백그라운드)
        yield
        # agy 상주 프로세스(Composer 세션 · 예열 풀)는 API 와 함께 내려간다.
        container.assistant_service().shutdown()

    application = FastAPI(
        lifespan=lifespan,
        title="VibeDocStudio API",
        version="0.3.0",
        description="Hexagonal Domain-Sliced API (" + " · ".join(tag for _, _, tag in _DOMAIN_ROUTERS) + ")",
    )
    application.state.container = container

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(application)

    for module, prefix, tag in _DOMAIN_ROUTERS:
        application.include_router(module.router, prefix=prefix, tags=[tag])

    @application.get("/api/health", tags=["health"])
    def health_check() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "vibe-doc-studio-api",
            "extension": ".vdoc",
            "domains": [tag for _, _, tag in _DOMAIN_ROUTERS],
            "models": {
                "tagger": settings.tagger_model,
                "composer": settings.composer_model,
                "pro": settings.pro_model,
                "lite": settings.lite_model,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    _seed_workspace(container)
    return application


app = create_app()
