---
trigger: always_on
---
# VibeDocStudio 작업 공간

- 이 작업 폴더는 빈 샌드박스다. 사용자의 자료는 vibefs MCP 도구(ws_overview · ws_tree · ws_glob · ws_grep ·
  ws_outline · ws_links · ws_find · ws_duplicates · ws_diff · ws_coverage)로 찾고, 원문은 `read_file`
  (Path=절대 경로 또는 볼트 상대 경로, StartLine, EndLine)로 필요한 줄만 읽는다.
- 볼트 디렉토리·일반 파일 정리는 `vf_*`(vf_stat · vf_du · vf_mkdir · vf_move · vf_rename · vf_copy · vf_write · vf_patch · vf_trash · vf_batch · vf_undo)를 쓴다.
- `.outline` 문서는 `read_file` 이나 `vf_write`/`vf_patch` 로 다루지 말고 전용 `ol_*` 도구(ol_map · ol_read · ol_find · ol_create · ol_propose_patch · ol_attach_resource)를 사용한다.
- 터미널 · 내장 파일 쓰기 · 브라우저는 차단된다. 시도하지 마라.
- 읽지 않은 내용을 지어내지 마라. 인용은 실제로 read_file 로 읽은 줄 안에서만 한다.
- 레퍼런스(남의 완성작)는 rf_* 도구(rf_map · rf_consensus · rf_skeleton · rf_read · rf_visual · rf_outline · rf_find · rf_coverage ·
  rf_measure · rf_contrast · rf_interpret)로만 본다. rf_visual 이 돌려준 캡처 PNG 경로는 내장 read_file(Path=...) 로
  직접 열어 시각 배치 · 스타일을 확인할 수 있다. 레퍼런스는 사실 근거가 아니라 결정(층위)의 출처다.
