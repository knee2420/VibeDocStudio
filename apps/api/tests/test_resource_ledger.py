"""리소스 원장(ResourceLedgerService · FileDirectoryProvider)의 결정적 ID 보존 회귀 테스트."""
from __future__ import annotations

from pathlib import Path

from app.resource.ledger.adapters.file_provider import (
    FileDirectoryProvider,
    deterministic_resource_id,
)
from app.resource.ledger.adapters.local_ledger_repository import LocalLedgerRepository
from app.resource.ledger.models import ResourceSector


class _DummyWebProvider:
    def can_handle(self, source_type: str) -> bool:
        return source_type == "web"

    def ingest(self, target: str, custom_title: str | None = None):
        return []


def _service(tmp_path: Path):
    from app.resource.ledger.use_cases.ledger_service import ResourceLedgerService

    repo = LocalLedgerRepository(root_dir=tmp_path / "ledger")
    return ResourceLedgerService(
        repository=repo,
        files=FileDirectoryProvider(),
        web=_DummyWebProvider(),
        uploads_root=tmp_path / "uploads",
    ), repo


def test_file_provider_assigns_deterministic_ids_across_scans(tmp_path: Path) -> None:
    folder = tmp_path / "docs"
    folder.mkdir()
    img = folder / "hero.jpg"
    img.write_bytes(b"fake-jpg")
    note = folder / "readme.md"
    note.write_text("# 제목\n본문", encoding="utf-8")

    provider = FileDirectoryProvider()
    first = provider.ingest(folder)
    second = provider.ingest(folder)

    assert len(first) == 1 and len(second) == 1
    assert first[0].id == second[0].id == deterministic_resource_id("dir", folder)
    assert [c.id for c in first[0].children] == [c.id for c in second[0].children]
    note_item = next(c for c in first[0].children if c.title == "readme.md")
    assert note_item.id == deterministic_resource_id("file", note)
    assert note_item.sectors[0].resource_id == note_item.id


def test_rescan_and_reingest_preserve_existing_ids_and_raw_serving(tmp_path: Path) -> None:
    folder = tmp_path / "assets"
    folder.mkdir()
    photo = folder / "shot1.png"
    photo.write_bytes(b"png-bytes")

    svc, repo = _service(tmp_path)
    svc.ingest_directory("proj-1", str(folder))

    # 기존 문서가 이미 참조 중인 레거시 랜덤 ID · 체크 · 섹터 상태를 시뮬레이션한다
    session = repo.get_session("proj-1")
    target = session.items[0].children[0]
    target.id = "file_legacy999"
    target.is_checked = False
    target.sectors.append(ResourceSector(sector_id="sec_keep", resource_id="file_legacy999", text_snippet="보존 스니펫"))
    repo.save_session(session)

    # 새 파일 추가 후 재스캔(rescan)
    extra = folder / "shot2.jpg"
    extra.write_bytes(b"jpg-bytes")
    after_rescan = svc.rescan("proj-1")
    by_name = {c.title: c for c in after_rescan.items[0].children}
    assert by_name["shot1.png"].id == "file_legacy999"
    assert by_name["shot1.png"].is_checked is False
    assert any(s.sector_id == "sec_keep" and s.resource_id == "file_legacy999" for s in by_name["shot1.png"].sectors)
    assert by_name["shot2.jpg"].id == deterministic_resource_id("file", extra)

    # 같은 폴더를 다시 ingest_directory 해도 기존 ID · 상태가 깨지지 않고 raw_by_id 가 열린다
    after_reingest = svc.ingest_directory("proj-1", str(folder))
    by_name_re = {c.title: c for c in after_reingest.items[0].children}
    assert by_name_re["shot1.png"].id == "file_legacy999"
    assert svc.raw_by_id("file_legacy999").resolve() == photo.resolve()
    assert svc.raw_by_id(by_name["shot2.jpg"].id).resolve() == extra.resolve()

