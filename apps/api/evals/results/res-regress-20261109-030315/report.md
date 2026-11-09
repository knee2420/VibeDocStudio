# 하네스 평가 — res-regress

통과 7/8

| 시나리오 | 통과 | 점수 | 시간 | 입력/캐시/출력 토큰 | vibefs | read_file | 차단 |
|---|---|---|---|---|---|---|---|
| S1-decision-standard | ✅ | 7/7 | 77.7s | 47,305/229,334/6,184 | 2 | 8 | 0 |
| S2-pricing-current | ✅ | 4/4 | 34.0s | 34,952/108,719/1,859 | 2 | 3 | 0 |
| S3-onboarding-baseline | ✅ | 3/3 | 31.6s | 28,983/59,304/1,432 | 1 | 2 | 0 |
| S4-retention-needle | ✅ | 4/4 | 31.4s | 39,505/151,331/1,668 | 3 | 4 | 0 |
| S5-not-found | ✅ | 3/3 | 41.1s | 67,626/173,725/2,319 | 3 | 6 | 0 |
| S6-plan-vs-result | ✅ | 5/5 | 58.0s | 48,512/240,771/2,367 | 8 | 3 | 0 |
| S7-conventions | ✅ | 5/5 | 95.4s | 60,445/366,415/5,622 | 5 | 10 | 0 |
| S8-multi-turn | ❌ | 5/6 | 88.0s | 46,625/207,411/7,560 | 1 | 7 | 0 |

## S1-decision-standard — 묶음 종합 · 의도 파악 · 함정(템플릿/예시/동일본/세대 차이)
> 리소스의 Decision 들을 읽고 공통 형식과 차이를 정리해서, 앞으로 쓸 결정 카드 표준을 제안해줘.

- ✅ 실제 결정 카드 읽음(동일본 제외): 5/5
- ✅ 범위 주장 '전수' · 실제 결정 카드 5/5 읽음
- ✅ 형식의 세대 차이(실행 가이드라인 유무) 지적: 있음
- ✅ 예시 카드(Decision 09)를 실제 결정으로 취급 안 함: 통과
- ✅ 초안(D5 외부 검색)을 확정 결정으로 취급 안 함: 통과
- ✅ resource 링크 7개 모두 실제 id
- ✅ 실패한 도구 0개

**도구 순서**

1. `mcp_vibefs_106409d4_ws_collect` done {"query": "Decision", "toolSummary": "Collect decision files"}
2. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A5.outputs\\D3_요금제는_사용량_기반
3. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
4. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
5. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
6. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
7. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도
8. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A1.collection\\history\\2.
9. `mcp_vibefs_106409d4_ws_duplicates` done {"toolSummary": "Check duplicate files"}
10. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A4.meta\\templates\\decisi

**읽은 파일 (8)**: 2.2_결정_기록_방식_정리.md, decision_card_template.md, D3_요금제는_사용량_기반으로_바꾼다.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

The initial step is to gather the decision resources. Reading the provided files is necessary to identify commonalities and discrepancies. Generalization without fully reviewing the specific files should be avoided.


Initial findings show two distinct files present, the first related to usage-based pricing and the second to local search indexing. The first file (`archive/...`) appears duplicated as (`discussions/...`).


The absolute paths of the five files have been determined. Now, each file will be read using the file reading function. This confirms the locations and enables the next processing stage.


Considering reading some draft files to understand the overall structure, even though they aren't final versions. These drafts, such as files like `archive/2025.01.27 주간회의/A5.outputs/D5_외부_검색_API_도입은_보류한다_초안.md` and `archive/2025.01.06 주간회의/A1.collection/history/2.2_결정_기록_방식_정리.md`, could clarify differences and evolution.


Initial assessment confirms the identified files based on the "Decision" query. These include six primary files, five unique ones, and five drafts. Five unique files are identified which need to be processed.


The analysis focuses on identifying common formats and differences within the "Decision" files to propose a standard for decision cards. All five unique files have been read. The initial scope includes six files, of which five are unique decisions. The goal is to avoid generalizing from a partial read, focusing instead on a comprehensive review of all unique decision files.


Observed two relevant template files: a draft decision and a decision card template. The analysis reveals a standardized frontmatter with metadata fields like 'type', 'status', and 'summary'. Common elements across decision cards include a specific title format and standard sections for 'What' and 'Why'.

Evolution across time shows an increase in content from early to later drafts, where a 'Boundary & Criteria' section was added. The later versions specifically include elements such as 'Do', 'Don't', and 'Completion Criteria'.


Folder structure and file naming conventions are clarified: "discussions" use a human-readable and numbered format, while the "archive" uses a mixed format with abbreviations and underscores. Status management includes a "deprecated" status in frontmatter and inline warnings with backlinks to the replacement decision. Drafts lack key metadata, include a "(Draft)" in the title, and contain callouts indicating they are not yet agreed upon and missing sections like "Why" or execution guidelines.

The proposed "decision card standard" will encompass metadata (frontmatter), title, and body sections (What, Why, Boundary & Criteria, and Undecided/Replacement History) to provide a complete template and writing rules, including guidelines for links.




</details>

**답변**

`ws_collect("Decision")`로 확인한 본 대상 6개 중 고유 5개 파일(동일본 1건 제외)을 `read_file`로 전수 확인한 결과와 이를 바탕으로 도출한 결정 카드 표준 제안입니다.

---

### 1. 전수 조사 대상 (고유 5개 문서)

1. [Decision 01 — 검색은 로컬 색인으로 시작한다](vdoc:resource/file_7a92f1593b) (L1-21)
2. [Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_be75b165d0) (L1-21)
3. [Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849) (L1-21)
4. [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) / [D3_요금제는_사용량_기반으로_바꾼다](vdoc:resource/file_8db3356039) (L1-27, 동일본)
5. [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L1-27)

*(참조 비교: [D5 초안](vdoc:resource/file_b35187e082) (L1-11))*

---

### 2. 공통점 (확정본 공통 규칙)

- **Frontmatter 메타데이터 구조**:
  - `유형`: 전 문서 모두 `할일`로 지정.
  - `상태`: 기본적으로 `결정 사항` (대체 시 `대체됨`).
  - `요약`: 결정을 축약한 명제 1문장.
  - `작성일` (`YYYY-MM-DD`), `상위` (`[[상위 목표]]`), `담당` (`[[담당자]]`) 필드가 고정 포함됨.
- **제목 및 도입부**:
  - `# 🎯 Decision <번호> — <결정 요약 명제>` 포맷 유지.
- **필수 핵심 섹션**:
  - `## 1. 결정 내용 (What)`: 콜아웃 `> [!check]` 블록 내에 글머리 기호(`-`)로 명확한 결론 기술.
  - `## 2. 결정 사유 (Why)`: 번호 매기기 리스트(`1.`)로 실측 데이터, 보안 요구, 경쟁 상황 등 객관적 사유 명시.

---

### 3. 시기 및 폴더별 차이점

| 구분 | 초기 (25.01.06 ~ 25.01.13) | 후기 (25.01.20 이후) |
| :--- | :--- | :--- |
| **섹션 구성** | • `What` + `Why` 2개 섹션만 존재 (21줄) | • `## 3. 실행 가이드라인 (Boundary & Criteria)` 필수 추가 (27줄) |
| **실행 통제 요소** | 없음 (방향성 결정에 집중) | • **Do (집중 대상)**, **Don't (제외 대상)**, **DoD (완료 판단 기준)** 3요소 구체화 |
| **폴더 및 파일명** | `discussions/YY.MM.DD/decisions/`<br>`Decision <번호> — <제목>.md` 통일 | `discussions/` 외에 `archive/주간회의/A5.outputs/`에 `D3_...md` 형태의 파일명이 혼재 (내용은 동일본) |
| **대체(Deprecation) 이력 관리** | [25.01.13 Decision 01](vdoc:resource/file_969bb91849)에서 최초 확인:<br>• frontmatter `상태: 대체됨`<br>• `What` 콜아웃에 `⚠️ YYYY-MM-DD [[새 결정]] 로 대체됨` 인라인 위키링크 명시 | 후속 결정인 [Decision 03](vdoc:resource/file_75d5f55476)에서 좌석 기반 폐기 및 사용량 기반 전환 확정 |
| **초안과의 차이** | - | [D5 초안](vdoc:resource/file_b35187e082)은 `상태: 검토 중`, 상위/담당 누락, `> ⚠️ 아직 합의되지 않은 초안` 경고 및 안건 수준만 기술 |

---

### 4. 제안: 앞으로 쓸 결정 카드 표준 (Standard Template)

후기(01.20)에서 정립된 **실행 가이드라인(Do/Don't/DoD)**과 초기 대체 이력 표기 규칙을 통합한 표준 템플릿입니다.

```markdown
---
유형: 할일
상태: 결정 사항 # [결정 사항 | 검토 중 | 대체됨]
요약: <결정 핵심 명제 1문장>
작성일: YYYY-MM-DD
상위:
  - "[[상위 프로젝트 목표]]"
담당:
  - "[[담당자]]"
---

# 🎯 Decision <번호> — <결정 제목>

## 1. 결정 내용 (What)

> [!check]
> - <결정된 핵심 조치 사항 1~2문장>
> <!-- 만약 과거 결정을 대체한 경우: ⚠️ YYYY-MM-DD [[Decision XX — 과거 결정 제목]] 대체 -->

## 2. 결정 사유 (Why)

1. <정량적 실측 데이터, 보안/운영 요구사항, 또는 비교 분석 근거>

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: <이번 결정으로 직접 수행할 구체적 범위>
- **제외 대상 (Don't)**: <혼선을 방지하기 위해 의도적으로 배제할 범위>
- **완료 판단 기준 (DoD)**: <결정이 성공적으로 이행되었음을 검증할 관측 지표/산출물>

## 4. 후속 과제 및 보류 사항 (선택)

- <아직 정하지 않은 것, 다음 마일스톤 논의 안건>
```

**표준 작성 가이드:**
1. **파일명 규칙**: `Decision <2자리 번호> — <명제형 제목>.md`로 통일 (약어 `D<N>_` 지양).
2. **단일 원천 유지**: 산출물 폴더(`A5.outputs`)와 논의 폴더(`discussions`)에 중복 복사본을 만들기보다는 한 경로를 원본으로 삼고 상대 위키링크로 참조.
3. **실행 가이드라인 필수화**: 단순 의사결정 기록에 그치지 않고 범위 경계(Do/Don't)와 완료 기준(DoD)을 명시하여 실행 단계의 왜곡을 방지.

## S2-pricing-current — 대체 관계 추적 · 현재 유효성 판단
> 요금제에 대해 지금 유효한 결정이 뭐야? 근거와 함께 알려줘.

- ✅ 사용량 기반이 현재 결정: 있음
- ✅ 좌석 기반 v1 이 대체됐음을 언급: 있음
- ✅ Decision 03 읽음: 1/1
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_1f96d634_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_1f96d634_ws_grep` done {"pattern": "요금", "toolSummary": "Search pricing references"}
3. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
4. `read_file` done {"EndLine": 20, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A1.collection\\history\\1.
5. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D

**읽은 파일 (3)**: 1.1_요금_구조_재검토.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md

<details><summary>생각</summary>

Initial request defines the task: determine the currently valid decisions regarding pricing, along with their justifications. The approach will utilize tools for accessing and interpreting data.


Examining the file list, it appears that "Decision 01" regarding seat-based pricing has been superseded by "Decision 03," which now focuses on usage-based pricing. The latter is marked as a finalized decision.


Decision to shift to a usage-based pricing model, specifically charging per processed document page, supersedes the previous seat-based model. This change, confirmed on January 20, 2025, replaces the earlier decision from January 13, 2025.




</details>

**답변**

현재 요금제에 대해 유효한 결정은 2025년 1월 20일에 확정된 **[Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476)** (L1-27)입니다.

---

### 1. 결정 내용
* **사용량 기반 과금 전환**: 요금은 **처리한 문서 페이지 수 기준**으로 매기며, 기존의 좌석 기반 요금제는 폐기되었습니다.
* *(참고: 2025년 1월 13일에 수립되었던 [[Decision 01 — 요금제는 좌석 기반으로 간다 (v1)]](vdoc:resource/file_969bb91849) (L1-21)은 본 결정으로 인해 대체·폐기되었습니다.)*

### 2. 결정 사유 및 근거
* **법무팀 파일럿 결과**: 법무팀 파일럿 테스트 결과, 좌석 수보다 실제 **처리량 편차가 10배 이상** 큰 것으로 확인되었습니다.

### 3. 실행 가이드라인
* **집중 대상 (Do)**: 페이지 단위 과금 계측
* **제외 대상 (Don't)**: 좌석 단위 할인 정책
* **완료 판단 기준 (DoD)**: 2월 청구서가 사용량 기준으로 발행됨

## S3-onboarding-baseline — 링크 따라가기 (다른 폴더의 근거 메모)
> 온보딩 결정에서 말하는 실측 기준선 수치가 정확히 얼마야? 어디에 적혀 있는지도 알려줘.

- ✅ 기준선 47분: 있음
- ✅ 근거 메모 읽음: 1/1
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_937aa1c0_ws_grep` done {"pattern": "실측 기준선", "toolSummary": "Search for onboarding baseline"}
2. `read_file` done {"EndLine": 40, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
3. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A3.working memory\\근거_온보딩 

**읽은 파일 (2)**: 근거_온보딩 실측 기준선.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

Initial hypothesis: the requested "actual baseline figure" for the onboarding decision is documented within available resources. The `read_file` and `vibefs MCP` tools will be used to search for the data.


Found two files. One is a decision record about onboarding starting with three templates. The other is a working memory document likely containing evidence related to an onboarding baseline.


The target is to halve the average time to complete the first document, starting from a baseline of 47 minutes based on the onboarding data of 12 new customers. The observed times range from a minimum of 21 minutes to a maximum of 95 minutes for initial document completion. This target is referenced in the "Onboarding starts with 3 templates" decision card, explicitly aiming to reduce the initial document completion time significantly.




</details>

**답변**

온보딩 결정에서 참조하는 실측 기준선 수치는 **첫 문서 완성까지 평균 47분**(최솟값 21분 · 최댓값 95분, 신규 고객 12명 대상)입니다.

해당 수치와 결정 내용은 다음 문서들에 기록되어 있습니다:

- **실측 수치 원문**: [근거_온보딩 실측 기준선](vdoc:resource/file_c4dcd048c0) (L7-9)
  - 측정 대상: 신규 고객 12명 (n=12)
  - **기준선: 첫 문서 완성까지 평균 47분**
  - 범위: 최솟값 21분 · 최댓값 95분
- **온보딩 결정 문서**: [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L21, L27)
  - 위 기준선(평균 47분)을 바탕으로 첫 문서 완성 시간을 절반(23.5분 이하)으로 단축하는 것을 목표이자 완료 판단 기준(DoD)으로 삼고 있습니다.

## S4-retention-needle — 대용량 파일 속 바늘 · 미끼 회피
> 데이터 보존 기간은 최종적으로 며칠로 합의됐어? 어디에 기록돼 있는지도.

- ✅ 최종 합의 90일: 있음
- ✅ 30일을 최종으로 착각 안 함: 통과
- ✅ 2417번째 줄을 읽음 (L2410-2425)
- ✅ resource 링크 1개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_d1e28ea9_ws_grep` done {"pattern": "보존", "toolSummary": "Search for retention period"}
2. `mcp_vibefs_d1e28ea9_ws_grep` done {"pattern": "90일", "toolSummary": "Search for 90 days"}
3. `mcp_vibefs_d1e28ea9_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
4. `read_file` done {"EndLine": 2425, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\logs\\세션 기록_대용량.md", "StartLine": 2410}
5. `read_file` done {"EndLine": 305, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\logs\\세션 기록_대용량.md", "StartLine": 295}
6. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\logs\\세션 기록_대용량.md", "StartLine": 1}
7. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A1.collection\\history\\3.

**읽은 파일 (2)**: 3.1_데이터_보존_정책_초안.md, 세션 기록_대용량.md

<details><summary>생각</summary>

Initial search for "데이터 보존" or "보존 기간" or "보존" terms is needed to determine the agreed-upon data retention period and its location. Further investigation required to pinpoint the exact days agreed upon in the relevant documents.


Initial assessment focuses on determining the data retention period. Observed that an initial review considered 30 days, but no conclusion was reached. Subsequently, a consensus for a 90-day retention period was recorded.




</details>

**답변**

데이터 보존 기간은 최종적으로 **90일**로 합의되었습니다.

### 기록 위치 및 세부 내용
* **최종 합의 내용**: [세션 기록 (대용량)](vdoc:resource/file_4371d87a60) (L2417)
  > `17:48 **합의: 데이터 보존 기간은 90일로 한다** (법무팀 요청 반영, 이견 없음)`
* **이전 논의 과정**: [세션 기록 (대용량)](vdoc:resource/file_4371d87a60) (L300)
  > `15:02 데이터 보존 기간 30일 안을 검토했다 (결론 없음, 다음 회의로 넘김)`

## S5-not-found — 없는 것을 없다고 말하기 · 지어내지 않기
> 결정 카드 중에 '가격 할인 정책'을 정한 결정이 있어?

- ✅ 없다고 답함: 있음
- ✅ D03 의 '좌석 단위 할인 정책' 제외 항목을 짚음 (가점): 있음
- ✅ resource 링크 3개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_03275959_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_03275959_ws_grep` done {"pattern": "할인", "toolSummary": "Grep for discount keyword"}
3. `mcp_vibefs_03275959_ws_grep` done {"pattern": "가격", "toolSummary": "Grep for price keyword"}
4. `read_file` done {"EndLine": 27, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
5. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
6. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
7. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
8. `read_file` done {"EndLine": 27, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
9. `read_file` done {"EndLine": 15, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도

**읽은 파일 (6)**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


The provided decision cards outline several key strategies. The focus appears to be on shifting the pricing model to usage-based billing, starting local indexing for search, targeting the legal team as the initial customer, and transitioning to a seat-based pricing model. The evolving decisions suggest an iterative approach to product strategy and pricing.


Investigating other decision records to gain context. Reviewed "Decision 01," indicating local indexing for search, and "Decision 02," focusing the initial customer to the legal team. Also examined "Decision 04" regarding onboarding templates and a draft decision to postpone introducing an external search API.


Reviewed all six decision cards (five unique) and their drafts.

Summary: No separate decision card specifically defines a 'price discount policy'. However, a decision card related to pricing plans exists: [Decision 03 — Pricing Plans Shift to Usage-Based](vdoc:resource/file_75d5f55476) (L23-27, Japanese version: [D3_요금제는_사용량_기반으로_바꾼다](vdoc:resource/file_8db3356039)).




</details>

**답변**

결정 카드 중 '가격 할인 정책'을 별도로 도입하거나 확정한 결정은 **없습니다.**

다만, 요금제 관련 결정 카드에 할인 정책과 관련된 언급이 한 건 존재합니다:

- [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L23-27, 동일본: [D3_요금제는_사용량_기반으로_바꾼다](vdoc:resource/file_8db3356039) L23-27)
  - 실행 가이드라인(Boundary & Criteria)의 **제외 대상 (Don't)** 항목으로 **"좌석 단위 할인 정책"**이 명시되어 있습니다.
  - 즉, 할인 정책을 정한 것이 아니라 요금제를 사용량 기반으로 전환하면서 기존의 좌석 단위 할인 정책을 고려 대상에서 제외했습니다.

그 외의 결정 카드([Decision 01](vdoc:resource/file_969bb91849) 등)에도 가격 할인 정책을 수립한 내용은 없습니다.

## S6-plan-vs-result — 계획 수치와 실측 수치 구분 · 두 근거를 엮은 계산
> 온보딩 기준선은 몇 명을 실제로 측정한 결과야? 그리고 온보딩 결정이 달성해야 하는 목표 시간은 몇 분 이하야?

- ✅ 실측 인원 12명: 있음
- ✅ 계획 인원 10명을 실측으로 착각 안 함: 통과
- ✅ 목표 = 47분의 절반(23.5분): 있음
- ✅ 근거 메모 읽음: 1/1
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_cf06e749_ws_glob` done {"pattern": "*온보딩*", "toolSummary": "Find onboarding related files"}
2. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A3.working memory\\근거_온보딩 실측 기준선.md"}
3. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\Decision 04 — 온보
4. `mcp_vibefs_cf06e749_ws_grep` done {"pattern": "첫 문서 완성", "toolSummary": "Search first document completion"}
5. `mcp_vibefs_cf06e749_ws_grep` done {"pattern": "온보딩 흐름 개선", "toolSummary": "Search onboarding improvement"}
6. `mcp_vibefs_cf06e749_ws_glob` done {"pattern": "*D*온보딩*", "toolSummary": "Find onboarding decision cards"}
7. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\new todo\\value_온보딩 실측 계획.m
8. `mcp_vibefs_cf06e749_ws_grep` done {"pattern": "23.5", "toolSummary": "Search 23.5"}
9. `mcp_vibefs_cf06e749_ws_grep` done {"pattern": "23분", "toolSummary": "Search 23 minutes"}
10. `mcp_vibefs_cf06e749_ws_grep` done {"pattern": "24분", "toolSummary": "Search 24 minutes"}
11. `mcp_vibefs_cf06e749_ws_grep` done {"pattern": "목표다", "toolSummary": "Search goal phrase"}

**읽은 파일 (3)**: 근거_온보딩 실측 기준선.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, value_온보딩 실측 계획.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


Attempting to read the specified files to extract relevant information. The first file's content appears related to onboarding metrics. The second file likely contains decisions related to the onboarding process, specifically focusing on template usage.


Observed the onboarding baseline from the weekly meeting: 12 new customers averaged 47 minutes to complete the first document, with a range of 21 to 95 minutes. Considering the decision to start onboarding with three templates, this baseline will be a crucial benchmark.


The onboarding baseline is derived from actual measurements of twelve new customers, showing an average of 47 minutes to complete the first document, with a range from 21 to 95 minutes. This baseline is critical for evaluating the onboarding process and determining target performance.




</details>

**답변**

온보딩 실측 기준선 및 목표 시간에 대한 확인 결과입니다.

1. **실제 측정 대상 인원**: **12명** (`n=12`)
   - [근거_온보딩 실측 기준선](vdoc:resource/file_c4dcd048c0) (L7-8)에 따르면, 신규 고객 12명을 대상으로 측정한 결과이며 첫 문서 완성까지의 기준선은 **평균 47분**(최솟값 21분 · 최댓값 95분)으로 기록되어 있습니다.

2. **온보딩 결정이 달성해야 하는 목표 시간**: **23.5분 이하** (기준선의 절반 이하)
   - [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L21, L27)에 따르면, 결정 사유 및 완료 판단 기준(DoD)으로 **"실측 기준선보다 첫 문서 완성 시간을 절반으로 줄이는 것(기준선의 절반 이하)"**을 명시하고 있어, 기준선(47분)의 절반인 **23.5분 이하**가 목표 시간입니다.

## S7-conventions — 볼트 관례 이해 (구조 파악 → 규칙 추론)
> 이 볼트에서 새 결정을 기록하려면 어느 폴더에 어떤 이름과 형식으로 둬야 해? 볼트의 실제 관례를 근거로 말해줘.

- ✅ 날짜별 decisions 폴더: 있음
- ✅ 'Decision 번호 — 결정 문장' 이름 규칙: 있음
- ✅ 최신 형식(실행 가이드라인 포함): 있음
- ✅ 회의 폴더(A5.outputs)의 D#_ 사본 관례 (가점): 있음
- ✅ resource 링크 8개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_4020d8cf_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_4020d8cf_ws_collect` done {"query": "템플릿", "toolSummary": "Collect templates"}
3. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A1.collection\\history\\2.
4. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A4.meta\\templates\\decisi
5. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
6. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
7. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
8. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A5.outputs\\D3_요금제는_사용량_기반
9. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도
10. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
11. `mcp_vibefs_4020d8cf_ws_tree` done {"depth": 3, "path": "discussions", "toolSummary": "Tree of discussions"}
12. `mcp_vibefs_4020d8cf_ws_tree` done {"depth": 3, "path": "archive", "toolSummary": "Tree of archive"}
13. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A4.meta\\SKILL.md", "Start
14. `mcp_vibefs_4020d8cf_ws_tree` done {"depth": 2, "path": "archive/2025.01.20 주간회의/A4.meta/examples", "toolSummary": "List examples folder"}
15. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A4.meta\\examples\\sample_

**읽은 파일 (10)**: decision_card_template.md, 2.2_결정_기록_방식_정리.md, SKILL.md, sample_decision_output.md, D3_요금제는_사용량_기반으로_바꾼다.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

리소스=사실, 산출=답변: 새 결정을 볼트에 기록할 때, 볼트 내의 실제 관례를 따라야 한다. 먼저 관련 폴더와 파일 명명 규칙을 찾아야 한다. 이 관례를 알아내기 위해 볼트의 내용을 조사하여, 기존 의사 결정이 어떻게 저장되고 관리되는지 확인해야 한다.


Inspecting the template file `decision_card_template.md`. Examining several actual decision card files to understand the template's usage: `Decision 01 — 검색은 로컬 색인으로 시작한다.md`, `Decision 02 — 첫 고객은 법무팀으로 좁힌다.md`, and `Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md`.


Initial assumption: User is seeking the standard file location, naming convention, and format for recording a new decision within the vault, based on established practices. Understanding the lifecycle stages is key: draft/record.

Analysis focuses on determining the correct folder path, filename, and format, drawing from the provided example and the identified lifecycle stage. The goal is to accurately represent the established vault convention.


The established convention involves a `projects/alpha/discussions/<YY.MM.DD>/decisions/` path. Files within this path follow a "Decision XX — <decision summary>.md" naming structure, reflecting finalized decisions. The referenced `archive/` directory appears to house draft versions or meeting outputs that are then formalized as decisions.


The file naming convention distinguishes between "official decisions" within the `discussions` directory, using a numbered format with an em-dash and a concise summary, and "archive outputs" employing an underscore-connected format. Versioning is noted in the file names when decisions are modified. The document format relies on a YAML frontmatter, providing metadata fields such as status and a short summary, followed by a Markdown-formatted body.




</details>

**답변**

볼트의 실제 파일들과 템플릿을 분석한 결과, 결정 카드를 기록하는 관례는 다음과 같습니다.

---

### 1. 저장 폴더 경로

새 결정 문서는 성격과 수명 주기에 따라 두 곳에 기록됩니다.

1. **프로젝트 정식 결정 카드 (권장/최종 보관소)**
   - **경로**: `discussions/<YY.MM.DD>/decisions/` (실제 경로: `projects/alpha/discussions/<YY.MM.DD>/decisions/`)
   - **설명**: 프로젝트 멤버들이 공유하고 추적하는 공식 결정 사항들이 모이는 곳입니다.
   - **근거 파일**:
     - [Decision 01 — 검색은 로컬 색인으로 시작한다.md](vdoc:resource/file_7a92f1593b) (L1-21)
     - [Decision 03 — 요금제는 사용량 기반으로 바꾼다.md](vdoc:resource/file_75d5f55476) (L1-27)
     - [Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md](vdoc:resource/file_4926aa33c3) (L1-27)

2. **주간 회의 산출물 / 초안 (회의 세션 기준)**
   - **경로**: `archive/<YYYY.MM.DD> 주간회의/A5.outputs/`
   - **설명**: 주간 회의 진행 중 속기에서 추출한 결정 카드 및 검토 중인 초안이 저장됩니다. [SKILL.md](vdoc:resource/file_66cf012746) (L4)에 *"회의 속기에서 결정을 골라 decision_card_template 으로 쓴다"*라고 명시되어 있습니다. 확정된 카드는 동일한 내용으로 `discussions/` 폴더에도 배치됩니다.
   - **근거 파일**:
     - [D3_요금제는_사용량_기반으로_바꾼다.md](vdoc:resource/file_8db3356039) (L1-27)
     - [D5_외부_검색_API_도입은_보류한다_초안.md](vdoc:resource/file_b35187e082) (L1-11)

---

### 2. 파일 명명 규칙 (Naming Convention)

* **정식 결정 카드**: `Decision <두 자리 번호> — <결정 한 문장 요약>.md`
  * 예: `Decision 01 — 검색은 로컬 색인으로 시작한다.md`, `Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md`
  * 번호는 2자리 숫자(`01`, `02`, `03`…), 구분자는 전각 대시(` — `)를 사용합니다.
  * 이전 결정이 변경되어 대체된 구 버전 파일의 경우 `(v1)`과 같은 접미사를 붙입니다 (예: [Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md](vdoc:resource/file_969bb91849) (L1-21)).
* **회의 산출물(archive)**: `D<번호>_<내용_언더스코어_연결>.md` (초안은 `_초안` 접미사)
  * 예: `D3_요금제는_사용량_기반으로_바꾼다.md`, `D5_외부_검색_API_도입은_보류한다_초안.md`

---

### 3. 문서 형식 (Frontmatter & Template)

문서의 기본 골격은 [decision_card_template.md](vdoc:resource/file_d1b21adce6) (L1-9)을 따르며, 실제 작성된 결정 카드들의 구조는 다음과 같습니다:

```markdown
---
유형: 할일
상태: 결정 사항
요약: <결정 한 문장 요약>
작성일: YYYY-MM-DD
상위:
  - "[[알파 프로젝트 목표]]"
담당:
  - "[[담당자 이름]]"
---

# 🎯 Decision <번호> — <결정 한 문장>

## 1. 결정 내용 (What)

> [!check]
> - <핵심 결정 사항 명시>

## 2. 결정 사유 (Why)

1. <결정 사유 및 근거>

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: <집중할 작업>
- **제외 대상 (Don't)**: <제외할 작업>
- **완료 판단 기준 (DoD)**: <DoD 명시>

## 4. 아직 안 정한 것
```

#### 작성 시 유의점:
- **상태 관리**: 상태 필드는 확정 시 `결정 사항`, 논의 중일 때는 `검토 중`, 후속 결정으로 폐기/대체된 경우 `대체됨`으로 기록합니다.
- **콜아웃 블록**: `## 1. 결정 내용 (What)` 아래에 `> [!check]` 콜아웃을 두어 명확한 선언을 적는 관례가 있습니다.
- **가이드라인 3종 세트**: `## 3. 실행 가이드라인`에는 `**집중 대상 (Do)**`, `**제외 대상 (Don't)**`, `**완료 판단 기준 (DoD)**` 항목을 명시합니다 ([Decision 03](vdoc:resource/file_75d5f55476) L23-27).

## S8-multi-turn — 이어지는 질문 · 앞 턴 맥락 위에서 재작업
> Decision들 정리해줘 → 그중에 지금 유효하지 않은 건 빼고, 각 결정이 언제 내려졌는지 표로 다시 줘

- ❌ 대체된 v1(좌석 기반)을 유효 목록에 넣지 않음: 조건 없이 언급
- ✅ 예시 카드 제외: 통과
- ✅ 초안 D5 제외: 통과
- ✅ 결정 날짜(1/6) 표기: 있음
- ✅ 결정 날짜(1/20) 표기: 있음
- ✅ resource 링크 6개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_64d26c31_ws_collect` done {"query": "Decision", "toolSummary": "Collect Decision cards"}
2. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A5.outputs\\D3_요금제는_사용량_기반
3. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
4. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
5. `read_file` done {"EndLine": 25, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
6. `read_file` done {"EndLine": 30, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
7. `read_file` done {"EndLine": 15, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도
8. `read_file` done {"EndLine": 20, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A1.collection/history/2.2_

**읽은 파일 (7)**: 2.2_결정_기록_방식_정리.md, D3_요금제는_사용량_기반으로_바꾼다.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

Understood the user's request; the goal is to summarize a set of decisions. The source material will be processed decisions obtained from `ws_collect` and `read_file`. Analysis will focus on identifying commonalities, differences (particularly temporal and folder-based variations), without generalizing from incomplete information.


Found duplicate files. The first file,  `archive/2025.01.20 주간회의/A5.outputs/D3_요금제는_사용량_기반으로_바꾼다.md`, appears to be identical to `discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md`.  The second file, `discussions/25.01.06/decisions/Decision 01 — 검색은 로컬 색인으로 시작한다.md`, is unique.


Identified three additional unique files: "Decision 02 — 첫 고객은 법무팀으로 좁힌다.md", "Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md", and "Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md". These were found in the "discussions" directory and are distinct from the previously identified duplicates. The absolute paths of all five files have been verified.


The initial plan is to examine five drafts, focusing on two specific files: one discussing the deferral of an external search API, and another detailing the decision-recording method. The next step involves reading the content of selected files and identify their similarities and differences.


I'm thinking through how to approach this.


Initial focus is on identifying key decisions and their context. The analysis requires understanding the progression of decisions, specifically regarding pricing models and initial customer targets. Decision 01 focused on local search indexing due to security needs, while the pricing model evolved from seat-based to usage-based between Decisions 01 and 03.


Decision 02 narrows the initial customer to the internal legal team to facilitate performance measurement through standardized document formats. Decision 01, initially proposing a seat-based pricing model, was superseded by Decision 03.

The pricing model shifted to usage-based billing, specifically per processed document page, due to significant processing volume variance observed in the legal team pilot compared to seat count. Decision 04 outlines the onboarding strategy with three initial document templates (contracts, opinions, internal memos) based on an empirical baseline.


Focusing on identifying the evolution of decision-making documentation. Initial formats were concise, focusing on the decision and rationale only. Later iterations saw expanded content with structured execution guidelines (Do, Don't, DoD).

The format evolved from weekly numbered decisions to a consolidated project-wide numbering system. Documentation storage also evolved, moving from discussions to a dedicated archive for weekly meeting outputs.


Decision 01 (2025-01-06): Verified as valid and included. The source is vdoc.
Decision 02 (2025-01-07): Also valid and included. Its source is the same vdoc.
Decision 03 (2025-01-08): Remains valid, and vdoc is the source.
Decision 04 (2025-01-09): Valid and documented from vdoc.
Decision 05 (20

</details>

**답변**

현재 유효하지 않은 결정([Decision 01 (v1) — 요금제는 좌석 기반으로 간다](vdoc:resource/file_969bb91849), `대체됨`)과 미확정 초안을 제외하고, **현재 유효한 결정 사항**만 결정 일자순으로 정리한 표입니다.

| 결정 번호 | 결정 일자 | 상태 | 결정 내용 (What) | 출처 링크 |
| :--- | :--- | :--- | :--- | :--- |
| **Decision 01** | 2025-01-06 | 결정 사항 | 첫 버전 검색은 외부 서비스 대신 로컬 색인(BM25)으로 구축 | [Decision 01](vdoc:resource/file_7a92f1593b) (L1-21) |
| **Decision 02** | 2025-01-06 | 결정 사항 | 첫 파일럿 고객군은 사내 법무팀 한 곳으로 한정 | [Decision 02](vdoc:resource/file_be75b165d0) (L1-21) |
| **Decision 03** | 2025-01-20 | 결정 사항 | 요금제를 좌석 기반에서 처리 문서 페이지 수(사용량) 기반으로 변경 | [Decision 03](vdoc:resource/file_75d5f55476) / [D3](vdoc:resource/file_8db3356039) (L1-27) |
| **Decision 04** | 2025-01-20 | 결정 사항 | 신규 고객 온보딩은 템플릿 3종(계약서·의견서·내부 메모)으로 시작 | [Decision 04](vdoc:resource/file_4926aa33c3) (L1-27) |

> [!NOTE]
> **제외 항목 안내**: 
> 2025-01-13에 수립되었던 `Decision 01 (v1)`(좌석 기반 요금제)은 2025-01-20에 **Decision 03**으로 완전히 대체되어 현재 유효하지 않으므로 제외되었습니다.
