import React from "react";
import { Plus } from "lucide-react";

import type { OutlinerNode, WorkbenchPhase } from "@vibe/vdoc-schema";

import type { OutlineRowActions, RenameState } from "../model/useOutlineRowActions";

/** Documents & Pages · Elements 구역이 함께 받는 값. */
export interface SectionProps {
  activeDocId: string;
  actions: OutlineRowActions;
  phase: WorkbenchPhase;
  renaming: RenameState | null;
  /** Shift+클릭 범위 고르기용으로 이 구역이 지금 보여주는 행을 알린다. */
  reportOrder: (nodes: readonly OutlinerNode[]) => void;
}

/** 피그마 행 모양의 `+ 새 기획 노드` (1·2단계에서만). */
export const AddNodeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" data-testid="add-outline-node-btn" onClick={onClick} className="fig-row w-[calc(100%-16px)] text-black/50 hover:text-black/90" style={{ paddingLeft: 4 }}>
    <span className="fig-row-chevron" aria-hidden />
    <span className="fig-row-icon">
      <Plus className="w-3 h-3" />
    </span>
    <span className="fig-row-label text-left">새 기획 노드</span>
  </button>
);
