"""애플리케이션 전역 설정 (SSOT).

외부 노출 URL·CORS 화이트리스트·주력 LLM 모델 라인업을 이 모듈 한 곳에서만 정의한다.
저장 경로는 여기에 두지 않고 `app.core.storage.StorageRoots`가 소유한다.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from app.core.storage import StorageRoots

BASE_DIR = Path(__file__).resolve().parents[2]

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5180",
    "http://127.0.0.1:5180",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# 현재 분기 주력 모델 라인업 (Gemma4 31b, Gemini-3.8-flash, Gemini-3.1-pro, Gemini-3.5-flash-lite)
DEFAULT_TAGGER_MODEL = "Gemma4 31b"
DEFAULT_COMPOSER_MODEL = "Gemini-3.8-flash"
DEFAULT_PRO_MODEL = "Gemini-3.1-pro"
DEFAULT_LITE_MODEL = "Gemini-3.5-flash-lite"


def _optional_path(key: str) -> Path | None:
    raw = os.getenv(key)
    return Path(raw) if raw else None


class Settings:
    """환경 변수로 덮어쓸 수 있는 런타임 설정."""

    def __init__(self) -> None:
        self.base_dir: Path = BASE_DIR
        self.storage: StorageRoots = StorageRoots(
            BASE_DIR,
            catalog_dir=_optional_path("VIBE_CATALOG_DIR"),
            config_dir=_optional_path("VIBE_CONFIG_DIR"),
            data_dir=_optional_path("VIBE_DATA_DIR"),
            cache_dir=_optional_path("VIBE_CACHE_DIR"),
            state_dir=_optional_path("VIBE_STATE_DIR"),
        )
        self.public_base_url: str = os.getenv(
            "VIBE_PUBLIC_BASE_URL", "http://localhost:8090"
        ).rstrip("/")
        self.cors_origins: list[str] = self._read_cors_origins()
        self.tagger_model: str = os.getenv("VIBE_TAGGER_MODEL", DEFAULT_TAGGER_MODEL)
        self.composer_model: str = os.getenv("VIBE_COMPOSER_MODEL", DEFAULT_COMPOSER_MODEL)
        self.pro_model: str = os.getenv("VIBE_PRO_MODEL", DEFAULT_PRO_MODEL)
        self.lite_model: str = os.getenv("VIBE_LITE_MODEL", DEFAULT_LITE_MODEL)
        # 외부 LLM(agy CLI · Google API) 호출 허용. 테스트 · 오프라인 환경은 0 으로 끈다.
        self.external_llm_enabled: bool = os.getenv("VIBE_EXTERNAL_LLM", "1") != "0"
        self.scaffold_agent_loop_enabled: bool = os.getenv("VIBE_SCAFFOLD_AGENT_LOOP", "1") != "0"

    @staticmethod
    def _read_cors_origins() -> list[str]:
        raw = os.getenv("VIBE_CORS_ORIGINS")
        if not raw:
            return list(_DEFAULT_CORS_ORIGINS)
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    def ensure_directories(self) -> None:
        self.storage.ensure()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
