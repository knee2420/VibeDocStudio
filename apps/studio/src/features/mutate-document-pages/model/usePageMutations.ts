import {
  buildReservedPdfPlaceholders,
  createSectionPage,
  duplicatePage as duplicatePageOp,
  getBlockSlotIds,
  importPagesFromDocument,
  insertPages,
  iterPageSlotIds,
  PROJECT_ROOT_CRUMB_ID,
  removePage as removePageOp,
  renamePage as renamePageOp,
  replacePageContent,
  type VDocDocument,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { historyTransaction, scrollToCanvasPage, useHistoryStore } from "@/shared/lib";

const idSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function resolveDocId(docId?: string): string {
  return docId || useStudioDocumentStore.getState().activeDocId;
}

function focusInsertedPage(targetDocId: string, pageId: string): void {
  const docStore = useStudioDocumentStore.getState();
  if (targetDocId !== docStore.activeDocId) return;
  docStore.setActivePageId(pageId);
  const nextDoc = docStore.docs.find((d) => d.docId === targetDocId);
  const page = nextDoc?.pages.find((p) => p.pageId === pageId);
  if (page) {
    const firstSlot = page.blocks.flatMap((b) => getBlockSlotIds(b)).find((sid) => Boolean(nextDoc?.slots[sid]));
    if (firstSlot) useSlotSelectionStore.getState().setSelectedSlotId(firstSlot);
  }
  if (typeof document !== "undefined") scrollToCanvasPage(pageId);
}

/**
 * 문서의 페이지 생명주기(추가 · 템플릿 가져오기 · 사본 · 이름 변경 · 삭제) 변경 액션.
 * 모든 동작이 `useHistoryStore` 한 칸(이름 변경 시 아웃라인 기획 노드까지 `project` scope 트랜잭션)으로 남는다.
 */
export const pageMutations = {
  insertBasicPage: (docId?: string, opts?: { pageLabel?: string; atIndex?: number }): string | null => {
    const targetDocId = resolveDocId(docId);
    const prevDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    if (!prevDoc) return null;

    const pageId = `page_${idSuffix()}`;
    const pageLabel = opts?.pageLabel?.trim() || `새 페이지 ${prevDoc.pages.length + 1}`;
    const { page, slots } = createSectionPage({
      pageId,
      pageNumber: prevDoc.pages.length + 1,
      pageLabel,
      headerHtml: "<p></p>",
      footerHtml: "<p></p>",
      headingHtml: "<p></p>",
      bodyHtml: "<p></p>",
    });

    const ok = useStudioDocumentStore
      .getState()
      .updateDoc(targetDocId, (doc) => insertPages(doc, [page], slots, opts?.atIndex), {
        history: true,
        label: `기본 페이지 추가: "${pageLabel}"`,
      });
    if (!ok) return null;

    focusInsertedPage(targetDocId, pageId);
    return pageId;
  },

  importTemplatePages: (
    docId: string | undefined,
    sourceDoc: VDocDocument,
    pageIds: readonly string[],
    opts?: { atIndex?: number; label?: string }
  ): string[] => {
    const targetDocId = resolveDocId(docId);
    const prevDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    if (!prevDoc || pageIds.length === 0) return [];
    const prevIds = new Set(prevDoc.pages.map((p) => p.pageId));

    const label = opts?.label ?? `템플릿 페이지 ${pageIds.length}개 추가`;
    const ok = useStudioDocumentStore
      .getState()
      .updateDoc(
        targetDocId,
        (doc) => importPagesFromDocument(doc, sourceDoc, pageIds, idSuffix, opts?.atIndex),
        { history: true, label }
      );
    if (!ok) return [];

    const nextDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    const inserted = (nextDoc?.pages ?? []).filter((p) => !prevIds.has(p.pageId)).map((p) => p.pageId);
    if (inserted[0]) focusInsertedPage(targetDocId, inserted[0]);
    return inserted;
  },

  duplicatePage: (docId: string | undefined, pageId: string): string | null => {
    const targetDocId = resolveDocId(docId);
    const prevDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    const targetPage = prevDoc?.pages.find((p) => p.pageId === pageId);
    if (!prevDoc || !targetPage) return null;
    const prevIds = new Set(prevDoc.pages.map((p) => p.pageId));

    const ok = useStudioDocumentStore
      .getState()
      .updateDoc(targetDocId, (doc) => duplicatePageOp(doc, pageId, idSuffix), {
        history: true,
        label: `페이지 복제: "${targetPage.pageLabel}"`,
      });
    if (!ok) return null;

    const nextDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    const created = nextDoc?.pages.find((p) => !prevIds.has(p.pageId));
    if (created) focusInsertedPage(targetDocId, created.pageId);
    return created?.pageId ?? null;
  },

  renamePage: async (docId: string | undefined, pageId: string, nextLabel: string): Promise<void> => {
    const trimmed = nextLabel.trim();
    if (!trimmed) return;
    const targetDocId = resolveDocId(docId);
    const doc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    const page = doc?.pages.find((p) => p.pageId === pageId);
    if (!doc || !page) return;

    const activeProject = selectActiveProject(useProjectStore.getState());
    const linkedStoryNode = activeProject?.storylineNodes.find(
      (n) =>
        n.zoomLevel === "page" &&
        n.targetDocId === targetDocId &&
        n.targetPageId === pageId &&
        !n.targetBlockId
    );
    const needDocRename = page.pageLabel !== trimmed;
    const needOutlineRename = Boolean(linkedStoryNode && linkedStoryNode.title !== trimmed);
    if (!needDocRename && !needOutlineRename) return;

    // 다른 문서로 전환해도 이 이름이력(문서+아웃라인 연동)은 project scope 로 보존한다.
    await historyTransaction(`페이지 이름 변경: "${trimmed}"`, "project", async () => {
      if (needDocRename) {
        useStudioDocumentStore
          .getState()
          .updateDoc(targetDocId, (d) => renamePageOp(d, pageId, trimmed), {
            history: true,
            label: `페이지 이름 변경: "${trimmed}"`,
          });
      }
      if (needOutlineRename && linkedStoryNode) {
        await useProjectStore.getState().renameOutlineNodeImmediate(linkedStoryNode.nodeId, trimmed);
      }
    });
  },

  removePage: (docId: string | undefined, pageId: string): boolean => {
    const targetDocId = resolveDocId(docId);
    const prevDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    if (!prevDoc || prevDoc.pages.length <= 1) return false;
    const idx = prevDoc.pages.findIndex((p) => p.pageId === pageId);
    if (idx < 0) return false;

    const targetPage = prevDoc.pages[idx];
    const removedBlockIds = new Set(targetPage.blocks.map((b) => b.blockId));
    const removedSlotIds = new Set(iterPageSlotIds(targetPage));

    const ok = useStudioDocumentStore
      .getState()
      .updateDoc(targetDocId, (doc) => removePageOp(doc, pageId), {
        history: true,
        label: `페이지 삭제: "${targetPage.pageLabel}"`,
      });
    if (!ok) return false;

    const nextDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    const docStore = useStudioDocumentStore.getState();
    if (nextDoc && targetDocId === docStore.activeDocId && docStore.activePageId === pageId) {
      const fallbackPage = nextDoc.pages[Math.min(idx, nextDoc.pages.length - 1)];
      if (fallbackPage) docStore.setActivePageId(fallbackPage.pageId);
    }

    const selection = useSlotSelectionStore.getState();
    if (
      (selection.selectedBlockId && removedBlockIds.has(selection.selectedBlockId)) ||
      (selection.selectedSlotId && removedSlotIds.has(selection.selectedSlotId))
    ) {
      selection.clearSelection();
    }

    // 아웃라이너/캔버스가 삭제된 페이지(또는 하위 요소)에 줌인되어 있으면 문서 루트로 복귀한다.
    const session = useWorkspaceSessionStore.getState();
    if (session.zoomRootNodeId.includes(`-${targetDocId}-${pageId}`)) {
      session.zoomIntoNode(`auto-doc-${targetDocId}`);
    } else if (session.zoomRootNodeId !== PROJECT_ROOT_CRUMB_ID) {
      const stillExists = nextDoc?.pages.some((p) => session.zoomRootNodeId.includes(p.pageId));
      if (!stillExists && session.zoomRootNodeId.includes(`auto-blk-${targetDocId}-`)) {
        session.zoomIntoNode(`auto-doc-${targetDocId}`);
      }
    }

    return true;
  },

  /**
   * 1단계에서 선택한 PDF 페이지 개수만큼 빈 예약 페이지를 문서에 즉시 추가한다.
   * 이후 비동기 순차 추출이 끝나면 `hydrateReservedPdfPage` 가 해당 자리만 교체하며,
   * Undo/Redo 는 ID 기반 제거/재삽입으로 동작해 다른 페이지의 동시 타이핑을 덮어쓰지 않는다.
   */
  reservePdfPlaceholderPages: (
    docId: string | undefined,
    selectedPages: readonly { pageNumber: number; thumbnailDataUrl?: string | null }[],
    opts?: { title?: string; atIndex?: number }
  ): {
    targetDocId: string;
    reserved: { pageNumber: number; placeholderPageId: string; thumbnail: string }[];
  } | null => {
    const targetDocId = resolveDocId(docId);
    const prevDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
    if (!prevDoc || selectedPages.length === 0) return null;

    const cleanTitle = opts?.title?.trim() || "PDF 양식";
    const { pages, slots, thumbnails, mappings } = buildReservedPdfPlaceholders(
      selectedPages,
      cleanTitle,
      prevDoc.pages.length + 1,
      idSuffix
    );

    const insertAt = opts?.atIndex ?? prevDoc.pages.length;
    const ok = useStudioDocumentStore
      .getState()
      .updateDoc(
        targetDocId,
        (doc) => insertPages(doc, pages, slots, insertAt, thumbnails),
        { history: false }
      );
    if (!ok) return null;

    const reservedIds = new Set(mappings.map((m) => m.placeholderPageId));
    let savedPages: VDocPage[] = pages;
    let savedSlots: Record<string, VDocSlot> = slots;
    let savedThumbs: string[] = thumbnails;
    let savedIndex = insertAt;

    useHistoryStore.getState().push({
      label: `PDF 양식 페이지 ${mappings.length}개 추가: "${cleanTitle}"`,
      scope: targetDocId === useStudioDocumentStore.getState().activeDocId ? "document" : "project",
      undo: () => {
        const curDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === targetDocId);
        if (!curDoc) return;
        const firstIdx = curDoc.pages.findIndex((p) => reservedIds.has(p.pageId));
        if (firstIdx < 0) return;

        savedIndex = firstIdx;
        savedPages = curDoc.pages.filter((p) => reservedIds.has(p.pageId));
        savedThumbs = curDoc.pages
          .map((p, i) => (reservedIds.has(p.pageId) ? curDoc.preview?.pageThumbnails?.[i] ?? "" : null))
          .filter((t): t is string => t !== null);
        const collectedSlots: Record<string, VDocSlot> = {};
        for (const p of savedPages) {
          for (const sid of [p.headerSlotId, p.footerSlotId, ...iterPageSlotIds(p)]) {
            if (sid && curDoc.slots[sid]) collectedSlots[sid] = curDoc.slots[sid];
          }
        }
        savedSlots = collectedSlots;

        useStudioDocumentStore.getState().updateDoc(
          targetDocId,
          (doc) => {
            let next = doc;
            for (const p of savedPages) {
              if (next.pages.length <= 1) break;
              next = removePageOp(next, p.pageId);
            }
            return next;
          },
          { history: false }
        );
      },
      redo: () => {
        useStudioDocumentStore.getState().updateDoc(
          targetDocId,
          (doc) => insertPages(doc, savedPages, savedSlots, Math.min(savedIndex, doc.pages.length), savedThumbs),
          { history: false }
        );
        if (savedPages[0]) focusInsertedPage(targetDocId, savedPages[0].pageId);
      },
    });

    if (mappings[0]) focusInsertedPage(targetDocId, mappings[0].placeholderPageId);
    return { targetDocId, reserved: mappings };
  },

  hydrateReservedPdfPage: (
    targetDocId: string,
    placeholderPageId: string,
    extractedPage: VDocPage,
    sourceSlots: Record<string, VDocSlot>,
    opts?: { thumbnail?: string | null; sourceVariables?: Record<string, string> }
  ): boolean => {
    return useStudioDocumentStore.getState().updateDoc(
      targetDocId,
      (doc) =>
        replacePageContent(doc, placeholderPageId, extractedPage, sourceSlots, {
          newId: idSuffix,
          thumbnail: opts?.thumbnail ?? undefined,
          sourceVariables: opts?.sourceVariables,
        }),
      { history: false, asyncHydratedPageId: placeholderPageId }
    );
  },

  removePendingPlaceholderPage: (targetDocId: string | undefined, pageId: string): boolean => {
    const resolvedDocId = resolveDocId(targetDocId);
    const prevDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === resolvedDocId);
    if (!prevDoc || prevDoc.pages.length <= 1) return false;
    const idx = prevDoc.pages.findIndex((p) => p.pageId === pageId);
    if (idx < 0) return false;

    const ok = useStudioDocumentStore
      .getState()
      .updateDoc(resolvedDocId, (doc) => removePageOp(doc, pageId), { history: false });
    if (!ok) return false;

    const nextDoc = useStudioDocumentStore.getState().docs.find((d) => d.docId === resolvedDocId);
    const docStore = useStudioDocumentStore.getState();
    if (nextDoc && resolvedDocId === docStore.activeDocId && docStore.activePageId === pageId) {
      const fallback = nextDoc.pages[Math.min(idx, nextDoc.pages.length - 1)];
      if (fallback) docStore.setActivePageId(fallback.pageId);
    }
    return true;
  },
};

export function usePageMutations() {
  return pageMutations;
}

