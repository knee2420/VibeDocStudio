"""Checkpoint 4 tests: VLM speed/model tiering, explicit read_file prompts, deduped word tokens, and reread telemetry."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pymupdf
from docstruct_engine.ir.model import PageIR, PageSize, Word
from docstruct_engine.reread import RereadTask

from app.form_scaffold.adapters.docstruct_scaffold_agent import (
    DocStructScaffoldAgent,
    _build_reread_prompt,
)
from app.llm.models import OneShotResult
from app.llm.policy import CLI_PROVIDER, RuntimeExecutionPolicy


def _make_vector_table_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 72), "1. Overview", fontsize=16)
    xs = [60.0, 240.0, 420.0]
    ys = [120.0, 150.0, 180.0]
    for x in xs:
        page.draw_line((x, ys[0]), (x, ys[-1]), width=1.0)
    for y in ys:
        page.draw_line((xs[0], y), (xs[-1], y), width=1.0)
    cells = [["ColA", "ColB"], ["Val1", "Val2"]]
    for r, row in enumerate(cells):
        for c, txt in enumerate(row):
            page.insert_text((xs[c] + 8.0, ys[r] + 18.0), txt, fontsize=10)
    return doc.tobytes()


def _make_scan_only_pdf() -> bytes:
    src = pymupdf.open()
    p = src.new_page(width=595, height=842)
    p.draw_rect(pymupdf.Rect(50, 50, 400, 120), color=(0.1, 0.1, 0.1), width=1.0)
    pix = p.get_pixmap(dpi=72)
    png_bytes = pix.tobytes("png")
    src.close()

    scan_doc = pymupdf.open()
    sp = scan_doc.new_page(width=595, height=842)
    sp.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=png_bytes)
    return scan_doc.tobytes()


class _LowConfOcrPort:
    def recognize(
        self,
        image_path: Path,
        page_size_pt: tuple[float, float],
        *,
        dpi: int = 300,
    ) -> list[Word]:
        del image_path, page_size_pt, dpi
        return [
            Word(
                id="ocr_low_1",
                text="HeaderCandidate",
                bbox=(60.0, 60.0, 220.0, 76.0),
                size=11.0,
                conf=0.50,
                needsReview=True,
                src="ocr",
            )
        ]


def test_resolve_vlm_target_selects_low_round1_and_escalates_medium_round2() -> None:
    policy = RuntimeExecutionPolicy(
        primary_provider=CLI_PROVIDER,
        fallback_provider="offline",
        google_api_model="gemini-3.5-flash-lite",
        google_api_timeout_seconds=30,
        agent_cli_model="Gemini-3.8-flash",
        agent_cli_timeout_seconds=120,
        agent_cli_bin="agy",
    )
    agent = DocStructScaffoldAgent(
        policy=policy,
        external_llm_enabled=True,
        agentic_loop_enabled=True,
        one_shot=lambda *_a, **_kw: OneShotResult(ok=True, response={}),
    )

    assert agent._resolve_vlm_target("balanced", round_num=1)[1] == "gemini-3.8-flash-low"
    assert agent._resolve_vlm_target("strict", round_num=1)[1] == "gemini-3.8-flash-low"
    assert agent._resolve_vlm_target("strict", round_num=2)[1] == "gemini-3.8-flash-medium"

    explicit_policy = RuntimeExecutionPolicy(
        primary_provider=CLI_PROVIDER,
        fallback_provider="offline",
        google_api_model="gemini-3.5-flash-lite",
        google_api_timeout_seconds=30,
        agent_cli_model="gemini-3.8-flash-high",
        agent_cli_timeout_seconds=120,
        agent_cli_bin="agy",
    )
    explicit_agent = DocStructScaffoldAgent(
        policy=explicit_policy,
        external_llm_enabled=True,
        agentic_loop_enabled=True,
        one_shot=lambda *_a, **_kw: OneShotResult(ok=True, response={}),
    )
    assert explicit_agent._resolve_vlm_target("balanced")[1] == "gemini-3.8-flash-high"


def test_build_reread_prompt_instructs_read_file_and_skips_redundant_words(tmp_path: Path) -> None:
    crop_png = tmp_path / "p1_t0.png"
    crop_png.write_bytes(b"fake-png-bytes")
    page = PageIR(
        pageIndex=1,
        sourceKind="pdf-vector",
        size=PageSize(width=595.0, height=842.0),
        words=[
            Word(id="w1", text="CleanEmbedded", bbox=(60.0, 120.0, 140.0, 134.0), conf=0.98),
            Word(id="w2", text="SuspectToken", bbox=(250.0, 120.0, 340.0, 134.0), conf=0.60, needsReview=True),
        ],
    )
    task = RereadTask(
        taskId="r1_t0",
        pageIndex=1,
        kind="table_reread",
        blockId="t0",
        bbox=(50.0, 110.0, 420.0, 190.0),
        cropPngPath=str(crop_png),
        candidateHtml='<table><tr><td><span data-w="w1">CleanEmbedded</span></td><td></td></tr></table>',
        prompt="Inspect cell structure.",
        reasons=["SAMPLE_SPOT_CHECK"],
    )

    prompt = _build_reread_prompt(task, page, doc_title="Sample Form", cache_dir=tmp_path)
    assert "read_file" in prompt
    assert str(crop_png) in prompt
    assert "- w1:" not in prompt
    assert "- w2: 'SuspectToken'" in prompt


def test_docstruct_scaffold_agent_reread_telemetry_applied_and_rejected(tmp_path: Path) -> None:
    cache_applied = tmp_path / "cache_applied"

    def ok_one_shot(prompt: str, **kwargs: Any) -> OneShotResult:
        del kwargs
        import re

        m = re.search(r"-\s+([^\s(]+)\s+\(", prompt)
        bid = m.group(1) if m else ""
        return OneShotResult(
            ok=True,
            response={
                "annotations": [{"blockId": bid, "kind": "heading", "level": 2}],
                "fixes": [{"wordIds": ["ocr_low_1"], "text": "Confirmed Header"}],
            },
            usage={"input_tokens": 120, "output_tokens": 45, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 165},
        )

    agent_ok = DocStructScaffoldAgent(
        cache_root=cache_applied,
        work_root=tmp_path / "work_ok",
        external_llm_enabled=True,
        agentic_loop_enabled=True,
        one_shot=ok_one_shot,
        ocr_port=_LowConfOcrPort(),
        executable="agy",
        model="gemini-3.8-flash-low",
    )
    _vdoc, _blk, _slots, run_ok = agent_ok.scaffold_document(
        pdf_bytes=_make_scan_only_pdf(),
        doc_id="doc-cp4-ok",
        title="CP4 Applied Test",
        fidelity_mode="balanced",
    )
    assert run_ok is not None
    summary_ok = run_ok["rereadSummary"]
    assert summary_ok["candidateCount"] >= 1
    assert summary_ok["tasksAttempted"] >= 1
    assert summary_ok["appliedOps"] >= 1
    assert summary_ok["rejectedOps"] == 0
    assert summary_ok["errorOps"] == 0
    assert summary_ok["imageTasks"] >= 1
    assert summary_ok["elapsedMs"] >= 0.0

    log_files_ok = list(cache_applied.rglob("pipeline.jsonl"))
    assert len(log_files_ok) == 1
    events_ok = [json.loads(line) for line in log_files_ok[0].read_text(encoding="utf-8").splitlines() if line.strip()]
    task_events = [e for e in events_ok if e["stage"] == "reread_task"]
    sum_events = [e for e in events_ok if e["stage"] == "reread_summary"]
    assert len(task_events) >= 1
    assert task_events[0]["metrics"]["applied"] is True
    assert task_events[0]["metrics"]["imageExists"] is True
    assert task_events[0]["metrics"]["elapsedMs"] >= 0.0
    assert len(sum_events) == 1
    assert sum_events[0]["metrics"]["appliedOps"] == summary_ok["appliedOps"]

    # Case 2: Rejected VLM payload (empty JSON `{}`) on strict table spot-check
    cache_rej = tmp_path / "cache_rej"
    agent_rej = DocStructScaffoldAgent(
        cache_root=cache_rej,
        work_root=tmp_path / "work_rej",
        external_llm_enabled=True,
        agentic_loop_enabled=True,
        one_shot=lambda *_a, **_kw: OneShotResult(ok=True, response={}),
        executable="agy",
        model="gemini-3.8-flash-medium",
    )
    _vdoc2, _blk2, _slots2, run_rej = agent_rej.scaffold_document(
        pdf_bytes=_make_vector_table_pdf(),
        doc_id="doc-cp4-rej",
        title="CP4 Rejected Test",
        fidelity_mode="strict",
    )
    assert run_rej is not None
    summary_rej = run_rej["rereadSummary"]
    assert summary_rej["candidateCount"] >= 1
    assert summary_rej["tasksAttempted"] >= 1
    assert summary_rej["appliedOps"] == 0
    assert summary_rej["rejectedOps"] >= 1

    log_files_rej = list(cache_rej.rglob("pipeline.jsonl"))
    assert len(log_files_rej) == 1
    events_rej = [json.loads(line) for line in log_files_rej[0].read_text(encoding="utf-8").splitlines() if line.strip()]
    rej_task_events = [e for e in events_rej if e["stage"] == "reread_task"]
    assert len(rej_task_events) >= 1
    assert rej_task_events[0]["metrics"]["rejected"] is True
    assert rej_task_events[0]["metrics"]["applied"] is False
