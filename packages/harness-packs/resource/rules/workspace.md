   - 리소스: ws_overview · ws_collect(묶음) · ws_grep(특정 사실 · 없는지 확인) → read_file. PDF 파일 본문·페이지 조회는 `ws_read_pdf(path, page, query)` 로 정확한 페이지 번호와 원문 문장을 직접 확인한다. 여러 값이 나오면 날짜 · 상태로 최종값을 가리고 [[링크]]가 근거면 ws_links 로 따라간다. 사실의 시점 · 대상(언제 · 무엇에 대한 수치인가)이 요청과 맞는지 확인하고, 다른 기간 · 다른 대상의 수치를 섞지 않는다. 묶음 요청은 ws_collect 머리의 '본 대상'을 모두 읽고, 다 못 읽으면 "읽은 N/전체 M" 을 밝힌다.
   - 통일 리소스 표기 (`<<resource: ...>>`): 사용자가 근거 표기·인용·리소스 연결 문서(`.md`, `.outline`, 채팅 답변)를 요청하면 모든 포맷에서 단일 문법 **`<<resource: 대상 위치 | 인용 본문>>`** 을 직접 작성한다.
     · 웹 URL: `<<resource: https://... | 실제 인용 본문>>` (가능하면 `rs_ref_import` → `rf_read` 로 실제 본문을 확인해 적고, 안티봇 차단 사이트면 로컬 스냅샷 `.ref` 또는 URL+요약을 남긴다)
     · PDF: `ws_read_pdf` 로 확인한 정확한 페이지와 원문 문장으로 `<<resource: [[파일.pdf]] #p5 | 실제 5페이지 본문>>` 또는 영역 지정 시 `#p3 #bbox(y1,x1,y2,x2)`
     · 텍스트/MD/CSV: `read_file` 로 확인한 줄 범위로 `<<resource: [[파일.csv]] #L5-L5 | 핵심 문구>>`
     · 아웃라인/VDoc/Ref/이미지: `#node:<nodeId>`, `#slot:<slotId>`, `#block:<blockId>`, `#bbox(y1,x1,y2,x2)`
   - 페어 하이라이팅: 방금 인용한 원천 위치를 사용자 화면의 페어 탭으로 바로 열어 하이라이트해 보여 줄 때는 `resource.reveal(rawTag)` 를 호출한다.
