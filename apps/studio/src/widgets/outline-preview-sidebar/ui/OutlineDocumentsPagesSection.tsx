import React, { useLayoutEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { isPageTargetNode } from "@/features/edit-outline";

import { minDepth, selectPageTreeNodes } from "../model/outlineSections";
import { ADD_PAGE_TRIGGER_ATTR } from "./AddPageFlow";
import { OutlineNodeRow } from "./OutlineNodeRow";
import { AddNodeButton, type SectionProps } from "./outlineSectionParts";

/**
 * Documents & Pages 구역 (피그마 `페이지` 목록): 문서 · 페이지. 줌 · Elements 검색과 무관하게 늘 전체를 보여준다.
 * 현재 페이지는 피그마처럼 회색 바탕 + 굵게, 활성 문서는 굵게 표시한다.
 */
export const DocumentsPagesSection: React.FC<
  SectionProps & {
    allNodes: OutlinerNode[];
    onAddPage: (anchorEl: HTMLElement) => void;
    onAddNode?: () => void;
  }
> = ({ activeDocId, actions, phase, renaming, reportOrder, allNodes, onAddPage, onAddNode }) => {
  const [folded, setFolded] = useState(false);
  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  const selectedNodeId = useWorkspaceSessionStore((s) => s.selectedOutlinerNodeId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);

  const nodes = useMemo(() => selectPageTreeNodes(allNodes, collapsedNodeIds), [allNodes, collapsedNodeIds]);
  const depthOffset = useMemo(() => minDepth(nodes), [nodes]);
  useLayoutEffect(() => reportOrder(folded ? [] : nodes), [folded, nodes, reportOrder]);

  return (
    <div className="shrink-0 border-b border-[var(--fig-border)]">
      <div className="fig-section-header">
        <button
          type="button"
          data-testid="pages-section-toggle"
          aria-expanded={!folded}
          onClick={() => setFolded((v) => !v)}
          className="flex items-center gap-1 -ml-1 min-w-0"
        >
          <span>Documents &amp; Pages</span>
          <span className="fig-section-meta">{nodes.length}</span>
          {folded ? <ChevronRight className="w-3 h-3 text-black/50" /> : <ChevronDown className="w-3 h-3 text-black/50" />}
        </button>
        <button
          type="button"
          {...ADD_PAGE_TRIGGER_ATTR}
          data-testid="pages-section-add-page-btn"
          onClick={(e) => onAddPage(e.currentTarget)}
          title="현재 문서에 페이지 추가"
          className="fig-icon-btn"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {!folded && (
        <div role="tree" aria-label="Documents & Pages Tree" className="pb-2 max-h-[248px] overflow-y-auto overflow-x-hidden">
          {nodes.map((node) => {
            const isPage = isPageTargetNode(node);
            const isCurrent = isPage && node.targetPageId === activePageId && (node.targetDocId || activeDocId) === activeDocId;
            return (
              <OutlineNodeRow
                key={node.nodeId}
                node={node}
                actions={actions}
                phase={phase}
                fallbackDocId={activeDocId}
                depthOffset={depthOffset}
                isCurrent={isCurrent}
                isStrong={node.zoomLevel === "document" && node.targetDocId === activeDocId}
                sel={!isPage && node.zoomLevel !== "document" && selectedNodeId === node.nodeId ? "on" : undefined}
                hasChildren={node.zoomLevel === "document"}
                renamingInitialTitle={renaming?.nodeId === node.nodeId ? renaming.initialTitle : undefined}
              />
            );
          })}
          {onAddNode && <AddNodeButton onClick={onAddNode} />}
        </div>
      )}
    </div>
  );
};
