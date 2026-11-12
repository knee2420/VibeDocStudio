import { useMemo } from "react";

import type { OutlinerNode } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useAttachPickStore } from "@/features/ai-workspace";

import { computeRowSelection, type RowSelection } from "./outlineSections";

const EMPTY = new Set<string>();

/**
 * 구역이 보여주는 행들의 선택 표시 (캔버스 단일 · 다중 선택 + 사이드바 선택 + Ctrl/Shift 다중 선택).
 * 구역 단위로 한 번 계산하고, 줄은 `sel` 값이 바뀔 때만 다시 그린다.
 */
export function useRowSelection(nodes: readonly OutlinerNode[]): Map<string, RowSelection> {
  const selectedNodeId = useWorkspaceSessionStore((s) => s.selectedOutlinerNodeId);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const slotRange = useSlotSelectionStore((s) => s.slotRange);
  const tableBlockId = useSlotSelectionStore((s) => (s.tableSelection?.tableSelected ? s.tableSelection.blockId : null));
  const picked = useAttachPickStore((s) => s.picked.outline);

  return useMemo(() => {
    const slotIds = new Set<string>(slotRange ? [...slotRange.slotIds, ...slotRange.unitIds] : []);
    if (selectedSlotId) slotIds.add(selectedSlotId);
    const blockIds = new Set<string>();
    if (selectedBlockId) blockIds.add(selectedBlockId);
    if (tableBlockId) blockIds.add(tableBlockId);
    const pickedIds = picked?.length ? new Set(picked.map((r) => r.id)) : EMPTY;
    return computeRowSelection(nodes, { selectedNodeId, slotIds, blockIds, pickedIds });
  }, [nodes, selectedNodeId, selectedSlotId, selectedBlockId, slotRange, tableBlockId, picked]);
}
