"""Resource — 사실 근거 bounded context.

사용자가 프로젝트에 가져온 "사실" 자료를 다룬다. Reference(남의 완성작 → 의사결정 궤적)와
Document(내가 쓰는 문서)와는 의도적으로 분리돼 있으며, 이 패키지는 둘을 import 하지 않는다.

- `ledger`: RM 원장 — 파일 · 폴더 · 웹 링크 트리, 체크(Choice), 발췌 섹터 (`/api/resources`)
- `index`: 원장 자료의 자동 색인 지식 덱 — 섹션 · 카드 · 검색 (`/api/knowledge`)
- `backdata`: 붙여 넣은 원문을 단락 근거로 쪼갠 백데이터 (`/api/backdata`)
"""
