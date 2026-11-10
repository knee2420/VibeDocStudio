# 작업대 평가 — pack-smoke-a

전체 3/4 · 튜닝 세트 3/4 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| REF-Q1-ambiguous | REF | ❌ | 5/6 | 57.7s | 32,379/109,511/4,082 | 8 | ready:2 |
| REF-Q5-exclude | REF | ✅ | 4/4 | 70.4s | 35,025/113,245/5,329 | 8 | needs_fix:2,ready:2 |
| F2-compare | F | ✅ | 1/2 | 32.0s | 29,526/42,688/2,274 | 4 | - |
| E2-trim | E | ✅ | 3/3 | 60.3s | 37,182/130,714/3,592 | 6 | ready:2,ready:2 |

## REF-Q1-ambiguous — REF
> 요약을 이 레퍼런스처럼 써줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 해석 카드: 2/1 (D4:follow@p1, D1:follow@p1)
- ❌ 해석 갈림 다룸: 대안 해석 0장 · 후보별 따른 카드 조합 1가지
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 모든 후보가 카드를 따름: 2/2안 · [['icard_3b9b6581', 'icard_1fc654ce'], ['icard_3b9b6581', 'icard_1fc654ce']]
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_patterns → wb_outline → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_3b9b6581 D4 follow ref:ref_eval_invest#p1 — 요약 상단에 두괄식 핵심 결론(**결론: ...**)을 배치하고, 하위 항목을 핵심 축(문제-해법/접근-결과-과제) 리스트로 구조화하여 전달하는 서술 프레임워크를 채택한다.
- 카드 icard_1fc654ce D1 follow ref:ref_eval_invest#p1 — 단일 만연체 문장을 해체하여 항목별 키워드에 볼드 라벨(- **항목** — 설명)을 적용하고 단문으로 분절하여 스캐너빌리티와 정보 전달력을 극대화한다.
- 후보 prop_a6b8f86bc2 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial assessment focuses on source identification. The first line suggests the "editor" field is the target for summarization ("r_summary"), referencing a pattern evaluation ("ref_eval_invest"), with no relevant resource ("mount 없음"). The history log needs checking if necessary.

Verification confirms no code creation or modification is required, thus no code is being generated. Also, there are no plan or task instructions, so these are not constructed. Access to disallowed tools (web browser, terminal, file writing, search) is blocked, and the tool named is not permitted.


The `slot:r_summary` requires correction. The current summary contains a single, excessively long sentence (253 characters) and excessive bolding (8 instances within the single sentence). The summary should be revised to address these issues.


The existing summary format violates several principles: excessively long sentences, excessive bolding. The goal is a concise summary (short paragraphs, lists) with a clear, concise conclusion upfront, followed by a structured format. Data from references should not include proprietary names, numerical data, or specific wording from external sources; only facts present in my document. The focus remains on shortening the time to first document completion.


Initial card generation completed. Two cards were created: `icard_3b9b6581` using a direct-conclusion structure with a bullet-point framework and `icard_1fc654ce` employing short segmented sentences and keyword-bolding. Now, proposals will be generated using `wb_propose`. The initial approach will explore creating two or more drafts, starting with a structure that follows the summary section of the reference material (blk:b3~b7) with a conclusion-first format including problem/solution/result.


The initial plan considered a summary-style structure with a conclusion-first format using bullet points. An alternative, more concise approach using short sentences and a situation/question-answer pattern was also outlined. The agent will now check arguments for `wb_propose`. The target is the summary slot. It's in compose mode with a summary that restructures the summary using the reference's conclusion-first and keyword bullet pattern. The candidate cards include two drafts; the first uses a four-part bulleted structure, and the second employs a situation-approach-task (SAT) three-part framework with a short sentence introduction.


wb_propose validation passed successfully. Distance metrics decre

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 레퍼런스의 서술 구조와 정보 밀도 패턴에 맞춰 2가지 안으로 제안했습니다. 화면의 미리보기에서 검토 후 선택하실 수 있습니다.

---

### 제안된 후보 비교

- **1안 (핵심 4단 불릿형)**: `목표 - 해법 - 결과 - 과제`
  - 레퍼런스의 구조를 충실히 반영하여 원문의 모든 맥락(진행 목표, 도입 방식, 지표 변화, 미측정 후속 과제)을 균형 있게 다룹니다. 보고서 정식 요약에 적합합니다.
- **2안 (3단 압축형)**: `배경 - 접근 - 후속`
  - 핵심 추진 배경과 실행 방식, 향후 계획 위주로 더 간결하게 압축한 형태입니다. 빠른 브리핑용 요약에 적합합니다.

---

### 레퍼런스 반영 내역 보고

- **적용한 층위 및 범위 (`ref:ref_eval_invest#p1`)**:
  - **D4 (서술 프레임워크)**: 두괄식 결론 제시 후 하위 핵심 항목을 구조화된 리스트로 배치하는 전개 방식 채택 ([icard_3b9b6581](vdoc:ref-pin/icard_3b9b6581))
  - **D1 (정보 밀도·스캐너빌리티)**: 253자 단일 만연체 문장을 해체하여 항목별 볼드 라벨 및 단문 분절 적용 ([icard_1fc654ce](vdoc:ref-pin/icard_1fc654ce))
- **미반영 요소**:
  - 레퍼런스 고유의 수치, 기업명 및 고유명사는 배제하고 기존 문서의 사실 데이터만 사용했습니다.
- **확인하지 않은 출처**: 
  - 이력 — 복원이 아닌 신규 서술 패턴 적용 작업이므로 참조하지 않음
  - 리소스 — 마운트된 리소스 없음

## REF-Q5-exclude — REF
> 요약을 이 레퍼런스처럼 다듬되, 굵은 글씨로 강조하는 방식은 따라하지 마.

- ✅ 따르지 않음 카드: 1/1 (D1:exclude@p1, D4:follow@p1, D1:follow@p1)
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 굵은 글씨 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_patterns → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#p1(18)
- 카드 icard_82f12dfd D1 exclude ref:ref_eval_invest#p1 — 레퍼런스는 핵심 결론 및 항목명에 볼드 서식(bold_per_para=0.38)으로 시각적 강조를 주었으나, 사용자 요청에 따라 볼드 강조 방식은 제외하고 일반 텍스트로 구성한다.
- 카드 icard_31f19526 D4 follow ref:ref_eval_invest#p1 · 대안 1 — 두괄식 핵심 결론을 서두에 제시하고 목표·시도·결과·후속 과제를 간결하게 구조화하는 서술 프레임워크를 따른다.
- 카드 icard_855c2d20 D1 follow ref:ref_eval_invest#p1 — 평균 단락/문장 길이를 대폭 축소(레퍼런스 avg_para_chars 20.4자, long_para_ratio 0.0)하여 253자의 만연체를 호흡이 짧은 단문 및 개조식으로 분절한다.
- 후보 prop_7526dcb5ce needs_fix 2안 compose · 오류 2 · 경고 0
  - ✗ 후보 1 '1안: 결론 우선 및 핵심 항목 개조식 요약 (볼드 강조 제외)': icard_82f12dfd 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 서술 프레임워크 기반 단문 분절 요약 (볼드 강조 제외)': icard_82f12dfd 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_f539e77bfa ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

에디터=대상 칸 r_summary · 레퍼런스=ref:ref_eval_invest (굵은 글씨 강조 제외) · 리소스=마운트 없음 · 관련 없음=이력(되돌리기 아님)
분석 결과, 사용자는 특정 레퍼런스 스타일을 따르면서 굵은 글씨 강조는 제외한 요약을 요구하고 있다. 요구 사항을 정확하게 파악하여 요약 스타일을 수정해야 한다.


Initial focus is on the scale and scope of the onboarding improvement project. The goal centers on fundamentally altering the user experience. Different approaches were considered: a template-first method versus starting with a blank document. The primary objective was reducing the baseline document completion time of 47 minutes.


I'm thinking through how to approach this.


The user explicitly rejects bold text emphasis; will avoid using bolding in this summary. The provided references use bolding extensively for key conclusions and items. Following the user's direction, plain text will be used to present information concisely. The summary structure will prioritize presenting conclusions first, followed by structured, concise details.


Target is to compose a response to summarize and refine content. The goal is a re-composition; factual claims must originate solely from the document itself, not external references. The objective is to produce a refined summary.


Focused on refining the approach to summarizing content, the initial goal was to reduce the document creation time from a baseline of 47 minutes. Multiple experiments were conducted, comparing a template-first method with a blank document start. Preliminary results show improvements across several metrics, but some measurements remain incomplete, necessitating further evaluation in the next stage.


The validation failure indicates that `icard_82f12dfd` is marked as "exclude". This means it should not be included in the "follows" list. Focusing solely on "follow" cards, specifically `icard_31f19526` and `icard_855c2d20`, which are D4 and D1, will be added to "follows". A new call should be made with this revised "follows" list.


검증 통과를 확인했다. 규칙 점검을 수행한 결과, 에디터, 레퍼런스, 리소스, 관련 없는 출처 명시가 완료되었다. 레퍼런스 절차(G1~G6)에 따라, G1은 `ref:ref_eval_invest#p1`을 대상으로 하며, 볼드 강조(D1)는 제외되었고, 서술 프레임워크(D4)와 단문화(D1)가 채택되었다.




</details>

**답변**

[요약](vdoc:slot/r_summary) 슬롯에 [루미나랩스 투자 제안서](vdoc:ref-region/ref_eval_invest)의 서술 구조 및 단문 정보 밀도 패턴을 적용하고, 요청하신 대로 **굵은 글씨(볼드) 강조 방식은 완전히 배제**하여 2가지 후보를 제안했습니다.

---

### 적용 내용 및 해석 카드 안내

- **따른 층위**: 
  - `D4 서술 프레임워크` (카드 [icard_31f19526](vdoc:ref-region/ref_eval_invest#p1)): 서두 핵심 결론 제시 및 항목별 체계적 분절 구조 채택
  - `D1 정보 밀도·단문화` (카드 [icard_855c2d20](vdoc:ref-region/ref_eval_invest#p1)): 253자 단일 만연체 문장을 호흡이 짧은 단문/개조식 형태로 분절
- **따르지 않은 층위**: 
  - `D1 볼드 강조` (카드 [icard_82f12dfd](vdoc:ref-region/ref_eval_invest#p1)): 레퍼런스의 키워드 굵은 글씨 표기 방식 배제 (일반 텍스트 유지)
- **사실 보존**: 레퍼런스의 고유명사나 수치는 일절 반영하지 않고, 기존 초안의 온보딩 개선 사실(기준선 47분 단축 목표, 템플릿 방식 검증, 잔여 측정 항목 차기 분기 검증)만 유지했습니다.

---

### 제안 후보 비교

- **1안 (결론 우선 및 개조식 요약)**:
  - **차이**: 핵심 결론을 한 문장으로 제시한 뒤 목표·시도·결과·차기 단계를 리스트로 명확히 분리했습니다.
  - **선택 기준**: 회의나 보고 시 핵심 항목을 빠르게 훑어볼 수 있는 스캐너빌리티를 최우선으로 둘 때 적합합니다.
- **2안 (서술 프레임워크 기반 단문 요약)**:
  - **차이**: 개조식 글머리 기호 없이, 호흡이 짧고 정돈된 3개의 평서문 단락으로 자연스럽게 전개했습니다.
  - **선택 기준**: 보고서 본문의 일반 줄글 흐름과 위화감 없이 매끄러운 보고 문체를 선호할 때 적합합니다.

화면의 미리보기에서 적합한 안을 선택해 검토해 주시기 바랍니다.

---
*확인하지 않은 출처: 이력(History) — 이전 판으로 되돌리는 복원(restore) 요청이 아니므로 열람하지 않음.*

## F2-compare — F
> 두 레퍼런스 뭐가 달라?

- ✅ 층위 차이 4개 이상: 6/4 (개조식|~함|함\., 결재|문서번호|메타, 결론[^\n]{0,10}(먼저|앞)|두괄, SCQA|상황.{0,6}문제, 볼드|굵, 표)
- ❌ (가점) 측정 도구: 없음

**도구**: rf_map → rf_contrast → rf_read → rf_read

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#p1(18) · ref:ref_eval_public#p1(15)

<details><summary>생각</summary>

Initial hypothesis: Differences between the two references likely involve their topics and potential perspectives on evaluation. The first reference appears to be a private investment proposal, while the second is a public internal report on standardization. The question of "what's different?" suggests a comparison is needed.


The two references, `ref:ref_eval_invest` and `ref:ref_eval_public`, showcase distinct structural approaches. `ref:ref_eval_invest` employs a two-part structure, prioritizing a concise conclusion upfront. Conversely, `ref:ref_eval_public` follows a more 순차적인 서술 구조, with the 핵심 내용이 후반부에 위치.


`ref:ref_eval_public` employs a standard administrative report structure: introduction, background/problem statement, proposed solutions, and future plans. `ref:ref_invest` lacks these metainformation blocks, typical for startup proposals, while the public version adheres to standard public document formats, including document numbers and approval lines. The tone in `ref:ref_invest` uses a mix of declarative statements and question prompts for emphasis, contrasting with the formal, concise style of `ref:ref_public`. Data presentation in `ref:ref_invest` relies on dense textual data and bolding for rapid scanning. In contrast, `ref:ref_public` uses a numbered list, bullet points, and boxes for hierarchy.




</details>

**답변**

두 레퍼런스는 **문서의 목적(장르)**, **논증 구조(프레임워크)**, **격식·표기 규약**에서 뚜렷한 차이를 보입니다.

---

### 1. 서술 프레임워크 (D4)
* **[투자 제안서](vdoc:ref/ref_eval_invest)**: **두괄식(결론 우선)** 구조
  * 서두에 핵심 결론과 요약(문제-해법-증거-요청)을 먼저 제시하고, 이후 **SCQA**(상황 → 문제 → 질문 → 해답) 흐름으로 설득합니다.
* **[공공기관 내부 보고](vdoc:ref/ref_eval_public)**: **순차적 행정 보고(기승전결)** 구조
  * 머리말 요약 후 **1. 추진 배경 → 2. 현황 및 문제점 → 3. 개선 방안 → 4. 향후 계획** 순서의 전형적인 기안·보고 체계를 따릅니다.

### 2. 격식 및 메타 규격 (D3)
* **[투자 제안서](vdoc:ref/ref_eval_invest)**: 메타 서식 최소화
  * 문서번호나 결재선 없이 일자 및 대외비(Confidential) 표기만 간소하게 배치합니다.
* **[공공기관 내부 보고](vdoc:ref/ref_eval_public)**: 엄격한 공문서 메타 규격 준수
  * 상단에 **문서번호, 보고일자, 작성부서, 보안등급** 및 **결재선(담당-검토-승인)** 테이블이 포함되며, 말미에 붙임 참조(각주)를 둡니다.

### 3. 장르 규약 및 어조 (D6)
* **[투자 제안서](vdoc:ref/ref_eval_invest)**: 단호한 평서문(`~다`)과 명사형 종결
  * 확신을 주는 어조를 사용하며, 화두를 던지는 질문형 문장(`~인가?`)을 활용합니다.
* **[공공기관 내부 보고](vdoc:ref/ref_eval_public)**: 전형적인 공문서 개조식 어조
  * 문장을 `~함`, `~임`, `~음` 또는 명사형으로 간결하게 끊어 사실 위주로 보고합니다.

### 4. 정보 밀도 및 시각 강조 (D1)
* **[투자 제안서](vdoc:ref/ref_eval_invest)**: 단락 중심 + **볼드(Bold) 강조**
  * 줄글과 목록을 혼용하되, 중요한 키워드와 결론 문장에 볼드를 적극 적용(단락당 볼드 0.38)하여 빠른 훑어읽기를 유도합니다.
* **[공공기관 내부 보고](vdoc:ref/ref_eval_public)**: 불릿 리스트 중심 + 구조 기호
  * 텍스트 강조(볼드) 대신 불릿(`-`)과 문단 기호(`□`, 번호 체계)를 사용하여 항목별로 구조화합니다.

---

> **확인하지 않은 출처**: 
> - 에디터: 열린 문서 없음 (비교 분석 요청)
> - 리소스: 마운트된 원천 자료 없음

## E2-trim — E
> 이 칸 분량 제한에 맞게 다듬어줘.

- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_note']
- ✅ 핵심 낱말 유지: 2/2안
- ✅ (가점) 답이 짧다 — 후보는 화면에 (답 544자)

**도구**: wb_read → wb_outline → wb_history → wb_patterns → wb_propose → wb_propose

**읽은 원천**: 없음
- 후보 prop_97fbf42280 ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_83b821d7fd ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

Initial assessment: The user is requesting a refinement of content within a specified cell, `r_metric_note`, due to a length constraint. No external references or mounted resources are immediately available. The edit history shows two revisions with one original cell remaining. The first step involves retrieving and examining the content, length restrictions, and any applicable patterns associated with the target cell.


Initial observation: Template usage steadily increased after initial exposure, particularly among new sign-ups choosing meeting templates. Existing users showed a slower conversion, likely due to habit. This difference warrants attention in the next onboarding design.


The task involves condensing the existing content while preserving factual information. Initially, the approach considers whether `restyle` or `compose` is appropriate for the task, with a preference for `restyle` due to its focus on reformatting existing content. The `sources` include the relevant slot. The goal is to produce a concise summary of the given text, focusing on template usage trends and onboarding implications.


 신규 가입자들은 회의록 템플릿 사용을 늘렸지만, 기존 사용자들의 전환은 늦어지고 있다.  다음 온보딩 설계에서 이러한 차이를 고려하여 개선해야 한다.  `restyle` 모드를 사용하여 요약한다.


Candidate 1 "Core Summary": It's a restyle, but only 15% of the original words in the r_metric_note column remain, suggesting a significant content change.

Candidate 2 "Maintaining Original Flow": It's also a restyle, but 33% of the original words in the r_metric_note column remain, indicating some content preservation. Further investigation needed to improve original word retention, consider mode=compose, or try to create a summary that preserves as many original words as possible.


The validation passed, and the word count reduction from 134 to 80 characters resulted in a 45% remaining word ratio, which is expected given the character limit. Now, reviewing the workspace rules and response principles.




</details>

**답변**

[지표 주석](vdoc:slot/r_metric_note) 칸의 분량 제한(최대 80자)에 맞춰 원문(134자)의 핵심 사실을 축약한 2개 안을 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

### 제안 후보 비교 및 선택 기준

1. **후보 1: 원문 어휘 보존형 (76자)**
   - **내용**: `템플릿 사용률은 신규 가입자의 회의록 양식 선택으로 올랐으나 기존 사용자는 전환이 느렸다. 이 차이는 다음 분기 온보딩 설계에서 다뤄야 한다.`
   - **기준**: 원문의 핵심 표현('회의록 양식 선택', '이 차이')을 최대한 유지하면서 군더더기를 덜어내고자 할 때 적합합니다.

2. **후보 2: 과제 강조형 (68자)**
   - **내용**: `신규 가입자의 회의록 템플릿 사용률은 올랐으나 기존 사용자는 전환이 느렸다. 이는 다음 분기 온보딩 설계에서 반드시 다뤄야 한다.`
   - **기준**: 사용자 그룹 간 대비를 간결하게 정리하고, 차기 온보딩 설계의 당위성('반드시 다뤄야 한다')을 명확히 전달하고자 할 때 적합합니다.