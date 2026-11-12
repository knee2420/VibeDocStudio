"""Host-independent ports for OCR and optional VLM/external structure refinement."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from .ir.model import Word


@runtime_checkable
class OcrPort(Protocol):
    """Port for raster image -> Word token extraction in upright pt."""

    def recognize(
        self,
        image_path: Path,
        page_size_pt: tuple[float, float],
        *,
        dpi: int = 300,
    ) -> list[Word]:
        ...


@runtime_checkable
class StructurePort(Protocol):
    """Optional external structure reader (implemented by host/agent loop via dc_* tools)."""

    def propose_table_html(self, image_path: Path, table_id: str, prompt: str) -> dict[str, Any]:
        ...

