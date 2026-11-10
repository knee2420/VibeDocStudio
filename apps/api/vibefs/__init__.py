"""vibefs — agy 에이전트 샌드박스 런타임 (API 앱 밖의 독립 패키지).

agy 가 작업 폴더 플러그인 · 훅으로 띄우는 프로세스(MCP 서버 · 읽기 전용 가드 훅)와, API 가 마운트 · 작업대를
읽고 쓸 때 쓰는 같은 자료 구조를 담는다. 표준 라이브러리만 쓰고 `app` 패키지를 import 하지 않는다
(도구 호출마다 프로세스가 뜨므로 가볍게).

- `index` · `store`: 마운트 목록 · 읽은 범위 원장 · 훅 로그 (`state/assistant/workspace/`)
- `tools`(ws_*) · `mapper`: 리소스 탐색 도구 · 자료 지도
- `workbench` · `wb_tools`(wb_*) · `proposals` · `patterns`(+`registry/layers.json`): 에디터 문서 · 레퍼런스 작업대
- `server`: vibefs MCP 서버 (stdio JSON-RPC) · `hook`: PreToolUse 가드 · PostToolUse 읽은 범위
- `sandbox`: agy 작업 폴더의 `.agents/` 설정 (이 패키지의 진입점을 가리킨다)

프로세스 진입점은 `__main__.py` 하나다:

    python -I <apps/api>/vibefs/__main__.py mcp  --state <dir> [--session <id>]
    python -I <apps/api>/vibefs/__main__.py hook pre|post --state <dir>
"""
