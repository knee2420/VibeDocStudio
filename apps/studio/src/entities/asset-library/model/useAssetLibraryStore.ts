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

export type FloatingToolId =
  | "select"
  | "hand"
  | "frame"
  | "section"
  | "rectangle"
  | "pen"
  | "text"
  | "resources"
  | "comment"
  | "ai";

export interface SectionAssetBlockSnapshot {
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
}

export interface SectionAssetItem {
  id: string;
  name: string;
  description: string;
  blocks: SectionAssetBlockSnapshot[];
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
  sectionAssets: SectionAssetItem[];
  setActiveTool: (tool: FloatingToolId) => void;
  createSectionFromSelection: (
    doc: VDocDocument,
    unitIds: string[],
    customName?: string,
  ) => SectionAssetItem | null;
  insertSectionIntoPage: (sectionId: string, pageId: string, atIndex?: number) => boolean;
  removeSectionAsset: (sectionId: string) => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => ({
  activeTool: "select",
  sectionAssets: [],

  setActiveTool: (tool) => set({ activeTool: tool }),

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
      slotCount,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({ sectionAssets: [item, ...state.sectionAssets] }));
    return item;
  },

  insertSectionIntoPage: (sectionId, pageId, atIndex) => {
    const section = get().sectionAssets.find((s) => s.id === sectionId);
    if (!section || !pageId) return false;

    const store = useStudioDocumentStore.getState();
    const doc = store.docs.find((d) => d.docId === store.activeDocId);
    if (!doc) return false;

    return store.updateDoc(
      doc.docId,
      (prev) => {
        let next = prev;
        section.blocks.forEach((snap, idx) => {
          const cloned = cloneBlockWithSlots(snap.block, snap.slots, randomId, { copySuffix: false });
          const targetIdx = atIndex !== undefined ? atIndex + idx : undefined;
          next = insertBlock(next, pageId, cloned.block, cloned.slots, targetIdx);
        });
        return next;
      },
      { history: true, label: `섹션 에셋 '${section.name}' 삽입` },
    );
  },

  removeSectionAsset: (sectionId) =>
    set((state) => ({
      sectionAssets: state.sectionAssets.filter((s) => s.id !== sectionId),
    })),
}));
