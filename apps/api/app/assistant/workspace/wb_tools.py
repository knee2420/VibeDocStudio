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

try:
    from . import patterns
    from .proposals import ProposalStore, propose, render_report
    from .workbench import Workbench
except ImportError:
    import patterns  # type: ignore[no-redef]
    from proposals import ProposalStore, propose, render_report  # type: ignore[no-redef]
    from workbench import Workbench  # type: ignore[no-redef]

_ANCHOR_HELP = "앵커: slot:<id> · block:<id> · page:<id|번호> · doc · ref:<refId>[#p<쪽>|#pin:<id>|#blk:<id>] · rev:<번호>[#slot:<id>] · orig:<slotId>"

WB_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "wb_overview",
        "description": "작업대 지도: 지금 문서(고칠 대상 · 범위 · 빈칸/근거없음/분량초과 수), 활성 레퍼런스와 핀, 리소스 요약, 이력. 출처를 고르기 전에 한 번 본다.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "wb_outline",
        "description": "문서(또는 레퍼런스) 개요: 쪽 → 블록 → 칸(slotId · 라벨 · 앞부분 · 상태 표시). 칸 id 를 여기서 얻는다.",
        "inputSchema": {"type": "object", "properties": {
            "target": {"type": "string", "description": "doc(기본) 또는 ref:<refId>"},
            "page": {"type": "string", "description": "쪽 번호나 pageId (비우면 전체)"},
        }},
    },
    {
        "name": "wb_read",
        "description": "앵커 하나를 읽는다 — 문서 칸 · 블록 · 쪽, 레퍼런스(전체 · 쪽 · 핀 영역), 이력(rev:N · orig:칸). " + _ANCHOR_HELP,
        "inputSchema": {"type": "object", "properties": {"anchor": {"type": "string"}}, "required": ["anchor"]},
    },
    {
        "name": "wb_search",
        "description": "문서 · 레퍼런스 · 이력 안을 낱말(정규식)로 찾는다. 원천 자료는 ws_grep.",
        "inputSchema": {"type": "object", "properties": {
            "query": {"type": "string"},
            "where": {"type": "string", "description": "doc,ref,history 중 쉼표로 (기본 셋 다)"},
        }, "required": ["query"]},
    },
    {
        "name": "wb_history",
        "description": "문서 개정 이력(누가 · 언제 · 어느 칸을 이전→이후로)과 처음 상태가 남은 칸. '원래대로 · 무엇이 바뀌었나'는 여기서 시작한다.",
        "inputSchema": {"type": "object", "properties": {
            "slotId": {"type": "string", "description": "한 칸만 볼 때"},
            "limit": {"type": "integer"},
        }},
    },
    {
        "name": "wb_patterns",
        "description": "앵커의 글을 층위별 지표로 잰다(단락 길이 · 볼드 빈도 · 개조식 비율 · 수치 밀도 · 표 · 메타 블록 · 제목 순서 · 종결어미 등). 레퍼런스 분해 · 진단의 근거. " + _ANCHOR_HELP,
        "inputSchema": {"type": "object", "properties": {
            "anchor": {"type": "string"},
            "layers": {"type": "string", "description": "층위 세트: document(기본) · uiux"},
        }, "required": ["anchor"]},
    },
    {
        "name": "wb_compare",
        "description": "두 앵커를 층위별로 비교한다 (레퍼런스 vs 레퍼런스, 내 문서 vs 레퍼런스, 이전 판 vs 지금).",
        "inputSchema": {"type": "object", "properties": {
            "a": {"type": "string"}, "b": {"type": "string"},
            "layers": {"type": "string"},
        }, "required": ["a", "b"]},
    },
    {
        "name": "wb_propose",
        "description": (
            "문서를 고치지 않고 후보를 제안한다 — 사용자는 화면 미리보기에서 고른다. 1안이든 3안이든 이것 하나로 낸다. "
            "검증(범위 · 분량 · 레퍼런스 누출 · 출처 없는 수치 · 내용 보존 · 후보 다양성)을 돌려 결과를 돌려준다. "
            "mode: compose(새 내용) · restyle(내용 그대로 형식만) · restore(이력 글로 되돌리기). "
            "candidates: [{title, rationale, layers:[\"<refId>:D4\"…], sources:[\"res:<경로>#L1-20\" · \"slot:<id>\" · \"rev:3#slot:<id>\" · \"orig:<id>\"], slots:{slotId: html}}]"
        ),
        "inputSchema": {"type": "object", "properties": {
            "target": {"type": "string", "description": "slot:<id> · block:<id> · page:<id> · slots:<id1>,<id2>"},
            "mode": {"type": "string", "enum": ["compose", "restyle", "restore"]},
            "summary": {"type": "string"},
            "candidates": {"type": "array", "items": {"type": "object"}},
        }, "required": ["target", "candidates"]},
    },
]

WB_ARG_ALIASES: dict[str, dict[str, str]] = {
    "wb_read": {"target": "anchor", "path": "anchor", "id": "anchor", "slotId": "anchor"},
    "wb_patterns": {"target": "anchor", "path": "anchor"},
    "wb_search": {"pattern": "query", "text": "query", "in": "where"},
    "wb_outline": {"anchor": "target", "doc": "target"},
    "wb_history": {"slot": "slotId", "anchor": "slotId"},
    "wb_compare": {"left": "a", "right": "b", "anchor_a": "a", "anchor_b": "b"},
}


class WorkbenchTools:
    def __init__(self, wb: Workbench, *, resource_line: str = "", reads: Callable[[], list[dict[str, Any]]] = lambda: [],
                 proposals: Optional[ProposalStore] = None, session_id: str = "", conversation_id: str = "") -> None:
        self.wb = wb
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
        return fn(**args)

    def _wb_overview(self, **_: Any) -> str:
        return self.wb.overview(self.resource_line)

    def _wb_outline(self, target: str = "doc", page: str = "", **_: Any) -> str:
        return self.wb.outline(str(target or "doc"), str(page or ""))

    def _wb_read(self, anchor: str = "", **_: Any) -> str:
        return self.wb.read(str(anchor))[0]

    def _wb_search(self, query: str = "", where: str = "doc,ref,history", **_: Any) -> str:
        return self.wb.search(str(query), str(where or "doc,ref,history"))

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
        proposal = propose(self.wb, payload, self.reads(), self.proposals, self.session_id, self.conversation_id)
        return render_report(proposal)
