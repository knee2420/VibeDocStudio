import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";

/**
 * 피그마 레이어의 눈(숨기기) · 자물쇠(잠금).
 *
 * - 잠금: 문서의 실제 잠금(`slot.constraints.locked`)을 그 행 아래 모든 슬롯에 건다. 캔버스는 잠긴 슬롯을
 *   편집하지 못하게 하고, AI 범위 바도 건너뛴다. Undo 이력에 남는다.
 * - 숨기기: 문서 모델에 숨김 필드가 없으므로 보기 전용이다. 캔버스에서만 감추고(`visibility: hidden`,
 *   자리는 유지) 문서 · 저장 · 내보내기에는 영향이 없다. 세션 동안 기억한다.
 */

/** 각 행 아래(자기 포함)에 있는 슬롯 id. `nodes` 는 깊이 우선 순서. */
export function collectSubtreeSlotIds(nodes: readonly OutlinerNode[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const stack: { node: OutlinerNode; slots: string[] }[] = [];
  const close = (depth: number) => {
    while (stack.length && stack[stack.length - 1].node.depth >= depth) {
      const done = stack.pop()!;
      out.set(done.node.nodeId, done.slots);
      if (stack.length) stack[stack.length - 1].slots.push(...done.slots);
    }
  };
  for (const node of nodes) {
    close(node.depth);
    stack.push({ node, slots: node.targetSlotId ? [node.targetSlotId] : [] });
  }
  close(-Infinity);
  return out;
}

/** 슬롯들이 모두 잠겼으면 풀고, 하나라도 풀려 있으면 모두 잠근다. */
export function toggleSlotsLocked(docId: string, slotIds: readonly string[]): void {
  if (!docId || slotIds.length === 0) return;
  const documents = useStudioDocumentStore.getState();
  const doc = documents.docs.find((d) => d.docId === docId);
  if (!doc) return;
  const lock = !slotIds.every((id) => doc.slots[id]?.constraints?.locked);
  documents.updateDoc(
    docId,
    (prev) => {
      const slots = { ...prev.slots };
      let changed = false;
      for (const id of slotIds) {
        const slot = slots[id];
        if (!slot || Boolean(slot.constraints?.locked) === lock) continue;
        slots[id] = { ...slot, constraints: { ...slot.constraints, locked: lock } };
        changed = true;
      }
      return changed ? { ...prev, slots } : prev;
    },
    { history: true, label: lock ? "레이어 잠금" : "레이어 잠금 해제" }
  );
}

/** 잠금 상태: 슬롯이 있고 모두 잠겼으면 true. */
export function areSlotsLocked(slots: Record<string, { constraints?: { locked?: boolean } } | undefined>, slotIds: readonly string[] | undefined): boolean {
  return Boolean(slotIds?.length) && slotIds!.every((id) => Boolean(slots[id]?.constraints?.locked));
}

/**
 * 숨긴 노드들을 캔버스에서 감추는 CSS 선택자.
 * - 슬롯 행 → 그 슬롯, 페이지 바로 아래 블록 행 → 블록 전체, 블록 안의 구역 행 → 그 구역의 슬롯들.
 */
export function hiddenLayerSelectors(allNodes: readonly OutlinerNode[], hiddenIds: readonly string[]): string[] {
  if (hiddenIds.length === 0) return [];
  const byId = new Map(allNodes.map((n) => [n.nodeId, n]));
  const hidden = new Set(hiddenIds);
  const subtreeSlots = collectSubtreeSlotIds(allNodes);
  const selectors: string[] = [];
  for (const id of hidden) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.targetSlotId) {
      selectors.push(`[data-slot-id="${CSS.escape(node.targetSlotId)}"]`);
      continue;
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const isTopBlock = Boolean(node.targetBlockId) && (!parent || !parent.targetBlockId);
    if (isTopBlock) {
      selectors.push(`[data-block-id="${CSS.escape(node.targetBlockId!)}"]`);
    } else {
      for (const slotId of subtreeSlots.get(id) ?? []) selectors.push(`[data-slot-id="${CSS.escape(slotId)}"]`);
    }
  }
  return selectors;
}
