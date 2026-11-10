"""하네스 — 동작 하나를 몇 개의 축(실행 방식 · 컨텍스트 · 출력 계약 · 모델 등급 · 게이트)으로 선언한다.

30개 동작을 30벌 코드로 만들지 않는다. 축마다 프리셋이 있고, 하네스는 그 조합이다.
초점에 따른 변주(줌이 넓으면 일괄 작업, 표 칸이면 표 자산 우선 …)는 프론트의 HarnessResolver 가
하네스 id 와 파라미터를 고르는 것으로 끝난다 — 여기 사양은 바뀌지 않는다.

출력 계약 `slot-html-cited`: 문장 끝 인용 표식 `<sup data-cite="E2"></sup>` 는 근거 묶음의 id 를 가리킨다.
서버는 모르는 id 를 지우고, 근거 없는 문장 · 줄 수 초과를 경고(warnings)로 돌려준다 (막지는 않는다).
"""
from __future__ import annotations

import html as html_lib
import re
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from harness_kit import packs

Executor = Literal["inline", "loop", "job"]
Output = Literal["slot-html-cited", "html", "text", "slot-map", "variables"]
Tier = Literal["fast", "balanced", "deep"]


@dataclass(frozen=True)
class HarnessSpec:
    harness_id: str
    title: str
    executor: Executor
    output: Output
    tier: Tier = "fast"
    #: 근거 묶음이 비면 지식 덱에서 후보를 찾아 채운다 (suggested)
    suggest_evidence: bool = False
    gates: tuple[str, ...] = ()
    #: 프롬프트의 작업 문장 (지시가 비었을 때 기본)
    default_instruction: str = ""
    extra_rules: tuple[str, ...] = field(default_factory=tuple)


_HARNESS = "authoring:harness.json"


def _spec(raw: dict[str, Any]) -> HarnessSpec:
    return HarnessSpec(raw["harnessId"], raw["title"], raw["executor"], raw["output"], raw.get("tier", "fast"),
                       suggest_evidence=bool(raw.get("suggestEvidence")), gates=tuple(raw.get("gates") or ()),
                       default_instruction=raw.get("defaultInstruction", ""), extra_rules=tuple(raw.get("extraRules") or ()))


def specs() -> dict[str, HarnessSpec]:
    """하네스 명세 — 하네스 authoring 팩(`harness.json`). 프론트 라우팅도 `/api/assistant/harness/specs` 로 이 정본을 쓴다."""
    return {raw["harnessId"]: _spec(raw) for raw in packs.data(_HARNESS)["specs"]}


SPECS: dict[str, HarnessSpec] = specs()

#: 등급 → agy 모델 (inline 모델이 기준). 설정 화면의 모델이 바뀌면 그쪽이 우선.
def model_for_tier(tier: Tier, fast_model: str, deep_model: str) -> str:
    if tier == "fast":
        return fast_model
    if tier == "balanced":
        return fast_model.replace("-low", "-medium") if fast_model.endswith("-low") else fast_model
    return deep_model


# --- 근거 묶음 ----------------------------------------------------------------------


@dataclass
class EvidenceItem:
    eid: str  # E1, E2 …
    locator: dict[str, Any]
    text: str
    tier: str = "direct"


def render_evidence(items: list[EvidenceItem], budget: int = 9000) -> str:
    out: list[str] = []
    left = budget
    for item in items:
        loc = item.locator
        where = loc.get("sourcePath") or loc.get("label") or loc.get("refId")
        lines = loc.get("lines")
        if lines:
            where = f"{where} L{lines[0]}-L{lines[1]}"
        elif loc.get("page"):
            where = f"{where} p.{loc['page']}"
        body = item.text.strip()
        if len(body) > left:
            body = body[: max(left, 0)] + "…"
        left -= len(body)
        out.append(f'<evidence id="{item.eid}" kind="{loc.get("kind")}" tier="{item.tier}" where="{html_lib.escape(str(where))}">\n{body}\n</evidence>')
        if left <= 0:
            break
    return "\n".join(out)


def build_prompt(
    spec: HarnessSpec,
    *,
    instruction: str,
    target: dict[str, Any],
    evidence: list[EvidenceItem],
    max_chars: Optional[int],
) -> str:
    cfg = packs.data(_HARNESS)["rules"]
    rules = list(cfg["base"])
    rules += list(cfg["output"].get(spec.output) or cfg["output"]["default"])
    if max_chars:
        rules.append(cfg["length"].format(max_chars=max_chars))
    tone = (target.get("constraints") or {}).get("tone")
    if tone:
        rules.append(cfg["tone"].format(tone=tone))
    rules += list(spec.extra_rules)
    parts = ["[규칙]\n- " + "\n- ".join(rules)]
    parts.append(
        "<target>\n"
        f"slotId: {target.get('slotId')}\nlabel: {target.get('label')}\n"
        f"heading: {target.get('headingPath') or ''}\n"
        f"current: {target.get('currentText') or '(비어 있음)'}\n"
        f"neighbors: {target.get('neighbors') or ''}\n"
        "</target>"
    )
    if target.get("slots"):
        parts.append("<targets>\n" + "\n".join(f"- {s.get('slotId')} | {s.get('label')} | 현재: {s.get('currentText') or '(비어 있음)'}" for s in target["slots"]) + "\n</targets>")
    if target.get("variables"):
        parts.append("<variables>\n" + "\n".join(f"- {k}: {v or '(비어 있음)'}" for k, v in target["variables"].items()) + "\n</variables>")
    parts.append("<evidences>\n" + (render_evidence(evidence) or "(근거 없음)") + "\n</evidences>")
    parts.append(f"<instruction>\n{instruction or spec.default_instruction}\n</instruction>")
    return "\n\n".join(parts)


# --- 출력 계약 · 게이트 --------------------------------------------------------------

_CITE = re.compile(r'<sup\s+data-cite="([^"]+)"\s*>\s*</sup>')
_TAG = re.compile(r"<[^>]+>")
_FENCE = re.compile(r"^```[\w-]*\s*|\s*```$")


def clean_output(text: str) -> str:
    return _FENCE.sub("", (text or "").strip()).strip()


def plain(html_text: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(_TAG.sub(" ", html_text or ""))).strip()


def estimate_chars(width_px: Optional[float], font_px: Optional[float], max_lines: Optional[int]) -> Optional[int]:
    """칸 너비 · 글꼴 크기 · 최대 줄 수 → 대략의 글자 수 (한글 1em 기준)."""
    if not max_lines:
        return None
    width = width_px or 520
    font = font_px or 14
    per_line = max(8, int(width / font))
    return per_line * int(max_lines)


def check_slot_html(
    spec: HarnessSpec,
    html_out: str,
    evidence: list[EvidenceItem],
    *,
    max_chars: Optional[int],
    before_plain: str = "",
) -> tuple[str, list[dict[str, Any]], list[str]]:
    """(정리된 HTML, 실제로 인용된 근거 [{citationId, locator}], 경고)."""
    known = {e.eid: e for e in evidence}
    warnings: list[str] = []
    unknown: set[str] = set()

    def keep(match: re.Match[str]) -> str:
        cid = match.group(1).strip()
        if cid in known:
            return f'<sup data-cite="{cid}"></sup>'
        unknown.add(cid)
        return ""

    cleaned = _CITE.sub(keep, html_out)
    if unknown and "citations" in spec.gates:
        warnings.append(f"없는 근거 인용 제거: {', '.join(sorted(unknown))}")
    cited_ids = list(dict.fromkeys(m.group(1) for m in _CITE.finditer(cleaned)))
    if "grounded" in spec.gates:
        sentences = [s for s in re.split(r"(?<=[.!?다요])\s+|</p>|</li>", cleaned) if plain(s)]
        bare = sum(1 for s in sentences if "data-cite" not in s and "[근거 부족]" not in s and len(plain(s)) > 12)
        if bare:
            warnings.append(f"근거 표시 없는 문장 {bare}개")
    if "length" in spec.gates and max_chars and len(plain(cleaned)) > max_chars * 1.1:
        warnings.append(f"길이 초과 (약 {len(plain(cleaned))}/{max_chars}자)")
    if "facts-preserved" in spec.gates and before_plain:
        def nums(t: str) -> list[str]:
            return re.findall(r"\d[\d,.]*", t)

        if nums(before_plain) != nums(plain(_CITE.sub("", cleaned))):
            warnings.append("원문의 숫자가 바뀌었습니다")
    if "[근거 부족]" in cleaned:
        warnings.append("근거 부족 — 자료를 더 연결하세요")
    # 근거 묶음 id(E3, E1 …)를 칸 안 읽는 순서 번호(1, 2 …)로 바꾼다 — 화면의 [1] [2] 와 근거 링크가 같은 번호
    renumber = {cid: str(n) for n, cid in enumerate(cited_ids, start=1)}
    cleaned = _CITE.sub(lambda m: f'<sup data-cite="{renumber.get(m.group(1), m.group(1))}"></sup>', cleaned)
    cited = [{"citationId": renumber[cid], "evidenceId": cid, "locator": known[cid].locator} for cid in cited_ids]
    return cleaned, cited, warnings
