"""projects 도메인 예외."""
from __future__ import annotations


class VProjectNotFoundError(Exception):
    """요청한 `.vproj` 프로젝트를 찾을 수 없을 때 발생."""


class VProjectReadOnlyViolationError(Exception):
    """읽기 전용(`is_reference_only=True`) 참조 프로젝트를 직접 수정하려 할 때 발생."""


class VProjectValidationError(ValueError):
    """프로젝트 매니페스트 또는 아웃라인 노드 요청이 유효하지 않을 때 발생."""

