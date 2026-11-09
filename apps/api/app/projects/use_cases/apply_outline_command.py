"""유스케이스: 아웃라인 노드 명령(삽입 · 갱신 · 삭제 · 이동 · 들여쓰기 · 서식 지정 · 단계 전환)을 적용한다.

명령 하나는 `OutlineCommand` 구현 하나다. 새 명령은 클래스 하나를 추가하면 되고
유스케이스 본문은 바뀌지 않는다. 트리 불변식은 애그리거트(`VProjectManifestRecord`)가 지킨다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.core.clock import utc_now_iso
from app.core.storage import new_id, safe_segment

from ..models import VProjectManifestRecord, WorkbenchPhase
from ..ports import VProjectRepositoryPort


@dataclass(frozen=True)
class OutlineCommandResult:
    project: VProjectManifestRecord
    affected_node_id: str | None


class OutlineCommand(Protocol):
    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult: ...


@dataclass(frozen=True)
class InsertNodeCommand:
    title: str
    parent_id: str | None = None
    node_id: str | None = None
    fields: dict[str, object] = field(default_factory=dict)
    provenance_source: tuple[str, str] | None = None

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        updated, node = project.insert_node(
            node_id=self.node_id or new_id("node"),
            parent_id=self.parent_id,
            title=self.title,
            now=now,
            fields=self.fields,
            provenance_source=self.provenance_source,
        )
        return OutlineCommandResult(updated, node.node_id)


@dataclass(frozen=True)
class UpdateNodeCommand:
    node_id: str
    patch: dict[str, object]

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        return OutlineCommandResult(project.update_node(self.node_id, self.patch, now=now), self.node_id)


@dataclass(frozen=True)
class DeleteNodeCommand:
    node_id: str

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        return OutlineCommandResult(project.delete_node(self.node_id, now=now), None)


@dataclass(frozen=True)
class MoveNodeCommand:
    node_id: str
    direction: int

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        return OutlineCommandResult(project.move_node(self.node_id, self.direction, now=now), self.node_id)


@dataclass(frozen=True)
class IndentNodeCommand:
    node_id: str
    delta: int

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        return OutlineCommandResult(project.indent_node(self.node_id, self.delta, now=now), self.node_id)


@dataclass(frozen=True)
class AssignTemplateCommand:
    node_id: str
    template_id: str

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        return OutlineCommandResult(
            project.assign_template(self.node_id, self.template_id, now=now),
            self.node_id,
        )


@dataclass(frozen=True)
class SetPhaseCommand:
    phase: WorkbenchPhase

    def apply(self, project: VProjectManifestRecord, *, now: str) -> OutlineCommandResult:
        return OutlineCommandResult(project.with_phase(self.phase, now=now), None)


class ApplyOutlineCommandUseCase:
    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(self, project_id: str, command: OutlineCommand) -> OutlineCommandResult:
        results: list[OutlineCommandResult] = []

        def _apply(project: VProjectManifestRecord) -> VProjectManifestRecord:
            result = command.apply(project, now=utc_now_iso())
            results.append(result)
            return result.project

        saved = self._repo.update(safe_segment(project_id), _apply)
        return OutlineCommandResult(saved, results[0].affected_node_id)
