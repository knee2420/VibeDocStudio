"""projects 도메인 모델 (`.vproj` 다중 문서 프로젝트 & 참조 프로젝트 덱).

`VProjectManifestRecord` 는 아웃라인 트리의 애그리거트 루트다. 노드 삽입 · 이동 ·
들여쓰기 · 삭제 · 참조 복제 같은 트리 불변식은 모두 이 클래스의 메서드가 지킨다.
유스케이스는 저장소에서 꺼내 메서드를 부르고 다시 넣을 뿐이다.

직렬화(camelCase JSON)는 `mappers.py` 가 맡는다.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from enum import StrEnum

from .errors import (
    VProjectNotFoundError,
    VProjectValidationError,
)


class ZoomLevel(StrEnum):
    PROJECT = "project"
    DOCUMENT = "document"
    PAGE = "page"
    SLOT = "slot"

    @classmethod
    def for_depth(cls, depth: int) -> ZoomLevel:
        """깊이에서 기본 줌 단계를 정한다 (1=문서, 2=페이지, 3+=슬롯)."""
        if depth <= 0:
            return cls.PROJECT
        if depth == 1:
            return cls.DOCUMENT
        if depth == 2:
            return cls.PAGE
        return cls.SLOT

    @classmethod
    def parse(cls, raw: object, default: ZoomLevel) -> ZoomLevel:
        try:
            return cls(str(raw))
        except ValueError:
            return default


class WorkbenchPhase(StrEnum):
    STORYLINING = "storylining"
    TEMPLATING = "templating"
    DRAFTING = "drafting"

    @classmethod
    def parse(cls, raw: object, default: WorkbenchPhase) -> WorkbenchPhase:
        try:
            return cls(str(raw))
        except ValueError:
            return default


class AiStatus(StrEnum):
    IDLE = "idle"
    WORKING = "working"
    STAGED = "staged"
    APPLIED = "applied"

    @classmethod
    def parse(cls, raw: object, default: AiStatus) -> AiStatus:
        try:
            return cls(str(raw))
        except ValueError:
            return default


MAX_OUTLINE_DEPTH = 3

#: 노드 갱신 요청이 바꿀 수 있는 필드. 트리 구조(`parent_id`, `depth`)와 출처는 전용 메서드로만 바꾼다.
EDITABLE_NODE_FIELDS = frozenset(
    {
        "title",
        "summary",
        "zoom_level",
        "target_doc_id",
        "target_page_id",
        "target_block_id",
        "target_slot_id",
        "recommended_template_id",
        "ai_status",
    }
)


@dataclass(frozen=True)
class StorylineNodeRecord:
    """4단계 줌인 위계(Project -> Document -> Page/Block -> Slot)를 잇는 아웃라이너 노드."""

    node_id: str
    parent_id: str | None
    depth: int
    zoom_level: ZoomLevel
    title: str
    summary: str = ""
    target_doc_id: str | None = None
    target_page_id: str | None = None
    target_block_id: str | None = None
    target_slot_id: str | None = None
    recommended_template_id: str | None = None
    provenance_source_project_id: str | None = None
    provenance_source_node_id: str | None = None
    ai_status: AiStatus = AiStatus.IDLE

    @property
    def is_root(self) -> bool:
        return self.parent_id is None


@dataclass(frozen=True)
class ProvenanceLineageRecord:
    """참조 프로젝트에서 내 작업 프로젝트로 복제된 노드의 출처(Provenance) 원장 항목."""

    record_id: str
    target_project_id: str
    target_node_id: str
    source_project_id: str
    source_project_title: str
    source_node_id: str
    source_node_title: str
    cloned_at: str


@dataclass(frozen=True)
class OutlineSubtree:
    """줌인 대상 노드 기준의 아웃라인 투영."""

    root: StorylineNodeRecord | None
    ancestors: tuple[StorylineNodeRecord, ...]
    nodes: tuple[StorylineNodeRecord, ...]

    @property
    def active_zoom_level(self) -> ZoomLevel:
        return self.root.zoom_level if self.root else ZoomLevel.PROJECT


@dataclass(frozen=True)
class VProjectManifestRecord:
    """단일 `.vproj` 프로젝트 매니페스트. 레퍼런스는 프로젝트가 아니다 (reference 도메인이 따로 관리한다)."""

    project_id: str
    title: str
    description: str
    active_phase: WorkbenchPhase
    doc_ids: tuple[str, ...]
    storyline_nodes: tuple[StorylineNodeRecord, ...] = field(default_factory=tuple)
    provenance_lineage: tuple[ProvenanceLineageRecord, ...] = field(default_factory=tuple)
    updated_at: str = ""

    # --- 조회 ---------------------------------------------------------------

    def find_node(self, node_id: str | None) -> StorylineNodeRecord | None:
        if not node_id:
            return None
        return next((n for n in self.storyline_nodes if n.node_id == node_id), None)

    def require_node(self, node_id: str) -> StorylineNodeRecord:
        node = self.find_node(node_id)
        if node is None:
            raise VProjectNotFoundError(f"Node '{node_id}' not found in '{self.project_id}'")
        return node

    @property
    def root_node(self) -> StorylineNodeRecord | None:
        return next((n for n in self.storyline_nodes if n.is_root), None)

    def _children_index(self) -> dict[str | None, list[StorylineNodeRecord]]:
        index: dict[str | None, list[StorylineNodeRecord]] = {}
        for node in self.storyline_nodes:
            index.setdefault(node.parent_id, []).append(node)
        return index

    def subtree_ids(self, root_id: str) -> set[str]:
        """`root_id` 와 그 모든 자손의 ID (자식 색인 + BFS, O(N))."""
        children = self._children_index()
        found = {root_id}
        queue = [root_id]
        while queue:
            current = queue.pop()
            for child in children.get(current, ()):
                if child.node_id not in found:
                    found.add(child.node_id)
                    queue.append(child.node_id)
        return found

    def ancestor_chain(self, node_id: str) -> tuple[StorylineNodeRecord, ...]:
        """루트 → `node_id` 순서의 경로 (자기 자신 포함). 순환이 있어도 멈춘다."""
        by_id = {n.node_id: n for n in self.storyline_nodes}
        chain: list[StorylineNodeRecord] = []
        visited: set[str] = set()
        current = by_id.get(node_id)
        while current is not None and current.node_id not in visited:
            visited.add(current.node_id)
            chain.append(current)
            current = by_id.get(current.parent_id) if current.parent_id else None
        chain.reverse()
        return tuple(chain)

    def outline_subtree(self, root_node_id: str | None) -> OutlineSubtree:
        root = self.find_node(root_node_id)
        if root is None:
            return OutlineSubtree(root=None, ancestors=(), nodes=self.storyline_nodes)
        allowed = self.subtree_ids(root.node_id)
        return OutlineSubtree(
            root=root,
            ancestors=self.ancestor_chain(root.node_id),
            nodes=tuple(n for n in self.storyline_nodes if n.node_id in allowed),
        )

    # --- 프로젝트 단위 변경 -----------------------------------------------------

    def _touched(self, now: str, **changes: object) -> VProjectManifestRecord:
        return replace(self, updated_at=now, **changes)

    def with_phase(self, phase: WorkbenchPhase, *, now: str) -> VProjectManifestRecord:
        return self._touched(now, active_phase=phase)

    def _with_nodes(
        self,
        nodes: Iterable[StorylineNodeRecord],
        *,
        now: str,
        **changes: object,
    ) -> VProjectManifestRecord:
        return self._touched(now, storyline_nodes=_with_derived_depths(tuple(nodes)), **changes)

    # --- 아웃라인 노드 명령 ---------------------------------------------------

    def _resolve_parent(self, parent_id: str | None) -> StorylineNodeRecord | None:
        if parent_id:
            parent = self.find_node(parent_id)
            if parent is None:
                raise VProjectValidationError(f"Target parent node '{parent_id}' not found")
            return parent
        return self.root_node

    def insert_node(
        self,
        *,
        node_id: str,
        parent_id: str | None,
        title: str,
        now: str,
        fields: dict[str, object] | None = None,
        provenance_source: tuple[str, str] | None = None,
    ) -> tuple[VProjectManifestRecord, StorylineNodeRecord]:
        if not title.strip():
            raise VProjectValidationError("Node title must not be empty")
        if self.find_node(node_id) is not None:
            raise VProjectValidationError(f"Node '{node_id}' already exists")
        parent = self._resolve_parent(parent_id)
        depth = parent.depth + 1 if parent else 0
        extra = _editable_fields(fields or {})
        extra.pop("title", None)
        extra["ai_status"] = AiStatus.parse(extra.get("ai_status"), AiStatus.IDLE)
        node = StorylineNodeRecord(
            node_id=node_id,
            parent_id=parent.node_id if parent else None,
            depth=depth,
            zoom_level=ZoomLevel.parse(extra.pop("zoom_level", None), ZoomLevel.for_depth(depth)),
            title=title.strip(),
            target_doc_id=extra.pop("target_doc_id", None) or (self.doc_ids[0] if self.doc_ids else None),
            recommended_template_id=extra.pop("recommended_template_id", None) or "section-block",
            provenance_source_project_id=provenance_source[0] if provenance_source else None,
            provenance_source_node_id=provenance_source[1] if provenance_source else None,
            **extra,  # type: ignore[arg-type]
        )
        return self._with_nodes((*self.storyline_nodes, node), now=now), node

    def update_node(
        self,
        node_id: str,
        patch: dict[str, object],
        *,
        now: str,
    ) -> VProjectManifestRecord:
        target = self.require_node(node_id)
        changes = _editable_fields(patch)
        if "zoom_level" in changes:
            changes["zoom_level"] = ZoomLevel.parse(changes["zoom_level"], target.zoom_level)
        if "ai_status" in changes:
            changes["ai_status"] = AiStatus.parse(changes["ai_status"], target.ai_status)
        updated = replace(target, **changes)  # type: ignore[arg-type]
        return self._with_nodes(
            (updated if n.node_id == node_id else n for n in self.storyline_nodes),
            now=now,
        )

    def assign_template(self, node_id: str, template_id: str, *, now: str) -> VProjectManifestRecord:
        return self.update_node(
            node_id,
            {"recommended_template_id": template_id, "ai_status": AiStatus.APPLIED},
            now=now,
        )

    def delete_node(self, node_id: str, *, now: str) -> VProjectManifestRecord:
        """노드와 그 자손을 함께 지운다. 루트는 지울 수 없다."""
        target = self.require_node(node_id)
        if target.is_root:
            raise VProjectValidationError("The outline root node cannot be deleted")
        doomed = self.subtree_ids(node_id)
        return self._with_nodes(
            (n for n in self.storyline_nodes if n.node_id not in doomed),
            now=now,
        )

    def move_node(self, node_id: str, direction: int, *, now: str) -> VProjectManifestRecord:
        """같은 부모 아래 형제와 순서를 바꾼다 (`direction`: -1 위, +1 아래)."""
        if direction not in (-1, 1):
            raise VProjectValidationError("direction must be -1 or 1")
        target = self.require_node(node_id)
        siblings = [n for n in self.storyline_nodes if n.parent_id == target.parent_id]
        position = next(i for i, n in enumerate(siblings) if n.node_id == node_id)
        swap_position = position + direction
        if target.is_root or not 0 <= swap_position < len(siblings):
            return self
        other = siblings[swap_position]
        nodes = list(self.storyline_nodes)
        i, j = nodes.index(target), nodes.index(other)
        nodes[i], nodes[j] = nodes[j], nodes[i]
        return self._with_nodes(nodes, now=now)

    def indent_node(self, node_id: str, delta: int, *, now: str) -> VProjectManifestRecord:
        """들여쓰기(+1)는 바로 위 형제의 자식으로, 내어쓰기(-1)는 부모의 형제로 옮긴다."""
        if delta not in (-1, 1):
            raise VProjectValidationError("delta must be -1 or 1")
        target = self.require_node(node_id)
        if target.is_root:
            return self

        if delta > 0:
            siblings = [n for n in self.storyline_nodes if n.parent_id == target.parent_id]
            position = next(i for i, n in enumerate(siblings) if n.node_id == node_id)
            if position == 0:
                return self
            new_parent = siblings[position - 1]
            if new_parent.depth + 1 > MAX_OUTLINE_DEPTH:
                return self
        else:
            parent = self.find_node(target.parent_id)
            if parent is None or parent.is_root:
                return self
            new_parent = self.find_node(parent.parent_id)
            if new_parent is None:
                return self

        new_depth = new_parent.depth + 1
        moved = replace(
            target,
            parent_id=new_parent.node_id,
            zoom_level=ZoomLevel.for_depth(new_depth),
        )
        return self._with_nodes(
            (moved if n.node_id == node_id else n for n in self.storyline_nodes),
            now=now,
        )



def _editable_fields(raw: dict[str, object]) -> dict[str, object]:
    unknown = set(raw) - EDITABLE_NODE_FIELDS
    if unknown:
        raise VProjectValidationError(f"Unsupported node fields: {sorted(unknown)}")
    return dict(raw)


def _with_derived_depths(
    nodes: tuple[StorylineNodeRecord, ...],
) -> tuple[StorylineNodeRecord, ...]:
    """`depth` 는 저장값이 아니라 부모 사슬에서 파생된다. 구조가 바뀔 때마다 다시 맞춘다."""
    by_id = {n.node_id: n for n in nodes}
    depths: dict[str, int] = {}

    def depth_of(node: StorylineNodeRecord) -> int:
        cached = depths.get(node.node_id)
        if cached is not None:
            return cached
        depth = 0
        seen = {node.node_id}
        current = node
        while current.parent_id and current.parent_id in by_id and current.parent_id not in seen:
            seen.add(current.parent_id)
            current = by_id[current.parent_id]
            depth += 1
        depths[node.node_id] = depth
        return depth

    return tuple(
        n if n.depth == depth_of(n) else replace(n, depth=depth_of(n)) for n in nodes
    )
