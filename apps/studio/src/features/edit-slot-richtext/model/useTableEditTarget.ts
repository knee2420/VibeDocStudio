import type { TableCellRange } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

import { findTable, findTableForSlot, wholeTableRange, type TableLocation } from "./findTableForSlot";

export type TableEditTarget = TableLocation & { range: TableCellRange };

/**
 * 표 편집 도구가 겨눌 표와 범위. 캔버스에서 고른 범위 · 표 전체 선택이 우선이고,
 * 없으면 커서가 놓인 셀 하나다. 표 밖이면 `null`.
 */
export function useTableEditTarget(): TableEditTarget | null {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const tableSelection = useSlotSelectionStore((s) => s.tableSelection);

  if (!doc) return null;
  if (tableSelection) {
    const loc = findTable(doc, tableSelection.blockId, tableSelection.sectionId);
    if (loc) return { ...loc, range: tableSelection.range ?? wholeTableRange(loc.table) };
  }
  const cell = selectedSlotId ? findTableForSlot(doc, selectedSlotId) : null;
  return cell ? { ...cell, range: cell.cellRange } : null;
}
