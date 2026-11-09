"""하네스 평가용 '함정 볼트' 생성기 — 사용자 원본 자료를 쓰지 않고, 정답을 아는 작은 Obsidian 식 볼트를 만든다.

lab 에서 실제로 본 실패를 함정으로 심었다:
- 결정 카드가 두 세대(What/Why 만 · Boundary 추가)로 섞여 있다 → "불변 스키마" 로 뭉뚱그리면 틀린다.
- 템플릿 · 예시 파일(`sample_decision_output.md` 의 "Decision 09")은 실제 결정이 아니다.
- 같은 결정이 두 곳(`discussions/…/decisions` · `archive/…/A5.outputs`)에 동일본으로 있다.
- 폐기된 v1 결정과 그를 대체한 결정이 함께 있다 → "지금 유효한 결정" 을 물으면 대체 관계를 따라가야 한다.
- 결정 카드의 수치는 [[링크]] 너머 다른 폴더의 근거 메모에만 있다.
- 3,000줄 기록 파일의 2,417번째 줄에만 최종 합의가 있다 (앞쪽 300줄에는 미끼 '30일 검토').

    python evals/build_vault.py <출력 폴더>
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

GEN1 = """---
유형: 할일
상태: {state}
요약: {summary}
작성일: {date}
상위:
  - "[[알파 프로젝트 목표]]"
담당:
  - "[[민지]]"
---

# 🎯 {title}

## 1. 결정 내용 (What)

> [!check]
> - {what}

## 2. 결정 사유 (Why)

1. {why}
"""

GEN2 = GEN1 + """
## 3. 실행 가이드라인 (Boundary & Criteria)

- **집중 대상 (Do)**: {do}
- **제외 대상 (Don't)**: {dont}
- **완료 판단 기준 (DoD)**: {dod}
"""

D03 = dict(state="결정 사항", summary="요금제를 좌석 기반에서 사용량 기반으로 바꾼다", date="2025-01-20",
           title="Decision 03 — 요금제는 사용량 기반으로 바꾼다",
           what="요금은 처리한 문서 페이지 수 기준으로 매긴다. 좌석 기반 요금제는 폐기한다.",
           why="법무팀 파일럿에서 좌석 수보다 처리량 편차가 10배 이상 컸다.",
           do="페이지 단위 과금 계측", dont="좌석 단위 할인 정책", dod="2월 청구서가 사용량 기준으로 발행됨")

FILES: dict[str, str] = {
    # --- discussions (프로젝트 정본) -------------------------------------------------------------
    "projects/alpha/discussions/25.01.06/decisions/Decision 01 — 검색은 로컬 색인으로 시작한다.md": GEN1.format(
        state="결정 사항", summary="검색은 외부 서비스 대신 로컬 색인으로 시작한다", date="2025-01-06",
        title="Decision 01 — 검색은 로컬 색인으로 시작한다",
        what="첫 버전 검색은 로컬 색인(BM25)으로 만든다.", why="고객 문서를 외부로 보내지 않는다는 보안 요구가 있다."),
    "projects/alpha/discussions/25.01.06/decisions/Decision 02 — 첫 고객은 법무팀으로 좁힌다.md": GEN1.format(
        state="결정 사항", summary="첫 고객군은 법무팀으로 좁힌다", date="2025-01-06",
        title="Decision 02 — 첫 고객은 법무팀으로 좁힌다",
        what="첫 파일럿 고객은 사내 법무팀 한 곳이다.", why="문서 양식이 정형화돼 있어 성과 측정이 쉽다."),
    "projects/alpha/discussions/25.01.13/decisions/Decision 01 — 요금제는 좌석 기반으로 간다 (v1).md": GEN1.format(
        state="대체됨", summary="요금제는 좌석 기반 (→ Decision 03 으로 대체됨)", date="2025-01-13",
        title="Decision 01 — 요금제는 좌석 기반으로 간다 (v1)",
        what="요금은 좌석 수 기준으로 매긴다. ⚠️ 2025-01-20 [[Decision 03 — 요금제는 사용량 기반으로 바꾼다]] 로 대체됨.",
        why="경쟁사 대부분이 좌석 기반이다."),
    "projects/alpha/discussions/25.01.20/decisions/Decision 03 — 요금제는 사용량 기반으로 바꾼다.md": GEN2.format(**D03),
    "projects/alpha/discussions/25.01.20/decisions/Decision 04 — 온보딩은 템플릿 3종으로 시작한다.md": GEN2.format(
        state="결정 사항", summary="온보딩은 템플릿 3종으로 시작한다", date="2025-01-20",
        title="Decision 04 — 온보딩은 템플릿 3종으로 시작한다",
        what="신규 고객 온보딩은 계약서 · 의견서 · 내부 메모 템플릿 3종으로 시작한다.",
        why="실측 기준선([[근거_온보딩 실측 기준선]])보다 첫 문서 완성 시간을 절반으로 줄이는 것이 목표다.",
        do="템플릿 3종 제작", dont="고객 맞춤 템플릿", dod="첫 문서 완성 시간이 기준선의 절반 이하"),
    # 함정: 계획 수치(10명)와 실측 수치(12명)가 다르다 — "측정한 결과" 를 물으면 실측 메모를 봐야 한다
    "projects/alpha/discussions/25.01.20/new todo/value_온보딩 실측 계획.md":
        "---\n유형: 메모\n상태: 검토 중\n---\n# 온보딩 실측 계획\n- 신규 고객 10명의 첫 문서 완성 시간을 잴 계획이다.\n- 결과는 근거 메모에 남긴다.\n",
    # 함정: 결정처럼 보이지만 아직 초안(검토 중)이다
    "archive/2025.01.27 주간회의/A5.outputs/D5_외부_검색_API_도입은_보류한다_초안.md":
        "---\n유형: 할일\n상태: 검토 중\n요약: (초안) 외부 검색 API 도입을 보류할지 다음 회의에서 정한다\n---\n"
        "# 🎯 D5 (초안) — 외부 검색 API 도입은 보류한다\n\n> ⚠️ 아직 합의되지 않은 초안. 다음 회의 안건.\n\n"
        "## 1. 결정 내용 (What)\n- (안) 외부 검색 API 는 3월까지 보류\n",
    # --- archive (회의 작업 공간) ----------------------------------------------------------------
    "archive/2025.01.20 주간회의/A5.outputs/D3_요금제는_사용량_기반으로_바꾼다.md": GEN2.format(**D03),  # 동일본
    "archive/2025.01.20 주간회의/A4.meta/templates/decision_card_template.md":
        "---\n유형: 템플릿\n---\n# 🎯 Decision <번호> — <결정 한 문장>\n\n## 1. 결정 내용 (What)\n## 2. 결정 사유 (Why)\n"
        "## 3. 실행 가이드라인 (Boundary & Criteria)\n## 4. 아직 안 정한 것\n",
    "archive/2025.01.20 주간회의/A4.meta/examples/sample_decision_output.md":
        "---\n유형: 예시\n---\n> 이 파일은 결정 카드 작성 예시다. 실제 결정이 아니다.\n\n# 🎯 Decision 09 — 회의는 30분을 넘기지 않는다\n\n"
        "## 1. 결정 내용 (What)\n- (예시) 모든 회의는 30분 안에 끝낸다.\n",
    "archive/2025.01.20 주간회의/A3.working memory/근거_온보딩 실측 기준선.md":
        "---\n유형: 메모\n상태: 완료\n---\n# 온보딩 실측 기준선\n\n- 측정 대상: 신규 고객 12명 (n=12)\n"
        "- **기준선: 첫 문서 완성까지 평균 47분**\n- 최솟값 21분 · 최댓값 95분\n",
    "archive/2025.01.20 주간회의/2025.01.20 주간회의 — 작업 기억.md":
        "# 2025.01.20 주간회의 — 작업 기억\n\n- 요금제 논의: [[Decision 03 — 요금제는 사용량 기반으로 바꾼다]]\n"
        "- 온보딩 논의: [[Decision 04 — 온보딩은 템플릿 3종으로 시작한다]]\n",
}


def _session_log() -> str:
    lines = ["# 세션 기록 (대용량)", ""]
    for i in range(3, 3001):
        if i == 300:
            lines.append("- 15:02 데이터 보존 기간 30일 안을 검토했다 (결론 없음, 다음 회의로 넘김)")
        elif i == 2417:
            lines.append("- 17:48 **합의: 데이터 보존 기간은 90일로 한다** (법무팀 요청 반영, 이견 없음)")
        else:
            lines.append(f"- {10 + i // 600:02d}:{i % 60:02d} 진행 상황 공유 #{i} — 특이 사항 없음")
    return "\n".join(lines) + "\n"


FILES["archive/logs/세션 기록_대용량.md"] = _session_log()


def _noise() -> dict[str, str]:
    """실제 볼트처럼 회의 폴더마다 A1~A5 구조 · 안건 카드 · 작업 메모 · 템플릿 사본을 깔아 둔다 (소음).

    '결정' · '요금' · '온보딩' 같은 단어가 안건 카드에도 섞여 있어, 이름 · 글자 검색만으로는 결정 카드를 고를 수 없다.
    """
    out: dict[str, str] = {}
    topics = ["요금 구조 재검토", "온보딩 흐름 개선", "검색 품질 측정", "법무팀 파일럿 일정", "결정 기록 방식 정리",
              "템플릿 우선순위", "데이터 보존 정책 초안", "고객 인터뷰 질문지"]
    dates = ["2025.01.06 주간회의", "2025.01.13 주간회의", "2025.01.20 주간회의", "2025.01.27 주간회의"]
    for d_i, date in enumerate(dates):
        for t_i, topic in enumerate(topics):
            no = f"{t_i // 3 + 1}.{t_i % 3 + 1}"
            out[f"archive/{date}/A1.collection/history/{no}_{topic.replace(' ', '_')}.md"] = (
                f"---\n유형: 메모\n상태: 검토 중\n요약: {topic} 안건 카드\n---\n# {no} {topic}\n\n"
                f"## 📌 기존엔 왜 이렇게 했을까\n- {topic} 관련 현행 방식 설명 ({date})\n\n"
                f"## ⚖️ 핵심 쟁점\n- A안 vs B안 — 아직 결정되지 않음\n\n## 💡 해결 방향\n- (회의에서 정한다)\n"
            )
        out[f"archive/{date}/A2.scratch(ideation)/아이디어 메모.md"] = f"# 아이디어 메모 ({date})\n- 결정과 무관한 브레인스토밍\n"
        out[f"archive/{date}/A4.meta/templates/agenda_card_template.md"] = "# <번호> <안건 제목>\n## 📌 기존엔 왜\n## ⚖️ 핵심 쟁점\n## 💡 해결 방향\n"
        out[f"archive/{date}/A4.meta/templates/decision_card_template.md"] = FILES["archive/2025.01.20 주간회의/A4.meta/templates/decision_card_template.md"]
        out[f"archive/{date}/A4.meta/SKILL.md"] = "---\nname: meeting-decision-recorder\n---\n회의 속기에서 결정을 골라 decision_card_template 으로 쓴다.\n"
    return out


for _rel, _text in _noise().items():
    FILES.setdefault(_rel, _text)

#: 채점에 쓰는 정답 (상대 경로)
REAL_DECISIONS = [k for k in FILES if "/decisions/" in k] + ["archive/2025.01.20 주간회의/A5.outputs/D3_요금제는_사용량_기반으로_바꾼다.md"]
DRAFT_DECISION = "archive/2025.01.27 주간회의/A5.outputs/D5_외부_검색_API_도입은_보류한다_초안.md"
ROOTS = ["projects/alpha/discussions", "archive"]


def build(out: Path) -> Path:
    if out.exists():
        shutil.rmtree(out)
    for rel, text in FILES.items():
        path = out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return out


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "state" / "evals" / "vault"
    print(build(target))
