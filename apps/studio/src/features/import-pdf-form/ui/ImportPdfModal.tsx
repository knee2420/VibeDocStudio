import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Loader2,
  X,
  Layers,
  Archive,
} from "lucide-react";

import { FIDELITY_OPTIONS, PdfPagePreviewGrid, type PdfPreviewResult } from "@/entities/scaffold-job";

import type { FidelityMode, ImportMode } from "../model/useImportPdfForm";

interface ImportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  docTitle: string;
  onTitleChange: (title: string) => void;
  importMode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  fidelityMode: FidelityMode;
  onFidelityModeChange: (mode: FidelityMode) => void;
  preview: PdfPreviewResult | null;
  isPreviewLoading: boolean;
  selectedPageNumbers: readonly number[];
  onTogglePreviewPage: (pageNumber: number) => void;
  onToggleAllPreviewPages: () => void;
  isLoading: boolean;
  currentStep: 1 | 2 | 3;
  errorMessage: string | null;
  onSubmit: () => void;
}

export const ImportPdfModal: React.FC<ImportPdfModalProps> = ({
  isOpen,
  onClose,
  selectedFile,
  onFileSelect,
  docTitle,
  onTitleChange,
  importMode,
  onModeChange,
  fidelityMode,
  onFidelityModeChange,
  preview,
  isPreviewLoading,
  selectedPageNumbers,
  onTogglePreviewPage,
  onToggleAllPreviewPages,
  isLoading,
  currentStep,
  errorMessage,
  onSubmit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".pdf")) {
      onFileSelect(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  if (typeof document === "undefined") return null;

  const widenForPreview = importMode === "canvas" && Boolean(preview);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div
        className={`w-full ${
          widenForPreview ? "max-w-2xl" : "max-w-lg"
        } bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                PDF 양식 불러오기
              </h2>
              <p className="text-xs text-slate-500">
                DocIR 구조·표·OCR 분석으로 편집 가능한 .vdoc 양식을 생성합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* File Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isLoading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer flex flex-col items-center justify-center ${
              isDragging
                ? "border-emerald-500 bg-emerald-50/50"
                : selectedFile
                  ? "border-slate-300 bg-slate-50/60"
                  : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileInput}
              className="hidden"
              disabled={isLoading}
            />

            {selectedFile ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-slate-900 max-w-xs truncate">
                    {selectedFile.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB · 파일 교체하려면
                    클릭
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-1.5">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div className="text-xs font-medium text-slate-700">
                  PDF 파일을 여기로 드래그하거나 클릭하여 선택
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  규정, 공문, 서식, 보고서 등 모든 PDF 양식 지원
                </div>
              </>
            )}
          </div>

          {/* Document Title Input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              문서 제목
            </label>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="예: 학술정보운영위원회 규정"
              disabled={isLoading}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition disabled:bg-slate-50"
            />
          </div>

          {/* Import Mode Radio */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              적용 대상
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onModeChange("canvas")}
                disabled={isLoading}
                className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition ${
                  importMode === "canvas"
                    ? "border-emerald-500 bg-emerald-50/40 text-emerald-950 ring-1 ring-emerald-500"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">내 캔버스에 즉시 열기</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    현재 편집 작업 공간으로 로드
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onModeChange("catalog")}
                disabled={isLoading}
                className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition ${
                  importMode === "catalog"
                    ? "border-emerald-500 bg-emerald-50/40 text-emerald-950 ring-1 ring-emerald-500"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <Archive className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">서식 보관함에 등록</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    카탈로그 템플릿으로 영구 보관
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 1단계 PDF 썸네일 미리보기 + 페이지 선택 (캔버스 모드) */}
          {importMode === "canvas" && isPreviewLoading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-2.5 text-xs text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
              <span>페이지 썸네일과 텍스트 레이어를 확인하고 있습니다...</span>
            </div>
          )}

          {importMode === "canvas" && preview && !isPreviewLoading && (
            <PdfPagePreviewGrid
              preview={preview}
              selectedPageNumbers={selectedPageNumbers}
              onTogglePage={onTogglePreviewPage}
              onToggleAll={onToggleAllPreviewPages}
              fidelityMode={fidelityMode}
              onFidelityModeChange={onFidelityModeChange}
              disabled={isLoading}
              compact
            />
          )}

          {/* Fidelity Mode Selector (미리보기 전 기본 표시용) */}
          {importMode === "canvas" && !preview && !isPreviewLoading && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  AI 에이전트 정밀도 모드
                </label>
                <span className="text-[10px] text-slate-400">
                  검증 깊이 및 VLM 재판독 루프 제어
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {FIDELITY_OPTIONS.map(({ mode, label, detailLines, Icon, iconClass }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onFidelityModeChange(mode)}
                    disabled={isLoading}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      fidelityMode === mode
                        ? "border-emerald-500 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500 shadow-2xs"
                        : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900">
                      <Icon className={`w-3.5 h-3.5 ${iconClass} shrink-0`} />
                      {label}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      {detailLines[0]}
                      <br />
                      {detailLines[1]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          {isLoading && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  스캐폴딩 파이프라인 가동 중...
                </span>
                <span className="text-[11px] text-slate-500">
                  {currentStep === 1 && "1/3단계: DocIR 구조·OCR 추출"}
                  {currentStep === 2 && `2/3단계: 구조 검증 · VLM 재판독 (${fidelityMode} 모드)`}
                  {currentStep === 3 && "3/3단계: .vdoc 컴파일 및 렌더링"}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 transition-all duration-300 rounded-full"
                  style={{
                    width:
                      currentStep === 1 ? "35%" : currentStep === 2 ? "70%" : "95%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-white transition disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={
              !selectedFile ||
              isLoading ||
              isPreviewLoading ||
              (importMode === "canvas" && Boolean(preview) && selectedPageNumbers.length === 0)
            }
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                준비 중...
              </>
            ) : importMode === "canvas" && preview ? (
              <>
                <FileText className="w-3.5 h-3.5" />
                선택한 {selectedPageNumbers.length}개 페이지로 문서 만들기 · 변환 시작
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                양식 불러오기 실행
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
