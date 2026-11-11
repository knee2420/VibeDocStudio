"""높이 · 소제목 기반 페이지 분할 및 고아 제목 방지 단위 테스트."""
from __future__ import annotations

from webpage_fidelity_engine.layout import (
    MappedBlock,
    make_slot,
    paginate_mapped_blocks,
)


def _txt_item(idx: int, est_h: float, text: str = "본문") -> MappedBlock:
    bid = f"b_{idx}"
    sid = f"{bid}_s"
    return MappedBlock(
        block={"blockId": bid, "kind": "text", "title": text, "slotId": sid},
        slots={sid: make_slot(sid, text, f"<p>{text}</p>")},
        estimated_height_px=est_h,
        preview_text=text,
    )


def _hd_item(idx: int, est_h: float, title: str) -> MappedBlock:
    bid = f"h_{idx}"
    sid = f"{bid}_s"
    return MappedBlock(
        block={"blockId": bid, "kind": "heading", "title": title, "slotId": sid, "level": 2, "align": "left"},
        slots={sid: make_slot(sid, title, f"<p>{title}</p>")},
        estimated_height_px=est_h,
        is_major_heading=True,
        heading_text=title,
        preview_text=title,
    )


def test_paginator_slices_by_height_without_splitting_blocks() -> None:
    items = [_txt_item(i, 320.0, f"문단 {i}") for i in range(1, 7)]
    pages = paginate_mapped_blocks(items, doc_title="테스트", target_height_px=1123, split_mode="height")
    assert len(pages) == 2
    assert [it.block["blockId"] for it in pages[0].items] == ["b_1", "b_2", "b_3"]
    assert [it.block["blockId"] for it in pages[1].items] == ["b_4", "b_5", "b_6"]


def test_paginator_prevents_widow_heading_at_page_bottom() -> None:
    items = [
        _txt_item(1, 600.0, "긴 앞 본문"),
        _hd_item(2, 60.0, "새 장 제목"),
        _txt_item(3, 450.0, "새 장 첫 본문"),
    ]
    pages = paginate_mapped_blocks(items, doc_title="테스트", target_height_px=1123, split_mode="height")
    assert len(pages) == 2
    assert [it.block["blockId"] for it in pages[0].items] == ["b_1"]
    assert [it.block["blockId"] for it in pages[1].items] == ["h_2", "b_3"]


def test_paginator_heading_mode_splits_at_major_headings() -> None:
    items = [
        _hd_item(1, 60.0, "섹션 1"),
        _txt_item(2, 300.0, "섹션 1 본문"),
        _hd_item(3, 60.0, "섹션 2"),
        _txt_item(4, 280.0, "섹션 2 본문"),
    ]
    pages = paginate_mapped_blocks(items, doc_title="가이드", target_height_px=1123, split_mode="heading")
    assert len(pages) == 2
    assert pages[1].page_label.startswith("섹션 2")


def test_paginator_keeps_heading_image_and_caption_cluster_together() -> None:
    img_cap = _txt_item(3, 30.0, "사진 설명")
    img_cap.keep_with_prev = True
    items = [
        _txt_item(1, 560.0, "앞 섹션 내용"),
        _hd_item(2, 50.0, "영감의 도시"),
        MappedBlock(
            block={"blockId": "img_3", "kind": "image", "title": "스카이라인", "src": "data:image/jpeg;base64,A"},
            slots={},
            estimated_height_px=380.0,
        ),
        img_cap,
    ]
    # 560 + 16 + 50 + 16 + 380 + 16 + 30 = 1068 > usable_h(1027) -> 제목·이미지·캡션 통째로 2p 이동
    pages = paginate_mapped_blocks(items, doc_title="여행", target_height_px=1123, split_mode="height")
    assert len(pages) == 2
    assert [it.block["blockId"] for it in pages[0].items] == ["b_1"]
    assert [it.block["blockId"] for it in pages[1].items] == ["h_2", "img_3", "b_3"]
