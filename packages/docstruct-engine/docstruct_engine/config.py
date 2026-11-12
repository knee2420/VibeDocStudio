"""Host-independent loader for docstruct thresholds and lexical pattern registries."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional


def _default_pack_dir() -> Optional[Path]:
    # Resolve packages/harness-packs/docstruct relative to packages/docstruct-engine
    here = Path(__file__).resolve()
    for parent in here.parents:
        cand = parent / "harness-packs" / "docstruct"
        if (cand / "pack.json").is_file():
            return cand
        cand_monorepo = parent / "packages" / "harness-packs" / "docstruct"
        if (cand_monorepo / "pack.json").is_file():
            return cand_monorepo
    return None


@lru_cache(maxsize=4)
def load_thresholds(pack_dir: Optional[str] = None) -> dict[str, Any]:
    base = Path(pack_dir) if pack_dir else _default_pack_dir()
    defaults: dict[str, Any] = {
        "rulingLineF1Min": 0.90,
        "rulingScanLineF1Min": 0.85,
        "tableTedsMin": 0.95,
        "tableTedsSMin": 0.95,
        "readingNedMax": 0.03,
        "fieldF1Min": 0.88,
        "ocrConfMin": 0.65,
        "renderDpi": 200,
        "scanRenderDpi": 300,
        "figureDpi": 150,
        "figureMaxEdgePx": 1600,
        "figureJpegQuality": 82,
        "snapTolPt": 1.8,
        "ruleJoinTolPt": 1.5,
        "dashMaxGapPt": 6.0,
        "orphanInsetPt": 1.0,
        "containmentTolPt": 2.0,
        "minTableWidthPt": 36.0,
        "minTableHeightPt": 18.0,
        "headingMaxLen": 60,
        "headingMinScale": 1.15,
        "paragraphMergeGapRatio": 1.85,
        "hangingIndentMinPt": 4.0,
        "maxRereadRounds": 2,
        "maxTableRejects": 2,
        "borderColorDiffTol": 24,
        "verifySampleMaxTables": 1,
    }
    if base is not None and (base / "thresholds.json").is_file():
        loaded = json.loads((base / "thresholds.json").read_text(encoding="utf-8"))
        defaults.update(loaded)
    return defaults


@lru_cache(maxsize=4)
def load_registry(pack_dir: Optional[str] = None) -> dict[str, Any]:
    base = Path(pack_dir) if pack_dir else _default_pack_dir()
    if base is not None and (base / "registry.ko.json").is_file():
        return json.loads((base / "registry.ko.json").read_text(encoding="utf-8"))
    return {
        "headingPatterns": [r"^(\d+(?:\.\d+){0,3}\.?)\s+\S"],
        "listMarkerPatterns": [
            {"kind": "number", "pattern": r"^(\d{1,3}\.(?:\d{1,3}\.)*)\s+"},
            {"kind": "paren", "pattern": r"^(?:\(\d{1,3}\)|\d{1,3}\))\s+"},
            {"kind": "bullet", "pattern": r"^([*\-])\s+"},
        ],
        "captionPatterns": [r"^\s*(?:Table|Fig(?:ure)?\.?)\s*[\d\-.]*"],
        "notePatterns": [r"^\s*\*+"],
        "fieldPatterns": {
            "date": [r"\d{4}[./-]\s*[\s_]{2,}[./-]\s*[\s_]{2,}"],
            "sign": [r"\(sign\)$"],
            "underlineRun": r"_{3,}|\.{5,}",
            "checkboxGlyphs": ["[ ]", "[v]"],
        },
        "emptyCellPlaceholders": ["", "-", "/"],
        "ocrNumericPattern": r"^[\d\s.,:%+\-/~()]+$",
    }


def compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(p, re.I) for p in patterns]


@lru_cache(maxsize=8)
def load_prompt(name: str, pack_dir: Optional[str] = None) -> str:
    """Load prompt markdown template from docstruct pack by key or filename."""
    base = Path(pack_dir) if pack_dir else _default_pack_dir()
    if base is None:
        return ""
    prompts_map: dict[str, str] = {}
    pjson = base / "prompts.json"
    if pjson.is_file():
        prompts_map = json.loads(pjson.read_text(encoding="utf-8"))
    rel = prompts_map.get(name, name)
    cand = base / rel
    if cand.is_file():
        return cand.read_text(encoding="utf-8")
    return ""
