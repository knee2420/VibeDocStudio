import React, { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Layers,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type {
  A2uiCandidateCard,
  A2uiCandidateGroup,
  AguiSurfacePlacement,
  AguiToneFilter,
  WysiwygSuggestion,
} from "../model/aguiDemoModel";

interface MeasuredRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface WysiwygSuggestionOverlayProps {
  pageId: string;
  hostRef: React.RefObject<HTMLDivElement | null>;
  renderWidth: number;
  scale: number;
  surfacePlacement: AguiSurfacePlacement;
  suggestions: readonly WysiwygSuggestion[];
  activeSuggestionId: string | null;
  activeCandidateGroup: A2uiCandidateGroup | null;
  selectedCandidateId: string | null;
  toneFilter: AguiToneFilter;
  onSelectSuggestion: (id: string | null) => void;
  onSelectVariant: (suggestionId: string, variantId: "A" | "B") => void;
  onAcceptSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onRevertSuggestion: (suggestionId: string) => void;
  onSelectCandidate: (group: A2uiCandidateGroup, card: A2uiCandidateCard) => void;
  onResumeDecision: (reason: string) => void;
  onChangeToneFilter: (tone: AguiToneFilter) => void;
}

/**
 * 중앙 시트(UnifiedSheetViewport) 내부의 대상 `[data-block-id]` 좌표에 직접 앵커링되는 오버레이.
 * - AG-UI 1.0: 위지윅 인라인 수정 제안 핀 + A/B안 Unified Diff 플로팅 카드
 * - A2UI 1.0 (`surface: "popover"`): 대상 블록 옆 플로팅 에셋 후보 선택 Surface
 */
export const WysiwygSuggestionOverlay: React.FC<WysiwygSuggestionOverlayProps> = ({
  pageId,
  hostRef,
  renderWidth,
  scale,
  surfacePlacement,
  suggestions,
  activeSuggestionId,
  activeCandidateGroup,
  selectedCandidateId,
  toneFilter,
  onSelectSuggestion,
  onSelectVariant,
  onAcceptSuggestion,
  onRejectSuggestion,
  onRevertSuggestion,
  onSelectCandidate,
  onResumeDecision,
  onChangeToneFilter,
}) => {
  const [rects, setRects] = useState<Record<string, MeasuredRect>>({});

  useEffect(() => {
    const hostEl = hostRef.current;
    if (!hostEl) return;

    const targetIds = new Set<string>();
    for (const s of suggestions) targetIds.add(s.targetBlockId);
    if (surfacePlacement === "popover" && activeCandidateGroup) {
      targetIds.add(activeCandidateGroup.targetBlockId);
    }

    const measure = () => {
      const pageInner = hostEl.querySelector<HTMLElement>(
        `[data-vdoc-page-inner][data-vdoc-page-id="${CSS.escape(pageId)}"]`
      );
      if (!pageInner) return;
      const rootRect = pageInner.getBoundingClientRect();
      const sRatio = rootRect.width / renderWidth || 1;
      const next: Record<string, MeasuredRect> = {};

      for (const blockId of targetIds) {
        const blockEl = pageInner.querySelector<HTMLElement>(
          `[data-block-id="${CSS.escape(blockId)}"]`
        );
        if (!blockEl) continue;
        const elRect = blockEl.getBoundingClientRect();
        next[blockId] = {
          top: (elRect.top - rootRect.top) / sRatio,
          left: (elRect.left - rootRect.left) / sRatio,
          width: elRect.width / sRatio,
          height: elRect.height / sRatio,
        };
      }
      setRects(next);
    };

    const raf = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(hostEl);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [hostRef, pageId, renderWidth, scale, suggestions, surfacePlacement, activeCandidateGroup]);

  const activePopoverRect =
    surfacePlacement === "popover" && activeCandidateGroup
      ? rects[activeCandidateGroup.targetBlockId]
      : undefined;

  const filteredCandidates = activeCandidateGroup
    ? activeCandidateGroup.candidates.filter(
        (c) => toneFilter === "all" || c.toneTags.includes(toneFilter)
      )
    : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* AG-UI 1.0: 위지윅 인라인 수정 제안 핀 & 플로팅 Diff 카드 */}
      {suggestions.map((sug) => {
        const rect = rects[sug.targetBlockId];
        if (!rect) return null;
        const isOpen = activeSuggestionId === sug.id;
        const activeVariant =
          sug.variants.find((v) => v.id === sug.selectedVariantId) ?? sug.variants[0];

        const borderTone =
          sug.status === "accepted"
            ? "border-emerald-500/80 bg-emerald-500/[0.04]"
            : sug.status === "rejected"
              ? "border-slate-300/80 bg-slate-200/[0.05]"
              : "border-amber-500/85 bg-amber-400/[0.05]";

        const badgeTone =
          sug.status === "accepted"
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : sug.status === "rejected"
              ? "bg-slate-500 text-white hover:bg-slate-600"
              : "bg-amber-500 text-white hover:bg-amber-600";

        return (
          <div
            key={sug.id}
            style={{
              top: Math.max(0, rect.top - 4),
              left: Math.max(0, rect.left - 5),
              width: rect.width + 10,
              height: rect.height + 8,
            }}
            className={`absolute rounded-md border-2 border-dashed transition-colors ${borderTone}`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSuggestion(isOpen ? null : sug.id);
              }}
              className={`pointer-events-auto absolute -top-6 right-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-t-md text-[10px] font-bold shadow-xs cursor-pointer transition ${badgeTone}`}
            >
              {sug.status === "accepted" ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>AG-UI 적용됨 ({sug.selectedVariantId}안)</span>
                </>
              ) : sug.status === "rejected" ? (
                <>
                  <X className="w-3 h-3" />
                  <span>제안 거절됨</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3" />
                  <span>AG-UI 수정 제안 · {sug.categoryLabel}</span>
                </>
              )}
            </button>

            {isOpen ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto absolute left-0 top-full mt-2 z-50 w-[440px] max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-2xl p-3 text-left text-xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                        AG-UI STATE_DELTA
                      </span>
                      <span className="font-bold text-slate-900">{sug.targetLabel}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {sug.rationale}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectSuggestion(null)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* A안 / B안 토글 */}
                <div className="grid grid-cols-2 gap-1.5">
                  {sug.variants.map((v) => {
                    const selected = v.id === activeVariant.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onSelectVariant(sug.id, v.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                          selected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold">{v.label}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-white border border-slate-200 text-slate-600">
                            {v.toneBadge}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Unified Diff Preview */}
                <div className="rounded-lg border border-slate-200 overflow-hidden text-[11px] font-sans">
                  <div className="px-2.5 py-1.5 bg-rose-50/90 text-rose-800 border-b border-rose-100 flex items-start gap-1.5">
                    <span className="font-mono font-bold text-rose-500 shrink-0">-</span>
                    <span className="line-through opacity-80 leading-relaxed">{sug.beforeText}</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-emerald-50/90 text-emerald-950 flex items-start gap-1.5">
                    <span className="font-mono font-bold text-emerald-600 shrink-0">+</span>
                    <span className="font-medium leading-relaxed">{activeVariant.afterText}</span>
                  </div>
                </div>

                {activeVariant.layoutAction ? (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-50 border border-violet-200 text-[10px] font-semibold text-violet-700">
                    <Layers className="w-3 h-3" />
                    <span>적용 시 블록 레이아웃도 함께 전환됩니다</span>
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100">
                  {sug.status === "accepted" ? (
                    <button
                      type="button"
                      onClick={() => onRevertSuggestion(sug.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>원문 되돌리기</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onRejectSuggestion(sug.id)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[11px] font-semibold cursor-pointer"
                      >
                        거절
                      </button>
                      <button
                        type="button"
                        onClick={() => onAcceptSuggestion(sug.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>시트에 즉시 적용</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* A2UI 1.0 (surface: "popover"): 캔버스 블록 바로 옆에 뜨는 선언형 에셋 후보 Surface */}
      {surfacePlacement === "popover" && activeCandidateGroup && activePopoverRect ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            top: Math.max(8, activePopoverRect.top + activePopoverRect.height + 10),
            left: Math.max(8, Math.min(activePopoverRect.left, Math.max(8, renderWidth - 468))),
          }}
          className="pointer-events-auto absolute z-40 w-[456px] max-w-[94vw] rounded-2xl border-2 border-indigo-500/80 bg-white/98 backdrop-blur shadow-2xl p-3 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold">
                  <Sparkles className="w-2.5 h-2.5" />
                  A2UI Surface · popover
                </span>
                <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded truncate">
                  {activeCandidateGroup.surfaceId}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900 mt-1">
                {activeCandidateGroup.title}
              </div>
            </div>
          </div>

          {/* A2UI updateDataModel 필터 칩 */}
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                { id: "all", label: "전체" },
                { id: "executive", label: "임원·공식" },
                { id: "visual", label: "시각 강조" },
                { id: "compact", label: "컴팩트" },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onChangeToneFilter(chip.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer transition ${
                  toneFilter === chip.id
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* 후보 카드 그리드 */}
          <div className="grid grid-cols-2 gap-2">
            {filteredCandidates.map((card) => {
              const selected = selectedCandidateId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectCandidate(activeCandidateGroup, card)}
                  className={`p-2 rounded-xl border text-left transition cursor-pointer space-y-1 ${
                    selected
                      ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/30"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-900 truncate">
                      {card.title}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 shrink-0">
                      {card.score}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 line-clamp-2">{card.subtitle}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <span className="text-[10px] text-slate-500">
              카드 클릭 시 위 시트가 즉시 라이브 미리보기됩니다
            </span>
            <button
              type="button"
              onClick={() => onResumeDecision(`A2UI popover 후보 확정 (${selectedCandidateId ?? "기본"})`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>선택 확정 (resume)</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
