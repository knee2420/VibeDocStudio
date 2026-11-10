"""후보 제안(Produce) + 검증(Verify) — 문서를 고치지 않고 후보만 남긴다. 사람은 미리보기에서 고른다 (Show Don't Tell).

wb_propose 하나로 1안 · 3안 · 되돌리기 · 서식만 바꾸기를 모두 다룬다. 검증 규칙은 영역별 검증기(`harness_kit.gates`)에 있고
순서 · 임계값은 하네스 authoring 팩(`proposal.json`)이 정한다. 이 모듈은 작업대에서 검증에 필요한 사실을 모아 넘긴다.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Optional

from harness_kit import gates, packs
from harness_kit.gates.reference import (
    leaked_fragments,  # noqa: F401  (평가 · 테스트가 쓴다)
)

from .workbench import Workbench, plain


def _read_lines(path: str, start: int, end: int) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return ""
    return "\n".join(lines[max(0, start - 1): end if end else len(lines)])


class ProposalStore:
    def __init__(self, state_dir: str) -> None:
        self.root = os.path.join(state_dir, "proposals")

    def save(self, session_id: str, proposal: dict[str, Any]) -> str:
        folder = os.path.join(self.root, session_id or "_")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{proposal['id']}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(proposal, fh, ensure_ascii=False, indent=1)
        return path

    def list(self, session_id: str) -> list[dict[str, Any]]:
        folder = os.path.join(self.root, session_id or "_")
        out = []
        try:
            names = sorted(os.listdir(folder))
        except OSError:
            return []
        for name in names:
            try:
                with open(os.path.join(folder, name), "r", encoding="utf-8") as fh:
                    out.append(json.load(fh))
            except (OSError, ValueError):
                continue
        return sorted(out, key=lambda p: p.get("createdAt", 0))


def _scope_htmls(wb: Workbench, scope: str) -> tuple[list[str], list[str]]:
    """해석 카드 범위(ref:<id>[#…])의 덩어리 HTML · 종류. 레퍼런스 전체면 전부."""
    from .ref_tools import RefAnchor, RefTools

    anchor = RefAnchor.parse(scope)
    tools = RefTools(wb)
    ref = tools._ref(anchor.ref_id)
    blocks = tools._blocks(ref, anchor)
    htmls = [str(b.get("html") or "") for b in blocks]
    if anchor.pin_id and not any(htmls):
        htmls = [str((ref.pin(anchor.pin_id) or {}).get("text") or "")]
    return htmls, sorted({str(b.get("kind")) for b in blocks if b.get("kind")})


def verify(wb: Workbench, payload: dict[str, Any], reads: list[dict[str, Any]],
           cards: Optional[dict[str, dict[str, Any]]] = None) -> dict[str, Any]:
    report = gates.Report()
    modes = gates.config()["modes"]
    mode = str(payload.get("mode") or "compose")
    if mode not in modes:
        report.errors.append(f"mode 는 {', '.join(modes)} 중 하나여야 한다 (받은 값: {mode}).")
    cands = payload.get("candidates") or []
    if not isinstance(cands, list) or not cands:
        report.errors.append("candidates 가 비었다. 후보를 1개 이상 넣는다.")
        return report.to_dict()
    doc = wb.doc
    if doc is None:
        report.errors.append("열린 문서가 없어 후보를 걸 칸이 없다.")
        return report.to_dict()

    # 고칠 수 있는 칸: 앵커(target) ∩ 범위
    target = str(payload.get("target") or "")
    allowed: Optional[set[str]] = None
    if target:
        try:
            kind, _, rest = target.partition(":")
            if kind == "slot":
                allowed = {rest}
            elif kind == "block":
                allowed = set(doc.slots_of_block(rest))
            elif kind == "page":
                page = doc.page_of(rest)
                allowed = set(doc.slots_of_page(page)) if page else set()
            elif kind == "slots":
                allowed = {s.strip() for s in rest.split(",") if s.strip()}
        except Exception:
            allowed = None

    # 사실 말뭉치: 문서 지금 글 + 이력 + 읽은 원천 줄 + 명시한 출처
    corpus_parts = [plain(str((doc.slots.get(s) or {}).get("content") or "")) for s in doc.order]
    for rev in wb.revisions:
        for ch in rev.get("slots") or []:
            corpus_parts.append(plain(str(ch.get("before") or "")))
    corpus_parts += [plain(str((doc.slots.get(s) or {}).get("originalContent") or "")) for s in doc.order]
    for r in reads:
        corpus_parts.append(_read_lines(str(r.get("path") or ""), int(r.get("start") or 1), int(r.get("end") or 0)))

    ctx = gates.Context(
        mode=mode, target=target, allowed=allowed, scope=wb.scope_slots(), scope_label=wb.scope_label(),
        slots=doc.slots, flags=doc.flags, corpus="\n".join(corpus_parts),
        read_paths={os.path.normcase(os.path.normpath(str(r.get("path") or ""))) for r in reads},
        ref_texts={rid: ref.text() for rid, ref in wb.refs.items()}, has_refs=bool(wb.refs), ref_ids=set(wb.refs),
        cards=cards or {}, texts_of=lambda anchors: wb.texts_of(anchors),
        scope_htmls=lambda scope: _scope_htmls(wb, scope),
    )
    gates.run(ctx, cands, report)
    return report.to_dict()


def propose(wb: Workbench, payload: dict[str, Any], reads: list[dict[str, Any]], store: ProposalStore,
            session_id: str, conversation_id: str = "", cards: Optional[dict[str, dict[str, Any]]] = None) -> dict[str, Any]:
    report = verify(wb, payload, reads, cards)
    proposal = {
        "id": "prop_" + uuid.uuid4().hex[:10],
        "createdAt": time.time(),
        "session": session_id,
        "conversation": conversation_id,
        "docId": wb.doc.doc_id if wb.doc else None,
        "target": payload.get("target"),
        "mode": payload.get("mode") or "compose",
        "summary": payload.get("summary") or "",
        "candidates": payload.get("candidates") or [],
        "report": report,
        "status": "ready" if report["ok"] else "needs_fix",
    }
    store.save(session_id, proposal)
    return proposal


def render_report(proposal: dict[str, Any]) -> str:
    rep = proposal["report"]
    msg = packs.data("authoring:messages.json")["verdict"]
    rows = [msg["head"].format(id=proposal["id"], count=len(proposal["candidates"]), mode=proposal["mode"])
            + (msg["ok"] if rep["ok"] else msg["fail"])]
    rows += [f"✗ {e}" for e in rep["errors"]]
    rows += [f"△ {w}" for w in rep["warnings"]]
    rows += [f"· {n}" for n in rep["notes"]]
    return "\n".join(rows)
