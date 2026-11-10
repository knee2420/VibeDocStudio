# `@vibe/harness-packs`

에이전트 하네스의 **영역 팩 — 데이터만** 둔다. 실행 로직은 `packages/harness-kit`(Python 기본기)과 각 앱 코드에 있다.
백엔드(`harness_kit.packs`)와 프론트(`import … from "@vibe/harness-packs/<팩>/<파일>.json"`)가 같은 파일을 읽는다.

참조 형식은 `"<팩>:<경로>"` (예: `reference:layers.json`, `core:rules/workspace-head.md`).

| 팩 | 영역 | 주요 파일 |
|---|---|---|
| `core` | 모든 영역 공통 기본기 | `pack.json` compose(규칙 글 조립 순서) · `rules/*.md` · `output-formats.json` · `messages.json` · `settings.json` · `sandbox/`(샌드박스 규칙 · 훅 정책) · `lexicon/ko.json` |
| `editor` | 지금 쓰는 문서 | `tools.server.json`(wb_*) · `tools.client.json`(문서 · 캔버스 · Staged) · `rules/` |
| `reference` | 남의 완성작 → 의사결정 궤적 | `layers.json`(층위 레지스트리 · 채택 검사 한도) · `tools.json`(rf_*) · `tools.client.json` · `settings.json` · `messages.json` · `skills/` |
| `resource` | 사실 근거 | `tools.json`(ws_*) · `tools.client.json` · `clusters.json` · `intents.ko.json` · `lexicon.ko.json` · `coverage.json` · `messages.json` · `index/`(지식 덱: 도구 · 카드 프롬프트 · 색인 어휘 · 스킬) |
| `authoring` | 변경안 생성 · 제안 | `harness.json`(하네스 명세 · 규칙) · `proposal.json`(모드 · 검증기 순서 · 임계값) · `inline-actions.json`(슬롯 · 범위 · 첨부 빠른 지시) · `template-rules.json` · `messages.json` |
| `form-scaffold` | PDF 양식 → `.vdoc` | `loop.json` · `tunables.json` · `fonts.json` · `prompts.json` · `tools.loop.json` · `skills/` · `tools/visual_fidelity` |

규칙:

- 메시지 · 프롬프트는 `{이름}` 자리를 쓰는 `str.format` 템플릿이다. 글 안의 `{` `}` 는 `{{` `}}` 로 쓴다.
- 정규식은 `{"pattern": …, "flags": "i"}` 로 둔다.
- 새 파일은 그 팩의 `pack.json` 에 선언한다 (`tools` · `clientTools` · `loopTools` · `messages` · `prompts` · `inlineActions` · `compose`).
- 검사: `apps/api/tests/test_harness_packs.py` (선언 · 형식 · 검증기 등록 · 코드에 긴 지시문 없음 · 클라이언트 도구 일치).
