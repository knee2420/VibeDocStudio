# `pdf-vdoc-engine` — 결정적 PDF → `.vdoc` 수평 파이프라인 엔진

호스트(`apps/api`)나 도메인(`catalog`, `documents`)을 전혀 알지 못하는 순수 문서 구조 추출 엔진입니다.

## 수평 파이프라인 4단계 (`measure → judge → assemble → validate`)

1. **`measure` (`vector_grid_extractor.py`)**:
   - PDF 페이지 내의 수평·수직 벡터 선분(`pt`)과 텍스트 바운딩 박스를 추출합니다.
   - X·Y 교차점을 `±1.5pt` 허용 오차로 클러스터링하여 열 너비(`column_widths_pct`), 행 높이(`row_heights_px`), 병합 셀(`col_span`, `row_span`)을 **100% 수학 연산**으로 도출합니다.
2. **`judge` (`zone_partitioner.py`)**:
   - 상단 표제부(`form-title`), 다중 구획 복합 양식 틀(`composite-form-frame`), 정형 표(`structured-table`), 인장 칸(`(인)`, `(서명)`)을 규칙 기반으로 판정합니다.
3. **`assemble` (`vdoc_assembler.py`)**:
   - 판정된 구획과 격자 셀을 `.vdoc` (`VDocDocument`) AST로 조립합니다.
4. **`validate` (`visual_parity_scorer.py`)**:
   - 행별 `rowSpan` 이월을 포함한 `Σ(colSpan) == len(columnWidths)` 격자 보존 불변식과 슬롯 참조 무결성을 검증합니다.

