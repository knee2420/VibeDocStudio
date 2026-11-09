import React, { useEffect, useState } from "react";
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
  findReferenceItem,
  selectCurrentReferenceId,
  useReferenceStore,
} from "@/entities/reference-manager";
import { ProvenanceBadge, selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { useSwitchWorkbenchPhase } from "@/features/switch-workbench-phase";
import { TruncatedLabel } from "@/shared/ui";

export const Phase1StorylineWorkbench: React.FC = () => {
  const [aiPrompt, setAiPrompt] = useState("");

  const activeProject = useProjectStore(selectActiveProject);
  // AI 가 쓰는 것과 같은 목록: 이 프로젝트에 연결된 레퍼런스. 목차는 레퍼런스 구조 추출에서 온다.
  const bound = useReferenceStore((s) => s.bound);
  const currentRefId = useReferenceStore(selectCurrentReferenceId);
  const setActiveRefId = useReferenceStore((s) => s.setActiveRefId);
  const ensureDetail = useReferenceStore((s) => s.ensureDetail);
  const outline = useReferenceStore((s) => (currentRefId ? s.extraction[currentRefId]?.outline : undefined));
  const currentRef = bound.find((b) => b.refId === currentRefId);
  const insertStorylineNode = useProjectStore((s) => s.insertStorylineNode);
  const updateStorylineNode = useProjectStore((s) => s.updateStorylineNode);

  const { switchPhase } = useSwitchWorkbenchPhase();
  const { isAiStreaming, runPhase1StorylineAi, abortActiveAiRun } = useStageAiChanges();

  useEffect(() => {
    if (currentRefId) void ensureDetail(currentRefId);
  }, [currentRefId, ensureDetail]);

  if (!activeProject) return null;

  /** 레퍼런스 목차 한 줄을 내 스토리라인 노드로 가져온다 — 출처는 레퍼런스 앵커(ref:<refId> · 블록)로 남는다. */
  const borrowHeading = (refId: string, blockId: string, title: string, page: number) =>
    insertStorylineNode(
      null,
      { title, summary: `레퍼런스 "${findReferenceItem(refId)?.title ?? refId}" ${page}쪽의 구성을 따른 섹션`, zoomLevel: "page" },
      { sourceProjectId: `ref:${refId}`, sourceNodeId: blockId }
    );

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
              Phase 1 · 스토리라인 기획 & 레퍼런스 목차 대조
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1.5">
              레퍼런스의 목차 구성을 좌측에 띄워두고 내 프로젝트의 전체 목차 트리를 설계합니다
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
                레퍼런스 목차 (읽기 전용)
              </h3>
            </div>
            <div className="flex gap-1">
              {bound.map((b, idx) => (
                <button
                  key={b.refId}
                  type="button"
                  onClick={() => setActiveRefId(b.refId)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                    b.refId === currentRefId
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  참조 {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {currentRef ? (
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-lg bg-violet-50/70 border border-violet-200 text-xs text-violet-950">
                <div className="font-bold">{currentRef.item.title}</div>
                <div className="text-[11px] text-violet-700 mt-0.5">
                  🔒 레퍼런스의 목차 구성(어떻게 짰나)만 가져옵니다 · 가져온 노드에는 레퍼런스 출처가 남습니다.
                </div>
              </div>

              {(outline ?? []).length === 0 ? (
                <div className="p-3 text-[11px] text-slate-400">
                  {outline ? "이 레퍼런스에서 찾은 제목이 없습니다." : "목차를 불러오는 중…"}
                </div>
              ) : (
                (outline ?? []).map((o, i) => {
                  const blockId = o.blockId || `p${o.page}-${i + 1}`;
                  return (
                    <div
                      key={`${blockId}-${i}`}
                      className="p-3 rounded-xl border border-slate-200 hover:border-violet-300 bg-slate-50/50 space-y-1.5 transition"
                      style={{ marginLeft: `${Math.max(0, o.level - 1) * 12}px` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <TruncatedLabel text={o.title} className="text-xs font-bold text-slate-900 flex-1" />
                        <button
                          type="button"
                          data-testid={`phase1-clone-btn-${blockId}`}
                          onClick={() => void borrowHeading(currentRef.refId, blockId, o.title, o.page)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold cursor-pointer shrink-0 shadow-2xs"
                        >
                          <CopyPlus className="w-3 h-3" />
                          내 스토리라인으로 가져오기
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        ref:{currentRef.refId}#blk:{blockId} · {o.page}쪽 · H{o.level}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="p-3 text-[11px] text-slate-400">연결된 레퍼런스가 없습니다. Reference Manager 에서 추가하세요.</div>
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
                제목을 직접 수정하거나 레퍼런스 목차를 가져와 구성을 완성하세요
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
                      sourceTitle={
                        node.provenanceSourceProjectId?.startsWith("ref:")
                          ? findReferenceItem(node.provenanceSourceProjectId.slice(4))?.title
                          : undefined
                      }
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

