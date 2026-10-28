"""documents 도메인 오류."""
from __future__ import annotations


class VDocDocumentNotFoundError(FileNotFoundError):
    """요청한 `.vdoc` 작업 문서를 찾을 수 없을 때 발생한다."""


class VDocSlotNotFoundError(KeyError):
    """문서 내에 지정된 `slotId`가 존재하지 않을 때 발생한다."""

