# 하네스 평가 — upgraded

통과 8/8

| 시나리오 | 통과 | 점수 | 시간 | 입력/캐시/출력 토큰 | vibefs | read_file | 차단 |
|---|---|---|---|---|---|---|---|
| S1-decision-standard | ✅ | 7/7 | 67.5s | 40,703/167,595/5,349 | 1 | 7 | 0 |
| S2-pricing-current | ✅ | 4/4 | 61.3s | 73,294/218,725/2,849 | 6 | 5 | 0 |
| S3-onboarding-baseline | ✅ | 3/3 | 20.2s | 25,504/36,209/1,328 | 1 | 2 | 0 |
| S4-retention-needle | ✅ | 4/4 | 40.9s | 38,385/140,851/1,635 | 3 | 4 | 0 |
| S5-not-found | ✅ | 3/3 | 31.6s | 36,304/117,995/1,502 | 4 | 2 | 0 |
| S6-plan-vs-result | ✅ | 5/5 | 33.0s | 32,924/95,482/1,847 | 3 | 3 | 0 |
| S7-conventions | ✅ | 5/5 | 66.8s | 51,382/262,389/4,461 | 5 | 7 | 0 |
| S8-multi-turn | ✅ | 6/6 | 77.5s | 42,438/171,669/6,936 | 1 | 6 | 0 |

## S1-decision-standard — 묶음 종합 · 의도 파악 · 함정(템플릿/예시/동일본/세대 차이)
> 리소스의 Decision 들을 읽고 공통 형식과 차이를 정리해서, 앞으로 쓸 결정 카드 표준을 제안해줘.

- ✅ 실제 결정 카드 읽음(동일본 제외): 5/5
- ✅ 범위 주장 없음 (결정 카드 5/5 읽음)
- ✅ 형식의 세대 차이(실행 가이드라인 유무) 지적: 있음
- ✅ 예시 카드(Decision 09)를 실제 결정으로 취급 안 함: 통과
- ✅ 초안(D5 외부 검색)을 확정 결정으로 취급 안 함: 통과
- ✅ resource 링크 8개 모두 실제 id
- ✅ 실패한 도구 0개

**도구 순서**

1. `mcp_vibefs_b450a578_ws_collect` done {"query": "Decision", "toolSummary": "Collect Decision cards"}
2. `read_file` done {"EndLine": 25, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/projects/alpha/discussions/25.01.06/decisions/Decision 01 — 검
3. `read_file` done {"EndLine": 25, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/projects/alpha/discussions/25.01.06/decisions/Decision 02 — 첫
4. `read_file` done {"EndLine": 25, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/projects/alpha/discussions/25.01.13/decisions/Decision 01 — 요
5. `read_file` done {"EndLine": 35, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/projects/alpha/discussions/25.01.20/decisions/Decision 03 — 요
6. `read_file` done {"EndLine": 35, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/projects/alpha/discussions/25.01.20/decisions/Decision 04 — 온
7. `read_file` done {"EndLine": 25, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/archive/2025.01.27 주간회의/A5.outputs/D5_외부_검색_API_도입은_보류한다_초안.m
8. `read_file` done {"EndLine": 25, "Path": "C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/vault/archive/2025.01.20 주간회의/A1.collection/history/2.2_결정_기록_방식_정리

**읽은 파일 (7)**: 2.2_결정_기록_방식_정리.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

Analyzing the file list, there are 11 total files. The core focus is on 6 files, with 5 unique ones. The first two files appear to be duplicates, so investigating only one of each pair is needed. The aim is to understand the content of these core files for further processing.


The analysis reveals six identified primary entities, including five unique ones and a duplicate of one. These entities are documented in a set of eleven items, showing a clear focus. The items include topics like starting searches with a local index and narrowing down the first customer to the legal team. The "Decision 01" entry regarding fees is also present.


The existing documents exhibit a consistent structure, including frontmatter with "Type," "Status," and a concise "Summary." The core content is organized into "What" and "Why" sections, and later expanded to include execution guidelines. "Decision" entries are numbered sequentially. Analysis reveals an evolution of detail, with later documents incorporating additional sections.


The documentation structure evolved to include mandatory "Focus (Do)," "Exclude (Don't)," and "Definition of Done (DoD)" criteria.  Versioning initially faced conflicts with independent numbering per date folder, but later shifted to a project-wide sequential numbering scheme. A clear history-tracking pattern emerged, where superseded documents are marked as "Replaced" with a warning callout linking to the replacement decision. File and folder naming conventions vary, with discrepancies between the "discussions/" folder (using spaces and an em dash) and the "archive/..." folders (using underscores and abbreviations), even when containing the same content. Pre-decision agenda cards in history folders differ in type, status, and section organization from finalized decision cards.




</details>

**답변**

본 요청은 **유형 A. 묶음 종합** 분석으로, `ws_collect("Decision")`를 통해 파악된 결정 카드 묶음 11개 중 **본 대상 고유 5개 파일 전체**와 초안/검토 문서를 직접 읽고 비교 분석했습니다.

---

### 1. 대상 문서 목록 확정 및 읽은 범위

- **본 대상 고유 5개 (전체 확인 완료)**:
  1. [Decision 01 — 검색은 로컬 색인으로 시작한다](vdoc:resource/file_7a92f1593b) (L1-21)
  2. [Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_be75b165d0) (L1-21)
  3. [Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849) (L1-21) *(상태: 대체됨)*
  4. [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L1-27) *(동일본: [D3_요금제는_사용량_기반으로_바꾼다](vdoc:resource/file_8db3356039))*
  5. [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L1-27)
- **초안 및 검토 중 비교 대상**:
  - [D5 (초안) — 외부 검색 API 도입은 보류한다](vdoc:resource/file_b35187e082) (L1-11)
  - [2.2 결정 기록 방식 정리](vdoc:resource/file_3e956378cd) (L1-15)

---

### 2. 결정 카드의 공통 형식

고유 결정 카드 5종에서 유지되고 있는 공통 규칙은 다음과 같습니다.

1. **Frontmatter 메타데이터**:
   - `유형: 할일`
   - `상태: 결정 사항` (대체된 경우 `대체됨`, 미확정 시 `검토 중`)
   - `요약: <핵심 결정 명제 한 줄>`
   - `작성일: YYYY-MM-DD`
   - `상위: ["[[알파 프로젝트 목표]]"]`
   - `담당: ["[[민지]]"]`
2. **문서 제목**:
   - `# 🎯 Decision {번호} — {제목 명제}`
3. **핵심 본문 섹션**:
   - `## 1. 결정 내용 (What)`: 옵시디언 콜아웃 `> [!check]` 안에 단정형 명제 불릿 기록
   - `## 2. 결정 사유 (Why)`: 번호 매기기 목록(`1. ...`)으로 보안·측정·파일럿 데이터 등 명확한 판단 근거 제시

---

### 3. 시기 및 폴더별 차이점

| 구분 | 초기 (25.01.06 ~ 25.01.13) | 후기 (25.01.20 이후) |
| :--- | :--- | :--- |
| **섹션 구성** | • `What`, `Why` 2개 섹션만 존재 (21줄) | • `## 3. 실행 가이드라인 (Boundary & Criteria)` 추가 정규화 (27줄) |
| **실행 경계** | • 구체적 실행/제외 범위 미기술 | • **Do**(집중 대상), **Don't**(제외 대상), **DoD**(완료 기준) 3요소 필수 명시 |
| **번호 체계** | • 주차별로 번호가 리셋되어 충돌 발생 (`25.01.13/Decision 01` 존재) | • 프로젝트 전역 단일 누적 일련번호(`Decision 03`, `Decision 04`)로 통합 정착 |
| **이력 관리** | • 이전 결정 폐기/대체 시 사후 처리 규칙 부재 | • 구 문서 상태를 `대체됨`으로 변경하고 상호 `[[위키링크]]` 경고문 삽입 |

#### 폴더별 저장 및 서식 차이
- **`discussions/` vs `archive/.../A5.outputs/`**:
  - `discussions/`는 가독성을 위한 표기(`Decision 03 — ...md`)를 사용하는 반면, `archive/` 산출물 폴더는 시스템 식별용 축약형(`D3_...md`)을 사용하며 동일 내용이 중복 보관되었습니다.
- **`archive/.../A1.collection/history/` (안건 카드)**:
  - 확정 카드가 아닌 주간회의 논의용 카드로 `유형: 메모`, `상태: 검토 중`, 본문은 `📌 기존엔 왜 이렇게 했을까`, `⚖️ 핵심 쟁점`, `💡 해결 방향` 구조를 가집니다.
- **초안(`D5_..._초안.md`)**:
  - 상위/담당 메타데이터가 생략되어 있고 상단에 `> ⚠️ 아직 합의되지 않은 초안` 경고가 붙어 있어 확정본과 즉시 구별됩니다.

---

### 4. 제안: 앞으로 적용할 '결정 카드 표준 양식'

25.01.20의 최신 서식([Decision 03](vdoc:resource/file_75d5f55476) / [Decision 04](vdoc:resource/file_4926aa33c3))을 계승하여 정립한 표준안입니다.

```markdown
---
유형: 할일
상태: 결정 사항
요약: {핵심 결정을 나타내는 단정형 문장}
작성일: YYYY-MM-DD
상위:
  - "[[상위 목표/프로젝트 문서]]"
담당:
  - "[[담당자]]"
---

# 🎯 Decision {NN} — {결정 제목 명제}

## 1. 결정 내용 (What)

> [!check]
> - {핵심 결정 사항 명제}

## 2. 결정 사유 (Why)

1. {정량적 데이터, 실측 기준선, 파일럿 피드백, 규정 등 근거 서술}

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: {구현 및 실행 범위}
- **제외 대상 (Don't)**: {이번 스코프에서 의도적으로 배제할 범위}
- **완료 판단 기준 (DoD)**: {완료를 검증할 수 있는 명확한 기준/지표}
```

#### 운영 수칙 권장사항
1. **일련번호 관리**: 주차별 폴더와 관계없이 전역 누적 일련번호(`Decision 01, 02, 03...`)를 부여하여 번호 중복을 방지합니다.
2. **대체(Superseed) 프로토콜**: 기존 결정을 수정/폐기할 때는 구 문서의 `상태: 대체됨` 수정 및 본문 상단에 `⚠️ YYYY-MM-DD [[새 결정 카드]] 로 대체됨` 알림을 상호 링크로 명시합니다.
3. **경계 조건(Do/Don't/DoD) 의무화**: 결정만 내리고 실행 범위를 모호하게 두지 않도록 3번 실행 가이드라인 작성을 필수로 유지합니다.

## S2-pricing-current — 대체 관계 추적 · 현재 유효성 판단
> 요금제에 대해 지금 유효한 결정이 뭐야? 근거와 함께 알려줘.

- ✅ 사용량 기반이 현재 결정: 있음
- ✅ 좌석 기반 v1 이 대체됐음을 언급: 있음
- ✅ Decision 03 읽음: 1/1
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_d21ded6d_ws_grep` done {"pattern": "요금", "toolSummary": "Search for pricing decisions"}
2. `mcp_vibefs_d21ded6d_ws_glob` done {"pattern": "*decision*", "toolSummary": "Find all decision files"}
3. `mcp_vibefs_d21ded6d_ws_tree` done {"depth": 3, "path": "discussions", "toolSummary": "Inspect discussions folder structure"}
4. `mcp_vibefs_d21ded6d_ws_tree` done {"depth": 3, "path": "archive/2025.01.27 주간회의", "toolSummary": "Inspect 2025.01.27 weekly meeting"}
5. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
6. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
7. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A5.outputs\\D3_요금제는_사용량_기반
8. `mcp_vibefs_d21ded6d_ws_links` done {"path": "discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md", "toolSummary": "Find links and backlinks for Decision 03"}
9. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\2025.01.20 주간회의 — 작업 기억.md
10. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A1.collection\\history\\1.
11. `mcp_vibefs_d21ded6d_ws_grep` done {"pattern": "편차", "toolSummary": "Search for 편차"}

**읽은 파일 (5)**: 2025.01.20 주간회의 — 작업 기억.md, 1.1_요금_구조_재검토.md, D3_요금제는_사용량_기반으로_바꾼다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md

<details><summary>생각</summary>

The initial approach involves identifying current, valid information regarding the pricing plan. This means checking the frontmatter for status indicators like "replaced" or "deprecated," and also comparing with later dated cards on the same subject. The plan is to use file system tools to locate relevant decision cards and documentation.


The initial decision regarding the pricing model was seat-based, but a subsequent decision replaced it with a usage-based model. It's necessary to confirm if the weekly meeting on 25.01.27 contains related discussions about the pricing.


Initial analysis suggests the weekly meeting lacked any new decisions regarding pricing plans. The external search API draft for D5 is on hold. Thoroughly reviewing the decision cards and supporting documentation using a file reading tool is necessary. Specifically, focusing on two decision documents: one for seat-based pricing (v1), and the other for usage-based pricing.


The instructions are clear. Will extract the resource ID from the vibefs output for citations. Only cite information that can be verified through `read_file`. Will avoid making up content or using non-existent paths.




</details>

**답변**

현재 요금제에 대해 유효한 최종 결정은 **[Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476)** (L1-27)입니다.

---

### 1. 현재 유효한 결정 내용 (What)
- **결정**: 요금은 **처리한 문서 페이지 수 기준(사용량 기반)**으로 매기며, 기존의 **좌석 기반 요금제는 폐기**합니다. ([Decision 03](vdoc:resource/file_75d5f55476) L16-17)
- **상태**: `결정 사항` (작성일: 2025-01-20 / 담당: 민지)
- **이전 결정 변경 사항**: 2025-01-13에 수립되었던 **[Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849)** (L1-21)은 상태가 `대체됨`으로 처리되어 공식 폐기되었습니다.

---

### 2. 결정 근거 및 사유 (Why)
- **법무팀 파일럿에서 좌석 수보다 처리량 편차가 10배 이상 컸기 때문**입니다. ([Decision 03](vdoc:resource/file_75d5f55476) L21)
  *(참고: 이전 Decision 01에서는 "경쟁사 대부분이 좌석 기반"이라는 이유로 좌석제를 채택했으나, 실측 편차 데이터 확인 후 사용량 기반으로 전환)*

---

### 3. 실행 가이드라인 (Boundary & Criteria)
- **집중 대상 (Do)**: 페이지 단위 과금 계측 ([Decision 03](vdoc:resource/file_75d5f55476) L25)
- **제외 대상 (Don't)**: 좌석 단위 할인 정책 ([Decision 03](vdoc:resource/file_75d5f55476) L26)
- **완료 판단 기준 (DoD)**: 2월 청구서가 사용량 기준으로 발행됨 ([Decision 03](vdoc:resource/file_75d5f55476) L27)

## S3-onboarding-baseline — 링크 따라가기 (다른 폴더의 근거 메모)
> 온보딩 결정에서 말하는 실측 기준선 수치가 정확히 얼마야? 어디에 적혀 있는지도 알려줘.

- ✅ 기준선 47분: 있음
- ✅ 근거 메모 읽음: 1/1
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_b197b183_ws_grep` done {"pattern": "실측 기준선", "toolSummary": "Grep onboarding baseline"}
2. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
3. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A3.working memory\\근거_온보딩 

**읽은 파일 (2)**: 근거_온보딩 실측 기준선.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

The query focuses on a specific baseline metric mentioned in an onboarding decision. The task requires identifying the exact numerical value of this metric and its location within the provided data. Initial search within the mounted directory structure will focus on finding the onboarding decisions document.


Reading the two files: "Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md" and "근거_온보딩 실측 기준선.md" to understand the onboarding process and establish a baseline for measurement. "Decision 04" likely outlines the onboarding steps, while "근거_온보딩 실측 기준선.md" should contain the data to determine the current baseline onboarding.


The onboarding process's objective is to halve the initial document completion time, referencing "실측 기준선". The supporting document "근거_온보딩 실측 기준선" contains the relevant numerical data. Now determining specific values for the objective.




</details>

**답변**

온보딩 결정 문서에서 참조하는 **실측 기준선 수치는 "첫 문서 완성까지 평균 47분"**(최솟값 21분 · 최댓값 95분, 신규 고객 12명 측정)입니다.

해당 내용이 기록된 위치와 관련 근거는 다음과 같습니다:

1. **실측 수치 원본 기록 위치**:
   - [근거_온보딩 실측 기준선](vdoc:resource/file_c4dcd048c0) (L7-9)
   - 내용:
     - 측정 대상: 신규 고객 12명 (n=12)
     - **기준선: 첫 문서 완성까지 평균 47분**
     - 최솟값 21분 · 최댓값 95분

2. **온보딩 결정 카드 내 인용 위치**:
   - [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L21, L27)
   - 내용: 위 실측 기준선(평균 47분)을 바탕으로 첫 문서 완성 시간을 **절반 이하(약 23.5분 이하)**로 단축하는 것을 목표이자 완료 판단 기준(DoD)으로 삼고 있습니다.

## S4-retention-needle — 대용량 파일 속 바늘 · 미끼 회피
> 데이터 보존 기간은 최종적으로 며칠로 합의됐어? 어디에 기록돼 있는지도.

- ✅ 최종 합의 90일: 있음
- ✅ 30일을 최종으로 착각 안 함: 통과
- ✅ 2417번째 줄을 읽음 (L2410-2430)
- ✅ resource 링크 1개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_d2f10c6a_ws_grep` done {"pattern": "보존", "toolSummary": "Search data retention period"}
2. `read_file` done {"EndLine": 2430, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\logs\\세션 기록_대용량.md", "StartLine": 2410}
3. `read_file` done {"EndLine": 305, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\logs\\세션 기록_대용량.md", "StartLine": 295}
4. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\logs\\세션 기록_대용량.md", "StartLine": 1}
5. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A1.collection\\history\\3.
6. `mcp_vibefs_d2f10c6a_ws_grep` done {"pattern": "90일", "toolSummary": "Search 90 days"}
7. `mcp_vibefs_d2f10c6a_ws_grep` done {"pattern": "보존 기간", "toolSummary": "Search retention period"}

**읽은 파일 (2)**: 3.1_데이터_보존_정책_초안.md, 세션 기록_대용량.md

<details><summary>생각</summary>

The query seeks a specific numerical value (days) and its location. The task involves searching for keywords related to retention period with a tool to find lines containing these terms and numerical values. Then reading the surrounding lines to identify the agreed-upon value, prioritizing values marked as "agreed" or "final."


The grep output indicates a discussion around data retention periods. One entry mentions a review within a 30-day timeframe with no conclusion, deferred to the next meeting. Another entry records a consensus for a 90-day retention period, reflecting a legal team's request with no dissent. Further investigation of other decision records and discussions is needed to confirm if other files contain potentially related information, starting with files matching the session record patterns.


The initial search targeted "보존", "보존 기간", and "90일" using the designated tool. Found a reference to "30일" with no conclusive outcome, indicating it was deferred. A subsequent entry documented the final agreement as "90일," reflecting legal team input without further dispute.




</details>

**답변**

데이터 보존 기간은 최종적으로 **90일**로 합의되었습니다.

### 📌 세부 내용 및 기록 위치
* **최종 합의 내용**: 데이터 보존 기간은 **90일**로 결정 (법무팀 요청 반영, 이견 없음)
* **기록 위치**: [세션 기록 (대용량)](vdoc:resource/file_4371d87a60) (L2417)
  * 경로: `archive/logs/세션 기록_대용량.md`

> [!NOTE]
> 이전 논의(L300)에서 **30일 안**이 검토되었으나 결론 없이 다음 회의로 이월되었으며, 이후 17:48에 법무팀 요청을 반영하여 **90일**로 최종 합의되었습니다.

## S5-not-found — 없는 것을 없다고 말하기 · 지어내지 않기
> 결정 카드 중에 '가격 할인 정책'을 정한 결정이 있어?

- ✅ 없다고 답함: 있음
- ✅ D03 의 '좌석 단위 할인 정책' 제외 항목을 짚음 (가점): 있음
- ✅ resource 링크 3개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_20cccc1e_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_20cccc1e_ws_grep` done {"pattern": "할인", "toolSummary": "Search for discount terms"}
3. `read_file` done {"EndLine": 27, "Path": "archive/2025.01.20 주간회의/A5.outputs/D3_요금제는_사용량_기반으로_바꾼다.md", "StartLine": 1}
4. `mcp_vibefs_20cccc1e_ws_grep` done {"pattern": "가격", "toolSummary": "Search for price terms"}
5. `mcp_vibefs_20cccc1e_ws_grep` done {"pattern": "요금", "toolSummary": "Search for pricing terms"}
6. `read_file` done {"EndLine": 21, "Path": "projects/alpha/discussions/25.01.13/decisions/Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md", "StartLine": 1}

**읽은 파일 (2)**: D3_요금제는_사용량_기반으로_바꾼다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md

<details><summary>생각</summary>

First, I will search for the requested decision using the designated tools. If the decision is not found, I will respond with "not found" and provide the closest related information. I'll adhere to the citation format using the provided resource ID and avoid including paths directly in the ID. When referencing screen locations or cited materials, I will use clickable links.




</details>

**답변**

현재 마운트된 결정 카드 중 **'가격 할인 정책'을 수립하거나 정한 결정 카드는 없습니다.**

다만, 가장 밀접한 관련 내용으로 아래 결정 카드에서 할인 정책에 대한 제외 지침이 명시되어 있습니다.

- [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_8db3356039) (L23-27)
  - 실행 가이드라인(Boundary & Criteria)의 **제외 대상(Don't)**으로 **"좌석 단위 할인 정책"**이 지정되어 있어, 별도의 할인 정책을 도입하지 않고 제외 대상으로 다루고 있습니다.

---

**참고 (관련 요금제 결정 카드 이력)**
- [Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849) (L14-18): 초기 좌석 기반 과금을 결정했으나 폐기 및 대체됨.
- [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L14-18): 요금을 좌석 수가 아닌 처리 문서 페이지 수 기준으로 변경함.

## S6-plan-vs-result — 계획 수치와 실측 수치 구분 · 두 근거를 엮은 계산
> 온보딩 기준선은 몇 명을 실제로 측정한 결과야? 그리고 온보딩 결정이 달성해야 하는 목표 시간은 몇 분 이하야?

- ✅ 실측 인원 12명: 있음
- ✅ 계획 인원 10명을 실측으로 착각 안 함: 통과
- ✅ 목표 = 47분의 절반(23.5분): 있음
- ✅ 근거 메모 읽음: 1/1
- ✅ resource 링크 3개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_fa0dd771_ws_grep` done {"pattern": "온보딩 실측 기준선", "toolSummary": "Search onboarding baseline"}
2. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A3.working memory\\근거_온보딩 
3. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
4. `mcp_vibefs_fa0dd771_ws_grep` done {"pattern": "절반", "toolSummary": "Search half threshold"}
5. `mcp_vibefs_fa0dd771_ws_grep` done {"pattern": "첫 문서 완성", "toolSummary": "Search first doc completion"}
6. `read_file` done {"EndLine": 20, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\new todo\\va

**읽은 파일 (3)**: 근거_온보딩 실측 기준선.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, value_온보딩 실측 계획.md

<details><summary>생각</summary>

Initial search focuses on identifying numerical values and quantifying terms related to onboarding. The "ws_grep" tool will be employed to locate specific numbers associated with the keywords "기준선" (baseline) and "목표 시간" (target time). Subsequent analysis will examine the context surrounding these numerical findings to extract relevant information from referenced documents.


Initial suspicion is that two files contain the needed information. Reading both files to extract the specific data points and relevant quotations is the next step.


The initial data reveals an onboarding baseline of 47 minutes for new customers (n=12). The goal is to reduce this time by half, focusing on the "first document" as the primary "definition of done."


Initial assessment: need to analyze `value_온보딩 실측 계획.md` to compare planned values with actual measurements. The document outlines a rule: if a card references another document via a link, follow the `ws_links` to verify the original values (plan values ≠ actual measurements). Found the plan was for 10 new customers, while the measurement was for 12 new customers (n=12).


온보딩 기준선 확인. 계획은 10명 측정이었지만, 실제 측정한 인원은 12명이었다. 온보딩 결정 목표 시간은 아직 명확하지 않다.




</details>

**답변**

온보딩 실측 기준선 및 목표 시간에 대한 확인 결과는 다음과 같습니다.

1. **실제 측정 인원**: **12명**
   - 초기 계획 문서([온보딩 실측 계획](vdoc:resource/file_3d9eaa9301) L6)에서는 10명을 예정했으나, 실제 측정 결과는 신규 고객 **12명(n=12)**을 대상으로 진행되었습니다 ([온보딩 실측 기준선](vdoc:resource/file_c4dcd048c0) L7).

2. **달성 목표 시간**: **23.5분 이하**
   - 실측된 기준선은 첫 문서 완성까지 **평균 47분**(최솟값 21분 · 최댓값 95분)입니다 ([온보딩 실측 기준선](vdoc:resource/file_c4dcd048c0) L8-9).
   - 온보딩 결정 문서의 완료 판단 기준(DoD) 및 목표는 기준선의 절반 이하이므로, **23.5분 이하**가 목표 시간입니다 ([Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) L21, L27).

## S7-conventions — 볼트 관례 이해 (구조 파악 → 규칙 추론)
> 이 볼트에서 새 결정을 기록하려면 어느 폴더에 어떤 이름과 형식으로 둬야 해? 볼트의 실제 관례를 근거로 말해줘.

- ✅ 날짜별 decisions 폴더: 있음
- ✅ 'Decision 번호 — 결정 문장' 이름 규칙: 있음
- ✅ 최신 형식(실행 가이드라인 포함): 있음
- ✅ 회의 폴더(A5.outputs)의 D#_ 사본 관례 (가점): 있음
- ✅ resource 링크 5개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_43f63efe_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_43f63efe_ws_grep` done {"pattern": "결정 기록", "toolSummary": "Search for decision recording convention"}
3. `read_file` done {"EndLine": 25, "Path": "archive/2025.01.20 주간회의/A1.collection/history/2.2_결정_기록_방식_정리.md", "StartLine": 1}
4. `mcp_vibefs_43f63efe_ws_tree` done {"depth": 3, "path": "discussions", "toolSummary": "Examine discussions folder tree"}
5. `mcp_vibefs_43f63efe_ws_duplicates` done {"toolSummary": "Check duplicate files"}
6. `read_file` done {"EndLine": 50, "Path": "archive/2025.01.06 주간회의/A4.meta/templates/decision_card_template.md", "StartLine": 1}
7. `read_file` done {"EndLine": 50, "Path": "archive/2025.01.06 주간회의/A4.meta/SKILL.md", "StartLine": 1}
8. `read_file` done {"EndLine": 40, "Path": "discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md", "StartLine": 1}
9. `read_file` done {"EndLine": 40, "Path": "discussions/25.01.20/decisions/Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md", "StartLine": 1}
10. `read_file` done {"EndLine": 40, "Path": "discussions/25.01.06/decisions/Decision 01 — 검색은 로컬 색인으로 시작한다.md", "StartLine": 1}
11. `read_file` done {"EndLine": 30, "Path": "archive/2025.01.27 주간회의/A5.outputs/D5_외부_검색_API_도입은_보류한다_초안.md", "StartLine": 1}
12. `mcp_vibefs_43f63efe_ws_glob` done {"pattern": "*decision_card_template*", "toolSummary": "Get decision_card_template resourceId"}

**읽은 파일 (7)**: SKILL.md, decision_card_template.md, 2.2_결정_기록_방식_정리.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

유형: E. 관례 · 구조 ("어디에 · 어떤 이름 · 형식으로") 결정 기록을 위한 볼트 내 폴더, 이름, 형식을 파악해야 한다. 리소스 작업 공간 규칙에 따르면 ws_overview 및 ws_tree 폴더 패턴을 따라야 한다. 볼트의 실제 관례를 확인하여 정확한 위치와 명명 규칙을 결정해야 한다.


Focusing on the decision cards in the discussions and archive. Examining the decision card titles to understand key choices. Reviewing the content of the cards to learn details of specific decisions.


Reading through the decision cards to understand the format and content. Examining the titles and file paths to identify key decision points and their context. Now focused on the content within each card to understand the specifics of each decision.


Examining the file structure conventions within the vault, observing patterns in how decisions and meeting outputs are archived. Project discussions appear to follow a `discussions/<YY.MM.DD>/decisions/` structure, while weekly meeting outputs are stored under `archive/<YYYY.MM.DD 주간회의>/A5.outputs/`. The example 'Decision 03' confirms the structure.


The file `discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md` exists as a complete duplicate, confirming the structure. Active project discussions and decisions appear within `discussions/<YY.MM.DD>/decisions/` following a specific naming convention. Decision file names use the format `Decision <two-digit number> — <decision summary>.md`.


I'm thinking through how to approach this.




</details>

**답변**

볼트 내 실제 파일들을 분석한 결과, 새 결정을 기록할 때 따르는 폴더 위치, 파일명, 문서 형식 관례는 다음과 같습니다.

---

### 1. 저장 폴더 관례

새 결정 문서는 상황에 따라 두 위치 중 하나에 저장됩니다.

1. **프로젝트 논의 및 확정 결정 (주 경로)**:
   - 경로: `discussions/<YY.MM.DD>/decisions/`
   - 예시: `discussions/25.01.20/decisions/` ([Decision 03](vdoc:resource/file_75d5f55476) (L1-27), [Decision 04](vdoc:resource/file_4926aa33c3) (L1-27))
2. **주간회의 산출물 아카이브**:
   - 경로: `archive/<YYYY.MM.DD> 주간회의/A5.outputs/`
   - 예시: `archive/2025.01.20 주간회의/A5.outputs/` ([D3](vdoc:resource/file_8db3356039) (L1-27))

---

### 2. 파일명 명명 규칙

- **`discussions/` 폴더 관례**:
  - `Decision <두 자리 번호> — <결정 한 문장>.md`
  - 긴 대시(`—`, em-dash) 앞뒤에 공백을 두고 결정 문장을 작성합니다.
  - 대괄호(`[]`)는 링크 파괴 방지를 위해 절대 사용하지 않습니다.
  - 예시:
    - `Decision 01 — 검색은 로컬 색인으로 시작한다.md` ([Decision 01](vdoc:resource/file_7a92f1593b) (L1-21))
    - `Decision 03 — 요금제는 사용량 기반으로 바꾼다.md` ([Decision 03](vdoc:resource/file_75d5f55476) (L1-27))
    - `Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md` ([Decision 04](vdoc:resource/file_4926aa33c3) (L1-27))
- **`archive/.../A5.outputs/` 관례**:
  - `D<번호>_<결정_한_문장_언더스코어>.md` (예: `D3_요금제는_사용량_기반으로_바꾼다.md`)
  - 검토 중인 초안일 경우 끝에 `_초안` 표기 (예: `D5_외부_검색_API_도입은_보류한다_초안.md`)

---

### 3. 문서 형식 및 템플릿

볼트에 정의된 [decision_card_template.md](vdoc:resource/file_d1b21adce6) (L1-9)과 실제 확정 카드([Decision 03](vdoc:resource/file_75d5f55476) (L1-27))의 표준 형식입니다.

```markdown
---
유형: 할일
상태: 결정 사항
요약: <결정 핵심 요약 한 줄>
작성일: YYYY-MM-DD
상위:
  - "[[알파 프로젝트 목표]]"
담당:
  - "[[담당자명]]"
---

# 🎯 Decision <번호> — <결정 한 문장>

## 1. 결정 내용 (What)

> [!check]
> - <확정된 핵심 결정 내용>

## 2. 결정 사유 (Why)

1. <결정 사유 및 근거, 필요 시 관련 [[문서/실측 기준선]] 링크 인용>

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: <집중해서 실행할 대상>
- **제외 대상 (Don't)**: <범위에서 제외할 항목>
- **완료 판단 기준 (DoD)**: <완료 판단 기준>

## 4. 아직 안 정한 것
(필요 시 작성)
```

- **상태 frontmatter 값**: 확정본은 `결정 사항`, 초안/검토 단계는 `검토 중`, 이전 결정이 갱신된 경우는 `대체됨`으로 기록합니다.

## S8-multi-turn — 이어지는 질문 · 앞 턴 맥락 위에서 재작업
> Decision들 정리해줘 → 그중에 지금 유효하지 않은 건 빼고, 각 결정이 언제 내려졌는지 표로 다시 줘

- ✅ 대체된 v1(좌석 기반)을 유효 목록에 넣지 않음: 통과
- ✅ 예시 카드 제외: 통과
- ✅ 초안 D5 제외: 통과
- ✅ 결정 날짜(1/6) 표기: 있음
- ✅ 결정 날짜(1/20) 표기: 있음
- ✅ resource 링크 6개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_bd454341_ws_collect` done {"query": "Decision", "toolSummary": "Collect decision cards"}
2. `read_file` done {"EndLine": 30, "Path": "discussions/25.01.06/decisions/Decision 01 — 검색은 로컬 색인으로 시작한다.md", "StartLine": 1}
3. `read_file` done {"EndLine": 30, "Path": "discussions/25.01.06/decisions/Decision 02 — 첫 고객은 법무팀으로 좁힌다.md", "StartLine": 1}
4. `read_file` done {"EndLine": 30, "Path": "discussions/25.01.13/decisions/Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md", "StartLine": 1}
5. `read_file` done {"EndLine": 40, "Path": "discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md", "StartLine": 1}
6. `read_file` done {"EndLine": 40, "Path": "discussions/25.01.20/decisions/Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md", "StartLine": 1}
7. `read_file` done {"EndLine": 30, "Path": "archive/2025.01.27 주간회의/A5.outputs/D5_외부_검색_API_도입은_보류한다_초안.md", "StartLine": 1}

**읽은 파일 (6)**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

The task requires gathering and comparing specific "Decision" data. Identified that the process involves reading and analyzing five distinct files. The primary goal is to identify commonalities and differences across these files, considering factors like timing and folder variations, without generalizing from partial data.


Decision 관련 파일 수집 결과 11개, 고유 파일 5개 발견. 동일 내용의 파일이 다른 위치에 존재함을 확인. 주간 회의 아카이브와 토론 디렉토리에서 동일한 의사 결정 문서 발견.


Found five unique decision files and identified their locations across both weekly meeting archives and discussion directories. The decision files include those related to the initial search strategy, the first customer target, pricing models, and onboarding templates. Additionally, draft/review files related to decision recording methods were identified across multiple weekly meeting archives.


The files `archive/2025.01.20...D3_요금제는_사용량_기반으로_바꾼다.md` and `discussions/25.01.20...Decision 03...` are confirmed to be the same content. Initial drafts include `archive/2025.01.06...2.2_결정_기록_방식_정리.md` and others.


The task involves synthesizing and comparing multiple inputs based on specific criteria. The first step involves identifying a definitive set of documents using a designated collection tool. Subsequently, each identified document will be read and analyzed individually to uncover similarities, differences, and patterns, with particular attention to variations across time periods and folder structures. The analysis will avoid generalization based on incomplete information, focusing instead on a comprehensive examination of the complete set of documents.


Identified five distinct documents to analyze. Each document will be examined individually. These documents include decisions regarding search index, initial customer selection, and pricing models, noting versioning. The focus is to determine if all of the information can be used in the summarization.


Each confirmed decision document includes a structured "What," "Why," and "How" (execution guidelines) section. Draft documents, like the "external search API" proposal, are clearly marked as "review in progress" or drafts, lacking specific metadata. The analysis must focus on how the structured metadata can be used and compared.


All decision documents share common metadata including "type: to-do", "top: [[Alpha Project Goal]]", and "responsible: [[Minji]]". Documents utilize a Markdown structure with main titles, and core sections for decision content and rationale, often including "execution guidelines". Later decisions include execution guidelines ("Do", "Don't", and "DoD") which did not exist in earlier versions, illustrating an evolution in the document's structure and completeness. Additionally, decisions made earlier are sometimes superseded by later decisions, clearly marked as replaced within the documents themselves.


Decision 01, which initiates search with a local index, remains valid and was decided on 2025-01-06. Decision 02, focusing the initial cus

</details>

**답변**

[유형 C. 현재 유효성]

유효하지 않은 결정(상태: `대체됨` 또는 미합의 `초안`)을 제외하고, **현재 유효한 확정 결정 사항(총 4건)**을 결정 일자순으로 정리한 표입니다.

### 현재 유효한 결정 사항 목록

| 번호 | 결정 사항 | 결정 일자 | 상태 | 핵심 내용 |
| :--- | :--- | :---: | :---: | :--- |
| **Decision 01** | [Decision 01 — 검색은 로컬 색인으로 시작한다](vdoc:resource/file_7a92f1593b) (L1-21) | **2025-01-06** | 결정 사항 | 보안 요구 충족을 위해 첫 버전 검색은 외부 API 대신 로컬 색인(BM25)으로 구현 |
| **Decision 02** | [Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_be75b165d0) (L1-21) | **2025-01-06** | 결정 사항 | 성과 측정의 명확성을 위해 첫 파일럿 고객군을 사내 법무팀 한 곳으로 한정 |
| **Decision 03** | [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L1-27) | **2025-01-20** | 결정 사항 | 실측 처리량 편차를 반영하여 기존 좌석 기반 요금제를 폐기하고 페이지 처리량 기반으로 전환 |
| **Decision 04** | [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L1-27) | **2025-01-20** | 결정 사항 | 문서 완성 시간 50% 단축을 위해 계약서·의견서·내부 메모 템플릿 3종 우선 제공 |

---

#### 💡 제외 내역 안내
- **[Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849) (L1-21)**: 2025-01-13에 결정되었으나, 2025-01-20에 `Decision 03`으로 대체·폐기(상태: `대체됨`)되어 제외되었습니다.
- **[D5 초안](vdoc:resource/file_b35187e082) 등 5건**: 상태가 `검토 중`인 미합의 안건 카드로 유효한 결정이 아니므로 제외되었습니다.
