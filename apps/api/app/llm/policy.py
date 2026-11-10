"""실행 정책: 런타임에 바뀌는 몇 안 되는 값.

## 왜 따로 있는가

설정 화면에서 기본 공급자와 모델을 바꾸면 **그 프로세스의 이후 실행이 전부**
달라져야 한다. 그래서 이 값들은 부팅 시 한 번 읽고 마는 설정이 아니라
**살아 있는 상태**다.

예전에는 그 상태를 전역 `settings` 객체에 담고, 유스케이스가 거기에 직접
대입했다 (`settings.primary_provider = "google_api"`).

    - 프로세스 전체가 공유하는 객체를 유스케이스가 변경한다.
    - `app.core.config` 는 "불변 설정"이라고 문서에 적혀 있는데 실제로는 가변이었다.
    - 누가 언제 바꿨는지 추적할 방법이 없고, 테스트는 전역을 되돌려 놓아야 했다.
    - 컨테이너가 `providers.Object(settings.primary_provider)` 로 **값을 복사**한
      곳(인스펙터 매트릭스)은 부팅 시점 값에 영원히 고정됐다 — 정책을 바꿔도
      관측 화면은 옛 값을 보여줬다.

가변인 것과 불변인 것을 한 객체에 섞으면 그 객체 전체가 가변이 된다. 그래서
**바뀌는 값만** 여기로 떼어 낸다. 컨테이너가 부팅 시 `settings` 의 기본값으로
하나 만들고, 이후 그 하나를 모두가 공유한다. 값을 바꾸는 곳은
`app.llm.use_cases.UpdateRuntimePolicyUseCase` → `RuntimeExecutionPolicy.apply()` 하나뿐이다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock

#: 같은 뜻으로 쓰이는 표기들. 저장된 값과 입력값의 표기가 갈려서
#: `"google-api" != "google_api"` 로 판정이 뒤집히는 일이 실제로 있었다.
_GOOGLE_ALIASES = frozenset({"google_api", "google-api", "googleapi", "google"})
_CLI_ALIASES = frozenset({"agy_cli", "agy-cli", "agycli", "cli", "agy"})

GOOGLE_PROVIDER = "google_api"
CLI_PROVIDER = "agy_cli"


def normalize_provider(value: str | None) -> str | None:
    """표기가 무엇이든 정본 식별자로 옮긴다. 모르는 값은 `None`."""
    if not value:
        return None
    cleaned = value.strip().lower()
    if cleaned in _GOOGLE_ALIASES:
        return GOOGLE_PROVIDER
    if cleaned in _CLI_ALIASES:
        return CLI_PROVIDER
    return None


@dataclass(frozen=True)
class RuntimePolicyUpdate:
    """정책 변경 요청. `None` 인 항목은 그대로 둔다.

    모델 · 타임아웃은 "주 / 보조" 역할로 받는다. 어느 공급자 필드에 들어갈지는
    변경 후의 주 공급자를 기준으로 정책이 스스로 정한다.
    """

    primary_provider: str | None = None
    fallback_provider: str | None = None
    primary_model: str | None = None
    fallback_model: str | None = None
    primary_timeout_seconds: int | None = None
    fallback_timeout_seconds: int | None = None


@dataclass(frozen=True)
class RuntimePolicyView:
    """정책의 한 시점 사본 (응답 · 관측용)."""

    primary_provider: str
    fallback_provider: str
    primary_model: str
    fallback_model: str
    primary_timeout_seconds: int
    fallback_timeout_seconds: int
    agent_cli_bin: str


@dataclass
class RuntimeExecutionPolicy:
    """이 프로세스가 지금 어떤 엔진으로 실행하는가.

    값을 바꾸는 길은 `apply()` 하나뿐이며, 잠금 안에서 한꺼번에 바꾼다.
    """

    primary_provider: str
    fallback_provider: str
    google_api_model: str
    google_api_timeout_seconds: int
    agent_cli_model: str
    agent_cli_timeout_seconds: int
    agent_cli_bin: str
    _lock: Lock = field(default_factory=Lock, init=False, repr=False, compare=False)

    def apply(self, update: RuntimePolicyUpdate) -> RuntimePolicyView:
        with self._lock:
            primary = normalize_provider(update.primary_provider)
            if primary:
                self.primary_provider = primary
            fallback = normalize_provider(update.fallback_provider)
            if fallback:
                self.fallback_provider = fallback

            google_primary = self.is_google_primary
            if update.primary_model:
                self._set_model(google=google_primary, value=update.primary_model)
            if update.fallback_model:
                self._set_model(google=not google_primary, value=update.fallback_model)
            if update.primary_timeout_seconds:
                self._set_timeout(google=google_primary, value=update.primary_timeout_seconds)
            if update.fallback_timeout_seconds:
                self._set_timeout(google=not google_primary, value=update.fallback_timeout_seconds)
            return self._view()

    def snapshot(self) -> RuntimePolicyView:
        with self._lock:
            return self._view()

    def _view(self) -> RuntimePolicyView:
        return RuntimePolicyView(
            primary_provider=self.primary_provider,
            fallback_provider=self.fallback_provider,
            primary_model=self.primary_model,
            fallback_model=self.fallback_model,
            primary_timeout_seconds=self.primary_timeout_seconds,
            fallback_timeout_seconds=self.fallback_timeout_seconds,
            agent_cli_bin=self.agent_cli_bin,
        )

    def _set_model(self, *, google: bool, value: str) -> None:
        if google:
            self.google_api_model = value
        else:
            self.agent_cli_model = value

    def _set_timeout(self, *, google: bool, value: int) -> None:
        if value <= 0:
            raise ValueError("timeout seconds must be positive")
        if google:
            self.google_api_timeout_seconds = value
        else:
            self.agent_cli_timeout_seconds = value

    @property
    def is_google_primary(self) -> bool:
        return normalize_provider(self.primary_provider) == GOOGLE_PROVIDER

    @property
    def primary_model(self) -> str:
        return self.google_api_model if self.is_google_primary else self.agent_cli_model

    @property
    def primary_timeout_seconds(self) -> int:
        return (
            self.google_api_timeout_seconds
            if self.is_google_primary
            else self.agent_cli_timeout_seconds
        )

    @property
    def fallback_model(self) -> str:
        return self.agent_cli_model if self.is_google_primary else self.google_api_model

    @property
    def fallback_timeout_seconds(self) -> int:
        return (
            self.agent_cli_timeout_seconds
            if self.is_google_primary
            else self.google_api_timeout_seconds
        )
