# Research Harness Live Evaluation — `iter0-baseline`

- Model: `gemini-3.8-flash-medium`
- Overall Score: **350 / 400 (87.5%)**

| Scenario | Score | Time | Tools | Clips | Refs | Images |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `RS1_bookmark` | **100/100 (100.0%)** | 162.0s | 16 | 4 | 0 | 0 |
| `RS2_timeline_fact` | **90/100 (90.0%)** | 212.7s | 29 | 5 | 0 | 0 |
| `RS3_archive_blocked` | **60/100 (60.0%)** | 33.0s | 2 | 2 | 0 | 4 |
| `RS4_role_separation` | **100/100 (100.0%)** | 77.7s | 9 | 2 | 0 | 3 |

## RS1_bookmark — 목록화 전용 리서치 (bookmark 모드 분기 · 동레이어 sources/ · .ref 무오염) (100/100)
- Tools: `vf_stat, search_web, search_web, search_web, search_web, vf_stat, search_web, search_web, search_web, rs_page, rs_folder, rs_clip, rs_clip, rs_clip, rs_clip, vf_stat`
- ✅ `[A_role]` (15/15pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (20/20pt) captureMode=['bookmark', 'bookmark', 'bookmark', 'bookmark'] (기대 'bookmark' >= 3건)
- ✅ `[C_storage]` (15/15pt) 저장 폴더 ['01_AI_가이드라인.vproj/sources'] (기대: *01_AI_가이드라인.vproj/sources)
- ✅ `[D_quality]` (15/15pt) .vclip 번들 4개 (목표 >= 3)
- ✅ `[D_quality]` (10/10pt) 서로 다른 도메인 4개: ['dpg.go.kr', 'mois.go.kr', 'msit.go.kr', 'pipc.go.kr']
- ✅ `[E_search]` (10/10pt) search_web 7회 · ['', '', '', '', '', '']
- ✅ `[B_routing]` (5/5pt) 도구 실패 0건
- ✅ `[F_output]` (10/10pt) 답변에 후보 URL 명시: 충족
- Saved `.vclip` bundles:
  - `01_AI_가이드라인.vproj/sources/공공_AI_서비스_UI_UX_가이드라인_행정안전부.vclip` (mode=bookmark, status=partial, domain=mois.go.kr, chars=149, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/공공부문_초거대_AI_도입_활용_가이드라인_디지털플랫폼정부위원회.vclip` (mode=bookmark, status=blocked-fallback, domain=dpg.go.kr, chars=351, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/생성형_AI_개인정보_처리_안내서_개인정보보호위원회.vclip` (mode=bookmark, status=partial, domain=pipc.go.kr, chars=134, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/신뢰할_수_있는_인공지능_개발_안내서_과기정통부.vclip` (mode=bookmark, status=partial, domain=msit.go.kr, chars=112, snap=False, assets=0)

## RS2_timeline_fact — 다각도 사실 조사 + 타임라인 교차 검증 (content 모드 · 한/영 검색 · 본문 열람 · 근거 태그) (90/100)
- Tools: `vf_stat, search_web, search_web, search_web, search_web, search_web, 193b1938_vf_stat, 193b1938_vf_stat, 193b1938_rs_folder, search_web, search_web, search_web, 193b1938_rs_page, 193b1938_rs_page, 193b1938_rs_page, search_web, 193b1938_rs_clip, 193b1938_rs_clip, 193b1938_rs_clip, search_web, 193b1938_rs_page, 193b1938_rs_page, 193b1938_rs_page, 193b1938_rs_clip, 193b1938_rs_clip, read_file, read_file, read_file, read_file`
- ✅ `[A_role]` (10/10pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (10/10pt) captureMode=['content', 'content', 'content', 'content', 'content'] (기대 'content' >= 2건)
- ✅ `[C_storage]` (10/10pt) 저장 폴더 ['02_라야_부상_보고서.vproj/sources'] (기대: *02_라야_부상_보고서.vproj/sources)
- ✅ `[D_quality]` (10/10pt) .vclip 번들 5개 (목표 >= 3)
- ✅ `[D_quality]` (10/10pt) 서로 다른 도메인 5개: ['arsenal.com', 'besteleven.com', 'football365.com', 'footballist.co.kr', 'theguardian.com']
- ✅ `[D_quality]` (15/15pt) 충실한 full 본문(>=250자) 4건 (목표 >= 2) · [('가디언_라야어깨부상수술불필요_20261123.vclip', 'blocked-fallback', 256), ('국내언론_풋볼리스트_라야수술회피_20261124.vclip', 'full', 1842), ('베스트일레븐_라야수술회피안도_20261124.vclip', 'full', 1809), ('아스널공식_라야부상업데이트_20261123.vclip', 'full', 3215), ('해외언론_풋볼365_라야부상업데이트_20261123.vclip', 'full', 3264)]
- ❌ `[E_search]` (0/10pt) search_web 10회 · 한/영 다각도=X · ['', '', '', '', '', '']
- ✅ `[E_search]` (10/10pt) 저장된 .vclip/content.md 직접 열람 4건 · ws_grep 0회 (목표 >= 2)
- ✅ `[F_output]` (10/10pt) 답변 내 <<resource: ... | ...>> 근거 태그 6개 (목표 >= 2)
- ✅ `[F_output]` (5/5pt) 타임라인/출처 구분 서술: 충족
- Saved `.vclip` bundles:
  - `02_라야_부상_보고서.vproj/sources/가디언_라야어깨부상수술불필요_20261123.vclip` (mode=content, status=blocked-fallback, domain=theguardian.com, chars=256, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/국내언론_풋볼리스트_라야수술회피_20261124.vclip` (mode=content, status=full, domain=footballist.co.kr, chars=1842, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/베스트일레븐_라야수술회피안도_20261124.vclip` (mode=content, status=full, domain=besteleven.com, chars=1809, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/아스널공식_라야부상업데이트_20261123.vclip` (mode=content, status=full, domain=arsenal.com, chars=3215, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/해외언론_풋볼365_라야부상업데이트_20261123.vclip` (mode=content, status=full, domain=football365.com, chars=3264, snap=False, assets=0)

## RS3_archive_blocked — 원형 딥 아카이브(archive) + 안티봇 차단 사이트 정직 폴백 (60/100)
- Tools: `0af0d661_rs_clip, 0af0d661_rs_clip`
- ✅ `[A_role]` (15/15pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ❌ `[C_storage]` (0/15pt) 저장 폴더 ['sources'] (기대: *03_아카이브_검증.vproj/sources)
- ✅ `[D_quality]` (25/25pt) besteleven mode=archive status=full chars=1665 snapshot=True assets=4
- ❌ `[D_quality]` (0/25pt) fmkorea status=full note=
- ✅ `[B_routing]` (10/10pt) 도구 실패 0건
- ✅ `[F_output]` (10/10pt) 차단 사유 및 수동 보강 안내: 충족
- Saved `.vclip` bundles:
  - `sources/BBC 다비드 라야, 부상 정밀 검진 예정.. 그의 공백은 아스날에 얼마나 치명적일까.vclip` (mode=content, status=full, domain=fmkorea.com, chars=2351, snap=False, assets=0)
  - `sources/“수술 안 해도 된다”… ‘철벽 GK’ 라야 어깨 부상에 가슴 철렁했던 아스널, 아르테타 감독 한숨 돌렸다.vclip` (mode=archive, status=full, domain=besteleven.com, chars=1665, snap=True, assets=4)

## RS4_role_separation — 역할 분리 종합: 사실 리소스(.vclip) + 자유 라이선스 사진 + .ref 미생성 (100/100)
- Tools: `8d1ae9d1_rs_folder, 8d1ae9d1_rs_folder, search_web, 8d1ae9d1_rs_image_search, 8d1ae9d1_rs_page, 8d1ae9d1_rs_page, 8d1ae9d1_rs_clip, 8d1ae9d1_rs_clip, 8d1ae9d1_rs_image_save`
- ✅ `[A_role]` (20/20pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (10/10pt) captureMode=['content', 'content'] (기대 'content' >= 2건)
- ✅ `[D_quality]` (15/15pt) .vclip 번들 2개 (목표 >= 2)
- ✅ `[D_quality]` (10/10pt) 충실한 full 본문(>=200자) 2건 (목표 >= 1) · [('JapanGuide_Sensoji_Visiting_Guide.vclip', 'full', 28372), ('센소지_공식_연혁_및_안내.vclip', 'full', 1746)]
- ✅ `[D_quality]` (20/20pt) 자유 라이선스 사진 3장 · 출처노트 라이선스 기록 3건 (목표 >= 3)
- ✅ `[C_storage]` (15/15pt) 클립 폴더=['도쿄/센소지/sources'] vs 사진 폴더=['도쿄/센소지/사진']
- ✅ `[F_output]` (10/10pt) 답변에 사진 라이선스 보고: 충족
- Saved `.vclip` bundles:
  - `도쿄/센소지/sources/JapanGuide_Sensoji_Visiting_Guide.vclip` (mode=content, status=full, domain=japan-guide.com, chars=28372, snap=False, assets=0)
  - `도쿄/센소지/sources/센소지_공식_연혁_및_안내.vclip` (mode=content, status=full, domain=senso-ji.jp, chars=1746, snap=False, assets=0)
