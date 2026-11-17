export {
  selectActiveDocument,
  selectDocument,
  useStudioDocumentStore,
} from "./model/useStudioDocumentStore";
export type { DocumentSaveState, StudioDocumentState, StudioTab, UpdateDocOptions } from "./model/useStudioDocumentStore";
export type { ChangeNote, DocumentSummary, DocumentVersion, RevisionEntry, RevisionSlotChange } from "./api/documentApi";
export { documentApi } from "./api/documentApi";
export { getDocumentSource, getPageNumber, getPageThumbnailUrl } from "./lib/previewAssets";
export type { DocumentSourceView } from "./lib/previewAssets";
export { DocumentStatusBadges } from "./ui/DocumentStatusBadges";
export type { DocumentStatusBadgesProps } from "./ui/DocumentStatusBadges";
export { PageThumbnail } from "./ui/PageThumbnail";
export type { PageThumbnailProps } from "./ui/PageThumbnail";
export { SaveConflictPill } from "./ui/SaveConflictPill";
export {
  buildChanges,
  formatCharStat,
  formatPageNos,
  groupChangesByPage,
  pageTitle,
  slotLocations,
  summarizeChanges,
  sumStatsOf,
} from "./lib/changeSet";
export type { ChangeInput, ChangeItem, ChangePageGroup, ChangeSummary, SlotLocation } from "./lib/changeSet";
export { addCounts, blockChangeDetail, blockName, countBlocks, formatBlockCounts, pageBlockChanges, slotBlockIndex } from "./lib/blockChanges";
export type { BlockChange, BlockChangeKind, BlockCounts, PageBlockInput, SlotBlock } from "./lib/blockChanges";
export { BlockCountBadge } from "./ui/BlockCountBadge";
