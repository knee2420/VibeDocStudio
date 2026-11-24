import React, { useState } from "react";
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  LayoutGrid,
  Loader2,
  MessageSquare,
  PanelRight,
  Play,
  Pointer,
  RotateCcw,
  Sparkles,
  Terminal,
  Wand2,
  X,
} from "lucide-react";
import type { LinkedDocumentSpec } from "../model/types";
import type {
  A2uiCandidateCard,
  A2uiCandidateGroup,
  AguiSurfacePlacement,
  AguiToneFilter,
  AguiWireEvent,
  SubagentRunState,
  WysiwygSuggestion,
} from "../model/aguiDemoModel";

export interface AguiA2uiDemoPanelProps {
  linkedDocs: readonly LinkedDocumentSpec[];
  activeLinkedDocId: string | null;
  candidateGroups: readonly A2uiCandidateGroup[];
  activeGroupId: string;
  selectedCandidateByGroup: Record<string, string>;
  suggestions: readonly WysiwygSuggestion[];
  activeSuggestionId: string | null;
  surfacePlacement: AguiSurfacePlacement;
  toneFilter: AguiToneFilter;
  runStatus: "running" | "interrupted" | "success";
  subagents: readonly SubagentRunState[];
  wireEvents: readonly AguiWireEvent[];
  onSelectLinkedDoc: (docId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onChangeSurfacePlacement: (placement: AguiSurfacePlacement) => void;
  onChangeToneFilter: (tone: AguiToneFilter) => void;
  onSelectCandidate: (group: A2uiCandidateGroup, card: A2uiCandidateCard) => void;
  onFocusBlock: (nodeId: string, switchToWysiwyg?: boolean) => void;
  onSelectSuggestion: (id: string | null) => void;
  onSelectVariant: (suggestionId: string, variantId: "A" | "B") => void;
  onAcceptSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onRevertSuggestion: (suggestionId: string) => void;
  onAcceptAllSuggestions: () => void;
  onRunParallelScan: () => void;
  onResumeDecision: (reason: string) => void;
}

const SURFACE_OPTIONS: ReadonlyArray<{
  id: AguiSurfacePlacement;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    id: "drawer",
    label: "우측 드로어",
    hint: "A2UI 카탈로그 + AG-UI 인스펙터를 우측 전용 Surface에 배치",
    icon: <PanelRight className="w-3 h-3" />,
  },
  {
    id: "popover",
    label: "캔버스 팝오버",
    hint: "중앙 시트의 대상 블록 바로 옆에 A2UI 후보 팝오버를 직접 띄움",
    icon: <Pointer className="w-3 h-3" />,
  },
  {
    id: "chat-inline",
    label: "채팅창 인라인",
    hint: "기존에 알던 채팅 말풍선 안 위젯 방식과 동일 페이로드를 직접 비교",
    icon: <MessageSquare className="w-3 h-3" />,
  },
];

const TONE_CHIPS: ReadonlyArray<{ id: AguiToneFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "executive", label: "임원·공식" },
  { id: "visual", label: "시각 강조" },
  { id: "compact", label: "컴팩트" },
];

const BAR_COLORS = {
  dark: "bg-slate-800 text-white",
  indigo: "bg-indigo-100 text-indigo-800 border border-indigo-200",
  emerald: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  slate: "bg-slate-100 text-slate-600 border border-slate-200",
};

export const AguiA2uiDemoPanel: React.FC<AguiA2uiDemoPanelProps> = ({
  linkedDocs,
  activeLinkedDocId,
  candidateGroups,
  activeGroupId,
  selectedCandidateByGroup,
  suggestions,
  activeSuggestionId,
  surfacePlacement,
  toneFilter,
  runStatus,
  subagents,
  wireEvents,
  onSelectLinkedDoc,
  onSelectGroup,
  onChangeSurfacePlacement,
  onChangeToneFilter,
  onSelectCandidate,
  onFocusBlock,
  onSelectSuggestion,
  onSelectVariant,
  onAcceptSuggestion,
  onRejectSuggestion,
  onRevertSuggestion,
  onAcceptAllSuggestions,
  onRunParallelScan,
  onResumeDecision,
}) => {
  const [activeTab, setActiveTab] = useState<"assets" | "wysiwyg">("assets");
  const [wireOpen, setWireOpen] = useState(true);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  const activeGroup =
    candidateGroups.find((g) => g.id === activeGroupId) ?? candidateGroups[0] ?? null;
  const filteredCandidates = activeGroup
    ? activeGroup.candidates.filter(
        (c) => toneFilter === "all" || c.toneTags.includes(toneFilter)
      )
    : [];
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const acceptedCount = suggestions.filter((s) => s.status === "accepted").length;

  const renderCandidateCard = (group: A2uiCandidateGroup, card: A2uiCandidateCard) => {
    const selected = selectedCandidateByGroup[group.id] === card.id;
    return (
      <button
        key={card.id}
        type="button"
        onClick={() => onSelectCandidate(group, card)}
        className={`w-full rounded-xl border p-2.5 text-left transition cursor-pointer space-y-1.5 ${
          selected
            ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/25 shadow-2xs"
            : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/70"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-900">{card.title}</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-semibold">
                {card.badge}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{card.subtitle}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              {card.score}%
            </span>
            {selected ? (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" />
              </span>
            ) : null}
          </div>
        </div>

        {/* Mini structural preview bars */}
        <div className="flex flex-col gap-1 pt-0.5">
          {card.previewBars.map((bar, idx) => (
            <div
              key={idx}
              className={`px-2 py-0.5 rounded text-[9px] font-medium truncate ${BAR_COLORS[bar.tone]}`}
            >
              {bar.label}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed">{card.rationale}</p>
      </button>
    );
  };

  const renderSuggestionCard = (sug: WysiwygSuggestion) => {
    const activeVariant =
      sug.variants.find((v) => v.id === sug.selectedVariantId) ?? sug.variants[0];
    const isSelected = activeSuggestionId === sug.id;

    return (
      <div
        key={sug.id}
        className={`rounded-xl border p-2.5 space-y-2 transition ${
          sug.status === "accepted"
            ? "border-emerald-300 bg-emerald-50/40"
            : sug.status === "rejected"
              ? "border-slate-200 bg-slate-50/70 opacity-75"
              : isSelected
                ? "border-amber-400 bg-amber-50/30 ring-1 ring-amber-400/30"
                : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                {sug.categoryLabel}
              </span>
              <span className="text-xs font-bold text-slate-900 truncate">{sug.targetLabel}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{sug.rationale}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectSuggestion(sug.id);
              onFocusBlock(sug.targetNodeId, true);
            }}
            className="shrink-0 px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-600 cursor-pointer"
            title="시트 해당 위치로 포커스"
          >
            위치 보기
          </button>
        </div>

        {/* A안 / B안 토글 */}
        <div className="grid grid-cols-2 gap-1">
          {sug.variants.map((v) => {
            const active = v.id === activeVariant.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelectVariant(sug.id, v.id)}
                className={`px-2 py-1 rounded-lg border text-left transition cursor-pointer ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="text-[10px] font-bold truncate">{v.label}</div>
                <div className="text-[9px] text-slate-500 truncate">{v.toneBadge}</div>
              </button>
            );
          })}
        </div>

        {/* Unified Diff */}
        <div className="rounded-lg border border-slate-200 overflow-hidden text-[10.5px]">
          <div className="px-2 py-1 bg-rose-50/90 text-rose-800 border-b border-rose-100 flex items-start gap-1">
            <span className="font-mono font-bold text-rose-500 shrink-0">-</span>
            <span className="line-through opacity-80 leading-snug">{sug.beforeText}</span>
          </div>
          <div className="px-2 py-1 bg-emerald-50/90 text-emerald-950 flex items-start gap-1">
            <span className="font-mono font-bold text-emerald-600 shrink-0">+</span>
            <span className="font-medium leading-snug">{activeVariant.afterText}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          {sug.status === "accepted" ? (
            <>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                시트 반영 완료 ({sug.selectedVariantId}안)
              </span>
              <button
                type="button"
                onClick={() => onRevertSuggestion(sug.id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-600 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                되돌리기
              </button>
            </>
          ) : sug.status === "rejected" ? (
            <>
              <span className="text-[10px] text-slate-500">제안 거절됨</span>
              <button
                type="button"
                onClick={() => onRevertSuggestion(sug.id)}
                className="text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                다시 검토
              </button>
            </>
          ) : (
            <>
              <span className="font-mono text-[9px] text-slate-400 truncate">
                STATE_DELTA · {sug.id}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onRejectSuggestion(sug.id)}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  거절
                </button>
                <button
                  type="button"
                  onClick={() => onAcceptSuggestion(sug.id)}
                  className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer shadow-2xs"
                >
                  <Check className="w-3 h-3" />
                  적용
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-[388px] shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
      {/* 상단 프로토콜 랩 헤더 */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 bg-gradient-to-r from-indigo-50/90 via-white to-emerald-50/70 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-slate-900 truncate">
                AG-UI 1.0 · A2UI 1.0 목업 랩
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                에셋 후보 추천 + 위지윅 인라인 수정 제안
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={runStatus === "running"}
            onClick={onRunParallelScan}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer shrink-0 ${
              runStatus === "running"
                ? "bg-slate-200 text-slate-500 cursor-wait"
                : "bg-slate-900 text-white hover:bg-slate-800 shadow-2xs"
            }`}
            title="2개의 병렬 서브에이전트(asset-recommender, wysiwyg-reviewer) 실행 시뮬레이션"
          >
            {runStatus === "running" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            <span>병렬 스캔</span>
          </button>
        </div>

        {/* 4종 포맷 빠른 전환 바 */}
        {linkedDocs.length > 1 ? (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {linkedDocs.map((doc) => {
              const active = doc.id === activeLinkedDocId;
              const shortBadge = doc.docFormat?.toUpperCase() ?? "DOC";
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelectLinkedDoc(doc.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer shrink-0 ${
                    active
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                  title={doc.title}
                >
                  {shortBadge}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* A2UI Surface 위치 전환기 (핵심 비교 포인트!) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-slate-600">A2UI Surface 배치 비교</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                runStatus === "running"
                  ? "bg-indigo-100 text-indigo-700"
                  : runStatus === "interrupted"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {runStatus === "running"
                ? "SUBAGENT 병렬 실행 중..."
                : runStatus === "interrupted"
                  ? "INTERRUPTED · 선택 대기"
                  : "RUN_FINISHED · 적용 완료"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-200/70">
            {SURFACE_OPTIONS.map((opt) => {
              const active = surfacePlacement === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeSurfacePlacement(opt.id)}
                  title={opt.hint}
                  className={`inline-flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    active
                      ? "bg-white text-indigo-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.icon}
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 병렬 Subagent 상태 미니 바 */}
        <div className="grid grid-cols-2 gap-1.5">
          {subagents.map((sub) => (
            <div
              key={sub.subagentRunId}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 space-y-0.5"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-slate-700 truncate">
                  {sub.status === "running" ? (
                    <Loader2 className="w-2.5 h-2.5 text-indigo-600 animate-spin shrink-0" />
                  ) : (
                    <Cpu className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  )}
                  <span className="truncate">{sub.name}</span>
                </span>
                <span className="text-[9px] font-mono text-slate-400">{sub.progress}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  style={{ width: `${sub.progress}%` }}
                  className={`h-full transition-all duration-300 ${
                    sub.status === "running" ? "bg-indigo-500" : "bg-emerald-500"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 본문 영역: surfacePlacement에 따라 Chat-Inline vs Drawer/Popover 비교 렌더링 */}
      {surfacePlacement === "chat-inline" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-slate-50/70 space-y-3">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-2 text-[10.5px] text-indigo-900 leading-relaxed">
            <strong>채팅창 인라인 비교 모드:</strong> 기존에 아시던 <em>“채팅 말풍선 안 위젯”</em>과 동일한 A2UI/AG-UI 페이로드를 그대로 렌더링했습니다. 상단에서{" "}
            <strong>우측 드로어 / 캔버스 팝오버</strong>로 전환해 같은 데이터가 어떻게 배치되는지 비교해 보세요.
          </div>

          {/* 사용자 말풍선 */}
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 text-white px-3 py-2 text-[11px] leading-relaxed shadow-2xs">
              현재 문서 포맷에 맞는 에셋 후보 3~4개 추천해주고, 위지윅에서 다듬을 문구도 A/B안으로 제안해줘.
            </div>
          </div>

          {/* AI 에이전트 말풍선 + A2UI 인라인 위젯 */}
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white p-2.5 text-[11px] text-slate-700 leading-relaxed shadow-2xs">
                병렬 워커 2개(<code>asset-recommender</code>, <code>wysiwyg-reviewer</code>) 분석을 마쳤습니다. 아래 카드에서 에셋 후보를 바로 눌러 미리보거나 수정 제안을 선택해 주세요.
              </div>

              {activeGroup ? (
                <div className="rounded-2xl border border-indigo-200 bg-white p-2.5 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-indigo-700">
                      A2UI 인라인 카드 · {activeGroup.targetLabel}
                    </span>
                    <span className="font-mono text-[9px] text-slate-400">chat-inline</span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredCandidates.slice(0, 3).map((card) =>
                      renderCandidateCard(activeGroup, card)
                    )}
                  </div>
                </div>
              ) : null}

              {suggestions.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-white p-2.5 space-y-2 shadow-xs">
                  <div className="text-[10px] font-bold text-amber-800">
                    AG-UI 수정 제안 ({suggestions.length}건)
                  </div>
                  {suggestions.map((sug) => renderSuggestionCard(sug))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 탭 바 (A2UI 에셋 후보 vs AG-UI 위지윅 제안) */}
          <div className="px-3 pt-2 border-b border-slate-200 flex items-center gap-1 shrink-0 bg-slate-50/50">
            <button
              type="button"
              onClick={() => setActiveTab("assets")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold border-b-2 transition cursor-pointer ${
                activeTab === "assets"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>A2UI 에셋 후보</span>
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[9px]">
                {activeGroup?.candidates.length ?? 0}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("wysiwyg")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold border-b-2 transition cursor-pointer ${
                activeTab === "wysiwyg"
                  ? "border-amber-500 text-amber-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AG-UI 수정 제안</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[9px]">
                {pendingCount > 0 ? `${pendingCount} 대기` : `${acceptedCount} 적용`}
              </span>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {surfacePlacement === "popover" ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-2.5 text-[11px] text-indigo-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <Pointer className="w-3.5 h-3.5 text-indigo-600" />
                  <span>캔버스 팝오버 Surface 활성화됨</span>
                </div>
                <p className="text-[10.5px] text-indigo-800/90 leading-relaxed">
                  중앙 시트의 <strong>대상 블록 바로 아래</strong>에 A2UI 후보 선택 팝오버가 직접 떠 있습니다. 아래에서 대상 블록을 바꾸면 팝오버도 즉시 이동합니다.
                </p>
              </div>
            ) : null}

            {activeTab === "assets" ? (
              activeGroup ? (
                <div className="space-y-2.5">
                  {/* 대상 블록 전환 칩 */}
                  {candidateGroups.length > 1 ? (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-500">추천 대상 블록</div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {candidateGroups.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              onSelectGroup(g.id);
                              onFocusBlock(g.targetNodeId, false);
                            }}
                            className={`px-2 py-1 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition ${
                              g.id === activeGroup.id
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {g.targetLabel}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* A2UI 메타 배지 */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-700">{activeGroup.title}</span>
                    </div>
                    <div className="font-mono text-[9px] text-slate-500 truncate">
                      @catalogId: {activeGroup.catalogId}
                    </div>
                  </div>

                  {/* A2UI updateDataModel 필터 칩 */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {TONE_CHIPS.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => onChangeToneFilter(chip.id)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer transition ${
                          toneFilter === chip.id
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {/* 후보 카드 목록 */}
                  <div className="space-y-2">
                    {filteredCandidates.map((card) => renderCandidateCard(activeGroup, card))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onResumeDecision(
                        `A2UI 에셋 후보 확정 (${selectedCandidateByGroup[activeGroup.id] ?? activeGroup.candidates[0]?.id})`
                      )
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>현재 선택 확정 &amp; 에이전트 재개 (resume)</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-center py-8">
                  이 문서에 등록된 A2UI 에셋 후보가 없습니다.
                </div>
              )
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600">
                    시트 위 <strong>노란색 점선 배지</strong>를 눌러도 바로 Diff가 열립니다.
                  </span>
                  {pendingCount > 0 ? (
                    <button
                      type="button"
                      onClick={onAcceptAllSuggestions}
                      className="shrink-0 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                    >
                      모두 적용 ({pendingCount})
                    </button>
                  ) : null}
                </div>

                {suggestions.length > 0 ? (
                  <div className="space-y-2.5">
                    {suggestions.map((sug) => renderSuggestionCard(sug))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-8">
                    이 문서에 대기 중인 위지윅 수정 제안이 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 하단 접이식 AG-UI / A2UI 와이어 이벤트 로그 인스펙터 */}
      <div className="border-t border-slate-200 bg-slate-950 text-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => setWireOpen((v) => !v)}
          className="w-full px-3 py-1.5 flex items-center justify-between text-[10.5px] font-mono hover:bg-slate-900 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100">
            <Terminal className="w-3 h-3 text-emerald-400" />
            <span>WIRE EVENT STREAM</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-300 text-[9.5px]">
              {wireEvents.length}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400">
            <Activity className="w-3 h-3" />
            {wireOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        </button>

        {wireOpen ? (
          <div className="max-h-[172px] overflow-y-auto px-2 pb-2 space-y-1 font-mono text-[10px]">
            {[...wireEvents].reverse().map((ev) => {
              const expanded = expandedSeq === ev.seq;
              const isA2ui = ev.protocol === "A2UI 1.0";
              return (
                <div
                  key={ev.seq}
                  className="rounded border border-slate-800 bg-slate-900/90 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSeq(expanded ? null : ev.seq)}
                    className="w-full px-2 py-1 flex items-center justify-between gap-1.5 text-left hover:bg-slate-800/80 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`px-1 py-0.2 rounded text-[8.5px] font-bold shrink-0 ${
                          isA2ui
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        }`}
                      >
                        {isA2ui ? "A2UI" : "AG-UI"}
                      </span>
                      <span className="text-amber-300 font-bold shrink-0">{ev.type}</span>
                      <span className="text-slate-300 truncate">{ev.summary}</span>
                    </span>
                    <span className="text-[9px] text-slate-500 shrink-0">{ev.timestamp}</span>
                  </button>
                  {expanded ? (
                    <pre className="px-2 py-1.5 border-t border-slate-800 bg-slate-950 text-[9.5px] text-sky-200 overflow-x-auto leading-snug">
                      {JSON.stringify(
                        {
                          protocol: ev.protocol,
                          type: ev.type,
                          ...(ev.subagentRunId ? { subagentRunId: ev.subagentRunId } : null),
                          ...ev.payload,
                        },
                        null,
                        2
                      )}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
};
