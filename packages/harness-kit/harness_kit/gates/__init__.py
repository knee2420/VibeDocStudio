"""후보 검증기(gate) — 영역마다 자기 검증기를 두고, 실행 순서는 authoring 팩(`proposal.json`)이 정한다.

    authoring.*  범위 · 고정 칸 · 분량 · 서식만 바꾸기(restyle) · 되돌리기(restore) · 후보 다양성
    resource.*   출처를 읽었나 · 출처를 적었나 · 출처 없는 수치
    reference.*  레퍼런스를 사실 출처로 쓰지 않음 · 누출 · 해석 카드(follows) · 따르지 않음 침범

검증기는 문서 · 레퍼런스 저장 형식을 모른다. 실행 환경(vibefs)이 `Context` 에 필요한 값과 함수를 채워 넘긴다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from .. import packs


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": not self.errors, "errors": self.errors, "warnings": self.warnings, "notes": self.notes}


@dataclass
class Context:
    """한 번의 후보 제안을 검증하는 데 필요한 사실 (실행 환경이 채운다)."""

    mode: str
    target: str
    allowed: Optional[set[str]]
    scope: Optional[set[str]]
    scope_label: str
    slots: dict[str, dict[str, Any]]  # 문서 칸 (slotId → 칸)
    flags: Callable[[str], dict[str, Any]]  # 칸 상태 (locked · maxChars …)
    corpus: str  # 사실 말뭉치: 문서 · 이력 · 읽은 원천
    read_paths: set[str]
    ref_texts: dict[str, str]
    has_refs: bool
    ref_ids: set[str]
    cards: dict[str, dict[str, Any]]
    texts_of: Callable[[list[str]], list[str]]  # rev:/orig: 앵커 → 이력 글
    scope_htmls: Callable[[str], tuple[list[str], list[str]]]  # 해석 카드 범위 → (HTML, 덩어리 종류)
    corpus_nums: set[str] = field(default_factory=set)


@dataclass
class Candidate:
    index: int
    tag: str
    raw: dict[str, Any]
    slots: dict[str, str]
    text: str = ""
    sources: list[str] = field(default_factory=list)


# --- 공용 도구: 수치 · 낱말 (core 어휘) ------------------------------------------------------------

_compiled: dict[int, dict[str, re.Pattern]] = {}


def lexicon() -> dict[str, re.Pattern]:
    raw = packs.data("core:lexicon/ko.json")["proposal"]
    hit = _compiled.get(id(raw))
    if hit is None:
        hit = {k: packs.compile_rx(v) for k, v in raw.items()}
        _compiled.clear()
        _compiled[id(raw)] = hit
    return hit


def norm(text: str) -> str:
    return re.sub(r"\s+", "", text)


def nums(text: str) -> set[str]:
    out = set()
    for m in lexicon()["number"].finditer(text):
        token = re.sub(r"\s+", "", m.group(0))
        digits = re.sub(r"[^\d.]", "", token)
        if len(digits.replace(".", "")) >= 2 or not token[-1].isdigit():  # 한 자리 맨숫자(1. 2.)는 번호일 뿐
            out.add(token.replace(",", ""))
    return out


def num_core(token: str) -> str:
    return re.sub(r"[^\d.]", "", token)


def trigram_jaccard(a: str, b: str) -> float:
    a, b = norm(a), norm(b)
    ga = {a[i:i + 3] for i in range(max(0, len(a) - 2))}
    gb = {b[i:i + 3] for i in range(max(0, len(b) - 2))}
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


# --- 실행 -----------------------------------------------------------------------------------------

Gate = Callable[[Context, Candidate, Report], None]
FinalGate = Callable[[Context, list[Candidate], Report], None]


def _registry() -> tuple[dict[str, Gate], dict[str, FinalGate]]:
    from . import authoring, reference, resource

    per: dict[str, Gate] = {}
    final: dict[str, FinalGate] = {}
    for mod in (authoring, resource, reference):
        per.update(getattr(mod, "CANDIDATE_GATES", {}))
        final.update(getattr(mod, "FINAL_GATES", {}))
    return per, final


def config() -> dict[str, Any]:
    return packs.data("authoring:proposal.json")


def gate_msg(pack: str, key: str, /, **values: Any) -> str:
    """검증기 피드백 글 — 영역 팩 `messages.json` 의 gates.<key> 템플릿."""
    return packs.message(f"{pack}:messages.json", f"gates.{key}", **values)


def run(ctx: Context, candidates: list[dict[str, Any]], report: Report) -> None:
    """후보마다 candidateGates 를 순서대로, 끝에 finalGates 를 돌린다 (순서 = 팩 선언)."""
    cfg = config()
    per, final = _registry()
    missing = [g for g in [*cfg["candidateGates"], *cfg["finalGates"]] if g not in per and g not in final]
    if missing:
        raise KeyError(f"선언된 검증기가 없다: {missing}")
    ctx.corpus_nums = {num_core(n) for n in nums(ctx.corpus)}
    done: list[Candidate] = []
    for ci, raw in enumerate(candidates):
        tag = gate_msg("authoring", "tag", n=ci + 1) + (gate_msg("authoring", "tagTitle", title=raw.get("title")) if raw.get("title") else "")
        slots = raw.get("slots") or {}
        if not isinstance(slots, dict) or not slots:
            report.errors.append(gate_msg("authoring", "emptySlots", tag=tag))
            continue
        cand = Candidate(ci, tag, raw, slots, sources=[str(s) for s in raw.get("sources") or []])
        for name in cfg["candidateGates"]:
            per[name](ctx, cand, report)
        done.append(cand)
    for name in cfg["finalGates"]:
        final[name](ctx, done, report)
