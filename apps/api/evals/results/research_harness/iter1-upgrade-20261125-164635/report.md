# Research Harness Live Evaluation — `iter1-upgrade`

- Model: `gemini-3.8-flash-medium`
- Overall Score: **305 / 400 (76.2%)**

| Scenario | Score | Time | Tools | Clips | Refs | Images |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `RS1_bookmark` | **100/100 (100.0%)** | 249.8s | 30 | 4 | 0 | 0 |
| `RS2_timeline_fact` | **95/100 (95.0%)** | 223.0s | 33 | 7 | 0 | 0 |
| `RS3_archive_blocked` | **95/100 (95.0%)** | 47.6s | 4 | 2 | 0 | 3 |
| `RS4_role_separation` | **15/100 (15.0%)** | 1.1s | 0 | 0 | 0 | 0 |

## RS1_bookmark — 목록화 전용 리서치 (bookmark 모드 · 딥 URL 규율 · 동레이어 sources/ · .ref 무오염) (100/100)
- Tools: `search_web, search_web, search_web, search_web, search_web, search_web, rs_page, rs_page, search_web, search_web, search_web, search_web, rs_page, rs_page, rs_page, rs_page, search_web, rs_page, search_web, search_web, rs_page, rs_page, vf_stat, vf_stat, rs_clip, rs_clip, rs_clip, rs_clip, rs_audit, read_file`
- ✅ `[A_role]` (15/15pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (15/15pt) captureMode=['bookmark', 'bookmark', 'bookmark', 'bookmark'] (기대 'bookmark' >= 3건)
- ✅ `[C_storage]` (15/15pt) 저장 폴더 ['01_AI_가이드라인.vproj/sources'] (기대: *01_AI_가이드라인.vproj/sources)
- ✅ `[D_quality]` (10/10pt) .vclip 번들 4개 (목표 >= 3)
- ✅ `[D_quality]` (15/15pt) 딥 URL 4/4건 (목표 >= 3, 루트홈피=0건)
- ✅ `[D_quality]` (10/10pt) 서로 다른 도메인 2개: ['korea.kr', 'zdnet.co.kr']
- ✅ `[E_search]` (10/10pt) search_web 13회 · ['행정안전부 생성형 AI 활용 가이드라인 보도자료', '과학기술정보통신부 생성형 AI 가이드라인 보도자료', '"생성형 AI 활용 안내서" site:korea.kr', '"공공부문 AI" 가이드라인 site:korea.kr', '"공공부문 AI 도입·활용 가이드" site:korea.kr/news/policyNewsView.do OR site:korea.kr/briefing/pressReleaseView.do', '"생성형" AI "가이드라인" site:korea.kr/briefing/pressReleaseView.do']
- ✅ `[B_routing]` (5/5pt) 도구 실패 0건
- ✅ `[F_output]` (5/5pt) 답변에 후보 URL 명시: 충족
- Saved `.vclip` bundles:
  - `01_AI_가이드라인.vproj/sources/과기정통부 인공지능 투명성 확보 가이드라인 보도자료.vclip` (mode=bookmark, status=partial, domain=korea.kr, chars=160, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/정부 AI 투명성 기준 구체화 가이드 공개 ZDNet 기사.vclip` (mode=bookmark, status=partial, domain=zdnet.co.kr, chars=145, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/행안부 공공 AI 서비스 UIUX 가이드라인 보도자료.vclip` (mode=bookmark, status=partial, domain=korea.kr, chars=188, snap=False, assets=0)
  - `01_AI_가이드라인.vproj/sources/행안부 공공 AI 서비스 기준 마련 ZDNet 기사.vclip` (mode=bookmark, status=partial, domain=zdnet.co.kr, chars=154, snap=False, assets=0)

## RS2_timeline_fact — 다각도 사실 조사 + 타임라인 교차 검증 (content · 한/영 검색 · 본문 열람 · 자가 감사 · 근거 태그) (95/100)
- Tools: `1e35c962_vf_du, 1e35c962_vf_stat, search_web, search_web, search_web, search_web, search_web, search_web, 1e35c962_rs_page, 1e35c962_rs_page, 1e35c962_rs_page, 1e35c962_rs_page, 1e35c962_rs_clip, 1e35c962_rs_clip, 1e35c962_rs_clip, 1e35c962_rs_clip, search_web, search_web, 1e35c962_rs_page, 1e35c962_rs_page, 1e35c962_rs_page, 1e35c962_rs_page, search_web, 1e35c962_rs_page, 1e35c962_rs_clip, 1e35c962_rs_clip, 1e35c962_rs_clip, read_file, read_file, read_file, read_file, read_file, 1e35c962_rs_audit`
- ✅ `[A_role]` (10/10pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[B_routing]` (10/10pt) captureMode=['content', 'content', 'content', 'content', 'content', 'content', 'content'] (기대 'content' >= 2건)
- ✅ `[C_storage]` (10/10pt) 저장 폴더 ['02_라야_부상_보고서.vproj/sources'] (기대: *02_라야_부상_보고서.vproj/sources)
- ✅ `[D_quality]` (10/10pt) .vclip 번들 7개 (목표 >= 3)
- ✅ `[D_quality]` (10/10pt) 서로 다른 도메인 6개: ['arsenal.com', 'besteleven.com', 'footballist.co.kr', 'interfootball.co.kr', 'standard.co.uk', 'theguardian.com']
- ✅ `[D_quality]` (10/10pt) 충실한 full 본문(>=250자) 5건 (목표 >= 2) · [('Arsenal_Official_Arteta_Raya_Update.vclip', 'full', 3227), ('BestEleven_Raya_No_Surgery_Nov24.vclip', 'full', 1817), ('Footballist_Raya_Shoulder_Nov24.vclip', 'full', 1847), ('InterFootball_Raya_Injury_Nov22.vclip', 'full', 1662), ('Standard_Arsenal_Injury_Update_Nov23.vclip', 'full', 4411), ('The_Guardian_Arteta_Raya_Injury_Nov21.vclip', 'blocked-fallback', 271), ('The_Guardian_Raya_No_Surgery_Nov23.vclip', 'blocked-fallback', 266)]
- ✅ `[E_search]` (10/10pt) search_web 9회 · 한/영 다각도=O · ['David Raya injury Arsenal 2024', 'Arsenal David Raya injury update Arteta', '아스널 다비드 라야 부상 결장 복귀', '"David Raya" "shoulder" Arteta "Newcastle" site:arsenal.com', '"David Raya" shoulder injury "Newcastle" site:theguardian.com OR site:standard.co.uk OR site:goal.com', '"다비드 라야" "뉴캐슬" "어깨" site:footballist.co.kr OR site:besteleven.com']
- ✅ `[E_search]` (10/10pt) 저장된 .vclip/content.md 직접 열람 10건 · ws_grep 0회 (목표 >= 2)
- ❌ `[E_search]` (0/5pt) rs_audit 자가 점검 0회 호출 (목표 >= 1)
- ✅ `[F_output]` (10/10pt) 답변 내 <<resource: ... | ...>> 근거 태그 11개 (목표 >= 2)
- ✅ `[F_output]` (5/5pt) 타임라인/출처 구분 서술: 충족
- Saved `.vclip` bundles:
  - `02_라야_부상_보고서.vproj/sources/Arsenal_Official_Arteta_Raya_Update.vclip` (mode=content, status=full, domain=arsenal.com, chars=3227, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/BestEleven_Raya_No_Surgery_Nov24.vclip` (mode=content, status=full, domain=besteleven.com, chars=1817, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/Footballist_Raya_Shoulder_Nov24.vclip` (mode=content, status=full, domain=footballist.co.kr, chars=1847, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/InterFootball_Raya_Injury_Nov22.vclip` (mode=content, status=full, domain=interfootball.co.kr, chars=1662, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/Standard_Arsenal_Injury_Update_Nov23.vclip` (mode=content, status=full, domain=standard.co.uk, chars=4411, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/The_Guardian_Arteta_Raya_Injury_Nov21.vclip` (mode=content, status=blocked-fallback, domain=theguardian.com, chars=271, snap=False, assets=0)
  - `02_라야_부상_보고서.vproj/sources/The_Guardian_Raya_No_Surgery_Nov23.vclip` (mode=content, status=blocked-fallback, domain=theguardian.com, chars=266, snap=False, assets=0)

## RS3_archive_blocked — 원형 딥 아카이브(archive · 클린 이미지) + 차단 사이트 정직 폴백 + 활성 .vproj 배치 (95/100)
- Tools: `b14650c2_rs_clip, b14650c2_rs_clip, read_file, b14650c2_rs_audit`
- ✅ `[A_role]` (10/10pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ✅ `[C_storage]` (20/20pt) 저장 폴더 ['03_아카이브_검증.vproj/sources'] (기대: *03_아카이브_검증.vproj/sources)
- ✅ `[D_quality]` (25/25pt) besteleven mode=archive status=full chars=1704 snapshot=True assets=3 noise=0
- ✅ `[D_quality]` (20/20pt) httpbin.org status=blocked-fallback note=접근 제한 또는 안티봇 차단 (HTTP 403)
- ❌ `[E_search]` (0/5pt) rs_audit 자가 점검 0회 호출 (목표 >= 1)
- ✅ `[B_routing]` (10/10pt) 도구 실패 0건
- ✅ `[F_output]` (10/10pt) 차단 사유 및 수동 보강 안내: 충족
- Saved `.vclip` bundles:
  - `03_아카이브_검증.vproj/sources/httpbin.org.vclip` (mode=content, status=blocked-fallback, domain=httpbin.org, chars=169, snap=False, assets=0)
  - `03_아카이브_검증.vproj/sources/“수술 안 해도 된다”… ‘철벽 GK’ 라야 어깨 부상에 가슴 철렁했던 아스널, 아르테타 감독 한숨 돌렸다.vclip` (mode=archive, status=full, domain=besteleven.com, chars=1704, snap=True, assets=3)

## RS4_role_separation — 역할 분리 종합: 활성 .vproj 내부 sources/(.vclip) + 사진/(자유 라이선스) + .ref 미생성 (15/100)
- Tools: ``
- ✅ `[A_role]` (15/15pt) .ref 생성 수 0개 (사실 리서치 중 .ref 미생성 필요)
- ❌ `[B_routing]` (0/10pt) captureMode=[] (기대 'content' >= 2건)
- ❌ `[D_quality]` (0/10pt) .vclip 번들 0개 (목표 >= 2)
- ❌ `[D_quality]` (0/10pt) 딥 URL 0/0건 (목표 >= 2, 루트홈피=0건)
- ❌ `[D_quality]` (0/10pt) 충실한 full 본문(>=200자) 0건 (목표 >= 1) · []
- ❌ `[D_quality]` (0/15pt) 자유 라이선스 사진 0장 · 출처노트 라이선스 기록 0건 (목표 >= 3)
- ❌ `[C_storage]` (0/15pt) 클립 폴더=[] vs 사진 폴더=[] (모두 04_아사쿠사_자료.vproj/ 하위 분리 필요)
- ❌ `[E_search]` (0/5pt) rs_audit 자가 점검 0회 호출 (목표 >= 1)
- ❌ `[F_output]` (0/10pt) 답변에 사진 라이선스 보고: 누락
