"""유스케이스: 4단계 프랙탈 줌 위계(Project -> Document -> Page/Block -> Slot) 아웃라인 트리 프로젝션."""
from __future__ import annotations

from typing import Any

from app.core.storage import safe_segment

from ..models import StorylineNodeRecord
from ..ports import VProjectRepositoryPort


class GetProjectOutlineTreeUseCase:
    """프로젝트의 아웃라이너 트리를 특정 `root_node_id`(Zoom-In 타겟) 및 브레드크럼 경로와 함께 반환한다."""

    def __init__(self, repository: VProjectRepositoryPort) -> None:
        self._repo = repository

    def execute(
        self,
        project_id: str,
        root_node_id: str | None = None,
    ) -> dict[str, Any]:
        project = self._repo.get(safe_segment(project_id))
        all_nodes = list(project.storyline_nodes)
        by_id: dict[str, StorylineNodeRecord] = {n.node_id: n for n in all_nodes}

        breadcrumbs: list[dict[str, Any]] = [
            {
                "nodeId": "project-root",
                "title": project.title,
                "zoomLevel": "project",
            }
        ]

        if not root_node_id or root_node_id == "project-root" or root_node_id not in by_id:
            visible_nodes = [n.to_dict() for n in all_nodes]
            active_zoom = "project"
        else:
            # Build breadcrumb chain from root_node_id up to root
            chain: list[StorylineNodeRecord] = []
            curr: StorylineNodeRecord | None = by_id.get(root_node_id)
            visited: set[str] = set()
            while curr is not None and curr.node_id not in visited:
                visited.add(curr.node_id)
                chain.append(curr)
                curr = by_id.get(curr.parent_id) if curr.parent_id else None
            chain.reverse()
            for item in chain:
                breadcrumbs.append(
                    {
                        "nodeId": item.node_id,
                        "title": item.title,
                        "zoomLevel": item.zoom_level,
                    }
                )

            # Collect subtree rooted at root_node_id
            allowed_ids: set[str] = {root_node_id}
            changed = True
            while changed:
                changed = False
                for n in all_nodes:
                    if n.parent_id in allowed_ids and n.node_id not in allowed_ids:
                        allowed_ids.add(n.node_id)
                        changed = True

            visible_nodes = [n.to_dict() for n in all_nodes if n.node_id in allowed_ids]
            active_zoom = by_id[root_node_id].zoom_level

        return {
            "projectId": project.project_id,
            "title": project.title,
            "isReferenceOnly": project.is_reference_only,
            "activePhase": project.active_phase,
            "activeZoomLevel": active_zoom,
            "rootNodeId": root_node_id or "project-root",
            "breadcrumbs": breadcrumbs,
            "nodes": visible_nodes,
            "totalNodeCount": len(all_nodes),
        }

