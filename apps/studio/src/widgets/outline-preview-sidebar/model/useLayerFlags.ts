import { useMemo, useRef } from "react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { collectSubtreeSlotIds } from "@/features/layer-visibility";

/** 눈 아이콘 상태: `self` 이 행을 숨김 · `inherited` 숨긴 노드의 자손 (피그마처럼 흐리게만). */
export type RowHidden = "self" | "inherited";

const EMPTY: readonly string[] = [];

/**
 * 행마다 잠금 대상 슬롯(자기 아래 전부)과 숨김 상태.
 * 슬롯 목록은 내용이 같으면 이전 배열을 그대로 돌려준다 — 타이핑으로 투영이 바뀔 때마다 모든 줄이
 * 새 prop 을 받아 다시 그려지지 않게.
 */
export function useLayerFlags(baseNodes: readonly OutlinerNode[], visibleNodes: readonly OutlinerNode[]) {
  const cache = useRef(new Map<string, readonly string[]>());
  const lockSlotIds = useMemo(() => {
    const prev = cache.current;
    const next = new Map<string, readonly string[]>();
    for (const [id, slots] of collectSubtreeSlotIds(baseNodes)) {
      const old = prev.get(id);
      next.set(id, slots.length === 0 ? EMPTY : old && old.length === slots.length && old.every((v, i) => v === slots[i]) ? old : slots);
    }
    cache.current = next;
    return next;
  }, [baseNodes]);

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
