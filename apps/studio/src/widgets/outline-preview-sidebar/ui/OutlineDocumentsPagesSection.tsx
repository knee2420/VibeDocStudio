import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { isPageTargetNode } from "@/features/edit-outline";

import { useSplitterDrag } from "../lib/useSplitterDrag";
import { minDepth, selectPageTreeForZoom } from "../model/outlineSections";
import { OutlineNodeRow } from "./OutlineNodeRow";
import { AddNodeButton, type SectionProps } from "./outlineSectionParts";

/**
 * Documents & Pages 구역 (피그마 `페이지` 목록): 문서 · 페이지. Elements 검색과는 무관하다.
 * 줌은 Workflowy 처럼 페이지 수준까지 따른다 (`selectPageTreeForZoom`): 문서 줌 → 그 문서 · 페이지들,
 * 페이지 줌 · 엘리먼트 줌 → 그 페이지만.
 * 현재 페이지는 피그마처럼 회색 바탕 + 굵게, 활성 문서는 굵게 표시한다.
 * 아래 경계를 끌어 높이를 바꾼다 (더블클릭: 기본 높이). 현재 페이지가 바뀌면 그 행이 보이게 스크롤한다.
 */
export const DocumentsPagesSection: React.FC<
  SectionProps & {
    allNodes: OutlinerNode[];
    /** 투영의 줌 루트 id. */
    zoomRootId: string;
    /** 머리말 `+`: 새 문서 메뉴 (A4 · 블로그 글 · 불러오기). 페이지 추가는 문서 행의 버튼이 맡는다. */
    onNewDocument: (anchorEl: HTMLElement) => void;
    onAddNode?: () => void;
  }
> = ({ activeDocId, actions, phase, renaming, reportOrder, allNodes, zoomRootId, onNewDocument, onAddNode }) => {
  const [folded, setFolded] = useState(false);
  const collapsedNodeIds = useWorkspaceSessionStore((s) => s.collapsedNodeIds);
  const selectedNodeId = useWorkspaceSessionStore((s) => s.selectedOutlinerNodeId);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);

  const nodes = useMemo(
    () => selectPageTreeForZoom(allNodes, collapsedNodeIds, allNodes.find((n) => n.nodeId === zoomRootId)),
    [allNodes, collapsedNodeIds, zoomRootId]
  );
  const depthOffset = useMemo(() => minDepth(nodes), [nodes]);
  useLayoutEffect(() => reportOrder(folded ? [] : nodes), [folded, nodes, reportOrder]);

  const paneHeight = useWorkspaceLayoutStore((s) => s.pagesPaneHeight);
  const treeRef = useRef<HTMLDivElement>(null);
  const onSplitterDown = useSplitterDrag(
    () => treeRef.current?.clientHeight ?? paneHeight,
    (h) => useWorkspaceLayoutStore.getState().setPagesPaneHeight(h)
  );

  // 캔버스에서 다른 페이지의 엘리먼트를 고르면 현재 페이지가 바뀐다 → 그 페이지 행이 보이게.
  const currentNodeId = useMemo(
    () => nodes.find((n) => isPageTargetNode(n) && n.targetPageId === activePageId && (n.targetDocId || activeDocId) === activeDocId)?.nodeId,
    [nodes, activePageId, activeDocId]
  );
  useEffect(() => {
    if (!currentNodeId) return;
    treeRef.current?.querySelector(`[data-node-id="${CSS.escape(currentNodeId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentNodeId, folded]);

  return (
    <div className="relative shrink-0 border-b border-[var(--fig-border)]">
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
          data-new-doc-trigger=""
          data-testid="outline-new-doc-menu-btn"
          onClick={(e) => onNewDocument(e.currentTarget)}
          title="새 문서 (A4 · 블로그 글 · 불러오기)"
          className="fig-icon-btn"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {!folded && (
        <div
          ref={treeRef}
          role="tree"
          aria-label="Documents & Pages Tree"
          style={{ maxHeight: paneHeight }}
          className="pb-2 overflow-y-auto overflow-x-hidden"
        >
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

      {!folded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Documents & Pages · Elements 경계 (끌어서 높이 조절)"
          data-testid="pages-elements-splitter"
          title="끌어서 높이 조절 · 더블클릭: 기본 높이"
          onMouseDown={onSplitterDown}
          onDoubleClick={() => useWorkspaceLayoutStore.getState().resetPagesPaneHeight()}
          className="fig-splitter"
        />
      )}
    </div>
  );
};
