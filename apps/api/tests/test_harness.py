"""하네스 — 출력 계약(인용 · 번호 정리) · 게이트 · 근거 해석 · 일괄 작업 (오프라인 엔진)."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.authoring.harness import SPECS, EvidenceItem, check_slot_html, estimate_chars
from main import app

client = TestClient(app)


def _items() -> list[EvidenceItem]:
    return [
        EvidenceItem("E1", {"kind": "backdata", "refId": "c1", "label": "회의록"}, "예산은 3억 원이다."),
        EvidenceItem("E2", {"kind": "kcard", "refId": "d:C-01-01", "label": "C-01-01"}, "일정은 12월이다."),
    ]


def test_contract_renumbers_citations_drops_unknown_and_warns() -> None:
    raw = '<p>일정은 12월이다.<sup data-cite="E2"></sup> 예산은 3억 원이다.<sup data-cite="E1"></sup><sup data-cite="E9"></sup></p><p>근거 없이 덧붙인 긴 문장입니다 여기에.</p>'
    html, cited, warnings = check_slot_html(SPECS["fill.slot"], raw, _items(), max_chars=10)
    assert 'data-cite="1"' in html and 'data-cite="2"' in html and "E9" not in html
    assert [c["citationId"] for c in cited] == ["1", "2"] and cited[0]["locator"]["refId"] == "d:C-01-01"
    assert any("없는 근거" in w for w in warnings)
    assert any("근거 표시 없는 문장" in w for w in warnings)
    assert any("길이 초과" in w for w in warnings)


def test_estimate_chars_from_constraints() -> None:
    assert estimate_chars(280, 14, 3) == 60
    assert estimate_chars(280, 14, None) is None


def _sse(response) -> list[dict]:
    assert response.status_code == 200, response.text
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_harness_run_streams_evidence_and_result() -> None:
    payload = {
        "harnessId": "fill.slot",
        "target": {"slotId": "s1", "label": "결론", "currentHtml": "", "constraints": {"maxLines": 2}, "widthPx": 300, "fontSizePx": 14},
        "evidence": [{"kind": "backdata", "refId": "c1", "label": "회의록", "excerpt": "예산은 3억 원이다.", "tier": "direct"}],
        "instruction": "결론을 써라",
    }
    events = _sse(client.post("/api/assistant/harness/run", json=payload))
    kinds = [e["type"] for e in events]
    assert kinds[0] == "evidence" and "result" in kinds and kinds[-1] == "turn_done"
    assert events[0]["items"][0]["id"] == "E1"
    result = next(e for e in events if e["type"] == "result")
    assert result["harnessId"] == "fill.slot" and "html" in result
    ledger = client.get("/api/assistant/ledger").json()
    assert ledger["harnesses"]["fill.slot"]["runs"] >= 1


def test_unknown_harness_is_an_error() -> None:
    events = _sse(client.post("/api/assistant/harness/run", json={"harnessId": "nope", "target": {}}))
    assert events[0]["type"] == "error" and events[-1]["stopReason"] == "error"
