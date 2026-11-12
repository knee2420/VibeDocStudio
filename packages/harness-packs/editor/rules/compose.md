[새 문서 짓기 절차 — "레퍼런스처럼 · 리소스로 글을 새로 써 달라"(포스트 · 보고서 · 블로그 한 편)일 때. 고칠 칸이 이미 있으면 위 3(wb_propose)을 따른다]
S1 출력: 쓸 대상을 정한다. 사용자가 `@문서` 첨부나 제목 · docId 로 작업 문서를 지정했으면(빈 문서 포함) `dc_new` 를 부르지 말고 먼저 `dc_use(doc=…)` 로 그 문서로 전환한다.
   지정 문서 없이 새 글을 요청받았을 때만 `dc_new` 로 초안을 만든다(블로그 · 칼럼 = scroll, 보고서 · 서식 = paged). 이미 이 대화에서 만든 초안이 있으면 그것을 이어 쓴다.
S2 뼈대: rf_map → rf_skeleton 으로 레퍼런스의 배치 뼈대(첫머리 · 섹션마다 모양 · 대표 섹션 모양 · 섹션당 사진 · 문단 수 · 소제목 문법)를 본다.
   rf_map 에 시각 캡처가 있으면 rf_visual → 내장 read_file 로 상단 히어로와 대표 섹션 캡처 1~3장을 직접 열어 헤더 구성 ·
   소제목 장식/색 · 강조 스타일 · 사진 크기/나란히 비율 · 링크 카드 모양 · 구분선 톤을 육안으로 확인한다.
   대표 섹션 1~2개를 rf_read(#sec:N)로 읽어 문단 길이 · 말투 · 강조(형광펜 · 색 · 가운데 정렬) · 연결 문구의 방식을 확인한다.
   확정 카드(rf_consensus)가 있으면 그대로 따른다. 레퍼런스의 문장 · 고유명사 · 수치 · 사진은 재료가 아니다 — 결정(모양 · 리듬)만.
S3 재료: ws_overview → 주제에 맞는 원천을 ws_collect · ws_grep 으로 모아 read_file 로 실제로 읽는다 (사실은 읽은 줄 안에서만).
   ws_images 로 넣을 사진을 고른다 — 맥락 줄(그 사진을 붙여 쓴 노트)로 무엇의 사진인지 확인하고, 섹션 주제와 맞는 것만 쓴다.
   사진이 모자란 섹션은 사진 없이 짓거나(뼈대에서 그 요소를 '없음'으로) 섹션을 줄인다 — 아무 사진이나 끼우지 않는다.
S4 설계: 짓기 전에 섹션 목록을 정한다 — 섹션마다 (소제목 · 그 섹션의 사실(출처 파일:줄) · 사진 resource id · 연결 카드 여부).
   레퍼런스의 섹션 수를 그대로 맞추지 말고 내 재료가 감당하는 만큼(보통 4~8섹션). 설계는 답에 짧은 표로 남긴다.
S5 짓기: dc_build 를 섹션 하나(소제목 → 사진 · 묶음 → 문단 → 연결)씩 부른다. 첫 호출에 표지 · 첫머리를 함께 짓는다.
   문단 · 제목 · 강조 · 인용구 · 사진 폭 · 구분선 스타일은 rf_visual · rf_read 로 확인한 시각 배치 결정을
   dc_build 속성(hero · heading decoration/accent/align · callout · image width · gallery · link-card · divider variant · <span style>)으로 옮긴다.
   문단은 레퍼런스의 문단 길이 · 강조 방식(형광펜 · 색 · 굵게의 비율)을 따른다 (긴 글을 한 칸에 몰지 않는다).
   링크 카드는 가리키는 노트(vdoc:resource/<id>)와, 그 노트가 붙여 쓴 사진이 있으면 thumbnail 로 함께 단다 (ws_images 맥락 줄).
   실패하면 사유대로 그 작업만 고쳐 다시 부른다.
S6 점검: dc_check 로 빈 칸 · 사진 출처 · 반복 · 긴 문단 · 레퍼런스와의 층위 차이를 본다. '권장 조치' 가 나오면 의도한 차이가 아닌 한
   dc_build(set · props · add · remove)로 고치고 dc_check 를 다시 부른다 (최대 2회). 섹션 수처럼 재료가 정하는 차이,
   재료가 없어 못 따르는 차이(예: 맞는 사진이 없음)는 고치지 말고 보고에 밝힌다.
S7 보고: 만든 문서([제목](vdoc:doc/<docId>)) · 섹션 수 · 사진 수 · 따른 결정(층위)과 안 따른 결정 · 쓰지 못한 재료 · 사용자가 확인할 것을 짧게.
   사실을 쓴 줄은 [제목](vdoc:resource/<resourceId>#L시작-L끝) 로 남긴다.

[서식 원문 가져오기 — "이 서식(hwpx) 원문을 그대로 · 원문 쪽별로 가져와 달라"일 때. 위 S1~S7(새로 쓰기) 대신 이것을 따른다]
F1 대상: S1 과 같다 (지정 문서는 dc_use, 없으면 dc_new(surface="paged", genre="document")).
F2 쪽 고르기: ws_glob 로 파일을 찾고 dc_source_pages(path) 로 원문 쪽 목록을 본다. 경계가 애매한 쪽만 read_file 로
   렌더 텍스트의 그 쪽(<!-- page N -->)을 확인한다. 장 · 서식이 쪽 중간에서 시작하거나 끝나면 start_at / end_before 로 자른다.
F3 붙이기: dc_import(path, pages="…", start_at, end_before) 한 번(40쪽 넘으면 나눠서). 표 · 문단을 dc_build 로 다시 그리거나
   글을 옮겨 쓰지 않는다 — 모양은 코드가 원문 그대로 옮긴다. 빈 칸은 채울 칸이므로 요청이 없으면 비워 둔다.
F4 보고: 문서 링크 · 붙인 쪽 ↔ 원문 쪽 대응 · 옮기지 못한 것(그림 등) · 원문 쪽 번호는 추정이라는 점을 짧게.
   붙인 쪽은 원문 쪽 번호(원문 pN)로만 밝힌다 — read_file 로 읽지 않은 줄 범위(#L…)를 인용 링크로 달지 않는다.

[PDF · 스캔 원문 가져오기 — "PDF · 스캔 · 이미지 서식을 그대로 옮겨 달라"일 때]
G1 대상: F1 과 같다 (지정 문서는 dc_use, 없으면 dc_new(surface="paged", genre="document")).
G2 열기 · 쪽 선택: dc_pdf_open(path, pages) 로 쪽 모드(vector/scan/hybrid) · 초벌 IR · PNG 캐시 경로를 얻는다.
   read_file 은 derived/docstruct/<srcHash>/ 안의 페이지/크롭 PNG 에 한해 허용된다.
G3 표 검수: 시각 이상이나 ocrConf 낮은 표는 dc_pdf_words 로 wordIds 를 확인한 뒤 dc_table_propose(path, page, tableId, html, fixes) 로 확정한다.
   fixes 의 wordIds 는 한 셀/한 블록 안에서 읽기 순서로 인접한 토큰만 쓴다 (2회 연속 거절 시 자동 이미지 폴백).
G4 블록 · 읽기 순서 보정: 제목 level · 리스트 · 그림(figureKind · keepText) · 캡션 · 각주 · readingOrder 는 dc_blocks_annotate 로 고친다.
G5 자가 검증 루프: dc_verify(path, pages, round) 를 돌려 pendingReads 가 빌 때까지 (최대 2라운드) 타이트 크롭을 재읽기한다.
G6 반영(재가져오기 in-place): 검증이 끝난 쪽은 dc_import(path, pages) 로 붙인다. 같은 원문의 같은 쪽을 다시 가져오면 in-place 로 교체하고 origin.imports 에 이력을 남긴다.
G7 보고: F4 와 동일하게 문서 링크 · 붙인 쪽 ↔ 원문 쪽 대응 · needsReview / 이미지 폴백 여부를 짧게 보고한다.
