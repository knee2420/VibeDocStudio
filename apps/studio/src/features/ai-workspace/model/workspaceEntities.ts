/**
 * 화면 요소 해석기 — AI 답변 속 위치 칩 · 첨부 칩이 id 하나로 "무엇인지 · 어디인지"를 찾는다.
 * 호버: `highlightedEntityId` 로 캔버스 · 아웃라이너 · 참조 덱을 강조 / 클릭: 그 위치로 이동 · 선택.
 */
import type { EntityInfo, EntityResolver } from "@vibe/ai-kernel";
import {
  buildProjectFractalTree,
  type LayoutBlock,
  type OutlinerNode,
  type VDocDocument,
  type VDocPage,
} from "@vibe/vdoc-schema";

import { findReferenceItem, findReferencePin, referenceNumber, useReferenceStore } from "@/entities/reference-manager";
import { flattenResourceItems, type ResourceItem, type ResourceSector, useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { revealCanvasElement, scrollToCanvasPage } from "@/shared/lib";

import { useReferenceRegionStore } from "./attach";
import {
  backdataRef,
  blockKindLabel,
  blockRef,
  docIndex,
  findDoc,
  findInDocs,
  outlineNodeRef,
  pageRef,
  referenceRef,
  referenceRegionRef,
  slotRef,
} from "./contextBuilders";

// --- 강조 · 이동 ---------------------------------------------------------------------------

let highlightTimer: number | undefined;

/** 호버 강조. 끄는 쪽은 살짝 늦춰서 칩 사이를 옮겨 다닐 때 깜빡이지 않게 한다. */
function highlight(id: string, on: boolean): void {
  const session = useWorkspaceSessionStore.getState();
  window.clearTimeout(highlightTimer);
  if (on) session.setHighlightedEntityId(id);
  else
    highlightTimer = window.setTimeout(() => {
      if (useWorkspaceSessionStore.getState().highlightedEntityId === id) session.setHighlightedEntityId(null);
    }, 60);
}

/** 레퍼런스 · 핀 · 영역 클릭 시 레퍼런스 뷰어를 활성화하고 화면에 띄운다 (에디터 문서는 바꾸지 않는다). */
export function revealReferenceViewer(refId: string): void {
  useReferenceStore.getState().setActiveRefId(refId);
  const layout = useWorkspaceLayoutStore.getState();
  if (layout.refPlacement === "split") {
    useWorkspaceSessionStore.getState().openReference(refId);
    if (layout.refSplitCollapsed) {
      layout.setRefSplitCollapsed(false);
    }
  } else {
    layout.setRefViewerOpen(true);
    layout.setLeftSidebarOpen(true);
    layout.setLeftPanelTab("reference-manager");
  }
}

function ensureDrafting(): void {
  const session = useWorkspaceSessionStore.getState();
  if (session.currentPhase !== "drafting") session.setPhase("drafting");
}

function openDoc(doc: VDocDocument): boolean {
  const docs = useStudioDocumentStore.getState();
  if (docs.activeDocId !== doc.docId) docs.setActiveDocId(doc.docId);
  return true;
}

function revealPage(doc: VDocDocument, page: VDocPage): void {
  if (!openDoc(doc)) return;
  ensureDrafting();
  useStudioDocumentStore.getState().setActivePageId(page.pageId);
  scrollToCanvasPage(page.pageId);
}

function revealBlock(doc: VDocDocument, page: VDocPage, block: LayoutBlock): void {
  if (!openDoc(doc)) return;
  ensureDrafting();
  const docs = useStudioDocumentStore.getState();
  if (docs.activePageId !== page.pageId) {
    docs.setActivePageId(page.pageId);
    scrollToCanvasPage(page.pageId);
  }
  useSlotSelectionStore.getState().setSelectedBlockId(block.blockId);
  const node = outlineNodes().find((n) => n.targetBlockId === block.blockId && !n.targetSlotId);
  if (node) useWorkspaceSessionStore.getState().setSelectedOutlinerNodeId(node.nodeId);
  revealCanvasElement({ blockId: block.blockId });
}

function revealSlot(doc: VDocDocument, slotId: string): void {
  if (!openDoc(doc)) return;
  ensureDrafting();
  const index = docIndex(doc);
  const blockId = index.slotBlock.get(slotId);
  const page = blockId ? index.blocks.get(blockId)?.page : undefined;
  const docs = useStudioDocumentStore.getState();
  if (page && docs.activePageId !== page.pageId) {
    docs.setActivePageId(page.pageId);
    scrollToCanvasPage(page.pageId);
  }
  useSlotSelectionStore.getState().setSelectedSlotId(slotId);
  const node = outlineNodes().find((n) => n.targetSlotId === slotId);
  if (node) useWorkspaceSessionStore.getState().setSelectedOutlinerNodeId(node.nodeId);
  revealCanvasElement({ slotId });
}

// --- 참조 문서 · 아웃라인 ------------------------------------------------------------------

let outlineCache: { key: unknown[]; nodes: OutlinerNode[] } | null = null;

/** 현재 프로젝트의 아웃라인 전체 (줌 · 필터 무시). */
export function outlineNodes(): OutlinerNode[] {
  const project = selectActiveProject(useProjectStore.getState());
  const docs = useStudioDocumentStore.getState().docs;
  if (!project) return [];
  const key = [project, docs];
  if (outlineCache && outlineCache.key.every((v, i) => v === key[i])) return outlineCache.nodes;
  const nodes = buildProjectFractalTree(project, docs, null, "", []).allNodes;
  outlineCache = { key, nodes };
  return nodes;
}

// --- 해석기 -------------------------------------------------------------------------------

const pageResolver: EntityResolver = {
  id: "page",
  resolve(id, kind) {
    if (kind && kind !== "page") return null;
    const found = findInDocs((d) => docIndex(d).pages.get(id));
    if (!found) return null;
    const { doc, value: page } = found;
    const number = doc.pages.indexOf(page) + 1;
    return {
      kind: "page",
      id,
      label: page.pageLabel || `Page ${number}`,
      detail: `${number}p`,
      reveal: () => revealPage(doc, page),
      highlight: (on) => highlight(id, on),
      toContext: () => pageRef(doc, page),
    };
  },
};

const blockResolver: EntityResolver = {
  id: "block",
  resolve(id, kind) {
    if (kind && kind !== "block") return null;
    const found = findInDocs((d) => docIndex(d).blocks.get(id));
    if (!found) return null;
    const { doc, value } = found;
    const number = doc.pages.indexOf(value.page) + 1;
    return {
      kind: "block",
      id,
      label: value.block.title || `${blockKindLabel(value.block.kind)} 블록`,
      detail: `${number}p · ${blockKindLabel(value.block.kind)}`,
      reveal: () => revealBlock(doc, value.page, value.block),
      highlight: (on) => highlight(id, on),
      toContext: () => blockRef(doc, value.page, value.block),
    };
  },
};

const slotResolver: EntityResolver = {
  id: "slot",
  resolve(id, kind) {
    if (kind && kind !== "slot") return null;
    const found = findInDocs((d) => d.slots[id]);
    if (!found) return null;
    const { doc, value: slot } = found;
    return {
      kind: "slot",
      id,
      label: slot.label,
      reveal: () => revealSlot(doc, id),
      highlight: (on) => highlight(id, on),
      toContext: () => slotRef(doc, slot),
    };
  },
};

const docResolver: EntityResolver = {
  id: "doc",
  resolve(id, kind) {
    if (kind && kind !== "doc" && kind !== "document") return null;
    const doc = findDoc(id);
    if (!doc) return null;
    return {
      kind: "document",
      id,
      label: doc.title,
      detail: `${doc.pages.length}p`,
      reveal: () => useStudioDocumentStore.getState().setActiveDocId(id),
      highlight: (on) => highlight(id, on),
      toContext: () => ({ kind: "document", id, label: doc.title, access: "read" }),
    };
  },
};

/** 레퍼런스 (라이브러리 refId 또는 `ref:<refId>`) — 작업 문서가 아니므로 뷰어로만 연다. */
const referenceResolver: EntityResolver = {
  id: "reference",
  resolve(id, kind) {
    if (kind && kind !== "reference" && kind !== "ref") return null;
    const refId = id.startsWith("ref:") ? id.slice(4).split("#")[0] : id;
    const item = findReferenceItem(refId);
    if (!item) return null;
    const number = referenceNumber(refId);
    return {
      kind: "reference",
      id: refId,
      label: `${number ? `참조${number}: ` : ""}${item.title}`,
      detail: "레퍼런스",
      reveal: () => revealReferenceViewer(refId),
      highlight: (on) => highlight(refId, on),
      toContext: () => referenceRef(refId),
    };
  },
};

const backdataResolver: EntityResolver = {
  id: "backdata",
  resolve(id, kind) {
    if (kind && kind !== "backdata") return null;
    const found = findInDocs((d) => d.backdata[id]);
    if (!found) return null;
    const { doc, value: chunk } = found;
    const linked = Object.values(doc.slots).find((s) => s.backDataRefs.includes(id));
    return {
      kind: "backdata",
      id,
      label: chunk.sourceTitle,
      detail: "백데이터",
      reveal: () => linked && revealSlot(doc, linked.slotId),
      highlight: (on) => linked && highlight(linked.slotId, on),
      toContext: () => backdataRef(doc, id)!,
    };
  },
};

const nodeResolver: EntityResolver = {
  id: "node",
  resolve(id, kind) {
    if (kind && kind !== "node") return null;
    const node = outlineNodes().find((n) => n.nodeId === id);
    if (!node) return null;
    const target = node.targetSlotId || node.targetBlockId || node.targetPageId || null;
    return {
      kind: "node",
      id,
      label: node.title,
      detail: "아웃라인",
      reveal: () => {
        useWorkspaceSessionStore.getState().setSelectedOutlinerNodeId(id);
        const doc = node.targetDocId ? findDoc(node.targetDocId) : undefined;
        const resolved = target ? (target === node.targetSlotId ? slotResolver : target === node.targetBlockId ? blockResolver : pageResolver).resolve(target) : null;
        if (resolved) resolved.reveal();
        else if (doc) openDoc(doc);
      },
      highlight: (on) => highlight(target ?? id, on),
      toContext: () => outlineNodeRef(node),
    };
  },
};

/** 레퍼런스 PDF 영역 `refId:p{page}:{ymin,xmin,ymax,xmax}` — 클릭하면 레퍼런스 작업창을 열고 그 자리에 상자를 그린다. */
const REGION_ID = /^(.+):p(\d+):(\d+),(\d+),(\d+),(\d+)$/;

const regionResolver: EntityResolver = {
  id: "ref-region",
  resolve(id, kind) {
    if (kind && kind !== "ref-region") return null;
    const m = REGION_ID.exec(id);
    if (!m) return null;
    const refId = m[1];
    if (!findReferenceItem(refId)) return null;
    const number = referenceNumber(refId);
    const page = Number(m[2]);
    const box = [m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number];
    return {
      kind: "ref-region",
      id,
      label: `${number ? `참조${number}` : "레퍼런스"} p${page} 영역`,
      detail: "PDF 영역",
      reveal: () => {
        revealReferenceViewer(refId);
        useReferenceRegionStore.getState().setFocus({ refId, page, box });
      },
      highlight: (on) => highlight(refId, on),
      toContext: () => referenceRegionRef(refId, { page, box, text: "" }),
    };
  },
};

const resourceResolver: EntityResolver = {
  id: "resource",
  resolve(id, kind) {
    if (kind && kind !== "resource" && kind !== "sector") return null;
    const store = useResourceStore.getState();
    const all = flattenResourceItems(store.items);

    // 해시 줄 번호(#L32-L47 또는 #L32) 분리
    let rawId = id;
    let targetLines: [number, number] | null = null;
    const hashIdx = rawId.indexOf("#L");
    if (hashIdx !== -1) {
      const hashPart = rawId.slice(hashIdx + 2);
      rawId = rawId.slice(0, hashIdx);
      const m = /^(\d+)(?:-L?(\d+))?$/.exec(hashPart);
      if (m) {
        const s = parseInt(m[1], 10);
        const e = m[2] ? parseInt(m[2], 10) : s;
        targetLines = [s, e];
      }
    }

    // 1. 리소스 아이템 ID 직접 매칭 (file_xxx, dir_xxx 등)
    let matchedItem = all.find((it) => it.id === rawId);
    let matchedSector: ResourceSector | null = null;

    // 2. 섹터 ID 매칭 (sec_xxx 등)
    if (!matchedItem) {
      for (const it of all) {
        const sec = it.sectors?.find((s) => s.sectorId === rawId);
        if (sec) {
          matchedItem = it;
          matchedSector = sec;
          break;
        }
      }
    }

    // 3. 파일명/타이틀/Decision 번호 매칭 (예: "Decision 03" 이 id로 들어온 경우)
    if (!matchedItem && rawId.length >= 3) {
      const lower = rawId.toLowerCase();
      const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, " ").trim();
      const normLower = norm(rawId);
      // "Decision 01 (인스파이어드...)" 처럼 괄호가 붙은 경우 Decision 01 만 추출하여 보조 매칭
      const decisionMatch = /^decision\s+(\d+)/i.exec(lower);
      const decPrefix = decisionMatch ? `decision ${decisionMatch[1].padStart(2, "0")}` : null;

      const candidates = all.filter((it) => {
        const t = it.title.toLowerCase();
        const p = (it.pathOrUrl || "").toLowerCase();
        if (t.includes(lower) || p.includes(lower)) return true;
        if (norm(it.title).includes(normLower) || (it.pathOrUrl && norm(it.pathOrUrl).includes(normLower))) return true;
        if (decPrefix && (t.includes(decPrefix) || p.includes(decPrefix))) return true;
        return false;
      });

      if (candidates.length > 0) {
        // discussions 폴더 우선, 그 다음 경로 역순(최신 날짜 우선)
        candidates.sort((a, b) => {
          const aDisc = (a.pathOrUrl || "").includes("discussions") ? 1 : 0;
          const bDisc = (b.pathOrUrl || "").includes("discussions") ? 1 : 0;
          if (aDisc !== bDisc) return bDisc - aDisc;
          return (b.pathOrUrl || "").localeCompare(a.pathOrUrl || "");
        });
        matchedItem = candidates[0];
      }
    }

    if (!matchedItem) return null;

    const label = matchedSector ? matchedSector.title || `${matchedItem.title} (발췌)` : matchedItem.title;

    return {
      kind: matchedSector ? "sector" : "resource",
      id,
      label,
      detail: matchedSector ? "리소스 발췌" : targetLines ? `원천 리소스 (L${targetLines[0]}-${targetLines[1]})` : "원천 리소스",
      reveal: () => {
        store.openPreview(
          matchedItem!,
          matchedSector
            ? {
                page: matchedSector.page,
                bbox: matchedSector.bbox,
                label: matchedSector.label,
              }
            : targetLines
            ? { lines: targetLines }
            : null
        );
      },
      highlight: (on) => highlight(matchedItem!.id, on),
      toContext: () => ({
        kind: "resource",
        id: matchedItem!.id,
        label: matchedItem!.title,
        content: matchedSector ? matchedSector.textSnippet : matchedItem!.pathOrUrl || "",
        access: "read",
      }),
    };
  },
};

const refPinResolver: EntityResolver = {
  id: "ref-pin",
  resolve(id, kind) {
    if (kind && kind !== "ref-pin" && kind !== "pin") return null;
    const pinId = id.includes("#pin:") ? id.split("#pin:")[1] : id;
    const pin = findReferencePin(pinId);
    if (!pin) return null;
    const number = referenceNumber(pin.refId);
    return {
      kind: "ref-pin",
      id: pin.pinId,
      label: pin.label || `핀 (${pin.pinId})`,
      detail: `${number ? `참조${number}` : "레퍼런스"} 핀${pin.layer ? ` · ${pin.layer}` : ""}`,
      reveal: () => {
        revealReferenceViewer(pin.refId);
        useReferenceStore.getState().setFocusedPin(pin);
        if (pin.kind === "region" && pin.bbox && pin.page) {
          useReferenceRegionStore.getState().setFocus({ refId: pin.refId, page: pin.page, box: pin.bbox });
        }
      },
      highlight: (on) => highlight(pin.refId, on),
      toContext: () => ({
        kind: "ref-pin",
        id: pin.pinId,
        label: pin.label,
        content: `${pin.anchor}${pin.layer ? ` [${pin.layer}]` : ""} — ${pin.text || pin.note || pin.label}`,
        access: "read",
      }),
    };
  },
};

/** 등록 순서 = 맨 id 가 겹칠 때의 우선순위. */
export const WORKSPACE_ENTITY_RESOLVERS: EntityResolver[] = [
  blockResolver,
  slotResolver,
  pageResolver,
  docResolver,
  referenceResolver,
  backdataResolver,
  nodeResolver,
  regionResolver,
  refPinResolver,
  resourceResolver,
];

export type { EntityInfo };
