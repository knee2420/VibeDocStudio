# 사이드바 계약 비교

- 기준: `tests/baseline/sidebar/main.contract.json` (2026-11-12T15:11:02.644Z)
- 대상: `tests/baseline/sidebar/merged.contract.json` (2026-11-12T15:13:07.462Z)
- 줄어든 항목 합계: **16**

## 행 종류별 동작
| 행 종류 | 제거된 동작 | 추가된 동작 | 행 수 (기준 → 새) |
|---|---|---|---|
| block | — | lock, visibility | 222 → 3 |
| document | **zoom-in** | — | 9 → 9 |
| page | **fold**, **zoom-in** | — | 91 → 91 |
| project | **행 종류 자체가 사라짐** (fold, new-doc-menu, refresh-docs, zoom-in) | — | 1 → 0 |
| row | **행 종류 자체가 사라짐** (fold, zoom-in) | — | 6 → 0 |
| section | **행 종류 자체가 사라짐** (fold, zoom-in) | — | 6 → 0 |
| slot | — | lock, visibility | 2234 → 14 |

## 사이드바 test id
- 제거 (4): `left-tab-outliner`, `left-tab-reference-manager`, `outline-new-doc-menu-btn`, `outline-node-review-{node}`
- 추가 (9): `all-tree-toggle-btn`, `figma-tab-assets`, `figma-tab-layers`, `figma-tab-reference`, `lock-toggle-{node}`, `pages-elements-splitter`, `pages-section-add-page-btn`, `pages-section-toggle`, `visibility-toggle-{node}`

## 사이드바 버튼 툴팁 (행 밖)
- 제거 (1): `사이드바 접기`
- 추가 (3): `새로고침 (에이전트 · 다른 곳에서 만든 문서 반영)`, `프로젝트 전체 아웃라인 보기 (All Mode)`, `현재 문서에 페이지 추가`
