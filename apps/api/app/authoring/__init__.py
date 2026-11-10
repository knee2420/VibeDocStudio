"""authoring — 문서에 들어갈 변경안을 만들고(생성) · 대기열에 올리고(제안) · 승인되면 반영되게 하는 도메인.

- 규칙 초안기 (`/api/ai/compose`, `phase1/storyline`, `phase2/templates`) — LLM 을 부르지 않는 규칙 엔진
- 하네스 (`/api/assistant/harness/*`) — LLM 게이트웨이로 슬롯을 채우고 출력 계약 · 게이트로 검사
- Staged 대기열 (`/api/projects/{id}/staging*`) — 승인 전 변경안 저장소

Composer 대화(작업대 제안 `wb_propose`)는 assistant 가 만들고 화면에서 같은 대기열로 들어온다.
"""
