import { create } from "zustand";

import {
  cloneBlockWithSlots,
  getBlockSlotIds,
  insertBlock,
  type LayoutBlock,
  type VDocDocument,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { htmlToPlain } from "@/shared/lib";

/**
 * 캔버스 도구 (피그마 툴바와 같다).
 * - `select` 이동 · 선택 (V) · `hand` 화면 이동 (H)
 * - `section` 드래그한 범위를 섹션 에셋으로 저장
 * - `place` 블록 배치: 툴바 · 에셋에서 고른 블록(`placement`)을 캔버스를 클릭한 자리에 넣는다.
 *   고르자마자 넣지 않는다 — 피그마처럼 커서가 십자로 바뀌고, 넣을 자리를 클릭하면 들어간 뒤 이동 도구로 돌아간다.
 */
export type FloatingToolId = "select" | "hand" | "section" | "place";

/** 배치할 블록: 기본 블록 kind 또는 `section-asset:<id>`. */
export interface PlacementTool {
  kind: string;
  label: string;
}

export interface SectionAssetBlockSnapshot {
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
}

export interface SectionAssetItem {
  id: string;
  name: string;
  description: string;
  /** 저장한 틀: 글자는 "제목을 입력하세요" 같은 자리 표시, 이미지는 비움 (빈 칸으로 삽입할 때 · 예시를 채울 구조). */
  blocks: SectionAssetBlockSnapshot[];
  /** 감싼 영역의 원본 내용 그대로 (원본 그대로 삽입 · 미리보기). 이 필드가 없는 옛 에셋은 원본 선택지가 없다. */
  originalBlocks?: SectionAssetBlockSnapshot[];
  slotCount: number;
  createdAt: string;
}

const randomId = () => `s_${Math.random().toString(36).slice(2, 10)}`;

function templatizeSlotHtml(html: string, blockKind: LayoutBlock["kind"]): string {
  if (!html) return "<p>내용을 입력하세요</p>";
  if (typeof DOMParser === "undefined") {
    return blockKind === "heading" || blockKind === "form-title"
      ? "<h2>제목을 입력하세요</h2>"
      : "<p>본문 내용을 입력하세요.</p>";
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const topNodes = Array.from(doc.body.children);
  if (topNodes.length === 0) {
    return blockKind === "heading" || blockKind === "form-title"
      ? "<h2>제목을 입력하세요</h2>"
      : "<p>본문 내용을 입력하세요.</p>";
  }

  const out: string[] = [];
  for (const el of topNodes.slice(0, 4)) {
    const tag = el.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      el.textContent = "제목을 입력하세요";
      out.push(el.outerHTML);
    } else if (tag === "ul" || tag === "ol") {
      const items = Array.from(el.querySelectorAll("li")).slice(0, 3);
      el.innerHTML = "";
      const count = Math.max(1, items.length);
      for (let i = 0; i < count; i++) {
        const li = doc.createElement("li");
        li.textContent = "항목을 입력하세요";
        el.appendChild(li);
      }
      out.push(el.outerHTML);
    } else {
      el.textContent =
        blockKind === "heading" || blockKind === "form-title"
          ? "제목을 입력하세요"
          : "본문 내용을 입력하세요.";
      out.push(el.outerHTML);
    }
  }
  return out.join("");
}

function templatizeBlock(rawBlock: LayoutBlock): LayoutBlock {
  const block = structuredClone(rawBlock);
  if (block.kind === "image") {
    return {
      ...block,
      src: "",
      alt: "",
      caption: block.caption ? "이미지 설명을 입력하세요" : undefined,
    };
  }
  if (block.kind === "columns-grid" && Array.isArray(block.columns)) {
    return {
      ...block,
      columns: block.columns.map((col) =>
        col.image ? { ...col, image: { ...col.image, src: "", alt: "" } } : col,
      ),
    };
  }
  if (block.kind === "hero") {
    return { ...block, image: undefined };
  }
  return block;
}

function deriveSectionName(
  blocks: SectionAssetBlockSnapshot[],
  fallbackIndex: number,
): string {
  for (const entry of blocks) {
    for (const sid of getBlockSlotIds(entry.block)) {
      const slot = entry.slots[sid];
      if (!slot) continue;
      const plain = htmlToPlain(slot.content).trim();
      if (plain) {
        return plain.length > 24 ? `${plain.slice(0, 24)}…` : plain;
      }
    }
  }
  return `새 섹션 ${fallbackIndex}`;
}

interface AssetLibraryState {
  activeTool: FloatingToolId;
  /** `place` 도구일 때 배치할 블록. */
  placement: PlacementTool | null;
  sectionAssets: SectionAssetItem[];
  setActiveTool: (tool: Exclude<FloatingToolId, "place">) => void;
  /** 블록 배치 도구로 바꾼다 (같은 블록을 다시 고르면 이동 도구로 돌아간다). */
  armPlacement: (placement: PlacementTool) => void;
  createSectionFromSelection: (
    doc: VDocDocument,
    unitIds: string[],
    customName?: string,
  ) => SectionAssetItem | null;
  insertSectionIntoPage: (sectionId: string, pageId: string, atIndex?: number) => boolean;
  /** 블록 묶음을 새 id 로 복제해 페이지에 넣고, 넣은 블록 id 를 돌려준다 (에셋 미리보기 · 삽입 공통). */
  insertSnapshotsIntoPage: (
    snapshots: readonly SectionAssetBlockSnapshot[],
    pageId: string,
    atIndex?: number,
    label?: string,
  ) => string[];
  removeSectionAsset: (sectionId: string) => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => ({
  activeTool: "select",
  placement: null,
  sectionAssets: [],

  setActiveTool: (tool) => set({ activeTool: tool, placement: null }),
  armPlacement: (placement) =>
    set((s) =>
      s.activeTool === "place" && s.placement?.kind === placement.kind
        ? { activeTool: "select", placement: null }
        : { activeTool: "place", placement }
    ),

  createSectionFromSelection: (doc, unitIds, customName) => {
    if (unitIds.length === 0) return null;
    const wanted = new Set(unitIds);
    const matchedBlocks: LayoutBlock[] = [];
    const seenBlockIds = new Set<string>();

    for (const page of doc.pages) {
      for (const block of page.blocks) {
        if (seenBlockIds.has(block.blockId)) continue;
        const slotIds = getBlockSlotIds(block);
        if (wanted.has(block.blockId) || slotIds.some((sid) => wanted.has(sid))) {
          seenBlockIds.add(block.blockId);
          matchedBlocks.push(block);
        }
      }
    }

    if (matchedBlocks.length === 0) return null;

    const rawSnapshots: SectionAssetBlockSnapshot[] = matchedBlocks.map((block) => {
      const slots: Record<string, VDocSlot> = {};
      for (const sid of getBlockSlotIds(block)) {
        if (doc.slots[sid]) {
          slots[sid] = { ...doc.slots[sid] };
        }
      }
      return { block, slots };
    });

    const nextIndex = get().sectionAssets.length + 1;
    const name = customName?.trim() || deriveSectionName(rawSnapshots, nextIndex);

    const snapshots: SectionAssetBlockSnapshot[] = rawSnapshots.map(({ block, slots }) => {
      const templatedSlots: Record<string, VDocSlot> = {};
      for (const [sid, slot] of Object.entries(slots)) {
        templatedSlots[sid] = {
          ...slot,
          content: templatizeSlotHtml(slot.content, block.kind),
        };
      }
      return {
        block: templatizeBlock(block),
        slots: templatedSlots,
      };
    });

    const slotCount = snapshots.reduce((sum, s) => sum + getBlockSlotIds(s.block).length, 0);

    const item: SectionAssetItem = {
      id: `sec_asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: `${snapshots.length}개 블록 · ${slotCount}개 슬롯 섹션`,
      blocks: snapshots,
      originalBlocks: rawSnapshots.map(({ block, slots }) => ({ block: structuredClone(block), slots: structuredClone(slots) })),
      slotCount,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({ sectionAssets: [item, ...state.sectionAssets] }));
    return item;
  },

  insertSectionIntoPage: (sectionId, pageId, atIndex) => {
    const section = get().sectionAssets.find((s) => s.id === sectionId);
    if (!section || !pageId) return false;
    return get().insertSnapshotsIntoPage(section.blocks, pageId, atIndex, `섹션 에셋 '${section.name}' 삽입`).length > 0;
  },

  insertSnapshotsIntoPage: (snapshots, pageId, atIndex, label) => {
    if (!pageId || snapshots.length === 0) return [];
    const store = useStudioDocumentStore.getState();
    const doc = store.docs.find((d) => d.docId === store.activeDocId);
    if (!doc) return [];
    const inserted: string[] = [];
    const ok = store.updateDoc(
      doc.docId,
      (prev) => {
        let next = prev;
        snapshots.forEach((snap, idx) => {
          const cloned = cloneBlockWithSlots(snap.block, snap.slots, randomId, { copySuffix: false });
          const targetIdx = atIndex !== undefined ? atIndex + idx : undefined;
          next = insertBlock(next, pageId, cloned.block, cloned.slots, targetIdx);
          inserted.push(cloned.block.blockId);
        });
        return next;
      },
      { history: true, label: label ?? "에셋 삽입" },
    );
    return ok ? inserted : [];
  },

  removeSectionAsset: (sectionId) =>
    set((state) => ({
      sectionAssets: state.sectionAssets.filter((s) => s.id !== sectionId),
    })),
}));
