"""첫 기동 시 작업 공간 초기 데이터 심기 (`app.bootstrap.workspace_seed`).

서버가 프로젝트 · 문서의 원장(SSOT)이므로 초기 데이터도 서버에만 있다.
- 프로젝트: 저장소가 비어 있으면 `seed/projects.seed.json` 을 심는다.
- 문서: 프로젝트가 참조하는 `docId` 중 작업 문서가 없는 것은 같은 `docId` 의 카탈로그 서식 본문으로 만든다.

여러 도메인을 함께 다루므로 도메인 안이 아니라 조립 계층(bootstrap)에 둔다.
"""
from __future__ import annotations

import json
import logging
from dataclasses import replace
from pathlib import Path

from app.catalog.ports import CatalogRepositoryPort
from app.core.clock import utc_now_iso
from app.documents.models import VDocAggregateRecord
from app.documents.ports import VDocDocumentRepositoryPort
from app.projects.mappers import manifest_from_dict
from app.projects.ports import VProjectRepositoryPort

logger = logging.getLogger(__name__)

PROJECT_SEED_FILE = Path(__file__).resolve().parent / "seed" / "projects.seed.json"

#: 예전 시드가 가리키던, 실제로는 존재하지 않는 문서 · 페이지 · 슬롯 ID → 카탈로그의 실제 ID.
#: 이미 심어진 로컬 프로젝트를 한 번 고쳐 쓰는 데만 쓴다 (멱등).
LEGACY_REFERENCE_ALIASES: dict[str, dict[str, str]] = {
    "doc": {
        "vdoc-arch-minutes-01": "vdoc_meeting_minutes_1028",
        "vdoc-pandadoc-vc-proposal-01": "vdoc_pandadoc_vc_proposal",
        "vdoc-yesform-bansanghoe-07": "vdoc_yesform_07_bansanghoe",
        "vdoc-atticus-invoice-000081709": "atticus-invoice-000081709",
    },
    "page": {"page-arch-1": "mm_page_1", "page-vc-1": "page_1"},
    "slot": {"arch_agenda_body": "mm_slot_exec_summary"},
}


def seed_projects(repository: VProjectRepositoryPort, seed_file: Path = PROJECT_SEED_FILE) -> int:
    if not repository.is_empty():
        return 0
    raw = json.loads(seed_file.read_text(encoding="utf-8"))
    records = [manifest_from_dict(item) for item in raw.get("projects", [])]
    repository.seed(records)
    logger.info("[WorkspaceSeed] 초기 프로젝트 %d개를 심었습니다.", len(records))
    return len(records)


def migrate_legacy_references(repository: VProjectRepositoryPort) -> int:
    """예전 시드의 잘못된 문서 참조를 실제 카탈로그 ID 로 고친다. 고친 프로젝트 수를 돌려준다."""
    docs, pages, slots = (LEGACY_REFERENCE_ALIASES[k] for k in ("doc", "page", "slot"))

    def alias(table: dict[str, str], value: str | None) -> str | None:
        return table.get(value, value) if value else value

    migrated = 0
    for project in repository.list_projects():
        nodes = tuple(
            replace(
                n,
                target_doc_id=alias(docs, n.target_doc_id),
                target_page_id=alias(pages, n.target_page_id),
                target_slot_id=alias(slots, n.target_slot_id),
            )
            for n in project.storyline_nodes
        )
        doc_ids = tuple(docs.get(d, d) for d in project.doc_ids)
        if nodes != project.storyline_nodes or doc_ids != project.doc_ids:
            repository.save(replace(project, doc_ids=doc_ids, storyline_nodes=nodes))
            migrated += 1
    if migrated:
        logger.info("[WorkspaceSeed] 예전 문서 참조를 고친 프로젝트 %d개", migrated)
    return migrated


def seed_documents(
    projects: VProjectRepositoryPort,
    documents: VDocDocumentRepositoryPort,
    catalog: CatalogRepositoryPort,
) -> int:
    wanted = {doc_id for p in projects.list_projects() for doc_id in p.doc_ids}
    missing = {doc_id for doc_id in wanted if not documents.exists(doc_id)}
    if not missing:
        return 0
    seeded = 0
    for manifest in catalog.list_manifests():
        bundle = catalog.get_bundle(manifest.catalog_id)
        doc_id = str(bundle.document.get("docId", ""))
        if doc_id in missing:
            record = VDocAggregateRecord(doc_id=doc_id, payload=dict(bundle.document))
            documents.save(record.with_payload(record.payload, now=utc_now_iso()))
            missing.discard(doc_id)
            seeded += 1
    if missing:
        logger.warning("[WorkspaceSeed] 카탈로그에 없는 문서 참조: %s", sorted(missing))
    logger.info("[WorkspaceSeed] 카탈로그에서 작업 문서 %d개를 만들었습니다.", seeded)
    return seeded
