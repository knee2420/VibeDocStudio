# Research Harness Live Evaluation — `iter2-refined`

- Model: `gemini-3.8-flash-medium`
- Overall Score: **385 / 400 (96.2%)**

| Scenario | Score | Time | Tools | Clips | Refs | Images |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `RS1_bookmark` | **100/100 (100.0%)** | 237.1s | 25 | 3 | 0 | 0 |
| `RS2_timeline_fact` | **100/100 (100.0%)** | 159.9s | 17 | 4 | 0 | 0 |
| `RS3_archive_blocked` | **100/100 (100.0%)** | 48.8s | 4 | 2 | 0 | 3 |
| `RS4_role_separation` | **85/100 (85.0%)** | 269.8s | 35 | 4 | 0 | 3 |

## RS1_bookmark — 목록화 전용 리서치 (bookmark 모드 · 딥 URL 규율 · 동레이어 sources/ · .ref 무오염) (100/100)
- Tools: `search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, rs_clip, rs_clip, rs_clip, rs_audit`
- ✅ `[A_role]` (15/15pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (15/15pt) captureMode=['bookmark', 'bookmark', 'bookmark'] (기대 'bookmark' >= 3건)
- ✅ `[C_storage]` (15/15pt) 저장 폴더 ['01_AI_가이드라인.vproj/sources'] (기대: *01_AI_가이드라인.vproj/sources)
- ✅ `[D_quality]` (10/10pt) .vclip 번들 3개 (목표 >= 3)
- ✅ `[D_quality]` (15/15pt) 딥 URL 3/3건 (목표 >= 3, 루트홈피=0건)
- ✅ `[D_quality]` (10/10pt) 서로 다른 도메인 2개: ['korea.kr', 'zdnet.co.kr']
- ✅ `[E_search]` (10/10pt) search_web 21회 · ['대한민국 공공기관 생성형 AI 도입 가이드라인 행정안전부 과기정통부 보도자료', 'site:korea.kr "공공부문" "생성형 AI" OR "초거대 AI" 가이드라인 보도자료', '"policyNewsView.do" OR "pressReleaseView.do" site:korea.kr "초거대 AI" OR "생성형 AI" 가이드라인', 'site:nia.or.kr "초거대 AI 도입" OR "생성형 AI" 가이드라인 상세', '"공공부문 초거대 AI 도입·활용 가이드라인" site:boannews.com OR site:etnews.com OR site:zdnet.co.kr', 'site:zdnet.co.kr/view/?no= "공공부문 초거대 AI 도입·활용 가이드라인"']
- ✅ `[B_routing]` (5/5pt) 도구 실패 0건
- ✅ `[F_output]` (5/5pt) 답변에 후보 URL 명시: 충족
- Saved `.vclip` bundles:
  - `01_AI_가이드라인.vproj/sources/과기정통부 관계부처 초거대 AI 경쟁력 강화 및 공공 도입 가이드 정책뉴스.vclip` (mode=bookmark, status=partial, domain=korea.kr, chars=167, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/디플정위 공공부문 초거대AI 활용 가이드라인 2.0 개정판 배포 상세 보도.vclip` (mode=bookmark, status=partial, domain=zdnet.co.kr, chars=240, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/디플정위 과기정통부 2025년도 초거대 인공지능 서비스 개발지원 사업 공모 공식 보도자료.vclip` (mode=bookmark, status=partial, domain=korea.kr, chars=198, snap=False, assets=0)

## RS2_timeline_fact — 다각도 사실 조사 + 타임라인 교차 검증 (content · 한/영 검색 · 본문 열람 · 자가 감사 · 근거 태그) (100/100)
- Tools: `search_web, search_web, search_web, search_web, search_web, search_web, search_web, search_web, rs_clip, rs_clip, rs_clip, rs_clip, read_file, read_file, read_file, read_file, rs_audit`
- ✅ `[A_role]` (10/10pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (10/10pt) captureMode=['content', 'content', 'content', 'content'] (기대 'content' >= 2건)
- ✅ `[C_storage]` (10/10pt) 저장 폴더 ['02_라야_부상_보고서.vproj/sources'] (기대: *02_라야_부상_보고서.vproj/sources)
- ✅ `[D_quality]` (10/10pt) .vclip 번들 4개 (목표 >= 3)
- ✅ `[D_quality]` (10/10pt) 서로 다른 도메인 4개: ['arsenal.com', 'besteleven.com', 'footballist.co.kr', 'goal.com']
- ✅ `[D_quality]` (10/10pt) 충실한 full 본문(>=250자) 4건 (목표 >= 2) · [('국내기사_베스트일레븐_라야_안도.vclip', 'full', 1835), ('국내기사_풋볼리스트_라야_어깨부상.vclip', 'full', 1834), ('아스널공식_라야_부상_업데이트.vclip', 'full', 3208), ('해외언론_Goal_라야_부상_수술면제.vclip', 'full', 3094)]
- ✅ `[E_search]` (10/10pt) search_web 8회 · 한/영 다각도=O · ['David Raya injury Arsenal timeline 2024 OR 2025 OR 2026', '아스널 다비드 라야 골키퍼 부상 2024', 'site:arsenal.com David Raya injury Newcastle OR "Arteta"', '"David Raya" "shoulder" "Newcastle" "Arteta" Arsenal injury 2026', '"다비드 라야" "뉴캐슬" "어깨" 아스널 부상', '"David Raya" "Arteta" "Newcastle" site:arsenal.com/news']
- ✅ `[E_search]` (10/10pt) 저장된 .vclip/content.md 직접 열람 8건 · ws_grep 0회 (목표 >= 2)
- ✅ `[E_search]` (5/5pt) rs_audit 자가 점검 1회 호출 (목표 >= 1)
- ✅ `[F_output]` (10/10pt) 답변 내 <<resource: ... | ...>> 근거 태그 8개 (목표 >= 2)
- ✅ `[F_output]` (5/5pt) 타임라인/출처 구분 서술: 충족
- Saved `.vclip` bundles:
  - `02_라야_부상_보고서.vproj/sources/국내기사_베스트일레븐_라야_안도.vclip` (mode=content, status=full, domain=besteleven.com, chars=1835, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/국내기사_풋볼리스트_라야_어깨부상.vclip` (mode=content, status=full, domain=footballist.co.kr, chars=1834, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/아스널공식_라야_부상_업데이트.vclip` (mode=content, status=full, domain=arsenal.com, chars=3208, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/해외언론_Goal_라야_부상_수술면제.vclip` (mode=content, status=full, domain=goal.com, chars=3094, snap=False, assets=0)

## RS3_archive_blocked — 원형 딥 아카이브(archive · 클린 이미지) + 차단 사이트 정직 폴백 + 활성 .vproj 배치 (100/100)
- Tools: `rs_clip, rs_clip, read_file, rs_audit`
- ✅ `[A_role]` (10/10pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[C_storage]` (20/20pt) 저장 폴더 ['03_아카이브_검증.vproj/sources'] (기대: *03_아카이브_검증.vproj/sources)
- ✅ `[D_quality]` (25/25pt) besteleven mode=archive status=full chars=1704 snapshot=True assets=3 noise=0
- ✅ `[D_quality]` (20/20pt) httpbin.org status=blocked-fallback note=접근 제한 또는 안티봇 차단 (HTTP 403)
- ✅ `[E_search]` (5/5pt) rs_audit 자가 점검 1회 호출 (목표 >= 1)
- ✅ `[B_routing]` (10/10pt) 도구 실패 0건
- ✅ `[F_output]` (10/10pt) 차단 사유 및 수동 보강 안내: 충족
- Saved `.vclip` bundles:
  - `03_아카이브_검증.vproj/sources/httpbin.org.vclip` (mode=content, status=blocked-fallback, domain=httpbin.org, chars=169, snap=False, assets=0)
  - `03_아카이브_검증.vproj/sources/“수술 안 해도 된다”… ‘철벽 GK’ 라야 어깨 부상에 가슴 철렁했던 아스널, 아르테타 감독 한숨 돌렸다.vclip` (mode=archive, status=full, domain=besteleven.com, chars=1704, snap=True, assets=3)

## RS4_role_separation — 역할 분리 종합: 활성 .vproj 내부 sources/(.vclip) + 사진/(자유 라이선스) + .ref 미생성 (85/100)
- Tools: `vf_stat, search_web, search_web, rs_image_search, search_web, search_web, vf_stat, vf_stat, wb_overview, search_web, search_web, search_web, search_web, dc_use, read_file, dc_use, rs_audit, rs_clip, rs_clip, rs_image_save, read_file, read_file, read_file, rs_audit, search_web, search_web, search_web, rs_clip, search_web, search_web, rs_clip, read_file, rs_audit, vf_trash, rs_audit`
- ✅ `[A_role]` (15/15pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (10/10pt) captureMode=['content', 'content', 'content', 'content'] (기대 'content' >= 2건)
- ✅ `[D_quality]` (10/10pt) .vclip 번들 4개 (목표 >= 2)
- ✅ `[D_quality]` (10/10pt) 딥 URL 4/4건 (목표 >= 2, 루트홈피=0건)
- ✅ `[D_quality]` (10/10pt) 충실한 full 본문(>=200자) 4건 (목표 >= 1) · [('도쿄관광재단_센소지_관람가이드.vclip', 'full', 1862), ('센소지_경내_및_관람_공식안내.vclip', 'full', 2608), ('센소지_역사_및_개요_공식_안내.vclip', 'full', 7835), ('일본정부관광국_센소지_공식가이드.vclip', 'full', 2898)]
- ✅ `[D_quality]` (15/15pt) 자유 라이선스 사진 3장 · 출처노트 라이선스 기록 3건 (목표 >= 3)
- ❌ `[C_storage]` (0/15pt) 클립 폴더=['.vibe-trash/fsb-1795593903-caaca1/04_아사쿠사_자료.vproj/sources', '04_아사쿠사_자료.vproj/sources'] vs 사진 폴더=['04_아사쿠사_자료.vproj/사진'] (모두 04_아사쿠사_자료.vproj/ 하위 분리 필요)
- ✅ `[E_search]` (5/5pt) rs_audit 자가 점검 4회 호출 (목표 >= 1)
- ✅ `[F_output]` (10/10pt) 답변에 사진 라이선스 보고: 충족
- Saved `.vclip` bundles:
  - `.vibe-trash/fsb-1795593903-caaca1/04_아사쿠사_자료.vproj/sources/도쿄관광재단_센소지_관람가이드.vclip` (mode=content, status=full, domain=gotokyo.org, chars=1862, snap=False, assets=0)
  - `.vibe-trash/fsb-1795593903-caaca1/04_아사쿠사_자료.vproj/sources/센소지_경내_및_관람_공식안내.vclip` (mode=content, status=full, domain=senso-ji.jp, chars=2608, snap=False, assets=0)
  - `04_아사쿠사_자료.vproj/sources/센소지_역사_및_개요_공식_안내.vclip` (mode=content, status=full, domain=senso-ji.jp, chars=7835, snap=False, assets=0)
  - `04_아사쿠사_자료.vproj/sources/일본정부관광국_센소지_공식가이드.vclip` (mode=content, status=full, domain=japan.travel, chars=2898, snap=False, assets=0)
