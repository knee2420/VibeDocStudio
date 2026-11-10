# 작업대 평가 — ref-r3

전체 18/19 · 튜닝 세트 15/16 · 보류 세트 3/3

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| REF-Q1-ambiguous | REF | ✅ | 6/6 | 74.5s | 37,129/138,565/5,674 | 9 | ready:2 |
| REF-Q2-layer-only | REF | ✅ | 4/4 | 49.7s | 35,401/109,336/4,226 | 7 | needs_fix:2,ready:2 |
| REF-Q3-pin | REF | ❌ | 1/5 | 59.6s | 15,034/0/7,450 | 0 | - |
| REF-Q4-layer-area | REF | ✅ | 5/5 | 53.4s | 36,318/119,289/4,092 | 7 | ready:2,ready:2 |
| REF-Q5-exclude | REF | ✅ | 4/4 | 75.4s | 42,767/173,243/6,475 | 9 | needs_fix:2,ready:2 |
| REF-Q6-consult | REF | ✅ | 5/5 | 89.5s | 38,206/149,116/6,339 | 9 | needs_fix:2,ready:2 |
| REF-Q7-analyze | REF | ✅ | 4/4 | 48.6s | 33,284/89,626/4,407 | 5 | - |
| REF-Q8-contrast | REF | ✅ | 3/3 | 66.3s | 36,497/119,816/4,419 | 9 | - |
| REF-Q9-combine | REF | ✅ | 7/7 | 70.9s | 38,200/160,921/6,533 | 12 | ready:2 |
| REF-Q10-apply-consensus | REF | ✅ | 5/5 | 50.6s | 36,119/115,694/4,340 | 6 | ready:2 |
| REF-Q11-revise | REF | ✅ | 4/4 | 444.8s | 38,207/133,394/2,383 | 14 | ready:2 |
| REF-Q12-facts | REF | ✅ | 3/3 | 13.5s | 22,806/0/988 | 0 | - |
| REF-Q13-unrelated | REF | ✅ | 3/3 | 14.0s | 25,216/21,022/1,014 | 0 | - |
| REF-Q14-long-global | REF | ✅ | 3/3 | 76.1s | 51,131/299,152/4,529 | 13 | - |
| REF-Q15-vague-location | REF | ✅ | 5/5 | 88.1s | 57,385/317,130/5,775 | 16 | ready:2,ready:2 |
| REF-Q16-implicit-pin | REF | ✅ | 5/5 | 57.4s | 48,017/221,186/4,712 | 11 | ready:2,ready:2 |
| REF-H1-ambiguous-public (보류) | REF | ✅ | 5/5 | 66.6s | 42,317/172,091/5,873 | 10 | ready:2,ready:2 |
| REF-H2-confirm-then-apply (보류) | REF | ✅ | 3/3 | 120.8s | 68,671/506,469/9,009 | 17 | ready:2 |
| REF-H3-tone-minus-emoji (보류) | REF | ✅ | 4/4 | 46.1s | 38,247/115,569/4,126 | 7 | needs_fix:2,ready:2 |

## REF-Q1-ambiguous — REF
> 요약을 이 레퍼런스처럼 써줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 해석 카드: 3/1 (D4:follow@blk:b3, D1:follow@blk:b4, D6:follow@blk:b3)
- ✅ 해석 갈림 다룸: 대안 해석 2장 · 후보별 따른 카드 조합 2가지
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 모든 후보가 카드를 따름: 2/2안 · [['icard_15d8f823', 'icard_e5b88df3', 'icard_ba1dee35'], ['icard_15d8f823', 'icard_ba1dee35']]
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → wb_patterns → rf_read → wb_history → wb_read → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_15d8f823 D4 follow ref:ref_eval_invest#blk:b3 · 대안 1 — 요약 서두에 두괄식 핵심 결론 문장을 단독 배치하여 주요 성과를 즉각 전달하도록 결정했다. (ref:ref_eval_invest#blk:b3 conclusion_first=True)
- 카드 icard_e5b88df3 D1 follow ref:ref_eval_invest#blk:b4 · 대안 1 — 핵심 내용을 4단 개조식 목록('- **키워드** — 내용')으로 분해하여 스캐너빌리티와 정보 밀도를 극대화했다. (avg_para_chars=20.4, bullet 목록 활용)
- 카드 icard_ba1dee35 D6 follow ref:ref_eval_invest#blk:b3 — '강조하고 싶다', '다양한' 등 모호한 수식어 대신 단호한 평서문(~다)과 간결한 체언 종결을 사용해 보고서의 격식을 확보했다.
- 후보 prop_90a7680d22 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


Examined the structure of the references. The top section consistently includes a title, metadata (date, confidentiality), a concise conclusion, and a four-part summary covering the problem, solution, evidence, and request. The main body generally contains contextual information, problem description, and supporting questions.


The existing summary presents a long, single paragraph lacking a clear structure. The target summary should adopt a concise, bulleted format similar to the references. Focusing on rewriting to incorporate the problem, solution, evidence, and next steps will make the summary more scannable.


The original summary was concise, but the revised version is more elaborate. The task now is to generate a reference interpretation card. The rule is that if a layer lacks consensus, then a reference interpretation card is needed. The reading section should explain the reasoning behind the layer's range/decision. The evidence should be the anchor. Alternatives should be used if there are different ways to interpret the same phenomenon.


Generated interpretation cards for the provided summary sections, focusing on the described D4 and D1 frames. The first card highlights the use of a concise headline conclusion. The second details the structuring of core elements into bulleted lists for scannability.


The initial set of interpretation cards presents three distinct organizational approaches. The first suggests a concise, direct summary. The second proposes a modified list format, while the third favors declarative statements. Now, considering the existing rule for proposing, it's time to generate the best choice.


The task is to generate candidate responses for restructuring existing content based on specific formatting patterns and references. Two candidates will be constructed.

Candidate 1 will present a 4-part structure: a concise conclusion, a bullet-point list covering the goal, solution, and results. This will be the first trial.


The validation of `wb_propose` succeeded.

Reviewing the rules, focusing on addressing failures by correction and providing rationale for choices after successful validation, along with clear specification of card IDs for user confirmation. This also involves noting any deviations from specified levels, scopes, unread sections, and providing clickable links to on-screen references.




</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 [루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest)의 구성 및 문체 패턴에 맞춰 개편한 2가지 후보안을 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

---

### 제안된 후보안 및 선택 기준

1. **1안: 두괄식 결론 + 4단 개조식 요약 (레퍼런스 핵심 패턴)**
   - **적용**: 두괄식 단독 결론문 배치 후, **목표·방식·성과·과제** 4개 항목으로 분해한 불릿 리스트(`- **키워드** — 내용`)를 적용했습니다.
   - **추천 기준**: 경영진 보고 등 한눈에 핵심 지표와 진척 상황을 빠르게 스캔해야 하는 경우에 적합합니다.

2. **2안: 소제목 분할 단락 요약 (대안 패턴)**
   - **적용**: 결론 제시 후 **시도 및 결과**, **향후 과제** 2개 소주제 단락으로 내용을 압축·정리했습니다.
   - **추천 기준**: 불릿 리스트 대신 줄글 형태의 자연스러운 보고서 흐름을 유지하고 싶을 때 적합합니다.

---

### 레퍼런스 적용 및 해석 카드 보고

- **따른 층위 및 범위**:
  - **D4 서술 프레임워크** ([blk:b3](vdoc:doc/ref_eval_invest)): 두괄식 핵심 결론 단독 배치 (`icard_15d8f823`)
  - **D1 정보 밀도·스캐너빌리티** ([blk:b4~b7](vdoc:doc/ref_eval_invest)): 4단 키워드 개조식 목록화 (`icard_e5b88df3`)
  - **D6 장르 규약** ([blk:b3](vdoc:doc/ref_eval_invest)): 모호한 수식어 배제 및 명확한 평서문 종결 (`icard_ba1dee35`)
- **따르지 않은 요소**: 레퍼런스의 고유명사, 투자 유치 관련 지표(TAM, 고객사 수, 투자금 등) 및 표 서식은 온보딩 보고서 맥락에 맞지 않아 배제했습니다.
- **읽은 범위**: 레퍼런스 전체 18개 덩어리 완독 (18/18)
- **확정 대기 카드**: `icard_15d8f823`, `icard_e5b88df3`, `icard_ba1dee35`

## REF-Q2-layer-only — REF
> 지표 해설을 이 레퍼런스의 말투(어조)만 따라서 바꿔줘. 구성과 내용은 그대로.

- ✅ 어조(D6) 따름 카드: 1/1 (D6:follow@전체, D4:exclude@전체)
- ✅ 후보는 D6 카드만 따름: 2/2안 · [['icard_0c3db2af'], ['icard_0c3db2af']]
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_blog(13)
- 카드 icard_0c3db2af D6 follow ref:ref_eval_blog — 독자에게 대화하듯 친근하게 다가가는 부드러운 '해요체(~해요, ~요)' 어조를 사용합니다.
- 카드 icard_140bc83a D4 exclude ref:ref_eval_blog — 레퍼런스의 리스트형 팁 구성은 채택하지 않고, 기존 문서의 서술형 문장 구조를 그대로 유지합니다.
- 후보 prop_8815ab44bf needs_fix 2안 restyle · 오류 2 · 경고 1
  - ✗ 후보 1 '1안: 직관적이고 단정한 해요체': icard_140bc83a 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 친근한 대화형 해요체': icard_140bc83a 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_858cb058d9 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial assessment: The task involves rewriting a specific text section ("r_metric_body") to match a given style (from a reference) while keeping the content unchanged. This fits the pattern for a content transformation. The resource to be used (content) is explicitly specified as "mount 없음 (내용 그대로 유지)". The history is irrelevant for this operation.


The references consistently exhibit a friendly, informal tone ("해요체," casual dialogue) suitable for straightforward requests. The task involves adapting the tone of provided text to match this style while preserving content and structure.


The system identified two interpretation cards: one in 해요체 and another maintaining the original composition. Proceeding to generate a proposal with the `wb_propose` function, targeting the "r_metric_body" slot. The user's request necessitates a restyling of the provided text, preserving the original content and numerical values while altering the tone to match the specified reference.


Two alternative restyling proposals were generated for the "r_metric_body" slot, focusing on conveying the original numerical data with a 해요체 tone. The first candidate maintains the original sentence structure with a more straightforward "해요체" ending. The second candidate adopts a slightly more conversational "해요체" style to make it sound more fluid.


The validation failure stems from two issues. First, an incorrect card (`icard_140bc83a`) was included in the `follows` list; only the following card (`icard_0c3db2af`) should be present. Second, the "friendly, conversational 해요체" candidate in restyle mode significantly altered the original content, indicated by a low percentage of original words remaining in the target field; this contradicts the goal of maintaining the original text in restyle.


The proposed writeback passed validation. Reviewing operational rules and reference procedure report items: the G6 report shows adherence to friendly "해요체" (D6 genre convention) and non-adherence to the D4 narrative framework (maintaining existing descriptive structure, reference composition/proper noun exclusion). The report also guides the user to confirm a card (recommending confirmation of icard_0c3db2af) and briefly explains the differences between options with selection criteria. A link to indicator explanations is present.




</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸의 사실 수치(평균 45분, 인원 10명)와 문장 구성을 그대로 보존하고, 레퍼런스 [노트몽키 블로그 — 회의록 정리 꿀팁 5가지]의 친근한 말투(어조)만 반영한 2가지 후보안을 제안했습니다. 화면 미리보기에서 확인하실 수 있습니다.

---

### 반영 내용 및 제안 카드
* **따른 층위**: **D6 장르 규약** — 레퍼런스의 대화형 '해요체' 어조 채택 ([icard_0c3db2af])
* **유지한 층위**: **D4 서술 프레임워크** — 레퍼런스의 리스트형 팁 구성을 따르지 않고 기존 2개 문장 구조를 유지 ([icard_140bc83a])

---

### 후보안 비교 및 선택 기준

1. **1안: 기본 해요체 종결**
   > "측정 결과 첫 문서 완성까지 평균 45분이 걸렸어요. 측정 인원은 10명이에요."
   * **특징**: 기존 문장의 낱말과 어순을 그대로 유지하며 종결어미만 단정하고 친근한 해요체(~어요, ~이에요)로 변환했습니다. 보고서의 단정함을 유지하고 싶을 때 적합합니다.

2. **2안: 부드러운 대화체 종결**
   > "측정 결과 첫 문서 완성까지 평균 45분이 걸렸답니다. 측정 인원은 10명이었어요."
   * **특징**: 레퍼런스 블로그 특유의 독자 친화적인 뉘앙스(~걸렸답니다, ~이었어요)를 더 살려 부드러운 구어체 느낌을 강조했습니다. 블로그처럼 편안한 어조를 원할 때 적합합니다.

화면에서 마음에 드는 후보안을 선택해 적용하실 수 있으며, 제안된 해석 카드([icard_0c3db2af])도 함께 확정해 주시면 이후 작업에 일관되게 반영됩니다.

---
확인하지 않은 출처: 이력 — 내용 복원이 아닌 서식 변경(restyle) 작업이므로 이전 판 이력은 참조하지 않았습니다.

## REF-Q3-pin — REF
> 레퍼런스에서 핀 찍어 둔 부분처럼 요약을 다시 짜줘.

- ❌ 핀 pinA1 읽음: 아니오
- ❌ 핀 범위 카드: 0/1 (카드 없음)
- ❌ 핀 범위 카드를 따름: 없음
- ❌ 후보 제안: wb_propose 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: 

**읽은 원천**: 없음

<details><summary>생각</summary>

I'm thinking through how to approach this.


The available tools are read_file, edit_file, write_file, run_command, list_resources, read_resource, ask_question, invoke_subagent, define_subagent, manage_subagents, send_message, manage_task, schedule, search_web, but the vibefs MCP tools (wb_*, rf_*, ws_*) are missing. The workspace currently has no tools available. The target document is a draft report, with a selected section needing editing.


The environment lacks the `vibefs` tools, even though the description implies their availability. This discrepancy suggests either a testing scenario or a simulated tool environment where certain functionalities are restricted. Reviewing the rules emphasizes the importance of verifying relevance across all available sources before making assumptions about tool availability or capabilities. The immediate need is to determine if the `vibefs` tools, despite being undeclared, are actually accessible or if alternative methods must be used.


The rules specify that `wb_*`, `ws_*`, and `rf_*` tools are "built-in," but the tool declarations do not include them, only standard API tools. This discrepancy suggests either a misunderstanding of tool availability or a difference between theoretical and practical access. The system prompt explicitly states that these tools should be accessed via internal calls, not tool calls, contradicting their apparent omission in the declared tool list.



The absence of `vibefs` tools, explicitly listed as "built-in" in the rules, raises a critical inconsistency. System prompt suggests direct internal calls for these tools, not standard tool calls, yet they are omitted from the tool declarations. This mismatch indicates either a fundamental misunderstanding of the tool integration or a deliberate restriction within the environment, which needs further clarification. It's possible that the "built-in" tools are not directly accessible via standard function calling. The system might be designed so that the agent handles the built-in tools.


The prompt suggests this is a test within a "Prompt Evaluation Harness" for evaluating LLM responses within a specific framework ("VibeDocStudio AI Composer"). The task involves evaluating the LLM's adherence to "workbench rules" by assessing the relevance of various sources. Initial focus must be on verifying the availability of any listed resources, even if the explicit tools are not available. The immediate task is to identify and process relevant informa

</details>

**답변**

에디터=대상 칸 [요약](vdoc:slot/r_summary) · 레퍼런스=패턴([루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest) 핀 1개) · 리소스=마운트 없음(관련 없음) · 이력=관련 없음(되돌리기 요청 아님)

---

### 작업 진행 상태

1. **대상 및 레퍼런스 식별**
   - **대상 칸**: 2025 Q1 온보딩 개선 운영 보고서의 [요약 칸](vdoc:slot/r_summary) (p1 요약)
   - **참조 레퍼런스**: [(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest) 내 설정된 핀 1개

2. **읽기 도구 확인 필요**
   - 규칙에 따라 추측으로 문서를 채우거나 임의의 사실을 지어낼 수 없습니다.
   - 현재 작업대 컨텍스트에 [요약 칸](vdoc:slot/r_summary)의 본문 및 레퍼런스([루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest)) 핀 영역의 원문이 포함되어 있지 않으며, 작업대 읽기 도구(`wb_read`, `rf_read` 등)가 제공되지 않아 핀이 가리키는 패턴(정보 밀도, 논증 구조 등)과 현재 요약 내용을 직접 조회할 수 없습니다.

요약안 작성을 진행하려면 [요약 칸](vdoc:slot/r_summary)의 현재 내용과 [투자 제안서](vdoc:doc/ref_eval_invest)의 핀 영역 내용을 에디터 맥락(@첨부)으로 공유해 주시거나 읽기 도구를 연결해 주시기 바랍니다.

---
확인하지 않은 출처: 이력 — 되돌리기 요청이 아니며 요약 재구성 요청이므로 확인하지 않음

## REF-Q4-layer-area — REF
> 레퍼런스 2쪽에 있는 표의 짜임새(조판)만 참고해서 지표 해설을 정리해줘.

- ✅ 레퍼런스 도구 rf_find|rf_read|rf_outline: rf_read
- ✅ 2쪽 범위 D5 카드: 1/1 (D5:follow@blk:b35)
- ✅ D5 카드를 따름: ['icard_8bcbd953', 'icard_8bcbd953']
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_read → rf_consensus → rf_measure → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_seoul#p2(23)
- 카드 icard_8bcbd953 D5 follow ref:ref_eval_seoul#blk:b35 — 구분(연번) · 항목명 · 세부 내용(설명)의 3열 구조 표를 사용하여 항목별 핵심 정보를 일목요연하게 조판함
- 후보 prop_c5f2ca0965 ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_dbf6977407 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

(에디터=대상 칸 r_metric_body · 레퍼런스=패턴(ref_eval_seoul p2 표 조판) · 리소스=마운트 없음 · 이력=확인 필요 · 관련 없음=없음)

표의 조판을 참고하여 지표 해설을 정리하는 것이 목표이다. 레퍼런스 페이지의 표 형식을 분석하여 r_metric_body 에 적용해야 한다. 추가적인 리소스는 필요하지 않으며, 이력 확인이 필요하다.


The editor's metric shows an average of 45 minutes for completing the first document, involving a group of ten people. This data, retrieved from the editor, contrasts with the reference document that has a three-column table structure, with headers and rows. This discrepancy requires further investigation.


The user explicitly requested that only the table's structure be used, excluding content. This means the focus should be on the structural level (table layout) while excluding all other content from the reference. The `rf_interpret` function will be used.


Generated interpretation card `icard_8bcbd953`. Proceeding to propose candidates for `slot:r_metric_body` using `wb_propose`. The original content is: "The measurement results show that it took an average of 45 minutes to complete the first document. 10 people were measured." Applying table formatting (D5) to structure the proposal, using either:
- Serial Number/Division | Metric Item | Measurement Content (or Item | Value | Remarks, etc.)
- Or a 3-column table: Division | Metric Item | Detailed Content
  1 | First Document Completion


Considering two table formats: a 3-column table (Division | Metric Item | Detailed Content) and another table with Serial Number, Item, and Details, or a summary followed by a table. The existing slot content is confirmed to be plain text. HTML tables are possible as per the supported schema.  Focusing on a 3-column table reflecting the referenced structure as the initial proposal.


The restyle suggests significant changes to the original text, retaining only a small percentage of the original words. The original text described a measurement, but the restyle significantly changed the information. Given that the proposal passed validation, a choice exists: either accept the current proposal or generate an alternative that preserves more of the original wording.


The task completed without warnings. The initial check confirms that reading the source, references, and relevant history is complete. No resource mounting or related history is apparent for this request.




</details>

**답변**

[레퍼런스 2쪽 표](vdoc:ref-region/ref:ref_eval_seoul#blk:b35)의 3열 조판 방식(D5 타이포그래피·조판)을 참고하여 [지표 해설](vdoc:slot/r_metric_body) 칸에 적용할 변경 후보 2안을 제안했습니다.

### 적용 내용 및 해석 카드
- **채택 층위**: **D5 조판·레이아웃** (해석 카드 `icard_8bcbd953` 제안)
  - 레퍼런스 표의 `연번 | 항목명 | 내용` 3단 구조를 차용했습니다.
- **배제 층위**: 레퍼런스의 고유명사·서류명·수치 등 사실 정보는 일체 반영하지 않고, 기존 문서의 지표 수치(평균 45분, 10명)를 온전히 보존했습니다.

---

### 제안 후보 비교 및 선택 가이드

| 구분 | **안 1: 원문 보존형 3열 표** | **안 2: 개요문 + 3열 지표 정리표** |
| :--- | :--- | :--- |
| **구성** | 표 단독 구성 (`연번` · `항목` · `측정 내용`) | 상단 요약 문장 + 3열 요약표 (`연번` · `지표 구분` · `세부 내용`) |
| **특징** | 원문 문장을 표 셀 안에 그대로 배치하여 내용 왜곡 없이 규격화 | 전체 결론을 먼저 제시하고 핵심 수치를 분리하여 가독성 강화 |
| **추천 기준** | 공식 양식의 정형화된 서식을 선호할 때 | 요약과 지표 수치를 한눈에 스캔하기를 원할 때 |

화면의 미리보기에서 적합한 후보를 선택해 적용하실 수 있습니다.

---
확인하지 않은 출처: 이력(wb_history) — 이전 버전 복구가 아닌 서식 재구성(restyle) 작업이므로 확인하지 않음

## REF-Q5-exclude — REF
> 요약을 이 레퍼런스처럼 다듬되, 굵은 글씨로 강조하는 방식은 따라하지 마.

- ✅ 따르지 않음 카드: 1/1 (D1:exclude@p1, D4:follow@p1, D1:follow@p1)
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_summary']
- ✅ 굵은 글씨 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_patterns → rf_measure → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18)
- 카드 icard_720930a7 D1 exclude ref:ref_eval_invest#p1 — 레퍼런스는 핵심 결론 및 항목명에 굵은 글씨(**)를 적용해 시각적 강조를 사용했으나(bold_per_para=0.38), 사용자의 명시적 요청에 따라 굵은 글씨 강조는 채택하지 않고 일반 텍스트로 처리한다.
- 카드 icard_9890ef24 D4 follow ref:ref_eval_invest#p1 — 레퍼런스는 서두에 명확한 두괄식 결론을 먼저 제시하고, 이어서 핵심 요점(목표/문제-해법-결과/현황-다음단계)을 구조적으로 배치하는 서술 프레임워크를 취하고 있다(conclusion_first=True). 이 구조적 전개 방식을 따른다.
- 카드 icard_7f669b61 D1 follow ref:ref_eval_invest#p1 — 레퍼런스는 한 문장의 길이가 20자 내외로 매우 짧고 개조식 목록을 활용하여 정보 전달력을 높였다. 253자에 달하는 에디터의 만연체 한 문장을 분할하여 단문 및 개조식 구조로 정돈한다.
- 후보 prop_39bd849a4f needs_fix 2안 restyle · 오류 2 · 경고 2
  - ✗ 후보 1 '1안: 두괄식 결론 + 개조식 4단 요약 (구조적 요약형)': icard_720930a7 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 단문 중심 단계별 서술 (단락 분할형)': icard_720930a7 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_6877c754da ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

Understanding the user's request involves identifying the target for modification—the selected summary block (`r_summary`, p1) in the editor—and the reference material to emulate, which is a document identified as `ref:ref_eval_invest`. The instruction is to refine the summary in accordance with this reference, specifically excluding the use of bolding for emphasis. There are no external resources mounted.


The `slot:r_summary` in the editor focuses on a large onboarding improvement project involving multiple teams. The goal was to fundamentally alter the user experience through different approaches. A/B testing of template presentation versus starting from a blank document was conducted. The primary metric was reducing the baseline first document completion time of 47 minutes.


Diving into the reference structure, it appears the framework emphasizes a concise, top-down presentation, either employing a list-based summary of key elements or following an SCQA format. The writing style is characterized by brevity and high information density, utilizing short sentences and streamlined paragraphs for improved readability.


The summary is exceptionally long, containing a single sentence with 253 characters. Bold text is overused, with 8 instances in the paragraph. The structure deviates from the expected pattern, lacking a clear conclusion at the beginning, and a breakdown into logical sections.


Deduction: User explicitly requested to exclude bold formatting, specifically for the D1/D5 sections; "adoption" parameter must be set to "exclude" to disable the bold tag generation. The model will adhere to this exclusion constraint.


Initial focus is on generating candidate proposals using the provided information. Starting by analyzing the facts extracted from the editor's original content: the project is a "large-scale" collaborative effort across "multiple teams", aiming to improve "onboarding" and user experience. It involves comparing different approaches, specifically showing "templates" versus starting with a blank document, and reducing the initial document completion time from the baseline of 47 minutes.


Onboarding improvements prioritized to reduce initial document completion time from a 47-minute baseline, driven by collaborative, multi-team efforts. The approach compared template-first and blank document methods. Meaningful changes were observed across several metrics, necessitating further validation of incomplete measurements in the following qua

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 [루미나랩스 투자 제안서](vdoc:ref-region/ref_eval_invest)의 전개 방식에 맞춰 다듬고, 요청하신 대로 **굵은 글씨 강조를 배제**한 2가지 변경 후보를 작업대에 제안했습니다.

---

### 레퍼런스 적용 및 해석 요약
* **따른 층위**:
  * **D4 서술 프레임워크** (`icard_9890ef24`): 결론 및 최우선 목표를 서두에 두괄식으로 배치
  * **D1 스캐너빌리티** (`icard_7f669b61`): 253자짜리 한 문장의 만연체를 20~40자 내외의 명확한 단문 및 개조식으로 분할
* **따르지 않은 층위**:
  * **D1 시각적 강조** (`icard_720930a7`): 요청에 따라 레퍼런스의 볼드 강조 스타일(`bold_per_para=0.38`)은 제외하고 일반 텍스트로 처리

---

### 제안된 후보 비교

1. **1안: 두괄식 결론 + 개조식 항목 요약 (구조적 요약형)**
   * **특징**: 서두에 최우선 목표(47분 단축)를 결론으로 먼저 제시하고, 프로젝트 개요·방식 비교·성과·과제를 개조식 목록으로 일목요연하게 정리했습니다.
   * **추천 기준**: 보고서 서두에서 핵심 항목별 진행 상황을 빠르게 훑어볼 수 있는 스캐너빌리티를 원하실 때 적합합니다.

2. **2안: 단문 중심 4단계 단락 서술 (단계별 서술형)**
   * **특징**: 목록 형태 대신 4개의 간결한 단락(추진 목적 → 실행 방식 → 확인된 성과 → 향후 과제)으로 문장 호흡을 나누어 자연스러운 줄글 형태로 정돈했습니다.
   * **추천 기준**: 개조식보다는 격식 있는 요약문 줄글 형식을 유지하면서 가독성을 확보하고자 할 때 적합합니다.

화면의 미리보기 패널에서 각 안의 형태를 확인하신 뒤 확정하실 수 있습니다.

---
*확인하지 않은 출처: 이력(History) — 원본 복원 요청이 아닌 기존 요약문 다듬기 작업이므로 미참조*

## REF-Q6-consult — REF
> 공공 보고서 레퍼런스는 참고만 하고, 우리 문서 톤은 유지하면서 요약을 다듬어줘.

- ✅ 참고만(consult) 카드: 1/1 (D1:consult@sec:1, D6:exclude@sec:1)
- ✅ 따름 카드 없음: 0장
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_summary']
- ✅ 공공 보고 문체 이식 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → wb_patterns → rf_outline → rf_read → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_public#sec:1(5)
- 카드 icard_b8caffad D1 consult ref:ref_eval_public#sec:1 — 레퍼런스 요약은 핵심 성과와 실행 계획을 2개 이내의 간결한 단위로 압축하여 스캐너빌리티를 높였다. 우리 문서 요약의 만연체 단락을 핵심 목표와 진행 현황 단위로 간결하게 정돈하는 데 참고한다.
- 카드 icard_920a47a2 D6 exclude ref:ref_eval_public#sec:1 — 레퍼런스는 행정 문서 특유의 개조식 종결어미(~함, ~임)를 사용하나, 사용자의 지침에 따라 기존 문서의 비즈니스 보고서 평서체(~다) 톤을 유지하고 불필요한 관료적 어조는 배제한다.
- 후보 prop_2057de7c37 needs_fix 2안 restyle · 오류 2 · 경고 2
  - ✗ 후보 1 '1안: 문장 분절 및 정보 구조화 (서술형 유지)': icard_920a47a2 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '2안: 핵심 요약 집중형 (단락 압축)': icard_920a47a2 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_c1c2fe5cba ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial hypothesis: public report serves as a reference, adopting its substance but maintaining internal document's style. The target for refinement is the specified summary field, using an internal report as a reference, and preserving the internal document's tone.


The summary indicates a large-scale onboarding improvement project involving multiple teams. The primary goal was to improve user experience, exploring different approaches such as template-first versus starting with a blank document. Reducing the initial document completion time from the baseline of 47 minutes was the priority.


The provided reference's summary (blk:b3~b5) and overall structure were reviewed. The request specifies to consult the public report's references, maintaining the original document's tone while refining the summary. This implies a need to exclude the reference's style of ending the sentence in a specific way.


Analyzing the source summary, the current version is a single, lengthy sentence with excessive bolding and an overly verbose writing style. The target format requires a concise 1-2 item summary, contrasting the current source's approach. Evaluating the reference's interpretative potential, starting an `rf_interpret` card seems appropriate.


Initial plan: create a proposal using "restyle" mode to refine the existing summary, incorporating information from the specified references. The target slot is "slot:r_summary". The restyle mode is chosen for content preservation with improved expression and structure. The references include "icard_b8caffad" and "icard_920a47a2".


Refining the existing summary focuses on preserving core factual content related to onboarding improvements. The goal is to improve readability by decluttering excessive bolding and restructuring into concise paragraphs. Proposed revisions include sentence-level improvements and a possible shift to a three-part structure to highlight objectives, outcomes, and future tasks.


Initial analysis indicates the 'exclude' card should not be included in the 'follows' list; only cards that are followed or referenced should be present. The current mode is 'restyle', yet the summary's word count significantly decreased; this suggests either a mode switch to 'compose' or careful restructuring to preserve source text. Examining the original text more closely is necessary to determine the appropriate course of action.


The onboarding improvement project involved numerous teams, focused on transforming user

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸의 253자 만연체 단락(1문장)에 대해 레퍼런스의 스캐너빌리티 구조를 참고하되, 요청하신 대로 기존 문서의 서술형 톤(~다)과 원문 내용을 보존하여 두 가지 개선안을 제안했습니다.

---

### 1. 레퍼런스 해석 및 반영 기준

* **참고한 층위 (D1 스캐너빌리티)**: `icard_b8caffad` (제안)
  * [ref:ref_eval_public](vdoc:resource/ref_eval_public)의 요약 분절 방식을 참고하여, 하나의 긴 문장으로 이어져 있던 내용을 의미 단위별로 단락화하고 남발된 볼드 서식을 정돈했습니다.
* **따르지 않은 층위 (D6 장르 규약/톤)**: `icard_920a47a2` (배제)
  * 레퍼런스의 행정·공공문서 특유의 개조식 종결어미(`~함`, `~임`) 및 관료적 표현은 배제하고, 기존 문서의 자연스러운 비즈니스 서술형 평서체(`~다`)를 유지했습니다.
* **사실 근거**: 레퍼런스의 예산 수치나 회의록 관련 고유명사는 일체 반영하지 않고, 기존 [요약](vdoc:slot/r_summary)의 원본 사실(첫 문서 완성 시간 47분 기준선, 템플릿 선제시 비교 등)만을 온전히 보존했습니다.

---

### 2. 제안 후보 안내

화면 미리보기([prop_c1c2fe5cba](vdoc:slot/r_summary))에서 원하시는 안을 선택하실 수 있습니다.

* **1안: 3단계 단락 분절형 (배경·목표·현황)**
  * **특징**: `프로젝트 배경 및 시도` → `핵심 목표(47분 단축)` → `결과 및 다음 분기 과제`의 3개 단락으로 명확하게 나누어 가독성과 정보 전달력을 극대화한 형태입니다.
  * **선택 기준**: 경영진 보고 등 빠른 스캐닝과 단계별 맥락 구분이 중요할 때 적합합니다.
* **2안: 2단락 서술형 (추진 내용 및 결과)**
  * **특징**: 추진 과정 전반과 측정 현황을 2개 단락으로 압축하여 기존 줄글 흐름을 자연스럽게 살린 형태입니다.
  * **선택 기준**: 본문 서술과의 연결성을 유지하면서 만연체만 부드럽게 정돈하고자 할 때 적합합니다.

---

* **확정 대기 카드**: `icard_b8caffad` (D1 참고), `icard_920a47a2` (D6 배제) — 화면에서 해석 카드를 확정하실 수 있습니다.
* **확인하지 않은 출처**: 리소스(원천 자료) — 마운트된 리소스가 없어 에디터 원문 슬롯 기준으로만 작업했습니다.

## REF-Q7-analyze — REF
> 이 레퍼런스는 무엇이 잘 된 거야? 어떤 결정들이 보이는지 정리해줘.

- ✅ 레퍼런스 도구 rf_read: rf_read
- ✅ 층위 카드 3장 이상: 4/3 (D3:consult@p1, D4:consult@p1, D6:consult@p1, D1:consult@p1)
- ✅ 문서 바꾸지 않음: 후보 0건
- ✅ 층위로 설명: 있음

**도구**: rf_map → rf_consensus → rf_read → rf_coverage → rf_interpret

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_public#p1(15)
- 카드 icard_e32acf7f D3 consult ref:ref_eval_public#p1 — 문서 상단에 메타 정보 표(문서번호·일자·부서·보안등급)와 3단 결재란(담당·검토·승인), 본문 직전 요약 블록 및 말미 붙임 주석을 완비하여 공공·기관 내부 보고의 표준 격식 규격을 충족하도록 결정함.
- 카드 icard_dd6db291 D4 consult ref:ref_eval_public#p1 — '1. 추진 배경 -> 2. 현황 및 문제점 -> 3. 개선 방안 -> 4. 향후 계획'으로 이어지는 공공 기획 보고서의 전형적인 4단계 논리 전개 프레임워크를 적용하도록 결정함.
- 카드 icard_3434d4b6 D6 consult ref:ref_eval_public#p1 — 본문 서술 시 줄글을 배제하고 개조식 종결어미(~함·~임·~음) 및 명사형 종결로 통일하여 사무적·행정적 어조의 신속하고 단호한 가독성을 확보하도록 결정함.
- 카드 icard_bc5e6d93 D1 consult ref:ref_eval_public#p1 — 장문 서술 단락을 완전히 배제하고(평균 19자, 장문 비율 0%), 항목당 단일 핵심 메시지만 1~2개 불릿으로 압축 배치하여 한눈에 파악 가능한 고밀도 스캐너빌리티를 구현하도록 결정함.

<details><summary>생각</summary>

I'm thinking through how to approach this.


Refinement map confirms the presence of `ref:ref_eval_public`, showing no consensus yet reached. Initial read indicates only a small portion of the document has been processed. The document is segmented into five sections, each containing a header and text. Next steps involve checking consensus status and reading the full outline and content.


Analyzing the reference material, identified a key area: the formal D3 structure and metadata employed in the report. This suggests a focus on structured data representation and standardized information architecture within the document. This observation is crucial for understanding the document's design principles.


The document adheres to standard public administrative report formats, including metadata tables and a summary block preceding the main content. It employs a clear four-stage narrative structure: background, current state/issues, improvement plans, and future schedule. This structure is a standard for public sector planning documents. The report also prioritizes readability through concise bullet points, consistent use of specific sentence endings common in official documents, and the inclusion of data to support claims in the summary.


The interpretation cards are registered successfully: D3 (Formal/Meta Standard), D4 (Description Framework), D6 (Genre Conventions/Tone), and D1 (Scannability/Structural Density). Now I'll proceed to compose the response to the user's question, adhering to markdown format and Korean language requirements. Specific locations/elements will be linked in the format `[human-readable name](vdoc:type/id)`.


The analysis focuses on identifying patterns and decisions, not extracting proper nouns or specific numerical values. All activated sources, including the editor, resources, and references, have been read and analyzed without leaving any unexamined sources. The response structure will begin with an overview and summary assessment of the reference, followed by an in-depth analysis of the key decisions or patterns.




</details>

**답변**

[한국데이터진흥원 내부 보고 — 회의록 표준화 추진 계획](vdoc:doc/ref_eval_public) 레퍼런스(15/15 덩어리 전수 검토)는 공공·기관 내부 기획 보고서로서의 **문서 격식 완결성(D3)**, **4단계 논리 구조(D4)**, **개조식 압축을 통한 가독성(D1·D6)** 측면에서 설계 의도가 매우 뚜렷하게 반영되어 있습니다.

---

### 1. 잘된 점 및 핵심 설계 결정 (Layers & Decisions)

#### ① D3 격식·메타 규격 충족 ([카드 icard_e32acf7f](vdoc:kcard/ref_eval_public:icard_e32acf7f))
- **행정 규격 완비**: 문서 최상단에 [메타 정보 표](vdoc:ref-region/ref_eval_public#blk:b1)(문서번호, 보고일자, 부서, 보안등급)와 [3단 결재선](vdoc:ref-region/ref_eval_public#blk:b2)(담당-검토-승인)을 배치하여 공식 보고서의 신뢰성을 확보했습니다.
- **선제 요약 및 각주**: 본문 진입 전 핵심 골자(목표 및 예산·일정)를 [요약 블록](vdoc:ref-region/ref_eval_public#blk:b3)으로 먼저 보여주고, 하단에는 [붙임 주석](vdoc:ref-region/ref_eval_public#blk:b15)으로 세부 양식 링크를 남기는 공문서 규격을 충실히 따르고 있습니다.

#### ② D4 4단계 논리 전개 프레임워크 ([카드 icard_dd6db291](vdoc:kcard/ref_eval_public:icard_dd6db291))
- **짜임새 있는 서술 순서**: 
  1. [추진 배경](vdoc:ref-region/ref_eval_public#blk:b6) (문제 제기의 출발점)
  2. [현황 및 문제점](vdoc:ref-region/ref_eval_public#blk:b8) (구체적인 현장 비효율 진단)
  3. [개선 방안](vdoc:ref-region/ref_eval_public#blk:b11) (해결책 및 방향 제시)
  4. [향후 계획](vdoc:ref-region/ref_eval_public#blk:b13) (실행 일정 및 시범 적용)
- 문제 진단부터 실행 단계까지 논리의 비약이나 군더더기 없이 일관된 흐름을 형성합니다.

#### ③ D1 고밀도 스캐너빌리티 구현 ([카드 icard_bc5e6d93](vdoc:kcard/ref_eval_public:icard_bc5e6d93))
- **장문 서술 단락의 철저한 배제**: 긴 줄글 단락 비율이 0%이며(평균 단락 19자), 모든 항목을 1~2개의 불릿 목록으로 압축했습니다. 바쁜 의사결정권자가 30초 내에 핵심을 파악할 수 있도록 정보 전달 밀도를 극대화했습니다.

#### ④ D6 행정 보고 장르 규약 및 어조 ([카드 icard_3434d4b6](vdoc:kcard/ref_eval_public:icard_3434d4b6))
- **종결어미 통일**: 감정적이거나 모호한 표현을 일체 배제하고 `~함`, `~임`, `~음` 등의 개조식 종결어미와 명사형 종결(`도입` 등)로 어미를 통일하여 사무적이고 단호한 어조를 유지하고 있습니다.

---

### 2. 제안된 해석 카드 목록

향후 문서 작성 시 적용할 수 있도록 작업대에 다음 4건의 해석 카드가 등록되었습니다.
- **[icard_e32acf7f](vdoc:kcard/ref_eval_public:icard_e32acf7f)** (D3 격식): 상단 메타 테이블 및 결재선 구조 채택
- **[icard_dd6db291](vdoc:kcard/ref_eval_public:icard_dd6db291)** (D4 구조): 4단계 논리 전개 시퀀스 채택
- **[icard_bc5e6d93](vdoc:kcard/ref_eval_public:icard_bc5e6d93)** (D1 밀도): 항목당 1~2행 불릿 압축 서술 채택
- **[icard_3434d4b6](vdoc:kcard/ref_eval_public:icard_3434d4b6)** (D6 어조): 공문서 개조식 종결어미 채택

> [!NOTE]
> 본 레퍼런스에 등장하는 고유명사나 특정 예산 수치 등은 가져오지 않으며, 위에서 도출된 **메타 규격 + 4단 구조 + 개조식 서술 패턴**만 추상화하여 실제 문서 작성에 활용하게 됩니다.

## REF-Q8-contrast — REF
> 내 문서 요약은 두 레퍼런스와 층위별로 어떻게 달라?

- ✅ 레퍼런스 도구 rf_contrast|rf_measure: rf_contrast, rf_contrast
- ✅ 문서 바꾸지 않음: 후보 0건
- ✅ 층위별 비교: 있음

**도구**: wb_outline → rf_map → wb_read → wb_patterns → rf_contrast → rf_contrast → rf_read → rf_read → rf_consensus

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18) · ref:ref_eval_public(15)

<details><summary>생각</summary>

에디터=wb_outline · 레퍼런스=rf_contrast · 리소스=마운트 없음 · 이력=비교 대상 아님. 요약과 두 개의 레퍼런스 간의 차이점을 분석하려면 아웃라인 편집 도구를 사용해야 한다. 대조 분석 도구를 활용하여 각 레퍼런스를 비교하고 요약과의 차이점을 파악할 예정이다.


I'm thinking through how to approach this.


The initial assessment points to a disparity in presentation style between the internal document and the external reference document. The internal document's single, lengthy sentence and excessive bolding hinder scannability. In contrast, the external document utilizes concise paragraphs and bullet points for better readability and information density, leading to more scannable format.


The analysis reveals key differences in presentation style across the documents. The internal document lacks structured lists and high-density numbers seen in the reference documents, hindering scannability and quantitative backing. The internal document also lacks proper meta-information, a contrast to the other document's inclusion of meta tags.


The internal document deviates significantly from the reference documents in structure and framing. The analysis indicates the internal document lacks a clearly defined, top-down structure, unlike the other documents. The reference documents showcase effective use of headings, structured content, and strategic framing (SCQA/ 기승전결) to emphasize key takeaways, which contrasts with the internal document's single-block narrative style.




</details>

**답변**

에디터의 [요약](vdoc:slot/r_summary) 슬롯과 두 레퍼런스([(주)루미나랩스 투자 제안서](vdoc:doc/ref_eval_invest), [한국데이터진흥원 내부 보고](vdoc:doc/ref_eval_public))를 층위별(D1~D6)로 대조한 결과는 다음과 같습니다.

---

### 층위별 비교 분석

| 층위 | 내 문서 ([요약](vdoc:slot/r_summary)) | 레퍼런스 1: 루미나랩스 투자 제안서 (`invest`) | 레퍼런스 2: 한국데이터진흥원 내부 보고 (`public`) |
| :--- | :--- | :--- | :--- |
| **D1. 스캐너빌리티 · 정보 밀도** | **단일 만연체 문장** (253자, 1문단). 불릿이나 행 분리가 없고, 단어 수준의 볼드(`**...**`)가 8회 남발되어 시각적 위계가 무너져 있음. | **초단문 분절 & 리스트화** (평균 문장 17자, 단락 20.4자). 핵심 선언과 4개 불릿 리스트로 압축되어 3초 내 스캔 가능. | **개조식 리스트 중심** (불릿 비율 54%, 평균 단락 19.0자). 볼드 강조 없이 짧은 단문 불릿으로만 정리. |
| **D2. 근거 · 데이터 증명** | **정성적 서술 위주** (수치 밀도 0.4/100자). 수치는 '47분' 1개뿐이며 출처 표기 없음. | **고밀도 핵심 지표 + 표** (수치 밀도 4.03/100자). NPS 71, 고객사 37곳, 50억원 등 핵심 지표 요약 표와 명시적 출처 표기(`(출처: 2024 시장조사)`) 배치. | **예산 및 행정 수치** (수치 밀도 3.0/100자). 예산 3.1억원, 보고일자 등을 메타 표 및 리스트에 정돈. |
| **D3. 격식 · 메타 규격** | [문서 정보](vdoc:slot/r_meta)가 비어 있으며, 문서 번호·결재선 등의 공적 메타 규격 부재. | 피치 덱형 간이 메타(`2025.03 · Confidential`) 표기. | **완전한 공공 행정 메타**. 문서번호, 보고일자, 보안등급 표 및 담당·검토·승인 3단 결재선 완비. |
| **D4. 서술 프레임워크** | **미괄식·시간순 나열**. 배경 → 시도 → 목표 → 결과 → 다음 검증 필요성까지 쉼표로 연결되어 핵심 결론이 흐려짐. | **철저한 두괄식 SCQA 피치**. 최상단에 결론 선언 후 `상황 → 문제 → 질문 → 해답` 헤딩 구조로 설득 논리 전개. | **기승전결 행정 보고 프레임워크**. 최상단 `□ 요약` 블록 제시 후 `1.추진배경 → 2.문제점 → 3.개선방안 → 4.향후계획` 순 전개. |
| **D5. 타이포그래피 · 조판** | 소제목이나 섹션 구분 없이 일반 텍스트 1칸으로 구성. | H1, H2 계층 헤딩 5개, 리스트, 표(지표 요약), 인용 형식의 다채로운 블록 구성. | 2개 상단 표(메타/결재선), H2 넘버링 헤딩 4개, 글머리기호 리스트, 각주(`※`) 조판. |
| **D6. 장르 규약 (어조)** | **사견 중심 구어체 종결** ("~강조하고 싶다"). 주관적 어조가 섞임. | **단정적 평서문 & 명사형 종결** ("~된다", "~쓴다", "NPS 71"). 확신에 찬 비즈니스 어조. | **공문서 개조식 명사 종결** ("~표준화함", "~예정임", "~어려움"). 주관적 서술을 배제한 객관적 보고체. |

---

### 핵심 진단 요약
1. **구조와 호흡**: 내 문서는 253자의 긴 한 문장 속에 온보딩 프로젝트의 배경·목표·결과가 한 번에 엉켜 있습니다. 반면 두 레퍼런스는 모두 **문장을 20자 내외로 쪼개고 불릿 리스트화**하여 전달력을 극대화했습니다.
2. **논증 방식**: 빠른 의사결정과 사업적 임팩트가 목적이라면 루미나랩스 식의 **두괄식 결론 선언 + SCQA 프레임워크 + 핵심 지표 표(D4, D2)** 가 적합하며, 정례 보고 및 절차적 승인이 목적이라면 한국데이터진흥원 식의 **메타/결재선 표 + 기승전결 개조식 종결(D3, D6)** 패턴이 적합합니다.

---
*확인하지 않은 출처: 리소스(원천 자료) — 마운트된 리소스가 없음 / 이력(개정) — 변경 요청이 아닌 양식 비교 요청으로 미사용*

## REF-Q9-combine — REF
> 투자 제안서의 논증 흐름과 공공 보고서의 격식을 합쳐서 요약을 다시 써줘.

- ✅ 투자 제안서 따름 카드: 1/1 (D4:follow@전체, D6:follow@전체)
- ✅ 공공 보고 따름 카드: 1/1 (D4:follow@전체, D6:follow@전체)
- ✅ 카드 따름: 2/2안 · [['icard_b06f1a49', 'icard_12cbc983'], ['icard_b06f1a49', 'icard_12cbc983']]
- ✅ INV 카드 따름: ['icard_b06f1a49', 'icard_b06f1a49']
- ✅ PUB 카드 따름: ['icard_12cbc983', 'icard_12cbc983']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → wb_history → wb_outline → rf_read → rf_read → wb_patterns → rf_interpret → wb_read → wb_read → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest(18) · ref:ref_eval_public(15)
- 카드 icard_b06f1a49 D4 follow ref:ref_eval_invest — 결론 우선 제시(b3) 및 문제-해법-증거 중심의 체계적 논증 흐름 채택
- 카드 icard_12cbc983 D6 follow ref:ref_eval_public — 개조식 종결어미(~함·~임·~음) 및 명사형 종결을 활용한 간결한 공공 보고서 격식 채택
- 후보 prop_a5d3164b9a ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


The `wb_patterns` on `slot:r_summary` require examination for current measurements. The `rf_measure` also needs checking, though `rf_map` provides initial context on the `ref_eval` framework.


The initial summary focused on length and ending style, failing to incorporate the specified genre and rhetorical framework requirements. The prompt indicates a need to merge the argumentative flow of an investment proposal with the formality of a public report. The task now involves evaluating the reference procedures to determine how to integrate these different stylistic requirements effectively.


The `r_summary` slot contains a description of a large, collaborative onboarding improvement project involving multiple teams. The project focused on fundamentally changing the user experience through various experiments, specifically comparing a template-first approach versus starting with a blank document.


The onboarding improvement project aims to reduce the initial document completion time significantly. The initial target of 47 minutes has shown improvement, but some metrics still need further validation in the next quarter. The initial changes were based on presenting templates first to users.


Initial hypothesis is that the onboarding improvement project's structure can inform the investment deck's flow. The project's structure prioritizes presenting the conclusion, followed by the problem, solution, evidence, and future plans. This framework supports a clear, concise argument. The report formality uses a structured writing style with nominal endings and bullet points to ensure clarity.

The rule suggests presenting alternative interpretations when the request is ambiguous. The comparison of template-first versus blank document approaches offers a clear candidate for contrasting interpretations within the investment deck. Will present multiple interpretations.


Considering two candidate presentation styles: a conclusion-first, formal style appropriate for investment decks, and a public administration-style summary with a situation-problem-solution-future flow. The objective is to determine which style aligns with the desired format. The format of the expected response requires additional investigation.


`wb_propose`'s `slots` validation is currently under scrutiny, particularly how it handles rich text. The documentation suggests `slots` might accept HTML content. Initial hypothesis: the "html" designation implie

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 투자 제안서의 논증 흐름(D4)과 공공 보고서의 개조식 격식(D6)을 결합한 2가지 변경 후보를 화면 미리보기(Staged)로 제안했습니다.

### 레퍼런스 반영 내역 및 해석 카드
- **[투자 제안서](vdoc:doc/ref_eval_invest)**: D4 서술 프레임워크 채택 (`icard_b06f1a49`) — 두괄식 핵심 결론 제시 및 문제·해법·성과 중심의 논증 구조 반영
- **[공공 보고서](vdoc:doc/ref_eval_public)**: D6 장르 규약 채택 (`icard_12cbc983`) — 개조식 종결어미(`~함`, `~임`) 및 명사형 종결, 간결한 불릿 표기 반영
- **읽은 범위**: 두 레퍼런스 전체 덩어리(18/18, 15/15)를 모두 검토했으며, 레퍼런스의 고유명사나 수치는 배제하고 기존 [요약](vdoc:slot/r_summary) 및 [이력 원본](vdoc:slot/r_summary)의 사실(기준선 47분 단축 목표, 템플릿 우선 제시, 지표 개선, 추가 검증 필요)만 유지했습니다.

---

### 후보별 특징 및 선택 기준

1. **1안: 결론 선행형 개조식 요약 (투자 제안서 논증 흐름 중심)**
   - **특징**: 핵심 결론을 상단에 볼드로 먼저 배치한 뒤, `추진 배경 → 핵심 조치 → 주요 성과 → 향후 계획` 순서로 명확하게 전개합니다.
   - **선택 기준**: 성과와 결론을 의사결정권자에게 빠르게 각인시키고자 할 때 적합합니다.

2. **2안: 공공 행정 보고식 요약 (공공 보고서 격식 중심)**
   - **특징**: 공공 행정 양식의 표준 개조식 헤더(`□`)를 필두로 `현황 및 목표 → 개선 방안 → 추진 결과 → 후속 조치` 항목 체계를 정돈했습니다.
   - **선택 기준**: 기관 보고나 정형화된 운영 보고서의 격식을 엄격하게 유지하고자 할 때 적합합니다.

## REF-Q10-apply-consensus — REF
> 아까 정한 레퍼런스 해석대로 요약에 적용해줘.

- ✅ 레퍼런스 도구 rf_consensus|rf_map: rf_consensus
- ✅ D1 을 다시 해석하지 않음: 0장
- ✅ 확정 카드 cardC1 따름: ['cardC1', 'cardC1']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_consensus → wb_read → wb_outline → wb_read → rf_read → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#pin:pinA1(18)📌
- 후보 prop_6a41cf88ee ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


rf_consensus shows cardC1 D1 is confirmed while cardC2 D4 is not. The current slot content for r_summary is "Improve **Onboarding** this quarter". Considering the rf_consensus and current r_summary, the primary focus is to improve the **Onboarding** this quarter.


Initial thought: The output clearly outlines Luminar Labs' strong position and future goals within the corporate document automation sector. It highlights their solution to a significant problem: the high percentage of rewritten documents. It also provides proof points such as existing clients and a high NPS score, and ends by specifying a Series A funding request. The next step is to format it for display as requested.


The analysis indicates the need to restructure the provided information into a summary box with a 4-bullet point format. This structure will encompass the problem, solution, evidence, and request, drawing information from specified source slots. The "compose" mode in `wb_propose` suggests a complete re-composition of the summary based on the given facts and constraints.


The `wb_propose` tool's schema specifies `slots:{slotId: html}`, which raises a question whether to format the output as HTML tags (e.g., `<p>`) or simple HTML/Markdown text. Previous examples in `slot:r_summary` contained Markdown formatting, yet the tool's input explicitly states HTML. Considering this ambiguity, the first proposal may focus on a composition reflecting the card structure, and the second proposal could prioritize concise bullet points with key results. The question remains: HTML markup such as `<div class="callout">` or `<p>` vs. simple Markdown-formatted HTML text.


Verification passed immediately! The distance scores are now 0.44 and 0.46, improving from 0.81. Ensuring that the output adheres to the specified source-checking and rule-following procedures.




</details>

**답변**

확정된 레퍼런스 해석([cardC1](vdoc:ref-pin/pinA1))의 구조에 맞춰 [요약](vdoc:slot/r_summary) 칸을 개편한 2가지 후보를 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

---

### 적용 내용 요약
- **따른 내용**: [cardC1](vdoc:ref-pin/pinA1) (층위 D1) — 맨 위 결론 1문장과 굵은 머리말 불릿 4개(**문제·해법·증거·요청**) 구조 반영
- **따르지 않은 내용**: [cardC2](vdoc:doc/ref_eval_invest) (층위 D4) — 기존 합의대로 SCQA(상황·문제·질문·해답) 서술 방식 배제
- **근거 사실**: 리소스가 마운트되지 않은 상태이므로 보고서 내 [결정](vdoc:slot/r_dec_onb), [지표 표](vdoc:slot/r_metric_table), [지표 해설](vdoc:slot/r_metric_body), [다음 분기 계획](vdoc:slot/r_next_plan)의 사실만을 대응시켜 구성했습니다.

---

### 후보 비교 및 선택 기준

1. **1안: 확정 해석(cardC1) 충실 반영형**
   - **특징**: 온보딩 UX 개편의 배경 목적(진입 장벽 완화)부터 후속 조치 계획까지 흐름을 온전하게 서술한 구성
   - **추천**: 프로젝트의 맥락과 추진 배경을 균형 있게 전달하고자 할 때 적합합니다.

2. **2안: 수치 중심 간결형**
   - **특징**: 기준선 단축 성과(47분 → 45분)와 핵심 지표(68%)를 전면에 내세워 단문 위주로 압축한 구성
   - **추천**: 운영진 보고 시 핵심 실적과 요청 사항을 신속하게 파악할 수 있도록 하고 싶을 때 적합합니다.

## REF-Q11-revise — REF
> 이 레퍼런스 요약 부분의 핵심 결정이 뭐라고 봐? → 그게 아니라 핵심은 요약을 테두리 상자 하나로 묶어서 본문과 분리한 거야. 그 해석으로 요약 다시 써줘.

- ✅ 사용자 해석 반영 카드: 1/1 (D4:consult@sec:1, D5:follow@sec:1)
- ✅ 수정 해석 카드를 따름: ['icard_572a6b38', 'icard_572a6b38']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음
- ⚠️ 오류: ['ACP 응답이 180초 동안 없어 중단했습니다.']

**도구**: rf_map → rf_consensus → rf_outline → rf_read → rf_measure → rf_interpret → wb_outline → wb_read → wb_read → wb_read → wb_read → wb_read → rf_interpret → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_invest#sec:1(7)
- 카드 icard_f182acea D4 consult ref:ref_eval_invest#sec:1 · 대안 1 — 두괄식 굵은 결론문 선제시 후 '문제-해법-증거-요청'의 4단계 키워드-하이픈 개조식으로 100자 내외 초고밀도 요약 배치
- 카드 icard_572a6b38 D5 follow ref:ref_eval_invest#sec:1 — 요약 영역을 독립된 테두리 상자(콜아웃/박스) 하나로 묶어 본문과 시각적으로 격리·분리
- 후보 prop_7285b1fc7d ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

레퍼런스=대상(ref_eval_invest 요약 부분) · 범위=요약 부분 · 층위=핵심 결정. 요약 부분에서 핵심 결정을 파악하기 위해 검토를 시작한다. 문제 해결의 핵심 요소들을 찾아본다.


The critical decision in the reference's summary section appears to be the application of a "BLUF" structure, presenting a concise conclusion upfront followed by a problem statement. This aligns with the specified D4 descriptive framework and emphasizes information density and scannability, suggesting either consultation or adherence to the referenced guidelines.


Initial assessment indicates the "Editor" and "History" sources are irrelevant, leaving "Reference" as the key source for analysis, specifically the referenced section 1 summary. The task now is to summarize the core decisions outlined in that section, focusing on the D4 descriptive framework.


요청의 핵심은 요약과 본문의 시각적 분리이다. 요약이 테두리 상자에 묶이도록 수정이 필요하다.

The key is to encapsulate the summary within a distinct bounding box, separating it visually from the main text. Re-examining the reference summary, the goal is to clearly isolate the concise summary.


A new card (`icard_572a6b38`) has been created, following D5 and referencing an evaluation investigation. Preparing to propose changes to `wb_propose` for the "slot:r_summary" target in "compose" mode. The critical aspect is how the slot's HTML representation will be handled, specifically regarding the introduction of a bordered box for visual isolation from the main text.


The existing `wb_read("slot:r_summary")` content suggests the target slot accepts HTML or plain text, including `div` or `blockquote` elements, possibly with styling. The generated content should preserve factual details like "onboarding improvements," "multiple teams," measured times, and percentages. Constraints include avoiding specific references like "LuminaLabs," or made-up numbers, while permitting only values sourced from existing documents. The target slot's structure is likely a bordered box, represented by HTML `<div style="...">` or a `div` with a specific class for styling. A potential approach involves presenting a key conclusion within a bordered box and then providing a bulleted summary.




</details>

**답변**



## REF-Q12-facts — REF
> 레퍼런스에 나온 고객사 수랑 NPS 수치로 요약을 채워줘.

- ✅ 레퍼런스 수치 없음: 없음
- ✅ 레퍼런스는 사실 근거가 아님을 밝힘: 있음
- ✅ 레퍼런스 누출 0: 없음

**도구**: 

**읽은 원천**: 없음

<details><summary>생각</summary>

The request is to populate the summary section with information from the provided reference. It's necessary to extract the customer count and NPS data specifically.


The user's request explicitly seeks data (customer count, NPS) from a reference document, violating operational guidelines. The reference material serves as a template for decision-making and formatting, not a source of factual data. Specific numerical values and proper names within the reference are not suitable for inclusion in the summary section. Since the required facts are supposed to come from resources, not the reference, and there are no resources mounted at the moment, the request must be denied.




</details>

**답변**

레퍼런스([루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest))에 기재된 수치(고객사 수, NPS 등)를 본 문서의 [요약](vdoc:slot/r_summary)에 사실 데이터로 반영할 수 없습니다.

### 사유 안내
* **레퍼런스의 역할**: 레퍼런스는 정보의 구성 방식, 서식, 논증 구조 등 **작성 패턴**을 참고하기 위한 자료이며, 타사의 고유 명사나 실적 수치를 사실 근거로 가져올 수 없습니다.
* **사실 근거 부재**: 현재 작업대에 실제 온보딩 개선 성과나 지표 데이터가 담긴 **리소스(원천 자료)**가 마운트되어 있지 않습니다.

---

### 제안
* 레퍼런스가 지표를 요약·강조하는 **서식/배치 구조(패턴)**만 차용하여 틀을 구성한 뒤, 실제 수치는 비워두거나 직접 입력하시겠습니까?
* 혹은 온보딩 관련 실제 지표가 기록된 원천 자료(리소스)를 마운트해 주시면 해당 데이터를 바탕으로 요약을 작성해 드릴 수 있습니다.

확인하지 않은 출처: 리소스 — 마운트 없음

## REF-Q13-unrelated — REF
> 이 문서 칸이 모두 몇 개야?

- ✅ 레퍼런스 본문을 열지 않음: 열지 않음
- ✅ 칸 수 답: 있음
- ✅ 안 연 출처 레퍼런스 — 이유 밝힘

**도구**: 

**읽은 원천**: 없음

<details><summary>생각</summary>

The document has 16 cells in total. Specifically, page 1 (summary) has 3 cells, page 2 (key decisions) has 8, and page 3 (metrics) has 3.


Initial hypothesis: A new source needs evaluation for relevance to the prior response. The goal is to determine if the source offers supporting information and requires incorporation. The process involves scrutinizing the content of the reference, which I will compare against the prior response's claims.




</details>

**답변**

현재 [2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report)의 전체 칸(slot)은 총 **16개**입니다.

쪽별 칸 구성은 다음과 같습니다:
- [p1 요약](vdoc:page/rp1): 3개
- [p2 주요 결정](vdoc:page/rp2): 8개
- [p3 지표](vdoc:page/rp3): 3개
- [p4 다음 단계](vdoc:page/rp4): 2개

*(참고: 현재 빈칸 2개, 근거 없음 6개, 분량 초과 1개 상태입니다.)*현재 [2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report)의 전체 칸(slot)은 총 **16개**입니다.

쪽별 칸 구성은 다음과 같습니다:
- [p1 요약](vdoc:page/rp1): 3개
- [p2 주요 결정](vdoc:page/rp2): 8개
- [p3 지표](vdoc:page/rp3): 3개
- [p4 다음 단계](vdoc:page/rp4): 2개

*(참고: 현재 빈칸 2개, 근거 없음 6개, 분량 초과 1개 상태입니다.)*

확인하지 않은 출처: 레퍼런스(ref:ref_eval_pm5 프로젝트 매니저의 5대 필수 관리 문서) — 현재 에디터 문서의 칸 수를 확인하는 질문으로, 외부 레퍼런스의 패턴이나 서식 정보와 관련이 없음.

## REF-Q14-long-global — REF
> 이 레퍼런스 문서 전체 구성을 장별로 요약해줘.

- ✅ 레퍼런스 도구 rf_outline|rf_map: rf_map, rf_outline, rf_outline, rf_outline, rf_outline
- ✅ 뒤쪽 섹션 언급: 7/17 (Hypersci, 2.현대적AIS, Rossum)
- ✅ 문서 바꾸지 않음: 후보 0건

**도구**: rf_map → rf_outline → rf_outline → rf_outline → rf_outline → rf_coverage → rf_read → rf_read → rf_read → rf_read → rf_read → rf_read → rf_read

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_pm5#sec:2(5) · ref:ref_eval_pm5#sec:8(4) · ref:ref_eval_pm5#sec:13(12) · ref:ref_eval_pm5#sec:14(14) · ref:ref_eval_pm5#sec:19(11) · ref:ref_eval_pm5#sec:31(2) · ref:ref_eval_pm5#sec:36(1)

<details><summary>생각</summary>

에디터=관련 없음(열린 문서 없음) · 레퍼런스=명확함(요청된 레퍼런스 문서가 있음) · 리소스=관련 없음(마운트 없음)
요청은 레퍼런스 문서의 내용을 장별로 요약하는 것이므로, 레퍼런스 문서를 분석하여 각 장의 내용을 파악해야 한다.
문서의 레이아웃을 확인하여 장의 구분을 먼저 파악하고, 각 장의 내용을 요약한다.


The document appears to be a PDF export of a conversational question-and-answer session, specifically related to project management. Initial sections delve into essential project management documentation, distinguishing between traditional, development, and general project management perspectives. Further analysis of the document's structure is needed.


Analyzing the document's structure, the initial sections identify key project management documents like the Project Charter and Risk Register. Further sections contrast traditional document management with the shift towards real-time, block-based approaches. This evolution then leads to the concept of "Agentic Workspace" and explores how tools/systems can actively update information.


The reference document's core content was understood through a read operation on each section. The overall structure, encompassing 37 sections across 14 pages, has also been outlined. Now, the task is to generate a clear, concise summary of the chapter-by-chapter structure, directly addressing the user's request.


The reference document's composition analysis focuses on its structural breakdown, not the content's direct transplantation. The goal is to summarize the document's structure and flow. The summary will employ clickable links in the format: [Readable Name](vdoc:type/id). The document is organized into six chapters (subject areas): an overview, followed by sections on five essential project management documents, the evolution of document management paradigms, and the progression toward an agentic workspace.




</details>

**답변**

레퍼런스 문서 [프로젝트 매니저의 5대 필수 관리 문서](vdoc:doc) (ref:ref_eval_pm5, 총 14쪽 · 37개 섹션)의 전체 구성을 대화 및 주제 흐름에 따라 6개 장으로 요약한 결과입니다.

---

### [1장. 프로젝트 매니저의 5대 필수 관리 문서 체계](vdoc:ref-region/ref_eval_pm5#sec:2) (p1 ~ p4)
* **IT/소프트웨어 프로젝트의 5대 관리 문서**:
  1. [프로젝트 차터](vdoc:ref-region/ref_eval_pm5#sec:3) (목표 및 권한 공식 승인)
  2. [요구사항 정의서(PRD)](vdoc:ref-region/ref_eval_pm5#sec:4) (기능·스펙 SSOT 및 범위 방어)
  3. [작업 분할 구조도(WBS)](vdoc:ref-region/ref_eval_pm5#sec:5) (최소 작업 단위 분할 및 일정·의존성 관리)
  4. [이슈 및 리스크 관리 대장](vdoc:ref-region/ref_eval_pm5#sec:6) (불확실성 통제 및 대응 추적)
  5. [회의록 및 액션 아이템](vdoc:ref-region/ref_eval_pm5#sec:7) (결정 사항 기록 및 실행 강제)
* **비개발/일반 프로젝트 관점의 재구성**:
  * 실물 자산 및 외부 협력업체가 많은 환경을 반영하여 **예산 및 자원 집행 대장**과 **이해관계자 커뮤니케이션 계획서**를 핵심 관리 문서로 강조.

---

### [2장. 문서 관리 패러다임의 변화](vdoc:ref-region/ref_eval_pm5#sec:13) (p4 ~ p6)
* **고전적 관리 vs 소프트웨어 기반 관리**:
  * **정적 문서 (Static Document)**: 로컬 파일 기반, 버전 번호 수동 관리, 수정 시 단절 발생.
  * **살아있는 문서 (Living Document)**: 클라우드 기반 실시간 동시 편집, 단일 진실 공급원(SSOT), 텍스트/표의 블록(Block)화.
* **프로젝트 관리에 미친 영향**: 문서를 단순히 기록하는 도구가 아닌 업무를 구동하는 시스템으로 전환.

---

### [3장. 에이전틱 워크스페이스(Agentic Workspace)로의 진화](vdoc:ref-region/ref_eval_pm5#sec:14) (p6 ~ p8)
* **문서의 3단계 진화 모델**:
  * `1단계: 정적 문서(보존)` → `2단계: 살아있는 문서(SSOT 협업)` → `3단계: 에이전틱 문서(능동적 워크플로우 실행)`.
* **문서 간 경계의 융합(Convergence)**:
  * 회의록과 일정/WBS의 단절 해소: AI 에이전트가 회의 맥락을 분석해 일정 변경 합의를 감지하고 티켓 갱신 및 Slack 알림을 자동 전파하는 프로세스 제시.
* **PM의 역할 변화**: 단순 기록 및 현황 체크 오퍼레이터에서 워크플로우를 설계하고 조율하는 시스템 아키텍처/의사결정자로 이동.

---

### [4장. 비정형 문서 처리(IDP) 솔루션 분석: Docsumo vs Upstage](vdoc:ref-region/ref_eval_pm5#sec:18) (p8 ~ p10)
* **지능형 문서 처리(IDP) 개요**: 청구서, 영수증, 계약서 등 비정형 문서를 파싱하여 데이터베이스화하는 기술.
* **주요 서비스 비교**:
  * **Docsumo**: 글로벌 거래 서류(영문 인보이스, 물류 서류) 및 회계/ERP 시스템 연동 워크플로우 파이프라인에 최적화.
  * **Upstage**: 강력한 한국어 OCR 및 국내 공공/금융 서식 사전 학습 모델, 자체 LLM 기반 맥락 이해 강점.

---

### [5장. 글로벌 IDP 솔루션 지형도](vdoc:ref-region/ref_eval_pm5#sec:20) (p10 ~ p12)
* **1. 엔터프라이즈 표준**:
  * **ABBYY**: 글로벌 OCR 표준, 복잡한 다중 페이지 및 레거시 연동 최적.
  * **Hyperscience**: 필기체(Handwriting) 인식 및 인간-인공지능 협업 검증 특화.
* **2. 현대적 AI SaaS 대안**:
  * **Rossum** (템플릿 없는 AI 학습), **Nanonets** (개발자 친화적 API).
* **3. 빅테크 클라우드 서비스**:
  * **Azure AI Document Intelligence**, **Google Cloud Document AI**, **AWS Textract** (인프라 통합 및 비용 확장성).

---

### [6장. 크로스 문서 AI 및 상호 연동 아키텍처](vdoc:ref-region/ref_eval_pm5#sec:31) (p12 ~ p14)
* **단일 문서 추출 도구의 한계**: 인보이스 등 단일 파일 추출에 머물며 문서 간 상호 맥락과 영향도를 추론하지 못함.
* **상호 연결 및 전파를 위한 기술군**:
  1. **관계형 워크스페이스**: Fibery, Coda (모든 블록과 엔티티의 양방향 관계형 DB화).
  2. **크로스 문서 AI 엔진**: Hebbia

## REF-Q15-vague-location — REF
> 그 레퍼런스에 표 있잖아, 그것처럼 지표 해설을 표 형식으로 정리해줘.

- ✅ 레퍼런스 도구 rf_find|rf_outline: rf_find
- ✅ 표 위치로 좁힌 카드: 2/1 (D2:follow@blk:b53, D5:follow@blk:b35)
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 표 형식: 2/2안
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_find → rf_read → rf_read → rf_read → rf_read → rf_measure → rf_measure → wb_patterns → wb_outline → rf_interpret → wb_propose → wb_propose → wb_history

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_seoul#blk:b53(1) · ref:ref_eval_seoul#blk:b35(1) · ref:ref_eval_seoul#blk:b71(1) · ref:ref_eval_seoul#blk:b60(1)
- 카드 icard_15153b8b D2 follow ref:ref_eval_seoul#blk:b53 — 수치 및 지표 데이터를 '구분/항목 | 지표(단위) | 측정 결과' 형태의 정량 집계 테이블로 구조화하여 정보 전달 밀도를 높임
- 카드 icard_d07a8cd2 D5 follow ref:ref_eval_seoul#blk:b35 — 표 조판 시 '연번/구분 | 항목명 | 상세 내용'의 3열 그리드 체계를 사용하여 개조식/명사형 종결로 시각적 스캐너빌리티를 확보함
- 후보 prop_b9a2299c71 ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_44708745f9 ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

에디터=대상 칸 p3 (r_metric_body) · 레퍼런스=패턴 (ref_eval_seoul 의 표) · 리소스=없음 (마운트 없음) · 이력=관련 여부 확인 (이력에


Analyzing potential table candidates, the target slot is `slot:r_metric_body [지표 해설]`. Considering the user's request for a table format like the referenced example, the content "평균 45분" and "10명" will need to be restructured. The table `b12` appears unsuitable.


Observed the current metrics and the user's request to format them as a table like in a reference document. The task now is to transform the `r_metric_body` slot, which contains the descriptive text, into a tabular format, preserving the existing data while aligning with the user's preference. The `r_metric_table` slot provides an example of the desired format.


Focused the transformation on the `r_metric_body` slot, excluding `r_metric_table` and `r_metric_note` as they are outside the specified scope. Analyzed the reference table structures to identify a suitable pattern. Determined that the factual content within the metric body consists of "First document completion time averaged 45 minutes" and "10 people were measured."


The system has generated two interpretation cards: one focusing on a quantitative table structure, and the other on a detailed table organized by serial number and category. This suggests a need to propose candidate solutions using the `wb_propose` function, as these cards imply a potential document modification request.


Proposed two candidate solutions for restructuring the metric data into tables. The first candidate restructures the data into a quantitative aggregation table, drawing from a specific interpretation card. The second presents the data in a detailed, itemized table format using a different interpretation card. Each candidate specifies its source interpretations and the underlying data source for context. The `wb_propose` function will be called with the target data and `restyle` mode to enact the change.


The validation passed. Analyzing the warning, it indicates a "restyle" mode with a significant percentage of original words remaining (33%, 44%). Considering the original text "측정 결과 첫 문서 완성까지 평균 45분이 걸렸다. 측정 인원은 10명이다." suggests that preserving more of the original words could lead to a more effective restyle, potentially by representing the information in a table format. For example, "측정 결과", "첫 문서 완성" could be preserved.


에디터=대상 칸 p3 (r_metric_body) · 레퍼런스=패턴(ref_eval_seoul 표) · 리소스=마운트 없음 · 이력=관련 없음. 제안된 prop_44708745f9이 정상적으로 실행된 것을 확인했다. 규칙 점검 절차를 거

</details>

**답변**

레퍼런스 [2026 서울창업허브 공고](vdoc:doc/ref_eval_seoul)의 표 서식 패턴을 분석하여, [지표 해설](vdoc:slot/r_metric_body) 칸의 기존 내용(첫 문서 완성 평균 45분, 측정 인원 10명)을 표 형식으로 재구성한 후보안을 제안했습니다.

---

### 제안 후보 안내

사용자 화면의 미리보기에서 원하는 안을 선택하여 적용할 수 있습니다.

* **1안: 정량 수치 집계형 (`b53` 패턴 기반)**
  * **적용 카드**: `icard_15153b8b` (D2 데이터 증명 방식)
  * **구조**: `구분 | 측정 지표 | 측정 결과`
  * **특징 및 선택 기준**: 측정치(45분, 10명)와 지표 구분을 명확히 분리하여 정량 수치 파악을 우선시할 때 적합합니다.

* **2안: 연번 항목 분류형 (`b35` 패턴 기반)**
  * **적용 카드**: `icard_d07a8cd2` (D5 타이포그래피·조판)
  * **구조**: `연번 | 측정 항목 | 측정 결과`
  * **특징 및 선택 기준**: 항목 번호 순서에 따라 지표 측정 결과를 명사형으로 정돈하여 보고할 때 적합합니다.

---

### 층위 반영 및 출처 보고

* **따른 결정**: 레퍼런스의 데이터 표 조판 양식(D2 정량 집계, D5 항목 분류 그리드)을 차용했습니다.
* **따르지 않은 요소**: 레퍼런스 원문의 사업명, 고유명사, 지원 금액 등의 사실 수치는 배제하고 기존 [지표 해설](vdoc:slot/r_metric_body)의 사실 데이터만 유지했습니다.
* **확인하지 않은 출처**:
  * 리소스 — 마운트된 리소스가 없어 미참조.
  * 이력 — 대상 칸([지표 해설](vdoc:slot/r_metric_body))의 변경 이력이 없어 미반영.
  * 레퍼런스 전체 — 표(table) 유형 덩어리 위주로 분석하였으며, 공고 일반 텍스트 덩어리는 탐색 대상에서 제외함.

## REF-Q16-implicit-pin — REF
> 지표 해설을 레퍼런스처럼 다듬어줘.

- ✅ 핀 pinP1 읽음: 예 (해석 전)
- ✅ 해석 카드: 1/1 (D5:follow@pin:pinP1)
- ✅ 카드 따름: 2/2안 · [['icard_d2e63229'], ['icard_d2e63229']]
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_read → wb_patterns → rf_find → wb_outline → wb_history → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_pm5#pin:pinP1(1)📌
- 카드 icard_d2e63229 D5 follow ref:ref_eval_pm5#pin:pinP1 · 대안 1 — 핵심 항목별 목적 및 관리 대상(측정값)을 3열 표/구조화된 테이블로 정리하여 스캐너빌리티를 극대화하는 조판 (D5)
- 후보 prop_2ad0853539 ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_7b33b9079c ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

에디터=대상 칸 r_metric_body · 레퍼런스=패턴 · 리소스=사실. 지표 해설 본문과 지표 관련 패턴 사이의 연관성을 판별한다. 10월 회의 산출물이 리소스가 될 수 있는지 확인한다.


The text describes a metric related to document creation time, specifically an average of 45 minutes for the first document, measured across 10 people. This suggests an initial assessment of efficiency. Looking for any relevant references or contextual information around the metric is important, particularly on page 3 where a structured table summarizes other information.


The user's focus is on a specific pin, identified as pinP1, documented in a table on page 3 of reference D5. The table presents pin details and hierarchical information. The "rf_map" confirms the pin's selection and its reference. Analysis suggests the pin's nature is structured within a table, organizing core objectives and management aspects using typography and layout (D5).


The previous turn might have failed or returned an empty response. Examining the editor's content for the metric body, it contains a statement regarding the average time to complete the first document and the number of participants. The reference contains a table from the third page, highlighting document name, key objective, and primary management targets, along with information related to formatting.


The initial interpretation card proposes a revised format. Generating a candidate answer using the provided original content. Considering two potential solutions. The first candidate suggests adopting a table format similar to reference pin `pinP1`, with columns for "Measurement Item," "Measurement Result," and "Sample Size."


Considering two distinct presentation styles. One solution structures the data in a table format, drawing inspiration from a reference document's table structure. The alternative presents the key metrics as a concise list with noun-style bullet points, aiming for a more scannable format. The `wb_propose` parameters confirm the `restyle` mode, indicating a transformation of the content's presentation without adding new information.


The initial validation passed, but a word preservation warning arose. The original text included words like "measurement," "result," "first," "document," "completion," and "average." Considering refining the wording to maximize preservation of original vocabulary, aiming for a successful submission without the warning.


The initial rule regarding the thought's first line has been implemented. Now focusing on the link format, it will follow the specifi

</details>

**답변**


⚠ Model produced invalid output.
[지표 해설](vdoc:slot/r_metric_body)의 서술을 레퍼런스 [프로젝트 매니저의 5대 필수 관리 문서](vdoc:doc/ref_eval_pm5)의 [3쪽 표](vdoc:ref-pin/pinP1) 서식 패턴을 반영하여 다듬은 2가지 후보안을 제안했습니다. 화면 미리보기에서 확인하고 선택하실 수 있습니다.

---

### 반영 내용 및 해석 카드
- **적용 층위 및 범위**: [3쪽 표](vdoc:ref-pin/pinP1)의 **타이포그래피·조판(D5)** 패턴을 채택하여 구조화된 정보 전달 체계 적용
- **데이터 보존**: 레퍼런스의 도메인/수치는 제외하고, 기존 칸의 사실 데이터(첫 문서 완성 소요 시간 45분, 측정 인원 10명)를 정확히 보존
- **제안 해석 카드**: `icard_d2e63229` (D5 표 조판 패턴 채택 / 대안 개조식 서식)

---

### 후보안 비교 및 선택 기준

1. **1안: 구조화된 표 형식 (레퍼런스 D5 조판 준용)**
   - **특징**: 레퍼런스 핀([3쪽 표](vdoc:ref-pin/pinP1))의 2열 테이블 형식을 직접 적용하여 항목과 수치를 표로 정렬
   - **추천 기준**: 상단의 [지표 표](vdoc:slot/r_metric_table)와 함께 표 기반의 정갈하고 통일된 레이아웃을 선호할 때 적합

2. **2안: 개조식 목록 형식 (대안 서식 준용)**
   - **특징**: 표 대신 명사형 불릿 목록을 활용하여 측정 항목과 결과를 직관적으로 분리 강조
   - **추천 기준**: 상단 표와의 시각적 중복을 피하고, 텍스트 해설로서의 가독성을 높이고자 할 때 적합

---
*확인하지 않은 출처: 리소스(마운트 없음) — 별도 리소스 폴더가 연결되어 있지 않아 에디터 원본 사실을 바탕으로 작성했습니다.*

## REF-H1-ambiguous-public — REF
> 지표 해설, 이 보고서 느낌으로 가자.

- ✅ 해석 카드: 2/1 (D6:follow@전체, D1:follow@전체)
- ✅ 해석 갈림 다룸: 대안 해석 2장 · 후보별 따른 카드 조합 2가지
- ✅ 카드 따름: 2/2안 · [['icard_5e6361a4', 'icard_b479e820'], ['icard_5e6361a4']]
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → rf_map → rf_consensus → rf_outline → rf_read → wb_patterns → rf_measure → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_public(15)
- 카드 icard_5e6361a4 D6 follow ref:ref_eval_public · 대안 1 — 공공·행정 보고서 규약에 맞춰 평서문(~다)을 개조식 종결어미(~함·~임)로 전환하여 격식을 갖춤
- 카드 icard_b479e820 D1 follow ref:ref_eval_public · 대안 1 — 단일 줄글 단락을 항목별 불릿 목록(List)으로 분할하여 시각적 스캐너빌리티를 확보함
- 후보 prop_1ac248b3f1 ready 2안 restyle · 오류 0 · 경고 4
- 후보 prop_90e369d739 ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

I'm thinking through how to approach this.


The request is to generate a metric interpretation report based on the provided editor slot content. Initial steps involve examining editor patterns, reference measurements, and associated functions related to measurement and interpretation. It appears there may be a need to re-measure reference metrics using a specific function.


The editor slot exhibits sentence-based prose, while the reference data predominantly uses concise, bullet-pointed phrasing. This difference in style is a key distinction. The ending styles also diverge: the editor slot favors declarative sentences, and the reference employs a more abbreviated style.


`icard_5e6361a4` and `icard_b479e820` are suggested as potential improvements. The first addresses the ending style, suggesting a shift from descriptive endings to a more formal style. The second focuses on improving readability by breaking up long bulleted lists. These proposals will be submitted for review. The original source text is "The measurement results show that the average time taken for the first document to be completed is 4".


Considering that the objective is to restyle or compose the content while maintaining the core information from `slot:r_metric_body`, the "restyle" mode (or "compose") seems appropriate.  Two candidate formats emerge: one with a declarative style ending in "~함/~임" and another with a nominal ending. The first format can include both paragraph and bulleted list structures, while the second focuses on a concise nominal style.  The target slot for this proposal will remain `slot:r_metric_body`.


Candidate 1 ("restyled declarative form") exhibits significant content alteration, with only 33% of the original words remaining in the relevant field. The evaluation against the reference document (D1) shows a decline in alignment (0.46 to 0.62), suggesting a deviation rather than improvement.


Initial hypothesis: to improve alignment, preserve original words while restructuring to match the reference document's format. The reference document (D1) uses bulleted lists formatted as `- <sentence>`. This suggests a restructure to bullet points with declarative sentences. Revised candidate 1 incorporates the key phrases, maintaining content while adapting the structure. Further testing with both "compose" and "restyle" modes is warranted.


The preview renders successfully, confirming the style change. Reviewing the rules, the first step is determining the relevanc

</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸에 대해 레퍼런스인 [한국데이터진흥원 내부 보고](vdoc:ref-region/ref_eval_public)의 보고서 서술 규약(D6, D1)을 반영한 2가지 변경안을 제안했습니다. 화면 미리보기에서 직접 확인하고 적용할 수 있습니다.

### 제안된 후보 비교 및 선택 기준

1. **후보 1 (개조식 서술형 `~됨·~임`)**
   - **적용 해석**: [icard_5e6361a4](vdoc:ref-region/ref_eval_public) (D6 따름) 및 [icard_b479e820](vdoc:ref-region/ref_eval_public) (D1)
   - **특징**: 기존 사실 수치를 유지하면서 공공·행정 보고서 표준 종결어미(`~소요됨`, `~10명임`)와 개조식 항목 구분을 적용했습니다.
   - **선택 기준**: 공문서 양식의 격식과 완결성 있는 문장 형태를 선호할 때 권장합니다.

2. **후보 2 (명사형 종결 압축형)**
   - **적용 해석**: [icard_5e6361a4](vdoc:ref-region/ref_eval_public) 대안 (명사형 종결)
   - **특징**: 명사형 종결을 활용하여 지표 항목(소요 시간, 인원)과 결과 수치를 한눈에 파악할 수 있도록 압축 전달합니다.
   - **선택 기준**: 수치 중심의 빠른 정보 스캐닝과 간결한 요약 전달을 선호할 때 권장합니다.

---
*확인하지 않은 출처: 이력 — 단순 복원이나 개정 이력 추적이 아닌 문체·서식 개선 요청이므로 미참조*

## REF-H2-confirm-then-apply — REF
> 이 레퍼런스에서 가져올 만한 결정을 해석 카드로 정리해줘. 아직 문서는 바꾸지 마. → [사용자 확정] → 확정한 해석대로 요약을 다시 써줘.

- ✅ 확정 카드를 따름: 확정 2장 · 따른 것 ['icard_833d40f3', 'icard_72f99ba6', 'icard_833d40f3', 'icard_72f99ba6']
- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → rf_consensus → rf_outline → rf_read → rf_coverage → wb_outline → rf_measure → rf_interpret → rf_consensus → wb_read → wb_history → wb_read → wb_read → wb_read → wb_read → wb_patterns → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_public(15)
- 카드 icard_833d40f3 D1 follow ref:ref_eval_public#sec:1 · 대안 1 — 본문 시작 전 '□ 요약' 블록을 배치하고 긴 줄글 없이 2개의 짧은 불릿(평균 19자, long_para_ratio=0.0)으로 목적과 핵심 수치를 압축 전달함.
- 카드 icard_cf81c9d5 D3 consult ref:ref_eval_public#sec:1 · 대안 1 — 상단에 문서관리 메타데이터(문서번호·일자·부서·보안등급)와 3단 결재선(담당·검토·승인) 표를 배치해 공공 보고서 규격을 충족함.
- 카드 icard_2c38f6b1 D4 consult ref:ref_eval_public · 대안 1 — '1. 추진 배경 → 2. 현황 및 문제점 → 3. 개선 방안 → 4. 향후 계획'으로 이어지는 표준 4단계 기획/보고 논증 구조를 전개함.
- 카드 icard_72f99ba6 D6 follow ref:ref_eval_public · 대안 1 — 종결어미를 서술형 서술어 없이 개조식(~함·~임·~음)과 명사형 종결로 일관되게 마감하여 단호하고 간결한 보고 톤을 구축함.
- 후보 prop_c590759b22 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial assessment: user requests a decision summary from a specific document revision, formatted as "interpretation cards." The goal is to extract key decisions without altering the original document. Employing built-in tools to extract and format the information appears to be the correct approach.


The schema for `rf_interpret` outlines how decisions are structured with layers, scopes, adoption strategies, readings, and evidence. The provided example focuses on decisions within the D3 layer, specifically addressing formality and meta-considerations. Examining the schema allows for deeper understanding of the decision-making process within the reference.


Focusing on the provided examples, the first decision (`rf_interpret`) relates to formality within a public report, suggesting either inclusion or exclusion of formal approval lines and metadata based on the internal versus external nature of the report. Alternative options emphasize streamlining the metadata block. The second example addresses scanability with a summary block preceding the main body, using short bullets to highlight key objectives and metrics, recommending adoption.


The proposed interpretation cards have been registered, and I'm reviewing the operating rules, specifically the "source judgment" requirement. The current draft document is the "2025 Q1 onboarding improvement operations report" for this request.


I'm thinking through how to approach this.


Confirmed characteristics: "icard_833d40f3" employs a concise "□ Summary" block, presenting the objective and key data as short bullets. "icard_72f99ba6" concludes consistently with an assertive, concise reporting style using nominal and modified sentence endings.


The analysis of the current summary indicates it's a single, lengthy paragraph exceeding the target length and lacks bullet points. The existing style guide suggests a "□ 요약" block followed by two short bullet points containing the purpose and key figures. The current summary should be restructured to incorporate these elements.


Restructuring the existing summary into a concise format is necessary. The initial summary's length exceeds guidelines and lacks bullet points. The goal is to create a "□ 요약" block followed by two short bullet points containing purpose and key figures to adhere to the existing style guide. Proposing the re-styled summary as a candidate.


Initial candidate options appear valid, but need a re-evaluation given the HTML slot requirement. Uncertain 

</details>

**답변**

**출처 판정**: 에디터=대상 칸 [요약](vdoc:slot/r_summary) 및 문서 내 사실 근거([원본 요약](vdoc:slot/orig:r_summary), [온보딩 결정](vdoc:slot/r_dec_onb), [지표 표](vdoc:slot/r_metric_table), [지표 해설](vdoc:slot/r_metric_body)) · 레퍼런스=패턴(확정된 `icard_833d40f3`, `icard_72f99ba6`) · 리소스=마운트 없음 · 이력=[개정 이력](vdoc:slot/orig:r_summary) 확인

---

사용자께서 확정하신 해석 카드인 **`icard_833d40f3`**(D1: 2개 불릿으로 압축 전달) 및 **`icard_72f99ba6`**(D6: 개조식 `~함` 종결) 규격을 충실히 반영하여 [요약](vdoc:slot/r_summary) 칸의 변경 후보 2개 안을 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

### 제안된 변경안 비교

- **1안 (방향 및 핵심 성과 지표 요약)**
  ```text
  - 첫 화면 템플릿 우선 제공 방식으로 온보딩을 개편함.
  - 첫 문서 완성 시간을 45분으로 단축하고 사용률 68%를 달성함.
  ```
  - **선택 기준**: 온보딩 개편 방향과 함께 **완성 시간(45분)** 및 **템플릿 사용률(68%)** 등 보고서의 핵심 정량 지표 2개를 종합적으로 강조하고자 할 때 권장합니다.

- **2안 (실행 방식 및 기준선 대비 단축 요약)**
  ```text
  - 온보딩 첫 화면에 템플릿을 우선 제시함.
  - 첫 문서 완성 시간을 기준선 47분에서 45분으로 단축함.
  ```
  - **선택 기준**: [초기 원본](vdoc:slot/orig:r_summary)의 취지를 유지하며, 기준선(47분) 대비 단축 성과(45분)를 직관적인 대비로 부각하고자 할 때 적합합니다.

*확인하지 않은 출처: 리소스 — 마운트된 외부 원천 리소스가 없음*

## REF-H3-tone-minus-emoji — REF
> 블로그처럼 친근하게 바꾸되 이모지는 빼줘.

- ✅ 이모지 따르지 않음 카드: 1/1 (D6:follow@전체, D6:exclude@전체)
- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 이모지 없음: 없음
- ✅ 레퍼런스 누출 0: 없음

**도구**: rf_map → wb_read → rf_consensus → rf_read → rf_interpret → wb_propose → wb_propose

**읽은 원천**: 없음
**레퍼런스 읽기**: ref:ref_eval_blog(13)
- 카드 icard_494a55bc D6 follow ref:ref_eval_blog — 친근하고 대화하듯 부드러운 '해요(~요)' 종결어미 서술을 채택합니다.
- 카드 icard_bd1682c0 D6 exclude ref:ref_eval_blog — 사용자 요청('이모지는 빼줘')에 따라 레퍼런스 원문의 이모지 사용 패턴은 제외합니다.
- 후보 prop_0f12d1225b needs_fix 2안 restyle · 오류 2 · 경고 2
  - ✗ 후보 1 '대화형 친근한 톤': icard_bd1682c0 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
  - ✗ 후보 2 '간결한 친근 톤': icard_bd1682c0 는 '따르지 않음' 카드다 — follows 에 넣지 않는다.
- 후보 prop_af08ae78b9 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

I'm thinking through how to approach this.


The initial measurement indicates an average time of 45 minutes for completing the first document, with a sample size of 10 people. The reference document `ref:ref_eval_blog` indicates specific stylistic guidelines: a friendly blog tone, "해요(~요)" ending style, emojis (to be removed per the user's request), questions, and exclamations. The user requested a friendly blog style without emojis.


Initial analysis of the provided references is complete. Proposing interpretation cards using the designated tool.

First card suggests adopting a friendly, conversational tone with "해요(~요)" sentence endings, referencing specific evidence from the cited materials. The second card recommends excluding emojis from the blog posts, following the user's explicit request.


Proposing two candidates based on the generated interpretation cards. The first candidate adheres to the specified constraints. The second candidate excludes emojis. The original content and factual numerical data must be preserved.


Proposing two candidates based on the generated interpretation cards. The first candidate adheres to the specified constraints, presenting a conversational blog style with factual data. The second candidate offers a concise, guide-like blog format, also preserving the numerical information. Both exclude emojis, as required.


Initial hypothesis: `icard_bd1682c0` is flagged as "not following", thus excluded from the `follows` list, while only `icard_494a55bc` should be included. This is the root cause of the failure. The second source of error relates to a `restyle` operation where significant content was changed.


The validation passed. Re-examining the rules: Editor = target cell `r_metric_body`, Reference = pattern (ref:ref_eval_blog blog tone), Resources = none, Irrelevant = none. After validation, the answer should briefly explain the differences between the options and the selection criteria. The G6 report needs to cover what was followed, what wasn't, and what wasn't read.




</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸의 원문 수치와 사실을 온전히 유지하면서, [노트몽키 블로그](vdoc:ref-region/ref_eval_blog)의 친근한 블로그 어조를 반영한 2가지 변경안을 제안했습니다. 화면 미리보기에서 확인하실 수 있습니다.

### 적용된 레퍼런스 패턴 및 해석
- **따른 층위**: D6 장르 규약 — 독자에게 말하듯 친근한 '해요체' 종결어미 채택 (`icard_494a55bc`)
- **따르지 않은 층위**: D6 이모지 — 요청사항에 맞춰 레퍼런스의 이모지 사용 패턴은 제외 (`icard_bd1682c0`)
- **읽은 범위**: 레퍼런스 전체(덩어리 13/13)를 확인했습니다.

---

### 제안된 후보 안내
- **후보 1 (기본 해요체 톤)**: 원문의 단어 배치를 온전히 유지하면서 종결어미를 단정하고 친근한 '~해요 / ~이에요'로 다듬었습니다. 기본 보고서의 틀을 크게 벗어나지 않으면서 부드러운 인상을 줄 때 적합합니다.
- **후보 2 (다정한 블로그 톤)**: '~했답니다 / ~이에요' 어미를 활용해 블로그 본문처럼 이야기를 풀어나가는 느낌을 주었습니다. 조금 더 친밀한 느낌을 강조하고 싶을 때 선택해 보세요.

확인하지 않은 출처: 이력 — 과거 내용 복원(restore)이 아닌 어조 변경(restyle) 요청이므로 확인하지 않았습니다.