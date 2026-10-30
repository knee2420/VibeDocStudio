# Agent Core

Pure Host-independent Agent Runtime & LLM Driver Kernel.

## Structure
- `agent_core.runtime`: Agent run lifecycle, event-sourcing, agreements, and execution approval engine.
- `agent_core.llm`: Multi-provider LLM harness, resilient fallback, availability, and model registry.
- `agent_core.react`: CLI 하네스(`AgyCliHarness`)로 도는 ReAct 루프. 스킬(`SKILL.md`)을 시스템 프롬프트로 싣고,
  호스트가 만든 도구(`ToolRegistry`)를 LLM 이 고르면 루프가 실행해 관찰을 다음 턴에 넣는다.
  실행 한 건은 `RunTrace` 디렉터리 하나에 남는다 (`trace.jsonl` · `steps/NN_prompt.txt` · `NN_response.json` · `NN_observation.json` · `summary.json`).
  `RunLogContextFilter` 를 로그 핸들러에 달면 앱 로그 줄마다 `run_id` · `step` 이 붙는다.
