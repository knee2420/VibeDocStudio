export { RevisionTimeline } from "./ui/RevisionTimeline";
export type { RevisionTimelineProps } from "./ui/RevisionTimeline";
export { restoreSlots, useRevisions } from "./model/useRevisions";
export { authorLabel, buildHistory, dayLabel, timeLabel, timeRange } from "./model/history";
export type { EditSession } from "./model/history";
export {
  differingSlotIds,
  getVersionDocument,
  lastNamedVersion,
  openVersionCompare,
  useVersionDocument,
  pageSlotIds,
  removeVersion,
  renameVersion,
  restorePageFromVersion,
  restoreVersion,
  saveVersion,
  useDocumentVersions,
  useVersionsStore,
} from "./model/versions";
export { DocumentHistoryList } from "./ui/DocumentHistoryList";
export { SaveVersionForm } from "./ui/SaveVersionForm";
export { VersionList } from "./ui/VersionList";
export {
  computeWorkingPages,
  stagedSlotHtml,
  useLastVersionBases,
  useWorkingPagesByDoc,
  type WorkingChangesInput,
  type WorkingKind,
  type WorkingPage,
} from "./model/workingChanges";
