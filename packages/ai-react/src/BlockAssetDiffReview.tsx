import React, { useState } from "react";
import { AlertTriangle, Check, Columns2, GitCompareArrows, Layers, Plus, Sparkles, X } from "lucide-react";

export interface BlockAssetDiffReport {
  readonly filled: number;
  readonly empty: number;
  readonly leftover: readonly string[];
  readonly preserved?: { readonly kept: number; readonly total: number };
}

export interface BlockAssetDiffReviewProps {
  readonly diffId: string;
  readonly mode: "replace" | "insert";
  readonly title: string;
  readonly afterSummary?: string;
  readonly report?: BlockAssetDiffReport;
  readonly warnings?: readonly string[];
  /** 에이전트가 교체/추가 방식을 선택한 이유 또는 보완 안내 */
  readonly intentNote?: string;
  readonly sourceLabel?: string;
  readonly onOpenSource?: () => void;
  readonly error?: string | null;
  /** 기준 블록이 있어 승인 직전에 `교체(replace)` ↔ `아래 추가(insert)` 를 전환할 수 있는가 */
  readonly canSwitchMode?: boolean;
  readonly onSwitchMode?: (nextMode: "replace" | "insert") => void;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  /**
   * 교체(`replace`) 대상이 여러 블록일 때 2번째 이후 블록 표시용:
   * 첫 블록에서 Unified Diff 본체와 승인/거절 바를 띄우고, 나머지 블록은 삭제 예정 표시만 한다.
   */
  readonly secondaryRemoved?: boolean;
  /** 배지 문구 커스터마이즈 (기본: replace="에셋 교체 제안", insert="에셋 블록 추가") */
  readonly badgeLabel?: string;
  /** `- 기존` 헤더 문구 커스터마이즈 (기본: "기존 블록") */
  readonly beforeLabel?: string;
  /** `+ 제안` 헤더 문구 커스터마이즈 (기본: "제안 에셋 미리보기") */
  readonly afterLabel?: string;
  /** 기존 캔버스 블록 (`replace` 모드일 때 `- 기존` 영역으로 표시; `insert` 모드에서는 그대로 위에 둠) */
  readonly children?: React.ReactNode;
  /** 새 에셋/스타일 블록의 실제 2D 라이브 렌더 (`+ 제안` 영역) */
  readonly proposedPreview: React.ReactNode;
}

type DiffViewMode = "unified" | "after" | "before";

/**
 * 2D 캔버스 블록 단위 에셋 제안 Unified Diff 검토 컴포넌트 (`@vibe/ai-react`).
 * - `replace`: `- 기존` (로즈 톤) 위에 기존 블록, `+ 제안` (에메랄드 톤) 아래에 새 에셋 2D 프리뷰를 수직 통합 비교.
 *   상단 바에서 [통합 비교 | 제안만 | 원본만] 전환 및 즉시 [✓ 승인] · [✕ 거절] 가능.
 * - `insert`: 기준 블록은 원형 그대로 두고 바로 아래에 `+ 추가 제안` 2D 프리뷰와 승인/거절 바를 붙인다.
 */
export const BlockAssetDiffReview: React.FC<BlockAssetDiffReviewProps> = ({
  diffId,
  mode,
  title,
  afterSummary,
  report,
  warnings,
  intentNote,
  sourceLabel,
  onOpenSource,
  error,
  canSwitchMode = false,
  onSwitchMode,
  onAccept,
  onReject,
  secondaryRemoved = false,
  badgeLabel,
  beforeLabel,
  afterLabel,
  children,
  proposedPreview,
}) => {
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");

  const stopEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  if (secondaryRemoved) {
    return (
      <div
        data-testid={`block-asset-diff-secondary-${diffId}`}
        className="relative rounded-md border border-rose-300/90 border-l-[3px] border-l-rose-500 bg-rose-50/40 p-1.5"
      >
        <div
          onClick={stopEvent}
          onMouseDown={stopEvent}
          className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold text-rose-700 select-none"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-500 font-mono text-[11px] font-bold text-white">
            -
          </span>
          <span>통합 교체로 제거 예정 ({title.replace(/^\[에셋\]\s*/, "")})</span>
        </div>
        <div className="opacity-65">{children}</div>
      </div>
    );
  }

  const cleanTitle = title.replace(/^\[(에셋|스타일)\]\s*/, "");
  const isReplace = mode === "replace";
  const effectiveBadge = badgeLabel ?? (isReplace ? "에셋 교체 제안" : "에셋 블록 추가");
  const effectiveBeforeLabel = beforeLabel ?? "기존 블록";
  const effectiveAfterLabel = afterLabel ?? "제안 에셋 미리보기";

  const diffCard = (
    <div
      data-testid={`block-asset-diff-${diffId}`}
      data-diff-mode={mode}
      className={`relative rounded-lg border shadow-sm overflow-hidden ${
        isReplace
          ? "border-amber-300/90 bg-white ring-1 ring-amber-200/60"
          : "mt-2.5 border-emerald-300/90 bg-white ring-1 ring-emerald-200/60"
      }`}
    >
      {/* Unified Diff Header & Action Bar */}
      <div
        onClick={stopEvent}
        onMouseDown={stopEvent}
        className={`flex flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5 text-[11px] select-none ${
          isReplace
            ? "border-amber-200/90 bg-gradient-to-r from-amber-50/95 via-white to-emerald-50/80 text-slate-800"
            : "border-emerald-200/90 bg-emerald-50/85 text-emerald-950"
        }`}
      >
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            isReplace ? "bg-amber-500/15 text-amber-900 border border-amber-300/70" : "bg-emerald-600 text-white"
          }`}
        >
          {isReplace ? <GitCompareArrows className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          <span>{effectiveBadge}</span>
        </span>

        <span className="min-w-0 flex-1 truncate font-semibold text-slate-800" title={cleanTitle}>
          {cleanTitle}
        </span>

        {sourceLabel && (
          <button
            type="button"
            onClick={onOpenSource}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 cursor-pointer"
            title="이 변경안을 만든 세션 열기"
          >
            ✦ {sourceLabel}
          </button>
        )}

        {canSwitchMode && onSwitchMode && (
          <div
            className="inline-flex shrink-0 items-center rounded-md border border-indigo-200 bg-white p-0.5 text-[10px]"
            role="group"
            aria-label="배치 방식 전환"
          >
            <button
              type="button"
              data-testid={`block-asset-diff-place-replace-${diffId}`}
              onClick={() => onSwitchMode("replace")}
              className={`rounded px-1.5 py-0.5 font-semibold cursor-pointer transition-colors ${
                isReplace
                  ? "bg-amber-600 text-white"
                  : "text-slate-600 hover:bg-amber-50 hover:text-amber-800"
              }`}
              title="기존 블록을 이 에셋으로 교체"
            >
              교체
            </button>
            <button
              type="button"
              data-testid={`block-asset-diff-place-insert-${diffId}`}
              onClick={() => onSwitchMode("insert")}
              className={`rounded px-1.5 py-0.5 font-semibold cursor-pointer transition-colors ${
                !isReplace
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
              title="기존 블록은 유지하고 바로 아래에 추가"
            >
              아래 추가
            </button>
          </div>
        )}

        {isReplace && (
          <div
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5 text-[10px]"
            role="group"
            aria-label="비교 보기 전환"
          >
            <button
              type="button"
              data-testid={`block-asset-diff-mode-unified-${diffId}`}
              onClick={() => setViewMode("unified")}
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors ${
                viewMode === "unified"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="기존(-)/제안(+) 통합 비교"
            >
              <Columns2 className="h-2.5 w-2.5" />
              <span>통합</span>
            </button>
            <button
              type="button"
              data-testid={`block-asset-diff-mode-after-${diffId}`}
              onClick={() => setViewMode("after")}
              className={`rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors ${
                viewMode === "after"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="새 에셋 제안만 보기"
            >
              제안만
            </button>
            <button
              type="button"
              data-testid={`block-asset-diff-mode-before-${diffId}`}
              onClick={() => setViewMode("before")}
              className={`rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors ${
                viewMode === "before"
                  ? "bg-rose-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="기존 블록만 보기"
            >
              원본만
            </button>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid={`block-asset-diff-reject-${diffId}`}
            onClick={onReject}
            className="inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10.5px] font-medium text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
            title="이 에셋 제안 거절"
          >
            <X className="h-3 w-3" />
            <span>거절</span>
          </button>
          <button
            type="button"
            data-testid={`block-asset-diff-accept-${diffId}`}
            onClick={onAccept}
            className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-2.5 py-0.5 text-[10.5px] font-semibold text-white hover:bg-emerald-700 cursor-pointer shadow-xs"
            title="이 에셋 제안을 문서에 반영"
          >
            <Check className="h-3 w-3 stroke-[2.5]" />
            <span>승인</span>
          </button>
        </div>
      </div>

      {/* Report / Diagnostic Strip */}
      {(report || intentNote || (warnings && warnings.length > 0) || error) && (
        <div
          onClick={stopEvent}
          onMouseDown={stopEvent}
          className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/90 px-2.5 py-1 text-[10.5px] text-slate-600 select-none"
        >
          {intentNote && (
            <span
              data-testid={`block-asset-diff-intent-${diffId}`}
              className="inline-flex items-center gap-1 rounded border border-indigo-200/80 bg-indigo-50/70 px-1.5 py-0.5 text-indigo-800"
            >
              <Sparkles className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
              <span>{intentNote}</span>
            </span>
          )}
          {report && (
            <>
              <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 border border-slate-200 text-slate-700">
                <Layers className="h-2.5 w-2.5 text-slate-400" />
                채움 <b>{report.filled}</b> · 빈 자리 <b>{report.empty}</b>
              </span>
              {report.preserved && (
                <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 text-slate-700">
                  옮긴 값 <b>{report.preserved.kept}/{report.preserved.total}</b>
                </span>
              )}
              {report.leftover.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>못 옮김: {report.leftover.join(", ")}</span>
                </span>
              )}
            </>
          )}
          {warnings && warnings.length > 0 && (
            <span className="text-amber-700">{warnings[0]}</span>
          )}
          {error && <span className="font-medium text-rose-600">{error}</span>}
        </div>
      )}

      {/* `- 기존` (Before) Section — replace mode only */}
      {isReplace && viewMode !== "after" && (
        <div
          data-testid={`block-asset-diff-before-${diffId}`}
          className="relative border-l-[3px] border-l-rose-400 bg-rose-50/35 px-3 pt-2 pb-2.5"
        >
          <div
            onClick={stopEvent}
            onMouseDown={stopEvent}
            className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 select-none"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-rose-500 font-mono text-[11px] font-bold text-white">
              -
            </span>
            <span>{effectiveBeforeLabel}</span>
          </div>
          <div className={viewMode === "unified" ? "opacity-75 transition-opacity hover:opacity-100" : ""}>
            {children}
          </div>
        </div>
      )}

      {/* Divider between `- 기존` and `+ 제안` in unified mode */}
      {isReplace && viewMode === "unified" && (
        <div className="border-t border-dashed border-slate-300/90" />
      )}

      {/* `+ 제안` (After) Section — live 2D block preview */}
      {(!isReplace || viewMode !== "before") && (
        <div
          data-testid={`block-asset-diff-after-${diffId}`}
          onClick={stopEvent}
          onMouseDown={stopEvent}
          className="relative border-l-[3px] border-l-emerald-500 bg-emerald-50/30 px-3 pt-2 pb-3"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800 select-none">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-600 font-mono text-[11px] font-bold text-white">
                +
              </span>
              <Sparkles className="h-3 w-3 text-emerald-600" />
              <span>{effectiveAfterLabel}</span>
              {afterSummary && (
                <span className="font-normal normal-case text-emerald-700/80">
                  ({afterSummary})
                </span>
              )}
            </span>
            <span className="font-normal normal-case text-[10px] text-emerald-700/75">
              승인 시 이 모양으로 반영
            </span>
          </div>
          <div className="rounded-md border border-emerald-200/80 bg-white/95 p-2 shadow-[0_1px_3px_rgba(16,185,129,0.08)]">
            {proposedPreview}
          </div>
        </div>
      )}
    </div>
  );

  // `insert` 모드에서는 기준 블록(children)을 원형 그대로 두고 바로 아래에 `+ 에셋 블록 추가` diff 카드를 붙인다.
  if (!isReplace && children) {
    return (
      <div className="relative">
        {children}
        {diffCard}
      </div>
    );
  }

  return diffCard;
};
