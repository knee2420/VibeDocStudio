"""ReAct 루프가 부를 수 있는 도구의 계약과 레지스트리.

도구는 호스트가 만든다. 이 모듈은 이름·설명·인자 형태와 실행 결과의 모양만 정한다.
LLM 은 도구를 직접 실행하지 않는다. 루프가 LLM 이 고른 이름을 여기서 찾아 실행하고,
그 결과(관찰)를 다음 프롬프트에 넣는다.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable

ToolFn = Callable[[dict[str, Any]], "ToolResult"]


@dataclass
class ToolResult:
    ok: bool
    observation: dict[str, Any]
    #: 이 결과로 루프를 끝낸다 (finish 도구 등).
    terminal: bool = False
    #: 관찰에 넣기엔 큰 산출물의 디스크 경로 (로그에만 남긴다).
    artifacts: dict[str, str] = field(default_factory=dict)

    @classmethod
    def fail(cls, message: str, **extra: Any) -> "ToolResult":
        return cls(ok=False, observation={"error": message, **extra})


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    #: 인자 이름 -> 설명. LLM 에게 그대로 보여 준다.
    args: dict[str, str]
    fn: ToolFn

    def describe(self) -> str:
        if not self.args:
            arg_text = "(인자 없음)"
        else:
            arg_text = "; ".join(f"{k}: {v}" for k, v in self.args.items())
        return f"- `{self.name}` — {self.description}\n  args: {arg_text}"


class ToolRegistry:
    def __init__(self, tools: list[Tool]) -> None:
        self._tools = {t.name: t for t in tools}

    @property
    def names(self) -> list[str]:
        return list(self._tools)

    def describe(self) -> str:
        return "\n".join(t.describe() for t in self._tools.values())

    def run(self, name: str, args: dict[str, Any]) -> ToolResult:
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult.fail(f"알 수 없는 도구 '{name}'. 쓸 수 있는 도구: {', '.join(self._tools)}")
        try:
            return tool.fn(args or {})
        except Exception as exc:  # 도구 예외는 관찰로 돌려 LLM 이 고칠 기회를 준다
            return ToolResult.fail(f"{type(exc).__name__}: {exc}")


def compact_json(value: Any, *, max_chars: int) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + f"…(+{len(text) - max_chars} chars 생략)"
