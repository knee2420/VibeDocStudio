"""선별 슬롯 탐지(/ToUnicode 누락·깨짐) 및 바운더리 불변 HTML 패치 + E2E 파이프라인 테스트."""
from __future__ import annotations

import pymupdf
from pdf_fidelity_engine import (
    RefinedSlotPatch,
    SuspectSlot,
    apply_slot_patches,
    detect_suspect_slots,
    run_fidelity_extraction,
)


class _StubRefiner:
    def __init__(self) -> None:
        self.called_with: list[SuspectSlot] = []

    def refine_slots(self, *, page_png_bytes, doc_title, suspects, page_vdoc):
        self.called_with = list(suspects)
        return {
            s.slot_id: RefinedSlotPatch(slot_id=s.slot_id, paragraphs=["회 장: 지금부터 개회를 선언합니다."])
            for s in suspects
        }


def _make_sample_pdf_bytes() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 90), "Hello Clean Header", fontsize=14)
    # 磿 (한자 U+78FF — has_to_unicode 또는 CJK 깨짐 휴리스틱 테스트용) + 표 외곽선
    page.draw_rect(pymupdf.Rect(70, 140, 500, 220), color=(0, 0, 0), width=1.0)
    page.insert_text((82, 175), "Table Normal Text", fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def test_detect_suspect_slots_flags_missing_tounicode_and_garble_and_patches_safely() -> None:
    slots = {
        "p1_B1": {"slotId": "p1_B1", "content": '<p style="font-size: 11pt; margin: 0"><span>정상 안내 문구</span></p>'},
        "p1_B2": {"slotId": "p1_B2", "content": '<p style="font-size: 11pt; margin: 4px 0 0 0"><span>회 장: 磿</span></p>'},
    }
    page_vdoc = {
        "blocks": [
            {"blockId": "p1_B1", "kind": "text", "title": "정상", "slotId": "p1_B1", "frame": {"x": 50, "y": 50, "w": 300, "h": 24}},
            {"blockId": "p1_B2", "kind": "text", "title": "깨짐", "slotId": "p1_B2", "frame": {"x": 50, "y": 90, "w": 300, "h": 24}},
        ]
    }
    truth = {
        "spans": [
            {"x": 55, "y": 52, "x1": 150, "y1": 66, "pt": 11.0, "has_to_unicode": True},
            {"x": 55, "y": 92, "x1": 150, "y1": 106, "pt": 11.0, "has_to_unicode": False},
        ]
    }
    suspects = detect_suspect_slots(page_vdoc=page_vdoc, slots=slots, truth=truth)
    assert [s.slot_id for s in suspects] == ["p1_B2"]
    assert "no_tounicode" in suspects[0].reasons
    assert "pua_or_cjk_anomaly" in suspects[0].reasons

    patched_slots, applied = apply_slot_patches(
        slots,
        {"p1_B2": RefinedSlotPatch(slot_id="p1_B2", paragraphs=["회 장: 씩씩하게 인사"])},
    )
    assert applied == ["p1_B2"]
    assert 'margin: 4px 0 0 0' in patched_slots["p1_B2"]["content"]
    assert "회 장: 씩씩하게 인사" in patched_slots["p1_B2"]["content"]
    assert patched_slots["p1_B1"] == slots["p1_B1"]


def test_run_fidelity_extraction_e2e_on_real_pymupdf_pdf() -> None:
    pdf_bytes = _make_sample_pdf_bytes()
    refiner = _StubRefiner()
    res = run_fidelity_extraction(pdf_bytes, page_number=1, doc_title="Sample", refiner=refiner)
    assert len(res.model["tables"]) == 1
    assert res.applied_patches == []  # ASCII 정상 텍스트만 있으므로 VLM 정제기 불필요 호출 없음
    assert refiner.called_with == []
