# UPSTREAM — `@vibe/ai-composer`

* **Upstream Repositories**:
  1. `https://github.com/steven-tey/novel` (`packages/headless/src/components` — `AISelector` / `AICompletion`)
  2. `https://github.com/assistant-ui/assistant-ui` (`packages/react` — `ComposerPrimitive` & Context Attachments)
* **License**: Apache-2.0 / MIT
* **Role in VibeDocStudio**:
  * 캔버스의 모든 컴포넌트(배너, 다단 그리드, 표, 개별 슬롯)에 직접 달라붙는 **부착형(Inline Floating) AI Composer** (`@floating-ui/react` + `cmdk`)
  * `@슬롯` 및 `📎 연결된 백데이터` 컨텍스트 칩 표시, 실시간 스트리밍 미리보기 및 `[적용(Accept) | 재시도 | 취소]` 제어
