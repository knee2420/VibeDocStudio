from __future__ import annotations
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio"
CATALOG_DIR = os.path.join(ROOT, "catalog")


def build_bansanghoe_slots_and_blocks() -> tuple[dict, list, dict]:
    slots: dict[str, dict] = {}
    backdata: dict[str, dict] = {
        "bd_bs_town_notice": {
            "chunkId": "bd_bs_town_notice",
            "sourceTitle": "행복동_주민센터_10월_반상회_시책공문.pdf",
            "sourceType": "pdf",
            "updatedAt": "2026-10-27",
            "tags": ["행복동주민센터", "예방접종", "에너지바우처", "윤독간행물"],
            "excerpt": "1. 2026년 하반기 어르신·어린이 독감 무료 예방접종 지정 의료기관 안내문 각 동 게시판 부착 협조. 2. 동절기 에너지 바우처 집중 접수 기간(2026.11.1~12.31) 안내. 3. 배포 간행물: 행복 시정소식지(10월호), 우리마을 반상회보 제412호. 임석 담당: 행정주무관 이동관.",
        },
        "bd_bs_resident_voice": {
            "chunkId": "bd_bs_resident_voice",
            "sourceTitle": "10월_반상회_현장_안건_및_건의사항_메모.txt",
            "sourceType": "transcript",
            "updatedAt": "2026-10-27",
            "tags": ["분리수거", "소방점검", "마을대청소", "보안등건의"],
            "excerpt": "[자체 의결] ① 재활용 분리수거를 매주 화·금 18:00~23:00 지정 시간 집중 배출제로 만장일치 전환, 노후 CCTV 및 조명 예비비 즉시 교체. ② 11월 첫째 주 지하주차장 스프링클러 누수 및 피난 유도선 점검. ③ 11월 7일(토) 10:00 가을맞이 마을 대청소. [관청 건의] ① 단지 후문 보행로 노후 보안등 LED 전면 교체 요망. ② 어린이 놀이터 주변 불법 이륜차 진입 방지 볼라드 설치 요청.",
        },
    }

    def add_slot(
        slot_id: str,
        label: str,
        content: str,
        role: str = "editable-slot",
        locked: bool = False,
        refs: list[str] | None = None,
    ) -> str:
        slots[slot_id] = {
            "slotId": slot_id,
            "label": label,
            "role": role,
            "content": content,
            "constraints": {"locked": locked} if locked else {},
            "backDataRefs": refs or [],
        }
        return slot_id

    add_slot(
        "bs_page_header",
        "반상회 회의록 상단 메타",
        "<p>예스폼 07번 표준 서식 (vform_159439) · A4 정밀 조판 규격 (449.4pt Frame)</p>",
        role="boilerplate",
        locked=True,
    )
    add_slot(
        "bs_page_footer",
        "반상회 회의록 하단 메타",
        "<p>관할 제출처: 행복동 주민센터 · 보존 분류: 기층 자치 회의록</p>",
        role="boilerplate",
        locked=True,
    )

    # 0. 문서 메인 타이틀
    add_slot(
        "bs_slot_main_title",
        "문서 메인 타이틀",
        "<p><strong>반 &nbsp;상 &nbsp;회 &nbsp;&nbsp;회 &nbsp;의 &nbsp;록</strong></p>",
        role="boilerplate",
        locked=False,
    )

    # 1. [1구역] 일시 및 결재란
    add_slot(
        "bs_z1_datetime",
        "1구역 · 개최 일시",
        "<p><strong>2026</strong>년 &nbsp;<strong>10</strong>월 &nbsp;<strong>27</strong>일 &nbsp;&nbsp;<strong>19</strong>시 <strong>30</strong>분부터 &nbsp;<strong>20</strong>시 <strong>45</strong>분 까지</p>",
        refs=["bd_bs_resident_voice"],
    )
    add_slot(
        "bs_z1_role1",
        "1구역 · 결재 1 직책",
        "<p>몰름<br/>반장</p>",
        role="boilerplate",
    )
    add_slot(
        "bs_z1_sign1",
        "1구역 · 결재 1 서명",
        '<p><span data-stamp="sign" data-label="(서명)">(서명)</span></p>',
    )
    add_slot(
        "bs_z1_role2",
        "1구역 · 결재 2 직책",
        "<p>반 &nbsp;장</p>",
        role="boilerplate",
    )
    add_slot(
        "bs_z1_seal2",
        "1구역 · 결재 2 날인",
        '<p><span data-stamp="seal" data-label="金">金</span><br/><span data-stamp="seal" data-label="(인)">(인)</span></p>',
    )

    # 2. [2구역] 협의 및 결의사항
    add_slot(
        "bs_z2_label",
        "2구역 · 협의 및 결의사항 라벨",
        "<p><strong>협의 및<br/>결의사항</strong></p>",
        role="boilerplate",
        locked=True,
    )
    add_slot(
        "bs_z2_body",
        "2구역 · 협의 및 결의사항 본문",
        (
            "<p><strong>1. 단지 내 재활용 분리수거 배출 체계 개선의 건</strong></p>"
            "<p>&nbsp;&nbsp;• 기존 수시 배출로 인한 악취 및 통행 불편 해소를 위해 매주 화·금요일 18:00~23:00 지정 시간 집중 배출제로 전환하기로 만장일치 의결함.</p>"
            "<p>&nbsp;&nbsp;• 분리수거장 내 노후 CCTV 교체 및 조명 보강은 관리비 예비비로 즉시 집행 결정.</p>"
            "<p></p>"
            "<p><strong>2. 동절기 대비 지하주차장 소방 안전 시설 전수 점검의 건</strong></p>"
            "<p>&nbsp;&nbsp;• 주차구역 스프링클러 헤드 누수 및 피난 유도선 훼손 상태 11월 첫째 주 집중 점검.</p>"
            "<p>&nbsp;&nbsp;• 소화전 앞 적치물 자진 수거 안내문을 10월 말까지 전 세대에 공지하기로 함.</p>"
            "<p></p>"
            "<p><strong>3. 가을맞이 마을 대청소 및 보행로 수목 전지 일정 수립의 건</strong></p>"
            "<p>&nbsp;&nbsp;• 일시: 2026년 11월 7일(토) 오전 10:00 (각 통·반 자율 방범대 합동 실시)</p>"
        ),
        refs=["bd_bs_resident_voice"],
    )

    # 3. [3구역] 건의요망 사항요지 및 임석공무원
    add_slot(
        "bs_z3_label",
        "3구역 · 건의요망 사항요지 라벨",
        "<p><strong>건의요망<br/>사항요지</strong></p>",
        role="boilerplate",
        locked=True,
    )
    add_slot(
        "bs_z3_body",
        "3구역 · 건의요망 사항요지 본문",
        (
            "<p><strong>1. 단지 후문 보행로 노후 보안등 LED 전면 교체 건의</strong></p>"
            "<p>&nbsp;&nbsp;- 야간 통행 시 조도 미확보로 인한 안전사고 우려 해소 요망</p>"
            "<p></p>"
            "<p><strong>2. 어린이 놀이터 주변 불법 이륜차 진입 방지용 볼라드 설치 요청</strong></p>"
        ),
        refs=["bd_bs_resident_voice"],
    )
    add_slot(
        "bs_z3_official_hdr",
        "3구역 · 임석공무원 헤더",
        "<p><strong>임 석 공 무 원</strong></p>",
        role="boilerplate",
        locked=True,
    )
    add_slot(
        "bs_z3_official_body",
        "3구역 · 임석공무원 확인란",
        (
            "<p>소 &nbsp;&nbsp;속 : 행복동 주민센터</p>"
            "<p>직 &nbsp;&nbsp;명 : 행정주무관</p>"
            '<p>성 &nbsp;&nbsp;명 : 이 동 관 <span data-stamp="seal" data-label="(인)" data-float="right">(인)</span></p>'
        ),
        role="fillable-field",
        refs=["bd_bs_town_notice"],
    )

    # 4. [4구역] 기타사항 및 윤독중인간행물
    add_slot(
        "bs_z4_label",
        "4구역 · 기타사항 라벨",
        "<p><strong>기타사항</strong></p>",
        role="boilerplate",
        locked=True,
    )
    add_slot(
        "bs_z4_body",
        "4구역 · 기타사항 본문",
        (
            "<p>• 2026년 하반기 독감 무료 예방접종 지정 의료기관 안내문 게시</p>"
            "<p>• 동절기 에너지 바우처 접수 기간(11.1~12.31) 주민센터 홍보 협조</p>"
        ),
        refs=["bd_bs_town_notice"],
    )
    add_slot(
        "bs_z4_pub_hdr",
        "4구역 · 윤독중인간행물 헤더",
        "<p><strong>윤독중인간행물</strong></p>",
        role="boilerplate",
        locked=True,
    )
    add_slot(
        "bs_z4_pub_body",
        "4구역 · 윤독중인간행물 목록",
        (
            "<p>• 행복 시정소식지 (10월호)</p>"
            "<p>• 우리마을 반상회보 제412호</p>"
        ),
        refs=["bd_bs_town_notice"],
    )

    # 5. [5구역] 반원 출석 상황 헤더
    add_slot(
        "bs_z5_title",
        "5구역 · 반원 출석 상황 타이틀",
        "<p><strong>반 원 출 석 상 황</strong></p>",
        role="boilerplate",
        locked=True,
    )

    # 6. [6구역] 15인 출석부 헤더 + 15인 데이터
    for col_idx in range(1, 4):
        add_slot(
            f"bs_z6_h_name_{col_idx}",
            f"출석부 헤더 성명 {col_idx}",
            "<p><strong>성 &nbsp;&nbsp;&nbsp;&nbsp;명</strong></p>",
            role="boilerplate",
            locked=True,
        )
        add_slot(
            f"bs_z6_h_seal_{col_idx}",
            f"출석부 헤더 인 {col_idx}",
            "<p><strong>(인)</strong></p>",
            role="boilerplate",
            locked=True,
        )

    attendees = [
        [("101호 김철수", "seal", "(인)"), ("102호 이영희", "seal", "(인)"), ("103호 박상우", "seal", "(인)")],
        [("201호 정다은", "seal", "(인)"), ("202호 최현우", "seal", "(인)"), ("203호 강민서", "sign", "(서명)")],
        [("301호 윤재호", "seal", "(인)"), ("302호 조은지", "seal", "(인)"), ("303호 한승민", "seal", "(인)")],
        [("401호 송예린", "sign", "(서명)"), ("402호 백동현", "seal", "(인)"), ("403호 서유진", "seal", "(인)")],
        [("501호 임태양", "seal", "(인)"), ("502호 오세훈", "seal", "(인)"), ("503호 배수현", "seal", "(인)")],
    ]

    z6_rows = [
        {
            "rowId": "bs_z6_r_hdr",
            "height": "38px",
            "cells": [
                {"cellId": "bs_z6_ch1", "slotId": "bs_z6_h_name_1", "vAlign": "middle", "hAlign": "center", "compact": True, "whiteHeader": True},
                {"cellId": "bs_z6_ch2", "slotId": "bs_z6_h_seal_1", "vAlign": "middle", "hAlign": "center", "compact": True, "whiteHeader": True},
                {"cellId": "bs_z6_ch3", "slotId": "bs_z6_h_name_2", "vAlign": "middle", "hAlign": "center", "compact": True, "whiteHeader": True},
                {"cellId": "bs_z6_ch4", "slotId": "bs_z6_h_seal_2", "vAlign": "middle", "hAlign": "center", "compact": True, "whiteHeader": True},
                {"cellId": "bs_z6_ch5", "slotId": "bs_z6_h_name_3", "vAlign": "middle", "hAlign": "center", "compact": True, "whiteHeader": True},
                {"cellId": "bs_z6_ch6", "slotId": "bs_z6_h_seal_3", "vAlign": "middle", "hAlign": "center", "compact": True, "whiteHeader": True},
            ],
        }
    ]

    for r_idx, row_people in enumerate(attendees, start=1):
        row_cells = []
        for c_idx, (person_name, st_type, st_label) in enumerate(row_people, start=1):
            nid = f"bs_z6_r{r_idx}c{c_idx}_name"
            sid = f"bs_z6_r{r_idx}c{c_idx}_stamp"
            unit, name = person_name.split(" ")
            add_slot(
                nid,
                f"출석 {person_name}",
                f"<p>{unit} &nbsp;{name}</p>",
            )
            add_slot(
                sid,
                f"날인 {person_name}",
                f'<p><span data-stamp="{st_type}" data-label="{st_label}">{st_label}</span></p>',
            )
            row_cells.append(
                {
                    "cellId": f"bs_z6_cell_n_{r_idx}_{c_idx}",
                    "slotId": nid,
                    "vAlign": "middle",
                    "hAlign": "center",
                    "compact": True,
                }
            )
            row_cells.append(
                {
                    "cellId": f"bs_z6_cell_s_{r_idx}_{c_idx}",
                    "slotId": sid,
                    "vAlign": "middle",
                    "hAlign": "center",
                    "compact": True,
                }
            )
        z6_rows.append(
            {
                "rowId": f"bs_z6_r_{r_idx}",
                "height": "36px",
                "cells": row_cells,
            }
        )

    blocks = [
        {
            "blockId": "blk_bs_title",
            "kind": "form-title",
            "title": "문서 메인 타이틀 (반상회 회의록)",
            "slotId": "bs_slot_main_title",
            "underlineWidth": "286px",
            "underlineThickness": "2px",
            "letterSpacing": "0.35em",
        },
        {
            "blockId": "blk_bs_composite_frame",
            "kind": "composite-form-frame",
            "title": "반상회 회의록 6구역 정밀 복합 프레임 (449.4pt)",
            "outerBorderWidth": "2px",
            "sections": [
                {
                    "sectionId": "bs_sec_1",
                    "title": "1구역 · 일시 및 결재란",
                    "columnWidths": ["66.33%", "8.06%", "8.81%", "9.48%", "7.32%"],
                    "rows": [
                        {
                            "rowId": "bs_z1_r1",
                            "height": "63px",
                            "cells": [
                                {"cellId": "bs_z1_c1", "slotId": "bs_z1_datetime", "vAlign": "middle", "hAlign": "left", "padding": "6px 12px"},
                                {"cellId": "bs_z1_c2", "slotId": "bs_z1_role1", "vAlign": "middle", "hAlign": "center", "compact": True},
                                {"cellId": "bs_z1_c3", "slotId": "bs_z1_sign1", "vAlign": "middle", "hAlign": "center", "compact": True},
                                {"cellId": "bs_z1_c4", "slotId": "bs_z1_role2", "vAlign": "middle", "hAlign": "center", "compact": True},
                                {"cellId": "bs_z1_c5", "slotId": "bs_z1_seal2", "vAlign": "middle", "hAlign": "center", "compact": True},
                            ],
                        }
                    ],
                },
                {
                    "sectionId": "bs_sec_2",
                    "title": "2구역 · 협의 및 결의사항",
                    "columnWidths": ["12.04%", "87.96%"],
                    "rows": [
                        {
                            "rowId": "bs_z2_r1",
                            "height": "250px",
                            "cells": [
                                {"cellId": "bs_z2_c1", "slotId": "bs_z2_label", "vAlign": "middle", "hAlign": "center", "compact": True},
                                {"cellId": "bs_z2_c2", "slotId": "bs_z2_body", "vAlign": "middle", "hAlign": "left", "padding": "14px 18px"},
                            ],
                        }
                    ],
                },
                {
                    "sectionId": "bs_sec_3",
                    "title": "3구역 · 건의요망 사항요지 및 임석공무원",
                    "columnWidths": ["12.04%", "54.30%", "33.66%"],
                    "rows": [
                        {
                            "rowId": "bs_z3_r1",
                            "height": "37px",
                            "cells": [
                                {"cellId": "bs_z3_c1", "slotId": "bs_z3_label", "rowSpan": 2, "vAlign": "middle", "hAlign": "center", "compact": True},
                                {"cellId": "bs_z3_c2", "slotId": "bs_z3_body", "rowSpan": 2, "vAlign": "middle", "hAlign": "left", "padding": "12px 16px"},
                                {"cellId": "bs_z3_c3", "slotId": "bs_z3_official_hdr", "vAlign": "middle", "hAlign": "center", "compact": True, "letterSpacing": "0.15em"},
                            ],
                        },
                        {
                            "rowId": "bs_z3_r2",
                            "height": "85px",
                            "cells": [
                                {"cellId": "bs_z3_c4", "slotId": "bs_z3_official_body", "vAlign": "middle", "hAlign": "left", "padding": "8px 14px"},
                            ],
                        },
                    ],
                },
                {
                    "sectionId": "bs_sec_4",
                    "title": "4구역 · 기타사항 및 윤독중인간행물",
                    "columnWidths": ["12.04%", "54.30%", "33.66%"],
                    "bottomBorderThick": True,
                    "rows": [
                        {
                            "rowId": "bs_z4_r1",
                            "height": "35px",
                            "cells": [
                                {"cellId": "bs_z4_c1", "slotId": "bs_z4_label", "rowSpan": 2, "vAlign": "middle", "hAlign": "center", "compact": True, "letterSpacing": "0.1em"},
                                {"cellId": "bs_z4_c2", "slotId": "bs_z4_body", "rowSpan": 2, "vAlign": "middle", "hAlign": "left", "padding": "10px 16px"},
                                {"cellId": "bs_z4_c3", "slotId": "bs_z4_pub_hdr", "vAlign": "middle", "hAlign": "center", "compact": True, "letterSpacing": "0.15em"},
                            ],
                        },
                        {
                            "rowId": "bs_z4_r2",
                            "height": "56px",
                            "cells": [
                                {"cellId": "bs_z4_c4", "slotId": "bs_z4_pub_body", "vAlign": "middle", "hAlign": "left", "padding": "6px 14px"},
                            ],
                        },
                    ],
                },
                {
                    "sectionId": "bs_sec_5",
                    "title": "5구역 · 반원 출석 상황 헤더",
                    "columnWidths": ["100%"],
                    "bottomBorderThick": True,
                    "rows": [
                        {
                            "rowId": "bs_z5_r1",
                            "height": "36px",
                            "cells": [
                                {"cellId": "bs_z5_c1", "slotId": "bs_z5_title", "vAlign": "middle", "hAlign": "center", "compact": True, "letterSpacing": "0.6em"},
                            ],
                        }
                    ],
                },
                {
                    "sectionId": "bs_sec_6",
                    "title": "6구역 · 15인 출석부 매트릭스",
                    "columnWidths": ["26.06%", "6.83%", "27.61%", "5.83%", "26.35%", "7.32%"],
                    "rows": z6_rows,
                },
            ],
        },
    ]

    return slots, blocks, backdata


bs_slots, bs_blocks, bs_backdata = build_bansanghoe_slots_and_blocks()

# 1. Build standalone `catalog/yesform-07-bansanghoe/document.json` & `manifest.json`
bansanghoe_doc = {
    "version": "1.0.0",
    "docId": "vdoc_yesform_07_bansanghoe",
    "title": "반상회 회의록 (예스폼 07번 정밀 서식)",
    "status": "Final",
    "totalValueText": "15세대 출석",
    "updatedAt": "2026-10-28T17:55:00+09:00",
    "variables": {
        "Meeting.Date": "2026-10-27",
        "Official.Dept": "행복동 주민센터",
        "Official.Name": "이동관",
    },
    "pages": [
        {
            "pageId": "bs_page_1",
            "pageNumber": 1,
            "pageLabel": "반상회 회의록 (A4 완결형)",
            "headerSlotId": "bs_page_header",
            "footerSlotId": "bs_page_footer",
            "hideHeaderFooter": True,
            "blocks": bs_blocks,
        }
    ],
    "slots": bs_slots,
    "backdata": bs_backdata,
}

bansanghoe_manifest = {
    "catalogId": "yesform-07-bansanghoe",
    "title": "반상회 회의록 (예스폼 07번 정밀 조판)",
    "sourceOrigin": "Tutorials/obsidian_tuning/실험실/typst_forms/반상회_회의록.typ",
    "sourceId": "vform_159439",
    "category": "행정·자치 회의록",
    "tags": ["반상회", "관민2분할", "15인출석부", "A4정밀서식"],
    "description": "pdfplumber 0.1pt 기계 추출 치수(449.4pt 6구역 프레임)와 15인 출석부 매트릭스를 1:1로 이식한 A4 완결형 회의록",
}

with open(os.path.join(CATALOG_DIR, "yesform-07-bansanghoe", "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(bansanghoe_manifest, f, ensure_ascii=False, indent=2)

with open(os.path.join(CATALOG_DIR, "yesform-07-bansanghoe", "document.json"), "w", encoding="utf-8") as f:
    json.dump(bansanghoe_doc, f, ensure_ascii=False, indent=2)

print("Built catalog/yesform-07-bansanghoe/document.json")


# 2. Build `catalog/vibe-architecture-minutes/document.json` (Page 1 = 아키텍처 회의록, Page 2 = 반상회 회의록)
mm_slots = {
    "mm_slot_header": {
        "slotId": "mm_slot_header",
        "label": "문서 상단 머리글",
        "role": "boilerplate",
        "content": '<p>📋 정형 회의록 표준 양식 (GSV-01) · 프로젝트: <span data-variable="Project.Name">[Project.Name]</span></p>',
        "backDataRefs": [],
    },
    "mm_slot_footer": {
        "slotId": "mm_slot_footer",
        "label": "문서 하단 바닥글",
        "role": "boilerplate",
        "content": "<p>Page 1 of 2 · 작성일: 2026-10-28 · 검증 상태: PASS</p>",
        "backDataRefs": [],
    },
    "mm_slot_meta_card": {
        "slotId": "mm_slot_meta_card",
        "label": "회의 기본 메타데이터 슬롯",
        "role": "editable-slot",
        "content": '<p><strong>일시:</strong> <span data-variable="Meeting.Date">[Meeting.Date]</span><br/><strong>주관:</strong> <span data-variable="Meeting.Owner">[Meeting.Owner]</span><br/><strong>전용 포맷:</strong> <code>*.vdoc</code> (UTF-8 JSON)<br/><strong>핵심 기조:</strong> PandaDoc 80% + 백데이터/인라인 AI 20%</p>',
        "backDataRefs": ["bd_mm_transcript_01"],
    },
    "mm_slot_exec_summary": {
        "slotId": "mm_slot_exec_summary",
        "label": "핵심 아키텍처 결론 요약 슬롯",
        "role": "editable-slot",
        "content": "<p><strong>[Executive Summary]</strong><br/>1. 거대 모놀리식(LibreOffice/VSCode) 통째 Fork를 지양하고 초경량 React 오픈소스 코어만 <code>_upstreams/</code>에 발췌 이식한다.<br/>2. <code>REA</code>로 판다독(Kolas Editor)을 해부하여 모든 블록과 표 셀이 독립 슬롯으로 분리된 구조를 검증 완료했다.</p>",
        "constraints": {"maxLines": 4, "tone": "개조식 핵심 요약"},
        "backDataRefs": ["bd_mm_transcript_01", "bd_mm_rea_report"],
    },
    "mm_slot_th1": {
        "slotId": "mm_slot_th1",
        "label": "표 헤더 1",
        "role": "boilerplate",
        "content": "<p><strong>엔진 층위 (Layer)</strong></p>",
        "constraints": {"locked": True},
        "backDataRefs": [],
    },
    "mm_slot_th2": {
        "slotId": "mm_slot_th2",
        "label": "표 헤더 2",
        "role": "boilerplate",
        "content": "<p><strong>채택 오픈소스 코어</strong></p>",
        "constraints": {"locked": True},
        "backDataRefs": [],
    },
    "mm_slot_th3": {
        "slotId": "mm_slot_th3",
        "label": "표 헤더 3",
        "role": "boilerplate",
        "content": "<p><strong>핵심 역할 및 개조 포인트</strong></p>",
        "constraints": {"locked": True},
        "backDataRefs": [],
    },
    "mm_slot_r1c1": {
        "slotId": "mm_slot_r1c1",
        "label": "1행 1열 (외곽 레이아웃)",
        "role": "editable-slot",
        "content": "<p><strong>외곽 3단 쉘 & Grid/Slot</strong></p>",
        "backDataRefs": ["bd_mm_transcript_01"],
    },
    "mm_slot_r1c2": {
        "slotId": "mm_slot_r1c2",
        "label": "1행 2열 (Puck)",
        "role": "editable-slot",
        "content": "<p><code>measuredco/puck</code> (MIT)</p>",
        "backDataRefs": ["bd_mm_transcript_01"],
    },
    "mm_slot_r1c3": {
        "slotId": "mm_slot_r1c3",
        "label": "1행 3열 (역할)",
        "role": "editable-slot",
        "content": "<p>깨지지 않는 2차원 CSS Grid/Table 틀 고정(WYSIWYM) 및 클릭 시 우측 백데이터 서랍 즉시 연동</p>",
        "backDataRefs": ["bd_mm_transcript_01", "bd_mm_rea_report"],
    },
    "mm_slot_r2c1": {
        "slotId": "mm_slot_r2c1",
        "label": "2행 1열 (슬롯 내부 에디터)",
        "role": "editable-slot",
        "content": "<p><strong>슬롯 내부 위지윅 (WYSIWYG)</strong></p>",
        "backDataRefs": ["bd_mm_transcript_01"],
    },
    "mm_slot_r2c2": {
        "slotId": "mm_slot_r2c2",
        "label": "2행 2열 (Maily.to)",
        "role": "editable-slot",
        "content": "<p><code>arikchakma/maily.to</code> (Tiptap, MIT)</p>",
        "backDataRefs": ["bd_mm_transcript_01"],
    },
    "mm_slot_r2c3": {
        "slotId": "mm_slot_r2c3",
        "label": "2행 3열 (역할)",
        "role": "editable-slot",
        "content": "<p>각 <code>slotId</code> 내부 독립 리치 텍스트 편집, 상단 공통 서식 툴바 연동 및 변수/인장 칩 렌더링</p>",
        "backDataRefs": ["bd_mm_rea_report"],
    },
    "mm_slot_r3c1": {
        "slotId": "mm_slot_r3c1",
        "label": "3행 1열 (AI Composer)",
        "role": "editable-slot",
        "content": "<p><strong>컴포넌트 부착형 AI Composer</strong></p>",
        "backDataRefs": ["bd_mm_transcript_02"],
    },
    "mm_slot_r3c2": {
        "slotId": "mm_slot_r3c2",
        "label": "3행 2열 (Novel + assistant-ui)",
        "role": "editable-slot",
        "content": "<p><code>steven-tey/novel</code> + <code>assistant-ui</code></p>",
        "backDataRefs": ["bd_mm_transcript_02"],
    },
    "mm_slot_r3c3": {
        "slotId": "mm_slot_r3c3",
        "label": "3행 3열 (역할)",
        "role": "editable-slot",
        "content": "<p>선택한 블록/슬롯 바로 아래에 자석처럼 붙는 플로팅 프롬프트 바 + <code>📎 백데이터</code> 컨텍스트 칩 연동</p>",
        "backDataRefs": ["bd_mm_transcript_02"],
    },
    "mm_slot_action_items": {
        "slotId": "mm_slot_action_items",
        "label": "핵심 실행 과제 슬롯",
        "role": "fillable-field",
        "assignee": "서민규 서",
        "content": "<ul><li><strong>[완료]</strong> <code>VibeDocStudio</code> 모노레포 초기화 및 <code>catalog/</code> 1서식=1폴더 번들 구축</li><li><strong>[완료]</strong> <code>REA</code> MCP 연결 및 판다독 <code>Kolas Editor</code> 실시간 해부 표본 확보</li><li><strong>[완료]</strong> <code>Page 2</code>에 예스폼 07번 <code>반상회 회의록</code> 6구역 정밀 프레임 이식</li></ul>",
        "backDataRefs": ["bd_mm_transcript_01", "bd_mm_transcript_02"],
    },
    **bs_slots,
}

mm_backdata = {
    "bd_mm_transcript_01": {
        "chunkId": "bd_mm_transcript_01",
        "sourceTitle": "discovery_trial1_아키텍처_회의록.md",
        "sourceType": "markdown",
        "updatedAt": "2026-10-28",
        "tags": ["Puck", "Maily.to", "모노레포"],
        "excerpt": "판다독(PandaDoc) 80% 골격에 우리만의 백데이터 바인딩 및 인플레이스 AI 20%를 결합하기로 확정. 외곽 뼈대는 Puck의 JSON Schema + CSS Grid를 채택하고, 슬롯 내부는 Maily.to의 Tiptap 커스텀 노드를 결합함. 파일 확장자는 속이 100% JSON인 .vdoc으로 관리.",
    },
    "bd_mm_transcript_02": {
        "chunkId": "bd_mm_transcript_02",
        "sourceTitle": "AI_Composer_UX_결정사항_메모.txt",
        "sourceType": "transcript",
        "updatedAt": "2026-10-28",
        "tags": ["AI Composer", "Novel", "assistant-ui"],
        "excerpt": "우측 패널에 고정된 채팅창만 두면 시선 이동이 불편하므로, 각 컴포넌트(배너, 표, 슬롯)를 클릭할 때 바로 그 컴포넌트 테두리 아래에 달라붙는 부착형(Inline Floating) AI Composer를 메인으로 채택. 우측 패널은 클릭한 슬롯에 연결된 백데이터 원문을 펼쳐 보는 Reference Drawer로 활용.",
    },
    "bd_mm_rea_report": {
        "chunkId": "bd_mm_rea_report",
        "sourceTitle": "_dissections/pandadoc/03.module_anatomy.md",
        "sourceType": "markdown",
        "updatedAt": "2026-10-28",
        "tags": ["REA", "PandaDoc", "Kolas Editor"],
        "excerpt": "REA 실시간 해부 결과, 판다독(PandaDoc Kolas Editor) 역시 문서 전체를 통짜 contentEditable로 쓰지 않고 모든 제목, 문단, 표의 개별 셀마다 독립된 [textbox] 슬롯을 마운트하며, 좌측 Document preview는 동일한 페이지 트리를 축소 미러링하여 렌더링함.",
    },
    **bs_backdata,
}

mm_doc = {
    "version": "1.0.0",
    "docId": "vdoc_meeting_minutes_1028",
    "title": "10월 4주차 VibeDocStudio 아키텍처 정례 회의록",
    "status": "Draft",
    "totalValueText": "2 Pages · 4 Decisions",
    "updatedAt": "2026-10-28T17:56:00+09:00",
    "variables": {
        "Meeting.Date": "2026-10-28",
        "Meeting.Owner": "서민규 서",
        "Project.Name": "VibeDocStudio",
    },
    "pages": [
        {
            "pageId": "mm_page_1",
            "pageNumber": 1,
            "pageLabel": "핵심 결정사항 & 아키텍처 합의",
            "headerSlotId": "mm_slot_header",
            "footerSlotId": "mm_slot_footer",
            "blocks": [
                {
                    "blockId": "mm_blk_summary_cols",
                    "kind": "columns-grid",
                    "title": "회의 개요 및 핵심 결론 2단 그리드",
                    "widths": ["1fr", "1.3fr"],
                    "slotIds": ["mm_slot_meta_card", "mm_slot_exec_summary"],
                },
                {
                    "blockId": "mm_blk_decision_table",
                    "kind": "structured-table",
                    "title": "레이어별 오픈소스 발췌 합체 결정사항 표",
                    "columnWidths": ["24%", "36%", "40%"],
                    "rows": [
                        {
                            "rowId": "mm_r_hdr",
                            "cells": [
                                {"cellId": "mm_ch1", "slotId": "mm_slot_th1", "isHeader": True},
                                {"cellId": "mm_ch2", "slotId": "mm_slot_th2", "isHeader": True},
                                {"cellId": "mm_ch3", "slotId": "mm_slot_th3", "isHeader": True},
                            ],
                        },
                        {
                            "rowId": "mm_r_1",
                            "cells": [
                                {"cellId": "mm_c11", "slotId": "mm_slot_r1c1"},
                                {"cellId": "mm_c12", "slotId": "mm_slot_r1c2"},
                                {"cellId": "mm_c13", "slotId": "mm_slot_r1c3"},
                            ],
                        },
                        {
                            "rowId": "mm_r_2",
                            "cells": [
                                {"cellId": "mm_c21", "slotId": "mm_slot_r2c1"},
                                {"cellId": "mm_c22", "slotId": "mm_slot_r2c2"},
                                {"cellId": "mm_c23", "slotId": "mm_slot_r2c3"},
                            ],
                        },
                        {
                            "rowId": "mm_r_3",
                            "cells": [
                                {"cellId": "mm_c31", "slotId": "mm_slot_r3c1"},
                                {"cellId": "mm_c32", "slotId": "mm_slot_r3c2"},
                                {"cellId": "mm_c33", "slotId": "mm_slot_r3c3"},
                            ],
                        },
                    ],
                },
                {
                    "blockId": "mm_blk_action_items",
                    "kind": "fillable-group",
                    "title": "차주 핵심 실행 과제 (Action Items)",
                    "slotId": "mm_slot_action_items",
                    "assigneeName": "서민규 서",
                    "fieldType": "kpi-summary",
                },
            ],
        },
        {
            "pageId": "mm_page_2",
            "pageNumber": 2,
            "pageLabel": "반상회 회의록 (예스폼 07번 정밀 서식)",
            "headerSlotId": "bs_page_header",
            "footerSlotId": "bs_page_footer",
            "hideHeaderFooter": True,
            "blocks": bs_blocks,
        },
    ],
    "slots": mm_slots,
    "backdata": mm_backdata,
}

mm_manifest = {
    "catalogId": "vibe-architecture-minutes",
    "title": "10월 4주차 VibeDocStudio 아키텍처 정례 회의록 (+ Page 2 반상회 회의록)",
    "sourceOrigin": "VibeDocStudio Internal + Yesform 07",
    "category": "엔지니어링·자치 복합 회의록",
    "tags": ["GSV-01", "반상회회의록", "2Pages"],
    "description": "Page 1 아키텍처 정례 회의록 + Page 2 예스폼 07번 반상회 회의록 정밀 이식본",
}

with open(os.path.join(CATALOG_DIR, "vibe-architecture-minutes", "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(mm_manifest, f, ensure_ascii=False, indent=2)

with open(os.path.join(CATALOG_DIR, "vibe-architecture-minutes", "document.json"), "w", encoding="utf-8") as f:
    json.dump(mm_doc, f, ensure_ascii=False, indent=2)

print("Built catalog/vibe-architecture-minutes/document.json (with Page 2 = 반상회 회의록)")


# 3. Build `catalog/pandadoc-vc-proposal/document.json` & `manifest.json`
vc_doc = {
    "version": "1.0.0",
    "docId": "vdoc_pandadoc_vc_proposal",
    "title": "Venture Capital Proposal Template",
    "status": "Draft",
    "totalValueText": "$0.00",
    "updatedAt": "2026-10-28T16:50:00+09:00",
    "variables": {
        "Sender.Company": "VibeDoc Labs Inc.",
        "Sender.FirstName": "서민규",
        "Sender.LastName": "서",
        "Client.FirstName": "Alex",
        "Client.LastName": "Morgan",
        "Client.Company": "Horizon Ventures",
    },
    "pages": [
        {
            "pageId": "page_1",
            "pageNumber": 1,
            "pageLabel": "Cover page",
            "headerSlotId": "slot_p1_header",
            "footerSlotId": "slot_p1_footer",
            "blocks": [
                {
                    "blockId": "blk_cover_1",
                    "kind": "cover-banner",
                    "title": "Cover Hero Banner",
                    "backgroundTheme": "dark-architecture",
                    "headlineSlotId": "slot_cover_headline",
                    "preparedBySlotId": "slot_cover_prepared_by",
                    "preparedForSlotId": "slot_cover_prepared_for",
                }
            ],
        },
        {
            "pageId": "page_2",
            "pageNumber": 2,
            "pageLabel": "What We Do & Investment Summary",
            "headerSlotId": "slot_p2_header",
            "footerSlotId": "slot_p2_footer",
            "blocks": [
                {
                    "blockId": "blk_what_we_do",
                    "kind": "section-block",
                    "title": "What We Do Section",
                    "headingSlotId": "slot_wwd_heading",
                    "bodySlotId": "slot_wwd_body",
                },
                {
                    "blockId": "blk_fillable_short_desc",
                    "kind": "fillable-group",
                    "title": "Short Description of Business",
                    "slotId": "slot_short_desc_field",
                    "assigneeName": "서민규 서",
                    "fieldType": "text-area",
                },
                {
                    "blockId": "blk_inv_summary",
                    "kind": "section-block",
                    "title": "Investment Summary Section",
                    "headingSlotId": "slot_inv_sum_heading",
                    "bodySlotId": "slot_inv_sum_body",
                },
                {
                    "blockId": "blk_inv_desc",
                    "kind": "section-block",
                    "title": "Investment Description Section",
                    "headingSlotId": "slot_inv_desc_heading",
                    "bodySlotId": "slot_inv_desc_body",
                },
            ],
        },
        {
            "pageId": "page_3",
            "pageNumber": 3,
            "pageLabel": "Expected Returns & Allocation Table",
            "headerSlotId": "slot_p3_header",
            "footerSlotId": "slot_p3_footer",
            "blocks": [
                {
                    "blockId": "blk_expected_returns",
                    "kind": "section-block",
                    "title": "Expected Returns Section",
                    "headingSlotId": "slot_returns_heading",
                    "bodySlotId": "slot_returns_body",
                },
                {
                    "blockId": "blk_fillable_areas",
                    "kind": "fillable-group",
                    "title": "Area(s) of investment",
                    "slotId": "slot_investment_areas_field",
                    "assigneeName": "서민규 서",
                    "fieldType": "text-area",
                },
                {
                    "blockId": "blk_allocation_table",
                    "kind": "structured-table",
                    "title": "Capital Allocation & ROI Breakdown Table",
                    "columnWidths": ["28%", "44%", "28%"],
                    "rows": [
                        {
                            "rowId": "row_hdr",
                            "cells": [
                                {"cellId": "c_h1", "slotId": "slot_tbl_h1", "isHeader": True},
                                {"cellId": "c_h2", "slotId": "slot_tbl_h2", "isHeader": True},
                                {"cellId": "c_h3", "slotId": "slot_tbl_h3", "isHeader": True},
                            ],
                        },
                        {
                            "rowId": "row_1",
                            "cells": [
                                {"cellId": "c_1_1", "slotId": "slot_tbl_r1c1"},
                                {"cellId": "c_1_2", "slotId": "slot_tbl_r1c2"},
                                {"cellId": "c_1_3", "slotId": "slot_tbl_r1c3"},
                            ],
                        },
                        {
                            "rowId": "row_2",
                            "cells": [
                                {"cellId": "c_2_1", "slotId": "slot_tbl_r2c1"},
                                {"cellId": "c_2_2", "slotId": "slot_tbl_r2c2"},
                                {"cellId": "c_2_3", "slotId": "slot_tbl_r2c3"},
                            ],
                        },
                    ],
                },
            ],
        },
    ],
    "slots": {
        "slot_p1_header": {"slotId": "slot_p1_header", "label": "Page 1 Header", "role": "boilerplate", "content": "<p>Venture Capital Proposal · Confidential</p>", "backDataRefs": []},
        "slot_p1_footer": {"slotId": "slot_p1_footer", "label": "Page 1 Footer", "role": "boilerplate", "content": "<p>Page 1 of 3 · Prepared with VibeDocStudio</p>", "backDataRefs": []},
        "slot_cover_headline": {"slotId": "slot_cover_headline", "label": "Cover Title Slot", "role": "editable-slot", "content": "<h1>Venture Proposal Template</h1>", "constraints": {"maxLines": 2, "tone": "Executive Bold"}, "backDataRefs": ["bd_ir_overview"]},
        "slot_cover_prepared_by": {"slotId": "slot_cover_prepared_by", "label": "Prepared By Slot", "role": "editable-slot", "content": '<p><strong>Prepared by:</strong><br/>서민규 서<br/><span data-variable="Sender.Company">[Sender.Company]</span></p>', "backDataRefs": ["bd_ir_overview"]},
        "slot_cover_prepared_for": {"slotId": "slot_cover_prepared_for", "label": "Prepared For Slot", "role": "editable-slot", "content": '<p><strong>Prepared for:</strong><br/><span data-variable="Client.FirstName">[Client.FirstName]</span> <span data-variable="Client.LastName">[Client.LastName]</span><br/><span data-variable="Client.Company">[Client.Company]</span></p>', "backDataRefs": ["bd_ir_overview"]},
        "slot_p2_header": {"slotId": "slot_p2_header", "label": "Page 2 Header", "role": "boilerplate", "content": "<p>Section 01 — Business Overview & Investment Thesis</p>", "backDataRefs": []},
        "slot_p2_footer": {"slotId": "slot_p2_footer", "label": "Page 2 Footer", "role": "boilerplate", "content": '<p>Page 2 of 3 · <span data-variable="Sender.Company">[Sender.Company]</span></p>', "backDataRefs": []},
        "slot_wwd_heading": {"slotId": "slot_wwd_heading", "label": "What We Do Heading", "role": "boilerplate", "content": "<h2>What We Do</h2>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_wwd_body": {"slotId": "slot_wwd_body", "label": "What We Do Body", "role": "editable-slot", "content": "<p>This title should be as concise as possible, but still descriptive enough to get across exactly what it is that your business does. Try to keep it to around 50 characters or fewer.</p>", "constraints": {"maxLines": 4, "tone": "Concise Pitch"}, "backDataRefs": ["bd_ir_overview", "bd_product_metrics"]},
        "slot_short_desc_field": {"slotId": "slot_short_desc_field", "label": "Short Description of Business (Fillable Slot)", "role": "fillable-field", "assignee": "서민규 서", "content": "<p>1차원 마크다운 문서의 독해 피로도를 해결하는 <strong>Grid-Slot 기반 AI WYSIWYG + WYSIWYM 문서 빌더 엔진</strong>을 개발합니다.</p>", "constraints": {"maxLines": 3, "placeholder": "Short Description of Business"}, "backDataRefs": ["bd_ir_overview"]},
        "slot_inv_sum_heading": {"slotId": "slot_inv_sum_heading", "label": "Investment Summary Heading", "role": "boilerplate", "content": "<h2>Investment Summary</h2>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_inv_sum_body": {"slotId": "slot_inv_sum_body", "label": "Investment Summary Body", "role": "editable-slot", "content": '<p><span data-variable="Sender.Company">[Sender.Company]</span> is a cutting-edge business offering services to target market. We are writing to you to seek a <strong>$2,500,000 Seed investment</strong> from your company to expand our engineering and enterprise sales operations.</p><p>Based on our comprehensive forecasting, we expect you to see an ROI of <strong>340%</strong> in just <strong>24 months</strong>.</p>', "constraints": {"maxLines": 5, "tone": "Data-Driven"}, "backDataRefs": ["bd_financial_projection", "bd_product_metrics"]},
        "slot_inv_desc_heading": {"slotId": "slot_inv_desc_heading", "label": "Investment Description Heading", "role": "boilerplate", "content": "<h2>Investment Description</h2>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_inv_desc_body": {"slotId": "slot_inv_desc_body", "label": "Investment Description Body", "role": "editable-slot", "content": "<p>Our business was started to address the growing enterprise demand for structured AI document workflows. We offer a unique competitive advantage: <strong>Slot-Scoped Backdata Grounding + Zero-Collapse CSS Grid Layouts</strong>.</p>", "constraints": {"maxLines": 4}, "backDataRefs": ["bd_ir_overview", "bd_product_metrics"]},
        "slot_p3_header": {"slotId": "slot_p3_header", "label": "Page 3 Header", "role": "boilerplate", "content": "<p>Section 02 — Expected Returns & Capital Allocation</p>", "backDataRefs": []},
        "slot_p3_footer": {"slotId": "slot_p3_footer", "label": "Page 3 Footer", "role": "boilerplate", "content": "<p>Page 3 of 3 · Confidential Proposal</p>", "backDataRefs": []},
        "slot_returns_heading": {"slotId": "slot_returns_heading", "label": "Expected Returns Heading", "role": "boilerplate", "content": "<h2>Expected Returns</h2>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_returns_body": {"slotId": "slot_returns_body", "label": "Expected Returns Body", "role": "editable-slot", "content": "<p>We expect that your investment of <strong>$2,500,000</strong> will result in an ARR expansion to <strong>$8.4M</strong> over 24 months via targeted allocation across R&D and enterprise GTM.</p>", "constraints": {"maxLines": 4}, "backDataRefs": ["bd_financial_projection"]},
        "slot_investment_areas_field": {"slotId": "slot_investment_areas_field", "label": "Area(s) of investment (Fillable Slot)", "role": "fillable-field", "assignee": "서민규 서", "content": "<ul><li>코어 에디터 R&D (Puck + Maily.to + In-place AI Composer 고도화): 55%</li><li>엔터프라이즈 문서 파서 및 보안 인프라: 25%</li><li>글로벌 B2B GTM 및 파트너십: 20%</li></ul>", "constraints": {"maxLines": 4, "placeholder": "Area(s) of investment"}, "backDataRefs": ["bd_financial_projection"]},
        "slot_tbl_h1": {"slotId": "slot_tbl_h1", "label": "Table Header 1", "role": "boilerplate", "content": "<p><strong>투자 집행 영역</strong></p>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_tbl_h2": {"slotId": "slot_tbl_h2", "label": "Table Header 2", "role": "boilerplate", "content": "<p><strong>핵심 마일스톤 및 산출물</strong></p>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_tbl_h3": {"slotId": "slot_tbl_h3", "label": "Table Header 3", "role": "boilerplate", "content": "<p><strong>배정 예산 (비중)</strong></p>", "constraints": {"locked": True}, "backDataRefs": []},
        "slot_tbl_r1c1": {"slotId": "slot_tbl_r1c1", "label": "Row 1 · 부문", "role": "editable-slot", "content": "<p><strong>WYSIWYM 엔진 코어</strong></p>", "backDataRefs": ["bd_product_metrics"]},
        "slot_tbl_r1c2": {"slotId": "slot_tbl_r1c2", "label": "Row 1 · 마일스톤", "role": "editable-slot", "content": "<p>.vdoc 규격 표준화 및 슬롯 단위 백데이터 자동 매핑 파이프라인 구축</p>", "backDataRefs": ["bd_product_metrics", "bd_ir_overview"]},
        "slot_tbl_r1c3": {"slotId": "slot_tbl_r1c3", "label": "Row 1 · 예산", "role": "editable-slot", "content": "<p><strong>$1,375,000 (55%)</strong></p>", "backDataRefs": ["bd_financial_projection"]},
        "slot_tbl_r2c1": {"slotId": "slot_tbl_r2c1", "label": "Row 2 · 부문", "role": "editable-slot", "content": "<p><strong>Enterprise GTM</strong></p>", "backDataRefs": ["bd_financial_projection"]},
        "slot_tbl_r2c2": {"slotId": "slot_tbl_r2c2", "label": "Row 2 · 마일스톤", "role": "editable-slot", "content": "<p>북미·아시아 50개 엔터프라이즈 고객사 파일럿 도입 및 ARR $3M 달성</p>", "backDataRefs": ["bd_financial_projection"]},
        "slot_tbl_r2c3": {"slotId": "slot_tbl_r2c3", "label": "Row 2 · 예산", "role": "editable-slot", "content": "<p><strong>$1,125,000 (45%)</strong></p>", "backDataRefs": ["bd_financial_projection"]},
    },
    "backdata": {
        "bd_ir_overview": {
            "chunkId": "bd_ir_overview",
            "sourceTitle": "2026_IR_Executive_Deck_Notes.md",
            "sourceType": "markdown",
            "updatedAt": "2026-10-28",
            "tags": ["비전", "핵심기술", "차별화"],
            "excerpt": "VibeDoc Labs는 기존 1차원 마크다운(.md) 줄글의 독해 피로도와 단일 Tiptap 표의 레이아웃 붕괴 문제를 동시에 해결하기 위해, 외곽 CSS Grid(WYSIWYM)와 슬롯 내부 경량 Tiptap(WYSIWYG)을 분리한 .vdoc 엔진을 개발함.",
        },
        "bd_financial_projection": {
            "chunkId": "bd_financial_projection",
            "sourceTitle": "Seed_Round_Financial_Model_v4.pdf",
            "sourceType": "pdf",
            "updatedAt": "2026-10-27",
            "tags": ["재무추정", "ROI", "예산배분"],
            "excerpt": "총 조달 목표 금액: $2,500,000 (Seed). 자금 배분: R&D 및 코어 엔진 고도화 55% ($1.375M), 보안/인프라 및 엔터프라이즈 GTM 45% ($1.125M). 투자 후 24개월 내 예상 ARR $8.4M 및 예상 ROI 340% 달성 목표.",
        },
        "bd_product_metrics": {
            "chunkId": "bd_product_metrics",
            "sourceTitle": "PoC_User_Benchmark_Transcript.txt",
            "sourceType": "transcript",
            "updatedAt": "2026-10-26",
            "tags": ["벤치마크", "고객반응", "생산성"],
            "excerpt": "사내 회의록 및 제안서 120건 대상 정량 테스트 결과, 기존 마크다운 대비 문서 파악 속도 3.2배 향상, AI 재작성 시 표/그리드 서식 붕괴율 0% 기록.",
        },
    },
}

vc_manifest = {
    "catalogId": "pandadoc-vc-proposal",
    "title": "Venture Capital Proposal Template",
    "sourceOrigin": "_dissections/pandadoc/02.document_schema.json",
    "category": "투자 제안서 (PandaDoc 실측)",
    "tags": ["PandaDoc", "KolasEditor", "VC", "Proposal"],
    "description": "REA 실시간 해부로 추출한 PandaDoc Kolas Editor 3페이지 투자 제안서 원본 복원 번들",
}

with open(os.path.join(CATALOG_DIR, "pandadoc-vc-proposal", "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(vc_manifest, f, ensure_ascii=False, indent=2)

with open(os.path.join(CATALOG_DIR, "pandadoc-vc-proposal", "document.json"), "w", encoding="utf-8") as f:
    json.dump(vc_doc, f, ensure_ascii=False, indent=2)

catalog_index = {
    "version": "1.0.0",
    "updatedAt": "2026-10-28T17:58:00+09:00",
    "entries": [
        mm_manifest,
        bansanghoe_manifest,
        vc_manifest,
    ],
}

with open(os.path.join(CATALOG_DIR, "index.json"), "w", encoding="utf-8") as f:
    json.dump(catalog_index, f, ensure_ascii=False, indent=2)

print("Built catalog/pandadoc-vc-proposal/ and catalog/index.json!")

