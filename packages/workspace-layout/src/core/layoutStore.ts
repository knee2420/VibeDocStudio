import { createStore, type StoreApi } from "zustand/vanilla";

import {
  createEmptyTab,
  createResourceTab,
  createTabGroup,
  findGroup,
  findTabLocation,
  getAllGroups,
  mapGroups,
  nextLayoutId,
  normalizeLayoutTree,
  pruneUnusedTabGroups,
  reconcileTabGroupPairs,
  resizeSplitInTree,
  sortPinnedTabsFirst,
  splitGroupInTree,
} from "./layoutTree";
import {
  TAB_GROUP_COLOR_ORDER,
  type ClosedTabSnapshot,
  type CreateWorkspaceLayoutOptions,
  type ExpandedTabGroupState,
  type LayoutNode,
  type TabGroupMeta,
  type TabGroupNode,
  type TabGroupPairState,
  type WorkspaceLayoutSnapshot,
  type WorkspaceLayoutState,
  type WorkspaceTab,
} from "./types";

function mergeExpandedIntoSavedRoot(
  expandedRoot: LayoutNode,
  expanded: ExpandedTabGroupState,
  activeExpandedTabId: string | null
): { root: LayoutNode; activeGroupId: string } {
  const liveTabs: WorkspaceTab[] = [];
  const seenIds = new Set<string>();
  for (const pane of getAllGroups(expandedRoot)) {
    for (const tab of pane.tabs) {
      if (seenIds.has(tab.id)) continue;
      seenIds.add(tab.id);
      liveTabs.push({ ...tab, tabGroupId: expanded.tabGroupId });
    }
  }

  const savedGroups = getAllGroups(expanded.savedRoot);
  const targetPaneId = savedGroups.some((g) => g.id === expanded.originPaneId)
    ? expanded.originPaneId
    : savedGroups[0]?.id;

  if (!targetPaneId) {
    const fallbackPane = createTabGroup(liveTabs.length > 0 ? liveTabs : [createEmptyTab()]);
    return { root: fallbackPane, activeGroupId: fallbackPane.id };
  }

  const restoredRoot = mapGroups(expanded.savedRoot, (pane) => {
    const firstGroupIdx = pane.tabs.findIndex(
      (t) => t.tabGroupId === expanded.tabGroupId
    );
    const withoutOldGroup = pane.tabs.filter(
      (t) => t.tabGroupId !== expanded.tabGroupId
    );

    if (pane.id !== targetPaneId) {
      return withoutOldGroup.length === pane.tabs.length
        ? pane
        : {
          ...pane,
          tabs: withoutOldGroup,
          activeTabId: withoutOldGroup.some((t) => t.id === pane.activeTabId)
            ? pane.activeTabId
            : (withoutOldGroup[0]?.id ?? null),
        };
    }

    const insertAt = firstGroupIdx === -1 ? withoutOldGroup.length : firstGroupIdx;
    const merged = [...withoutOldGroup];
    merged.splice(Math.min(insertAt, merged.length), 0, ...liveTabs);
    const sorted = sortPinnedTabsFirst(merged);
    const nextActiveTabId =
      (activeExpandedTabId && sorted.some((t) => t.id === activeExpandedTabId)
        ? activeExpandedTabId
        : liveTabs[0]?.id) ??
      sorted[0]?.id ??
      null;

    return {
      ...pane,
      tabs: sorted,
      activeTabId: nextActiveTabId,
    };
  });

  return {
    root: normalizeLayoutTree(restoredRoot),
    activeGroupId: targetPaneId,
  };
}

function tryLoadSnapshot(storageKey: string): WorkspaceLayoutSnapshot | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    const raw = globalThis.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayoutSnapshot>;
    if (parsed.version !== 1 || !parsed.root || !parsed.activeGroupId) return null;
    return parsed as WorkspaceLayoutSnapshot;
  } catch {
    return null;
  }
}

function trySaveSnapshot(storageKey: string, snapshot: WorkspaceLayoutSnapshot): void {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors cleanly
  }
}

export type WorkspaceLayoutStore = StoreApi<WorkspaceLayoutState>;

export function createWorkspaceLayoutStore(
  options: CreateWorkspaceLayoutOptions = {}
): WorkspaceLayoutStore {
  const maxClosed = options.maxClosedHistory ?? 30;
  const storageKey = options.storageKey;
  const persistDebounceMs = options.persistDebounceMs ?? 250;

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: WorkspaceLayoutSnapshot | null = null;

  const flushPersistNow = () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (storageKey && pendingSnapshot) {
      const snap = pendingSnapshot;
      pendingSnapshot = null;
      trySaveSnapshot(storageKey, snap);
    }
  };

  const schedulePersist = (snapshot: WorkspaceLayoutSnapshot) => {
    if (!storageKey) return;
    pendingSnapshot = snapshot;
    if (persistDebounceMs <= 0) {
      flushPersistNow();
      return;
    }
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      flushPersistNow();
    }, persistDebounceMs);
  };

  const handleBeforeUnload = () => {
    flushPersistNow();
  };
  if (storageKey && typeof globalThis.window !== "undefined") {
    globalThis.window.addEventListener("beforeunload", handleBeforeUnload);
    globalThis.window.addEventListener("pagehide", handleBeforeUnload);
  }

  const persisted = storageKey ? tryLoadSnapshot(storageKey) : null;
  const seed = persisted ?? options.initialSnapshot;

  // Never boot trapped in transient expanded mode ("되돌리기"): auto-unwrap legacy snapshots cleanly.
  const unwrappedSeed =
    seed?.expandedTabGroup && seed.root
      ? mergeExpandedIntoSavedRoot(seed.root, seed.expandedTabGroup, null)
      : null;

  const initialRoot: LayoutNode = unwrappedSeed
    ? unwrappedSeed.root
    : seed
      ? normalizeLayoutTree(seed.root)
      : createTabGroup([createEmptyTab()]);
  const initialGroups = getAllGroups(initialRoot);
  const candidateInitialActive = unwrappedSeed?.activeGroupId ?? seed?.activeGroupId;
  const initialActiveGroupId =
    candidateInitialActive && findGroup(initialRoot, candidateInitialActive)
      ? candidateInitialActive
      : initialGroups[0].id;
  const initialExpanded: ExpandedTabGroupState | null = null;
  const initialTabGroups: Readonly<Record<string, TabGroupMeta>> = reconcileTabGroupPairs(
    initialRoot,
    pruneUnusedTabGroups(initialRoot, seed?.tabGroups ?? {}, initialExpanded)
  );

  // Per-group MRU tab history so Pair View defaults to [activeTab, previouslyViewedGroupTab]
  const groupMruMap = new Map<string, string[]>();
  const recordGroupMru = (tabGroupId: string | undefined, tabId: string) => {
    if (!tabGroupId) return;
    const prev = groupMruMap.get(tabGroupId) ?? [];
    groupMruMap.set(
      tabGroupId,
      [tabId, ...prev.filter((id) => id !== tabId)].slice(0, 16)
    );
  };

  const store = createStore<WorkspaceLayoutState>((set, get) => {
    const commit = (
      nextRootRaw: LayoutNode,
      preferredActiveGroupId?: string,
      closedTabs?: readonly ClosedTabSnapshot[],
      tabGroupsOverride?: Readonly<Record<string, TabGroupMeta>>,
      expandedOverride?: ExpandedTabGroupState | null
    ) => {
      const nextRoot = normalizeLayoutTree(nextRootRaw);
      const groups = getAllGroups(nextRoot);
      const candidateGroupId = preferredActiveGroupId ?? get().activeGroupId;
      const activeGroupId = groups.some((g) => g.id === candidateGroupId)
        ? candidateGroupId
        : groups[0].id;
      const nextExpanded =
        expandedOverride !== undefined ? expandedOverride : get().expandedTabGroup;
      const prunedTabGroups = pruneUnusedTabGroups(
        nextRoot,
        tabGroupsOverride !== undefined ? tabGroupsOverride : get().tabGroups,
        nextExpanded
      );
      const nextTabGroups = reconcileTabGroupPairs(nextRoot, prunedTabGroups);

      set({
        root: nextRoot,
        activeGroupId,
        tabGroups: nextTabGroups,
        expandedTabGroup: nextExpanded,
        ...(closedTabs !== undefined ? { closedTabs } : {}),
      });

      if (storageKey) {
        // Persist base (non-expanded) layout so refreshing never traps the user in "되돌리기" mode
        const persistBase = nextExpanded
          ? mergeExpandedIntoSavedRoot(nextRoot, nextExpanded, null)
          : { root: nextRoot, activeGroupId };
        schedulePersist({
          version: 1,
          root: persistBase.root,
          activeGroupId: persistBase.activeGroupId,
          tabGroups: nextTabGroups,
          expandedTabGroup: null,
        });
      }
    };

    const pushClosed = (tabs: readonly WorkspaceTab[], groupId: string): ClosedTabSnapshot[] => {
      const additions = tabs
        .filter((t) => t.resourceId !== null)
        .map((t) => ({
          resourceId: t.resourceId,
          title: t.title,
          viewType: t.viewType,
          groupId,
        }));
      if (additions.length === 0) return [...get().closedTabs];
      return [...additions.reverse(), ...get().closedTabs].slice(0, maxClosed);
    };

    return {
      root: initialRoot,
      activeGroupId: initialActiveGroupId,
      closedTabs: [],
      tabGroups: initialTabGroups,
      expandedTabGroup: initialExpanded,

      getActiveGroup() {
        const { root, activeGroupId } = get();
        return findGroup(root, activeGroupId) ?? getAllGroups(root)[0] ?? null;
      },

      getActiveTab() {
        const group = get().getActiveGroup();
        if (!group) return null;
        return group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0] ?? null;
      },

      getGroupCount() {
        return getAllGroups(get().root).length;
      },

      setActiveGroup(groupId) {
        if (!findGroup(get().root, groupId)) return;
        set({ activeGroupId: groupId });
      },

      activateTab(groupId, tabId) {
        let activatedGroupId: string | undefined;
        const nextRoot = mapGroups(get().root, (g) => {
          if (g.id !== groupId) return g;
          const target = g.tabs.find((t) => t.id === tabId);
          if (!target) return g;
          activatedGroupId = target.tabGroupId;
          return { ...g, activeTabId: tabId };
        });

        recordGroupMru(activatedGroupId, tabId);

        let nextTabGroups: Record<string, TabGroupMeta> | undefined;
        const curMeta = activatedGroupId ? get().tabGroups[activatedGroupId] : undefined;
        if (activatedGroupId && curMeta) {
          let updatedMeta = curMeta;
          let metaChanged = false;
          if (updatedMeta.collapsed) {
            updatedMeta = { ...updatedMeta, collapsed: false };
            metaChanged = true;
          }
          if (updatedMeta.pair) {
            const p = updatedMeta.pair;
            if (tabId === p.leftTabId) {
              if (p.activeSide !== "left") {
                updatedMeta = { ...updatedMeta, pair: { ...p, activeSide: "left" } };
                metaChanged = true;
              }
            } else if (tabId === p.rightTabId) {
              if (p.activeSide !== "right") {
                updatedMeta = { ...updatedMeta, pair: { ...p, activeSide: "right" } };
                metaChanged = true;
              }
            } else {
              // Clicking another member tab in a 3+ tab group loads it into the currently focused pair side
              const nextPair: TabGroupPairState =
                p.activeSide === "right"
                  ? { ...p, rightTabId: tabId, activeSide: "right" }
                  : { ...p, leftTabId: tabId, activeSide: "left" };
              updatedMeta = { ...updatedMeta, pair: nextPair };
              metaChanged = true;
            }
          }
          if (metaChanged) {
            nextTabGroups = {
              ...get().tabGroups,
              [activatedGroupId]: updatedMeta,
            };
          }
        }
        commit(nextRoot, groupId, undefined, nextTabGroups);
      },

      cycleTab(direction, explicitGroupId) {
        const groupId = explicitGroupId ?? get().activeGroupId;
        const group = findGroup(get().root, groupId);
        if (!group || group.tabs.length <= 1) return;
        const curIdx = group.tabs.findIndex((t) => t.id === group.activeTabId);
        const baseIdx = curIdx === -1 ? 0 : curIdx;
        const nextIdx =
          direction === "next"
            ? (baseIdx + 1) % group.tabs.length
            : (baseIdx - 1 + group.tabs.length) % group.tabs.length;
        get().activateTab(group.id, group.tabs[nextIdx].id);
      },

      openResource(input) {
        const { root, activeGroupId, expandedTabGroup } = get();
        const mode = input.mode ?? "current";
        const inheritedTabGroupId = expandedTabGroup?.tabGroupId;
        const targetGroup =
          (input.groupId ? findGroup(root, input.groupId) : null) ??
          findGroup(root, activeGroupId) ??
          getAllGroups(root)[0];

        if (mode === "split-right" || mode === "split-down") {
          const baseTab = createResourceTab(input.resourceId, input.title, input.viewType);
          const newTab: WorkspaceTab = inheritedTabGroupId
            ? { ...baseTab, tabGroupId: inheritedTabGroupId }
            : baseTab;
          const newGroup = createTabGroup([newTab]);
          const edge = mode === "split-right" ? "right" : "bottom";
          const nextRoot = splitGroupInTree(root, targetGroup.id, edge, newGroup);
          recordGroupMru(newTab.tabGroupId, newTab.id);
          commit(nextRoot, newGroup.id);
          return { groupId: newGroup.id, tabId: newTab.id };
        }

        if (mode === "new-tab") {
          const baseTab = createResourceTab(input.resourceId, input.title, input.viewType);
          const newTab: WorkspaceTab = inheritedTabGroupId
            ? { ...baseTab, tabGroupId: inheritedTabGroupId }
            : baseTab;
          const nextRoot = mapGroups(root, (g) => {
            if (g.id !== targetGroup.id) return g;
            return {
              ...g,
              tabs: sortPinnedTabsFirst([...g.tabs, newTab]),
              activeTabId: newTab.id,
            };
          });
          recordGroupMru(newTab.tabGroupId, newTab.id);
          commit(nextRoot, targetGroup.id);
          return { groupId: targetGroup.id, tabId: newTab.id };
        }

        // mode === "current" (Obsidian behavior):
        // 1) If already open in target group, focus it.
        const existingInGroup = targetGroup.tabs.find((t) => t.resourceId === input.resourceId);
        if (existingInGroup) {
          get().activateTab(targetGroup.id, existingInGroup.id);
          return { groupId: targetGroup.id, tabId: existingInGroup.id };
        }

        // 2) Active tab is unpinned -> navigate in-place and append to its per-tab history.
        const activeTab =
          targetGroup.tabs.find((t) => t.id === targetGroup.activeTabId) ?? targetGroup.tabs[0];
        if (activeTab && !activeTab.pinned) {
          const truncatedHistory =
            activeTab.resourceId === null
              ? []
              : activeTab.history.slice(0, activeTab.historyIndex + 1);
          const nextHistory = [
            ...truncatedHistory,
            { resourceId: input.resourceId, title: input.title, viewType: input.viewType },
          ];
          const updatedTab: WorkspaceTab = {
            ...activeTab,
            resourceId: input.resourceId,
            title: input.title,
            viewType: input.viewType,
            dirty: false,
            history: nextHistory,
            historyIndex: nextHistory.length - 1,
          };
          const nextRoot = mapGroups(root, (g) => {
            if (g.id !== targetGroup.id) return g;
            return {
              ...g,
              tabs: g.tabs.map((t) => (t.id === activeTab.id ? updatedTab : t)),
              activeTabId: updatedTab.id,
            };
          });
          recordGroupMru(updatedTab.tabGroupId, updatedTab.id);
          commit(nextRoot, targetGroup.id);
          return { groupId: targetGroup.id, tabId: updatedTab.id };
        }

        // 3) Active tab is pinned -> find an unpinned tab or open a new tab (never overwrite pinned!)
        const baseTab = createResourceTab(input.resourceId, input.title, input.viewType);
        const newTab: WorkspaceTab = inheritedTabGroupId
          ? { ...baseTab, tabGroupId: inheritedTabGroupId }
          : baseTab;
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== targetGroup.id) return g;
          return {
            ...g,
            tabs: sortPinnedTabsFirst([...g.tabs, newTab]),
            activeTabId: newTab.id,
          };
        });
        recordGroupMru(newTab.tabGroupId, newTab.id);
        commit(nextRoot, targetGroup.id);
        return { groupId: targetGroup.id, tabId: newTab.id };
      },

      openNewEmptyTab(explicitGroupId) {
        const { root, activeGroupId, expandedTabGroup } = get();
        const targetGroup =
          (explicitGroupId ? findGroup(root, explicitGroupId) : null) ??
          findGroup(root, activeGroupId) ??
          getAllGroups(root)[0];
        const baseTab = createEmptyTab();
        const tab: WorkspaceTab = expandedTabGroup
          ? { ...baseTab, tabGroupId: expandedTabGroup.tabGroupId }
          : baseTab;
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== targetGroup.id) return g;
          return {
            ...g,
            tabs: sortPinnedTabsFirst([...g.tabs, tab]),
            activeTabId: tab.id,
          };
        });
        recordGroupMru(tab.tabGroupId, tab.id);
        commit(nextRoot, targetGroup.id);
        return { groupId: targetGroup.id, tabId: tab.id };
      },

      closeTab(tabId, opts) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc) return;
        if (loc.tab.pinned && !opts?.force) return;

        const nextClosed = pushClosed([loc.tab], loc.group.id);
        const remainingTabs = loc.group.tabs.filter((t) => t.id !== tabId);

        let nextActiveTabId = loc.group.activeTabId;
        if (loc.group.activeTabId === tabId) {
          const fallback = remainingTabs[Math.min(loc.index, remainingTabs.length - 1)] ?? null;
          nextActiveTabId = fallback?.id ?? null;
        }

        const totalGroups = getAllGroups(root).length;
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== loc.group.id) return g;
          if (remainingTabs.length === 0 && totalGroups === 1) {
            const freshEmpty = createEmptyTab();
            return { ...g, tabs: [freshEmpty], activeTabId: freshEmpty.id };
          }
          return { ...g, tabs: remainingTabs, activeTabId: nextActiveTabId };
        });

        commit(nextRoot, loc.group.id, nextClosed);
      },

      closeOtherTabs(tabId) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc) return;
        const toClose = loc.group.tabs.filter((t) => t.id !== tabId && !t.pinned);
        const kept = loc.group.tabs.filter((t) => t.id === tabId || t.pinned);
        const nextClosed = pushClosed(toClose, loc.group.id);
        const nextRoot = mapGroups(root, (g) =>
          g.id === loc.group.id ? { ...g, tabs: kept, activeTabId: tabId } : g
        );
        commit(nextRoot, loc.group.id, nextClosed);
      },

      closeTabsToRight(tabId) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc) return;
        const toClose: WorkspaceTab[] = [];
        const kept: WorkspaceTab[] = [];
        loc.group.tabs.forEach((t, idx) => {
          if (idx > loc.index && !t.pinned) {
            toClose.push(t);
          } else {
            kept.push(t);
          }
        });
        const nextClosed = pushClosed(toClose, loc.group.id);
        const activeStillThere = kept.some((t) => t.id === loc.group.activeTabId);
        const nextRoot = mapGroups(root, (g) =>
          g.id === loc.group.id
            ? { ...g, tabs: kept, activeTabId: activeStillThere ? g.activeTabId : tabId }
            : g
        );
        commit(nextRoot, loc.group.id, nextClosed);
      },

      closeAllTabs(groupId, opts) {
        const { root } = get();
        const group = findGroup(root, groupId);
        if (!group) return;
        const toClose = opts?.force ? group.tabs : group.tabs.filter((t) => !t.pinned);
        const kept = opts?.force ? [] : group.tabs.filter((t) => t.pinned);
        const nextClosed = pushClosed(toClose, group.id);
        const totalGroups = getAllGroups(root).length;

        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== group.id) return g;
          if (kept.length === 0 && totalGroups === 1) {
            const empty = createEmptyTab();
            return { ...g, tabs: [empty], activeTabId: empty.id };
          }
          return { ...g, tabs: kept, activeTabId: kept[0]?.id ?? null };
        });
        commit(nextRoot, group.id, nextClosed);
      },

      reopenClosedTab() {
        const { closedTabs, root, activeGroupId } = get();
        if (closedTabs.length === 0) return null;
        const [latest, ...rest] = closedTabs;
        const targetGroupId = findGroup(root, latest.groupId) ? latest.groupId : activeGroupId;
        set({ closedTabs: rest });
        if (!latest.resourceId) {
          return get().openNewEmptyTab(targetGroupId);
        }
        return get().openResource({
          resourceId: latest.resourceId,
          title: latest.title,
          viewType: latest.viewType,
          mode: "new-tab",
          groupId: targetGroupId,
        });
      },

      togglePinTab(tabId) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc) return;
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== loc.group.id) return g;
          const toggled = g.tabs.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t));
          return { ...g, tabs: sortPinnedTabsFirst(toggled) };
        });
        commit(nextRoot, loc.group.id);
      },

      duplicateTab(tabId) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc) return null;
        const clone: WorkspaceTab = {
          ...loc.tab,
          id: nextLayoutId("tab"),
          pinned: false,
          history: [...loc.tab.history],
        };
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== loc.group.id) return g;
          const nextTabs = [...g.tabs];
          nextTabs.splice(loc.index + 1, 0, clone);
          return {
            ...g,
            tabs: sortPinnedTabsFirst(nextTabs),
            activeTabId: clone.id,
          };
        });
        commit(nextRoot, loc.group.id);
        return { groupId: loc.group.id, tabId: clone.id };
      },

      setTabViewType(tabId, viewType) {
        const loc = findTabLocation(get().root, tabId);
        if (!loc || loc.tab.viewType === viewType) return;
        const nextRoot = mapGroups(get().root, (g) => {
          if (g.id !== loc.group.id) return g;
          return {
            ...g,
            tabs: g.tabs.map((t) => {
              if (t.id !== tabId) return t;
              const nextHistory = t.history.map((entry, idx) =>
                idx === t.historyIndex ? { ...entry, viewType } : entry
              );
              return { ...t, viewType, history: nextHistory };
            }),
          };
        });
        commit(nextRoot, loc.group.id);
      },

      setTabDirty(resourceId, dirty) {
        const nextRoot = mapGroups(get().root, (g) => {
          let changed = false;
          const nextTabs = g.tabs.map((t) => {
            if (t.resourceId !== resourceId || Boolean(t.dirty) === dirty) return t;
            changed = true;
            return { ...t, dirty };
          });
          return changed ? { ...g, tabs: nextTabs } : g;
        });
        commit(nextRoot);
      },

      navigateBack(tabId) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc || loc.tab.historyIndex <= 0) return false;
        const nextIndex = loc.tab.historyIndex - 1;
        const targetEntry = loc.tab.history[nextIndex];
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== loc.group.id) return g;
          return {
            ...g,
            tabs: g.tabs.map((t) =>
              t.id === tabId
                ? {
                  ...t,
                  resourceId: targetEntry.resourceId,
                  title: targetEntry.title,
                  viewType: targetEntry.viewType,
                  historyIndex: nextIndex,
                }
                : t
            ),
          };
        });
        commit(nextRoot, loc.group.id);
        return true;
      },

      navigateForward(tabId) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc || loc.tab.historyIndex >= loc.tab.history.length - 1) return false;
        const nextIndex = loc.tab.historyIndex + 1;
        const targetEntry = loc.tab.history[nextIndex];
        const nextRoot = mapGroups(root, (g) => {
          if (g.id !== loc.group.id) return g;
          return {
            ...g,
            tabs: g.tabs.map((t) =>
              t.id === tabId
                ? {
                  ...t,
                  resourceId: targetEntry.resourceId,
                  title: targetEntry.title,
                  viewType: targetEntry.viewType,
                  historyIndex: nextIndex,
                }
                : t
            ),
          };
        });
        commit(nextRoot, loc.group.id);
        return true;
      },

      splitTab(tabId, edge, mode = "duplicate") {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        if (!loc) return null;

        if (mode === "move" && loc.group.tabs.length === 1) {
          // Cannot move the sole tab of a group to split itself; duplicate instead
          mode = "duplicate";
        }

        const newTab: WorkspaceTab =
          mode === "move"
            ? loc.tab
            : {
              ...loc.tab,
              id: nextLayoutId("tab"),
              pinned: false,
              history: [...loc.tab.history],
            };

        let intermediateRoot = root;
        if (mode === "move") {
          intermediateRoot = mapGroups(root, (g) => {
            if (g.id !== loc.group.id) return g;
            const remaining = g.tabs.filter((t) => t.id !== tabId);
            const fallback = remaining[Math.min(loc.index, remaining.length - 1)] ?? null;
            return {
              ...g,
              tabs: remaining,
              activeTabId: g.activeTabId === tabId ? (fallback?.id ?? null) : g.activeTabId,
            };
          });
        }

        const newGroup = createTabGroup([newTab]);
        const nextRoot = splitGroupInTree(intermediateRoot, loc.group.id, edge, newGroup);
        commit(nextRoot, newGroup.id);
        return { groupId: newGroup.id, tabId: newTab.id };
      },

      moveTabToGroup(tabId, targetGroupId, targetIndex, options) {
        const { root, tabGroups } = get();
        const loc = findTabLocation(root, tabId);
        const targetGroup = findGroup(root, targetGroupId);
        if (!loc || !targetGroup) return;

        let resolvedTabGroupId: string | undefined = loc.tab.tabGroupId;
        if (options && "targetTabGroupId" in options) {
          if (options.targetTabGroupId === null) {
            resolvedTabGroupId = undefined;
          } else if (options.targetTabGroupId && tabGroups[options.targetTabGroupId]) {
            resolvedTabGroupId = options.targetTabGroupId;
          }
        }

        const movedTab: WorkspaceTab =
          resolvedTabGroupId === loc.tab.tabGroupId
            ? loc.tab
            : { ...loc.tab, tabGroupId: resolvedTabGroupId };

        const nextTabGroups: Record<string, TabGroupMeta> | undefined =
          resolvedTabGroupId && tabGroups[resolvedTabGroupId]?.collapsed
            ? {
              ...tabGroups,
              [resolvedTabGroupId]: {
                ...tabGroups[resolvedTabGroupId],
                collapsed: false,
              },
            }
            : undefined;

        // Reorder within same group
        if (loc.group.id === targetGroup.id) {
          const nextTabs = loc.group.tabs.filter((t) => t.id !== tabId);
          const rawIdx = targetIndex === undefined ? nextTabs.length : targetIndex;
          const adjustedIdx =
            targetIndex !== undefined && loc.index < targetIndex ? rawIdx - 1 : rawIdx;
          const clampedIdx = Math.max(0, Math.min(nextTabs.length, adjustedIdx));
          nextTabs.splice(clampedIdx, 0, movedTab);
          const ordered = sortPinnedTabsFirst(nextTabs);
          const nextRoot = mapGroups(root, (g) =>
            g.id === loc.group.id ? { ...g, tabs: ordered, activeTabId: tabId } : g
          );
          commit(nextRoot, loc.group.id, undefined, nextTabGroups);
          return;
        }

        // Move across different groups
        const nextRoot = mapGroups(root, (g) => {
          if (g.id === loc.group.id) {
            const remaining = g.tabs.filter((t) => t.id !== tabId);
            const fallback = remaining[Math.min(loc.index, remaining.length - 1)] ?? null;
            return {
              ...g,
              tabs: remaining,
              activeTabId: g.activeTabId === tabId ? (fallback?.id ?? null) : g.activeTabId,
            };
          }
          if (g.id === targetGroup.id) {
            const nextTabs = [...g.tabs];
            const rawIdx = targetIndex === undefined ? nextTabs.length : targetIndex;
            const clampedIdx = Math.max(0, Math.min(nextTabs.length, rawIdx));
            nextTabs.splice(clampedIdx, 0, movedTab);
            return {
              ...g,
              tabs: sortPinnedTabsFirst(nextTabs),
              activeTabId: movedTab.id,
            };
          }
          return g;
        });
        commit(nextRoot, targetGroup.id, undefined, nextTabGroups);
      },

      dockTab(tabId, targetGroupId, zone, targetIndex) {
        const { root } = get();
        const loc = findTabLocation(root, tabId);
        const targetGroup = findGroup(root, targetGroupId);
        if (!loc || !targetGroup) return;

        if (zone === "center") {
          get().moveTabToGroup(tabId, targetGroupId, targetIndex);
          return;
        }

        // Dropping the only tab of a group onto its own edge is a no-op
        if (loc.group.id === targetGroup.id && loc.group.tabs.length === 1) {
          return;
        }

        const withoutSource = mapGroups(root, (g) => {
          if (g.id !== loc.group.id) return g;
          const remaining = g.tabs.filter((t) => t.id !== tabId);
          const fallback = remaining[Math.min(loc.index, remaining.length - 1)] ?? null;
          return {
            ...g,
            tabs: remaining,
            activeTabId: g.activeTabId === tabId ? (fallback?.id ?? null) : g.activeTabId,
          };
        });

        // Preserve tabGroupId when splitting a grouped tab (detach only via explicit ungroup / tab bar drop)
        const dockedTab: WorkspaceTab = loc.tab;
        const newGroup = createTabGroup([dockedTab]);
        const nextRoot = splitGroupInTree(withoutSource, targetGroup.id, zone, newGroup);
        commit(nextRoot, newGroup.id);
      },

      dockResource(input, targetGroupId, zone, targetIndex) {
        const { root, expandedTabGroup } = get();
        const targetGroup = findGroup(root, targetGroupId) ?? getAllGroups(root)[0];
        const inheritedTabGroupId = expandedTabGroup?.tabGroupId;

        if (zone === "center") {
          const existing = targetGroup.tabs.find((t) => t.resourceId === input.resourceId);
          if (existing) {
            get().activateTab(targetGroup.id, existing.id);
            return { groupId: targetGroup.id, tabId: existing.id };
          }
          const baseTab = createResourceTab(input.resourceId, input.title, input.viewType);
          const tab: WorkspaceTab = inheritedTabGroupId
            ? { ...baseTab, tabGroupId: inheritedTabGroupId }
            : baseTab;
          const nextRoot = mapGroups(root, (g) => {
            if (g.id !== targetGroup.id) return g;
            const nextTabs = [...g.tabs];
            const idx =
              targetIndex === undefined
                ? nextTabs.length
                : Math.max(0, Math.min(nextTabs.length, targetIndex));
            nextTabs.splice(idx, 0, tab);
            return {
              ...g,
              tabs: sortPinnedTabsFirst(nextTabs),
              activeTabId: tab.id,
            };
          });
          recordGroupMru(tab.tabGroupId, tab.id);
          commit(nextRoot, targetGroup.id);
          return { groupId: targetGroup.id, tabId: tab.id };
        }

        const baseTab = createResourceTab(input.resourceId, input.title, input.viewType);
        const tab: WorkspaceTab = inheritedTabGroupId
          ? { ...baseTab, tabGroupId: inheritedTabGroupId }
          : baseTab;
        const newGroup = createTabGroup([tab]);
        const nextRoot = splitGroupInTree(root, targetGroup.id, zone, newGroup);
        recordGroupMru(tab.tabGroupId, tab.id);
        commit(nextRoot, newGroup.id);
        return { groupId: newGroup.id, tabId: tab.id };
      },

      resizeSplit(splitId, boundaryIndex, deltaPercent, minPercent = 12) {
        const nextRoot = resizeSplitInTree(get().root, splitId, boundaryIndex, deltaPercent, minPercent);
        commit(nextRoot);
      },

      syncResourceRenamed(oldResourceId, newResourceId, newTitle, newViewType) {
        const applyRename = (node: LayoutNode): LayoutNode =>
          mapGroups(node, (g) => {
            let changed = false;
            const nextTabs = g.tabs.map((tab) => {
              let tabChanged = false;
              const nextHistory = tab.history.map((entry) => {
                if (entry.resourceId !== oldResourceId) return entry;
                tabChanged = true;
                return {
                  resourceId: newResourceId,
                  title: newTitle,
                  viewType: newViewType ?? entry.viewType,
                };
              });
              const matchesCurrent = tab.resourceId === oldResourceId;
              if (!matchesCurrent && !tabChanged) return tab;
              changed = true;
              return {
                ...tab,
                resourceId: matchesCurrent ? newResourceId : tab.resourceId,
                title: matchesCurrent ? newTitle : tab.title,
                viewType: matchesCurrent ? (newViewType ?? tab.viewType) : tab.viewType,
                history: nextHistory,
              };
            });
            return changed ? { ...g, tabs: nextTabs } : g;
          });

        const nextRoot = applyRename(get().root);
        const curExpanded = get().expandedTabGroup;
        const nextExpanded = curExpanded
          ? { ...curExpanded, savedRoot: applyRename(curExpanded.savedRoot) }
          : null;

        const nextClosed = get().closedTabs.map((item) =>
          item.resourceId === oldResourceId
            ? { ...item, resourceId: newResourceId, title: newTitle, viewType: newViewType ?? item.viewType }
            : item
        );

        commit(nextRoot, undefined, nextClosed, undefined, nextExpanded);
      },

      syncResourceDeleted(deletedResourceIds) {
        if (deletedResourceIds.length === 0) return;
        const deletedSet = new Set(deletedResourceIds);

        const applyDelete = (node: LayoutNode): LayoutNode => {
          const totalGroups = getAllGroups(node).length;
          return mapGroups(node, (g) => {
            const remaining = g.tabs.filter(
              (t) => t.resourceId === null || !deletedSet.has(t.resourceId)
            );
            if (remaining.length === g.tabs.length) return g;
            if (remaining.length === 0 && totalGroups === 1) {
              const empty = createEmptyTab();
              return { ...g, tabs: [empty], activeTabId: empty.id };
            }
            const activeStillThere = remaining.some((t) => t.id === g.activeTabId);
            return {
              ...g,
              tabs: remaining,
              activeTabId: activeStillThere ? g.activeTabId : (remaining[0]?.id ?? null),
            };
          });
        };

        const nextRoot = applyDelete(get().root);
        const curExpanded = get().expandedTabGroup;
        const nextExpanded = curExpanded
          ? { ...curExpanded, savedRoot: normalizeLayoutTree(applyDelete(curExpanded.savedRoot)) }
          : null;

        const nextClosed = get().closedTabs.filter(
          (item) => item.resourceId === null || !deletedSet.has(item.resourceId)
        );
        commit(nextRoot, undefined, nextClosed, undefined, nextExpanded);
      },

      /* ─── Chrome-style Tab Groups + "크게 보기" / "되돌리기" ─── */

      createTabGroupCollection(tabIds, options) {
        const idSet = new Set(tabIds);
        if (idSet.size === 0) return null;

        const existingCount = Object.keys(get().tabGroups).length;
        const groupId = nextLayoutId("tgrp");
        const color =
          options?.color ??
          TAB_GROUP_COLOR_ORDER[existingCount % TAB_GROUP_COLOR_ORDER.length];
        const title = options?.title?.trim() || `Group ${existingCount + 1}`;

        let matched = 0;
        const nextRoot = mapGroups(get().root, (g) => {
          let changed = false;
          const mapped = g.tabs.map((tab) => {
            if (!idSet.has(tab.id)) return tab;
            changed = true;
            matched += 1;
            return { ...tab, tabGroupId: groupId };
          });
          return changed ? { ...g, tabs: sortPinnedTabsFirst(mapped) } : g;
        });

        if (matched === 0) return null;

        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...get().tabGroups,
          [groupId]: { id: groupId, title, color, collapsed: false },
        };
        commit(nextRoot, undefined, undefined, nextTabGroups);
        return groupId;
      },

      addTabToTabGroup(tabId, tabGroupId) {
        const meta = get().tabGroups[tabGroupId];
        if (!meta) return;

        const nextRoot = mapGroups(get().root, (g) => {
          if (!g.tabs.some((t) => t.id === tabId)) return g;
          const mapped = g.tabs.map((t) =>
            t.id === tabId ? { ...t, tabGroupId } : t
          );
          return { ...g, tabs: sortPinnedTabsFirst(mapped) };
        });

        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...get().tabGroups,
          [tabGroupId]: { ...meta, collapsed: false },
        };
        commit(nextRoot, undefined, undefined, nextTabGroups);
      },

      removeTabFromTabGroup(tabId) {
        const nextRoot = mapGroups(get().root, (g) => {
          if (!g.tabs.some((t) => t.id === tabId && t.tabGroupId)) return g;
          const mapped = g.tabs.map((t) =>
            t.id === tabId ? { ...t, tabGroupId: undefined } : t
          );
          return { ...g, tabs: sortPinnedTabsFirst(mapped) };
        });
        commit(nextRoot);
      },

      mergeTabsIntoGroup(sourceTabId, targetTabId) {
        if (sourceTabId === targetTabId) return null;
        const { root, tabGroups, expandedTabGroup } = get();
        if (expandedTabGroup) return null;

        const sourceLoc = findTabLocation(root, sourceTabId);
        const targetLoc = findTabLocation(root, targetTabId);
        if (!sourceLoc || !targetLoc) return null;

        const targetGid =
          targetLoc.tab.tabGroupId && tabGroups[targetLoc.tab.tabGroupId]
            ? targetLoc.tab.tabGroupId
            : null;
        const sourceGid =
          sourceLoc.tab.tabGroupId && tabGroups[sourceLoc.tab.tabGroupId]
            ? sourceLoc.tab.tabGroupId
            : null;

        let chosenGid = targetGid ?? sourceGid;
        let nextTabGroups: Record<string, TabGroupMeta> = { ...tabGroups };

        if (!chosenGid) {
          const existingCount = Object.keys(tabGroups).length;
          chosenGid = nextLayoutId("tgrp");
          const color = TAB_GROUP_COLOR_ORDER[existingCount % TAB_GROUP_COLOR_ORDER.length];
          nextTabGroups[chosenGid] = {
            id: chosenGid,
            title: `Group ${existingCount + 1}`,
            color,
            collapsed: false,
          };
        } else if (nextTabGroups[chosenGid]?.collapsed) {
          nextTabGroups[chosenGid] = {
            ...nextTabGroups[chosenGid],
            collapsed: false,
          };
        }

        const mergedSourceTab: WorkspaceTab = { ...sourceLoc.tab, tabGroupId: chosenGid };

        const nextRoot = mapGroups(root, (g) => {
          const isSourcePane = g.id === sourceLoc.group.id;
          const isTargetPane = g.id === targetLoc.group.id;
          if (!isSourcePane && !isTargetPane) return g;

          if (isSourcePane && isTargetPane) {
            const withoutSource = g.tabs
              .filter((t) => t.id !== sourceTabId)
              .map((t) => (t.id === targetTabId ? { ...t, tabGroupId: chosenGid } : t));
            const targetIdx = withoutSource.findIndex((t) => t.id === targetTabId);
            const insertAt = targetIdx === -1 ? withoutSource.length : targetIdx + 1;
            withoutSource.splice(insertAt, 0, mergedSourceTab);
            return {
              ...g,
              tabs: sortPinnedTabsFirst(withoutSource),
              activeTabId: mergedSourceTab.id,
            };
          }

          if (isSourcePane) {
            const remaining = g.tabs.filter((t) => t.id !== sourceTabId);
            const fallback = remaining[Math.min(sourceLoc.index, remaining.length - 1)] ?? null;
            return {
              ...g,
              tabs: remaining,
              activeTabId: g.activeTabId === sourceTabId ? (fallback?.id ?? null) : g.activeTabId,
            };
          }

          // Target pane (cross-pane)
          const updatedTarget = g.tabs.map((t) =>
            t.id === targetTabId ? { ...t, tabGroupId: chosenGid } : t
          );
          const targetIdx = updatedTarget.findIndex((t) => t.id === targetTabId);
          const insertAt = targetIdx === -1 ? updatedTarget.length : targetIdx + 1;
          updatedTarget.splice(insertAt, 0, mergedSourceTab);
          return {
            ...g,
            tabs: sortPinnedTabsFirst(updatedTarget),
            activeTabId: mergedSourceTab.id,
          };
        });

        commit(nextRoot, targetLoc.group.id, undefined, nextTabGroups);
        return chosenGid;
      },

      moveTabGroupCollection(tabGroupId, targetPaneId, targetIndex) {
        const { root, tabGroups } = get();
        if (!tabGroups[tabGroupId]) return;
        const targetPane = findGroup(root, targetPaneId);
        if (!targetPane) return;

        const memberTabs: WorkspaceTab[] = [];
        let preferredActiveTabId: string | null = null;
        for (const pane of getAllGroups(root)) {
          for (const tab of pane.tabs) {
            if (tab.tabGroupId === tabGroupId) {
              memberTabs.push(tab);
              if (pane.activeTabId === tab.id) {
                preferredActiveTabId = tab.id;
              }
            }
          }
        }
        if (memberTabs.length === 0) return;

        const memberIds = new Set(memberTabs.map((t) => t.id));
        const removedBeforeTarget =
          targetIndex !== undefined
            ? targetPane.tabs
              .slice(0, Math.min(targetIndex, targetPane.tabs.length))
              .filter((t) => memberIds.has(t.id)).length
            : 0;

        const nextRoot = mapGroups(root, (g) => {
          const remaining = g.tabs.filter((t) => !memberIds.has(t.id));
          if (g.id !== targetPaneId) {
            if (remaining.length === g.tabs.length) return g;
            const activeStillThere = remaining.some((t) => t.id === g.activeTabId);
            return {
              ...g,
              tabs: remaining,
              activeTabId: activeStillThere ? g.activeTabId : (remaining[0]?.id ?? null),
            };
          }

          const rawIdx = targetIndex === undefined ? remaining.length : targetIndex - removedBeforeTarget;
          const clampedIdx = Math.max(0, Math.min(remaining.length, rawIdx));
          const merged = [...remaining];
          merged.splice(clampedIdx, 0, ...memberTabs);
          return {
            ...g,
            tabs: sortPinnedTabsFirst(merged),
            activeTabId: preferredActiveTabId ?? memberTabs[0].id,
          };
        });

        commit(nextRoot, targetPaneId);
      },

      mergeTabGroups(sourceTabGroupId, targetTabGroupId) {
        if (sourceTabGroupId === targetTabGroupId) return;
        const { root, tabGroups } = get();
        const targetMeta = tabGroups[targetTabGroupId];
        if (!tabGroups[sourceTabGroupId] || !targetMeta) return;

        const sourceTabs: WorkspaceTab[] = [];
        let targetPaneId: string | null = null;
        for (const pane of getAllGroups(root)) {
          for (const tab of pane.tabs) {
            if (tab.tabGroupId === sourceTabGroupId) {
              sourceTabs.push({ ...tab, tabGroupId: targetTabGroupId });
            } else if (tab.tabGroupId === targetTabGroupId && !targetPaneId) {
              targetPaneId = pane.id;
            }
          }
        }
        if (sourceTabs.length === 0 || !targetPaneId) return;

        const sourceIds = new Set(sourceTabs.map((t) => t.id));
        const nextRoot = mapGroups(root, (g) => {
          const remaining = g.tabs.filter((t) => !sourceIds.has(t.id));
          if (g.id !== targetPaneId) {
            if (remaining.length === g.tabs.length) return g;
            const activeStillThere = remaining.some((t) => t.id === g.activeTabId);
            return {
              ...g,
              tabs: remaining,
              activeTabId: activeStillThere ? g.activeTabId : (remaining[0]?.id ?? null),
            };
          }

          let lastTargetIdx = -1;
          remaining.forEach((t, idx) => {
            if (t.tabGroupId === targetTabGroupId) lastTargetIdx = idx;
          });
          const insertAt = lastTargetIdx === -1 ? remaining.length : lastTargetIdx + 1;
          const merged = [...remaining];
          merged.splice(insertAt, 0, ...sourceTabs);
          return {
            ...g,
            tabs: sortPinnedTabsFirst(merged),
            activeTabId: sourceTabs[0].id,
          };
        });

        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...tabGroups,
          [targetTabGroupId]: { ...targetMeta, collapsed: false },
        };
        commit(nextRoot, targetPaneId, undefined, nextTabGroups);
      },

      dockTabGroupCollection(tabGroupId, targetPaneId, zone) {
        if (zone === "center") {
          get().moveTabGroupCollection(tabGroupId, targetPaneId);
          return;
        }
        const { root, tabGroups } = get();
        if (!tabGroups[tabGroupId]) return;
        const targetPane = findGroup(root, targetPaneId);
        if (!targetPane) return;

        const memberTabs: WorkspaceTab[] = [];
        let preferredActiveTabId: string | null = null;
        for (const pane of getAllGroups(root)) {
          for (const tab of pane.tabs) {
            if (tab.tabGroupId === tabGroupId) {
              memberTabs.push(tab);
              if (pane.activeTabId === tab.id) {
                preferredActiveTabId = tab.id;
              }
            }
          }
        }
        if (memberTabs.length === 0) return;

        const memberIds = new Set(memberTabs.map((t) => t.id));
        if (targetPane.tabs.every((t) => memberIds.has(t.id))) {
          return;
        }

        const withoutSource = mapGroups(root, (g) => {
          const remaining = g.tabs.filter((t) => !memberIds.has(t.id));
          if (remaining.length === g.tabs.length) return g;
          const activeStillThere = remaining.some((t) => t.id === g.activeTabId);
          return {
            ...g,
            tabs: remaining,
            activeTabId: activeStillThere ? g.activeTabId : (remaining[0]?.id ?? null),
          };
        });

        const newGroup = createTabGroup(memberTabs);
        const focusedGroup = preferredActiveTabId
          ? { ...newGroup, activeTabId: preferredActiveTabId }
          : newGroup;
        const nextRoot = splitGroupInTree(withoutSource, targetPaneId, zone, focusedGroup);
        commit(nextRoot, focusedGroup.id);
      },

      updateTabGroupMeta(tabGroupId, patch) {
        const existing = get().tabGroups[tabGroupId];
        if (!existing) return;
        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...get().tabGroups,
          [tabGroupId]: {
            ...existing,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
            ...(patch.collapsed !== undefined ? { collapsed: patch.collapsed } : {}),
            ...(patch.stacked !== undefined ? { stacked: patch.stacked } : {}),
            ...(patch.pair !== undefined ? { pair: patch.pair } : {}),
          },
        };
        commit(get().root, undefined, undefined, nextTabGroups);
      },

      toggleTabGroupCollapsed(tabGroupId) {
        const existing = get().tabGroups[tabGroupId];
        if (!existing) return;
        get().updateTabGroupMeta(tabGroupId, { collapsed: !existing.collapsed });
      },

      toggleTabGroupStacked(tabGroupId) {
        const existing = get().tabGroups[tabGroupId];
        if (!existing) return;
        const nextStacked = !existing.stacked;
        get().updateTabGroupMeta(tabGroupId, {
          stacked: nextStacked,
          ...(nextStacked ? { pair: null } : {}),
          ...(nextStacked && existing.collapsed ? { collapsed: false } : {}),
        });
      },

      enableTabGroupPair(tabGroupId, options) {
        const { root, tabGroups } = get();
        const meta = tabGroups[tabGroupId];
        if (!meta) return;

        // Find pane holding this group's members (prefer the pane with most members / active pane)
        const panes = getAllGroups(root);
        let hostPane: TabGroupNode | null = null;
        let members: WorkspaceTab[] = [];
        for (const pane of panes) {
          const found = pane.tabs.filter((t) => t.tabGroupId === tabGroupId);
          if (found.length > members.length) {
            members = found;
            hostPane = pane;
          }
        }
        if (!hostPane || members.length === 0) return;

        let workingRoot = root;
        let workingMembers = [...members];

        // 1-tab group: create a sibling empty tab inside the same group so pair opens immediately
        if (workingMembers.length === 1) {
          const partner: WorkspaceTab = { ...createEmptyTab(), tabGroupId };
          workingRoot = mapGroups(root, (g) => {
            if (g.id !== hostPane!.id) return g;
            const nextTabs = sortPinnedTabsFirst([...g.tabs, partner]);
            return { ...g, tabs: nextTabs };
          });
          workingMembers = [workingMembers[0], partner];
        }

        const memberIds = new Set(workingMembers.map((t) => t.id));
        const activeInGroup =
          hostPane.activeTabId && memberIds.has(hostPane.activeTabId)
            ? hostPane.activeTabId
            : null;

        let leftTabId =
          options?.leftTabId && memberIds.has(options.leftTabId)
            ? options.leftTabId
            : activeInGroup ?? workingMembers[0].id;

        const mru = groupMruMap.get(tabGroupId) ?? [];
        const mruCandidate = mru.find((id) => id !== leftTabId && memberIds.has(id));
        const leftIdx = workingMembers.findIndex((t) => t.id === leftTabId);
        const adjacentCandidate =
          workingMembers[leftIdx + 1]?.id ??
          workingMembers[leftIdx - 1]?.id ??
          workingMembers.find((t) => t.id !== leftTabId)?.id;

        let rightTabId =
          options?.rightTabId && memberIds.has(options.rightTabId) && options.rightTabId !== leftTabId
            ? options.rightTabId
            : mruCandidate ?? adjacentCandidate ?? "";

        if (!rightTabId || rightTabId === leftTabId) {
          const fallback = workingMembers.find((t) => t.id !== leftTabId);
          if (!fallback) return;
          rightTabId = fallback.id;
        }

        const activeSide: "left" | "right" = options?.activeSide ?? "left";
        const splitRatio = Math.max(
          20,
          Math.min(80, Number.isFinite(options?.splitRatio) ? (options?.splitRatio as number) : meta.pair?.splitRatio ?? 50)
        );
        const focusedTabId = activeSide === "right" ? rightTabId : leftTabId;

        const nextRoot = mapGroups(workingRoot, (g) =>
          g.id === hostPane!.id ? { ...g, activeTabId: focusedTabId } : g
        );
        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...tabGroups,
          [tabGroupId]: {
            ...meta,
            collapsed: false,
            stacked: false,
            pair: {
              leftTabId,
              rightTabId,
              splitRatio,
              activeSide,
            },
          },
        };
        recordGroupMru(tabGroupId, rightTabId);
        recordGroupMru(tabGroupId, leftTabId);
        commit(nextRoot, hostPane.id, undefined, nextTabGroups);
      },

      disableTabGroupPair(tabGroupId) {
        const existing = get().tabGroups[tabGroupId];
        if (!existing || !existing.pair) return;
        get().updateTabGroupMeta(tabGroupId, { pair: null });
      },

      toggleTabGroupPair(tabGroupId, options) {
        const existing = get().tabGroups[tabGroupId];
        if (!existing) return;
        if (existing.pair && !options?.leftTabId && !options?.rightTabId) {
          get().disableTabGroupPair(tabGroupId);
        } else {
          get().enableTabGroupPair(tabGroupId, options);
        }
      },

      setTabGroupPairSlot(tabGroupId, side, tabId) {
        const { root, tabGroups } = get();
        const meta = tabGroups[tabGroupId];
        if (!meta) return;
        const loc = findTabLocation(root, tabId);
        if (!loc || loc.tab.tabGroupId !== tabGroupId) return;

        if (!meta.pair) {
          get().enableTabGroupPair(
            tabGroupId,
            side === "left" ? { leftTabId: tabId, activeSide: "left" } : { rightTabId: tabId, activeSide: "right" }
          );
          return;
        }

        const cur = meta.pair;
        let nextLeft = cur.leftTabId;
        let nextRight = cur.rightTabId;

        if (side === "left") {
          if (tabId === cur.rightTabId) {
            // Swap sides cleanly instead of duplicating the same tab on both sides
            nextRight = cur.leftTabId;
            nextLeft = tabId;
          } else {
            nextLeft = tabId;
          }
        } else {
          if (tabId === cur.leftTabId) {
            nextLeft = cur.rightTabId;
            nextRight = tabId;
          } else {
            nextRight = tabId;
          }
        }

        const nextRoot = mapGroups(root, (g) =>
          g.id === loc.group.id ? { ...g, activeTabId: tabId } : g
        );
        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...tabGroups,
          [tabGroupId]: {
            ...meta,
            collapsed: false,
            stacked: false,
            pair: {
              ...cur,
              leftTabId: nextLeft,
              rightTabId: nextRight,
              activeSide: side,
            },
          },
        };
        recordGroupMru(tabGroupId, tabId);
        commit(nextRoot, loc.group.id, undefined, nextTabGroups);
      },

      setTabGroupPairActiveSide(tabGroupId, side) {
        const { root, tabGroups } = get();
        const meta = tabGroups[tabGroupId];
        if (!meta?.pair) return;
        const targetTabId = side === "right" ? meta.pair.rightTabId : meta.pair.leftTabId;
        const loc = findTabLocation(root, targetTabId);
        if (!loc) return;

        const nextRoot = mapGroups(root, (g) =>
          g.id === loc.group.id ? { ...g, activeTabId: targetTabId } : g
        );
        const nextTabGroups: Record<string, TabGroupMeta> =
          meta.pair.activeSide === side
            ? tabGroups
            : {
              ...tabGroups,
              [tabGroupId]: {
                ...meta,
                pair: { ...meta.pair, activeSide: side },
              },
            };
        recordGroupMru(tabGroupId, targetTabId);
        commit(nextRoot, loc.group.id, undefined, nextTabGroups);
      },

      swapTabGroupPair(tabGroupId) {
        const meta = get().tabGroups[tabGroupId];
        if (!meta?.pair) return;
        const nextSide: "left" | "right" = meta.pair.activeSide === "left" ? "right" : "left";
        get().updateTabGroupMeta(tabGroupId, {
          pair: {
            ...meta.pair,
            leftTabId: meta.pair.rightTabId,
            rightTabId: meta.pair.leftTabId,
            activeSide: nextSide,
          },
        });
      },

      resizeTabGroupPair(tabGroupId, splitRatio) {
        const meta = get().tabGroups[tabGroupId];
        if (!meta?.pair) return;
        const clamped = Math.max(20, Math.min(80, splitRatio));
        if (Math.abs(clamped - meta.pair.splitRatio) < 0.05) return;
        get().updateTabGroupMeta(tabGroupId, {
          pair: { ...meta.pair, splitRatio: clamped },
        });
      },

      ungroupTabGroup(tabGroupId) {
        if (get().expandedTabGroup?.tabGroupId === tabGroupId) {
          get().restoreExpandedTabGroup();
        }
        const nextRoot = mapGroups(get().root, (g) => {
          if (!g.tabs.some((t) => t.tabGroupId === tabGroupId)) return g;
          return {
            ...g,
            tabs: g.tabs.map((t) =>
              t.tabGroupId === tabGroupId ? { ...t, tabGroupId: undefined } : t
            ),
          };
        });
        const nextTabGroups = { ...get().tabGroups };
        delete nextTabGroups[tabGroupId];
        commit(nextRoot, undefined, undefined, nextTabGroups);
      },

      closeTabGroup(tabGroupId, opts) {
        if (get().expandedTabGroup?.tabGroupId === tabGroupId) {
          get().restoreExpandedTabGroup();
        }
        const { root } = get();
        const totalGroups = getAllGroups(root).length;
        const closedList: WorkspaceTab[] = [];
        let originPaneId = get().activeGroupId;

        const nextRoot = mapGroups(root, (g) => {
          const targets = g.tabs.filter(
            (t) => t.tabGroupId === tabGroupId && (!t.pinned || opts?.force)
          );
          if (targets.length === 0) return g;
          originPaneId = g.id;
          closedList.push(...targets);
          const targetIds = new Set(targets.map((t) => t.id));
          const remaining = g.tabs.filter((t) => !targetIds.has(t.id));
          if (remaining.length === 0 && totalGroups === 1) {
            const empty = createEmptyTab();
            return { ...g, tabs: [empty], activeTabId: empty.id };
          }
          const activeStillThere = remaining.some((t) => t.id === g.activeTabId);
          return {
            ...g,
            tabs: remaining,
            activeTabId: activeStillThere ? g.activeTabId : (remaining[0]?.id ?? null),
          };
        });

        const nextClosed = pushClosed(closedList, originPaneId);
        commit(nextRoot, undefined, nextClosed);
      },

      expandTabGroup(tabGroupId) {
        const curExpanded = get().expandedTabGroup;
        if (curExpanded) {
          if (curExpanded.tabGroupId === tabGroupId) return;
          get().restoreExpandedTabGroup();
        }

        const { root, activeGroupId, tabGroups } = get();
        const meta = tabGroups[tabGroupId];
        if (!meta) return;

        const memberTabs: WorkspaceTab[] = [];
        let originPaneId: string | null = null;
        let preferredActiveTabId: string | null = null;

        for (const pane of getAllGroups(root)) {
          for (const tab of pane.tabs) {
            if (tab.tabGroupId === tabGroupId) {
              if (!originPaneId) originPaneId = pane.id;
              if (pane.id === activeGroupId && pane.activeTabId === tab.id) {
                originPaneId = pane.id;
                preferredActiveTabId = tab.id;
              }
              memberTabs.push(tab);
            }
          }
        }

        if (memberTabs.length === 0 || !originPaneId) return;

        // Focus & maximize this Chrome Tab Group as a SINGLE 100%-wide pane (keeping group chip & stack intact!)
        const focusedPane = createTabGroup(memberTabs);
        const focusedActiveTabId =
          preferredActiveTabId && memberTabs.some((t) => t.id === preferredActiveTabId)
            ? preferredActiveTabId
            : memberTabs[0].id;
        const expandedRoot: LayoutNode = {
          ...focusedPane,
          activeTabId: focusedActiveTabId,
        };

        const nextTabGroups: Record<string, TabGroupMeta> = {
          ...tabGroups,
          [tabGroupId]: { ...meta, collapsed: false },
        };

        const nextExpanded: ExpandedTabGroupState = {
          tabGroupId,
          originPaneId,
          savedRoot: root,
          savedActiveGroupId: activeGroupId,
        };

        commit(expandedRoot, focusedPane.id, undefined, nextTabGroups, nextExpanded);
      },

      restoreExpandedTabGroup() {
        const expanded = get().expandedTabGroup;
        if (!expanded) return;

        const { root } = get();
        const activeExpandedTabId = get().getActiveTab()?.id ?? null;
        const merged = mergeExpandedIntoSavedRoot(root, expanded, activeExpandedTabId);
        commit(merged.root, merged.activeGroupId, undefined, undefined, null);
      },

      toggleExpandTabGroup(explicitTabGroupId) {
        const curExpanded = get().expandedTabGroup;
        if (curExpanded && (!explicitTabGroupId || curExpanded.tabGroupId === explicitTabGroupId)) {
          get().restoreExpandedTabGroup();
          return;
        }
        const targetId =
          explicitTabGroupId ??
          get().getActiveTab()?.tabGroupId ??
          get()
            .getActiveGroup()
            ?.tabs.find((t) => Boolean(t.tabGroupId))?.tabGroupId;
        if (targetId) {
          get().expandTabGroup(targetId);
        }
      },

      serializeLayout() {
        const { root, activeGroupId, tabGroups, expandedTabGroup } = get();
        return { version: 1, root, activeGroupId, tabGroups, expandedTabGroup };
      },

      restoreLayout(snapshot) {
        commit(
          snapshot.root,
          snapshot.activeGroupId,
          [],
          snapshot.tabGroups ?? {},
          snapshot.expandedTabGroup ?? null
        );
      },

      flushPersistence() {
        flushPersistNow();
      },

      dispose() {
        flushPersistNow();
        if (storageKey && typeof globalThis.window !== "undefined") {
          globalThis.window.removeEventListener("beforeunload", handleBeforeUnload);
          globalThis.window.removeEventListener("pagehide", handleBeforeUnload);
        }
      },
    };
  });

  return store;
}
