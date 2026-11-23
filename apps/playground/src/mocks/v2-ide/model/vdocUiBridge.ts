import type { SceneGraphNodeRole } from "@vibe/vdoc-schema";
import { createStore, type StoreApi } from "zustand/vanilla";

export interface SceneNodePointer {
  readonly id: string;
  readonly role: SceneGraphNodeRole;
}

export interface VDocCanvasUiState {
  readonly activePageId: string | null;
  readonly selectedBlockId: string | null;
  readonly selectedSlotId: string | null;
  readonly selectedSceneNode: SceneNodePointer | null;
  readonly hoveredBlockId: string | null;
  readonly hoveredSceneNode: SceneNodePointer | null;
  readonly hiddenBlockIds: ReadonlySet<string>;
  readonly scrollSeq: number;
  readonly scrollTargetId: string | null;
}

export interface VDocUiBridgeStoreState {
  readonly byPath: Readonly<Record<string, VDocCanvasUiState>>;

  getForPath(path: string): VDocCanvasUiState;
  setActivePage(path: string, pageId: string | null): void;
  selectBlock(path: string, blockId: string | null, pageId?: string): void;
  selectSlot(path: string, slotId: string | null, blockId?: string | null, pageId?: string): void;
  selectSceneNode(
    path: string,
    node: {
      readonly id: string;
      readonly role: SceneGraphNodeRole;
      readonly selectBlockId: string;
      readonly selectSlotId?: string;
    } | null,
    pageId?: string
  ): void;
  setHoveredBlock(path: string, blockId: string | null): void;
  setHoveredSceneNode(
    path: string,
    node: {
      readonly id: string;
      readonly role: SceneGraphNodeRole;
      readonly selectBlockId: string;
    } | null
  ): void;
  toggleHiddenBlock(path: string, blockId: string): void;
  requestScrollTo(path: string, targetId: string, pageId?: string): void;
  remapPath(oldPath: string, newPath: string): void;
}

const EMPTY_UI_STATE: VDocCanvasUiState = {
  activePageId: null,
  selectedBlockId: null,
  selectedSlotId: null,
  selectedSceneNode: null,
  hoveredBlockId: null,
  hoveredSceneNode: null,
  hiddenBlockIds: new Set<string>(),
  scrollSeq: 0,
  scrollTargetId: null,
};

export type VDocUiBridgeStore = StoreApi<VDocUiBridgeStoreState>;

export function createVDocUiBridgeStore(): VDocUiBridgeStore {
  return createStore<VDocUiBridgeStoreState>((set, get) => {
    const patchPath = (path: string, updater: (cur: VDocCanvasUiState) => VDocCanvasUiState) => {
      const cur = get().byPath[path] ?? EMPTY_UI_STATE;
      set({
        byPath: {
          ...get().byPath,
          [path]: updater(cur),
        },
      });
    };

    return {
      byPath: {},

      getForPath(path) {
        return get().byPath[path] ?? EMPTY_UI_STATE;
      },

      setActivePage(path, pageId) {
        patchPath(path, (cur) => ({ ...cur, activePageId: pageId }));
      },

      selectBlock(path, blockId, pageId) {
        patchPath(path, (cur) => ({
          ...cur,
          activePageId: pageId ?? cur.activePageId,
          selectedBlockId: blockId,
          selectedSlotId: null,
          selectedSceneNode: blockId ? { id: blockId, role: "block" } : null,
        }));
      },

      selectSlot(path, slotId, blockId, pageId) {
        patchPath(path, (cur) => ({
          ...cur,
          activePageId: pageId ?? cur.activePageId,
          selectedBlockId: blockId !== undefined ? blockId : cur.selectedBlockId,
          selectedSlotId: slotId,
          selectedSceneNode: slotId ? { id: slotId, role: "slot" } : null,
        }));
      },

      selectSceneNode(path, node, pageId) {
        patchPath(path, (cur) => {
          if (!node) {
            return {
              ...cur,
              activePageId: pageId ?? cur.activePageId,
              selectedBlockId: null,
              selectedSlotId: null,
              selectedSceneNode: null,
            };
          }
          return {
            ...cur,
            activePageId: pageId ?? cur.activePageId,
            selectedBlockId: node.selectBlockId,
            selectedSlotId: node.role === "block" ? null : (node.selectSlotId ?? null),
            selectedSceneNode: { id: node.id, role: node.role },
          };
        });
      },

      setHoveredBlock(path, blockId) {
        patchPath(path, (cur) =>
          cur.hoveredBlockId === blockId &&
          (cur.hoveredSceneNode?.id ?? null) === blockId &&
          (cur.hoveredSceneNode?.role ?? null) === (blockId ? "block" : null)
            ? cur
            : {
                ...cur,
                hoveredBlockId: blockId,
                hoveredSceneNode: blockId ? { id: blockId, role: "block" } : null,
              }
        );
      },

      setHoveredSceneNode(path, node) {
        patchPath(path, (cur) => {
          const nextId = node?.id ?? null;
          const nextRole = node?.role ?? null;
          if (
            (cur.hoveredSceneNode?.id ?? null) === nextId &&
            (cur.hoveredSceneNode?.role ?? null) === nextRole
          ) {
            return cur;
          }
          return {
            ...cur,
            hoveredBlockId: node?.role === "block" ? node.selectBlockId : null,
            hoveredSceneNode: node ? { id: node.id, role: node.role } : null,
          };
        });
      },

      toggleHiddenBlock(path, blockId) {
        patchPath(path, (cur) => {
          const next = new Set(cur.hiddenBlockIds);
          if (next.has(blockId)) next.delete(blockId);
          else next.add(blockId);
          return { ...cur, hiddenBlockIds: next };
        });
      },

      requestScrollTo(path, targetId, pageId) {
        patchPath(path, (cur) => ({
          ...cur,
          activePageId: pageId ?? cur.activePageId,
          scrollTargetId: targetId,
          scrollSeq: cur.scrollSeq + 1,
        }));
      },

      remapPath(oldPath, newPath) {
        const cur = get().byPath[oldPath];
        if (!cur) return;
        const next = { ...get().byPath };
        delete next[oldPath];
        next[newPath] = cur;
        set({ byPath: next });
      },
    };
  });
}
