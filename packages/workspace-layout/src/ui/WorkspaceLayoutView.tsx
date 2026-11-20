import React, { useRef } from "react";
import { useStore } from "zustand";

import type { WorkspaceLayoutStore } from "../core/layoutStore";
import {
  TAB_GROUP_COLORS,
  type LayoutNode,
  type SplitNode,
  type TabGroupNode,
  type WorkspaceTab,
} from "../core/types";
import {
  TabGroupPane,
  type ExternalDropResource,
  type TabViewTypeOption,
} from "./TabGroupPane";

export interface WorkspaceLayoutViewProps {
  readonly store: WorkspaceLayoutStore;
  readonly renderTabContent: (tab: WorkspaceTab, group: TabGroupNode) => React.ReactNode;
  readonly renderEmptyTab?: (group: TabGroupNode, tab: WorkspaceTab) => React.ReactNode;
  readonly parseExternalDrop?: (dataTransfer: DataTransfer) => ExternalDropResource | null;
  readonly renderTabIcon?: (tab: WorkspaceTab) => React.ReactNode;
  readonly getAvailableViewTypes?: (tab: WorkspaceTab) => readonly TabViewTypeOption[];
  readonly acceptsCanvasDropForTab?: (tab: WorkspaceTab) => boolean;
  readonly className?: string;
}

interface SplitBranchViewProps {
  readonly store: WorkspaceLayoutStore;
  readonly node: SplitNode;
  readonly activeGroupId: string;
  readonly renderTabContent: WorkspaceLayoutViewProps["renderTabContent"];
  readonly renderEmptyTab?: WorkspaceLayoutViewProps["renderEmptyTab"];
  readonly parseExternalDrop?: WorkspaceLayoutViewProps["parseExternalDrop"];
  readonly renderTabIcon?: WorkspaceLayoutViewProps["renderTabIcon"];
  readonly getAvailableViewTypes?: WorkspaceLayoutViewProps["getAvailableViewTypes"];
  readonly acceptsCanvasDropForTab?: WorkspaceLayoutViewProps["acceptsCanvasDropForTab"];
}

const SplitBranchView: React.FC<SplitBranchViewProps> = ({
  store,
  node,
  activeGroupId,
  renderTabContent,
  renderEmptyTab,
  parseExternalDrop,
  renderTabIcon,
  getAvailableViewTypes,
  acceptsCanvasDropForTab,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isHorizontal = node.direction === "horizontal";

  const startResize = (ev: React.MouseEvent, boundaryIndex: number) => {
    ev.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const totalSize = isHorizontal
      ? container.getBoundingClientRect().width
      : container.getBoundingClientRect().height;
    if (totalSize <= 0) return;

    let lastPos = isHorizontal ? ev.clientX : ev.clientY;

    const onMouseMove = (moveEv: MouseEvent) => {
      const curPos = isHorizontal ? moveEv.clientX : moveEv.clientY;
      const deltaPx = curPos - lastPos;
      lastPos = curPos;
      const deltaPercent = (deltaPx / totalSize) * 100;
      if (Math.abs(deltaPercent) > 0.01) {
        store.getState().resizeSplit(node.id, boundaryIndex, deltaPercent, 12);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 w-full min-w-0 overflow-hidden ${isHorizontal ? "flex-row" : "flex-col"
        }`}
    >
      {node.children.map((child, idx) => {
        const pct = node.sizes[idx] ?? 100 / node.children.length;
        return (
          <React.Fragment key={child.id}>
            <div
              className="flex min-h-0 min-w-0 overflow-hidden"
              style={{ flex: `0 0 ${pct}%` }}
            >
              <LayoutNodeRenderer
                store={store}
                node={child}
                activeGroupId={activeGroupId}
                renderTabContent={renderTabContent}
                renderEmptyTab={renderEmptyTab}
                parseExternalDrop={parseExternalDrop}
                renderTabIcon={renderTabIcon}
                getAvailableViewTypes={getAvailableViewTypes}
                acceptsCanvasDropForTab={acceptsCanvasDropForTab}
              />
            </div>

            {idx < node.children.length - 1 && (
              <div
                role="separator"
                aria-orientation={isHorizontal ? "vertical" : "horizontal"}
                onMouseDown={(ev) => startResize(ev, idx)}
                className={`group relative z-20 shrink-0 ${isHorizontal
                  ? "w-px cursor-col-resize bg-[var(--obs-border,#363636)]"
                  : "h-px cursor-row-resize bg-[var(--obs-border,#363636)]"
                  }`}
              >
                {/* Invisible 6px hit area + Obsidian accent hover rail */}
                <div
                  className={`absolute transition-colors group-hover:bg-[var(--obs-accent,#8a5cf5)] ${isHorizontal
                    ? "top-0 bottom-0 -left-[3px] w-[7px] group-hover:left-[-1px] group-hover:w-[3px]"
                    : "right-0 left-0 -top-[3px] h-[7px] group-hover:top-[-1px] group-hover:h-[3px]"
                    }`}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

interface LayoutNodeRendererProps {
  readonly store: WorkspaceLayoutStore;
  readonly node: LayoutNode;
  readonly activeGroupId: string;
  readonly renderTabContent: WorkspaceLayoutViewProps["renderTabContent"];
  readonly renderEmptyTab?: WorkspaceLayoutViewProps["renderEmptyTab"];
  readonly parseExternalDrop?: WorkspaceLayoutViewProps["parseExternalDrop"];
  readonly renderTabIcon?: WorkspaceLayoutViewProps["renderTabIcon"];
  readonly getAvailableViewTypes?: WorkspaceLayoutViewProps["getAvailableViewTypes"];
  readonly acceptsCanvasDropForTab?: WorkspaceLayoutViewProps["acceptsCanvasDropForTab"];
}

const LayoutNodeRenderer: React.FC<LayoutNodeRendererProps> = ({
  store,
  node,
  activeGroupId,
  renderTabContent,
  renderEmptyTab,
  parseExternalDrop,
  renderTabIcon,
  getAvailableViewTypes,
  acceptsCanvasDropForTab,
}) => {
  if (node.kind === "group") {
    return (
      <TabGroupPane
        store={store}
        group={node}
        isActiveGroup={node.id === activeGroupId}
        renderTabContent={renderTabContent}
        renderEmptyTab={renderEmptyTab}
        parseExternalDrop={parseExternalDrop}
        renderTabIcon={renderTabIcon}
        getAvailableViewTypes={getAvailableViewTypes}
        acceptsCanvasDropForTab={acceptsCanvasDropForTab}
      />
    );
  }
  return (
    <SplitBranchView
      store={store}
      node={node}
      activeGroupId={activeGroupId}
      renderTabContent={renderTabContent}
      renderEmptyTab={renderEmptyTab}
      parseExternalDrop={parseExternalDrop}
      renderTabIcon={renderTabIcon}
      getAvailableViewTypes={getAvailableViewTypes}
      acceptsCanvasDropForTab={acceptsCanvasDropForTab}
    />
  );
};

const WorkspaceLayoutViewImpl: React.FC<WorkspaceLayoutViewProps> = ({
  store,
  renderTabContent,
  renderEmptyTab,
  parseExternalDrop,
  renderTabIcon,
  getAvailableViewTypes,
  acceptsCanvasDropForTab,
  className = "",
}) => {
  const root = useStore(store, (s) => s.root);
  const activeGroupId = useStore(store, (s) => s.activeGroupId);
  const expandedTabGroup = useStore(store, (s) => s.expandedTabGroup);
  const tabGroups = useStore(store, (s) => s.tabGroups);

  const expandedMeta = expandedTabGroup ? tabGroups[expandedTabGroup.tabGroupId] : null;
  const expandedColor = expandedMeta ? TAB_GROUP_COLORS[expandedMeta.color] : null;

  return (
    <div
      data-expanded-tab-group={expandedMeta?.id ?? undefined}
      className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden ${className}`}
      style={
        expandedColor
          ? {
            boxShadow: `inset 0 0 0 1.5px ${expandedColor.hex}`,
          }
          : undefined
      }
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LayoutNodeRenderer
          store={store}
          node={root}
          activeGroupId={activeGroupId}
          renderTabContent={renderTabContent}
          renderEmptyTab={renderEmptyTab}
          parseExternalDrop={parseExternalDrop}
          renderTabIcon={renderTabIcon}
          getAvailableViewTypes={getAvailableViewTypes}
          acceptsCanvasDropForTab={acceptsCanvasDropForTab}
        />
      </div>
    </div>
  );
};

export const WorkspaceLayoutView = React.memo(WorkspaceLayoutViewImpl);
