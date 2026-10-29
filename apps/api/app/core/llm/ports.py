"""core/llm 이 양쪽에 노출하는 계약.

`packages/scaffold-engine` 은 `ModelExecutor` Protocol 만 안다. 엔진이
`app.core.llm` 을 import 하는 일은 없어야 한다. 구현을 넣어 주는 것은
`bootstrap/container.py` 의 일이다.

관측 기록 계약(`ExecutionRecorder`)은 여기 있었지만 **아무도 호출하지 않았다.**
컨테이너가 만들어 유스케이스에 주입까지 했는데 `self._recorder` 에 담긴 채 끝났고,
그래서 비용 원장이 조용히 멈춰 있었다. 비용을 아는 지점은 `AgentRuntime.record_cost`
하나뿐이므로 기록도 거기서 한다.
"""
from __future__ import annotations

from llm_driver import LlmExecutionResult
from scaffold_engine.contracts import ModelExecutor

__all__ = ["ModelExecutor", "LlmExecutionResult"]
