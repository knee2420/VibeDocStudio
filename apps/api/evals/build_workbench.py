"""작업대 평가 픽스처 — 에디터 문서 2 · 레퍼런스 3 · 리소스 볼트 2(알파 = build_vault, 베타 = 리서치) · 이력.

일부러 장르 · 자료 형태를 섞는다 (과적합 방지): 운영 보고서 · 블로그 초안 / 투자 제안서 · 공공기관 보고 · SEO 블로그 /
결정 카드 볼트 · 인터뷰 · 지표 리서치 볼트. 레퍼런스마다 고유 사실(회사명 · 수치)을 심어 누출을 잰다.

    python evals/build_workbench.py   → state/evals/wb/
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))  # app.* (레퍼런스 추출기 · 층위 측정)
sys.path.insert(0, str(HERE.parents[2] / "packages" / "harness-kit"))  # 하네스 기본기

from build_vault import build as build_alpha  # noqa: E402

OUT = HERE.parent / "state" / "evals" / "wb"
DOCS = OUT / "documents"
#: 레퍼런스 라이브러리 항목 폴더 (vdoc 이 아니다 — ref.json · source.html · extraction.json · layers.json · pins.json)
REFS = OUT / "references" / "items"
#: 평가 프로젝트의 레퍼런스 연결 · 합의 카드 (앱과 같은 형식: <references>/bindings/<projectId>.json)
BINDINGS = OUT / "references" / "bindings"
#: 앱 라이브러리의 실물 레퍼런스 (긴 PDF · 표가 많은 PDF) — 평가용 id 로 복사한다
LIBRARY = HERE.parent / "data" / "knowledge" / "references" / "items"
REAL_REFS = {"ref_eval_pm5": "ref-1a1befb44bb-a56be486", "ref_eval_seoul": "ref-1a1befb220a-e243c4ab"}
ALPHA = OUT / "vault_alpha"
BETA = OUT / "vault_beta"

#: 레퍼런스에만 있는 사실 (결과물에 나오면 누출)
REF_ONLY = {
    "ref_eval_invest": ["루미나랩스", "4.2조원", "37곳", "50억원", "NPS 71"],
    "ref_eval_public": ["한국데이터진흥원", "KDA-2025-0412", "3.1억원"],
    "ref_eval_blog": ["노트몽키", "꿀팁"],
}


def slot(sid: str, label: str, content: str, **extra) -> dict:
    return {"slotId": sid, "label": label, "role": extra.pop("role", "editable-slot"), "content": content,
            "backDataRefs": [], **extra}


def text_block(bid: str, sid: str, title: str = "") -> dict:
    return {"blockId": bid, "kind": "text", "title": title, "slotId": sid}


def table_block(bid: str, rows: list[list[str]], title: str = "") -> dict:
    return {"blockId": bid, "kind": "structured-table", "title": title,
            "rows": [{"rowId": f"{bid}_r{i}", "cells": [{"slotId": s} for s in row]} for i, row in enumerate(rows)]}


def write_doc(doc_id: str, title: str, pages: list[dict], slots: list[dict], *, revisions: list[dict] | None = None,
              evidence: list[dict] | None = None) -> None:
    folder = DOCS / doc_id
    folder.mkdir(parents=True, exist_ok=True)
    data = {"version": "1.0", "docId": doc_id, "title": title, "status": "Draft", "updatedAt": "2025-04-02T09:00:00Z",
            "variables": {}, "pages": pages, "slots": {s["slotId"]: s for s in slots}, "backdata": {},
            "evidenceLinks": evidence or [], "totalPages": len(pages), "revision": len(revisions or []) + 1}
    (folder / "document.vdoc.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    if revisions:
        (folder / "revisions.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in revisions) + "\n",
                                                encoding="utf-8")


def page(pid: str, label: str, blocks: list[dict]) -> dict:
    return {"pageId": pid, "pageNumber": 0, "pageLabel": label, "blocks": blocks}


# --- 에디터 문서 1: 운영 보고서 (함정 다수) ---------------------------------------------------------

SUMMARY_ORIG = "<p>Q1 온보딩 개선의 핵심은 템플릿 우선 제공이다. 첫 문서 완성 시간은 기준선 47분에서 크게 줄었다.</p>"
SUMMARY_NOW = (
    "<p>이번 분기 <strong>온보딩</strong> 개선 작업은 <strong>여러 팀</strong>이 함께 참여한 <strong>대규모</strong> 프로젝트였으며, "
    "<strong>사용자 경험</strong>을 근본적으로 바꾸기 위해 <strong>다양한</strong> 시도를 했고, 그 과정에서 <strong>템플릿</strong>을 "
    "먼저 보여 주는 방식과 빈 문서에서 시작하는 방식을 비교했으며, 기준선으로 삼은 첫 문서 완성 시간 47분을 줄이는 것을 "
    "<strong>최우선</strong> 목표로 두었고, 결과적으로 여러 지표에서 의미 있는 변화가 있었지만 아직 측정이 끝나지 않은 항목도 남아 있어 "
    "다음 분기에 추가 검증이 필요하다는 점을 <strong>강조</strong>하고 싶다.</p>"
)


def build_report() -> None:
    slots = [
        slot("r_title", "문서 제목", "<h1>2025 Q1 온보딩 개선 운영 보고서</h1>"),
        slot("r_meta", "문서 정보", "<p></p>"),
        slot("r_summary", "요약", SUMMARY_NOW, originalContent=SUMMARY_ORIG, isEdited=True),
        slot("r_dec_h1", "표 머리 · 항목", "<p>항목</p>"),
        slot("r_dec_h2", "표 머리 · 결정", "<p>결정</p>"),
        slot("r_dec_pricing_k", "요금제 · 항목", "<p>요금제</p>"),
        slot("r_dec_pricing", "요금제 · 결정", "<p>월 정액제를 유지한다.</p>"),
        slot("r_dec_onb_k", "온보딩 · 항목", "<p>온보딩</p>"),
        slot("r_dec_onb", "온보딩 · 결정", "<p>첫 화면에서 템플릿을 먼저 제시한다.</p>"),
        slot("r_dec_next_k", "다음 결정 · 항목", "<p>외부 검색</p>"),
        slot("r_dec_next", "다음 결정 · 결정", "<p></p>"),
        slot("r_metric_table", "지표 표",
             "<table><tr><th>지표</th><th>값</th></tr><tr><td>첫 문서 완성 평균</td><td>47분</td></tr>"
             "<tr><td>템플릿 사용률</td><td>68%</td></tr></table>"),
        slot("r_metric_body", "지표 해설", "<p>측정 결과 첫 문서 완성까지 평균 45분이 걸렸다. 측정 인원은 10명이다.</p>"),
        slot("r_metric_note", "지표 주석",
             "<p>템플릿 사용률은 첫 화면 노출 이후 꾸준히 올랐으며 특히 신규 가입자 가운데 회의록 양식을 고른 비율이 높았고, "
             "기존 사용자는 빈 문서에서 시작하는 습관이 남아 있어 전환이 느렸다. 이 차이는 다음 분기 온보딩 설계에서 반드시 다뤄야 한다.</p>",
             constraints={"maxChars": 80}),
        slot("r_next_plan", "다음 분기 계획", "<p>외부 검색 API 도입 여부를 결정하고, 온보딩 측정을 30명으로 늘린다.</p>"),
        slot("r_next_owner", "담당", "<p>PM 서민규</p>"),
    ]
    pages = [
        page("rp1", "요약", [text_block("rb_title", "r_title"), text_block("rb_meta", "r_meta", "문서 정보"),
                                 text_block("rb_summary", "r_summary", "요약")]),
        page("rp2", "주요 결정", [table_block("rb_dec", [["r_dec_h1", "r_dec_h2"], ["r_dec_pricing_k", "r_dec_pricing"],
                                                          ["r_dec_onb_k", "r_dec_onb"], ["r_dec_next_k", "r_dec_next"]], "결정 표")]),
        page("rp3", "지표", [text_block("rb_metric_table", "r_metric_table", "지표 표"),
                             text_block("rb_metric_body", "r_metric_body"), text_block("rb_metric_note", "r_metric_note")]),
        page("rp4", "다음 단계", [text_block("rb_next", "r_next_plan"), text_block("rb_owner", "r_next_owner")]),
    ]
    revisions = [
        {"rev": 2, "at": "2025-03-28T10:00:00Z", "author": "human", "label": "편집", "slots": [
            {"slotId": "r_dec_onb", "label": "온보딩 · 결정", "before": "<p></p>", "after": "<p>첫 화면에서 템플릿을 먼저 제시한다.</p>", "author": "human"}]},
        {"rev": 3, "at": "2025-04-01T15:20:00Z", "author": "ai", "label": "AI 변경안 승인", "slots": [
            {"slotId": "r_summary", "label": "요약", "before": SUMMARY_ORIG, "after": SUMMARY_NOW, "author": "ai"}]},
    ]
    evidence = [{"linkId": "ev1", "slotId": "r_dec_onb", "status": "ok",
                 "locator": {"kind": "resource", "refId": "file_onb", "label": "D02 온보딩 결정"}}]
    write_doc("vdoc_eval_report", "2025 Q1 온보딩 개선 운영 보고서 (초안)", pages, slots, revisions=revisions, evidence=evidence)


# --- 에디터 문서 2: 사내 블로그 초안 (보류 장르) ----------------------------------------------------

def build_blogpost() -> None:
    slots = [
        slot("b_title", "제목", "<h1>우리 팀의 회의록 실험기</h1>"),
        slot("b_intro", "도입", "<p>지난 분기 우리 팀은 회의록을 쓰는 방식을 바꿔 보았다. 결정만 따로 카드로 남기고, 회의 속기는 별도 폴더에 모았다. "
             "처음에는 손이 더 간다는 불만이 있었지만 한 달쯤 지나자 지난 결정을 찾는 시간이 눈에 띄게 줄었다.</p>"),
        slot("b_body", "본문", "<p>결정 카드에는 무엇을 정했는지와 왜 정했는지를 적었다. 이후에는 실행 가이드라인도 덧붙였다. "
             "카드는 날짜별 폴더에 모았고 파일 이름은 Decision 번호로 시작하게 했다. 그 결과 신규 입사자가 지난 맥락을 따라잡는 데 걸리는 시간이 줄었다.</p>"),
        slot("b_outro", "맺음", "<p>다음 분기에는 카드 작성을 자동화할 계획이다.</p>"),
    ]
    pages = [page("bp1", "글", [text_block(f"bb_{s['slotId']}", s["slotId"]) for s in slots])]
    write_doc("vdoc_eval_blogpost", "사내 블로그: 우리 팀의 회의록 실험기 (초안)", pages, slots)


# --- 레퍼런스 3종 (라이브러리 항목) -------------------------------------------------------------------

def write_ref(ref_id: str, title: str, slots: list[dict], pins: list[dict] | None = None) -> None:
    """레퍼런스 = 원본 HTML 한 장 + 구조 추출 + 층위 측정 + 핀. 앱과 같은 추출기 · 측정 자를 쓴다."""
    from harness_kit import patterns

    from app.reference.adapters import HtmlStructureExtractor, MeasuredLayerAnalyzer

    folder = REFS / ref_id
    folder.mkdir(parents=True, exist_ok=True)
    source = f"<html><head><title>{title}</title></head><body><article>" + "".join(s["content"] for s in slots) + "</article></body></html>"
    extraction = HtmlStructureExtractor().extract(source)
    extraction["refId"] = ref_id
    layers = MeasuredLayerAnalyzer(patterns.measure, patterns.by_layer).analyze(extraction, "document")
    meta = {"refId": ref_id, "kind": "web", "title": title, "sourceName": f"{ref_id}.html", "sourceUrl": "",
            "mimeType": "text/html", "sizeBytes": len(source.encode("utf-8")), "pageCount": 1, "layerSet": "document",
            "status": "ready", "error": "", "createdAt": 1, "updatedAt": 1}
    for name, payload in (("ref.json", meta), ("extraction.json", extraction), ("layers.json", layers), ("pins.json", pins or [])):
        (folder / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    (folder / "source.html").write_text(source, encoding="utf-8")


def build_refs() -> None:
    inv = [
        slot("a_cover", "표지", "<h1>루미나랩스 시리즈A 투자 제안</h1><p>2025.03 · Confidential</p>"),
        slot("a_summary", "요약", "<blockquote><p><strong>결론: 루미나랩스는 3년 안에 기업 문서 자동화 시장 1위가 된다.</strong></p></blockquote>"
             "<ul><li><strong>문제</strong> — 기업 문서의 62%가 다시 쓰인다.</li><li><strong>해법</strong> — 서식과 근거를 함께 묶는 편집기.</li>"
             "<li><strong>증거</strong> — 유료 고객사 37곳, NPS 71.</li><li><strong>요청</strong> — 시리즈A 50억원.</li></ul>"),
        slot("a_scqa", "논리", "<h2>상황</h2><p>문서는 늘고 재작성은 반복된다.</p><h2>문제</h2><p>근거를 다시 찾는 데 시간이 든다.</p>"
             "<h2>질문</h2><p>근거와 서식을 한 번에 묶을 수 있는가?</p><h2>해답</h2><p>근거 연결 편집기로 재작성을 없앤다.</p>"),
        slot("a_market", "시장", "<table><tr><th>지표</th><th>값</th></tr><tr><td>TAM</td><td>4.2조원</td></tr><tr><td>유료 고객사</td><td>37곳</td></tr>"
             "<tr><td>NPS</td><td>71</td></tr></table><p>(출처: 2024 시장조사)</p>"),
        slot("a_ask", "요청", "<p><strong>50억원으로 18개월 안에 고객사 200곳을 확보한다.</strong> 자금의 60%는 영업, 40%는 제품에 쓴다.</p>"),
    ]
    write_ref("ref_eval_invest", "(주)루미나랩스 시리즈A 투자 제안서", inv, PINS["ref_eval_invest"])
    pub = [
        slot("g_meta", "문서 정보", "<table><tr><td>문서번호</td><td>KDA-2025-0412</td><td>보고일자</td><td>2025. 4. 12.</td></tr>"
             "<tr><td>작성 부서</td><td>데이터정책팀</td><td>보안 등급</td><td>내부</td></tr></table>"),
        slot("g_approval", "결재란", "<table><tr><th>담당</th><th>검토</th><th>승인</th></tr><tr><td>주무관</td><td>팀장</td><td>본부장</td></tr></table>"),
        slot("g_summary", "요약", "<p>□ 요약</p><ul><li>회의록 서식을 기관 공통 양식으로 표준화함.</li><li>예산 3.1억원을 2025년 하반기에 집행할 예정임.</li></ul>"),
        slot("g_body", "본문", "<h2>1. 추진 배경</h2><ul><li>부서별 회의록 양식이 달라 결정 사항 추적이 어려움.</li></ul>"
             "<h2>2. 현황 및 문제점</h2><ul><li>결정과 논의가 한 문단에 섞여 기록됨.</li><li>후속 조치 담당이 누락되는 사례가 반복됨.</li></ul>"
             "<h2>3. 개선 방안</h2><ul><li>결정 · 근거 · 후속 조치를 분리한 표준 양식 도입.</li></ul>"
             "<h2>4. 향후 계획</h2><ul><li>시범 운영 후 전 부서 확대 예정임.</li></ul><p>※ 세부 양식은 붙임 참조.</p>"),
    ]
    write_ref("ref_eval_public", "한국데이터진흥원 내부 보고 — 회의록 표준화 추진 계획", pub, PINS["ref_eval_public"])
    blog = [
        slot("c_title", "제목", "<h1>회의록 정리 꿀팁 5가지 🧠</h1>"),
        slot("c_hook", "도입", "<p>회의 끝나고 뭐부터 정리하세요? 🤔 저도 늘 헤맸어요. 오늘은 바로 써먹는 방법만 모았어요!</p>"),
        slot("c_body", "본문", "<h2>1. 결정부터 적어요</h2><p>논의는 나중에 붙여도 돼요.</p><h2>2. 담당자를 바로 박아요</h2><p>이름이 없으면 아무도 안 해요 😅</p>"
             "<h2>3. 숫자는 표로</h2><p>문장 속 숫자는 금방 잊혀요.</p><h2>4. 템플릿을 고정해요</h2><p>매번 새로 만들면 지쳐요.</p>"
             "<h2>5. 하루 안에 공유해요</h2><p>기억이 식기 전에요!</p>"),
        slot("c_cta", "마무리", "<p>지금 노트몽키로 시작해 보세요 👉 무료예요!</p>"),
    ]
    write_ref("ref_eval_blog", "노트몽키 블로그 — 회의록 정리 꿀팁 5가지", blog)


PINS = {
    "ref_eval_invest": [{"pinId": "pinA1", "refId": "ref_eval_invest", "kind": "region", "label": "요약 상자", "page": 1,
                         "bbox": [0, 0, 400, 1000], "layer": "D1",
                         "text": "결론: 루미나랩스는 3년 안에 기업 문서 자동화 시장 1위가 된다.\n- 문제 — 기업 문서의 62%가 다시 쓰인다.\n"
                                         "- 해법 — 서식과 근거를 함께 묶는 편집기.\n- 증거 — 유료 고객사 37곳, NPS 71.\n- 요청 — 시리즈A 50억원."}],
    "ref_eval_public": [{"pinId": "pinB1", "refId": "ref_eval_public", "kind": "region", "label": "문서 정보 · 결재란", "page": 1,
                         "bbox": [0, 0, 300, 1000], "layer": "D3",
                         "text": "문서번호 KDA-2025-0412 | 보고일자 2025. 4. 12. | 작성 부서 데이터정책팀 | 보안 등급 내부\n담당 | 검토 | 승인"}],
}


# --- 리소스 베타: 리서치 볼트 -------------------------------------------------------------------------

BETA_FILES = {
    "research/README.md": "# 리서치 폴더 안내\n\n- interviews/ : 고객 인터뷰 원문 (날짜_인터뷰_회사.md)\n- metrics/ : 월별 지표 요약\n- notes/ : 분석 메모\n",
    "research/interviews/2025-02-03_인터뷰_A사.md": "---\n유형: 인터뷰\n날짜: 2025-02-03\n---\n# A사 인터뷰\n\n- 주간 활성 사용자(WAU)는 1,200명이라고 들었다 (2월 기준, 담당자 구두).\n"
        "- 가장 큰 불편: 회의 직후 결정을 다시 찾는 데 20분 이상 걸린다.\n- 템플릿이 있으면 바로 쓰겠다는 반응.\n",
    "research/interviews/2025-03-10_인터뷰_B사.md": "---\n유형: 인터뷰\n날짜: 2025-03-10\n---\n# B사 인터뷰\n\n- 결정 카드 방식은 좋지만 실행 담당이 빠지면 소용없다.\n"
        "- 보안 때문에 외부 검색은 쓰지 못한다.\n",
    "research/metrics/2025-03_지표_요약.md": "---\n유형: 지표\n기준일: 2025-03-21\n---\n# 3월 지표 요약\n\n| 지표 | 값 |\n|---|---|\n| WAU | 1,450명 |\n"
        "| 템플릿 사용률 | 68% |\n| 첫 문서 완성 평균 | 31분 |\n\n※ WAU 는 제품 로그 기준(3월 3주). 2월 인터뷰의 1,200명은 구두 추정치다.\n",
    "research/notes/경쟁사_비교.md": "# 경쟁사 비교 메모\n\n- N사: 회의 녹음 요약에 강함, 결정 추적 없음.\n- M사: 템플릿 다양, 근거 연결 없음.\n",
    "research/archive/보고서_요약_원래본.md": "# 보고서 요약 (원래본)\n\n이 파일은 작년 연간 보고서의 요약이다. 연간 사용자 성장률 210%.\n",
}


def build_beta() -> None:
    if BETA.exists():
        shutil.rmtree(BETA)
    for rel, text in BETA_FILES.items():
        path = BETA / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def copy_library_refs() -> None:
    """실물 레퍼런스(14쪽 PDF · 표가 많은 7쪽 PDF)를 평가 id 로 복사한다. 긴 레퍼런스에는 표 하나에 핀을 단다."""
    for dst, src in REAL_REFS.items():
        source = LIBRARY / src
        if not source.is_dir():
            print(f"[build] 실물 레퍼런스 없음 — 건너뜀: {src}")
            continue
        target = REFS / dst
        shutil.copytree(source, target)
        meta = json.loads((target / "ref.json").read_text(encoding="utf-8"))
        meta["refId"] = dst
        (target / "ref.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        pins = [dict(p, refId=dst, anchor=f"ref:{dst}#pin:{p.get('pinId')}")
                for p in json.loads((target / "pins.json").read_text(encoding="utf-8") or "[]")] if (target / "pins.json").exists() else []
        if dst == "ref_eval_pm5":
            blocks = json.loads((target / "extraction.json").read_text(encoding="utf-8")).get("blocks") or []
            table = next((b for b in blocks if b.get("kind") == "table" and b.get("bbox") and int(b.get("page") or 1) >= 3), None)
            if table:
                pins = [{"pinId": "pinP1", "refId": dst, "kind": "region", "label": f"{table.get('page')}쪽 표",
                         "page": table.get("page"), "bbox": table.get("bbox"), "layer": "D5", "note": "",
                         "text": "", "anchor": f"ref:{dst}#pin:pinP1"}]
        (target / "pins.json").write_text(json.dumps(pins, ensure_ascii=False, indent=1), encoding="utf-8")


def write_binding(project_id: str, consensus: dict[str, list[dict]] | None = None, refs: list[str] | None = None) -> None:
    """평가 프로젝트의 바인딩 — 사용자가 이미 확정한 해석 카드를 심는다."""
    BINDINGS.mkdir(parents=True, exist_ok=True)
    ids = list(dict.fromkeys([*(refs or []), *(consensus or {}).keys()]))
    entries = [{"refId": rid, "enabled": True, "layers": {}, "consensus": [
        {"status": "confirmed", "by": "user", "at": 1, "evidence": [], "alternatives": [], **card}
        for card in (consensus or {}).get(rid, [])]} for rid in ids]
    (BINDINGS / f"{project_id}.json").write_text(json.dumps({"projectId": project_id, "entries": entries, "updatedAt": 1},
                                                            ensure_ascii=False, indent=1), encoding="utf-8")


def build() -> Path:
    for folder in (DOCS, REFS, BINDINGS):
        if folder.exists():
            shutil.rmtree(folder)
    build_report()
    build_blogpost()
    build_refs()
    copy_library_refs()
    build_beta()
    build_alpha(ALPHA)
    return OUT


if __name__ == "__main__":
    print(build())
