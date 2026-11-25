export {
  PAGES_PANE_HEIGHT,
  REFERENCE_SPLIT_WIDTH,
  RIGHT_SIDEBAR_WIDTH,
  RM_SPLIT_WIDTH,
  SIDEBAR_WIDTH,
  useWorkspaceLayoutStore,
} from "./model/useWorkspaceLayoutStore";
export type { ActivityBarTab, LeftPanelTab, RightPanelTab, RmPlacement, WorkspaceLayoutState } from "./model/useWorkspaceLayoutStore";

export {
  SPLIT_DOC_MIME,
  SPLIT_PANE_DEFAULT_WIDTH,
  SPLIT_PANE_MAX_WIDTH,
  SPLIT_PANE_MIN_WIDTH,
  hasSplitDragData,
  readSplitDragData,
  setSplitDragData,
  useDocumentSplitStore,
} from "./model/useDocumentSplitStore";
export type { DocumentSplitPaneState, SplitDocPayload, SplitSide } from "./model/useDocumentSplitStore";
