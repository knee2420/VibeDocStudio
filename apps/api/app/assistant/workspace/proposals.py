"""후보 제안(Produce) + 검증(Verify) — 문서를 고치지 않고 후보만 남긴다. 사람은 미리보기에서 고른다 (Show Don't Tell).

wb_propose 하나로 1안 · 3안 · 되돌리기 · 서식만 바꾸기를 모두 다룬다. 검증은 시나리오가 아니라 원칙으로 한다:
  범위/고정/분량 — 고칠 수 있는 칸인가
  누출         — 레퍼런스의 문장 · 고유 수치 · 고유명사가 들어갔는가 (레퍼런스는 패턴만)
  출처 없는 수치 — 후보의 숫자가 문서 · 읽은 원천 · 이력 어디에도 없는가
  내용 보존     — restyle 인데 원래 숫자 · 낱말이 사라졌는가
  되돌리기      — restore 인데 이력의 글과 다른가
  다양성 · 층위 — 후보끼리 사실상 같은가, 레퍼런스가 켜졌는데 어떤 층위를 따랐는지 밝혔는가
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any, Callable, Iterable, Optional

try:
    from .patterns import distance, layer_ids, measure
    from .workbench import Workbench, plain
except ImportError:
    from patterns import distance, layer_ids, measure  # type: ignore[no-redef]
    from workbench import Workbench, plain  # type: ignore[no-redef]

MODES = ("compose", "restyle", "restore")
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|명|분|일|개|건|원|억\s*원|억|만\s*원|만|조\s*원|조|배|회|시간|주|개월|년|곳|점)?")
_LATIN = re.compile(r"\b[A-Z][A-Za-z]{2,}\b|\(주\)\s*[가-힣A-Za-z]+")
_WORD = re.compile(r"[가-힣A-Za-z]{2,}")


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text)


def _nums(text: str) -> set[str]:
    out = set()
    for m in _NUM.finditer(text):
        token = re.sub(r"\s+", "", m.group(0))
        digits = re.sub(r"[^\d.]", "", token)
        if len(digits.replace(".", "")) >= 2 or not token[-1].isdigit():  # 한 자리 맨숫자(1. 2.)는 번호일 뿐
            out.add(token.replace(",", ""))
    return out


def _num_core(token: str) -> str:
    return re.sub(r"[^\d.]", "", token)


def leaked_fragments(text: str, ref_text: str, n: int = 14) -> list[str]:
    """후보 글 중 레퍼런스와 n자 이상 그대로 겹치는 조각들."""
    a, b = _norm(text), _norm(ref_text)
    if len(a) < n or len(b) < n:
        return []
    grams = {b[i:i + n] for i in range(len(b) - n + 1)}
    out: list[str] = []
    i = 0
    while i <= len(a) - n:
        if a[i:i + n] in grams:
            j = i + n
            while j < len(a) and a[i:j + 1] in b:
                j += 1
            out.append(a[i:j])
            i = j
        else:
            i += 1
    return out


def _trigram_jaccard(a: str, b: str) -> float:
    a, b = _norm(a), _norm(b)
    ga = {a[i:i + 3] for i in range(max(0, len(a) - 2))}
    gb = {b[i:i + 3] for i in range(max(0, len(b) - 2))}
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


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


def _layer_id(item: Any) -> tuple[str, str]:
    """'D4' · 'refA:D4' · {"ref": "refA", "layer": "D4"} → (ref, layer)."""
    if isinstance(item, dict):
        return str(item.get("ref") or ""), str(item.get("layer") or "")
    text = str(item)
    if ":" in text:
        ref, _, layer = text.rpartition(":")
        return ref.replace("ref:", ""), layer
    return "", text


def verify(wb: Workbench, payload: dict[str, Any], reads: list[dict[str, Any]]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []
    mode = str(payload.get("mode") or "compose")
    if mode not in MODES:
        errors.append(f"mode 는 {', '.join(MODES)} 중 하나여야 한다 (받은 값: {mode}).")
    cands = payload.get("candidates") or []
    if not isinstance(cands, list) or not cands:
        errors.append("candidates 가 비었다. 후보를 1개 이상 넣는다.")
        return {"ok": False, "errors": errors, "warnings": warnings, "notes": notes}
    doc = wb.doc
    if doc is None:
        errors.append("열린 문서가 없어 후보를 걸 칸이 없다.")
        return {"ok": False, "errors": errors, "warnings": warnings, "notes": notes}

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
    scope = wb.scope_slots()

    # 사실 말뭉치: 문서 지금 글 + 이력 + 읽은 원천 줄 + 명시한 출처
    corpus_parts = [plain(str((doc.slots.get(s) or {}).get("content") or "")) for s in doc.order]
    for rev in wb.revisions:
        for ch in rev.get("slots") or []:
            corpus_parts.append(plain(str(ch.get("before") or "")))
    corpus_parts += [plain(str((doc.slots.get(s) or {}).get("originalContent") or "")) for s in doc.order]
    for r in reads:
        corpus_parts.append(_read_lines(str(r.get("path") or ""), int(r.get("start") or 1), int(r.get("end") or 0)))
    corpus = "\n".join(corpus_parts)
    corpus_nums = {_num_core(n) for n in _nums(corpus)}
    ref_texts = {rid: ref.text() for rid, ref in wb.refs.items()}
    known_layers = layer_ids("document") | layer_ids("uiux")
    read_paths = {os.path.normcase(os.path.normpath(str(r.get("path") or ""))) for r in reads}

    texts: list[str] = []
    for ci, cand in enumerate(cands):
        tag = f"후보 {ci + 1}" + (f" '{cand.get('title')}'" if cand.get("title") else "")
        slots = cand.get("slots") or {}
        if not isinstance(slots, dict) or not slots:
            errors.append(f"{tag}: slots 가 비었다 ({{slotId: html}} 형식).")
            continue
        cand_text = []
        for sid, html in slots.items():
            if sid not in doc.slots:
                errors.append(f"{tag}: 칸 {sid} 가 문서에 없다 (wb_outline 으로 확인).")
                continue
            if allowed is not None and sid not in allowed:
                errors.append(f"{tag}: 칸 {sid} 는 target({target}) 밖이다.")
            if scope is not None and sid not in scope:
                errors.append(f"{tag}: 칸 {sid} 는 사용자가 정한 범위({wb.scope_label()}) 밖이다.")
            flags = doc.flags(sid)
            if flags["locked"]:
                errors.append(f"{tag}: 칸 {sid} 는 고정(boilerplate) 칸이다.")
            new_text = plain(str(html or ""))
            if flags["maxChars"] and len(new_text) > int(flags["maxChars"]):
                errors.append(f"{tag}: 칸 {sid} 분량 {len(new_text)}자 > 제한 {flags['maxChars']}자.")
            cand_text.append(new_text)
            old_text = plain(str((doc.slots.get(sid) or {}).get("content") or ""))
            if mode == "restyle" and old_text:
                lost_nums = {_num_core(n) for n in _nums(old_text)} - {_num_core(n) for n in _nums(new_text)}
                if lost_nums:
                    errors.append(f"{tag}: restyle 인데 칸 {sid} 의 수치가 사라졌다: {', '.join(sorted(lost_nums)[:6])}")
                old_words = set(_WORD.findall(old_text))
                kept = len(old_words & set(_WORD.findall(new_text))) / max(1, len(old_words))
                if kept < 0.5:
                    warnings.append(f"{tag}: restyle 인데 칸 {sid} 의 원래 낱말이 {kept:.0%} 만 남았다 (내용이 바뀐 것 아닌가).")
        text = "\n".join(cand_text)
        texts.append(text)

        # 출처
        sources = [str(s) for s in cand.get("sources") or []]
        for src in sources:
            if src.startswith("ref:"):
                errors.append(f"{tag}: 출처에 레퍼런스({src})를 넣었다. 레퍼런스는 사실 근거가 아니다 — layers 에 적는다.")
            if src.startswith("res:"):
                p = src[4:].split("#")[0]
                if os.path.normcase(os.path.normpath(p)) not in read_paths and not any(rp.endswith(os.path.normcase(os.path.normpath(p))) for rp in read_paths):
                    warnings.append(f"{tag}: 출처 {p} 를 read_file 로 읽은 기록이 없다.")
        if mode == "compose" and not sources:
            warnings.append(f"{tag}: sources 가 비었다 — 내용의 출처(res:경로#L시작-끝 · slot: · rev: · orig:)를 적는다.")
        if mode == "restore":
            src_texts = [plain(h) for h in wb.texts_of(s for s in sources if s.startswith(("rev:", "orig:")))]
            if not src_texts:
                errors.append(f"{tag}: restore 인데 sources 에 rev:<번호>#slot:<id> 또는 orig:<slotId> 가 없다.")
            elif not any(_norm(text) == _norm(t) or _norm(t) in _norm(text) for t in src_texts):
                best = max((_trigram_jaccard(text, t) for t in src_texts), default=0)
                errors.append(f"{tag}: restore 인데 이력의 글과 다르다 (유사도 {best:.0%}). 이력 글을 그대로 쓴다.")

        # 출처 없는 수치
        if mode != "restore":
            missing = sorted({n for n in _nums(text) if _num_core(n) not in corpus_nums})
            if missing:
                warnings.append(f"{tag}: 출처에서 찾지 못한 수치 {', '.join(missing[:8])} — 읽은 원천 · 문서에 있는 값만 쓴다.")

        # 레퍼런스 누출
        for rid, rtext in ref_texts.items():
            frags = [f for f in leaked_fragments(text, rtext) if f not in _norm(corpus)]
            if frags:
                errors.append(f"{tag}: 레퍼런스 {rid} 문장이 그대로 들어갔다: " + " / ".join(f"「{f[:30]}」" for f in frags[:3]))
            ref_only_nums = {_num_core(n) for n in _nums(rtext)} - corpus_nums
            leaked_nums = sorted({n for n in _nums(text) if _num_core(n) in ref_only_nums})
            if leaked_nums:
                errors.append(f"{tag}: 레퍼런스 {rid} 에만 있는 수치가 들어갔다: {', '.join(leaked_nums[:6])}")
            ref_names = set(_LATIN.findall(rtext)) - set(_LATIN.findall(corpus))
            leaked_names = sorted(n for n in ref_names if n in text)
            if leaked_names:
                errors.append(f"{tag}: 레퍼런스 {rid} 의 고유명사가 들어갔다: {', '.join(leaked_names[:6])}")

        # 층위
        layers = [_layer_id(x) for x in cand.get("layers") or []]
        if wb.refs and mode in ("compose", "restyle") and not layers:
            warnings.append(f"{tag}: 레퍼런스가 켜져 있는데 layers 가 비었다 — 어느 레퍼런스의 어느 층위를 따랐는지 적는다 (예: \"refA:D4\").")
        for ref_id, lid in layers:
            if lid not in known_layers:
                warnings.append(f"{tag}: 층위 '{lid}' 는 레지스트리에 없다 ({', '.join(sorted(known_layers))}).")
            if ref_id and ref_id not in wb.refs:
                warnings.append(f"{tag}: 층위의 레퍼런스 '{ref_id}' 가 활성 레퍼런스가 아니다.")
        # 층위 근접도 (참고): 후보가 따른다고 한 레퍼런스 층위에 실제로 가까워졌나
        if layers and wb.refs:
            cand_m = measure([str(h) for h in slots.values()])
            old_m = measure([str((doc.slots.get(s) or {}).get("content") or "") for s in slots])
            for ref_id, lid in layers:
                ref = wb.refs.get(ref_id) if ref_id else (next(iter(wb.refs.values())) if len(wb.refs) == 1 else None)
                if ref is None or lid not in layer_ids("document"):
                    continue
                if not ref.layer_on(lid):
                    warnings.append(f"{tag}: 레퍼런스 {ref.ref_id} 의 층위 {lid} 는 꺼져 있다 — 따르지 않는다.")
                    continue
                ref_m = measure(ref.htmls(), ref.block_kinds())
                before, after = distance(old_m, ref_m, lid), distance(cand_m, ref_m, lid)
                notes.append(f"{tag}: {ref.ref_id}:{lid} 거리 {before:.2f} → {after:.2f}")

    # 다양성
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            sim = _trigram_jaccard(texts[i], texts[j])
            if sim > 0.85:
                warnings.append(f"후보 {i + 1}·{j + 1} 이 {sim:.0%} 같다 — 후보끼리 층위 · 선별 · 구조가 달라야 한다.")
    return {"ok": not errors, "errors": errors, "warnings": warnings, "notes": notes}


def propose(wb: Workbench, payload: dict[str, Any], reads: list[dict[str, Any]], store: ProposalStore,
            session_id: str, conversation_id: str = "") -> dict[str, Any]:
    report = verify(wb, payload, reads)
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
    rows = [f"[후보 {proposal['id']}] {len(proposal['candidates'])}안 · mode={proposal['mode']} · "
            + ("검증 통과 — 사용자 화면에 미리보기로 뜬다. 답에는 각 안의 차이와 고를 기준만 짧게 쓴다."
               if rep["ok"] else "검증 실패 — 아래를 고쳐 wb_propose 를 다시 부른다 (이 안은 화면에 뜨지 않는다).")]
    rows += [f"✗ {e}" for e in rep["errors"]]
    rows += [f"△ {w}" for w in rep["warnings"]]
    rows += [f"· {n}" for n in rep["notes"]]
    return "\n".join(rows)
