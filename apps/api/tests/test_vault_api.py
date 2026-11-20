"""로컬 파일시스템 Vault API 통합 테스트 (`tests/test_vault_api.py`)."""
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _make_client(tmp_path: Path, monkeypatch) -> tuple[TestClient, Path, Path]:
    data_dir = tmp_path / "api_data"
    state_dir = tmp_path / "api_state"
    cache_dir = tmp_path / "api_cache"
    config_dir = tmp_path / "api_config"
    vault_home = tmp_path / "playground_data"

    monkeypatch.setenv("VIBE_DATA_DIR", str(data_dir))
    monkeypatch.setenv("VIBE_STATE_DIR", str(state_dir))
    monkeypatch.setenv("VIBE_CACHE_DIR", str(cache_dir))
    monkeypatch.setenv("VIBE_CONFIG_DIR", str(config_dir))
    monkeypatch.setenv("VIBE_VAULT_HOME", str(vault_home))
    monkeypatch.setenv("VIBE_EXTERNAL_LLM", "0")

    settings = Settings()
    app = create_app(settings)
    return TestClient(app), vault_home, data_dir


def test_vault_default_crud_session_cache_and_guardrails(tmp_path: Path, monkeypatch) -> None:
    client, vault_home, data_dir = _make_client(tmp_path, monkeypatch)

    with client:
        # 1. 기본 Vault 자동 생성 확인 (`playground_data/vaults/default-vault`)
        res = client.get("/api/vaults")
        assert res.status_code == 200
        body = res.json()
        assert body["activeVaultId"] == "default-vault"
        assert len(body["vaults"]) == 1
        default_root = Path(body["vaults"][0]["rootPath"])
        assert default_root == (vault_home / "vaults" / "default-vault").resolve()
        assert (default_root / ".vibe").is_dir()

        # 2. 정규 프로젝트 시스템 경로(data/knowledge)는 마운트 거부(403)
        knowledge_dir = data_dir / "knowledge"
        knowledge_dir.mkdir(parents=True, exist_ok=True)
        deny_res = client.post(
            "/api/vaults",
            json={"name": "Bad Mount", "rootPath": str(knowledge_dir)},
        )
        assert deny_res.status_code == 403

        # 3. Path traversal 차단(400)
        bad_path = client.post(
            "/api/vaults/default-vault/file",
            json={"path": "../escape.md", "content": "nope"},
        )
        assert bad_path.status_code == 400

        # 4. 안전한 초기 시드 (빈 볼트일 때만 생성, 재호출 시 덮어쓰기 안 함)
        seed1 = client.post(
            "/api/vaults/default-vault/seed",
            json={
                "entries": [
                    {"path": "01. Docs/Spec.md", "content": "# Spec"},
                    {"path": "01. Docs/Plan.outline", "content": '{"rootNodes":[]}'},
                ],
                "onlyIfEmpty": True,
            },
        )
        assert seed1.status_code == 200
        assert seed1.json() == {"seeded": True, "createdCount": 2}

        seed2 = client.post(
            "/api/vaults/default-vault/seed",
            json={
                "entries": [{"path": "01. Docs/Spec.md", "content": "OVERWRITE"}],
                "onlyIfEmpty": True,
            },
        )
        assert seed2.status_code == 200
        assert seed2.json() == {"seeded": False, "createdCount": 0}

        # 5. 파일 생성 · 수정 · 읽기 · 이름변경 · 이동 · 복제 · 삭제
        c_res = client.post(
            "/api/vaults/default-vault/file",
            json={"path": "02. Notes/Memo.md", "content": "Hello local"},
        )
        assert c_res.status_code == 200
        assert (default_root / "02. Notes" / "Memo.md").read_text(encoding="utf-8") == "Hello local"

        w_res = client.put(
            "/api/vaults/default-vault/file",
            json={"path": "02. Notes/Memo.md", "content": "Updated local"},
        )
        assert w_res.status_code == 200

        r_res = client.get("/api/vaults/default-vault/file", params={"path": "02. Notes/Memo.md"})
        assert r_res.status_code == 200
        assert r_res.json()["content"] == "Updated local"

        rn_res = client.post(
            "/api/vaults/default-vault/rename",
            json={"oldPath": "02. Notes/Memo.md", "newNameOrPath": "Renamed.md"},
        )
        assert rn_res.status_code == 200
        assert rn_res.json()["newPath"] == "02. Notes/Renamed.md"

        mv_res = client.post(
            "/api/vaults/default-vault/move",
            json={"sourcePath": "02. Notes/Renamed.md", "targetFolderPath": "01. Docs"},
        )
        assert mv_res.status_code == 200
        assert mv_res.json()["newPath"] == "01. Docs/Renamed.md"

        dup_res = client.post(
            "/api/vaults/default-vault/duplicate",
            json={"sourcePath": "01. Docs/Renamed.md"},
        )
        assert dup_res.status_code == 200
        dup_path = dup_res.json()["path"]
        assert dup_path == "01. Docs/Renamed 1.md"

        del_res = client.delete("/api/vaults/default-vault/entry", params={"path": dup_path})
        assert del_res.status_code == 200
        assert dup_path in del_res.json()["deletedPaths"]

        # 6. 볼트 내부 `.vibe/workspace.json` · `.vibe/metadata-cache.json` 저장 + `/tree` 비노출 검증
        sess_put = client.put(
            "/api/vaults/default-vault/session",
            json={"layout": {"version": 1}, "explorer": {"sortOrder": "name-asc"}},
        )
        assert sess_put.status_code == 200
        assert (default_root / ".vibe" / "workspace.json").is_file()

        cache_put = client.put(
            "/api/vaults/default-vault/cache",
            json={"version": 1, "files": {"01. Docs/Spec.md": {"links": []}}},
        )
        assert cache_put.status_code == 200
        assert (default_root / ".vibe" / "metadata-cache.json").is_file()

        tree_res = client.get("/api/vaults/default-vault/tree", params={"includeContents": "true"})
        assert tree_res.status_code == 200
        tree_paths = [e["path"] for e in tree_res.json()["entries"]]
        assert "01. Docs/Spec.md" in tree_paths
        assert all(".vibe" not in p for p in tree_paths)
        assert tree_res.json()["files"]["01. Docs/Spec.md"] == "# Spec"

        # 7. 외부 로컬 폴더 마운트 + 앱 상태 저장
        ext_dir = tmp_path / "external_vault"
        ext_dir.mkdir()
        (ext_dir / "External.md").write_text("# External", encoding="utf-8")

        m_res = client.post(
            "/api/vaults",
            json={"name": "External Vault", "rootPath": str(ext_dir)},
        )
        assert m_res.status_code == 200
        ext_id = m_res.json()["id"]

        st_res = client.put("/api/vaults/state", json={"activeVaultId": ext_id, "theme": "light"})
        assert st_res.status_code == 200
        assert client.get("/api/vaults/state").json()["activeVaultId"] == ext_id
        assert (vault_home / "state" / "app-state.json").is_file()

        # 8. Reveal in File Explorer (OS 파일 탐색기 호출 검증 — OS 창은 모킹)
        opened: list[tuple[Path, bool]] = []
        monkeypatch.setattr(
            "app.vault.adapters._open_in_os_file_manager",
            lambda target, *, select_in_parent: opened.append((target, select_in_parent)),
        )

        rev_file = client.post(
            "/api/vaults/default-vault/reveal",
            json={"path": "01. Docs/Spec.md"},
        )
        assert rev_file.status_code == 200
        assert Path(rev_file.json()["resolvedPath"]) == (default_root / "01. Docs" / "Spec.md").resolve()
        assert opened[-1] == ((default_root / "01. Docs" / "Spec.md").resolve(), True)

        rev_root = client.post("/api/vaults/default-vault/reveal", json={"path": ""})
        assert rev_root.status_code == 200
        assert Path(rev_root.json()["resolvedPath"]) == default_root.resolve()
        assert opened[-1] == (default_root.resolve(), False)

        rev_missing = client.post("/api/vaults/default-vault/reveal", json={"path": "nope.md"})
        assert rev_missing.status_code == 404

        rev_escape = client.post("/api/vaults/default-vault/reveal", json={"path": "../escape"})
        assert rev_escape.status_code == 400
