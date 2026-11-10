"""작업대 평가의 채점 기본기 — 실행 기록(WRun) · 규칙 채점 함수(Check) · 작업대 구성(wb) · 평가용 레퍼런스 id.

시나리오는 영역별로 `wb_suites/` 에 있다 (reference · resource · editor · combined). 채점은 규칙 기반이다.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))  # vibefs (작업대 자료 구조)

from build_workbench import REF_ONLY  # noqa: E402

from vibefs.proposals import leaked_fragments  # noqa: E402
from vibefs.workbench import plain  # noqa: E402


@dataclass
class WRun:
    answer: str
    thinking: str
    tools: list[dict[str, Any]]
    reads: list[str]
    proposals: list[dict[str, Any]]
    ref_texts: dict[str, str] = field(default_factory=dict)
    #: 서버가 턴 끝에 보낸 출처별 열람 (workspace_sources 의 마지막 값)
    sources: list[dict[str, Any]] = field(default_factory=list)
    #: 이 세션에서 AI 가 낸 해석 카드 (rf_interpret) · 레퍼런스 읽은 범위 (rf_read) · 평가기가 사용자 대신 확정한 카드
    cards: list[dict[str, Any]] = field(default_factory=list)
    ref_reads: list[dict[str, Any]] = field(default_factory=list)
    confirmed: list[dict[str, Any]] = field(default_factory=list)

    def follows(self) -> list[list[str]]:
        p = self.last_prop()
        return [[str(x) for x in c.get("follows") or []] for c in (p or {}).get("candidates") or []]

    def card(self, card_id: str) -> Optional[dict[str, Any]]:
        return next((c for c in [*self.cards, *self.confirmed] if str(c.get("cardId")) == card_id), None)

    def names(self) -> list[str]:
        return [_short(str(t.get("name") or "")) for t in self.tools]

    def last_prop(self) -> Optional[dict[str, Any]]:
        ready = [p for p in self.proposals if p.get("status") == "ready"]
        return (ready or self.proposals or [None])[-1]

    def prop_texts(self) -> list[str]:
        p = self.last_prop()
        if not p:
            return []
        return ["\n".join(plain(str(h)) for h in (c.get("slots") or {}).values()) for c in p.get("candidates") or []]


Check = Callable[[WRun], tuple[bool, str]]


def _short(name: str) -> str:
    """mcp_vibefs_ab12_wb_read → wb_read"""
    m = re.search(r"(wb_\w+|ws_\w+|rf_\w+)$", name)
    return m.group(1) if m else name


# --- 검사 ----------------------------------------------------------------------------------------

def used(names: str, label: str = "") -> Check:
    want = names.split("|")
    def check(r: WRun):
        hit = [n for n in r.names() if n in want]
        return bool(hit), f"{label or '도구 사용 ' + names}: {', '.join(hit) or '없음'}"
    return check


def not_used(prefixes: str, label: str) -> Check:
    bad = prefixes.split("|")
    def check(r: WRun):
        hit = [n for n in r.names() if any(n.startswith(b) for b in bad)]
        return not hit, f"{label}: {', '.join(hit) or '없음'}"
    return check


def sources_opened(ids: str, label: str = "") -> Check:
    """켜진 출처 중 ids(에디터=editor · 레퍼런스=references · 리소스=resources)를 모두 실제로 열어 봤나."""
    want = ids.split("|")
    def check(r: WRun):
        by = {s.get("id"): s for s in r.sources}
        missing = [i for i in want if not (by.get(i) or {}).get("used")]
        seen = ", ".join(f"{s.get('label')}{'✓' if s.get('used') else '✗'}" for s in r.sources if s.get("available")) or "집계 없음"
        return not missing, f"{label or '출처 확인 ' + ids}: {seen}"
    return check


def no_silent_skip(r: WRun) -> tuple[bool, str]:
    """켜져 있는데 안 연 출처는 답에서 '확인하지 않은 출처' 로 이유를 밝혀야 한다."""
    skipped = [s.get("label") for s in r.sources if s.get("available") and not s.get("used")]
    if not skipped:
        return True, "안 연 출처 없음"
    said = "확인하지 않은 출처" in r.answer
    return said, f"안 연 출처 {', '.join(map(str, skipped))} — 이유 {'밝힘' if said else '안 밝힘'}"


def ans(pattern: str, label: str) -> Check:
    rx = re.compile(pattern, re.S)
    def check(r: WRun):
        return bool(rx.search(r.answer)), f"{label}: {'있음' if rx.search(r.answer) else '없음'}"
    return check


def ans_count(patterns: list[str], need: int, label: str) -> Check:
    def check(r: WRun):
        hits = [p for p in patterns if re.search(p, r.answer)]
        return len(hits) >= need, f"{label}: {len(hits)}/{need} ({', '.join(hits[:6])})"
    return check


def prop_ready(min_cands: int = 1, mode: str = "", slots: str = "", label: str = "") -> Check:
    def check(r: WRun):
        p = r.last_prop()
        if not p:
            return False, f"{label or '후보 제안'}: wb_propose 없음"
        n = len(p.get("candidates") or [])
        ok = p.get("status") == "ready" and n >= min_cands and (not mode or p.get("mode") == mode)
        touched = {s for c in p.get("candidates") or [] for s in (c.get("slots") or {})}
        if slots:
            ok = ok and bool(touched) and touched <= set(slots.split(","))
        errs = "; ".join((p.get("report") or {}).get("errors") or [])[:160]
        return ok, f"{label or '후보 제안'}: {p.get('status')} · {n}안 · mode={p.get('mode')} · 칸={sorted(touched)}" + (f" · {errs}" if errs else "")
    return check


def prop_has(pattern: str, label: str, every: bool = False) -> Check:
    rx = re.compile(pattern, re.S)
    def check(r: WRun):
        texts = r.prop_texts()
        hits = [bool(rx.search(t)) for t in texts]
        ok = bool(texts) and (all(hits) if every else any(hits))
        return ok, f"{label}: {sum(hits)}/{len(texts)}안"
    return check


def prop_avoids(pattern: str, label: str) -> Check:
    rx = re.compile(pattern)
    def check(r: WRun):
        bad = [m.group(0) for t in r.prop_texts() for m in [rx.search(t)] if m]
        return not bad, f"{label}: {', '.join(bad[:4]) or '없음'}"
    return check


def no_leak(r: WRun) -> tuple[bool, str]:
    leaks = []
    for text in r.prop_texts():
        for rid, rtext in r.ref_texts.items():
            leaks += [f[:20] for f in leaked_fragments(text, rtext)]
            leaks += [w for w in REF_ONLY.get(rid, []) if w in text]
    return not leaks, f"레퍼런스 누출 0: {', '.join(leaks[:4]) or '없음'}"


def prop_layers(includes: str = "", excludes: str = "", label: str = "") -> Check:
    def check(r: WRun):
        p = r.last_prop()
        if not p:
            return False, f"{label or '층위'}: 후보 없음"
        layers = [str(x if not isinstance(x, dict) else f"{x.get('ref')}:{x.get('layer')}") for c in p.get("candidates") or []
                  for x in c.get("layers") or []]
        # 해석 카드(follows)로 적은 경우: 따른 카드의 레퍼런스:층위 (따르지 않음 카드는 빼고)
        for f in r.follows():
            for cid in f:
                card = r.card(cid)
                if card is not None and card.get("adoption") != "exclude":
                    layers.append(f"{card.get('refId')}:{card.get('layer')}")
        joined = " ".join(layers)
        ok = all(re.search(i, joined) for i in includes.split("|") if i) and not any(re.search(e, joined) for e in excludes.split("|") if e)
        return ok, f"{label or '층위'}: {joined[:160] or '없음'}"
    return check


def distinct_candidates(r: WRun) -> tuple[bool, str]:
    p = r.last_prop()
    if not p or len(p.get("candidates") or []) < 2:
        return False, "후보 간 차이: 후보 2개 미만"
    sets = [tuple(sorted(map(str, [*(c.get("layers") or []), *(c.get("follows") or [])]))) for c in p["candidates"]]
    texts = r.prop_texts()
    def jac(a: str, b: str) -> float:
        ga = {a[i:i + 3] for i in range(len(a) - 2)}
        gb = {b[i:i + 3] for i in range(len(b) - 2)}
        return len(ga & gb) / max(1, len(ga | gb))
    sims = [jac(texts[i], texts[j]) for i in range(len(texts)) for j in range(i + 1, len(texts))]
    ok = len(set(sets)) == len(sets) and max(sims, default=0) < 0.85
    return ok, f"후보 간 차이: 층위 조합 {len(set(sets))}/{len(sets)} · 최대 유사도 {max(sims, default=0):.0%}"


def reads_match(pattern: str, label: str, none: bool = False) -> Check:
    rx = re.compile(pattern)
    def check(r: WRun):
        hit = [p for p in r.reads if rx.search(p)]
        ok = (not hit) if none else bool(hit)
        return ok, f"{label}: {len(hit)}건"
    return check


def short_answer(limit: int = 1500) -> Check:
    def check(r: WRun):
        return len(r.answer) <= limit, f"(가점) 답이 짧다 — 후보는 화면에 (답 {len(r.answer)}자)"
    return check


# --- 레퍼런스 (조율 · 합의 · 부분 채택) 채점기 -----------------------------------------------------------

def rf_used(names: str, label: str = "") -> Check:
    """rf 도구 중 하나라도 썼나 (예: "rf_read|rf_outline")."""
    want = names.split("|")
    def check(r: WRun):
        hit = [n for n in r.names() if n in want]
        return bool(hit), f"{label or '레퍼런스 도구 ' + names}: {', '.join(hit[:5]) or '없음'}"
    return check


def no_rf_read(r: WRun) -> tuple[bool, str]:
    bad = [n for n in r.names() if n in ("rf_read", "rf_interpret")]
    return not bad, f"레퍼런스 본문을 열지 않음: {', '.join(bad) or '열지 않음'}"


def pin_read(pin: str) -> Check:
    def check(r: WRun):
        names = [n for n in r.names() if n.startswith("rf_")]
        got = any(pin in (rec.get("pins") or []) for rec in r.ref_reads)
        before = names.index("rf_interpret") if "rf_interpret" in names else len(names)
        first_read = next((i for i, rec in enumerate(r.ref_reads) if pin in (rec.get("pins") or [])), None)
        return got, f"핀 {pin} 읽음: {'예' if got else '아니오'}" + (" (해석 전)" if got and first_read is not None and before else "")
    return check


def ref_depth(ref_id: str, ratio: float, label: str = "") -> Check:
    """rf_read 로 실제 읽은 덩어리 비율 (긴 레퍼런스에서 앞부분만 보고 끝내지 않았나)."""
    def check(r: WRun):
        import json as _json

        from build_workbench import REFS as _REFS
        blocks = _json.loads((_REFS / ref_id / "extraction.json").read_text(encoding="utf-8")).get("blocks") or []
        got = {b for rec in r.ref_reads if rec.get("refId") == ref_id for b in rec.get("blocks") or []}
        share = len(got) / max(1, len(blocks))
        return share >= ratio, f"{label or '읽은 범위'} {ref_id}: {len(got)}/{len(blocks)} ({share:.0%} ≥ {ratio:.0%})"
    return check


def cards_ok(layer: str = "", adoption: str = "", scope: str = "", ref: str = "", reading: str = "", need: int = 1,
             label: str = "") -> Check:
    """해석 카드가 조건(층위 · 채택 강도 · 범위 · 레퍼런스 · 해석 문장 정규식)에 맞게 need 장 이상 나왔나."""
    def check(r: WRun):
        hits = [c for c in r.cards
                if (not layer or re.fullmatch(layer, str(c.get("layer"))))
                and (not adoption or re.fullmatch(adoption, str(c.get("adoption"))))
                and (not scope or re.search(scope, str(c.get("scope"))))
                and (not ref or str(c.get("refId")) == ref)
                and (not reading or re.search(reading, str(c.get("reading")), re.S))]
        seen = ", ".join(f"{c.get('layer')}:{c.get('adoption')}@{str(c.get('scope')).split('#', 1)[-1] if '#' in str(c.get('scope')) else '전체'}"
                         for c in r.cards[:8])
        return len(hits) >= need, f"{label or '해석 카드'}: {len(hits)}/{need} ({seen or '카드 없음'})"
    return check


def no_card(layer: str, adoption: str, label: str) -> Check:
    def check(r: WRun):
        bad = [c for c in r.cards if re.fullmatch(layer, str(c.get("layer"))) and re.fullmatch(adoption, str(c.get("adoption")))]
        return not bad, f"{label}: {len(bad)}장"
    return check


def alternatives_or_split(r: WRun) -> tuple[bool, str]:
    """모호한 요청: 해석이 갈리는 지점을 대안 해석으로 냈거나, 해석(카드)별로 다른 후보를 냈나."""
    alts = sum(1 for c in r.cards if c.get("alternatives"))
    sets = {tuple(sorted(f)) for f in r.follows() if f}
    ok = alts > 0 or len(sets) >= 2
    return ok, f"해석 갈림 다룸: 대안 해석 {alts}장 · 후보별 따른 카드 조합 {len(sets)}가지"


def follows_ok(pred: Callable[[dict[str, Any]], bool] = lambda c: True, every: bool = True, label: str = "") -> Check:
    """후보가 follows 로 카드를 적었고, 그 카드가 조건에 맞나 (every=True 면 모든 후보가)."""
    def check(r: WRun):
        rows = r.follows()
        if not rows:
            return False, f"{label or '따른 카드'}: 후보 없음"
        good = [bool(f) and all((r.card(cid) is not None and pred(r.card(cid))) or cid.startswith("off:") for cid in f) for f in rows]
        ok = all(good) if every else any(good)
        return ok, f"{label or '따른 카드'}: {sum(good)}/{len(rows)}안 · {rows[:3]}"
    return check


def follows_any(pred: Callable[[dict[str, Any]], bool], label: str) -> Check:
    def check(r: WRun):
        rows = r.follows()
        hit = [cid for f in rows for cid in f if r.card(cid) is not None and pred(r.card(cid))]
        return bool(hit), f"{label}: {hit[:4] or '없음'}"
    return check


def confirmed_followed(r: WRun) -> tuple[bool, str]:
    """사용자가 확정한 카드(평가기가 대신 확정)를 후보가 따랐나."""
    ids = {str(c.get("cardId")) for c in r.confirmed}
    hit = [cid for f in r.follows() for cid in f if cid in ids]
    return bool(ids) and bool(hit), f"확정 카드를 따름: 확정 {len(ids)}장 · 따른 것 {hit[:4] or '없음'}"


def prop_html_avoids(pattern: str, label: str) -> Check:
    rx = re.compile(pattern, re.I)
    def check(r: WRun):
        p = r.last_prop()
        bad = [m.group(0) for c in (p or {}).get("candidates") or [] for h in (c.get("slots") or {}).values()
               for m in [rx.search(str(h))] if m]
        return bool(p) and not bad, f"{label}: {', '.join(bad[:3]) or '없음'}"
    return check


def no_proposal(r: WRun) -> tuple[bool, str]:
    return not r.proposals, f"문서 바꾸지 않음: 후보 {len(r.proposals)}건"


def answer_mentions_late_sections(ref_id: str, share: float = 0.6) -> Check:
    """긴 레퍼런스 전역 요약: 뒤쪽(앞 share 이후) 섹션 제목이 답에 나오나 — 앞부분만 보고 끝내지 않았나."""
    def check(r: WRun):
        import json as _json

        from build_workbench import REFS as _REFS
        blocks = _json.loads((_REFS / ref_id / "extraction.json").read_text(encoding="utf-8")).get("blocks") or []
        cut = int(len(blocks) * share)
        titles = [re.sub(r"\s+", "", str(b.get("text") or ""))[:8] for b in blocks[cut:] if b.get("kind") == "heading"]
        titles = [t for t in titles if len(t) >= 3]
        compact = re.sub(r"\s+", "", r.answer)
        hit = [t for t in titles if t in compact]
        return bool(hit), f"뒤쪽 섹션 언급: {len(hit)}/{len(titles)} ({', '.join(hit[:3]) or '없음'})"
    return check


# --- 작업대 구성 ----------------------------------------------------------------------------------

def wb(doc: Optional[str] = "vdoc_eval_report", scope: str = "document", sel: Optional[list[str]] = None,
       refs: Optional[list[str]] = None, pins: bool = False, pages: Optional[list[str]] = None) -> dict[str, Any]:
    sc: dict[str, Any] = {"mode": scope}
    if scope == "selection" and sel:
        sc["slotIds"] = list(sel)
        sc["label"] = "선택: " + ", ".join(sel)
    if pages:
        sc["pageIds"] = pages
    return {"docId": doc, "scope": sc, "selection": sel or [],
            # pinIds: None = 그 레퍼런스의 핀 전부 · [] = 핀 없이
            "references": [{"refId": r, "pinIds": None if pins else []} for r in refs or []]}


INV, PUB, BLOG = "ref_eval_invest", "ref_eval_public", "ref_eval_blog"
#: 실물 레퍼런스 — 14쪽 PDF(표에 핀 pinP1) · 표가 많은 7쪽 PDF(2쪽 영역 핀)
PM5, SEOUL = "ref_eval_pm5", "ref_eval_seoul"
