import { createContext, useContext } from "react";

export type GutterChangeKind = "add" | "mod" | "del";

export interface SlotGutterChange {
  slotId: string;
  kind: GutterChangeKind;
  before: string;
  label: string;
  statText: string;
}

const EMPTY_MAP: ReadonlyMap<string, SlotGutterChange> = new Map();

/**
 * 현재 편집 중인 문서의 "마지막 버전 이후 바뀐 슬롯" 맵.
 * DraftingCanvas 에서 한 번 계산해 내려 주면 각 SlotFrame 이 자기 왼쪽 거터 막대만 그린다.
 */
export const WorkingSlotChangesContext = createContext<ReadonlyMap<string, SlotGutterChange>>(EMPTY_MAP);

export function useSlotGutterChange(slotId: string): SlotGutterChange | undefined {
  return useContext(WorkingSlotChangesContext).get(slotId);
}
