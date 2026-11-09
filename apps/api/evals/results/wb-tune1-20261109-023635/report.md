# 작업대 평가 — wb-tune1

전체 0/2 · 튜닝 세트 0/2 · 보류 세트 0/0

| 시나리오 | 영역 | 통과 | 점수 | 시간 | 입력/캐시/출력 | 도구 | 후보 |
|---|---|---|---|---|---|---|---|
| F5-fit | F | ❌ | 2/3 | 31.1s | 23,493/33,267/2,035 | 2 | - |
| RF2-proof | RF | ❌ | 2/3 | 33.9s | 28,734/61,148/2,731 | 8 | - |

## F5-fit — F
> 이 블로그 글을 레퍼런스로 해서 지금 보고서를 다듬으려고 해. 괜찮을까?

- ✅ 장르 불일치 경고: 있음
- ✅ 안 맞는 층위 지목: 있음
- ❌ 쓸 수 있는 층위 제안: 없음

**도구**: wb_compare → wb_read

**읽은 원천**: 없음

<details><summary>생각</summary>

레퍼런스(블로그 글)가 2025년 1분기 온보딩 개선 운영 보고서 초안을 다듬는 데 유용한 패턴 및 사실을 제공할 수 있는지 평가가 필요하다. 이 프로세스는 에디터(보고서 초안)를 분석하고, 레퍼런스(블로그 글)를 통해 얻은 진단 및 조언을 적용하는 것을 포함한다.


The comparison highlights a significant discrepancy in tone and style. The current editor document adopts a formal, business report style characterized by declarative sentences and noun-form endings. In contrast, the reference document utilizes a conversational tone, incorporating "haeyo" endings, emojis, exclamation marks, and a question. The current editor's title framing also points to a reporting structure.


The reference material is a casual blog post about SaaS marketing, while the editor's document is a formal operational report draft. There's a clear mismatch in genre and purpose. The blog post uses informal language and stylistic elements inconsistent with the report's intended format.




</details>

**답변**

결론부터 말씀드리면, **이 블로그 글을 보고서 전체의 스타일·서식 레퍼런스로 직접 적용하는 것은 권장하지 않습니다.** 

[2025 Q1 온보딩 개선 운영 보고서](vdoc:doc/vdoc_eval_report)와 [노트몽키 블로그 — 회의록 정리 꿀팁 5가지](vdoc:ref:vdoc_eval_ref_blog)의 층위별 패턴을 측정한 결과, 두 문서의 장르와 격식 차이가 매우 큽니다.

---

### 층위별 진단 결과

1. **장르 규약 및 문체 (D6)**
   - **현재 보고서**: 평서체(`~다`)와 명사형 종결 중심의 격식 있는 비즈니스 문서입니다.
   - **레퍼런스 블로그**: `~해요` 대화체 종결 100%, 이모지(🧠, 🤔, 😅 등 4개), 느낌표·물음표가 다수 쓰인 캐주얼한 아티클입니다. 이 문체를 보고서에 옮기면 공식 문서로서의 신뢰도가 떨어집니다.

2. **서술 프레임워크 (D4)**
   - **현재 보고서**: [요약](vdoc:page/rp1) → [주요 결정](vdoc:page/rp2) → [지표](vdoc:page/rp3) → [다음 단계](vdoc:page/rp4)의 완결된 보고서 구조를 갖추고 있습니다.
   - **레퍼런스 블로그**: 팁 5개 나열 후 서비스 홍보(CTA)로 끝나는 전형적인 마케팅/블로그 포맷입니다.

3. **데이터 증명 및 조판 (D2, D5)**
   - 보고서는 정량 데이터와 구조화된 표(Table)를 기반으로 하지만, 레퍼런스는 짧은 문장 중심의 텍스트 블록으로만 구성되어 있습니다.

---

### 활용 팁
레퍼런스의 톤앤매너나 레이아웃을 그대로 입히는 것은 맞지 않지만, 블로그에서 제시한 **작성 원칙**은 보고서 편집 가이드로 부분 활용할 수 있습니다.

- **"결정부터 적어요"** → [p2 주요 결정](vdoc:page/rp2)에서 논의 과정보다 최종 확정 사항을 두괄식으로 배치
- **"숫자는 표로"** → [p3 지표](vdoc:page/rp3)의 텍스트 속 수치들을 표로 일목요연하게 구조화
- **"담당자를 바로 박아요"** → [p4 다음 단계](vdoc:page/rp4) 실행 과제별 담당자와 일정 명시

문서의 전체적인 서식과 톤은 공식 보고서 규격을 유지하면서, 위와 같은 내용 정돈 원칙만 취사선택해 다듬는 방식을 추천합니다.

## RF2-proof — RF
> 이 레퍼런스처럼 표로 숫자를 증명하려면 리서치 자료에 쓸 데이터가 있어?

- ✅ 있는 데이터: 있음
- ✅ 없는 데이터 구분: 있음
- ❌ 다른 기간 · 대상 수치(210%) 미사용: 없음

**도구**: wb_read → ws_tree → read_file → read_file → read_file → read_file → read_file → read_file

**읽은 원천**: 2025-02-03_인터뷰_A사.md, 2025-03-10_인터뷰_B사.md, 2025-03_지표_요약.md, README.md, 경쟁사_비교.md, 보고서_요약_원래본.md

<details><summary>생각</summary>

Reference pattern identified: numerical proof via tables and metrics. Resource focus: exploring research data for available figures and metric data. Since no editor is used, the output will focus on data availability and mapping analysis.

The user's question necessitates determining data availability within the research material to construct a table showing numerical proof. The task involves examining research data for usable figures and metrics.


Initial assessment involves confirming the reference data for the target market, observing numerical indicators like TAM, customer count, and NPS, formatted as a key-value table. Further investigation involves examining the contents of six resource files, which are short and total only 42 lines.


Checked all resource files.

Rule check: The "source net" role distinction requires strict adherence: the editor (current document) is the subject for correction; the reference provides the problem-solving trajectory and abstract patterns; resources contain the facts for the document.


Initial hypothesis: Establish the source of truth for the document's facts and figures, focusing on revision history.

Rules dictate that the document reflects its initial state and subsequent changes. Screen position and citation links use a defined format for readability. References employ a pattern of concise, two-column tables with specific metrics like market size and customer satisfaction. The facts must come from the resources provided.

Observed data confirms that the requested metrics such as TAM and NPS are not available in the current resources. Focus will shift to available product and usability metrics (WAU, template usage, document completion time).




</details>

**답변**

네, [루미나랩스 투자 제안서](vdoc:doc/vdoc_eval_ref_invest)의 [시장](vdoc:slot/a_market)에서 쓰인 `지표 | 값` 2열 표 패턴을 그대로 적용해 숫자를 증명할 수 있는 데이터가 리서치 자료에 있습니다.

---

### 1. 리서치 자료로 구성할 수 있는 지표 표

| 지표 | 값 | 출처 |
|---|---|---|
| **WAU (주간 활성 사용자)** | 1,450명 | [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L9, L13) |
| **템플릿 사용률** | 68% | [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L10) |
| **첫 문서 완성 평균 시간** | 31분 | [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L11) |
| **연간 사용자 성장률** *(선택)* | 210% | [보고서 요약 (원래본)](vdoc:resource/file_62220c4596) (L3) |

---

### 2. 수치 검증 및 주의 사항

- **최종 검증 수치 사용**: [A사 인터뷰](vdoc:resource/file_424d917afe) (L7)에 언급된 WAU 1,200명은 2월 구두 추정치이며, [3월 지표 요약](vdoc:resource/file_ca01d6d352) (L13)에 명시된 3월 3주 차 제품 로그 기준 **1,450명**이 최종 확정치입니다.
- **레퍼런스 항목 대응 한계**: 레퍼런스에 등장하는 시장 규모(`TAM`), 고객 만족도(`NPS`), `유료 고객사 수`는 현재 리서치 자료에 **없습니다**. 레퍼런스의 사실 수치를 가져오지 않고, 위와 같이 리서치에 실제 존재하는 **제품 사용성 및 활성도 지표**로 대체하여 증명하는 것이 적합합니다.