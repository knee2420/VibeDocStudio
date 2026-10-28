"""디스크의 도메인 목록과 `pyproject.toml`의 `import-linter` 계약이 100% 일치하는지 검증한다."""
from __future__ import annotations

import tomllib
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = API_ROOT / "app"

NOT_A_DOMAIN = {"bootstrap", "core"}
GUARDED_SEGMENTS = ("service.py", "use_cases", "adapters", "agents", "ports.py")


def _domains_on_disk() -> set[str]:
    return {
        entry.name
        for entry in APP_ROOT.iterdir()
        if entry.is_dir()
        and entry.name not in NOT_A_DOMAIN
        and not entry.name.startswith(("_", "."))
        and (entry / "__init__.py").exists()
    }


def _contracts() -> list[dict]:
    raw = tomllib.loads((API_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    return raw["tool"]["importlinter"]["contracts"]


def _independence_contracts() -> dict[str, dict]:
    found: dict[str, dict] = {}
    for contract in _contracts():
        name = contract.get("name", "")
        if name.endswith("must not depend on other domains"):
            found[name.split(" ", 1)[0]] = contract
    return found


def test_every_domain_has_an_independence_contract() -> None:
    assert _independence_contracts().keys() == _domains_on_disk()


def test_each_contract_forbids_every_other_domain() -> None:
    domains = _domains_on_disk()
    for domain, contract in _independence_contracts().items():
        expected = {f"app.{other}" for other in domains if other != domain}
        assert set(contract["forbidden_modules"]) == expected, domain


def test_contracts_guard_every_existing_segment() -> None:
    for domain, contract in _independence_contracts().items():
        expected = {
            f"app.{domain}." + (segment[:-3] if segment.endswith(".py") else segment)
            for segment in GUARDED_SEGMENTS
            if (APP_ROOT / domain / segment).exists()
        }
        assert set(contract["source_modules"]) == expected, domain


def test_storage_path_contract_is_written_in_segments_not_domain_names() -> None:
    contract = next(
        c for c in _contracts() if c["name"].startswith("Storage paths are known only")
    )
    assert all(module.startswith("app.*.") for module in contract["source_modules"])
    assert contract["forbidden_modules"] == ["app.core.config"]
