"""PDF 양식 스캐폴딩 엔드포인트(/api/catalog/scaffold) 및 블록 정규화 불변식 테스트."""
from pathlib import Path

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

SOURCE_PDF = (
    Path(__file__).resolve().parents[3]
    / "work"
    / "fidelity"
    / "vform_107824"
    / "source.pdf"
)


def test_scaffold_pdf_endpoint() -> None:
    assert SOURCE_PDF.exists(), f"Source PDF must exist at {SOURCE_PDF}"
    pdf_bytes = SOURCE_PDF.read_bytes()

    response = client.post(
        "/api/catalog/scaffold",
        files={"file": ("source.pdf", pdf_bytes, "application/pdf")},
        data={"title": "학술정보운영위원회 규정"},
    )
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["docId"].startswith("vdoc-")
    assert data["title"] == "학술정보운영위원회 규정"
    assert data["totalPages"] >= 1
    assert data["checkedBlocks"] >= 3
    assert data["checkedSlots"] >= 5
    assert isinstance(data.get("agentRun"), dict)
    assert data["agentRun"].get("engine") == "docstruct-engine"

    vdoc = data["document"]
    assert "pages" in vdoc and len(vdoc["pages"]) >= 1
    slots_text = " ".join(s.get("content", "") for s in vdoc.get("slots", {}).values())
    assert "학술정보운영위원회 규정" in slots_text
    assert "제 1 조" in slots_text
    page1 = vdoc["pages"][0]
    page_w = page1.get("pageRect", {}).get("width", 794.0)

    # F-BLOCK-001 기하 불변식: 모든 블록의 frame.x + frame.w <= page_w
    for block in page1["blocks"]:
        frame = block.get("frame")
        if frame:
            x = frame["x"]
            w = frame["w"]
            assert x >= 0.0, f"Block {block['blockId']} frame.x={x} must be >= 0"
            assert (
                x + w <= page_w + 1.5
            ), f"Block {block['blockId']} overflowed page: {x}+{w}={x+w} > {page_w}"

        # 슬롯 존재 여부 및 HTML 검증
        slot_id = block.get("slotId")
        if slot_id:
            assert slot_id in vdoc["slots"]
            slot = vdoc["slots"][slot_id]
            assert "<p" in slot["content"]
