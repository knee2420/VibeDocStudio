"""유스케이스: WorkingOutline 배치 명령(임의 깊이 삽입·수정·reparent·turn_into·삭제) 적용."""
from __future__ import annotations

from dataclasses import dataclass

from app.core.clock import utc_now_iso

from ..errors import OutlineValidationError
from ..models import WorkingOutlineRecord
from ..ports import DocumentSyncPort, ProjectLookupPort, WorkingOutlineRepositoryPort
from ..schemas import WorkingOutlineCommandItem
from .get_working_outline import GetWorkingOutlineUseCase


@dataclass(frozen=True)
class ApplyWorkingCommandsResult:
    outline: WorkingOutlineRecord
    created_node_ids: list[str]


class ApplyWorkingCommandsUseCase:
    def __init__(
        self,
        repository: WorkingOutlineRepositoryPort,
        projects: ProjectLookupPort,
        documents: DocumentSyncPort,
    ) -> None:
        self._repository = repository
        self._loader = GetWorkingOutlineUseCase(repository, projects, documents)

    def execute(
        self,
        project_id: str,
        commands: list[WorkingOutlineCommandItem],
    ) -> ApplyWorkingCommandsResult:
        record = self._loader.execute(project_id)
        now = utc_now_iso()
        created_ids: list[str] = []

        for cmd in commands:
            if cmd.type == "insert":
                record, created = record.insert_node(
                    text=cmd.text or "",
                    parent_id=cmd.parent_id,
                    after_node_id=cmd.after_node_id,
                    index=cmd.index,
                    element_kind=cmd.element_kind,
                    node_id=cmd.node_id,
                    note=cmd.note or "",
                    media_target=cmd.media_target,
                    now=now,
                )
                created_ids.append(created.node_id)
            elif cmd.type in {"update", "turn_into"}:
                if not cmd.node_id:
                    raise OutlineValidationError("nodeId is required")
                record = record.update_node(
                    cmd.node_id,
                    text=cmd.text,
                    note=cmd.note,
                    element_kind=cmd.element_kind,
                    is_folded=cmd.is_folded,
                    is_completed=cmd.is_completed,
                    media_target=cmd.media_target,
                    now=now,
                )
            elif cmd.type in {"move", "reparent"}:
                if not cmd.node_id:
                    raise OutlineValidationError("nodeId is required")
                record = record.move_node(
                    cmd.node_id,
                    target_parent_id=cmd.target_parent_id if cmd.target_parent_id is not None else cmd.parent_id,
                    after_node_id=cmd.after_node_id,
                    index=cmd.index,
                    reconcile_kind=(cmd.type == "reparent"),
                    now=now,
                )
            elif cmd.type == "delete":
                if not cmd.node_id:
                    raise OutlineValidationError("nodeId is required")
                record = record.delete_node(cmd.node_id, now=now)
            else:
                raise OutlineValidationError(f"Unsupported command type: {cmd.type}")

        saved = self._repository.save(record)
        return ApplyWorkingCommandsResult(outline=saved, created_node_ids=created_ids)
