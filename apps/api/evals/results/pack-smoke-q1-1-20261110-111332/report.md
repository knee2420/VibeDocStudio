# 작업대 평가 — pack-smoke-q1-1

전체 1/1 · 튜닝 세트 1/1 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| REF-Q1-ambiguous | REF | ✅ | 6/6 | 90.6s | 46,614/243,080/7,432 | 13 | ready:2,ready:2 |

## REF-Q1-ambiguous — REF
> 요약을 이 레퍼런스처럼 써줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 해석 카드: 3/1 (D4:follow@blk:b3, D1:follow@blk:b4, D6:follow@blk:b9)
- ✅ 해석 갈림 다룸: 대안 해석 1장 · 후보별 따른 카드 조합 1가지
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 모든 후보가 카드를 따름: 2/2안 · [['icard_94639dd6', 'icard_697eea34', 'icard_b5818b25'], ['icard_94639dd6', 'icard_697eea34', 'icard_b5818b25']]
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_outline → wb_history → wb_patterns → rf_interpret → rf_interpret → rf_consensus → wb_propose → wb_propose → rf_coverage

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_94639dd6 D4 follow ref:ref_eval_invest#blk:b3 — 첫머리에 '**결론: [핵심 명제]**'를 배치하는 두괄식 결론 우선 구조를 채택함
- 카드 icard_697eea34 D1 follow ref:ref_eval_invest#blk:b4 · 대안 1 — 만연체 서술 대신 핵심 요소를 '- **항목명** — 요약' 형태의 개조식 목록으로 압축하여 정보 스캐너빌리티를 높임
- 카드 icard_b5818b25 D6 follow ref:ref_eval_invest#blk:b9 — 수식어와 중첩 접속사를 배제하고 30자 이내의 단문 평서문(~다)으로 간결하게 종결함
- 후보 prop_56c01b14fa ready 2안 compose · 오류 0 · 경고 1
- 후보 prop_b11699ea17 ready 2안 compose · 오류 0 · 경고 1

<details><summary>생각</summary>

I'm thinking through how to approach this.


Examined the `rf_map` information, revealing a SCQA (Situation - Complication - Question - Answer) structure within the referenced document. Noted short paragraph lengths and a moderate bolding frequency. Proceeding to read the entire reference (18 chunks) using `rf_read`.


The editor's context targets `slot:r_summary`, which contains the p1 summary. The editor document's context centers on the "2025 Q1 Onboarding Improvement Operational Report". Onboarding decisions include presenting templates on the first screen. Performance metrics show average first document completion at 45 minutes (measured from a baseline of 47), with 68% template usage. Plans for the next quarter involve deciding on external search API adoption.


I'm thinking through how to approach this.


Initial hypothesis: Apply the `rf_interpret` function to analyze the provided reference. The goal is to create interpretations based on specific layers and scopes within the reference material, focusing on elements like information density, narrative framework, and genre conventions.

The `rf_interpret` schema confirms the structure for generating cards with a specified layer, scope, adoption recommendation, reading explanation, and supporting evidence. The plan is to call `rf_interpret` with the defined parameters.


The scope specification requires either a single block identifier or a section/page format; hyphenated ranges like "b4-b7" are invalid. The correct `rf_interpret` scope format is `"ref:<id>[#pin:…|#p2|#sec:3|#blk:…]"`. Analysis of the `rf_map` indicates the desired scope spans multiple blocks: b1 through b7, plus b8 and b9, which are individual blocks, not ranges. I must translate this into valid individual block references.


Successfully registered three cards. Initial checks confirmed each card adhered to specified formatting guidelines (D4, D1, D6). The next step is to generate candidate summaries based on user requests, targeting the `slot:r_summary` slot.


The existing summary highlights the current focus: improving onboarding by providing templates and aims to reduce the initial document completion time, currently with a baseline of 47 minutes. Data suggests an average completion time of 45 minutes with the template usage rate at 68% among 10 users. A larger test group (30 users) will be used in the next phase to evaluate external search API integration.

To address the request, I will generate candidate summaries, creating mu

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 [루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest)의 서술 패턴을 반영하여 재구성한 2개 후보를 화면에 제안했습니다.

---

### 적용 및 해석 카드 내역

* **따른 층위 및 패턴**:
  * **D4 서술 프레임워크** (`icard_94639dd6`): 첫머리에 `**결론: [핵심 명제]**`를 두는 두괄식 결론 선언 구조 채택.
  * **D1 스캐너빌리티·정보 밀도** (`icard_697eea34`): 만연체 단락을 탈피하고 핵심 요소를 압축한 개조식 목록(`- **항목** — 내용`) 또는 프레임워크 레이블 적용.
  * **D6 장르 규약** (`icard_b5818b25`): 불필요한 수식어 및 중첩 접속사를 배제하고 30자 안팎의 간결한 평서문(~다) 종결.
* **따르지 않은 내용**: 레퍼런스의 고유명사 및 수치(기업명, 유치 금액, 시장 점유율 등)는 사실 근거로 이관하지 않았으며, 기존 에디터 문서 내 사실([주요 결정](vdoc:slot/r_dec_onb), [지표](vdoc:slot/r_metric_table), [다음 단계](vdoc:slot/r_next_plan))만을 근거로 배치했습니다.
* **레퍼런스 확인 범위**: [루미나랩스 투자 제안서](vdoc:doc/ref_eval_invest) 전체 18/18 덩어리(100%) 확인 완료.

---

### 후보별 특징 및 선택 기준

1. **1안: 결론 우선 + 핵심 개조식 목록 요약**
   * **특징**: 상단 결론 선언 후 `문제 — 해법 — 결과 — 계획`의 4대 핵심 요소를 개조식 리스트로 정리하여 한눈에 파악할 수 있도록 구성했습니다.
   * **추천 기준**: 경영진 보고 등 빠른 스캐닝과 핵심 지표 전달이 최우선인 경우 적합합니다.

2. **2안: 결론 우선 + SCQA 논증 프레임워크 요약**
   * **특징**: `상황 — 문제 — 질문 — 해답`의 스토리라인 논증 틀을 따라 문제 제기와 온보딩 템플릿 도입의 당위성을 단문으로 전개했습니다.
   * **추천 기준**: 의사결정의 배경 맥락과 문제 해결 논리 흐름을 명확히 전달하고자 할 때 적합합니다.

화면의 변경안 미리보기에서 적합한 후보를 선택하여 승인하실 수 있습니다.