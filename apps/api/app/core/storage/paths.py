"""저장 위치의 단일 게이트 (`config/` · `data/` · `cache/` · `state/`).

수명주기가 다른 데이터를 한 폴더에 섞지 않는다:
- `config/`: 사용자 설정
- `data/`: 원본·산출물·실행상태 (백업 대상)
- `cache/`: 결정적 파생 (언제든 삭제·재계산 가능)
- `state/`: 운영 로그·상태 (프로세스 재시작 시 유실 무해)
"""
from __future__ import annotations

from pathlib import Path

from .ids import safe_segment

STORAGE_VERSION = 1


class StorageRoots:
    """등급 루트와 층 디렉터리를 소유하는 유일한 객체."""

    def __init__(
        self,
        base_dir: Path,
        *,
        catalog_dir: Path | None = None,
        config_dir: Path | None = None,
        data_dir: Path | None = None,
        cache_dir: Path | None = None,
        state_dir: Path | None = None,
    ) -> None:
        self.base_dir = base_dir
        self.catalog = catalog_dir or (base_dir.parents[1] / "catalog")
        self.config = config_dir or (base_dir / "config")
        self.data = data_dir or (base_dir / "data")
        self.cache = cache_dir or (base_dir / "cache")
        self.state = state_dir or (base_dir / "state")

    @property
    def knowledge(self) -> Path:
        return self.data / "knowledge"

    @property
    def runs(self) -> Path:
        return self.data / "runs"

    def knowledge_of(self, domain: str) -> Path:
        """도메인별 지식(`data/knowledge/<domain>`) 루트."""
        return self.knowledge / safe_segment(domain)

    def cache_of(self, domain: str) -> Path:
        """도메인별 결정적 파생(`cache/<domain>`) 루트."""
        return self.cache / safe_segment(domain)

    @property
    def log(self) -> Path:
        return self.state / "log"

    def ensure(self) -> None:
        for directory in (
            self.config,
            self.knowledge,
            self.runs,
            self.cache,
            self.log,
        ):
            directory.mkdir(parents=True, exist_ok=True)

