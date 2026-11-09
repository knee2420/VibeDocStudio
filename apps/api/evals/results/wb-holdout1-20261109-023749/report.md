# 작업대 평가 — wb-holdout1

전체 5/5 · 튜닝 세트 0/0 · 보류 세트 5/5

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| R5h-convention (보류) | R | ✅ | 2/2 | 17.5s | 26,063/37,297/1,058 | 2 | - |
| F3h-genre (보류) | F | ✅ | 1/1 | 27.6s | 23,290/18,195/2,589 | 3 | - |
| E3h-what-changed (보류) | E | ✅ | 2/2 | 16.9s | 24,917/36,304/1,390 | 3 | - |
| E4h-restructure (보류) | E | ✅ | 2/2 | 50.3s | 29,285/78,688/4,599 | 4 | ready:2 |
| RE4h-outline (보류) | RE | ✅ | 2/2 | 33.0s | 26,215/39,014/3,133 | 7 | - |

## R5h-convention — R
> 새 고객 인터뷰를 기록하려면 어느 폴더에 어떤 이름으로 둬야 해?

- ✅ interviews 폴더: 있음
- ✅ 날짜_인터뷰_회사 규칙: 있음

**도구**: ws_tree → read_file

**읽은 원천**: README.md

<details><summary>생각</summary>

The `README.md` file specifies the expected format for interview files within the `interviews/` directory. Each file name should follow the pattern: `YYYY-MM-DD_인터뷰_회사.md`. This format is crucial for proper data organization and retrieval.




</details>

**답변**

새 고객 인터뷰는 **`interviews/`** 폴더에 **`YYYY-MM-DD_인터뷰_회사명.md`** 형식의 이름으로 저장하시면 됩니다.

### 근거 및 명명 규칙
- **저장 폴더**: `interviews/`
- **파일명 형식**: `날짜_인터뷰_회사.md` ([README.md](vdoc:resource/file_15c0642d61) L3)
- **기존 작성 예시**:
  - [2025-02-03_인터뷰_A사.md](vdoc:resource/file_424d917afe)
  - [2025-03-10_인터뷰_B사.md](vdoc:resource/file_698d94bf09)

예를 들어 오늘 진행한 C사 인터뷰라면 `interviews/2026-11-09_인터뷰_C사.md`와 같이 생성하시면 됩니다.

## F3h-genre — F
> 세 레퍼런스의 공통점에서, 결정을 다루는 문서라면 기본으로 지켜야 할 것만 뽑아줘.

- ✅ 공통 기준 3개 이상: 4/3 (결정|결론, 표, 담당|책임, 요약)

**도구**: wb_read → wb_read → wb_read

**읽은 원천**: 없음

<details><summary>생각</summary>

The task is to extract the essential principles for decision-making from three references, treating them as patterns. Initiating a review of the references to identify the core commonalities relevant to decision-making.


Initial suspicion is that different documents have different structures. The first reference, a series A investment proposal, presents the conclusion upfront with a clear problem-solution-evidence-action structure. Key metrics and supporting evidence are presented separately in tables and bullet points.


The second reference, a public sector internal report, highlights the need for a standardized meeting minutes format that separates decisions, rationale, and follow-up actions. It diagnoses the problem as a conflation of decisions and discussion points, along with missing assignment of responsibilities. The proposed solution involves a standardized format to clearly delineate decisions, supporting evidence, and subsequent plans, including schedules. The blog post offers similar recommendations, emphasizing placing decisions upfront, assigning responsibility for follow-up actions, presenting numerical data in tables, and maintaining a consistent template. All three references consistently emphasize the principle of placing the decision at the beginning of the document.


The analysis consistently points to the necessity of structuring documents with decisions upfront, followed by supporting context and discussion.  The references highlight the importance of separating decisions from discussion points and assigning clear responsibility for action items and timelines. Furthermore, all references emphasize the structured presentation of quantitative data in tables or bullet points, promoting clarity and scannability.




</details>

**답변**

세 레퍼런스는 장르와 격식(투자 제안서·공공 내부 보고·블로그)이 완전히 다르지만, **결정(Decision)을 전달하고 실행으로 연결하는 문서 구조**에서 공통적으로 다음 4가지 핵심 원칙을 지키고 있습니다.

---

### 1. 두괄식 결정 배치 (결정 우선)
논의 과정이나 배경보다 **최종 결정 사항을 최상단에 먼저 배치**합니다.
- [시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 [요약](vdoc:slot/a_summary): 첫 줄에 핵심 결론과 요청 사항을 먼저 제시.
- [회의록 표준화 추진 계획](vdoc:doc/vdoc_eval_ref_public)의 [요약](vdoc:slot/g_summary): 본문 진입 전 핵심 표준화 결정 및 예산 규모 선언.
- [회의록 정리 꿀팁 5가지](vdoc:doc/vdoc_eval_ref_blog)의 [본문](vdoc:slot/c_body): *"결정부터 적어요. 논의는 나중에 붙여도 돼요."*

### 2. 결정과 논의·근거의 엄격한 분리
결정 사항이 논의 과정이나 맥락 속에 섞여 묻히지 않도록 **구조적으로 분리**합니다.
- [회의록 표준화 추진 계획](vdoc:doc/vdoc_eval_ref_public)의 [본문](vdoc:slot/g_body): *"결정과 논의가 한 문단에 섞여 기록됨"*을 핵심 문제로 지적하고, *결정·근거·후속 조치를 분리*하는 표준 양식 도입.
- [시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 [논리](vdoc:slot/a_scqa): 상황·문제·질문·해답(SCQA)의 논리 흐름을 블록 단위로 구분하여 기술.

### 3. 실행 책임자 및 후속 조치(Action Item) 명시
결정만으로 끝나지 않고 **누가, 언제까지, 무엇을 할 것인가**가 즉시 드러나야 합니다.
- [회의록 정리 꿀팁 5가지](vdoc:doc/vdoc_eval_ref_blog)의 [본문](vdoc:slot/c_body): *"담당자를 바로 박아요. 이름이 없으면 아무도 안 해요."*
- [회의록 표준화 추진 계획](vdoc:doc/vdoc_eval_ref_public)의 [본문](vdoc:slot/g_body): 후속 조치 담당자 누락을 방지하고 향후 계획·일정 명시.
- [시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 [요청](vdoc:slot/a_ask): 기한(18개월), 정량 목표, 자금 배분 비율을 구체화.

### 4. 근거 및 수치의 구조화 (표 / 개조식)
문장 속에 묻히기 쉬운 정량 데이터와 결정 근거는 **표(Table)나 개조식 항목으로 시각적으로 고립**시켜 가독성을 확보합니다.
- [회의록 정리 꿀팁 5가지](vdoc:doc/vdoc_eval_ref_blog)의 [본문](vdoc:slot/c_body): *"숫자는 표로. 문장 속 숫자는 금방 잊혀요."*
- [시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 [시장](vdoc:slot/a_market): 핵심 지표를 표 형태로 정리하고 출처 명시.

---

> **요약: 결정을 다루는 문서의 최소 구성 단위**
> `[1. 최종 결정]` → `[2. 판단 근거/수치 (표·개조식)]` → `[3. 후속 조치 및 실행 담당자/기한]`

## E3h-what-changed — E
> 최근에 이 문서에서 뭐가 바뀌었어?

- ✅ 바뀐 칸: 있음
- ✅ 언제 · 누가: 있음

**도구**: wb_history → wb_read → wb_read

**읽은 원천**: 없음

<details><summary>생각</summary>

The query concerns recent changes to a document, indicating a need to examine the revision history. Identifying the specific document (`2025 Q1 온보딩 개선 운영 보고서 (초안)`, identified by `vdoc_eval_report, rev 3`) is the first step. The next step is accessing and analyzing the document's revision history.


Initial analysis shows changes in `r_summary` and `r_dec_onb` slots across revisions. Investigating the content differences between revisions using the provided tool, focusing on the history of these slots, to understand modifications. The goal is to compare the content of the identified slots across revisions.


The revision history indicates a change in onboarding, specifically prioritizing template presentation on the first screen. The earlier summary highlighted "template-first" onboarding as key for Q1 improvements, showing a significant reduction in the first document completion time from a baseline of 47 minutes. The updated summary needs to be created.




</details>

**답변**

문서의 최근 개정 이력은 총 2건이며, 다음과 같은 변경이 있었습니다.

---

### 1. **[요약](vdoc:slot/r_summary)** (rev 3 · 2025-04-01, AI 변경안 승인)
간결했던 요약 문장이 상세하고 긴 문장으로 변경되었습니다.
- **이전:**
  > Q1 온보딩 개선의 핵심은 템플릿 우선 제공이다. 첫 문서 완성 시간은 기준선 47분에서 크게 줄었다.
- **이후 (현재):**
  > 이번 분기 **온보딩** 개선 작업은 **여러 팀**이 함께 참여한 **대규모** 프로젝트였으며, **사용자 경험**을 근본적으로 바꾸기 위해 **다양한** 시도를 했고, 그 과정에서 **템플릿**을 먼저 보여 주는 방식과 빈 문서에서 시작하는 방식을 비교했으며, 기준선으로 삼은 첫 문서 완성 시간 47분을 줄이는 것을 **최우선** 목표로 두었고, 결과적으로 여러 지표에서 의미 있는 변화가 있었지만 아직 측정이 끝나지 않은 항목도 남아 있어 다음 분기에 추가 검증이 필요하다는 점을 **강조**하고 싶다.
- *참고:* [요약](vdoc:slot/r_summary) 칸은 처음 상태(`orig:r_summary`)가 보존되어 있어 언제든 초기 내용으로 되돌릴 수 있습니다.

---

### 2. **[온보딩 · 결정](vdoc:slot/r_dec_onb)** (rev 2 · 2025-03-28, 작업자 직접 편집)
빈칸이었던 항목에 결정 사항이 추가되었습니다.
- **이전:** `(비어 있음)`
- **이후:**
  > 첫 화면에서 템플릿을 먼저 제시한다.

## E4h-restructure — E
> 이 글이 결론부터 보이게 구조를 바꾼 안을 줘.

- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['b_body', 'b_intro', 'b_outro', 'b_title']
- ✅ 없던 수치 없음: 없음

**도구**: wb_outline → wb_read → wb_read → wb_propose

**읽은 원천**: 없음
- 후보 prop_c45590fc93 ready 2안 restyle · 오류 0 · 경고 4

<details><summary>생각</summary>

The task is to restructure a given document to present the conclusion upfront. Need to begin by understanding the current structure using available tools. Checking the document's existing outline to understand its current organization.


The document describes a team's experiment with meeting minutes. Initial resistance to the new method, separating decisions and meeting notes, was followed by efficiency gains. The new system includes decision cards that capture what was decided and the rationale, along with execution guidelines.


The current document structure needs rearrangement to prioritize the conclusion. Considering this as a restructuring operation (mode: restyle), the goal is to present the core findings upfront. The task involves rearranging existing content, not generating new content; the target is the document's structure, so selecting the appropriate target for the restructuring. The wb_propose action should be used to propose the rearranged document structure.


Considering "page:bp1" as the target or the slots b_intro, b_body, b_outro for restructuring. The aim is to prioritize the conclusion, specifically "rearranging the structure to show the conclusion first." The core findings include the reduced time to find decisions and onboarding. The current structure will be reordered to reflect a bottom-line-up-front (BLUF) approach: the introduction will highlight the core findings, followed by the body detailing the method, and the outro summarizing future plans.


The structure is reordered to prioritize the conclusion, presenting the value proposition upfront. The introduction now highlights the efficiency gains and reduced time to find decisions. The body section details the decision card methodology and the implementation process.


The `b_title` slot contains "# 우리 팀의 회의록 실험기" and `b_intro` holds text. Investigating how the `wb_propose` function handles HTML input within the slots is necessary. This function's validation rules specify the "compose," "restyle," and "restore" modes, along with title, rationale, layers, and sources fields within the candidate structure.


Considering that the target could be `slots:b_intro,b_body,b_outro` or `page:bp1`, investigating whether `b_title` must be included with `page:bp1` requires a test of the `wb_propose` function. Proposing two candidates: one emphasizing key results summary and the other a 3-line key conclusion box. Candidate 1 outlines results focusing on reduction in search time and onboardi

</details>

**답변**

[글](vdoc:page/bp1)의 [도입](vdoc:slot/b_intro)과 [본문](vdoc:slot/b_body)에 흩어져 있던 핵심 성과를 글 앞단으로 끌어올려 결론부터 보이도록 재구성한 2가지 안을 제안했습니다.

---

### 제안 후보 비교

- **1안: 성과 중심 결론 우선형**
  - **차이점**: 첫 문장에서 실험의 핵심 성과(‘결정 탐색 시간 단축’과 ‘신규 입사자 맥락 파악 속도 개선’)를 직접적으로 강조하고, [본문](vdoc:slot/b_body)에서 회의 속기 분리 및 결정 카드 작성 방식을 전개합니다.
  - **선택 기준**: 독자가 글을 읽자마자 이 실험의 성과와 효용을 즉시 체감하게 만들고 싶을 때 적합합니다.

- **2안: 요약 리드문 + 프로세스 구조화형**
  - **차이점**: [도입](vdoc:slot/b_intro)을 개편 실험 전체의 요약 리드문으로 정돈한 뒤, [본문](vdoc:slot/b_body)에서 구체적인 실행 규칙(작성 규칙, 폴더/파일명 규칙)을 단계적으로 이어받도록 구성했습니다.
  - **선택 기준**: 성과 요약과 함께 이후 이어지는 업무 프로세스 흐름을 일목요연하게 전달하고 싶을 때 적합합니다.

화면의 미리보기 창에서 원하는 안을 확인하고 적용할 수 있습니다.

## RE4h-outline — RE
> 리서치 자료로 다음 분기 보고서 목차를 잡아줘.

- ✅ 원천 사실 매핑: 있음
- ✅ 목차 구조: 있음

**도구**: ws_tree → read_file → read_file → read_file → read_file → read_file → read_file

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


Initial investigation reveals a small codebase with only six files and 42 total lines. Attempting a comprehensive file content retrieval using a read operation to ensure all content is accurately accessed. The provided file paths indicate a research context within a web application project.


Initial review of the data is complete. The documents provide information about a folder structure, key metrics from March 2025, and details about competitors. Specifically, WAU is 1,450 users based on product logs, template usage is 68%, and the average first document completion time is 31 minutes.


Next quarter's report should begin with an executive summary highlighting key performance indicators from March 2025 (WAU of 1,450, 68% template usage, and average first document completion time of 31 minutes). The summary should also touch on the year-over-year growth of 210%, referencing the previous year's annual report summary ([보고서_요약_원래본.md](vdoc:resource/file_62220c4596) L1-3). Competitor analysis, noting N company's lack of decision tracking and M company's poor connection between templates and evidence ([비교.md](vdoc:resource/file_506aab9539) L1-4), will then frame areas of opportunity.

The following sections should focus on user needs and how the product can adapt. Feedback from A company highlights a need for quicker post-meeting decision retrieval ([2025-02-03_인터뷰_A사.md](vdoc:resource/file_424d917afe) L1-9), while B company’s feedback emphasizes the need for assigned execution owners and security within a closed environment ([2025-03-10_인터뷰_B사.md](vdoc:resource/file_698d94bf09) L1-8). These insights will inform recommendations for product improvements.




</details>

**답변**

마운트된 리서치 자료 6종을 바탕으로 구성한 **다음 분기 보고서 목차(안)**입니다. 각 항목에는 근거가 되는 리소스 파일과 행 범위를 연결했습니다.

---

### 다음 분기 보고서 목차(안)

#### 1. 실행 요약 (Executive Summary)
- 전분기 실적 요약 및 성장 추세 ([보고서_요약_원래본.md](vdoc:resource/file_62220c4596) L1-3)
- 분기 핵심 성과 및 다음 분기 전략적 목표

#### 2. 핵심 제품 지표 분석 (Product Metrics)
- **사용자 활성화 지표**: WAU 1,450명 달성 및 측정 기준 정리 ([2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352) L7-13)
  - *참고: 제품 로그(3월 3주 기준) 1,450명 확정치 반영 (2월 인터뷰 구두 추정치 1,200명과의 정합성 설명)*
- **문서 작성 효율성**: 첫 문서 완성 시간(평균 31분) 및 템플릿 사용률(68%) 현황 ([2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352) L10-11)

#### 3. 고객 인터뷰 및 사용성 피드백 (Customer Research)
- **결정 추적 및 탐색 비용 문제**:
  - 회의 직후 결정 사항 재확인에 20분 이상 소요되는 페인포인트 ([2025-02-03_인터뷰_A사.md](vdoc:resource/file_424d917afe) L7-9)
  - 결정 카드 기능 내 '실행 담당자' 필수 지정 프로세스 요구 ([2025-03-10_인터뷰_B사.md](vdoc:resource/file_698d94bf09) L7)
- **보안 및 환경 제약 사항**:
  - 엔터프라이즈 보안 요구로 인한 외부 검색 차단 이슈 및 내부 완결형 환경 니즈 ([2025-03-10_인터뷰_B사.md](vdoc:resource/file_698d94bf09) L8)

#### 4. 경쟁 환경 및 차별화 분석 (Market & Competitor Analysis)
- **경쟁 제품군 한계 비교**: ([경쟁사_비교.md](vdoc:resource/file_506aab9539) L1-4)
  - N사 대비: 회의 녹음 요약 중심 대비 '결정 사항 추적 기능' 우위 확보
  - M사 대비: 단순 템플릿 다양성을 넘어 '원천 근거 연결(Traceability)' 기능 차별화

#### 5. 다음 분기 핵심 실행 과제 (Next Quarter Roadmap)
- **실행 관리 기능 고도화**: 결정 카드 내 담당자 지정 및 후속 조치 자동 연계
- **보안 강화 및 온프레미스/로컬 호환**: 외부 검색 없이 로컬 자원을 활용하는 리서치 환경 구축
- **템플릿 라이브러리 확장**: 템플릿 사용률(68%) 확대를 통한 신규 유저 첫 문서 작성 시간 단축(31분 목표 개선)