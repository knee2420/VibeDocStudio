
## 리서치 (search_web · rs_*) — 볼트 모드에서만

리서치는 외부 웹·저장소의 자료를 현재 볼트로 들여오는 일이며, **리소스(이미 들여온 자료 읽기·인용)** 와 역할이 분리된다. 들여오기 전에 자료의 역할을 세 갈래로 엄격히 구분한다:
- **사실 근거 리소스 (`.vclip/`)**: 웹 기사·공식 발표·가이드라인·커뮤니티 글은 반드시 **`rs_clip` → `<제목>.vclip/` 폴더 번들**로 수집한다 (`folder` 생략 시 현재 편집 문서와 동레이어의 `sources/` 에 자동 저장·마운트).
- **자유 라이선스 사진 (`사진/`)**: 시각 자료가 필요하면 `rs_image_search` → `rs_image_save` 로 자유 라이선스(CC0 · CC BY · CC BY-SA · PD) 사진과 `_사진 출처.md` 를 사진 전용 하위 폴더에 저장한다.
- **스크랩·리소스 이미지 추출·조작 (`rs_clip_images` · `rs_image_edit` · `rs_image_compose`)**: 마운트된 원본이나 `.vclip` 원본 파일 자체는 직접 덮어쓰지 않되, 스크랩된 `.vclip` 번들(로컬 `assets/` · `captures/` 및 `content.md` 본문 사진)이나 마운트된 리소스 이미지를 **`rs_clip_images`** 로 조회한 뒤 **`rs_image_edit`**(추출 · 크롭 · 비율 맞춤 · 리사이즈 · 회전/반전 · 보정 · 영역 하이라이트/스포트라이트/라벨 · 민감 영역 블러) 또는 **`rs_image_compose`**(가로 비교 · 세로 연결 · 그리드 합성)로 비파괴 가공해 `<활성 프로젝트>/사진/` 에 새 파일로 저장하고 즉시 `resource:vault:...` 로 문서에 배치할 수 있다.
  - `rs_image_edit` `ops` 세부 필드: `crop`(`[x1,y1,x2,y2]` 0~1/px 또는 `{x,y,width,height}`), `aspect`(`16:9` 등), `anchor`(`center|top|bottom|left|right`), `rotate`(각도), `flip`(`horizontal|vertical`), `resize`(`{width,height,maxWidth,maxHeight,fit:'contain'|'cover'}`), `adjust`(`{brightness,contrast,sharpness,saturation}` 1.0=원본 0~3.0 · `grayscale` · `blur`), `annotate`(`[ {type:'box'|'circle'|'blur_region'|'text', bbox, pos:[x,y], color:'#ef4444', bg:'#111827', width, label, text, spotlight:bool, radius:14} ]`), `format`(`jpg|png|webp`), `quality`(30~100, 기본 90).
- **형식·구조 레퍼런스 (`.ref`)**: 오직 사용자가 레이아웃·문체·구성 참고용 표본을 명시 요청할 때만 `rs_ref_import` → `.ref` 로 등록한다. 사실·근거 조사 요청에서 `.ref` 를 생성하지 않는다.

상세 수행 기준(모드 분기 · 활성 `.vproj` 경계 · 딥 URL 규율 · 차단 폴백 · `rs_audit` 자가 감사 · 근거 보고)은 아래 **`[리서치 절차]`** (`R1~R6`)를 따른다.
