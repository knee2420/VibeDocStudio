"""모델 목록의 단일 정본 (SSOT).

모델 식별자를 아는 곳은 여기 하나다. 엔진 공급자(`adapters.engine_provider`) · AI 설정 화면
(`GET /api/runtime` 의 models) · 실행 정책의 기본값이 모두 이 표를 읽는다.

- `AGY_MODELS`: `agy models` 를 못 읽을 때 쓰는 agy 식별자 스냅샷 (실제 목록에 없는 것만 덧붙는다).
- `GOOGLE_MODELS`: Google Direct API 모델.
- `SETTINGS_OPTIONS`: AI 설정 모달에 노출하는 선택지 (설명 · 추천 표시).
"""
from __future__ import annotations

from .models import ModelOption

AGY_PROVIDER = "agy_cli"
GOOGLE_PROVIDER = "google_api"
OFFLINE_PROVIDER = "offline"

AGY_MODELS: tuple[tuple[str, str], ...] = (
    ("gemini-3.8-flash", "Gemini 3.8 Flash"),
    ("gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)"),
    ("gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)"),
    ("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"),
    ("gemini-4-argon", "Gemini 4 Argon"),
    ("gemini-4-argon-low", "Gemini 4 Argon (Low)"),
    ("gemini-4-argon-medium", "Gemini 4 Argon (Medium)"),
    ("gemini-4-argon-high", "Gemini 4 Argon (High)"),
    ("claude-sonnet-5-5-medium", "Claude Sonnet 5.5 (Medium)"),
    ("claude-opus-5-5-medium", "Claude Opus 5.5 (Medium)"),
    ("gpt-oss-120b-medium", "GPT-OSS 120B (Medium)"),
)
GOOGLE_MODELS: tuple[tuple[str, str], ...] = (
    ("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite (Direct API)"),
    ("gemini-3.5-flash", "Gemini 3.5 Flash (Direct API)"),
)

#: ACP 전송의 기본 agy 모델 · 스트림 전송(예열 풀)의 기본 모델 · Google 기본 모델
DEFAULT_AGY_MODEL = "gemini-3.8-flash"
DEFAULT_AGY_STREAM_MODEL = "gemini-3.8-flash-low"
DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash-lite"

SETTINGS_OPTIONS: tuple[ModelOption, ...] = (
    ModelOption("gemini-3.8-flash", AGY_PROVIDER, "고속 응답 — Composer · 인라인 기본값", recommended=True),
    ModelOption("gemini-3.8-flash-low", AGY_PROVIDER, "저부하 생각 — 빠른 초안 작성"),
    ModelOption("gemini-3.8-flash-medium", AGY_PROVIDER, "균형 잡힌 주력 작성"),
    ModelOption("gemini-3.8-flash-high", AGY_PROVIDER, "깊은 추론이 필요한 작성"),
    ModelOption("gemini-4-argon", AGY_PROVIDER, "고난도 복합 조항 심층 분석"),
    ModelOption("gemini-4-argon-medium", AGY_PROVIDER, "복합 조항 분석 (Medium)"),
    ModelOption("claude-sonnet-5-5-medium", AGY_PROVIDER, "장문 서술 · 판단 품질"),
    ModelOption("gemini-3.5-flash-lite", GOOGLE_PROVIDER, "Google Direct REST API 고속", recommended=True),
    ModelOption("gemini-3.5-flash", GOOGLE_PROVIDER, "Google Direct REST API 주력"),
)


def is_agy_model(name: str | None) -> bool:
    """agy CLI 가 받아들이는 식별자인가 (스냅샷에 있거나 `…-low|medium|high` 생각 강도 접미사)."""
    if not name:
        return False
    return name in {m for m, _ in AGY_MODELS} or name.endswith(("-low", "-medium", "-high"))


def normalize_agy_model(model_name: str | None) -> str:
    """사용자 설정 모델명(표시용 이름 포함)을 agy CLI 가 받는 생각 강도 붙은 키로 정규화한다 (서식 스캐폴딩 루프용)."""
    if not model_name:
        return "gemini-3.8-flash-medium"
    m_lower = model_name.lower().replace(" ", "").replace("_", "-")
    if "3.8" in m_lower or "flash" in m_lower:
        if "high" in m_lower:
            return "gemini-3.8-flash-high"
        if "low" in m_lower:
            return "gemini-3.8-flash-low"
        return "gemini-3.8-flash-medium"
    if "argon" in m_lower or "pro" in m_lower:
        return "gemini-4-argon-medium"
    if "claude" in m_lower:
        return "claude-sonnet-5-5-medium"
    if "lite" in m_lower or "gemma" in m_lower:
        return "gemini-3.8-flash-low"
    return "gemini-3.8-flash-medium"


def agy_model_or(name: str | None, fallback: str) -> str:
    """설정값이 표시용 이름(예: `Gemini-3.8-flash`)이면 실행 가능한 agy 식별자로 바꾼다."""
    return name if name and is_agy_model(name) else fallback
