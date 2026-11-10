"""reference 검증기 — 레퍼런스는 결정(층위)의 출처이지 사실 출처가 아니다.

    not_a_source  sources 에 레퍼런스를 넣지 않는다
    leak          레퍼런스 문장 · 레퍼런스에만 있는 수치 · 고유명사가 들어가지 않는다
    adoption      따른 해석 카드(follows)가 있고 맞게 따랐나 · '따르지 않음' 층위로 닮아 가지 않았나
"""
from __future__ import annotations

from typing import Any

from .. import packs
from ..patterns import distance, layer_ids, measure, registry
from . import Candidate, Context, Report, gate_msg, lexicon, norm, num_core, nums


def leaked_fragments(text: str, ref_text: str, n: int = 0) -> list[str]:
    """후보 글 중 레퍼런스와 n자 이상 그대로 겹치는 조각들."""
    n = n or int(packs.data("reference:settings.json")["leakNgram"])
    a, b = norm(text), norm(ref_text)
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


def _layer_id(item: Any) -> tuple[str, str]:
    """'D4' · 'refA:D4' · {"ref": "refA", "layer": "D4"} → (ref, layer)."""
    if isinstance(item, dict):
        return str(item.get("ref") or ""), str(item.get("layer") or "")
    text = str(item)
    if ":" in text:
        ref, _, layer = text.rpartition(":")
        return ref.replace("ref:", ""), layer
    return "", text


def _limits() -> dict[str, float]:
    reg = registry().get("adoptionCheck") or {}
    return {"followSlack": float(reg.get("followSlack", 0.08)), "excludeApproach": float(reg.get("excludeApproach", 0.2)),
            "excludeFloor": float(reg.get("excludeFloor", 0.35))}


def not_a_source_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    for src in cand.sources:
        if src.startswith("ref:"):
            report.errors.append(gate_msg("reference", "refAsSource", tag=cand.tag, src=src))


def leak_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    proper = lexicon()["properNoun"]
    corpus_norm = norm(ctx.corpus)
    for rid, rtext in ctx.ref_texts.items():
        frags = [f for f in leaked_fragments(cand.text, rtext) if f not in corpus_norm]
        if frags:
            report.errors.append(gate_msg("reference", "leakText", tag=cand.tag, rid=rid, fragments=" / ".join(f"「{f[:30]}」" for f in frags[:3])))
        ref_only_nums = {num_core(n) for n in nums(rtext)} - ctx.corpus_nums
        leaked_nums = sorted({n for n in nums(cand.text) if num_core(n) in ref_only_nums})
        if leaked_nums:
            report.errors.append(gate_msg("reference", "leakNumbers", tag=cand.tag, rid=rid, nums=", ".join(leaked_nums[:6])))
        ref_names = set(proper.findall(rtext)) - set(proper.findall(ctx.corpus))
        leaked_names = sorted(n for n in ref_names if n in cand.text)
        if leaked_names:
            report.errors.append(gate_msg("reference", "leakNames", tag=cand.tag, rid=rid, names=", ".join(leaked_names[:6])))


def adoption_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    tag, cards = cand.tag, ctx.cards
    known_layers = layer_ids("document") | layer_ids("uiux")
    follows = [str(x) for x in cand.raw.get("follows") or []]
    legacy = [_layer_id(x) for x in cand.raw.get("layers") or []]
    if ctx.has_refs and ctx.mode in ("compose", "restyle") and not follows and not legacy:
        report.warnings.append(gate_msg("reference", "followsEmpty", tag=tag))
    followed: list[dict[str, Any]] = []
    for cid in follows:
        card = cards.get(cid)
        if card is None:
            report.errors.append(gate_msg("reference", "cardMissing", tag=tag, cid=cid))
        elif card.get("adoption") == "exclude":
            report.errors.append(gate_msg("reference", "excludedFollowed", tag=tag, cid=cid))
        else:
            followed.append(card)
    ref_order = list(ctx.ref_ids)
    for ref_id, lid in legacy:
        if lid not in known_layers:
            report.warnings.append(gate_msg("reference", "unknownLayer", tag=tag, lid=lid, known=", ".join(sorted(known_layers))))
            continue
        rid = ref_id if ref_id in ctx.ref_ids else (ref_order[0] if not ref_id and len(ref_order) == 1 else None)
        if rid is None:
            report.warnings.append(gate_msg("reference", "inactiveRef", tag=tag, ref=ref_id))
            continue
        report.warnings.append(gate_msg("reference", "legacyLayers", tag=tag, rid=rid, lid=lid))
        followed.append({"cardId": f"{rid}:{lid}", "refId": rid, "layer": lid, "scope": f"ref:{rid}", "adoption": "follow"})
    if not (ctx.has_refs and (followed or any(c.get("adoption") == "exclude" for c in cards.values()))):
        return
    limits = _limits()
    cand_m = measure([str(h) for h in cand.slots.values()])
    old_m = measure([str((ctx.slots.get(s) or {}).get("content") or "") for s in cand.slots])
    doc_layers = layer_ids("document")
    for card in followed:
        lid = str(card.get("layer"))
        if card.get("adoption") != "follow" or lid not in doc_layers:
            continue
        try:
            htmls, kinds = ctx.scope_htmls(str(card.get("scope") or f"ref:{card.get('refId')}"))
        except ValueError:
            continue
        ref_m = measure(htmls, kinds)
        before, after = distance(old_m, ref_m, lid), distance(cand_m, ref_m, lid)
        report.notes.append(gate_msg("reference", "followNote", tag=tag, card=card.get("cardId"), lid=lid, scope=card.get("scope"),
                                     before=before, after=after))
        if after > before + limits["followSlack"]:
            report.warnings.append(gate_msg("reference", "followDrift", tag=tag, lid=lid, scope=card.get("scope"), before=before, after=after))
    for card in cards.values():
        lid = str(card.get("layer"))
        if card.get("adoption") != "exclude" or lid not in doc_layers or card.get("refId") not in ctx.ref_ids:
            continue
        try:
            htmls, kinds = ctx.scope_htmls(str(card.get("scope") or f"ref:{card.get('refId')}"))
        except ValueError:
            continue
        ref_m = measure(htmls, kinds)
        before, after = distance(old_m, ref_m, lid), distance(cand_m, ref_m, lid)
        if before - after >= limits["excludeApproach"] and after <= limits["excludeFloor"]:
            report.errors.append(gate_msg("reference", "excludeApproach", tag=tag, lid=lid, scope=card.get("scope"), before=before, after=after))


CANDIDATE_GATES = {"reference.not_a_source": not_a_source_gate, "reference.leak": leak_gate, "reference.adoption": adoption_gate}
