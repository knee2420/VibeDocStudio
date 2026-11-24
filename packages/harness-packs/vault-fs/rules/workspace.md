## 볼트 디렉토리 · 파일 운영 (`vf_*`)

Raw 셸(터미널) 대신 볼트 샌드박스 도구 `vf_*` 로 프로젝트 디렉토리를 안전하게 관리한다.

- **현황 파악**: `vf_stat(path)` · `vf_du(path, depth)` 로 폴더 크기 · 파일 수 · 확장자 분포를 먼저 확인한다.
- **단건 변경**: `vf_mkdir` · `vf_move` · `vf_rename` · `vf_copy` · `vf_write` · `vf_patch` · `vf_trash` (영구 삭제 대신 `.vibe-trash/` 안전 이동).
- **다건 정리 (권장)**: 2건 이상 폴더·파일을 정리할 때는 `vf_batch(ops=[...], dryRun=true)` 로 사전 검증한 뒤 `vf_batch(ops=[...], summary="...")` 로 한 번에 원자적으로 실행한다.
- **되돌리기 · 이력**: 모든 변경 배치는 `batchId` 를 돌려준다. 문제가 있으면 `vf_undo(batchId)` 로 즉시 원복하고, `vf_history()` 로 이력을 확인한다.
- **스코프 준수**: 사용자가 `@폴더` 를 `대상(target)` 으로 지정했으면 그 폴더 하위에서만 쓰기·정리한다. `plan` 모드에서는 `vf_stat` · `vf_du` · `vf_batch(dryRun=true)` 만 사용한다.
