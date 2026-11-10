"""단일 진입 파사드: 추출(extract) → 표/줄 모델(layout) → 클린 렌더(render) → 선별 슬롯 정제(refine)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import pymupdf

from .extract.raw_truth import PX, extract_page_truth
from .fonts.metrics import FontMetrics
from .layout.slot_renderer import default_tune, render_page
from .layout.table_grid import build_page_model
from .layout.zone_planner import default_plan
from .models import FidelityOptions, SuspectSlot
from .ports import SlotTextRefinerPort
from .refine.slot_patcher import apply_slot_patches
from .refine.suspect_detector import detect_suspect_slots


@dataclass
class FidelityPageResult:
    """단일 PDF 페이지의 정제 추출·모델·VDoc 결과 번들."""

    truth: dict[str, Any]
    model: dict[str, Any]
    plan: dict[str, Any]
    tune: dict[str, Any]
    page: dict[str, Any]
    slots: dict[str, dict[str, Any]]
    suspects: list[SuspectSlot] = field(default_factory=list)
    applied_patches: list[str] = field(default_factory=list)


def _render_page_png_bytes(pdf_bytes: bytes, page_number: int) -> Optional[bytes]:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        if not 1 <= page_number <= doc.page_count:
            return None
        return doc[page_number - 1].get_pixmap(matrix=pymupdf.Matrix(PX, PX), alpha=False).tobytes("png")
    finally:
        doc.close()


def run_fidelity_extraction(
    pdf_bytes: bytes,
    *,
    page_number: int = 1,
    doc_title: str = "",
    options: Optional[FidelityOptions] = None,
    font_map: Optional[dict[str, FontMetrics]] = None,
    plan: Optional[dict[str, Any]] = None,
    tune: Optional[dict[str, Any]] = None,
    image_srcs: Optional[dict[int, str]] = None,
    refiner: Optional[SlotTextRefinerPort] = None,
    render_rasters: bool = False,
    capture_suspect_crops: Optional[bool] = None,
    out_dir: Optional[str | Path] = None,
    pdf_label_path: str = "",
) -> FidelityPageResult:
    """PDF 1페이지를 정규화 추출하고, 바운더리 불변 클린 슬롯 HTML 로 조립한 뒤 필요 시 선별 정제한다."""
    opts = options or FidelityOptions()
    aliases = opts.font_aliases or None

    truth = extract_page_truth(
        pdf_bytes=pdf_bytes,
        page_number=page_number,
        out_dir=out_dir,
        pdf_label_path=pdf_label_path,
        font_map=font_map,
        font_aliases=aliases,
        render_rasters=render_rasters,
        faux_bold_dedup=opts.faux_bold_dedup,
        space_ratio=opts.char_gap_space_ratio,
    )
    model = build_page_model(truth, font_aliases=aliases, dash_max_gap=opts.dash_max_gap)
    eff_plan = plan or default_plan(model)
    eff_tune = tune or default_tune(opts.tunables_spec or None)

    page_vdoc, slots = render_page(
        model,
        truth,
        eff_plan,
        eff_tune,
        page_number=page_number,
        image_srcs=image_srcs,
        font_aliases=aliases,
        clamp_negative_gap_px=opts.clamp_negative_gap_px,
    )

    need_crops = capture_suspect_crops if capture_suspect_crops is not None else (refiner is not None or render_rasters)
    page_png_bytes: Optional[bytes] = None
    if need_crops:
        mupdf_name = (truth.get("render") or {}).get("mupdf")
        if out_dir is not None and mupdf_name:
            cand_png = Path(out_dir) / mupdf_name
            if cand_png.is_file():
                page_png_bytes = cand_png.read_bytes()
        if page_png_bytes is None:
            page_png_bytes = _render_page_png_bytes(pdf_bytes, page_number)

    suspects = detect_suspect_slots(
        page_vdoc=page_vdoc,
        slots=slots,
        truth=truth,
        model=model,
        page_png_bytes=page_png_bytes,
    )

    applied_patches: list[str] = []
    if suspects and refiner is not None:
        patches = refiner.refine_slots(
            page_png_bytes=page_png_bytes,
            doc_title=doc_title or f"Page {page_number}",
            suspects=suspects,
            page_vdoc=page_vdoc,
        )
        if patches:
            slots, applied_patches = apply_slot_patches(slots, patches)

    return FidelityPageResult(
        truth=truth,
        model=model,
        plan=eff_plan,
        tune=eff_tune,
        page=page_vdoc,
        slots=slots,
        suspects=suspects,
        applied_patches=applied_patches,
    )

