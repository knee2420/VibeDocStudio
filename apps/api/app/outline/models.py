"""WorkingOutline 도메인 모델과 무제한 계층 트리 불변식."""
from __future__ import annotations

from dataclasses import dataclass, field, replace

from app.core.storage import new_id

from .errors import OutlineNotFoundError, OutlineValidationError

CONTAINER_ELEMENT_KINDS: tuple[str, ...] = ("project", "document", "page", "section")

LAYOUT_BLOCK_KINDS: tuple[str, ...] = (
    "image",
    "text",
    "section-block",
    "structured-table",
    "table",
    "columns-grid",
    "fillable-group",
    "heading",
    "form-title",
    "composite-form-frame",
    "summary-list",
    "cover-banner",
    "callout-box",
    "link-card",
    "divider",
    "hero",
)

SUB_UNIT_ELEMENT_KINDS: tuple[str, ...] = ("table-row", "table-cell", "grid-col", "slot", "media")

ELEMENT_KINDS: tuple[str, ...] = CONTAINER_ELEMENT_KINDS + LAYOUT_BLOCK_KINDS + SUB_UNIT_ELEMENT_KINDS

_DEFAULT_CHILD_BY_KIND: dict[str, str] = {
    "project": "document",
    "document": "page",
    "page": "text",
    "section": "text",
    "structured-table": "table-row",
    "table": "table-row",
    "composite-form-frame": "section",
    "table-row": "table-cell",
    "table-cell": "text",
    "columns-grid": "grid-col",
    "grid-col": "text",
}

_CONTEXT_BOUND_KINDS = frozenset({"table-row", "table-cell", "grid-col", "page", "document"})


def infer_child_element_kind(parent_kind: str | None) -> str:
    """부모 elementKind 기준으로 Tab(자식 추가) 시 기본 elementKind 를 추론한다."""
    if not parent_kind:
        return "page"
    return _DEFAULT_CHILD_BY_KIND.get(parent_kind, "text")


def reconcile_element_kind(current_kind: str, parent_kind: str | None) -> str:
    """노드 이동/들여쓰기/내어쓰기 시 새 부모 문맥에 맞춰 elementKind 를 보정한다."""
    p = parent_kind or "project"
    if p == "project":
        return current_kind if current_kind in {"document", "page"} else "document"
    if p == "document":
        if current_kind in {"page", "document"}:
            return "page"
    elif p in {"structured-table", "table"}:
        return "table-row"
    elif p == "table-row":
        return "table-cell"
    elif p == "columns-grid":
        return current_kind if current_kind in {"grid-col", "image"} else "grid-col"
    elif p == "composite-form-frame" and current_kind == "text":
        return "section"

    if current_kind in _CONTEXT_BOUND_KINDS:
        if current_kind in {"table-row", "table-cell", "grid-col"}:
            return "text"
    return current_kind


@dataclass(frozen=True)
class WorkingOutlineSourceRef:
    doc_id: str
    page_id: str | None = None
    block_id: str | None = None
    slot_id: str | None = None
    row_id: str | None = None
    cell_id: str | None = None
    section_id: str | None = None
    base_hash: str | None = None


@dataclass(frozen=True)
class WorkingOutlineNode:
    node_id: str
    text: str
    element_kind: str = "text"
    note: str = ""
    is_folded: bool = False
    is_completed: bool = False
    media_target: str | None = None
    recommended_template_id: str | None = None
    source_ref: WorkingOutlineSourceRef | None = None
    children: tuple[WorkingOutlineNode, ...] = ()

    def with_children(self, children: tuple[WorkingOutlineNode, ...]) -> WorkingOutlineNode:
        return replace(self, children=children)


def _find_node(nodes: tuple[WorkingOutlineNode, ...], node_id: str) -> WorkingOutlineNode | None:
    for node in nodes:
        if node.node_id == node_id:
            return node
        found = _find_node(node.children, node_id)
        if found is not None:
            return found
    return None


def _contains_id(node: WorkingOutlineNode, target_id: str) -> bool:
    if node.node_id == target_id:
        return True
    return any(_contains_id(child, target_id) for child in node.children)


def _remove_node(
    nodes: tuple[WorkingOutlineNode, ...],
    node_id: str,
) -> tuple[tuple[WorkingOutlineNode, ...], WorkingOutlineNode | None]:
    kept: list[WorkingOutlineNode] = []
    removed: WorkingOutlineNode | None = None
    for node in nodes:
        if node.node_id == node_id:
            removed = node
            continue
        next_children, child_removed = _remove_node(node.children, node_id)
        if child_removed is not None:
            removed = child_removed
            kept.append(node.with_children(next_children))
        else:
            kept.append(node)
    return tuple(kept), removed


def _insert_into(
    nodes: tuple[WorkingOutlineNode, ...],
    parent_id: str | None,
    new_node: WorkingOutlineNode,
    *,
    after_node_id: str | None = None,
    index: int | None = None,
) -> tuple[tuple[WorkingOutlineNode, ...], bool]:
    if parent_id is None:
        items = list(nodes)
        if after_node_id:
            for idx, item in enumerate(items):
                if item.node_id == after_node_id:
                    items.insert(idx + 1, new_node)
                    return tuple(items), True
        if index is not None and 0 <= index <= len(items):
            items.insert(index, new_node)
        else:
            items.append(new_node)
        return tuple(items), True

    updated: list[WorkingOutlineNode] = []
    inserted = False
    for node in nodes:
        if node.node_id == parent_id:
            kids = list(node.children)
            if after_node_id:
                placed = False
                for idx, item in enumerate(kids):
                    if item.node_id == after_node_id:
                        kids.insert(idx + 1, new_node)
                        placed = True
                        break
                if not placed:
                    kids.append(new_node)
            elif index is not None and 0 <= index <= len(kids):
                kids.insert(index, new_node)
            else:
                kids.append(new_node)
            updated.append(node.with_children(tuple(kids)))
            inserted = True
        else:
            next_children, child_inserted = _insert_into(
                node.children,
                parent_id,
                new_node,
                after_node_id=after_node_id,
                index=index,
            )
            if child_inserted:
                inserted = True
                updated.append(node.with_children(next_children))
            else:
                updated.append(node)
    return tuple(updated), inserted


def _update_node_recursive(
    nodes: tuple[WorkingOutlineNode, ...],
    node_id: str,
    transform,
) -> tuple[tuple[WorkingOutlineNode, ...], bool]:
    updated: list[WorkingOutlineNode] = []
    changed = False
    for node in nodes:
        if node.node_id == node_id:
            updated.append(transform(node))
            changed = True
        else:
            next_children, child_changed = _update_node_recursive(node.children, node_id, transform)
            if child_changed:
                changed = True
                updated.append(node.with_children(next_children))
            else:
                updated.append(node)
    return tuple(updated), changed


@dataclass(frozen=True)
class WorkingOutlineRecord:
    project_id: str
    revision: int = 1
    base_doc_revisions: dict[str, int] = field(default_factory=dict)
    dirty: bool = False
    updated_at: str = ""
    nodes: tuple[WorkingOutlineNode, ...] = ()

    def find(self, node_id: str) -> WorkingOutlineNode | None:
        return _find_node(self.nodes, node_id)

    def insert_node(
        self,
        *,
        text: str,
        parent_id: str | None = None,
        after_node_id: str | None = None,
        index: int | None = None,
        element_kind: str | None = None,
        node_id: str | None = None,
        note: str = "",
        media_target: str | None = None,
        now: str = "",
    ) -> tuple[WorkingOutlineRecord, WorkingOutlineNode]:
        parent_kind: str | None = "project"
        if parent_id is not None:
            parent = self.find(parent_id)
            if parent is None:
                raise OutlineNotFoundError(f"Parent node not found: {parent_id}")
            parent_kind = parent.element_kind

        kind = element_kind or infer_child_element_kind(parent_kind)
        if kind not in ELEMENT_KINDS:
            raise OutlineValidationError(f"Unsupported elementKind: {kind}")

        created = WorkingOutlineNode(
            node_id=node_id or new_id("wo"),
            text=text,
            element_kind=kind,
            note=note,
            media_target=media_target,
        )
        next_nodes, inserted = _insert_into(
            self.nodes,
            parent_id,
            created,
            after_node_id=after_node_id,
            index=index,
        )
        if not inserted:
            raise OutlineNotFoundError(f"Parent node not found: {parent_id}")

        return (
            replace(
                self,
                revision=self.revision + 1,
                dirty=True,
                updated_at=now or self.updated_at,
                nodes=next_nodes,
            ),
            created,
        )

    def update_node(
        self,
        node_id: str,
        *,
        text: str | None = None,
        note: str | None = None,
        element_kind: str | None = None,
        is_folded: bool | None = None,
        is_completed: bool | None = None,
        media_target: str | None = None,
        now: str = "",
    ) -> WorkingOutlineRecord:
        if element_kind is not None and element_kind not in ELEMENT_KINDS:
            raise OutlineValidationError(f"Unsupported elementKind: {element_kind}")

        def apply(node: WorkingOutlineNode) -> WorkingOutlineNode:
            return replace(
                node,
                text=node.text if text is None else text,
                note=node.note if note is None else note,
                element_kind=node.element_kind if element_kind is None else element_kind,
                is_folded=node.is_folded if is_folded is None else is_folded,
                is_completed=node.is_completed if is_completed is None else is_completed,
                media_target=node.media_target if media_target is None else media_target,
            )

        next_nodes, changed = _update_node_recursive(self.nodes, node_id, apply)
        if not changed:
            raise OutlineNotFoundError(f"Node not found: {node_id}")
        return replace(
            self,
            revision=self.revision + 1,
            dirty=True,
            updated_at=now or self.updated_at,
            nodes=next_nodes,
        )

    def move_node(
        self,
        node_id: str,
        *,
        target_parent_id: str | None = None,
        after_node_id: str | None = None,
        index: int | None = None,
        reconcile_kind: bool = True,
        now: str = "",
    ) -> WorkingOutlineRecord:
        without_target, moving = _remove_node(self.nodes, node_id)
        if moving is None:
            raise OutlineNotFoundError(f"Node not found: {node_id}")
        if target_parent_id is not None and _contains_id(moving, target_parent_id):
            raise OutlineValidationError("Cannot move node into its own descendant")

        parent_kind: str | None = "project"
        if target_parent_id is not None:
            parent = _find_node(without_target, target_parent_id)
            if parent is None:
                raise OutlineNotFoundError(f"Target parent not found: {target_parent_id}")
            parent_kind = parent.element_kind

        next_kind = reconcile_element_kind(moving.element_kind, parent_kind) if reconcile_kind else moving.element_kind
        updated_moving = replace(moving, element_kind=next_kind)
        next_nodes, inserted = _insert_into(
            without_target,
            target_parent_id,
            updated_moving,
            after_node_id=after_node_id,
            index=index,
        )
        if not inserted:
            raise OutlineNotFoundError(f"Target parent not found: {target_parent_id}")

        return replace(
            self,
            revision=self.revision + 1,
            dirty=True,
            updated_at=now or self.updated_at,
            nodes=next_nodes,
        )

    def delete_node(self, node_id: str, *, now: str = "") -> WorkingOutlineRecord:
        next_nodes, removed = _remove_node(self.nodes, node_id)
        if removed is None:
            raise OutlineNotFoundError(f"Node not found: {node_id}")
        return replace(
            self,
            revision=self.revision + 1,
            dirty=True,
            updated_at=now or self.updated_at,
            nodes=next_nodes,
        )
