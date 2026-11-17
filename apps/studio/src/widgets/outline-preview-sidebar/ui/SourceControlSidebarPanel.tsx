import React, { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, History } from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import {
  DocumentHistoryList,
  lastNamedVersion,
  useDocumentVersions,
  useVersionDocument,
  VersionList,
} from "@/features/document-revisions";

import { StagedChangesSection } from "./source-control/StagedChangesSection";
import { WorkingChanges } from "./source-control/WorkingChanges";

/**
 * 변경 기록 패널 — git 처럼 "보관하고 되돌리는" 것이 중심:
 * 1) 지금 작업: 마지막 버전 이후 바뀐 쪽 (U · M · D) · 비교 · 버전 저장
 * 2) AI 제안: 아직 문서에 넣지 않은 변경안 (있을 때만)
 * 3) 버전: 문서 전체가 보관된 지점들 (이름 붙인 버전 · 자동 보관) — 비교 · 통째로 되돌리기
 * 4) 세부 편집 기록: 버전 사이 무엇을 고쳤나 (접혀 있음)
 */
export const SourceControlSidebarPanel: React.FC = () => {
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activeDoc = useStudioDocumentStore((s) => s.docs.find((d) => d.docId === s.activeDocId) || s.docs[0] || null);
  const docId = activeDoc?.docId ?? activeDocId ?? null;
  const versions = useDocumentVersions(docId);
  const lastVersion = lastNamedVersion(versions);
  const baseDoc = useVersionDocument(docId, lastVersion?.id);
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div data-testid="source-control-panel" className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      <div className="fig-section-header border-b border-[var(--fig-border)]">
        <span className="flex items-center gap-1.5 min-w-0">
          <History className="w-4 h-4 text-black/60 shrink-0" />
          <span className="truncate">변경 기록</span>
        </span>
        <button
          type="button"
          data-testid="collapse-left-sidebar-btn"
          onClick={() => setLeftSidebarOpen(false)}
          className="fig-icon-btn"
          title="좌측 패널 접기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-6 space-y-4">
        {activeDoc && <WorkingChanges doc={activeDoc} lastVersion={lastVersion} baseDoc={baseDoc} />}
        <StagedChangesSection docId={activeDocId} />
        {docId && (
          <div className="border-t border-[var(--fig-border)] pt-2">
            <VersionList docId={docId} />
          </div>
        )}
        <div className="border-t border-[var(--fig-border)] pt-2">
          <button
            type="button"
            onClick={() => setLogOpen(!logOpen)}
            className="w-full h-7 flex items-center gap-1 text-[12px] font-semibold text-black/70"
            data-testid="edit-log-toggle"
            title="버전 사이에 언제 · 누가 · 어디를 고쳤는지"
          >
            {logOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            세부 편집 기록
          </button>
          {logOpen && <DocumentHistoryList docId={docId ?? undefined} />}
        </div>
      </div>
    </div>
  );
};
