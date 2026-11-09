# UPSTREAM — `@vibe/ai-inline`

* **Upstream Repositories**:
  1. `https://github.com/steven-tey/novel` (`packages/headless/src/components` — `AISelector` / `AICompletion`)
  2. `https://github.com/assistant-ui/assistant-ui` (`packages/react` — `ComposerPrimitive` & Context Attachments)
* **License**: Apache-2.0 / MIT
* **Role in VibeDocStudio**:
  * 캔버스의 대상(슬롯 · 아웃라인 노드 · 표 셀 …)에 붙는 **인라인 AI 카드** (`InlineComposerCard`)
  * 화면별 차이는 `InlineAiSurface` 어댑터(`@vibe/ai-kernel`)가 흡수한다 — 대상 이름 · 컨텍스트 · 미리보기 · 반영 방법
  * 실행 · 스트리밍 · 재시도 · 중단은 `useInlineAiRun`(`@vibe/ai-react`), 빠른 지시는 액션 레지스트리(`surfaces`)에서 읽는다
  * 다중 턴 대화가 필요하면 "Composer 로" 버튼이 대상과 결과를 AI Composer(`@vibe/ai-composer`)로 넘긴다

## 패키지 지도 (공유 vs 분리)

| 패키지 | 역할 |
|---|---|
| `@vibe/ai-kernel` | (공유) 엔진 클라이언트 · SSE 이벤트 · 컨텍스트/도구/액션 레지스트리 · Composer 세션 루프 · 인라인 실행 |
| `@vibe/ai-react` | (공유) 훅(`useComposerState`, `useInlineAiRun`) · UI 조각(칩, 마크다운, 입력창, 수락 바) |
| `@vibe/ai-composer` | (분리) 오른쪽 패널 Composer — 스레드 · 도구 호출 카드 · 권한 모드 · 엔진 선택 |
| `@vibe/ai-inline` | (분리) 대상 옆 인라인 카드 |
