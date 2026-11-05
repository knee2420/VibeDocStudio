"""블록 종류 계약 — 서버(PDF 엔진 · 시드 · 카탈로그)가 만드는 블록 종류는 프론트 블록 규격에 등록된 것이어야 한다.

기준 목록은 `packages/vdoc-schema/src/base-block.ts` 의 `LAYOUT_BLOCK_KINDS` 하나다. 새 블록 종류를 서버에서
먼저 만들기 시작하면 이 테스트가 "프론트에 정의 · 뷰를 먼저 추가하라"고 알려 준다 (`BLOCKS.md`).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE_BLOCK_TS = ROOT / "packages" / "vdoc-schema" / "src" / "base-block.ts"
DOCUMENTS = ROOT / "apps" / "api" / "data" / "knowledge" / "documents"
PY_SOURCES = [ROOT / "packages" / "pdf-vdoc-engine" / "pdf_vdoc_engine", ROOT / "apps" / "api" / "app"]


def _registered_kinds() -> set[str]:
    source = BASE_BLOCK_TS.read_text(encoding="utf-8")
    body = re.search(r"LAYOUT_BLOCK_KINDS\s*=\s*\[(.*?)\]\s*as const", source, re.S)
    assert body, "LAYOUT_BLOCK_KINDS 를 찾지 못했습니다"
    return set(re.findall(r'"([a-z-]+)"', body.group(1)))


def _iter_blocks(node):
    if isinstance(node, dict):
        if isinstance(node.get("blocks"), list):
            yield from node["blocks"]
        for value in node.values():
            yield from _iter_blocks(value)
    elif isinstance(node, list):
        for value in node:
            yield from _iter_blocks(value)


def test_seed_documents_use_registered_block_kinds() -> None:
    kinds = _registered_kinds()
    unknown = set()
    for path in DOCUMENTS.glob("*/document.vdoc.json"):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for block in _iter_blocks(doc.get("pages", [])):
            if block.get("kind") not in kinds:
                unknown.add((path.parent.name, block.get("kind")))
    assert not unknown, f"등록되지 않은 블록 종류: {sorted(unknown)}"


def test_server_code_only_emits_registered_block_kinds() -> None:
    kinds = _registered_kinds()
    pattern = re.compile(r'(?:"kind"\s*:\s*|kind=)"([a-z][a-z-]*)"')
    unknown = set()
    for base in PY_SOURCES:
        for path in base.rglob("*.py"):
            for kind in pattern.findall(path.read_text(encoding="utf-8")):
                if kind not in kinds:
                    unknown.add((path.relative_to(ROOT).as_posix(), kind))
    assert not unknown, f"서버 코드가 만드는 블록 종류가 프론트 규격에 없음: {sorted(unknown)}"
