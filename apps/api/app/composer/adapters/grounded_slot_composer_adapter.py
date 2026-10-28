"""백데이터 근거 기반 슬롯 HTML 합성 어댑터."""
from __future__ import annotations

import html
import re

from ..models import SlotCompositionRequestModel


def _strip_tags(raw_html: str) -> str:
    return re.sub(r"<[^>]+>", "", raw_html or "").strip()


class GroundedSlotComposerAdapter:
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name

    def synthesize_slot_html(
        self,
        request: SlotCompositionRequestModel,
    ) -> tuple[str, str]:
        excerpts = [c.excerpt.strip() for c in request.backdata if c.excerpt.strip()]
        primary_text = " ".join(excerpts) or _strip_tags(request.current_content)
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.!?다])\s+", primary_text)
            if s.strip()
        ]
        preset = request.preset_id or ""
        prompt = request.prompt

        if preset == "bullet-3" or "개조식" in prompt or "불릿" in prompt:
            items = (sentences[:3] if sentences else [primary_text or prompt])
            li_html = "".join(f"<li>{html.escape(item)}</li>" for item in items)
            return f"<ul>{li_html}</ul>", self._model_name

        if preset == "compact-fit" or "축약" in prompt or "압축" in prompt:
            first = sentences[0] if sentences else (primary_text or prompt)
            return f"<p><strong>[핵심 요약]</strong> {html.escape(first)}</p>", self._model_name

        if preset == "executive-tone":
            src_tag = (
                f" <em>(근거: {html.escape(request.backdata[0].source_title)})</em>"
                if request.backdata
                else ""
            )
            body = " ".join(sentences[:2]) if sentences else (primary_text or prompt)
            return (
                f"<p><strong>■ {html.escape(request.slot_label)}:</strong> {html.escape(body)}{src_tag}</p>",
                self._model_name,
            )

        if request.backdata:
            bullets = "".join(
                f"<li><strong>[{html.escape(c.source_title)}]</strong> {html.escape(c.excerpt)}</li>"
                for c in request.backdata
            )
            return (
                f"<p><strong>✨ AI 백데이터 종합 ({html.escape(prompt)}):</strong></p><ul>{bullets}</ul>",
                self._model_name,
            )

        return (
            f"<p><strong>✨ [{html.escape(request.slot_label)}]</strong> {html.escape(primary_text)} — <em>({html.escape(prompt)} 반영)</em></p>",
            self._model_name,
        )

