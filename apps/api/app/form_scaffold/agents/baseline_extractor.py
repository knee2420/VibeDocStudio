"""PDF 양식의 결정적 기하 추출기 (`pdf-fidelity-engine` → 완전한 `.vdoc` 문서).

LLM 을 쓰지 않는 순수 함수형 단계다. `FormScaffoldAgent` 는 이 결과를 기준선으로 삼아
에이전틱 피델리티 루프 또는 선별 슬롯 텍스트 정제를 덧입힌다.
"""
from __future__ import annotations

import html
from typing import Any, Optional

import pymupdf
from pdf_fidelity_engine import (
    FidelityOptions,
    SlotTextRefinerPort,
    extract_page_image_data_uris,
    run_fidelity_extraction,
)

from app.core.clock import utc_now_iso

from .fidelity_layout import FONT_ALIASES, TUNABLES


class DeterministicBaselineExtractor:
    """PDF 바이트 → (.vdoc 문서, 블록 수, 슬롯 수)."""

    def extract(
        self,
        *,
        pdf_bytes: bytes,
        doc_id: str,
        title: str,
        refiner: Optional[SlotTextRefinerPort] = None,
    ) -> tuple[dict[str, Any], int, int]:
        """PDF 바이트를 파싱하여 완전한 `.vdoc` Document JSON 과 통계(블록 수, 슬롯 수)를 반환한다."""
        if not pdf_bytes:
            raise ValueError("PDF payload is empty")

        doc_title = (title or "").strip() or "추출된 양식 문서"
        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        options = FidelityOptions(font_aliases=FONT_ALIASES, tunables_spec=TUNABLES)

        pages: list[dict[str, Any]] = []
        slots: dict[str, dict[str, Any]] = {}
        total_blocks_count = 0

        try:
            for page_idx in range(len(pdf)):
                page_num = page_idx + 1
                image_srcs = extract_page_image_data_uris(pdf[page_idx])
                res = run_fidelity_extraction(
                    pdf_bytes,
                    page_number=page_num,
                    doc_title=doc_title,
                    options=options,
                    image_srcs=image_srcs,
                    refiner=refiner,
                    capture_suspect_crops=bool(refiner),
                )
                page_vdoc = res.page
                page_vdoc["pageLabel"] = f"{doc_title} ({page_num}p)"

                # 머리글/바닥글 보일러플레이트 슬롯 내용 보강
                header_id = page_vdoc.get("headerSlotId")
                footer_id = page_vdoc.get("footerSlotId")
                if header_id and header_id in res.slots:
                    res.slots[header_id]["content"] = f"<p>{html.escape(doc_title)}</p>"
                if footer_id and footer_id in res.slots:
                    res.slots[footer_id]["content"] = f"<p>- {page_num} -</p>"

                slots.update(res.slots)
                pages.append(page_vdoc)
                total_blocks_count += len(page_vdoc.get("blocks", []))
        finally:
            pdf.close()

        vdoc_doc: dict[str, Any] = {
            "version": "1.0.0",
            "docId": doc_id,
            "title": doc_title,
            "status": "Draft",
            "totalValueText": "Scaffolded .vdoc",
            "updatedAt": utc_now_iso(),
            "variables": {},
            "pages": pages,
            "slots": slots,
            "backdata": {},
        }
        return vdoc_doc, total_blocks_count, len(slots)
