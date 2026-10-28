"""VibeDocStudio FastAPI 애플리케이션 엔트리 (`app.main`)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.backdata import router as backdata_router_module
from app.bootstrap.container import Container
from app.catalog import router as catalog_router_module
from app.composer import router as composer_router_module
from app.core.config import settings
from app.documents import router as documents_router_module


def create_app() -> FastAPI:
    settings.ensure_directories()

    container = Container()
    container.wire(
        modules=[
            catalog_router_module,
            documents_router_module,
            backdata_router_module,
            composer_router_module,
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

    return application


app = create_app()
