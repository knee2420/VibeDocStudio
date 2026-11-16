import { useMemo } from "react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { collectSubtreeSlotIds } from "@/features/layer-visibility";

/** 눈 아이콘 상태: `self` 이 행을 숨김 · `inherited` 숨긴 노드의 자손 (피그마처럼 흐리게만). */
export type RowHidden = "self" | "inherited";

/**
 * 행마다 잠금 대상 슬롯(자기 아래 전부)과 숨김 상태.
 * `collectSubtreeSlotIds` 가 `baseNodes` 단위로 WeakMap 캐시해 같은 트리면 동일 배열 참조를 돌려준다.
 */
export function useLayerFlags(baseNodes: readonly OutlinerNode[], visibleNodes: readonly OutlinerNode[]) {
  const lockSlotIds = useMemo(() => collectSubtreeSlotIds(baseNodes), [baseNodes]);

  const hiddenIds = useWorkspaceSessionStore((s) => s.hiddenNodeIds);
  const hidden = useMemo(() => {
    const out = new Map<string, RowHidden>();
    if (hiddenIds.length === 0) return out;
    const set = new Set(hiddenIds);
    let ancestorDepth = -1;
    for (const node of visibleNodes) {
      if (ancestorDepth >= 0 && node.depth <= ancestorDepth) ancestorDepth = -1;
      if (set.has(node.nodeId)) {
        out.set(node.nodeId, "self");
        if (ancestorDepth < 0) ancestorDepth = node.depth;
      } else if (ancestorDepth >= 0) {
        out.set(node.nodeId, "inherited");
      }
    }
    return out;
  }, [visibleNodes, hiddenIds]);

  return { lockSlotIds, hidden };
}
