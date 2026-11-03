import React, { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Columns,
  CopyPlus,
  Lock,
} from "lucide-react";

import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { EmptyStateCard, TruncatedLabel } from "@/shared/ui";

const DEFAULT_REF_IDS = [
  "vproj-ref-cloud-migration-rfp",
  "vproj-ref-iso27001-audit",
  "vproj-ref-series-b-ir-deck",
];

export const ReferenceDeckSection: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const selectedReferenceProjectId = useProjectStore(
    (s) => s.selectedReferenceProjectId
  );
  const setSelectedReferenceProjectId = useProjectStore(
    (s) => s.setSelectedReferenceProjectId
  );
  const cloneNodeFromReference = useProjectStore(
    (s) => s.cloneNodeFromReference
  );
  const bindReferenceProjects = useProjectStore((s) => s.bindReferenceProjects);

  const splitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.splitReferenceDocId
  );
  const setSplitReferenceDocId = useWorkspaceSessionStore(
    (s) => s.setSplitReferenceDocId
  );

  const activeProject =
    projects.find((p) => p.projectId === activeProjectId) || projects[0];
  const boundRefProjects = projects.filter(
    (p) =>
      p.isReferenceOnly &&
      activeProject.referenceProjectIds.includes(p.projectId)
  );
  const currentRefProject =
    boundRefProjects.find((p) => p.projectId === selectedReferenceProjectId) ||
    boundRefProjects[0];

  const handleToggleZeroRefs = () => {
    if (boundRefProjects.length > 0) {
      bindReferenceProjects([]);
    } else {
      bindReferenceProjects(DEFAULT_REF_IDS);
    }
  };

  return (
    <section
      data-testid="reference-deck-section"
      className="border-t border-slate-200 bg-slate-50/70 flex flex-col shrink-0 max-h-[44%]"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200/80 flex items-center justify-between gap-2 bg-white">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-left min-w-0 cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-violet-600 shrink-0" />
          <span className="text-xs font-bold text-slate-900 truncate">
            참조 프로젝트 덱
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold font-mono tabular-nums">
            {boundRefProjects.length}/3
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        <button
          type="button"
          data-testid="toggle-zero-refs-btn"
          onClick={handleToggleZeroRefs}
          title={
            boundRefProjects.length > 0
              ? "참조 0개 빈 상태(Empty State) 검증"
              : "표준 참조 프로젝트 3종 즉시 연결"
          }
          className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-600 cursor-pointer shrink-0"
        >
          {boundRefProjects.length > 0 ? "비우기(0건)" : "+ 참조 3종 복원"}
        </button>
      </div>

      {expanded && (
        <div className="p-2.5 overflow-y-auto space-y-2 flex-1">
          {boundRefProjects.length === 0 ? (
            <EmptyStateCard
              testId="reference-deck-empty-state"
              icon={<Lock className="w-4 h-4 text-violet-600" />}
              title="연결된 참조 프로젝트가 없습니다 (0/3)"
              description="벤치마킹할 우수 제안서·감사 보고서·정산 명세서 레퍼런스를 최대 3개까지 읽기 전용으로 고정하세요."
              actionLabel="+ 표준 참조 프로젝트 3종 연결"
              onAction={() => bindReferenceProjects(DEFAULT_REF_IDS)}
            />
          ) : (
            <>
              {/* Reference Project Switcher Pills */}
              <div className="flex flex-wrap gap-1">
                {boundRefProjects.map((rp, idx) => {
                  const isSelected =
                    rp.projectId === currentRefProject?.projectId;
                  return (
                    <button
                      key={rp.projectId}
                      type="button"
                      data-testid={`ref-project-pill-${idx + 1}`}
                      onClick={() => setSelectedReferenceProjectId(rp.projectId)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1 max-w-full ${
                        isSelected
                          ? "bg-violet-600 text-white border-violet-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <Lock className="w-2.5 h-2.5 shrink-0" />
                      <TruncatedLabel
                        text={rp.title.replace(/^\[참조 \d\]\s*/, `참조${idx + 1}: `)}
                        className="max-w-[165px]"
                      />
                    </button>
                  );
                })}
              </div>

              {/* Selected Reference Project Read-Only Nodes */}
              {currentRefProject && (
                <div className="rounded-lg border border-violet-200/80 bg-white p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-100">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-800">
                      <Lock className="w-2.5 h-2.5" />
                      읽기 전용 (Read-Only 보호됨)
                    </span>
                    {currentRefProject.docIds[0] && (
                      <button
                        type="button"
                        data-testid="open-split-ref-btn"
                        onClick={() =>
                          setSplitReferenceDocId(
                            splitReferenceDocId === currentRefProject.docIds[0]
                              ? null
                              : currentRefProject.docIds[0]
                          )
                        }
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition ${
                          splitReferenceDocId === currentRefProject.docIds[0]
                            ? "bg-violet-100 text-violet-900 border-violet-300"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <Columns className="w-2.5 h-2.5" />
                        {splitReferenceDocId === currentRefProject.docIds[0]
                          ? "스플릿 닫기"
                          : "우측 스플릿 뷰"}
                      </button>
                    )}
                  </div>

                  {currentRefProject.storylineNodes
                    .filter((n) => n.parentId !== null)
                    .map((refNode) => (
                      <div
                        key={refNode.nodeId}
                        data-testid={`ref-node-card-${refNode.nodeId}`}
                        className="p-2 rounded-md border border-slate-100 bg-slate-50/70 hover:bg-violet-50/40 transition space-y-1"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <TruncatedLabel
                            text={refNode.title}
                            className="text-[11px] font-semibold text-slate-800 flex-1"
                          />
                          <button
                            type="button"
                            data-testid={`clone-ref-node-btn-${refNode.nodeId}`}
                            onClick={() =>
                              cloneNodeFromReference(
                                currentRefProject.projectId,
                                refNode.nodeId
                              )
                            }
                            title="내 작업 프로젝트 아웃라이너로 복제하고 출처(Provenance)를 기록합니다"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold shrink-0 cursor-pointer shadow-2xs"
                          >
                            <CopyPlus className="w-2.5 h-2.5" />
                            복제
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-2">
                          {refNode.summary}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};
