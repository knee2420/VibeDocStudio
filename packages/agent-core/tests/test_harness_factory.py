"""Scaffold Engine — Harness Factory & Adapters Independence Tests."""
import json
from typing import Any
from pathlib import Path

from agent_core import (
    AgyCliHarness,
    GoogleGenAiHarness,
    HarnessFactory,
    LocalGemmaHarness,
    get_model_spec,
)


def test_harness_factory_contains_all_default_providers() -> None:
    providers = HarnessFactory.providers()
    assert "agy_cli" in providers
    assert "google_api" in providers
    assert "local_serving" in providers


def test_harness_factory_creates_google_adapter() -> None:
    harness = HarnessFactory.create("gemini-3.5-flash")
    assert isinstance(harness, GoogleGenAiHarness)
    assert harness.model == "gemini-3.5-flash"


def test_harness_factory_creates_cli_adapter() -> None:
    harness = HarnessFactory.create("gemini-3.8-flash-low")
    assert isinstance(harness, AgyCliHarness)
    assert harness.model == "gemini-3.8-flash-low"


def test_harness_factory_creates_gemma_adapter() -> None:
    harness = HarnessFactory.create("gemma4-31b")
    assert isinstance(harness, LocalGemmaHarness)
    assert harness.model == "gemma4-31b"


def test_google_adapter_structured_output_mock(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    class DummyResponse:
        ok = True
        status_code = 200

        def json(self):
            return {
                "candidates": [{"content": {"parts": [{"text": '{"test": "ok"}'}]}}],
                "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5, "totalTokenCount": 15},
            }

    def dummy_post(*args, **kwargs):
        captured.update(kwargs)
        return DummyResponse()

    import agent_core.llm.adapters.gemini as gc
    monkeypatch.setattr(gc.requests, "post", dummy_post)

    adapter = GoogleGenAiHarness(model="gemini-3.5-flash", api_key="test-api-key")
    res = adapter.run_structured("hello", json_schema={"type": "object", "properties": {"test": {"type": "string"}}})

    assert res.ok
    assert res.structured_output == {"test": "ok"}
    assert res.input_tokens == 10
    assert res.output_tokens == 5


def test_agy_isolated_source_dir_lifecycle(tmp_path: Path) -> None:
    source_file = tmp_path / "sample.pdf"
    source_file.write_bytes(b"%PDF-dummy")

    iso_dir = AgyCliHarness._prepare_isolated_source_dir(source_file)
    assert iso_dir is not None
    iso_path = Path(iso_dir)
    assert iso_path.exists()
    assert (iso_path / "sample.pdf").exists()
    assert (iso_path / "sample.pdf").read_bytes() == b"%PDF-dummy"

    AgyCliHarness._cleanup_isolated_dir(iso_dir)
    assert not iso_path.exists()

