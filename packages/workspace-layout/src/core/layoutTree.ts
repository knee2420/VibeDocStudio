import type {
  DockDropZone,
  ExpandedTabGroupState,
  LayoutNode,
  SplitDirection,
  SplitEdge,
  SplitNode,
  TabGroupMeta,
  TabGroupNode,
  WorkspaceTab,
} from "./types";

/**
 * 패널 사각형과 포인터 좌표로부터 도킹 영역을 계산한다.
 * `allowCenter: false`(2D 캔버스 pass-through 모드)에서는 가장자리(edgeRatio) 밖의 중앙 영역에 `null`을 반환한다.
 */
export function computeDockDropZone(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  options?: { edgeRatio?: number; allowCenter?: boolean }
): DockDropZone | null {
  const edge = options?.edgeRatio ?? 0.25;
  const allowCenter = options?.allowCenter ?? true;
  const rx = (clientX - rect.left) / Math.max(rect.width, 1);
  const ry = (clientY - rect.top) / Math.max(rect.height, 1);

  const distLeft = rx;
  const distRight = 1 - rx;
  const distTop = ry;
  const distBottom = 1 - ry;
  const minEdge = Math.min(distLeft, distRight, distTop, distBottom);

  if (minEdge > edge) return allowCenter ? "center" : null;
  if (minEdge === distLeft) return "left";
  if (minEdge === distRight) return "right";
  if (minEdge === distTop) return "top";
  return "bottom";
}

let idCounter = 0;

export function nextLayoutId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function createEmptyTab(): WorkspaceTab {
  return {
    id: nextLayoutId("tab"),
    resourceId: null,
    title: "New tab",
    viewType: "empty",
    pinned: false,
    history: [{ resourceId: null, title: "New tab", viewType: "empty" }],
    historyIndex: 0,
  };
}

export function createResourceTab(
  resourceId: string,
  title: string,
  viewType: string
): WorkspaceTab {
  return {
    id: nextLayoutId("tab"),
    resourceId,
    title,
    viewType,
    pinned: false,
    history: [{ resourceId, title, viewType }],
    historyIndex: 0,
  };
}

export function createTabGroup(tabs: WorkspaceTab[] = [createEmptyTab()]): TabGroupNode {
  return {
    kind: "group",
    id: nextLayoutId("grp"),
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  };
}

export function getAllGroups(node: LayoutNode): TabGroupNode[] {
  if (node.kind === "group") return [node];
  const result: TabGroupNode[] = [];
  for (const child of node.children) {
    result.push(...getAllGroups(child));
  }
  return result;
}

export function findGroup(node: LayoutNode, groupId: string): TabGroupNode | null {
  if (node.kind === "group") {
    return node.id === groupId ? node : null;
  }
  for (const child of node.children) {
    const found = findGroup(child, groupId);
    if (found) return found;
  }
  return null;
}

export function findTabLocation(
  node: LayoutNode,
  tabId: string
): { group: TabGroupNode; tab: WorkspaceTab; index: number } | null {
  if (node.kind === "group") {
    const index = node.tabs.findIndex((t) => t.id === tabId);
    if (index !== -1) {
      return { group: node, tab: node.tabs[index], index };
    }
    return null;
  }
  for (const child of node.children) {
    const found = findTabLocation(child, tabId);
    if (found) return found;
  }
  return null;
}

export function mapGroups(
  node: LayoutNode,
  fn: (group: TabGroupNode) => TabGroupNode
): LayoutNode {
  if (node.kind === "group") {
    return fn(node);
  }
  let changed = false;
  const nextChildren = node.children.map((child) => {
    const mapped = mapGroups(child, fn);
    if (mapped !== child) changed = true;
    return mapped;
  });
  return changed ? { ...node, children: nextChildren } : node;
}

export function normalizeSizes(sizes: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  if (sizes.length !== count) {
    const even = 100 / count;
    return Array.from({ length: count }, () => even);
  }
  const sum = sizes.reduce((acc, n) => acc + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  if (sum <= 0) {
    const even = 100 / count;
    return Array.from({ length: count }, () => even);
  }
  return sizes.map((n) => (n / sum) * 100);
}

/**
 * Obsidian 스타일 탭 정렬 + Chrome 탭 그룹 연속성 보장:
 * - pinned 탭은 항상 좌측에 유지
 * - 같은 `tabGroupId`를 가진 탭들은 첫 등장 위치에 인접하게 모아 그룹 칩이 쪼개지지 않도록 보장
 */
export function sortPinnedTabsFirst(tabs: readonly WorkspaceTab[]): WorkspaceTab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  const groupContiguous = (list: readonly WorkspaceTab[]): WorkspaceTab[] => {
    const out: WorkspaceTab[] = [];
    const emittedGroups = new Set<string>();
    for (const tab of list) {
      if (!tab.tabGroupId) {
        out.push(tab);
        continue;
      }
      if (emittedGroups.has(tab.tabGroupId)) continue;
      emittedGroups.add(tab.tabGroupId);
      for (const candidate of list) {
        if (candidate.tabGroupId === tab.tabGroupId) {
          out.push(candidate);
        }
      }
    }
    return out;
  };
  return [...groupContiguous(pinned), ...groupContiguous(unpinned)];
}

/**
 * 레이아웃 트리(및 확대 전 저장 트리) 어디에서도 참조되지 않는 빈 크롬 탭 그룹 메타를 정리한다.
 * 제거할 항목이 없으면 기존 객체 참조를 그대로 반환해 불필요한 리렌더를 방지한다.
 */
export function pruneUnusedTabGroups(
  root: LayoutNode,
  tabGroups: Readonly<Record<string, TabGroupMeta>>,
  expanded: ExpandedTabGroupState | null
): Readonly<Record<string, TabGroupMeta>> {
  const keys = Object.keys(tabGroups);
  if (keys.length === 0) return tabGroups;

  const used = new Set<string>();
  const collect = (node: LayoutNode) => {
    for (const grp of getAllGroups(node)) {
      for (const tab of grp.tabs) {
        if (tab.tabGroupId) used.add(tab.tabGroupId);
      }
    }
  };
  collect(root);
  if (expanded) {
    used.add(expanded.tabGroupId);
    collect(expanded.savedRoot);
  }

  let removedAny = false;
  for (const id of keys) {
    if (!used.has(id)) {
      removedAny = true;
      break;
    }
  }
  if (!removedAny) return tabGroups;

  const next: Record<string, TabGroupMeta> = {};
  for (const [id, meta] of Object.entries(tabGroups)) {
    if (used.has(id)) next[id] = meta;
  }
  return next;
}

/**
 * 레이아웃 트리를 정규화한다:
 * - 다중 분할 상태에서 탭이 0개인 빈 그룹 제거
 * - 자식이 1개만 남은 SplitNode 언래핑
 * - 같은 방향의 중첩 SplitNode 평탄화
 * - 모든 SplitNode의 sizes 합을 정확히 100으로 정규화
 * - 최후의 1개 그룹이 비면 빈 New Tab 1개 보장
 */
export function normalizeLayoutTree(root: LayoutNode): LayoutNode {
  const clean = (node: LayoutNode): LayoutNode | null => {
    if (node.kind === "group") {
      if (node.tabs.length === 0) return null;
      const activeExists = node.tabs.some((t) => t.id === node.activeTabId);
      const activeTabId = activeExists ? node.activeTabId : node.tabs[0].id;
      return activeTabId === node.activeTabId ? node : { ...node, activeTabId };
    }

    const survivingChildren: LayoutNode[] = [];
    const survivingSizes: number[] = [];

    node.children.forEach((child, idx) => {
      const cleaned = clean(child);
      if (!cleaned) return;
      const weight = node.sizes[idx] ?? 100 / node.children.length;

      // Flatten same-direction nested splits
      if (cleaned.kind === "split" && cleaned.direction === node.direction) {
        const childSizes = normalizeSizes(cleaned.sizes, cleaned.children.length);
        cleaned.children.forEach((grandChild, gIdx) => {
          survivingChildren.push(grandChild);
          survivingSizes.push((weight * childSizes[gIdx]) / 100);
        });
      } else {
        survivingChildren.push(cleaned);
        survivingSizes.push(weight);
      }
    });

    if (survivingChildren.length === 0) return null;
    if (survivingChildren.length === 1) return survivingChildren[0];

    return {
      ...node,
      children: survivingChildren,
      sizes: normalizeSizes(survivingSizes, survivingChildren.length),
    };
  };

  const cleaned = clean(root);
  if (!cleaned) {
    return createTabGroup([createEmptyTab()]);
  }
  return cleaned;
}

export function edgeToSplitSpec(edge: SplitEdge): {
  direction: SplitDirection;
  placement: "before" | "after";
} {
  switch (edge) {
    case "left":
      return { direction: "horizontal", placement: "before" };
    case "right":
      return { direction: "horizontal", placement: "after" };
    case "top":
      return { direction: "vertical", placement: "before" };
    case "bottom":
      return { direction: "vertical", placement: "after" };
  }
}

export function splitGroupInTree(
  root: LayoutNode,
  targetGroupId: string,
  edge: SplitEdge,
  newGroup: TabGroupNode
): LayoutNode {
  const { direction, placement } = edgeToSplitSpec(edge);

  const insert = (node: LayoutNode): LayoutNode => {
    if (node.kind === "group") {
      if (node.id !== targetGroupId) return node;
      const children = placement === "before" ? [newGroup, node] : [node, newGroup];
      const split: SplitNode = {
        kind: "split",
        id: nextLayoutId("split"),
        direction,
        sizes: [50, 50],
        children,
      };
      return split;
    }

    // If direct child is targetGroup and split direction matches, insert adjacent!
    if (node.direction === direction) {
      const idx = node.children.findIndex(
        (c) => c.kind === "group" && c.id === targetGroupId
      );
      if (idx !== -1) {
        const curSizes = normalizeSizes(node.sizes, node.children.length);
        const half = curSizes[idx] / 2;
        const nextChildren = [...node.children];
        const nextSizes = [...curSizes];
        if (placement === "before") {
          nextChildren.splice(idx, 1, newGroup, node.children[idx]);
          nextSizes.splice(idx, 1, half, half);
        } else {
          nextChildren.splice(idx, 1, node.children[idx], newGroup);
          nextSizes.splice(idx, 1, half, half);
        }
        return {
          ...node,
          children: nextChildren,
          sizes: normalizeSizes(nextSizes, nextChildren.length),
        };
      }
    }

    let changed = false;
    const nextChildren = node.children.map((child) => {
      const updated = insert(child);
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...node, children: nextChildren } : node;
  };

  return normalizeLayoutTree(insert(root));
}

export function resizeSplitInTree(
  root: LayoutNode,
  splitId: string,
  boundaryIndex: number,
  deltaPercent: number,
  minPercent = 12
): LayoutNode {
  const update = (node: LayoutNode): LayoutNode => {
    if (node.kind === "group") return node;
    if (node.id === splitId) {
      if (boundaryIndex < 0 || boundaryIndex >= node.children.length - 1) return node;
      const sizes = normalizeSizes(node.sizes, node.children.length);
      const a = sizes[boundaryIndex];
      const b = sizes[boundaryIndex + 1];
      const pairTotal = a + b;
      const effectiveMin = Math.min(minPercent, pairTotal / 2);
      const nextA = Math.max(effectiveMin, Math.min(pairTotal - effectiveMin, a + deltaPercent));
      const nextB = pairTotal - nextA;
      const nextSizes = [...sizes];
      nextSizes[boundaryIndex] = nextA;
      nextSizes[boundaryIndex + 1] = nextB;
      return {
        ...node,
        sizes: normalizeSizes(nextSizes, node.children.length),
      };
    }

    let changed = false;
    const nextChildren = node.children.map((child) => {
      const updated = update(child);
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...node, children: nextChildren } : node;
  };

  return update(root);
}
