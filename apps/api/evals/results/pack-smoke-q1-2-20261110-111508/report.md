# 작업대 평가 — pack-smoke-q1-2

전체 1/1 · 튜닝 세트 1/1 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| REF-Q1-ambiguous | REF | ✅ | 6/6 | 73.2s | 37,515/161,419/5,943 | 16 | ready:2 |

## REF-Q1-ambiguous — REF
> 요약을 이 레퍼런스처럼 써줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 해석 카드: 3/1 (D4:follow@sec:1, D1:follow@sec:1, D2:consult@sec:1)
- ✅ 해석 갈림 다룸: 대안 해석 1장 · 후보별 따른 카드 조합 2가지
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 모든 후보가 카드를 따름: 2/2안 · [['icard_d6b1ddf5', 'icard_dc8b8c25', 'icard_6d93443e'], ['icard_dc8b8c25', 'icard_6d93443e']]
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_outline → wb_read → rf_map → rf_consensus → rf_outline → rf_read → wb_history → wb_read → wb_read → wb_read → wb_read → wb_read → rf_measure → wb_patterns → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_d6b1ddf5 D4 follow ref:ref_eval_invest#sec:1 — 결론 문장을 최상단에 두괄식으로 제시한 후, 핵심 항목(문제-해법-증거/결과-다음 단계)을 4개 항목의 개조식으로 요약하는 프레임워크를 적용한다.
- 카드 icard_dc8b8c25 D1 follow ref:ref_eval_invest#sec:1 — 평균 30자 안팎의 단문과 개조식 불릿을 적극 활용(bullet_ratio 약 0.67)하고, 단어 남발형 볼드를 지양하고 항목 라벨에만 볼드를 적용하여 스캐너빌리티를 극대화한다.
- 카드 icard_6d93443e D2 consult ref:ref_eval_invest#sec:1 · 대안 1 — 레퍼런스의 수치 자체는 배제하고, 내 문서의 측정 결과(평균 45분 단축, 템플릿 사용률 68%)를 증거 항목에 명시하여 데이터 밀도를 확보한다.
- 후보 prop_df08f91ccd ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


Initial hypothesis is that reading the referenced chunks (`ref:ref_eval_invest`) and the editor's contents (including history) will provide necessary context. The history indicates original content is available in `slotId="r_summary"`. Proceeding to read the history, original content, and the details of p2, p3, and p4 from the editor.


The core improvement centers on prioritizing template provision during onboarding. The initial document completion time significantly decreased from a baseline of 47 minutes. The observed metric indicates an average initial document completion time of 45 minutes for a group of 10 users who utilized templates.


The analysis reveals a significant contrast. The `slot:r_summary` shows a single long paragraph with excessive bolding and an overuse of emphasis, while the reference (`ref:ref_eval`) provides a different structure. This contrast suggests that the current summary is not ideal, and needs refinement.


Initial assessment: Multiple interpretation cards have been suggested. One card (`icard_d6b1ddf5`) follows the D4 format, prioritizing the conclusion and using a key bullet-point style. Another (`icard_dc8b8c25`) adopts a concise, bulleted format from D1 with bold emphasis. The last (`icard_6d93443e`) is inspired by D2, referencing internal documents for support, with an alternative SCQA structure suggested. Generating a proposal with `wb_propose`, incorporating the selected interpretation cards and adhering to the user's requested summarization style.


Two proposal alternatives emerged as strong candidates. The first adopts a D4-style conclusion-first approach with a 4-part structure (problem-solution-evidence/result-next steps). The second follows an SCQA (Situation-Complication-Question-Answer) framework, drawing from D2-style internal document referencing.


The candidate passed the verification. Now, the response needs to be composed. Reviewing operational rules and checklists, starting with "source judgment."




</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 [레퍼런스](vdoc:ref-region/ref_eval_invest)의 프레임워크 및 조판 스타일에 맞춰 개편한 2가지 후보안을 작업대 미리보기에 제안했습니다.

---

### 제안된 후보안 비교

* **제1안: 두괄식 결론 + 4단 개조식 요약 (레퍼런스 §1 구조)**
  * **특징**: 상단에 핵심 결론을 두괄식 볼드로 제시한 뒤, `문제 — 해법 — 결과 — 다음 단계`의 4개 불릿 항목으로 정리했습니다.
  * **추천 기준**: 임원 보고 등 빠른 의사결정과 요약 중심의 스캐너빌리티가 최우선일 때 적합합니다.
  * **반영 해석 카드**: `icard_d6b1ddf5` (D4 서술 프레임워크), `icard_dc8b8c25` (D1 정보 밀도)

* **제2안: SCQA(상황·문제·질문·해답) 구조 요약 (레퍼런스 §2~§5 대안 구조)**
  * **특징**: `상황 — 문제 — 질문 — 해답 — 과제`의 흐름으로 개선 추진 배경과 해답의 인과관계를 논리적으로 설명합니다.
  * **추천 기준**: 프로젝트의 추진 논리와 문제 해결 과정을 설득력 있게 전달하고자 할 때 적합합니다.
  * **반영 해석 카드**: `icard_dc8b8c25` (D1 정보 밀도), `icard_6d93443e` 대안 (D2 논증 방식)

---

### 레퍼런스 적용 및 사실 근거 안내
* **반영한 패턴**: 레퍼런스의 간결한 단문 구성(평균 30자 안팎), 라벨 중심의 볼드 처리, 개조식 불릿 목록 구조를 반영했습니다.
* **배제한 항목**: 레퍼런스 고유의 고유명사 및 수치는 내 문서로 옮기지 않았습니다. 사실 수치(평균 45분 단축, 템플릿 사용률 68% 등)는 내 문서의 [지표 표](vdoc:slot/r_metric_table), [지표 해설](vdoc:slot/r_metric_body), [온보딩 결정](vdoc:slot/r_dec_onb) 및 [다음 분기 계획](vdoc:slot/r_next_plan)을 근거로 작성했습니다.
* **해석 카드 확정 안내**: 제안된 해석 카드(`icard_d6b1ddf5`, `icard_dc8b8c25`, `icard_6d93443e`)는 화면에서 검토 후 확정하실 수 있습니다.