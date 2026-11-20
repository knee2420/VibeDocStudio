from __future__ import annotations

import threading
from pathlib import Path

from watchfiles import Change

from app.vault import adapters
from app.vault.adapters import DEFAULT_VAULT_ID, LocalVaultRepository


def _collect(repo: LocalVaultRepository, monkeypatch, batches: list[set[tuple[Change, str]]]) -> list[dict]:
    def fake_watch(*_args, **_kwargs):
        yield from batches

    monkeypatch.setattr(adapters, "watch", fake_watch)
    events = list(repo.iter_watch_events(DEFAULT_VAULT_ID, threading.Event()))
    return [ev for ev in events if ev["type"] != "connected"]


def test_atomic_save_is_one_modify_not_delete_then_create(tmp_path: Path, monkeypatch) -> None:
    repo = LocalVaultRepository(tmp_path)
    root = repo._get_vault_root(DEFAULT_VAULT_ID)
    target = root / "notes" / "plan.outline"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('{"rootNodes": []}', encoding="utf-8")

    # watchfiles reports tmp-file replace as deleted + added for the same path, in no fixed order.
    events = _collect(repo, monkeypatch, [{(Change.deleted, str(target)), (Change.added, str(target))}])

    assert [ev["type"] for ev in events] == ["modify"]
    assert events[0]["path"] == "notes/plan.outline"
    assert events[0]["content"] == '{"rootNodes": []}'


def test_real_create_and_delete_still_reported(tmp_path: Path, monkeypatch) -> None:
    repo = LocalVaultRepository(tmp_path)
    root = repo._get_vault_root(DEFAULT_VAULT_ID)
    created = root / "new.md"
    created.write_text("hi", encoding="utf-8")
    gone = root / "gone.md"

    events = _collect(
        repo,
        monkeypatch,
        [{(Change.added, str(created))}, {(Change.modified, str(gone)), (Change.deleted, str(gone))}],
    )

    assert [(ev["type"], ev["path"]) for ev in events] == [("create", "new.md"), ("delete", "gone.md")]


def test_upload_binary_keeps_bytes_and_numbers_duplicates(tmp_path: Path) -> None:
    repo = LocalVaultRepository(tmp_path)
    png = b"\x89PNG\r\n\x1a\n" + bytes(range(256))
    first = repo.upload_binary(DEFAULT_VAULT_ID, "notes/attachments", "shot.png", png)
    second = repo.upload_binary(DEFAULT_VAULT_ID, "notes/attachments", "shot.png", png)
    odd = repo.upload_binary(DEFAULT_VAULT_ID, "", '../evil:"name?.pdf', b"%PDF-1.4")

    assert first.path == "notes/attachments/shot.png"
    assert second.path == "notes/attachments/shot 1.png"
    # 경로 부분("../")과 쓸 수 없는 문자는 걷어내고, 볼트 맨 위에 저장된다.
    assert odd.path == "evil name .pdf"
    root = repo._get_vault_root(DEFAULT_VAULT_ID)
    assert (root / first.path).read_bytes() == png
