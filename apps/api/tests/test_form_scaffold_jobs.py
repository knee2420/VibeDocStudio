"""비동기 순차 PDF 페이지 스캐폴딩 · 1단계 썸네일 미리보기 · CDP 폴백 단위/통합 테스트."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Optional

import pymupdf
from fastapi.testclient import TestClient

from app.form_scaffold.adapters import LocalScaffoldJobStore
from app.form_scaffold.use_cases import ScaffoldJobRunner
from main import app

client = TestClient(app)


def _make_pdf_bytes(page_specs: list[Optional[list[str]]]) -> bytes:
    """각 페이지에 문자열 목록(또는 `None` 이면 벡터 도형만 그리기)을 넣은 테스트 PDF 생성."""
    doc = pymupdf.open()
    for lines in page_specs:
        page = doc.new_page(width=595, height=842)
        if lines is None:
            page.draw_rect(pymupdf.Rect(60, 80, 420, 220), color=(0.2, 0.2, 0.2), width=1.5)
        else:
            y = 90
            for text in lines:
                page.insert_text((72, y), text, fontsize=12)
                y += 22
    return doc.tobytes()


def test_pdf_preview_reports_thumbnails_and_text_layer() -> None:
    pdf_bytes = _make_pdf_bytes([["Hello Form Header", "Section One Detail"], None])
    res = client.post(
        "/api/catalog/pdf-preview",
        files={"file": ("sample-preview.pdf", pdf_bytes, "application/pdf")},
        data={"title": "미리보기 샘플"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "미리보기 샘플"
    assert body["totalPages"] == 2
    assert body["hasAnyTextLayer"] is True
    assert len(body["pages"]) == 2

    p1, p2 = body["pages"]
    assert p1["pageNumber"] == 1
    assert p1["hasTextLayer"] is True
    assert p1["spanCount"] >= 2
    assert p1["thumbnailDataUrl"].startswith("data:image/jpeg;base64,")

    assert p2["pageNumber"] == 2
    assert p2["hasTextLayer"] is False
    assert p2["drawingCount"] >= 1
    assert p2["thumbnailDataUrl"].startswith("data:image/jpeg;base64,")


def test_scaffold_job_slices_only_selected_page_and_emits_completion() -> None:
    pdf_bytes = _make_pdf_bytes([
        ["Page One Secret Header", "Only First Page Text"],
        ["Page Two Body Title", "Selected Target Row Content"],
    ])
    pages_payload = json.dumps([
        {"pageNumber": 2, "placeholderPageId": "ph_2", "thumbnail": "data:image/jpeg;base64,AAAA"}
    ])
    res = client.post(
        "/api/catalog/scaffold-jobs",
        files={"file": ("two-page.pdf", pdf_bytes, "application/pdf")},
        data={
            "title": "선택 추출 문서",
            "target_doc_id": "doc_target_1",
            "mode": "insert-pages",
            "fidelity_mode": "balanced",
            "pages_json": pages_payload,
        },
    )
    assert res.status_code == 200
    created = res.json()
    job_id = created["jobId"]
    assert created["status"] == "queued"
    assert created["targetDocId"] == "doc_target_1"
    assert len(created["pages"]) == 1
    assert created["pages"][0]["pageNumber"] == 2
    assert created["pages"][0]["placeholderPageId"] == "ph_2"

    # 작업 완료 대기 (폴링)
    detail: dict[str, Any] = {}
    for _ in range(100):
        poll = client.get(f"/api/catalog/scaffold-jobs/{job_id}")
        assert poll.status_code == 200
        detail = poll.json()
        if detail["status"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(0.05)

    assert detail["status"] == "completed"
    page_res = detail["pages"][0]
    assert page_res["status"] == "completed"
    assert "(2p)" in page_res["page"]["pageLabel"]
    slots_text = json.dumps(page_res["slots"], ensure_ascii=False)
    assert "Page Two Body Title" in slots_text
    assert "Page One Secret Header" not in slots_text

    # SSE 이벤트 스트림에 시작·완료 이벤트가 기록됐는지 검증
    sse_res = client.get(f"/api/catalog/scaffold-jobs/{job_id}/events")
    assert sse_res.status_code == 200
    event_types = []
    for line in sse_res.text.splitlines():
        if line.startswith("data: "):
            ev = json.loads(line[6:])
            event_types.append(ev["type"])
    assert "job_queued" in event_types
    assert "job_started" in event_types
    assert "page_started" in event_types
    assert "page_completed" in event_types
    assert "job_completed" in event_types


def test_scaffold_job_cancel_marks_waiting_pages_cancelled(tmp_path: Path) -> None:
    pdf_bytes = _make_pdf_bytes([["One"], ["Two"], ["Three"]])
    started_first = threading.Event()
    release_first = threading.Event()

    class BlockingStubAgent:
        def scaffold_document(
            self,
            *,
            pdf_bytes: bytes,
            doc_id: str,
            title: str,
            fidelity_mode: str = "balanced",
            on_progress: Any = None,
            cancel_event: Any = None,
        ) -> tuple[dict[str, Any], int, int, dict[str, Any]]:
            started_first.set()
            if on_progress:
                on_progress({"stage": "fidelity_iter", "iter": 1, "message": "테스트 대기"})
            release_first.wait(timeout=3.0)
            if cancel_event is not None and cancel_event.is_set():
                return (
                    {
                        "docId": doc_id,
                        "title": title,
                        "pages": [{"pageId": "p1", "pageNumber": 1, "pageLabel": f"{title} (1p)", "blocks": []}],
                        "slots": {},
                        "variables": {},
                    },
                    0,
                    0,
                    {"status": "cancelled"},
                )
            return (
                {
                    "docId": doc_id,
                    "title": title,
                    "pages": [{"pageId": "p1", "pageNumber": 1, "pageLabel": f"{title} (1p)", "blocks": []}],
                    "slots": {},
                    "variables": {},
                },
                0,
                0,
                {"status": "completed"},
            )

    runner = ScaffoldJobRunner(store=LocalScaffoldJobStore(tmp_path / "jobs"), agent=BlockingStubAgent())  # type: ignore[arg-type]
    try:
        job = runner.submit(
            pdf_bytes=pdf_bytes,
            title="취소 테스트",
            target_doc_id="doc_1",
            selected_pages=[
                {"pageNumber": 1, "placeholderPageId": "ph_1"},
                {"pageNumber": 2, "placeholderPageId": "ph_2"},
                {"pageNumber": 3, "placeholderPageId": "ph_3"},
            ],
        )
        assert started_first.wait(timeout=3.0)
        cancelled = runner.cancel(job.job_id)
        assert cancelled is not None
        release_first.set()

        for _ in range(100):
            cur = runner.get(job.job_id)
            if cur and cur.terminal:
                break
            time.sleep(0.02)

        final_job = runner.get(job.job_id)
        assert final_job is not None
        assert final_job.status == "cancelled"
        assert final_job.pages[1].status == "cancelled"
        assert final_job.pages[2].status == "cancelled"
    finally:
        runner.shutdown()
