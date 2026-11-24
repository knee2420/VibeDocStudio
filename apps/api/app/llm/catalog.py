"""모델 목록의 단일 정본 (SSOT).

모델 식별자를 아는 곳은 여기 하나다. 엔진 공급자(`adapters.engine_provider`) · AI 설정 화면
(`GET /api/runtime` 의 models) · 실행 정책의 기본값이 모두 이 표를 읽는다.

- `AGY_MODELS`: `agy models` 를 못 읽을 때 쓰는 agy 식별자 스냅샷 (기준: agy 1.5.15).
- `AGY_BASE_MODELS`: ACP `configOptions.model` 이 받는 베이스/고유 식별자 집합.
- `GOOGLE_MODELS`: Google Direct API 모델.
- `SETTINGS_OPTIONS` / `build_settings_options()`: AI 설정 모달에 노출하는 선택지 (실측 목록 우선 + 설명 · 추천 보강).
"""
from __future__ import annotations

from typing import Iterable, Mapping

from .models import ModelOption

AGY_PROVIDER = "agy_cli"
GOOGLE_PROVIDER = "google_api"
OFFLINE_PROVIDER = "offline"

#: ACP / CLI 가 지원하는 생각 강도 접미사 (xhigh 를 high 보다 먼저 검사해야 접미사 오분리를 막는다).
THOUGHT_LEVEL_SUFFIXES: tuple[str, ...] = ("-xhigh", "-low", "-medium", "-high")

#: ACP `configOptions.model` 베이스 모델 및 고유 모델명 집합.
AGY_BASE_MODELS: frozenset[str] = frozenset({
    "gemini-4-hydrogen",
    "gemini-4-neon",
    "gemini-4-carbon",
    "gemini-4-argon",
    "gemini-pro-orchestrator-neon",
    "gemini-pro-orchestrator",
    "gemini-pro-orchestrator-argon",
    "gemini-3.8-flash",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "gpt-oss-120b-medium",
})

#: `agy models` 실측 스냅샷 (Hydrogen 기본 라인업을 최상단에 배치).
AGY_MODELS: tuple[tuple[str, str], ...] = (
    ("gemini-4-hydrogen-medium", "Gemini 4 Hydrogen (Medium)"),
    ("gemini-4-hydrogen-high", "Gemini 4 Hydrogen (High)"),
    ("gemini-4-hydrogen-xhigh", "Gemini 4 Hydrogen (XHigh)"),
    ("gemini-4-hydrogen-low", "Gemini 4 Hydrogen (Low)"),
    ("gemini-4-neon-high", "Gemini 4 Neon (High)"),
    ("gemini-4-neon-xhigh", "Gemini 4 Neon (XHigh)"),
    ("gemini-4-neon-medium", "Gemini 4 Neon (Medium)"),
    ("gemini-4-neon-low", "Gemini 4 Neon (Low)"),
    ("gemini-4-carbon-medium", "Gemini 4 Carbon (Medium)"),
    ("gemini-4-carbon-high", "Gemini 4 Carbon (High)"),
    ("gemini-4-carbon-low", "Gemini 4 Carbon (Low)"),
    ("gemini-4-argon-medium", "Gemini 4 Argon (Medium)"),
    ("gemini-4-argon-high", "Gemini 4 Argon (High)"),
    ("gemini-4-argon-low", "Gemini 4 Argon (Low)"),
    ("gemini-pro-orchestrator-neon", "Orchestrator (Neon)"),
    ("gemini-pro-orchestrator", "Orchestrator (Carbon)"),
    ("gemini-pro-orchestrator-argon", "Orchestrator (Argon)"),
    ("gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)"),
    ("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"),
    ("gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)"),
    ("claude-opus-5-5-medium", "Claude Opus 5.5 (Medium)"),
    ("claude-opus-5-5-high", "Claude Opus 5.5 (High)"),
    ("claude-opus-5-5-low", "Claude Opus 5.5 (Low)"),
    ("claude-sonnet-5-5-medium", "Claude Sonnet 5.5 (Medium)"),
    ("claude-sonnet-5-5-high", "Claude Sonnet 5.5 (High)"),
    ("claude-sonnet-5-5-low", "Claude Sonnet 5.5 (Low)"),
    ("gpt-oss-120b-medium", "GPT-OSS 120B (Medium)"),
)

GOOGLE_MODELS: tuple[tuple[str, str], ...] = (
    ("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite (Direct API)"),
    ("gemini-3.5-flash", "Gemini 3.5 Flash (Direct API)"),
)

#: ACP / Composer 기본 agy 모델 · 스트림/저부하 기본 모델 · Google 기본 모델
DEFAULT_AGY_MODEL = "gemini-4-hydrogen-medium"
DEFAULT_AGY_STREAM_MODEL = "gemini-4-hydrogen-low"
DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash-lite"

_AGY_DESCRIPTIONS: dict[str, tuple[str, bool]] = {
    "gemini-4-hydrogen-medium": ("기본 주력 모델 — Composer · 인라인 권장", True),
    "gemini-4-hydrogen-low": ("저부하 Hydrogen — 빠른 초안 · 경량 작업", False),
    "gemini-4-hydrogen-high": ("고정밀 Hydrogen — 깊은 추론 · 구조 편집", False),
    "gemini-4-hydrogen-xhigh": ("최고 심층 Hydrogen (Extra Thinking)", False),
    "gemini-4-neon-high": ("Gemini 4 Neon — 고난도 추론 · 복합 분석", False),
    "gemini-4-neon-xhigh": ("Gemini 4 Neon — 최고 심층 추론 (Extra Thinking)", False),
    "gemini-4-neon-medium": ("Gemini 4 Neon — 균형 잡힌 고성능", False),
    "gemini-4-neon-low": ("Gemini 4 Neon — 저부하 고속 응답", False),
    "gemini-4-carbon-medium": ("Gemini 4 Carbon — 안정적 범용 작업", False),
    "gemini-4-carbon-high": ("Gemini 4 Carbon — 심층 분석", False),
    "gemini-4-carbon-low": ("Gemini 4 Carbon — 빠른 응답", False),
    "gemini-4-argon-medium": ("Gemini 4 Argon — 복합 조항 · 구조 분석", False),
    "gemini-4-argon-high": ("Gemini 4 Argon — 고난도 심층 분석", False),
    "gemini-4-argon-low": ("Gemini 4 Argon — 저부하 분석", False),
    "gemini-pro-orchestrator-neon": ("멀티 스텝 오케스트레이터 (Neon)", False),
    "gemini-pro-orchestrator": ("멀티 스텝 오케스트레이터 (Carbon)", False),
    "gemini-pro-orchestrator-argon": ("멀티 스텝 오케스트레이터 (Argon)", False),
    "gemini-3.8-flash-medium": ("Gemini 3.8 Flash — 균형 고속 모델", False),
    "gemini-3.8-flash-high": ("Gemini 3.8 Flash — 고정밀 고속 모델", False),
    "gemini-3.8-flash-low": ("Gemini 3.8 Flash — 초고속 경량 모델", False),
    "claude-opus-5-5-medium": ("Claude Opus 5.5 — 최고 난도 서술 · 판단", False),
    "claude-opus-5-5-high": ("Claude Opus 5.5 — 심층 추론", False),
    "claude-opus-5-5-low": ("Claude Opus 5.5 — 경량 추론", False),
    "claude-sonnet-5-5-medium": ("Claude Sonnet 5.5 — 장문 서술 · 편집 품질", False),
    "claude-sonnet-5-5-high": ("Claude Sonnet 5.5 — 고정밀 장문 작성", False),
    "claude-sonnet-5-5-low": ("Claude Sonnet 5.5 — 빠른 장문 작성", False),
    "gpt-oss-120b-medium": ("GPT-OSS 120B — 오픈 웨이트 모델", False),
}

GOOGLE_SETTINGS_OPTIONS: tuple[ModelOption, ...] = (
    ModelOption(
        "gemini-3.5-flash-lite",
        GOOGLE_PROVIDER,
        "Google Direct REST API 고속",
        recommended=True,
        display_name="Gemini 3.5 Flash Lite (Direct API)",
    ),
    ModelOption(
        "gemini-3.5-flash",
        GOOGLE_PROVIDER,
        "Google Direct REST API 주력",
        display_name="Gemini 3.5 Flash (Direct API)",
    ),
)


def sort_agy_models(rows: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    """기본 모델(Hydrogen)이 상단에 오도록 실측 목록을 정돈한다 (원래 순서는 최대한 보존)."""
    items = list(rows)
    if not items:
        return items
    priority_order = (
        DEFAULT_AGY_MODEL,
        "gemini-4-hydrogen-high",
        "gemini-4-hydrogen-xhigh",
        "gemini-4-hydrogen-low",
    )
    rank = {mid: idx for idx, mid in enumerate(priority_order)}
    return sorted(items, key=lambda pair: (rank.get(pair[0], len(priority_order)),))


def build_settings_options(
    live_agy_models: Iterable[Mapping[str, str]] | None = None,
) -> tuple[ModelOption, ...]:
    """실측 `agy` 모델 목록이 있으면 그대로 반영하고, 없으면 정적 스냅샷으로 설정 선택지를 만든다."""
    agy_rows: list[tuple[str, str]] = []
    if live_agy_models:
        for item in live_agy_models:
            mid = str(item.get("id") or "").strip()
            name = str(item.get("name") or mid).strip()
            if mid:
                agy_rows.append((mid, name))
    if not agy_rows:
        agy_rows = list(AGY_MODELS)
    else:
        agy_rows = sort_agy_models(agy_rows)

    options: list[ModelOption] = []
    for mid, name in agy_rows:
        desc, recommended = _AGY_DESCRIPTIONS.get(mid, (f"agy CLI — {name}", mid == DEFAULT_AGY_MODEL))
        options.append(
            ModelOption(
                model_id=mid,
                provider=AGY_PROVIDER,
                description=desc,
                recommended=recommended,
                display_name=name,
            )
        )
    options.extend(GOOGLE_SETTINGS_OPTIONS)
    return tuple(options)


SETTINGS_OPTIONS: tuple[ModelOption, ...] = build_settings_options()


def is_agy_model(name: str | None) -> bool:
    """agy CLI / ACP 가 받아들이는 식별자인가."""
    if not name:
        return False
    return (
        name in {m for m, _ in AGY_MODELS}
        or name in AGY_BASE_MODELS
        or name.endswith(THOUGHT_LEVEL_SUFFIXES)
    )


def _extract_effort(m_lower: str, *, allow_xhigh: bool = False, default: str = "medium") -> str:
    if "xhigh" in m_lower:
        return "xhigh" if allow_xhigh else "high"
    if "high" in m_lower:
        return "high"
    if "low" in m_lower:
        return "low"
    if "medium" in m_lower:
        return "medium"
    return default


def normalize_agy_model(model_name: str | None) -> str:
    """사용자 설정 모델명(표시용 이름 포함)을 agy CLI 가 받는 식별자로 정규화한다 (서식 스캐폴딩 루프용)."""
    if not model_name:
        return DEFAULT_AGY_MODEL
    cleaned = model_name.strip()
    if cleaned in {m for m, _ in AGY_MODELS}:
        return cleaned
    m_lower = cleaned.lower().replace(" ", "").replace("_", "-")
    if "orchestrator" in m_lower:
        if "neon" in m_lower:
            return "gemini-pro-orchestrator-neon"
        if "argon" in m_lower:
            return "gemini-pro-orchestrator-argon"
        return "gemini-pro-orchestrator"
    if "hydrogen" in m_lower:
        return f"gemini-4-hydrogen-{_extract_effort(m_lower, allow_xhigh=True)}"
    if "neon" in m_lower:
        return f"gemini-4-neon-{_extract_effort(m_lower, allow_xhigh=True)}"
    if "carbon" in m_lower:
        return f"gemini-4-carbon-{_extract_effort(m_lower)}"
    if "argon" in m_lower or "pro" in m_lower:
        return f"gemini-4-argon-{_extract_effort(m_lower)}"
    if "3.8" in m_lower or "flash" in m_lower:
        return f"gemini-3.8-flash-{_extract_effort(m_lower)}"
    if "claude" in m_lower:
        effort = _extract_effort(m_lower)
        if "opus" in m_lower:
            return f"claude-opus-5-5-{effort}"
        return f"claude-sonnet-5-5-{effort}"
    if "gpt-oss" in m_lower:
        return "gpt-oss-120b-medium"
    if "lite" in m_lower or "gemma" in m_lower:
        return DEFAULT_AGY_STREAM_MODEL
    return DEFAULT_AGY_MODEL


def agy_model_or(name: str | None, fallback: str) -> str:
    """설정값이 표시용 이름(예: `Gemini-3.8-flash`)이면 실행 가능한 agy 식별자로 바꾼다."""
    return name if name and is_agy_model(name) else fallback
