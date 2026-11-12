import React from "react";
import { AlertTriangle, Check, Crosshair, Scale, Zap } from "lucide-react";

import type { FidelityMode, PdfPreviewResult } from "../model/types";

export interface PdfPagePreviewGridProps {
  preview: PdfPreviewResult;
  selectedPageNumbers: readonly number[];
  onTogglePage: (pageNumber: number) => void;
  onToggleAll: () => void;
  fidelityMode: FidelityMode;
  onFidelityModeChange: (mode: FidelityMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const FIDELITY_OPTIONS: readonly {
  mode: FidelityMode;
  label: string;
  desc: string;
  detailLines: readonly [string, string];
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}[] = [
  {
    mode: "fast",
    label: "빠름 (Fast)",
    desc: "결정적 추출 · 즉시 변환",
    detailLines: ["DocIR 구조·표·OCR 추출", "VLM 재판독 생략"],
    Icon: Zap,
    iconClass: "text-amber-500",
  },
  {
    mode: "balanced",
    label: "균형 (권장)",
    desc: "이상 구간 VLM 재판독",
    detailLines: ["1차 검증 후 의심 표·OCR만", "최대 1회 VLM 정밀 보정"],
    Icon: Scale,
    iconClass: "text-emerald-600",
  },
  {
    mode: "strict",
    label: "초정밀 (Strict)",
    desc: "표본 검증 · 최대 2회 루프",
    detailLines: ["표본 교차검증 포함", "최대 2라운드 VLM 재판독"],
    Icon: Crosshair,
    iconClass: "text-indigo-500",
  },
];

/**
 * 1단계 PDF 썸네일 미리보기 · 텍스트 레이어 진단 배지 · 정밀도 모드 · 페이지 선택 그리드.
 * `@/entities/scaffold-job` 공용 UI 로 `PagePickerModal` 과 `ImportPdfModal` 이 함께 사용한다.
 */
export const PdfPagePreviewGrid: React.FC<PdfPagePreviewGridProps> = ({
  preview,
  selectedPageNumbers,
  onTogglePage,
  onToggleAll,
  fidelityMode,
  onFidelityModeChange,
  disabled = false,
  compact = false,
}) => {
  const selectedSet = new Set(selectedPageNumbers);
  const allSelected = preview.pages.length > 0 && selectedSet.size === preview.pages.length;

  return (
    <div className="space-y-3">
      {!preview.hasAnyTextLayer && (
        <div
          data-testid="pdf-no-text-layer-warning"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold">텍스트 레이어가 없는 PDF(윤곽선/스캔)입니다.</span>{" "}
            OCR(광학 문자 인식)과 DocIR 격자 분석으로 텍스트·표 구조를 자동 추출합니다. ("균형" 또는 "초정밀" 모드 권장)
          </div>
        </div>
      )}

      {/* 정밀도 모드 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-slate-600">AI 에이전트 정밀도 모드</span>
          <span className="text-[10px] text-slate-400">선택한 페이지만 순서대로 비동기 처리됩니다</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FIDELITY_OPTIONS.map(({ mode, label, desc, Icon, iconClass }) => {
            const active = fidelityMode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => onFidelityModeChange(mode)}
                className={`p-2 rounded-xl border text-left transition cursor-pointer disabled:opacity-50 ${
                  active
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500 shadow-2xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-900">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} />
                  <span className="truncate">{label}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 요약 + 전체 선택 */}
      <div className="flex items-center justify-between text-xs pt-0.5">
        <span className="text-slate-600">
          추가할 페이지를 선택하세요 ({selectedSet.size}/{preview.totalPages}p 선택)
        </span>
        <button
          type="button"
          data-testid="pdf-picker-toggle-all"
          disabled={disabled}
          onClick={onToggleAll}
          className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer disabled:opacity-50"
        >
          {allSelected ? "모두 해제" : "전체 선택"}
        </button>
      </div>

      {/* 페이지 썸네일 그리드 */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${
          compact ? "max-h-56 overflow-y-auto pr-0.5" : ""
        }`}
      >
        {preview.pages.map((p) => {
          const checked = selectedSet.has(p.pageNumber);
          return (
            <button
              key={p.pageNumber}
              type="button"
              disabled={disabled}
              data-testid={`pdf-preview-item-${p.pageNumber}`}
              onClick={() => onTogglePage(p.pageNumber)}
              className={`text-left rounded-xl border p-2.5 flex gap-3 transition cursor-pointer bg-white disabled:opacity-50 ${
                checked
                  ? "border-emerald-500 ring-2 ring-emerald-500/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="w-14 h-20 rounded border border-slate-200 overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                {p.thumbnailDataUrl ? (
                  <img
                    src={p.thumbnailDataUrl}
                    alt={`${p.pageNumber}페이지 미리보기`}
                    className="w-full h-full object-contain bg-white"
                  />
                ) : (
                  <span className="text-[11px] font-mono text-slate-400">{p.pageNumber}p</span>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">{p.pageNumber}페이지</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                      checked ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    {checked && <Check className="w-3 h-3 stroke-[3]" />}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.hasTextLayer ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium">
                      텍스트 {p.spanCount}건
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      텍스트 없음
                    </span>
                  )}
                  {p.imageCount > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                      이미지 {p.imageCount}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {Math.round(p.widthPx)}×{Math.round(p.heightPx)}px
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

