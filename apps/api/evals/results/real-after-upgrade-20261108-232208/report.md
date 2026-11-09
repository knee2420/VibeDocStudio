# 하네스 평가 — real-after-upgrade

통과 1/1

| 시나리오 | 통과 | 점수 | 시간 | 입력/캐시/출력 토큰 | vibefs | read_file | 차단 |
|---|---|---|---|---|---|---|---|
| R1-real-decision-standard | ✅ | 4/4 | 76.0s | 48,864/150,157/6,577 | 1 | 19 | 0 |

## R1-real-decision-standard — 실제 볼트(280개) · 묶음 종합 · 세대 차이 · 주장 범위
> 리소스의 Decision 들을 읽고 공통 형식과 차이를 정리해서, 앞으로 쓸 결정 카드 표준을 제안해줘.

- ✅ discussions 결정 카드 읽음: 18/18
- ✅ 범위 주장 '18개 확정본을 모두 검토' · 실제 18/18
- ✅ 세대 차이(실행 가이드라인이 나중에 추가) 지적: 있음
- ✅ resource 링크 18개 모두 실제 id

**도구 순서**

1. `mcp_vibefs_ws_collect` done {"query": "Decision", "toolSummary": "Collect Decision cards"}
2. `read_file` done {"Path": "discussions/26.09.29/decisions/Decision 01 — 인스파이어드 디스커버리 방식으로 검증하고 아니면 버린다.md"}
3. `read_file` done {"Path": "discussions/26.09.29/decisions/Decision 02 — 한 달 스프린트로 하고 10월 30일에 포인트를 찍는다.md"}
4. `read_file` done {"Path": "discussions/26.09.29/decisions/Decision 03 — 역할 배분 (가치·사업 민규 서, 사용성 Rin, LLM 민규 서).md"}
5. `read_file` done {"Path": "discussions/26.09.29/decisions/Decision 04 — 캔버스 목업은 접고 지금 목업으로 승부한다.md"}
6. `read_file` done {"Path": "discussions/26.09.29/decisions/Decision 05 — 북극성은 작업 시간 10분의 1로 둔다.md"}
7. `read_file` done {"Path": "discussions/26.09.29/decisions/Decision 06 — 사용성 담당은 임파워드부터 한다.md"}
8. `read_file` done {"Path": "discussions/26.10.01/decisions/Decision 01 — 우리 도구는 시뮬레이터다 (와꾸가 안 잡힌 문서를 같이 짠다).md"}
9. `read_file` done {"Path": "discussions/26.10.02/decisions/Decision 01 — 이번 한 달은 커서의 효용을 문서 작업자에게 하나에 집중한다.md"}
10. `read_file` done {"Path": "discussions/26.10.02/decisions/Decision 02 — 컴포넌트로 쪼개 가장 위험한 것부터 검증한다 (레시피 우선).md"}
11. `read_file` done {"Path": "discussions/26.10.02/decisions/Decision 03 — 다음 주는 Scaffold Manager 하나에 집중해 사용성과 실현성을 검증한다.md"}
12. `read_file` done {"Path": "discussions/26.10.02/decisions/Decision 04 — 기존 목업을 쪼개는 계획은 버리고 사용성 와꾸는 새로 자유롭게 짠다.md"}
13. `read_file` done {"Path": "discussions/26.10.06/decisions/Decision 01 — 1번 타겟은 에이전트 헤비 문서 유저로 유지하고 와꾸를 아예 못 잡는 사람은 뺀다.md"}
14. `read_file` done {"Path": "discussions/26.10.06/decisions/Decision 02 — 이번 주는 스토리라이닝에서 화면에 보여 줄 것과 스키마로 잡을 것을 찾는다.md"}
15. `read_file` done {"Path": "discussions/26.10.07/decisions/Decision 01 — Workflowy는 따로 쓰지 않고 레퍼런스로만 위계 관리는 옵시디언에 이식한다.md"}
16. `read_file` done {"Path": "discussions/26.10.14/decisions/Decision 01 — 서식은 템플릿으로 먼저 준다 (비정형 문서도 템플릿 고정).md"}
17. `read_file` done {"Path": "discussions/26.10.14/decisions/Decision 02 — 레퍼런스는 아웃라인 위에 인라인 어노테이션으로 붙인다.md"}
18. `read_file` done {"Path": "discussions/26.10.14/decisions/Decision 03 — 아웃라인 가독성을 각 잡고 올린다 (읽는 건 오른쪽 미리보기로).md"}
19. `read_file` done {"Path": "discussions/26.10.14/decisions/Decision 04 — 아웃라이너에 Git 사상을 이식한다 (스테이징·Diff 대조·브랜치 캔버스).md"}
20. `read_file` done {"Path": "_에이전트 작업 공간/2026.09.29 주간 회의록/A5.outputs/D1_인스파이어드_디스커버리_방식으로_검증하고_아니면_버린다.md"}

**읽은 파일 (19)**: D1_인스파이어드_디스커버리_방식으로_검증하고_아니면_버린다.md, Decision 01 — 인스파이어드 디스커버리 방식으로 검증하고 아니면 버린다.md, Decision 02 — 한 달 스프린트로 하고 10월 30일에 포인트를 찍는다.md, Decision 03 — 역할 배분 (가치·사업 민규 서, 사용성 Rin, LLM 민규 서).md, Decision 04 — 캔버스 목업은 접고 지금 목업으로 승부한다.md, Decision 05 — 북극성은 작업 시간 10분의 1로 둔다.md, Decision 06 — 사용성 담당은 임파워드부터 한다.md, Decision 01 — 우리 도구는 시뮬레이터다 (와꾸가 안 잡힌 문서를 같이 짠다).md, Decision 01 — 이번 한 달은 커서의 효용을 문서 작업자에게 하나에 집중한다.md, Decision 02 — 컴포넌트로 쪼개 가장 위험한 것부터 검증한다 (레시피 우선).md, Decision 03 — 다음 주는 Scaffold Manager 하나에 집중해 사용성과 실현성을 검증한다.md, Decision 04 — 기존 목업을 쪼개는 계획은 버리고 사용성 와꾸는 새로 자유롭게 짠다.md, Decision 01 — 1번 타겟은 에이전트 헤비 문서 유저로 유지하고 와꾸를 아예 못 잡는 사람은 뺀다.md, Decision 02 — 이번 주는 스토리라이닝에서 화면에 보여 줄 것과 스키마로 잡을 것을 찾는다.md, Decision 01 — Workflowy는 따로 쓰지 않고 레퍼런스로만 위계 관리는 옵시디언에 이식한다.md, Decision 01 — 서식은 템플릿으로 먼저 준다 (비정형 문서도 템플릿 고정).md, Decision 02 — 레퍼런스는 아웃라인 위에 인라인 어노테이션으로 붙인다.md, Decision 03 — 아웃라인 가독성을 각 잡고 올린다 (읽는 건 오른쪽 미리보기로).md, Decision 04 — 아웃라이너에 Git 사상을 이식한다 (스테이징·Diff 대조·브랜치 캔버스).md

<details><summary>생각</summary>

Confirmed the task requires consolidating and comparing "Decision" items. The initial step involves retrieving and reading all relevant files. Then, identifying commonalities and differences across these items is necessary, considering variations across time and folders. Complete analysis of all 18 files is essential to avoid generalizations from incomplete information.


I'm thinking through how to approach this.


Analyzing a set of decision documents. Each document outlines a specific strategic decision made at a particular point in time. The decisions focus on streamlining development, prioritizing user experience, and validating core functionalities through focused iterations.


The file analysis shows a consistent "todo" frontmatter structure with defined sections for project, classification, subject, status, and associated metadata. The body follows a clear pattern: a decision title, followed by "What" (decision content) and "Why" (reasoning) sections, using a check-list format for the content. This structured format suggests an organized approach to decision tracking and documentation.


Examining the remaining files, I see discussions on decisions regarding note-taking workflows and referencing strategies. Specifically, the files outline choices about integrating Workflowy with Obsidian, using templates for consistent formatting, and embedding references as inline annotations within an outline structure.


Successfully read all 18 files. Now the analysis requires synthesizing commonalities, differences, evolution, and comparisons against the initial drafts.

Checking the draft list from the workspace directory reveals the drafts are located in `_에이전트 작업 공간/<날짜>/A5.outputs/`. For example, a draft can be found in `_에이전트 작업 공간/2026.09.29 주간 회의록/A5.outputs/D1`.


The draft and final version's differences are clear. The draft file contains a frontmatter with metadata like type, section, category, status, author, and PARA organization level. Its body includes a verbatim transcript of the discussion with timestamps and speakers, followed by sections for "Agreed-upon items (table: what, by when, who, confidence)" and "Criteria for completion."


The analysis reveals two distinct versions: a draft based on meeting transcripts and a final, structured decision record. The draft focuses on summarizing the meeting with agreed-upon action items, while the final version presents decisions in a standardized format. The evolution of the final version from a concise format to a more detailed, structured one is observed over time.




</details>

**답변**

결정 카드(Decision) 본 대상 18개 파일(고유 18개) 전체와 초안을 대조 분석한 결과입니다.

---

### 1. 본 대상 18개 파일 탐색 개요

본 대상 18개 확정본을 모두 검토 완료했습니다.
- **26.09.29 (6건)**: [Decision 01](vdoc:resource/file_af830ff196) (L1-44), [Decision 02](vdoc:resource/file_030f56b736) (L1-44), [Decision 03](vdoc:resource/file_4e03621837) (L1-43), [Decision 04](vdoc:resource/file_49d8ed5825) (L1-44), [Decision 05](vdoc:resource/file_273fdb2361) (L1-43), [Decision 06](vdoc:resource/file_afe5bbc799) (L1-44)
- **26.10.01 (1건)**: [Decision 01](vdoc:resource/file_9609a81345) (L1-45)
- **26.10.02 (4건)**: [Decision 01](vdoc:resource/file_a500a73f9c) (L1-59), [Decision 02](vdoc:resource/file_11eb43f3f4) (L1-60), [Decision 03](vdoc:resource/file_1899eb356b) (L1-62), [Decision 04](vdoc:resource/file_e0a45bf8ad) (L1-60)
- **26.10.06 (2건)**: [Decision 01](vdoc:resource/file_fe8e1eaddd) (L1-62), [Decision 02](vdoc:resource/file_cbaf05c568) (L1-62)
- **26.10.07 (1건)**: [Decision 01](vdoc:resource/file_06f9dada33) (L1-63)
- **26.10.14 (4건)**: [Decision 01](vdoc:resource/file_eb3cee0263) (L1-62), [Decision 02](vdoc:resource/file_6a104d69a3) (L1-61), [Decision 03](vdoc:resource/file_de9c814b85) (L1-61), [Decision 04](vdoc:resource/file_7ec1150092) (L1-65)

---

### 2. 공통점 (모든 확정본 결정 카드가 공유하는 형식)

1. **파일명 및 제목 규칙**
   - 파일명: `Decision 0N — <결정 내용 요약>.md` (em-dash `—` 사용, 대괄호 `[]` 미사용)
   - 문서 제목: `# 🎯 Decision 0N — <결정 내용 요약>`
2. **프론트매터 13종 속성 체계 준수**
   - `유형`: `할일` (결정 사항을 즉시 실행 가능한 과업 단위로 취급)
   - `구역`: `1.project`
   - `분류`: `[🐕망고독 R&D 프로젝트 관리]`
   - `상태`: `결정 사항`
   - `담당`: `[[민규 서]]`, `[[Rin]]`
   - `작성자`: `[[Gemini]]`
   - `상위`: 상위 목표인 `[[🎯 (Outcome) 북극성 Outcome 정의 및 4대 리스크 스크리닝]]`에 연결
   - `링크`: 초안 카드(D1...) 및 관련 회의록 논의 안건 노트 연결
3. **핵심 본문 2대 골격**
   - **`## 1. 결정 내용 (What)`**: 반드시 `> [!check]` 콜아웃 블록 안에 3대 핵심 결정을 불릿(`- **...**`)으로 기술
   - **`## 2. 결정 사유 (Why)`**: 번호 매기기(1., 2., 3.)를 통해 세 가지 명확한 근거(비용 방지, 가설 폐기, 팀 얼라인먼트 등)를 제시

---

### 3. 차이점 및 변천사 (시기별 · 폴더별)

#### ① 시기별 진화 (초기 vs 중·후기)
- **초기 (09.29 ~ 10.01, 7건)**: 
  - 섹션이 `## 1. What`과 `## 2. Why` 2개로만 구성됨 (43~45줄 내외).
  - 무엇을 왜 정했는지만 간결하게 기술하고 실행 경계선은 포함되지 않음.
- **중·후기 (10.02 ~ 10.14, 11건)**:
  - `## 3. 실행 가이드라인 (Boundary & Criteria)` 섹션이 정규화되어 추가됨 (59~65줄).
  - 실행 범위의 모호성을 없애기 위해 세부 항목이 3단계로 표준화됨:
    - **집중 대상 (Do)**: 이번 스프린트/주간에 반드시 해야 할 행동
    - **제외 대상 (Don't)**: 오버스펙, 섣부른 확장, 차단할 항목
    - **완료 판단 기준 (DoD)**: 종료 판정 마일스톤 및 성패 확인 조건

#### ② 폴더 및 상태별 차이 (확정본 vs 초안)
- **확정본 (`discussions/`)**: 
  - 상태 `결정 사항`, 구역 `1.project`, 유형 `할일`.
  - 정제된 `What / Why / Boundary` 중심의 최종 합의문.
- **초안 (`_에이전트 작업 공간/.../A5.outputs/`)**:
  - 상태 `검토 중`, 구역 `4.archive`, 유형 `메모`, 작성자 `[[Claude]]`.
  - 회의 속기 인용문(타임스탬프), `✅ 정한 것` 표, `❓ 아직 안 정한 것`, `🔁 다시 볼 때` 등 회의 발언과 부산물이 포함된 원천 기록.

---

### 4. 앞으로 쓸 결정 카드 표준안 제안

10.02 이후 완성된 3단계 확장형 구조가 가장 구체적인 실행 기준을 제공하므로, 이를 프로젝트 표준 서식으로 채택하는 것을 제안합니다.

```markdown
---
유형: 할일
구역: 1.project
분류:
  - 🐕망고독 R&D 프로젝트 관리
주제:
  - 결정 사항
  - <핵심 키워드 1>
  - <핵심 키워드 2>
상태: 결정 사항
요약: <결정 사항 1줄 요약>
작성일: YYYY-MM-DD
마감: YYYY-MM-DD
상위:
  - "[[<상위 프로젝트 또는 Outcome 노트>]]"
링크:
  - "[[<관련 논의 회의록 및 안건 노트>]]"
담당:
  - "[[민규 서]]"
  - "[[Rin]]"
작성자:
  - "[[Gemini]]"
---

# 🎯 Decision 0N — <결정 사항 핵심 문장>

## 1. 결정 내용 (What)

> [!check]
> - **<핵심 결정 1>**: <구체적 지침>
> - **<핵심 결정 2>**: <구체적 지침>
> - **<핵심 결정 3>**: <구체적 지침>

---

## 2. 결정 사유 (Why)

1. **<핵심 이유 1>**: <근거 설명>
2. **<핵심 이유 2>**: <근거 설명>
3. **<핵심 이유 3>**: <근거 설명>

---

## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**:
  - <반드시 실행할 핵심 범위 및 과업>
- **제외 대상 (Don't)**:
  - <오버스펙 방지 및 현 단계에서 배제할 작업>
- **완료 판단 기준 (DoD)**:
  - <마일스톤 시점에 성공/완료 여부를 판정할 정량/정성 기준>
```

#### 표준 작성 원칙
1. **파일명/제목**: 대괄호 `[]` 사용을 엄격히 금지하고, `Decision NN — 제목` 형식을 유지합니다.
2. **단일 책임과 삼분할**: What(합의 내용), Why(논리적 근거 3개), Boundary(Do/Don't/DoD)의 3섹션 구조를 유지하여 의사결정의 누수와 작업 범위 탈선을 차단합니다.
