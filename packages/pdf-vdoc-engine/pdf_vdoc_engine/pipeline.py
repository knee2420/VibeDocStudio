"""수평 파이프라인 오케스트레이터 (`measure -> judge -> assemble -> validate`)."""
from __future__ import annotations

from typing import Any

from .assemble import assemble_vdoc_document
from .judge import partition_page_zones
from .measure import extract_page_geometry_from_pdf
from .models import MeasuredPageGeometry, ValidationScore
from .validate import validate_vdoc_invariants


def extract_vdoc_from_geometry(
    *,
    geometries: tuple[MeasuredPageGeometry, ...],
    doc_id: str,
    title: str,
) -> tuple[dict[str, Any], ValidationScore]:
    """측정된 페이지 기하 구조로부터 `judge -> assemble -> validate`를 수행한다."""
    partitions = tuple(partition_page_zones(g) for g in geometries)
    vdoc = assemble_vdoc_document(doc_id=doc_id, title=title, partitions=partitions)
    score = validate_vdoc_invariants(vdoc)
    return vdoc, score


def extract_vdoc_from_pdf(
    *,
    pdf_bytes: bytes,
    doc_id: str,
    title: str,
) -> tuple[dict[str, Any], ValidationScore]:
    """PDF 바이트로부터 4단계(`measure -> judge -> assemble -> validate`) 전체를 실행한다."""
    geometries = extract_page_geometry_from_pdf(pdf_bytes)
    return extract_vdoc_from_geometry(geometries=geometries, doc_id=doc_id, title=title)

