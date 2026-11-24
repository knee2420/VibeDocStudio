import { useMemo } from "react";
import { getBlockSlotIds, type OutlinerNode } from "@vibe/vdoc-schema";

import { useWorkingPagesByDoc } from "@/features/document-revisions";

export type FigmaDiffKind = "added" | "edited" | "deleted";

export interface NodeDiffState {
  kind: FigmaDiffKind;
  /** 직접 변경된 단말 노드면 true (U / M 표시), 하위 변경이 버블링된 부모면 false (도트 ● 표시) */
  isDirect: boolean;
}

/**
 * 아웃라인(Documents & Pages · Elements)의 바뀐 곳 표시 — 변경 기록(Changes)과 같은 기준.
 * 기준은 문서마다 마지막으로 이름 붙인 버전 (버전이 없으면 칸의 처음 글), 계산도 같은 함수(`computeWorkingPages`)를 쓴다.
 * - 단말 직접 변경 (isDirect: true): 글이 바뀐 칸(M), 새로 넣은 블록 · 그 칸(U), 새 쪽(U), 배치 · 속성만 바뀐 블록(M), 이름만 바뀐 쪽(M)
 * - 상위 컨테이너는 아래 변경을 모아 도트(●)로 보인다.
 * 기준 버전을 불러오는 동안은 아무 표시도 하지 않는다 (옛 표시가 잠깐 번쩍이지 않게).
 */
export function useFigmaDiffStatusMap(nodes: readonly OutlinerNode[]): Record<string, NodeDiffState> {
  const docIds = useMemo(() => nodes.flatMap((n) => (n.targetDocId ? [n.targetDocId] : [])), [nodes]);
  const workingByDoc = useWorkingPagesByDoc(docIds);

  /** 문서별 바뀐 곳 색인. */
  const changeIndex = useMemo(() => {
    const index = new Map<
      string,
      {
        pages: Map<string, FigmaDiffKind>;
        /** 직접 표시가 없더라도 아래에 바뀐 곳이 있는 쪽 (아웃라인에 그 블록이 없어도 쪽에 점이 찍히게) */
        touchedPages: Map<string, FigmaDiffKind>;
        blocks: Map<string, FigmaDiffKind>;
        slots: Map<string, FigmaDiffKind>;
      }
    >();
    for (const [docId, working] of Object.entries(workingByDoc)) {
      if (!working) continue;
      const pages = new Map<string, FigmaDiffKind>();
      const touchedPages = new Map<string, FigmaDiffKind>();
      const blocks = new Map<string, FigmaDiffKind>();
      const slots = new Map<string, FigmaDiffKind>();
      for (const wp of working) {
        if (wp.kind === "deleted") continue;
        if (wp.kind === "added") pages.set(wp.page.pageId, "added");
        else if (wp.blocks.length === 0) pages.set(wp.page.pageId, "edited"); // 이름만 바뀐 쪽
        else touchedPages.set(wp.page.pageId, "edited"); // 변경 기록처럼 고친 쪽(M) — 안의 새 블록은 U 로 따로
        for (const b of wp.blocks) {
          if (b.kind === "removed") continue;
          const added = b.kind === "added" || wp.kind === "added";
          if (added) {
            blocks.set(b.blockId, "added");
            // 새 블록은 글이 비어 있는 칸(입력 필드 등)도 새로 생긴 칸이다
            const block = wp.page.blocks.find((x) => x.blockId === b.blockId);
            if (block) for (const sid of getBlockSlotIds(block)) slots.set(sid, "added");
          }
          else if (b.layoutChanged) blocks.set(b.blockId, "edited");
          for (const item of b.items) slots.set(item.slotId, added ? "added" : "edited");
        }
      }
      index.set(docId, { pages, touchedPages, blocks, slots });
    }
    return index;
  }, [workingByDoc]);

  return useMemo(() => {
    const statusMap: Record<string, NodeDiffState> = {};
    if (!nodes || nodes.length === 0) return statusMap;

    // 1. 단말 노드의 직접 변경 (isDirect: true)
    for (const node of nodes) {
      const idx = node.targetDocId ? changeIndex.get(node.targetDocId) : undefined;
      if (!idx) continue;
      let kind: FigmaDiffKind | undefined;
      if (node.targetSlotId) kind = idx.slots.get(node.targetSlotId);
      else if (node.targetBlockId) kind = idx.blocks.get(node.targetBlockId);
      else if (node.zoomLevel === "page" && node.targetPageId) kind = idx.pages.get(node.targetPageId);
      if (kind) statusMap[node.nodeId] = { kind, isDirect: true };
      else if (node.zoomLevel === "page" && !node.targetBlockId && node.targetPageId) {
        const touched = idx.touchedPages.get(node.targetPageId);
        if (touched) statusMap[node.nodeId] = { kind: touched, isDirect: false };
      }
    }

    // 2. 부모-자식 관계
    const childrenByParent = new Map<string, OutlinerNode[]>();
    for (const node of nodes) {
      if (!node.parentId) continue;
      const list = childrenByParent.get(node.parentId) || [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    }

    // 3. 아래에서 위로 (블록 → 쪽 → 문서) 모아 올린다 (isDirect: false)
    const sortedNodes = [...nodes].sort((a, b) => b.depth - a.depth);
    for (const node of sortedNodes) {
      if (statusMap[node.nodeId]) continue;
      let hasAdded = false;
      let hasEdited = false;
      for (const child of childrenByParent.get(node.nodeId) || []) {
        const st = statusMap[child.nodeId];
        if (st?.kind === "added") hasAdded = true;
        if (st?.kind === "edited") hasEdited = true;
      }
      if (hasEdited) statusMap[node.nodeId] = { kind: "edited", isDirect: false };
      else if (hasAdded) statusMap[node.nodeId] = { kind: "added", isDirect: false };
    }
    return statusMap;
  }, [nodes, changeIndex]);
}
