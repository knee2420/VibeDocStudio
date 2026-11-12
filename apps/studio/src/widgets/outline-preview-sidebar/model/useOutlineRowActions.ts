import React, { useLayoutEffect, useMemo, useRef } from "react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { usePdfScaffoldJobStore } from "@/entities/scaffold-job";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { outlineNodeRef, useAttachPickStore } from "@/features/ai-workspace";
import {
  isDocumentTargetNode,
  isEditableOutlineNode,
  isPageTargetNode,
  useOutlineNodeEditing,
} from "@/features/edit-outline";
import { documentLifecycle } from "@/features/manage-documents";
import { pageMutations } from "@/features/mutate-document-pages";
import { resolvePeekTarget, usePeekTrigger, type PeekHandlers } from "@/features/peek-page";
import { outlineCommands } from "@/features/zoom-hierarchy";

import { outlineNodeTargetId } from "./outlineSections";

export { outlineNodeTargetId };

export interface OutlineRowActions {
  select: (e: React.MouseEvent, node: OutlinerNode) => void;
  keyDown: (e: React.KeyboardEvent, node: OutlinerNode) => void;
  hover: (node: OutlinerNode, hovering: boolean) => void;
  toggleCollapse: (node: OutlinerNode) => void;
  zoomIn: (node: OutlinerNode) => void;
  move: (node: OutlinerNode, direction: -1 | 1) => void;
  remove: (node: OutlinerNode) => void;
  openAddPageMenu: (node: OutlinerNode, anchorEl: HTMLElement) => void;
  startRename: (node: OutlinerNode) => void;
  commitRename: (node: OutlinerNode, nextTitle: string) => void;
  cancelRename: () => void;
  duplicatePage: (node: OutlinerNode) => void;
  deletePage: (node: OutlinerNode) => void;
  duplicateDocument: (node: OutlinerNode) => void;
  deleteDocument: (node: OutlinerNode) => void;
  /** 피크 핸들러 — 문서 목록은 호버 순간에 읽는다 (문서 구독으로 트리 전체가 다시 그려지지 않게). */
  peek: (node: OutlinerNode) => PeekHandlers;
}

export interface RenameState {
  nodeId: string;
  initialTitle: string;
}

interface Options {
  activeDocId: string;
  /** Shift+클릭 범위 고르기에 쓰는, 지금 화면에 보이는 행 순서. */
  getVisibleOrder: () => readonly OutlinerNode[];
  setRenaming: (next: RenameState | null) => void;
  openAddPageMenu: (docId: string, anchorEl: HTMLElement) => void;
}

const reportError = (err: unknown) => window.alert(String(err));

function isPageBusy(pageId: string): boolean {
  const status = usePdfScaffoldJobStore.getState().pageStatesByPageId[pageId]?.status;
  return status === "queued" || status === "running";
}

/** 버튼 · Delete 키가 함께 쓰는 페이지 삭제. 변환 중인 페이지 · 마지막 페이지는 지우지 않는다. */
function deletePageSafely(docId: string, pageId: string): void {
  if (isPageBusy(pageId)) return;
  if (pageMutations.removePage(docId, pageId)) usePdfScaffoldJobStore.getState().clearPageState(pageId);
}

/**
 * 아웃라인 줄 동작. 줄마다 새 콜백을 만들면 메모된 줄이 매번 다시 그려지므로, 최신 핸들러를 읽는
 * 고정 참조 하나를 돌려준다 (최신 핸들러는 커밋 뒤에 갱신하고, 이벤트에서만 읽는다).
 */
export function useOutlineRowActions({ activeDocId, getVisibleOrder, setRenaming, openAddPageMenu }: Options) {
  const pickAnchor = useRef<string | null>(null);
  const peekTrigger = usePeekTrigger();
  const docIdOf = (node: OutlinerNode) => node.targetDocId || activeDocId;

  const startRename = (node: OutlinerNode) => {
    let initialTitle = node.title;
    if (isPageTargetNode(node) && node.nodeId.startsWith("auto-page-") && node.targetPageId) {
      const page = useStudioDocumentStore
        .getState()
        .docs.find((d) => d.docId === docIdOf(node))
        ?.pages.find((p) => p.pageId === node.targetPageId);
      if (page) initialTitle = page.pageLabel;
    }
    setRenaming({ nodeId: node.nodeId, initialTitle });
  };

  const editing = useOutlineNodeEditing(activeDocId, {
    onStartRename: startRename,
    onRemovePage: (docId, pageId) => deletePageSafely(docId || activeDocId, pageId),
  });

  /** Ctrl/⌘+클릭: 첨부 묶음에 넣고 빼기 · Shift+클릭: 범위로 고르기 · 그냥 클릭: 묶음 해제 후 선택. */
  const pickOrSelect = (e: React.MouseEvent, node: OutlinerNode): boolean => {
    const picks = useAttachPickStore.getState();
    if (e.ctrlKey || e.metaKey) {
      picks.togglePick("outline", outlineNodeRef(node));
      pickAnchor.current = node.nodeId;
      return true;
    }
    if (e.shiftKey) {
      const nodes = getVisibleOrder();
      const anchorId = pickAnchor.current ?? useWorkspaceSessionStore.getState().selectedOutlinerNodeId;
      const from = nodes.findIndex((n) => n.nodeId === anchorId);
      const to = nodes.findIndex((n) => n.nodeId === node.nodeId);
      if (from !== -1 && to !== -1) {
        const [a, b] = from < to ? [from, to] : [to, from];
        picks.setPicks("outline", nodes.slice(a, b + 1).map(outlineNodeRef));
        window.getSelection()?.removeAllRanges();
        return true;
      }
    }
    if (picks.picked.outline?.length) picks.clearPicks("outline");
    pickAnchor.current = node.nodeId;
    return false;
  };

  const handlers: Omit<OutlineRowActions, "peek"> = {
    select: (e, node) => {
      if (pickOrSelect(e, node)) return;
      // 활성 문서 · 페이지 · 캔버스 선택은 selectNode 가 함께 맞춘다.
      outlineCommands.selectNode(node);
      useWorkspaceSessionStore.getState().setPreviewDocId(null);
    },
    keyDown: (e, node) => editing.handleNodeKeyDown(e, node),
    hover: (node, hovering) =>
      useWorkspaceSessionStore.getState().setHoveredOutlineTargetId(hovering ? outlineNodeTargetId(node) : null),
    toggleCollapse: (node) => useWorkspaceSessionStore.getState().toggleNodeCollapse(node.nodeId),
    zoomIn: (node) => outlineCommands.zoomIntoNode(node),
    move: (node, direction) => void editing.moveNode(node, direction),
    remove: (node) => void editing.deleteNode(node),
    openAddPageMenu: (node, anchorEl) => openAddPageMenu(docIdOf(node), anchorEl),
    startRename,
    commitRename: (node, nextTitle) => {
      setRenaming(null);
      if (isDocumentTargetNode(node) && node.targetDocId && node.nodeId.startsWith("auto-doc-")) {
        void documentLifecycle().renameDocument(node.targetDocId, nextTitle).catch(reportError);
      } else if (isPageTargetNode(node) && node.targetPageId) {
        void pageMutations.renamePage(docIdOf(node), node.targetPageId, nextTitle);
      } else if (isEditableOutlineNode(node, useWorkspaceSessionStore.getState().currentPhase)) {
        void useProjectStore.getState().renameOutlineNodeImmediate(node.nodeId, nextTitle);
      }
    },
    cancelRename: () => setRenaming(null),
    duplicatePage: (node) => {
      if (node.targetPageId) pageMutations.duplicatePage(docIdOf(node), node.targetPageId);
    },
    deletePage: (node) => {
      if (node.targetPageId) deletePageSafely(docIdOf(node), node.targetPageId);
    },
    duplicateDocument: (node) => {
      if (node.targetDocId) void documentLifecycle().duplicateDocument(node.targetDocId).catch(reportError);
    },
    deleteDocument: (node) => {
      if (!node.targetDocId) return;
      if (!window.confirm(`「${node.title}」 문서를 지웁니다. 되돌릴 수 없습니다.`)) return;
      void documentLifecycle().deleteDocument(node.targetDocId).catch(reportError);
    },
  };

  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  const actions = useMemo<OutlineRowActions>(
    () => ({
      select: (e, node) => latest.current.select(e, node),
      keyDown: (e, node) => latest.current.keyDown(e, node),
      hover: (node, hovering) => latest.current.hover(node, hovering),
      toggleCollapse: (node) => latest.current.toggleCollapse(node),
      zoomIn: (node) => latest.current.zoomIn(node),
      move: (node, direction) => latest.current.move(node, direction),
      remove: (node) => latest.current.remove(node),
      openAddPageMenu: (node, anchorEl) => latest.current.openAddPageMenu(node, anchorEl),
      startRename: (node) => latest.current.startRename(node),
      commitRename: (node, nextTitle) => latest.current.commitRename(node, nextTitle),
      cancelRename: () => latest.current.cancelRename(),
      duplicatePage: (node) => latest.current.duplicatePage(node),
      deletePage: (node) => latest.current.deletePage(node),
      duplicateDocument: (node) => latest.current.duplicateDocument(node),
      deleteDocument: (node) => latest.current.deleteDocument(node),
      // 피크 대상(문서 · 첫 페이지)은 마우스 이벤트 순간에 스토어에서 읽는다.
      peek: (node) =>
        peekTrigger(() => {
          const docs = useStudioDocumentStore.getState();
          return resolvePeekTarget(docs.docs, node.targetDocId || selectActiveDocument(docs)?.docId, node.targetPageId);
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- peekTrigger 는 고정된 스토어 동작(hover)만 쓴다
    []
  );

  return { actions, addRootNode: editing.addRootNode };
}
