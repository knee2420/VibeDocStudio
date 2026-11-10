"""authoring 검증기 — 고칠 수 있는 칸인가 · 서식만 바꾸면서 내용을 잃지 않았나 · 되돌리기가 이력 글 그대로인가 · 후보가 서로 다른가."""
from __future__ import annotations

from ..text import plain
from . import (
    Candidate,
    Context,
    Report,
    config,
    gate_msg,
    lexicon,
    norm,
    num_core,
    nums,
    trigram_jaccard,
)


def slots_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    kept_floor = float(config()["thresholds"]["restyleKeptWords"])
    word = lexicon()["word"]
    texts = []
    for sid, html in cand.slots.items():
        if sid not in ctx.slots:
            report.errors.append(gate_msg("authoring", "slotMissing", tag=cand.tag, sid=sid))
            continue
        if ctx.allowed is not None and sid not in ctx.allowed:
            report.errors.append(gate_msg("authoring", "outOfTarget", tag=cand.tag, sid=sid, target=ctx.target))
        if ctx.scope is not None and sid not in ctx.scope:
            report.errors.append(gate_msg("authoring", "outOfScope", tag=cand.tag, sid=sid, scope=ctx.scope_label))
        flags = ctx.flags(sid)
        if flags["locked"]:
            report.errors.append(gate_msg("authoring", "locked", tag=cand.tag, sid=sid))
        new_text = plain(str(html or ""))
        if flags["maxChars"] and len(new_text) > int(flags["maxChars"]):
            report.errors.append(gate_msg("authoring", "tooLong", tag=cand.tag, sid=sid, chars=len(new_text), limit=flags["maxChars"]))
        texts.append(new_text)
        old_text = plain(str((ctx.slots.get(sid) or {}).get("content") or ""))
        if ctx.mode == "restyle" and old_text:
            lost = {num_core(n) for n in nums(old_text)} - {num_core(n) for n in nums(new_text)}
            if lost:
                report.errors.append(gate_msg("authoring", "restyleLostNumbers", tag=cand.tag, sid=sid, nums=", ".join(sorted(lost)[:6])))
            old_words = set(word.findall(old_text))
            kept = len(old_words & set(word.findall(new_text))) / max(1, len(old_words))
            if kept < kept_floor:
                report.warnings.append(gate_msg("authoring", "restyleKept", tag=cand.tag, sid=sid, kept=kept))
    cand.text = "\n".join(texts)


def restore_gate(ctx: Context, cand: Candidate, report: Report) -> None:
    if ctx.mode != "restore":
        return
    src_texts = [plain(h) for h in ctx.texts_of([s for s in cand.sources if s.startswith(("rev:", "orig:"))])]
    if not src_texts:
        report.errors.append(gate_msg("authoring", "restoreNoSource", tag=cand.tag))
    elif not any(norm(cand.text) == norm(t) or norm(t) in norm(cand.text) for t in src_texts):
        best = max((trigram_jaccard(cand.text, t) for t in src_texts), default=0)
        report.errors.append(gate_msg("authoring", "restoreDiffers", tag=cand.tag, best=best))


def diversity_gate(ctx: Context, cands: list[Candidate], report: Report) -> None:
    limit = float(config()["thresholds"]["diversity"])
    texts = [c.text for c in cands]
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            sim = trigram_jaccard(texts[i], texts[j])
            if sim > limit:
                # 사실상 같은 안 둘은 사용자에게 고를 거리를 주지 않는다 — 하나로 줄이거나 해석(카드) · 구조가 다른 안으로 바꾼다
                report.errors.append(gate_msg("authoring", "duplicate", i=i + 1, j=j + 1, sim=sim))


CANDIDATE_GATES = {"authoring.slots": slots_gate, "authoring.restore": restore_gate}
FINAL_GATES = {"authoring.diversity": diversity_gate}
