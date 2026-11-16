import React from "react";
import { ChevronLeft, History } from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { DocumentHistoryList } from "@/features/document-revisions";

import { StagedChangesSection } from "./source-control/StagedChangesSection";
import { WorkingChanges } from "./source-control/WorkingChanges";

/**
 * 변경 기록 패널 — 문서 작업자 기준으로:
 * 1) 지금 작업: 마지막 버전 이후 어느 쪽 어디를 얼마나 고쳤나 · 검토 · 버전 저장
 * 2) AI 제안: 아직 문서에 넣지 않은 변경안 (있을 때만)
 * 3) 기록: 날짜별 편집 세션과 이름 붙인 버전 (누르면 가운데에서 빨강/초록으로 검토)
 */
export const SourceControlSidebarPanel: React.FC = () => {
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const activeDoc = useStudioDocumentStore((s) => s.docs.find((d) => d.docId === s.activeDocId) || s.docs[0] || null);

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
        {activeDoc && <WorkingChanges doc={activeDoc} />}
        <StagedChangesSection docId={activeDocId} />
        <div className="border-t border-[var(--fig-border)] pt-2">
          <DocumentHistoryList docId={activeDocId ?? undefined} />
        </div>
      </div>
    </div>
  );
};
