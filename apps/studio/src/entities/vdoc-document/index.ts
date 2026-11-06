export {
  selectActiveDocument,
  selectDocument,
  useStudioDocumentStore,
} from "./model/useStudioDocumentStore";
export type { DocumentSaveState, StudioDocumentState, UpdateDocOptions } from "./model/useStudioDocumentStore";
export type { ChangeNote, RevisionEntry, RevisionSlotChange } from "./api/documentApi";
export { documentApi } from "./api/documentApi";
export { getDocumentSource, getPageNumber, getPageThumbnailUrl } from "./lib/previewAssets";
export type { DocumentSourceView } from "./lib/previewAssets";
export { DocumentStatusBadges } from "./ui/DocumentStatusBadges";
export type { DocumentStatusBadgesProps } from "./ui/DocumentStatusBadges";
export { PageThumbnail } from "./ui/PageThumbnail";
export type { PageThumbnailProps } from "./ui/PageThumbnail";
export { SaveConflictPill } from "./ui/SaveConflictPill";
