"""문서 짓기 도구 (dc_*) — 에이전트가 새 문서를 만들고, 블록을 쌓고, 글을 채우고, 레퍼런스 뼈대와 견줘 본다.

  dc_new     새 문서 (프로젝트에 연결 · 지면 · 장르) — 이 세션의 작업대가 그 문서를 가리키게 된다
  dc_build   한 번에 여러 작업: 쪽 추가 · 블록 추가(heading · text · image · gallery · link-card · divider · hero · callout)
             · 글 바꾸기 · 속성 · 옮기기 · 지우기 — 서버가 바로 저장한다 (화면이 열려 있지 않아도 된다)
  dc_outline 지금 문서의 구조 (쪽 → 블록 id · 종류 · 사진 · 글 앞부분)
  dc_check   배치 · 사진 · 빈 칸 점검 + 레퍼런스 뼈대(rf_skeleton)와의 차이

구조(블록 · 쪽)까지 바꾸는 것은 에이전트가 만든 초안 문서(`origin.createdBy == "agent"`)만이다.
사람이 만든 문서는 지금처럼 칸 내용 변경안(slots.proposeBatch · wb_propose)으로만 고친다.
문서는 API(`/api/documents`)로 읽고 쓴다 — 저장 버전 · 개정 이력 · 프로젝트 연결이 사람 편집과 같은 길로 남는다.
"""
from __future__ import annotations

import html as html_lib
import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Optional

from harness_kit import packs, patterns
from harness_kit.text import html_to_text
from harness_kit.vdoc_build import (
    blank_page,
    block_slot_ids,
    make_block,
    media_sources,
    sanitize_html,
)

#: dc_* 도구 명세 · 결과 글 — 하네스 editor 팩
MSG = "editor:messages.json"
DC_TOOL_SPECS: list[dict[str, Any]] = packs.tool_specs("editor", "tools.compose.json")

API_BASE = os.environ.get("VIBE_API_BASE", "http://127.0.0.1:8090").rstrip("/")
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
                 state: Optional[Callable[[], dict[str, Any]]] = None) -> None:
        self.store = store
        self.session_id = session_id
        self.index = index
        self.api = api or _Api()
        self._state = state

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
    def _require_agent_draft(doc: dict[str, Any]) -> None:
        if str((doc.get("origin") or {}).get("createdBy") or "") != "agent":
            raise ValueError(packs.message(MSG, "compose.notAgentDraft"))

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
        self._set_state(docId=doc["docId"], docPath=doc_path, scope={"mode": "doc"}, selection=[])
        page = doc["pages"][0]
        return packs.message(MSG, "compose.created", docId=doc["docId"], title=doc["title"], surface=doc["surface"]["kind"],
                             genre=doc.get("genre"), pageId=page["pageId"])

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
                    if slots[sid].get("role") == "boilerplate":
                        raise ValueError(f"칸 {sid} 은 고정 문구다.")
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
        saved = self._save(data, touched, "dc_build")
        alias_line = (" · 별칭 " + ", ".join(f"{k}={v}" for k, v in alias.items())) if alias else ""
        head = packs.message(MSG, "compose.saved", revision=saved.get("revision"), count=len(ops),
                             notes=", ".join(notes[:12]) + (" …" if len(notes) > 12 else ""), aliases=alias_line)
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

    def _dc_check(self, doc: str = "", ref: str = "", **_: Any) -> str:
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
        long_paras = [b["blockId"] for b in blocks if b.get("kind") == "text" and len(b["text"]) > 320]
        if long_paras:
            problems.append(packs.message(MSG, pm + "longParas", count=len(long_paras), ids=", ".join(long_paras[:6])))
        rows.append(packs.message(MSG, pm + "label") + ("; ".join(problems) if problems else packs.message(MSG, pm + "none")))
        state = self._wb_state()
        refs = [r for r in state.get("references") or [] if r.get("dir")]
        if ref:
            refs = [r for r in refs if r.get("refId") == ref] or refs
        if refs:
            r = refs[0]
            try:
                with open(os.path.join(r["dir"], "layers.json"), encoding="utf-8") as fh:
                    stored = json.load(fh)
            except (OSError, ValueError):
                stored = {}
            theirs = stored.get("metrics") or {}
            set_name = stored.get("set") or "blog"
            if theirs:
                rows.append(packs.message(MSG, "compose.checkCompareHead", refId=r.get("refId")))
                rows.append(patterns.compare(theirs, mine, set_name, "레퍼런스", "내 문서"))
                rows.append(packs.message(MSG, "compose.checkSignature", theirs=theirs.get("section_signature"),
                                          mine=mine.get("section_signature"), theirsPhoto=theirs.get("photo_signature"),
                                          minePhoto=mine.get("photo_signature")))
                hints = self._hints(theirs, mine, set_name)
                if hints:
                    rows.append(packs.message(MSG, "compose.hintsHead"))
                    rows.extend(hints)
        rows.append(packs.message(MSG, "compose.checkTail"))
        return "\n".join(rows)
