import { createStore, type StoreApi } from "zustand/vanilla";
import {
  basename,
  dirname,
  getAncestorPaths,
  isDescendantPath,
  joinPath,
  normalizeVaultPath,
  validateEntryName,
  type VaultPort,
  type VaultSortOrder,
  type VaultTreeNode,
} from "@vibe/vault-core";

import type {
  CreateFileExplorerStoreOptions,
  ExplorerFlatRow,
  ExplorerInlineRenameState,
  ExplorerRecentBadge,
  FileExplorerState,
} from "./types";

function defaultVDocJson(title: string): string {
  const now = new Date().toISOString();
  const docId = `vdoc-${Date.now()}`;
  return JSON.stringify(
    {
      version: "1.0.0",
      docId,
      title,
      status: "Draft",
      updatedAt: now,
      variables: {},
      surface: { kind: "paged", width: 794 },
      pages: [
        {
          pageId: "page-1",
          pageNumber: 1,
          pageLabel: "Page 1",
          headerSlotId: "slot-header-1",
          footerSlotId: "slot-footer-1",
          hideHeaderFooter: true,
          blocks: [
            {
              blockId: "blk-title-1",
              kind: "heading",
              title: "제목",
              level: 1,
              slotId: "slot-title-1",
            },
            {
              blockId: "blk-body-1",
              kind: "text",
              title: "본문",
              slotId: "slot-body-1",
            },
          ],
        },
      ],
      slots: {
        "slot-header-1": { slotId: "slot-header-1", label: "Header", role: "editable-slot", content: "", backDataRefs: [] },
        "slot-footer-1": { slotId: "slot-footer-1", label: "Footer", role: "editable-slot", content: "", backDataRefs: [] },
        "slot-title-1": { slotId: "slot-title-1", label: "제목", role: "editable-slot", content: `<h1>${title}</h1>`, backDataRefs: [] },
        "slot-body-1": { slotId: "slot-body-1", label: "본문", role: "editable-slot", content: "<p>2D 캔버스에서 내용을 편집하거나 파일을 드래그해 배치해 보세요.</p>", backDataRefs: [] },
      },
      backdata: {},
    },
    null,
    2
  );
}

function defaultOutlineJson(title: string): string {
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      version: 1,
      id: `outline-${Date.now()}`,
      title,
      defaultView: "bullets",
      createdAt: now,
      updatedAt: now,
      rootNodes: [
        {
          id: "root-1",
          text: title,
          isFolded: false,
          children: [
            {
              id: "node-1",
              text: "핵심 항목을 입력해 주세요",
              isFolded: false,
              children: [],
            },
          ],
        },
      ],
    },
    null,
    2
  );
}

function defaultMarkdownText(title: string): string {
  return `# ${title}\n\n`;
}

function filterTreeByQuery(
  nodes: readonly VaultTreeNode[],
  lowerQuery: string
): VaultTreeNode[] {
  if (!lowerQuery) return [...nodes];
  const result: VaultTreeNode[] = [];
  for (const item of nodes) {
    const selfMatches = item.node.name.toLowerCase().includes(lowerQuery);
    if (item.node.kind === "folder") {
      const matchedChildren = filterTreeByQuery(item.children, lowerQuery);
      if (selfMatches || matchedChildren.length > 0) {
        result.push({
          node: item.node,
          children: selfMatches ? item.children : matchedChildren,
        });
      }
    } else if (selfMatches) {
      result.push(item);
    }
  }
  return result;
}

function buildFlatRows(params: {
  vault: VaultPort;
  sortOrder: VaultSortOrder;
  filterQuery: string;
  expandedPaths: ReadonlySet<string>;
  selectedPaths: ReadonlySet<string>;
  focusedPath: string | null;
  activeFilePath: string | null;
  renamePath: string | null;
  recentBadges: ReadonlyMap<string, ExplorerRecentBadge>;
}): { rows: ExplorerFlatRow[]; hasAnyExpandedFolder: boolean } {
  const tree = params.vault.getTree(params.sortOrder);
  const lowerQuery = params.filterQuery.trim().toLowerCase();
  const effectiveTree = lowerQuery ? filterTreeByQuery(tree, lowerQuery) : tree;
  const forceExpand = lowerQuery.length > 0;

  const rows: ExplorerFlatRow[] = [];
  let hasAnyExpandedFolder = false;

  const visit = (branches: readonly VaultTreeNode[], depth: number) => {
    for (const branch of branches) {
      const { node, children } = branch;
      const isFolder = node.kind === "folder";
      const isExpanded = isFolder && (forceExpand || params.expandedPaths.has(node.path));
      if (isFolder && params.expandedPaths.has(node.path)) {
        hasAnyExpandedFolder = true;
      }
      rows.push({
        path: node.path,
        node,
        depth,
        isExpanded,
        hasChildren: isFolder && children.length > 0,
        isSelected: params.selectedPaths.has(node.path),
        isFocused: params.focusedPath === node.path,
        isActiveFile: params.activeFilePath === node.path,
        isRenaming: params.renamePath === node.path,
        recentBadge: params.recentBadges.get(node.path) ?? null,
      });
      if (isFolder && isExpanded && children.length > 0) {
        visit(children, depth + 1);
      }
    }
  };

  visit(effectiveTree, 0);
  return { rows, hasAnyExpandedFolder };
}

function deduplicateTopLevelPaths(paths: readonly string[]): string[] {
  const unique = Array.from(new Set(paths.map(normalizeVaultPath).filter(Boolean)));
  unique.sort((a, b) => a.length - b.length);
  const topLevel: string[] = [];
  for (const path of unique) {
    if (!topLevel.some((parent) => isDescendantPath(path, parent))) {
      topLevel.push(path);
    }
  }
  return topLevel;
}

export type FileExplorerStore = StoreApi<FileExplorerState>;

export function createFileExplorerStore(
  vault: VaultPort,
  options: CreateFileExplorerStoreOptions = {}
): FileExplorerStore {
  const makeOutlineContent = options.defaultOutlineContent ?? defaultOutlineJson;
  const makeMarkdownContent = options.defaultMarkdownContent ?? defaultMarkdownText;
  const makeVDocContent = options.defaultVDocContent ?? defaultVDocJson;
  let internalCreateDepth = 0;

  const initialExpanded = new Set(
    (options.initialExpandedPaths ?? []).map(normalizeVaultPath).filter(Boolean)
  );
  const initialSort: VaultSortOrder = options.initialSortOrder ?? "name-asc";
  const initialAutoReveal = options.initialAutoReveal ?? true;
  const initialRecentBadges = new Map<string, ExplorerRecentBadge>();

  const initialComputed = buildFlatRows({
    vault,
    sortOrder: initialSort,
    filterQuery: "",
    expandedPaths: initialExpanded,
    selectedPaths: new Set(),
    focusedPath: null,
    activeFilePath: null,
    renamePath: null,
    recentBadges: initialRecentBadges,
  });

  let unsubscribeVault: (() => void) | null = null;

  const store = createStore<FileExplorerState>((set, get) => {
    const recompute = (
      patch: Partial<
        Pick<
          FileExplorerState,
          | "sortOrder"
          | "autoReveal"
          | "filterQuery"
          | "expandedPaths"
          | "selectedPaths"
          | "selectionAnchorPath"
          | "focusedPath"
          | "activeFilePath"
          | "renameState"
          | "recentBadges"
        >
      > = {}
    ) => {
      const prev = get();
      const sortOrder = patch.sortOrder ?? prev.sortOrder;
      const filterQuery = patch.filterQuery ?? prev.filterQuery;
      const expandedPaths = patch.expandedPaths ?? prev.expandedPaths;
      const selectedPaths = patch.selectedPaths ?? prev.selectedPaths;
      const focusedPath = patch.focusedPath !== undefined ? patch.focusedPath : prev.focusedPath;
      const activeFilePath =
        patch.activeFilePath !== undefined ? patch.activeFilePath : prev.activeFilePath;
      const renameState = patch.renameState !== undefined ? patch.renameState : prev.renameState;
      const recentBadges = patch.recentBadges ?? prev.recentBadges;

      const { rows, hasAnyExpandedFolder } = buildFlatRows({
        vault,
        sortOrder,
        filterQuery,
        expandedPaths,
        selectedPaths,
        focusedPath,
        activeFilePath,
        renamePath: renameState?.path ?? null,
        recentBadges,
      });

      set({
        ...patch,
        rows,
        hasAnyExpandedFolder,
        revision: prev.revision + 1,
      });
    };

    const validateRenameDraft = (targetPath: string, draft: string): string | null => {
      const nameErr = validateEntryName(draft);
      if (nameErr) return nameErr;
      const candidate = joinPath(dirname(targetPath), draft.trim());
      if (candidate !== targetPath && vault.exists(candidate)) {
        return `이미 같은 이름이 존재합니다: ${draft.trim()}`;
      }
      return null;
    };

    return {
      vault,
      sortOrder: initialSort,
      autoReveal: initialAutoReveal,
      filterQuery: "",
      expandedPaths: initialExpanded,
      selectedPaths: new Set<string>(),
      selectionAnchorPath: null,
      focusedPath: null,
      activeFilePath: null,
      renameState: null,
      recentBadges: initialRecentBadges,
      rows: initialComputed.rows,
      hasAnyExpandedFolder: initialComputed.hasAnyExpandedFolder,
      revision: 0,

      refresh() {
        recompute();
      },

      setSortOrder(order) {
        recompute({ sortOrder: order });
      },

      setAutoReveal(enabled) {
        const active = get().activeFilePath;
        if (enabled && active) {
          const nextExpanded = new Set(get().expandedPaths);
          for (const anc of getAncestorPaths(active)) {
            nextExpanded.add(anc);
          }
          recompute({ autoReveal: enabled, expandedPaths: nextExpanded });
        } else {
          recompute({ autoReveal: enabled });
        }
      },

      setFilterQuery(query) {
        recompute({ filterQuery: query });
      },

      setActiveFilePath(path) {
        const norm = path ? normalizeVaultPath(path) : null;
        if (norm && get().autoReveal) {
          const nextExpanded = new Set(get().expandedPaths);
          for (const anc of getAncestorPaths(norm)) {
            nextExpanded.add(anc);
          }
          recompute({ activeFilePath: norm, expandedPaths: nextExpanded });
        } else {
          recompute({ activeFilePath: norm });
        }
      },

      revealPath(path, opts) {
        const norm = normalizeVaultPath(path);
        if (!norm || !vault.exists(norm)) return;
        const nextExpanded = new Set(get().expandedPaths);
        for (const anc of getAncestorPaths(norm)) {
          nextExpanded.add(anc);
        }
        recompute({
          expandedPaths: nextExpanded,
          activeFilePath: vault.getNode(norm)?.kind === "file" ? norm : get().activeFilePath,
          ...(opts?.focus
            ? {
                focusedPath: norm,
                selectedPaths: new Set([norm]),
                selectionAnchorPath: norm,
              }
            : {}),
        });
      },

      markExternalChange(path, badge = "NEW") {
        const norm = normalizeVaultPath(path);
        if (!norm || !vault.exists(norm)) return;
        const nextExpanded = new Set(get().expandedPaths);
        for (const anc of getAncestorPaths(norm)) {
          nextExpanded.add(anc);
        }
        const nextBadges = new Map(get().recentBadges);
        nextBadges.set(norm, badge);
        recompute({
          expandedPaths: nextExpanded,
          recentBadges: nextBadges,
        });
      },

      clearRecentBadge(path) {
        const norm = normalizeVaultPath(path);
        if (!get().recentBadges.has(norm)) return;
        const nextBadges = new Map(get().recentBadges);
        nextBadges.delete(norm);
        recompute({ recentBadges: nextBadges });
      },

      toggleExpand(folderPath) {
        const norm = normalizeVaultPath(folderPath);
        const next = new Set(get().expandedPaths);
        if (next.has(norm)) {
          next.delete(norm);
        } else {
          next.add(norm);
        }
        recompute({ expandedPaths: next });
      },

      expandPath(folderPath) {
        const norm = normalizeVaultPath(folderPath);
        if (!norm || get().expandedPaths.has(norm)) return;
        const next = new Set(get().expandedPaths);
        next.add(norm);
        recompute({ expandedPaths: next });
      },

      collapsePath(folderPath) {
        const norm = normalizeVaultPath(folderPath);
        if (!norm || !get().expandedPaths.has(norm)) return;
        const next = new Set(get().expandedPaths);
        next.delete(norm);
        recompute({ expandedPaths: next });
      },

      expandAll() {
        const next = new Set<string>();
        for (const node of vault.listAll()) {
          if (node.kind === "folder") {
            next.add(node.path);
          }
        }
        recompute({ expandedPaths: next });
      },

      collapseAll() {
        recompute({ expandedPaths: new Set<string>() });
      },

      toggleExpandCollapseAll() {
        if (get().hasAnyExpandedFolder) {
          get().collapseAll();
        } else {
          get().expandAll();
        }
      },

      expandFolderSubtree(folderPath, expanded) {
        const norm = normalizeVaultPath(folderPath);
        const next = new Set(get().expandedPaths);
        for (const node of vault.listAll()) {
          if (node.kind === "folder" && isDescendantPath(node.path, norm)) {
            if (expanded) next.add(node.path);
            else next.delete(node.path);
          }
        }
        recompute({ expandedPaths: next });
      },

      selectSingle(path) {
        const norm = normalizeVaultPath(path);
        recompute({
          selectedPaths: new Set([norm]),
          selectionAnchorPath: norm,
          focusedPath: norm,
        });
      },

      selectToggle(path) {
        const norm = normalizeVaultPath(path);
        const next = new Set(get().selectedPaths);
        if (next.has(norm)) {
          next.delete(norm);
        } else {
          next.add(norm);
        }
        recompute({
          selectedPaths: next,
          selectionAnchorPath: norm,
          focusedPath: norm,
        });
      },

      selectRange(path) {
        const norm = normalizeVaultPath(path);
        const { rows, selectionAnchorPath, focusedPath } = get();
        const anchor = selectionAnchorPath ?? focusedPath ?? norm;
        const anchorIdx = rows.findIndex((r) => r.path === anchor);
        const targetIdx = rows.findIndex((r) => r.path === norm);
        if (anchorIdx === -1 || targetIdx === -1) {
          get().selectSingle(norm);
          return;
        }
        const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const next = new Set<string>();
        for (let i = start; i <= end; i++) {
          next.add(rows[i].path);
        }
        recompute({
          selectedPaths: next,
          focusedPath: norm,
          selectionAnchorPath: anchor,
        });
      },

      clearSelection() {
        recompute({ selectedPaths: new Set<string>(), selectionAnchorPath: null });
      },

      setFocusedPath(path) {
        recompute({ focusedPath: path ? normalizeVaultPath(path) : null });
      },

      moveFocus(direction) {
        const { rows, focusedPath } = get();
        if (rows.length === 0) return null;
        const curIdx = focusedPath ? rows.findIndex((r) => r.path === focusedPath) : -1;
        let nextIdx: number;
        if (curIdx === -1) {
          nextIdx = direction === "down" ? 0 : rows.length - 1;
        } else {
          nextIdx =
            direction === "down"
              ? Math.min(rows.length - 1, curIdx + 1)
              : Math.max(0, curIdx - 1);
        }
        const targetPath = rows[nextIdx].path;
        recompute({
          focusedPath: targetPath,
          selectedPaths: new Set([targetPath]),
          selectionAnchorPath: targetPath,
        });
        return targetPath;
      },

      handleArrowRight() {
        const { rows, focusedPath } = get();
        if (!focusedPath) return get().moveFocus("down");
        const row = rows.find((r) => r.path === focusedPath);
        if (!row) return null;
        if (row.node.kind === "folder") {
          if (!row.isExpanded) {
            get().expandPath(row.path);
            return row.path;
          }
          const idx = rows.indexOf(row);
          const nextRow = rows[idx + 1];
          if (nextRow && nextRow.depth === row.depth + 1) {
            get().selectSingle(nextRow.path);
            return nextRow.path;
          }
        }
        return row.path;
      },

      handleArrowLeft() {
        const { rows, focusedPath } = get();
        if (!focusedPath) return null;
        const row = rows.find((r) => r.path === focusedPath);
        if (!row) return null;
        if (row.node.kind === "folder" && row.isExpanded) {
          get().collapsePath(row.path);
          return row.path;
        }
        const parent = dirname(row.path);
        if (parent) {
          get().selectSingle(parent);
          return parent;
        }
        return row.path;
      },

      startRename(path) {
        const norm = normalizeVaultPath(path);
        const node = vault.getNode(norm);
        if (!node) return;
        const renameState: ExplorerInlineRenameState = {
          path: norm,
          draft: node.name,
          error: null,
        };
        recompute({
          renameState,
          focusedPath: norm,
          selectedPaths: new Set([norm]),
        });
      },

      updateRenameDraft(draft) {
        const cur = get().renameState;
        if (!cur) return;
        const error = validateRenameDraft(cur.path, draft);
        recompute({
          renameState: { ...cur, draft, error },
        });
      },

      commitRename() {
        const cur = get().renameState;
        if (!cur) return { ok: false, error: "Not renaming" };
        const trimmed = cur.draft.trim();
        const err = validateRenameDraft(cur.path, trimmed);
        if (err) {
          recompute({ renameState: { ...cur, error: err } });
          return { ok: false, error: err };
        }
        if (trimmed === basename(cur.path)) {
          recompute({ renameState: null });
          return { ok: true, newPath: cur.path };
        }
        try {
          const res = vault.rename(cur.path, trimmed);
          recompute({
            renameState: null,
            focusedPath: res.newPath,
            selectedPaths: new Set([res.newPath]),
            selectionAnchorPath: res.newPath,
          });
          return { ok: true, newPath: res.newPath };
        } catch (error) {
          const msg = error instanceof Error ? error.message : "이름 변경에 실패했습니다.";
          recompute({ renameState: { ...cur, error: msg } });
          return { ok: false, error: msg };
        }
      },

      cancelRename() {
        recompute({ renameState: null });
      },

      createNewFile(parentFolderPath = "", extension = "md", createOptions) {
        const normParent = normalizeVaultPath(parentFolderPath);
        const cleanExt = extension.replace(/^\./, "").toLowerCase() || "md";
        const base = createOptions?.baseName?.trim() || "Untitled";
        const uniquePath = vault.getUniquePath(normParent, base, cleanExt);
        const title = basename(uniquePath).replace(new RegExp(`\\.${cleanExt}$`, "i"), "");
        const content = createOptions?.contentFactory
          ? createOptions.contentFactory(title)
          : cleanExt === "vdoc"
            ? makeVDocContent(title)
            : cleanExt === "outline"
              ? makeOutlineContent(title)
              : cleanExt === "md"
                ? makeMarkdownContent(title)
                : "";
        internalCreateDepth += 1;
        let created;
        try {
          created = vault.createFile(uniquePath, content);
        } finally {
          internalCreateDepth -= 1;
        }

        const nextExpanded = new Set(get().expandedPaths);
        for (const anc of getAncestorPaths(created.path)) {
          nextExpanded.add(anc);
        }
        recompute({
          expandedPaths: nextExpanded,
          focusedPath: created.path,
          selectedPaths: new Set([created.path]),
          selectionAnchorPath: created.path,
          renameState: {
            path: created.path,
            draft: created.name,
            error: null,
          },
        });
        return { path: created.path };
      },

      createNewFolder(parentFolderPath = "", createOptions) {
        const normParent = normalizeVaultPath(parentFolderPath);
        const base = createOptions?.baseName?.trim() || "New folder";
        const uniquePath = vault.getUniquePath(normParent, base);
        internalCreateDepth += 1;
        let created;
        try {
          created = vault.createFolder(uniquePath);
          if (createOptions?.onCreated) {
            createOptions.onCreated(created.path, vault);
          }
        } finally {
          internalCreateDepth -= 1;
        }

        const nextExpanded = new Set(get().expandedPaths);
        for (const anc of getAncestorPaths(created.path)) {
          nextExpanded.add(anc);
        }
        if (createOptions?.onCreated) {
          nextExpanded.add(created.path);
        }
        recompute({
          expandedPaths: nextExpanded,
          focusedPath: created.path,
          selectedPaths: new Set([created.path]),
          selectionAnchorPath: created.path,
          renameState: {
            path: created.path,
            draft: created.name,
            error: null,
          },
        });
        return { path: created.path };
      },

      duplicatePaths(paths) {
        const top = deduplicateTopLevelPaths(paths);
        const createdPaths: string[] = [];
        for (const p of top) {
          if (!vault.exists(p)) continue;
          const dup = vault.duplicate(p);
          createdPaths.push(dup.path);
        }
        if (createdPaths.length > 0) {
          const last = createdPaths[createdPaths.length - 1];
          recompute({
            focusedPath: last,
            selectedPaths: new Set(createdPaths),
            selectionAnchorPath: last,
          });
        }
        return createdPaths;
      },

      deletePaths(paths) {
        const top = deduplicateTopLevelPaths(paths);
        const deleted: string[] = [];
        for (const p of top) {
          if (!vault.exists(p)) continue;
          const res = vault.delete(p);
          deleted.push(...res.deletedPaths);
        }
        return deleted;
      },

      canDrop(dragPaths, targetFolderPath) {
        const normTarget = normalizeVaultPath(targetFolderPath);
        if (normTarget) {
          const targetNode = vault.getNode(normTarget);
          if (!targetNode || targetNode.kind !== "folder") return false;
        }
        const top = deduplicateTopLevelPaths(dragPaths);
        if (top.length === 0) return false;

        let hasMovable = false;
        for (const src of top) {
          const node = vault.getNode(src);
          if (!node) return false;
          // Cannot drop folder onto itself or its descendants
          if (node.kind === "folder" && normTarget && isDescendantPath(normTarget, src)) {
            return false;
          }
          // Skip no-op check until we see if at least one item actually changes folder
          if (dirname(src) !== normTarget) {
            const destPath = joinPath(normTarget, node.name);
            if (vault.exists(destPath)) return false;
            hasMovable = true;
          }
        }
        return hasMovable;
      },

      dropPaths(dragPaths, targetFolderPath) {
        const normTarget = normalizeVaultPath(targetFolderPath);
        if (!get().canDrop(dragPaths, normTarget)) return [];

        const top = deduplicateTopLevelPaths(dragPaths);
        const movedNewPaths: string[] = [];
        for (const src of top) {
          if (dirname(src) === normTarget) continue;
          const res = vault.move(src, normTarget);
          movedNewPaths.push(res.newPath);
        }
        if (movedNewPaths.length > 0) {
          const nextExpanded = new Set(get().expandedPaths);
          if (normTarget) nextExpanded.add(normTarget);
          recompute({
            expandedPaths: nextExpanded,
            selectedPaths: new Set(movedNewPaths),
            focusedPath: movedNewPaths[0],
            selectionAnchorPath: movedNewPaths[0],
          });
        }
        return movedNewPaths;
      },

      dispose() {
        if (unsubscribeVault) {
          unsubscribeVault();
          unsubscribeVault = null;
        }
      },
    };
  });

  // Subscribe to Vault events to keep explorer state strictly synchronized.
  unsubscribeVault = vault.subscribe((event) => {
    const state = store.getState();
    if (event.type === "create" && internalCreateDepth === 0) {
      // External creation (e.g. from 2D canvas or AI directing): auto-expand parent & highlight with NEW badge!
      const nextExpanded = new Set(state.expandedPaths);
      for (const anc of getAncestorPaths(event.node.path)) {
        nextExpanded.add(anc);
      }
      const nextBadges = new Map(state.recentBadges);
      nextBadges.set(event.node.path, "NEW");
      const { rows, hasAnyExpandedFolder } = buildFlatRows({
        vault,
        sortOrder: state.sortOrder,
        filterQuery: state.filterQuery,
        expandedPaths: nextExpanded,
        selectedPaths: state.selectedPaths,
        focusedPath: state.focusedPath,
        activeFilePath: state.activeFilePath,
        renamePath: state.renameState?.path ?? null,
        recentBadges: nextBadges,
      });
      store.setState({
        expandedPaths: nextExpanded,
        recentBadges: nextBadges,
        rows,
        hasAnyExpandedFolder,
        revision: state.revision + 1,
      });
      return;
    }

    if (event.type === "rename") {
      const mapping = new Map(event.affectedMap.map((m) => [m.oldPath, m.newPath]));
      const remap = (p: string | null): string | null => (p ? (mapping.get(p) ?? p) : null);

      const nextExpanded = new Set<string>();
      for (const p of state.expandedPaths) {
        nextExpanded.add(mapping.get(p) ?? p);
      }
      const nextSelected = new Set<string>();
      for (const p of state.selectedPaths) {
        nextSelected.add(mapping.get(p) ?? p);
      }
      const nextBadges = new Map<string, ExplorerRecentBadge>();
      for (const [k, v] of state.recentBadges.entries()) {
        nextBadges.set(mapping.get(k) ?? k, v);
      }

      const nextRename =
        state.renameState && mapping.has(state.renameState.path)
          ? null
          : state.renameState;

      const { rows, hasAnyExpandedFolder } = buildFlatRows({
        vault,
        sortOrder: state.sortOrder,
        filterQuery: state.filterQuery,
        expandedPaths: nextExpanded,
        selectedPaths: nextSelected,
        focusedPath: remap(state.focusedPath),
        activeFilePath: remap(state.activeFilePath),
        renamePath: nextRename?.path ?? null,
        recentBadges: nextBadges,
      });

      store.setState({
        expandedPaths: nextExpanded,
        selectedPaths: nextSelected,
        selectionAnchorPath: remap(state.selectionAnchorPath),
        focusedPath: remap(state.focusedPath),
        activeFilePath: remap(state.activeFilePath),
        renameState: nextRename,
        recentBadges: nextBadges,
        rows,
        hasAnyExpandedFolder,
        revision: state.revision + 1,
      });
      return;
    }

    if (event.type === "delete") {
      const deletedSet = new Set(event.affectedPaths);
      const nextExpanded = new Set(
        Array.from(state.expandedPaths).filter((p) => !deletedSet.has(p))
      );
      const nextSelected = new Set(
        Array.from(state.selectedPaths).filter((p) => !deletedSet.has(p))
      );
      const nextBadges = new Map<string, ExplorerRecentBadge>();
      for (const [k, v] of state.recentBadges.entries()) {
        if (!deletedSet.has(k)) nextBadges.set(k, v);
      }
      const nextFocused =
        state.focusedPath && deletedSet.has(state.focusedPath) ? null : state.focusedPath;
      const nextAnchor =
        state.selectionAnchorPath && deletedSet.has(state.selectionAnchorPath)
          ? null
          : state.selectionAnchorPath;
      const nextActive =
        state.activeFilePath && deletedSet.has(state.activeFilePath) ? null : state.activeFilePath;
      const nextRename =
        state.renameState && deletedSet.has(state.renameState.path) ? null : state.renameState;

      const { rows, hasAnyExpandedFolder } = buildFlatRows({
        vault,
        sortOrder: state.sortOrder,
        filterQuery: state.filterQuery,
        expandedPaths: nextExpanded,
        selectedPaths: nextSelected,
        focusedPath: nextFocused,
        activeFilePath: nextActive,
        renamePath: nextRename?.path ?? null,
        recentBadges: nextBadges,
      });

      store.setState({
        expandedPaths: nextExpanded,
        selectedPaths: nextSelected,
        selectionAnchorPath: nextAnchor,
        focusedPath: nextFocused,
        activeFilePath: nextActive,
        renameState: nextRename,
        recentBadges: nextBadges,
        rows,
        hasAnyExpandedFolder,
        revision: state.revision + 1,
      });
      return;
    }

    state.refresh();
  });

  return store;
}
