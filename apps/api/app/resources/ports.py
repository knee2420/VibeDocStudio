"""Resource Manager 포트(인터페이스) 정의."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.resources.models import ResourceItem, ResourceSession


class ResourceRepository(ABC):
    """프로젝트별 리소스 세션 영속화 포트."""

    @abstractmethod
    def get_session(self, project_id: str) -> ResourceSession:
        """프로젝트의 리소스 세션을 조회합니다. 없으면 기본 세션을 생성합니다."""
        raise NotImplementedError

    @abstractmethod
    def save_session(self, session: ResourceSession) -> None:
        """프로젝트의 리소스 세션을 영속화합니다."""
        raise NotImplementedError


class BaseResourceProvider(ABC):
    """리소스 인제스천 및 파서 추상 프로바이더 (향후 스마트 캡처·테이블 등 플러그인 확장 슬롯)."""

    @abstractmethod
    def can_handle(self, source_type: str) -> bool:
        """해당 프로바이더가 처리할 수 있는 리소스 타입인지 확인합니다."""
        raise NotImplementedError

    @abstractmethod
    def ingest(self, target: Any) -> list[ResourceItem]:
        """소스를 스캔/파싱하여 ResourceItem 목록으로 변환합니다."""
        raise NotImplementedError

