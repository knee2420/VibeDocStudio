/**
 * @vibe/vdoc-schema — Invertible Command Bus Contracts for Unified Undo/Redo (`Ctrl+Z` / `Ctrl+Y`)
 * across Outliner Tree, Template Mapping, Reference Cloning, and Canvas Slot Edits.
 */

export type StudioCommandKind =
  | "ZOOM_IN_OUTLINE"
  | "SWITCH_WORKBENCH_PHASE"
  | "INSERT_OUTLINER_NODE"
  | "UPDATE_OUTLINER_NODE"
  | "DELETE_OUTLINER_NODE"
  | "MOVE_OUTLINER_NODE"
  | "CLONE_REFERENCE_NODE"
  | "ASSIGN_TEMPLATE_BLOCK"
  | "COMMIT_STAGED_AI_DIFF";

export interface CommandUndoToastPayload {
  toastId: string;
  label: string;
  commandKind: StudioCommandKind;
  timestamp: number;
}

