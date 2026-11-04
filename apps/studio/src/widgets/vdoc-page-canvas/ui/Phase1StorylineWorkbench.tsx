import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight,
  CopyPlus,
  GitBranch,
  Lock,
  Plus,
  Sparkles,
  Square,
} from "lucide-react";

import {
  ProvenanceBadge,
  selectActiveProject,
  selectBoundReferenceProjects,
  selectCurrentReferenceProject,
  useProjectStore,
} from "@/entities/vdoc-project";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";
import { TruncatedLabel } from "@/shared/ui";

export const Phase1StorylineWorkbench: React.FC = () => {
  const [aiPrompt, setAiPrompt] = useState("");

  const activeProject = useProjectStore(selectActiveProject);
  // AI 가 참조로 쓰는 것과 같은 목록: 이 프로젝트에 연결된 참조 프로젝트.
  const refProjects = useProjectStore(useShallow(selectBoundReferenceProjects));
  const currentRef = useProjectStore(selectCurrentReferenceProject);
  const setSelectedReferenceProjectId = useProjectStore((s) => s.setSelectedReferenceProjectId);
  const cloneNodeFromReference = useProjectStore((s) => s.cloneNodeFromReference);
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const updateStorylineNode = useProjectStore((s) => s.updateStorylineNode);

  const { switchPhase } = useSwitchWorkbenchPhase();
  const { isAiStreaming, runPhase1StorylineAi, abortActiveAiRun } = useStageAiChanges();

  if (!activeProject) return null;

  return (
    <div
      data-testid="phase1-storyline-workbench"
      className="max-w-6xl mx-auto py-6 px-6 space-y-5 select-text"
    >
      {/* Top Banner + AI Storyline Composer Bar */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#248567] border border-emerald-200 text-xs font-bold">
              <GitBranch className="w-3.5 h-3.5" />
              Phase 1 · 스토리라인 기획 & 참조 프로젝트 대조 워크벤치
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1.5">
              참조 레퍼런스(2~3종)를 좌측에 띄워두고 내 프로젝트의 전체 목차 트리를 설계합니다
            </h2>
          </div>

          <button
            type="button"
            data-testid="goto-phase2-btn"
            onClick={() => switchPhase("templating")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-bold shadow-sm cursor-pointer transition"
          >
            Phase 2: 템플릿·서식 조율로 이동
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* AI Storyline Scaffolder Input Bar */}
        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
          <Sparkles className="w-4 h-4 text-amber-500 ml-2 shrink-0" />
          <input
            type="text"
            data-testid="phase1-ai-prompt-input"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="참조 프로젝트를 바탕으로 어떤 스토리라인 목차를 생성할까요?"
            className="flex-1 bg-transparent text-xs text-slate-900 focus:outline-none px-2 py-1"
          />
          {isAiStreaming ? (
            <button
              type="button"
              data-testid="phase1-ai-abort-btn"
              onClick={abortActiveAiRun}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
              ⏹ 생성 중단 (Esc)
            </button>
          ) : (
            <button
              type="button"
              data-testid="phase1-ai-generate-btn"
              disabled={!aiPrompt.trim()}
              onClick={() => void runPhase1StorylineAi(aiPrompt.trim())}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              ✨ AI 스토리라인 자동 스캐폴딩 (Staged)
            </button>
          )}
        </div>
      </div>

      {/* Split Comparison Grid: [Left: Read-Only Reference Project] <-> [Right: Active Project Storyline] */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Read-Only Reference Project Outline */}
        <div className="rounded-2xl bg-white border border-violet-200 shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-bold text-slate-900">
                참조 레퍼런스 아웃라인 (Read-Only)
              </h3>
            </div>
            <div className="flex gap-1">
              {refProjects.map((rp, idx) => (
                <button
                  key={rp.projectId}
                  type="button"
                  onClick={() => setSelectedReferenceProjectId(rp.projectId)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                    rp.projectId === currentRef?.projectId
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  참조 {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {currentRef && (
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-lg bg-violet-50/70 border border-violet-200 text-xs text-violet-950">
                <div className="font-bold">{currentRef.title}</div>
                <div className="text-[11px] text-violet-700 mt-0.5">
                  🔒 읽기 전용 보호됨 · 직접 수정 불가 · 우측 내 작업본으로 복제 시 Provenance 출처가 자동 기록됩니다.
                </div>
              </div>

              {currentRef.storylineNodes
                .filter((n) => n.parentId !== null)
                .map((node) => (
                  <div
                    key={node.nodeId}
                    className="p-3 rounded-xl border border-slate-200 hover:border-violet-300 bg-slate-50/50 space-y-1.5 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <TruncatedLabel
                        text={node.title}
                        className="text-xs font-bold text-slate-900 flex-1"
                      />
                      <button
                        type="button"
                        data-testid={`phase1-clone-btn-${node.nodeId}`}
                        onClick={() =>
                          cloneNodeFromReference(
                            currentRef.projectId,
                            node.nodeId
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold cursor-pointer shrink-0 shadow-2xs"
                      >
                        <CopyPlus className="w-3 h-3" />
                        내 스토리라인으로 복제
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">{node.summary}</p>
                    <div className="text-[10px] text-slate-400 font-mono">
                      권장 서식 블록: {node.recommendedTemplateId || "section-block"}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Right: Active Project Editable Storyline */}
        <div className="rounded-2xl bg-white border border-emerald-200 shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                ✍️ 내 프로젝트 스토리라인 목차 ({activeProject.storylineNodes.length}개 노드)
              </h3>
              <p className="text-[11px] text-slate-500">
                제목을 직접 수정하거나 참조 노드를 복제해 구성을 완성하세요
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                insertStorylineNode(null, {
                  title: "신규 기획 섹션 노드",
                  summary: "핵심 요구사항 및 검토 내용 요약",
                  zoomLevel: "page",
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              섹션 추가
            </button>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {activeProject.storylineNodes
              .filter((n) => n.parentId !== null)
              .map((node) => (
                <div
                  key={node.nodeId}
                  data-testid={`phase1-active-node-${node.nodeId}`}
                  className="p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 space-y-1.5 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={node.title}
                      onChange={(e) =>
                        updateStorylineNode(node.nodeId, {
                          title: e.target.value,
                        })
                      }
                      className="text-xs font-bold text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#248567] rounded px-1.5 py-0.5 flex-1 outline-none"
                    />
                    <ProvenanceBadge
                      sourceProjectId={node.provenanceSourceProjectId}
                      sourceNodeId={node.provenanceSourceNodeId}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 px-1.5">
                    {node.summary}
                  </p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

