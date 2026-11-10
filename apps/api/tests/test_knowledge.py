"""knowledge 도메인 — Auto-Index 파이프라인 · 리더 · 비동기 작업 · Composer 서버 도구 (오프라인)."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.resource.index.adapters import (
    FileEnrichmentCache,
    FsDeckFiles,
    LocalDeckRegistry,
    LocalJobStore,
)
from app.resource.index.models import IndexJob
from app.resource.index.pipeline import IndexSpec, ScopeProfile, run_index
from app.resource.index.pipeline.reader import DeckReader
from app.resource.index.use_cases import IndexJobRunner
from main import app

client = TestClient(app)

GUIDE = """---
title: "Sandbox Guide"
---

# Sandbox

The sandbox isolates shell commands. Enable it with `--sandbox` or the `/sandbox` command.

## Platforms

| Operating System | Technology | Details |
|---|---|---|
| Linux | Namespaces | Kernel namespaces isolate the filesystem. |
| macOS | sandbox-exec | Seatbelt profiles restrict access. |

![Sandbox architecture diagram](images/sandbox.png)

See [permissions](02-permissions.md) for approval rules.

## Example

```bash
agy --sandbox -p "hello"
```

- **Strict mode**: blocks network access entirely.
- **Relaxed mode**: allows localhost.
"""

PERMS = """# Permissions

Permissions decide which tools run without asking. The default policy is `ask`.

## Policies

- **ask**: prompt before each write.
- **allow**: run everything.
- **deny**: refuse writes.

Sandboxed commands still respect permissions.
"""


@pytest.fixture()
def corpus(tmp_path: Path) -> Path:
    root = tmp_path / "docs"
    root.mkdir()
    (root / "01-sandbox.md").write_text(GUIDE, encoding="utf-8")
    (root / "02-permissions.md").write_text(PERMS, encoding="utf-8")
    long = "# Big Manual\n\n" + "\n\n".join(
        f"## Chapter {i}\n\n" + " ".join(f"Rule {i}.{j} explains topic{i} detail number {j}." for j in range(40))
        for i in range(1, 9)
    )
    (root / "10-manual.md").write_text(long, encoding="utf-8")
    (root / "page.html").write_text(
        "<html><head><title>Html Page</title></head><body><h1>Release Notes</h1><p>Version 2 adds boost.</p>"
        "<table><tr><th>Flag</th><th>Meaning</th></tr><tr><td>--boost</td><td>faster</td></tr></table>"
        "<img src='chart.png' alt='Latency chart'></body></html>",
        encoding="utf-8",
    )
    (root / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n0000")
    return root


def _build(corpus: Path, out: Path, **kw):
    spec = IndexSpec(deck_id="deck_test", title="Test Deck", source_paths=[str(corpus)], **kw)
    return run_index(spec, out)


def test_pipeline_builds_deterministic_deck_with_assets_links_and_toc(corpus: Path, tmp_path: Path) -> None:
    out = tmp_path / "deck"
    fine = ScopeProfile(min_segment_chars=80)  # 작은 시험 문서도 절 단위로 카드가 나오게
    first = _build(corpus, out, profile=fine)
    cards_1 = json.loads((out / "cards.json").read_text(encoding="utf-8"))
    _build(corpus, out, profile=fine)
    cards_2 = json.loads((out / "cards.json").read_text(encoding="utf-8"))
    assert [c["cardId"] for c in cards_1] == [c["cardId"] for c in cards_2]  # 재색인해도 같은 id

    stats = first.manifest["stats"]
    assert stats["files"] == 4 and stats["tables"] >= 2 and stats["figures"] >= 2 and stats["codeBlocks"] >= 1
    assert first.quality["gates"]["coverage"]["pass"] and first.quality["gates"]["anchors"]["pass"]
    assert "docs/logo.png" in first.quality["unindexedImages"]  # 그림 파일만 있는 것은 보고한다

    reader = DeckReader(out)
    tables = reader.assets("table")["assets"]
    platform = next(a for a in tables if "Operating System" in a["columns"])
    assert platform["rowKeys"] == ["Linux", "macOS"] and platform["rows"] == 2
    figures = {a["caption"] for a in reader.assets("figure")["assets"]}
    assert {"Sandbox architecture diagram", "Latency chart"} <= figures

    sandbox_card = next(c for c in cards_1 if c["anchor"]["source"] == "docs/01-sandbox.md" and "Platforms" in c["title"])
    perm_first = next(c for c in cards_1 if c["anchor"]["source"] == "docs/02-permissions.md")
    assert perm_first["cardId"] in sandbox_card["linksOut"]  # 원문 링크 → 대상 문서 카드
    assert any(e["name"] == "Linux" and e["origin"] == "table" for e in sandbox_card["elements"])

    toc = reader.toc()["toc"]
    assert toc.index("Sandbox Guide") < toc.index("Permissions") < toc.index("Big Manual")  # 원문 순서
    assert "Chapter 8" in toc

    # 앵커: 카드가 가리키는 원문 줄에 실제 내용이 있다
    src = reader.source(sandbox_card["cardId"])
    assert "| Linux | Namespaces |" in src["text"] and src["text"].startswith(f"L{sandbox_card['anchor']['lines'][0]}:")
    # 큰 문서는 크기 경계로 쪼개진다
    assert sum(1 for c in cards_1 if c["anchor"]["source"] == "docs/10-manual.md") >= 8
    assert (out / "index.md").read_text(encoding="utf-8").count("## 지도") == 1


def test_reader_grep_groups_hits_by_card_and_lookup_handles_vague_korean(corpus: Path, tmp_path: Path) -> None:
    out = tmp_path / "deck"
    _build(corpus, out)
    reader = DeckReader(out)
    grep = reader.grep("topic3")
    assert grep["totalHits"] >= 1 and grep["cardsHit"] >= 1
    assert all(r["section"] for r in grep["results"])
    assert len(grep["results"][0]["lines"]) <= 3  # 줄을 다 주지 않고 대표 줄만

    found = reader.lookup("샌드박스에서 strict mode 는 뭐야? sandbox")
    assert found["candidates"] and "docs/01-sandbox.md" in reader.cards([found["candidates"][0]["cardId"]])[0]["source"]
    assert reader.lookup("--sandbox")["candidates"][0]["matched"]


class FakeEnricher:
    model = "fake-model"

    def __init__(self) -> None:
        self.calls = 0

    def run(self, prompt: str, schema: dict):
        self.calls += 1
        payload = json.loads(prompt[prompt.index("["):])
        cards = [
            {
                "segmentId": item["segmentId"],
                "summary": f"요약: {item['heading']}",
                "elements": [{"name": "Namespaces", "detail": "리눅스 격리"}, {"name": "Quantum Flux", "detail": "지어낸 요소"}],
                "keywords": ["샌드박스"],
                "aliases": ["격리 실행"],
                "questions": ["샌드박스는 뭐야?"],
            }
            for item in payload
        ]
        return cards, {"calls": 1, "input_tokens": 10, "output_tokens": 5, "total_tokens": 15}


def test_enrichment_is_grounded_and_cached(corpus: Path, tmp_path: Path) -> None:
    enricher = FakeEnricher()
    cache = FileEnrichmentCache(tmp_path / "cache")
    spec = IndexSpec(deck_id="deck_e", title="E", source_paths=[str(corpus)], depth="enriched", llm_concurrency=2)
    first = run_index(spec, tmp_path / "deck", enricher=enricher, cache=cache)
    assert first.usage["llmCalls"] >= 1 and first.manifest["stats"]["enrichedCards"] == first.manifest["stats"]["cards"]
    cards = json.loads((tmp_path / "deck" / "cards.json").read_text(encoding="utf-8"))
    names = {e["name"] for c in cards for e in c["elements"]}
    assert "Quantum Flux" not in names  # 원문에 없는 요소는 버린다
    assert any(c["droppedElements"] for c in cards)
    assert "격리 실행" in cards[0]["aliases"]

    calls_before = enricher.calls
    second = run_index(spec, tmp_path / "deck", enricher=enricher, cache=cache)
    assert enricher.calls == calls_before and second.usage["cacheHits"] == second.manifest["stats"]["segments"]


def _wait_job(job_id: str, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/knowledge/jobs/{job_id}").json()
        if job["status"] in ("succeeded", "failed", "cancelled"):
            return job
        time.sleep(0.1)
    raise AssertionError("색인 작업이 끝나지 않았습니다")


def test_promote_is_async_and_streams_progress_then_serves_deck(corpus: Path) -> None:
    res = client.post("/api/knowledge/proj_k/promote", json={"title": "문서 덱", "sourcePaths": [str(corpus)], "depth": "enriched"})
    assert res.status_code == 200, res.text
    body = res.json()
    deck_id, job_id = body["deck"]["id"], body["job"]["jobId"]
    assert body["deck"]["status"] in ("queued", "indexing")
    assert body["job"]["depth"] == "structural"  # 테스트는 외부 LLM 이 꺼져 있다 → 구조 색인으로 내려간다

    job = _wait_job(job_id)
    assert job["status"] == "succeeded", job
    events = client.get(f"/api/knowledge/jobs/{job_id}/events")
    kinds = [json.loads(line[6:])["type"] for line in events.text.splitlines() if line.startswith("data: ")]
    assert kinds[0] == "queued" and "progress" in kinds and kinds[-1] == "succeeded"

    deck = client.get(f"/api/knowledge/proj_k/{deck_id}").json()
    assert deck["status"] == "ready" and deck["stat"]["cardsCount"] > 0 and deck["topics"]
    overview = client.get(f"/api/knowledge/decks/{deck_id}/overview").json()
    first_card = overview["sections"][0]["cardIds"][0]
    card = client.get(f"/api/knowledge/decks/{deck_id}/cards/{first_card}").json()
    assert card["sourceText"].startswith("L")
    hits = client.get(f"/api/knowledge/decks/{deck_id}/search", params={"q": "Namespaces", "mode": "grep"}).json()
    assert hits["cardsHit"] >= 1

    re_res = client.post(f"/api/knowledge/proj_k/{deck_id}/reindex", json={})
    assert re_res.status_code == 200
    assert _wait_job(re_res.json()["job"]["jobId"])["status"] == "succeeded"
    assert client.delete(f"/api/knowledge/proj_k/{deck_id}").status_code == 200


def test_unfinished_jobs_resume_after_restart(corpus: Path, tmp_path: Path) -> None:
    registry = LocalDeckRegistry(tmp_path / "decks")
    files = FsDeckFiles(tmp_path / "decks")
    store = LocalJobStore(tmp_path / "jobs")
    runner = IndexJobRunner(registry=registry, files=files, jobs=store, cache=FileEnrichmentCache(tmp_path / "c"),
                            enricher_factory=lambda: None)
    deck, job = runner.submit(project_id="p", title="t", source_paths=[str(corpus)])
    runner.shutdown()  # 서버가 작업을 끝내기 전에 죽은 상황을 흉내 낸다
    time.sleep(0.2)
    stale = store.get(job.job_id)
    if stale.terminal:  # 빠른 기계에서는 이미 끝났을 수 있다 — 끝나지 않은 상태로 되돌려 재개를 확인한다
        stale.status = "running"
        store.save(stale)

    revived = IndexJobRunner(registry=registry, files=files, jobs=store, cache=FileEnrichmentCache(tmp_path / "c"),
                             enricher_factory=lambda: None)
    assert job.job_id in revived.start()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and not store.get(job.job_id).terminal:
        time.sleep(0.05)
    assert store.get(job.job_id).status == "succeeded"
    assert registry.get_deck("p", deck.id).status == "ready"


def test_cancel_stops_a_running_job(corpus: Path, tmp_path: Path) -> None:
    gate = threading.Event()

    class SlowEnricher(FakeEnricher):
        def run(self, prompt, schema):
            gate.wait(5)
            return super().run(prompt, schema)

    store = LocalJobStore(tmp_path / "jobs")
    runner = IndexJobRunner(registry=LocalDeckRegistry(tmp_path / "decks"), files=FsDeckFiles(tmp_path / "decks"), jobs=store,
                            cache=FileEnrichmentCache(tmp_path / "c"), enricher_factory=lambda: SlowEnricher(),
                            llm_concurrency=1)
    _, job = runner.submit(project_id="p", title="t", source_paths=[str(corpus)], depth="enriched")
    deadline = time.monotonic() + 5
    while store.get(job.job_id).stage != "enrich" and time.monotonic() < deadline:
        time.sleep(0.02)
    runner.cancel(job.job_id)
    gate.set()
    deadline = time.monotonic() + 10
    while not store.get(job.job_id).terminal and time.monotonic() < deadline:
        time.sleep(0.05)
    assert store.get(job.job_id).status == "cancelled"
    assert isinstance(store.get(job.job_id), IndexJob)


def _sse(response) -> list[dict]:
    assert response.status_code == 200, response.text
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_composer_runs_knowledge_tools_on_the_server_and_continues(corpus: Path) -> None:
    body = client.post("/api/knowledge/proj_c/promote", json={"title": "C", "sourcePaths": [str(corpus)]}).json()
    deck_id = body["deck"]["id"]
    assert _wait_job(body["job"]["jobId"])["status"] == "succeeded"

    sid = client.post("/api/assistant/sessions", json={}).json()["sessionId"]
    events = _sse(client.post(
        f"/api/assistant/sessions/{sid}/messages",
        json={"text": "목차 보여줘 [[tool:knowledge.toc]]", "contexts": [{"kind": "deck", "id": deck_id, "label": "C"}], "tools": []},
    ))
    call = next(e for e in events if e["type"] == "tool_call")
    assert call["name"] == "knowledge.toc" and call["server"] is True
    result = next(e for e in events if e["type"] == "tool_result")
    assert result["ok"] is True and "Sandbox Guide" in result["output"]
    # 프론트 왕복 없이 같은 스트림에서 모델이 결과를 받아 이어 쓴다
    assert "도구 결과를 확인했습니다." in "".join(e.get("text", "") for e in events if e["type"] == "text_delta")
    assert events[-1]["type"] == "turn_done" and events[-1]["stopReason"] == "end_turn" and events[-1]["serverRounds"] == 1

    service = app.state.container.assistant_service()
    first_prompt = service._sessions[sid].engine.turns[0]
    assert "섹션 지도" in first_prompt and "knowledge.grep" in first_prompt and "지식 덱 탐색 절차" in first_prompt

    # 같은 대화의 다음 메시지에는 지도 요약을 다시 붙이지 않는다 (자동 첨부 비용)
    _sse(client.post(
        f"/api/assistant/sessions/{sid}/messages",
        json={"text": "고마워", "contexts": [{"kind": "deck", "id": deck_id, "label": "C"}], "tools": []},
    ))
    second_prompt = service._sessions[sid].engine.turns[-1]
    assert "섹션 지도" in second_prompt and "SEC-01 |" not in second_prompt

    # 첨부되지 않은 덱은 범위 밖이다
    other = _sse(client.post(
        f"/api/assistant/sessions/{sid}/messages",
        json={"text": "[[tool:knowledge.toc]]", "contexts": [], "tools": []},
    ))
    assert not any(e["type"] == "tool_result" for e in other)
    assert other[-1]["stopReason"] == "tool_calls"  # 서버 도구가 꺼져 있으면 평소처럼 프론트로 넘긴다


def test_pdf_pages_headings_tables_and_figures_are_indexed(tmp_path: Path) -> None:
    import fitz

    pdf_path = tmp_path / "report.pdf"
    doc = fitz.open()
    page = doc.new_page()
    y = 72
    for line in ["1. 서론", "본 보고서는 축산 부산물의 업사이클링을 다룬다.", "2. 실험 방법", "그림 1 공정 흐름도"]:
        page.insert_text((72, y), line, fontname="korea", fontsize=11)
        y += 20
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 8, 8), 0)
    pix.clear_with(200)
    page.insert_image(fitz.Rect(72, y, 140, y + 60), pixmap=pix)
    page2 = doc.new_page()
    page2.insert_text((72, 72), "3. 결과", fontname="korea", fontsize=11)
    doc.save(pdf_path)

    out = tmp_path / "deck"
    run_index(IndexSpec(deck_id="pdf", title="PDF", source_paths=[str(pdf_path)], profile=ScopeProfile(min_segment_chars=10)), out)
    reader = DeckReader(out)
    toc = reader.toc()["toc"]
    assert "1. 서론" in toc and "3. 결과" in toc
    figures = reader.assets("figure")["assets"]
    assert figures and figures[0]["caption"].startswith("그림 1")
    cards = json.loads((out / "cards.json").read_text(encoding="utf-8"))
    assert {c["anchor"]["page"] for c in cards} >= {1, 2}  # 페이지 앵커


def test_promoting_each_file_queues_one_deck_per_file(corpus: Path) -> None:
    """RM 에서 파일 여러 개를 골라 승격하면 파일마다 덱 하나 — 대기열에 순서대로 올라가 모두 끝난다."""
    files = ["01-sandbox.md", "02-permissions.md", "10-manual.md"]
    bodies = [
        client.post("/api/knowledge/proj_each/promote", json={"title": f"{name} 지식 덱", "sourcePaths": [str(corpus / name)]}).json()
        for name in files
    ]
    deck_ids = {b["deck"]["id"] for b in bodies}
    assert len(deck_ids) == 3 and all(b["deck"]["status"] in ("queued", "indexing") for b in bodies)
    for b in bodies:
        assert _wait_job(b["job"]["jobId"])["status"] == "succeeded"
    listed = client.get("/api/knowledge/proj_each").json()["decks"]
    mine = [d for d in listed if d["id"] in deck_ids]
    assert len(mine) == 3 and all(len(d["sourcePaths"]) == 1 and d["status"] == "ready" for d in mine)


def test_multi_file_deck_reports_progress_per_file(corpus: Path) -> None:
    """한 덱에 파일 여러 개 — 대기 중엔 고른 경로가 '대기', 작업 이벤트와 덱에 파일별 진행이 실리고, 끝나면 전부 완료."""
    paths = [str(corpus / "01-sandbox.md"), str(corpus / "02-permissions.md"), str(corpus / "missing.md")]
    body = client.post("/api/knowledge/proj_files/promote", json={"title": "묶음", "sourcePaths": paths}).json()
    assert [f["status"] for f in body["deck"]["files"]] == ["pending"] * 3
    job = _wait_job(body["job"]["jobId"])
    assert job["status"] == "succeeded"
    events = client.get(f"/api/knowledge/jobs/{job['jobId']}/events")
    details = [json.loads(line[6:])["detail"] for line in events.text.splitlines() if line.startswith("data: ")]
    assert any(isinstance(d.get("files"), list) and d["files"] for d in details)
    deck = client.get(f"/api/knowledge/proj_files/{body['deck']['id']}").json()
    by_status = {f["title"]: f["status"] for f in deck["files"]}
    assert sum(1 for s in by_status.values() if s == "done") == 2
    assert "skipped" in by_status.values()
    done = [f for f in deck["files"] if f["status"] == "done"]
    assert all(f["segments"] > 0 and f["done"] == f["segments"] for f in done)


def test_selected_sections_narrow_every_knowledge_tool(corpus: Path) -> None:
    """RM 에서 덱의 섹션 일부만 고르면 — 저장되고, 서버 도구는 고른 섹션만 본다."""
    body = client.post("/api/knowledge/proj_sec/promote", json={"title": "섹션", "sourcePaths": [str(corpus)]}).json()
    deck_id = body["deck"]["id"]
    assert _wait_job(body["job"]["jobId"])["status"] == "succeeded"
    sections = client.get(f"/api/knowledge/decks/{deck_id}/overview").json()["sections"]
    assert len(sections) >= 2
    keep = sections[0]["sectionId"]

    saved = client.post("/api/knowledge/proj_sec/sections", json={"deckId": deck_id, "sectionIds": [keep, "SEC-99"]}).json()
    assert saved["selectedSections"] == [keep]  # 없는 섹션은 버린다
    every = client.post("/api/knowledge/proj_sec/sections", json={"deckId": deck_id, "sectionIds": [s["sectionId"] for s in sections]}).json()
    assert every["selectedSections"] == []  # 전부 고르면 제한 없음

    toolbox = app.state.container.knowledge_toolbox()
    ref = f"{deck_id}#{keep}"
    toc = toolbox.run("knowledge.toc", {}, [ref])
    assert toc["deckId"] == deck_id and toc["sections"] == 1
    other_card = sections[1]["cardIds"][0]
    cards = toolbox.run("knowledge.cards", {"cardIds": [other_card]}, [ref])["cards"]
    assert cards[0].get("error") == "없는 카드"
    hits = toolbox.run("knowledge.grep", {"pattern": "e"}, [ref])
    assert all(r["section"] == keep for r in hits["results"])
    assert "사용자가 고른 섹션만" in (toolbox.brief(ref) or "")
    # 전체 범위로는 다른 섹션 카드도 보인다
    assert "error" not in toolbox.run("knowledge.cards", {"cardIds": [other_card]}, [deck_id])["cards"][0]
