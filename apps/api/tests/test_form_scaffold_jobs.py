"""비동기 순차 PDF 페이지 스캐폴딩 · 1단계 썸네일 미리보기 · CDP 폴백 단위/통합 테스트."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Optional

import pymupdf
import pytest
from fastapi.testclient import TestClient
from harness_kit import packs
from pdf_fidelity_engine import SuspectSlot

from app.form_scaffold.adapters import AgySlotTextRefiner, LocalScaffoldJobStore
from app.form_scaffold.agents import FormScaffoldAgent
from app.form_scaffold.agents.fidelity_loop import FidelityWorkspace, Iteration
from app.form_scaffold.use_cases import ScaffoldJobRunner
from app.llm.models import OneShotResult
from app.llm.policy import CLI_PROVIDER, GOOGLE_PROVIDER, RuntimeExecutionPolicy
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


def test_fidelity_loop_fallback_no_cdp_preserves_geometry(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pdf_bytes = _make_pdf_bytes([["Fallback Preserved Text", "Second Line Detail"]])
    baseline_doc = {
        "docId": "doc_fb",
        "title": "폴백 테스트",
        "pages": [{"pageId": "p1", "pageNumber": 1, "label": "폴백 테스트 (1p)", "blocks": []}],
        "slots": {},
        "variables": {},
    }
    policy = RuntimeExecutionPolicy(
        primary_provider=CLI_PROVIDER,
        fallback_provider=GOOGLE_PROVIDER,
        google_api_model="gemini-3.8-flash",
        google_api_timeout_seconds=30,
        agent_cli_model="gemini-3.8-flash",
        agent_cli_timeout_seconds=30,
        agent_cli_bin="agy",
    )
    tools_dir = packs.path("form-scaffold:tools/visual_fidelity")
    skill_dir = packs.path("form-scaffold:skills/external_pm_08_visual_fidelity_replicator")
    agent = FormScaffoldAgent(
        policy=policy,
        agent_runs_dir=tmp_path / "runs",
        fidelity_tools_dir=tools_dir,
        fidelity_skill_dir=skill_dir,
        external_llm_enabled=True,
        agentic_loop_enabled=True,
    )

    def fake_evaluate(self: FidelityWorkspace, note: str = "") -> Iteration:
        return Iteration(
            index=0,
            tune=self.tune,
            plan=self.plan,
            out_dir=self.dir / "iter_00",
            error="URLError: [WinError 10061] 대상 컴퓨터에서 연결을 거부했으므로 연결하지 못했습니다",
        )

    monkeypatch.setattr(FidelityWorkspace, "evaluate", fake_evaluate)

    doc, info = agent._run_fidelity_loop(
        pdf_bytes=pdf_bytes,
        baseline_doc=baseline_doc,
        doc_id="doc_fb",
        doc_title="폴백 테스트",
        fidelity_mode="balanced",
    )
    assert info["status"] == "fallback_no_cdp"
    assert doc is not None
    serialized = json.dumps(doc, ensure_ascii=False)
    assert "Fallback Preserved Text" in serialized
    assert len(info["warnings"]) >= 1


def test_agy_slot_text_refiner_patches_only_suspect_slots_preserving_frames(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pdf_bytes = _make_pdf_bytes([["Header Clean Title", "Corrupted Symbol Row"]])
    captured_prompts: list[str] = []

    def fake_one_shot(prompt: str, **kwargs: Any) -> OneShotResult:
        captured_prompts.append(prompt)
        # 깨진 슬롯 1건만 복원하고, 알 수 없는 슬롯 ID 는 무시되는지도 함께 검증
        return OneShotResult(
            ok=True,
            response={
                "patches": {
                    "p1_B2": {"paragraphs": ["☞ 회 장: 개회를 선언합니다."]},
                    "p1_UNKNOWN": {"paragraphs": ["무시되어야 함"]},
                }
            },
        )

    refiner = AgySlotTextRefiner(
        one_shot=fake_one_shot,
        executable="agy",
        model="gemini-3.8-flash",
    )
    suspects = [
        SuspectSlot(
            slot_id="p1_B2",
            block_id="p1_B2",
            block_title="본문2",
            kind="text",
            bbox_px=(50.0, 110.0, 400.0, 140.0),
            raw_text="䃱 회장:개회를선언합니다.",
            reasons=["no_tounicode", "pua_or_cjk_anomaly"],
            crop_png_bytes=b"\x89PNG\r\n\x1a\n",
        )
    ]
    patches = refiner.refine_slots(
        page_png_bytes=b"\x89PNG\r\n\x1a\n",
        doc_title="테스트 양식",
        suspects=suspects,
        page_vdoc={},
    )
    assert list(patches) == ["p1_B2"]
    assert patches["p1_B2"].paragraphs == ["☞ 회 장: 개회를 선언합니다."]
    assert "p1_B2" in captured_prompts[0]
    assert "no_tounicode" in captured_prompts[0]

    # FormScaffoldAgent 전체 경로에서 바운더리는 불변이고 의심 슬롯만 치환되는지 검증
    fake_truth = {
        "page": {"width": 794, "height": 1123},
        "spans": [
            {
                "text": "Header Clean Title",
                "font": "MalgunGothic",
                "x": 60.0,
                "y": 80.0,
                "x1": 220.0,
                "y1": 96.0,
                "pt": 11.0,
                "has_to_unicode": True,
            },
            {
                "text": "䃱 Corrupted",
                "font": "TTF97B79EFtCID32K",
                "x": 60.0,
                "y": 115.0,
                "x1": 260.0,
                "y1": 131.0,
                "pt": 11.0,
                "has_to_unicode": False,
            },
        ],
        "rules": [],
        "fills": [],
        "images": [],
    }
    monkeypatch.setattr("app.form_scaffold.agents.form_scaffold_agent.extract_page_truth", lambda **kw: fake_truth)

    class _StubBaseline:
        def extract(self, *, pdf_bytes: bytes, doc_id: str, title: str, refiner: Any = None):
            return (
                {
                    "version": "1.0.0",
                    "docId": doc_id,
                    "title": title,
                    "pages": [
                        {
                            "pageNumber": 1,
                            "blocks": [
                                {"blockId": "p1_B1", "kind": "text", "slotId": "p1_B1", "frame": {"x": 50, "y": 75, "w": 300, "h": 24}},
                                {"blockId": "p1_B2", "kind": "text", "slotId": "p1_B2", "frame": {"x": 50, "y": 110, "w": 300, "h": 24}},
                            ],
                        }
                    ],
                    "slots": {
                        "p1_B1": {"slotId": "p1_B1", "content": '<p style="font-size: 11pt; margin: 0"><span>Header Clean Title</span></p>'},
                        "p1_B2": {"slotId": "p1_B2", "content": '<p style="font-size: 11pt; margin: 6px 0 0 0"><span>䃱 Corrupted</span></p>'},
                    },
                },
                2,
                2,
            )

    agent = FormScaffoldAgent(
        policy=None,
        external_llm_enabled=True,
        agentic_loop_enabled=False,
        baseline_extractor=_StubBaseline(),  # type: ignore[arg-type]
        slot_refiner=refiner,
    )
    out_doc, _, _, _ = agent.scaffold_document(pdf_bytes=pdf_bytes, doc_id="doc_ref", title="테스트 양식")
    assert out_doc["pages"][0]["blocks"][1]["frame"] == {"x": 50, "y": 110, "w": 300, "h": 24}
    assert "☞ 회 장: 개회를 선언합니다." in out_doc["slots"]["p1_B2"]["content"]
    assert "Header Clean Title" in out_doc["slots"]["p1_B1"]["content"]
