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
`UpdateRuntimePolicyUseCase` 하나뿐이다.
"""
from __future__ import annotations

from dataclasses import dataclass

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


@dataclass
class RuntimeExecutionPolicy:
    """이 프로세스가 지금 어떤 엔진으로 실행하는가."""

    primary_provider: str
    fallback_provider: str
    google_api_model: str
    google_api_timeout_seconds: int
    agent_cli_model: str
    agent_cli_timeout_seconds: int
    agent_cli_bin: str

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
