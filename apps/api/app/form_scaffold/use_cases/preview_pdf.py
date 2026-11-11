"""유스케이스: PDF 바이트에서 파싱 전 경량 썸네일 및 텍스트 레이어 사전 진단을 추출한다."""
from __future__ import annotations

import base64
from typing import Any

import pymupdf

PX = 96.0 / 72.0
THUMB_TARGET_WIDTH = 340.0


class PreviewPdfUseCase:
    """1단계: 페이지 고르기 전에 실제 페이지 썸네일과 텍스트 추출 가능 여부를 빠르게 반환한다."""

    def execute(self, *, pdf_bytes: bytes, title: str = "") -> dict[str, Any]:
        if not pdf_bytes:
            raise ValueError("Uploaded PDF payload is empty")

        pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        pages: list[dict[str, Any]] = []
        has_any_text = False

        for idx in range(len(pdf)):
            page = pdf[idx]
            w_px = round(float(page.rect.width * PX), 2)
            h_px = round(float(page.rect.height * PX), 2)
            if abs(w_px - 794.0) < 5.0 and abs(h_px - 1123.0) < 5.0:
                w_px, h_px = 794.0, 1123.0

            text_dict = page.get_text("dict")
            span_count = 0
            for block in text_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if str(span.get("text", "")).strip():
                            span_count += 1

            image_count = len(page.get_images())
            drawing_count = len(page.get_drawings())
            has_text_layer = span_count > 0 or image_count > 0
            if span_count > 0:
                has_any_text = True

            scale = THUMB_TARGET_WIDTH / max(float(page.rect.width), 1.0)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
            jpeg_bytes = pix.tobytes("jpeg", jpg_quality=82)
            thumb_url = "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode("ascii")

            pages.append(
                {
                    "pageNumber": idx + 1,
                    "widthPx": w_px,
                    "heightPx": h_px,
                    "hasTextLayer": has_text_layer,
                    "spanCount": span_count,
                    "imageCount": image_count,
                    "drawingCount": drawing_count,
                    "thumbnailDataUrl": thumb_url,
                }
            )

        return {
            "title": (title or "").strip() or "PDF 문서",
            "totalPages": len(pages),
            "hasAnyTextLayer": has_any_text,
            "pages": pages,
        }

