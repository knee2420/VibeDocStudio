# 예스폼 에디터 해체 표본 (`_dissections/yesform`)

`editor.yesform.com`의 템플릿 2종(사무용품 대량 구매 견적서, 물품 구매 품의서)을 REA와 CDP로 분석한 결과입니다.

| 파일 | 내용 |
|---|---|
| `01.layout_tokens.json` | 페이지(A4, 여백 96px), 타이포(10pt 맑은 고딕, 행간 1.5, 자간 -0.02em), 표(1px #eaeaea, 패딩 8px), 툴바 치수, 글꼴 14종, 70색 팔레트, 줄간격·정렬·표 선 종류 옵션 |
| `02.document_schema.json` | Tiptap v3 확장 90여 개의 옵션, 노드·마크의 속성 기본값, 명령 172개 |
| `03.interaction_spec.md` | 문맥별 툴바, 컨트롤마다의 트리거 → 트랜잭션 → UI 반응, 선택·우클릭·키보드·표 조작, 미확인 항목 |
| `templates/*.json` | 두 템플릿의 Tiptap JSON 원본과 블록별 렌더링 좌표·계산 스타일 |
| `shots/` | 메뉴·팝업·표 편집·템플릿 화면 캡처 |

## 한눈에 보는 구조

- **스택**: Next.js + React, Tiptap v3(ProseMirror), Radix UI 메뉴, Tailwind, lucide 아이콘
- **문서 모델**: 표준 StarterKit에 문서 서식용 커스텀 확장을 크게 더한 구조입니다. 예: `blockStyle`(인라인 CSS 문자열), 셀별 테두리 속성 12개, `documentPageWidth`·`pageBackground`·`docxShape` 같은 DOCX/HWP 가져오기 대응.
- **스타일 저장 방식**: 글자 단위 서식은 `textStyle` 마크 하나에 모읍니다(fontFamily·fontSize(pt)·color 등). 문단 단위 서식은 `textAlign` 속성과 `blockStyle` CSS 문자열에 나눠 저장합니다.
- **페이지**: 편집 화면은 쪽 나눔 없이 A4 폭 한 장이 아래로 늘어나는 방식입니다.

## 분석 방식

원본 탭 2개는 읽기 전용(문서 JSON·스타일 추출)으로만 다뤘습니다. 편집 반응은 같은 문서를 디버그 Chrome의 별도 샌드박스 탭에 복제해서 실행·녹화했습니다. 번들 원문과 원시 로그는 저장소에 넣지 않았습니다.
