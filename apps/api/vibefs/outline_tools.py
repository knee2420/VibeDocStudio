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
    ) -> None:
        self.store = store
        self.session_id = session_id
        self.proposals = proposals or ProposalStore(store.dir)
        self.journal = FsJournal(store.dir)
        self._reads = reads
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
        return _msg("createdOutline", batchId=batch_id, path=rel, title=doc_title, nodeCount=node_count)

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
        scope = (
            state.get("outlineScope")
            if isinstance(state.get("outlineScope"), dict) and (not active_rel or active_rel == rel)
            else None
        )
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
        _, rel, _, payload, state = self._resolve_outline(path, write=True)
        roots: list[dict[str, Any]] = payload["rootNodes"]
        bindings: dict[str, Any] = payload.get("docBindings") or {}
        req_list, target_ids = self._validate_requests(rel, roots, bindings, state, list(requests or []))

        computed_hash = compute_subtree_hash(roots, target_ids)
        effective_hash = (baseHash or "").strip() or computed_hash
        if baseHash and baseHash.strip() != computed_hash:
            raise ValueError(f"대상 서브트리가 그사이 변경되었습니다 (baseHash 불일치: 기대={baseHash}, 현재={computed_hash}). ol_read 로 다시 확인하세요.")

        ev_map = nodeEvidence if isinstance(nodeEvidence, dict) else {}
        warnings = self._verify_evidence(ev_map)
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
                "nodeEvidence": ev_map,
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
        mode: str = "file",
        caption: str = "",
        insertInside: bool = True,
        **_: Any,
    ) -> str:
        root, rel, _, _, _ = self._resolve_outline(path, write=True)
        res_rel = normalize_vault_rel(target)
        res_abs = resolve_inside(root, res_rel)
        if not res_abs.exists():
            raise ValueError(f"볼트 리소스가 존재하지 않습니다: {res_rel}")

        clean_mode = (mode or "file").strip().lower()
        name = os.path.basename(res_rel)
        if clean_mode == "file":
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

        ev = {
            nodeId: [
                {
                    "kind": "resource",
                    "refId": f"vault:{res_rel}",
                    "label": name,
                    "sourcePath": res_rel,
                }
            ]
        }
        return self._ol_propose_patch(path=rel, summary=summary, requests=reqs, nodeEvidence=ev)
