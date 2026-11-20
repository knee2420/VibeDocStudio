export const VIBE_WORKSPACE_TAB_MIME = "application/x-vibe-workspace-tab";
export const VIBE_WORKSPACE_TAB_GROUP_MIME = "application/x-vibe-workspace-tab-group";

export type SplitDirection = "horizontal" | "vertical";
export type SplitEdge = "left" | "right" | "top" | "bottom";
export type DockDropZone = "center" | SplitEdge;
export type OpenResourceMode = "current" | "new-tab" | "split-right" | "split-down";

export type TabGroupColor =
  | "purple"
  | "blue"
  | "cyan"
  | "green"
  | "yellow"
  | "orange"
  | "pink"
  | "red";

export const TAB_GROUP_COLOR_ORDER: readonly TabGroupColor[] = [
  "purple",
  "blue",
  "cyan",
  "green",
  "yellow",
  "orange",
  "pink",
  "red",
];

export const TAB_GROUP_COLORS: Readonly<
  Record<TabGroupColor, { readonly hex: string; readonly bg: string; readonly label: string }>
> = {
  purple: { hex: "#8a5cf5", bg: "rgba(138,92,245,0.22)", label: "Purple" },
  blue: { hex: "#4ea1ff", bg: "rgba(78,161,255,0.22)", label: "Blue" },
  cyan: { hex: "#2dd4bf", bg: "rgba(45,212,191,0.22)", label: "Cyan" },
  green: { hex: "#4ade80", bg: "rgba(74,222,128,0.20)", label: "Green" },
  yellow: { hex: "#facc15", bg: "rgba(250,204,21,0.22)", label: "Yellow" },
  orange: { hex: "#fb923c", bg: "rgba(251,146,60,0.22)", label: "Orange" },
  pink: { hex: "#f472b6", bg: "rgba(244,114,182,0.22)", label: "Pink" },
  red: { hex: "#f87171", bg: "rgba(248,113,113,0.22)", label: "Red" },
};

/** Chrome-style colored Tab Group metadata inside the workspace. */
export interface TabGroupMeta {
  readonly id: string;
  readonly title: string;
  readonly color: TabGroupColor;
  readonly collapsed: boolean;
  /** Group-scoped Obsidian Stacked Tabs mode (only tabs in this group render as vertical spines). */
  readonly stacked?: boolean;
}

/** Snapshot saved when expanding a Chrome Tab Group into full-workspace split focus ("크게 보기"). */
export interface ExpandedTabGroupState {
  readonly tabGroupId: string;
  readonly originPaneId: string;
  readonly savedRoot: LayoutNode;
  readonly savedActiveGroupId: string;
}

export interface TabHistoryEntry {
  readonly resourceId: string | null;
  readonly title: string;
  readonly viewType: string;
}

export interface WorkspaceTab {
  readonly id: string;
  readonly resourceId: string | null;
  readonly title: string;
  readonly viewType: string;
  readonly pinned: boolean;
  readonly dirty?: boolean;
  /** Chrome-style colored tab group id (optional). */
  readonly tabGroupId?: string;
  readonly history: readonly TabHistoryEntry[];
  readonly historyIndex: number;
}

export interface TabGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string | null;
}

export interface SplitNode {
  readonly kind: "split";
  readonly id: string;
  readonly direction: SplitDirection;
  readonly sizes: readonly number[];
  readonly children: readonly LayoutNode[];
}

export type LayoutNode = TabGroupNode | SplitNode;

export interface ClosedTabSnapshot {
  readonly resourceId: string | null;
  readonly title: string;
  readonly viewType: string;
  readonly groupId: string;
}

export interface OpenResourceInput {
  readonly resourceId: string;
  readonly title: string;
  readonly viewType: string;
  readonly mode?: OpenResourceMode;
  readonly groupId?: string;
}

export interface WorkspaceLayoutSnapshot {
  readonly version: 1;
  readonly root: LayoutNode;
  readonly activeGroupId: string;
  readonly tabGroups?: Readonly<Record<string, TabGroupMeta>>;
  readonly expandedTabGroup?: ExpandedTabGroupState | null;
}

export interface CreateWorkspaceLayoutOptions {
  readonly initialSnapshot?: WorkspaceLayoutSnapshot;
  readonly storageKey?: string;
  /** Debounce interval (ms) for localStorage persistence. Defaults to 250ms; pass 0 for synchronous writes. */
  readonly persistDebounceMs?: number;
  readonly maxClosedHistory?: number;
}

export interface WorkspaceLayoutState {
  readonly root: LayoutNode;
  readonly activeGroupId: string;
  readonly closedTabs: readonly ClosedTabSnapshot[];
  readonly tabGroups: Readonly<Record<string, TabGroupMeta>>;
  readonly expandedTabGroup: ExpandedTabGroupState | null;

  getActiveGroup(): TabGroupNode | null;
  getActiveTab(): WorkspaceTab | null;
  getGroupCount(): number;

  setActiveGroup(groupId: string): void;
  activateTab(groupId: string, tabId: string): void;
  cycleTab(direction: "next" | "prev", groupId?: string): void;

  openResource(input: OpenResourceInput): { groupId: string; tabId: string };
  openNewEmptyTab(groupId?: string): { groupId: string; tabId: string };

  closeTab(tabId: string, options?: { force?: boolean }): void;
  closeOtherTabs(tabId: string): void;
  closeTabsToRight(tabId: string): void;
  closeAllTabs(groupId: string, options?: { force?: boolean }): void;
  reopenClosedTab(): { groupId: string; tabId: string } | null;

  togglePinTab(tabId: string): void;
  duplicateTab(tabId: string): { groupId: string; tabId: string } | null;
  setTabViewType(tabId: string, viewType: string): void;
  setTabDirty(resourceId: string, dirty: boolean): void;

  navigateBack(tabId: string): boolean;
  navigateForward(tabId: string): boolean;

  splitTab(
    tabId: string,
    edge: SplitEdge,
    mode?: "move" | "duplicate"
  ): { groupId: string; tabId: string } | null;
  moveTabToGroup(
    tabId: string,
    targetGroupId: string,
    targetIndex?: number,
    options?: { readonly targetTabGroupId?: string | null }
  ): void;
  dockTab(tabId: string, targetGroupId: string, zone: DockDropZone, targetIndex?: number): void;
  dockResource(
    input: { resourceId: string; title: string; viewType: string },
    targetGroupId: string,
    zone: DockDropZone,
    targetIndex?: number
  ): { groupId: string; tabId: string };

  resizeSplit(splitId: string, boundaryIndex: number, deltaPercent: number, minPercent?: number): void;

  syncResourceRenamed(
    oldResourceId: string,
    newResourceId: string,
    newTitle: string,
    newViewType?: string
  ): void;
  syncResourceDeleted(deletedResourceIds: readonly string[]): void;

  /* Chrome-style Tab Groups + "크게 보기" / "되돌리기" Focus Expand */
  createTabGroupCollection(
    tabIds: readonly string[],
    options?: { title?: string; color?: TabGroupColor }
  ): string | null;
  addTabToTabGroup(tabId: string, tabGroupId: string): void;
  removeTabFromTabGroup(tabId: string): void;
  mergeTabsIntoGroup(sourceTabId: string, targetTabId: string): string | null;
  moveTabGroupCollection(tabGroupId: string, targetPaneId: string, targetIndex?: number): void;
  mergeTabGroups(sourceTabGroupId: string, targetTabGroupId: string): void;
  dockTabGroupCollection(tabGroupId: string, targetPaneId: string, zone: DockDropZone): void;
  updateTabGroupMeta(
    tabGroupId: string,
    patch: Partial<Pick<TabGroupMeta, "title" | "color" | "collapsed" | "stacked">>
  ): void;
  toggleTabGroupCollapsed(tabGroupId: string): void;
  toggleTabGroupStacked(tabGroupId: string): void;
  ungroupTabGroup(tabGroupId: string): void;
  closeTabGroup(tabGroupId: string, options?: { force?: boolean }): void;
  expandTabGroup(tabGroupId: string): void;
  restoreExpandedTabGroup(): void;
  toggleExpandTabGroup(tabGroupId?: string): void;

  serializeLayout(): WorkspaceLayoutSnapshot;
  restoreLayout(snapshot: WorkspaceLayoutSnapshot): void;
  flushPersistence(): void;
  dispose(): void;
}
