import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Columns2,
  Copy,
  FileText,
  FolderPlus,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Rows2,
  Ungroup,
  X,
} from "lucide-react";

import type { WorkspaceLayoutStore } from "../core/layoutStore";
import { computeDockDropZone } from "../core/layoutTree";
import {
  TAB_GROUP_COLOR_ORDER,
  TAB_GROUP_COLORS,
  VIBE_WORKSPACE_TAB_GROUP_MIME,
  VIBE_WORKSPACE_TAB_MIME,
  type DockDropZone,
  type TabGroupMeta,
  type TabGroupNode,
  type WorkspaceTab,
} from "../core/types";

export interface ExternalDropResource {
  readonly resourceId: string;
  readonly title: string;
  readonly viewType: string;
}

export interface TabViewTypeOption {
  readonly id: string;
  readonly label: string;
}

export interface TabGroupPaneProps {
  readonly store: WorkspaceLayoutStore;
  readonly group: TabGroupNode;
  readonly isActiveGroup: boolean;
  readonly renderTabContent: (tab: WorkspaceTab, group: TabGroupNode) => React.ReactNode;
  readonly renderEmptyTab?: (group: TabGroupNode, tab: WorkspaceTab) => React.ReactNode;
  readonly parseExternalDrop?: (dataTransfer: DataTransfer) => ExternalDropResource | null;
  readonly renderTabIcon?: (tab: WorkspaceTab) => React.ReactNode;
  readonly getAvailableViewTypes?: (tab: WorkspaceTab) => readonly TabViewTypeOption[];
  readonly acceptsCanvasDropForTab?: (tab: WorkspaceTab) => boolean;
}

interface TabContextMenuState {
  readonly tab: WorkspaceTab;
  readonly x: number;
  readonly y: number;
}

interface GroupChipMenuState {
  readonly tabGroupId: string;
  readonly x: number;
  readonly y: number;
}

type TabStripSegment =
  | { readonly kind: "single"; readonly tab: WorkspaceTab; readonly index: number }
  | {
    readonly kind: "cluster";
    readonly meta: TabGroupMeta;
    readonly items: readonly { readonly tab: WorkspaceTab; readonly index: number }[];
  };

function buildTabStripSegments(
  tabs: readonly WorkspaceTab[],
  tabGroups: Readonly<Record<string, TabGroupMeta>>
): TabStripSegment[] {
  const segments: TabStripSegment[] = [];
  let i = 0;
  while (i < tabs.length) {
    const tab = tabs[i];
    const meta = tab.tabGroupId ? tabGroups[tab.tabGroupId] : undefined;
    if (!meta) {
      segments.push({ kind: "single", tab, index: i });
      i += 1;
      continue;
    }
    const items: { tab: WorkspaceTab; index: number }[] = [];
    while (i < tabs.length && tabs[i].tabGroupId === meta.id) {
      items.push({ tab: tabs[i], index: i });
      i += 1;
    }
    segments.push({ kind: "cluster", meta, items });
  }
  return segments;
}

type TabDropPreview =
  | {
    readonly kind: "insert";
    readonly index: number;
    readonly targetTabGroupId: string | null;
    readonly side: "left" | "right" | "end";
    readonly anchorTabId?: string;
  }
  | {
    readonly kind: "merge";
    readonly targetTabId: string;
    readonly accentHex: string;
  };

let activeDragTabId: string | null = null;
let activeDragTabGroupId: string | null = null;

function defaultTabIcon(tab: WorkspaceTab): React.ReactNode {
  if (tab.viewType === "outline") {
    return <ListTree className="h-3.5 w-3.5 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />;
  }
  return <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" />;
}

const TabGroupPaneImpl: React.FC<TabGroupPaneProps> = ({
  store,
  group,
  isActiveGroup,
  renderTabContent,
  renderEmptyTab,
  parseExternalDrop,
  renderTabIcon = defaultTabIcon,
  getAvailableViewTypes,
  acceptsCanvasDropForTab,
}) => {
  const tabGroups = useStore(store, (s) => s.tabGroups);
  const expandedTabGroup = useStore(store, (s) => s.expandedTabGroup);
  const isExpandedMode = Boolean(expandedTabGroup);

  const [dropZone, setDropZone] = useState<DockDropZone | null>(null);
  const [tabDropPreview, setTabDropPreview] = useState<TabDropPreview | null>(null);
  const [chipDropGroupId, setChipDropGroupId] = useState<string | null>(null);
  const [tabListOpen, setTabListOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [groupMenu, setGroupMenu] = useState<GroupChipMenuState | null>(null);

  const paneBodyRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const activeTab =
    group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0] ?? null;

  const stripSegments = useMemo(
    () => buildTabStripSegments(group.tabs, tabGroups),
    [group.tabs, tabGroups]
  );

  // Active tab's own Chrome Tab Group (stays active even when expanded so Stack Tabs & group chip keep working!)
  const activeTabGroupMeta: TabGroupMeta | null = useMemo(() => {
    if (!activeTab?.tabGroupId) return null;
    return tabGroups[activeTab.tabGroupId] ?? null;
  }, [activeTab?.tabGroupId, tabGroups]);

  const stackedGroupTabs = useMemo(() => {
    if (!activeTabGroupMeta?.stacked) return null;
    const members = group.tabs.filter((t) => t.tabGroupId === activeTabGroupMeta.id);
    return members.length > 0 ? members : null;
  }, [activeTabGroupMeta, group.tabs]);

  const isGroupStacked = Boolean(stackedGroupTabs);

  // Target Chrome Tab Group eligible for the top-right "크게 보기" <-> "되돌리기" toggle in this pane
  const paneTargetGroupMeta: TabGroupMeta | null = useMemo(() => {
    if (expandedTabGroup) {
      return tabGroups[expandedTabGroup.tabGroupId] ?? null;
    }
    if (activeTabGroupMeta) return activeTabGroupMeta;
    const firstGrouped = group.tabs.find((t) => t.tabGroupId && tabGroups[t.tabGroupId]);
    return firstGrouped?.tabGroupId ? (tabGroups[firstGrouped.tabGroupId] ?? null) : null;
  }, [activeTabGroupMeta, expandedTabGroup, group.tabs, tabGroups]);

  const activeGroupMenuMeta = groupMenu ? (tabGroups[groupMenu.tabGroupId] ?? null) : null;

  const hasOpenOverlay = Boolean(contextMenu || groupMenu || tabListOpen || moreMenuOpen);
  useEffect(() => {
    if (!hasOpenOverlay) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (contextMenu) setContextMenu(null);
      if (groupMenu) setGroupMenu(null);
      if (tabListOpen && tabListRef.current && !tabListRef.current.contains(ev.target as Node)) {
        setTabListOpen(false);
      }
      if (moreMenuOpen && moreRef.current && !moreRef.current.contains(ev.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setContextMenu(null);
        setGroupMenu(null);
        setTabListOpen(false);
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasOpenOverlay, contextMenu, groupMenu, tabListOpen, moreMenuOpen]);

  const hasValidDragPayload = (dt: DataTransfer): boolean => {
    if (dt.types.includes(VIBE_WORKSPACE_TAB_MIME)) return true;
    if (dt.types.includes(VIBE_WORKSPACE_TAB_GROUP_MIME)) return true;
    if (parseExternalDrop && dt.types.length > 0) return true;
    return false;
  };

  const clearDragVisuals = () => {
    setTabDropPreview(null);
    setChipDropGroupId(null);
    setDropZone(null);
  };

  const handleTabDragStart = (ev: React.DragEvent, tab: WorkspaceTab) => {
    activeDragTabId = tab.id;
    activeDragTabGroupId = null;
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData(VIBE_WORKSPACE_TAB_MIME, JSON.stringify({ tabId: tab.id, groupId: group.id }));
    ev.dataTransfer.setData("text/plain", tab.resourceId ?? tab.title);
  };

  const handleTabDragEnd = () => {
    activeDragTabId = null;
    activeDragTabGroupId = null;
    clearDragVisuals();
  };

  const handleGroupChipDragStart = (ev: React.DragEvent, meta: TabGroupMeta) => {
    activeDragTabGroupId = meta.id;
    activeDragTabId = null;
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData(
      VIBE_WORKSPACE_TAB_GROUP_MIME,
      JSON.stringify({ tabGroupId: meta.id, paneId: group.id })
    );
    ev.dataTransfer.setData("text/plain", meta.title);
  };

  const handleGroupChipDragEnd = () => {
    activeDragTabGroupId = null;
    activeDragTabId = null;
    clearDragVisuals();
  };

  const handleTabItemDragOver = (ev: React.DragEvent, tab: WorkspaceTab, idx: number) => {
    if (!hasValidDragPayload(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "move";
    setDropZone(null);
    setChipDropGroupId(null);

    const rect = ev.currentTarget.getBoundingClientRect();
    const rx = (ev.clientX - rect.left) / Math.max(rect.width, 1);
    const isTabDrag = ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_MIME);
    const isGroupChipDrag = ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_GROUP_MIME);

    if (isTabDrag) {
      if (activeDragTabId === tab.id) {
        setTabDropPreview(null);
        return;
      }
      if (!isExpandedMode && rx >= 0.28 && rx <= 0.72) {
        const targetMeta = tab.tabGroupId ? tabGroups[tab.tabGroupId] : undefined;
        const accentHex = targetMeta ? TAB_GROUP_COLORS[targetMeta.color].hex : "#8a5cf5";
        setTabDropPreview({ kind: "merge", targetTabId: tab.id, accentHex });
        return;
      }
      const side: "left" | "right" = rx < 0.28 ? "left" : "right";
      const targetTabGroupId =
        !isExpandedMode && tab.tabGroupId && tabGroups[tab.tabGroupId] ? tab.tabGroupId : null;
      setTabDropPreview({
        kind: "insert",
        index: side === "left" ? idx : idx + 1,
        targetTabGroupId,
        side,
        anchorTabId: tab.id,
      });
      return;
    }

    if (isGroupChipDrag) {
      const side: "left" | "right" = rx < 0.5 ? "left" : "right";
      setTabDropPreview({
        kind: "insert",
        index: side === "left" ? idx : idx + 1,
        targetTabGroupId: null,
        side,
        anchorTabId: tab.id,
      });
      return;
    }

    // External resource drag
    const side: "left" | "right" = rx < 0.5 ? "left" : "right";
    setTabDropPreview({
      kind: "insert",
      index: side === "left" ? idx : idx + 1,
      targetTabGroupId: null,
      side,
      anchorTabId: tab.id,
    });
  };

  const handleTabItemDrop = (ev: React.DragEvent, tab: WorkspaceTab, idx: number) => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = ev.currentTarget.getBoundingClientRect();
    const rx = (ev.clientX - rect.left) / Math.max(rect.width, 1);
    clearDragVisuals();

    const rawGroupChip = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_GROUP_MIME);
    if (rawGroupChip) {
      try {
        const parsed = JSON.parse(rawGroupChip) as { tabGroupId?: string };
        if (parsed.tabGroupId) {
          const insertIdx = rx < 0.5 ? idx : idx + 1;
          store.getState().moveTabGroupCollection(parsed.tabGroupId, group.id, insertIdx);
          return;
        }
      } catch {
        // Ignore invalid payload
      }
    }

    const rawTab = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_MIME);
    if (rawTab) {
      try {
        const parsed = JSON.parse(rawTab) as { tabId?: string };
        if (parsed.tabId) {
          if (parsed.tabId === tab.id) return;
          if (!isExpandedMode && rx >= 0.28 && rx <= 0.72) {
            store.getState().mergeTabsIntoGroup(parsed.tabId, tab.id);
            return;
          }
          const insertIdx = rx < 0.28 ? idx : idx + 1;
          const targetTabGroupId =
            !isExpandedMode && tab.tabGroupId && tabGroups[tab.tabGroupId]
              ? tab.tabGroupId
              : null;
          store.getState().moveTabToGroup(parsed.tabId, group.id, insertIdx, {
            targetTabGroupId,
          });
          return;
        }
      } catch {
        // Fallback to external drop
      }
    }

    const external = parseExternalDrop?.(ev.dataTransfer);
    if (external) {
      const insertIdx = rx < 0.5 ? idx : idx + 1;
      store.getState().dockResource(external, group.id, "center", insertIdx);
    }
  };

  const handleTabBarEndDragOver = (ev: React.DragEvent) => {
    if (!hasValidDragPayload(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "move";
    setDropZone(null);
    setChipDropGroupId(null);
    setTabDropPreview({
      kind: "insert",
      index: group.tabs.length,
      targetTabGroupId: null,
      side: "end",
    });
  };

  const handleTabBarEndDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragVisuals();

    const rawGroupChip = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_GROUP_MIME);
    if (rawGroupChip) {
      try {
        const parsed = JSON.parse(rawGroupChip) as { tabGroupId?: string };
        if (parsed.tabGroupId) {
          store.getState().moveTabGroupCollection(parsed.tabGroupId, group.id, group.tabs.length);
          return;
        }
      } catch {
        // Ignore invalid payload
      }
    }

    const rawTab = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_MIME);
    if (rawTab) {
      try {
        const parsed = JSON.parse(rawTab) as { tabId?: string };
        if (parsed.tabId) {
          store.getState().moveTabToGroup(parsed.tabId, group.id, group.tabs.length, {
            targetTabGroupId: null,
          });
          return;
        }
      } catch {
        // Fallback to external drop
      }
    }

    const external = parseExternalDrop?.(ev.dataTransfer);
    if (external) {
      store.getState().dockResource(external, group.id, "center", group.tabs.length);
    }
  };

  const handlePaneDragOver = (ev: React.DragEvent) => {
    if (!hasValidDragPayload(ev.dataTransfer)) return;
    const bodyEl = paneBodyRef.current;
    if (!bodyEl) return;

    const isInternalDrag =
      ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_MIME) ||
      ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_GROUP_MIME);
    const canvasPassThrough =
      !isInternalDrag && Boolean(activeTab && acceptsCanvasDropForTab?.(activeTab));

    const zone = computeDockDropZone(bodyEl.getBoundingClientRect(), ev.clientX, ev.clientY, {
      edgeRatio: canvasPassThrough ? 0.15 : 0.25,
      allowCenter: !canvasPassThrough,
    });

    if (!zone) {
      // Let center drops pass straight through to the 2D canvas!
      if (dropZone !== null) setDropZone(null);
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "move";
    if (dropZone !== zone) setDropZone(zone);
  };

  const handlePaneDrop = (ev: React.DragEvent) => {
    const isInternalDrag =
      ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_MIME) ||
      ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_GROUP_MIME);
    const canvasPassThrough =
      !isInternalDrag && Boolean(activeTab && acceptsCanvasDropForTab?.(activeTab));

    if (canvasPassThrough && dropZone === null) {
      // Pass center drop through to the 2D canvas without intercepting
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    const zone = dropZone ?? "center";
    clearDragVisuals();

    const rawGroupChip = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_GROUP_MIME);
    if (rawGroupChip) {
      try {
        const parsed = JSON.parse(rawGroupChip) as { tabGroupId?: string };
        if (parsed.tabGroupId) {
          store.getState().dockTabGroupCollection(parsed.tabGroupId, group.id, zone);
          return;
        }
      } catch {
        // Ignore invalid payload
      }
    }

    const rawTab = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_MIME);
    if (rawTab) {
      try {
        const parsed = JSON.parse(rawTab) as { tabId?: string };
        if (parsed.tabId) {
          store.getState().dockTab(parsed.tabId, group.id, zone);
          return;
        }
      } catch {
        // Fallback to external drop
      }
    }

    const external = parseExternalDrop?.(ev.dataTransfer);
    if (external) {
      store.getState().dockResource(external, group.id, zone);
    }
  };

  const canGoBack = activeTab ? activeTab.historyIndex > 0 : false;
  const handleChipDragOver = (ev: React.DragEvent, tabGroupId: string) => {
    const isTabDrag = ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_MIME);
    const isGroupChipDrag = ev.dataTransfer.types.includes(VIBE_WORKSPACE_TAB_GROUP_MIME);
    if (!isTabDrag && !isGroupChipDrag) return;
    if (isGroupChipDrag && activeDragTabGroupId === tabGroupId) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "move";
    setChipDropGroupId(tabGroupId);
    setTabDropPreview(null);
    setDropZone(null);
  };

  const handleChipDrop = (ev: React.DragEvent, tabGroupId: string) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragVisuals();

    const rawGroupChip = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_GROUP_MIME);
    if (rawGroupChip) {
      try {
        const parsed = JSON.parse(rawGroupChip) as { tabGroupId?: string };
        if (parsed.tabGroupId && parsed.tabGroupId !== tabGroupId) {
          store.getState().mergeTabGroups(parsed.tabGroupId, tabGroupId);
          return;
        }
      } catch {
        // Ignore invalid payload
      }
    }

    const rawTab = ev.dataTransfer.getData(VIBE_WORKSPACE_TAB_MIME);
    if (!rawTab) return;
    try {
      const parsed = JSON.parse(rawTab) as { tabId?: string };
      if (!parsed.tabId) return;
      store.getState().moveTabToGroup(parsed.tabId, group.id, undefined, {
        targetTabGroupId: tabGroupId,
      });
    } catch {
      // Ignore invalid drag payload
    }
  };

  const renderTabItem = (tab: WorkspaceTab, idx: number, groupAccentHex?: string) => {
    const isTabActive = tab.id === activeTab?.id;
    const isMergeTarget =
      tabDropPreview?.kind === "merge" && tabDropPreview.targetTabId === tab.id;
    const showInsertLeft =
      tabDropPreview?.kind === "insert" &&
      tabDropPreview.anchorTabId === tab.id &&
      tabDropPreview.side === "left";
    const showInsertRight =
      tabDropPreview?.kind === "insert" &&
      tabDropPreview.anchorTabId === tab.id &&
      tabDropPreview.side === "right";

    const activeAccent =
      groupAccentHex ??
      (isActiveGroup ? "var(--obs-accent,#8a5cf5)" : "var(--obs-border,#363636)");

    const shadows: string[] = [];
    if (isMergeTarget) {
      shadows.push(`inset 0 0 0 2px ${tabDropPreview.accentHex}`);
    } else {
      if (showInsertLeft) shadows.push("inset 2px 0 0 0 var(--obs-accent,#8a5cf5)");
      if (showInsertRight) shadows.push("inset -2px 0 0 0 var(--obs-accent,#8a5cf5)");
      if (isTabActive) shadows.push(`inset 0 -2px 0 0 ${activeAccent}`);
    }

    return (
      <div
        key={tab.id}
        role="tab"
        aria-selected={isTabActive}
        draggable
        onDragStart={(ev) => handleTabDragStart(ev, tab)}
        onDragEnd={handleTabDragEnd}
        onDragOver={(ev) => handleTabItemDragOver(ev, tab, idx)}
        onDrop={(ev) => handleTabItemDrop(ev, tab, idx)}
        onMouseDown={(ev) => {
          if (ev.button === 1) {
            ev.preventDefault();
            store.getState().closeTab(tab.id);
          }
        }}
        onClick={() => store.getState().activateTab(group.id, tab.id)}
        onContextMenu={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setGroupMenu(null);
          setContextMenu({ tab, x: ev.clientX, y: ev.clientY });
        }}
        className={`group relative flex h-[31px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-[6px] px-2.5 text-[12px] transition-all ${
          isTabActive || isMergeTarget ? "opacity-100" : "opacity-55 hover:opacity-85"
        }`}
        style={{
          minWidth: tab.pinned ? "68px" : "96px",
          maxWidth: tab.pinned ? "140px" : "200px",
          backgroundColor: isMergeTarget
            ? `${tabDropPreview.accentHex}33`
            : isTabActive
              ? groupAccentHex
                ? `${groupAccentHex}26`
                : "var(--obs-bg-primary,#1e1e1e)"
              : "transparent",
          color: isTabActive || isMergeTarget
            ? "var(--obs-text-normal,#dadada)"
            : "var(--obs-text-muted,#b3b3b3)",
          fontWeight: isTabActive ? 600 : 400,
          borderTop: isTabActive ? `2px solid ${activeAccent}` : "2px solid transparent",
          borderLeft: isTabActive
            ? `1px solid ${groupAccentHex ? `${groupAccentHex}55` : "var(--obs-border-subtle,#2d2d2d)"}`
            : "1px solid transparent",
          borderRight: isTabActive
            ? `1px solid ${groupAccentHex ? `${groupAccentHex}55` : "var(--obs-border-subtle,#2d2d2d)"}`
            : "1px solid transparent",
          boxShadow: shadows.length > 0 ? shadows.join(", ") : undefined,
        }}
        title={
          isMergeTarget
            ? "놓으면 그룹으로 합치기"
            : `${tab.resourceId ?? tab.title} · 드래그: 다른 탭 중앙에 놓아 그룹 합치기 / 빈 공간에 놓아 그룹 해제`
        }
      >
        {renderTabIcon(tab)}
        <span className="min-w-0 flex-1 truncate">{tab.title}</span>

        {isMergeTarget && (
          <span
            className="pointer-events-none shrink-0 rounded px-1 py-0.5 text-[9.5px] font-bold text-[#111111]"
            style={{ backgroundColor: tabDropPreview.accentHex }}
          >
            합치기
          </span>
        )}

        {tab.dirty && !isMergeTarget && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--obs-accent,#8a5cf5)]"
            title="Unsaved changes"
          />
        )}

        {tab.pinned ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              store.getState().togglePinTab(tab.id);
            }}
            title="Unpin tab"
            aria-label="Unpin tab"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--obs-accent,#8a5cf5)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Pin className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              store.getState().closeTab(tab.id);
            }}
            title="Close tab"
            aria-label={`Close ${tab.title}`}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] group-hover:opacity-100"
            style={{ opacity: isTabActive ? 0.75 : undefined }}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const canGoForward = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;

  const breadcrumbSegments = activeTab?.resourceId
    ? activeTab.resourceId.split("/")
    : [activeTab?.title ?? "New tab"];

  return (
    <section
      data-tab-group-id={group.id}
      onMouseDown={() => {
        if (!isActiveGroup) store.getState().setActiveGroup(group.id);
      }}
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]"
    >
      {/* Obsidian + Chrome Tab Group Header Bar (36px) */}
      <div
        onDragOver={handleTabBarEndDragOver}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
            setTabDropPreview(null);
            setChipDropGroupId(null);
          }
        }}
        onDrop={handleTabBarEndDrop}
        className="flex h-9 shrink-0 select-none items-end gap-0.5 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-tab-bar,#262626)] px-1.5 pt-1"
      >
        {/* Scrollable Tab Strip (with Chrome Tab Group Chips) */}
        <div className="no-scrollbar flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {stripSegments.map((segment) => {
            if (segment.kind === "single") {
              return renderTabItem(segment.tab, segment.index);
            }
            const { meta, items } = segment;
            const palette = TAB_GROUP_COLORS[meta.color];
            const isChipDrop = chipDropGroupId === meta.id;

            return (
              <div
                key={`cluster-${meta.id}`}
                data-chrome-tab-group={meta.id}
                className="flex shrink-0 items-end gap-0.5 pr-1"
                style={{
                  boxShadow: meta.collapsed ? undefined : `inset 0 -1px 0 0 ${palette.hex}40`,
                }}
              >
                {/* Chrome Colored Group Chip (click = collapse/expand, drag = move/merge group, right-click = settings) */}
                <button
                  type="button"
                  draggable={!isExpandedMode}
                  onDragStart={(ev) => handleGroupChipDragStart(ev, meta)}
                  onDragEnd={handleGroupChipDragEnd}
                  onClick={() => store.getState().toggleTabGroupCollapsed(meta.id)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setContextMenu(null);
                    setGroupMenu({ tabGroupId: meta.id, x: ev.clientX, y: ev.clientY });
                  }}
                  onDragOver={(ev) => handleChipDragOver(ev, meta.id)}
                  onDragLeave={() => setChipDropGroupId(null)}
                  onDrop={(ev) => handleChipDrop(ev, meta.id)}
                  title={`${meta.title} (${items.length}개 탭) · 클릭: 접기/펼치기 · 드래그: 그룹 이동/합치기 · 우클릭: 그룹 설정`}
                  className="mb-[5px] mr-0.5 flex h-[22px] shrink-0 cursor-grab items-center gap-1 rounded-[6px] px-2 text-[11px] font-semibold text-[#111111] transition-all hover:brightness-110 active:cursor-grabbing"
                  style={{
                    backgroundColor: palette.hex,
                    outline: isChipDrop ? "2px solid #ffffff" : undefined,
                    outlineOffset: isChipDrop ? "1px" : undefined,
                  }}
                >
                  <span className="max-w-[110px] truncate">{meta.title}</span>
                  {meta.collapsed && (
                    <span className="rounded bg-black/20 px-1 text-[10px] font-bold">
                      {items.length}
                    </span>
                  )}
                </button>

                {!meta.collapsed &&
                  items.map(({ tab, index }) => renderTabItem(tab, index, palette.hex))}
              </div>
            );
          })}

          {tabDropPreview?.kind === "insert" && tabDropPreview.side === "end" && (
            <span
              aria-hidden="true"
              className="mb-1 h-6 w-[2.5px] shrink-0 rounded-full bg-[var(--obs-accent,#8a5cf5)]"
            />
          )}

          {/* New Tab (+) Button */}
          <button
            type="button"
            onClick={() => store.getState().openNewEmptyTab(group.id)}
            title="New tab"
            aria-label="New tab"
            className="mb-1 ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right Tab Bar Controls: In-place "크게 보기" <-> "되돌리기" Toggle + Quick Group + Stack + Tab List */}
        <div ref={tabListRef} className="relative mb-1 flex shrink-0 items-center gap-1 pl-1">
          {paneTargetGroupMeta && (
            isExpandedMode ? (
              <button
                type="button"
                onClick={() => store.getState().restoreExpandedTabGroup()}
                title={`"${paneTargetGroupMeta.title}" 크게 보기 종료 (원래 그룹 탭으로 되돌리기)`}
                aria-label="되돌리기"
                aria-pressed={true}
                className="flex h-[22px] items-center gap-1 rounded-[5px] px-2.5 text-[11px] font-semibold text-[#111111] shadow-sm transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: TAB_GROUP_COLORS[paneTargetGroupMeta.color].hex,
                }}
              >
                <Minimize2 className="h-3 w-3" />
                <span>되돌리기</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => store.getState().expandTabGroup(paneTargetGroupMeta.id)}
                title={`"${paneTargetGroupMeta.title}" 그룹을 중앙 전체 영역으로 크게 보기`}
                aria-label="크게 보기"
                aria-pressed={false}
                className="flex h-[22px] items-center gap-1 rounded-[5px] border px-2 text-[11px] font-semibold transition-colors hover:brightness-110"
                style={{
                  borderColor: TAB_GROUP_COLORS[paneTargetGroupMeta.color].hex,
                  backgroundColor: TAB_GROUP_COLORS[paneTargetGroupMeta.color].bg,
                  color: "var(--obs-text-normal,#dadada)",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: TAB_GROUP_COLORS[paneTargetGroupMeta.color].hex }}
                />
                <Maximize2 className="h-3 w-3" />
                <span>크게 보기</span>
              </button>
            )
          )}

          {!isExpandedMode && activeTab && !activeTab.tabGroupId && (
            <button
              type="button"
              onClick={() => store.getState().createTabGroupCollection([activeTab.id])}
              title="현재 탭으로 새 그룹 만들기"
              aria-label="새 그룹 만들기"
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={!activeTabGroupMeta}
            onClick={() => {
              if (activeTabGroupMeta) {
                store.getState().toggleTabGroupStacked(activeTabGroupMeta.id);
              }
            }}
            title={
              activeTabGroupMeta
                ? activeTabGroupMeta.stacked
                  ? `"${activeTabGroupMeta.title}" 그룹 스택 보기 해제`
                  : `"${activeTabGroupMeta.title}" 그룹 탭만 스택으로 보기`
                : "그룹에 속한 탭에서만 스택 보기를 사용할 수 있습니다"
            }
            aria-label="Toggle group stacked tabs"
            aria-pressed={Boolean(activeTabGroupMeta?.stacked)}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            style={{
              color: activeTabGroupMeta?.stacked
                ? TAB_GROUP_COLORS[activeTabGroupMeta.color].hex
                : "var(--obs-text-muted,#b3b3b3)",
              backgroundColor: activeTabGroupMeta?.stacked
                ? TAB_GROUP_COLORS[activeTabGroupMeta.color].bg
                : undefined,
            }}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setTabListOpen((v) => !v)}
            title="Tab list"
            aria-label="Tab list"
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {tabListOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 z-50 mt-1 w-56 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 shadow-xl"
            >
              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
                Open Tabs ({group.tabs.length})
              </div>
              {group.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    store.getState().activateTab(group.id, tab.id);
                    setTabListOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  style={{
                    fontWeight: tab.id === activeTab?.id ? 600 : 400,
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {renderTabIcon(tab)}
                    <span className="truncate">{tab.title}</span>
                  </span>
                  {tab.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Obsidian View Header (34px): Back/Forward + Breadcrumb + Split Quick Actions */}
      {activeTab && !isGroupStacked && (
        <div className="flex h-[34px] shrink-0 select-none items-center justify-between gap-2 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2.5 text-[12px]">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() => store.getState().navigateBack(activeTab.id)}
              title="Navigate back (Alt+Left)"
              aria-label="Navigate back"
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={() => store.getState().navigateForward(activeTab.id)}
              title="Navigate forward (Alt+Right)"
              aria-label="Navigate forward"
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <div className="ml-1 flex min-w-0 items-center gap-1 truncate text-[12px]">
              {breadcrumbSegments.map((seg, idx) => {
                const isLast = idx === breadcrumbSegments.length - 1;
                return (
                  <React.Fragment key={`${seg}-${idx}`}>
                    {idx > 0 && (
                      <span className="text-[var(--obs-text-faint,#666666)]">/</span>
                    )}
                    <span
                      className={
                        isLast
                          ? "truncate font-medium text-[var(--obs-text-normal,#dadada)]"
                          : "truncate text-[var(--obs-text-muted,#b3b3b3)]"
                      }
                    >
                      {seg}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div ref={moreRef} className="relative flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => store.getState().splitTab(activeTab.id, "right", "duplicate")}
              title="Split right"
              aria-label="Split right"
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => store.getState().splitTab(activeTab.id, "bottom", "duplicate")}
              title="Split down"
              aria-label="Split down"
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <Rows2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              title="More options"
              aria-label="More options"
              className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {moreMenuOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 z-50 mt-1 w-48 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 text-[12px] shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => {
                    store.getState().duplicateTab(activeTab.id);
                    setMoreMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <Copy className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                  <span>Duplicate tab</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    store.getState().togglePinTab(activeTab.id);
                    setMoreMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  {activeTab.pinned ? (
                    <PinOff className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                  ) : (
                    <Pin className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                  )}
                  <span>{activeTab.pinned ? "Unpin" : "Pin"}</span>
                </button>
                {activeTabGroupMeta && (
                  <button
                    type="button"
                    onClick={() => {
                      store.getState().toggleTabGroupStacked(activeTabGroupMeta.id);
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <Layers className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                    <span>
                      {activeTabGroupMeta.stacked ? "그룹 스택 보기 해제" : "그룹 스택 보기"}
                    </span>
                  </button>
                )}
                {(() => {
                  const viewOptions = getAvailableViewTypes?.(activeTab) ?? [];
                  if (viewOptions.length <= 1) return null;
                  return (
                    <>
                      <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
                      <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
                        Open With...
                      </div>
                      {viewOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            store.getState().setTabViewType(activeTab.id, opt.id);
                            setMoreMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                        >
                          <span className="truncate">{opt.label}</span>
                          {activeTab.viewType === opt.id && (
                            <span className="text-[10px] font-semibold text-[var(--obs-accent,#8a5cf5)]">
                              Active
                            </span>
                          )}
                        </button>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pane Content + 4-Way Docking Drop Zone */}
      <div
        ref={paneBodyRef}
        onDragOver={handlePaneDragOver}
        onDragLeave={(ev) => {
          if (!paneBodyRef.current?.contains(ev.relatedTarget as Node | null)) {
            setDropZone(null);
          }
        }}
        onDrop={handlePaneDrop}
        className="relative flex min-h-0 flex-1 overflow-hidden"
      >
        {isGroupStacked && stackedGroupTabs && activeTabGroupMeta ? (
          /* Group-Scoped Obsidian Stacked Tabs Mode (Vertical Spines for active Chrome Tab Group ONLY) */
          <div
            data-stacked-tab-group={activeTabGroupMeta.id}
            className="flex h-full w-full overflow-x-auto"
          >
            {stackedGroupTabs.map((tab) => {
              const isOpen = tab.id === activeTab?.id;
              const groupHex = TAB_GROUP_COLORS[activeTabGroupMeta.color].hex;
              return (
                <div
                  key={tab.id}
                  className="flex h-full shrink-0 border-r border-[var(--obs-border-subtle,#2d2d2d)]"
                  style={{
                    width: isOpen ? "minmax(420px, 1fr)" : "36px",
                    flex: isOpen ? "1 1 420px" : "0 0 36px",
                    borderTop: `2px solid ${groupHex}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => store.getState().activateTab(group.id, tab.id)}
                    className="flex h-full w-9 shrink-0 flex-col items-center gap-2 border-r border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] py-3 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                    title={`${activeTabGroupMeta.title} · ${tab.title}`}
                  >
                    {renderTabIcon(tab)}
                    <span
                      className="text-[12px] font-medium"
                      style={{
                        writingMode: "vertical-rl",
                        textOrientation: "mixed",
                        color: isOpen
                          ? "var(--obs-text-normal,#dadada)"
                          : "var(--obs-text-muted,#b3b3b3)",
                      }}
                    >
                      {tab.title}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="min-w-0 flex-1 overflow-auto bg-[var(--obs-bg-primary,#1e1e1e)]">
                      {tab.resourceId === null && renderEmptyTab
                        ? renderEmptyTab(group, tab)
                        : renderTabContent(tab, group)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : activeTab ? (
          <div className="h-full min-h-0 w-full min-w-0 overflow-hidden">
            {activeTab.resourceId === null && renderEmptyTab
              ? renderEmptyTab(group, activeTab)
              : renderTabContent(activeTab, group)}
          </div>
        ) : null}

        {/* Obsidian Translucent 4-Way + Center Docking Overlay */}
        {dropZone && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-40 rounded-md border-2 border-[var(--obs-accent,#8a5cf5)] bg-[var(--obs-bg-drop-overlay,rgba(138,92,245,0.20))] transition-all duration-75"
            style={
              dropZone === "center"
                ? { inset: "8px" }
                : dropZone === "left"
                  ? { top: "8px", bottom: "8px", left: "8px", width: "48%" }
                  : dropZone === "right"
                    ? { top: "8px", bottom: "8px", right: "8px", width: "48%" }
                    : dropZone === "top"
                      ? { top: "8px", left: "8px", right: "8px", height: "48%" }
                      : { bottom: "8px", left: "8px", right: "8px", height: "48%" }
            }
          />
        )}
      </div>

      {/* Tab Right-Click Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[196px] rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-1 text-[12px] text-[var(--obs-text-normal,#dadada)] shadow-2xl"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 210),
            top: Math.min(contextMenu.y, window.innerHeight - 280),
          }}
        >
          <button
            type="button"
            disabled={contextMenu.tab.pinned}
            onClick={() => {
              store.getState().closeTab(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] disabled:opacity-35"
          >
            <X className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>Close</span>
          </button>
          <button
            type="button"
            onClick={() => {
              store.getState().closeOtherTabs(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <X className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>Close others</span>
          </button>
          <button
            type="button"
            onClick={() => {
              store.getState().closeTabsToRight(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <X className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>Close tabs to the right</span>
          </button>

          <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />

          <button
            type="button"
            onClick={() => {
              store.getState().splitTab(contextMenu.tab.id, "right", "duplicate");
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Columns2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>Split right</span>
          </button>
          <button
            type="button"
            onClick={() => {
              store.getState().splitTab(contextMenu.tab.id, "bottom", "duplicate");
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Rows2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>Split down</span>
          </button>
          <button
            type="button"
            onClick={() => {
              store.getState().duplicateTab(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Copy className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>Duplicate tab</span>
          </button>

          <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />

          {/* Chrome Tab Group Context Actions */}
          {contextMenu.tab.tabGroupId && tabGroups[contextMenu.tab.tabGroupId] ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (expandedTabGroup?.tabGroupId === contextMenu.tab.tabGroupId) {
                    store.getState().restoreExpandedTabGroup();
                  } else if (contextMenu.tab.tabGroupId) {
                    store.getState().expandTabGroup(contextMenu.tab.tabGroupId);
                  }
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                {expandedTabGroup?.tabGroupId === contextMenu.tab.tabGroupId ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                    <span>되돌리기 (원래 그룹 탭으로)</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                    <span>그룹 크게 보기</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  store.getState().removeTabFromTabGroup(contextMenu.tab.id);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <Ungroup className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                <span>그룹에서 빼기</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  store.getState().createTabGroupCollection([contextMenu.tab.id]);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              >
                <FolderPlus className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
                <span>새 그룹에 추가</span>
              </button>
              {Object.values(tabGroups).map((gMeta) => (
                <button
                  key={gMeta.id}
                  type="button"
                  onClick={() => {
                    store.getState().addTabToTabGroup(contextMenu.tab.id, gMeta.id);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TAB_GROUP_COLORS[gMeta.color].hex }}
                  />
                  <span className="truncate">"{gMeta.title}" 그룹에 추가</span>
                </button>
              ))}
            </>
          )}

          <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />

          <button
            type="button"
            onClick={() => {
              store.getState().togglePinTab(contextMenu.tab.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            {contextMenu.tab.pinned ? (
              <PinOff className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            ) : (
              <Pin className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            )}
            <span>{contextMenu.tab.pinned ? "Unpin" : "Pin"}</span>
          </button>
          {contextMenu.tab.tabGroupId && tabGroups[contextMenu.tab.tabGroupId] && (
            <button
              type="button"
              onClick={() => {
                if (contextMenu.tab.tabGroupId) {
                  store.getState().activateTab(group.id, contextMenu.tab.id);
                  store.getState().toggleTabGroupStacked(contextMenu.tab.tabGroupId);
                }
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            >
              <Layers className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
              <span>
                {tabGroups[contextMenu.tab.tabGroupId]?.stacked
                  ? "그룹 스택 보기 해제"
                  : "그룹 스택 보기"}
              </span>
            </button>
          )}

          {(() => {
            const viewOptions = getAvailableViewTypes?.(contextMenu.tab) ?? [];
            if (viewOptions.length <= 1) return null;
            return (
              <>
                <div className="my-1 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />
                <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
                  Open With...
                </div>
                {viewOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      store.getState().setTabViewType(contextMenu.tab.id, opt.id);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-[4px] px-2.5 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <span className="truncate">{opt.label}</span>
                    {contextMenu.tab.viewType === opt.id && (
                      <span className="text-[10px] font-semibold text-[var(--obs-accent,#8a5cf5)]">
                        Active
                      </span>
                    )}
                  </button>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* Chrome Tab Group Chip Popover (Rename, 8-Color Picker, Expand, Add Tab, Ungroup, Close) */}
      {groupMenu && activeGroupMenuMeta && (
        <div
          role="dialog"
          aria-label="Tab group settings"
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-[236px] rounded-lg border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-2.5 text-[12px] text-[var(--obs-text-normal,#dadada)] shadow-2xl"
          style={{
            left: Math.min(groupMenu.x, window.innerWidth - 250),
            top: Math.min(groupMenu.y + 8, window.innerHeight - 260),
          }}
        >
          <input
            type="text"
            value={activeGroupMenuMeta.title}
            onChange={(ev) =>
              store.getState().updateTabGroupMeta(activeGroupMenuMeta.id, {
                title: ev.target.value,
              })
            }
            onKeyDown={(ev) => {
              if (ev.key === "Enter") setGroupMenu(null);
            }}
            placeholder="그룹 이름 입력"
            autoFocus
            className="mb-2.5 w-full rounded-[5px] border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[12px] text-[var(--obs-text-normal,#dadada)] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
          />

          <div className="mb-2.5 flex items-center justify-between gap-1 px-0.5">
            {TAB_GROUP_COLOR_ORDER.map((colorKey) => {
              const c = TAB_GROUP_COLORS[colorKey];
              const selected = activeGroupMenuMeta.color === colorKey;
              return (
                <button
                  key={colorKey}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() =>
                    store.getState().updateTabGroupMeta(activeGroupMenuMeta.id, {
                      color: colorKey,
                    })
                  }
                  className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.hex,
                    boxShadow: selected ? "0 0 0 2px #1e1e1e, 0 0 0 3.5px #ffffff" : undefined,
                  }}
                />
              );
            })}
          </div>

          <div className="my-1.5 h-px bg-[var(--obs-border-subtle,#2d2d2d)]" />

          <button
            type="button"
            onClick={() => {
              if (expandedTabGroup?.tabGroupId === activeGroupMenuMeta.id) {
                store.getState().restoreExpandedTabGroup();
              } else {
                store.getState().expandTabGroup(activeGroupMenuMeta.id);
              }
              setGroupMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            {expandedTabGroup?.tabGroupId === activeGroupMenuMeta.id ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                <span>되돌리기 (원래 그룹 탭으로)</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
                <span>크게 보기 (전체 영역 확대)</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const firstMember = group.tabs.find((t) => t.tabGroupId === activeGroupMenuMeta.id);
              if (firstMember && activeTab?.tabGroupId !== activeGroupMenuMeta.id) {
                store.getState().activateTab(group.id, firstMember.id);
              }
              store.getState().toggleTabGroupStacked(activeGroupMenuMeta.id);
              setGroupMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Layers
              className="h-3.5 w-3.5"
              style={{
                color: activeGroupMenuMeta.stacked
                  ? TAB_GROUP_COLORS[activeGroupMenuMeta.color].hex
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            />
            <span>{activeGroupMenuMeta.stacked ? "스택 보기 해제" : "스택 보기 (이 그룹만)"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const created = store.getState().openNewEmptyTab(group.id);
              store.getState().addTabToTabGroup(created.tabId, activeGroupMenuMeta.id);
              setGroupMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Plus className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>그룹에 새 탭 추가</span>
          </button>
          <button
            type="button"
            onClick={() => {
              store.getState().ungroupTabGroup(activeGroupMenuMeta.id);
              setGroupMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Ungroup className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />
            <span>그룹 해제</span>
          </button>
          <button
            type="button"
            onClick={() => {
              store.getState().closeTabGroup(activeGroupMenuMeta.id);
              setGroupMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[var(--obs-danger,#fb464c)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <X className="h-3.5 w-3.5" />
            <span>그룹 닫기</span>
          </button>
        </div>
      )}
    </section>
  );
};

export const TabGroupPane = React.memo(TabGroupPaneImpl);
