# 사이드바 계약 비교

- 기준: `tests/baseline/sidebar/main.contract.json` (2026-11-12T15:11:02.644Z)
- 대상: `tests/baseline/sidebar/merged-allmode.contract.json` (2026-11-12T15:14:00Z)
- 줄어든 항목 합계: **15**

## 행 종류별 동작
| 행 종류 | 제거된 동작 | 추가된 동작 | 행 수 (기준 → 새) |
|---|---|---|---|
| block | — | lock, visibility | 222 → 222 |
| document | **zoom-in** | — | 9 → 9 |
| page | **zoom-in** | — | 91 → 91 |
| project | **new-doc-menu**, **refresh-docs**, **zoom-in** | — | 1 → 1 |
| row | — | lock, visibility | 6 → 6 |
| section | — | lock, visibility | 6 → 6 |
| slot | — | lock, visibility | 2234 → 2234 |

## 사이드바 test id
- 제거 (3): `left-tab-outliner`, `left-tab-reference-manager`, `outline-new-doc-menu-btn`
- 추가 (6): `all-tree-toggle-btn`, `figma-tab-assets`, `figma-tab-layers`, `figma-tab-reference`, `lock-toggle-{node}`, `visibility-toggle-{node}`

## 사이드바 버튼 툴팁 (행 밖)
- 제거 (1): `사이드바 접기`
- 추가 (2): `Documents & Pages · Elements 분할 보기로 전환`, `새로고침 (에이전트 · 다른 곳에서 만든 문서 반영)`

## 고아 export (슬라이스 밖 사용처 0)
- 새로 생긴 고아 (6): **`entities/workspace-layout:PAGES_PANE_HEIGHT`**, **`features/ai-workspace:referenceRef`**, **`features/layer-visibility:hiddenLayerSelectors`**, **`features/manage-documents:DocumentImportDialog`**, **`features/mutate-document-pages:usePageMutations`**, **`features/zoom-hierarchy:useFractalZoomNavigation`**
- 해소되거나 삭제됨 (0): 없음
