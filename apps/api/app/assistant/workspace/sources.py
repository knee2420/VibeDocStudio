"""출처별 열람 집계 — 이번 메시지에서 켜진 출처(에디터 · 레퍼런스 · 리소스)를 실제로 열어 봤는가.

AI 가 출처 하나만 골라 보고 끝내는 것을 막기 위한 장치다. 특정 질문 문구를 찾지 않는다:
"켜져 있는데 한 번도 열지 않은 출처" 라는 사실만 본다. 판정은 도구 호출 기록으로만 한다.

입력:
  wb            작업대 (에디터 문서 · 레퍼런스)
  mounted       리소스 마운트 텍스트 파일 수 (마운트가 없으면 0)
  mcp_calls     vibefs 도구 호출 [{tool, args}]  (wb_* · ws_*)
  reads         read_file 원장 줄 [{path, ...}]
  client_calls  프론트 워크스페이스 도구 호출 [(name, args)]  (document.* · slot.read · references.read …)
  map_attached  이번 메시지에 작업대 지도를 통째로 첨부했는가 (지도만으로 답해도 에디터를 본 것)
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Iterable

from harness_kit import packs

#: 에디터 문서를 읽는 프론트 도구
_EDITOR_CLIENT_TOOLS = {"document.getOutline", "slot.read", "slots.listByState", "evidence.forSlot", "backdata.list"}
#: 레퍼런스를 읽는 프론트 도구
_REFERENCE_CLIENT_TOOLS = {"references.read"}


@dataclass
class SourceUse:
    id: str
    label: str
    available: bool
    used: bool
    detail: str = ""
    #: 레퍼런스처럼 항목이 여럿인 출처의 (열어 본 수, 전체 수)
    opened: int = 0
    total: int = 0
    unused_items: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "available": self.available, "used": self.used,
                "detail": self.detail, "opened": self.opened, "total": self.total}


def _msg(key: str, **values: Any) -> str:
    """출처 확인 · 출처 목록 문구 — 하네스 core 팩(`messages.json`)."""
    return packs.message("core:messages.json", f"sources.{key}", **values)


def _args_text(args: Any) -> str:
    try:
        return json.dumps(args, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(args)


def _short(name: str) -> str:
    """`mcp_vibefs_xxx_wb_read` 같은 이름 → `wb_read`."""
    for prefix in ("wb_", "ws_"):
        idx = name.find(prefix)
        if idx >= 0:
            return name[idx:]
    return name


def source_usage(
    wb: Any,
    *,
    mounted: int,
    mcp_calls: Iterable[dict[str, Any]],
    reads: Iterable[dict[str, Any]],
    client_calls: Iterable[tuple[str, dict[str, Any]]] = (),
    map_attached: bool = False,
    ref_reads: Iterable[dict[str, Any]] = (),
) -> list[SourceUse]:
    calls = [(_short(str(c.get("tool") or "")), c.get("args") or {}) for c in mcp_calls]
    client = list(client_calls)
    out: list[SourceUse] = []

    # --- 에디터 (지금 문서) ---
    doc = getattr(wb, "doc", None) if wb is not None else None
    editor_reads = 0
    outline_only = True
    for name, args in calls:
        if name == "wb_overview":  # 작업대 지도 — 문서 쪽 · 칸 수를 본 것
            touches, content = True, False
        elif name == "wb_outline":
            touches, content = not str(args.get("target") or "doc").startswith("ref:"), False
        elif name in ("wb_read", "wb_patterns"):
            touches, content = not str(args.get("anchor") or "doc").startswith("ref:"), True
        elif name == "wb_compare":
            sides = [str(args.get("a") or ""), str(args.get("b") or "")]
            touches, content = any(not s.startswith("ref:") for s in sides), True
        elif name in ("wb_history", "wb_propose"):
            touches, content = True, True
        elif name == "wb_search":
            touches, content = "doc" in str(args.get("where") or "doc,ref,history"), True
        else:
            continue
        if touches:
            editor_reads += 1
            outline_only = outline_only and not content
    for name, _args in client:
        if name in _EDITOR_CLIENT_TOOLS:
            editor_reads += 1
            if name != "document.getOutline":
                outline_only = False
    out.append(SourceUse(
        "editor", "에디터", available=doc is not None, used=editor_reads > 0 or (map_attached and doc is not None),
        detail=("개요만" if outline_only else f"{editor_reads}곳") if editor_reads else ("첨부된 지도" if map_attached else ""),
    ))

    # --- 레퍼런스 ---
    refs: dict[str, Any] = dict(getattr(wb, "refs", {}) or {}) if wb is not None else {}
    opened: set[str] = set()
    searched = False
    mapped = False
    for name, args in calls:
        if not name.startswith(("wb_", "rf_")):
            continue
        text = _args_text(args)
        for rid in refs:
            if f"ref:{rid}" in text or str(args.get("ref") or "") == rid:
                opened.add(rid)
        if name in ("rf_map", "rf_consensus", "rf_coverage") and not args.get("ref"):
            mapped = True  # 켜진 레퍼런스 전부의 지도 · 합의를 봤다 (본문은 아님)
        if name == "rf_find" and not args.get("ref"):
            searched = True
            opened.update(refs)
    for name, args in client:
        if name in _REFERENCE_CLIENT_TOOLS and str(args.get("refId") or "") in refs:
            opened.add(str(args.get("refId")))
    if mapped and not opened:
        opened.update(refs)
    unused_refs = [f"ref:{rid} {getattr(ref, 'title', '')}".strip() for rid, ref in refs.items() if rid not in opened]
    # 깊이: 실제로 읽은 덩어리 · 핀 (rf_read 원장)
    read_blocks: dict[str, set[str]] = {}
    read_pins: dict[str, set[str]] = {}
    for rec in ref_reads:
        rid = str(rec.get("refId") or "")
        read_blocks.setdefault(rid, set()).update(str(b) for b in rec.get("blocks") or [])
        read_pins.setdefault(rid, set()).update(str(p) for p in rec.get("pins") or [])
    depth = []
    for rid, ref in refs.items():
        blocks = getattr(ref, "blocks", []) or []
        pins = getattr(ref, "pins", []) or []
        got = len(read_blocks.get(rid, set()) & {str(b.get("id")) for b in blocks})
        part = f"덩어리 {got}/{len(blocks)}"
        if pins:
            part = f"핀 {len(read_pins.get(rid, set()) & {str(p.get('pinId')) for p in pins})}/{len(pins)} · " + part
        depth.append(part)
    detail = ""
    if refs:
        detail = f"{len(opened)}/{len(refs)}" + (" · 검색" if searched else "") + (f" · {' / '.join(depth)}" if depth else "")
        if opened and not any(read_blocks.values()):
            detail += " · 지도만"
    out.append(SourceUse(
        "references", "레퍼런스", available=bool(refs), used=bool(opened),
        detail=detail, opened=len(opened), total=len(refs), unused_items=unused_refs,
    ))

    # --- 리소스 ---
    files = {str(r.get("path") or "") for r in reads if r.get("path")}
    explored = sum(1 for name, _ in calls if name.startswith("ws_"))
    out.append(SourceUse(
        "resources", "리소스", available=mounted > 0, used=bool(files) or explored > 0,
        detail=(f"파일 {len(files)}/{mounted}" if files else ("탐색만" if explored else "")) if mounted else "",
        opened=len(files), total=mounted,
    ))
    return out


def unused_sources(usage: Iterable[SourceUse]) -> list[SourceUse]:
    """켜져 있는데 열지 않은 출처. 레퍼런스는 하나도 열지 않았을 때만 (일부만 연 것은 판단의 결과로 본다)."""
    return [u for u in usage if u.available and not u.used]


def any_activity(usage: Iterable[SourceUse]) -> bool:
    return any(u.used for u in usage)


def source_nudge_message(unused: list[SourceUse]) -> str:
    """켜진 출처를 열어 보지 않고 끝냈을 때 한 번만 보내는 재확인 요청."""
    rows = []
    for u in unused:
        if u.id == "references":
            rows.append(_msg("nudgeReferences", total=u.total, items=", ".join(u.unused_items[:6])))
        elif u.id == "resources":
            rows.append(_msg("nudgeResources", total=u.total))
        else:
            rows.append(_msg("nudgeEditor"))
    return _msg("nudgeHead") + "\n".join(rows) + _msg("nudgeTail")


def roster(wb: Any, resource_line: str = "", *, edit_scope: str = "") -> str:
    """매 턴 붙이는 짧은 출처 목록 — 대화가 길어져도 켜진 출처를 잊지 않게 한다."""
    rows = [_msg("rosterHead")]
    doc = getattr(wb, "doc", None) if wb is not None else None
    if doc is not None:
        rows.append(_msg("rosterEditor", title=doc.title, doc_id=doc.doc_id, scope=edit_scope or _msg("rosterEditorWholeScope")))
    refs = dict(getattr(wb, "refs", {}) or {}) if wb is not None else {}
    if refs:
        items = []
        for rid, ref in list(refs.items())[:8]:
            pins = f" 핀{len(ref.pins)}" if getattr(ref, "pins", None) else ""
            items.append(f"ref:{rid} {getattr(ref, 'title', '')[:24]}{pins}")
        rows.append(_msg("rosterReferences", count=len(refs), items=" · ".join(items)))
    if resource_line:
        rows.append(_msg("rosterResources", line=resource_line))
    if len(rows) == 1:
        return ""
    return "\n".join(rows)
