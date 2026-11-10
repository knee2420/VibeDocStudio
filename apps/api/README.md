# `@vibe/api` (`apps/api`)

FastAPI 헥사고날 도메인 슬라이스 백엔드. 도메인마다 `models` · `ports` · `use_cases` · `adapters` · `router` 를 두고,
구체 구현의 선택과 저장 경로 주입은 `app/bootstrap/container.py` 한 곳에서만 한다.

## 도메인 지도

프로그램의 세 역할(사실 · 남의 완성작 · 내 문서)과 AI 두 층(생성 · 대화)을 축으로 나눈다.

| 패키지 | 역할 | HTTP |
|---|---|---|
| `app/resource` | **Resource — 사실 근거.** `ledger`(RM 원장: 트리 · 체크 · 발췌), `index`(자동 색인 지식 덱), `backdata`(원문 단락) | `/api/resources` · `/api/knowledge` · `/api/backdata` |
| `app/reference` | **Reference — 남의 완성작 → 의사결정 궤적.** 라이브러리 · 추출 · 층위 · 핀 · 프로젝트 바인딩. vdoc 과 무관 | `/api/reference` |
| `app/documents` | **Document — 내가 쓰는 문서** (`.vdoc`) · 리비전 · 슬롯 패치 | `/api/documents` |
| `app/projects` | 프로젝트 매니페스트 · 아웃라인 명령 | `/api/projects` |
| `app/catalog` | 서식 카탈로그 (목록 · 번들 · PDF → 카탈로그 인입) | `/api/catalog` |
| `app/form_scaffold` | PDF 양식 → 편집 가능한 `.vdoc` 변환 파이프라인 (기준선 · 피델리티 루프) | `/api/catalog/scaffold` |
| `app/authoring` | 변경안 **생성 · 제안**: 규칙 초안기 · 하네스 · Staged 대기열 | `/api/ai` · `/api/assistant/harness/*` · `/api/projects/{id}/staging*` |
| `app/assistant` | AI Composer **대화**: 세션 · 턴 · 인라인 실행 · 작업 공간 마운트 · 출처 사용 집계 | `/api/assistant` |

도메인이 아닌 공유 계층:

| 패키지 | 역할 |
|---|---|
| `app/llm` | **LLM 게이트웨이.** 모델 목록 정본(`catalog`) · 실행 정책 · 엔진 포트 · agy(ACP · stream · 단발) · Google API · 자격 증명 · AI 설정 화면(`/api/runtime`, `/api/providers/*`) |
| `app/core` | 오류 계층 · 저장 루트(`StorageRoots`) · 원자적 JSON · SSE · 프로세스 트리 · 관측 |
| `app/bootstrap` | DI 컨테이너 · 오류 → HTTP 번역 · 작업 공간 시드 |
| `vibefs/` (`app` 밖) | **agy 샌드박스 런타임.** MCP 서버 · 읽기 전용 가드 훅 · 탐색 도구 · 작업대 자료 구조. 진입점 `vibefs/__main__.py` 하나 |

## 하네스 = 기본기 + 영역 팩 (`packages/`)

에이전트 하네스 자산은 백엔드 · 프론트 코드에 두지 않는다. 코드에는 실행 로직만 남는다.

| 패키지 | 내용 |
|---|---|
| `packages/harness-kit` (`harness_kit`, 코드) | 호스트 무관 기본기: 팩 읽기 · 규칙 글 조립(`packs.compose`) · 메시지 템플릿(`packs.message`) · 층위 측정기(`patterns`) · 후보 검증기 실행(`gates`) · HTML → 글. `app` · `vibefs` 를 import 하지 않고 영역 글을 품지 않는다 |
| `packages/harness-packs` (데이터, `@vibe/harness-packs`) | 영역 팩 `core` · `editor` · `reference` · `resource`(+`index`) · `authoring` · `form-scaffold`. 각 팩의 `pack.json` 이 규칙 글(.md) · 도구 명세(서버 `tools*.json` · 클라이언트 `tools.client.json` · 루프 `tools.loop.json`) · 레지스트리 · 어휘 · 임계값 · 메시지 · 스킬을 선언한다. Python 과 TS 가 같은 파일을 읽는다 |

- 팩 위치는 `VIBE_HARNESS_PACKS` 로 바꿀 수 있다 (기본: 저장소 `packages/harness-packs`). 파일은 수정 시각으로 캐시를 갱신한다.
- 모델에게 가는 긴 안내 · 지시문(한글 40자 이상)은 코드에 두지 않는다 — `tests/test_harness_packs.py` 가 지킨다.
- 새 영역 하네스는 팩 하나(데이터)와, 필요하면 `harness_kit/gates/<영역>.py` 검증기를 더하고 `authoring:proposal.json` 의 순서에 선언한다.

## 의존 규칙 (`pyproject.toml` 의 import-linter 계약)

- 도메인 패키지는 다른 도메인을 import 하지 않는다 (라우터 포함). 도메인 사이 연결은 container 가 포트로 꽂는다.
- 도메인은 `app.core` · `app.llm`(포트 · 모델 · 정책 · 카탈로그) · `vibefs` 에 기댈 수 있다.
  도메인의 `use_cases` · `agents` 는 `app.llm.adapters`(구체 실행기)를 모른다.
- `app.core` · `app.llm` 은 도메인을 import 하지 않는다. `vibefs` 는 `app` 을 import 하지 않는다.
- `harness_kit` 은 `app` · `vibefs` · `pdf_vdoc_engine` 를 import 하지 않는다 (팩은 데이터로 읽는다).
- Reference 는 `pdf_vdoc_engine` · `documents` · `catalog` 를 import 하지 않는다.
- 라우터는 예외를 HTTP 로 바꾸지 않는다. `app.core.errors`(NotFound · Validation · Conflict · Forbidden)를 올리면
  `bootstrap/error_handlers.py` 가 번역한다 (`ValueError` → 400).

## 저장 위치 (`app/core/storage/paths.py`)

- `data/` (백업 대상): 문서 · 프로젝트 · 레퍼런스 · RM 원장(`knowledge/resource_ledger`) · 업로드 · 지식 덱
- `cache/`: 언제 지워도 다시 만들 수 있는 파생물
- `state/`: 잃어도 되는 운영 상태 (로그 · 에이전트 실행 기록 · agy 샌드박스 · 작업 공간 마운트)
- 에이전트 스킬 · 판정 도구: 하네스 팩 안 (`resource:index/skills` · `reference:skills` · `form-scaffold:skills` · `form-scaffold:tools`)

## 명령

```bash
pnpm --filter @vibe/api dev     # dev_server.py (포트 8090)
pnpm --filter @vibe/api test    # pytest
pnpm --filter @vibe/api lint    # compileall · ruff · import-linter 계약
```
