# 작업대 평가 — wb-final

전체 21/25 · 튜닝 세트 21/25 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| R6-conflict | R | ✅ | 4/4 | 41.7s | 40,069/159,702/1,960 | 8 | - |
| R7-gap | R | ✅ | 2/2 | 51.4s | 40,227/160,604/3,098 | 8 | - |
| F1-decompose | F | ✅ | 3/4 | 37.0s | 25,464/36,383/3,222 | 3 | - |
| F2-compare | F | ✅ | 2/2 | 18.9s | 22,063/18,192/1,520 | 1 | - |
| F4-pin | F | ✅ | 2/2 | 23.7s | 22,323/18,079/1,911 | 2 | - |
| F5-fit | F | ❌ | 2/3 | 36.0s | 31,022/77,542/2,376 | 5 | - |
| E1-scan | E | ✅ | 3/3 | 23.0s | 25,693/37,324/1,674 | 5 | - |
| E2-trim | E | ✅ | 3/3 | 35.2s | 31,881/95,226/2,863 | 5 | ready:2 |
| E3-restore | E | ✅ | 4/4 | 18.3s | 28,275/57,813/1,031 | 3 | ready:1 |
| E5-consistency | E | ✅ | 4/4 | 32.2s | 34,017/114,996/1,415 | 6 | - |
| E6-todo | E | ✅ | 3/3 | 13.9s | 22,404/18,157/1,123 | 1 | - |
| RE1-fill | RE | ✅ | 3/3 | 53.2s | 37,215/129,987/3,325 | 8 | ready:3 |
| RE2-verify | RE | ✅ | 3/3 | 80.4s | 61,602/370,359/5,124 | 16 | - |
| RE3-update | RE | ❌ | 2/3 | 74.1s | 49,099/277,462/5,668 | 15 | ready:2 |
| FE1-genre-only | FE | ✅ | 5/5 | 36.9s | 30,714/79,375/2,607 | 6 | ready:2,ready:2 |
| FE2-three | FE | ✅ | 5/5 | 44.5s | 33,454/110,345/3,915 | 15 | ready:3 |
| FE3-toggle | FE | ✅ | 3/3 | 84.4s | 38,191/167,657/8,417 | 8 | ready:2,ready:2,ready:2,ready:2 |
| FE4-gap | FE | ✅ | 2/2 | 60.6s | 44,574/203,304/3,145 | 10 | - |
| FE5-template | FE | ✅ | 3/3 | 42.2s | 34,679/100,088/3,487 | 7 | ready:2 |
| RF1-frame | RF | ✅ | 3/3 | 80.0s | 51,766/275,890/6,127 | 12 | - |
| RF2-proof | RF | ❌ | 2/3 | 52.0s | 32,054/80,804/2,715 | 9 | - |
| RFE1-draft | RFE | ❌ | 3/4 | 71.4s | 39,618/181,994/6,165 | 15 | ready:2 |
| RFE-P-three | RFE | ✅ | 6/6 | 83.7s | 37,760/137,341/7,331 | 12 | ready:3,ready:3 |
| RFE3-swap | RFE | ✅ | 4/4 | 63.8s | 36,766/127,490/4,898 | 7 | ready:3,ready:3 |
| RFEH-restore-restyle | RFE | ✅ | 5/5 | 51.2s | 39,123/136,103/3,197 | 6 | ready:1,ready:2 |

## R6-conflict — R
> 리서치 자료끼리 서로 충돌하는 수치가 있어? 있으면 어느 쪽을 믿어야 해?

- ✅ 충돌값 1,200: 있음
- ✅ 충돌값 1,450: 있음
- ✅ 어느 쪽이 맞는지 근거: 있음
- ✅ 지표 파일 읽음: 1건

**도구**: ws_tree → read_file → read_file → read_file → read_file → read_file → read_file → ws_coverage

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md

<details><summary>생각</summary>

I'm thinking through how to approach this.


The small number of lines in the mounted files suggests a direct approach is viable; reading all six files via a single `read_file` operation is the initial strategy. This avoids potentially complex iterative file handling.


Initial WAU reported as 1,200, but a later document indicates 1,450. Need to determine which value is more reliable. Considering the source and date of the conflicting reports to assess accuracy.




</details>

**답변**

리서치 자료를 전수 확인한 결과, **주간 활성 사용자(WAU)** 수치에서 충돌이 확인됩니다.

---

### 1. 충돌하는 수치

* **1,200명**: [2025-02-03_인터뷰_A사.md](vdoc:resource/file_424d917afe) (L7)
  > "주간 활성 사용자(WAU)는 1,200명이라고 들었다 (2월 기준, 담당자 구두)."
* **1,450명**: [2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352) (L9)
  > WAU `1,450명`

---

### 2. 어느 쪽을 신뢰해야 하는가?

**[2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352)의 `1,450명`을 신뢰해야 합니다.**

**판단 근거:**
1. **측정 방식(정확도)**: [2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352) (L13) 각주에 명시되어 있듯이 **1,450명은 제품 로그 기준**으로 집계된 실제 데이터이며, 2월 인터뷰의 1,200명은 **담당자의 구두 추정치**에 불과합니다.
2. **시점(최신성)**: 2025년 2월 구두 언급 대비 2025년 3월 21일(3월 3주차) 기준 최신 집계 수치입니다.

## R7-gap — R
> 이 리서치 자료로 매출까지 포함한 분기 사업 보고서를 쓰려면 뭐가 빠졌어?

- ✅ 매출 데이터 없음: 있음
- ✅ 있는 데이터 제시: 있음

**도구**: ws_tree → read_file → read_file → read_file → read_file → read_file → read_file → ws_coverage

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md

<details><summary>생각</summary>

레퍼런스=없음, 리소스=주어진 리서치 자료, 에디터=없음, 산출=매출 포함 분기 사업 보고서 작성을 위한 결손 항목 분석. 제공된 리서치 자료가 무엇인지 파악 필요. 파일 목록을 먼저 확인하여 자료의 종류와 범위를 파악한다.


The file set is very short, totaling 42 lines across six files. Examining each file content using the file reading function is necessary to determine if the existing content contains the necessary information. The analysis will focus on identifying potential omissions required for compiling a "quarterly business report including sales." The root directory is at the specified path.


All mounted resource files have been read successfully. The user's question focuses on what's missing to create a business report including sales based on the research data. Available data includes a research folder structure guide and a summary of 2025 metrics.


The available data reveals a crucial lack of financial information, particularly revenue figures (MRR, ARR, conversion rates, etc.) necessary for a sales-inclusive business report. In addition, the provided usage metrics are limited to a snapshot in March, without providing the monthly trend (MoM growth) across the entire quarter (January to March) or quarterly targets.




</details>

**답변**

현재 마운트된 리서치 자료 6개 파일(42줄 전체 확인)을 검토한 결과, **매출을 포함한 분기 사업 보고서**를 작성하기 위해 필요한 핵심 정보 중 다수가 빠져 있습니다.

---

### 1. 현재 자료에서 확보 가능한 내용
* **제품 사용성 및 활성 지표**: 2025년 3월 기준 WAU 1,450명, 템플릿 사용률 68%, 첫 문서 완성 시간 31분 ([2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352) L1-13)
* **정성적 고객 피드백(VOC)**:
  * 회의 직후 결정 탐색 시간 단축 요구 및 템플릿 수요 ([2025-02-03_인터뷰_A사.md](vdoc:resource/file_424d917afe) L1-9)
  * 실행 담당 지정 필요성 및 온프레미스/보안 요구 ([2025-03-10_인터뷰_B사.md](vdoc:resource/file_698d94bf09) L1-8)
* **시장/경쟁 환경 분석 메모**: N사 및 M사의 기능적 한계 비교 ([경쟁사_비교.md](vdoc:resource/file_506aab9539) L1-4)
* **전년도 참고 수치**: 작년 연간 사용자 성장률 210% ([보고서_요약_원래본.md](vdoc:resource/file_62220c4596) L1-3)

---

### 2. 분기 사업 보고서 작성을 위해 빠진 핵심 항목

1. **재무 및 매출(Revenue) 실적 일체 부재**
   * 분기 매출액(MRR/ARR), 유료 플랜별 매출 비중, 유료 결제 전환율(Conversion Rate), 객단가(ARPU) 등의 재무 데이터가 전혀 없습니다.
2. **분기(1~3월) 전체 시계열 추이 및 목표 대비 달성률**
   * [2025-03_지표_요약.md](vdoc:resource/file_ca01d6d352)에 3월 3주차 WAU 단일 스냅샷만 존재할 뿐, 1분기 월별 성장 추이(MoM), 분기 목표치(KPI/OKR) 및 달성률 비교가 누락되어 있습니다.
3. **영업 파이프라인 및 계약 현황**
   * 인터뷰 고객사([A사](vdoc:resource/file_424d917afe), [B사](vdoc:resource/file_698d94bf09))에 대한 계약 규모, 라이선스 수, 도입 단계, 이탈률(Churn Rate) 등 B2B 영업/계약 지표가 없습니다.
4. **비용 및 손익(Cost & P&L)**
   * 인프라·운영비, 마케팅 비용, 인건비 등 분기 집행 비용과 영업손익 정보가 없습니다.

> **결론**: 현재 자료로는 **"1분기 사용자 피드백 및 프로덕트 지표 분석"** 수준의 리포트만 가능하며, 사업 보고서를 완성하려면 **재무 데이터(매출/비용), 영업 파이프라인(계약/전환 현황), 분기 전체 월별 추이 데이터**가 추가로 인입되어야 합니다.

## F1-decompose — F
> 이 레퍼런스를 층위별로 분해해줘. 내가 뭘 가져다 쓸 수 있는지.

- ✅ 레퍼런스 읽기 · 측정: wb_read, wb_patterns
- ✅ 층위 5개 이상: 6/5 (정보 밀도|스캐너, 증명|근거, 격식|메타, 프레임|논증|SCQA|상황, 조판|타이포|제목 계층, 장르|어조|종결)
- ✅ 측정값 근거: 있음
- ❌ (가점) 레퍼런스 고유 수치 미전달: 없음

**도구**: wb_outline → wb_read → wb_patterns

**읽은 원천**: 없음

<details><summary>생각</summary>

The reference appears to be a pattern for investment proposals. Attempting to outline the document to extract usable patterns and structure. The initial focus is on identifying recurring sections that could be useful templates.


Analyzing in detail. The operating rules and guidelines require extracting "patterns" at different levels from the reference material. These extracted patterns should be abstracted to guide the decomposition, focusing on information density, proof methods, formalisms, argumentation frameworks, typesetting, and genre conventions, excluding the original sentences, proper nouns, and numerical data.


Analyzing the provided guidelines, it appears the focus is on extracting specific patterns from the reference material, emphasizing the "why" behind decisions at different levels. The guidelines provide a structured approach to analyzing text by considering factors like information density and proof methods. The use of clickable links in the format `[readable name](vdoc:type/id)` is defined for referencing specific parts of the original material.


The analysis reveals several patterns in the document: a distinct lack of document identifiers and footers, and a minimalist title page. The document adopts a direct, conclusion-first framework (SCQA), using bolded conclusions and a four-step summary: problem, solution, evidence, and request.  Typographically, it's structured in a slide format, with a 3-page layout and clear heading hierarchy (H1/H2). The language is direct, employing declarative sentences and succinct noun phrases.




</details>

**답변**

[(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref:vdoc_eval_ref_invest)를 층위별로 분석한 결과입니다. 레퍼런스는 **‘결정 방식(패턴)’**만 차용하고, 고유명사·수치·문장 같은 원문 사실은 내 문서로 가져오지 않습니다.

---

### 1. 층위별 패턴 분해

#### **D4. 서술 프레임워크 (논증 구조)**
* **두괄식 결론 선언**: [요약](vdoc:slot/a_summary)의 최상단에서 `**결론: [핵심 목표/비전]**`을 볼드로 단언하고 시작합니다.
* **SCQA 프레임워크**: [논리](vdoc:slot/a_scqa) 슬롯에서 **상황(Situation) → 문제(Complication) → 질문(Question) → 해답(Answer)**의 4단계 제목 체계를 채택해 문제 제기와 해결책을 군더더기 없이 연결합니다.
* **Ask(요청) 완결 공식**: [요청](vdoc:slot/a_ask) 슬롯에서 `[필요 자원/금액]으로 [기한] 내에 [핵심 마일스톤]을 달성한다`는 목표 선언 뒤, 자금 배분 비율을 직관적으로 명시합니다.

#### **D1. 스캐너빌리티 및 정보 밀도**
* **지표**: 단락 평균 20.4자(최대 56자), 문장 평균 17.1자, 장문 비율 0%, 볼드 비율 0.38.
* **결정 패턴**: 줄글 형태의 긴 서술을 완전히 배제하고, `- **키워드** — 핵심 설명` 형태의 개조식 하이픈 구조를 사용하여 3초 안에 스캔할 수 있도록 구성했습니다.

#### **D2. 근거 및 데이터 증명 방식**
* **지표**: 수치 밀도 4.03개/100자, 2열 표 1개, 출처 표기 1개.
* **결정 패턴**: [시장](vdoc:slot/a_market) 슬롯처럼 `[지표 | 값]` 단순 2열 테이블로 핵심 지표(시장 규모, 실적, 만족도 등)를 컴팩트하게 제시하고, 하단에 괄호로 데이터 출처를 표기해 신뢰도를 확보합니다.

#### **D6. 장르 규약 (어조 및 어미)**
* **지표**: 단호한 평서문 종결(~다) 6회, 명사형 종결 6회, 이모지/감탄사 배제.
* **결정 패턴**: 모호한 추측성 표현(`~로 예상됩니다`, `~할 것 같습니다`) 대신 확신에 찬 단정적 문체(`~가 된다`, `~를 없앤다`, `~에 쓴다`)를 일관되게 유지합니다.

#### **D3 & D5. 격식 및 조판 규격**
* **메타 규격**: 결재선이나 공문 서식 대신 [표지](vdoc:slot/a_cover)에 작성 시점과 보안 등급(`Confidential`)만 미니멀하게 표기합니다.
* **페이지 분할**: 표지(1p) → 결론/논리 요약(2p) → 데이터 및 최종 요청(3p)으로 이어지는 3단계 원페이저/슬라이드형 조판 구조를 취합니다.

---

### 2. 내 문서에 가져다 쓸 수 있는 것 (패턴 vs 배제 대상)

| 구분 | 가져갈 패턴 (O) | 버려야 할 사실 (X - 복사 금지) |
| :--- | :--- | :--- |
| **요약부** | `**결론: ...**` + `문제-해법-증거-요청` 4줄 개조식 틀 | "루미나랩스", "기업 문서 자동화 시장", "62%" |
| **논리부** | `## 상황` / `## 문제` / `## 질문` / `## 해답` 헤딩 구조 | 문서 재작성 관련 구체 내용 |
| **데이터** | `지표 \| 값` 2열 요약 테이블 레이아웃 및 하단 출처 표기 형식 | "TAM 4.2조원", "고객사 37곳", "NPS 71" |
| **요청부** | `[자원]으로 [기한] 내 [결과] 달성 + 배분 비율` 문장 템플릿 | "50억원", "18개월", "200곳", "영업 60%/제품 40%" |
| **문체** | 짧은 호흡의 명사형 및 `~다` 단언형 어미 | 레퍼런스 원문 문장 전체 |

## F2-compare — F
> 두 레퍼런스 뭐가 달라?

- ✅ 층위 차이 4개 이상: 6/4 (개조식|~함|함\., 결재|문서번호|메타, 결론[^\n]{0,10}(먼저|앞)|두괄, SCQA|상황.{0,6}문제, 볼드|굵, 표)
- ✅ (가점) 측정 도구: wb_compare

**도구**: wb_compare

**읽은 원천**: 없음

<details><summary>생각</summary>

두 레퍼런스 간의 차이점을 파악하기 위해 비교를 진행한다. 비교 도구를 활용하여 각 문서의 내용을 분석하고, 차이점을 도출한다. 구체적인 차이점은 비교 결과에 따라 확인될 것이다.


Analyzing the differences between the two references, structuring the comparison by layer. The goal is a concise, systematic explanation. The format for referencing each document will use a human-readable name linked to its internal identifier (vdoc).




</details>

**답변**

[(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)와 [한국데이터진흥원 내부 보고](vdoc:doc/vdoc_eval_ref_public)의 층위별 패턴 차이는 다음과 같습니다.

---

### 1. 서술 프레임워크 및 전개 방식 (D4)
- **[(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)**: **SCQA(상황 → 문제 → 질문 → 해답) 피칭 구조**이며, 결론을 먼저 제시하는 두괄식(`conclusion_first: true`) 전개를 취합니다.
- **[한국데이터진흥원 내부 보고](vdoc:doc/vdoc_eval_ref_public)**: **공공기관 표준 4단계 기안 체계**(추진 배경 → 현황 및 문제점 → 개선 방안 → 향후 계획)를 따르며 단계적으로 사실과 계획을 나열합니다.

### 2. 문서 격식 및 메타 규격 (D3)
- **투자 제안서**: 대외 투자자 피칭용으로 문서번호·결재선·각주 등 내부 행정 메타 요소가 없습니다.
- **공공기관 보고서**: **문서번호, 결재란, 요약(Summary) 박스, 각주(Footnote)** 등 공공기관의 엄격한 내부 결재·행정 양식을 모두 갖추고 있습니다.

### 3. 문체 및 장르 규약 (D1, D6)
- **투자 제안서**: **평서문(~다)**과 명사형 종결을 혼용하며, 핵심 메시지 전달을 위한 의문형 문장과 볼드 강조(`0.38/단락`)를 적극 사용합니다.
- **공공기관 보고서**: 전형적인 공문서 어투인 **개조식 종결어미(~함·~임·~음)**를 사용하며, 불릿 항목 비율(`54%`)이 높고 볼드 강조 없이 담백하게 서술합니다.

### 4. 데이터 증명 및 조판 (D2, D5)
- **투자 제안서**: 단락 중심 서술 위에 100자당 수치 밀도(`4.03개`)가 높고 원천 출처 표기(`source_marks`)를 결합해 신뢰도를 확보합니다.
- **공공기관 보고서**: 줄글 단락을 최소화(`6단락`)하는 대신 **구조화된 표(3개)와 콜아웃(1개)** 중심의 보고용 레이아웃을 사용합니다.

## F4-pin — F
> 이 핀 같은 느낌으로 가고 싶어.

- ✅ 핀 읽기: wb_read
- ✅ 핀의 층위 특정: 3/2 (결론[^\n]{0,12}(먼저|앞|맨)|두괄, 짧|한 줄|간결, 숫자|수치|증거)

**도구**: wb_read → wb_patterns

**읽은 원천**: 없음

<details><summary>생각</summary>

The user's request appears to be referencing a "pin-like feeling". The context includes a reference to a specific "pin" ("pinA1") within a document related to a series A investment proposal. The initial hypothesis is that the user desires to explore or interact with this "pin" concept. Currently, there's no active document in the editor. The next step is to understand the intended action related to this "pin".


I'm thinking through how to approach this.


Identifying the core elements of the observed pattern (what was seen, in what order, and in what form), matching each component to available facts, and marking unmatched elements as "missing," avoiding the use of unrelated facts or references to fill gaps. The decisions are organized hierarchically, focusing on the measured data and discarding extraneous content. The current state reflects an empty editor and unmounted resources, therefore, the goal is to organize the hierarchical pattern (D1-D6) of the pin, specifically focusing on the decision, [ 요약 상자 ](vdoc:ref-pin/ref:vdoc_eval_ref_invest#pin:pinA1).




</details>

**답변**

[요약 상자](vdoc:ref-pin/ref:vdoc_eval_ref_invest#pin:pinA1) 레퍼런스 핀의 층위별 패턴 분석 결과입니다. 이 핀의 고유명사나 수치는 배제하고, 작성 형식과 논증 구조(패턴)만 추출했습니다.

---

### 추출된 패턴 결정 (Style Framework)

1. **서술 프레임워크 (D4)**
   - **두괄식 결론 (Conclusion-first)**: 첫 머리에 전체를 관통하는 핵심 결론/비전을 단정형으로 선언합니다.
   - **4단계 설득 축**: 결론 하단에 **[ 문제 — 해법 — 증거 — 요청(또는 목표) ]** 의 4단계 인과 구조를 불릿으로 배치합니다.

2. **스캐너빌리티 & 정보 밀도 (D1, D5)**
   - **초압축 개조식**: 불릿 비율 80%(`bullet_ratio=0.8`), 문장당 평균 26자 내외로 군더더기를 최소화했습니다.
   - **라벨링 조판**: `[항목명] — [핵심 내용]` 형태로 핵심 키워드를 앞에 세워 스캔 속도를 극대화했습니다.

3. **데이터 증명 방식 (D2)**
   - **고밀도 정량 수치 배치**: 100자당 수치 밀도 약 4.4개(`numbers_per_100=4.44`)로, 문제·증거·요청 항목마다 구체적인 정량 지표를 직결시켰습니다.

4. **문체 및 톤앤매너 (D6)**
   - 평서문 종결(`~다`)과 간결한 명사형 종결을 섞어, 군더더기 없는 단호하고 신속한 피치 톤을 유지합니다.

---

### 다음 단계 안내
현재 에디터에 열린 문서나 대상 칸(슬롯)이 없고, 사실 근거로 쓸 리소스가 마운트되어 있지 않습니다.
- 문서를 열거나 적용할 대상 블록/슬롯을 지정해 주시고,
- 담고자 하는 사실이나 리소스 자료를 알려주시면 이 프레임워크 구조에 맞춰 변경안을 제안(Propose)해 드리겠습니다.

## F5-fit — F
> 이 블로그 글을 레퍼런스로 해서 지금 보고서를 다듬으려고 해. 괜찮을까?

- ✅ 장르 불일치 경고: 있음
- ✅ 안 맞는 층위 지목: 있음
- ❌ 쓸 수 있는 층위 제안: 없음

**도구**: wb_patterns → wb_patterns → wb_compare → wb_read → wb_outline

**읽은 원천**: 없음

<details><summary>생각</summary>

The user wants to refine a report using a blog post as a reference. The roles are defined as: the current document is a draft report, and the reference is the blog post. This suggests that the blog post contains relevant information that can be used to improve the report.


The blog post's genre, purpose, audience, and tone are fundamentally incompatible with the report. The blog focuses on general note-taking tips, while the report targets business operations with a formal, professional style. Using the blog as a reference will create a mismatch.


The marketing blog utilizes an informal, friendly style with honorific endings and emojis, in stark contrast to the formal, objective tone required for the business operations report. Its listicle format and absence of tables also differ significantly from the report's structured presentation of findings, decisions, and data. Applying the blog's stylistic elements or its specific examples directly would undermine the report's credibility and formality; however, some general note-taking principles could be adapted.




</details>

**답변**

**권장하지 않습니다.** 현재 등록된 레퍼런스 [노트몽키 블로그 — 회의록 정리 꿀팁 5가지](vdoc:doc/vdoc_eval_ref_blog)는 캐주얼한 마케팅 블로그 글이므로, 공식 비즈니스 문서인 [2025 Q1 온보딩 개선 운영 보고서](vdoc:doc/vdoc_eval_report)의 서식·문체 레퍼런스로 삼기에는 장르와 격식 차이가 큽니다.

---

### 층위별 비교 및 부적합 사유

1. **장르 규약 및 문체 (D6)**
   - **레퍼런스**: 전면 **해요체(`~해요`, `~요`)**, 친근한 어조, 이모지(🧠, 🤔, 😅, 👉)와 CTA(무료 시작 유도)로 구성된 B2C 블로그 팁 아티클입니다.
   - **현재 보고서**: **평서형(`~다`)** 및 **명사형 종결** 중심의 공식 운영 보고서입니다. 레퍼런스의 문체 패턴을 가져오면 보고서의 신뢰도와 격식이 훼손됩니다.

2. **서술 프레임워크 (D4)**
   - **레퍼런스**: 팁 나열형(Listicle: "1. 결정부터 적어요", "2. 담당자를 바로 박아요" 등) 구조입니다.
   - **현재 보고서**: [p1 요약](vdoc:page/rp1) → [p2 주요 결정](vdoc:page/rp2) → [p3 지표](vdoc:page/rp3) → [p4 다음 단계](vdoc:page/rp4)로 이어지는 **의사결정·성과 공유형 4단계 보고 구조**를 이미 갖추고 있습니다.

3. **데이터 증명 방식 (D2)**
   - **레퍼런스**: 표(`tables=0`)나 데이터 증빙 없이 정성적 조언만 짧은 단락(평균 21자)으로 전달합니다.
   - **현재 보고서**: 결정 표([rb_dec](vdoc:block/rb_dec))와 지표 표([rb_metric_table](vdoc:block/rb_metric_table)) 등 정량 지표와 표 중심의 서식이 핵심입니다.

---

### 제언

- 레퍼런스 본문에 언급된 조언(예: "결정 먼저", "숫자는 표로 정리", "담당자 지정")은 좋은 원칙이지만, 현재 보고서 구조가 이미 해당 요소들을 구조화해 담고 있습니다.
- 문서를 다듬으려면 블로그 글 패턴을 적용하기보다, 현재 보고서에 존재하는 **실제 작업 과제(아래 항목)**를 해결하거나 공식 운영 보고서/경영 보고서 양식의 레퍼런스를 활용하는 것이 적절합니다:
  - [r_meta](vdoc:slot/r_meta) 및 [r_dec_next](vdoc:slot/r_dec_next)의 빈칸 보완
  - [r_metric_note](vdoc:slot/r_metric_note)의 분량 초과(134자 / 기준 80자) 축약 및 지표 일치도 검토

## E1-scan — E
> 이 문서 훑어 읽기 좋은지 봐줘.

- ✅ 요약 칸 지목: 있음
- ✅ 볼드 남발 지적: 있음
- ✅ 수치로 지적: 있음

**도구**: wb_outline → wb_patterns → wb_read → wb_read → wb_read

**읽은 원천**: 없음

<details><summary>생각</summary>

The text lacks bullet points, indicating a low visual scannability score and dense information presentation. The presence of bolded text within a long single sentence suggests an attempt at emphasizing key terms within a continuous narrative structure.




</details>

**답변**

현재 문서는 **훑어 읽기(스캐너빌리티)가 매우 취약한 상태**입니다. 주요 지표 측정값과 원문 분석 결과는 다음과 같습니다.

---

### 1. 주요 진단 결과

* **개조식(글머리 기호) 전무 (`bullet_ratio: 0.0`)**
  * 문서 전체에서 목록형 구조가 전혀 사용되지 않고 줄글 형태로만 서술되어 있어, 핵심 항목을 빠르게 분별하기 어렵습니다.
* **만연체 서술 및 볼드 남발 ([요약](vdoc:slot/r_summary))**
  * 단락 길이가 253자에 달하는 단일 문장으로 길게 늘어져 있습니다.
  * `**온보딩**`, `**여러 팀**`, `**대규모**`, `**사용자 경험**`, `**다양한**` 등 일반 서술어까지 볼드가 7개 이상 남발되어 시선이 분산되고 중요 정보의 위계가 사라졌습니다.
* **미괄식 서술 구조 (`conclusion_first: false`)**
  * 결론이나 핵심 성과가 먼저 제시되지 않고 배경 및 과정 설명이 앞서 등장해 요점을 즉각 파악하기 어렵습니다.
* **슬롯 권장 분량 초과 ([지표 주석](vdoc:slot/r_metric_note))**
  * 권장 글자 수 80자 대비 134자로 초과되어 있으며, 긴 문장 2개가 줄바꿈 없이 붙어 있어 가독성이 떨어집니다.
* **수치 불일치 혼선 ([지표 표](vdoc:slot/r_metric_table) vs [지표 해설](vdoc:slot/r_metric_body))**
  * 표에는 `첫 문서 완성 평균 | 47분`으로 표기되어 있으나 해설 칸에는 `평균 45분이 걸렸다`로 상이하게 적혀 있어 빠른 비교 및 검토에 혼선을 줍니다.

---

### 2. 개선 권장 방향

1. **[요약](vdoc:slot/r_summary) 두괄식 재구성 및 불릿화**
   * 핵심 성과(시간 단축 및 템플릿 사용률)를 첫 줄에 명시하고, 주요 실행 사항은 2~3개의 개조식 불릿으로 분리.
   * 단순 수식어의 볼드를 제거하고 핵심 키워드/수치만 선별 강조.
2. **[지표 주석](vdoc:slot/r_metric_note) 축약**
   * 80자 이내로 신규 사용자와 기존 사용자의 행동 차이 요점만 간결히 정리.

## E2-trim — E
> 이 칸 분량 제한에 맞게 다듬어줘.

- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_metric_note']
- ✅ 핵심 낱말 유지: 2/2안
- ✅ (가점) 답이 짧다 — 후보는 화면에 (답 450자)

**도구**: wb_read → wb_patterns → wb_outline → wb_history → wb_propose

**읽은 원천**: 없음
- 후보 prop_18ff7de5e9 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

The target is the `r_metric_note` field, which has exceeded its length limit. The task is to refine this field, ensuring it conforms to the length constraint. The workflow involves examining and revising the content within `r_metric_note`, preparing a revised submission via `wb_propose`.


The absence of history suggests this is a new interaction. The governing rule dictates presenting document change proposals via a specific tool instead of verbal explanations. Multiple proposals should offer diverse structures and layer combinations, along with source references for each.


Restyling, not composing, is the correct mode for condensing the text while keeping the content. The tool's definition confirms this: `restyle` preserves content, adjusting only the format. The text must be condensed to fit the character limit for the specified slot.


Initial suspicion was that "restyle" might mandate strict content preservation. Clarification required whether it permits summarization to fit character limits. Considering the potential for `"slot:r_metric_note"` as a source. Preparing to test proposals with and without layer definitions.

Two proposal options are under development, focusing on distinct aspects, under the character limit. Candidate 1, "첫 화면 노출 후 템플릿 사용률이 상승했으나, 신규(회의록 선호)와 기존 사용자(빈 문서 선호) 간 차이가 있어 차기 온보딩 설계에 반영이 필요하다." has 61 characters, which is under the 80-character limit.


The validation passed successfully, indicating the proposed solution functions as intended and is visible in the preview. The response will now concisely detail the differences between the options and the criteria for making a selection.




</details>

**답변**

[지표 주석](vdoc:slot/r_metric_note) 칸의 분량 제한(최대 80자, 현재 134자)에 맞춰 원문의 사실 관계를 훼손하지 않고 압축한 후보 2안을 화면 미리보기에 등록했습니다.

### 후보별 차이 및 선택 기준

1. **1안: 현황 비교 및 보완점 요약 (69자)**
   - **특징**: 첫 화면 노출 후 반응, 신규 사용자의 회의록 템플릿 선호와 기존 사용자의 전환 지연을 균형 있게 축약했습니다.
   - **추천**: 사용자 그룹 간 행태 차이를 주석에 명확히 남기고자 할 때 적합합니다.

2. **2안: 차기 과제 중심 요약 (68자)**
   - **특징**: 신규 대비 기존 사용자의 전환 정체를 다음 분기 온보딩 설계의 핵심 과제로 연결하는 실행 관점에 집중했습니다.
   - **추천**: 보고서의 흐름상 후속 조치 및 실행 과제를 강조하고자 할 때 적합합니다.

## E3-restore — E
> 원래 본문으로 되돌려줘.

- ✅ 후보 제안: ready · 1안 · mode=restore · 칸=['r_summary']
- ✅ 처음 글 그대로: 1/1안
- ✅ 리소스 탐색 0회: 없음
- ✅ 이력 사용: wb_history, wb_read

**도구**: wb_history → wb_read → wb_propose

**읽은 원천**: 없음
- 후보 prop_679f4d05eb ready 1안 restore · 오류 0 · 경고 0

<details><summary>생각</summary>

The request is to revert to the original text. The history holds the original content, not an external resource. This implies a "restore" action, not a style change. If the action were simply changing the text format, "restyle" would be appropriate. Instead, since the intention is to revert, this means restoring from the "wb_history" or "orig:r_summary".


The initial state reflects that the core of onboarding improvements involves prioritizing template provision, resulting in a substantial reduction in the first document completion time from the baseline of 47 minutes. The aim is to restore the original, pre-revision text.


The "wb_propose" operation succeeded. Following the rule to propose changes directly via "wb_propose" instead of explaining them verbally, I need to focus the response on the differences between the proposed changes and the selection criteria, omitting lengthy explanations.




</details>

**답변**

[요약](vdoc:slot/r_summary) 칸을 최초 작성 상태의 본문으로 되돌리는 복구안을 제안했습니다. 화면 미리보기에서 확인 후 적용하실 수 있습니다.

- **복구안 (1안)**: [요약](vdoc:slot/r_summary) 칸을 개정 전 초기 내용(`orig:r_summary`)인 *"Q1 온보딩 개선의 핵심은 템플릿 우선 제공이다. 첫 문서 완성 시간은 기준선 47분에서 크게 줄었다."* 로 복원합니다.

## E5-consistency — E
> 문서 안에서 서로 어긋난 숫자 있어?

- ✅ 47분: 있음
- ✅ 45분: 있음
- ✅ 표 칸 위치: 있음
- ✅ 해설 칸 위치: 있음

**도구**: wb_outline → wb_read → wb_read → wb_history → wb_read → wb_read

**읽은 원천**: 없음

<details><summary>생각</summary>

Analyzing the document to identify numerical inconsistencies. The goal is to examine the provided 4-page document, divided into 16 sections, for mismatched numbers. wb_outline or wb_read will be used to extract and compare the numbers within each section.


The primary goal is to reduce the initial document completion time, initially set at 47 minutes. The target is explicitly stated as minimizing this baseline completion time. Analysis focuses on identifying methods to decrease the average time of the first document.




</details>

**답변**

문서 내에서 **첫 문서 완성 시간** 수치가 서로 일치하지 않습니다.

---

### 불일치 내용

1. **[지표 표](vdoc:slot/r_metric_table)**
   - `첫 문서 완성 평균 | 47분`으로 기재되어 있습니다.

2. **[지표 해설](vdoc:slot/r_metric_body)**
   - `측정 결과 첫 문서 완성까지 평균 45분이 걸렸다.`로 기재되어 있어 **47분과 45분이 상충**합니다.

---

### 맥락 확인 ([요약](vdoc:slot/r_summary))
- [요약](vdoc:slot/r_summary) 칸을 보면 **47분**은 *"기준선으로 삼은 첫 문서 완성 시간 47분"*으로, 개선 전 기준선(baseline) 수치로 언급되어 있습니다.
- 따라서 [지표 표](vdoc:slot/r_metric_table)에 측정 결과(45분) 대신 이전 기준선(47분)이 잘못 들어가 있거나 두 칸 사이의 수치 동기화가 어긋나 있는 상태입니다.

## E6-todo — E
> 아직 할 일 남은 칸 알려줘.

- ✅ 빈 칸: 있음
- ✅ 분량 초과 칸: 있음
- ✅ 근거 없는 칸: 있음

**도구**: wb_outline

**읽은 원천**: 없음

<details><summary>생각</summary>

Initial assessment shows several slots needing attention. Specifically, one slot has exceeded the character limit, and six slots lack supporting evidence. Two slots appear empty, requiring population with relevant data. This suggests a potential issue with content length constraints and completeness.




</details>

**답변**

현재 문서에서 확인이 필요한 **할 일 남은 칸(총 8개 칸, 9건의 이슈)** 목록입니다.

---

### 1. 빈칸 (2건)
* [문서 정보](vdoc:slot/r_meta) ([p1 요약](vdoc:page/rp1)) — 내용이 비어 있습니다.
* [다음 결정 · 결정](vdoc:slot/r_dec_next) ([p2 주요 결정](vdoc:page/rp2)) — 외부 검색 항목의 결정 내용이 비어 있습니다.

---

### 2. 분량 초과 (1건)
* [지표 주석](vdoc:slot/r_metric_note) ([p3 지표](vdoc:page/rp3)) — 권장 80자 대비 **134자**로 분량이 초과되었습니다. *(근거 없음 중복)*

---

### 3. 사실 근거 확인 필요 (근거 없음 6건)
* [요약](vdoc:slot/r_summary) ([p1 요약](vdoc:page/rp1)) — 개정 이력 원본이 존재하며, 내용에 대한 원천 근거 확인이 필요합니다.
* [요금제 · 결정](vdoc:slot/r_dec_pricing) ([p2 주요 결정](vdoc:page/rp2)) — "월 정액제를 유지한다" 결정의 근거 확인이 필요합니다.
* [지표 표](vdoc:slot/r_metric_table) ([p3 지표](vdoc:page/rp3)) — 완성 시간(47분) 및 사용률(68%) 수치 근거 확인이 필요합니다.
* [지표 해설](vdoc:slot/r_metric_body) ([p3 지표](vdoc:page/rp3)) — 표와 수치 불일치(45분 표기) 및 표본 10명에 대한 근거 확인이 필요합니다.
* [지표 주석](vdoc:slot/r_metric_note) ([p3 지표](vdoc:page/rp3)) — 템플릿 사용률 관련 기술 근거 확인이 필요합니다.
* [다음 분기 계획](vdoc:slot/r_next_plan) ([p4 다음 단계](vdoc:page/rp4)) — 외부 검색 API 도입 및 30명 확대 계획에 대한 근거 확인이 필요합니다.

## RE1-fill — RE
> 회의 결정으로 이 칸 채워줘.

- ✅ 후보 제안: ready · 3안 · mode=compose · 칸=['r_dec_next']
- ✅ 초안 상태 반영: 1/3안
- ✅ 외부 검색 카드 읽음: 1건

**도구**: wb_read → ws_collect → wb_read → read_file → read_file → ws_grep → ws_grep → wb_propose

**읽은 원천**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md
- 후보 prop_ad8938da93 ready 3안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

The "external search" label is assigned to `slot:r_dec_next_k`, and `slot:r_dec_next` is empty. Observed decision cards include one in the "decided" state referencing a local index search and another in the "review" state concerning an external search API postponement. This suggests the system is evaluating external search options.


The initial search functionality will use a local index (BM25) to satisfy the security requirement of not sending customer documents externally. The "External Search API Adoption" document remains a draft under review and is not yet finalized, pending the next meeting.


Considering other rows in the table:  `slot:r_dec_next_k`: "외부 검색" likely corresponds to a similar format as the other entries. Based on the pattern, the most likely `slot:r_dec_next` value is a concise, declarative statement ending with "~한다". The existing style implies this new field describes an action or setting.


Decision 01 likely informs the content of the `slot:r_dec_next` value. The proposed content options are evaluated against operational rules related to "wb_propose" for document changes. The first candidate, "외부 서비스 대신 로컬 색인으로 시작한다," is a strong fit. I need to generate an appropriately formatted `wb_propose` input, including sources, layers, and mode information. The source must point to `Decision 01` as the source of this proposed update.


검증 통과, 이제 답안 작성 규칙에 따라 각 안의 차이점과 선택 기준을 간결하게 정리해야 한다. 화면 위치나 인용 자료는 클릭 가능한 링크 형태로 표현해야 한다.




</details>

**답변**

[다음 결정](vdoc:slot/r_dec_next) 칸에 채울 회의 결정 후보 3가지를 제안했습니다. 화면 미리보기에서 원하는 안을 선택하실 수 있습니다.

### 후보별 차이 및 선택 기준

- **1안 (로컬 색인 시작 · 확정)**: [Decision 01](vdoc:resource/file_1b8fa2e3c2) (L16-18)
  - 내용: `외부 서비스 대신 로컬 색인(BM25)으로 시작한다.`
  - **기준**: 이미 합의·확정된 결정 사항을 간결한 사실 위주로 기록하고자 할 때 적합합니다.
- **2안 (3월까지 보류 · 검토 중)**: [D5 (초안)](vdoc:resource/file_116d9acf40) (L10-11)
  - 내용: `외부 검색 API 도입은 3월까지 보류한다.`
  - **기준**: 가장 최근 주간회의(1/27)에서 논의된 외부 API 도입 일정(보류 안건)을 반영하고자 할 때 적합합니다.
- **3안 (보안 요구 반영 · 확정)**: [Decision 01](vdoc:resource/file_1b8fa2e3c2) (L16-21)
  - 내용: `보안 요구에 따라 외부 연동을 배제하고 로컬 색인을 우선 구축한다.`
  - **기준**: 외부 검색을 쓰지 않는 핵심 사유(고객 문서 보안 요구)를 함께 명시하고자 할 때 적합합니다.

## RE2-verify — RE
> 이 문서의 숫자들이 원천 자료랑 맞아?

- ✅ 실측 12명: 있음
- ✅ 문서의 10명 지적: 있음
- ✅ 기준선 메모 읽음: 1건

**도구**: wb_outline → wb_read → wb_read → wb_read → wb_read → ws_grep → read_file → ws_grep → ws_grep → ws_grep → ws_grep → read_file → ws_collect → ws_grep → read_file → wb_history

**읽은 원천**: Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, value_온보딩 실측 계획.md, 근거_온보딩 실측 기준선.md

<details><summary>생각</summary>

The document's numerical data requires verification against the provided source files. Initial assessment focuses on the editor's document, identifying the specific sections containing the numerical claims. The verification process involves comparing each number within the document against its corresponding source file to determine accuracy.


The initial assessment highlights discrepancies in the "p2 주요 결정" section. Conflicting information is present regarding the pricing model, as documentation suggests a shift to usage-based pricing. The "p1 요약" and "p3 지표 표" sections present data points like document completion time and template usage, serving as context, but the core conflict involves the pricing model inconsistency that requires further investigation.


Initial hypothesis: Onboarding process starts with three templates: "contract," "opinion," and "internal memo." This contrasts with the "meeting minutes format" mentioned elsewhere. The onboarding owner is identified as "Minji," though a different document mentions "PM Seomin-gyu." The goal is to reduce the initial document completion time by half compared to the measured baseline (47 minutes).


The initial plan mentioned measuring the time for 10 new customers to complete their first document. However, the finalized results reflect measurements from 12 new customers. These results indicate an average completion time of 47 minutes, with a minimum of 21 minutes and a maximum of 95 minutes.


The summary's "47 minutes" figure for first document completion matches the baseline data. The decision to "maintain monthly fixed pricing" directly contradicts the source's recommendation for usage-based pricing. The "47-minute" completion time in the metric table is labeled as the pre-improvement baseline, not a post-improvement result. The "68% template usage" figure lacks any supporting data within the referenced sources and is unsubstantiated.


The source material and the editor's numerical data have been rigorously compared and analyzed. Preparing a concise response for the user, clearly citing the source link ([name](vdoc:type/id)) and line numbers (Lstart-end) to detail discrepancies.


Analysis reveals several discrepancies. The cited "47 minutes (first document completion time)" in the summary and metric table ([vdoc:slot/r_summary], [vdoc:slot/r_metric_table]) contradicts the source ([vdoc:resource/file_32750aec7c] L8) which identifies 47 minutes as a baseline, not an improvement. The reported "45 minu

</details>

**답변**

문서에 기재된 숫자들은 **대부분 원천 자료와 맞지 않거나 왜곡·근거 없이 작성된 상태**입니다. 세부 대조 결과는 다음과 같습니다.

---

### 1. 첫 문서 완성 시간 (47분 vs 45분)
* **문서 내용**:
  * [요약](vdoc:slot/r_summary): "기준선으로 삼은 첫 문서 완성 시간 47분"
  * [지표 표](vdoc:slot/r_metric_table): "첫 문서 완성 평균 | 47분"
  * [지표 해설](vdoc:slot/r_metric_body): "평균 45분이 걸렸다"
* **원천 자료**: [온보딩 실측 기준선](vdoc:resource/file_32750aec7c) (L8)
  * `47분`은 온보딩 개선 후 결과값이 아니라 **개선 전 '기준선(Baseline)'**입니다.
  * `45분`이라는 수치는 원천 자료 전체 60개 파일 어디에도 존재하지 않으며, 문서 내 [지표 표](vdoc:slot/r_metric_table)의 47분과도 자체 충돌합니다.

---

### 2. 온보딩 측정 인원 (10명 vs 12명)
* **문서 내용**: [지표 해설](vdoc:slot/r_metric_body) "측정 인원은 10명이다."
* **원천 자료**: 
  * [온보딩 실측 계획](vdoc:resource/file_86636c6e07) (L6)의 초기 계획에는 10명으로 적혀 있었으나,
  * 실제 측정이 완료된 최종 기록인 [온보딩 실측 기준선](vdoc:resource/file_32750aec7c) (L7)의 실측 대상은 **신규 고객 12명 (n=12)**입니다.

---

### 3. 템플릿 사용률 (68%)
* **문서 내용**: [지표 표](vdoc:slot/r_metric_table) "템플릿 사용률 | 68%"
* **원천 자료**: 원천 자료 어디에도 68%라는 수치나 템플릿 사용률 측정 기록이 없습니다. **(근거 없음)**

---

### 4. 다음 분기 측정 계획 (30명)
* **문서 내용**: [다음 분기 계획](vdoc:slot/r_next_plan) "온보딩 측정을 30명으로 늘린다."
* **원천 자료**: 원천 자료에 30명 증원과 관련된 수치나 계획 기록이 없습니다. **(근거 없음)**

---

> [!NOTE]
> **함께 발견된 주요 사실 불일치**
> * **템플릿 종류**: [지표 주석](vdoc:slot/r_metric_note)의 '회의록 양식'은 확정 결정된 [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_29714fca72) (L17)의 3종(계약서 · 의견서 · 내부 메모)에 포함되지 않습니다.
> * **요금제 결정**: [요금제 · 결정](vdoc:slot/r_dec_pricing)의 "월 정액제를 유지한다"는 실제 결정인 [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_f6ab4714e3) (L17)의 "사용량 기반으로 전환"과 정반대입니다.

## RE3-update — RE
> 원천의 최신 결정을 문서에 반영해줘.

- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_dec_next', 'r_dec_onb', 'r_dec_pricing']
- ✅ 요금제 → 사용량 기반: 1/2안
- ❌ D03 읽음: 0건

**도구**: wb_outline → ws_collect → wb_read → read_file → read_file → read_file → read_file → ws_grep → ws_grep → ws_grep → wb_read → wb_read → wb_read → read_file → wb_propose

**읽은 원천**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, 근거_온보딩 실측 기준선.md
- 후보 prop_2a136e680a ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Analyzing the decision card list reveals the contents of `p2 주요 결정 (pageId=rp2)`. The structure contains a decision table (`block:rb_dec`) with fixed headers for "항목," "결정," and "요금제." The table specifically details that for the "요금제" item, the decision is to "월 정액제를 유지한다."


Initial investigation focuses on identifying key decision documents within the specified file paths. Suspect the paths contain meeting notes and decisions relevant to the ongoing analysis. Extracting topics, specifically "요금제" (pricing) and "온보딩" (onboarding), to understand the document's relevance.


Initial analysis focuses on `p2 주요 결정 (pageId=rp2)` and the structured table `block:rb_dec`. Specifically, examining the slots: `r_dec_h1`, `r_dec_h2`, `r_dec_pricing_k`, and `r_dec_pricing`. The current entry for `r_dec_pricing` is "월 정액제를 유지한다" (maintain monthly subscription) but lacks supporting justification.


The user's request is to reflect the latest decisions in the document. The document section directly addressing 'decisions' is `p2 주요 결정 (pageId=rp2)` specifically the `block:rb_dec` (decision table). The table entries must be checked against the latest decision. Specifically, `slot:r_dec_pricing` should be updated; the table has `월 정액제를 유지한다.` where the latest decision (Decision 03) indicates: "Seat-based (or flat-rate) model is discarded; usage-based billing by number of processed document pages." The table must be updated to reflect this change.


Decision 04 indicates the onboarding process should begin with specific document templates. The `slot:r_dec_next` requires an update based on the decision to postpone the external search API.

Considering `wb_propose`'s structure, the target should be either the entire `block:rb_dec` or explicitly list the relevant slots: `r_dec_pricing`, `r_dec_onb`, and `r_dec_next`. Focusing on the slots within the block is a better approach, using `block:rb_dec` as the target, and populating the `slots` object.


Analyzing the slots within `block:rb_dec`, the target slots for updates are `r_dec_pricing`, `r_dec_onb`, and `r_dec_next`. The source for `r_dec_pricing` is identified at line 17 of a specific decision document detailing the shift to usage-based pricing. The `r_dec_onb` update stems from another decision document at line 17, focusing on onboarding templates. The last external search decision is located in the archive file.


Examining the available documentation, it appears the decision to postpone the external search API is consiste

</details>

**답변**

원천 저장소의 최신 결정 카드 및 안건을 바탕으로 [결정 표](vdoc:block/rb_dec)에 반영할 2가지 후보안을 제안했습니다.

---

### 반영된 원천 근거
- **요금제**: [Decision 03 — 요금제는 사용량 기반으로 바꾼다](vdoc:resource/file_f6ab4714e3) (L17)  
  *(좌석 기반 요금제 폐기 및 처리 페이지 수 기준 과금 확정)*
- **온보딩**: [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_29714fca72) (L17)  
  *(계약서 · 의견서 · 내부 메모 템플릿 3종 제공 확정)*
- **외부 검색**: [D5 (초안) — 외부 검색 API 도입은 보류한다](vdoc:resource/file_116d9acf40) (L11)  
  *(외부 검색 API 도입은 3월까지 보류 안건 검토 중)*

---

### 후보안 비교 및 선택 기준

1. **1안: 핵심 결정 반영안**
   - **특징**: 원천 결정 문서의 공식 문장을 온전하게 살린 서술형 문장입니다.
   - **추천**: 결정의 맥락과 의미를 명확하고 완전한 문장으로 전달하고자 할 때 적합합니다.

2. **2안: 간결형 요약안**
   - **특징**: 표 레이아웃 가독성에 최적화된 명사형 요약 문구입니다.
   - **추천**: 한눈에 파악하기 쉬운 정돈된 테이블 형태를 선호할 때 적합합니다.

화면의 미리보기 창에서 원하는 안을 확인하고 선택해 주시기 바랍니다.

## FE1-genre-only — FE
> 공공 보고 레퍼런스의 장르 규약만 이 칸에 적용해줘. 내용은 그대로.

- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_metric_body']
- ✅ 45 보존: 2/2안
- ✅ 10 보존: 2/2안
- ✅ 개조식 종결: 1/2안
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → wb_read → wb_patterns → wb_patterns → wb_propose → wb_propose

**읽은 원천**: 없음
- 후보 prop_e2c167a49b ready 2안 restyle · 오류 0 · 경고 1
- 후보 prop_8765ed3ed9 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

The existing `slot:r_metric_body` uses a "평서(~다)" ending style, which contradicts the reference's D6 genre guidelines that prescribe 개조식 or 명사형 종결. The current metric body's sentence structure also isn't as concise as expected based on the D1 genre guidelines. I'll need to update this to match the reference.


Original `slot:r_metric_body` content is a narrative with two sentences.  The target is to transform this into a concise report format, following the D6 genre guidelines that mandate 개조식 or 명사형 종결 and bullet points.  Proposed solutions use "~됨" and bullet points to restructure the content: "- 첫 문서 완성까지 평균 45분 소요됨(측정 인원: 10명)." or "- 측정 결과 첫 문서 완성까지 평균 45분 소요됨. - 측정 인원은 10명임." The HTML format of original content will be retained.


Candidate 2 ("Noun-Ending & Item Integration") appears to be a restyle, with only 44% of the original words in r_metric_body remaining, suggesting significant content change. Candidate 1 perfectly aligns with the reference D6 guideline (distance 0.00) and preserves words effectively. Considering either improving Candidate 2's word preservation while maintaining noun-ending structure or re-proposing Candidate 2 after increasing its word preservation.


The analysis confirmed both candidates, no warnings were reported. Based on the rule, the response should briefly highlight the differences between the options and the selection criteria. Furthermore, provide clickable links for screen locations or cited materials.




</details>

**답변**

[한국데이터진흥원 내부 보고](vdoc:doc/vdoc_eval_ref_public)의 **D6 장르 규약**(개조식 종결어미 및 명사형 종결)을 [지표 해설](vdoc:slot/r_metric_body) 칸에 적용하여 2가지 스타일 변환안을 제안했습니다. 화면 미리보기에서 확인 후 선택하실 수 있습니다.

### 제안된 후보 비교 및 선택 기준

1. **안 1: 개조식 서술형 종결 (`~됨` · `~임`)**
   - **특징**: 공공 보고서의 표준 서술 종결 어미(`~됨`, `~임`)를 적용하여 보고 문서로서의 격식을 갖춤.
   - **선택 기준**: 공공 보고서 양식의 공식적인 서술 형식을 유지하고자 할 때 적합합니다.

2. **안 2: 명사형 종결**
   - **특징**: 서술어를 명사형으로 마감하여 가독성과 정보 전달 밀도를 높임.
   - **선택 기준**: 지표 수치와 요약 정보를 보다 간결하고 직관적으로 전달하고자 할 때 적합합니다.

## FE2-three — FE
> 요약 칸 후보 3개 보여줘.

- ✅ 후보 제안: ready · 3안 · mode=compose · 칸=['r_summary']
- ✅ 후보 간 차이: 층위 조합 3/3 · 최대 유사도 30%
- ✅ 레퍼런스 누출 0: 없음
- ✅ 층위: vdoc_eval_ref_invest:D1 vdoc_eval_ref_invest:D4 vdoc_eval_ref_invest:D6 vdoc_eval_ref_public:D1 vdoc_eval_ref_public:D3 vdoc_eval_ref_public:D6 vdoc_eval_ref_in
- ✅ (가점) 답이 짧다 — 후보는 화면에 (답 785자)

**도구**: wb_read → wb_outline → wb_outline → wb_history → wb_outline → wb_outline → wb_outline → wb_outline → wb_read → wb_read → wb_patterns → wb_patterns → wb_read → wb_patterns → wb_propose

**읽은 원천**: 없음
- 후보 prop_5d886dbfbc ready 3안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial hypothesis: user seeks three candidate summaries, framed as a request to display options. The task involves identifying the appropriate source and role for each action. The workflow will involve checking the target cell's content, reading references, and identifying patterns.


The "onboarding" improvement project involved multiple teams in a large-scale initiative. It focused on fundamentally altering the "user experience" through various experiments. Initial hypotheses compared showing a "template" first versus starting with a blank document. A primary metric was initial document completion time, used as a baseline.


The `wb_propose` function requires a target slot (`r_summary`), a mode (likely "compose"), and candidate proposals. Each candidate needs a title, rationale, layers (referencing specific document sections), sources, and relevant slots. This is how I will now format the information to propose changes. I have confirmed that the goal is to make a document change, which is the overall objective.


Initial candidate proposals will be generated using `wb_propose`, focusing on presenting concrete options in a "Show Don't Tell" style for user selection via a preview. Multiple proposals necessitate diverse structures, layer combinations, and selected content. Each proposal will specify layers (referencing source document sections) and sources (factual origins). Resource constraints limit sourcing to editor slots (`slot:r_dec_onb`, etc.) or `orig:r_summary`, preventing the use of external references. The objective is to extract actual facts from editor content to craft the proposals, such as template presentation, completion time metrics, and future plans.


Candidate proposals will be structured to showcase distinct writing styles. The first proposal uses a concise "core summary" with improvement actions, metrics, and future plans. The second employs a public report style with a structured bullet point format. A third proposal will attempt to restore the original document style while presenting concise summaries.


검증 통과. 답변은 각 안의 차이점과 선택 기준만 간략하게 작성한다.




</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 서로 다른 패턴과 서술 방식을 적용한 후보 3건을 제안했습니다. 화면 미리보기에서 확인하고 원하는 안을 선택하실 수 있습니다.

---

### 후보별 특징 및 선택 기준

1. **1안: 결론 우선 및 핵심 불릿형** ([시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest) 패턴)
   - **특징**: 핵심 결론을 두괄식으로 제시한 후 `개선 방향` / `핵심 성과` / `다음 단계`를 구조화된 불릿 항목으로 정리했습니다.
   - **추천**: 경영진 보고나 외부 공유 등 가독성과 직관적인 성과 전달이 중요할 때 적합합니다.

2. **2안: 공문서 개조식형** ([회의록 표준화 추진 계획](vdoc:doc/vdoc_eval_ref_public) 패턴)
   - **특징**: 표준 공문서 규격(`□ 요약`)과 명료한 개조식 종결어미(`~함`, `~임`)를 적용했습니다.
   - **추천**: 격식 있는 사내 정기 운영 보고나 정형화된 행정 문서 톤앤매너가 필요할 때 권장합니다.

3. **3안: 간결 평서문형** ([초기 원본](vdoc:slot/r_summary) 정제)
   - **특징**: 군더더기 서술을 배제하고 [온보딩 결정](vdoc:slot/r_dec_onb) 및 [지표 표](vdoc:slot/r_metric_table)의 핵심 팩트(45분 단축, 68% 사용률)만 2문장으로 압축했습니다.
   - **추천**: 짧고 자연스러운 줄글 형태로 빠르게 핵심만 기록하고자 할 때 적합합니다.

## FE3-toggle — FE
> 투자 제안서의 D1이랑 D4를 요약 칸에 적용해줘. → D4는 빼고 다시.

- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_summary']
- ✅ D4 제외 · D1 유지: vdoc_eval_ref_invest:D1 vdoc_eval_ref_invest:D1
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → wb_patterns → wb_read → wb_patterns → wb_propose → wb_propose → wb_propose → wb_propose

**읽은 원천**: 없음
- 후보 prop_a0481a4940 ready 2안 restyle · 오류 0 · 경고 2
- 후보 prop_529864dbf5 ready 2안 restyle · 오류 0 · 경고 0
- 후보 prop_e3245152fe ready 2안 restyle · 오류 0 · 경고 1
- 후보 prop_e7934abee6 ready 2안 restyle · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial hypothesis: Locate and summarize the requested sections (D1, D4) of the investment proposal. The provided context indicates that the document itself is not directly accessible; therefore, I must use existing summaries or potentially generate new ones.

I'm thinking through how to approach this.


Initial assessment shows a "D1" reference pattern, indicating high scannability and information density. Paragraphs average 20.4 characters with a maximum of 56, suggesting concise information delivery. Bold text usage is moderate (0.38 per paragraph) alongside bullet points (0.25 ratio), and sentence length is short (17.1 characters). This pattern should inform content generation.


The provided summary framework suggests a clear structure for evaluating the Luminara Labs document automation claims. The core claim is a market leadership prediction within three years. This prediction is supported by the problem of redundant document rewriting, a proposed solution of an integrated editor, and evidence of existing customer traction.


The core problem is redundant document rewriting, stemming from the difficulty in quickly finding and linking evidence. The proposed solution involves an integrated editor that connects evidence and formatting seamlessly. This approach aims to eliminate the repetitive nature of document rewriting by connecting the evidence directly to the editor. I'm thinking through how to approach this.


Applying the D1/D4 restructuring, the summary will emphasize brevity and scan-ability, incorporating bolded key phrases and a conclusion-first SCQA framework. The goal is to retain the original information while improving its presentation. The `wb_propose`'s `slots` value format appears to be HTML.


The `wb_propose` function's `slots` value is explicitly HTML, not plain text, although the initial `wb_read` output was Markdown. Considering the VibeDocStudio editor is Markdown-based, it's possible both formats could be accommodated. To offer variety, two potential summaries are drafted, one a conclusion-first summary, and the other SCQA-based.


The preview passed, but a warning indicates significant original word loss (26%/18%) in the summary. Attempting to preserve more of the original wording could improve the result. Focusing on the original wording, specifically "이번 분기 **온보딩** 개선 작업은 **여러 팀**이 함께 참여한".


**온보딩** 사용자 경험 개선을 위해, **여러 팀** 참여 하에 대규모 프로젝트 진행. **다양한** 시도로 **템플릿** vs 빈 문서 비교, 기준 시간 47분 단축을 **최우선** 목표로 설정.
**여러 지표**에서 변화 확인, 미완료

</details>

**답변**

D4(결론 우선 및 SCQA 서술 프레임워크)를 제외하고, [(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 **D1(스캐너빌리티·정보 밀도)** 패턴만 [요약](vdoc:slot/r_summary) 칸에 적용한 2가지 변경안을 새로 제안했습니다.

원문의 서술 순서와 어휘를 보존하면서, 250자가 넘던 만연체 문장과 무분별한 볼드 강조를 정돈했습니다.

### 후보별 특징 및 선택 기준

1. **후보 1: 간결 단락 분할형 (D1 문장 단축)**
   - **특징**: 서술형 줄글 형식을 유지하되 긴 한 문장을 3개의 짧은 호흡(배경 → 목표 및 시도 → 결과 및 향후 과제)으로 단락을 분할하고, 핵심 수치(47분)에만 선별적으로 볼드를 적용했습니다.
   - **추천**: 보고서 본문의 자연스러운 문장 흐름을 살리면서도 가독성을 높이고자 할 때 적합합니다.

2. **후보 2: 개조식 목록형 (D1 스캐너빌리티)**
   - **특징**: 개요 문장 아래에 목표, 시도 방식, 결과를 불릿 포인트 목록으로 분리하여 레퍼런스의 높은 스캐너빌리티(Bullet ratio)를 직접 구현했습니다.
   - **추천**: 요약 칸의 항목별 내용(목표/시도/결과)을 한눈에 빠르게 파악할 수 있도록 구조화하고자 할 때 적합합니다.

## FE4-gap — FE
> 이 레퍼런스 대비 내 문서에 뭐가 부족해?

- ✅ 층위별 갭 3개 이상: 4/3 (단락|문단, 결론|두괄, 표|수치|숫자, 제목|구조)
- ✅ 측정값 비교: 있음

**도구**: wb_compare → wb_outline → wb_outline → wb_read → wb_read → wb_read → wb_read → wb_read → wb_read → wb_read

**읽은 원천**: 없음

<details><summary>생각</summary>

The initial comparison highlights a lack of specific financial projections within the draft report, a key element present in the reference document. Further examination indicates that the draft lacks a detailed market analysis section. This omission may hinder the report's persuasiveness.


Initial assessment complete. The documents are prepared for comparison and analysis, focusing on information density and scannability across sentence and paragraph structure. The first document is an onboarding improvement report draft, and the second is a Series A investment proposal.


The reference document utilizes short, concise sentences and paragraphs, while the current document features significantly longer sentences and paragraphs with a narrative structure that obscures the core arguments. The reference document leverages bullet points to present key information in a structured manner (problem-solution-evidence-request), contrasting with the current document's unformatted text. The reference prioritizes a conclusion-first structure and uses clear subheadings for information hierarchy, in contrast to the current document's lack of prominent structure.




</details>

**답변**

[2025 Q1 온보딩 개선 운영 보고서 (초안)](vdoc:doc/vdoc_eval_report)를 레퍼런스인 [(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)와 비교·진단한 결과, 다음과 같은 층위별 패턴 차이와 구조적 결함이 나타납니다.

---

### 1. D4 서술 프레임워크: 두괄식 결론과 논증 구조 부재
- **두괄식 전개 (`conclusion_first: false → true`)**: 
  - 레퍼런스는 서두에서 **"결론: ~"** 형태로 핵심 메시지를 한 줄로 선언한 뒤 세부 사항을 전개합니다.
  - 반면 내 문서의 [요약](vdoc:slot/r_summary)은 배경과 작업 경과부터 나열하는 미괄식 구조로 작성되어 있어 전달력이 약합니다.
- **논증 위계 (`headings: 1 → 5`)**:
  - 레퍼런스는 상황-문제-질문-해답(SCQA) 형태의 소제목(H2)으로 논리를 단계별로 전개합니다.
  - 내 문서는 소제목 위계가 없어 문맥 전환이 뚜렷하지 않습니다.

### 2. D1 정보 밀도 및 스캐너빌리티: 긴 호흡과 줄글 나열
- **문장·단락 호흡 과다 (`avg_sentence_chars: 32.2자 → 17.1자`)**:
  - 레퍼런스는 단락 평균 20.4자, 최대 56자로 호흡이 매우 짧고 즉각 읽힙니다.
  - 내 문서는 [요약](vdoc:slot/r_summary)의 한 문장이 253자에 달하는 등 만연체 줄글로 이어져 있습니다.
- **구조화 부족 (`bullet_ratio: 0.0 → 0.25`)**:
  - 레퍼런스는 핵심 포인트(문제, 해법, 증거, 요청)를 개조식(Bullet)으로 정리해 가독성을 높인 반면, 내 문서는 불릿 활용 없이 평문으로 나열되어 스캔하기 어렵습니다.

### 3. D2 데이터 증명 방식: 구체적 수치 및 출처 표기 미흡
- **정량 데이터 밀도 (`numbers_per_100: 1.34 → 4.03`)**:
  - 레퍼런스 대비 수치 기반의 증명 밀도가 3배가량 낮습니다.
- **출처 명시 (`source_marks: 0 → 1`)**:
  - 레퍼런스는 표 하단에 `(출처: 2024 시장조사)`와 같이 데이터 산출 근거를 밝혔으나, 내 문서의 [지표 표](vdoc:slot/r_metric_table) 및 본문에는 출처 표기가 없어 **'근거없음'** 상태로 남아 있습니다.
  - [지표 표](vdoc:slot/r_metric_table)(47분)와 [지표 해설](vdoc:slot/r_metric_body)(45분) 간의 수치 불일치도 존재합니다.

### 4. 작업대 검증 결함 (완결성)
- **빈칸 2건**: [문서 정보](vdoc:slot/r_meta), [다음 결정](vdoc:slot/r_dec_next)이 작성되지 않은 채 비어 있습니다.
- **분량 초과 1건**: [지표 주석](vdoc:slot/r_metric_note)이 권장 길이를 초과(134자 / 80자)했습니다.

---

> **개선 방향 권장**
> 1. [요약](vdoc:slot/r_summary)을 **두괄식 결론 + 3~4개 개조식 불릿** 형태로 압축 재구성
> 2. 비어 있는 [문서 정보](vdoc:slot/r_meta) 및 [다음 결정](vdoc:slot/r_dec_next) 칸 보완
> 3. [지표 표](vdoc:slot/r_metric_table)와 해설의 수치 정합성을 맞추고 데이터 출처 표기 추가

## FE5-template — FE
> 이 레퍼런스처럼 문서 정보랑 결재란 만들어줘.

- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_meta']
- ✅ 구조 생성: 2/2안
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_outline → wb_read → wb_patterns → wb_read → wb_read → wb_history → wb_propose

**읽은 원천**: 없음
- 후보 prop_79af412901 ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

Initial assessment: User requests a document structure mirroring a provided reference, specifically including document information and an approval section. The system needs to analyze the reference as a pattern for formatting and structure. The target location for modification needs to be identified.

The reference serves as a structural template. Need to identify the appropriate slot or block within the editor to implement the requested changes. The revision history indicates this is an ongoing process.


Initial analysis indicates the `slot:r_meta` for document metadata is empty within the `block:rb_meta`. Other slots are marked as out-of-range, except `slot:r_title` which has a fixed title, and `slot:r_summary` containing a summary. The document metadata (`slot:r_next_owner`) appears on page p4, specifying a PM.


The document requires specific metadata fields: document number, approval status. Genre dictates a noun-form conclusion. References follow a defined pattern including document number, date, department, security level, and approval chain. Analyzing references reveals patterns across layers, which encompass information density, proof methods, and stylistic conventions.


Analyzing how to adapt reference patterns to the target document. The structure of the pattern (components, order, format) will be mapped onto the facts of the document. If a component lacks a corresponding fact, it will be marked as "none," avoiding the use of irrelevant reference details. Suggestions for document changes will be presented via `wb_propose`, offering candidate options for user selection through preview. Verification will assess scope, length, reference leaks, source validation, content preservation, and candidate diversity; the result will indicate mode (compose, restyle, restore) and candidate details (title, rationale, layers, sources, slots). Document facts include the title ("2025 Q1 온보딩 개선 운영 보고서"), the owner ("PM 서민규") and the absence of any mounted resources. Reference leak checks will identify and flag any inclusion of specific references or proper nouns from source materials.


Initial hypothesis: Construct a proposal targeting `slot:r_meta` using the `compose` mode. The summary should describe incorporating the D3 pattern from a specific reference document into document information and approval sections.

The proposal requires candidate options, each with a title, rationale, and specified layers, including a particular document identifier related to th

</details>

**답변**

[한국데이터진흥원 내부 보고](vdoc:doc/vdoc_eval_ref_public)의 [문서 정보 · 결재란](vdoc:ref-pin/pinB1) 핀에 나타난 **D3(격식·메타 규격)** 패턴을 추상화하여 [문서 정보](vdoc:slot/r_meta) 칸에 적용할 후보 2안을 제안했습니다. 

사실 근거로는 현재 문서의 [문서 제목](vdoc:slot/r_title)과 [담당](vdoc:slot/r_next_owner)(PM 서민규)을 반영하였으며, 레퍼런스의 고유명사나 임의 수치는 배제했습니다.

---

### 제안 안별 차이 및 선택 기준

1. **1안: 3단 결재선 표준형**
   - **구조**: 메타 정보(문서번호, 보고일자, 작성자, 보안등급) + 3단계 결재선(`담당 | 검토 | 승인`)
   - **선택 기준**: 공공/기관 내부 보고 규격에 맞춰 정식 결재 절차가 필요한 경우 권장합니다.

2. **2안: 간소화 결재형**
   - **구조**: 핵심 메타 정보(보고서명, 담당자) + 2단계 결재선(`담당 | 승인`)
   - **선택 기준**: 빠른 의사결정 및 가벼운 내부 운영 공유용으로 간결한 배치가 필요할 때 적합합니다.

화면의 제안 카드 미리보기에서 원하시는 안을 검토 후 선택해 주세요.

## RF1-frame — RF
> 회의 결정들을 이 제안서의 논리 순서로 다시 짜면 어떻게 될까?

- ✅ 프레임 명시: 있음
- ✅ 원천 사실 매핑: 있음
- ✅ 레퍼런스 사실 미사용: 있음

**도구**: wb_outline → wb_read → wb_read → ws_collect → read_file → read_file → read_file → read_file → read_file → ws_glob → read_file → read_file

**읽은 원천**: D5_외부_검색_API_도입은_보류한다_초안.md, Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, 근거_온보딩 실측 기준선.md

<details><summary>생각</summary>

Reference material defines the "pattern" or logical sequence/structure, which should guide the reorganization of the meeting decisions. The current focus is to determine how to restructure these decisions according to the proposal's logical sequence. The reference document needs to be examined first to understand this pattern.


Analyzing the provided reference's logical structure, it appears to follow a SCQA framework: Situation, Complication, Question, and Answer. The initial section presents the ultimate goal and direction as an Executive Summary. The framework's core, SCQA, is designed to progressively define a problem and its potential solution.


` — 요금제는 사용량 기반으로 간다 (v1).md` (file_529e710b77) - 이전 의사결정(D01)을 대체
5. `discussions/25.02.03/decisions/Decision 01 — 온보딩 자료는 문서 형태로 제공한다.md` (file_7e05869a03)
6. `discussions/25.02.10/decisions/Decision 01 — 자동 요금 청구는 Stripe를 사용한다.md` (file_e7351608c0)

The list includes six items, but only five unique decision files. Noted that the third decision file is marked as replaced, confirmed by the presence of a later replacement decision.


Checked all decision cards and rationale files. Identified five primary decision card targets (including a replaced v1) and four valid decisions:
1. Decision 01: Search starts with a local index (BM25) instead of an external service.
2. Decision 02: Initial pilot customer group is narrowed to a single in-house legal team.
3. Decision


Identified the goal of the pilot program: successfully implement the in-house legal team, reduce onboarding time by half, and validate a usage-based business model. Determined the key problems: security concerns regarding customer documents, the unsuitability of the seat-based pricing model due to significant variations in team processing volume, and lengthy initial document creation times for new customers. Proposed solutions: build a local index (BM25) search engine and standardize onboarding.


Observed the need for three template types and a usage-based billing model, supported by data from the legal team pilot that shows a 10x processing variation. Identified an average onboarding baseline of 47 minutes (n=12). Determined that the billing invoice should be issued based on February usage, with a target of first document completion in under 23.5 minutes. Defined the SCQA structure: focusing on an in-house legal team for easier performance measurement due to standardized document formats. Security requirements prevent external document transfer.

</details>

**답변**

레퍼런스인 [(주)루미나랩스 시리즈A 투자 제안서](vdoc:doc/ref:vdoc_eval_ref_invest)의 논리 전개 패턴(**요약 → SCQA 논리 → 실측 지표 → 실행 가이드라인**)을 바탕으로, 회의에서 확정된 결정 사항들을 재구성한 논리 구조는 다음과 같습니다.

---

### 1. 요약 (Executive Summary)
* **결론**: 사내 법무팀 파일럿을 통해 로컬 색인 기반 검색과 템플릿 3종을 검증하고, 페이지 단위 사용량 과금 체계로 전환하여 첫 문서 완성 시간을 절반으로 단축한다.
* **문제**:
  * 고객 문서를 외부로 전송할 수 없는 보안 요구 ([Decision 01](vdoc:resource/file_1b8fa2e3c2) L21)
  * 좌석 기반 요금제로는 대응하기 힘든 큰 처리량 편차(10배 이상) ([Decision 03](vdoc:resource/file_f6ab4714e3) L21)
  * 긴 초기 문서 완성 소요 시간(평균 47분) ([Decision 04](vdoc:resource/file_29714fca72) L21)
* **해법**: 로컬 색인(BM25) 도입, 페이지 단위 과금제 전환, 표준 템플릿 3종 온보딩.
* **증거**: 법무팀 파일럿 처리량 편차 실측, 온보딩 실측 기준선 47분(n=12).
* **목표(DoD)**: 첫 문서 완성 시간 23.5분 이하 달성 및 2월 사용량 기준 청구서 정상 발행.

---

### 2. SCQA 논리 구조 (Logic Flow)

* **상황 (Situation)**
  * 초기 성과 측정이 용이하도록 문서 양식이 정형화된 **사내 법무팀 1곳**을 첫 파일럿 고객군으로 확정함 ([Decision 02](vdoc:resource/file_caeba56ff3) L17-21).

* **문제 (Complication)**
  * **보안 제약**: 고객 문서를 외부 서비스로 전송할 수 없음 ([Decision 01](vdoc:resource/file_1b8fa2e3c2) L21).
  * **과금 불일치**: 파일럿 결과 팀원 좌석 수 대비 처리량 편차가 10배 이상 발생해 기존 좌석 기반 과금이 부적합함 ([Decision 01 (v1)](vdoc:resource/file_9355258cfa) L17, [Decision 03](vdoc:resource/file_f6ab4714e3) L17-21).
  * **온보딩 지연**: 신규 고객이 첫 문서를 완성하는 데 평균 47분이 소요됨 ([온보딩 실측 기준선](vdoc:resource/file_32750aec7c) L7-8).

* **질문 (Question)**
  * 외부 유출 없는 안전한 환경에서, 신규 고객의 초기 작성 장벽을 낮추고 실제 문서 처리량에 부합하는 요금 체계를 어떻게 구축할 것인가?

* **해답 (Answer)**
  * **로컬 검색**: 외부 API 대신 로컬 색인(BM25)으로 검색 엔진 구현 ([Decision 01](vdoc:resource/file_1b8fa2e3c2) L17).
  * **표준 온보딩**: 계약서 · 의견서 · 내부 메모 템플릿 3종을 제공하여 초기 진입 장벽 해소 ([Decision 04](vdoc:resource/file_29714fca72) L17).
  * **사용량 과금 전환**: 좌석 기반 모델을 폐기하고 처리 페이지 수 기준 과금 모델 도입 ([Decision 03](vdoc:resource/file_f6ab4714e3) L17).

---

### 3. 실측 지표 및 기준선 (Metrics & Baseline)

제안서의 지표 테이블 패턴([ref:vdoc_eval_ref_invest#slot:a_market](vdoc:slot/ref:vdoc_eval_ref_invest#slot:a_market))에 맞춘 실측 데이터입니다.

| 지표 | 실측값 / 기준선 | 근거 출처 |
| :--- | :--- | :--- |
| **초기 타깃 고객** | 사내 법무팀 1곳 | [Decision 02](vdoc:resource/file_caeba56ff3) L17 |
| **검색 엔진 방식** | 로컬 색인 (BM25) | [Decision 01](vdoc:resource/file_1b8fa2e3c2) L17 |
| **온보딩 작성 소요 시간** | 평균 **47분** (최소 21분 · 최대 95분, n=12) | [온보딩 실측 기준선](vdoc:resource/file_32750aec7c) L7-9 |
| **파일럿 처리량 편차** | 좌석 대비 **10배 이상** | [Decision 03](vdoc:resource/file_f6ab4714e3) L21 |
| **표준 온보딩 템플릿** | 3종 (계약서 · 의견서 · 내부 메모) | [Decision 04](vdoc:resource/file_29714fca72) L17 |

---

### 4. 실행 가이드라인 및 목표 (Execution & Boundaries)

제안서의 요청/실행 패턴([ref:vdoc_eval_ref_inve

## RF2-proof — RF
> 이 레퍼런스처럼 표로 숫자를 증명하려면 리서치 자료에 쓸 데이터가 있어?

- ✅ 있는 데이터: 있음
- ❌ 없는 데이터 구분: 없음
- ✅ 다른 기간 수치(210%)는 빼거나 시점 명시: 있음

**도구**: wb_outline → ws_tree → wb_read → read_file → read_file → read_file → read_file → read_file → read_file

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md

<details><summary>생각</summary>

레퍼런스가 표로 숫자를 증명하는 방식이므로, 리서치 자료 내 데이터 유무와 내용을 확인해야 한다. 편집 도구는 필요하지 않으며, 최종 산출물은 데이터 유무와 매핑에 대한 분석 답변이다.


Analyzing the provided reference and resource content. The reference presents key quantitative metrics in a two-column table format (metric | value).  Values within the reference are illustrative only and should not be directly incorporated.


The "3월 지표 요약" resource provides the necessary data, structured as "metric | value" pairs, suitable for a table format like the reference. This resource includes: WAU (1,450 users), template usage rate (68%), and average time to first document completion (31 minutes). The 1,200 WAU figure in the "A사 인터뷰" is an estimate, while the 1,450 WAU is from definitive product logs.




</details>

**답변**

네, 레퍼런스의 조판 패턴(`지표 | 값` 2열 표)을 그대로 적용할 수 있는 검증된 정량 데이터가 리서치 자료에 있습니다.

---

### 1. 레퍼런스 패턴 요약
* **참조 슬롯**: [시장](vdoc:slot/a_market) (p3)
* **표현 구조**: 핵심 성과 지표와 수치를 2열 표(`지표 | 값`)로 간결하게 제시하고 하단에 출처/기준 명시

---

### 2. 리서치 자료 내 활용 가능한 데이터

가장 직접적으로 대응되는 원천 데이터는 **[3월 지표 요약](vdoc:resource/file_ca01d6d352)** (L7-13)에 정리되어 있습니다:

| 지표 | 값 | 비고 / 출처 |
|---|---|---|
| **WAU (주간 활성 사용자)** | 1,450명 | [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L9, L13) ※ 제품 로그 기준(3월 3주) |
| **템플릿 사용률** | 68% | [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L10) |
| **첫 문서 완성 평균** | 31분 | [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L11) |

> [!NOTE]
> [A사 인터뷰](vdoc:resource/file_424d917afe) (L7)에 언급된 WAU 1,200명은 2월 구두 추정치이므로, 최종 제품 로그 기준인 **1,450명**을 사용하는 것이 정확합니다.

#### 추가 활용 가능한 수치
* **연간 사용자 성장률**: 210% — [보고서 요약 (원래본)](vdoc:resource/file_62220c4596) (L3, 작년 연간 보고서 기준)
* **문제 해결 전 불편 시간**: 결정 검색에 20분 이상 소요 — [A사 인터뷰](vdoc:resource/file_424d917afe) (L8)

---

### 3. 레퍼런스 형식 적용 예시

```markdown
| 지표 | 값 |
|---|---|
| WAU | 1,450명 |
| 템플릿 사용률 | 68% |
| 첫 문서 완성 평균 | 31분 |
(출처: 2025년 3월 제품 로그 지표 요약)
```

위 데이터를 바탕으로 에디터의 특정 슬롯에 반영하거나 후보 제안이 필요하시면 말씀해 주세요.

## RFE1-draft — RFE
> 투자 제안서의 논리 틀(D4)과 공공 보고의 조판(D5)으로, 회의 결정 카드를 근거로 요약 초안 만들어줘.

- ✅ 후보 제안: ready · 2안 · mode=compose · 칸=['r_summary']
- ✅ A의 D4 + B의 D5: vdoc_eval_ref_invest:D4 vdoc_eval_ref_public:D5 vdoc_eval_ref_invest:D4 vdoc_eval_ref_public:D5
- ✅ 레퍼런스 누출 0: 없음
- ❌ 결정 카드 읽음: 0건

**도구**: wb_read → wb_patterns → wb_patterns → ws_collect → wb_read → wb_read → ws_grep → read_file → read_file → read_file → read_file → read_file → wb_outline → wb_history → wb_propose

**읽은 원천**: Decision 01 — 검색은 로컬 색인으로 시작한다.md, Decision 02 — 첫 고객은 법무팀으로 좁힌다.md, Decision 03 — 요금제는 사용량 기반으로 바꾼다.md, Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md, 근거_온보딩 실측 기준선.md
- 후보 prop_581fd2c3fe ready 2안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

The task involves synthesizing a proposal (wb_propose) based on a selected cell (`r_summary`), drawing upon a defined logical framework from an investment document (`ref:vdoc_eval_ref_invest`) and formatting from a public report (`ref:vdoc_eval_ref_public`). The supporting factual basis will come from meeting decision cards (clustering on "decision card" or relevant files). The goal is to generate a candidate proposal by invoking `wb_propose` because the request is to modify a document.


Initial investigation focuses on the logical structure of the investment proposal, specifically the document's framework (D4). It appears to use either the SCQA structure (Situation, Complication, Question, Answer) or a conclusion-first approach, presenting the conclusion, problem, solution, evidence, and request. Identifying the specific structure used in the document is key.


온보딩 개선은 여러 팀이 참여한 대규모 프로젝트로, 사용자 경험 개선을 위해 다양한 방식을 시도했다. 템플릿 선제시와 빈 문서 시작 방식을 비교하여, 첫 문서 완성 시간 단축을 최우선 목표로 설정했다.


온보딩 개선 실험의 결과를 분석 중이며, 아직 측정되지 않은 지표가 있어 추가 검증이 필요하다.

요청 사항은 투자 제안서 논리 틀과 공공 보고 조판을 준수하여 회의 결정 사항을 요약하는 초안을 작성하는 것이다. 투자 제안서의 D4 프레임워크는 SCQA 또는 결론-문제-해법-증거/DoD/실행 형식을 사용하며, 공공 보고의 D5 조판은 개조식 목록, 명확한 단락 구분, 간결한 문장, 불릿 형태를 활용한다. 회의 결정 카드가 사실 근거로 활용될 것이다.


초기 온보딩 템플릿 제작을 위한 정보 수집을 시작했다. 법무팀을 대상으로 한 파일럿 프로그램의 성공 여부가 중요 지표가 될 것으로 보인다. 현재 측정된 기준선은 첫 문서 완성까지 평균 47분으로, 목표는 이 시간을 절반으로 줄이는 것이다. 요금제 변경 관련 의사 결정은 문서 처리량 기반으로 전환되었으며, 로컬 검색 엔진을 첫 버전으로 채택하기로 결정했다.


Initial assessment: The task involves reviewing a previous version and the validation rules for a specific function. The goal is to generate outputs based on different modes (compose, restyle, restore) and provide candidate results. The validation rules appear to cover several aspects, including scope, length, reference leaks, and content preservation.


Examining the `sources` notation, the structure seems to link specific lines within resource files.  Numbers within sentences must originate from these `sources`, avoiding external references. Considering output generation, I'll structure candidate results using defined logic frameworks (D4, D5) to offer options to the user. Two potential candidates emerge: one based on a conclusion-first structure with public report formatting, and the other using a SCQA structure with itemized bullets.


Candidate results are generated using HTML tags, structuring each candidate as `<p>` for introduction and `<ul>` with `<li>` for detailed bullet points. The first candidate presents a conclusion-firs

</details>

**답변**

[요약](vdoc:slot/r_summary) 칸에 대해 [투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 **논리 틀(D4)**과 [공공 보고](vdoc:doc/vdoc_eval_ref_public)의 **조판(D5)**을 적용하고, [Decision 04 — 온보딩은 템플릿 3종으로 시작한다](vdoc:resource/file_29714fca72) (L14-27), [온보딩 실측 기준선](vdoc:resource/file_32750aec7c) (L7-9), [Decision 02 — 첫 고객은 법무팀으로 좁힌다](vdoc:resource/file_caeba56ff3) (L14-22)의 사실을 근거로 2가지 후보안을 제안했습니다. 화면 미리보기에서 바로 확인하고 선택하실 수 있습니다.

---

### 후보안 비교 및 선택 기준

- **1안: 결론 우선형 요약 (결론-문제-해법-기준선)**
  - **특징**: 핵심 결론을 두괄식으로 가장 먼저 제시하고, `문제 → 해법 → 목표(DoD) → 실행 기준` 순서로 전개합니다.
  - **추천**: 의사결정권자나 경영진 대상 보고 등 핵심 성과와 실행 범위를 즉시 전달해야 할 때 적합합니다.

- **2안: SCQA 프레임워크형 요약 (상황-문제-질문-해답)**
  - **특징**: 파일럿 배경(`상황`)부터 기준선 소요 시간(`문제`), 핵심 해결 과제(`질문`), 템플릿 3종 집중 공급(`해답`)으로 논리적 흐름을 차례대로 전개합니다.
  - **추천**: 문제 발생 원인과 해결책 도입의 필연성을 단계적으로 납득시켜야 하는 내부 운영 공유에 적합합니다.

## RFE-P-three — RFE
> 이 레퍼런스의 핀 영역을 참고해서 research 폴더에서 적절한 내용을 추려, 요약 칸에 어떻게 정리하면 좋을지 3안으로 제시해봐.

- ✅ 후보 제안: ready · 3안 · mode=compose · 칸=['r_summary']
- ✅ 후보 간 차이: 층위 조합 3/3 · 최대 유사도 27%
- ✅ 레퍼런스 누출 0: 없음
- ✅ 리서치 원천 읽음: 6건
- ✅ 핀 내용 미복사: 없음
- ✅ (가점) 답이 짧다 — 후보는 화면에 (답 968자)

**도구**: wb_read → wb_read → wb_patterns → ws_tree → read_file → read_file → read_file → read_file → read_file → read_file → wb_propose → wb_propose

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md
- 후보 prop_192fd7a448 ready 3안 compose · 오류 0 · 경고 2
- 후보 prop_36da66f1d9 ready 3안 compose · 오류 0 · 경고 0

<details><summary>생각</summary>

레퍼런스(핀 영역)를 바탕으로 리소스(research 폴더)에서 정보를 추출하여, 에디터(r_summary)에 3가지 요약 후보를 제시할 계획이다. 먼저 research 폴더의 파일들을 검토하여 핀 영역과 관련된 내용이 있는지 확인해야 한다. 각 파일에서 핀 영역과 관련된 핵심 정보를 식별하고, 요약하여 3가지 다른 방식으로 r_summary에 제시할 수 있도록 준비할 것이다.


The file count is very low (6 files) with very short content (3-13 lines). The content of each file will be read using the file reading function. Initial path validation will verify the following paths:
1. `C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/wb/vault_beta/research/archive/보고서_요약_원래본.md`
2. `C:/AI_Projects/WebNovelAssistant/VibeDocStudio/apps/api/state/evals/wb/vault_beta/research/interviews/2025-02-03_인터뷰_A사.md`
3. `C:/AI_Projects/Web`


Synthesizing the complete file content, considering the original summary slot, research facts, and the reference document. The initial summary focuses on "onboarding" improvements as a large multi-team project, emphasizing "user experience" with "various" attempts. Now, integrating the complete context to refine the overall narrative.


Initial focus was on reducing the initial document creation time from a baseline of 47 minutes. Multiple metrics showed improvement, particularly a 16-minute reduction to 31 minutes for the first document completion. Further validation is required next quarter as some metrics are still being tracked.


Focusing on refining the `r_summary` for the Q1 onboarding improvement report. Initial focus on addressing the 47-minute document creation time, now identifying that finding decisions after meetings consumed over 20 minutes, leading to the idea of a template. The structure will follow a two-part approach focusing on problems/background, and then solutions/execution with metrics.


Template-first onboarding approach and improved user experience are the proposed solutions. The primary evidence includes a reduction in initial document completion time to 31 minutes (a 16-minute decrease), a 68% template adoption rate, and 1,450 weekly active users (WAU). Further actions involve refining the execution assignment feature and validating additional metrics.


Focusing on refining the onboarding summary with a four-part structure: conclusion, problem, solution, and evidence. The objective is to highlight the 31-minute reduction in first document completion time and 68% template adoption, while also acknowledging the need to address execution assignment. The draft summary will be tested against other candidates with varying information density patterns.


The

</details>

**답변**

레퍼런스 [요약 상자](vdoc:ref-pin/pinA1)의 4단 구조(두괄식 결론 + 개조식 라벨형 요약) 패턴을 바탕으로, `research` 폴더의 사실 자료([3월 지표 요약](vdoc:resource/file_ca01d6d352), [A사 인터뷰](vdoc:resource/file_424d917afe), [B사 인터뷰](vdoc:resource/file_698d94bf09))를 반영하여 [요약](vdoc:slot/r_summary) 칸을 위한 3개 후보안을 제안했습니다.

---

### 후보별 특징 및 선택 기준

1. **안 1: 레퍼런스 프레임워크 직결형 (`결론 · 문제 · 해법 · 증거 · 과제`)**
   - **특징**: 레퍼런스 핀의 구조를 그대로 계승하여 기존 기준선(47분 소요)과 개선 후 성과(31분, 68%)의 인과관계를 명확하게 대조합니다.
   - **추천**: 보고서 초두에서 온보딩 개편 전후의 문제 해결 흐름을 한눈에 전달하고자 할 때 적합합니다.

2. **안 2: 정량 지표 중심형 (`핵심 수치 브레이크다운`)**
   - **특징**: 서술을 최소화하고 첫 문서 완성 시간(31분), 템플릿 사용률(68%), 제품 로그 기준 WAU(1,450명) 등 핵심 숫자를 항목별로 강조합니다.
   - **추천**: 정량적 운영 성과와 활성화 지표를 경영진이나 이해관계자에게 신속히 공유해야 할 때 적합합니다.

3. **안 3: 운영 맥락 및 과제 중심형 (`정성 피드백 · 정량 결합`)**
   - **특징**: 수치 성과와 함께 사용자 인터뷰에서 수집된 불편 사항(결정 탐색 20분 소요)과 운영 보완점(실행 담당자 지정 누락 방지)을 균형 있게 다룹니다.
   - **추천**: 단순 수치 보고를 넘어 향후 개선 방향과 제품 실행 과제 도출이 중요한 운영 리뷰에 적합합니다.

화면의 미리보기 패널에서 각 안의 형태를 확인하신 후 원하는 버전을 선택해 적용하실 수 있습니다.

## RFE3-swap — RFE
> 투자 제안서 D1 스타일로 이 칸 다듬어줘. 내용은 그대로. → 레퍼런스를 공공 보고로 바꿔서 다시 적용해줘.

- ✅ 후보 제안: ready · 3안 · mode=restyle · 칸=['r_metric_body']
- ✅ 공공 보고로 교체: vdoc_eval_ref_public:D1 vdoc_eval_ref_public:D6 vdoc_eval_ref_public:D1 vdoc_eval_ref_public:D6 vdoc_eval_ref_public:D1 vdoc_eval_ref_public:D6
- ✅ 45 보존: 3/3안
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_read → wb_read → wb_patterns → wb_propose → wb_read → wb_patterns → wb_propose

**읽은 원천**: 없음
- 후보 prop_10b6c8e707 ready 3안 restyle · 오류 0 · 경고 2
- 후보 prop_8b8d3d1b2e ready 3안 restyle · 오류 0 · 경고 1

<details><summary>생각</summary>

Initial assessment: User wants to reformat a selected text block (`r_metric_body`) to match a specified style ("D1") from a reference document (`ref:vdoc_eval_ref_invest`). The core content must be preserved, indicating a style transfer operation rather than content modification. The instruction "내용은 그대로" dictates a `restyle` mode.


The document's structure needs to be evaluated for scannability and information density. Average paragraph length is 20.4 characters with a maximum of 56 characters, and long paragraph ratio is 0.0. The use of bold text per paragraph is 0.38, and bullet usage is 0.25, indicating potential for concise sentences and bolded lead-in keywords or key values.


The initial assessment points to restructuring the metric data into a D1-style format for the investment proposal. The objective is to enhance scannability and information density using bolding and concise bullet points. Two alternative approaches are considered for presenting the metric data: a bulleted format with a bold lead-in, and another using a more elaborate construction that uses two sentences.


The third option for the restyle mode has passed verification and renders in the user's preview. The response should now concisely detail the differences between the options and the selection criteria. The differences and criteria will be the focus of this update.


Analysis reveals a distinct style in the public document reference. The first document shows minimal bolding and frequent use of bullet points and special symbols, along with relatively short sentences. The second document demonstrates a preference for ending sentences with nominal forms or administrative-style endings like "~함", "~임", or "~소요됨", rather than declarative sentences.


Analyzing potential restyling options based on public document reference. Multiple candidates are under consideration, including bulleted lists with administrative endings, the use of public report symbols with nominal phrase endings, and single-sentence summaries. The goal is to preserve the original meaning while adhering to the specified style guidelines.




</details>

**답변**

[지표 해설](vdoc:slot/r_metric_body) 칸에 [한국데이터진흥원 내부 보고](vdoc:doc/vdoc_eval_ref_public)의 **D1(개조식 불릿 중심 구성)** 및 **D6(행정 공공문 종결어미: ~됨·~임·명사형)** 패턴을 적용한 3가지 변경안을 새로 제안했습니다.

화면의 미리보기에서 확인하고 원하시는 스타일을 선택하실 수 있습니다.

---

### 후보별 차이 및 선택 기준

1. **1안: 표준 개조식 불릿형 (~됨·~임)**
   - **특징**: 공공 보고서의 전형적인 하위 불릿 구조와 행정 종결어미(`~소요됨`, `~10명임`)를 적용했습니다.
   - **추천**: 기관 보고서나 공식 업무 보고의 표준 개조식 서식을 원하실 때 가장 적합합니다.

2. **2안: 항목 분리 명사형 종결형**
   - **특징**: 괄호 머리말(`(소요 시간)`, `(측정 대상)`)로 항목을 명확히 구분하고 군더더기 없는 명사형으로 종결했습니다.
   - **추천**: 현황 브리핑이나 요약 카드처럼 항목별 핵심 사실을 빠르게 전달하고자 할 때 적합합니다.

3. **3안: 단일문 종합 보고형**
   - **특징**: 문장 분리 없이 하나의 완성된 문장으로 종합 보고체(`~확인됨`)를 적용했습니다.
   - **추천**: 불릿 분할 없이 본문 단락 내에서 차분한 행정체 서술을 유지하고자 할 때 추천합니다.

## RFEH-restore-restyle — RFE
> 원래대로 되돌려줘. → 그 원래 글을 공공 보고 스타일로 다시 써줘.

- ✅ 후보 제안: ready · 2안 · mode=restyle · 칸=['r_summary']
- ✅ 원래 글의 47분 보존: 2/2안
- ✅ 원래 글 내용: 2/2안
- ✅ 이력 사용: wb_history, wb_read, wb_read
- ✅ 레퍼런스 누출 0: 없음

**도구**: wb_history → wb_read → wb_propose → wb_read → wb_patterns → wb_propose

**읽은 원천**: 없음
- 후보 prop_ead552b7f5 ready 1안 restore · 오류 0 · 경고 0
- 후보 prop_b6c152fd41 ready 2안 restyle · 오류 0 · 경고 2

<details><summary>생각</summary>

The revision history shows a significant change in the r_summary field. The earlier summary highlighted the effectiveness of template-first onboarding, specifically a reduction in the initial document creation time. The updated summary suggests a much broader scope, describing a collaborative, large-scale project aimed at fundamentally improving the user experience during onboarding.


The initial assessment highlights that providing templates significantly reduced the first document completion time. The core improvement focuses on template-first onboarding. If a user requests a change to the document, the system should use a proposal rather than a verbal description; the user chooses from a screen preview. Format changes use "restyle" mode, and reverting uses "restore" mode with the historical content. The target is "slot:r_summary".


Initial hypothesis: The task requires re-writing the original text to match a "public report" style, while preserving factual content. The target is the `r_summary` field, with the original text as the factual history (`orig:r_summary`), and the output to be a proposal to the workbook (`wb_propose`). The reference document for the style is `ref:vdoc_eval`.


The reference exhibits a specific summarization pattern. Observed characteristics include a bulleted format, employing noun-based sentence endings like "~함.", "~임.", and "~추진.", alongside a concise and clear structure. These are key aspects of the reference style.


The core of the onboarding improvement focuses on prioritizing template provision. Initial document completion time significantly decreased from a baseline of 47 minutes. The facts from the original summary are maintained.


The warning indicates a significant transformation of the text. It flags that only 7% of the original content in the 'r_summary' field remains after the restyling process. This suggests the content has been substantially altered during the requested conversion to a public reporting style. This requires careful review to ensure the intended meaning and information from the original long-form text (rev 3 of 'r_summary') are preserved in the shorter public-style version.




</details>

**답변**

[요약](vdoc:slot/r_summary) 칸의 원래 사실(`orig:r_summary`)을 바탕으로 [한국데이터진흥원 내부 보고](vdoc:doc/vdoc_eval_ref_public)의 공공 보고 스타일(개조식 목록 및 종결어미)을 적용한 2가지 안을 제안했습니다.

### 후보안 비교 및 선택 기준

1. **1안 (개조식 보고 스타일 - 표준)**
   - **특징**: 핵심 문장을 불릿(`-`)과 개조식 종결어미(`~추진`, `~단축함`)로 간결하게 정리했습니다.
   - **선택 기준**: 공공 표준 양식처럼 군더더기 없는 직접적인 요약을 원할 때 적합합니다.

2. **2안 (항목 분류형 개조식 스타일)**
   - **특징**: `(추진 내용)`, `(주요 성과)` 등 괄호 머리말을 두어 맥락을 구분했습니다.
   - **선택 기준**: 추진 배경/내용과 성과 수치를 명확히 나누어 보고하고자 할 때 적합합니다.

화면 미리보기에서 원하시는 안을 확인하고 선택해 주세요.