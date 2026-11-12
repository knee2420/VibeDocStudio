#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fidelity_core.py
시각 일치도 도구(01 · 02 · 03)가 함께 쓰는 공용 래퍼 (`docstruct-engine` + 로컬 parity 모듈).
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

_TOOL_DIR = Path(__file__).resolve().parent
if str(_TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOL_DIR))

_PKG_DIR = Path(__file__).resolve().parents[4] / "docstruct-engine"
if _PKG_DIR.is_dir() and str(_PKG_DIR) not in sys.path:
    sys.path.insert(0, str(_PKG_DIR))

from docstruct_engine.acquire.pdf.metrics import (  # noqa: E402
    PX_PER_PT,
    FontMetrics,
    parse_font_map,
    pick_font,
    solve_token_spacing,
)
from image_parity import (  # noqa: E402
    color_distance,
    image_metrics,
    parse_css_color,
    unmatched_ink_regions,
)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


def need(module: str, pip_name: str):
    """선택 의존성을 불러오고, 없으면 설치 명령을 알려 주며 종료한다."""
    try:
        return importlib.import_module(module)
    except ImportError:
        print(f"[ERROR] {module} 이 필요합니다: pip install {pip_name}", file=sys.stderr)
        sys.exit(2)


__all__ = [
    "PX_PER_PT",
    "FontMetrics",
    "parse_font_map",
    "pick_font",
    "solve_token_spacing",
    "parse_css_color",
    "color_distance",
    "image_metrics",
    "unmatched_ink_regions",
    "need",
]
