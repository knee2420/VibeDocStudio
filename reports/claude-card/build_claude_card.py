"""클로드 카드 2030 상품안내장 — 한 사이클(뼈대 → 서식 → 채우기)을 실제 API 로 돌린다.

예시 데이터를 치운 뒤(apps/api/data/_archive/20261119_before_claude_card) 이 스크립트 하나로
프로젝트 · 레퍼런스 · 리소스 · 문서를 만든다. 백엔드 로직은 건드리지 않고 공개 API 만 부른다.

    python -I reports/claude-card/build_claude_card.py            # http://localhost:8090

단계마다 문서를 저장하고 이름 붙인 버전을 남긴다 ("1 뼈대" · "2 서식" · "3 채우기") —
앱의 변경 기록에서 사이클을 되짚어 볼 수 있다. 회사 · 상품 · 수치는 모두 지어낸 것이다.
"""
from __future__ import annotations

import json
import sys
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

API = "http://localhost:8090/api"
HERE = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"

PROJECT_ID = "vproj-claude-card"
DOC_ID = "cc-guide-2030"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

REFERENCE_PDFS = [
    ("상품안내장 카드의정석2 PAY_2610.pdf", "우리카드 · 카드의정석2 PAY (10쪽 리플릿)"),
    ("09771__prdctOpmn_20260330.pdf", "KB국민카드 · YOU Prime (4쪽 상품설명서)"),
    ("삼성카드.pdf", "삼성카드 · 트레이더스신세계 (20쪽 소책자)"),
    ("가이드북_제네시스 현대카드.pdf", "현대카드 · 제네시스 가이드북 (14쪽)"),
    ("20260824_가이드북_the Pink Edition3.pdf", "현대카드 · the Pink Edition3 가이드북 (16쪽)"),
    ("ALL Infinite 안내장.pdf", "우리카드 · ALL Infinite (11쪽 프리미엄)"),
    ("752_240161_CBS크리스천카드_20220901.pdf", "우리카드 · CBS크리스천 (2쪽 접지, 2022)"),
    ("국제브랜드서비스안내장(2026)_VISA-P_선택3.pdf", "VISA · 국제브랜드 선택서비스 (2쪽 부속)"),
]

RESOURCES = ["클로드카드_2030_신상품_기획안.md", "혜택_정의서_v1.md"]


# ── HTTP ──────────────────────────────────────────────────────────────

def call(method: str, path: str, body: object | None = None) -> object:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def upload(path: str, file: Path, fields: dict[str, str] | None = None) -> dict:
    boundary = "----vds" + uuid.uuid4().hex
    parts: list[bytes] = []
    for k, v in (fields or {}).items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode("utf-8"))
    ctype = "application/pdf" if file.suffix.lower() == ".pdf" else "text/markdown"
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file.name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode("utf-8")
        + file.read_bytes()
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    req = urllib.request.Request(API + path, data=b"".join(parts), method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


# ── 문서 조립 도우미 ───────────────────────────────────────────────────

class Doc:
    def __init__(self) -> None:
        self.pages: list[dict] = []
        self.slots: dict[str, dict] = {}

    def slot(self, sid: str, label: str, html: str = "", role: str = "editable-slot") -> str:
        self.slots[sid] = {"slotId": sid, "label": label, "role": role, "content": html, "backDataRefs": []}
        return sid

    def page(self, n: int, label: str, blocks: list[dict]) -> dict:
        pid = f"cc_p{n}"
        header = self.slot(f"{pid}_header", "머리말", "<p>클로드 카드 2030 · 상품안내장</p>")
        footer = self.slot(f"{pid}_footer", "바닥글", f"<p>클로드 카드 고객센터 1600-2030 · {n} / 8</p>")
        page = {"pageId": pid, "pageNumber": n, "pageLabel": label, "headerSlotId": header, "footerSlotId": footer, "blocks": blocks}
        self.pages.append(page)
        return page

    def payload(self, title: str) -> dict:
        return {
            "version": "1.0.0",
            "docId": DOC_ID,
            "title": title,
            "status": "Draft",
            "totalValueText": f"A4 {len(self.pages)}쪽 · 상품안내장",
            "updatedAt": NOW,
            "variables": {"Product.Name": "클로드 카드 2030", "Company.Name": "클로드 카드", "Launch.Date": "2027년 3월 2일"},
            "pages": self.pages,
            "slots": self.slots,
            "backdata": {},
            "totalPages": len(self.pages),
        }


def table(d: Doc, bid: str, title: str, widths: list[str], rows: list[list[str]], header: bool = True) -> dict:
    out = []
    for r, cells in enumerate(rows):
        out.append(
            {
                "rowId": f"{bid}_r{r}",
                "cells": [
                    {"cellId": f"{bid}_c{r}{c}", "slotId": d.slot(f"{bid}_s{r}{c}", f"{title} {r + 1}행 {c + 1}열", html), **({"isHeader": True} if header and r == 0 else {})}
                    for c, html in enumerate(cells)
                ],
            }
        )
    return {"blockId": bid, "kind": "structured-table", "title": title, "columnWidths": widths, "tableVariant": "bordered", "rows": out}


def heading(d: Doc, bid: str, title: str, html: str) -> dict:
    # 본문이 왼쪽 정렬이므로 제목도 왼쪽 — 한 쪽 안에서 정렬 기준선은 하나 (디자인 책: 정렬)
    return {"blockId": bid, "kind": "heading", "title": title, "slotId": d.slot(f"{bid}_s", title, html), "level": 2, "decoration": "bar", "align": "left"}


def text(d: Doc, bid: str, title: str, html: str) -> dict:
    return {"blockId": bid, "kind": "text", "title": title, "slotId": d.slot(f"{bid}_s", title, html)}


def callout(d: Doc, bid: str, title: str, html: str, tone: str = "info") -> dict:
    return {"blockId": bid, "kind": "callout-box", "title": title, "slotId": d.slot(f"{bid}_s", title, html), "tone": tone}


def grid(d: Doc, bid: str, title: str, cards: list[tuple[str, str]]) -> dict:
    return {
        "blockId": bid,
        "kind": "columns-grid",
        "title": title,
        "widths": ["1fr"] * len(cards),
        "cardStyle": "card",
        "gap": 12,
        "slotIds": [d.slot(f"{bid}_s{i}", name, html) for i, (name, html) in enumerate(cards)],
    }


def hero(d: Doc, bid: str, title_html: str, sub_html: str) -> dict:
    return {
        "blockId": bid,
        "kind": "hero",
        "title": "표지",
        "titleSlotId": d.slot(f"{bid}_title", "상품명", title_html),
        "subtitleSlotId": d.slot(f"{bid}_sub", "한 줄 소개", sub_html),
        "height": 420,
        "align": "left",
        "overlay": 0.2,
    }


# ── 1 뼈대: 아웃라인 (Phase 1) ───────────────────────────────────────────

OUTLINE = [
    # (쪽, 이름, 요약 — 어떤 레퍼런스를 따랐나)
    (1, "표지 · 한 줄 약속", "상품명 · 한 줄 소개 · 혜택 셋 — 표지에 혜택을 띄운 건 KB · 현대 방식"),
    (2, "혜택 한눈에", "다섯 혜택을 표 한 장으로 — 삼성 '서비스 제공 기준' · 현대 '혜택' 쪽"),
    (3, "구독 · 간편결제 할인", "2030 지출 1 · 2위 — 우리 PAY 의 결제 수단별 묶음"),
    (4, "라이프 팩 — 매달 하나 고르기", "배달 · 카페 · 운동 팩 택1 — KB YOU Prime 의 팩 선택형"),
    (5, "여행 · 해외", "해외 수수료 면제 · 공항 라운지 — 현대 '우대 서비스'"),
    (6, "실적 기준 · 할인 제외", "실적 구간 · 제외 대상 · 첫 카드 응원 — 우리 PAY 5–6쪽"),
    (7, "연회비 · 발급 안내", "연회비 표 · 캐시백 · 반환 규정 · 모바일 단독"),
    (8, "꼭 알아 두세요", "부가서비스 변경 · 이용 유의사항 · 연체이자율 · 고객센터 · 심의필 (법정 · 공통 문구)"),
]


def build_skeleton() -> Doc:
    d = Doc()
    for n, name, summary in OUTLINE:
        d.page(n, name, [heading(d, f"cc_p{n}_h", name, f"<p>{name}</p>"), text(d, f"cc_p{n}_intent", "이 쪽에서 말할 것", f"<p>{summary}</p>")])
    return d


def storyline_nodes() -> list[dict]:
    base = {"targetBlockId": None, "targetSlotId": None, "provenanceSourceProjectId": None, "provenanceSourceNodeId": None, "aiStatus": "idle"}
    nodes = [
        {**base, "nodeId": "cc-root", "parentId": None, "depth": 0, "zoomLevel": "project", "title": "클로드 카드 2030 출시", "summary": "2030 첫 신용카드 — 상품안내장 A4 8쪽", "targetDocId": None, "targetPageId": None, "recommendedTemplateId": None},
        {**base, "nodeId": "cc-doc", "parentId": "cc-root", "depth": 1, "zoomLevel": "document", "title": "클로드 카드 2030 상품안내장", "summary": "다른 카드사 안내장 8종을 레퍼런스로, 기획안 · 혜택 정의서를 근거로", "targetDocId": DOC_ID, "targetPageId": None, "recommendedTemplateId": None},
    ]
    for n, name, summary in OUTLINE:
        nodes.append({**base, "nodeId": f"cc-page-{n}", "parentId": "cc-doc", "depth": 2, "zoomLevel": "page", "title": name, "summary": summary, "targetDocId": DOC_ID, "targetPageId": f"cc_p{n}", "recommendedTemplateId": None})
    return nodes


# ── 2 서식 · 3 채우기: 같은 조립, 내용만 다르다 ─────────────────────────────

def build_full(filled: bool) -> Doc:
    d = Doc()
    f = (lambda html: html) if filled else (lambda html: "")

    d.page(1, "표지 · 한 줄 약속", [
        hero(d, "cc_p1_hero", f("<p>클로드 카드 <strong>2030</strong></p>"), f("<p>내 하루에 맞춰 매달 바꾸는, 처음 만드는 신용카드</p>")),
        grid(d, "cc_p1_three", "핵심 혜택 셋", [
            ("구독 30%", f("<p><strong>구독 30%</strong></p><p>OTT · 음악 · 생산성 정기결제</p>")),
            ("라이프 팩 10%", f("<p><strong>라이프 팩 10%</strong></p><p>배달 · 카페 · 운동 중 매달 하나</p>")),
            ("해외 수수료 0원", f("<p><strong>해외 수수료 0원</strong></p><p>국제브랜드 · 해외서비스 수수료 면제</p>")),
        ]),
        text(d, "cc_p1_note", "표지 안내", f("<p>이 안내장은 2027년 3월 출시 기준입니다. 자세한 조건은 각 쪽과 8쪽 '꼭 알아 두세요'를 확인하세요.</p>")),
    ])

    d.page(2, "혜택 한눈에", [
        heading(d, "cc_p2_h", "혜택 한눈에", f("<p>혜택 한눈에</p>")),
        table(d, "cc_p2_t", "혜택 요약표", ["26%", "18%", "34%", "22%"], [
            [f("<p>혜택</p>"), f("<p>할인 · 제공</p>"), f("<p>월 한도 (1 · 2 · 3구간)</p>"), f("<p>조건</p>")],
            [f("<p>구독 할인</p>"), f("<p>30%</p>"), f("<p>5천원 · 8천원 · 1만 2천원</p>"), f("<p>정기결제 등록</p>")],
            [f("<p>간편결제 할인</p>"), f("<p>5–10%</p>"), f("<p>6천원 · 1만원 · 1만 5천원</p>"), f("<p>구독과 중복 불가</p>")],
            [f("<p>라이프 팩</p>"), f("<p>10%</p>"), f("<p>5천원 · 8천원 · 1만원</p>"), f("<p>매달 하나 고르기</p>")],
            [f("<p>해외 이용 수수료</p>"), f("<p>면제</p>"), f("<p>한도 없음</p>"), f("<p>실적 조건 없음</p>")],
            [f("<p>공항 라운지</p>"), f("<p>연 2회</p>"), f("<p>—</p>"), f("<p>전월 60만원 이상</p>")],
        ]),
        callout(d, "cc_p2_tier", "실적 구간 안내", f("<p><strong>실적 구간</strong> 1구간 30–60만원 · 2구간 60–100만원 · 3구간 100만원 이상 (전월 이용금액). 30만원 미만이면 할인이 없어요. 자세한 기준은 6쪽.</p>"), "info"),
        heading(d, "cc_p2_h2", "이런 분께 맞아요", f("<p>이런 분께 맞아요</p>")),
        grid(d, "cc_p2_persona", "이런 분께", [
            ("구독러", f("<p><strong>구독이 많은 분</strong></p><p>OTT · 음악 · 생산성 구독을 이 카드 하나로 모으면 매달 30%</p>")),
            ("배달 · 카페러", f("<p><strong>배달 · 카페가 잦은 분</strong></p><p>라이프 팩을 배달이나 카페로 고르고 간편결제를 함께</p>")),
            ("여행러", f("<p><strong>해외 결제가 있는 분</strong></p><p>해외 수수료 0원, 전월 60만원이면 라운지 연 2회</p>")),
        ]),
        table(d, "cc_p2_example", "한 달 예시", ["44%", "28%", "28%"], [
            [f("<p>2구간(전월 70만원) 예시</p>"), f("<p>이번 달 쓴 돈</p>"), f("<p>할인 (한도 적용)</p>")],
            [f("<p>구독 (OTT 2개 · 음악 · 노션)</p>"), f("<p>4만원</p>"), f("<p>8천원</p>")],
            [f("<p>간편결제 (클로드페이 위주)</p>"), f("<p>15만원</p>"), f("<p>1만원</p>")],
            [f("<p>라이프 팩 · 배달</p>"), f("<p>9만원</p>"), f("<p>8천원</p>")],
            [f("<p><strong>한 달 합계</strong></p>"), f("<p><strong>28만원</strong></p>"), f("<p><strong>2만 6천원</strong></p>")],
        ]),
    ])

    d.page(3, "구독 · 간편결제 할인", [
        heading(d, "cc_p3_h1", "구독 할인 30%", f("<p>구독 할인 30%</p>")),
        table(d, "cc_p3_t1", "구독 대상", ["30%", "46%", "24%"], [
            [f("<p>영역</p>"), f("<p>대상</p>"), f("<p>건당 한도</p>")],
            [f("<p>OTT</p>"), f("<p>넷플릭스 · 티빙 · 디즈니+ · 웨이브</p>"), f("<p>5천원</p>")],
            [f("<p>음악</p>"), f("<p>멜론 · 스포티파이 · 유튜브 프리미엄</p>"), f("<p>5천원</p>")],
            [f("<p>생산성</p>"), f("<p>노션 · 클로드 Pro · 어도비</p>"), f("<p>5천원</p>")],
        ]),
        text(d, "cc_p3_sub_cond", "구독 조건", f("<p>공식 홈페이지 · 앱에서 이 카드로 등록한 정기결제만 할인돼요. 앱 마켓(구글 플레이 · 앱스토어) 인앱결제와 1회 결제는 제외예요.</p>")),
        heading(d, "cc_p3_h2", "간편결제 할인", f("<p>간편결제 할인</p>")),
        table(d, "cc_p3_t2", "간편결제 대상", ["50%", "20%", "30%"], [
            [f("<p>결제 수단</p>"), f("<p>할인율</p>"), f("<p>통합 월 한도</p>")],
            [f("<p>클로드페이</p>"), f("<p>10%</p>"), f("<p>6천원 · 1만원 · 1만 5천원</p>")],
            [f("<p>네이버페이 · 카카오페이 · 토스페이</p>"), f("<p>5%</p>"), f("<p>위와 통합</p>")],
        ]),
        callout(d, "cc_p3_dup", "중복 적용", f("<p>구독 할인 대상 가맹점은 간편결제 할인에서 빠져요 (중복 불가). 건당 할인한도 2천원.</p>"), "warning"),
    ])

    d.page(4, "라이프 팩 — 매달 하나 고르기", [
        heading(d, "cc_p4_h", "라이프 팩", f("<p>라이프 팩 — 이번 달 내 생활에 맞게</p>")),
        text(d, "cc_p4_lead", "라이프 팩 소개", f("<p>배달 · 카페 · 운동 중 하나를 고르면 그 영역에서 10% 할인돼요. 클로드 카드 앱에서 매달 말일까지 다음 달 팩을 바꿀 수 있어요.</p>")),
        grid(d, "cc_p4_packs", "팩 세 가지", [
            ("배달 팩", f("<p><strong>배달 팩 10%</strong></p><p>배달의민족 · 쿠팡이츠 · 요기요</p><p>앱 안에서 카드로 결제한 주문만</p>")),
            ("카페 팩", f("<p><strong>카페 팩 10%</strong></p><p>스타벅스 · 메가MGC커피 · 투썸플레이스</p><p>매장 · 앱 주문 모두</p>")),
            ("운동 팩", f("<p><strong>운동 팩 10%</strong></p><p>헬스 · 필라테스 · 요가 업종, 클래스101</p><p>정기권 · 1회권 모두</p>")),
        ]),
        table(d, "cc_p4_limit", "라이프 팩 월 한도", ["40%", "20%", "20%", "20%"], [
            [f("<p>전월 실적</p>"), f("<p>1구간</p>"), f("<p>2구간</p>"), f("<p>3구간</p>")],
            [f("<p>월 할인한도</p>"), f("<p>5천원</p>"), f("<p>8천원</p>"), f("<p>1만원</p>")],
        ]),
        callout(d, "cc_p4_tip", "팩 바꾸기", f("<p>고르지 않으면 지난달 팩이 이어져요. 처음 발급하면 배달 팩으로 시작해요.</p>"), "info"),
    ])

    d.page(5, "여행 · 해외", [
        heading(d, "cc_p5_h", "여행 · 해외", f("<p>여행 · 해외</p>")),
        table(d, "cc_p5_t", "해외 혜택", ["30%", "45%", "25%"], [
            [f("<p>항목</p>"), f("<p>내용</p>"), f("<p>조건</p>")],
            [f("<p>해외 이용 수수료</p>"), f("<p>국제브랜드 수수료 1% · 해외서비스 수수료 0.25% 면제</p>"), f("<p>조건 없음</p>")],
            [f("<p>공항 라운지</p>"), f("<p>국내외 공항 라운지 연 2회 (본인)</p>"), f("<p>전월 60만원 이상</p>")],
        ]),
        text(d, "cc_p5_calc", "청구금액 산출", f("<p>해외 이용 시 청구금액 = 거래미화금액 × 접수일 전신환 매도율. 이 카드는 수수료를 면제해 이 금액만 청구돼요. 해외에서는 원화 대신 현지통화로 결제하세요.</p>")),
        callout(d, "cc_p5_dcc", "원화결제 차단", f("<p>해외 가맹점에서 원화로 결제하면 추가 수수료가 붙을 수 있어요. 앱 › 해외 이용 설정 › 원화결제 차단을 켜 두세요.</p>"), "warning"),
        heading(d, "cc_p5_h2", "떠나기 전에", f("<p>떠나기 전에 세 가지</p>")),
        grid(d, "cc_p5_tips", "해외 이용 팁", [
            ("PIN 확인", f("<p><strong>1. 비밀번호(PIN) 확인</strong></p><p>일부 해외 가맹점 · ATM 은 IC 비밀번호를 물어요. 6자리를 요구하면 카드 비밀번호 4자리 뒤에 00</p>")),
            ("현지통화 결제", f("<p><strong>2. 현지통화로 결제</strong></p><p>원화 결제를 고르면 환전 수수료가 한 번 더 붙어요</p>")),
            ("라운지 입장", f("<p><strong>3. 라운지 입장</strong></p><p>앱 › 혜택 › 공항 라운지에서 이용권 QR 을 띄워 실물 카드와 함께 보여 주세요</p>")),
        ]),
        text(d, "cc_p5_atm", "해외 ATM 인출", f("<p>해외 ATM 에서 현금을 찾으면 건당 2달러의 해외 인출 수수료가 붙어요 (수수료 면제 대상 아님). 국가 사정에 따라 현금서비스가 어려울 수 있으니 다른 결제수단도 챙기세요.</p>")),
    ])

    d.page(6, "실적 기준 · 할인 제외", [
        heading(d, "cc_p6_h", "실적 기준", f("<p>실적 기준 · 할인 제외</p>")),
        table(d, "cc_p6_t", "실적 구간", ["34%", "66%"], [
            [f("<p>구간</p>"), f("<p>전월 이용금액 (1일–말일, 승인일 기준)</p>")],
            [f("<p>1구간</p>"), f("<p>30만원 이상 60만원 미만</p>")],
            [f("<p>2구간</p>"), f("<p>60만원 이상 100만원 미만</p>")],
            [f("<p>3구간</p>"), f("<p>100만원 이상</p>")],
        ]),
        text(d, "cc_p6_ex", "실적 · 할인 제외 대상", f("<p>무이자할부 · 단기카드대출(현금서비스) · 장기카드대출(카드론) · 각종 수수료와 이자 · 연회비 · 국세 · 지방세 · 공과금 · 아파트 관리비 · 상품권과 선불카드 충전 · 취소 매출은 실적과 할인에서 빠져요. 할인받은 이용금액도 실적에 넣지 않아요.</p>")),
        callout(d, "cc_p6_first", "첫 카드 응원", f("<p><strong>첫 카드 응원</strong> 처음 발급받은 달과 그다음 달은 전월 실적이 없어도 1구간 혜택을 드려요. 유효기간 만료 · 해지 뒤 다시 발급받으면 해당되지 않아요.</p>"), "info"),
        heading(d, "cc_p6_h2", "실적 계산 예시", f("<p>실적 계산 예시</p>")),
        table(d, "cc_p6_calc", "실적 계산 예시", ["46%", "22%", "32%"], [
            [f("<p>이번 달 쓴 곳</p>"), f("<p>금액</p>"), f("<p>실적에 들어가나</p>")],
            [f("<p>카페 · 식당 · 쇼핑</p>"), f("<p>42만원</p>"), f("<p>들어가요</p>")],
            [f("<p>노트북 무이자할부 (첫 달)</p>"), f("<p>20만원</p>"), f("<p>빠져요 (무이자할부)</p>")],
            [f("<p>아파트 관리비</p>"), f("<p>15만원</p>"), f("<p>빠져요</p>")],
            [f("<p>구독 할인받은 결제</p>"), f("<p>4만원</p>"), f("<p>빠져요 (할인받은 금액)</p>")],
            [f("<p><strong>다음 달 실적</strong></p>"), f("<p><strong>42만원</strong></p>"), f("<p><strong>1구간 혜택</strong></p>")],
        ]),
    ])

    d.page(7, "연회비 · 발급 안내", [
        heading(d, "cc_p7_h", "연회비", f("<p>연회비 · 발급 안내</p>")),
        table(d, "cc_p7_t", "연회비", ["40%", "60%"], [
            [f("<p>구분</p>"), f("<p>연회비</p>")],
            [f("<p>국내전용</p>"), f("<p>12,000원 (기본 2,000 + 제휴 10,000)</p>")],
            [f("<p>해외겸용 Mastercard</p>"), f("<p>15,000원 (기본 5,000 + 제휴 10,000)</p>")],
            [f("<p>모바일 단독</p>"), f("<p>8,000원 (기본 0 + 제휴 8,000)</p>")],
        ]),
        callout(d, "cc_p7_cashback", "연회비 캐시백", f("<p>발급 후 3개월 안에 누적 50만원 이상 쓰면 첫 해 연회비를 돌려드려요.</p>"), "info"),
        text(d, "cc_p7_refund", "연회비 반환", f("<p>유효기간 전에 해지하면 해지한 날부터 남은 기간을 일할 계산해 돌려드려요. 카드 발급 · 배송 비용과 이미 제공된 부가서비스 비용은 빼고, 해지일로부터 10영업일 안에 반환해요.</p>")),
        text(d, "cc_p7_mobile", "모바일 단독 카드", f("<p>모바일 단독 카드는 실물 카드 없이 클로드페이 · 간편결제에 등록해 쓰는 카드예요. 같은 상품의 실물 카드와 동시에 가질 수 없어요.</p>")),
    ])

    d.page(8, "꼭 알아 두세요", [
        heading(d, "cc_p8_h", "꼭 알아 두세요", f("<p>꼭 알아 두세요</p>")),
        text(d, "cc_p8_change", "부가서비스 변경", f("<p><strong>출시일</strong> 2027년 3월 2일. 할인 등 부가서비스는 출시 후 3년 이상 줄이거나 없애지 않아요. 다만 카드사 · 제휴사의 휴업 · 파산 등 불가피한 경우와 3년 이상 제공한 뒤 수익성이 크게 낮아진 경우에는 바뀔 수 있고, 바뀌면 그 이유와 내용을 서로 다른 두 가지 이상의 방법으로 미리 알려 드려요.</p>")),
        text(d, "cc_p8_notice", "이용 유의사항", f("<p>금융소비자는 금융소비자보호법 제19조 제1항에 따라 상품 설명을 받을 권리가 있어요. 설명을 충분히 이해한 뒤 거래하세요. 상환능력에 비해 카드 사용액이 많으면 개인신용평점이 내려갈 수 있어요.</p>")),
        text(d, "cc_p8_late", "연체이자율", f("<p>연체이자율은 회원별 · 이용상품별 정상이자율 + 연 3%p 이내이며 법정 최고금리(연 20%)를 넘지 않아요.</p>")),
        text(d, "cc_p8_etc", "기타 안내", f("<p>신용카드를 필요 이상 여러 장 발급받으면 개인신용평점 · 이용한도에 영향을 줄 수 있어요. 결제계좌 기관의 마감시간(16시) 뒤 입금한 금액은 당일 출금되지 않아 연체될 수 있으니, 앱의 즉시결제로 당일 결제하세요. 개인신용평점이 낮으면 카드 발급이 제한될 수 있어요.</p>")),
        text(d, "cc_p8_detail", "자세한 조건", f("<p>자세한 혜택과 이용 조건은 카드를 발급받기 전에 홈페이지 · 상품설명서 · 약관에서 확인하세요. 이 안내장은 2027년 3월 기준이며, 법령과 내부통제기준에 따른 절차를 거쳐 제공돼요.</p>")),
        callout(d, "cc_p8_contact", "고객센터 · 심의필", f("<p>고객센터 1600-2030 · 분실신고 1600-2031 · www.claudecard.example<br>여신금융협회 심의필 제 2027-○○○○호 (심의 후 기재)</p>"), "neutral"),
    ])
    return d


# ── AI 검토 대기 (Phase 3): 승인 전 초안 두 개 — 하나는 근거 없는 숫자 ──────────

def staged_changes() -> list[dict]:
    base = {"phase": "drafting", "docId": DOC_ID, "sourceReferenceIds": [], "createdAt": NOW, "targetKind": "slot-html"}
    return [
        {
            **base,
            "diffId": "cc-diff-p3-limit",
            "targetId": "cc_p3_t2_s13",
            "title": "간편결제 월 한도 표현 다듬기",
            "beforeSummary": "6천원 · 1만원 · 1만 5천원",
            "afterSummary": "6천원 · 1만원 · 2만원",
            "payload": {"slotId": "cc_p3_t2_s13", "html": "<p>6천원 · 1만원 · 2만원</p>"},
            "warnings": ["근거 없는 숫자: 3구간 '2만원'은 혜택 정의서 표 2(1만 5천원)와 다름"],
        },
        {
            **base,
            "diffId": "cc-diff-p4-lead",
            "targetId": "cc_p4_lead_s",
            "title": "라이프 팩 소개를 2030 말투로",
            "beforeSummary": "배달 · 카페 · 운동 중 하나를 고르면…",
            "afterSummary": "이번 달은 배달? 카페? 운동? 하나만 골라요…",
            "payload": {"slotId": "cc_p4_lead_s", "html": "<p>이번 달은 배달? 카페? 운동? 하나만 고르면 그 영역에서 10% 할인돼요. 다음 달 팩은 매달 말일까지 앱에서 바꿀 수 있어요.</p>"},
            "warnings": [],
        },
    ]


def mark_filled(d: Doc, unverified: set[str]) -> None:
    """채운 칸에 채움 기록: AI 가 리소스 · 레퍼런스로 썼고, 대부분은 사람이 확인함."""
    for sid, s in d.slots.items():
        if not s["content"] or sid.endswith(("_header", "_footer")):
            continue
        s["fill"] = {"author": "ai", "harnessId": "claude-card-cycle", "runId": "cc-cycle-1", "at": NOW, **({} if sid in unverified else {"verifiedAt": NOW})}
        s["isEdited"] = True


def save(d: Doc, title: str, note: str) -> int:
    try:
        current = call("GET", f"/documents/{DOC_ID}")
        rev = current["document"]["revision"] if isinstance(current, dict) and "document" in current else None
    except Exception:
        rev = None
    author = "ai" if note.startswith("3") else "human"
    changes = [{"slotIds": [k for k, v in d.slots.items() if v["content"]][:400], "author": author, "harnessId": "claude-card-cycle" if author == "ai" else None, "runId": "cc-cycle-1" if author == "ai" else None, "label": note}] if rev else []
    res = call("PUT", f"/documents/{DOC_ID}", {"document": d.payload(title), "baseRevision": rev, "changes": changes})
    return res["document"]["revision"] if isinstance(res, dict) and "document" in res else -1


def version(name: str, note: str) -> None:
    call("POST", f"/documents/{DOC_ID}/versions", {"name": name, "note": note, "kind": "named"})


def main() -> None:
    title = "클로드 카드 2030 상품안내장"
    if "--only-fill" in sys.argv:
        # 채운 문서만 다시 저장 (레퍼런스 · 리소스를 두 번 올리지 않는다)
        filled = build_full(True)
        mark_filled(filled, unverified={"cc_p5_calc_s", "cc_p6_ex_s", "cc_p7_refund_s"})
        print("rev", save(filled, title, "3 채우기: 쪽 균형 · 정렬 다듬음 (혜택 한눈에 — 이런 분께 · 한 달 예시)"))
        version("3 채우기 · 다듬음", "제목 왼쪽 정렬 · 2쪽에 이런 분께 · 한 달 예시")
        call("PUT", f"/projects/{PROJECT_ID}/staging", {"changes": staged_changes()})
        return

    # 프로젝트부터 (저장소가 비면 서버가 예전 시드를 다시 심으므로)
    call("PUT", f"/projects/{PROJECT_ID}", {"title": "클로드 카드 2030 출시", "description": "2030 첫 신용카드 상품안내장 (A4 8쪽) — 다른 카드사 안내장 8종 참고", "activePhase": "storylining", "docIds": [DOC_ID], "storylineNodes": storyline_nodes(), "provenanceLineage": []})
    print("project ok")

    # 레퍼런스: 다른 카드사 안내장 (레퍼런스 수집 파이프라인 그대로)
    for fname, label in REFERENCE_PDFS:
        p = DOWNLOADS / fname
        if not p.is_file():
            print("  skip (없음)", fname)
            continue
        item = upload("/reference/items/file", p, {"title": label})
        ref_id = item.get("refId") or item.get("id")
        if ref_id:
            call("PUT", f"/reference/projects/{PROJECT_ID}/items/{ref_id}")
        print("  reference", label, ref_id)

    # 리소스: 기획안 · 혜택 정의서 (리소스 매니저 원장 그대로)
    for fname in RESOURCES:
        upload(f"/resources/{PROJECT_ID}/upload-file", HERE / "resources" / fname)
        print("  resource", fname)

    # 1 뼈대
    print("rev", save(build_skeleton(), title, "1 뼈대: 레퍼런스 8종을 보고 8쪽 목차를 짬"))
    version("1 뼈대", "8쪽 목차와 쪽마다 말할 것")

    # 2 서식
    call("PUT", f"/projects/{PROJECT_ID}", {"title": "클로드 카드 2030 출시", "description": "2030 첫 신용카드 상품안내장 (A4 8쪽) — 다른 카드사 안내장 8종 참고", "activePhase": "templating", "docIds": [DOC_ID], "storylineNodes": storyline_nodes(), "provenanceLineage": []})
    print("rev", save(build_full(False), title, "2 서식: 쪽마다 표지 · 표 · 카드 · 안내 상자를 놓음 (빈 칸)"))
    version("2 서식", "블록 배치 — 칸은 비어 있음")

    # 3 채우기
    filled = build_full(True)
    mark_filled(filled, unverified={"cc_p5_calc_s", "cc_p6_ex_s", "cc_p7_refund_s"})
    call("PUT", f"/projects/{PROJECT_ID}", {"title": "클로드 카드 2030 출시", "description": "2030 첫 신용카드 상품안내장 (A4 8쪽) — 다른 카드사 안내장 8종 참고", "activePhase": "drafting", "docIds": [DOC_ID], "storylineNodes": storyline_nodes(), "provenanceLineage": []})
    print("rev", save(filled, title, "3 채우기: 기획안 · 혜택 정의서로 채움, 법정 문구는 레퍼런스 구조를 따라 새로 씀"))
    version("3 채우기", "채움 — 확인 안 한 칸 3 · AI 검토 대기 2")
    call("PUT", f"/projects/{PROJECT_ID}/staging", {"changes": staged_changes()})
    print("staging ok")


if __name__ == "__main__":
    sys.exit(main())
