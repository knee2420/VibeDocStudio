# 작업대 평가 — regress-ref2

전체 4/4 · 튜닝 세트 4/4 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| F1-decompose | F | ✅ | 4/4 | 39.6s | 29,456/60,236/3,569 | 3 | - |
| F4-pin | F | ✅ | 2/2 | 35.4s | 35,773/110,216/2,479 | 5 | - |
| FE3-toggle | FE | ✅ | 3/3 | 96.3s | 72,112/230,567/9,474 | 11 | ready:2,needs_fix:2,ready:2 |
| RF1-frame | RF | ✅ | 3/3 | 58.9s | 37,498/137,650/5,087 | 11 | - |

## F1-decompose — F
> 이 레퍼런스를 층위별로 분해해줘. 내가 뭘 가져다 쓸 수 있는지.

- ✅ 레퍼런스 읽기 · 측정: rf_read
- ✅ 층위 5개 이상: 6/5 (정보 밀도|스캐너, 증명|근거, 격식|메타, 프레임|논증|SCQA|상황, 조판|타이포|제목 계층, 장르|어조|종결)
- ✅ 측정값 근거: 있음
- ✅ (가점) 레퍼런스 고유 수치 미전달: 있음

**도구**: rf_map → rf_read → rf_interpret

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_f9e29deb D1 follow ref:ref_eval_invest — 핵심 메시지를 첫 문단 굵은 글씨로 전진 배치하고, 키워드 볼드 처리된 4줄 리스트(문제-해법-증거-요청)로 요약하여 초반 10초 스캐너빌리티를 극대화함 (평균 문단 길이 20.4자, 볼드 밀도 0.38).
- 카드 icard_95fb8b62 D2 follow ref:ref_eval_invest — 핵심 성과/시장 지표를 2열 키-값 미니 테이블(TAM, 고객사, NPS)로 압축 제시하고 바로 아래 출처 표기((출처: ...))를 덧붙여 정량 데이터의 신뢰성을 담보함 (숫자 밀도 4.03/100자).
- 카드 icard_17e7f5a7 D3 consult ref:ref_eval_invest — 결재란, 버전 표, 문서 번호 등 무거운 공문서 메타를 배제하고, 작성연월과 기밀성 표기(2025.03 · Confidential) 한 줄만 두어 피치덱 특유의 미니멀한 격식을 유지함.
- 카드 icard_aba3cab0 D4 follow ref:ref_eval_invest · 대안 1 — 고전적 논증 틀인 SCQA(상황 Situation - 문제 Complication - 질문 Question - 해답 Answer)를 2단계 소제목(H2)으로 직관적으로 구성하여 스토리라인 전개.
- 카드 icard_52732602 D5 follow ref:ref_eval_invest — H1 타이틀 아래 1단 요약 리스트, 4개 H2 섹션, 1개 미니 표로 이어지는 1페이지 웹/원페이지 제안서 레이아웃. 불필요한 장식 요소를 배제한 단일 컬럼 조판.
- 카드 icard_5eb1933e D6 follow ref:ref_eval_invest — 단호하고 확신에 찬 평서문 종결(~다)과 간결한 명사형 종결을 균형 있게 사용(각 6회)하며 질문 블록(Q)에서만 유일하게 의문문 사용. 장황한 수식어 없이 짧은 단문 위주 구성.

<details><summary>생각</summary>

The request is to decompose a reference into its layers, identifying usable components. The primary tool for reference investigation will be employed.


Observed the result of the `rf_map`. The analysis reveals the structure and key sections within the referenced document, including an investment proposal and its corresponding sections: Situation, Problem, Questions, and Solution. Identified the saved layer measurement summary.


The task is to generate interpretation cards for each layer of the provided reference. It's necessary to determine if using an interpretation function is appropriate, based on the presence or absence of agreement within each layer. The first layer to analyze is the document layer.


The analysis of the saved interpretation cards is complete. The next step is to prepare a response to the user. This response will clearly separate the layered breakdown of the references into "usable patterns" and "unique content that should not be used," and present the information in a user-friendly format. The preferred display format will be clickable links using a specific syntax.




</details>

**답변**

[루미나랩스 시리즈A 투자 제안서](vdoc:ref-region/ref_eval_invest)를 6개 문서 층위(D1~D6)로 분해한 결과입니다. 레퍼런스는 **작성 패턴과 의사결정 방식**만 가져오며, 고유명사나 수치 등의 사실 내용은 가져오지 않습니다.

---

### 1. 층위별 분석 및 가져다 쓸 수 있는 패턴

| 층위 | 레퍼런스 채택 방식 (측정값 근거) | 내 문서에 가져다 쓸 패턴 | 해석 카드 |
| :--- | :--- | :--- | :--- |
| **D1 스캐너빌리티·밀도** | 문단 평균 20.4자, 볼드 빈도 문단당 0.38회. 서두에 핵심 결론을 굵게 배치하고 `문제-해법-증거-요청` 4개 항목을 볼드 키워드 개조식으로 요약. | **10초 스캔 요약 구조**: 문서 시작부에 1문장 결론 전진 배치 후 4줄 핵심 키워드 리스트로 요약 | `icard_f9e29deb` |
| **D2 데이터 증명** | 100자당 수치 4.03개. 2열 미니 테이블(`지표 \| 값`) 1개와 괄호 출처 표기(`(출처: ...)`) 결합. | **핵심 지표 2열 테이블 + 출처 표기**: 핵심 정량 지표 3~4개를 표로 집중 배치하고 직하단에 단문 출처 명시 | `icard_95fb8b62` |
| **D3 격식·메타** | 결재란, 버전 표, 문서 번호 전면 배제. 상단에 `연월 · Confidential` 1행만 배치. | **미니멀 메타라인**: 복잡한 공문서 양식 대신 날짜와 기밀 등급만 1줄로 가볍게 표기 | `icard_17e7f5a7` |
| **D4 서술 프레임워크** | `루미나랩스 시리즈A 투자 제안` → `상황` → `문제` → `질문` → `해답` 순서의 두괄식 전개. | **SCQA 스토리라인 구조**: 상황(Situation) → 문제(Complication) → 질문(Question) → 해답(Answer) 소제목 전개 방식 | `icard_aba3cab0` |
| **D5 조판·타이포** | H1 타이틀 1개 + H2 소제목 4개, 1개 미니 표로 이어지는 단일 컬럼 웹/원페이지 구성. | **1페이지 단일 컬럼 조판**: 군더더기 박스나 다단 그리드 없이 시선 이동을 수직으로 일원화 | `icard_52732602` |
| **D6 장르 규약·어조** | 확신에 찬 평서문(~다, 6회)과 단호한 명사형 종결(6회) 균형. '질문' 블록에서만 의문문 1회 사용. 감탄사/이모지 없음. | **확신형 단문 어조**: 수식어 없이 짧은 단문 위주의 서술 및 명사형 종결 리스트 혼용 | `icard_5eb1933e` |

---

### 2. 구분 가이드: 가져올 것 vs 가져오지 않을 것

* **가져올 수 있는 것 (패턴 · 구조)**
  * 서두 결론 + 4요소(`문제-해법-증거-요청`) 요약 블록 배치
  * SCQA(상황-문제-질문-해답) 4단계 본문 흐름
  * `지표 | 값` 형태의 2열 미니 정량 지표 테이블 레이아웃
  * 군더더기 없는 단문화된 평서문 종결 체계
* **가져오지 않는 것 (레퍼런스 고유 사실)**
  * 기업명, 솔루션 고유 명칭
  * 시장 규모(TAM), 유료 고객사 수, NPS, 투자 유치 희망액 및 자금 배분 수치
  * 레퍼런스 고유 문장 및 표현

---

> [!NOTE]
> 위 6개 해석 카드는 현재 **제안(Staged)** 상태로 등록되었습니다. 적용할 층위와 제외할 층위(예: 어조만 채택, 표 구조 제외 등)를 확정해 주시면 대상 문서 작업 시 반영합니다.

## F4-pin — F
> 이 핀 같은 느낌으로 가고 싶어.

- ✅ 핀 pinA1 읽음: 예 (해석 전)
- ✅ 핀의 층위 특정: 3/2 (결론[^\n]{0,12}(먼저|앞|맨)|두괄, 짧|한 줄|간결, 숫자|수치|증거)

**도구**: rf_map → rf_consensus → rf_read → rf_measure → rf_interpret

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#pin:pinA1(18)📌
- 카드 icard_eae0a66b D1 follow ref:ref_eval_invest#pin:pinA1 — 상단에 핵심 결론을 1행으로 선언하고, 하단에 4개 핵심 축(문제·해법·증거·요청)을 '키워드 — 한 줄 요약' 형태의 불릿 리스트로 압축 배치하여 정보 스캐너빌리티와 밀도를 극대화하는 요약 상자 패턴 채택
- 카드 icard_ea74625e D4 follow ref:ref_eval_invest#pin:pinA1 — 두괄식(Conclusion-first) 프레임워크로, 전체 제안의 핵심 논리 전개(문제 정의 → 해법 제시 → 검증/증거 → 최종 요구사항)를 단일 요약 블록 내에 순차적으로 구조화하는 서술 방식 채택

<details><summary>생각</summary>

에디터=없음 · 레퍼런스=패턴(ref:ref_eval_invest 핀). 작업대 지도를 바탕으로, "핀"이라는 키워드가 ref:ref_eval_invest 문서와 관련되어 있음을 확인. 에디터가 열려있지 않으므로, 문서 내에서 "핀"과 관련된 정보를 찾아야 함.


The request indicates a desire for a "pin-like" format, specifically referencing a `[D1] 요약 상자 (p1)` pin. This pin's content summarizes LuminaLabs' projected dominance in the enterprise document automation market within three years. It highlights the problem of redundant document rewriting, proposes an editor that combines forms and evidence, and cites paid services as evidence supporting this claim.


Editor status indicates no open document or active selection. The reference data, `ref:ref_eval_invest#pin:pinA1`, has been read and a suggestion card generated. System analysis indicates no relevant association between the editor/resource status and the reference data. The operational rules and work bench rules are under review. Reference procedure G6 is being reported.




</details>

**답변**

레퍼런스 [요약 상자](vdoc:ref-pin/pinA1) (`ref:ref_eval_invest#pin:pinA1`)의 패턴 분석을 완료하고, 이에 맞춘 해석 카드를 제안했습니다.

---

### 1. 핀 패턴 분석 요약
* **[D1] 스캐너빌리티 · 정보 밀도**:
  * 최상단에 핵심 결론을 1행으로 선언 (`결론: ...`)
  * 하단에 4대 핵심 축(`문제` — `해법` — `증거` — `요청`)을 **`키워드 — 한 줄 요약`** 형태의 불릿 리스트로 압축하여 평균 20자 내외의 높은 정보 밀도 유지
* **[D4] 서술 프레임워크**:
  * 결론 우선(Conclusion-first) 두괄식 배치
  * 문제 정의부터 최종 요구사항까지 이어지는 논리적 완결 구조를 단일 요약 박스 내에 정렬

---

### 2. 제안된 해석 카드
다음 해석 카드가 생성되었으며, 화면에서 확인 후 확정하실 수 있습니다.

* **icard_eae0a66b** ([D1 스캐너빌리티·정보 밀도](vdoc:ref-pin/pinA1)): 상단 1행 결론 선언 및 4대 축(문제·해법·증거·요청) 불릿 압축 패턴 채택 (`follow`)
* **icard_ea74625e** ([D4 서술 프레임워크](vdoc:ref-pin/pinA1)): 두괄식 논리 전개 및 단일 요약 블록 순차 프레임워크 채택 (`follow`)

> **참고 사항**: 레퍼런스 내의 고유명사나 특정 수치(기업명, 지표, 투자 금액 등)는 레퍼런스 고유 내용이므로 옮겨오지 않고 서식 구조와 서술 패턴만 적용합니다.

---

현재 에디터에 열린 문서나 지정된 슬롯 대상이 없습니다. 문서를 열거나 적용할 블록/슬롯을 선택해 주시면 위 해석 카드를 바탕으로 즉시 후보안을 제안해 드리겠습니다.

*확인하지 않은 출처: 리소스 — 마운트된 리소스가 없음*

## FE3-toggle — FE
> 투자 제안서의 D1이랑 D4를 요약 칸에 적용해줘. → D4는 빼고 다시.

- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ D4 제외 · D1 유지: ref_eval_invest:D1 ref_eval_invest:D1
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → rf_consensus → rf_outline → rf_read → wb_outline → rf_interpret → wb_propose → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_f55c9066 D1 follow ref:ref_eval_invest — 평균 20~30자 내외의 짧은 단락 구성 및 핵심 내용에 대한 선별적 볼드 적용 (스캐너빌리티 개선)
- 카드 icard_74a997fd D4 exclude ref:ref_eval_invest — 사용자 요청에 따라 결론 우선 및 문제-해법/SCQA 서술 프레임워크를 적용하지 않고, 기존 문서의 자연스러운 서술 흐름 유지
- 후보 prop_6df65ff8d0 ready 2안 compose · 오류 0 · 경고 0
- 후보 prop_a08909a1de needs_fix 2안 compose · 오류 2 · 경고 0
  - ✗ 후보 1 '1안: 단문 단락형 (기존 서술 흐름 유지 + 3단락 분해)': icard_74a997fd 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 단순 개조식 목록형 (프레임워크 라벨 없는 불릿 리스트)': icard_74a997fd 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_cabafc2f92 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

출처 판정: 에디터=대상 칸 p1 r_summary · 레퍼런스=패턴(ref_eval_summary)

The request targets specific sections (D1 and D4) within an investment proposal for summarization. The instruction suggests applying a predefined "summary" function to these sections.


레퍼런스 지도 분석 결과, 문단 길이 및 볼드체 사용 빈도를 통해 정보 밀도를 파악하고, 제목 순서를 통해 서술 프레임워크를 확인한다.

Analyzing the D1 and D4 dimensions from the references. D1 focuses on "scannability and information density," where short paragraph lengths (average 20.4 characters, max 56) and frequent use of bolding (0.38 frequency) for keywords are noted, alongside the use of bulleted lists. D4 concerns the "descriptive framework," specifically its section structure. Now proceeding to create rf_interpret cards based on these findings.


The analysis indicates a descriptive framework where the summary presents the conclusion upfront, followed by a concise list highlighting key elements like problem, solution, evidence, and request, aligning with an SCQA structure. The D1 dimension emphasizes short, scannable paragraphs (around 20 characters), bulleted lists, and bolded keywords. Now issuing rf_interpret cards based on these insights.


The document, "2025 Q1 Onboarding Improvement Operational Report," focuses on a large-scale project involving multiple teams to improve the onboarding process. The report details efforts to fundamentally change the user experience, comparing different approaches, specifically a template-first method versus starting with a blank document. A key metric is the time taken to complete the first document.


Deduction: Two interpretation cards have been generated, one formatted for easy scanning with short paragraphs and bullet points, and another using a narrative framework with a conclusion upfront followed by problem-solution-evidence or a SCQA structure as an alternative.

Next step: Propose a draft based on the available sources, targeting the summary slot and operating in compose mode.


Two draft options are proposed, both based on existing interpretation cards. The first prioritizes a conclusion-first structure with a bulleted list format, highlighting the problem, solution, result, and next steps. The second uses an SCQA framework to present the situation, complication, question, and answer. The drafts focus only on facts from my document and exclude external reference data.


HTML tag support requires verification. The "r_summary" slot from a read operation contained Markdown bolding, suggesting text or Markdown support.

</details>

**답변**

요청에 따라 **D4(서술 프레임워크)**를 제외하고, **D1(스캐너빌리티·정보 밀도)**만 적용하여 [요약](vdoc:slot/r_summary) 칸의 개선 후보 2안을 다시 제안했습니다.

---

### 해석 카드 변경 내역
- **`icard_74a997fd` (D4 따르지 않음)**: 결론 우선 및 문제-해법/SCQA 틀을 배제하고 기존 문서의 서술 맥락을 유지하도록 갱신
- **`icard_f55c9066` (D1 따름)**: 만연체 단락을 짧은 호흡으로 분해하고 핵심 키워드에만 선별적 볼드 적용

---

### 후보안 비교 및 선택 기준

- **1안: 단문 단락형 (기존 서술 흐름 유지 + 3단락 분해)**
  - **특징**: 기존 문서의 자연스러운 서술 흐름(배경 → 실행 내용 → 성과 및 과제)을 그대로 유지하면서, 20~30자 내외의 3개 단락으로 나누어 가독성을 높였습니다.
  - **추천**: 보고서 고유의 줄글 어조를 살리면서 읽기 편한 호흡을 확보하고자 할 때 적합합니다.

- **2안: 단순 개조식 목록형 (프레임워크 라벨 없는 불릿 리스트)**
  - **특징**: '문제-해법' 등의 프레임워크 라벨 없이 순수 개조식 불릿으로 구성하여 정보 스캔 속도를 극대화했습니다.
  - **추천**: 핵심 추진 경과와 지표를 한눈에 파악할 수 있는 간결한 요약을 원할 때 적합합니다.

---

### 반영 및 제외 내역 보고
- **따른 내용**: 짧은 단락 길이 및 선별적 볼드를 통한 스캐너빌리티 개선(D1)
- **따르지 않은 내용**: 레퍼런스의 결론 우선 및 SCQA/문제-해법 프레임워크(D4 제외), 레퍼런스 고유 수치 및 기업 정보
- **읽은 범위**: 레퍼런스 전체 18개 덩어리 확인 완료 (18/18)

*확인하지 않은 출처: 이력(개정 2건) — 이전 판 복원이 아닌 D1 패턴 기반 재구성이므로 참조하지 않음.*

## RF1-frame — RF
> 회의 결정들을 이 제안서의 논리 순서로 다시 짜면 어떻게 될까?

- ✅ 프레임 명시: 있음
- ✅ 원천 사실 매핑: 있음
- ✅ 레퍼런스 사실 미사용: 있음

**도구**: rf_map → ws_collect → rf_consensus → rf_read → read_file → read_file → read_file → read_file → read_file → read_file → rf_interpret

**읽은 원천**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_034d68fb D4 follow ref:ref_eval_invest · 대안 1 — 서두에 두괄식 요약(핵심 결론 및 문제-해법-증거-요청 리스트)을 배치한 후, 본문을 SCQA(상황-문제-질문-해답) 논리 흐름으로 전개한다.

<details><summary>생각</summary>

Initial assessment: The user wants to reorder meeting decisions according to the logical flow of a specific investment proposal. The task involves rearranging information based on a reference document's structure.


The reference map indicates an investment proposal, employing a SCQA (Situation, Complication, Question, Answer) structure, with a conclusion-first approach. Initial step involves reading the full content of the reference document.


The analysis reveals a clearly defined reference structure. It uses a descriptive framework (D4) that prioritizes the summary. This summary first presents the core conclusion, then outlines the problem, solution, evidence, and request, with a conclusion-first approach. The document's main logical structure follows the SCQA framework. This framework encompasses the situation, complication, and question elements for clarity.


I'm thinking through how to approach this.


Initial assessment indicates "rf_interpret" is successfully registered. Now, the focus shifts to mapping the relationships between meeting decisions and the SCQA logical structure of references. This involves analyzing resource meeting decisions, starting with identifying the core content and rationale behind each decision.


Analyzing decisions reveals a shift from seat-based pricing (Decision 01, later replaced) to usage-based pricing (Decision 03) due to observed variance in document processing volume during a pilot. Decision 04 outlines standardized onboarding templates aimed at reducing initial document completion time. The draft Decision D5 proposes holding off on external search API integration.

The SCQA framework reveals the progression of decisions based on specific customer insights. "Decision 02" identifies the target customer as the legal team, setting the initial situation. The identified complications include billing discrepancies, security constraints, and onboarding delays. The central question addresses how to maintain security, address usage variance, and reduce onboarding time.

The answer incorporates "Decision 03" to shift to usage-based pricing and "Decision 01" to implement a local indexing system for secure search.




</details>

**답변**

[에디터=없음(열린 문서 없음) · 레퍼런스=패턴(제안서 D4 서술 프레임워크) · 리소스=사실(회의 결정 카드 5건) · 관련 없음=에디터]

[(주)루미나랩스 시리즈A 투자 제안서](vdoc:ref-region/ref_eval_invest)는 **두괄식 요약(문제-해법-증거-요청)** 후 **SCQA(상황 → 문제 → 질문 → 해답)** 순서로 논리를 전개하는 서술 프레임워크(D4)를 사용하고 있습니다. 

리소스의 회의 결정 사항들을 이 논리 흐름에 맞춰 재구성한 구조는 다음과 같습니다.

---

### 1. 서두 요약 (Executive Summary)
* **결론**: 법무팀 타깃 파일럿 검증을 바탕으로, 보안을 유지하면서 사용량 기반 과금과 템플릿 중심 온보딩을 확정한다.
* **상황·문제**: 파일럿 과정에서 좌석 수 대비 처리량 편차(10배 이상)와 외부 유출 불가 보안 요구 확인.
* **해법**: 로컬 색인 검색 구축, 처리 페이지 수 기반 과금 전환, 계약서·의견서·메모 템플릿 3종 제공.

---

### 2. 본문 SCQA 논리 전개

#### ① 상황 (Situation) — 타깃 고객 정의
* **[Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_caeba56ff3)** (2025-01-06)
  * 양식이 정형화되어 성과 측정이 용이한 사내 법무팀 한 곳을 첫 파일럿 고객으로 선정.

#### ② 문제 (Complication) — 파일럿 검증 중 직면한 병목 및 제약
* **과금 모델 불일치**: 초기 좌석 기반 과금 가설([Decision 01 (v1)](vdoc:resource/file_9355258cfa))을 적용했으나, 법무팀 파일럿 결과 좌석 수보다 처리량 편차가 10배 이상 큼.
* **보안 요구사항**: 고객 문서를 외부 서비스로 전송할 수 없는 보안 제약 확인.
* **온보딩 소요 시간**: 초기 사용자의 첫 문서 완성 시간 단축 필요성 대두.

#### ③ 질문 (Question) — 핵심 해결 과제
* *“외부 데이터 전송 없이 보안을 지키면서, 실제 처리량 편차를 공정하게 반영하고 온보딩 시간을 절반으로 줄이려면 제품과 과금을 어떻게 재설계해야 하는가?”*

#### ④ 해답 (Answer) — 확정된 의사결정 체계
* **검색 엔진 로컬화**: **[Decision 01 — 검색은 로컬 색인으로 시작한다](vdoc:resource/file_1b8fa2e3c2)** (2025-01-06)
  * 보안 요구 충족을 위해 외부 검색 API 대신 로컬 색인(BM25)으로 첫 버전을 구현.
* **과금 모델 전면 개편**: **[Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_f6ab4714e3)** (2025-01-20)
  * 좌석 기반 요금제를 공식 폐기하고, 처리한 문서 페이지 수 기준 과금 체계로 전환.
* **온보딩 표준화**: **[Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_29714fca72)** (2025-01-20)
  * 계약서·의견서·내부 메모 3종 템플릿을 집중 제작하여 첫 문서 완성 시간을 기존 실측 기준선 대비 절반 이하로 단축.

---

### 레퍼런스 적용 및 합의 안내
* **따른 층위**: D4 서술 프레임워크 (두괄식 요약 + SCQA 전개 구조 차용)
* **따르지 않은 요소**: 레퍼런스의 고유 수치, 재무 지표(TAM, NPS 등), 투자 유치 문구는 반영하지 않고 리소스의 사실 결정만 매핑했습니다.
* **제안된 해석 카드**: `icard_034d68fb` (D4: 서두 두괄식 요약 및 SCQA 논리 전개 / 대안: 서두 요약 없이 SCQA 4단계 직접 전개)

확인하지 않은 출처: 에디터 — 열린 문서 없음