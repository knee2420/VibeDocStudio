# 작업대 평가 — regress-after-mix

전체 4/4 · 튜닝 세트 4/4 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| R6-conflict | R | ✅ | 4/4 | 37.1s | 29,600/59,602/2,231 | 7 | - |
| F4-pin | F | ✅ | 2/2 | 25.4s | 22,992/18,415/1,853 | 2 | - |
| FE4-gap | FE | ✅ | 2/2 | 34.9s | 24,883/38,825/2,597 | 3 | - |
| RFE3-swap | RFE | ✅ | 4/4 | 71.0s | 41,212/155,308/5,759 | 9 | ready:2,ready:2,ready:2 |

## R6-conflict — R
> 리서치 자료끼리 서로 충돌하는 수치가 있어? 있으면 어느 쪽을 믿어야 해?

- ✅ 충돌값 1,200: 있음
- ✅ 충돌값 1,450: 있음
- ✅ 어느 쪽이 맞는지 근거: 있음
- ✅ 지표 파일 읽음: 1건

**도구**: ws_tree → read_file → read_file → read_file → read_file → read_file → read_file

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md

<details><summary>생각</summary>

Initial assessment: the request concerns potential conflicting data within the research documents. The resource files are limited in number (6 files, 42 lines). A full file listing will be obtained and their content examined. The initial method to investigate will be through file inspection and content review.


Initial hypothesis: examine all six files for conflicting metrics. The files have a small line count, making full content review feasible.


WAU discrepancy requires clarification. Interview data from February reported 1,200 WAU, while March logs show 1,450. The difference suggests either inaccurate initial estimation or growth. Evaluating the reliability of each source (verbal estimate vs. logged data) to determine a more accurate WAU.




</details>

**답변**

리서치 자료 6개 전체(6/6)를 확인한 결과, **주간 활성 사용자(WAU)** 수치에서 충돌이 확인됩니다.

---

### 1. 충돌하는 수치

* **[A사 인터뷰](vdoc:resource/file_424d917afe) (L7)**: WAU **1,200명** (2025년 2월 인터뷰, 담당자 구두 언급)
* **[3월 지표 요약](vdoc:resource/file_ca01d6d352) (L9)**: WAU **1,450명** (2025년 3월 21일 기준)

---

### 2. 어느 쪽을 믿어야 하는가: **[3월 지표 요약](vdoc:resource/file_ca01d6d352) (1,450명)**

[3월 지표 요약](vdoc:resource/file_ca01d6d352)의 수치를 신뢰해야 합니다. 이유는 다음과 같습니다:

1. **데이터 수집 방식의 객관성**: 1,200명은 담당자의 '구두 추정치'에 불과하지만, 1,450명은 실제 시스템의 **'제품 로그'**를 기반으로 집계된 데이터입니다.
2. **최신성**: 2025년 2월 시점의 구두 언급보다 2025년 3월 3주차 기준의 집계가 더 최신 데이터입니다.
3. **충돌 원인 명시**: [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L13)에 `※ WAU 는 제품 로그 기준(3월 3주). 2월 인터뷰의 1,200명은 구두 추정치다.`라고 해당 충돌 원인과 관계가 직접 명시되어 있습니다.

## F4-pin — F
> 이 핀 같은 느낌으로 가고 싶어.

- ✅ 핀 읽기: wb_read
- ✅ 핀의 층위 특정: 3/2 (결론[^\n]{0,12}(먼저|앞|맨)|두괄, 짧|한 줄|간결, 숫자|수치|증거)

**도구**: wb_read → wb_patterns

**읽은 원천**: 없음

<details><summary>생각</summary>

I'm thinking through how to approach this.


The analysis indicates the active pin, identified as `ref:ref_eval_invest#pin:pinA1`, is associated with a summary box within a specific document context. This summary box follows a D4 descriptive framework characterized by a 'conclusion first' structure, where the core finding is presented upfront.




</details>

**답변**

에디터=열린 문서 없음 · 레퍼런스=패턴([요약 상자](vdoc:ref-pin/ref_eval_invest#pin:pinA1)) · 리소스=마운트 없음 · 관련 없음=없음

[투자 제안서](vdoc:ref/ref_eval_invest)의 [요약 상자](vdoc:ref-pin/ref_eval_invest#pin:pinA1) 핀에서 추출한 핵심 스타일 및 구조 패턴입니다. (내용·수치는 제외하고 형식만 추출)

---

### 층위별 패턴 분석

1. **D4 서술 프레임워크 (두괄식 4단 전개)**
   - **결론 선행 (`conclusion_first`)**: 맨 위에 최종 목표/핵심 결론 1문장을 단정형으로 먼저 제시합니다.
   - **표준 4단 구조**: 결론 아래에 `문제 → 해법 → 증거 → 요청(Action Item)` 순서로 논리를 전개합니다.

2. **D1 정보 밀도 및 스캐너빌리티 (`bullet_ratio: 0.8`)**
   - 긴 줄글을 배제하고 단락 길이를 평균 37자 내외로 압축했습니다.
   - `[핵심 키워드] — [요약 내용]` 형식의 대시(`—`) 구분 개조식을 일관되게 사용해 한눈에 읽히도록 구성되었습니다.

3. **D2 데이터 증명 방식 (`numbers_per_100: 4.44`)**
   - 추상적 서술 대신 각 항목마다 핵심 정량 수치(비율, 건수, 점수, 목표액 등)를 1개 이상 반드시 배치하여 설득력을 확보하는 패턴입니다.

4. **D6 문체 및 톤앤매너**
   - 불필요한 수식어를 뺀 간결한 평서문(`~다`) 및 명사형 종결을 취합니다.

---

### 다음 단계 안내
현재 **에디터에 열린 문서(대상 칸)** 및 사실 근거가 될 **리소스**가 지정되어 있지 않습니다.
- 이 패턴을 적용할 문서 블록이나 슬롯을 열어주시거나,
- 본문에 녹여낼 주요 사실(결론/문제/해법/증거/요청)을 알려주시면 바로 반영 후보안을 작성하겠습니다.

## FE4-gap — FE
> 이 레퍼런스 대비 내 문서에 뭐가 부족해?

- ✅ 층위별 갭 3개 이상: 4/3 (단락|문단, 결론|두괄, 표|수치|숫자, 제목|구조)
- ✅ 측정값 비교: 있음

**도구**: wb_compare → wb_outline → wb_outline

**읽은 원천**: 없음

<details><summary>생각</summary>

The editor encompasses the entire comparison target, a 4-page document with 16 sections, and the reference is for pattern comparison with an investment proposal. No mounted resources are present. Since the request is for comparison, direct modification is not the objective.

The user's question, "What is missing in my document compared to this reference?" leads to the application of the workbench's rule: Use the workbench outline to read the document's content by slot, block, and page. The diagnosis will be based on the workbench patterns' measurements and section positions.


The reference document's clear, conclusion-first format and structured argumentation, which follows a situation-problem-question-solution flow, is noticeably different from the current document's style. Comparing this structure to the `wb_patterns` output should illuminate specific differences.


The current document's structure differs significantly from the reference document's clear, conclusion-first approach. Analysis reveals that the summary section uses a verbose introduction, delaying the core conclusion, while the document lacks a hierarchical heading structure beyond the top-level title.

Compared to the concise paragraphs, bullet points, and high numerical density of the reference, this document features longer paragraphs, lower numerical data density, and a complete absence of bullet points or source citations, which renders some sections lacking supporting evidence. The overall typography and structural organization also deviate, as the document uses only a single top-level heading.




</details>

**답변**

[(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref_eval_invest)와 비교했을 때, 현재 작성 중인 [2025 Q1 온보딩 개선 운영 보고서](vdoc:doc/vdoc_eval_report)에서 보완이 필요한 핵심 차이점은 크게 4가지 패턴 층위에서 나타납니다.

---

### 1. D4 서술 프레임워크 (두괄식 결론 및 논증 구조 부재)
* **레퍼런스**: 서두에 명확한 핵심 결론(`결론: ...`)을 먼저 던진 후, **상황 → 문제 → 질문 → 해답(문제-해법-증거-요청)**으로 이어지는 인과적 서술 틀을 갖추고 있습니다 (`conclusion_first: true`).
* **내 문서**: [요약](vdoc:slot/r_summary) 칸이 *"이번 분기 온보딩 개선 작업은 여러 팀이 함께 참여한 대규모 프로젝트였으며..."*와 같은 과정 나열형 만연체로 시작하여 핵심 성과와 결론이 즉시 드러나지 않습니다 (`conclusion_first: false`).

### 2. D1 스캐너빌리티 및 정보 밀도 (긴 단락과 개조식 부재)
* **레퍼런스**: 평균 단락 길이 **20.4자**(최대 56자), 불릿 리스트 비율 **25%**로 핵심 문장 단위로 짧게 끊어쳐 가독성이 높습니다.
* **내 문서**: 평균 단락 길이 **37.2자**(최대 253자)로 호흡이 길며, 불릿 리스트(`bullet_ratio: 0.0`)가 전혀 쓰이지 않았습니다. 특히 [지표 주석](vdoc:slot/r_metric_note)은 단락 길이가 134자에 달해 권장 분량(80자)을 초과한 상태입니다.

### 3. D2 데이터 증명 및 출처 표기 (수치 밀도 및 근거 결여)
* **레퍼런스**: 100자당 수치 밀도가 **4.03개**로 촘촘하며, 데이터마다 명확한 출처 표기(`source_marks: 1`, 예: *(출처: 2024 시장조사)*)를 달아 신뢰도를 확보했습니다.
* **내 문서**: 수치 밀도가 **1.34개**로 낮고, 수치나 결정 사항에 대한 출처 표기가 전무합니다. 이로 인해 [지표 표](vdoc:slot/r_metric_table), [지표 해설](vdoc:slot/r_metric_body), [주요 결정](vdoc:page/rp2) 등 총 6개 칸에 `근거없음` 경고가 발생해 있습니다.

### 4. D5 조판 위계 및 문서 완성도 (헤딩 위계 부족 및 빈칸)
* **레퍼런스**: H1, H2 등 5개의 구조화된 헤딩과 블록(목록, 문단, 표)을 조화롭게 배치해 시각적 리듬을 제공합니다.
* **내 문서**: 문서 전체에 H1 제목 1개만 존재하여 섹션 구분이 평면적입니다. 또한 [문서 정보](vdoc:slot/r_meta)와 [다음 결정](vdoc:slot/r_dec_next) 2곳이 `빈칸`으로 남아 있어 완결성이 떨어집니다.

---

> **개선 권장 방향**: 레퍼런스의 고유명사나 사실이 아닌 **'서술 패턴'**을 차용하여, [요약](vdoc:slot/r_summary)에 두괄식 핵심 성과 1줄을 배치하고, 긴 서술은 불릿 목록으로 분절하며, [지표](vdoc:page/rp3) 칸에 측정 출처를 명시하는 구조적 개선을 추천합니다.

확인하지 않은 출처: 이력(rev:1~2) — 레퍼런스와 현재 문서 초안 간의 패턴 진단 요청이므로 개정 이력은 검토하지 않음.

## RFE3-swap — RFE
> 투자 제안서 D1 스타일로 이 칸 다듬어줘. 내용은 그대로. → 레퍼런스를 공공 보고로 바꿔서 다시 적용해줘.

- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 공공 보고로 교체: ref_eval_public:D1 ref_eval_public:D6 ref_eval_public:D1 ref_eval_public:D6
- ✅ 45 보존: 2/2안
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → wb_read → wb_patterns → wb_patterns → wb_propose → wb_propose → wb_read → wb_patterns → wb_propose

**읽은 원천**: 없음
- 후보 prop_89d1687cd9 ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_fc4dbd963d ready 2안 restyle · 오류 0 · 경고 0
- 후보 prop_484ec48a38 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

The task involves adapting a specific cell (`r_metric_body`) to match a "D1 style" from an investment proposal reference. The primary action is to extract the content of the target cell.


Initial assessment of the "D1" pattern in the evaluation reference suggests a focus on scannability and information density. The pattern analysis indicates effective use of bolding within paragraphs, and the incorporation of bullet points or bolded keywords connected by dashes. Short sentences and paragraphs are also characteristic of this "D1" pattern.


Initial restructuring focuses on scannability and information density, considering bolding and concise bullet points. The original sentence "측정 결과 첫 문서 완성까지 평균 45분이 걸렸다. 측정 인원은 10명이다." can be transformed into multiple candidates reflecting D1 style. One candidate uses bullet points with bold keywords: "첫 문서 완성 시간: 평균 45분 소요", "측정 대상: 총 10명". Another proposes HTML structures with similar emphasis. Further options for restructuring will be considered to maximize clarity.


The warning indicates substantial content alteration during the style transformation for both candidate styles. Specifically, 'Candidate 1' retains only 33% of the original words, and 'Candidate 2' retains 44%. This suggests significant rewriting or summarization, potentially changing the intended meaning. The impact of the style changes needs assessment.


The response validated without any verification warnings. The instructions require a concise answer, focusing on the differences between the options and the selection criteria. Also, the response needs clickable links for screen locations or cited materials: [human-readable name](vdoc:type/id).


D1's structure aligns with the "개조식" style, exhibiting a high bullet point ratio and minimal bolding, suggesting a clean, concise format. This initial observation points towards a potential match with the specified genre conventions. The analysis confirms a strong adherence to "개조식" ending styles, bullet point formats, and the use of the specified ending forms, supporting a hypothesis of compliance with the targeted genre.


Analysis suggests the original text can be restructured into a public report style. Considering word preservation and D1/D6 characteristics, a 개조식 approach with 명사/음슴체 endings is considered. Several variations are being evaluated, maintaining a high level of word retention while adopting a concise, public-report-appropriate format.


The public report's target distance metric now fully c

</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸에 [한국데이터진흥원 내부 보고](vdoc:doc/ref_eval_public)의 **D1(개조식 구성)** 및 **D6(공공 보고서 장르 규약: ~음·~임/명사형 종결)** 패턴을 반영한 2가지 변경안을 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

### 제안 안별 차이 및 선택 기준

1. **제1안: 개조식 항목 분할형 (~음·~임 종결)**
   - **특징**: 측정 결과와 측정 인원을 2개의 불릿 항목으로 분리하고, 공공 보고서 전형의 개조식 종결어미(`~걸림`, `~10명임`)를 적용했습니다.
   - **선택 기준**: 공공 행정·공문서 표준 서식의 격식과 가독성을 온전히 갖추고자 할 때 적합합니다.

2. **제2안: 단일 개조식 명사 종결형**
   - **특징**: 핵심 수치를 단일 행으로 통합하고 측정 인원을 괄호 내 명사형으로 간결하게 압축했습니다.
   - **선택 기준**: 한 칸 안에서 여러 줄을 차지하지 않고 콤팩트하게 개조식 요약 형태로 표기할 때 적합합니다.

---
확인하지 않은 출처: (주)루미나랩스 투자 제안서(ref:ref_eval_invest) — 공공 보고 레퍼런스로 교체 요청됨에 따라 제외, 이력 — 단순 서식 재구성(restyle) 요청으로 미참조