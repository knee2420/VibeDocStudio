"""pdf-fidelity-engine: 도메인 중립 PDF 시각·문자 정규화 추출, 격자 복원, 클린 슬롯 렌더 및 검증 패키지."""
from __future__ import annotations

from .extract.char_normalizer import (
    atoms_from_rawdict,
    deduplicate_faux_bold,
    is_cjk_garbled_token,
    normalize_chars_to_spans,
)
from .extract.raw_truth import (
    extract_drawings,
    extract_page_image_data_uris,
    extract_page_truth,
    extract_spans,
)
from .fonts.metrics import (
    PX_PER_PT,
    FontMetrics,
    parse_font_map,
    pick_font,
    solve_token_spacing,
)
from .fonts.registry import (
    DEFAULT_FONT_ALIASES,
    css_family,
    decode_font_name,
    font_family,
    infer_system_font,
    inspect_page_fonts,
)
from .layout.rule_stitcher import (
    find_underline_targets,
    stitch_dashed_rules,
    vertical_walls_from_rules,
)
from .layout.slot_renderer import (
    DEFAULT_TUNABLES,
    default_tune,
    render_page,
    validate_tune_changes,
)
from .layout.table_grid import (
    build_page_model,
    css_border_px,
    detect_tables,
    text_lines,
)
from .layout.zone_planner import default_plan, line_block_index, validate_plan
from .models import CharAtom, FidelityOptions, RefinedSlotPatch, SuspectSlot
from .pipeline import FidelityPageResult, run_fidelity_extraction
from .ports import SlotTextRefinerPort
from .refine.slot_patcher import apply_slot_patches, build_clean_paragraphs_html
from .refine.suspect_detector import detect_suspect_slots
from .verify.browser_measure import (
    CDP,
    match_nearest,
    measure_browser_page,
    pick_target,
    platform_fonts,
)
from .verify.diagnosis import AGREE, MIN_SHIFT, diagnose
from .verify.image_parity import (
    Report,
    color_distance,
    image_metrics,
    merge_rules,
    norm_font,
    parse_css_color,
    unmatched_ink_regions,
    verify_fidelity,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    # models & ports
    "CharAtom",
    "SuspectSlot",
    "RefinedSlotPatch",
    "FidelityOptions",
    "SlotTextRefinerPort",
    # pipeline
    "FidelityPageResult",
    "run_fidelity_extraction",
    # fonts
    "PX_PER_PT",
    "DEFAULT_FONT_ALIASES",
    "FontMetrics",
    "parse_font_map",
    "pick_font",
    "solve_token_spacing",
    "decode_font_name",
    "font_family",
    "css_family",
    "infer_system_font",
    "inspect_page_fonts",
    # extract
    "atoms_from_rawdict",
    "deduplicate_faux_bold",
    "normalize_chars_to_spans",
    "is_cjk_garbled_token",
    "extract_spans",
    "extract_drawings",
    "extract_page_truth",
    "extract_page_image_data_uris",
    # layout
    "stitch_dashed_rules",
    "find_underline_targets",
    "vertical_walls_from_rules",
    "css_border_px",
    "detect_tables",
    "build_page_model",
    "text_lines",
    "default_plan",
    "validate_plan",
    "line_block_index",
    "DEFAULT_TUNABLES",
    "default_tune",
    "validate_tune_changes",
    "render_page",
    # refine
    "detect_suspect_slots",
    "build_clean_paragraphs_html",
    "apply_slot_patches",
    # verify
    "Report",
    "parse_css_color",
    "color_distance",
    "image_metrics",
    "unmatched_ink_regions",
    "norm_font",
    "merge_rules",
    "verify_fidelity",
    "MIN_SHIFT",
    "AGREE",
    "diagnose",
    "CDP",
    "pick_target",
    "match_nearest",
    "platform_fonts",
    "measure_browser_page",
]
