# 블록 종류 추가 가이드

블록 종류 하나 = **모델 정의 하나** (`@vibe/vdoc-schema` block-kit) + **뷰 하나** (`@vibe/slot-canvas` block-views).
아웃라이너 · 블록 추가 메뉴 · 표 명령 · 사각형 선택 · Composer 첨부 · AI 도구가 모두 이 두 정의만 읽습니다.
블록마다 `kind === "…"` 분기를 여기저기 늘어놓지 않습니다.

## 빠른 시작

```bash
node scripts/new-block.mjs quote-box "인용 상자"
pnpm test
```

스크립트가 만드는 것:

| 파일 | 내용 |
|---|---|
| `vdoc-schema/src/blocks/<kind>-block.ts` | 블록 JSON 타입 (`<Pascal>BlockDef`) |
| `vdoc-schema/src/block-kit/kinds/<kind>.ts` | 모델 정의 (`defineBlockKind`) |
| `slot-canvas/src/block-views/views/<Pascal>BlockView.tsx` | 화면 (`defineBlockView`) |

그리고 `LAYOUT_BLOCK_KINDS` · `LayoutBlock` 합 타입 · 두 레지스트리에 등록합니다. 뼈대는 슬롯 하나짜리라 그대로도 규격 검사를 통과합니다.

## 모델 정의 (`BlockModelDefinition`)

| 필드 | 필수 | 하는 일 | 쓰는 곳 |
|---|---|---|---|
| `kinds` · `label` · `category` · `icon` | ✓ | 종류 이름 (별칭 포함) · 사람 이름 · 분류 · lucide 아이콘 이름 | 블록 추가 메뉴 · AI 설명 · 칩 |
| `slotIds(block)` | ✓ | 렌더하는 모든 slotId, 읽는 순서대로 | 잠금 · 복제 · 슬롯 검색 |
| `units(block)` | | 선택 단위. 생략하면 슬롯마다 하나. **슬롯이 아닌 내용(이미지 · 구분선 · 차트)은 반드시 `media` / `static` 단위로** | 사각형 선택 · Ctrl+L · AI 첨부 |
| `outline(block, ctx)` | | 아웃라이너 노드. `ctx.emitSlot` · `emitContainer` · `emitSlotGroup` · `emitStatic` · `emitTable` · `emitFrame` 를 조합 | 아웃라이너 |
| `tables` · `replaceTable` | 둘 다 또는 없음 | 블록 안의 표 (구역별) | 표 편집 도구 줄 · AI 표 위치(`구역2 r1c3`) |
| `insertable` | | 블록 추가 메뉴 항목 + 빈 틀 만들기 | 블록 팔레트 · 블록 사이 `+` |
| `layout` | | `resizable` (모서리 크기 조절) · `ownGrip` (블록이 자기 ⋮⋮ 를 그림) | 블록 테두리 |
| `ai.describe(block)` | | 슬롯 밖 정보 한 줄씩 (이미지 주소 · 담당자 · 정렬) | Composer 첨부 내용 |
| `ai.editableProps` | | AI 가 바꿀 수 있는 블록 속성 (`type` · `description` · `enum`) | `blocks.proposeProps` 도구 · Staged `block-props` |

## 뷰 (`BlockViewDefinition`)

뷰는 **블록 몸통만** 그립니다. 테두리 · 핸들 · 드래그 · 잠금 · 삭제 같은 공통 크롬은 페이지 시트(`BaseBlockWrapper`)가 감쌉니다.

- 슬롯은 `ctx.renderSlot(slotId, options)` — 리치텍스트 편집기 · 인라인 AI · 선택 단위 표시까지 붙여 줍니다.
- 표는 `<InteractiveTable … {...ctx.tableBindings(sectionId)} />`.
- 슬롯이 아닌 선택 단위는 `{...ctx.unitAttrs(unitId, "media")}` 를 그 요소에 붙입니다. 이 표시(`data-vdoc-unit`)가 없으면 사각형 선택과 AI 첨부가 그 요소를 찾지 못합니다.
- 블록 속성 변경은 `ctx.updateBlock(prev => …)`.
- **블록 전용 조작(이미지 교체 · 정렬, 상자 색, 담당자 …)은 뷰 안에 툴바를 띄우지 말고 `controls(block, api)` 로 내놓습니다.**
  블록을 고르면 위쪽 서식 툴바의 "블록 도구" 묶음이 모든 종류에 같은 자리 · 같은 모양으로 그립니다.
  공통 조작(복제 · 잠금 · 이동 · 삭제)은 ⚙ 메뉴, 여러 요소 선택의 AI · 첨부 · 복사는 선택 도구(범위 오른쪽 위 아이콘)가 맡습니다.

## 규격 검사

`pnpm test` 가 등록된 모든 종류를 같은 기준으로 확인합니다.

- `vdoc-schema/tests/block-kit.test.ts`
  - 종류 목록 ↔ 정의가 서로 빠짐없이 맞는지
  - 슬롯 중복 · 없는 슬롯, 모든 슬롯이 선택 단위로 나오는지, 슬롯 없는 블록도 단위가 있는지
  - 복제 · 아웃라인 노출 · 표 교체 · 빈 틀 만들기 · AI 속성 규격
  - 리팩터 스냅샷 (`tests/__snapshots__/block-behavior.json`): 시드 문서 전체의 슬롯 목록 · 잠금 · 복제 · 아웃라인 트리
    — 동작을 일부러 바꿨다면 `tsx tests/snapshot.ts --write` 로 갱신하고 diff 를 확인합니다.
- `slot-canvas/tests/block-views.test.tsx`: 모든 종류에 뷰가 있고, 시드 문서의 모든 블록이 자기 선택 단위를 전부 화면에 표시하는지
- `apps/api/tests/test_block_kinds_contract.py`: 시드 문서 · PDF 엔진 · 카탈로그 코드가 만드는 블록 종류가 `LAYOUT_BLOCK_KINDS` 에 있는지
  (서버에서 새 종류를 먼저 만들기 시작하면 여기서 걸립니다 — 프론트 정의 · 뷰부터 추가하세요)
