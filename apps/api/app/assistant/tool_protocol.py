"""텍스트 기반 도구 호출 프로토콜.

모델은 `<tool_call>{"id": "...", "name": "...", "arguments": {...}}</tool_call>` 블록으로
워크스페이스 도구를 부른다. agy 의 MCP 등록은 전역 설정(~/.gemini/config)에만 가능해서,
세션마다 바뀌는 프론트 도구 목록은 이 프로토콜로 전달한다. Google API 엔진도 같은 길을 쓴다.

스트리밍 중에는 태그가 청크 경계에서 잘려 들어오므로, 태그 접두어로 끝나는 꼬리는
다음 청크가 올 때까지 붙잡아 둔다. 도구 블록은 사용자에게 보이는 텍스트에서 빠진다.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any

from .models import ToolCall

OPEN_TAG = "<tool_call>"
CLOSE_TAG = "</tool_call>"


@dataclass(frozen=True)
class MalformedToolCall:
    raw: str
    name: str | None
    reason: str
    detail: str
    chars: int


def _extract_name_hint(raw: str) -> str | None:
    match = re.search(r'"name"\s*:\s*"([^"]+)"', raw)
    return match.group(1) if match else None


def _parse_call_detailed(raw: str, index: int) -> tuple[ToolCall | None, MalformedToolCall | None]:
    body = raw.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", body, re.S)
    if fence:
        body = fence.group(1)
    try:
        data = json.loads(body)
    except ValueError as exc:
        return None, MalformedToolCall(
            raw=raw,
            name=_extract_name_hint(raw),
            reason="invalid_json",
            detail=str(exc),
            chars=len(raw),
        )
    if not isinstance(data, dict) or not isinstance(data.get("name"), str):
        return None, MalformedToolCall(
            raw=raw,
            name=_extract_name_hint(raw),
            reason="missing_name",
            detail="JSON 객체에 문자열 'name' 필드가 없습니다.",
            chars=len(raw),
        )
    arguments = data.get("arguments")
    if not isinstance(arguments, dict):
        arguments = {}
    call_id = data.get("id")
    if not isinstance(call_id, str) or not call_id.strip():
        call_id = f"call_{index}"
    return ToolCall(call_id=call_id.strip(), name=data["name"].strip(), arguments=arguments), None


def _parse_call(raw: str, index: int) -> ToolCall | None:
    call, _ = _parse_call_detailed(raw, index)
    return call


class ToolCallExtractor:
    """스트리밍 텍스트에서 도구 호출 블록을 떼어 낸다."""

    def __init__(self, id_prefix: str = "call") -> None:
        self._buffer = ""
        self._inside = False
        self._count = 0
        self._id_prefix = id_prefix
        self.malformed: list[str] = []
        self.malformed_details: list[MalformedToolCall] = []

    def feed(self, chunk: str) -> tuple[str, list[ToolCall]]:
        self._buffer += chunk
        visible: list[str] = []
        calls: list[ToolCall] = []
        while True:
            if not self._inside:
                idx = self._buffer.find(OPEN_TAG)
                if idx >= 0:
                    visible.append(self._buffer[:idx])
                    self._buffer = self._buffer[idx + len(OPEN_TAG):]
                    self._inside = True
                    continue
                hold = _partial_suffix(self._buffer, OPEN_TAG)
                visible.append(self._buffer[: len(self._buffer) - hold])
                self._buffer = self._buffer[len(self._buffer) - hold:]
                break
            idx = self._buffer.find(CLOSE_TAG)
            if idx < 0:
                break
            raw = self._buffer[:idx]
            self._buffer = self._buffer[idx + len(CLOSE_TAG):]
            self._inside = False
            self._count += 1
            call, err = _parse_call_detailed(raw, self._count)
            if call is None:
                self.malformed.append(raw)
                if err is not None:
                    self.malformed_details.append(err)
            else:
                if call.call_id == f"call_{self._count}":
                    call = ToolCall(f"{self._id_prefix}_{self._count}", call.name, call.arguments)
                calls.append(call)
        return "".join(visible), calls

    @property
    def pending_chars(self) -> int:
        """지금 작성 중인(아직 닫히지 않은) 도구 블록의 길이. 0 이면 블록 밖이다."""
        return len(self._buffer) if self._inside else 0

    @property
    def pending_name(self) -> str | None:
        if not self._inside:
            return None
        return _extract_name_hint(self._buffer)

    def flush(self) -> tuple[str, list[ToolCall]]:
        """턴이 끝났을 때 남은 꼬리. 닫히지 않은 도구 블록은 호출로 인정하지 않는다."""
        tail = self._buffer
        self._buffer = ""
        if self._inside:
            self._inside = False
            self.malformed.append(tail)
            self.malformed_details.append(
                MalformedToolCall(
                    raw=tail,
                    name=_extract_name_hint(tail),
                    reason="unclosed_tag",
                    detail="</tool_call> 닫힘 태그 전에 출력이 종료되었습니다.",
                    chars=len(tail),
                )
            )
            return "", []
        return tail, []


def _partial_suffix(text: str, tag: str) -> int:
    """`text` 끝이 `tag` 의 접두어라면 그 길이 (붙잡아 둘 꼬리)."""
    for size in range(min(len(tag) - 1, len(text)), 0, -1):
        if text.endswith(tag[:size]):
            return size
    return 0


def render_tool_results(results: list[dict[str, Any]]) -> str:
    parts = []
    for item in results:
        payload = json.dumps(item.get("output"), ensure_ascii=False, default=str)
        if len(payload) > 12000:
            payload = payload[:12000] + "…(truncated)"
        parts.append(
            f'<tool_result id="{item["id"]}" name="{item["name"]}" ok="{str(bool(item["ok"])).lower()}">'
            f"{payload}</tool_result>"
        )
    return "\n".join(parts)
