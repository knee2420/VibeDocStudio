"""문서 짓기 도구 (dc_*) — 에이전트가 새 문서를 만들고, 지정 문서를 전환해 블록을 쌓고, 글을 채우고, 레퍼런스 뼈대와 견줘 본다.

  dc_new     새 문서 (프로젝트에 연결 · 지면 · 장르) — 이 세션의 작업대가 그 문서를 가리키게 된다
  dc_use     프로젝트 내 기존 문서를 지금 대화의 작업 문서로 전환한다 (빈 문서면 바로 dc_build 가능)
  dc_build   한 번에 여러 작업: 쪽 추가 · 블록 추가(heading · text · image · gallery · link-card · divider · hero · callout)
             · 글 바꾸기 · 속성 · 옮기기 · 지우기 — 서버가 바로 저장한다 (화면이 열려 있지 않아도 된다)
  dc_outline 지금 문서의 구조 (쪽 → 블록 id · 종류 · 사진 · 글 앞부분)
  dc_check   배치 · 사진 · 빈 칸 점검 + 레퍼런스 뼈대(rf_skeleton)와의 차이
  dc_source_pages  마운트된 서식 원문(hwpx)의 쪽 목록 — 쪽마다 첫 글 · 표 수 · 빈 칸 수
  dc_import        서식 원문의 쪽들을 모양 그대로(표 병합 · 너비 · 테두리 · 글자 모양) 원문 쪽 하나 = 쪽 하나로 붙인다.
                   서식은 에이전트가 dc_build 로 다시 그리지 않는다 — 옮기는 것은 코드(`hwpx_vdoc`)가 한다.

구조(블록 · 쪽)까지 바꾸는 것은 에이전트가 만든 초안(`origin.createdBy == "agent"` 또는 `agentComposed`) · 지정된 빈 초안 문서만이다.
이미 사람이 블록을 채운 문서는 지금처럼 칸 내용 변경안(slots.proposeBatch · wb_propose)으로만 고친다.
문서는 API(`/api/documents`)로 읽고 쓴다 — 저장 버전 · 개정 이력 · 프로젝트 연결이 사람 편집과 같은 길로 남는다.
"""
from __future__ import annotations

import html as html_lib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

import pymupdf
from docstruct_engine import (
    TableIR,
    WindowsOcrAdapter,
    apply_reread_patch,
    build_doc_ir,
    reread_plan,
    verify_doc,
)
from docstruct_engine.cache import (
    append_read_record,
    doc_cache_dir,
    file_src_hash,
    load_page_ir,
    read_records,
    save_page_ir,
)
from docstruct_engine.ir.model import DocIR, PageIR, bbox_center, point_in_bbox
from docstruct_engine.tables import reconcile_table, render_table_proposal_html
from docstruct_engine.acquire import doc_text, hwpx
from docstruct_engine.compile import docstruct_vdoc, hwpx_vdoc
from docstruct_engine.compile.vdoc_build import (
    blank_page,
    block_slot_ids,
    drain_dropped,
    make_block,
    media_sources,
    reject_table_html,
    sanitize_html,
    unstyled_marker_paragraphs,
)
from harness_kit import packs, patterns
from harness_kit.text import html_to_text

#: dc_* 도구 명세 · 결과 글 — 하네스 editor 팩
MSG = "editor:messages.json"
_PARAS = re.compile(r"<(?:p|li)\b[^>]*>.*?</(?:p|li)>", re.S | re.I)
DC_TOOL_SPECS: list[dict[str, Any]] = packs.tool_specs("editor", "tools.compose.json")

API_BASE = os.environ.get("VIBE_API_BASE", "http://127.0.0.1:8090").rstrip("/")
#: 원문 쪽을 서식 그대로 가져올 수 있는 형식 → 파서 (`dc_source_pages` · `dc_import`)
IMPORTERS: dict[str, Callable[[str], Any]] = {".hwpx": hwpx.parse}
DOCSTRUCT_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
#: 블록 속성 중 dc_build props 로 바꿀 수 있는 것 (종류별)
_PROPS: dict[str, set[str]] = {
    "heading": {"align", "decoration", "accent", "level"},
    "text": {"align"},
    "image": {"src", "caption", "width", "align", "maxHeight", "alt"},
    "columns-grid": {"gap", "widths"},
    "link-card": {"url", "thumbnail", "layout", "width", "domain"},
    "divider": {"variant", "spacing"},
    "hero": {"image", "height", "overlay", "align"},
    "callout-box": {"tone"},
}


def _clip(text: str, n: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


class _Api:
    def __init__(self, base: str = API_BASE, timeout: float = 30.0) -> None:
        self.base = base
        self.timeout = timeout

    def call(self, method: str, path: str, body: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 — 로컬 API
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise ValueError(f"문서 API 오류 {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ValueError(f"문서 API 에 닿지 못했다 ({self.base}): {exc.reason}") from exc
        return json.loads(raw.decode("utf-8")) if raw else {}


class DocTools:
    def __init__(self, store: Any, session_id: str, index: Any = None, api: Optional[_Api] = None,
                 state: Optional[Callable[[], dict[str, Any]]] = None,
                 ocr_port: Optional[Any] = None) -> None:
        self.store = store
        self.session_id = session_id
        self.index = index
        self.api = api or _Api()
        self._state = state
        self._ocr_port = ocr_port

    @staticmethod
    def handles(name: str) -> bool:
        return name.startswith("dc_")

    def call(self, name: str, args: dict[str, Any]) -> str:
        args.pop("toolSummary", None)
        fn = getattr(self, "_" + name, None)
        if fn is None:
            raise ValueError(f"알 수 없는 문서 도구: {name}")
        return fn(**args)

    # --- 작업대 상태 ---------------------------------------------------------------------------

    def _wb_state(self) -> dict[str, Any]:
        if self._state is not None:
            return dict(self._state() or {})
        return dict(self.store.workbench_for(self.session_id) or {})

    def _set_state(self, **changes: Any) -> None:
        state = {**self._wb_state(), **changes}
        state.pop("updatedAt", None)
        self.store.set_workbench(self.session_id, state)

    def _doc_id(self, doc: str = "") -> str:
        doc_id = str(doc or self._wb_state().get("docId") or "").strip()
        if not doc_id:
            raise ValueError(packs.message(MSG, "compose.noDoc"))
        return doc_id

    def _load(self, doc: str = "") -> dict[str, Any]:
        doc_id = self._doc_id(doc)
        return self.api.call("GET", f"/api/documents/{doc_id}")["document"]

    def _save(self, doc: dict[str, Any], slot_ids: list[str], label: str) -> dict[str, Any]:
        body = {"document": doc, "baseRevision": doc.get("revision"),
                "changes": [{"slotIds": slot_ids[:200], "author": "ai", "label": label, "runId": self.session_id or None}]}
        return self.api.call("PUT", f"/api/documents/{doc['docId']}", body)["document"]

    @staticmethod
    def _is_empty_draft(doc: dict[str, Any]) -> bool:
        pages = doc.get("pages") or []
        if any(p.get("blocks") for p in pages):
            return False
        slots = doc.get("slots") or {}
        return all(not html_to_text(str((s or {}).get("content") or "")).strip() for s in slots.values())

    def _require_agent_draft(self, doc: dict[str, Any]) -> None:
        origin = doc.get("origin") or {}
        if str(origin.get("createdBy") or "") == "agent" or origin.get("agentComposed") is True:
            return
        state = self._wb_state()
        doc_id = str(doc.get("docId") or "")
        adopted = set(state.get("adoptedDocs") or [])
        if self._is_empty_draft(doc) and doc_id and (doc_id in adopted or doc_id == str(state.get("designatedDocId") or "")):
            return
        if self._is_empty_draft(doc) and doc_id:
            raise ValueError(packs.message(MSG, "compose.notAgentDraft") + f" (빈 문서라면 먼저 dc_use(doc='{doc_id}') 로 지정한다)")
        raise ValueError(packs.message(MSG, "compose.notAgentDraft"))

    def _resolve_doc_id(self, doc: str, state: dict[str, Any]) -> str:
        target = str(doc or "").strip()
        if target.startswith("doc:"):
            target = target[4:].strip()
        if not target:
            raise ValueError(packs.message(MSG, "compose.noDoc"))
        docs = [d for d in (state.get("projectDocs") or []) if isinstance(d, dict) and d.get("docId")]
        for d in docs:
            if str(d.get("docId")) == target:
                return target
        lowered = target.casefold()
        exact_title = [str(d["docId"]) for d in docs if str(d.get("title") or "").strip().casefold() == lowered]
        if len(exact_title) == 1:
            return exact_title[0]
        partial = [str(d["docId"]) for d in docs if lowered in str(d.get("title") or "").casefold()]
        if len(partial) == 1:
            return partial[0]
        root = state.get("documentsRoot") or (os.path.dirname(os.path.dirname(state["docPath"])) if state.get("docPath") else "")
        if root and os.path.isdir(root):
            if os.path.isfile(os.path.join(root, target, "document.vdoc.json")):
                return target
            project_id = str(state.get("projectId") or "").strip()
            matches: list[str] = []
            for entry in sorted(os.listdir(root)):
                path = os.path.join(root, entry, "document.vdoc.json")
                if not os.path.isfile(path):
                    continue
                try:
                    with open(path, "r", encoding="utf-8") as fh:
                        meta = json.load(fh)
                except (OSError, ValueError):
                    continue
                if project_id and str(meta.get("projectId") or "") != project_id:
                    continue
                if str(meta.get("title") or "").strip().casefold() == lowered:
                    return str(meta.get("docId") or entry)
                if lowered in str(meta.get("title") or "").casefold():
                    matches.append(str(meta.get("docId") or entry))
            if len(matches) == 1:
                return matches[0]
        if target.startswith("vdoc"):
            return target
        raise ValueError(packs.message(MSG, "compose.notFound", doc=target))

    # --- 자료(리소스) 사진 확인 ----------------------------------------------------------------

    def _resource_ids(self) -> dict[str, str]:
        if self.index is None:
            return {}
        out = {}
        for entry in getattr(self.index, "files", []):
            if entry.resource_id and os.path.splitext(entry.abs_path)[1].lower() in _IMG_EXT:
                out[entry.resource_id] = entry.rel
        return out

    def _check_src(self, src: str, known: dict[str, str]) -> None:
        src = str(src or "").strip()
        if not src:
            return
        if not src.startswith("resource:"):
            raise ValueError(packs.message(MSG, "compose.srcNotResource", src=src[:80]))
        rid = src[len("resource:"):]
        if known and rid not in known:
            raise ValueError(packs.message(MSG, "compose.srcUnknown", src=src))

    # --- 도구 ----------------------------------------------------------------------------------

    def _dc_new(self, title: str = "", surface: str = "scroll", genre: str = "blog", width: Any = None, **_: Any) -> str:
        state = self._wb_state()
        project_id = str(state.get("projectId") or "").strip()
        if not project_id:
            raise ValueError(packs.message(MSG, "compose.noProject"))
        body = {"projectId": project_id, "title": title or "새 글", "surface": "scroll" if surface == "scroll" else "paged",
                "genre": str(genre or "blog"), "createdBy": "agent", "sessionId": self.session_id}
        if width:
            body["surfaceWidth"] = int(width)
        doc = self.api.call("POST", "/api/documents", body)["document"]
        root = state.get("documentsRoot") or (os.path.dirname(os.path.dirname(state["docPath"])) if state.get("docPath") else "")
        doc_path = os.path.join(root, doc["docId"], "document.vdoc.json") if root else None
        docs_list = [d for d in (state.get("projectDocs") or []) if isinstance(d, dict) and d.get("docId") != doc["docId"]]
        docs_list.append({
            "docId": doc["docId"],
            "title": doc["title"],
            "surface": (doc.get("surface") or {}).get("kind", "scroll"),
            "pages": len(doc.get("pages") or []),
            "blocks": 0,
        })
        self._set_state(docId=doc["docId"], docPath=doc_path, scope={"mode": "doc"}, selection=[], projectDocs=docs_list)
        page = doc["pages"][0]
        return packs.message(MSG, "compose.created", docId=doc["docId"], title=doc["title"], surface=doc["surface"]["kind"],
                             genre=doc.get("genre"), pageId=page["pageId"])

    def _dc_use(self, doc: str = "", **_: Any) -> str:
        state = self._wb_state()
        resolved_id = self._resolve_doc_id(doc, state)
        try:
            loaded = self.api.call("GET", f"/api/documents/{resolved_id}")["document"]
        except ValueError as exc:
            raise ValueError(packs.message(MSG, "compose.notFound", doc=doc)) from exc
        root = state.get("documentsRoot") or (os.path.dirname(os.path.dirname(state["docPath"])) if state.get("docPath") else "")
        doc_path = os.path.join(root, loaded["docId"], "document.vdoc.json") if root else None
        is_empty = self._is_empty_draft(loaded)
        adopted = list(dict.fromkeys([*(state.get("adoptedDocs") or []), *([loaded["docId"]] if is_empty else [])]))
        blocks_count = sum(len(p.get("blocks") or []) for p in loaded.get("pages") or [])
        docs_list = [d for d in (state.get("projectDocs") or []) if isinstance(d, dict) and d.get("docId") != loaded["docId"]]
        docs_list.append({
            "docId": loaded["docId"],
            "title": loaded.get("title") or loaded["docId"],
            "surface": (loaded.get("surface") or {}).get("kind", "paged"),
            "pages": len(loaded.get("pages") or []),
            "blocks": blocks_count,
        })
        self._set_state(docId=loaded["docId"], docPath=doc_path, scope={"mode": "doc"},
                        selection=[], adoptedDocs=adopted, projectDocs=docs_list)
        head = packs.message(
            MSG, "compose.selected",
            docId=loaded["docId"],
            title=loaded.get("title") or loaded["docId"],
            surface=(loaded.get("surface") or {}).get("kind", "paged"),
            genre=loaded.get("genre") or "blog",
            pages=len(loaded.get("pages") or []),
            blocks=blocks_count,
        )
        origin = loaded.get("origin") or {}
        can_compose = is_empty or str(origin.get("createdBy") or "") == "agent" or origin.get("agentComposed") is True
        hint = (
            "\n지금 비어 있거나 에이전트 초안이므로 곧바로 dc_build(ops=[…]) 로 쪽 · 블록을 지을 수 있다."
            if can_compose
            else f"\n참고: 이미 블록 {blocks_count}개가 있는 문서다 — 구조(dc_build)는 바꾸지 말고 칸 내용은 slots.proposeBatch 로 제안한다."
        )
        return head + hint + "\n" + self._outline(loaded)

    def _dc_outline(self, doc: str = "", page: str = "", **_: Any) -> str:
        data = self._load(doc)
        return self._outline(data, page)

    def _outline(self, data: dict[str, Any], page: str = "") -> str:
        slots = data.get("slots") or {}
        rows = [f"[문서 구조] {data.get('docId')} 「{data.get('title')}」 · 지면 {(data.get('surface') or {}).get('kind', 'paged')} · "
                f"쪽 {len(data.get('pages') or [])} · rev {data.get('revision')}"]
        for i, pg in enumerate(data.get("pages") or [], start=1):
            if page and page not in (pg.get("pageId"), str(i), f"p{i}"):
                continue
            rows.append(f"■ p{i} {pg.get('pageId')} 「{pg.get('pageLabel', '')}」 블록 {len(pg.get('blocks') or [])}")
            for b in pg.get("blocks") or []:
                kind = b.get("kind")
                text = " / ".join(html_to_text(str((slots.get(s) or {}).get("content") or "")) for s in block_slot_ids(b))
                media = media_sources(b)
                extra = f" 사진 {len(media)}장[{', '.join(m.replace('resource:', '') for m in media[:4])}]" if media else ""
                tag = patterns.layout_token({**b, "text": text})
                rows.append(f"   {b.get('blockId')} {kind}({tag}){extra} — {_clip(text, 60)}")
        return "\n".join(rows)

    def _dc_build(self, ops: Any = None, doc: str = "", **_: Any) -> str:
        if isinstance(ops, str):
            try:
                ops = json.loads(ops)
            except ValueError as exc:
                raise ValueError(f"ops 는 JSON 배열이다: {exc}") from exc
        if isinstance(ops, dict):
            ops = [ops]
        if not isinstance(ops, list) or not ops:
            raise ValueError("ops 에 작업을 하나 이상 넣는다 (예: [{\"op\":\"add\",\"kind\":\"heading\",\"text\":\"…\"}]).")
        if len(ops) > 60:
            raise ValueError("한 번에 60개까지 — 섹션 단위로 나눠 부른다.")
        data = self._load(doc)
        self._require_agent_draft(data)
        known = self._resource_ids()
        surface = (data.get("surface") or {}).get("kind", "paged")
        width = (data.get("surface") or {}).get("width")
        pages: list[dict[str, Any]] = data.setdefault("pages", [])
        slots: dict[str, Any] = data.setdefault("slots", {})
        alias: dict[str, str] = {}
        touched: list[str] = []
        notes: list[str] = []
        seq = [0]

        def uid() -> str:
            seq[0] += 1
            return f"{int(time.time() * 1000) % 10_000_000:x}{seq[0]:02d}"

        def resolve(ref: Any) -> str:
            ref = str(ref or "").strip()
            return alias.get(ref, ref)

        def find_page(ref: Any) -> dict[str, Any]:
            ref = resolve(ref)
            if not ref or ref == "last":
                return pages[-1]
            for i, pg in enumerate(pages, start=1):
                if ref in (pg.get("pageId"), str(i), f"p{i}"):
                    return pg
            raise ValueError(f"쪽 {ref} 이 없다 (p1~p{len(pages)} 또는 pageId).")

        def find_block(ref: Any) -> tuple[dict[str, Any], dict[str, Any], int]:
            ref = resolve(ref)
            for pg in pages:
                for i, b in enumerate(pg.get("blocks") or []):
                    if b.get("blockId") == ref:
                        return pg, b, i
            raise ValueError(f"블록 {ref} 이 없다 — dc_outline 으로 id 를 본다.")

        drain_dropped()  # 이전 호출의 찌꺼기를 비운다 — 이번 작업에서 지운 것만 보고한다
        for n, op in enumerate(ops, start=1):
            if not isinstance(op, dict):
                raise ValueError(f"{n}번 작업이 객체가 아니다.")
            kind_op = str(op.get("op") or ("add" if op.get("kind") else "")).strip()
            try:
                if kind_op == "page":
                    pid = f"{data['docId']}_p{uid()}"
                    pg, pslots = blank_page(pid, len(pages) + 1, surface=surface, surface_width=width,
                                            label=str(op.get("label") or "")[:40])
                    if op.get("after"):
                        at = pages.index(find_page(op["after"])) + 1
                        pages.insert(at, pg)
                    else:
                        pages.append(pg)
                    for i, p in enumerate(pages, start=1):
                        p["pageNumber"] = i
                    slots.update(pslots)
                    if op.get("as"):
                        alias[str(op["as"])] = pid
                    notes.append(f"쪽 +{pid}")
                elif kind_op == "add":
                    kind = str(op.get("kind") or "")
                    spec = {k: v for k, v in op.items() if k not in ("op", "kind", "page", "after", "before", "as")}
                    for src in ([spec.get("src"), spec.get("thumbnail"), spec.get("image")]
                                + [i if isinstance(i, str) else (i or {}).get("src") for i in (spec.get("images") or [])]):
                        if src:
                            self._check_src(str(src), known)
                    block, bslots = make_block(kind, spec, uid())
                    pg = find_page(op.get("page"))
                    blocks = pg.setdefault("blocks", [])
                    if op.get("after"):
                        tpg, _, idx = find_block(op["after"])
                        if tpg is not pg:
                            pg, blocks = tpg, tpg.setdefault("blocks", [])
                        blocks.insert(idx + 1, block)
                    elif op.get("before"):
                        tpg, _, idx = find_block(op["before"])
                        if tpg is not pg:
                            pg, blocks = tpg, tpg.setdefault("blocks", [])
                        blocks.insert(idx, block)
                    else:
                        blocks.append(block)
                    slots.update(bslots)
                    touched += list(bslots)
                    if op.get("as"):
                        alias[str(op["as"])] = block["blockId"]
                    notes.append(f"{block['blockId']} {kind}")
                elif kind_op == "set":
                    sid = resolve(op.get("slot"))
                    if not sid and op.get("block"):
                        _, b, _ = find_block(op["block"])
                        ids = block_slot_ids(b)
                        sid = ids[0] if ids else ""
                    if sid not in slots:
                        raise ValueError(f"칸 {sid or '(없음)'} 이 없다.")
                    if (slots[sid].get("constraints") or {}).get("locked"):
                        raise ValueError(f"칸 {sid} 은 잠겨 있다.")
                    reject_table_html(op.get("html") or op.get("text"))
                    slots[sid] = {**slots[sid], "content": sanitize_html(op.get("html") or op.get("text") or "")}
                    touched.append(sid)
                    notes.append(f"글 {sid}")
                elif kind_op == "props":
                    _, b, _ = find_block(op.get("block"))
                    allowed = _PROPS.get(str(b.get("kind")), set())
                    for key, value in op.items():
                        if key in ("op", "block"):
                            continue
                        if key in ("text", "html"):  # 글은 블록의 첫 칸으로 (set 과 같다)
                            ids = block_slot_ids(b)
                            if not ids:
                                raise ValueError(f"{b.get('kind')} 블록에는 글 칸이 없다.")
                            reject_table_html(value)
                            slots[ids[0]] = {**slots[ids[0]], "content": sanitize_html(value) if b.get("kind") != "heading"
                                             else f"<p>{html_lib.escape(' '.join(str(value).split()))}</p>"}
                            touched.append(ids[0])
                            continue
                        if key == "images" and b.get("kind") == "columns-grid":
                            new_block, _ = make_block("gallery", {"images": value, "height": op.get("height")}, uid())
                            for v in media_sources(new_block):
                                self._check_src(v, known)
                            b["columns"], b["widths"] = new_block["columns"], new_block["widths"]
                            b["title"] = new_block["title"]
                            continue
                        if key not in allowed:
                            raise ValueError(f"{b.get('kind')} 블록에서 바꿀 수 없는 속성: {key} (가능: {', '.join(sorted(allowed)) or '없음'})")
                        if key in ("src", "thumbnail", "image"):
                            self._check_src(str(value), known)
                        b[key] = value
                    notes.append(f"속성 {b.get('blockId')}")
                elif kind_op == "move":
                    src_pg, b, idx = find_block(op.get("block"))
                    src_pg["blocks"].pop(idx)
                    if op.get("after"):
                        tpg, _, tidx = find_block(op["after"])
                        tpg["blocks"].insert(tidx + 1, b)
                    elif op.get("before"):
                        tpg, _, tidx = find_block(op["before"])
                        tpg["blocks"].insert(tidx, b)
                    else:
                        find_page(op.get("page")).setdefault("blocks", []).append(b)
                    notes.append(f"옮김 {b.get('blockId')}")
                elif kind_op == "remove":
                    pg, b, idx = find_block(op.get("block"))
                    pg["blocks"].pop(idx)
                    for sid in block_slot_ids(b):
                        slots.pop(sid, None)
                    notes.append(f"지움 {b.get('blockId')}")
                elif kind_op == "title":
                    data["title"] = " ".join(str(op.get("text") or "").split())[:120] or data.get("title")
                    notes.append("제목")
                else:
                    raise ValueError(f"모르는 작업 '{kind_op}' (page · add · set · props · move · remove · title)")
            except ValueError as exc:
                raise ValueError(packs.message(MSG, "compose.opFailed", n=n, op=kind_op, kind=op.get("kind") or "", error=exc)) from exc
        origin = data.setdefault("origin", {})
        if str(origin.get("createdBy") or "") != "agent":
            origin["agentComposed"] = True
        saved = self._save(data, touched, "dc_build")
        alias_line = (" · 별칭 " + ", ".join(f"{k}={v}" for k, v in alias.items())) if alias else ""
        head = packs.message(MSG, "compose.saved", docId=saved.get("docId") or data.get("docId"),
                             revision=saved.get("revision"), count=len(ops),
                             notes=", ".join(notes[:12]) + (" …" if len(notes) > 12 else ""), aliases=alias_line)
        dropped = drain_dropped()
        if dropped:
            head += packs.message(MSG, "compose.dropped", items=", ".join(f"{k}×{v}" for k, v in sorted(dropped.items())))
        return head + "\n" + self._outline(saved)

    @staticmethod
    def _hints(theirs: dict[str, Any], mine: dict[str, Any], set_name: str) -> list[str]:
        """층위 세트의 수치 지표가 레퍼런스와 30% 넘게 다르면 고치는 방법 한 줄씩 (방법은 팩 데이터)."""
        table = packs.data(MSG)["compose"]["hints"]
        counts = patterns.count_metrics()
        out = []
        for layer in patterns.layer_set(set_name):
            for key in layer.get("metrics") or []:
                hint = table.get(key) if key not in counts else None
                a, b = theirs.get(key), mine.get(key)
                if not isinstance(hint, dict) or isinstance(a, bool) or isinstance(b, bool):
                    continue
                if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
                    continue
                if max(abs(a), abs(b)) == 0 or abs(a - b) / max(abs(a), abs(b)) <= 0.3:
                    continue
                way = hint.get("low" if b < a else "high")
                if way:
                    out.append(packs.message(MSG, "compose.hintLine", metric=key, theirs=a, mine=b, hint=way))
        return out

    @staticmethod
    def _ref_metrics(ref_dir: str, pages: str) -> tuple[dict[str, Any], str, str, list[dict[str, Any]]]:
        """레퍼런스 지표: 추출본이 있으면 지정한 쪽 범위(예 '1-23')만 다시 잰다 — 사용자가 '23쪽까지'라고 했으면
        붙임 서식까지 섞인 전체 값과 견주지 않는다. 추출본이 없으면 저장된 전체 측정값.
        (지표, 층위 세트, 범위 글, 범위 안 추출 블록)"""
        try:
            with open(os.path.join(ref_dir, "layers.json"), encoding="utf-8") as fh:
                stored = json.load(fh)
        except (OSError, ValueError):
            stored = {}
        set_name = stored.get("set") or "blog"
        m = re.match(r"^\s*(\d+)\s*(?:-\s*(\d+))?\s*$", str(pages or ""))
        try:
            with open(os.path.join(ref_dir, "extraction.json"), encoding="utf-8") as fh:
                ex = json.load(fh)
        except (OSError, ValueError):
            ex = {}
        blocks = [b for b in ex.get("blocks") or [] if isinstance(b, dict)]
        if blocks and (m or set_name == "document"):
            lo, hi = (int(m.group(1)), int(m.group(2) or m.group(1))) if m else (1, 10 ** 6)
            picked = [b for b in blocks if lo <= int(b.get("page") or 0) <= hi]
            if picked:
                kinds = sorted({str(b.get("kind") or "") for b in picked})
                metrics = patterns.measure_all([str(b.get("html") or "") for b in picked], kinds, picked)
                return metrics, set_name, (f"{lo}-{hi}쪽" if m else ""), picked
        return stored.get("metrics") or {}, set_name, "", blocks

    @staticmethod
    def _skeleton_rows(ref_blocks: list[dict[str, Any]], blocks: list[dict[str, Any]], scope: str) -> list[str]:
        """레퍼런스 범위의 장 · 절(번호 · 단계 · 제목) 대비 내 문서 — 빠진 절 · 같은 자리인데 제목이 다른 절."""
        not_table = lambda k: "table" not in str(k or "")  # noqa: E731
        theirs = patterns.section_lines((str(b.get("text") or ""), str(b.get("kind") or ""))
                                        for b in ref_blocks if not_table(b.get("kind")))
        if not theirs:
            return []
        mine = patterns.section_lines((b["text"], str(b.get("kind") or "")) for b in blocks if not_table(b.get("kind")))
        d = patterns.skeleton_diff(theirs, mine)
        where = lambda s: " > ".join(s["path"].split("/")[:-1] + [s["label"]])  # noqa: E731
        rows = [packs.message(MSG, "compose.skeleton.head", scope=f" {scope}" if scope else "", total=d["total"], kept=len(d["kept"]),
                              theirs=" · ".join(d["theirs_scheme"]) or "-", mine=" · ".join(d["mine_scheme"]) or "-")]
        if d["missing"]:
            rows.append(packs.message(MSG, "compose.skeleton.missing", items=", ".join(where(s) for s in d["missing"][:12])))
        if d["renamed"]:
            rows.append(packs.message(MSG, "compose.skeleton.renamed", items=", ".join(
                f"{where(r)} ← {s['label']}" for r, s in d["renamed"][:8])))
        if d["missing"] or d["renamed"]:
            rows.append(packs.message(MSG, "compose.skeleton.hint"))
        return rows

    @staticmethod
    def _marker_hint(theirs: dict[str, Any], mine: dict[str, Any]) -> list[str]:
        """레퍼런스가 쓰는 글머리 단계(❏ ○ - ※ …) 중 내 문서에 없는 것 — 장 · 절 번호는 뼈대 점검이 맡는다."""
        lex = packs.data(patterns.LEXICON)["measure"]
        glyph = {m["label"]: m.get("glyph") or m["label"] for m in lex.get("markers") or []}
        sections = set((lex.get("sections") or {}).get("markers") or [])
        ref_b = [m for m in theirs.get("marker_scheme") or [] if m not in sections]
        mine_b = set(mine.get("marker_scheme") or [])
        missing = [m for m in ref_b if m not in mine_b]
        if not ref_b or not missing:
            return []
        return [packs.message(MSG, "compose.markerHint", theirs=" ".join(glyph.get(m, m) for m in ref_b),
                              missing=" ".join(glyph.get(m, m) for m in missing))]

    @staticmethod
    def _genre_rows(title: str, doctype: str, text: str) -> list[str]:
        genre = patterns.genre_of(title, doctype)
        if not genre:
            return []
        items = patterns.genre_items(genre, text)
        absent = [it["label"] for it in items if not it["present"]]
        row = packs.message(MSG, "compose.genre.head", label=genre.get("label") or genre["id"], total=len(items),
                            have=len(items) - len(absent))
        if absent:
            row += packs.message(MSG, "compose.genre.missing", items=", ".join(absent),
                                 placeholder=packs.data(patterns.GENRES).get("placeholder") or "")
        return [row]

    def _dc_check(self, doc: str = "", ref: str = "", pages: str = "", doctype: str = "", **_: Any) -> str:
        data = self._load(doc)
        slots = data.get("slots") or {}
        blocks: list[dict[str, Any]] = []
        empty: list[str] = []
        srcs: list[str] = []
        for pg in data.get("pages") or []:
            for b in pg.get("blocks") or []:
                ids = block_slot_ids(b)
                html = "".join(str((slots.get(s) or {}).get("content") or "") for s in ids)
                text = html_to_text(html)
                if b.get("kind") == "heading" and text.strip():
                    html = f"<h2>{text.strip()}</h2>"
                blocks.append({**b, "html": html, "text": text})
                if ids and not text.strip():
                    empty.append(str(b.get("blockId")))
                srcs += media_sources(b)
        mine = patterns.measure_all([b["html"] for b in blocks], sorted({str(b.get("kind")) for b in blocks}), blocks)
        rows = [packs.message(MSG, "compose.checkHead", docId=data.get("docId"), title=data.get("title"), blocks=len(blocks),
                              photos=mine["photos"], sections=mine["sections"])]
        pm = "compose.problems."
        problems = []
        if empty:
            problems.append(packs.message(MSG, pm + "empty", count=len(empty), ids=", ".join(empty[:10])))
        bad = [s for s in srcs if not str(s).startswith("resource:")]
        if bad:
            problems.append(packs.message(MSG, pm + "notResource", count=len(bad)))
        dup = sorted({s for s in srcs if srcs.count(s) > 1})
        if dup:
            problems.append(packs.message(MSG, pm + "duplicate", ids=", ".join(d.replace("resource:", "") for d in dup[:6])))
        # 문단 단위 — 한 칸 안의 이름 있는 문단들은 각각 잰다 (<br> 로 붙인 줄은 한 문단)
        long_paras = [b["blockId"] for b in blocks if b.get("kind") == "text" and any(
            len(html_to_text(p)) > 320 for p in (_PARAS.findall(b["html"]) or [b["html"]]))]
        if long_paras:
            problems.append(packs.message(MSG, pm + "longParas", count=len(long_paras), ids=", ".join(long_paras[:6])))
        unstyled = [b["blockId"] for b in blocks if b.get("kind") == "text" and unstyled_marker_paragraphs(b["html"])]
        if unstyled:
            problems.append(packs.message(MSG, pm + "unstyledMarkers", count=len(unstyled), ids=", ".join(unstyled[:6])))
        rows.append(packs.message(MSG, pm + "label") + ("; ".join(problems) if problems else packs.message(MSG, pm + "none")))
        rows.extend(self._genre_rows(str(data.get("title") or ""), doctype, "\n".join(b["text"] for b in blocks)))
        state = self._wb_state()
        refs = [r for r in state.get("references") or [] if r.get("dir")]
        if ref:
            refs = [r for r in refs if r.get("refId") == ref] or refs
        if refs:
            r = refs[0]
            theirs, set_name, scope, ref_blocks = self._ref_metrics(r["dir"], pages)
            rows.extend(self._skeleton_rows(ref_blocks, blocks, scope))
            if theirs:
                rows.append(packs.message(MSG, "compose.checkCompareHead", refId=r.get("refId"))
                            + (packs.message(MSG, "compose.checkScope", scope=scope) if scope else ""))
                rows.append(patterns.compare(theirs, mine, set_name, "레퍼런스", "내 문서"))
                rows.append(packs.message(MSG, "compose.checkSignature", theirs=theirs.get("section_signature"),
                                          mine=mine.get("section_signature"), theirsPhoto=theirs.get("photo_signature"),
                                          minePhoto=mine.get("photo_signature")))
                hints = self._hints(theirs, mine, set_name) + self._marker_hint(theirs, mine)
                if hints:
                    rows.append(packs.message(MSG, "compose.hintsHead"))
                    rows.extend(hints)
        rows.append(packs.message(MSG, "compose.checkTail"))
        return "\n".join(rows)

    # --- 서식 원문 가져오기 (hwpx → 쪽 · 표 그대로) ----------------------------------------------

    def _get_ocr_port(self) -> Optional[Any]:
        if self._ocr_port is not None:
            return self._ocr_port
        return WindowsOcrAdapter() if sys.platform == "win32" else None

    def _resolve_mount_entry(self, path: str) -> Any:
        raw = str(path or "").strip()
        if not raw:
            raise ValueError(packs.message(MSG, "import.noPath"))
        entry = self.index.get(raw) if self.index is not None else None
        if entry is None:
            source = doc_text.source_of(raw)
            entry = self.index.get(source) if (source and self.index is not None) else None
        if entry is None:
            raise ValueError(packs.message(MSG, "import.notMounted", path=raw))
        return entry

    def _source(self, path: str) -> tuple[str, Any]:
        """마운트 안 서식 파일 → (절대 경로, 파싱한 문서)."""
        entry = self._resolve_mount_entry(path)
        ext = os.path.splitext(entry.abs_path)[1].lower()
        if ext in IMPORTERS:
            try:
                return entry.abs_path, IMPORTERS[ext](entry.abs_path)
            except Exception as exc:  # 손상 · 암호 · 형식 오류
                raise ValueError(packs.message(MSG, "import.parseFailed", path=entry.rel, error=exc)) from exc
        if ext in DOCSTRUCT_EXTS:
            try:
                doc_ir = build_doc_ir(
                    entry.abs_path,
                    cache_root=doc_text.derived_dir(),
                    ocr_port=self._get_ocr_port(),
                    render_png=True,
                )
                return entry.abs_path, doc_ir
            except Exception as exc:
                raise ValueError(packs.message(MSG, "import.parseFailed", path=entry.rel, error=exc)) from exc
        supported = ", ".join(list(IMPORTERS) + sorted(DOCSTRUCT_EXTS))
        raise ValueError(packs.message(MSG, "import.unsupported", path=entry.rel, kinds=supported))

    def _docstruct_source(self, path: str, *, page_indices: Optional[list[int]] = None,
                          force: bool = False) -> tuple[str, Path, DocIR]:
        entry = self._resolve_mount_entry(path)
        ext = os.path.splitext(entry.abs_path)[1].lower()
        if ext not in DOCSTRUCT_EXTS:
            raise ValueError(packs.message(MSG, "import.unsupported", path=entry.rel,
                                           kinds=", ".join(sorted(DOCSTRUCT_EXTS))))
        cache_root = doc_text.derived_dir()
        src_hash = file_src_hash(entry.abs_path)
        cache_dir = doc_cache_dir(cache_root, src_hash)
        try:
            doc_ir = build_doc_ir(
                entry.abs_path,
                page_indices=page_indices,
                cache_root=cache_root,
                ocr_port=self._get_ocr_port(),
                force=force,
                render_png=True,
            )
        except Exception as exc:
            raise ValueError(packs.message(MSG, "import.parseFailed", path=entry.rel, error=exc)) from exc
        return entry.abs_path, cache_dir, doc_ir

    def _load_or_build_page(self, path: str, page_num: int) -> tuple[str, Path, PageIR]:
        src, cache_dir, _ = self._docstruct_source(path, page_indices=[int(page_num)], force=False)
        pir = load_page_ir(cache_dir, int(page_num))
        if pir is None:
            _, _, doc_ir = self._docstruct_source(path, page_indices=[int(page_num)], force=True)
            pir = next((p for p in doc_ir.pages if p.pageIndex == int(page_num)), None)
        if pir is None:
            raise ValueError(packs.message(MSG, "import.noPages"))
        return src, cache_dir, pir

    def _table_reject_count(self, cache_dir: Path, page_num: int, table_id: str) -> int:
        cnt = 0
        for rec in read_records(cache_dir, page_num):
            if rec.get("kind") == "table_propose" and rec.get("tableId") == table_id:
                if rec.get("ok") and not rec.get("fallbackToImage"):
                    cnt = 0
                else:
                    cnt = int(rec.get("rejectCount") or (cnt + 1))
        return cnt

    # --- PDF / Scan structure inspection & verify tools -------------------------------------------

    def _dc_pdf_open(self, path: str = "", pages: Any = "", force: bool = False, **_: Any) -> str:
        wanted = hwpx_vdoc.parse_numbers(pages) if pages else None
        src, cache_dir, doc_ir = self._docstruct_source(path, page_indices=wanted, force=bool(force))
        rows = [packs.message(MSG, "docstruct.opened", path=os.path.basename(src), count=len(doc_ir.pages),
                              srcHash=doc_ir.srcHash, cacheDir=str(cache_dir))]
        for p in doc_ir.pages:
            tbls = [b for b in p.blocks if isinstance(b, TableIR)]
            png = cache_dir / f"p{p.pageIndex}.png"
            png_s = str(png) if png.is_file() else "-"
            rows.append(packs.message(MSG, "docstruct.openPage", page=p.pageIndex, mode=p.sourceKind,
                                      words=len(p.words), tables=len(tbls), blocks=len(p.blocks), png=png_s))
            words_by_id = {w.id: w for w in p.words}
            for tbl in tbls:
                snippet = render_table_proposal_html(tbl, words_by_id, include_word_attrs=True)[:220]
                rows.append(f"    table {tbl.id} ({tbl.nRows}x{tbl.nCols}, review={tbl.needsReview}): {snippet}")
        return "\n".join(rows)

    def _dc_pdf_words(self, path: str = "", page: int = 1, bbox: Optional[list[float]] = None, **_: Any) -> str:
        src, _, pir = self._load_or_build_page(path, int(page))
        words = list(pir.words)
        if bbox and len(bbox) == 4:
            bx = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
            words = [w for w in words if w.bbox is not None and point_in_bbox(bbox_center(w.bbox), bx, tol=1.5)]
        rows = [packs.message(MSG, "docstruct.wordsHead", path=os.path.basename(src), page=pir.pageIndex, count=len(words))]
        for w in words[:300]:
            bxs = [round(v, 1) for v in w.bbox] if w.bbox else None
            rows.append(f"  {w.id}: {w.text!r} bbox={bxs} conf={w.conf} src={w.src} review={w.needsReview}")
        if len(words) > 300:
            rows.append(f"  ... ({len(words) - 300} more; pass bbox=[x0,y0,x1,y1] to narrow)")
        return "\n".join(rows)

    def _dc_table_propose(self, path: str = "", page: int = 1, tableId: str = "", html: Optional[str] = None,
                          fixes: Optional[list[dict[str, Any]]] = None, rejectCount: Optional[int] = None, **_: Any) -> str:
        page_num = int(page)
        src, cache_dir, pir = self._load_or_build_page(path, page_num)
        prior_rejects = int(rejectCount) if rejectCount is not None else self._table_reject_count(cache_dir, page_num, tableId)
        png_path = cache_dir / f"p{page_num}.png"
        pdf_doc = pymupdf.open(src) if src.lower().endswith(".pdf") else None
        try:
            page_obj = pdf_doc[page_num - 1] if (pdf_doc is not None and 1 <= page_num <= len(pdf_doc)) else None
            res = reconcile_table(
                pir,
                tableId,
                html=html,
                fixes=fixes,
                reject_count=prior_rejects,
                page_obj=page_obj,
                page_png_path=png_path if png_path.is_file() else None,
            )
        finally:
            if pdf_doc is not None:
                pdf_doc.close()

        append_read_record(
            cache_dir,
            page_num,
            {
                "kind": "table_propose",
                "tableId": tableId,
                "ok": res.ok,
                "rejectCount": res.rejectCount,
                "fallbackToImage": res.fallbackToImage,
                "errors": res.errors,
            },
        )

        if res.ok and res.page is not None:
            save_page_ir(cache_dir, res.page)
            assert res.table is not None
            if res.fallbackToImage:
                return packs.message(MSG, "docstruct.tableFallback", page=page_num, tableId=tableId,
                                     errors="; ".join(res.errors))
            return packs.message(MSG, "docstruct.tableOk", page=page_num, tableId=tableId,
                                 rows=res.table.nRows, cols=res.table.nCols, needsReview=res.table.needsReview)

        return packs.message(MSG, "docstruct.tableRejected", rejectCount=res.rejectCount, page=page_num,
                             tableId=tableId, errors="; ".join(res.errors))

    def _dc_blocks_annotate(self, path: str = "", page: int = 1, annotations: Optional[list[dict[str, Any]]] = None,
                            readingOrder: Optional[list[str]] = None, fixes: Optional[list[dict[str, Any]]] = None,
                            **_: Any) -> str:
        page_num = int(page)
        _, cache_dir, pir = self._load_or_build_page(path, page_num)
        updated, res = apply_reread_patch(
            pir,
            block_annotations=annotations,
            reading_order=readingOrder,
            fixes=fixes,
        )
        append_read_record(
            cache_dir,
            page_num,
            {
                "kind": "blocks_annotate",
                "ok": res.ok,
                "errors": res.errors,
            },
        )
        if not res.ok:
            return packs.message(MSG, "docstruct.blocksRejected", page=page_num, errors="; ".join(res.errors))
        save_page_ir(cache_dir, updated)
        return packs.message(MSG, "docstruct.blocksOk", page=page_num, blocks=len(updated.blocks))

    def _dc_verify(self, path: str = "", pages: Any = "", round: int = 1, sampleTables: bool = True, **_: Any) -> str:
        wanted = hwpx_vdoc.parse_numbers(pages) if pages else None
        src, cache_dir, doc_ir = self._docstruct_source(path, page_indices=wanted, force=False)
        bundle = verify_doc(doc_ir)
        tasks = reread_plan(
            doc_ir,
            round_num=int(round),
            verification=bundle,
            cache_dir=cache_dir,
            sample_tables=bool(sampleTables),
        )
        if not bundle.pendingReads and not tasks:
            return packs.message(MSG, "docstruct.verifyOk", path=os.path.basename(src), count=len(doc_ir.pages))
        rows = [packs.message(MSG, "docstruct.verifyPending", path=os.path.basename(src),
                              pendingCount=len(bundle.pendingReads), round=int(round))]
        for t in tasks:
            rows.append(packs.message(MSG, "docstruct.verifyTask", page=t.pageIndex, kind=t.kind,
                                      blockId=t.blockId or "-", reasons=", ".join(t.reasons) or "-",
                                      crop=t.cropPngPath or "-"))
        return "\n".join(rows)

    def _dc_source_pages(self, path: str = "", pages: Any = "", **_: Any) -> str:
        src, parsed = self._source(path)
        wanted = set(hwpx_vdoc.parse_numbers(pages)) if pages else None
        if isinstance(parsed, DocIR):
            rows = [packs.message(MSG, "import.pagesHead", path=os.path.basename(src), count=len(parsed.pages))]
            for pg in parsed.pages:
                if wanted is not None and pg.pageIndex not in wanted:
                    continue
                first_txt = next(
                    (getattr(b, "text", None) for b in pg.blocks if getattr(b, "text", None)),
                    "",
                ) or ""
                first_txt = " ".join(str(first_txt).split())[:32]
                tbl_cnt = sum(1 for b in pg.blocks if isinstance(b, TableIR))
                fill_cnt = sum(1 for b in pg.blocks if isinstance(b, TableIR) for c in b.cells if c.field is not None)
                rows.append(
                    f"p{pg.pageIndex}: \"{first_txt}\" · tables {tbl_cnt} · empty cells {fill_cnt} · [{pg.sourceKind}]"
                )
            rows.append(packs.message(MSG, "import.pagesTail"))
            return "\n".join(rows)

        rows = [packs.message(MSG, "import.pagesHead", path=os.path.basename(src), count=len(parsed.pages))]
        for page in parsed.pages:
            if wanted is None or page.number in wanted:
                rows.append(f"p{page.number}: {hwpx_vdoc.page_summary(page)}")
        rows.append(packs.message(MSG, "import.pagesTail"))
        return "\n".join(rows)

    def _prune_unused_slots(self, pages_list: list[dict[str, Any]], slots: dict[str, Any]) -> None:
        used: set[str] = set()
        for pg in pages_list:
            for key in ("headerSlotId", "footerSlotId"):
                if pg.get(key):
                    used.add(str(pg[key]))
            for blk in pg.get("blocks") or []:
                used.update(block_slot_ids(blk))
        for dead in [sid for sid in slots if sid not in used]:
            slots.pop(dead, None)

    def _dc_import(self, path: str = "", pages: Any = "", start_at: str = "", end_before: str = "",
                   doc: str = "", **_: Any) -> str:
        numbers = hwpx_vdoc.parse_numbers(pages)
        if not numbers:
            raise ValueError(packs.message(MSG, "import.noPages"))
        if len(numbers) > 40:
            raise ValueError(packs.message(MSG, "import.tooMany", count=len(numbers)))
        src, parsed = self._source(path)
        src_hash = parsed.srcHash if isinstance(parsed, DocIR) else file_src_hash(src)
        data = self._load(doc)
        self._require_agent_draft(data)
        if (data.get("surface") or {}).get("kind", "paged") != "paged":
            raise ValueError(packs.message(MSG, "import.notPaged"))
        pages_list: list[dict[str, Any]] = data.setdefault("pages", [])
        slots: dict[str, Any] = data.setdefault("slots", {})
        # 빈 초안의 빈 첫 쪽은 원문 쪽으로 바꾼다
        if self._is_empty_draft(data):
            for pg in pages_list:
                for key in ("headerSlotId", "footerSlotId"):
                    slots.pop(str(pg.get(key) or ""), None)
            pages_list.clear()
        stamp = f"{int(time.time() * 1000) % 10_000_000:x}"
        seq = [0]

        def uid() -> str:
            seq[0] += 1
            return f"{stamp}{seq[0]:03d}"

        if isinstance(parsed, DocIR):
            sel_pages = [p for p in parsed.pages if p.pageIndex in set(numbers)]
            by_idx = {p.pageIndex: p for p in sel_pages}
            missing = [n for n in numbers if n not in by_idx]
            if missing:
                raise ValueError(packs.message(MSG, "import.noPages"))
            ordered_ir = [by_idx[n] for n in numbers]
            built_pages, built_slots, built_reports = docstruct_vdoc.doc_ir_pages_to_vdoc(
                ordered_ir,
                uid=uid,
                first_page_number=len(pages_list) + 1,
            )
            built = type(
                "BuiltPages",
                (),
                {"pages": built_pages, "slots": built_slots, "reports": built_reports},
            )()
        else:
            built = hwpx_vdoc.build_pages(parsed, numbers, start_at=str(start_at or "").strip(),
                                          end_before=str(end_before or "").strip(), uid=uid,
                                          first_page_number=len(pages_list) + 1)

        origin = data.setdefault("origin", {})
        if str(origin.get("createdBy") or "") != "agent":
            origin["agentComposed"] = True
        imports_log: list[dict[str, Any]] = origin.setdefault("imports", [])

        # Existing source page -> vdocPageId map for in-place replacement
        existing_page_map: dict[int, str] = {}
        for rec in imports_log:
            rec_src = str(rec.get("source") or "")
            rec_hash = str(rec.get("srcHash") or "")
            if (rec_src and os.path.normcase(os.path.abspath(rec_src)) == os.path.normcase(os.path.abspath(src))) or (
                rec_hash and rec_hash == src_hash
            ):
                for m in rec.get("pageMap") or []:
                    if isinstance(m, dict) and m.get("sourcePage") is not None and m.get("vdocPageId"):
                        existing_page_map[int(m["sourcePage"])] = str(m["vdocPageId"])

        slots.update(built.slots)
        replaced_any = False
        imported_positions: list[int] = []
        new_page_map: list[dict[str, Any]] = []

        for pg, rep in zip(built.pages, built.reports):
            src_pg_no = int(rep.source)
            target_id = existing_page_map.get(src_pg_no)
            replaced_idx = next(
                (idx for idx, existing_pg in enumerate(pages_list) if str(existing_pg.get("pageId") or "") == target_id),
                None,
            ) if target_id else None
            if replaced_idx is not None:
                pages_list[replaced_idx] = pg
                replaced_any = True
                imported_positions.append(replaced_idx + 1)
            else:
                pages_list.append(pg)
                imported_positions.append(len(pages_list))
            new_page_map.append({"sourcePage": src_pg_no, "vdocPageId": pg["pageId"]})

        if replaced_any:
            self._prune_unused_slots(pages_list, slots)

        for i, pg in enumerate(pages_list, start=1):
            pg["pageNumber"] = i

        imports_log.append(
            {
                "source": src,
                "srcHash": src_hash,
                "pages": numbers,
                "pageMap": new_page_map,
            }
        )
        saved = self._save(data, list(built.slots), "dc_import")
        msg_key = "import.replaced" if replaced_any else "import.saved"
        rows = [packs.message(MSG, msg_key, docId=saved.get("docId"), revision=saved.get("revision"),
                              count=len(built.pages), path=os.path.basename(src))]
        for pos, rep in zip(imported_positions, built.reports):
            pictures = packs.message(MSG, "import.pictureNote", count=rep.pictures) if rep.pictures else ""
            rows.append(packs.message(MSG, "import.pageLine", page=pos, source=rep.source, paras=rep.paragraphs,
                                      tables=rep.tables, cells=rep.fill_cells, pictures=pictures))
        rows.append(packs.message(MSG, "import.tail"))
        return "\n".join(rows)
