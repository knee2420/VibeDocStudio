"""하네스 실행 — 근거 묶음을 모으고(미리 모으기 · 추천) 단발로 돌린 뒤 출력 계약 · 게이트를 적용한다.

"근거를 모은 뒤 한 번에 채우기" 경로다. 도구 왕복이 없어서(회당 고정 1.2만 토큰 · 수 초) Composer 루프보다
싸고 빠르다. 근거가 약하면(direct · inherited 가 없으면) 지식 덱에서 후보를 찾아 suggested 로 더한다.
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any, Iterator, Optional

from app.core.llm.execution_policy import RuntimeExecutionPolicy

from ..harness import (
    SPECS,
    EvidenceItem,
    build_prompt,
    check_slot_html,
    clean_output,
    estimate_chars,
    model_for_tier,
    plain,
)
from ..ports import EngineProvider, ServerToolbox, UsageLedger

logger = logging.getLogger(__name__)

MAX_EVIDENCE = 8


#: 근거 종류 — 지식 덱 카드 (지문을 아는 유일한 종류)
_KCARD = "kcard"


class HarnessService:
    def __init__(
        self,
        engines: EngineProvider,
        policy: RuntimePolicyLike,
        inline_model: str,
        server_tools: Optional[ServerToolbox] = None,
        ledger: Optional[UsageLedger] = None,
    ) -> None:
        self._engines = engines
        self._policy = policy
        self._inline_model = inline_model
        self._server = server_tools
        self._ledger = ledger

    def evidence_status(self, locators: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """근거 링크의 지금 원문 지문 — 붙일 때의 지문(sourceSha)과 다르면 화면이 "변경됨"으로 표시한다.

        지금은 지식 덱 카드(kcard)만 지문을 안다. 카드가 사라졌으면 status "missing".
        """
        out: list[dict[str, Any]] = []
        for loc in locators:
            ref = str(loc.get("refId") or "")
            if loc.get("kind") != _KCARD or self._server is None:
                continue
            found = self._server.resolve_evidence([loc])
            if not found:
                out.append({"kind": _KCARD, "refId": ref, "status": "missing", "sourceSha": None})
                continue
            sha = found[0].get("sourceSha")
            before = loc.get("sourceSha")
            status = "ok" if not before or not sha or sha == before else "stale"
            out.append({"kind": _KCARD, "refId": ref, "status": status, "sourceSha": sha})
        return out

    def specs(self) -> list[dict[str, Any]]:
        return [
            {"id": s.harness_id, "title": s.title, "executor": s.executor, "output": s.output, "tier": s.tier,
             "gates": list(s.gates), "suggestEvidence": s.suggest_evidence}
            for s in SPECS.values()
        ]

    # --- 근거 묶음 --------------------------------------------------------------------

    def _evidence(self, locators: list[dict[str, Any]], deck_ids: list[str], query: str, want_suggest: bool) -> list[EvidenceItem]:
        resolved: list[dict[str, Any]] = []
        kcards = [loc for loc in locators if loc.get("kind") == "kcard"]
        others = [loc for loc in locators if loc.get("kind") != "kcard"]
        for loc in others:
            text = str(loc.get("excerpt") or "").strip()
            if text:
                resolved.append({**loc, "_text": text, "_tier": loc.get("tier") or "direct"})
        if kcards and self._server is not None:
            try:
                for item in self._server.resolve_evidence(kcards):
                    resolved.append({**item, "_text": item.get("excerpt", ""), "_tier": item.get("tier") or "direct"})
            except Exception as exc:  # 근거 하나를 못 읽어도 채우기는 이어간다
                logger.warning("[harness] 카드 근거 해석 실패: %s", exc)
        strong = [r for r in resolved if r["_tier"] in ("direct", "inherited")]
        if want_suggest and deck_ids and len(strong) < 2 and self._server is not None and query.strip():
            known = {(r.get("kind"), r.get("refId")) for r in resolved}
            try:
                for item in self._server.suggest_evidence(deck_ids, query, limit=4):
                    if (item.get("kind"), item.get("refId")) not in known:
                        resolved.append({**item, "_text": item.get("excerpt", ""), "_tier": "suggested"})
            except Exception as exc:
                logger.warning("[harness] 근거 추천 실패: %s", exc)
        items: list[EvidenceItem] = []
        for n, r in enumerate(resolved[:MAX_EVIDENCE], start=1):
            loc = {k: v for k, v in r.items() if not k.startswith("_") and k != "tier"}
            items.append(EvidenceItem(eid=f"E{n}", locator=loc, text=r["_text"], tier=r["_tier"]))
        return items

    # --- 실행 -------------------------------------------------------------------------

    def run(self, payload: dict[str, Any], cancel: Optional[threading.Event] = None) -> Iterator[dict[str, Any]]:
        harness_id = str(payload.get("harnessId") or "fill.slot")
        spec = SPECS.get(harness_id)
        run_id = str(payload.get("runId") or f"run-{uuid.uuid4().hex[:10]}")
        token = cancel or threading.Event()

        def stream() -> Iterator[dict[str, Any]]:
            if spec is None:
                yield {"type": "error", "message": f"알 수 없는 하네스: {harness_id}"}
                yield {"type": "turn_done", "stopReason": "error", "usage": {}, "durationMs": 0}
                return
            target = dict(payload.get("target") or {})
            constraints = target.get("constraints") or {}
            max_chars = estimate_chars(target.get("widthPx"), target.get("fontSizePx"), constraints.get("maxLines"))
            query = " ".join(str(x) for x in (target.get("label"), target.get("headingPath"), payload.get("instruction")) if x)
            evidence = self._evidence(list(payload.get("evidence") or []), list(payload.get("deckIds") or []), query, spec.suggest_evidence)
            yield {"type": "evidence", "items": [{"id": e.eid, "tier": e.tier, "locator": e.locator} for e in evidence]}

            snap = self._policy.snapshot()
            model = payload.get("model") or model_for_tier(spec.tier, self._inline_model, snap.primary_model)
            choice = self._engines.resolve(snap.primary_provider, model)
            engine = self._engines.open_conversation(choice, lane="inline")
            prompt = build_prompt(spec, instruction=str(payload.get("instruction") or ""), target=target, evidence=evidence, max_chars=max_chars)
            started = time.monotonic()
            pieces: list[str] = []
            done: dict[str, Any] = {}
            errored = False
            try:
                yield {"type": "turn_start", "provider": choice.provider, "model": choice.model, "harnessId": harness_id, "runId": run_id}
                for event in engine.run_turn(prompt, token):
                    kind = event.get("type")
                    if kind == "text_delta":
                        pieces.append(event.get("text", ""))
                        yield event
                    elif kind == "turn_done":
                        done = event
                    elif kind == "agent_tool":
                        continue
                    else:
                        if kind == "error":
                            errored = True
                        yield event
            finally:
                engine.close()
            duration = int((time.monotonic() - started) * 1000)
            usage = done.get("usage") or {}
            result: dict[str, Any] = {"type": "result", "harnessId": harness_id, "runId": run_id, "output": spec.output}
            if not errored:
                raw = clean_output("".join(pieces))
                if spec.output in ("slot-html-cited", "html"):
                    html_out, cited, warnings = check_slot_html(
                        spec, raw, evidence, max_chars=max_chars, before_plain=plain(str(target.get("currentHtml") or ""))
                    )
                    result.update({"html": html_out, "evidence": cited, "warnings": warnings})
                elif spec.output in ("slot-map", "variables"):
                    data = _json_object(raw)
                    cited_ids = sorted({m for v in (data or {}).values() if isinstance(v, str) for m in _cites(v)})
                    known = {e.eid: e for e in evidence}
                    result.update({
                        "map": data or {},
                        "evidence": [{"citationId": c, "locator": known[c].locator} for c in cited_ids if c in known],
                        "warnings": [] if data is not None else ["JSON 으로 읽을 수 없는 출력"],
                    })
                else:
                    result.update({"text": raw, "warnings": []})
                yield result
            self._record(harness_id, run_id, choice.model, usage, duration, ok=not errored, slot=target.get("slotId"))
            yield {"type": "turn_done", "stopReason": "error" if errored else "end_turn", "usage": usage, "durationMs": duration,
                   "harnessId": harness_id, "runId": run_id}

        return stream()

    def _record(self, harness_id: str, run_id: str, model: str, usage: dict[str, Any], duration_ms: int, *, ok: bool, slot: Any) -> None:
        if self._ledger is None:
            return
        try:
            self._ledger.record({
                "at": time.strftime("%Y-%m-%dT%H:%M:%S"), "harnessId": harness_id, "runId": run_id, "model": model,
                "ok": ok, "durationMs": duration_ms, "slotId": slot,
                **{k: int(v) for k, v in usage.items() if isinstance(v, (int, float)) and not isinstance(v, bool)},
            })
        except Exception as exc:  # 원장 실패가 실행을 막지 않는다
            logger.warning("[harness] 원장 기록 실패: %s", exc)


RuntimePolicyLike = RuntimeExecutionPolicy


def _cites(text: str) -> list[str]:
    import re

    return re.findall(r'data-cite="([^"]+)"', text)


def _json_object(raw: str) -> Optional[dict[str, Any]]:
    text = raw.strip()
    for candidate in (text, text[text.find("{"): text.rfind("}") + 1] if "{" in text else ""):
        if not candidate:
            continue
        try:
            data = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(data, dict):
            return {str(k): v for k, v in data.items()}
    return None
