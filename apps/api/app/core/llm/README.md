# LLM Runtime

이 디렉터리는 모델 실행 수단과 관측을 소유한다. 프롬프트, 문서 분석 규칙, HTTP 응답 문구는 소유하지 않는다.

향후 CLI 우선 실행, Google API 폴백, 공급자 실패 분류, 자격증명 조회, trace 상관관계를 이곳에 추가한다. 실제 어댑터 선택은 `bootstrap/container.py`에서만 한다.

설계 정본은 `workbench/01.requirements_analysis/features/F-02-agent-runtime-and-resilient-llm-execution.md`다.
