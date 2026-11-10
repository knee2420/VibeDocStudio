"""디스크의 도메인 목록과 `pyproject.toml`의 `import-linter` 계약이 100% 일치하는지 검증한다."""
from __future__ import annotations

import tomllib
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = API_ROOT / "app"

#: 도메인이 아닌 공유 계층 — 조립부 · 공용 커널 · LLM 게이트웨이 (도메인이 기대는 쪽이지 도메인이 아니다)
NOT_A_DOMAIN = {"bootstrap", "core", "llm"}


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


def test_contracts_guard_the_whole_domain_package() -> None:
    """라우터 · 하위 모듈까지 도메인 패키지 전체가 다른 도메인을 모른다 (조립은 bootstrap 만)."""
    for domain, contract in _independence_contracts().items():
        assert contract["source_modules"] == [f"app.{domain}"], domain


def test_storage_path_contract_is_written_in_segments_not_domain_names() -> None:
    contract = next(
        c for c in _contracts() if c["name"].startswith("Storage paths are known only")
    )
    assert all(module.startswith("app.*.") for module in contract["source_modules"])
    assert contract["forbidden_modules"] == ["app.core.config"]
