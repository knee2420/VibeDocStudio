/**
 * 문서 캔버스 화면 상태 (볼트 경로별) — 작업 모드 · 활성 쪽 · 다중 선택 · 호버 · 숨김 · 스크롤 요청 · 에셋 미리보기.
 *
 * 선택은 `@vibe/selection-core` 의 선택 집합 하나가 진실이다. `selectedBlockId` · `selectedSlotId` ·
 * `selectedSceneNode` 는 그 집합의 주 항목에서 끌어낸 값이다 (편집 · 인스펙터 · 단일 선택 화면이 그대로 쓴다).
 * 바뀐 것이 없으면 저장소에 쓰지 않는다 — 구독자가 헛되이 깨어나지 않는다.
 */
import {
  applyIntent,
  emptySelection,
  primaryItem,
  selectOnly,
  setSelection,
  type SelectIntent,
  type SelectionSet,
} from "@vibe/selection-core";
import type { StagedAssetPreviewState } from "@vibe/vault-formats";
import type { SceneGraphNodeRole } from "@vibe/vdoc-schema";
import { createStore, type StoreApi } from "zustand/vanilla";

export type VDocWorkMode = "Structure" | "Design" | "Preview";

export interface SceneNodePointer {
  readonly id: string;
  readonly role: SceneGraphNodeRole;
}

/** 캔버스에서 고른 것 하나. `kind` 는 장면 노드 역할, `blockId` 는 그 노드를 품은 블록 (블록이면 자기 자신). */
export interface CanvasSelectionItem {
  readonly id: string;
  readonly kind: SceneGraphNodeRole;
  readonly blockId?: string | null;
  readonly pageId?: string | null;
}

export type CanvasSelection = SelectionSet<CanvasSelectionItem>;

export interface VDocCanvasUiState {
  readonly workMode: VDocWorkMode | null;
  readonly activePageId: string | null;
  /** 다중 선택 (고른 순서). */
  readonly selection: CanvasSelection;
  /** 주 항목의 블록 (주 항목이 칸이면 그 칸을 품은 블록). */
  readonly selectedBlockId: string | null;
  /** 주 항목이 칸일 때 그 칸. */
  readonly selectedSlotId: string | null;
  readonly selectedSceneNode: SceneNodePointer | null;
  readonly hoveredBlockId: string | null;
  readonly hoveredSceneNode: SceneNodePointer | null;
  readonly hiddenBlockIds: ReadonlySet<string>;
  readonly scrollSeq: number;
  readonly scrollTargetId: string | null;
  readonly stagedAssetPreview: StagedAssetPreviewState | null;
}

export interface VDocUiBridgeStoreState {
  readonly byPath: Readonly<Record<string, VDocCanvasUiState>>;

  getForPath(path: string): VDocCanvasUiState;
  setWorkMode(path: string, mode: VDocWorkMode): void;
  setActivePage(path: string, pageId: string | null): void;
  /** 블록 하나만 고른다 (null 이면 선택 해제). */
  selectBlock(path: string, blockId: string | null, pageId?: string): void;
  /** 칸 하나만 고른다. */
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
  /** 선택 집합을 통째로 바꾼다 (마키 · 구조 패널 · AI 강조). `primaryId` 가 없으면 마지막 항목. */
  setSelection(path: string, items: readonly CanvasSelectionItem[], primaryId?: string | null): void;
  /** 클릭 + 보조키 의도로 선택을 바꾼다 (`order` = 범위 선택에 쓰는 읽는 순서). */
  applySelectIntent(path: string, intent: SelectIntent, item: CanvasSelectionItem, order?: readonly CanvasSelectionItem[]): void;
  clearSelection(path: string): void;
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
  setStagedAssetPreview(path: string, preview: StagedAssetPreviewState | null): void;
  clearStagedAssetPreview(path: string): void;
  remapPath(oldPath: string, newPath: string): void;
}

const EMPTY_UI_STATE: VDocCanvasUiState = {
  workMode: null,
  activePageId: null,
  selection: emptySelection<CanvasSelectionItem>(),
  selectedBlockId: null,
  selectedSlotId: null,
  selectedSceneNode: null,
  hoveredBlockId: null,
  hoveredSceneNode: null,
  hiddenBlockIds: new Set<string>(),
  scrollSeq: 0,
  scrollTargetId: null,
  stagedAssetPreview: null,
};

export type VDocUiBridgeStore = StoreApi<VDocUiBridgeStoreState>;

/** 선택 집합 → 주 항목 파생 값. 집합이 그대로면 이전 상태를 그대로 돌려준다. */
function withSelection(cur: VDocCanvasUiState, selection: CanvasSelection, pageId?: string | null): VDocCanvasUiState {
  const primary = primaryItem(selection);
  const selectedBlockId = primary ? (primary.kind === "block" ? primary.id : (primary.blockId ?? null)) : null;
  const selectedSlotId = primary && primary.kind === "slot" ? primary.id : null;
  const activePageId = pageId ?? primary?.pageId ?? cur.activePageId;
  const sceneSame =
    (cur.selectedSceneNode?.id ?? null) === (primary?.id ?? null) &&
    (cur.selectedSceneNode?.role ?? null) === (primary?.kind ?? null);
  if (
    cur.selection === selection &&
    cur.selectedBlockId === selectedBlockId &&
    cur.selectedSlotId === selectedSlotId &&
    cur.activePageId === activePageId &&
    sceneSame
  ) {
    return cur;
  }
  return {
    ...cur,
    activePageId,
    selection,
    selectedBlockId,
    selectedSlotId,
    selectedSceneNode: sceneSame ? cur.selectedSceneNode : primary ? { id: primary.id, role: primary.kind } : null,
  };
}

export function createVDocUiBridgeStore(): VDocUiBridgeStore {
  return createStore<VDocUiBridgeStoreState>((set, get) => {
    const patchPath = (path: string, updater: (cur: VDocCanvasUiState) => VDocCanvasUiState) => {
      const cur = get().byPath[path] ?? EMPTY_UI_STATE;
      const next = updater(cur);
      if (next === cur) return;
      set({ byPath: { ...get().byPath, [path]: next } });
    };

    return {
      byPath: {},

      getForPath(path) {
        return get().byPath[path] ?? EMPTY_UI_STATE;
      },

      setWorkMode(path, mode) {
        patchPath(path, (cur) => (cur.workMode === mode ? cur : { ...cur, workMode: mode }));
      },

      setActivePage(path, pageId) {
        patchPath(path, (cur) => (cur.activePageId === pageId ? cur : { ...cur, activePageId: pageId }));
      },

      selectBlock(path, blockId, pageId) {
        patchPath(path, (cur) =>
          withSelection(cur, selectOnly(cur.selection, blockId ? { id: blockId, kind: "block", blockId, pageId } : null), pageId)
        );
      },

      selectSlot(path, slotId, blockId, pageId) {
        patchPath(path, (cur) => {
          if (!slotId) {
            // 칸만 풀고 블록 선택은 둔다 (예전 동작)
            const owner = blockId !== undefined ? blockId : cur.selectedBlockId;
            return withSelection(cur, selectOnly(cur.selection, owner ? { id: owner, kind: "block", blockId: owner, pageId } : null), pageId);
          }
          const owner = blockId !== undefined ? blockId : cur.selectedBlockId;
          return withSelection(cur, selectOnly(cur.selection, { id: slotId, kind: "slot", blockId: owner, pageId }), pageId);
        });
      },

      selectSceneNode(path, node, pageId) {
        patchPath(path, (cur) => {
          if (!node) return withSelection(cur, emptySelection(), pageId);
          const item: CanvasSelectionItem =
            node.role === "block"
              ? { id: node.selectBlockId, kind: "block", blockId: node.selectBlockId, pageId }
              : { id: node.id, kind: node.role, blockId: node.selectBlockId, pageId };
          const next = withSelection(cur, selectOnly(cur.selection, item), pageId);
          // 표 하위 노드(행 · 칸 · 열 · 미디어)를 고르면 그 칸을 편집 대상으로 둔다 (예전 동작)
          if (node.role !== "block" && node.role !== "slot" && node.selectSlotId && next.selectedSlotId !== node.selectSlotId) {
            return { ...next, selectedSlotId: node.selectSlotId, selectedSceneNode: { id: node.id, role: node.role } };
          }
          return next;
        });
      },

      setSelection(path, items, primaryId) {
        patchPath(path, (cur) => {
          const primary = primaryId === undefined ? undefined : primaryId === null ? null : items.find((i) => i.id === primaryId);
          const primaryKey = primary === undefined ? undefined : primary ? `${primary.kind}:${primary.id}` : null;
          return withSelection(cur, setSelection(cur.selection, items, primaryKey));
        });
      },

      applySelectIntent(path, intent, item, order = []) {
        patchPath(path, (cur) => withSelection(cur, applyIntent(cur.selection, intent, item, order)));
      },

      clearSelection(path) {
        patchPath(path, (cur) => withSelection(cur, emptySelection()));
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
          if ((cur.hoveredSceneNode?.id ?? null) === nextId && (cur.hoveredSceneNode?.role ?? null) === nextRole) {
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

      setStagedAssetPreview(path, preview) {
        patchPath(path, (cur) => (cur.stagedAssetPreview === preview ? cur : { ...cur, stagedAssetPreview: preview }));
      },

      clearStagedAssetPreview(path) {
        patchPath(path, (cur) => (cur.stagedAssetPreview === null ? cur : { ...cur, stagedAssetPreview: null }));
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

/** 지금 선택에서 종류별 id (고른 순서). */
export function canvasSelectedIds(state: Pick<VDocCanvasUiState, "selection">, kind: SceneGraphNodeRole): string[] {
  return state.selection.items.filter((i) => i.kind === kind).map((i) => i.id);
}
