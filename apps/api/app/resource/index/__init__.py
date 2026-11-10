"""knowledge 도메인 — Auto-Index(지식 덱) 색인 · 조회 · Composer 서버 도구.

- `pipeline/`  색인 로직 (수집 → 분할 → 카드 · 자산 → 인덱스 → 품질). 저장 위치 · LLM 공급자를 모른다.
- `use_cases/` 비동기 작업 큐(`IndexJobRunner`) · 덱 조회 · `knowledge.*` 서버 도구(`KnowledgeToolbox`)
- `adapters/`  로컬 저장소 · agy 실행기
"""
