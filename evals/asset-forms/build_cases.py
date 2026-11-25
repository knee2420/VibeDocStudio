"""처음 보는 양식 평가 코퍼스 만들기.

각 사례 = 양식 HTML(예시 값이 채워진 모습) → PNG 렌더 + 정답 에셋(vibe-asset/3) + 유사 데이터 과제.
에이전트는 PNG 만 본다 (HTML · 정답은 보지 않는다). 새 사례는 CASES 에 하나 더하거나,
cases/<id>/ 폴더에 form.png + truth.json (+ case.json) 을 직접 넣으면 된다.

실행:  python evals/asset-forms/build_cases.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent
CASES_DIR = ROOT / "cases"

CSS = """
body{font-family:sans-serif;font-size:10.5pt;color:#222}
h1{font-size:18pt;margin:0 0 6px 0} h2{font-size:14pt;margin:10px 0 6px 0} h3{font-size:12pt;margin:8px 0 4px 0}
table{border-collapse:collapse;width:100%;margin:6px 0}
td,th{border:1px solid #444;padding:4px 6px;vertical-align:middle}
th{background:#e8edf5;font-weight:bold}
.frame{border:1px solid #9bb;background:#f2f7f7;padding:6px 10px;margin:6px 0}
.tip{border-left:4px solid #e0a030;background:#fff6e5;padding:5px 10px;margin:6px 0}
.quote{border-left:4px solid #557;padding:4px 12px;margin:8px 0;color:#335}
.muted{color:#666;font-size:9pt}
.cap{color:#555;font-size:9pt;text-align:center}
"""


def photo(name: str, label: str, w: int = 240, h: int = 160) -> str:
    """회색 사진 자리 PNG."""
    path = CASES_DIR / "_img" / f"{name}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        doc = pymupdf.open()
        page = doc.new_page(width=w, height=h)
        page.draw_rect(page.rect, color=(0.6, 0.6, 0.6), fill=(0.85, 0.87, 0.9))
        page.insert_textbox(pymupdf.Rect(0, h / 2 - 12, w, h / 2 + 12), f"PHOTO {label}", fontsize=14, align=1, color=(0.35, 0.35, 0.4))
        page.get_pixmap(dpi=72).save(str(path))
    return f"{name}.png"


def F(id: str, type: str = "text", hint: str | None = None, **kw) -> dict:
    f = {"id": id, "type": type}
    if hint:
        f["hint"] = hint
    f.update(kw)
    return f


def L(role: str, text: str, **kw) -> dict:
    return {"role": role, "text": text, **kw}


def V(field: dict, role: str = "value", **kw) -> dict:
    return {"role": role, "field": field, **kw}


def asset(title: str, nodes: list, scope: str = "element") -> dict:
    return {"schema": "vibe-asset/3", "assetId": "truth", "title": title, "scope": scope, "nodes": nodes}


CASES: list[dict] = []

# 1 회의록 — 키-값 머리 표 + 안건 반복 표 + 서명란
CASES.append(
    {
        "id": "meeting-minutes",
        "tags": ["table", "kv", "repeat", "form"],
        "html": """
<h1 style="text-align:center">회 의 록</h1>
<table><tr><th>일시</th><td>2026. 3. 4. 14:00</td><th>장소</th><td>3층 회의실</td></tr>
<tr><th>참석자</th><td colspan="3">김민수, 이서연, 박지훈</td></tr></table>
<table><tr><th>번호</th><th>안건</th><th>결정사항</th><th>담당</th></tr>
<tr><td>1</td><td>2분기 예산</td><td>원안 승인</td><td>김민수</td></tr>
<tr><td>2</td><td>채용 계획</td><td>2명 추가 채용</td><td>이서연</td></tr>
<tr><td>3</td><td>사무실 이전</td><td>다음 회의에서 재논의</td><td>박지훈</td></tr></table>
<table><tr><th>작성자</th><td>이서연</td><th>확인자</th><td>김민수</td></tr></table>
""",
        "truth": asset(
            "회의록",
            [
                {"t": "label", "role": "title", "text": "회 의 록", "variant": "h1"},
                {
                    "t": "grid",
                    "component": "table",
                    "rows": [
                        {"cells": [L("label", "일시"), V(F("datetime", "date", "일시")), L("label", "장소"), V(F("place", "text", "장소"))]},
                        {"cells": [L("label", "참석자"), V(F("attendees", "text", "참석자"), cs=3)]},
                    ],
                },
                {
                    "t": "grid",
                    "component": "table",
                    "rows": [
                        {"cells": [L("column-header", "번호"), L("column-header", "안건"), L("column-header", "결정사항"), L("column-header", "담당")]},
                        {"repeat": "rows", "cells": [V(F("no", "number", "번호")), V(F("agenda", "text", "안건")), V(F("decision", "text", "결정사항")), V(F("owner", "text", "담당"))]},
                    ],
                },
                {"t": "grid", "component": "table", "rows": [{"cells": [L("label", "작성자"), V(F("writer", "text", "작성자")), L("label", "확인자"), V(F("checker", "text", "확인자"))]}]},
            ],
        ),
        "similar": {
            "text": "회의 날짜는 4월 2일 오전 10시, 장소는 본사 대회의실이었다. 참석: 정하늘, 오세훈, 한지민, 윤도현. 안건 4건: (1) 신제품 출시일 → 5월 20일 확정, 담당 오세훈 (2) 홍보 예산 → 10% 증액, 담당 한지민 (3) 고객 설문 → 다음 주 발송, 담당 윤도현 (4) 서버 교체 → 보류, 담당 정하늘. 회의록 작성은 한지민, 확인은 정하늘.",
            "expect": {"repeat": {"rows": 4}, "filled_min": 6},
        },
    }
)

# 2 상품 카드 3개 — 반복 카드 (사진 + 이름 + 설명 + 가격)
CASES.append(
    {
        "id": "product-cards",
        "tags": ["image", "repeat", "cards"],
        "html": f"""
<h2>이번 주 추천 상품</h2>
<table style="border:none"><tr>
<td style="border:none;width:33%"><img src="{photo('p1','A')}" width="170"/><h3>무선 이어폰 X2</h3><p>노이즈 캔슬링, 30시간 재생</p><p><b>89,000원</b></p></td>
<td style="border:none;width:33%"><img src="{photo('p2','B')}" width="170"/><h3>스마트 워치 S</h3><p>심박 · 수면 측정, 방수</p><p><b>159,000원</b></p></td>
<td style="border:none;width:33%"><img src="{photo('p3','C')}" width="170"/><h3>휴대용 충전기</h3><p>20000mAh, 고속 충전</p><p><b>39,000원</b></p></td>
</tr></table>
""",
        "truth": asset(
            "추천 상품 카드",
            [
                {"t": "field", "role": "heading", "field": F("section_title", "text", "섹션 제목"), "variant": "h2"},
                {
                    "t": "repeat",
                    "id": "products",
                    "children": [
                        {
                            "t": "container",
                            "component": "card",
                            "children": [
                                {"t": "field", "role": "image", "field": F("photo", "image", "상품 사진")},
                                {"t": "field", "role": "heading", "field": F("name", "text", "상품명"), "variant": "h3"},
                                {"t": "field", "role": "body", "field": F("desc", "text", "설명")},
                                {"t": "field", "role": "value", "field": F("price", "currency", "가격")},
                            ],
                        }
                    ],
                },
            ],
            "section",
        ),
        "similar": {
            "text": "신상품 4종 소개: 블루투스 스피커 (방수, 12시간 재생, 49,000원), 기계식 키보드 (적축, RGB, 129,000원), 무선 마우스 (저소음, 29,000원), 노트북 거치대 (알루미늄, 각도 조절, 35,000원). 섹션 제목은 '신상품 소개'.",
            "expect": {"repeat": {"products": 4}, "filled_min": 9},
        },
    }
)

# 3 이미지 + 글 복합 단락
CASES.append(
    {
        "id": "image-text-paragraph",
        "tags": ["image", "text", "columns"],
        "html": f"""
<h2>제주 올레길 7코스</h2>
<table style="border:none"><tr>
<td style="border:none;width:45%"><img src="{photo('olle','olle')}" width="220"/><p class="cap">외돌개에서 본 바다</p></td>
<td style="border:none;vertical-align:top"><p>7코스는 서귀포 올레시장에서 시작해 외돌개와 법환포구를 지나는 해안 길이다. 약 17km로 5~6시간이 걸리며, 바다를 끼고 걷는 구간이 길어 처음 올레길을 걷는 사람에게 많이 추천된다.</p></td>
</tr></table>
<p>걷기 좋은 시기는 봄과 가을이며, 여름에는 그늘이 적어 오전에 출발하는 것이 좋다.</p>
""",
        "truth": asset(
            "사진 + 글 단락",
            [
                {"t": "field", "role": "heading", "field": F("title", "text", "제목"), "variant": "h2"},
                {
                    "t": "grid",
                    "component": "columns",
                    "rows": [
                        {
                            "cells": [
                                {"role": "value", "nodes": [{"t": "field", "role": "image", "field": F("photo", "image", "사진")}, {"t": "field", "role": "image-caption", "field": F("caption", "text", "사진 설명")}]},
                                {"role": "value", "nodes": [{"t": "field", "role": "body", "field": F("side_text", "rich", "본문")}]},
                            ]
                        }
                    ],
                },
                {"t": "field", "role": "body", "field": F("body", "rich", "이어지는 본문")},
            ],
            "section",
        ),
        "similar": {
            "text": "부산 감천문화마을 소개를 같은 틀로: 사진 설명 '마을 전망대에서 본 풍경'. 옆 글: 알록달록한 집들이 계단식으로 이어진 마을로 골목마다 벽화와 작은 갤러리가 있다. 아래 글: 주차가 어려우니 대중교통을 권한다.",
            "expect": {"filled_min": 3},
        },
    }
)

# 4 사양표 + 사진 칸 (표 안 사진, 세로 병합)
CASES.append(
    {
        "id": "spec-table-with-image",
        "tags": ["table", "image", "rowspan"],
        "html": f"""
<h3>제품 사양</h3>
<table><colgroup><col width="190"/><col width="110"/><col/></colgroup><tr><td rowspan="4" width="190" style="text-align:center"><img src="{photo('cam','cam',200,150)}" width="170" height="128"/></td><th width="110" style="height:36px">모델명</th><td>VC-300</td></tr>
<tr><th style="height:36px">크기</th><td>120 × 80 × 45 mm</td></tr>
<tr><th style="height:36px">무게</th><td>380 g</td></tr>
<tr><th style="height:36px">가격</th><td>420,000원</td></tr></table>
""",
        "truth": asset(
            "사진 있는 사양표",
            [
                {"t": "label", "role": "caption", "text": "제품 사양"},
                {
                    "t": "grid",
                    "component": "table",
                    "rows": [
                        {"cells": [{"role": "value", "rs": 4, "nodes": [{"t": "field", "role": "image", "field": F("photo", "image", "제품 사진")}]}, L("label", "모델명"), V(F("model", "code", "모델명"))]},
                        {"cells": [L("label", "크기"), V(F("size", "text", "크기"))]},
                        {"cells": [L("label", "무게"), V(F("weight", "text", "무게"))]},
                        {"cells": [L("label", "가격"), V(F("price", "currency", "가격"))]},
                    ],
                },
            ],
        ),
        "similar": {
            "text": "새 제품: 모델 DX-9, 가로세로높이 150x90x60mm, 중량 0.52kg, 판매가 590,000원, 색상 블랙/실버.",
            "expect": {"filled_min": 4, "unmapped_has": ["색상"]},
        },
    }
)

# 5 참가 신청서 — 선택지 · 날짜 · 서명
CASES.append(
    {
        "id": "application-form",
        "tags": ["form", "choice", "colspan"],
        "html": """
<h1 style="text-align:center">세미나 참가 신청서</h1>
<table>
<tr><th style="width:18%">성명</th><td style="width:32%">홍길동</td><th style="width:18%">생년월일</th><td>1990. 05. 12.</td></tr>
<tr><th>연락처</th><td colspan="3">010-1234-5678</td></tr>
<tr><th>참석 여부</th><td colspan="3">■ 참석 &nbsp;&nbsp; □ 불참</td></tr>
<tr><th>요청사항</th><td colspan="3" style="height:60px">주차 지원 필요</td></tr>
</table>
<p style="text-align:center">위와 같이 신청합니다.</p>
<p style="text-align:right">2026년 3월 5일 &nbsp;&nbsp; 신청인: 홍길동 (서명)</p>
""",
        "truth": asset(
            "참가 신청서",
            [
                {"t": "label", "role": "title", "text": "세미나 참가 신청서", "variant": "h1"},
                {
                    "t": "grid",
                    "component": "table",
                    "rows": [
                        {"cells": [L("label", "성명"), V(F("name", "text", "성명")), L("label", "생년월일"), V(F("birth", "date", "생년월일"))]},
                        {"cells": [L("label", "연락처"), V(F("phone", "text", "연락처"), cs=3)]},
                        {"cells": [L("label", "참석 여부"), V(F("attend", "choice", "참석 여부", options=["참석", "불참"]), cs=3)]},
                        {"cells": [L("label", "요청사항"), V(F("request", "rich", "요청사항"), cs=3)]},
                    ],
                },
                {"t": "label", "role": "note", "text": "위와 같이 신청합니다."},
                {"t": "field", "role": "byline", "field": F("signed", "text", "신청일 · 신청인")},
            ],
        ),
        "similar": {
            "text": "신청자 김하나, 1995년 11월 3일생, 전화 010-9876-5432, 불참 예정, 요청: 발표 자료 메일로 받기 원함. 이메일 hana@example.com.",
            "expect": {"filled_min": 4, "unmapped_has": ["이메일"]},
        },
    }
)

# 6 견적서 — 반복 품목 행 + 합계 행(가로 병합)
CASES.append(
    {
        "id": "invoice",
        "tags": ["table", "repeat", "total", "colspan"],
        "html": """
<h1 style="text-align:center">견 적 서</h1>
<table><tr><th style="width:20%">견적번호</th><td>Q-2026-031</td><th style="width:20%">견적일</th><td>2026-03-06</td></tr></table>
<table><tr><th>품목</th><th style="width:12%">수량</th><th style="width:18%">단가</th><th style="width:20%">금액</th></tr>
<tr><td>모니터 27인치</td><td>2</td><td>320,000</td><td>640,000</td></tr>
<tr><td>키보드</td><td>2</td><td>45,000</td><td>90,000</td></tr>
<tr><td>설치비</td><td>1</td><td>50,000</td><td>50,000</td></tr>
<tr><th colspan="3">합계</th><td><b>780,000</b></td></tr></table>
""",
        "truth": asset(
            "견적서",
            [
                {"t": "label", "role": "title", "text": "견 적 서", "variant": "h1"},
                {"t": "grid", "component": "table", "rows": [{"cells": [L("label", "견적번호"), V(F("quote_no", "code", "견적번호")), L("label", "견적일"), V(F("date", "date", "견적일"))]}]},
                {
                    "t": "grid",
                    "component": "table",
                    "rows": [
                        {"cells": [L("column-header", "품목"), L("column-header", "수량"), L("column-header", "단가"), L("column-header", "금액")]},
                        {"repeat": "items", "cells": [V(F("item", "text", "품목")), V(F("qty", "number", "수량")), V(F("unit_price", "currency", "단가")), V(F("amount", "currency", "금액"))]},
                        {"cells": [L("label", "합계", cs=3), V(F("total", "currency", "합계"), role="total")]},
                    ],
                },
            ],
        ),
        "similar": {
            "text": "견적 Q-2026-044, 날짜 3월 20일. 노트북 3대 단가 1,200,000 = 3,600,000 / 마우스 3개 단가 25,000 = 75,000 / 가방 3개 단가 40,000 = 120,000 / 배송비 1건 30,000. 총액 3,825,000원.",
            "expect": {"repeat": {"items": 4}, "filled_min": 3},
        },
    }
)

# 7 학력 · 경력 — 묶음 머리칸(세로 병합) + 열 머리칸
CASES.append(
    {
        "id": "career-history",
        "tags": ["table", "rowspan", "group-label"],
        "html": """
<h3>학력 및 경력</h3>
<table><tr><th style="width:12%">구분</th><th style="width:24%">기간</th><th style="width:24%">기관</th><th>내용</th></tr>
<tr><th rowspan="2">학력</th><td>2009.03 ~ 2013.02</td><td>한국대학교</td><td>컴퓨터공학 학사</td></tr>
<tr><td>2013.03 ~ 2015.02</td><td>한국대학교 대학원</td><td>인공지능 석사</td></tr>
<tr><th rowspan="3">경력</th><td>2015.03 ~ 2018.12</td><td>가나소프트</td><td>검색 엔진 개발</td></tr>
<tr><td>2019.01 ~ 2022.06</td><td>다라테크</td><td>추천 시스템 팀장</td></tr>
<tr><td>2022.07 ~ 현재</td><td>마바AI</td><td>연구소장</td></tr></table>
""",
        "truth": asset(
            "학력 · 경력 표",
            [
                {"t": "label", "role": "caption", "text": "학력 및 경력"},
                {
                    "t": "grid",
                    "component": "table",
                    "rows": [
                        {"cells": [L("column-header", "구분"), L("column-header", "기간"), L("column-header", "기관"), L("column-header", "내용")]},
                        {"repeat": "education", "cells": [L("group-label", "학력", rs="repeat"), V(F("period", "text", "기간")), V(F("org", "text", "기관")), V(F("desc", "text", "내용"))]},
                        {"repeat": "career", "cells": [L("group-label", "경력", rs="repeat"), V(F("period", "text", "기간")), V(F("org", "text", "기관")), V(F("desc", "text", "내용"))]},
                    ],
                },
            ],
        ),
        "similar": {
            "text": "지원자 학력: 2008~2011 서울고등학교 졸업, 2011~2015 미래대학교 경영학 학사, 2016~2018 미래대학교 MBA. 경력: 2018~2021 한빛상사 마케팅 대리, 2021~현재 누리커머스 브랜드 매니저.",
            "expect": {"repeat": {"education": 3, "career": 2}, "filled_min": 10},
        },
    }
)

# 8 블로그 스팟 — 사진 두 장 + 정보 프레임(키-값) + 팁 바 + 본문
CASES.append(
    {
        "id": "blog-spot",
        "tags": ["image", "kv", "frame", "blog"],
        "html": f"""
<h2>성수동 카페 '오후의 정원'</h2>
<table style="border:none"><tr><td style="border:none"><img src="{photo('cafe1','cafe1',220,150)}" width="230"/></td><td style="border:none"><img src="{photo('cafe2','cafe2',220,150)}" width="230"/></td></tr></table>
<div class="frame"><b>주소</b> : 서울 성동구 성수이로 00<br/><b>영업시간</b> : 11:00 ~ 21:00 (월 휴무)<br/><b>대표 메뉴</b> : 바닐라 라떼 6,500원</div>
<div class="tip">TIP. 2층 창가 자리는 오후 3시 이후 햇살이 가장 좋아요.</div>
<p>통창으로 들어오는 빛과 식물이 가득한 공간이라 사진 찍기에 좋다. 디저트는 매일 오전에 직접 굽는다.</p>
""",
        "truth": asset(
            "블로그 장소 소개",
            [
                {"t": "field", "role": "heading", "field": F("place_name", "text", "장소 이름"), "variant": "h2"},
                {
                    "t": "grid",
                    "component": "columns",
                    "rows": [{"cells": [{"role": "value", "nodes": [{"t": "field", "role": "image", "field": F("photo1", "image", "사진 1")}]}, {"role": "value", "nodes": [{"t": "field", "role": "image", "field": F("photo2", "image", "사진 2")}]}]}],
                },
                {
                    "t": "container",
                    "component": "frame",
                    "children": [
                        {
                            "t": "grid",
                            "component": "kv",
                            "rows": [
                                {"cells": [L("meta-key", "주소"), V(F("address", "text", "주소"), role="meta-value")]},
                                {"cells": [L("meta-key", "영업시간"), V(F("hours", "text", "영업시간"), role="meta-value")]},
                                {"cells": [L("meta-key", "대표 메뉴"), V(F("menu", "text", "대표 메뉴"), role="meta-value")]},
                            ],
                        }
                    ],
                },
                {"t": "container", "component": "frame", "variant": "tip", "children": [{"t": "field", "role": "body", "field": F("tip", "text", "팁")}]},
                {"t": "field", "role": "body", "field": F("body", "rich", "본문")},
            ],
            "section",
        ),
        "similar": {
            "text": "연남동 브런치 '모닝글로리': 위치 서울 마포구 연남로 11, 오픈 9시~17시 화요일 휴무, 시그니처 에그베네딕트 15,000원, 전화 02-123-4567. 꿀팁: 주말엔 10시 전에 가야 대기 없음. 본문: 테라스 좌석이 넓고 반려견 동반 가능.",
            "expect": {"filled_min": 5, "unmapped_has": ["전화"]},
        },
    }
)

# 9 뉴스 기사 — 제목 · 기자 줄 · 사진+캡션 · 본문 · 인용 프레임
CASES.append(
    {
        "id": "news-article",
        "tags": ["text", "image", "quote", "news"],
        "html": f"""
<h1>도심 공원 3곳, 내년 봄 새 단장</h1>
<p class="muted">김기자 기자 · 2026.03.07 09:30</p>
<img src="{photo('park','park',420,200)}" width="420"/>
<p class="cap">리모델링이 예정된 중앙공원 산책로</p>
<p>시는 중앙공원 등 도심 공원 3곳을 내년 봄까지 새로 단장한다고 7일 밝혔다. 산책로 포장을 바꾸고 야간 조명을 늘리며, 어린이 놀이터를 새로 짓는다.</p>
<div class="quote">"시민들이 밤에도 안심하고 걸을 수 있는 공원을 만들겠다." — 공원녹지과장</div>
<p>사업비는 총 45억 원이며, 공사 기간 중에는 구간별로 출입이 제한된다.</p>
""",
        "truth": asset(
            "뉴스 기사",
            [
                {"t": "field", "role": "heading", "field": F("headline", "text", "제목"), "variant": "h1"},
                {"t": "field", "role": "byline", "field": F("byline", "text", "기자 · 날짜")},
                {"t": "field", "role": "image", "field": F("lead_photo", "image", "대표 사진")},
                {"t": "field", "role": "image-caption", "field": F("lead_caption", "text", "사진 설명")},
                {"t": "field", "role": "body", "field": F("lead_body", "rich", "본문")},
                {"t": "container", "component": "frame", "variant": "quote", "children": [{"t": "field", "role": "body", "field": F("quote", "text", "인용")}]},
                {"t": "field", "role": "body", "field": F("closing", "rich", "이어지는 본문")},
            ],
            "page",
        ),
    }
)

# 10 실제 붙여 넣은 요구사항 서식 (사용자 스크린샷)
ECR_TRUTH = asset(
    "요구사항 정의 표",
    [
        {
            "t": "grid",
            "component": "table",
            "rows": [
                {"cells": [L("label", "요구사항 분류", cs=2), V(F("category", "text", "요구사항 분류"))]},
                {"cells": [L("label", "요구사항 고유번호", cs=2), V(F("req_id", "code", "요구사항 고유번호"))]},
                {"cells": [L("label", "요구사항 명칭", cs=2), V(F("name", "text", "요구사항 명칭"))]},
                {"cells": [L("group-label", "요구사항 세부내용", rs=2), L("sub-label", "정의"), V(F("definition", "text", "정의"))]},
                {"cells": [L("sub-label", "세부내용"), V(F("details", "list", "세부내용"))]},
                {"cells": [L("label", "산출정보", cs=2), V(F("outputs", "text", "산출정보"))]},
            ],
        }
    ],
)


def render(html: str, out: Path) -> None:
    arch = pymupdf.Archive(str(CASES_DIR / "_img"))
    story = pymupdf.Story(html=html, user_css=CSS, archive=arch)
    import io

    buf = io.BytesIO()
    writer = pymupdf.DocumentWriter(buf)
    mb = pymupdf.Rect(0, 0, 595, 842)
    where = mb + (36, 36, -36, -36)
    more = 1
    bottom = 0.0
    while more:
        dev = writer.begin_page(mb)
        more, filled = story.place(where)
        bottom = pymupdf.Rect(filled).y1
        story.draw(dev)
        writer.end_page()
    writer.close()
    doc = pymupdf.open("pdf", buf.getvalue())
    clip = pymupdf.Rect(0, 0, 595, min(842, bottom + 30))
    doc[0].get_pixmap(dpi=130, clip=clip).save(str(out))
    doc.close()


def main() -> None:
    sys.path.insert(0, str(ROOT))
    CASES_DIR.mkdir(exist_ok=True)
    for case in CASES:
        d = CASES_DIR / case["id"]
        d.mkdir(parents=True, exist_ok=True)
        render(case["html"], d / "form.png")
        (d / "truth.json").write_text(json.dumps(case["truth"], ensure_ascii=False, indent=1), encoding="utf-8")
        meta = {"id": case["id"], "tags": case["tags"], **({"similar": case["similar"]} if "similar" in case else {})}
        (d / "case.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print("built", case["id"])
    # 실제 스크린샷 사례
    shot = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    d = CASES_DIR / "ecr-requirement-screenshot"
    d.mkdir(exist_ok=True)
    if shot and shot.exists():
        shutil.copy(shot, d / "form.png")
    (d / "truth.json").write_text(json.dumps(ECR_TRUTH, ensure_ascii=False, indent=1), encoding="utf-8")
    (d / "case.json").write_text(
        json.dumps(
            {
                "id": "ecr-requirement-screenshot",
                "tags": ["table", "rowspan", "colspan", "real"],
                "similar": {
                    "text": "보안 요구사항(SER) SER-003 '접근 통제': 정의는 사용자 권한별 메뉴 · 데이터 접근 제한. 세부: RBAC 적용, 관리자 이중 인증, 접근 로그 1년 보관. 산출물은 보안 설계서. 담당 부서 보안팀.",
                    "expect": {"filled_min": 5, "unmapped_has": ["담당"]},
                },
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    print("built ecr-requirement-screenshot", "(with screenshot)" if shot else "(truth only)")


if __name__ == "__main__":
    main()
