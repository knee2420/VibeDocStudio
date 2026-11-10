# 작업대 평가 — ref-r2

전체 15/16 · 튜닝 세트 15/16 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| REF-Q1-ambiguous | REF | ✅ | 6/6 | 108.4s | 50,848/259,504/10,905 | 15 | ready:2 |
| REF-Q2-layer-only | REF | ✅ | 4/4 | 52.6s | 38,163/115,933/4,122 | 7 | needs_fix:2,ready:2 |
| REF-Q3-pin | REF | ❌ | 1/5 | 43.9s | 38,297/132,198/4,094 | 8 | - |
| REF-Q4-layer-area | REF | ✅ | 5/5 | 63.4s | 38,657/150,920/5,919 | 9 | needs_fix:2,ready:2 |
| REF-Q5-exclude | REF | ✅ | 4/4 | 49.3s | 40,654/143,851/5,512 | 8 | needs_fix:2,ready:2 |
| REF-Q6-consult | REF | ✅ | 5/5 | 69.4s | 41,817/178,801/6,528 | 11 | needs_fix:2,ready:2 |
| REF-Q7-analyze | REF | ✅ | 4/4 | 43.6s | 34,842/111,090/3,112 | 5 | - |
| REF-Q8-contrast | REF | ✅ | 3/3 | 49.9s | 39,414/146,953/4,260 | 10 | - |
| REF-Q9-combine | REF | ✅ | 7/7 | 86.6s | 43,704/206,004/7,006 | 11 | ready:2 |
| REF-Q10-apply-consensus | REF | ✅ | 5/5 | 34.3s | 32,180/65,883/3,204 | 4 | ready:1,ready:1 |
| REF-Q11-revise | REF | ✅ | 4/4 | 90.0s | 52,361/288,546/7,488 | 10 | ready:2 |
| REF-Q12-facts | REF | ✅ | 3/3 | 48.5s | 42,257/186,840/3,733 | 7 | - |
| REF-Q13-unrelated | REF | ✅ | 3/3 | 10.0s | 22,664/0/729 | 0 | - |
| REF-Q14-long-global | REF | ✅ | 3/3 | 65.4s | 61,958/468,456/4,130 | 12 | - |
| REF-Q15-vague-location | REF | ✅ | 5/5 | 53.7s | 42,831/171,288/3,646 | 10 | ready:2 |
| REF-Q16-implicit-pin | REF | ✅ | 5/5 | 100.6s | 42,448/171,609/5,441 | 11 | ready:2 |

## REF-Q1-ambiguous — REF
> 요약을 이 레퍼런스처럼 써줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 해석 카드: 3/1 (D4:follow@blk:b3, D1:follow@blk:b4, D6:follow@blk:b4)
- ✅ 해석 갈림 다룸: 대안 해석 2장 · 후보별 따른 카드 조합 1가지
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 모든 후보가 카드를 따름: 2/2안 · [['icard_3c1239f4', 'icard_c3b34b5a', 'icard_3610f038'], ['icard_3c1239f4', 'icard_c3b34b5a', 'icard_3610f038']]
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → wb_outline → wb_patterns → rf_consensus → rf_read → rf_coverage → wb_history → wb_read → wb_read → wb_read → wb_read → rf_contrast → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_3c1239f4 D4 follow ref:ref_eval_invest#blk:b3 · 대안 1 — 최상단에 굵은 글씨로 핵심 결론을 먼저 제시하고, 하위에 문제·해법·증거·요청(다음단계)의 4대 핵심 축을 개조식 리스트로 배치하는 두괄식 요약 프레임워크를 적용한다 (b3~b7, conclusion_first=True).
- 카드 icard_c3b34b5a D1 follow ref:ref_eval_invest#blk:b4 · 대안 1 — 기존 253자짜리 장문 1단락을 해체하여 평균 20~30자 내외의 짧은 단문과 개조식 불릿으로 정보 밀도와 스캐너빌리티를 극대화한다 (avg_para_chars 20.4, long_para_ratio 0.0).
- 카드 icard_3610f038 D6 follow ref:ref_eval_invest#blk:b4 — 불릿 머리에 [**핵심어** — 서술] 형식을 사용하고, 간결한 명사형 또는 단정적 종결어미를 채택한다 (b4~b7).
- 후보 prop_8a84edac30 ready 2안 compose · 오류 0 · 경고 2

<details><summary>생각</summary>

I'm thinking through how to approach this.


Editor is the target (`r_summary`), referencing a document with specific page/block/slot structure. The reference document `ref:ref_eval_invest` will be analyzed for patterns. Since the resource is not mounted and history has only two revisions, workbench and reference tools seem sufficient.


Analyzing `wb_outline` and `wb_patterns` associated with the `r_summary` slot to understand the existing editor content and document structure. This involves checking if any factual content needs to be gathered from the document's broader context, specifically pages 1, 2, or 3.


Initial assessment of the reference document reveals key blocks of information. The blocks include the company name, a confidentiality notice, and a crucial conclusion about the company's future market position. Further investigation into the specific blocks of information is needed to determine the relevance of each block.


The discrepancy between `slot:r_summary` and `ref:ref_eval_invest` formats suggests a possible problem with the summarization process. The single long paragraph in `slot:r_summary` contrasts sharply with the structured, concise format expected in `ref:ref_eval_invest`. Investigation into the root cause of this formatting difference is needed. It seems that the model is outputting a very long format which is not structured as desired.


The mixed use of declarative and nominal sentence endings suggests a potential issue in the summarization style. Analyzing `rf_interpret` rules and schema to formulate interpretations, focusing on cards for D1 (information density) and D4 (narrative framework) based on the observed summary format inconsistencies. The interpretation will involve creating cards that explain how the observed format relates to the reference document structure, citing evidence from `ref:ref_eval_invest`.


Initial assessment: The registered cards correspond to specific formatting styles or structures. Observing that the current document has a title implies further content within the document. Considering the editor context to understand the document's structure, the aim is to determine if the document adheres to the card format guidelines.


The document details a Q1 onboarding improvement report. The summary highlights a reduction in the initial document creation time, alongside increased template usage. Additional metrics and plans for the next quarter are included, focusing on expanding user testing and evaluatin

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 [(주)루미나랩스 시리즈A 투자 제안서](vdoc:ref/ref_eval_invest)의 정보 구성 패턴을 적용한 변경 후보를 제안했습니다.

---

### 제안된 후보 안내

* **1안: 두괄식 결론 선행형 요약 (핵심 4축 개조식)**
  * **차이점**: 최상단에 볼드로 핵심 결론을 배치하고, 하위에 **문제 — 해법 — 증거 — 다음 단계**의 4대 축을 개조식 목록으로 구조화했습니다 ([ref:ref_eval_invest#blk:b3–b7](vdoc:ref/ref_eval_invest)).
  * **선택 기준**: 바쁜 의사결정권자에게 성과와 핵심 현황을 10초 안에 빠르게 전달해야 할 때 적합합니다.

* **2안: 논리적 서사형 요약 (SCQA 프레임워크)**
  * **차이점**: 레퍼런스의 본문 전개 방식인 **상황 — 문제 — 질문 — 해답(SCQA)** 흐름을 적용하여 온보딩 개선 배경과 남은 과제를 논리적으로 풀어냈습니다 ([ref:ref_eval_invest#blk:b8–b15](vdoc:ref/ref_eval_invest)).
  * **선택 기준**: 프로젝트 진행 배경부터 지표 검증, 향후 계획까지의 맥락과 인과관계를 설득력 있게 설명해야 할 때 적합합니다.

---

### 레퍼런스 적용 및 해석 카드 보고

* **따른 층위**:
  * **D4 (서술 프레임워크)**: 두괄식 결론 선행 및 4축 개조식 구조화 (1안) / SCQA 서사 전개 (2안)
  * **D1 (정보 밀도·스캐너빌리티)**: 기존 253자짜리 장문 1단락을 해체하여 20~40자 내외의 단문 및 개조식 리스트로 가독성 강화
  * **D6 (장르 규약)**: 불릿 머리의 `[**핵심어** — 서술]` 패턴 및 간결한 종결어미 채택
* **따르지 않은 층위**:
  * **D2 (사실·수치)**: 레퍼런스의 고유명사·수치(TAM 4.2조, 고객사 37곳 등)는 철저히 배제하고, 보고서 에디터 내 실제 지표([지표 표](vdoc:slot/r_metric_table), [지표 해설](vdoc:slot/r_metric_body), [온보딩 결정](vdoc:slot/r_dec_onb), [다음 단계](vdoc:slot/r_next_plan))만을 근거로 작성했습니다.
* **확인 범위**: 레퍼런스 [ref_eval_invest](vdoc:ref/ref_eval_invest) 덩어리 18/18 (100% 완독)
* **검토 대기 해석 카드**:
  * `icard_3c1239f4` (D4: 두괄식 4축 개조식 vs SCQA 서사 구조)
  * `icard_c3b34b5a` (D1: 단문 및 개조식 리스트 분할)
  * `icard_3610f038` (D6: 핵심어 대시 포맷 및 단정적 어조)

## REF-Q2-layer-only — REF
> 지표 해설을 이 레퍼런스의 말투(어조)만 따라서 바꿔줘. 구성과 내용은 그대로.

- ✅ 어조(D6) 따름 카드: 1/1 (D6:follow@전체, D4:exclude@전체)
- ✅ 후보는 D6 카드만 따름: 2/2안 · [['icard_0428939d'], ['icard_0428939d']]
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → rf_consensus → rf_read → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_blog(13)
- 카드 icard_0428939d D6 follow ref:ref_eval_blog · 대안 1 — 친근하고 가벼운 블로그형 구어체 '해요체(~요)' 어조와 감정 표현(이모지/느낌표) 활용
- 카드 icard_72640f7c D4 exclude ref:ref_eval_blog — 블로그식 번호 매기기 소제목 및 결론 분할 구성 (사용자 요청에 따라 구성은 기존 문서 유지)
- 후보 prop_b8fc404ea3 needs_fix 2안 compose · 오류 2 · 경고 0
  - ✗ 후보 1 '1안 (친근하고 경쾌한 어조)': icard_72640f7c 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안 (담백한 구어체 어조)': icard_72640f7c 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_fb3ccb61fe ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

에디터=대상 칸 p3 · 레퍼런스=패턴(참조3 핀) · 리소스=사실(10월 회의 산출물) · 관련 없음=없음. 주어진 레퍼런스(참조3 핀)의 말투와 어조를 대상 칸(p3 지표 내 선택된 칸)에 적용해야 한다. 구성과 내용은 변경하지 않는다.


The task is to adapt the tone of the provided text to match a specified style, while keeping its structure and content consistent. The target tone is characterized as a friendly, conversational style with "해요" form, emojis, and exclamation points. The objective is to maintain all structural and informational elements from the source text.


Initial hypothesis: Evaluate two variations for a blog post body. One uses friendly, emoji-laden language, the other a plain, formal style. Propose these as options using the appropriate function, targeting a specific slot with the original text as the base.


Initial hypothesis: two options are evaluated for blog post content. Option 1 employs friendly language with emojis, and Option 2 adopts a plain, formal style. Both options must maintain the core information: 45 minutes for the first document and 10 participants. The function will be used to generate variations for a target slot, with the original text as a base. Considering the "restyle" mode, it is uncertain if this mode handles sentence-level changes.


The preview now appears on the user's screen; the validation passed. The first rule, already addressed, pertains to the initial thought structure. The second rule is to note any active but unused source.




</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸에 대해 [노트몽키 블로그](vdoc:ref-region/ref_eval_blog)의 어조(해요체)를 반영한 2가지 후보를 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

### 제안된 후보 안내

- **1안 (친근하고 경쾌한 해요체)**: 레퍼런스 특유의 활기찬 느낌표(`!`) 표현과 '해요체'를 함께 적용해 독자에게 밝고 생동감 있게 전달합니다.
- **2안 (담백한 구어체 해요체)**: 감정 표현을 절제하고 정중하고 깔끔한 '해요체' 문장으로만 다듬어 신뢰감을 유지합니다.

> **고르는 기준**: 사내 공유 목적이나 보고 문서의 격식에 맞춰, 조금 더 부드럽고 가벼운 톤을 원하시면 **1안**, 정돈된 비즈니스 구어체를 원하시면 **2안**을 권장합니다. 기존 사실 내용(평균 45분, 인원 10명)과 2문장 구성은 그대로 보존되었습니다.

---

### 레퍼런스 반영 내역
- **따른 층위**: **D6 장르 규약**(종결어미: 해요체 구어체) — [icard_0428939d]
- **따르지 않은 층위**: **D4 서술 프레임워크**(블로그형 소제목 및 분할 구성) — [icard_72640f7c] (요청에 따라 기존 구성 유지)
- **읽은 범위**: ref:ref_eval_blog 전체(13/13 덩어리) 확인 완료

확인하지 않은 출처: 이력 — 이전 판 복원이나 변경 이력 조회가 아닌 신규 어조 적용 작업이므로 확인하지 않음.

## REF-Q3-pin — REF
> 레퍼런스에서 핀 찍어 둔 부분처럼 요약을 다시 짜줘.

- ❌ 핀 pinA1 읽음: 아니오
- ❌ 핀 범위 카드: 0/1 (카드 없음)
- ❌ 핀 범위 카드를 따름: 없음
- ❌ 후보 제안: wb_propose 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read✗ → wb_overview → rf_outline✗ → wb_search → ws_overview → wb_outline✗ → wb_history✗

**읽은 원천**: 없음

<details><summary>생각</summary>

요청에 따라 r_summary 칸의 내용을 요약해야 한다. 레퍼런스에서 핀으로 표시된 부분에 맞춰서 요약해야 함을 파악했다.

The workbench map indicates "No open documents, no references" for the wb_overview. However, the provided workspace context lists an editor with a specific document ID related to a report. This discrepancy suggests a problem with how the document is being recognized or linked within the workbench context. The next step is investigating why the document isn't correctly indexed in the map.


I'm thinking through how to approach this.


The failure indicates a need to reread the reason for the failure and follow its guidance directly, especially if the reason includes path candidates. Avoid redundant calls and skip environmental investigation to directly address the blocking cause.

The absence of documents and references in `wb_overview` and `rf_map` is concerning, potentially indicating an empty server state or a mock context. Reviewing the prompt reveals a simulated workbench context with a document and reference, implying the user seeks a summary based on the reference's "pinned" section.


The initial calls to `vibefs MCP` tools returned "no open references" and "no open documents". The workbench overview also confirmed this state, suggesting the need to verify document and reference availability. The prompt specifies two tool types: workspace tools and built-in tools like the `vibefs MCP` functions, and a search for alternative `vibefs` tools may resolve the initial errors.


The vibefs MCP server process is running, but its internal state (documents, references) hasn't loaded. It's necessary to determine why the state isn't loading. The server might be reading files or environment variables for its state. Reexamining operational rules, particularly those related to handling blocked or failed tools, to identify any applicable paths.


The "read" tool reports that no documents are open, even though the workspace context lists an editor document. Similarly, the reference tool indicates no references are open, despite one being present in the workspace. It appears there's a discrepancy between the stated workspace context and the actual accessible documents and references within the tools.


The absence of document and reference loading suggests a problem with document initialization within the vibefs server context. Examining available tools, there is no direct document or setting opening endpoint. The operational rules explicitly forbid investigating the environment due to blocked or 

</details>

**답변**

현재 작업대 환경에서 문서와 레퍼런스가 활성화되어 있지 않아 내용을 조회할 수 없습니다.

### 확인 결과
1. **에디터**: 대상 칸 [[r_summary]](vdoc:slot/r_summary) 조회를 시도했으나 작업대에 열린 문서가 없어 내용을 읽지 못했습니다 (`wb_read` 실패).
2. **레퍼런스**: `(주)루미나랩스 시리즈A 투자 제안서`의 핀 내용을 확인하려 했으나, 활성화된(켜진) 레퍼런스가 없어 조회가 불가능했습니다 (`rf_map` 결과: 켜진 레퍼런스 없음).
3. **리소스**: 마운트된 사실 자료가 없습니다.

---

추측으로 내용을 작성하지 않는 규칙에 따라, VibeDocStudio 에디터에서 해당 문서([2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report))와 레퍼런스(`ref_eval_invest`)를 활성화한 상태에서 다시 요청해 주시기 바랍니다.

확인하지 않은 출처: 리소스 — 마운트된 자료 없음

## REF-Q4-layer-area — REF
> 레퍼런스 2쪽에 있는 표의 짜임새(조판)만 참고해서 지표 해설을 정리해줘.

- ✅ 레퍼런스 도구 rf_find|rf_read|rf_outline: rf_find, rf_read
- ✅ 2쪽 범위 D5 카드: 1/1 (D5:follow@blk:b35, D6:exclude@blk:b35)
- ✅ D5 카드를 따름: ['icard_d99d946e', 'icard_d99d946e']
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → rf_find → rf_consensus → rf_read → rf_measure → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_seoul#blk:b35(1)
- 카드 icard_d99d946e D5 follow ref:ref_eval_seoul#blk:b35 — 2쪽 제출서류 표(b35)는 [연번|구분|세부내용] 형태의 3열 표 조판을 활용하여 항목별 속성과 세부 정보를 시각적으로 구조화함. 지표 해설 또한 구분/측정 항목/상세 수치 결과의 표 조판으로 정리함.
- 카드 icard_159d55fd D6 exclude ref:ref_eval_seoul#blk:b35 — 사용자가 '조판만 참고'하도록 명시했으므로 레퍼런스의 명사형 종결이나 어조는 강제하지 않고 에디터 기존의 설명 문맥 및 사실을 보존함.
- 후보 prop_c50ca9d4ea needs_fix 2안 restyle · 오류 4 · 경고 2
  - ✗ 후보 1 '1안: 레퍼런스 충실형 3열 표 구성 (연번/항목/결과)': icard_159d55fd 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 1 '1안: 레퍼런스 충실형 3열 표 구성 (연번/항목/결과)': '따르지 않음' 층위 D6(ref:ref_eval_seoul#blk:b35) 쪽으로 닮아 갔다 (0.25 → 0.00) — 그 층위는 지금 문서의 방식을 유지한다.
  - ✗ 후보 2 '2안: 압축형 2열 표 구성 (항목/결과)': icard_159d55fd 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_2acc30df47 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


에디터=r_metric_body · 레퍼런스=ref_eval_seoul · 리소스=없음 · 관련 없음=없음. 레퍼런스 문서의 2쪽 표 조판 패턴을 분석해야 한다. G1 절차에 따라, 표의 레이아웃과 포맷만 고려하며, 내용이나 어조는 제외한다.


Found b35 using rf_read. Expanding the search; checking surrounding blocks, specifically p2, for other tables using rf_find. Initial rf_find search for table page 2 returned only b35. Observed the b35 table's format: a 3-column structure (e.g., 구분/항목/내용), separated into header and body, with clear bullet points or descriptions for item details.


Interpreting the RF measure results. Submitting an interpretation card with the specified hierarchy (D5) and scope (ref:ref_eval_seoul#blk:b35). The adoption level is set to "follow" reflecting user's request for typographic reference. The reading focuses on a specific table ("2쪽 제출서류 안내 표") and its three-column structure, as well as typographic detailing of itemized lists.


Initial observation: Relevant information for `slot:r_metric_body` has been stored, including two specific identifiers (`icard_d99d946e`, `icard_159d55fd`). Now, the task is to generate candidates using `wb_propose` for this slot.

The existing content of the slot details the current state: "Average time to complete the first document was 45 minutes. The measurement was conducted with 10 people." From this, I've extracted the core measured components: completion time for the first document and the number of people involved.


Proposing two candidate interpretations for the `slot:r_metric_body`: a detailed 3-column table and a more concise 2-column summary table, both adhering to `wb_propose`'s constraints. The `mode` is likely `compose` or potentially `restyle` as the core information is retained, but restructured into a table format. The `slots` data will be formatted as HTML with the content of `slot:r_metric_body` as the source.


'따르지 않음' 카드는 'follows'에 넣지 않아야 하며, 'follow'만 포함해야 한다. 또한, D6 층위는 종결어미와 관련이 있으며, 현재 문서의 방식을 유지해야 한다.


The text in the table entries is no longer in sentence form, which violates the D6 level's requirement for preserving the original document's sentence endings (e.g., "~걸렸다", "~이다"). The "restyle" mode shows low original word retention (44%), indicating that significant content change. To address this, the original words should be fully preserved when restyling into a table. For example, restructuring the original text into table rows that maintain the original sentence structure will solve the issue.


The sentence endings ("~걸렸다", "

</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 영역에 [레퍼런스 2쪽 표](vdoc:ref-region/ref_eval_seoul#blk:b35)의 조판(D5) 패턴을 적용한 변경 후보를 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

### 적용 내용 및 해석 카드
- **따른 층위**: **타이포그래피·조판(`D5`, [icard_d99d946e](vdoc:kcard/ref_eval_seoul:icard_d99d946e))** — 레퍼런스 표의 열 기반 레이아웃 및 항목별 세부 내용 구조화 방식을 적용했습니다.
- **따르지 않은 층위**: **장르 규약·어조(`D6`, [icard_159d55fd](vdoc:kcard/ref_eval_seoul:icard_159d55fd))** — 지시에 따라 조판 외의 고유명사나 명사형 종결어미는 배제하고, 기존 문서의 사실 내용과 서술어 형태를 그대로 보존했습니다.

---

### 제안 후보 비교 및 선택 기준

1. **1안: 레퍼런스 3열 표 조판 (연번/항목/내용)**
   - **특징**: 레퍼런스의 3열(연번 | 서류명 | 내용) 구조를 그대로 반영하여 번호 매김과 항목, 결과가 명확히 분리됩니다.
   - **선택 기준**: 지표 측정 항목이 추가되거나 순서화된 관리가 필요할 때 적합합니다.

2. **2안: 간결형 2열 표 조판 (항목/결과)**
   - **특징**: 연번을 생략하고 2열(측정 항목 | 결과)로 압축 구성했습니다.
   - **선택 기준**: 불필요한 열을 줄이고 핵심 지표 수치를 빠르게 파악하고자 할 때 적합합니다.

---
*확인하지 않은 출처: 리소스(마운트 없음), 이력(되돌리기 작업이 아니므로 미사용)*

## REF-Q5-exclude — REF
> 요약을 이 레퍼런스처럼 다듬되, 굵은 글씨로 강조하는 방식은 따라하지 마.

- ✅ 따르지 않음 카드: 1/1 (D1:exclude@전체, D4:follow@전체)
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 굵은 글씨 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_patterns → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_11fe1c8d D1 exclude ref:ref_eval_invest — 레퍼런스는 결론 및 항목명에 굵은 글씨(볼드)를 적용하고 있으나, 사용자 요청에 따라 굵은 글씨 강조 방식을 배제하고 볼드 태그 없이 텍스트 자체의 구조로 강조한다.
- 카드 icard_65789fd8 D4 follow ref:ref_eval_invest · 대안 1 — 핵심 결론(목표)을 서두에 제시하고, 문제(목표선 47분 단축)·시도(방식 비교)·현황 및 과제 순으로 체계화하여 두괄식으로 전개한다.
- 후보 prop_9131b12ec6 needs_fix 2안 compose · 오류 2 · 경고 0
  - ✗ 후보 1 '1안: 두괄식 결론 + 구조화 항목 요약': icard_11fe1c8d 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 간결한 3단 단문 문단 요약': icard_11fe1c8d 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_b257014910 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

에디터=대상 칸 r_summary · 레퍼런스=패턴(ref_eval_invest) · 리소스=마운트 없음 · 이력=필요시

요약 다듬기 지시를 분석했다. 굵은 글씨 사용은 하지 않으면서, 레퍼런스의 스타일을 적용해야 한다. 스타일 적용의 범위를 파악하고, 구체적인 변경 사항을 결정해야 한다.


The summary focuses on an onboarding improvement project involving multiple teams and aimed at fundamentally changing the user experience. Different approaches were explored, comparing a template-first method with starting from a blank document. The primary goal was to reduce the baseline first document completion time of 47 minutes.


The reference's directive explicitly excludes bold formatting. The reference's structure begins with a concise, direct summary presented first. Further analysis will focus on identifying problem statements and structuring the output accordingly.


`wb_patterns` analysis shows extremely long sentences and paragraphs, with an unusual amount of bolding within a single sentence. The reference data reveals a stark contrast: short, concise paragraphs with minimal bolding. The user specifically requested that bolding not be emulated.


The analysis focuses on adapting the reference document's style while adhering to the user's specific constraints. The goal is to create a new interpretation card that excludes bolding, embraces concise sentences, and employs a conclusion-first, structured approach. This involves evaluating the reference document for short sentences and paragraph structure, then excluding the use of bolding, as requested.


해석 카드가 저장되었음을 확인. 두 카드 중 하나는 D4 지침을 따르고, 다른 하나는 볼드체 배제를 준수하지 않음. `slot:r_summary`의 원본 내용을 다시 확인하고 후보 제안을 구성하는 것으로 방향 전환. 원본 내용인 "이번 분기 온보딩 개선 작업"을 기반으로 후보를 생성.


최우선 목표는 첫 문서 완성 시간을 단축하는 것이었다. 다수의 팀이 협력하여 템플릿 우선 방식과 빈 문서 시작 방식의 효과를 비교했다. 주요 지표는 개선되었지만, 미완료 측정 항목이 존재하여 추가적인 검증이 다음 분기에 필요하다.


Two candidate summaries are constructed, both avoiding bold text, and following the two-part card's structure. The first candidate summarizes the source material in bullet points, structured by goal, approach, result, and next steps. The second candidate summarizes the same information in three short declarative sentences, following the style of the reference summary.


The validation passed. Re-examining the rules: "Combine the 'sources net' but do not swap roles," and "For each active source (workbench map, source list editor, references, resources), determine if it's relevant to this request (first thought: e.g., 'Editor=target cell p2 · Reference=pattern (ref2 pin) · Resource=fact (October meeting output) · Not relevant=none')." The next step 

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 [루미나랩스 시리즈A 투자 제안서](ref:ref_eval_invest)의 전개 구조를 차용하여 다듬었습니다.

### 레퍼런스 반영 및 층위 해석
- **따름 (D4 서술 프레임워크)**: 레퍼런스의 두괄식 결론 배치 및 핵심 항목 구조화 전개 패턴을 채택했습니다. (카드: `icard_65789fd8`)
- **따르지 않음 (D1/D5 볼드 강조)**: 사용자의 요청에 따라 굵은 글씨 강조 서식은 일체 배제하고 텍스트 및 문단 구조만으로 가독성을 확보했습니다. (카드: `icard_11fe1c8d`)
- **읽은 범위**: 레퍼런스 전체(덩어리 1~18) 검토 완료.

---

### 제안 후보 비교 및 선택 기준

1. **1안: 두괄식 결론 + 구조화 항목 요약**
   - **특징**: 목표 결론을 먼저 제시한 뒤, `목표·시도·결과·다음 단계` 목록으로 명확히 구분했습니다.
   - **추천**: 보고서 요약의 가독성과 항목별 명확한 구분이 필요할 때 적합합니다.

2. **2안: 간결한 3단 단문 문단 요약**
   - **특징**: 기존의 250자 만연체 문장을 호흡이 짧은 3개의 평서문 단문으로 분리했습니다.
   - **추천**: 리스트 형태 대신 깔끔하고 정돈된 줄글 문맥을 유지하고 싶을 때 적합합니다.

화면 미리보기에서 원하시는 안을 선택해 반영해 주세요.

---
확인하지 않은 출처: 이력 — 과거 개정 내용 복원이 아닌 레퍼런스 스타일 적용 요청이므로 확인하지 않음

## REF-Q6-consult — REF
> 공공 보고서 레퍼런스는 참고만 하고, 우리 문서 톤은 유지하면서 요약을 다듬어줘.

- ✅ 참고만(consult) 카드: 1/1 (D6:exclude@p1, D1:consult@blk:b3)
- ✅ 따름 카드 없음: 0장
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 공공 보고 문체 이식 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → wb_history → rf_consensus → rf_read → wb_patterns → wb_outline → wb_outline → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_public#p1(15)
- 카드 icard_fc6da608 D6 exclude ref:ref_eval_public#p1 — 공공 보고서의 개조식 종결(~함·~임)은 사용자의 '우리 문서 톤 유지' 요청에 따라 배제하고, 기존 문서의 평서문(~다) 종결 형식을 유지함.
- 카드 icard_66578b6f D1 consult ref:ref_eval_public#blk:b3 — 요약부에서 불필요한 수식어를 배제하고 핵심 실행 내용과 지표 목표를 명확히 제시하는 정보 압축 구조를 참고함. 현재 253자의 단일 만연체 문장을 핵심 위주로 정돈함.
- 후보 prop_ae54e32d89 needs_fix 2안 compose · 오류 2 · 경고 0
  - ✗ 후보 1 '1안: 핵심 집중형 (간결한 2문장 정돈)': icard_fc6da608 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 조치·계획 연계형 (균형 구성)': icard_fc6da608 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_d3bfb6c821 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

에디터=대상 칸 r_summary · 레퍼런스=패턴(ref_eval_public 참고만) · 리소스=마운트 없음 · 이력=개정/원본 확인. 사용자 요청은 공공 보고서 레퍼런스를 참고하되, 우리 문서의 톤을 유지하며 요약을 다듬으라는 것이다. 우선, r_summary를 분석하여 현 상태를 파악해야 한다.


The text describes a large, multi-team project focused on improving onboarding this quarter. Multiple approaches to the user experience were considered, including comparing template-based and blank-document-based starting points.


The selected range is "slot:r_summary" focusing on the P1 summary, while the document's title is "2025 Q1 온보딩 개선 운영 보고서." P2 highlights a decision to present templates on the first screen. The P3 section outlines relevant metrics: average document completion time (45-47 minutes) and a template usage rate of 68%. P4 describes next steps including considering an external search API and increasing the onboarding measurement sample to 30 individuals. The original history for "r_summary" is "Q1 온보딩 개선의 핵심은".


The focus is on the improvement of the "onboarding" process, which involved multiple teams. The goal was to fundamentally alter the user experience through different approaches including template-first versus blank-document initiation. Reducing the baseline document completion time (47 minutes) was a primary objective; multiple metrics showed meaningful changes, though some require further validation. The user's request is to maintain the original document tone while refining the summary, focusing on conciseness and key findings.


Two new cards were created: `icard_fc6da608` which doesn't follow D6, and `icard_66578b6f` which is only a reference to D1. This task is a document modification request; therefore, I must use `wb_propose` to suggest candidates (Show Don't Tell). Considering the nature of the request, I should propose several diversified candidates. The user wants the public report references to be only for reference.


이번 분기 온보딩 개선은 첫 화면에 템플릿을 우선 제시하는 방식으로 진행되었다. 그 결과, 첫 문서 완성까지 평균 시간이 47분에서 45분으로 감소했다. 다음 분기에는 외부 검색 API 도입 여부를 결정하고, 측정 인원을 30명으로 확대할 예정이다.


Initial analysis suggests focusing on streamlining the summary of public report references, incorporating aspects from the original document while maintaining a neutral tone. This involves condensing the initial draft, removing extraneous formatting, and ensuring clarity. Candidate 2, a "Report Comprehensive" style, appears to align with this approach by providing a balanced summary.



The validation passed successfully.

Now reviewing the rule: If an active source is unused, append "Unverifie

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 공공 보고서 레퍼런스의 요약 구조만 참고하고, 기존 문서의 평서문 톤(`~다`)을 유지한 2가지 개선 후보를 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

---

### 레퍼런스 해석 및 적용 내용

- **따르지 않은 층위 (배제)**: `icard_fc6da608` (D6 장르 규약)
  - [한국데이터진흥원 내부 보고](vdoc:ref-region/ref_eval_public)의 공공 개조식 종결어미(`~함`, `~임`)는 요청에 따라 적용하지 않고, 기존 문서의 표준 평서문(`~다`) 어조를 유지했습니다.
- **참고한 층위 (간결성)**: `icard_66578b6f` (D1 스캐너빌리티·정보 밀도)
  - 기존 253자 단일 만연체 문장과 과도한 볼드 표기(8개)를 해소하고, 레퍼런스의 핵심 중심 정보 압축 방식을 참고했습니다.

---

### 제안 후보 비교 및 선택 기준

1. **1안: 핵심 집중형 (간결한 2문장)**
   - **특징**: [초기 원본](vdoc:slot/r_summary)의 명확성을 살려 '첫 화면 템플릿 우선 제시'와 '지표 검증 지속'이라는 핵심 메시지만 콤팩트하게 압축했습니다.
   - **추천**: 페이지 첫인상을 가볍고 명확하게 전달하고자 할 때 적합합니다.

2. **2안: 조치·계획 연계형 (균형 구성)**
   - **특징**: 보고서 내 [온보딩 결정](vdoc:slot/r_dec_onb), [지표 표](vdoc:slot/r_metric_table), [다음 분기 계획](vdoc:slot/r_next_plan)의 맥락을 연결하여 '조치 실행 → 단축 흐름 확인 → 계획 확대'의 3단계 완결형 구조로 정리했습니다.
   - **추천**: 요약만 읽고도 전체 보고서의 핵심 흐름을 한눈에 파악할 수 있도록 구성하고자 할 때 적합합니다.

## REF-Q7-analyze — REF
> 이 레퍼런스는 무엇이 잘 된 거야? 어떤 결정들이 보이는지 정리해줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 층위 카드 3장 이상: 3/3 (D3:consult@sec:1, D4:follow@p1, D6:follow@p1)
- ✅ 문서 바꾸지 않음: 후보 0건
- ✅ 층위로 설명: 있음

**도구**: rf_map → rf_consensus → rf_read → rf_coverage → rf_interpret

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_public#p1(15)
- 카드 icard_49214ecb D3 consult ref:ref_eval_public#sec:1 — 문서 상단에 표준 문서 관리 메타(문서번호·보고일자·부서)와 3단 결재선 표를 배치하고, 본문 전 요약 블록을 두어 보고서의 공적 신뢰성과 즉시 파악성을 확보함.
- 카드 icard_1305178c D4 follow ref:ref_eval_public#p1 — '추진 배경 → 현황 및 문제점 → 개선 방안 → 향후 계획'의 4단계 정형화된 공공·기획 서술 프레임워크를 적용하여 논리적 인과 흐름을 완결함.
- 카드 icard_eb0bf5a1 D6 follow ref:ref_eval_public#p1 — 서술문 전체를 평균 19자 내외의 짧은 개조식(~함, ~임, 명사형 종결) 목록으로 일관되게 작성하여 빠른 의사결정과 시각적 스캔 편의성을 극대화함.

<details><summary>생각</summary>

에디터=대상 칸 p2 · 레퍼런스=패턴(참조2 핀) · 리소스=사실(10월 회의 산출물) · 관련 없음=없음. 분석을 시작한다. 한국데이터진흥원 내부 보고서, 회의록 표준화에 대한 정보가 레퍼런스로 확인되었다. 현재 열린 문서가 없으므로 편집자 정보는 관련 없다.


Initial assessment: The reference describes a procedure for interpreting and summarizing information from layers where consensus is lacking, using "rf_interpret" cards. This involves identifying the decision made (expressed as a range or measurement), its location, the specific measurements, and the evidence supporting the interpretation. The process suggests iterating by further examining measurements or proposing "rf_interpret" cards for main layers.


The rule dictates flagging unused sources when active. The editor and resources are inactive as reflected in the map. The reference, though active, was fully read.

Plan is to summarize the reference's strengths, then proceed.




</details>

**답변**

이 레퍼런스([한국데이터진흥원 내부 보고](vdoc:ref-region/ref_eval_public))는 공공·기업 내부 보고서의 **전형적인 고밀도 압축 구조와 표준적인 의사결정 프레임워크**를 아주 모범적으로 구현하고 있습니다.

핵심적인 장점과 문서에서 확인되는 설계 결정은 다음과 같습니다.

---

### 1. 잘 된 점 및 주요 설계 결정 (층위별 분석)

#### ① 공식 보고 규격과 빠른 개요 전달 (D3 격식·메타 규격)
* **메타데이터 및 결재선 전진 배치**: 문서 최상단에 문서번호, 작성일자, 주관 부서, 보안 등급을 담은 메타 표와 3단 결재선(담당·검토·승인)을 배치하여 공식 문서로서의 신뢰성을 즉시 확보합니다.
* **본문 진입 전 '요약' 블록**: 4개 본문 섹션에 들어가기 앞서, 핵심 목적(서식 표준화)과 예산 집행 계획을 2줄 불릿으로 압축 제시해 의사결정권자가 전체 내용을 5초 안에 파악할 수 있도록 배려했습니다.

#### ② 논리적 완결성을 갖춘 서술 흐름 (D4 서술 프레임워크)
* **4단계 기획 프레임워크 정립**: 
  1. **추진 배경** (왜 필요한가)
  2. **현황 및 문제점** (무엇이 원인인가: 내용 섞임, 담당자 누락)
  3. **개선 방안** (어떻게 해결할 것인가: 결정·근거·조치 분리)
  4. **향후 계획** (앞으로 무엇을 할 것인가: 시범 운영 및 확대)
* 인과 관계가 명확하게 맞물려 있어 읽는 사람이 추가 질문 없이 타당성을 수용할 수 있는 논리적 흐름을 갖추고 있습니다.

#### ③ 극대화된 가독성과 스캔 편의성 (D1 정보 밀도 · D6 장르 규약)
* **전면 개조식 불릿 목록**: 줄글 문단(장문 비율 0%)을 배제하고 단락당 평균 19자의 단문 개조식으로만 기술되어 있습니다.
* **명료한 종결어미 규약**: 서술어는 `~함`, `~임`, `명사형 종결`로 통일하여 감정이나 군더더기 없이 사실과 방침만 간결하게 전달합니다.
* **세부 사항의 외부화(붙임 분리)**: 본문 흐름을 방해할 수 있는 상세 서식은 본문에 넣지 않고 말미에 `※ 세부 양식은 붙임 참조.`로 분리해 본문의 압축성을 지켰습니다.

---

### 2. 제안된 해석 카드

위 결정을 향후 문서 작성/개편 시 패턴으로 재사용할 수 있도록 아래 해석 카드를 제안했습니다.

* `icard_49214ecb` (D3, 참고): 상단 문서 메타·결재선 표 및 본문 전 요약 블록 배치
* `icard_1305178c` (D4, 따름): '추진 배경 → 현황 및 문제점 → 개선 방안 → 향후 계획' 4단계 정형 프레임워크
* `icard_eb0bf5a1` (D6, 따름): 평균 19자 내외의 짧은 개조식(~함, ~임, 명사형) 목록 일관 작성

화면의 해석 카드 패널에서 채택 여부를 확정해 주시면, 이후 문서 구성 시 해당 패턴을 반영할 수 있습니다.

## REF-Q8-contrast — REF
> 내 문서 요약은 두 레퍼런스와 층위별로 어떻게 달라?

- ✅ 레퍼런스 도구 rf_contrast|rf_measure: rf_contrast, rf_contrast
- ✅ 문서 바꾸지 않음: 후보 0건
- ✅ 층위별 비교: 있음

**도구**: rf_map → wb_outline → wb_read → wb_patterns → rf_read → rf_read → rf_contrast → rf_contrast → rf_consensus → rf_interpret

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18) · ref:ref_eval_public(15)
- 카드 icard_8629de56 D4 consult ref:ref_eval_invest#p1 — 두괄식 결론 제시 후 문제·해법·증거·요청의 4단 구조로 핵심을 전면에 요약함 (conclusion_first=True)
- 카드 icard_8bd4aae2 D6 consult ref:ref_eval_public#p1 — '□ 요약' 아래 명사형 및 개조식 종결어미(~함·~임)를 사용해 보고 격식을 갖춘 간결한 목록으로 정리함

<details><summary>생각</summary>

요약 및 레퍼런스의 차이점을 분석하려면 에디터 및 레퍼런스 동작을 비교해야 한다. 에디터는 개요, 읽기, 패턴 분석을 사용한다. 레퍼런스는 매핑, 측정, 대비, 읽기를 통해 정보를 평가한다. 둘 다 읽기 기능을 사용하지만, 레퍼런스는 특정 정보 추출 및 비교 작업에 초점을 맞추는 반면, 에디터는 개요 및 패턴을 생성한다.

Initial assessment: The query asks for a comparison of summaries based on references and layers, indicating an analytical task rather than a content modification request. The "wb_propose" call is therefore unnecessary. Adherence to operational and workbench rules is critical.


The suggested interpretation cards seem relevant. Now, the document summaries and these two references will be compared across levels D1-D6. A clear and concise response will then be assembled.


Initial comparison of documents begins by formatting links to external data sources. The analysis will compare documents across six levels, focusing first on scannerbility and information density, revealing significant differences in sentence length, use of bolding, and the presence of bulleted lists between the analyzed documents. Then it will assess the evidence and data proof method used, revealing how the compared documents differ on numerical density and the usage of data visualizations.


Analysis reveals significant differences in the compared documents. Document D3 lacks metadata like document numbers and approval lines, unlike the other two. D4 shows the internal document presents information chronologically, while the others are structured for clarity (problem-solution-evidence) or adhere to a standard public report format (background-current state-improvement-plan). D5's internal document is a simple text block, contrasting with the structured layouts of the other two documents, which use diverse elements like tables and lists to convey information.




</details>

**답변**

현재 문서의 [p1 요약](vdoc:page/rp1)에 있는 [요약](vdoc:slot/r_summary)은 두 레퍼런스(루미나랩스 투자 제안서, 데이터진흥원 내부 보고)와 비교했을 때 다음과 같은 층위별 차이를 보입니다.

---

### 층위별 비교 분석

| 층위 | 내 문서 ([요약](vdoc:slot/r_summary)) | 레퍼런스 1: 루미나랩스 투자 제안서 (`ref_eval_invest`) | 레퍼런스 2: 데이터진흥원 공공 보고 (`ref_eval_public`) |
| :--- | :--- | :--- | :--- |
| **D1 스캐너빌리티 · 정보 밀도** | **만연체 장문 (저밀도)**<br>· 문단 길이 253자(1개 문장 138자)<br>· 불릿 비율 0%<br>· 단락 내 굵은 글씨 8회 남발 | **단문 분절형 (고밀도)**<br>· 평균 문단 20.4자 (최대 56자)<br>· 불릿 리스트(25%) 위주 구성<br>· 항목 라벨에만 볼드 집중 사용 | **개조식 목록형 (고밀도)**<br>· 평균 문단 19자<br>· 불릿 리스트(54%) 중심<br>· 요약 박스 아래 핵심 2줄로 요약 |
| **D2 근거 · 데이터 증명** | **정성적 서술 위주**<br>· 수치 밀도 1.08개/100자 (기준선 47분 1개)<br>· 요약 표 및 출처 없음 | **핵심 지표 전진 배치**<br>· 수치 밀도 4.03개/100자 (62%, 37곳, 71, 50억 등)<br>· 요약 직후 요약 표 및 출처 명시 | **목표 수치 명시**<br>· 수치 밀도 3.0개/100자<br>· 예산(3.1억원) 및 시기 명확히 기재 |
| **D3 격식 · 메타 규격** | **메타 규격 부재**<br>· [문서 정보](vdoc:slot/r_meta)가 비어 있음<br>· 문서 번호, 승인선 없음 | **비즈니스 IR 형식**<br>· 작성 시점 및 기밀 표시 (`2025.03 · Confidential`) | **공공 행정 표준 서식**<br>· 문서번호, 작성부서, 보안등급 표<br>· 3단계 결재선(담당-검토-승인) 구비 |
| **D4 서술 프레임워크** | **미괄식 경과 나열**<br>· `~시도를 했고 ~목표로 두었고 ~강조하고 싶다` 식의 시간 경과 나열 | **두괄식 제안 구조**<br>· 굵은 폰트의 한 줄 결론 선언 후 `문제 → 해법 → 증거 → 요청` 4단 전개 | **행정 기획 프레임워크**<br>· `□ 요약` 독립 블록화<br>· 본문: `추진배경 → 현황·문제 → 개선방안 → 향후계획` |
| **D5 타이포그래피 · 조판** | **단일 텍스트 블록**<br>· 줄바꿈 없이 하나의 긴 덩어리로 표시 | **다채로운 블록 구성**<br>· H1/H2 위계 구분, 인라인 볼드, 지표 테이블 활용 | **정형화된 표/박스 조판**<br>· 메타 테이블 2개, `□` 머리말 블록, 들여쓰기 불릿 활용 |
| **D6 장르 규약 (종결어미)** | **구어체 혼합 평서문**<br>· `~강조하고 싶다`, `~프로젝트였으며` | **단언적 평서문 & 명사형**<br>· `~된다`, `~쓴다` 및 키워드 명사형 종결 | **공공 개조식 종결어미**<br>· `~함`, `~예정임` 등 격식 개조식 종결 |

---

### 핵심 진단 요약
1. **구조적 문제**: 현재 요약문은 253자의 긴 단문 하나에 온보딩 프로젝트의 배경·비교방식·기준선·한계점이 쉼표로 연결되어 있어 한눈에 스캔하기 어렵습니다.
2. **레퍼런스 적용 방향**:
   - **스타트업/경영진 보고 스타일**을 원할 경우: `ref_eval_invest`처럼 상단에 결론 1줄을 제시하고 `[문제 - 해법 - 핵심성과 - 과제]` 4줄 불릿으로 분절하는 구성(카드 `icard_8629de56`)을 차용할 수 있습니다.
   - **공공/사내 정기 보고 스타일**을 원할 경우: `ref_eval_public`처럼 `□ 요약` 박스를 두고 개조식 어미(`~함`, `~음`)로 2~3줄 정리하는 방식(카드 `icard_8bd4aae2`)을 적용할 수 있습니다.

확인하지 않은 출처: 이력(wb_history) — 문서 복원/개정 추적이 아닌 현재 요약문과 레퍼런스 간의 층위별 패턴 비교 요청이므로 참조하지 않음.

## REF-Q9-combine — REF
> 투자 제안서의 논증 흐름과 공공 보고서의 격식을 합쳐서 요약을 다시 써줘.

- ✅ 투자 제안서 따름 카드: 1/1 (D4:follow@전체, D6:follow@전체)
- ✅ 공공 보고 따름 카드: 1/1 (D4:follow@전체, D6:follow@전체)
- ✅ 카드 따름: 2/2안 · [['icard_83cba676', 'icard_7286e391'], ['icard_83cba676', 'icard_7286e391']]
- ✅ INV 카드 따름: ['icard_83cba676', 'icard_83cba676']
- ✅ PUB 카드 따름: ['icard_7286e391', 'icard_7286e391']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → wb_outline → wb_patterns → wb_history → rf_consensus → rf_consensus → rf_read → rf_read → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18) · ref:ref_eval_public(15)
- 카드 icard_83cba676 D4 follow ref:ref_eval_invest — 투자 제안서의 논증 흐름을 채택하여 핵심 결론을 두괄식으로 선언한 뒤 '문제-해법-증거-향후 계획' 순으로 논리를 전개함
- 카드 icard_7286e391 D6 follow ref:ref_eval_public — 공공 보고서의 격식을 채택하여 감정적·서술적 수식을 배제하고 개조식 종결어미(~함, ~임, ~음 및 명사형 종결)와 간결한 글머리 기호(□, -)를 사용함
- 후보 prop_39f1d791fb ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


Examining the workbench context reveals the target summary ("r_summary") within a Q1 onboarding report, alongside two references: an investment proposal ("ref_eval_invest") and a public sector internal report ("ref_eval_public"). The request aims to combine the argumentation style from the proposal with the formatting of the public report. Revision history will be checked to see if an earlier version of the summary exists.


Initial investigation requires analyzing the two reference texts to understand their structural and stylistic differences. The first reference's argumentation framework and the second reference's formal style will provide crucial insights. Examining the `ref_eval` data will inform the next step.


The evaluation references point to two distinct styles. `ref_eval_invest` emphasizes a direct, structured argumentation flow, starting with the conclusion. `ref_eval_public` indicates the need for formal language and genre conventions suitable for public reports.


The initial summary style prioritizes conciseness suitable for a template, and needs restructuring to align with the specified styles. The objective is to combine the argumentation flow characteristic of `ref_eval_invest` with the formal style outlined in `ref_eval_public`. The key requirements include a direct style with concise sentence endings, the use of bullet points, and an administrative reporting tone.



The project aimed to fundamentally improve user experience through experimentation, comparing template-first and blank-document approaches. Reducing the initial document creation time from a baseline of 47 minutes was the primary goal. While various metrics showed significant improvement, some measurements are pending and will require further verification next quarter.

The core change involved prioritizing template presentation on the initial screen, leading to an average first document completion time of 45 minutes, with a template usage rate of 68% among a group of 10 users. Future plans include evaluating external search API integration and expanding the onboarding measurement to 30 participants.


The system generated two interpretation cards; one derived from the evaluation investigation and the other from a public evaluation. The next step is to examine the proposal workflow. The goal is to propose a summary based on the target slot and mode, with candidates and rationales following specific interpretation cards.


The `w

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 두 레퍼런스의 결정 패턴을 통합한 2가지 변경 후보를 제안했습니다. 화면 미리보기에서 검토 후 적용하실 수 있습니다.

---

### 레퍼런스 적용 및 해석 카드

* **[투자 제안서](vdoc:doc/ref_eval_invest) (D4 서술 프레임워크 · `icard_83cba676`)**: 핵심 결론을 두괄식으로 선언하고 `문제 → 해법 → 증거 → 향후 계획` 순으로 설득력을 높이는 논증 구조를 채택했습니다.
* **[공공 보고서](vdoc:doc/ref_eval_public) (D6 장르 규약 · `icard_7286e391`)**: 서술적 미사여구를 배제하고 공공 행정 양식의 개조식 종결어미(`~함`, `~임`, `~음`) 및 표준 글머리 체계를 적용했습니다.
* **적용하지 않은 층위**: 레퍼런스의 고유명사, 사업 지표 수치, 조판 메타 정보(D2, D3)는 배제하고 본 문서([온보딩 결정](vdoc:slot/r_dec_onb), [지표 표](vdoc:slot/r_metric_table), [지표 해설](vdoc:slot/r_metric_body), [다음 분기 계획](vdoc:slot/r_next_plan))의 실제 측정 수치(기준선 47분 → 45분 단축, 템플릿 사용률 68%, 표본 10명 등)만 사실 근거로 반영했습니다.

---

### 제안 후보 비교 및 선택 기준

1. **1안: 논증 구조 명시형 (결론 선행 + 4대 논증 축)**
   * **특징**: `[결론]` 선언 후 `문제 / 해법 / 증거 / 계획`의 4대 논증 축을 라벨로 명확히 드러내어 읽는 사람이 핵심 메시지와 논리를 빠르게 파악하도록 구성했습니다.
   * **추천 상황**: 경영진 또는 핵심 이해관계자 대상의 빠른 의사결정 브리핑용 요약에 적합합니다.

2. **2안: 공공 보고 개조식 중심형 (추진 개요-현황-개선-성과-향후)**
   * **특징**: 정통 행정 보고서 서식 체계(`□ 추진 개요`, `현황 및 문제점`, `주요 개선 내용`, `운영 성과`, `향후 조치 계획`)를 기반으로 투자 제안서의 핵심 요약 전개 방식을 결합했습니다.
   * **추천 상황**: 조직 내 정형화된 공식 운영 보고 및 아카이빙용 문서에 적합합니다.

## REF-Q10-apply-consensus — REF
> 아까 정한 레퍼런스 해석대로 요약에 적용해줘.

- ✅ 레퍼런스 도구 rf_consensus|rf_map: rf_consensus
- ✅ D1 을 다시 해석하지 않음: 0장
- ✅ 확정 카드 cardC1 따름: ['cardC1']
- ✅ 후보 제안: ready · 1안 · mode=restyle · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_consensus → wb_read → wb_propose → wb_propose

**읽은 원천**: 없음
- 후보 prop_b599e5873d ready 1안 restyle · 오류 0 · 경고 1
- 후보 prop_31b00c1c1a ready 1안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

요청된 레퍼런스 해석을 요약에 적용해야 한다. 정확한 적용을 위해, 레퍼런스가 구체적으로 무엇을 의미하는지 다시 확인. 요약 대상 칸과 레퍼런스 패턴 간의 관계를 파악하고, 그에 따라 요약을 수정. 이전 작업 이력은 필요에 따라 참조.

The confirmed card content reveals two distinct scenarios. Card C1 adheres to the specified structure, placing the conclusion at the top and supporting it with four bullet points: Problem, Solution, Evidence, and Request. Card C2 deviates from the defined SCQA (Situation, Complication, Question, Answer) flow.


The project involved multiple teams focused on improving user experience through various approaches. Initially, I'm thinking, the team compared template-first and blank-document methods, prioritizing a reduction in the baseline first-document completion time (currently 47 minutes). While some metrics showed improvement, unmeasured items require validation in the next quarter. I'll summarize the project's essence using the pattern from C1: conclusion at the top, supported by four bullet points for Problem, Solution, Evidence, and Request.


Initial assessment indicates a significant divergence from the original text in the candidate summary, exceeding the acceptable threshold for a simple restyling operation. The core issue is the low percentage of retained original words, suggesting a potential alteration of the underlying content. The primary goal is to reformat the summary based on the specified reference, prioritizing the preservation of the original wording as much as possible, while also adapting to the intended format/structure.


Initial restructuring focuses on a concise summary box highlighting the primary outcome: reducing first-document completion time and the need for future validation. The core problem identified is the need to improve onboarding user experience by reducing the original 47-minute completion time. The solution involved a collaborative effort across multiple teams and the comparative evaluation of different approaches, including template-first versus blank-document initiation.


The evaluation passed without warnings. The distance score improved from 0.81 to 0.65, indicating good alignment with the reference evaluation. The user's confirmed interpretation for cardC1 is now to place the conclusion at the top and support it with four bold-headed bullet points: problem, solution, evidence, and request. CardC2 deviates from the provided template for the SCQA (Situation, Complication, Question, Answer) flow.




</details>

**답변**

확정된 레퍼런스 해석([cardC1](vdoc:ref-pin/pinA1))에 따라 [요약](vdoc:slot/r_summary) 칸을 재구성한 후보안을 제안했습니다. 화면의 미리보기에서 검토하실 수 있습니다.

### 적용 내용 및 기준
- **따른 결정 ([cardC1](vdoc:ref-pin/pinA1) / D1 층위)**: 상단에 결론 상자(인용 박스)를 배치하고, 하단에 기존 [요약](vdoc:slot/r_summary)의 사실 내용을 바탕으로 **문제 · 해법 · 증거 · 요청**의 4개 굵은 머리말 불릿으로 정리했습니다.
- **배제된 결정 (cardC2 / D4 층위)**: 확정된 결정에 따라 SCQA(상황·문제·질문·해답) 전개 방식은 적용하지 않았습니다.
- **원문 보존**: 기존 문장에 포함된 핵심 어휘(47분 기준선, 템플릿/빈 문서 비교, 다분기 검증 필요성 등)를 누락 없이 유지했습니다.

---
*확인하지 않은 출처: 리소스 — 마운트된 리소스가 없음*

## REF-Q11-revise — REF
> 이 레퍼런스 요약 부분의 핵심 결정이 뭐라고 봐? → 그게 아니라 핵심은 요약을 테두리 상자 하나로 묶어서 본문과 분리한 거야. 그 해석으로 요약 다시 써줘.

- ✅ 사용자 해석 반영 카드: 1/1 (D4:consult@sec:1, D1:consult@sec:1, D2:consult@sec:1, D5:follow@sec:1)
- ✅ 수정 해석 카드를 따름: ['icard_12809736', 'icard_12809736']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → rf_outline → rf_read → rf_measure → rf_interpret → wb_read → wb_outline → wb_history → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#sec:1(7)
- 카드 icard_beb97191 D4 consult ref:ref_eval_invest#sec:1 · 대안 1 — 요약 첫머리에 단일 비전 결론을 전면에 배치한 뒤, 문제-해법-증거-요청의 4단계 논리 체인으로 각 1문장씩 완결 짓는 결론 우선(Conclusion-First) 서술 구조를 결정함
- 카드 icard_65aa5312 D1 consult ref:ref_eval_invest#sec:1 — 설명식 장문을 완전히 배제하고, [키워드 볼드 + 대시(—) + 단문(평균 24.4자)]의 극단적인 고밀도 스캐너블 개조식 서식(bullet_ratio 0.67)을 채택함
- 카드 icard_56eea60b D2 consult ref:ref_eval_invest#sec:1 — 추상적 수식어 대신 문제(62%), 증거(37곳, NPS 71), 요청(50억원) 등 각 항목마다 정량 수치를 1개 이상 100% 매핑하여 즉각적인 검증성을 확보함 (수치 밀도 3.95/100자)
- 카드 icard_12809736 D5 follow ref:ref_eval_invest#sec:1 — 요약 섹션 전체를 단일 테두리 상자(Box/Callout)로 묶어 본문과 명확하게 시각적·공간적으로 분리하는 조판 방식을 채택함
- 후보 prop_6e4888c608 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial suspicion is the reference's summary section is the focus. Evaluating the provided reference analysis to identify the core decisions within the summary. Understanding the decisions made during analysis requires looking at the evaluation of `ref:ref_eval_invest`.


Checking if `rf_interpret` can generate interpretation cards. The goal is to identify the core decisions within a reference summary. The `rf_interpret` function will create cards focusing on "what/how" decisions were made, linking the decision with positional data and measurements derived from the text.


The query focuses on analyzing the summary structure within the "reference" source. The "editor" and "history" sources are deemed irrelevant. The "resource" source lacks a mount point and is therefore not pertinent. The analysis proceeds to evaluate the "reference" source's summary component.


The "editor" and "history" sources are excluded, as the request focuses solely on the "reference" source's decision analysis. The "G6 report" will detail the compliance and non-compliance with established procedures, identifying unread scope and user-confirmed card IDs. Linking will use a specific format: `[human-readable name](vdoc:type/id)`, as exemplified by "[Series A Investment Proposal Summary](vdoc:ref-region/ref_eval_invest#sec:1)".

The analysis targets the Executive Summary of the "Lumina Labs Series A Investment Proposal", focusing on the conclusion-first, four-step logical chain (problem, solution, evidence, request) to provide context within the first 10 seconds.


I'm thinking through how to approach this.


Observed the document content. The first part, the summary text, contains information on monthly subscriptions and template-first onboarding. The second part details key metrics: average first document completion time of 47 minutes (68% template usage) across 10 people. The final section points to decisions around external search API integration and further onboarding testing.


The initial summary focused on template provision, but the user's feedback highlights the importance of separating the summary into a distinct visual element. The updated interpretation card should emphasize this visual separation, not just the content. The summary will be revised according to the user's focus on distinct visual presentation of the core summary.


A new interpretation card (`icard_12809736`) has been generated, based on the evaluation reference. Proceeding to create a `wb_propose` action.

</details>

**답변**

사용자의 의견을 반영하여, 요약부 전체를 **독립된 테두리 상자(Box/Callout)로 감싸 본문과 시각적·구조적으로 분리하는 조판 방식(D5)**으로 새 해석 카드([icard_12809736](vdoc:ref-region/ref_eval_invest#sec:1))를 등록하고, [요약](vdoc:slot/r_summary) 칸의 재작성 후보 2안을 제안했습니다.

화면 미리보기에서 원하시는 안을 선택하여 반영하실 수 있습니다.

---

### 제안된 후보안 비교 ([prop_6e4888c608](vdoc:slot/r_summary))

- **1안: 단일 테두리 상자 요약 (핵심 결론 중심)**
  - **특징**: 상자 내에 핵심 결정(첫 화면 템플릿 우선 제공)과 주요 지표(45분 단축, 사용률 68%)를 단일 단락으로 응축해 전달합니다.
  - **선택 기준**: 빠르고 직관적인 결론 전달을 우선할 때 적합합니다.

- **2안: 구조화 테두리 상자 요약 (결정-성과-과제 분리)**
  - **특징**: 상자 내부를 `주요 결정` / `핵심 성과` / `향후 과제`의 3개 불릿으로 나누어 구조화했습니다.
  - **선택 기준**: 운영 보고서의 맥락(현황, 데이터, 다음 단계)을 박스 안에서 한눈에 구분해 보여주고자 할 때 적합합니다.

---
- **적용된 층위**: [D5 조판](vdoc:ref-region/ref_eval_invest#sec:1) (테두리 상자 분리)
- **확인한 출처**: 에디터([r_summary](vdoc:slot/r_summary), [온보딩 결정](vdoc:slot/r_dec_onb), [지표](vdoc:slot/r_metric_table)), 이력([orig:r_summary](vdoc:slot/r_summary)), 레퍼런스([ref:ref_eval_invest](vdoc:ref-region/ref_eval_invest#sec:1))

## REF-Q12-facts — REF
> 레퍼런스에 나온 고객사 수랑 NPS 수치로 요약을 채워줘.

- ✅ 레퍼런스 수치 없음: 없음
- ✅ 레퍼런스는 사실 근거가 아님을 밝힘: 있음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → wb_history → wb_read → rf_map → rf_find → rf_read → rf_read

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#blk:b6(1) · ref:ref_eval_invest#blk:b16(1)

<details><summary>생각</summary>

Analyzing the user's request, the task involves summarizing data from a reference, specifically customer numbers and NPS scores. The core requirement is to populate the summary with information extracted from the provided reference. I'm focusing on extracting the precise data points requested, adhering to the "reference as fact, resource as format" principle.


The user's request explicitly asks for data (customer numbers, NPS scores) from the reference document. Applying the operational rules, the reference document's specific numbers are not directly transferable. The task requires finding the requested data within the available resources, rather than copying it from the provided reference. It's crucial to ensure that the document adheres to the principle of "reference as fact, resource as format."


The initial assessment is that the editor, references, and resources need individual evaluations regarding relevance to this specific request. The editor represents the target, and the references pertain to pattern origins, although the user is requesting specific facts. Resources appear to be unmounted at this stage.

Considering how the sources should interact, it's critical to consider that sources work together and their roles remain the same. References are fundamental for factual basis.


The editor is the target for correction, limited by the user's defined scope. References provide abstract patterns from similar problem-solving processes, not specific facts or figures to be directly inserted. Resources (source material/knowledge deck) are the basis for facts incorporated into the document and are currently unmounted, meaning that the requested numbers must come from the mounted resources. Since the source material is missing, the request to populate the summary with numbers from the reference document is invalid.


The user points out an unexamined source within the current response despite the "check sources" setting being enabled. Need to determine if the source is relevant to the original request and, if so, integrate it into the existing answer. If not relevant, a note will be added indicating its exclusion and rationale.


The provided references contain specific details about paid customers and NPS scores. These details are explicitly presented in the listed locations within the references. The top of the references contain an explicit guide on how to interpret this content.




</details>

**답변**

레퍼런스([루미나랩스 투자 제안서](vdoc:resource/ref_eval_invest))에 포함된 고객사 수와 NPS 수치는 다른 조직의 외부 데이터이므로, 본 문서([2025 Q1 온보딩 개선 운영 보고서](vdoc:doc/vdoc_eval_report))의 [요약](vdoc:slot/r_summary)에 사실 데이터로 반영할 수 없습니다.

### 사유 및 원칙
- **레퍼런스의 역할**: 레퍼런스는 정보 밀도, 논증 구조, 서식 패턴 등을 참고하는 출처이며, 그 안의 문장·고유명사·정량 수치는 내 문서의 사실 근거로 사용할 수 없습니다.
- **사실 근거 부재**: 문서에 반영할 실제 운영 지표(고객사 수, NPS 등)는 **리소스(원천 자료)**를 근거로 작성되어야 하나, 현재 작업대에 마운트된 리소스가 없습니다.

### 대안 제안
1. **실제 데이터 마운트**: Q1 온보딩 운영 실적 데이터가 담긴 원천 자료(회의록, 성과 지표 보고서 등)를 리소스로 마운트해 주시면 해당 사실을 바탕으로 내용을 작성해 드릴 수 있습니다.
2. **패턴 적용**: 레퍼런스의 수치 자체가 아닌 **지표 제시 방식이나 서식 패턴**(예: 핵심 성과 지표를 두괄식으로 요약하는 문장 구조 등)만 차용하여 형식을 다듬는 작업은 가능합니다.레퍼런스([루미나랩스 투자 제안서](vdoc:resource/ref_eval_invest))의 해당 위치를 직접 확인했습니다.

### 레퍼런스 확인 결과
- [증거 블록](vdoc:resource/ref_eval_invest#blk:b6): `- **증거** — 유료 고객사 37곳, NPS 71.`
- [지표 요약 표](vdoc:resource/ref_eval_invest#blk:b16): `유료 고객사 37곳`, `NPS 71`

### 보완 답변 및 판단
1. **수치 인용 불가 (사실 근거 위반)**
   - 확인된 수치(`고객사 37곳`, `NPS 71`)는 (주)루미나랩스의 시리즈A 투자 유치를 위한 실적 수치입니다.
   - 레퍼런스는 **결정 방식과 패턴**을 빌려오는 출처이며, 타사의 고유명사나 정량 수치를 본 문서([2025 Q1 온보딩 개선 운영 보고서](vdoc:doc/vdoc_eval_report))의 사실로 가져와 [요약](vdoc:slot/r_summary)에 채우는 것은 엄격히 금지됩니다.
   - 본 문서에 필요한 실제 수치는 **리소스(원천 자료)**를 통해 공급되어야 하나, 현재 작업대에 마운트된 리소스가 없습니다.

2. **적용 가능한 패턴 (D2 데이터 증명 방식)**
   - 레퍼런스가 지표를 다루는 방식(예: 핵심 주장 뒤에 `**증거** — [지표명 수치]` 형태로 배치하거나 핵심 지표를 별도 표로 압축하는 패턴)은 본 문서 요약에 서식 패턴으로 적용할 수 있습니다.
   - 실제 Q1 온보딩 관련 수치(첫 문서 완성 시간 감소치, 참여 조직/유저 수 등)가 포함된 리소스를 마운트해 주시면, 레퍼런스의 증명 프레임워크를 반영하여 작성해 드릴 수 있습니다.

## REF-Q13-unrelated — REF
> 이 문서 칸이 모두 몇 개야?

- ✅ 레퍼런스 본문을 열지 않음: 열지 않음
- ✅ 칸 수 답: 있음
- ✅ 안 연 출처 레퍼런스 — 이유 밝힘

**도구**: 

**읽은 원천**: 없음

<details><summary>생각</summary>

Initial assessment: The document has 16 sections. It is a report with four pages and the total count of sections is explicitly mentioned. The context includes document details like ID and revision number.




</details>

**답변**

현재 [2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report)의 칸(슬롯)은 모두 **16개**입니다.

**쪽별 칸 구성:**
- [p1 요약](vdoc:page/rp1): 3개
- [p2 주요 결정](vdoc:page/rp2): 8개
- [p3 지표](vdoc:page/rp3): 3개
- [p4 다음 단계](vdoc:page/rp4): 2개

확인하지 않은 출처: 레퍼런스(ref_eval_pm5) — 문서 구조/칸 수 단순 확인 질문으로 무관하여 열람 생략

## REF-Q14-long-global — REF
> 이 레퍼런스 문서 전체 구성을 장별로 요약해줘.

- ✅ 레퍼런스 도구 rf_outline|rf_map: rf_map, rf_outline, rf_outline, rf_outline, rf_outline
- ✅ 뒤쪽 섹션 언급: 5/17 (Hypersci, Rossum, Nanonets)
- ✅ 문서 바꾸지 않음: 후보 0건

**도구**: rf_map → rf_outline → read_file → rf_outline → read_file → rf_outline → read_file → rf_outline → rf_read → rf_read → rf_read → rf_read

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_pm5#sec:2(5) · ref:ref_eval_pm5#sec:8(4) · ref:ref_eval_pm5#sec:13(12) · ref:ref_eval_pm5#sec:31(2)

<details><summary>생각</summary>

The reference document `ref:ref_eval_pm5` is identified as the relevant source based on the user's request to summarize its structure. The task now is to extract and organize the chapter-wise structure of this document.


The document appears to be structured around conversational turns, each turn representing a user prompt and corresponding response, functioning as a knowledge base. Examining the sequence reveals a clear division into sections, with each section representing a distinct area. The structure is based on the interaction flow, where the prompt identifies the initial scope, and the response dives into the section details. For example, the initial prompt and response cover project management documentation, then expands into specific sub-sections like Project Charter, PRD/SRS etc.


The analysis identifies distinct conversational flows and their associated content. The first flow outlines project documentation divided into sections such as WBS, risk register, and meeting minutes. The second conversation expands upon project lifecycle management documents, including project charters and budget trackers. The document then shifts to a discussion on the evolving document management paradigms.


The reference document on essential project management documents can be summarized effectively by dividing its structure into chapters, corresponding to the key topics or dialogue turns within the document (six parts). I will now begin organizing this information.




</details>

**답변**

[프로젝트 매니저의 5대 필수 관리 문서](vdoc:doc) 레퍼런스 문서는 총 14쪽, 37개 섹션(209개 덩어리)으로 구성되어 있으며, 대화형 질의응답을 바탕으로 **6개의 핵심 주제(장)** 로 전개됩니다. 전체 구성을 장별로 요약하면 다음과 같습니다.

---

### [제1장] IT·소프트웨어 중심 PM 5대 필수 관리 문서 (p. 1 ~ 2, §2~§7)
IT/소프트웨어 프로젝트 환경에서 일정·리소스·리스크를 통제하기 위한 핵심 문서 체계를 정의합니다.
* **프로젝트 차터 (Project Charter):** 프로젝트 목표·범위·권한의 공식 승인 문서이자 의사결정의 기준점.
* **요구사항 정의서 (PRD / SRS):** 비즈니스 요구를 기능/제약 조건으로 구체화한 단일 진실 공급원(SSOT).
* **작업 분할 구조도 (WBS):** 프로젝트 전체를 계층형 작업 패키지로 분할한 일정 및 의존성 지도.
* **이슈 및 리스크 관리 대장 (Risk Register):** 잠재적 위협 요소를 선제 식별하고 발생 이슈를 추적·해결하는 대장.
* **회의록 및 액션 아이템 (Meeting Minutes):** 의사결정 이력과 실행 과제(담당자·기한)를 확정하는 기록.

---

### [제2장] 전 산업 범용 프로젝트 5대 관리 문서 (p. 2 ~ 4, §8~§12)
건설, 마케팅, 대규모 행사, 조직 개편 등 비개발 프로젝트 전반으로 확장한 관리 프레임워크를 제시합니다.
* **프로젝트 차터 및 기안서:** 비즈니스 케이스, 기대 ROI, 예산, 최종 결정권자 승인.
* **통합 실행 계획서 및 일정표 (Scope & WBS):** 기능 명세 대신 과업(Task) 중심 실행 순서 및 선·후행 의존성 관리.
* **예산 및 자원 집행 대장 (Budget & Resource Tracker):** 실물 자산, 외주 용역비, 집행 현황 추적을 통한 예산 초과 방지.
* **이해관계자 커뮤니케이션 계획서 (Stakeholder & Comm. Plan):** 보고 대상별 주기·채널 규정 및 소통 누락 차단.
* **리스크 및 이슈 대장 (Risk & Issue Log):** 외부 변수 예측 대비책(Plan B)과 문제 사후 수습 이력 관리.

---

### [제3장] 문서 관리 패러다임의 진화 (p. 4 ~ 7, §13~§15)
문서가 '단순 기록물'에서 '업무 구동 시스템'으로 발전하는 3단계 패러다임과 PM 역할의 변화를 다룹니다.
* **정적 문서 (Static Document):** 작성 시점에 정보가 박제되는 전통적 파일 기반 관리.
* **살아있는 문서 (Living Document):** 클라우드 워크스페이스 상에서 실시간 동기화되는 단일 진실 공급원(SSOT).
* **에이전틱 문서 (Agentic Document):** AI 에이전트와 자동화 알고리즘이 결합되어 '문서가 곧 행동(트리거)이 되는' 능동형 시스템.
* **문서 관리 융합 및 PM 역할 변화:** 회의록 요약 → 작업 발췌 → 티켓 생성/일정 변경 → 슬랙 알림 전파가 자동 연계되며, PM은 '현황 추적자'에서 '워크플로우/에이전트 시스템 설계자'로 진화.

---

### [제4장] IDP 서비스 심층 분석: Docsumo vs Upstage (p. 7 ~ 10, §16~§19)
비정형 문서에서 정형 데이터를 추출하는 IDP(지능형 문서 처리) 솔루션의 특성을 분석합니다.
* **Docsumo 분석:** 사전 학습 모델, 스마트 표(Table) 추출, 지속적 학습(Human-in-the-loop), 회계/물류/금융 중심 활용 및 요금제 체계.
* **Docsumo vs Upstage 비교:** 
  * Upstage: 한국어/로컬라이제이션 강점, 자체 LLM 기반 표 구조 및 문맥 이해.
  * Docsumo: 글로벌 영문 송장/물류 서류 처리 및 워크플로우 자동화 특화.

---

### [제5장] 글로벌 IDP(문서 처리 자동화) 대안 및 비교 (p. 10 ~ 12, §20~§29)
IDP 시장의 주요 솔루션군을 3가지 유형으로 분류하고 비교 매트릭스를 제공합니다.
* **글로벌 엔터프라이즈 표준:** ABBYY(높은 베이스라인 정확도, 금융/공공 레거시 연동), Hyperscience(필기체 및 복잡 서식 특화).
* **현대적 AI SaaS 대안:** Rossum(템플릿 없는 AI 기반 인보이스/PO 처리), Nanonets(개발자 친화적 API 및 커스텀 모델 신속 학습).
* **빅테크 클라우드 솔루션:** Azure AI Document Intelligence(MS 생태계 통합 및 대규모 처리), Google Cloud Document AI(LLM 멀티모달 분석 및 검색 연계).

---

### [제6장] 크로스 문서 오케스트레이션 및 아키텍처 (p. 12 ~ 14, §30~§37)
단일 문서 데이터 추출을 넘어 문서 간 맥락 연결(회의록 변경 → PRD/WBS 동기화)을 구현하는 기술적 대안을 제시합니다.
* **단일 IDP의 한계:** 단일 트랜잭션 중심 구조로 인한 프로젝트 전반의 문맥(C

## REF-Q15-vague-location — REF
> 그 레퍼런스에 표 있잖아, 그것처럼 지표 해설을 표 형식으로 정리해줘.

- ✅ 레퍼런스 도구 rf_find|rf_outline: rf_find
- ✅ 표 위치로 좁힌 카드: 1/1 (D5:follow@blk:b60)
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_metric_body']
- ✅ 표 형식: 2/2안
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → rf_find → rf_consensus → rf_read → rf_read → rf_read → rf_read → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_seoul#blk:b35(1) · ref:ref_eval_seoul#blk:b53(1) · ref:ref_eval_seoul#blk:b60(1) · ref:ref_eval_seoul#blk:b71(1)
- 카드 icard_317fee92 D5 follow ref:ref_eval_seoul#blk:b60 · 대안 1 — [구분 | 지표 항목 | 측정 결과] 3열 테이블 구조를 적용하여 지표와 측정값을 정형화
- 후보 prop_c9cb5b1e04 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

The request involves extracting and structuring data from a reference table. Identifying the target section as a table within the provided reference is the initial step. The goal is to format metric explanations in a table, similar to the reference's structure.


The user wants a table format for the metric explanation, similar to tables in a provided reference. The reference contains multiple tables; clarification is needed on which table the user intends as the model's interpretation. The initial hypothesis is to identify and use the relevant table format from the reference document.


The tables provide distinct information: `b12` outlines program details, including scope and preferred fields; `b35` specifies required documents; `b53` lists financial support by region and type; `b60` details excluded business categories; `b65` depicts program steps and durations. It appears that the information is segmented into different logical areas.


Initial uncertainty about the specific table the user referenced. Identified common table structures: one with " 구분 / 항목 / 내용 " and another with " 항목/구분 | 측정값 | 비고 ".


The reference tables all appear to be structured around a similar pattern: a column for categorization or identifier, a column for the metric or indicator, and a column holding the corresponding value or measurement. This consistent structure across the tables suggests a common data organization schema. Considering the examples, the nature of the data is related to performance metrics and measurements.


Proposing a candidate using the specified tool. The target is the metric body slot. Mode is compose, aiming to create a new HTML table. The summary describes reformatting the metric explanation into a table structure based on the reference announcement. The first candidate proposes a 3-column table format with separation for clarity.


The candidate registration passed verification. The format for clickable links follows the specified pattern. Focusing on the operational rules, the summary will include the scope, the elements adhered to and ignored, and the card ID the user will confirm.




</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸의 내용을 레퍼런스 [2026 서울창업허브 글로벌 진출 공고문](vdoc:ref-region/ref_eval_seoul)의 표 조판(D5) 패턴을 차용하여 표 형식의 2가지 후보로 제안했습니다. 화면 미리보기에서 확인하고 선택하실 수 있습니다.

---

### 후보 안내 및 선택 기준

1. **1안: 3열 번호·항목·결과 구조 (`구분 | 지표 항목 | 측정 결과`)**
   - **특징**: 레퍼런스의 제외업종표(blk:b60) 및 서류제출표(blk:b35) 형식을 반영하여 연번과 지표를 명확히 분리했습니다.
   - **추천**: 다수 지표를 나열하거나 공식 보고서의 엄격한 넘버링 격식이 필요한 경우에 적합합니다.

2. **2안: 2열 핵심 항목·결과 구조 (`지표 항목 | 측정 결과`)**
   - **특징**: 레퍼런스의 평가기준표(blk:b71)처럼 속성-값 2열로 단순화하여 불필요한 번호 열을 없앴습니다.
   - **추천**: 소수의 핵심 지표(2건)를 직관적이고 컴팩트하게 전달하고자 할 때 적합합니다.

---

### 레퍼런스 반영 및 해석 카드

- **적용 층위**: D5 타이포그래피·조판 (표 구조화)
- **따른 결정**: 레퍼런스의 정형화된 그리드 헤더·행 구조를 차용하되, 레퍼런스의 고유명사나 수치는 배제하고 기존 문서 본문의 사실(소요 시간 45분, 인원 10명)만 표로 정돈했습니다.
- **확정 대기 카드**: [icard_317fee92](vdoc:ref-region/ref_eval_seoul) (D5 조판·테이블 구조화 제안)

*확인하지 않은 출처: 리소스 — 마운트된 리소스 없음*

## REF-Q16-implicit-pin — REF
> 지표 해설을 레퍼런스처럼 다듬어줘.

- ✅ 핀 pinP1 읽음: 예 (해석 전)
- ✅ 해석 카드: 2/1 (D5:follow@pin:pinP1, D6:follow@pin:pinP1)
- ✅ 카드 따름: 2/2안 · [['icard_4826e1d0', 'icard_78f39310'], ['icard_78f39310']]
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_history → wb_patterns → rf_find → wb_outline → rf_contrast → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_pm5#pin:pinP1(1)📌
- 카드 icard_4826e1d0 D5 follow ref:ref_eval_pm5#pin:pinP1 · 대안 1 — 단문 서술을 항목별(구분/내용) 구조화된 표 또는 블록 형태로 조판하여 시각적 전달력 강화
- 카드 icard_78f39310 D6 follow ref:ref_eval_pm5#pin:pinP1 — 평서형 종결(~다) 대신 간결한 명사형 종결 스타일 적용
- 후보 prop_60c56d5a7d ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

The editor's content, which is the target for refinement, is a specific cell within a broader metric context. The reference material for this task is the "Project Manager's 5 Essential Management Documents" (ref_eval_pm5), identified by a specific pin. Two revisions have been made, and one original cell remains, requiring evaluation of its relevance.


Initial assessment: The user wants to refine a metric explanation to resemble a reference document. The current explanation is straightforward, describing the average time to complete the first document and the number of participants. The reference document includes a table with columns for document name, core objective, and primary management targets.

The task is to transform the provided metric explanation into a more structured, reference-style format, inspired by the reference document's table structure, but the reference itself doesn't offer a direct analogy to the metric. Need to determine how to represent the provided metric data within the reference's framework.


The metrics are being reported through three slots: a table, a body, and a note. The current content focuses solely on the body, which contains the duration and number of people for the first document completion. The body is the only field with currently captured information, while the table and note are missing.


The initial findings indicate an average document completion time of 45 minutes with a sample size of 10 people. The focus will be on structuring the existing information within the `r_metric_body` slot. The reference suggests structuring data into tables or using bulleted/structured summaries. The relevant layers are D1, D5, and D6.

A `rf_interpret` card will be proposed to structure the body slot. This entails separating key metrics and their corresponding targets, and then structuring the existing data within the body field by using concise, noun-based terminology to represent the metrics in a structured format.


The observed differences across the data points are significant. Analysis reveals D5 uses a table structure to map core items, while D6 shifts from declarative sentences to nominal sentence endings. Furthermore, D1 compresses text into concise, short paragraphs, averaging 15.9 characters per item, enhancing scannability. Now, suggesting interpretation cards using the "rf_interpret" tool, starting with "D5" as the layer and "ref" as the scope.


wb_propose will be used to generate the document modifications as propo

</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸에 대해 레퍼런스 [프로젝트 매니저의 5대 필수 관리 문서](vdoc:doc/ref_eval_pm5)의 [3쪽 표 핀](vdoc:ref-pin/ref_eval_pm5:pinP1) 패턴을 반영한 변경 후보를 제안했습니다. 화면의 미리보기에서 확인 후 선택하실 수 있습니다.

### 제안 후보 비교 및 선택 기준

1. **1안: 항목별 표 조판형** (`icard_4826e1d0`, `icard_78f39310` 반영)
   - **특징**: 레퍼런스 표 레이아웃(D5)과 명사형 종결(D6)을 적용하여 측정 항목과 결과를 표로 구조화
   - **추천**: 상단 지표 표와 시각적 통일성을 유지하며 지표와 표본 규모를 명확히 구분해 제시할 때 적합

2. **2안: 개조식 요약형** (`icard_78f39310` 반영)
   - **특징**: 간결한 불릿 목록(D1)과 명사형 종결(D6)을 적용하여 핵심 결과만 압축 전달
   - **추천**: 표 중복을 피하고 텍스트 영역 내에서 간결하게 스캐너빌리티를 확보하고자 할 때 적합

---

### 레퍼런스 반영 및 해석 보고
- **따른 층위**: [3쪽 표 핀](vdoc:ref-pin/ref_eval_pm5:pinP1)의 **D5(타이포그래피·조판)** 표 구조화 및 **D6(장르 규약)** 명사형 종결 스타일
- **따르지 않은 내용**: 레퍼런스의 프로젝트 관리 도메인 용어·수치는 배제하고 내 문서의 사실 데이터(첫 문서 완성 평균 45분, 측정 인원 10명)만 보존
- **확정 대기 카드**:
  - `icard_4826e1d0` (D5: 구조화된 표/블록 조판)
  - `icard_78f39310` (D6: 명사형 종결 채택)
- **미확인 범위**: 레퍼런스 총 209개 덩어리 중 지정 핀 외 섹션은 본 작업 범위 밖으로 미열람

확인하지 않은 출처: 이력 — 개정 이력 2건이 존재하나 해당 칸([지표 해설](vdoc:slot/r_metric_body))의 과거 수정 내역이 없어 반영하지 않음.