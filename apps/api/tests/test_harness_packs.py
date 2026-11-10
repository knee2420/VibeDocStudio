"""하네스 팩 · 기본기 경계 검사.

하네스 자산(규칙 글 · 도구 명세 · 레지스트리 · 어휘 · 임계값 · 메시지 · 스킬)은 `packages/harness-packs` 에,
호스트 무관 기본기는 `packages/harness-kit` 에 있다. 앱 · 샌드박스 코드에는 실행 로직만 남는다.
"""
from __future__ import annotations

import ast
import json
import re
import string
from pathlib import Path
from typing import Any, Iterator

import pytest
from harness_kit import gates, packs

API = Path(__file__).resolve().parents[1]
REPO = API.parents[1]
KIT = REPO / "packages" / "harness-kit" / "harness_kit"
STUDIO = REPO / "apps" / "studio" / "src"

#: 이만큼 긴 한국어 글(독스트링 제외)은 모델에게 가는 안내 · 지시문이다 — 코드가 아니라 팩에 둔다
LONG_PROMPT_HANGUL = 40
_HANGUL = re.compile(r"[가-힣]")


def _pack_json_files() -> Iterator[Path]:
    yield from sorted(p for p in packs.root().rglob("*.json") if p.name != "package.json")


def _templates(node: Any, path: str = "") -> Iterator[tuple[str, str]]:
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from _templates(v, f"{path}.{k}" if path else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _templates(v, f"{path}[{i}]")


def test_every_pack_has_a_manifest_and_known_dependencies() -> None:
    names = packs.packs()
    assert {"core", "editor", "reference", "resource", "authoring", "form-scaffold"} <= set(names)
    for name in names:
        manifest = packs.manifest(name)
        assert manifest["name"] == name
        assert set(manifest.get("dependsOn") or []) <= set(names), name


def test_pack_json_files_parse() -> None:
    for p in _pack_json_files():
        json.loads(p.read_text(encoding="utf-8"))


def test_compose_recipes_and_declared_files_resolve() -> None:
    for name in packs.packs():
        manifest = packs.manifest(name)
        for recipe, refs in (manifest.get("compose") or {}).items():
            assert packs.compose(recipe, name), (name, recipe)
            for ref in refs:
                assert packs.path(ref).is_file(), ref
        for t in manifest.get("tools") or []:
            assert packs.path(f"{name}:{t['file']}").is_file()
            if t.get("aliases"):
                assert packs.path(f"{name}:{t['aliases']}").is_file()
        for key in ("clientTools", "loopTools", "messages", "prompts", "inlineActions"):
            if manifest.get(key):
                assert packs.path(f"{name}:{manifest[key]}").is_file(), (name, key)


def test_tool_names_are_unique_across_packs() -> None:
    server: list[str] = []
    client: list[str] = []
    for name in packs.packs():
        manifest = packs.manifest(name)
        server += [s["name"] for s in packs.tool_specs(name)]
        if manifest.get("clientTools"):
            for spec in packs.data(f"{name}:{manifest['clientTools']}"):
                assert {"name", "description", "risk", "inputSchema"} <= set(spec), spec
                client.append(spec["name"])
    assert len(server) == len(set(server))
    assert len(client) == len(set(client))
    assert not set(server) & set(client)


def test_message_templates_are_valid_format_strings() -> None:
    """`{이름}` 자리 · `{{ }}` 이스케이프가 맞아야 format 이 깨지지 않는다 (JSON 예시가 든 글에서 흔히 틀린다)."""
    formatter = string.Formatter()
    for p in _pack_json_files():
        for where, text in _templates(json.loads(p.read_text(encoding="utf-8"))):
            if "{" in text or "}" in text:
                try:
                    list(formatter.parse(text))
                except ValueError as exc:  # pragma: no cover - 실패 시 위치를 보여 준다
                    pytest.fail(f"{p.relative_to(packs.root())}:{where}: {exc}")


def test_declared_gates_are_registered() -> None:
    cfg = gates.config()
    per, final = gates._registry()
    assert cfg["candidateGates"] and set(cfg["candidateGates"]) <= set(per)
    assert set(cfg["finalGates"]) <= set(final)


def test_skills_and_tools_live_in_packs() -> None:
    for ref in ("resource:index/skills/knowledge_deck_reader/SKILL.md",
                "reference:skills/re_01_ui_dissector/SKILL.md",
                "form-scaffold:skills/external_pm_08_visual_fidelity_replicator/SKILL.md",
                "form-scaffold:tools/visual_fidelity/fidelity_core.py"):
        assert packs.path(ref).is_file(), ref
    assert not (REPO / ".agents" / "skills").exists()
    assert not (REPO / ".agents" / "tools").exists()


def _py_files() -> Iterator[Path]:
    for root in (API / "app", API / "vibefs", KIT):
        yield from root.rglob("*.py")


def _string_nodes(tree: ast.AST) -> Iterator[tuple[ast.expr, str]]:
    """독스트링을 뺀 문자열 리터럴 · f-string (f-string 은 고정 부분만 이어 붙인다)."""
    docs = {id(n.body[0].value) for n in ast.walk(tree)
            if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
            and n.body and isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant)}
    parts = {id(v) for n in ast.walk(tree) if isinstance(n, ast.JoinedStr) for v in n.values}
    for n in ast.walk(tree):
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docs and id(n) not in parts:
            yield n, n.value
        elif isinstance(n, ast.JoinedStr):
            yield n, "".join(v.value for v in n.values if isinstance(v, ast.Constant))


def _strings(tree: ast.AST) -> Iterator[tuple[int, str]]:
    for n, text in _string_nodes(tree):
        yield n.lineno, text


def test_no_long_prompt_text_in_code() -> None:
    offenders = []
    for p in _py_files():
        for line, text in _strings(ast.parse(p.read_text(encoding="utf-8"))):
            if len(_HANGUL.findall(text)) >= LONG_PROMPT_HANGUL:
                offenders.append(f"{p.relative_to(REPO)}:{line} {text[:40]!r}")
    assert offenders == [], "모델에게 가는 긴 글은 하네스 팩으로 옮긴다:\n" + "\n".join(offenders)


def test_harness_kit_has_no_domain_text_or_host_imports() -> None:
    """기본기는 호스트(app · vibefs)를 모르고, 영역 글(한국어 메시지)을 품지 않는다 — 글은 팩에서 읽는다."""
    for p in KIT.rglob("*.py"):
        tree = ast.parse(p.read_text(encoding="utf-8"))
        for n in ast.walk(tree):
            names = [n.module or ""] if isinstance(n, ast.ImportFrom) and not n.level else \
                [a.name for a in n.names] if isinstance(n, ast.Import) else []
            assert not [m for m in names if m.split(".")[0] in ("app", "vibefs")], p
        # 개발자용 예외 글(팩 참조 오류 등)은 기본기의 것이다 — raise 안의 글은 뺀다
        raised = {(c.lineno, c.col_offset) for r in ast.walk(tree) if isinstance(r, ast.Raise)
                  for c in ast.walk(r) if isinstance(c, (ast.Constant, ast.JoinedStr))}
        hangul = [(n.lineno, t) for n, t in _string_nodes(tree)
                  if _HANGUL.search(t) and (n.lineno, n.col_offset) not in raised]
        assert hangul == [], f"{p.name}: {hangul[:3]}"


def test_frontend_client_tools_come_from_packs() -> None:
    src = (STUDIO / "features/ai-workspace/model/workspaceTools.ts").read_text(encoding="utf-8")
    used = re.findall(r"\.\.\.clientTool\(\"([^\"]+)\"\)", src)
    declared = [s["name"] for pack in packs.packs() if packs.manifest(pack).get("clientTools")
                for s in packs.data(f"{pack}:{packs.manifest(pack)['clientTools']}")]
    assert sorted(used) == sorted(declared)
    assert not re.search(r"^\s+description:\s*\"", src, re.M), "도구 설명은 팩(tools.client.json)에 둔다"
