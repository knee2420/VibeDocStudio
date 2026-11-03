import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LayoutTemplate,
  Sparkles,
} from "lucide-react";

import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useStageAiChanges } from "@/features/stage-ai-changes";
import { TruncatedLabel } from "@/shared/ui";

const TEMPLATE_OPTIONS = [
  {
    id: "composite-form-frame",
    label: "복합 양식 프레임 (Composite Form)",
    desc: "한국형 공문·회의록·결재란 다중 섹션 2px 외곽선 양식",
  },
  {
    id: "structured-table",
    label: "정밀 그리드 테이블 (Structured Table)",
    desc: "단가·SLA·수치 비교 및 행/열 병합 지원 표 블록",
  },
  {
    id: "columns-grid",
    label: "다단 비교 그리드 (Columns Grid)",
    desc: "좌우 대조 및 2~3단 카드형 레이아웃 블록",
  },
  {
    id: "cover-banner",
    label: "표지 헤드라인 배너 (Cover Banner)",
    desc: "제안서·보고서 표지 타이틀 및 작성/수신처 블록",
  },
  {
    id: "section-block",
    label: "표준 리치 텍스트 섹션 (Section Block)",
    desc: "소제목 슬롯 + 본문 Tiptap 에디터 슬롯 조합",
  },
];

export const Phase2TemplateWorkbench: React.FC = () => {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const assignTemplateToNode = useProjectStore((s) => s.assignTemplateToNode);

  const setPhase = useWorkspaceSessionStore((s) => s.setPhase);
  const { runPhase2TemplateAi } = useStageAiChanges();

  const activeProject =
    projects.find((p) => p.projectId === activeProjectId) || projects[0];

  return (
    <div
      data-testid="phase2-template-workbench"
      className="max-w-5xl mx-auto py-6 px-6 space-y-5 select-text"
    >
      {/* Header Banner */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
            <LayoutTemplate className="w-3.5 h-3.5" />
            Phase 2 · 템플릿·서식 조율 워크벤치 (비파괴 가역 전환)
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-1.5">
            스토리라인 각 목차 노드에 최적화된 조판 블록(표·복합 양식·배너)을 배정하고 튜닝합니다
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="back-to-phase1-btn"
            onClick={() => setPhase("storylining")}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Phase 1(스토리라인)으로 돌아가기
          </button>

          <button
            type="button"
            data-testid="phase2-ai-recommend-btn"
            onClick={() => runPhase2TemplateAi("정밀 비교 표 및 복합 양식 자동 매핑")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            ✨ AI 최적 서식 일괄 추천 (Staged)
          </button>

          <button
            type="button"
            data-testid="goto-phase3-btn"
            onClick={() => setPhase("drafting")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-bold shadow-sm cursor-pointer transition"
          >
            Phase 3: 슬롯 본문 집필로 이동
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Node -> Template Mapping Cards */}
      <div className="space-y-3">
        {activeProject.storylineNodes
          .filter((n) => n.parentId !== null)
          .map((node) => {
            const currentTpl = node.recommendedTemplateId || "section-block";
            return (
              <div
                key={node.nodeId}
                data-testid={`phase2-node-card-${node.nodeId}`}
                className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <TruncatedLabel
                      text={node.title}
                      className="text-sm font-bold text-slate-900"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">
                      {node.summary}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-[#248567] border border-emerald-200 text-xs font-bold font-mono shrink-0">
                    현재 서식: {currentTpl}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {TEMPLATE_OPTIONS.map((tpl) => {
                    const selected = currentTpl === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        data-testid={`assign-tpl-${node.nodeId}-${tpl.id}`}
                        onClick={() => assignTemplateToNode(node.nodeId, tpl.id)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                          selected
                            ? "border-[#248567] bg-emerald-50/60 ring-1 ring-[#248567]"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {tpl.label.split(" (")[0]}
                          </span>
                          {selected && (
                            <Check className="w-3.5 h-3.5 text-[#248567] shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 line-clamp-2">
                          {tpl.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

