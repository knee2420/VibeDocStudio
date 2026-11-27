"""볼트 `.outline` 서버 MCP 도구(`ol_*`) — 압축 인지 + TreePatchRequest Staged 제안.

역할 분담 (Python 서버 vs TS 클라이언트):
- 서버(`ol_*`): 압축 트리 맵(`ol_map`), 서브트리 조회(`ol_read`), 검색(`ol_find`),
  `TreePatchRequest` 제안 검증(`nodeId` · `@vibe/ai-scope` 범위 · `docBindings` 보호 · 읽은 근거 검증) 후
  기존 `ProposalStore` 에 저장 -> 기존 `workbench_proposals` SSE 로 프론트 Staged 큐에 전달.
- 클라이언트 TS(`outline.*`): `directive-scanner` · `ir-compiler` · `@vibe/outliner` `applyPatch` 드라이런 및 화면 조작.

`app` 패키지를 import 하지 않는다 (vibefs MCP 프로세스 경량 유지).
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

from harness_kit import packs

from .fs_tools import (
    FsJournal,
    _atomic_write_text,
    assert_not_protected,
    normalize_vault_rel,
    resolve_inside,
)
from .proposals import ProposalStore
from .store import WorkspaceStore

OL_TOOL_SPECS: list[dict[str, Any]] = packs.data("outline:tools.server.json")

ALLOWED_PATCH_OPS = frozenset({
    "replace",
    "complete",
    "uncomplete",
    "insert_after",
    "insert_before",
    "move",
    "delete",
    "set_note",
    "set_node_type",
    "set_file",
    "set_view_mode",
})
TAG_RE = re.compile(r"<<([^>\n]+)>>")
RESOURCE_TAG_RE = re.compile(r"<<\s*resource\s*:\s*([^>\n]*)\s*>>", re.I)
CITE_TAG_RE = re.compile(r"<<\s*cite(?:\s*:\s*[^>\n]+)?\s*>>", re.I)
WIKILINK_RE = re.compile(r"\[\[([^\[\]\n]+)\]\]")
# 여는 근거 태그 — 닫는 `>>` 가 없으면 태그로 인식되지 않아 근거가 통째로 사라진다
OPEN_EVIDENCE_TAG_RE = re.compile(r"<<\s*(?:resource|cite)\b", re.I)
VCLIP_WIKILINK_RE = re.compile(r"\[\[[^\[\]\n]*\.vclip(?:#[^\[\]\n]*)?(?:\|[^\[\]\n]*)?\]\]", re.I)
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif")
_BBOX_ANCHOR_RE = re.compile(
    r"[@#]bbox\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*\)",
    re.I,
)
_ANCHOR_PATTERNS = (
    _BBOX_ANCHOR_RE,
    re.compile(r"#node:[^\s|\]>]+", re.I),
    re.compile(r"#slot:[^\s|\]>]+", re.I),
    re.compile(r"#block:[^\s|\]>]+", re.I),
    re.compile(r"#heading:[^\s|\]>]+", re.I),
    re.compile(r"#L\d+(?:-L?\d+)?\b", re.I),
    re.compile(r"#p\d+\b", re.I),
)


def _is_image_path(path: str) -> bool:
    clean = (path or "").split("?", 1)[0].split("#", 1)[0].strip().lower()
    return clean.endswith(_IMAGE_EXTS)


def _parse_resource_inner(inner: str) -> tuple[str, str, bool]:
    """`<<resource: inner>>` 에서 (target, quote, has_anchor) 를 파싱한다 (공백 포함 로컬 경로 보존)."""
    cleaned_inner = (inner or "").strip()
    if not cleaned_inner:
        return "", "", False
    if "|" in cleaned_inner:
        address_part, quote_raw = cleaned_inner.split("|", 1)
    else:
        address_part, quote_raw = cleaned_inner, ""
    address_part = address_part.strip()
    quote = quote_raw.strip()
    has_anchor = any(rx.search(address_part) for rx in _ANCHOR_PATTERNS)

    wiki = WIKILINK_RE.search(address_part)
    if wiki:
        wiki_inner = (wiki.group(1) or "").strip()
        link_only = wiki_inner.split("|", 1)[0].strip()
        target = link_only.split("#", 1)[0].strip()
        return target, quote, has_anchor

    stripped = address_part
    for rx in _ANCHOR_PATTERNS:
        stripped = rx.sub("", stripped)
    stripped = stripped.strip()
    if re.match(r"^https?://", stripped, re.I):
        target = stripped.split()[0] if stripped else ""
    else:
        target = stripped.split("#", 1)[0].strip()
    return target, quote, has_anchor


def _resolve_vault_resource(vault_root: Path, rel_outline: str, raw_target: str) -> Optional[Path]:
    """로컬 볼트 리소스(파일 또는 `.vclip/` 폴더 번들)의 실재 여부를 확인해 경로를 반환한다."""
    trimmed = raw_target.strip()
    if not trimmed:
        return None
    if trimmed.lower().startswith("vault://"):
        trimmed = trimmed[len("vault://"):]
    elif trimmed.lower().startswith("vault:"):
        trimmed = trimmed[len("vault:"):]
    trimmed = trimmed.replace("\\", "/").strip("/")
    if not trimmed:
        return None

    outline_dir = Path(rel_outline).parent.as_posix()
    if outline_dir == ".":
        outline_dir = ""

    candidates = [trimmed]
    if outline_dir:
        candidates.extend([
            f"{outline_dir}/{trimmed}",
            f"{outline_dir}/sources/{trimmed}",
            f"{outline_dir}/resources/{trimmed}",
        ])
    for cand in candidates:
        try:
            abs_p = resolve_inside(vault_root, cand)
            if abs_p.exists():
                return abs_p
        except ValueError:
            continue

    # 옵시디언식 볼트 내 파일명/번들명 일치 탐색 (예: [[facts.md]], 기사.vclip)
    needle = trimmed.lower()
    base_needle = os.path.basename(needle)
    for dirpath, dirnames, filenames in os.walk(vault_root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for d in list(dirnames):
            if d.lower().endswith(".vclip"):
                full = Path(dirpath) / d
                rel_p = full.relative_to(vault_root).as_posix().lower()
                if rel_p == needle or rel_p.endswith(f"/{needle}") or d.lower() == base_needle:
                    return full
                dirnames.remove(d)
        for f in filenames:
            full = Path(dirpath) / f
            rel_p = full.relative_to(vault_root).as_posix().lower()
            stem = os.path.splitext(f)[0].lower()
            if rel_p == needle or rel_p.endswith(f"/{needle}") or f.lower() == base_needle or stem == base_needle:
                return full
    return None


def _collect_item_texts_and_files(items: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    texts: list[str] = []
    files: list[str] = []

    def walk(arr: list[dict[str, Any]]) -> None:
        for item in arr:
            if not isinstance(item, dict):
                continue
            t = item.get("text")
            if isinstance(t, str):
                texts.append(t)
            fobj = item.get("file")
            if isinstance(fobj, dict) and isinstance(fobj.get("target"), str) and fobj["target"].strip():
                files.append(fobj["target"].strip())
            children = item.get("children")
            if isinstance(children, list) and children:
                walk(children)

    walk(items)
    return texts, files


_READ_FILE_TEXT_EXTS = (".md", ".markdown", ".csv", ".tsv", ".txt", ".json")


def _lint_texts_and_files(
    *,
    vault_root: Path,
    rel_outline: str,
    texts: list[str],
    file_targets: list[str],
    read_paths: set[str],
    enforce_reads: bool = False,
) -> list[str]:
    """공통 `.outline` 근거 린트 — 하드 위반은 ValueError 차단, 소프트 경고는 목록 반환."""
    warnings: list[str] = []

    for ftarget in file_targets:
        if ftarget.lower().endswith(".vclip"):
            raise ValueError(_msg("lintVclipSetFileBlocked", target=ftarget))

    for text in texts:
        # 0-a) 한 불릿 = 한 줄 — 표의 행 · 목록 항목을 줄바꿈(\n 또는 글자 그대로의 '\\n')으로 한 불릿에 몰면 구조가 사라진다
        if "\n" in text or "\\n" in text:
            raise ValueError(_msg("lintMultilineBullet", text=text.replace("\n", " ⏎ ").strip()[:80]))
        # 0) 닫히지 않은 근거 태그 (`<<resource: 경로 | 발췌` 에서 `>>` 누락) — 컴파일에서 인용이 사라진다
        opened = len(OPEN_EVIDENCE_TAG_RE.findall(text))
        closed = len(RESOURCE_TAG_RE.findall(text)) + len(CITE_TAG_RE.findall(text))
        if opened > closed:
            raise ValueError(_msg("lintUnterminatedTag", text=text.strip()[:80]))

        # 1) <<resource:...>> · <<cite:...>> 바깥에 일반 [[...vclip]] 위키링크 금지
        outside_tags = RESOURCE_TAG_RE.sub("", text)
        if not CITE_TAG_RE.search(text):
            vclip_wiki = VCLIP_WIKILINK_RE.search(outside_tags)
            if vclip_wiki:
                raise ValueError(_msg("lintVclipPlainWikilinkBlocked", link=vclip_wiki.group(0)))

        # 2) <<resource: ...>> 대상 검증 · 이미지 네이티브 첨부 강제 · 발췌문 경고 · 열람 대조 경고
        for m in RESOURCE_TAG_RE.finditer(text):
            raw_inner = m.group(1) or ""
            target, quote, has_anchor = _parse_resource_inner(raw_inner)
            if not target:
                raise ValueError(_msg("lintMalformedResourceTag"))
            is_web_url = bool(re.match(r"^https?://", target, re.I))
            if not is_web_url and _is_image_path(target) and not _BBOX_ANCHOR_RE.search(raw_inner):
                raise ValueError(_msg("lintImageUseOutlineFile", target=target))
            if not is_web_url:
                resolved = _resolve_vault_resource(vault_root, rel_outline, target)
                if resolved is None:
                    raise ValueError(_msg("lintMissingResourceTarget", target=target))
                rel_res_l = resolved.relative_to(vault_root).as_posix().lower()
                text_source = resolved.is_dir() and rel_res_l.endswith(".vclip") or rel_res_l.endswith(_READ_FILE_TEXT_EXTS)
                if enforce_reads and text_source:
                    cands = {rel_res_l, f"{rel_res_l}/content.md"} if rel_res_l.endswith(".vclip") else {rel_res_l}
                    if not any(rp.endswith(c) or c.endswith(rp) for rp in read_paths for c in cands):
                        raise ValueError(_msg("lintUnreadResourceBlocked", target=target))
                if read_paths and text_source:
                    rel_res = resolved.relative_to(vault_root).as_posix().lower()
                    cand_rels = {rel_res}
                    if resolved.is_dir() and rel_res.endswith(".vclip"):
                        cand_rels.add(f"{rel_res}/content.md")
                    if not any(
                        rp.endswith(c) or c.endswith(rp)
                        for rp in read_paths
                        for c in cand_rels
                    ):
                        warnings.append(
                            f"[LINT:LINT_UNREAD_RESOURCE_SOURCE] 리소스 '{target}' 는 이 세션에서 read_file 로 읽은 기록이 없습니다."
                        )
            if not quote and not has_anchor:
                warnings.append(
                    f"[LINT:LINT_RESOURCE_WITHOUT_QUOTE] <<resource: {target}>> 에 '| 원문 발췌' 또는 위치 앵커(#p/#L)가 없어 페어 탭 자동 하이라이트가 제한됩니다."
                )

    return warnings


def lint_outline_patch(
    *,
    vault_root: Path,
    rel_outline: str,
    roots: list[dict[str, Any]],
    requests: list[dict[str, Any]],
    node_evidence: Optional[dict[str, Any]] = None,
    reads: Optional[list[dict[str, Any]]] = None,
    enforce_reads: bool = False,
) -> list[str]:
    """`ol_propose_patch` 하드/소프트 근거 린트 게이트.

    `enforce_reads` (실제 MCP 서버): 이 세션에서 read_file 로 읽지 않은 글 원천(.md · .csv · .txt · .vclip …)을
    <<resource:…>> 로 인용하면 차단한다 — 읽은 것만 인용한다. PDF(ws_read_pdf) · .ref(rf_read) · 앱 문서는 다른 도구로 읽으므로 제외.
    """
    if isinstance(node_evidence, dict) and any(
        isinstance(v, list) and len(v) > 0 for v in node_evidence.values()
    ):
        raise ValueError(_msg("lintSidecarEvidenceBlocked"))

    set_file_ids: set[str] = set()
    file_targets: list[str] = []
    texts: list[str] = []

    for req in requests:
        op = str(req.get("op") or "")
        if op == "set_file":
            nid = str(req.get("id") or "").strip()
            if nid:
                set_file_ids.add(nid)
            fobj = req.get("file")
            if isinstance(fobj, dict) and isinstance(fobj.get("target"), str) and fobj["target"].strip():
                file_targets.append(fobj["target"].strip())

    for req in requests:
        op = str(req.get("op") or "")
        if op == "replace":
            nid = str(req.get("id") or "").strip()
            new_text = str(req.get("text") or "")
            texts.append(new_text)
            old_node = _find_node(roots, nid) if nid else None
            old_text = str((old_node or {}).get("text") or "")
            had_evidence_tag = bool(RESOURCE_TAG_RE.search(old_text) or CITE_TAG_RE.search(old_text))
            has_evidence_tag = bool(RESOURCE_TAG_RE.search(new_text) or CITE_TAG_RE.search(new_text))
            if had_evidence_tag and not has_evidence_tag:
                if WIKILINK_RE.search(new_text) or nid in set_file_ids:
                    raise ValueError(_msg("lintResourceStripBlocked", nodeId=nid))
        elif op in ("insert_after", "insert_before"):
            item_texts, item_files = _collect_item_texts_and_files(req.get("items") or [])
            texts.extend(item_texts)
            file_targets.extend(item_files)

    read_paths = {
        str(r.get("path") or "").replace("\\", "/").lower()
        for r in (reads or [])
        if isinstance(r, dict) and r.get("path")
    }
    return _lint_texts_and_files(
        vault_root=vault_root,
        rel_outline=rel_outline,
        texts=texts,
        file_targets=file_targets,
        read_paths=read_paths,
        enforce_reads=enforce_reads,
    )


def _msg(key: str, **kwargs: Any) -> str:
    return packs.message("outline:messages.json", key, **kwargs)


def _imul32(a: int, b: int) -> int:
    return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF


def _fnv1a_hex(text: str) -> str:
    """TS `@vibe/ai-scope` `computeOutlineSubtreeHash` 와 100% 동일한 FNV-1a 지문."""
    h1 = 0x811C9DC5
    h2 = 0x01000193
    for i, ch in enumerate(text):
        c = ord(ch)
        h1 = _imul32(h1 ^ c, 0x01000193)
        h2 = _imul32(h2 ^ (c + (i & 0xFF)), 0x01000193)
    return f"{h1:08x}{h2:08x}"


def _canonical_subtree(node: dict[str, Any]) -> str:
    file_obj = node.get("file")
    if isinstance(file_obj, dict) and file_obj.get("target"):
        opts = json.dumps(file_obj.get("options") or {}, ensure_ascii=False, separators=(",", ":"))
        file_str = f"{file_obj['target']}|{opts}"
    else:
        file_str = ""
    children = ",".join(_canonical_subtree(c) for c in (node.get("children") or []) if isinstance(c, dict))
    completed = 1 if node.get("isCompleted") else 0
    return (
        f"{node.get('id', '')}|{node.get('text', '')}|{node.get('note') or ''}|"
        f"{completed}|{node.get('nodeType') or ''}|{file_str}|[{children}]"
    )


def _find_node(nodes: list[dict[str, Any]], node_id: str) -> Optional[dict[str, Any]]:
    for n in nodes:
        if str(n.get("id") or "") == node_id:
            return n
        hit = _find_node(n.get("children") or [], node_id)
        if hit is not None:
            return hit
    return None


def _collect_ids(nodes: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for n in nodes:
        nid = str(n.get("id") or "")
        if nid:
            out.add(nid)
        out |= _collect_ids(n.get("children") or [])
    return out


def compute_subtree_hash(roots: list[dict[str, Any]], target_node_ids: list[str]) -> str:
    uniq = sorted({nid for nid in target_node_ids if nid})
    if not uniq:
        return _fnv1a_hex(";".join(_canonical_subtree(r) for r in roots))
    parts: list[str] = []
    for nid in uniq:
        node = _find_node(roots, nid)
        parts.append(_canonical_subtree(node) if node is not None else f"{nid}:<missing>")
    return _fnv1a_hex(";".join(parts))


def _normalize_patch_items(raw_items: Any) -> list[dict[str, Any]]:
    """FlatNodeInput 배열 검증 + 중첩 `items` 오기입을 `@vibe/outliner` 표준 `children` 으로 정규화한다."""
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("insert_after/insert_before 는 비어 있지 않은 items 배열이 필요합니다.")
    out: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            raise ValueError("items 의 각 원소는 객체({text, children?})여야 합니다.")
        if "text" not in item or not isinstance(item.get("text"), str):
            raise ValueError("items 의 각 원소에는 문자열 text 필드가 필요합니다.")
        cleaned = dict(item)
        cleaned.pop("id", None)
        nested = cleaned.pop("items", None)
        children = cleaned.get("children")
        if children is None and isinstance(nested, list):
            children = nested
        if isinstance(children, list) and children:
            cleaned["children"] = _normalize_patch_items(children)
        elif "children" in cleaned and not children:
            cleaned.pop("children", None)
        out.append(cleaned)
    return out


def _materialize_outline_nodes(raw_nodes: Any) -> tuple[list[dict[str, Any]], int]:
    """ol_create 초기 rootNodes 입력을 표준 OutlineNode[] 트리로 변환하고 노드 수를 반환한다."""
    if not isinstance(raw_nodes, list) or not raw_nodes:
        return [{"id": f"ol-{uuid.uuid4().hex[:8]}", "text": "", "isFolded": False, "children": []}], 1
    count = 0

    def walk(items: list[Any]) -> list[dict[str, Any]]:
        nonlocal count
        nodes: list[dict[str, Any]] = []
        for raw in items:
            if isinstance(raw, str):
                raw = {"text": raw}
            if not isinstance(raw, dict):
                raise ValueError("rootNodes 각 원소는 {text, note?, file?, children?} 객체여야 합니다.")
            count += 1
            raw_children = raw.get("children")
            if raw_children is None and isinstance(raw.get("items"), list):
                raw_children = raw.get("items")
            node: dict[str, Any] = {
                "id": f"ol-{uuid.uuid4().hex[:8]}",
                "text": str(raw.get("text") or ""),
                "isFolded": bool(raw.get("isFolded", False)),
                "children": walk(raw_children) if isinstance(raw_children, list) and raw_children else [],
            }
            if isinstance(raw.get("note"), str) and raw["note"]:
                node["note"] = raw["note"]
            if isinstance(raw.get("nodeType"), str) and raw["nodeType"]:
                node["nodeType"] = raw["nodeType"]
            if isinstance(raw.get("file"), dict) and raw["file"].get("target"):
                node["file"] = raw["file"]
            nodes.append(node)
        return nodes

    built = walk(raw_nodes)
    return built, count


def _referenced_node_ids(requests: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    for req in requests:
        for key in ("id", "targetId", "under"):
            val = req.get(key)
            if isinstance(val, str) and val.strip():
                ids.append(val.strip())
        raw_ids = req.get("ids")
        if isinstance(raw_ids, list):
            for x in raw_ids:
                if isinstance(x, str) and x.strip():
                    ids.append(x.strip())
    return list(dict.fromkeys(ids))


class OutlineTools:
    """`.outline` 서버 MCP 도구 (`ol_*`)."""

    def __init__(
        self,
        store: WorkspaceStore,
        session_id: str = "",
        *,
        proposals: Optional[ProposalStore] = None,
        reads: Callable[[], list[dict[str, Any]]] = lambda: [],
        conversation_id: str = "",
        vault_root_override: Optional[str] = None,
        enforce_reads: bool = False,
    ) -> None:
        self.store = store
        self.session_id = session_id
        self.proposals = proposals or ProposalStore(store.dir)
        self.journal = FsJournal(store.dir)
        self._reads = reads
        self._enforce_reads = enforce_reads
        self.conversation_id = conversation_id
        self._vault_root_override = vault_root_override

    @staticmethod
    def handles(name: str) -> bool:
        return name.startswith("ol_")

    def _state(self) -> dict[str, Any]:
        return self.store.workbench_for_conversation(self.conversation_id or None, self.session_id or None) or {}

    def _resolve_outline(self, path: str, *, write: bool) -> tuple[Path, str, Path, dict[str, Any], dict[str, Any]]:
        state = self._state()
        raw_root = self._vault_root_override if self._vault_root_override is not None else str(state.get("vaultRoot") or "")
        if not raw_root:
            raise ValueError("로컬 볼트가 연결되어 있지 않습니다.")
        root = Path(raw_root).resolve()
        raw_path = (path or "").strip() or str(state.get("activeOutlinePath") or "").strip()
        if not raw_path:
            raise ValueError("대상 .outline 경로가 없습니다. path 를 지정하거나 .outline 탭을 여세요.")
        rel = normalize_vault_rel(raw_path)
        if not rel.lower().endswith(".outline"):
            raise ValueError(f".outline 파일만 다룰 수 있습니다: {rel}")
        target = resolve_inside(root, rel)
        if not target.is_file():
            raise ValueError(f".outline 파일을 찾을 수 없습니다: {rel}")
        if write:
            if bool(state.get("readOnly")):
                raise ValueError("읽기 전용 볼트에서는 패치를 제출할 수 없습니다.")
            if str(state.get("mode") or "") == "plan":
                raise ValueError("plan 모드에서는 패치를 제출할 수 없습니다.")
        try:
            payload = json.loads(target.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ValueError(f".outline 파싱 실패: {exc}") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("rootNodes"), list):
            raise ValueError(f"유효한 .outline 구조가 아닙니다: {rel}")
        return root, rel, target, payload, state

    def call(self, name: str, args: dict[str, Any]) -> str:
        fn = getattr(self, f"_{name}", None)
        if not name.startswith("ol_") or fn is None:
            raise ValueError(f"알 수 없는 아웃라인 도구: {name}")
        return fn(**(args or {}))

    # --- 읽기 · 검색 --------------------------------------------------------------------------

    def _ol_map(self, path: str = "", rootNodeId: str = "", maxDepth: int = 4, **_: Any) -> str:
        _, rel, _, payload, _ = self._resolve_outline(path, write=False)
        roots: list[dict[str, Any]] = payload["rootNodes"]
        bindings: dict[str, Any] = payload.get("docBindings") or {}
        evidence: dict[str, Any] = payload.get("nodeEvidence") or {}
        limit_depth = max(1, min(int(maxDepth or 4), 10))

        start_nodes = roots
        if rootNodeId:
            hit = _find_node(roots, rootNodeId)
            if hit is None:
                raise ValueError(f"노드를 찾을 수 없습니다: {rootNodeId}")
            start_nodes = [hit]

        lines = [f"[.outline 지도] {rel} · 제목={payload.get('title') or rel} · 바인딩={len(bindings)}건"]

        def walk(nodes: list[dict[str, Any]], depth: int) -> None:
            for n in nodes:
                nid = str(n.get("id") or "")
                text = str(n.get("text") or "").replace("\n", " ").strip()
                snippet = text[:70] + ("…" if len(text) > 70 else "")
                badges: list[str] = []
                tags = TAG_RE.findall(text)
                if tags:
                    badges.append(" ".join(f"<<{t}>>" for t in tags[:2]))
                file_obj = n.get("file")
                if isinstance(file_obj, dict) and file_obj.get("target"):
                    badges.append(f"file:{file_obj['target']}")
                if nid in bindings:
                    vdoc_p = bindings[nid].get("vdocPath", "") if isinstance(bindings[nid], dict) else ""
                    badges.append(f"doc:{vdoc_p}")
                if nid in evidence and isinstance(evidence[nid], list) and evidence[nid]:
                    badges.append(f"ev:{len(evidence[nid])}")
                children = n.get("children") or []
                if children and depth >= limit_depth:
                    badges.append(f"+하위 {len(children)}")
                badge_str = f"  ({', '.join(badges)})" if badges else ""
                lines.append(f"{'  ' * depth}- [{nid}] {snippet or '(빈 불릿)'}{badge_str}")
                if children and depth < limit_depth:
                    walk(children, depth + 1)

        walk(start_nodes, 0)
        return "\n".join(lines[:260])

    def _ol_read(self, path: str = "", nodeId: str = "", depth: int = 3, **_: Any) -> str:
        _, rel, _, payload, _ = self._resolve_outline(path, write=False)
        roots: list[dict[str, Any]] = payload["rootNodes"]
        bindings: dict[str, Any] = payload.get("docBindings") or {}
        evidence: dict[str, Any] = payload.get("nodeEvidence") or {}
        max_depth = max(0, min(int(depth if depth is not None else 3), 10))

        if nodeId:
            hit = _find_node(roots, nodeId)
            if hit is None:
                raise ValueError(f"노드를 찾을 수 없습니다: {nodeId}")
            targets = [hit]
            bhash = compute_subtree_hash(roots, [nodeId])
        else:
            targets = roots
            bhash = compute_subtree_hash(roots, [])

        lines = [f"[.outline 읽기] {rel} · baseHash={bhash}"]

        def render(nodes: list[dict[str, Any]], cur_depth: int) -> None:
            for n in nodes:
                nid = str(n.get("id") or "")
                pad = "  " * cur_depth
                lines.append(f"{pad}- [{nid}] {n.get('text') or ''}")
                if n.get("note"):
                    lines.append(f"{pad}  note: {str(n['note'])[:300]}")
                file_obj = n.get("file")
                if isinstance(file_obj, dict) and file_obj.get("target"):
                    lines.append(f"{pad}  file: {file_obj['target']}")
                if nid in bindings:
                    lines.append(f"{pad}  docBinding: {json.dumps(bindings[nid], ensure_ascii=False)}")
                if nid in evidence and evidence[nid]:
                    lines.append(f"{pad}  nodeEvidence: {json.dumps(evidence[nid], ensure_ascii=False)}")
                children = n.get("children") or []
                if children and cur_depth < max_depth:
                    render(children, cur_depth + 1)
                elif children:
                    lines.append(f"{pad}  (하위 {len(children)}개 생략)")

        render(targets, 0)
        return "\n".join(lines[:350])

    def _ol_find(self, path: str = "", query: str = "", tag: str = "", hasFile: bool = False, **_: Any) -> str:
        _, rel, _, payload, _ = self._resolve_outline(path, write=False)
        q = (query or "").strip().lower()
        t = (tag or "").strip().lower()
        hits: list[str] = []

        def walk(nodes: list[dict[str, Any]]) -> None:
            for n in nodes:
                nid = str(n.get("id") or "")
                text = str(n.get("text") or "")
                note = str(n.get("note") or "")
                file_obj = n.get("file")
                has_f = isinstance(file_obj, dict) and bool(file_obj.get("target"))
                ok = True
                if q and q not in text.lower() and q not in note.lower():
                    ok = False
                if t and f"<<{t}" not in text.lower():
                    ok = False
                if hasFile and not has_f:
                    ok = False
                if ok:
                    f_note = f" [file:{file_obj['target']}]" if has_f else ""
                    hits.append(f"- [{nid}] {text[:90]}{f_note}")
                walk(n.get("children") or [])

        walk(payload["rootNodes"])
        if not hits:
            return f"[검색 0건] {rel}"
        return f"[.outline 검색 {len(hits)}건] {rel}\n" + "\n".join(hits[:80])

    # --- 신규 .outline 생성 --------------------------------------------------------------------

    def _ol_create(
        self,
        path: str = "",
        title: str = "",
        rootNodes: Optional[list[Any]] = None,
        **_: Any,
    ) -> str:
        state = self._state()
        raw_root = self._vault_root_override if self._vault_root_override is not None else str(state.get("vaultRoot") or "")
        if not raw_root:
            raise ValueError("로컬 볼트가 연결되어 있지 않습니다.")
        if bool(state.get("readOnly")):
            raise ValueError("읽기 전용 볼트에서는 .outline 파일을 생성할 수 없습니다.")
        if str(state.get("mode") or "") == "plan":
            raise ValueError("plan 모드에서는 .outline 파일을 생성할 수 없습니다.")
        raw_path = (path or "").strip()
        if not raw_path:
            raise ValueError("생성할 .outline 경로(path)가 필요합니다.")
        if not raw_path.lower().endswith(".outline"):
            raw_path = f"{raw_path}.outline"
        rel = normalize_vault_rel(raw_path)
        assert_not_protected(rel)

        # 사용자가 활성 .outline 에서 블록(들)을 선택해 요청한 경우, 별도 .outline 파일 생성을 차단하고
        # 기존 .outline 의 최상단 선택 블록 바로 하위(insert_after + inside=True)에 1:N <<doc:...>> 가지를 붙이도록 강제한다.
        active_rel_raw = str(state.get("activeOutlinePath") or "").strip()
        active_rel = normalize_vault_rel(active_rel_raw) if active_rel_raw else ""
        raw_scope = state.get("outlineScope") if isinstance(state.get("outlineScope"), dict) else None
        if (
            raw_scope
            and active_rel
            and raw_scope.get("mode") not in (None, "", "document")
            and isinstance(raw_scope.get("allowedNodeIds"), list)
            and raw_scope.get("allowedNodeIds")
        ):
            allowed_ids = [str(x) for x in raw_scope["allowedNodeIds"] if str(x).strip()]
            allowed_set = set(allowed_ids)
            topmost_id = allowed_ids[0]
            try:
                active_abs = resolve_inside(Path(raw_root).resolve(), active_rel)
                if active_abs.exists():
                    active_payload = json.loads(active_abs.read_text(encoding="utf-8"))
                    def _find_topmost(nodes: list[dict[str, Any]]) -> Optional[str]:
                        for n in nodes:
                            nid = str(n.get("id") or "")
                            if nid in allowed_set:
                                return nid
                            hit = _find_topmost(n.get("children") or [])
                            if hit:
                                return hit
                        return None
                    found_top = _find_topmost(active_payload.get("rootNodes") or [])
                    if found_top:
                        topmost_id = found_top
            except Exception:
                pass
            raise ValueError(
                _msg(
                    "olCreateBlockedByOutlineScope",
                    path=rel,
                    activePath=active_rel,
                    scopeLabel=str(raw_scope.get("label") or "선택 블록"),
                    topmostId=topmost_id,
                )
            )
        targets = [normalize_vault_rel(t, allow_empty=True) for t in (state.get("targetFolders") or []) if isinstance(t, str)]
        if targets and not any(t == "" or rel == t or rel.startswith(f"{t}/") for t in targets):
            raise ValueError(f"작업 대상 폴더({', '.join(targets)}) 밖에는 .outline 파일을 생성할 수 없습니다: {rel}")

        root = Path(raw_root).resolve()
        target = resolve_inside(root, rel)
        if target.exists():
            raise ValueError(f"이미 존재하는 .outline 파일입니다: {rel}. 기존 파일 수정은 ol_propose_patch 를 사용하세요.")

        rollback: list[dict[str, Any]] = []
        created_dirs: list[Path] = []
        cur = target.parent
        while cur != root and not cur.exists():
            created_dirs.append(cur)
            cur = cur.parent
        for d in reversed(created_dirs):
            d.mkdir(exist_ok=True)
            rollback.append({"kind": "rmdir_if_empty", "path": d.relative_to(root).as_posix()})

        nodes, node_count = _materialize_outline_nodes(rootNodes)
        create_texts, create_files = _collect_item_texts_and_files(nodes)
        read_paths = {
            str(r.get("path") or "").replace("\\", "/").lower()
            for r in (self._reads() or [])
            if isinstance(r, dict) and r.get("path")
        }
        lint_warnings = _lint_texts_and_files(
            vault_root=root,
            rel_outline=rel,
            texts=create_texts,
            file_targets=create_files,
            read_paths=read_paths,
            enforce_reads=self._enforce_reads,
        )
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        doc_title = (title or "").strip() or target.stem
        payload = {
            "version": 1,
            "id": f"outline-{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}",
            "title": doc_title,
            "defaultView": "bullets",
            "createdAt": now_iso,
            "updatedAt": now_iso,
            "rootNodes": nodes,
        }
        _atomic_write_text(target, json.dumps(payload, ensure_ascii=False, indent=2))
        rollback.append({"kind": "remove_file", "path": rel})

        batch_id = f"fsb-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        self.journal.append({
            "ev": "batch",
            "batchId": batch_id,
            "sessionId": self.session_id,
            "vaultRoot": str(root),
            "summary": f".outline 생성: {rel}",
            "opCount": 1,
            "ops": [f"create {rel} ({node_count}개 노드)"],
            "rollback": rollback,
            "createdAt": time.time(),
            "undone": False,
        })
        warn_note = f"\n경고: {'; '.join(lint_warnings)}" if lint_warnings else ""
        return _msg("createdOutline", batchId=batch_id, path=rel, title=doc_title, nodeCount=node_count) + warn_note

    # --- Staged 패치 제안 & 리소스 연결 -------------------------------------------------------

    def _validate_requests(
        self,
        rel: str,
        roots: list[dict[str, Any]],
        bindings: dict[str, Any],
        state: dict[str, Any],
        requests: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[str]]:
        if not isinstance(requests, list) or not requests:
            raise ValueError("requests(TreePatchRequest 배열)가 비어 있습니다.")
        all_ids = _collect_ids(roots)
        active_rel_raw = str(state.get("activeOutlinePath") or "").strip()
        active_rel = normalize_vault_rel(active_rel_raw) if active_rel_raw else ""
        # outlineScope 는 해당 활성 아웃라인 탭의 노드 ID 범위이므로, 같은 파일일 때만 적용한다
        raw_scope = state.get("outlineScope") if isinstance(state.get("outlineScope"), dict) else None
        if (
            raw_scope
            and active_rel
            and active_rel != rel
            and raw_scope.get("mode") not in (None, "", "document")
            and isinstance(raw_scope.get("allowedNodeIds"), list)
            and raw_scope.get("allowedNodeIds")
        ):
            # 선택 범위가 다른 아웃라인에 걸려 있는데 이 파일을 고치려 하면 범위를 우회하는 것이다.
            raise ValueError(
                _msg("outOfScopeFile", scopeLabel=str(raw_scope.get("label") or "선택 범위"), activePath=active_rel, path=rel)
            )
        scope = raw_scope if raw_scope and (not active_rel or active_rel == rel) else None
        allowed_list = scope.get("allowedNodeIds") if scope else None
        allowed_set = set(str(x) for x in allowed_list) if isinstance(allowed_list, list) else None
        scope_label = str((scope or {}).get("label") or "선택 범위")
        if scope and scope.get("mode") == "off":
            raise ValueError("문서 범위가 꺼져(off) 있어 패치를 제출할 수 없습니다.")

        normalized_reqs: list[dict[str, Any]] = []
        for raw_req in requests:
            if not isinstance(raw_req, dict):
                raise ValueError("각 패치 요청은 객체여야 합니다.")
            req = dict(raw_req)
            op = str(req.get("op") or "")
            if op not in ALLOWED_PATCH_OPS:
                raise ValueError(f"허용되지 않는 TreePatchRequest op: {op}")

            # op별 필수 필드 및 오용 검증 (`@vibe/outliner` applyPatch 계약과 100% 정합)
            if op == "replace":
                if not isinstance(req.get("id"), str) or not req["id"].strip():
                    raise ValueError("replace 에는 대상 노드 id 가 필요합니다.")
                if not isinstance(req.get("text"), str):
                    raise ValueError("replace 에는 문자열 text 가 필요합니다.")
                if req.get("items") or req.get("children"):
                    raise ValueError(_msg("replaceNestedNotAllowed", nodeId=req["id"].strip()))
            elif op in ("insert_after", "insert_before"):
                if not isinstance(req.get("targetId"), str) or not req["targetId"].strip():
                    raise ValueError(f"{op} 에는 기준 노드 targetId 가 필요합니다.")
                req["items"] = _normalize_patch_items(req.get("items"))
            elif op == "move":
                if not isinstance(req.get("ids"), list) or not req["ids"]:
                    raise ValueError("move 에는 이동할 노드 ids 배열이 필요합니다.")
                if not isinstance(req.get("under"), str) or not req["under"].strip():
                    raise ValueError("move 에는 대상 기준 노드 under 가 필요합니다.")
            elif op == "delete":
                if not isinstance(req.get("id"), str) or not req["id"].strip():
                    raise ValueError("delete 에는 대상 노드 id 가 필요합니다.")
            elif op == "set_note":
                if not isinstance(req.get("id"), str) or not req["id"].strip():
                    raise ValueError("set_note 에는 대상 노드 id 가 필요합니다.")
            elif op == "set_file":
                if not isinstance(req.get("id"), str) or not req["id"].strip():
                    raise ValueError("set_file 에는 대상 노드 id 가 필요합니다.")

            refs = _referenced_node_ids([req])
            for nid in refs:
                if nid not in all_ids:
                    raise ValueError(f"존재하지 않는 노드 id 입니다: {nid}")
                if allowed_set is not None and nid not in allowed_set:
                    raise ValueError(_msg("outOfScope", scopeLabel=scope_label, nodeId=nid))

            if op == "delete":
                del_id = str(req.get("id") or "")
                if del_id in bindings:
                    raise ValueError(_msg("docBindingProtected", nodeId=del_id))
                sub = _find_node(roots, del_id)
                if sub is not None and (sub.get("children") or []) and not req.get("recursively"):
                    raise ValueError(_msg("deleteChildrenNeedsRecursive", nodeId=del_id))
                if req.get("recursively") and sub is not None:
                    for desc_id in _collect_ids([sub]):
                        if desc_id in bindings:
                            raise ValueError(_msg("docBindingProtected", nodeId=desc_id))

            normalized_reqs.append(req)

        return normalized_reqs, _referenced_node_ids(normalized_reqs)

    def _verify_evidence(self, node_evidence: dict[str, Any]) -> list[str]:
        warnings: list[str] = []
        if not node_evidence:
            return warnings
        read_paths = {
            str(r.get("path") or "").replace("\\", "/").lower()
            for r in (self._reads() or [])
            if r.get("path")
        }
        if not read_paths:
            return warnings
        for nid, locs in node_evidence.items():
            if not isinstance(locs, list):
                continue
            for loc in locs:
                if not isinstance(loc, dict):
                    continue
                src = str(loc.get("sourcePath") or "").replace("\\", "/").lower()
                if src and not any(rp.endswith(src) or src.endswith(rp) for rp in read_paths):
                    warnings.append(f"노드 {nid} 근거 '{loc.get('sourcePath')}' 는 이 세션에서 read_file 로 읽은 기록이 없습니다.")
        return warnings

    def _ol_propose_patch(
        self,
        path: str = "",
        summary: str = "",
        baseHash: str = "",
        requests: Optional[list[dict[str, Any]]] = None,
        nodeEvidence: Optional[dict[str, Any]] = None,
        **_: Any,
    ) -> str:
        root, rel, _, payload, state = self._resolve_outline(path, write=True)
        roots: list[dict[str, Any]] = payload["rootNodes"]
        bindings: dict[str, Any] = payload.get("docBindings") or {}
        req_list, target_ids = self._validate_requests(rel, roots, bindings, state, list(requests or []))

        computed_hash = compute_subtree_hash(roots, target_ids)
        effective_hash = (baseHash or "").strip() or computed_hash
        if baseHash and baseHash.strip() != computed_hash:
            raise ValueError(f"대상 서브트리가 그사이 변경되었습니다 (baseHash 불일치: 기대={baseHash}, 현재={computed_hash}). ol_read 로 다시 확인하세요.")

        ev_map = nodeEvidence if isinstance(nodeEvidence, dict) else {}
        warnings = lint_outline_patch(
            vault_root=root,
            rel_outline=rel,
            roots=roots,
            requests=req_list,
            node_evidence=ev_map,
            reads=self._reads(),
            enforce_reads=self._enforce_reads,
        )
        proposal_id = f"olp-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        proposal = {
            "id": proposal_id,
            "proposalId": proposal_id,
            "status": "ready",
            "docId": str(payload.get("id") or f"outline:{rel}"),
            "target": f"outline:{rel}",
            "mode": "outline-patch",
            "summary": summary or f".outline 패치 ({len(req_list)}건)",
            "candidates": [],
            "report": {"warnings": warnings},
            "warnings": warnings,
            "createdAt": time.time(),
            "outlinePatch": {
                "path": rel,
                "baseHash": effective_hash,
                "targetNodeIds": target_ids,
                "requests": req_list,
                "nodeEvidence": {},
            },
        }
        self.proposals.save(self.session_id, proposal)
        target_label = ", ".join(target_ids[:4]) + (f" 외 {len(target_ids) - 4}" if len(target_ids) > 4 else "")
        warn_note = f"\n경고: {'; '.join(warnings)}" if warnings else ""
        return _msg("proposalQueued", proposalId=proposal_id, summary=proposal["summary"], count=len(req_list), targets=target_label) + warn_note

    def _ol_attach_resource(
        self,
        path: str = "",
        nodeId: str = "",
        target: str = "",
        mode: str = "resource",
        quote: str = "",
        anchor: str = "",
        caption: str = "",
        insertInside: bool = True,
        **_: Any,
    ) -> str:
        root, rel, _, _, _ = self._resolve_outline(path, write=True)
        res_rel = normalize_vault_rel(target)
        res_abs = resolve_inside(root, res_rel)
        if not res_abs.exists():
            raise ValueError(f"볼트 리소스가 존재하지 않습니다: {res_rel}")

        clean_mode = (mode or "resource").strip().lower()
        name = os.path.basename(res_rel)
        if res_rel.lower().endswith(".vclip") and clean_mode in ("file", "wikilink"):
            raise ValueError(_msg("lintVclipAttachModeBlocked", target=res_rel, mode=clean_mode, nodeId=nodeId))
        if _is_image_path(res_rel) and clean_mode == "resource" and not _BBOX_ANCHOR_RE.search(anchor or ""):
            raise ValueError(_msg("lintImageAttachModeBlocked", target=res_rel, nodeId=nodeId))

        if clean_mode == "resource":
            clean_anchor = (anchor or "").strip()
            clean_quote = " ".join((quote or "").split()).strip()
            addr = f"{res_rel} {clean_anchor}".strip() if clean_anchor else res_rel
            tag_text = f"<<resource: {addr} | {clean_quote}>>" if clean_quote else f"<<resource: {addr}>>"
            reqs = [{"op": "insert_after", "targetId": nodeId, "inside": bool(insertInside), "items": [{"text": tag_text}]}]
            summary = f"근거 리소스 태그 연결: {name}"
        elif clean_mode == "file":
            reqs = [{"op": "set_file", "id": nodeId, "file": {"target": res_rel}}]
            summary = f"리소스 첨부: {name}"
        elif clean_mode == "img-token":
            label = (caption or os.path.splitext(name)[0]).strip()
            reqs = [{"op": "insert_after", "targetId": nodeId, "inside": bool(insertInside), "items": [{"text": f"[img:{label} -> resource:vault:{res_rel}]"}]}]
            summary = f"이미지 토큰 삽입: {name}"
        elif clean_mode == "wikilink":
            stem = os.path.splitext(name)[0] if name.lower().endswith(".md") else name
            reqs = [{"op": "insert_after", "targetId": nodeId, "inside": bool(insertInside), "items": [{"text": f"[[{stem}]]"}]}]
            summary = f"위키링크 삽입: {stem}"
        else:
            raise ValueError(f"지원하지 않는 연결 mode: {mode}")

        return self._ol_propose_patch(path=rel, summary=summary, requests=reqs)
