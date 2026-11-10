"""LLM 게이트웨이 — 모델 실행 수단의 유일한 경계.

- `catalog`: 모델 식별자 정본 (엔진 공급자 · 설정 화면 · 정책 기본값이 함께 읽는다)
- `policy`: 런타임에 바뀌는 실행 정책 (기본 공급자 · 모델 · 타임아웃)
- `ports` · `models`: 다른 도메인의 유스케이스가 아는 계약 (`ConversationEngine` · `EngineProvider` · `EngineChoice`)
- `adapters`: agy ACP · agy stream(예열 풀) · agy 단발(print) · Google API · 오프라인 엔진 · OS 자격 증명
- `use_cases` · `router`: AI 설정 화면 (`/api/runtime`, `/api/providers/*`)

다른 도메인의 use_cases 는 `ports` · `models` · `policy` 만 import 한다. 구체 실행기(`adapters`)는
bootstrap 과 다른 도메인의 adapters 만 쓴다. 프롬프트 · 문서 분석 규칙은 여기 두지 않는다.
"""
