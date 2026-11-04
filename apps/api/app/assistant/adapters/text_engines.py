"""스트리밍이 없는 엔진들 — Google Direct API, 오프라인(테스트 · 외부 LLM 차단 환경)."""
from __future__ import annotations

import re
import threading
import time
from typing import Any, Callable, Iterator, Optional

from ..models import EngineChoice


class GoogleTextConversation:
    """Google Direct API 로 대화록 전체를 매 턴 다시 보낸다 (API 는 무상태)."""

    def __init__(
        self,
        choice: EngineChoice,
        *,
        api_key_provider: Callable[[], Optional[str]],
        timeout_seconds: int,
        resume: Optional[dict[str, Any]] = None,
    ) -> None:
        self.choice = choice
        self._api_key_provider = api_key_provider
        self._timeout = timeout_seconds
        self._transcript: list[tuple[str, str]] = list((resume or {}).get("transcript") or [])

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        # 무거운 import 를 실제 사용 시점으로 미룬다
        from llm_driver import GoogleGenAiHarness

        api_key = self._api_key_provider()
        if not api_key:
            yield {"type": "error", "message": "Google API 키가 설정되지 않았습니다. AI 설정에서 키를 등록하세요."}
            yield {"type": "turn_done", "usage": {}, "durationMs": 0}
            return
        self._transcript.append(("user", text))
        prompt = "\n\n".join(f"[{role}]\n{body}" for role, body in self._transcript) + "\n\n[assistant]\n"
        started = time.monotonic()
        harness = GoogleGenAiHarness(model=self.choice.model, api_key=api_key, timeout_seconds=self._timeout)
        result = harness.run_structured(prompt)
        if cancel.is_set():
            yield {"type": "error", "message": "사용자가 실행을 중단했습니다.", "code": "interrupted"}
            return
        if not result.ok:
            yield {"type": "error", "message": result.error or "Google API 호출에 실패했습니다."}
            yield {"type": "turn_done", "usage": {}, "durationMs": int((time.monotonic() - started) * 1000)}
            return
        answer = result.raw_response or ""
        self._transcript.append(("assistant", answer))
        yield {"type": "text_delta", "text": answer}
        yield {
            "type": "turn_done",
            "usage": {"input_tokens": result.input_tokens, "output_tokens": result.output_tokens},
            "durationMs": int((time.monotonic() - started) * 1000),
        }

    def export_state(self) -> dict[str, Any]:
        return {"transcript": list(self._transcript)}

    def close(self) -> None:
        return None


class OfflineConversation:
    """외부 LLM 이 꺼진 환경의 결정적 엔진. 이벤트 흐름(도구 왕복 포함)을 그대로 재현한다.

    사용자 요청에 `[[tool:이름]]` 이 있으면 그 도구를 한 번 부른다.
    """

    def __init__(self, choice: EngineChoice) -> None:
        self.choice = choice
        self.turns: list[str] = []

    def run_turn(self, text: str, cancel: threading.Event) -> Iterator[dict[str, Any]]:
        self.turns.append(text)
        if text.lstrip().startswith("<tool_result"):
            yield {"type": "text_delta", "text": "도구 결과를 확인했습니다."}
        elif "<instruction>" in text:
            instruction = _between(text, "<instruction>", "</instruction>")
            yield {"type": "text_delta", "text": f"<p>[오프라인 초안] {instruction}</p>"}
        else:
            request = _between(text, "<user_request>", "</user_request>") or text
            match = re.search(r"\[\[tool:([\w.\-]+)\]\]", request)
            yield {"type": "text_delta", "text": f"(오프라인 엔진) 요청을 받았습니다: {request[:80]}"}
            if match:
                yield {
                    "type": "text_delta",
                    "text": f'\n<tool_call>{{"id": "c1", "name": "{match.group(1)}", "arguments": {{}}}}</tool_call>',
                }
        yield {"type": "turn_done", "usage": {}, "durationMs": 0}

    def export_state(self) -> dict[str, Any]:
        return {}

    def close(self) -> None:
        return None


def _between(text: str, start: str, end: str) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    j = text.find(end, i + len(start))
    return text[i + len(start): j if j >= 0 else None].strip()
