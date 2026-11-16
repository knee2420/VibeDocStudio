/**
 * Phase 1 WorkingOutline → Phase 3 `.vdoc` Commit 산출기.
 *
 * 컴파일된 문서 목록과 함께, 새로 생성된 페이지·블록·슬롯 ID 를 반영해
 * `dirty = false` 로 재정렬된 `WorkingOutlineDocument` 를 돌려준다.
 */
import type { VProjectManifest } from "../project-manifest";
import type { VDocDocument } from "../types";
import { compileOutlineToPreview } from "./compile-preview";
import { buildWorkingOutlineFromProjectDocs } from "./from-vdoc";
import type { WorkingOutlineDocument } from "./working-outline";

export interface CommitOutlineResult {
  documents: VDocDocument[];
  syncedOutline: WorkingOutlineDocument;
}

export function buildCommittedDocuments(
  outline: WorkingOutlineDocument,
  baseDocs: readonly VDocDocument[],
  project: VProjectManifest
): CommitOutlineResult {
  const compiled = compileOutlineToPreview(outline, baseDocs, { projectTitle: project.title });
  const nextProject: VProjectManifest = {
    ...project,
    docIds: compiled.map((d) => d.docId),
  };
  const syncedOutline = buildWorkingOutlineFromProjectDocs(nextProject, compiled);
  return {
    documents: compiled,
    syncedOutline: {
      ...syncedOutline,
      revision: outline.revision + 1,
      dirty: false,
    },
  };
}
