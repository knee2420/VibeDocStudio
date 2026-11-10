"""작업대 도구 (wb_*) — 출처 넷(에디터 · 레퍼런스 · 리소스 · 이력)을 같은 앵커 · 같은 자로 다루는 원시 기능.

  지각   wb_overview · wb_outline
  읽기   wb_read(anchor) · wb_search · wb_history
  패턴   wb_patterns(anchor) · wb_compare(a, b)
  산출   wb_propose(후보 1~N개) — 문서를 고치지 않고 검증된 후보만 남긴다

리소스 원문은 기존 ws_* · read_file 이 맡는다 (읽기 원장 · 커버리지가 그쪽에 있다).
"""
from __future__ import annotations

import json
from typing import Any, Callable, Optional

from harness_kit import packs, patterns

from .proposals import ProposalStore, propose, render_report
from .workbench import Workbench

#: wb_* 도구 명세 — 하네스 editor 팩
WB_TOOL_SPECS: list[dict[str, Any]] = packs.tool_specs("editor")

WB_ARG_ALIASES: dict[str, dict[str, str]] = packs.tool_aliases("editor")


class WorkbenchTools:
    def __init__(self, wb: Workbench, *, resource_line: str = "", reads: Callable[[], list[dict[str, Any]]] = lambda: [],
                 proposals: Optional[ProposalStore] = None, session_id: str = "", conversation_id: str = "",
                 cards: Callable[[], dict[str, dict[str, Any]]] = dict) -> None:
        self.wb = wb
        self.cards = cards
        self.resource_line = resource_line
        self.reads = reads
        self.proposals = proposals
        self.session_id = session_id
        self.conversation_id = conversation_id

    @staticmethod
    def handles(name: str) -> bool:
        return name.startswith("wb_")

    def call(self, name: str, args: dict[str, Any]) -> str:
        for alias, real in WB_ARG_ALIASES.get(name, {}).items():
            if alias in args and real not in args:
                args[real] = args.pop(alias)
        args.pop("toolSummary", None)
        fn = getattr(self, "_" + name, None)
        if fn is None:
            raise ValueError(f"알 수 없는 작업대 도구: {name}")
        for key in ("anchor", "target", "a", "b"):
            if str(args.get(key) or "").startswith("ref:") and name != "wb_propose":
                raise ValueError(f"레퍼런스는 rf_* 도구로 본다 — rf_read(anchor=\"{args[key]}\") · rf_outline · rf_measure · rf_contrast. "
                                 "wb_* 는 에디터 문서 · 이력 전용이다.")
        return fn(**args)

    def _wb_overview(self, **_: Any) -> str:
        return self.wb.overview(self.resource_line)

    def _wb_outline(self, target: str = "doc", page: str = "", **_: Any) -> str:
        return self.wb.outline(str(target or "doc"), str(page or ""))

    def _wb_read(self, anchor: str = "", **_: Any) -> str:
        return self.wb.read(str(anchor))[0]

    def _wb_search(self, query: str = "", where: str = "doc,history", **_: Any) -> str:
        areas = {w.strip() for w in str(where or "doc,history").split(",") if w.strip()}
        if "ref" in areas:
            raise ValueError("레퍼런스 안은 rf_find(query=…) 로 찾는다. wb_search 는 doc · history 만.")
        return self.wb.search(str(query), ",".join(sorted(areas)) or "doc,history")

    def _wb_history(self, slotId: str = "", limit: int = 20, **_: Any) -> str:
        sid = str(slotId or "")
        if sid.startswith("slot:"):
            sid = sid[5:]
        return self.wb.history(sid, int(limit or 20))

    def _measure(self, anchor: str) -> dict[str, Any]:
        _, htmls = self.wb.read(anchor)
        kinds: list[str] = []
        if anchor.startswith("ref:"):
            ref = self.wb.refs.get(anchor[4:].split("#")[0])
            kinds = ref.block_kinds() if ref else []
        elif self.wb.doc is not None:
            kinds = sorted({p.block_kind for p in self.wb.doc.places.values() if p.block_kind})
        return patterns.measure(htmls, kinds)

    def _wb_patterns(self, anchor: str = "", layers: str = "", **_: Any) -> str:
        return patterns.render(self._measure(str(anchor)), str(layers or ""), title=str(anchor))

    def _wb_compare(self, a: str = "", b: str = "", layers: str = "", **_: Any) -> str:
        return patterns.compare(self._measure(str(a)), self._measure(str(b)), str(layers or ""), str(a), str(b))

    def _wb_propose(self, target: str = "", candidates: Any = None, mode: str = "compose", summary: str = "", **_: Any) -> str:
        if isinstance(candidates, str):  # 모델이 JSON 문자열로 보내는 경우
            try:
                candidates = json.loads(candidates)
            except ValueError as exc:
                raise ValueError(f"candidates 를 JSON 배열로 보내세요: {exc}") from exc
        if self.proposals is None:
            raise ValueError("후보 저장소가 없습니다.")
        payload = {"target": target, "mode": mode or "compose", "summary": summary, "candidates": candidates or []}
        proposal = propose(self.wb, payload, self.reads(), self.proposals, self.session_id, self.conversation_id,
                           cards=self.cards())
        return render_report(proposal)
