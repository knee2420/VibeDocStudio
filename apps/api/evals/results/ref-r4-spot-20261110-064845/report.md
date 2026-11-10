# 작업대 평가 — ref-r4-spot

전체 10/10 · 튜닝 세트 10/10 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| REF-Q1-ambiguous | REF | ✅ | 6/6 | 80.6s | 36,548/124,999/5,853 | 9 | ready:2 |
| REF-Q5-exclude | REF | ✅ | 4/4 | 71.7s | 39,847/146,260/6,621 | 7 | needs_fix:2,ready:2 |
| REF-Q9-combine | REF | ✅ | 7/7 | 87.6s | 43,287/219,649/7,254 | 18 | needs_fix:2,ready:2 |
| REF-Q10-apply-consensus | REF | ✅ | 5/5 | 56.6s | 36,863/116,535/4,612 | 9 | ready:2 |
| REF-Q11-revise | REF | ✅ | 4/4 | 107.5s | 66,783/461,980/8,353 | 17 | ready:2 |
| REF-Q12-facts | REF | ✅ | 3/3 | 69.4s | 43,643/196,246/5,105 | 8 | - |
| REF-Q13-unrelated | REF | ✅ | 3/3 | 10.6s | 22,780/0/872 | 0 | - |
| REF-Q14-long-global | REF | ✅ | 3/3 | 47.2s | 39,530/138,413/4,177 | 5 | - |
| REF-Q15-vague-location | REF | ✅ | 5/5 | 64.5s | 49,906/250,029/4,452 | 12 | ready:2 |
| REF-Q16-implicit-pin | REF | ✅ | 5/5 | 79.1s | 52,677/285,786/6,007 | 14 | ready:2,ready:2 |

## REF-Q1-ambiguous — REF
> 요약을 이 레퍼런스처럼 써줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 해석 카드: 2/1 (D4:follow@blk:b3, D1:follow@blk:b4)
- ✅ 해석 갈림 다룸: 대안 해석 1장 · 후보별 따른 카드 조합 2가지
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 모든 후보가 카드를 따름: 2/2안 · [['icard_811ba674', 'icard_00835605'], ['icard_811ba674']]
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_patterns → wb_outline → wb_history → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_811ba674 D4 follow ref:ref_eval_invest#blk:b3 · 대안 1 — 문서 서두에 핵심 결론을 굵은 글씨 단일 문장으로 제시하고, 하단에 문제·해법·증거·향후 계획 형태의 개조식 목록으로 요약하는 결론 선행 프레임워크를 적용함.
- 카드 icard_00835605 D1 follow ref:ref_eval_invest#blk:b4 — 불릿 항목 머리에 키워드를 볼드 처리('- **키워드** — 내용')하고 문장을 간결하게 압축하여 스캐너빌리티를 극대화함.
- 후보 prop_48dc4b1310 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

The user wants a summary structured similarly to a specific reference document. Focusing on adapting the target document's style for the report summary. The first task is determining key sections for a concise structure mirroring the reference document.


The source determination involves assessing the editor's "r_summary" slot against the "ref_eval_invest" pattern, with no resource mounting or relevant history. Considering reading the complete "ref_eval_invest" reference, using the `rf_read` tool, as it contains 18 chunks. Also, evaluating the current slot's patterns using `wb_patterns`.


The reference `ref:ref_eval_invest` is the key. It presents a structure for analysis, starting with a concise conclusion. This is followed by a bulleted summary encapsulating the problem, solution, evidence, and request, forming the core information. There are also alternative structures.


The analysis suggests two interpretations of the reference pattern, labeled A and B. Interpretation A favors a conclusion-first framework followed by a bulleted summary. Interpretation B involves a concise Situation-Complication-Question-Answer (SCQA) narrative structure. The first interpretation is favored initially. Applying the first pattern is a good start.


The generated interpretation cards appear sound. Confirmed that the "D4 conclusion first + modified framework" approach contrasts with the "SCQA framework" alternative. Also verified the "D1 scan-ability and keyword bolding" implementation. Now examining the document's content to apply relevant facts.


Focused on the primary objective of reducing the initial document completion time from the baseline of 47 minutes. Compared presenting a template upfront versus starting with a blank document. Observed positive changes across several metrics, but some require further validation in the next quarter.


Considering two alternative structures for the document. The first is a conclusion-first summary with key bullet points, while the second uses an SCQA (Situation-Complication-Question-Answer) framework. The first option is a conclusion-first summary using key bullet points, including problem, solution, result, and plan. The second is an alternative interpretation reflecting the SCQA structure, outlining the situation, problem, and solution.


Achieved a 45-minute completion time and a 68% usage rate. The next step involves increasing the next quarter's sample size to 30 people for further validation. Considering the verification 

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 레퍼런스 [루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest)의 패턴을 반영한 변경 후보 2안을 제안했습니다. 화면 미리보기에서 확인하고 선택하실 수 있습니다.

---

### 반영된 패턴 및 해석 카드

- **D4 서술 프레임워크** ([icard_811ba674](vdoc:ref-region/ref_eval_invest#blk:b3)): 문서 서두에 굵은 글씨로 핵심 결론을 선행 제시하고 요약 목록을 구성하는 결론 선행 프레임워크를 적용했습니다.
- **D1 스캐너빌리티·정보 밀도** ([icard_00835605](vdoc:ref-region/ref_eval_invest#blk:b4)): 항목 머리 키워드 볼드 처리(`- **키워드** — 내용`)와 30자 내외의 짧은 단문 압축 방식을 적용했습니다.
- **미반영 층위**: 레퍼런스의 고유명사나 사업 수치(50억원, 3년, TAM 등)는 내 문서의 사실이 아니므로 일절 배제하고, 기존 보고서에 기술된 사실(첫 화면 템플릿 우선 제공, 완성 시간 47분 단축 목표 등)만 대응시켰습니다.

---

### 후보별 차이 및 선택 기준

1. **1안: 결론 선행 + 4단 개조식 요약** (따름: `icard_811ba674`, `icard_00835605`)
   - **특징**: 서두 1문장 결론 뒤에 **문제 · 해법 · 결과 · 계획**의 4개 핵심 불릿으로 압축했습니다.
   - **추천**: 보고서 요약의 가독성과 핵심 지표 전달력을 극대화하고자 할 때 권장합니다.

2. **2안: 상황 · 문제 · 해답(SCQA) 프레임워크 요약** (따름: `icard_811ba674` 대안)
   - **특징**: 레퍼런스 본문의 상황-문제-질문-해답 전개 방식을 차용하여 단락 간 인과 흐름을 살렸습니다.
   - **추천**: 문제 정의부터 해결 방안 및 후속 계획까지의 맥락 중심 전달이 필요할 때 권장합니다.

---
확인하지 않은 출처: 리소스 — 작업대에 마운트된 리소스 작업 공간이 없습니다.

## REF-Q5-exclude — REF
> 요약을 이 레퍼런스처럼 다듬되, 굵은 글씨로 강조하는 방식은 따라하지 마.

- ✅ 따르지 않음 카드: 1/1 (D1:exclude@전체, D4:follow@전체, D1:follow@sec:1)
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 굵은 글씨 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_read → wb_patterns → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_326a36c2 D1 exclude ref:ref_eval_invest — 레퍼런스는 핵심 문장 및 항목 서두마다 볼드(굵은 글씨)로 강조했으나, 사용자 지시에 따라 굵은 글씨 강조는 적용하지 않고 일반 텍스트로 구성한다.
- 카드 icard_67f68ed4 D4 follow ref:ref_eval_invest — 서두에 핵심 결론을 제시하고(두괄식), 핵심 요소(목표/접근/결과/과제 등)를 명확히 구분하여 전개하는 서술 프레임워크를 적용한다.
- 카드 icard_04f48ef5 D1 follow ref:ref_eval_invest#sec:1 — 장문 만연체(253자 1문장)를 짧은 개조식 항목과 간결한 단문으로 분할하여 정보 전달력과 가독성을 높인다.
- 후보 prop_5c6d1a45bf needs_fix 2안 restyle · 오류 3 · 경고 2
  - ✗ 후보 1 '안 1: 두괄식 결론 + 개조식 핵심 구조화 (볼드 배제)': icard_326a36c2 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '안 2: 두괄식 단락형 서술 구조 (볼드 배제)': icard_326a36c2 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '안 2: 두괄식 단락형 서술 구조 (볼드 배제)': icard_326a36c2 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_ac9b0c66cb ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


The reference materials are reviewed. Analysis of the editor's content reveals a focus on a large-scale onboarding project involving multiple teams. The project aimed to significantly improve the user experience through different approaches, including comparing template-first and blank document starting points. First document completion time was used as a baseline.


Initial assessment reveals a single, lengthy sentence within `slot:r_summary`, exceeding typical sentence length. Overuse of bold formatting within the text, as well as the structure lacking a clear initial conclusion. The reference text shows a D4 narrative structure, which is a different writing frame.


Initial plan involves transforming the reference text into a concise, scannable format, explicitly addressing the user's negative constraints. Considering the user's specific instruction to avoid bolding, the plan excludes bold formatting. The approach prioritizes a clear, structured framework with a direct, upfront conclusion, followed by a breakdown into key elements.

Now, generate the interpretation card using `rf_interpret`.


Analyzing the proposed interpretation cards, it appears `icard_67f68ed4` aligns best with the original content's focus on structured summarization, particularly the "two-column, top-down key conclusions" approach. `icard_04f48ef5`, while concise, might sacrifice some key detail, and `icard_326a36c2` does not adhere to the original requirements. Selecting `icard_67f68ed4` seems appropriate given the need for structured presentation of the summary. Now considering the original text provided in `slot:r_summary` to start writing the `wb_propose`.


Initial focus is on constructing the `wb_propose` based on the provided text, aiming for a structured summarization. Observing the original text, the core aspects involve improving the onboarding process through experimentation and comparison, with a primary goal of reducing the initial document completion time. The experiments compared template-first versus blank-document approaches. Noted improvements across several metrics, with some needing further validation next quarter. Structuring the summary using a bulleted, goal-oriented format appears appropriate to highlight the progress.


Considering two candidate summary formats: a bulleted list and a concise paragraph style, both mirroring the source's content focus on onboarding improvements. The goal is to create `wb_propose` o

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 [(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest)의 전개 패턴을 바탕으로 다듬어 2가지 후보를 제안했습니다. 화면 미리보기에서 확인하고 선택하실 수 있습니다.

---

### 층위별 해석 및 반영 내역
- **따름 (D4 서술 프레임워크 · [icard_67f68ed4](vdoc:kcard/icard_67f68ed4))**: 서두에 핵심 결론을 제시하고(두괄식), 목표·방식·결과·과제 구조로 논리 단계를 명확히 분리했습니다.
- **따름 (D1 스캐너빌리티 · [icard_04f48ef5](vdoc:kcard/icard_04f48ef5))**: 기존의 253자 단일 만연체 문장을 간결한 단문 및 개조식 구조로 재편했습니다.
- **따르지 않음 (D1/D5 볼드 강조 · [icard_326a36c2](vdoc:kcard/icard_326a36c2))**: 지시하신 대로 **굵은 글씨를 통한 강조 방식은 일절 적용하지 않고** 일반 텍스트로 구성했습니다.
- *레퍼런스의 고유명사 및 수치는 내 문서로 옮기지 않았습니다.*
- *레퍼런스 읽은 범위: 전체 18개 덩어리 확인 완료.*

---

### 제안 안 및 선택 기준

1. **안 1: 두괄식 결론 + 항목별 개조식 리스트 (굵은 글씨 배제)**
   - 두괄식 핵심 문장 아래에 `프로젝트 개요 / 실행 방식 / 핵심 목표 / 향후 과제`를 글머리 기호로 정돈했습니다.
   - **선택 기준**: 정보의 스캐너빌리티(가독성)를 극대화하여 보고서 핵심 항목을 직관적으로 확인하고 싶을 때 추천합니다.

2. **안 2: 두괄식 단락형 서술 구조 (굵은 글씨 배제)**
   - 글머리 기호 없이 두괄식 결론 문장과 본문 단락(실험 내용 및 향후 과제) 2개로 호흡을 끊어 정리했습니다.
   - **선택 기준**: 개조식 리스트 대신 차분하고 자연스러운 서술형 보고 문체를 선호할 때 추천합니다.

---
- 확인하지 않은 출처: 이력 (이전 판 복원 요청이 아니므로 미확인) · 리소스 (마운트 없음)

## REF-Q9-combine — REF
> 투자 제안서의 논증 흐름과 공공 보고서의 격식을 합쳐서 요약을 다시 써줘.

- ✅ 투자 제안서 따름 카드: 1/1 (D4:follow@전체, D6:exclude@전체, D6:follow@전체, D1:consult@전체)
- ✅ 공공 보고 따름 카드: 1/1 (D4:follow@전체, D6:exclude@전체, D6:follow@전체, D1:consult@전체)
- ✅ 카드 따름: 2/2안 · [['icard_1d47a57f', 'icard_fc8f3e9d', 'icard_623a4811'], ['icard_fc8f3e9d', 'icard_623a4811']]
- ✅ INV 카드 따름: ['icard_1d47a57f']
- ✅ PUB 카드 따름: ['icard_fc8f3e9d', 'icard_623a4811', 'icard_fc8f3e9d', 'icard_623a4811']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → wb_history → wb_outline → wb_read → rf_consensus → rf_consensus → wb_read → wb_read → wb_read → rf_read → rf_read → wb_patterns → rf_measure → rf_measure → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18) · ref:ref_eval_public(15)
- 카드 icard_1d47a57f D4 follow ref:ref_eval_invest — 두괄식 핵심 결론 및 논증 흐름(결론·문제·해법·증거·향후 계획)을 요약의 구조 틀로 채택함
- 카드 icard_973e2a94 D6 exclude ref:ref_eval_invest — 투자 제안서의 설득조 평서문 및 볼드 강조 어조는 공공 보고서 격식과 충돌하므로 배제함
- 카드 icard_fc8f3e9d D6 follow ref:ref_eval_public — 공공 보고서의 개조식 종결어미(~함, ~임, ~음 및 명사형 종결)와 건조한 행정 격식을 채택함
- 카드 icard_623a4811 D1 consult ref:ref_eval_public — 긴 장문 대신 항목별 글머리 기호(-)를 활용한 정보 밀도 및 스캐너빌리티 구조를 적용함
- 후보 prop_dcfea6dc2a needs_fix 2안 compose · 오류 2 · 경고 0
  - ✗ 후보 1 '1안: 논증 프레임워크 중심형 (결론 우선 개조식)': icard_973e2a94 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 공공 행정 서식 중심형 (항목별 요약 개조식)': icard_973e2a94 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_941f77cabb ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

에디터=대상 칸 r_summary(요약) · 레퍼런스=패턴(ref_eval_invest 논증 흐름, ref_eval_public 공공 격식) · 리소스=사실(마운트 없음) · 이력=원래 내용 및 맥락 확인. 요구사항은 투자 제안서의 논증 흐름과 공공 보고서의 격식을 결합하는 것. 논증 흐름을 파악하고 공공 보고서의 격식에 맞게 재구성해야 한다.


Analyzing the "investment proposal" reference reveals a "conclusion-first" structure, employing a pyramid approach. The argumentative flow follows a pattern: Conclusion -> Problem -> Solution -> Evidence/Metrics -> Future Plans/Request. This structure aligns with either SCQA or the conclusion-first model.


Proposing an interpretation card using the interpretation function. The card will use a conclusion-first structure with a problem-solution-evidence-future plan framework, drawing evidence from specific data blocks.


Initial assessment indicates multiple interpretation cards are proposed. One card, labeled icard\_1d47a57f, aligns with the D4 style, using a deductive approach. Another, icard\_973e2a94, deviates from the D6 style by excluding persuasive language and bold text. A third card, icard\_fc8f3e9d, correctly adheres to the D6 style, employing formal ending styles suitable for administrative documents.


The document "2025 Q1 온보딩 개선 운영 보고서" is the subject. The existing summary of the report is "이번 분기 온보딩 개선 작업은 여러 팀이 함께 참여한 대규모 프로젝트였으며, 사용자 경험을 근본적으로 바꾸기 위해 다양한 시도를 했고, 그 과정에서 템플릿을 먼저 보여 주는 방식과 빈 문서에서 시작하는 방식을 비교했으며, 기준선으로 삼은 첫 문서 완성 시간 47분을 줄이는 것을 최우선 목표로 두었고, 결과적으로 여러 지표에서 의미 있는 변화가 있었지만 아직 측정이 끝나지 않은 항목도 남아 있어 다음 분기에 추가 검증이 필요하다는 점을 강조하고 싶다." The original summary (prior to rev:3) was "Q1 온보딩 개선의 핵심은 템플릿 우선 제공이다. 첫 문서 완성 시간은 기준선 47분에서 크게 줄었다." The decisions made include maintaining the monthly flat rate and presenting a template on the first screen. Key metrics show the average first document completion time is 45 minutes (measured with 10 people), starting from a baseline of 47 minutes, and 68% of users used a template.


The initial document completion time decreased to 45 minutes, a reduction from the baseline of 47 minutes, facilitated by presenting a template on the first screen. However, existing users' preference for starting with blank documents suggests a slower adoption rate. The next steps involve evaluating the integration of an external search API and expanding the onboarding measurement to 30 participants, with PM Seomin-gyu as the responsible party.


"따르지 않음" 카드는 "follows"에 포함되지 않도록 수정해야 한다. 또한, 두 번째 안건의 종결어미가 부자연스러운 부분이 있어, 명사형 종결로 명확히 일치시켜야 한다. 두 번째 안건에서 처리해야 할 "따름" 카드는 두 개다.


Initial assessment indicates the need to exclude a specific

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 투자 제안서의 논증 흐름과 공공 보고서의 개조식 격식을 결합한 변경 후보 2안을 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

---

### 레퍼런스 반영 및 해석 카드

* **따른 결정**:
  * [시리즈A 투자 제안서](vdoc:ref/ref_eval_invest): **D4 서술 프레임워크** — 두괄식 핵심 결론 제시 및 '결론 → 문제 → 해법 → 증거 → 계획' 논증 구조 채택 (`icard_1d47a57f`)
  * [회의록 표준화 추진 계획](vdoc:ref/ref_eval_public): **D6 장르 규약** — 건조한 행정 개조식 종결어미(`~함`, `~임`) 및 명사형 종결 채택 (`icard_fc8f3e9d`)
  * [회의록 표준화 추진 계획](vdoc:ref/ref_eval_public): **D1 스캐너빌리티** — 글머리 기호 기반의 높은 가독성 레이아웃 참고 (`icard_623a4811`)
* **따르지 않은 결정**:
  * 투자 제안서의 설득조 평서문 종결어미와 볼드체 강조 어조는 공공 보고서 격식에 부합하지 않아 배제하였으며, 레퍼런스의 고유명사 및 수치는 일체 반영하지 않았습니다 (`icard_973e2a94`).
* **확인 범위**: 두 레퍼런스 모두 전문(18/18 덩어리, 15/15 덩어리)을 확인하여 미확인 범위는 없습니다.

---

### 후보별 차이 및 선택 기준

1. **1안: 결론 우선 논증형 (투자 제안 프레임워크 + 공공 개조식)**
   * **특징**: 핵심 결론을 두괄식으로 상단에 배치하고, 문제-해법-증거-계획의 4단계 논증 틀을 개조식 라벨로 명확히 드러냈습니다.
   * **추천 기준**: 임원 보고나 빠른 의사결정이 필요하여 논리적 인과관계와 성과 지표(45분 단축, 68% 사용률)를 직관적으로 전달하고자 할 때 적합합니다.

2. **2안: 행정 보고 서식형 (공공 보고서 표준 개조식)**
   * **특징**: 공공 기관 보고서의 표준 항목 나열 방식에 맞춰 추진 결과와 사실을 담백하게 정리했습니다.
   * **추천 기준**: 형식적 완결성과 절제된 격식이 중요한 공식 정기 보고서 형태를 원하실 때 적합합니다.

## REF-Q10-apply-consensus — REF
> 아까 정한 레퍼런스 해석대로 요약에 적용해줘.

- ✅ 레퍼런스 도구 rf_consensus|rf_map: rf_consensus
- ✅ D1 을 다시 해석하지 않음: 0장
- ✅ 확정 카드 cardC1 따름: ['cardC1', 'cardC1']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_consensus → wb_read → wb_outline → rf_read → wb_outline → wb_outline → wb_outline → wb_history → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#pin:pinA1(18)📌
- 후보 prop_8be6283b4b ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial suspicion was a misinterpretation of the reference document. Reviewing the chosen section, focusing on the confirmed interpretations, to ensure accuracy in the summary. The goal is now to precisely incorporate the established interpretations into the existing summary.


The current state includes two cards: one adhering to the specified format, the other not. The first card follows the "one-sentence conclusion on top, followed by Problem, Solution, Evidence, and Request" structure. The second card does not adhere to the "Situation, Complication, Question, Answer" flow.


The reference structure uses a top-level conclusion followed by four supporting bullet points detailing the problem, solution, evidence, and requests. This format will be used to structure the editor's factual findings.


온보딩 개선의 핵심은 템플릿 우선 제공이었다. 첫 문서 완성 시간 기준선은 47분에서 크게 줄었다.


Initial focus was on reducing the 47-minute baseline for first document completion by prioritizing template provision. Significant improvements were observed across various metrics. However, some measurements are pending completion, necessitating further validation in the next quarter. The summary should follow the "problem/solution/evidence/request" structure outlined in cardC1, placing the conclusion at the top. The "Show Don't Tell" principle applies; proposals for document changes will be submitted via a function call, enabling user selection from a preview.


온보딩 개선은 템플릿 우선 제공을 통해 첫 문서 완성 시간 단축에 초점을 맞추었다. 기존 47분 소요되던 첫 문서 완성 시간이 템플릿 제공 후 45분으로 단축되었다. 템플릿 사용률 68%를 달성했으나, 다음 분기에는 측정 표본을 30명으로 확대하여 추가 검증을 진행할 예정이다.


The focus is on restructuring the summary using the "problem/solution/evidence/request" format, with the conclusion at the top. The goal is to create a refined summary incorporating this structure, using the cardC1 reference. I'm aiming for concise HTML formatting with a conclusion callout and bullet points, while ensuring the summary remains authentic and avoids unnecessary narrative. I'll need to generate a HTML-formatted summary that follows this structure.


에디터=대상 칸 r_summary · 레퍼런스=패턴(확정 해석 2장) · 리소스=마운트 없음 · 이력=원래 상태 확인. The validation passed successfully, indicating the proposed solution displays as a preview on the user's screen. The response will concisely describe the differences between options and the criteria for selection.




</details>

**답변**

확정된 해석 카드([cardC1](vdoc:ref-pin/ref_eval_invest#pin:pinA1))의 구조를 바탕으로 [요약](vdoc:slot/r_summary) 칸에 대한 변경 후보 2안을 제안했습니다.

### 적용 내용 요약
- **따른 층위**: [cardC1](vdoc:ref-pin/ref_eval_invest#pin:pinA1) (D1 구조) — 맨 위 결론 상자를 두고, 아래에 `문제` · `해법` · `증거` · `요청`의 굵은 머리말 불릿 4개로 받치는 형식을 적용했습니다.
- **따르지 않은 층위**: [cardC2](vdoc:doc/ref_eval_invest) (D4 논증 흐름) — 기존 합의에 따라 SCQA 흐름은 배제했으며, 레퍼런스의 고유명사 및 수치는 일체 반영하지 않고 현재 문서 내 사실만 활용했습니다.

---

### 제안 후보 비교 및 선택 기준

1. **1안: 핵심 결정 및 실행 중심 요약**
   - **특징**: 온보딩 템플릿 우선 제공 결정과 실행 방향, 잔여 검증 필요성을 간결하게 요약했습니다.
   - **추천 기준**: 세부 수치보다 전체적인 프로젝트 방향과 다음 분기 실행 계획을 명확히 전달하고자 할 때 적합합니다.

2. **2안: 정량 지표 연계 요약**
   - **특징**: 에디터 내 주요 지표(기준선 47분, 템플릿 사용률 68%, 목표 표본 30명 등)를 증거 및 요청 항목에 명시했습니다.
   - **추천 기준**: 수치 기반의 실적 증명과 구체적인 검증 규모를 함께 부각하고자 할 때 적합합니다.

화면의 미리보기 창에서 원하는 안을 검토 후 선택해 주시기 바랍니다.

---
*확인하지 않은 출처: 리소스 — 마운트된 리소스가 없어 에디터 내부 사실과 이력만 참조함.*

## REF-Q11-revise — REF
> 이 레퍼런스 요약 부분의 핵심 결정이 뭐라고 봐? → 그게 아니라 핵심은 요약을 테두리 상자 하나로 묶어서 본문과 분리한 거야. 그 해석으로 요약 다시 써줘.

- ✅ 사용자 해석 반영 카드: 1/1 (D4:consult@sec:1, D1:consult@sec:1, D5:follow@sec:1)
- ✅ 수정 해석 카드를 따름: ['icard_d4da76cf', 'icard_d4da76cf']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → rf_consensus → rf_outline → rf_read → rf_read → rf_read → rf_read → rf_read → rf_measure → rf_interpret → wb_read → wb_outline → wb_history → wb_read → wb_patterns → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#sec:1(7) · ref:ref_eval_invest#sec:2(2) · ref:ref_eval_invest#sec:3(2) · ref:ref_eval_invest#sec:4(2) · ref:ref_eval_invest#sec:5(5)
- 카드 icard_dc34117b D4 consult ref:ref_eval_invest#sec:1 · 대안 1 — 두괄식 결론(BLUF)을 최상단에 두고, 하위 항목을 [문제-해법-증거-요청]의 4단계 개조식 프레임워크로 압축 제시하는 결정을 내렸다 (conclusion_first=true, bullet_ratio=0.67).
- 카드 icard_fab5a732 D1 consult ref:ref_eval_invest#sec:1 · 대안 1 — 결론 문장 전체 및 개조식 항목의 역할 레이블(문제/해법/증거/요청)에 머리말 볼드(Prefix Bold)를 적용해 한눈에 스캔할 수 있도록 정보 밀도를 조절했다 (bold_per_para=0.83, avg_sentence_chars=24.4).
- 카드 icard_d4da76cf D5 follow ref:ref_eval_invest#sec:1 · 대안 1 — 요약 섹션(§1) 전체를 독립된 테두리 상자(Callout 박스) 하나로 묶어 후속 본문(§2~§5)과 명확히 분리하는 조판 결정을 채택한다.
- 후보 prop_228908bb67 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

에디터=관련 없음 · 레퍼런스=핵심 대상 · 리소스=마운트 없음 · 이력=관련 없음. 요약 부분의 핵심 결정을 파악하기 위해 레퍼런스를 분석할 것이다.


The document appears to follow a Situation-Complication-Question-Answer (SCQA) structure, which suggests a clear narrative flow. The identified sections include an investment proposal, situation, problem, question, and answer. This structured approach helps in understanding the core argument.


The "Executive Summary" is identified as the section titled "루미나랩스 시리즈A 투자 제안." Initial focus is on understanding the core elements: problem, solution, and evidence, which are presented as lists within the document. The document's summary claims the company, 루미나랩스, will become the market leader in enterprise document automation within three years.


The reference's core decision-making within the summarized section is apparent. It employs a layered approach: First, a descriptive framework that leads with the "Conclusion: [Key Vision/Goal]" block. This "Conclusion-First" (BLUF) presentation immediately establishes the core message.


The summarized section uses a "Problem-Solution-Proof-Ask" structure, presenting an elevator pitch that concisely encapsulates the core message. It begins with the problem (market pain point and quantitative indicator), followed by the solution (the core solution), evidence (traction and validation data), and concluding with the ask (target resources).

The summarization technique employs bolded keywords at the beginning of list items and the conclusion, and keeps the average paragraph length short (29.5 characters) with a high bullet ratio (0.67) to ensure easy readability. Every item includes specific numbers or facts (e.g., 62%, 37 companies, NPS 71) to ensure the reader grasps the full picture at first scan.

The writing style integrates a combination of noun-form sentence endings with assertive declarative sentence endings, which results in a tone of clarity and confidence.


I'm thinking through how to approach this.


I'm thinking through how to approach this.


I'm thinking through how to approach this.


A new card, `icard_d4da76cf`, has been issued, triggering a document modification request. This necessitates proposing a candidate solution using `wb_propose`. The `wb_propose` function requires specifying the modification mode, target slot, candidate details including title, rationale, and supporting references from existing slots and original content, along with the HTML output for the summary slot.


Candidate solutions will be generated us

</details>

**답변**

요약을 테두리 상자(Box)로 묶어 본문과 시각적으로 분리하는 조판 결정([icard_d4da76cf](vdoc:ref-region/ref_eval_invest:sec:1) · D5)을 반영하여, [요약 칸](vdoc:slot/r_summary)에 적용할 후보 2안을 제안했습니다.

---

### 제안 후보 비교 및 선택 기준

* **1안: 테두리 상자 분리 + 구조화 개조식 요약**
  * **특징**: 상자 내부에 두괄식 핵심 결론을 배치하고, 하위 항목을 핵심 전환 · 시간 단축 · 추가 검증의 3대 포인트로 구조화했습니다.
  * **추천 기준**: 훑어보기(스캐너빌리티)가 중요한 경영진 보고 형식에 적합합니다.

* **2안: 테두리 상자 분리 + 단락형 서술 요약**
  * **특징**: 테두리 상자로 분리하되, 기존 보고서의 자연스러운 문맥 흐름을 유지하며 2개 문단으로 간결하게 압축했습니다.
  * **추천 기준**: 개조식 나열보다 자연스러운 서술형 브리핑을 선호할 때 적합합니다.

---

### 적용 및 해석 상태 안내
* **따른 층위**: [icard_d4da76cf](vdoc:ref-region/ref_eval_invest:sec:1) (D5 조판 — 요약 섹션의 테두리 상자 분리)
* **내용 근거**: [현재 요약](vdoc:slot/r_summary) 및 [초기 원본](vdoc:slot/orig:r_summary)의 사실 정보만 유지 (레퍼런스의 고유명사 및 수치는 배제)
* 화면의 미리보기 패널에서 각 후보를 확인하고 원하시는 안을 선택해 적용하실 수 있습니다.

---
확인하지 않은 출처: 리소스 — 마운트되어 있지 않으며, 현재 에디터 문서 내의 사실 관계를 바탕으로 서식을 재구성했습니다.

## REF-Q12-facts — REF
> 레퍼런스에 나온 고객사 수랑 NPS 수치로 요약을 채워줘.

- ✅ 레퍼런스 수치 없음: 없음
- ✅ 레퍼런스는 사실 근거가 아님을 밝힘: 있음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_overview → wb_read → rf_map → wb_outline → rf_read → ws_overview → wb_history → wb_read

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)

<details><summary>생각</summary>

I'm thinking through how to approach this.


The instructions define the roles of different sources: the editor focuses on the "scope to be fixed" determined by the user, while the references provide solutions to similar problems, showing a progression of decisions, information density, and formatting. Understanding the strict boundaries between these roles is crucial. The editor's scope is strictly limited to the user's defined "scope to be fixed."


The editor's scope is strictly defined by the user's input. When the request is for a change based on a similar case, the "follows" attribute needs the correct card ID. If the request is ambiguous, present multiple candidate alternatives. Any specific data, numbers, or unique names in the references are not my facts, but they provide context for the proposed changes.

Report on what was followed and what was not, along with any unread information and the user's card ID confirmation. Refrain from repeating the reference's specific data or unique names when explaining non-compliance. First determine which of the open sources (editor, references, resources) are relevant to the request.


The prompt requests filling a summary with the number of client companies and NPS scores from a reference. The operational rule specifies using the reference as factual basis.


The referenced data confirms the number of paid clients and NPS score. This information directly addresses the user's request to populate the summary with these specific figures. Applying this data should satisfy the prompt's requirements.


Following the specified procedure, the current task requires applying a pattern extracted from a reference to the target document. The reference's specific sentences, numbers, and proper nouns are not to be directly transferred; only the pattern is relevant. If the user's request is ambiguous, multiple interpretations (each a potential card/candidate) should be offered instead of forcing a single interpretation. A report is necessary to clarify which parts of the reference were followed and which were not, along with any unread scopes and the user's required card identification.


The system indicates no mounted data. This suggests a problem with data availability. Examining the onboarding report reveals key metrics: an average time of 47 minutes for initial document completion and a 68% template usage rate. These metrics, along with the data availability issue, require further investigation.


Document completion ti

</details>

**답변**

레퍼런스에 포함된 문장, 고유명사, 수치는 다른 조직의 의사결정 사례 및 패턴 참고용이며 본 문서의 사실 근거가 아닙니다. 운영 규칙상 **레퍼런스 고유 수치는 본 문서로 옮기지 않습니다.** 따라서 요청하신 레퍼런스의 수치를 반영하여 요약을 채우는 작업은 진행할 수 없습니다.

문서에 반영할 실제 사실 근거(고객사 수, NPS 등)가 필요하시다면:
1. **리소스 마운트**: Resource Manager에서 관련 원천 자료(운영 지표 보고서 등)를 체크하여 마운트해 주시면 해당 근거를 읽고 반영할 수 있습니다.
2. **문서 내 기존 지표 활용**: 현재 [2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report)의 [지표 표](vdoc:slot/r_metric_table)에 기록된 내부 지표(첫 문서 완성 평균, 템플릿 사용률 등)를 기반으로 [요약](vdoc:slot/r_summary)을 정돈하는 방안은 바로 진행 가능합니다.

## REF-Q13-unrelated — REF
> 이 문서 칸이 모두 몇 개야?

- ✅ 레퍼런스 본문을 열지 않음: 열지 않음
- ✅ 칸 수 답: 있음
- ✅ 안 연 출처 레퍼런스 — 이유 밝힘

**도구**: 

**읽은 원천**: 없음

<details><summary>생각</summary>

The document has 16 cells in total. 2 cells are empty, 6 lack supporting evidence, and 1 cell exceeds the word limit. The context provided specifies the document's structure and cell count.




</details>

**답변**

현재 문서([2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report))의 칸은 모두 **16개**입니다.

**페이지별 칸 구성:**
- [p1 요약](vdoc:page/rp1): 3개
- [p2 주요 결정](vdoc:page/rp2): 8개
- [p3 지표](vdoc:page/rp3): 3개
- [p4 다음 단계](vdoc:page/rp4): 2개

확인하지 않은 출처: 레퍼런스([프로젝트 매니저의 5대 필수 관리 문서](vdoc:doc/ref_eval_pm5)) — 단순 문서 칸 수 확인 요청으로 참고 불필요

## REF-Q14-long-global — REF
> 이 레퍼런스 문서 전체 구성을 장별로 요약해줘.

- ✅ 레퍼런스 도구 rf_outline|rf_map: rf_map, rf_outline, rf_outline, rf_outline, rf_outline
- ✅ 뒤쪽 섹션 언급: 4/17 (Hypersci, Rossum, Nanonets)
- ✅ 문서 바꾸지 않음: 후보 0건

**도구**: rf_map → rf_outline → rf_outline → rf_outline → rf_outline

**읽은 원천**: 없음

<details><summary>생각</summary>

The task is to summarize the entire structure of the reference document. First, checking for a section or chapter outline, `rf_map` or `rf_outline` will be checked to grasp its overall structure. Subsequently, using `rf_outline`, I will read to the end of the sections (using the offset if continuation is needed) to understand the structure; then `rf_read` will be used to read the content of each chapter.


Initial understanding of the document structure is complete. Observing the overall conversational/document flow reveals it's a PDF print/export of a Gemini conversation. It begins with essential documents for a project manager, then expands to document management's evolution, with the conversation expanding into IDP and agentic document systems across five key chapters or subject areas.


Examining the document in detail, the first conversation focuses on five essential management documents from a software/IT development perspective. The second conversation expands on this, outlining five key documents relevant to non-development business projects. The third section addresses the evolution of document management paradigms, from static to "living" to agentic systems.


Agentic documents leverage AI for automated action and workflow. This includes version control, collaborative capabilities, and automation/connectivity improvements. The ideal future workflow integrates real-time propagation of changes, for example, from a meeting minutes to a WBS/Jira/Roadmap. Project Manager roles evolve from manual record keepers to workflow orchestrators.

Analysis of IDP solutions and tools, including Docsumo, Upstage, and other alternatives, encompasses key features, use cases, and pricing models. A comparison of document processing pipelines including structured/semi-structured versus LLM-based solutions reveals different strengths. Global enterprise solutions like ABBYY and Hyperscience, AI SaaS alternatives like Rossum and Nanonets, and big tech cloud offerings such as Azure AI Document Intelligence, Google Cloud Document AI, and AWS Textract are all examined.

The limitations of single IDPs and the architectures for cross-document context linkage are explored. Current solutions primarily focus on single-file data extraction, lacking the ability to infer context across multiple documents and implement cascading updates. Alternatives include relational document/workspace solutions, cross-document AI analysis engines, and LLM-driven agentic automation pipelines with 

</details>

**답변**

[프로젝트 매니저의 5대 필수 관리 문서](vdoc:doc/ref_eval_pm5)는 대화형 질의응답을 바탕으로 **PM의 필수 문서 체계부터 문서 관리 패러다임의 진화, IDP 기술, 그리고 문서 간 연결·전파 아키텍처까지** 점진적으로 심화되는 5개 주요 장(섹션군)으로 구성되어 있습니다.

---

### 제1장. PM의 5대 필수 관리 문서 (SW/IT 개발 관점)
* **범위**: [1페이지 ~ 2페이지](vdoc:page/p1) (§2 ~ §7)
* **주요 내용**: IT/소프트웨어 프로젝트에서 일정·리소스·리스크 통제 및 산출물 방어를 위해 반드시 유지해야 할 5가지 핵심 문서와 각각의 활용 방식을 정의합니다.
  1. **프로젝트 차터 (Project Charter)**: 프로젝트 배경, 최종 KPI, 핵심 이해관계자 및 권한을 선언하는 베이스캠프
  2. **요구사항 정의서 (PRD / SRS)**: 비즈니스 요구를 기능/비기능 스펙과 제외 범위(Out of Scope)로 구체화한 단일 진실 공급원(SSOT)
  3. **작업 분할 구조도 (WBS)**: 계층형 작업 분할, 시작/종료일, 작업 간 의존성 및 담당자를 명시한 일정 지도
  4. **이슈 및 리스크 관리 대장 (Risk Register)**: 확률·영향도별 선제적 대응 전략(회피/완화/수용) 및 발생 이슈 추적
  5. **회의록 및 액션 아이템 (Meeting Minutes)**: 의사결정 이력 증명 및 구체적 담당자·기한이 지정된 액션 아이템 기록

---

### 제2장. 비개발·일반 프로젝트의 5대 필수 문서 (비개발 관점의 확장)
* **범위**: [3페이지 ~ 4페이지](vdoc:page/p3) (§8 ~ §12)
* **주요 내용**: 인건비 중심의 소프트웨어 프로젝트와 달리 실물 자산, 대외 협력업체, 복잡한 인허가 및 공정이 얽히는 일반 비즈니스(건설, 마케팅 캠페인 등) 관점으로 재정의합니다.
  1. **프로젝트 차터 및 기안서**: 결재 라인 및 공식 권한 위임 중심
  2. **통합 실행 계획서 및 일정표 (Scope & WBS)**: 외주·납품 업체의 선후행 의존성 통제
  3. **예산 및 자원 집행 대장 (Budget & Resource Tracker)**: 원자재비, 용역비, 장비 대여료 등 실물 비용 집행 및 예산 초과 방지
  4. **이해관계자 커뮤니케이션 계획서 (Stakeholder & Comm. Plan)**: 발주처, 하도급사, 지역 주민 등 집단별 보고 주기 및 채널 규정
  5. **리스크 및 이슈 대장 (Risk & Issue Log)**: 기상 악화, 자재 수급 지연 등 외부 변수 대응 플랜 B 수립

---

### 제3장. 문서 관리 패러다임의 진화 (Static → Living → Agentic)
* **범위**: [4페이지 ~ 7페이지](vdoc:page/p4) (§12 후반 ~ §15)
* **주요 내용**: 파일 저장 중심에서 협업 클라우드, 그리고 AI 에이전트 결합으로 이어지는 3단계 진화 모델을 비교 분석합니다.
  * **진화 3단계**:
    * **정적 문서 (Static Document)**: 완성 시점에 정보가 박제되는 파일 기반(v1, v2) 관리 (EDMS)
    * **살아있는 문서 (Living Document)**: 단일 진실 공급원(SSOT) URL 기반으로 다수가 실시간 동시 수정하는 블록/데이터 중심 관리
    * **에이전틱 문서 (Agentic Document)**: AI와 자동화 알고리즘이 결합하여 '문서가 곧 행동(Action)'이 되는 능동형 워크스페이스
  * **문서 경계의 융합 (Convergence)**: 회의 음성에서 AI가 일정 지연 합의를 추출하면 WBS, Jira 티켓, 로드맵, Slack 알림이 연쇄적으로 자동 갱신되는 구조
  * **PM 역할 변화**: 수동 기록/전달자(Clerk)에서 자동화 워크플로우를 설계하고 예외 상황을 통제하는 시스템 오케스트레이터(Orchestrator)로 전환

---

### 제4장. IDP(지능형 문서 처리) 솔루션 및 대안 분석
* **범위**: [7페이지 ~ 12페이지](vdoc:page/p7) (§16 ~ §29)
* **주요 내용**: 비정형 문서에서 정형 데이터를 추출하는 IDP 솔루션의 대표 사례와 시장 구도를 정리합니다.
  * **Docsumo 분석**: 청구서·송장 자동화, 물류/금융 문서 파싱 기능 및 티어별 요금제 구조
  * **Upstage (Document AI) 비교**: 정형/반정형 파이프라인 중심(Docsumo) vs LLM 결합 및 한국어 문서 이해 최적화(Upstage)의 접근 방식 차이
  * **글로벌 IDP 대안군**:
    * 엔터프라이즈 표준: ABBYY(레거시/컴플라이언스 최강), Hyperscience(필기체 인식 및 99% 정확도)
    * 클라우드 AI SaaS: Rossum(템플릿 프리 인보이스 처리), Nanonets(개발자 친화 API)
    * 빅테크 서비스: Azure Document Intel

## REF-Q15-vague-location — REF
> 그 레퍼런스에 표 있잖아, 그것처럼 지표 해설을 표 형식으로 정리해줘.

- ✅ 레퍼런스 도구 rf_find|rf_outline: rf_find
- ✅ 표 위치로 좁힌 카드: 1/1 (D2:follow@blk:b35)
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 표 형식: 2/2안
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → rf_find → rf_consensus → rf_read → rf_read → rf_read → wb_read → rf_measure → rf_measure → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_seoul#blk:b12(1) · ref:ref_eval_seoul#blk:b35(1) · ref:ref_eval_seoul#blk:b65(1)
- 카드 icard_2afbb43d D2 follow ref:ref_eval_seoul#blk:b35 — 항목별 상세 내용을 줄글 대신 '구분/항목 | 측정값 | 비고(내용)' 구조의 표로 정형화하여 가독성과 데이터 증명성을 높임
- 후보 prop_40094967a5 ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

The user's request is to format a specific metric's explanation as a table, drawing inspiration from a provided reference. The key data for the target explanation resides within the editor's content (r_metric_body) for the specified page (rp3). This process leverages existing information in the editor rather than external resources.


The selected slot is `r_metric_body`, and it needs to be formatted as a table, as requested. The content of `r_metric_body` currently includes a single data point. The goal is to transform this data into a table format.


Proposing an interpretation card. The reference's table structure focuses on data demonstration methods and typography. Scope includes specific blocks within a reference. The adoption is "follow" since the user requested a table format. The reading suggests the reference describes complex or structured items.


The suggested interpretation card needs to be proposed for the target slot. The current content of the slot must be considered when constructing the proposal. The proposal will need to follow the rules for document modification requests, which indicate that the modification should be done by proposing a candidate instead of explaining it in words.


Initial hypothesis: reformat the existing text in "slot:r_metric_body" into a table format. Considering two table options: a 3-column table (" 구분 | 측정값 | 비고 ") and a 2-column table (" 항목 | 내용 "). The goal is to restyle the existing data, so "restyle" mode is likely appropriate for the request. The generated table should accurately reflect the information currently within "slot:r_metric_body," such as "첫 문서 완성 평균 45분, 측정 인원 10명."


The initial text indicates an average completion time of 45 minutes for the first document, with a sample size of 10 people. The goal is to avoid restyling warnings while preserving the original meaning. Potential solutions involve increasing word preservation, using a "compose" mode, or more directly incorporating the original context. Two options are proposed, the first summarizing the original text, and the second a more concise alternative.


The existing proposal has already passed validation, but improving word preservation is a worthwhile goal. Considering the original text, a refined re-proposal should be possible, focusing on maintaining vocabulary. Even if the current proposal is acceptable, a more refined one could improve clarity, so preparing a slightly more detailed option is worth the effort.




</details>

**답변**

레퍼런스([ref_eval_seoul](vdoc:resource/ref_eval_seoul))의 [표 구조](vdoc:resource/ref_eval_seoul#blk:b35)를 분석하여 [지표 해설](vdoc:slot/r_metric_body)의 서술형 문장을 표 형식으로 전환한 2가지 후보안을 제안했습니다.

---

### 레퍼런스 반영 및 해석 카드
- **채택 층위**: **D2 근거·데이터 증명 방식** (`icard_2afbb43d`)
  - 레퍼런스([blk:b35](vdoc:resource/ref_eval_seoul#blk:b35))의 테이블 구조화 방식(구분/항목과 수치·내용을 명확히 분리)을 차용했습니다.
  - 레퍼런스의 고유 명칭과 수치는 배제하고, 기존 [지표 해설](vdoc:slot/r_metric_body)에 기록된 사실(평균 45분, 측정 인원 10명)만 보존해 구성했습니다.

---

### 후보안 비교 및 선택 기준

1. **1안: 3열 상세 표 (구분 · 측정 결과 · 비고)**
   - **구조**: `구분 | 측정 결과 | 비고` 3개 열 구성
   - **특징**: 첫 문서 완성 시간(평균 45분)을 중심 결과로 두고, 표본 정보(10명)를 비고란에 배치하여 정형 보고서 스타일에 적합합니다.

2. **2안: 2열 핵심 요약 표 (항목 · 내용)**
   - **구조**: `항목 | 내용` 2개 열 구성
   - **특징**: 완성 시간과 인원을 행 단위로 명확하게 쪼개어 단순 명료하게 전달하고자 할 때 적합합니다.

화면의 미리보기에서 적합한 안을 선택해 검토를 확정해 주시기 바랍니다.

*확인하지 않은 출처: 리소스 — 마운트된 외부 원천 자료 없음 (에디터 내 데이터 기반 작성)*

## REF-Q16-implicit-pin — REF
> 지표 해설을 레퍼런스처럼 다듬어줘.

- ✅ 핀 pinP1 읽음: 예 (해석 전)
- ✅ 해석 카드: 2/1 (D5:follow@pin:pinP1, D6:follow@pin:pinP1)
- ✅ 카드 따름: 2/2안 · [['icard_f62054b2'], ['icard_f3c94caa', 'icard_f62054b2']]
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → rf_find → wb_patterns → rf_read → rf_measure → wb_read → wb_history → wb_history → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_pm5#pin:pinP1(1)📌 · ref:ref_eval_pm5#p3(13)
- 카드 icard_f3c94caa D5 follow ref:ref_eval_pm5#pin:pinP1 · 대안 1 — 3열 구조화 표(지표 항목 | 측정 결과 | 대상/조건)를 활용하여 정보 밀도를 높이고 한눈에 파악되도록 조판함
- 카드 icard_f62054b2 D6 follow ref:ref_eval_pm5#pin:pinP1 · 대안 1 — 서술어 종결을 명사형 종결로 통일하여 간결하고 격식 있는 보고서 어조를 취함
- 후보 prop_e480540b0a ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_df7acb3d18 ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

The target is the metric body in the editor, and the reference is a specific pattern. The task involves refining the metric body like a reference document, which suggests stylistic improvements or content restructuring based on existing information, not external data.


Examining the document structure reveals a three-column table format, likely structured as "Document Name | Core Objective | Key Management Targets". The table might present structured information with the potential for related contextual analysis. The focus now shifts to identifying any surrounding commentary or explanations associated with the table's presented information.


Deduction from the evaluation data indicates a preference for table-formatted summaries with concise, noun-based sentence endings. The information density in the paragraphs is high, suggesting a need for brevity. Considering the paragraph structure in previous examples and the table formatting observed, it's beneficial to organize information by splitting content into sections labeled with key items and important results.


The target slot (`slot:r_metric_body`) requires refinement to match the reference (`ref:ref_eval_pm5`), specifically adhering to the `pin:pinP1` details from page 3, focusing on the table/typography structure (D5) and nominal sentence endings/formal tone (D6), and inter-paragraph structure (D1). Now comparing the specifics.


Card generation complete:
- `icard_f3c94caa` ref:ref_eval_pm5#pin:pinP1, formatted to increase information density with a three-column structure (indicator | measurement | target/condition); Alternative: use a bulleted list to clearly separate key figures and targets.
- `icard_f62054b2` ref:ref_eval_pm, based on D6.


The `slot:r_metric_body` is plain text, not HTML, which is important for restructuring the content. The proposed candidate restructures the information into a three-column table format, aligning with the style of `icard_f3c94caa` and `icard_f62054b2`, but uses a table element directly in the `r_metric_body` slot. The updated format is designed to present the key figures and target in a structured table.


The existing table within `slot:r_metric_body` might lead to consecutive tables, prompting consideration of alternative formats like a bulleted list or a structured table to enhance presentation. Two candidates for `r_metric_body` are considered: a bulleted list using noun-form sentence endings, following D6's convention and D5's alternative; or a table format 

</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸을 레퍼런스 [3쪽 표](vdoc:ref-pin/pinP1)의 조판 및 서술 패턴에 맞추어 다듬은 2가지 후보를 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

---

### 제안된 해석 카드
* **`icard_f3c94caa` (D5 타이포그래피·조판)**: 3열 구조화 표(`항목 | 결과 | 대상`)를 채택하여 정보 파악 속도와 밀도를 향상.
* **`icard_f62054b2` (D6 장르 규약)**: 평서문 서술(~다) 대신 명사형 종결로 통일하여 격식 있는 보고서 어조 준수.

---

### 후보 안내 및 선택 기준

1. **1안: 개조식 명사형 종결안** (`icard_f62054b2` 반영)
   * **특징**: 상단의 [지표 표](vdoc:slot/r_metric_table)와 시각적으로 겹치지 않도록 텍스트 개조식 구조를 유지하되, 명사형 종결로 간결하게 정리했습니다.
   * **선택 기준**: 상단 표의 보조 설명 텍스트로서 자연스러운 문단 흐름을 유지하고자 할 때 권장합니다.

2. **2안: 3열 구조화 표안** (`icard_f3c94caa`, `icard_f62054b2` 반영)
   * **특징**: 레퍼런스 핀의 3열 표 형식을 직접 적용하여 측정 항목, 결과 수치, 표본 인원을 완전한 표 형태로 규격화했습니다.
   * **선택 기준**: 수치와 측정 대상을 즉각적으로 대조할 수 있도록 지표 해설 자체를 도표화하고자 할 때 권장합니다.

> **레퍼런스 적용 범위 안내**:
> * **반영**: 레퍼런스의 3열 표 조판(D5)과 명사형 종결(D6) 패턴만 추상화하여 적용했습니다.
> * **미반영**: 레퍼런스 본문의 고유명사, 서술 내용, 수치는 일체 반영하지 않고 기존 문서의 사실(평균 45분, 10명)만 보존했습니다.
> * **확인하지 않은 출처**: 리소스(마운트 없음), 이력(해당 칸의 변경 이력 없음)