# 하네스 평가 — hard-baseline

통과 5/5

| 시나리오 | 통과 | 점수 | 시간 | 입력/캐시/출력 토큰 | vibefs | read_file | 차단 |
|---|---|---|---|---|---|---|---|
| S1-decision-standard | ✅ | 7/7 | 95.9s | 54,602/295,086/6,483 | 4 | 9 | 0 |
| S5-not-found | ✅ | 3/3 | 38.3s | 37,045/121,851/2,029 | 4 | 2 | 0 |
| S6-plan-vs-result | ✅ | 5/5 | 35.8s | 31,594/78,278/2,473 | 2 | 4 | 0 |
| S7-conventions | ✅ | 5/5 | 158.1s | 69,262/444,990/6,328 | 9 | 10 | 0 |
| S8-multi-turn | ✅ | 6/6 | 69.6s | 39,235/164,462/6,497 | 6 | 6 | 0 |

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

1. `mcp_vibefs_61557a66_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_61557a66_ws_glob` done {"pattern": "*decision*", "toolSummary": "Glob decision files"}
3. `mcp_vibefs_61557a66_ws_glob` done {"pattern": "discussions/**", "toolSummary": "Glob discussions"}
4. `mcp_vibefs_61557a66_ws_glob` done {"pattern": "archive/**/A5.outputs/*", "toolSummary": "Glob outputs"}
5. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
6. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
7. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
8. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
9. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
10. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도
11. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A4.meta\\templates\\decisi
12. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A4.meta\\examples\\sample_
13. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A1.collection/history\\2.2

**읽은 파일 (9)**: 2.2_결정_기록_방식_정리.md, decision_card_template.md, sample_decision_output.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


Initial analysis of the provided decisions focuses on identifying common formats and variations in their structure and content. The goal is to distill these insights into a standardized template for future decision cards.


Decision 03 and the document at the specified path appear to be identical, confirmed by ws_collect.

Now, analyzing the information: the first document under examination is "Decision 01 — Search starts with a local index."


Initial hypothesis: documents follow a consistent structure suitable for automated analysis, specifically decisions have a defined frontmatter format. Further, the existence of templates and examples supports this. The goal is to determine the format of these "decisions".

Decision documents are consistently structured, utilizing frontmatter with keys like `유형`, `상태`, `요약`, `작성일`, `상위`, and `담당`. The `상태` field includes states such as "결정 사항" or "대체됨." These fields will be useful for extracting structured decision information. A draft also exists, which contains a similar format.


The analysis reveals key patterns in the document structure. Specifically, files named "Decision <number> — <decision sentence>.md" consistently have a corresponding H1 tag "# 🎯 Decision <number> — <decision sentence>". This format is found in discussions, and templates. An exception exists for draft documents, which have slightly varied H1 formatting. Furthermore, common sections include "결정 내용" using check callouts (with replacement warnings when applicable), and "결정 사유" using numbered lists, with later decisions adding "실행 가이드라인" sections.




</details>

**답변**

읽은 대상: 9개
1. [Decision 01 — 검색은 로컬 색인으로 시작한다](vdoc:resource/file_7a92f1593b) (L1-21)
2. [Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_be75b165d0) (L1-21)
3. [Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849) (L1-21)
4. [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L1-27)
5. [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L1-27)
6. [D5_외부_검색_API_도입은_보류한다_초안](vdoc:resource/file_b35187e082) (L1-11)
7. [decision_card_template](vdoc:resource/file_d1b21adce6) (L1-9)
8. [sample_decision_output](vdoc:resource/file_04a351c024) (L1-9)
9. `archive/2025.01.06 주간회의/A1.collection/history/2.2_결정_기록_방식_정리.md` (L1-15)

---

### 1. 기존 Decision 문서 분석 (공통점 및 차이점)

#### 1) 공통 형식
- **Frontmatter 메타데이터**:
  - [Decision 01](vdoc:resource/file_7a92f1593b) (L1-10)부터 [Decision 04](vdoc:resource/file_4926aa33c3) (L1-10)까지 공통적으로 `유형: 할일`, `상태`, `요약`, `작성일`, `상위` (`[[알파 프로젝트 목표]]`), `담당` (`[[민지]]`) 구조를 유지하고 있습니다.
- **제목 및 핵심 서술 구조**:
  - H1 제목은 `# 🎯 Decision <번호> — <결정 문장>` 형식을 따릅니다.
  - `## 1. 결정 내용 (What)`은 `> [!check]` 콜아웃 내에 핵심 결정 사항을 간결한 글머리 기호로 명시합니다.
  - `## 2. 결정 사유 (Why)`는 번호 매기기 리스트(`1. ...`)로 명확한 근거와 배경을 기록하며, 필요 시 근거 문서([근거_온보딩 실측 기준선](vdoc:resource/file_4926aa33c3) L21)를 링크합니다.

#### 2) 버전별 차이점 및 개선 흐름
- **실행 가이드라인의 유무 (진화 과정)**:
  - **초기 문서**([Decision 01(25.01.06)](vdoc:resource/file_7a92f1593b), [Decision 02](vdoc:resource/file_be75b165d0), [Decision 01(v1)](vdoc:resource/file_969bb91849)): `What`과 `Why` 2개 섹션(21줄)만 존재하여 실제 구현 범위와 완료 기준이 모호했습니다.
  - **후기 문서**([Decision 03](vdoc:resource/file_75d5f55476) L23-27, [Decision 04](vdoc:resource/file_4926aa33c3) L23-27): `## 3. 실행 가이드라인 (Boundary & Criteria)` 섹션이 추가되어 **집중 대상 (Do)**, **제외 대상 (Don't)**, **완료 판단 기준 (DoD)**이 구체화되었습니다.
- **상태 전이 및 대체 이력 추적**:
  - 정책이 변경된 [Decision 01(v1)](vdoc:resource/file_969bb91849)의 경우 `상태: 대체됨`으로 변경되고, 내용 블록 안에 `⚠️ YYYY-MM-DD [[대체 결정 문서]] 로 대체됨` 경고가 삽입되어 의사결정의 변경 이력을 보존합니다.
  - 아직 확정되지 않은 [D5 초안](vdoc:resource/file_b35187e082)은 `상태: 검토 중`, 파일명과 제목에 `(초안)` 접미사를 사용했으나 상위/담당/작성일 등 메타데이터가 누락되는 파편화가 발생했습니다.
- **템플릿과의 괴리**:
  - 기존 [decision_card_template](vdoc:resource/file_d1b21adce6) (L1-9)에는 `## 4. 아직 안 정한 것` 섹션이 정의되어 있었으나 실제 결정 카드들에서는 활용되지 않았고, 필수 Frontmatter 속성이나 Do/Don't/DoD 세부 서식이 누락되어 있었습니다.

---

### 2. 향후 결정 카드(Decision Card) 표준 제안

실제 운영 과정에서 안착된 장점(Do/Don't/DoD, 상태 관리, 콜아웃 강조)을 통합하여 일관된 템플릿 표준을 제안합니다.

```markdown
---
유형: 할일
상태: 결정 사항 # [검토 중 | 결정 사항 | 대체됨 | 폐기]
요약: <결정 사항 한 문장 요약>
작성일: YYYY-MM-DD
상위:
  - "[[상위 목표 또는 프로젝트명]]"
담당:
  - "[[담당자 이름]]"
대체문서: "" # 상태가 '대체됨'일 경우 "[[대체된 Decision 문서]]" 링크
---

# 🎯 Decision <번호> — <결정 한 문장>

## 1. 결정 내용 (What)

> [!check]
> - <핵심 결정 사항을 명확하고 단언적인 문장으로 기술>
> <!-- 대체/폐기 시 아래 경고 콜아웃 추가 -->
> <!-- > ⚠️ YYYY-MM-DD [[Decision XX — ...]] 로 대체됨 -->

## 2. 결정 사유 (Why)

1. <결정 배경, 문제점, 데이터/실측 근거([[근거 문서 링크]]) 제시>
2. <선택한 대안의 기대 효과>

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: <이번 결정으로 즉시 착수/집중할 작업 범위>
- **제외 대상 (Don't)**: <의도적으로 배제하거나 다음 단계로 미룰 작업>
- **완료 판단 기준 (DoD)**: <결정이 성공적으로 이행되었음을 검증하는 객관적 측정 지표>

## 4. 미결 과제 및 의존성 (Open Questions)

- <추후 추가 합의가 필요하거나 후속 회의에서 다룰 안건이 있을 경우 기술 (없으면 생략 가능)>
```

#### 작성 및 운영 가이드
1. **파일명 규칙**: `discussions/YY.MM.DD/decisions/Decision <두자리번호> — <결정문장>.md` 형식 통일 (초안 단계에서는 안건 폴더에 위치하거나 파일명 말머리에 `(초안)` 표기).
2. **라이프사이클 규칙**:
   - 논의 중: `상태: 검토 중`
   - 의결 완료: `상태: 결정 사항`
   - 정책 변경으로 교체: 기존 카드를 삭제하지 않고 `상태: 대체됨` + 콜아웃 링크로 추적성 보존.
3. **실행 경계 필수화**: 2025.01.20 회의에서 정착된 `Do / Don't / DoD` 형식을 필수로 작성하여 의사결정이 실행과 측정으로 바로 연결되도록 합니다.

## S5-not-found — 없는 것을 없다고 말하기 · 지어내지 않기
> 결정 카드 중에 '가격 할인 정책'을 정한 결정이 있어?

- ✅ 없다고 답함: 있음
- ✅ D03 의 '좌석 단위 할인 정책' 제외 항목을 짚음 (가점): 있음
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_819b7f30_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_819b7f30_ws_grep` done {"pattern": "할인", "toolSummary": "Search for discount"}
3. `mcp_vibefs_819b7f30_ws_grep` done {"pattern": "가격", "toolSummary": "Search for price"}
4. `mcp_vibefs_819b7f30_ws_grep` done {"pattern": "요금", "toolSummary": "Search for fee/plan"}
5. `read_file` done {"EndLine": 27, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
6. `read_file` done {"EndLine": 21, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D

**읽은 파일 (2)**: Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


Decision card review confirms that local indexing is the initial search strategy, the first customer focus is the legal team, and onboarding begins with three templates. Also, external search API integration is postponed based on an earlier draft.




</details>

**답변**

읽은 대상: 2개
- [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L1-27)
- [Decision 01 — 요금제는 좌석 기반으로 간다 (v1)](vdoc:resource/file_969bb91849) (L1-21)

---

**'가격 할인 정책'을 별도로 정한 결정 카드는 없습니다.**

다만, [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L23-26) 문서의 **3. 실행 가이드라인 (Boundary & Criteria)** 항목에 관련 내용이 언급되어 있습니다:

- **제외 대상 (Don't)**: 좌석 단위 할인 정책

즉, 요금제를 사용량(문서 페이지 수) 기반으로 전환하면서 기존의 **'좌석 단위 할인 정책'은 제외 대상(Don't)**으로 지정되었으며, 별도의 가격 할인 정책을 수립한 결정은 존재하지 않습니다.

## S6-plan-vs-result — 계획 수치와 실측 수치 구분 · 두 근거를 엮은 계산
> 온보딩 기준선은 몇 명을 실제로 측정한 결과야? 그리고 온보딩 결정이 달성해야 하는 목표 시간은 몇 분 이하야?

- ✅ 실측 인원 12명: 있음
- ✅ 계획 인원 10명을 실측으로 착각 안 함: 통과
- ✅ 목표 = 47분의 절반(23.5분): 있음
- ✅ 근거 메모 읽음: 1/1
- ✅ resource 링크 2개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_91c167e5_ws_glob` done {"pattern": "*온보딩*", "toolSummary": "Find onboarding files"}
2. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A3.working memory\\근거_온보딩 
3. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
4. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A1.collection\\history\\1.
5. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\new todo\\va
6. `mcp_vibefs_91c167e5_ws_grep` done {"pattern": "절반", "toolSummary": "Search for half in vault"}

**읽은 파일 (4)**: 1.2_온보딩_흐름_개선.md, 근거_온보딩 실측 기준선.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, value_온보딩 실측 계획.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


The files related to the onboarding process are located. The first file, "근거_온보딩 실측 기준선.md," contains foundational onboarding metrics. The second file, "Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md," details the decision to initiate onboarding with three templates. Now, the contents of these files will be retrieved.


The initial baseline measurement indicates new clients complete their first document in an average of 47 minutes, with a range from 21 to 95 minutes, based on a sample of 12 clients. Onboarding will initially utilize three templates.


I'm thinking through how to approach this.




</details>

**답변**

읽은 대상: 4개 (`archive/2025.01.20 주간회의/A3.working memory/근거_온보딩 실측 기준선.md`, `discussions/25.01.20/decisions/Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md`, `archive/2025.01.20 주간회의/A1.collection/history/1.2_온보딩_흐름_개선.md`, `discussions/25.01.20/new todo/value_온보딩 실측 계획.md`)

---

### 1. 온보딩 실측 대상 인원
- **측정 대상**: 신규 고객 **12명 (n=12)**
- **실측 기준선**: 첫 문서 완성까지 평균 **47분** (최솟값 21분 · 최댓값 95분)
- 근거: [온보딩 실측 기준선](vdoc:resource/file_c4dcd048c0) (L7-9)

### 2. 온보딩 결정의 목표 시간
- **완료 판단 기준 (DoD)**: 첫 문서 완성 시간을 실측 기준선(평균 47분)의 **절반 이하**로 단축하는 것
- **목표 시간**: **23.5분 이하**
- 근거: [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L21, L27)

## S7-conventions — 볼트 관례 이해 (구조 파악 → 규칙 추론)
> 이 볼트에서 새 결정을 기록하려면 어느 폴더에 어떤 이름과 형식으로 둬야 해? 볼트의 실제 관례를 근거로 말해줘.

- ✅ 날짜별 decisions 폴더: 있음
- ✅ 'Decision 번호 — 결정 문장' 이름 규칙: 있음
- ✅ 최신 형식(실행 가이드라인 포함): 있음
- ✅ 회의 폴더(A5.outputs)의 D#_ 사본 관례 (가점): 있음
- ✅ resource 링크 10개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_e2f369b0_ws_glob` done {"pattern": "*결정*", "toolSummary": "Find decision files"}
2. `mcp_vibefs_e2f369b0_ws_tree` done {"depth": 3, "path": "discussions", "toolSummary": "Check tree of discussions"}
3. `mcp_vibefs_e2f369b0_ws_duplicates` done {"toolSummary": "Check duplicates"}
4. `mcp_vibefs_e2f369b0_ws_collect` done {"query": "*decision*", "toolSummary": "Collect decision templates and files"}
5. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A1.collection\\history\\2.2_결정_기록_방식_정리.m
6. `mcp_vibefs_e2f369b0_ws_diff` done {"a": "archive/2025.01.06 주간회의/A1.collection/history/2.2_결정_기록_방식_정리.md", "b": "archive/2025.01.27 주간회의/A1.collection/history/2.2_결정_기록_방식_정리.md", "toolSummary"
7. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A4.meta\\templates\\decision_card_templat
8. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.20 주간회의\\A4.meta\\examples\\sample_decision_output
9. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\Decision 01 — 검색
10. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\Decision 03 — 요금
11. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\Decision 04 — 온보
12. `mcp_vibefs_e2f369b0_ws_glob` done {"pattern": "**/A5.outputs/*", "toolSummary": "Check outputs folder in archive"}
13. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도입은_보류한다_초안.md"}
14. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\Decision 02 — 첫 
15. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\Decision 01 — 요금
16. `read_file` done {"Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.06 주간회의\\A4.meta\\SKILL.md"}
17. `mcp_vibefs_e2f369b0_ws_glob` done {"pattern": "*template*", "toolSummary": "Get resourceId of templates"}
18. `mcp_vibefs_e2f369b0_ws_glob` done {"pattern": "*SKILL*", "toolSummary": "Get resourceId of SKILL.md"}
19. `mcp_vibefs_e2f369b0_ws_glob` done {"pattern": "*sample_decision*", "toolSummary": "Get resourceId of sample decision"}

**읽은 파일 (10)**: 2.2_결정_기록_방식_정리.md, SKILL.md, decision_card_template.md, sample_decision_output.md, D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


The plan is to read the files listed using the `read_file` functionality. The file paths have been identified and organized for sequential access. These files likely contain the primary source material required for understanding the current context.


Reviewing the decision cards in the discussions. Initial decisions include starting search with a local index, switching to usage-based pricing, beginning onboarding with three templates, and using seat-based pricing for the initial version of the pricing model.


I'm thinking through how to approach this.


The task requires extracting specific resource IDs from provided file paths. Identified resource IDs associated with decision files include `file_7a92f1593b`, `file_be75b165d0`, `file_969bb91849`, `file_75d5f55476`, `file_4926aa33c3`, and `file_b35187e082`. Further investigation is needed to verify the `resourceId` for the `decision_card_template.md` file.


Initial understanding of the problem space has been achieved by examining the provided files. The files cover decision recording methods, decision card templates, example decision outputs, and relevant skills. This should provide sufficient background to begin the task.


The established pattern for recording decisions is within the `discussions/<YY.MM.DD>/decisions/` directory, reflecting the date of the discussion. Weekly meeting outputs are archived under `archive/<YYYY.MM.DD 주간회의>/A5.outputs/`, linking to the discussions. The file naming convention follows the format `Decision <number> — <brief description>.md`.


Observed decision-recording convention is within the `discussions` directory, organized by date. Confirmed the standard naming format as `Decision <number> — <brief description>.md`. Frontmatter utilizes YAML for metadata like type, status, and summary, followed by a templated body. The body includes sections for the decision content, rationale, and execution guidelines.




</details>

**답변**

읽은 대상: 10개
1. [decision_card_template.md](vdoc:resource/file_d1b21adce6) (L1-9)
2. [sample_decision_output.md](vdoc:resource/file_04a351c024) (L1-9)
3. [SKILL.md](vdoc:resource/file_94f472a147) (L1-4)
4. [2.2_결정_기록_방식_정리.md](vdoc:resource/file_c57eef480b) (L1-15)
5. [Decision 01 — 검색은 로컬 색인으로 시작한다.md](vdoc:resource/file_7a92f1593b) (L1-21)
6. [Decision 02 — 첫 고객은 법무팀으로 좁힌다.md](vdoc:resource/file_be75b165d0) (L1-21)
7. [Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md](vdoc:resource/file_969bb91849) (L1-21)
8. [Decision 03 — 요금제는 사용량 기반으로 바꾼다.md](vdoc:resource/file_75d5f55476) (L1-27)
9. [Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md](vdoc:resource/file_4926aa33c3) (L1-27)
10. [D5_외부_검색_API_도입은_보류한다_초안.md](vdoc:resource/file_b35187e082) (L1-11)

---

볼트의 실제 결정 카드 및 템플릿 관례에 따른 새 결정 기록 방법은 다음과 같습니다.

### 1. 저장 폴더 (Directory)
- **공식 경로**: `discussions/<YY.MM.DD>/decisions/`
  - 회의가 진행된 날짜별 폴더 아래 `decisions/` 서브폴더에 저장합니다.
  - 근거: [Decision 01](vdoc:resource/file_7a92f1593b) (`discussions/25.01.06/decisions/`), [Decision 03](vdoc:resource/file_75d5f55476) (`discussions/25.01.20/decisions/`)
- **회의 산출물 보관 경로 (주간회의 아카이브)**: `archive/<YYYY.MM.DD 주간회의>/A5.outputs/`
  - 회의 산출물 초안 또는 완료본으로 보관할 때 사용됩니다.
  - 근거: [D5 초안](vdoc:resource/file_b35187e082) (L1-11)

---

### 2. 파일명 규칙 (Naming Convention)
- **형식**: `Decision <번호(두 자리)> — <결정 한 문장>.md`
  - 번호 뒤에 긴 줄표(`—`)와 공백을 두고 결정 요약 문장을 작성합니다.
  - 근거:
    - [Decision 01 — 검색은 로컬 색인으로 시작한다.md](vdoc:resource/file_7a92f1593b)
    - [Decision 02 — 첫 고객은 법무팀으로 좁힌다.md](vdoc:resource/file_be75b165d0)
    - [Decision 03 — 요금제는 사용량 기반으로 바꾼다.md](vdoc:resource/file_75d5f55476)
    - [Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md](vdoc:resource/file_4926aa33c3)
  - 기존 결정을 변경/대체하는 경우 이전 결정 파일명 뒤에 `(v1)` 등을 붙이고 본문에 대체 이력을 명시합니다 (예: [Decision 01 (v1)](vdoc:resource/file_969bb91849) L17).

---

### 3. 문서 형식 및 구조 (Format & Template)
[decision_card_template.md](vdoc:resource/file_d1b21adce6) (L1-9) 및 실제 작성된 결정 카드들을 기반으로 한 표준 템플릿입니다:

```markdown
---
유형: 할일
상태: 결정 사항
요약: <결정 한 문장 요약>
작성일: YYYY-MM-DD
상위:
  - "[[알파 프로젝트 목표]]"
담당:
  - "[[담당자]]"
---

# 🎯 Decision <번호> — <결정 한 문장>

## 1. 결정 내용 (What)

> [!check]
> - <결정된 핵심 내용>

## 2. 결정 사유 (Why)

1. <결정 이유 1>
2. <결정 이유 2>

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: <실행 및 집중해야 할 영역>
- **제외 대상 (Don't)**: <범위에서 제외할 항목>
- **완료 판단 기준 (DoD)**: <완료 판단 기준>

## 4. 아직 안 정한 것
- <추후 회의나 다음 단계에서 정할 미정 항목>
```

- **상태 필드 (`상태:`)**:
  - 확정된 결정: `결정 사항` ([Decision 03](vdoc:resource/file_75d5f55476) L3)
  - 후속 결정으로 바뀐 경우: `대체됨` ([Decision 01 (v1)](vdoc:resource/file_969bb91849) L3)
  - 미합의 초안: `검토 중` ([D5 초안](vdoc:resource/file_b35187e082) L3)

## S8-multi-turn — 이어지는 질문 · 앞 턴 맥락 위에서 재작업
> Decision들 정리해줘 → 그중에 지금 유효하지 않은 건 빼고, 각 결정이 언제 내려졌는지 표로 다시 줘

- ✅ 대체된 v1(좌석 기반)을 유효 목록에 넣지 않음: 통과
- ✅ 예시 카드 제외: 통과
- ✅ 초안 D5 제외: 통과
- ✅ 결정 날짜(1/6) 표기: 있음
- ✅ 결정 날짜(1/20) 표기: 있음
- ✅ resource 링크 6개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_6d0e101e_ws_collect` done {"query": "결정 카드", "toolSummary": "Collect decision cards"}
2. `mcp_vibefs_6d0e101e_ws_glob` done {"pattern": "*Decision*", "toolSummary": "Search Decision files"}
3. `mcp_vibefs_6d0e101e_ws_glob` done {"pattern": "discussions/**/decisions/*", "toolSummary": "Check discussions decisions"}
4. `mcp_vibefs_6d0e101e_ws_glob` done {"pattern": "archive/**/A5.outputs/*D*", "toolSummary": "Check archive outputs D*"}
5. `mcp_vibefs_6d0e101e_ws_tree` done {"depth": 3, "path": "discussions", "toolSummary": "Tree of discussions"}
6. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
7. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.06\\decisions\\D
8. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.13\\decisions\\D
9. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
10. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\projects\\alpha\\discussions\\25.01.20\\decisions\\D
11. `read_file` done {"EndLine": 50, "Path": "C:\\AI_Projects\\WebNovelAssistant\\VibeDocStudio\\apps\\api\\state\\evals\\vault\\archive\\2025.01.27 주간회의\\A5.outputs\\D5_외부_검색_API_도
12. `mcp_vibefs_6d0e101e_ws_glob` done {"pattern": "archive/**/A5.outputs/*", "toolSummary": "Check all outputs in archive"}

**읽은 파일 (6)**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


Observed decision cards within the discussions and archive directories, noting the resourceId mapping. Determined that discussions/25.01.06/decisions/Decision 01 (file_7a92f1593b) suggests using a local index for search, and discussions/25.01.06/decisions/Decision 02 (file_be75b165d0) narrows the initial customer focus to the legal team. Further, discussions/25.01.13/decisions/Decision 01 (file_969bb918) specifies a seat-based pricing model (v1).


Decision 문서들을 분석하여, 파일 내용을 읽어 핵심 내용을 파악해야 한다. 다섯 개의 Decision 문서와 아카이브의 초안 문서를 모두 읽어 정보들을 수집한다.


Analyzing remaining files. Decision 04 outlines starting onboarding with three templates. Also examining a draft decision to postpone introducing an external search API and a decision to change the pricing plan.


The decision cards have been reviewed, and all relevant files have been read. Decision 01 specifies local index search as the starting point, while Decision 02 focuses the initial customer group on the legal team. The next step is to examine Decision 01 from the 25.01.13 discussion.


Examined additional decision documents. Decision 03 proposes a usage-based pricing model, while Decision 04 suggests onboarding with three templates. Decision 05 indicates postponing the external search API. Re-examined operating rules regarding source citations and the restrictions on the "read_file" tool's usage.


Initial focus is on building a local BM25 index due to security requirements preventing external document transfer, as stated in Decision 01. Decision 02 designates the internal legal team as the first customer because of the standardized document format, facilitating easier performance measurement. Decision 01 (v1), which proposed a seat-based pricing model, was superseded by Decision 03. Decision 03 mandates usage-based pricing, specifically billing per processed document page, based on the legal team's pilot data showing significant throughput variance.


Decision 01 (v1) — 요금제는 좌석 기반으로 간다 (v1) is superseded; exclude it. Decision D5 (draft) — External search API implementation is on hold; it is currently under review. Need to include the timestamps from the history for the valid decisions.




</details>

**답변**

읽은 대상: 4개 (유효한 결정 사항 기준)
1. `discussions/25.01.06/decisions/Decision 01 — 검색은 로컬 색인으로 시작한다.md`
2. `discussions/25.01.06/decisions/Decision 02 — 첫 고객은 법무팀으로 좁힌다.md`
3. `discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md`
4. `discussions/25.01.20/decisions/Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md`

*(참고: `Decision 01 (v1)`은 대체됨 상태이며, `D5`는 아직 합의되지 않은 검토 중 초안이므로 제외했습니다)*

---

### 현재 유효한 결정 사항 목록

| 결정 일자 | 결정 명칭 | 담당 | 핵심 결정 내용 (What) | 근거 자료 |
| :--- | :--- | :---: | :--- | :--- |
| **2025-01-06** | **Decision 01** — 검색은 로컬 색인으로 시작한다 | 민지 | 첫 버전 검색은 로컬 색인(BM25)으로 구축 | [Decision 01 — 검색은 로컬 색인으로 시작한다](vdoc:resource/file_7a92f1593b) (L1-21) |
| **2025-01-06** | **Decision 02** — 첫 고객은 법무팀으로 좁힌다 | 민지 | 첫 파일럿 고객은 사내 법무팀 한 곳으로 한정 | [Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_be75b165d0) (L1-21) |
| **2025-01-20** | **Decision 03** — 요금제는 사용량 기반으로 바꾼다 | 민지 | 처리한 문서 페이지 수 기준으로 과금 (좌석 기반 폐기) | [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_75d5f55476) (L1-27) |
| **2025-01-20** | **Decision 04** — 온보딩은 템플릿 3종으로 시작한다 | 민지 | 계약서 · 의견서 · 내부 메모 템플릿 3종으로 온보딩 시작 | [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_4926aa33c3) (L1-27) |

---

#### 💡 제외된 항목
- **Decision 01 (v1) — 요금제는 좌석 기반으로 간다** (2025-01-13): 2025-01-20에 `Decision 03`으로 대체되어 폐기됨 ([근거](vdoc:resource/file_969bb91849) L3, L17)
- **D5 (초안) — 외부 검색 API 도입은 보류한다**: 아직 합의되지 않은 회의 안건 초안 (검토 중) ([근거](vdoc:resource/file_b35187e082) L3, L8)
