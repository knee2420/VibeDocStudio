"""Model Capability Registry (Profile-Driven Spec, SSOT).

Dify 의 `AIModelEntity` / `ParameterRule` 사상을 따르되, 카탈로그의 **정본은 CLI 실측**이다.
(`agy models` 출력이 진실이며, 이 파일은 그 스냅샷 + 런타임 확장 지점이다.)

핵심 사실 두 가지:

1. **agy CLI 는 reasoning effort 를 모델명 접미사로 표현한다.**
   `gemini-3.8-flash-low` / `-medium` / `-high` 가 각각 별도 모델로 노출된다.
   따라서 접미사가 붙은 모델에 `--effort` 를 다시 붙이는 것은 중복 지정이다.
   effort 를 바꾸고 싶으면 **플래그가 아니라 모델을 바꾼다.**

2. **토큰 한계값은 아직 실측되지 않은 보수적 추정치다.**
   현재 어떤 코드도 이 값으로 입력을 자르거나 거부하지 않는다. 프로필 메타로만 쓴다.
   실측하기 전까지 이 값을 근거로 게이트를 만들지 말 것.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

# 모델명 접미사로 노출되는 reasoning effort 등급
EFFORT_SUFFIXES = ("low", "medium", "high")

DEFAULT_GOOGLE_MODEL_NAME = "gemini-3.5-flash-lite"
DEFAULT_CLI_MODEL_NAME = "gemini-3.8-flash-low"
DEFAULT_MODEL_NAME = DEFAULT_CLI_MODEL_NAME


@dataclass(frozen=True)
class ModelSpec:
    """단일 AI 모델의 정적 역량 프로필."""

    name: str
    family: str  # "gemini" | "claude" | "gpt-oss" | "gemma"
    provider: str  # "agy_cli" | "google_api" | "local_serving"
    max_input_tokens: int
    max_output_tokens: int
    # `--effort` 플래그를 인자로 받는가. agy CLI 계열은 모델명이 effort 를 이미
    # 담고 있으므로 전부 False 다. 향후 SDK 직결 프로바이더를 위해 남겨둔 축이다.
    supports_effort_flag: bool = False
    default_effort: Optional[str] = None
    supports_structured_schema: bool = True
    display_name: str = ""
    description: str = ""

    @property
    def effort_in_name(self) -> bool:
        """모델명 접미사가 이미 effort 를 확정하고 있는가."""
        return any(self.name.endswith(f"-{s}") for s in EFFORT_SUFFIXES)


def _gemini_flash_family(version: str) -> Dict[str, ModelSpec]:
    """`gemini-<version>-flash-{low,medium,high}` 3종을 한 번에 만든다."""
    specs: Dict[str, ModelSpec] = {}
    for effort in EFFORT_SUFFIXES:
        name = f"gemini-{version}-flash-{effort}"
        specs[name] = ModelSpec(
            name=name,
            family="gemini",
            provider="agy_cli",
            max_input_tokens=1_000_000,
            max_output_tokens=8_192,
            default_effort=effort,
            display_name=f"Gemini {version} Flash ({effort.capitalize()})",
            description=f"Gemini {version} Flash — effort={effort} 고정 변형",
        )
    return specs


# --- 카탈로그 (기준: `agy models`) ---------------------------------------
MODEL_REGISTRY: Dict[str, ModelSpec] = {
    **_gemini_flash_family("3.8"),
    **_gemini_flash_family("3.7"),
    **_gemini_flash_family("3.6"),
}

# Gemini 3.1 Pro 는 low / high 두 등급만 노출된다 (medium 없음).
for _effort in ("low", "high"):
    _name = f"gemini-3.1-pro-{_effort}"
    MODEL_REGISTRY[_name] = ModelSpec(
        name=_name,
        family="gemini",
        provider="agy_cli",
        max_input_tokens=1_000_000,
        max_output_tokens=8_192,
        default_effort=_effort,
        display_name=f"Gemini 3.1 Pro ({_effort.capitalize()})",
        description="복잡한 문서 구조 분석용 심층 추론 Pro 모델",
    )

MODEL_REGISTRY.update({
    "claude-sonnet-4-6": ModelSpec(
        name="claude-sonnet-4-6",
        family="claude",
        provider="agy_cli",
        max_input_tokens=200_000,
        max_output_tokens=32_000,
        display_name="Claude Sonnet 4.6 (Thinking)",
        description="장문 서술/판단 품질이 필요한 작업용",
    ),
    "claude-opus-4-6-thinking": ModelSpec(
        name="claude-opus-4-6-thinking",
        family="claude",
        provider="agy_cli",
        max_input_tokens=200_000,
        max_output_tokens=32_000,
        display_name="Claude Opus 4.6 (Thinking)",
        description="최고 난도 추론용. 비용이 크므로 상시 경로에 두지 말 것",
    ),
    "gpt-oss-120b-medium": ModelSpec(
        name="gpt-oss-120b-medium",
        family="gpt-oss",
        provider="agy_cli",
        max_input_tokens=128_000,
        max_output_tokens=32_000,
        default_effort="medium",
        display_name="GPT-OSS 120B (Medium)",
        description="오픈 웨이트 대조군",
    ),
    # 아직 서빙 백엔드가 붙지 않은 예약 프로필.
    # 프로바이더 라우팅이 실제로 갈라지는지 검증하는 대조군 역할도 한다.
    "gemma4-31b": ModelSpec(
        name="gemma4-31b",
        family="gemma",
        provider="local_serving",
        max_input_tokens=128_000,
        max_output_tokens=4_096,
        display_name="Gemma 4 31B (Local)",
        description="로컬 환경(vLLM/Ollama) 호스팅 예정 — 어댑터 미연결",
    ),
    # --- Google Generative Language Direct API 정규 시나리오 모델 ---
    "gemini-3.5-flash-lite": ModelSpec(
        name="gemini-3.5-flash-lite",
        family="gemini",
        provider="google_api",
        max_input_tokens=1_000_000,
        max_output_tokens=8_192,
        display_name="Gemini 3.5 Flash Lite (Direct API)",
        description="Google Direct API 기본 고속 구조화 모델",
    ),
    "gemini-3.5-flash": ModelSpec(
        name="gemini-3.5-flash",
        family="gemini",
        provider="google_api",
        max_input_tokens=1_000_000,
        max_output_tokens=8_192,
        display_name="Gemini 3.5 Flash (Direct API)",
        description="Google Direct API 정규 고속 멀티모달 비전 및 구조화 모델",
    ),
    "gemini-3.1-pro": ModelSpec(
        name="gemini-3.1-pro",
        family="gemini",
        provider="google_api",
        max_input_tokens=1_000_000,
        max_output_tokens=8_192,
        display_name="Gemini 3.1 Pro (Direct API)",
        description="Google Direct API 정규 심층 추론 및 복잡 서식 분석 Pro 모델",
    ),
    "gemini-3.1-flash-lite": ModelSpec(
        name="gemini-3.1-flash-lite",
        family="gemini",
        provider="google_api",
        max_input_tokens=1_000_000,
        max_output_tokens=8_192,
        display_name="Gemini 3.1 Flash Lite (Direct API)",
        description="Google Direct API 정규 경량 고속 구조화 모델",
    ),
})


def get_model_spec(model_name: Optional[str] = None) -> ModelSpec:
    """모델 스펙을 조회한다. 미등록 모델은 이름 휴리스틱으로 프로필을 만든다."""
    target = (model_name or DEFAULT_MODEL_NAME).strip()
    if target in MODEL_REGISTRY:
        return MODEL_REGISTRY[target]

    lowered = target.lower()
    is_gemma = "gemma" in lowered
    is_gemini = "gemini" in lowered
    has_cli_suffix = any(target.endswith(f"-{s}") for s in EFFORT_SUFFIXES)

    if is_gemma:
        provider = "local_serving"
    elif is_gemini and not has_cli_suffix:
        provider = "google_api"
    else:
        provider = "agy_cli"

    return ModelSpec(
        name=target,
        family="gemma" if is_gemma else "gemini" if is_gemini else "unknown",
        provider=provider,
        max_input_tokens=1_000_000 if is_gemini else 128_000,
        max_output_tokens=8_192 if is_gemini else 4_096,
        display_name=target,
        description=f"미등록 모델 — 유도 프로필 (provider={provider}): {target}",
    )


def register_model_spec(spec: ModelSpec) -> None:
    """런타임에 새 모델 프로필을 등록한다 (호스트 앱 / 테스트 확장 지점)."""
    MODEL_REGISTRY[spec.name] = spec


def resolve_effort(spec: ModelSpec, requested: Optional[str] = None) -> Optional[str]:
    """`--effort` 로 실제 전달해야 할 값을 판정한다. 붙이면 안 되면 None.

    이 함수가 effort 판정의 유일한 출처다. 호출부에서 접미사를 따로 검사하지 말 것.
    """
    if spec.effort_in_name or not spec.supports_effort_flag:
        return None
    return requested or spec.default_effort
