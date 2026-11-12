"""PDF 문자·폰트·벡터선·채움·페이지 정답 추출기."""
from __future__ import annotations

from .char_normalizer import (
    PX,
    atoms_from_rawdict,
    deduplicate_faux_bold,
    is_cjk_garbled_token,
    normalize_chars_to_spans,
)
from .char_types import CharAtom
from .drawings import (
    extract_drawings,
    extract_page_image_data_uris,
    extract_page_truth,
    extract_spans,
)
from .fonts import (
    DEFAULT_FONT_ALIASES,
    css_family,
    decode_font_name,
    font_family,
    infer_system_font,
    inspect_page_fonts,
)
from .metrics import (
    PX_PER_PT,
    FontMetrics,
    parse_font_map,
    pick_font,
    solve_token_spacing,
)
from .rule_stitcher import (
    find_underline_targets,
    stitch_dashed_rules,
    vertical_walls_from_rules,
)

__all__ = [
    "CharAtom",
    "DEFAULT_FONT_ALIASES",
    "FontMetrics",
    "PX",
    "PX_PER_PT",
    "atoms_from_rawdict",
    "css_family",
    "decode_font_name",
    "deduplicate_faux_bold",
    "extract_drawings",
    "extract_page_image_data_uris",
    "extract_page_truth",
    "extract_spans",
    "find_underline_targets",
    "font_family",
    "infer_system_font",
    "inspect_page_fonts",
    "is_cjk_garbled_token",
    "normalize_chars_to_spans",
    "parse_font_map",
    "pick_font",
    "solve_token_spacing",
    "stitch_dashed_rules",
    "vertical_walls_from_rules",
]
