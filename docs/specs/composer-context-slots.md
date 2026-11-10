# 작업 명세서 — Composer 컨텍스트 슬롯(레퍼런스 · 리소스 · 범위) 표준 패턴 재구성

- 대상 파일(주): `apps/studio/src/features/ai-composer/ui/ComposerSettingsBar.tsx` (869줄, 단일 파일)
- 작성일: 2026-11-09 · 기준 커밋: `e3ea421 refactoring-reference-manager` (브랜치 `bigbang-patch-by-mang`)
- 성격: **프론트엔드 표현 계층 재구성**. 스토어 · API · 백엔드 변경 없음 (예외는 §7.2 의 `hint` 한 곳)

---

## 1. 왜 하는가 (실측 근거)

AI Composer 입력창 위 설정바(`composer-settings-bar`)의 세 메뉴가 서로 다른 규격으로 따로 만들어졌고, 리소스 메뉴는 고를 수 없는 상태다.

| | 레퍼런스 | 리소스 | 범위 |
|---|---|---|---|
| 구현 | 전용 팝오버(독자 구현) | 공통 `Menu`/`MenuItem` | 공통 `Menu`/`MenuItem` |
| 너비 · 글자 · 모서리 | 320px · 11px · 8px | 300px · 12px · 12px | 300px · 12px · 12px |
| 배경 | `dark:` 클래스 때문에 OS 다크에서 혼자 검정 | 흰색 | 흰색 |
| 켜기 표시 | 왼쪽 체크박스 | 오른쪽 ✓ | 오른쪽 ✓ |
| 일괄 문구 | 모두 켜기 \| 모두 끄기 | 전체 끄기 | 전체 \| 초기화 |
| 목록 | 5개 | **잎 파일 267개 평면 나열 (메뉴 높이 648px)** | 모드 3 + 페이지 |

리소스 실측 (프로젝트 `vproj-enterprise-architecture-suite`): 노드 513 · 잎 339 · 체크된 잎 267 · 깊이 최대 6. 같은 이름 파일 93개(`SKILL.md` 20개 등), 서식류 32개. 평면 목록으로는 구분 · 선별이 불가능하다.

추가 문제: 바가 `grid-cols-3` 고정(칸당 약 127px)이라 요약이 잘리고 슬롯을 더 넣을 자리가 없다. 슬롯마다 요약 · 툴팁 · 팝오버 코드를 160~190줄씩 따로 들고 있다.

## 2. 따르는 표준 패턴 (아이디어가 아니라 이 패턴을 구현한다)

| # | 패턴 | 근거 (공식 문서) |
|---|---|---|
| P1 | 상시 자료 범위 = **자료 종류 단위 토글** + "모두 끄기" | M365 Copilot "Add and manage sources → Change data sources", "Turn off all" — https://support.microsoft.com/en-us/Microsoft-365-Copilot/control-review-sources-copilot-chat |
| P2 | 특정 파일은 **메시지마다 멘션(@)으로 첨부**, 검색형 피커 + 칩 | Cursor @Files/@Folders — https://docs.cursor.com/en/context/@-symbols · VS Code "Add context" — https://code.visualstudio.com/docs/copilot/copilot-chat-context · M365 `/` 참조 — https://support.microsoft.com/en-us/Microsoft-365-Copilot/refer-to-specific-files-and-more-in-microsoft-365-copilot |
| P3 | 큰 묶음은 사용자가 고르지 않고 **AI 가 검색**한다 | VS Code `#codebase` "does not add the entire codebase … requests a search" (위 VS Code 문서) |
| P4 | 자료 하나하나를 고르는 일은 **전용 패널의 체크박스** | NotebookLM 소스 사이드바 — https://support.google.com/notebooklm/answer/16179559 |
| P5 | 부모-자식 다중 선택은 **3상태 체크박스** (일부 = indeterminate, 부모 클릭 = 자식 일괄) | Carbon checkbox — https://carbondesignsystem.com/components/checkbox/usage/ |
| P6 | 메뉴는 짧게, 묶음은 **구분선(separator)**, 긴 목록은 검색 피커 | VS Code UX Quick Picks — https://code.visualstudio.com/api/ux-guidelines/quick-picks |
| P7 | 큰 목록 좁히기 = 측면별 필터 · 필터 칩 (RM 패널 쪽 일. 이번 범위 밖) | NN/g Filters vs. Facets — https://www.nngroup.com/articles/filters-vs-facets/ |

시안: 대화에서 합의한 인터랙티브 목업(칩 바 · 리소스 3상태 폴더 메뉴 · `@` 파일 첨부)을 기준으로 한다.

## 3. 범위

**포함**
1. 슬롯 레지스트리 + 공통 부품(칩 · 메뉴 · 섹션)으로 `ComposerSettingsBar` 재구성
2. 세 슬롯을 공통 부품 위로 옮기기 (§6)
3. 리소스 메뉴를 **폴더 단위 3상태**로 바꾸기 (잎 파일 나열 제거)
4. `@` 리소스 검색 결과에 경로 꼬리 표시 (§7.2)

**제외 (하지 않는다)**
- 백엔드 · API · 스토어 액션 추가/변경 (§7.2 의 `hint` 문자열만 예외)
- Resource Manager(RM) 패널 · Reference Manager 패널 UI 변경
- RM 필터 칩(P7), 지식 덱 기능 확장, 레퍼런스 층위(D1–D6) 토글을 메뉴로 옮기기
- 특정 폴더 구조(예: 회의 × 단계 표)에 맞춘 전용 화면 — **어떤 트리에도 동작하는 범용 부품만** 만든다

## 4. 깨지면 안 되는 연계 (불변 계약)

구현 전후로 아래가 그대로여야 한다. 하나라도 바뀌면 작업 실패다.

1. **RM 스토어가 원장이다.** 리소스의 켜고 끔은 오직 `useResourceStore.toggleItemChoice(projectId, itemId, isChecked)` 로만 바꾼다. 폴더에 호출하면 클라이언트 · 서버 모두 하위로 연쇄된다 (`resources/router.py toggle_choice cascade=true`). 메뉴에서 바꾼 상태가 RM 패널 트리 체크박스와 즉시 같아야 하고, 그 반대도 같아야 한다.
2. **폴더 플래그를 믿지 않는다.** 서버는 폴더의 `isChecked` 를 자식과 따로 저장한다(자식 하나만 끈 폴더도 `isChecked=true` 일 수 있다). 3상태 표시는 **잎 집계**로 계산한다: 켜진 잎 0 = 꺼짐, 전부 = 켜짐, 일부 = indeterminate.
3. **AI 로 가는 마운트는 그대로.** `features/ai-workspace/model/workspaceContexts.ts` 의 `RESOURCE_CONTEXT_PROVIDER` · `resourceMountRef` · `isFullyChecked` 를 수정하지 않는다. 메뉴는 체크 상태만 바꾸고, 마운트는 기존 코드가 체크 상태에서 만든다.
4. **지식 덱**은 `useKnowledgeDeckStore.toggleDeckChoice` · `selectDeckSections` 를 그대로 쓴다 (섹션 아코디언 동작 유지).
5. **레퍼런스**는 `useReferenceStore` 의 `bound` · `setEnabled` · `setAllEnabled` 만 쓴다. 레퍼런스는 작업 문서가 아니다 — 문서 스토어를 건드리지 않는다.
6. **행 스위치 상태**는 `useAiScopeStore` 의 `referencesOn` · `sourcesOn` · `scopeOn` (localStorage 저장 키 포함) 을 그대로 쓴다.
7. **범위**는 `useAiScopeStore` 의 `setMode` · `setFixed` · `pinTarget` · `pinPage` · `togglePageSelected` · `selectAllPages` · `clearSelectedPages` · `togglePageExcluded` · `clearPin` 과 `resolveScope` 를 그대로 쓴다. 고정 중 캔버스 초점이 바뀌었을 때의 제안(`scope-suggestion`) 동작을 유지한다.
8. **"관리" 이동**: 리소스 → `useWorkspaceLayoutStore.getState().openRightPanel("resource-manager")`, 레퍼런스 → `setLeftSidebarOpen(true)` + `setLeftPanelTab("reference-manager")`.
9. **data-testid 유지**: `composer-settings-bar`, `row-switch-references`, `references-setting-button`, `references-menu`, `settings-sources-switch`, `settings-sources`, `settings-sources-menu`, `settings-source-item`, `settings-deck-item`, `settings-deck-section`, `settings-scope-switch`, `settings-scope`, `settings-scope-menu`, `scope-current`, `scope-suggestion`, `scope-mode-{selection|page|document}`, `scope-page-item`, `scope-fix`, `scope-clear`, `scope-selection-detail`. (의미가 바뀌는 `settings-source-item` 은 폴더 행에 붙인다.)

## 5. 설계 — 슬롯 레지스트리 + 공통 부품

### 5.1 파일 구성 (권장)
```
features/ai-composer/ui/ComposerSettingsBar.tsx      바: 레지스트리 순서대로 칩을 그림 (얇게)
features/ai-composer/ui/slots/types.ts               ContextSlot · SlotSection 타입
features/ai-composer/ui/slots/SlotChip.tsx           칩 (스위치 + 요약 + 펼침)
features/ai-composer/ui/slots/SlotMenu.tsx           메뉴 틀 + 섹션 렌더러
features/ai-composer/ui/slots/referencesSlot.tsx     레퍼런스 슬롯 정의
features/ai-composer/ui/slots/resourcesSlot.tsx      리소스 슬롯 정의
features/ai-composer/ui/slots/scopeSlot.tsx          범위 슬롯 정의
features/ai-composer/ui/slots/registry.ts            [referencesSlot, resourcesSlot, scopeSlot]
entities/resource/lib/leafCount.ts                   잎 집계 순수 함수 (RM 트리와 공용)
```

### 5.2 슬롯 정의 계약 (예시 — 이름은 바꿔도 되나 구조는 지킨다)
```ts
interface ContextSlot {
  id: "references" | "resources" | "scope" | string;
  label: string;                         // "레퍼런스"
  icon: React.ReactNode;
  tone: SlotTone;                        // §8 색 토큰
  testIds: { switch: string; button: string; menu: string };
  useSlot(): {
    on: boolean; setOn(v: boolean): void;            // 행 스위치 (P1)
    summary: { primary: string; secondary?: string; state: "on" | "off" | "empty" | "waiting" };
    tooltip: string;
    header?: { allOn?(): void; allOff?(): void; extra?: React.ReactNode };  // "모두 켜기 · 모두 끄기"
    sections: SlotSection[];
    footer?: { hint?: string; manage?: { label: string; onClick(): void } };
    banner?: React.ReactNode;                         // 범위의 초점 제안 등
  };
}
type SlotSection =
  | { kind: "check-list"; title?: string; items: CheckItem[] }                 // 레퍼런스, 페이지
  | { kind: "tri-tree"; title?: string; nodes: TriNode[]; maxDepth: 2 }        // 리소스 (P5)
  | { kind: "radio"; title?: string; value: string; options: RadioOption[] }   // 범위 방식
  | { kind: "note"; text: string; testId?: string }
  | { kind: "action"; item: ActionItem };                                      // 고정 · 고정 해제
```
- 새 슬롯 추가 = 정의 파일 하나 + 레지스트리 한 줄. 바 · 메뉴 코드는 손대지 않는다.
- 섹션 사이에는 구분선(P6). 메뉴 안에서 고르는 동안 메뉴는 닫히지 않는다(현재 동작 유지).

### 5.3 칩 (바)
- 바 레이아웃: `grid-cols-3` → `flex flex-wrap gap-1.5`. 칩은 내용 너비(최소 120px), 넘치면 다음 줄.
- 칩 구성: `[아이콘 라벨]`(스위치, `role="switch"`, 현재와 같이 클릭 시 on/off) `|` `[요약 ▴]`(메뉴 열기, `aria-expanded`).
- 요약 문법 하나로: 꺼짐 → `꺼짐`, 없음 → `없음`, 그 외 → `primary` (+ ` · secondary`). 예: 레퍼런스 `5/5개 · 핀 1`, 리소스 `267/339개`, 범위 `선택만 · p1 메타데이터 슬롯`.

### 5.4 메뉴 (공통 규격)
- `role="menu"`, 너비 300px(최대 `calc(100vw-32px)`), 글자 12px, 모서리 12px, 최대 높이 60vh 스크롤, 그림자 기존 `Menu` 와 동일.
- 헤더: 슬롯 라벨 + 오른쪽 `모두 켜기 · 모두 끄기` (해당 시). 문구는 이 두 개로 통일.
- 항목: `[체크 표시] 제목(한 줄 말줄임) … 회색 메타(종류 · 쪽 · 개수)`. 꺼진 항목은 회색으로 남겨 바로 다시 켤 수 있게(현재 리소스 메뉴 동작).
- 체크 표시는 **왼쪽 체크박스형**으로 통일 (RM · Reference Manager 패널과 같은 위치, 3상태 표현 가능). 라디오 섹션은 왼쪽 원형.
- 푸터: 왼쪽 회색 안내 한 줄, 오른쪽 `○○ 열기 →` 링크.
- 다크 모드: 세 메뉴가 같은 방식이어야 한다. 기존 공통 `Menu` 처럼 라이트 고정이면 레퍼런스 메뉴의 `dark:` 클래스를 제거한다 (한쪽만 다크 금지).

## 6. 슬롯별 명세

### 6.1 레퍼런스
- 데이터: `useReferenceStore.bound` (순서 = 참조 번호), 핀 수 `pins[refId].length`, 체크한 핀 `checkedPinIds`.
- 섹션: `check-list` "이 프로젝트에 연결된 레퍼런스" — 항목 제목 `참조N {title}`, 메타 `{PDF|웹|이미지} · {n}쪽 · 핀 {n}`, 실패(`item.status==="failed"`)면 메타에 `가져오기 실패`.
- 동작: 항목 클릭 = `setEnabled(refId, !enabled)`, 헤더 = `setAllEnabled(true|false)`.
- 행 클릭으로 뷰어 열기 버튼은 메타 옆 아이콘으로 유지 (`revealReferenceViewer(refId)`).
- 푸터: `층위 · 핀은 Reference Manager 에서` + `Reference Manager 열기 →`.
- 요약: `{켜진 수}/{연결 수}개` + (핀 있으면) ` · 핀 {활성 핀 수}`.

### 6.2 리소스 (핵심)
- 데이터: `useResourceStore.items` (없으면 기존처럼 `loadSession(projectId)`), 지식 덱 `useKnowledgeDeckStore.decks`.
- 섹션 1 `tri-tree` "원본 (RM)": **루트(깊이 0)와 그 바로 아래 폴더(깊이 1)까지만** 보인다. 잎 파일은 메뉴에 나오지 않는다 (P3 · P4).
  - 각 노드: 3상태 체크 · 제목 · 메타 `{켜진 잎}/{전체 잎}` (§4-2 잎 집계).
  - 노드 클릭: 상태가 켜짐이면 끄고, 꺼짐/일부면 켠다 → `toggleItemChoice(projectId, node.id, next)` (하위 연쇄).
  - 루트가 파일이면(최상위 단일 파일) 일반 체크 항목으로 표시.
  - 깊이 1 폴더가 많으면(>12) 상위 12개 + `… N개 더` 접기 행 (펼치면 전체).
- 섹션 2 지식 덱: 현재 동작 그대로(덱 체크 + 섹션 아코디언).
- 헤더: `모두 켜기 · 모두 끄기` = `toggleAllChoice(projectId, v)` (덱은 건드리지 않음 — 현재와 동일).
- 푸터: `파일 하나하나는 RM 에서 · 이번 질문만은 @` + `RM 열기 →`.
- 요약: `{켜진 잎}/{전체 잎}개` + (덱 있으면) ` · 덱 {n}`.
- 제거: 기존 `turnedOff`(이 세션에서 끈 잎 목록) 상태와 잎 나열 코드.

### 6.3 고칠 범위
- 2026-11-10 변경: 이 슬롯은 **'고칠 범위'** 다. 라벨 · 헤더가 `고칠 범위` 로 바뀌었고, AI 는 범위 밖도 읽을 수 있다
  (쓰기 도구만 범위 가드, 읽기 도구는 '문서 전체' 모드에서 사용자가 뺀 페이지만 거부 — `scopeHidesPage` 등). 이 의미를 유지한다.
- 기능 변경 없음. 기존 로직을 섹션으로 옮긴다:
  - `radio` "방식": 선택만 / 이 페이지 / 문서 전체 (메타 = 기존 `modeDetail`)
  - 모드별 `check-list` "페이지" (page: 다중 선택, 헤더 `전체 · 초기화` 는 이 섹션 헤더로 유지 / document: 제외 토글)
  - `note` 선택 상세 (`scope-selection-detail`)
  - `action` 고정 / 고정 해제
  - `banner` 초점 제안 (`scope-suggestion` 칩도 바 요약 안에 유지)
- 요약을 `{방식} · {대상}` 으로: `선택만 · p1 메타데이터 슬롯`, `이 페이지 · p1`, `여러 쪽 · p1, p3 (2쪽)`, `문서 전체 · 5/5쪽`. 고정이면 앞에 📌 아이콘(현재처럼) + 툴팁에 `고정됨`.

## 7. `@` 첨부 (P2) — 이미 있는 기능을 다듬기만 한다

7.1 현재: `packages/ai-react/src/PromptInput.tsx` 가 `@` 를 감지해 `runtime.contexts.search(query)` 결과를 보여 준다. 리소스 결과는 `RESOURCE_CONTEXT_PROVIDER.search` (`workspaceContexts.ts`) 가 `resourceItemRef` 로 만든다 — 체크 여부와 무관하게 전체에서 찾는다.

7.2 변경 (유일한 계약 변경, 표시 문자열만):
- `resourceItemRef` 의 `hint` 를 `확장자` → **경로 꼬리**(루트 다음부터 부모 폴더 2단계, 예 `10.14 공유회 › A5`)로 바꾼다. 같은 이름 파일(`SKILL.md` 20개)이 구분돼야 한다.
- 검색어가 경로 꼬리에도 맞도록 매칭 대상에 상위 폴더 이름을 포함한다 (예: `10.14` 로 그 폴더 파일이 나온다).
- `content` · `id` · `kind` · `role` 은 바꾸지 않는다.

## 8. 시각 규격

- 색 토큰 (슬롯 = 해당 매니저 패널 색): 레퍼런스 **amber**(Reference Manager 와 동일), 리소스 **violet**(RM 과 동일), 범위 **blue**(현재 amber 는 레퍼런스와 겹침 → 변경). 칩 왼쪽 아이콘 색 · 켜짐 테두리에만 쓰고 메뉴 본문은 중립색.
- 메뉴 체크박스 · 라디오 강조색은 세 슬롯 공통 하나(현 ✓ 색 violet-600 또는 중립) — 슬롯마다 다르게 하지 않는다.
- 글자: 칩 11px · 메뉴 12px · 메타 10.5–11px. 굵기 2단계(보통 · semibold)만.

## 9. 수용 기준 (모두 확인해야 완료)

1. `pnpm --filter @vibe/studio typecheck` 통과.
2. 1920×1080 실제 앱(Studio `:5180`, API `:8090`)에서 확인 — **화면을 줄여서 맞추지 말 것**:
   - 세 메뉴가 같은 너비 · 글자 · 모서리 · 배경 · 체크 위치 · 헤더/푸터 문구.
   - 리소스 메뉴에 잎 파일이 하나도 없고, 루트 2–3개와 깊이 1 폴더만 보인다. 각 메타 `n/m` 이 RM 패널 폴더 숫자(`ResourceNodeToolbox` 의 `n/m`)와 같다.
   - 메뉴에서 폴더를 끄면 RM 패널 트리에서도 꺼지고, RM 에서 잎 하나를 끄면 메뉴의 그 폴더가 indeterminate(–)가 된다.
   - 메뉴에서 폴더를 끈 뒤 Composer 에 질문하면 그 폴더가 리소스 마운트에서 빠진다 (네트워크 요청의 `resource-mount` 첨부 `roots/files` 로 확인).
   - 레퍼런스 메뉴 항목 끄기 → Reference Manager 목록 체크박스도 꺼짐, `/api/reference/projects/{p}` 의 `enabled=false`.
   - 범위: 세 방식 전환 · 페이지 선택/제외 · 고정/해제 · 초점 제안 칩이 기존과 같이 동작.
   - `@SKILL` 입력 시 결과마다 서로 다른 경로 꼬리가 보인다. `@10.14` 로 그 폴더 파일이 나온다.
   - 바에 슬롯이 4개 이상이어도 깨지지 않는다 (임시로 레지스트리에 더미 슬롯 하나 넣어 확인 후 제거).
   - 콘솔 오류 없음.
3. §4 의 data-testid 가 모두 존재.
4. 새 슬롯 추가가 "정의 파일 1개 + 레지스트리 1줄" 로 끝나는지 코드 리뷰로 확인.

## 10. 작업 순서 (권장)

1. `entities/resource/lib/leafCount.ts` 추출 — `RmSourceTreeSection.tsx` 의 `computeAllNodeCounts`(잎 집계 → `NodeCountInfo{totalLeafCount, checkedLeafCount}`)를 그대로 옮기고 RM 트리도 이것을 import 하게 한다 (메뉴와 RM 숫자 일치 보장).
2. `slots/types.ts` · `SlotChip` · `SlotMenu`(섹션 렌더러) 작성.
3. 범위 슬롯 이전 (기능 변경 없음 → 회귀 확인 쉬움).
4. 레퍼런스 슬롯 이전 (독자 팝오버 제거).
5. 리소스 슬롯 재구성 (3상태 폴더).
6. 바 레이아웃 flex-wrap + 레지스트리.
7. `@` 경로 꼬리 (§7.2).
8. §9 검증.

## 11. 참고 위치

- 현재 구현: `apps/studio/src/features/ai-composer/ui/ComposerSettingsBar.tsx` (`RowSwitch` · `usePopover` · `UnifiedSettingButton` · `Menu` · `MenuHeader` · `MenuItem` · `ReferencesRow` · `SourcesRow` · `ScopeRow`)
- RM 스토어: `apps/studio/src/entities/resource/model/useResourceStore.ts` (`toggleItemChoice` 낙관적 연쇄 갱신 211행~)
- RM 트리 집계: `apps/studio/src/widgets/resource-manager/ui/sections/RmSourceTreeSection.tsx`, `ResourceNodeToolbox.tsx`
- 리소스 유틸: `packages/vdoc-schema/src/resource.ts` (`flattenResourceItems`, `getCheckedResourceItems`)
- 마운트 · 검색: `apps/studio/src/features/ai-workspace/model/workspaceContexts.ts` (`resourceItemRef`, `isFullyChecked`, `resourceMountRef`, `RESOURCE_CONTEXT_PROVIDER`)
- `@` 입력: `packages/ai-react/src/PromptInput.tsx` (mention 팝오버 166행~)
- 레퍼런스 스토어: `apps/studio/src/entities/reference-manager/model/useReferenceStore.ts`
- 범위 스토어: `apps/studio/src/entities/ai-scope`
- 서버 체크 연쇄: `apps/api/app/resources/router.py` `toggle_choice`
