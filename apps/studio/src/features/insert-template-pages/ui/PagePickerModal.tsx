import React, { useEffect, useState } from "react";
import { Check, FileText, FolderKanban, Layers, Loader2, X } from "lucide-react";

import type { VDocCatalogManifest, VDocDocument } from "@vibe/vdoc-schema";

import { PdfPagePreviewGrid, type FidelityMode } from "@/entities/scaffold-job";
import { PageThumbnail } from "@/entities/vdoc-document";

import type { PdfPreviewPickerState } from "../model/useInsertTemplatePages";

export interface PagePickerModalProps {
  /** 다중 페이지 선택 대상 문서 (카탈로그 번들). */
  pagePicker: {
    targetDocId: string;
    sourceTitle: string;
    sourceDoc: VDocDocument;
  } | null;
  /** 1단계 PDF 썸네일 미리보기 & 페이지 선택 대상. */
  pdfPreviewPicker?: PdfPreviewPickerState | null;
  /** 카탈로그 목록 브라우저 상태 (`openCatalogBrowser` 호출 시 활성화). */
  catalogBrowser: {
    targetDocId: string;
    categories: { category: string; items: VDocCatalogManifest[] }[];
  } | null;
  loadingMessage: string | null;
  error: string | null;
  onDismissError: () => void;
  onSelectCatalog: (targetDocId: string, manifest: VDocCatalogManifest) => void;
  onConfirmPages: (targetDocId: string, sourceDoc: VDocDocument, pageIds: string[], label: string) => void;
  onConfirmPdfPages?: (
    targetDocId: string,
    file: File,
    title: string,
    selectedPageNumbers: number[],
    fidelityMode: FidelityMode
  ) => void;
  onClose: () => void;
}

/**
 * 카탈로그 서식·섹터 브라우저 및 다중 페이지 선택 모달.
 * - PDF 변환/카탈로그 로딩 중에는 상태 스피너를 표시한다.
 * - 2페이지 이상의 문서가 들어오면 원하는 페이지(섹터)만 체크해 삽입할 수 있다.
 */
export const PagePickerModal: React.FC<PagePickerModalProps> = ({
  pagePicker,
  pdfPreviewPicker = null,
  catalogBrowser,
  loadingMessage,
  error,
  onDismissError,
  onSelectCatalog,
  onConfirmPages,
  onConfirmPdfPages,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  useEffect(() => {
    if (pagePicker) {
      setSelectedIds(pagePicker.sourceDoc.pages.map((p) => p.pageId));
    } else {
      setSelectedIds([]);
    }
  }, [pagePicker]);

  useEffect(() => {
    if (catalogBrowser) setSelectedCategory("ALL");
  }, [catalogBrowser]);

  useEffect(() => {
    if (!pagePicker && !pdfPreviewPicker && !catalogBrowser && !loadingMessage && !error) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loadingMessage) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pagePicker, pdfPreviewPicker, catalogBrowser, loadingMessage, error, onClose]);

  if (!pagePicker && !pdfPreviewPicker && !catalogBrowser && !loadingMessage && !error) return null;

  // 변환 · 로딩 중 인디케이터 모달
  if (loadingMessage && !pagePicker && !pdfPreviewPicker) {
    return (
      <div
        data-testid="template-loading-modal"
        className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 flex flex-col items-center text-center gap-3">
          <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">템플릿 준비 중</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  // 오류 알림 모달
  if (error && !pagePicker && !catalogBrowser) {
    return (
      <div
        data-testid="template-error-modal"
        className="fixed inset-0 z-[120] bg-slate-900/40 flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-rose-800">템플릿을 불러오지 못했습니다</h3>
            <button
              type="button"
              onClick={onDismissError}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 break-all">{error}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDismissError}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1단계: PDF 썸네일 미리보기 + 정밀도 선택 + 삽입 대상 고르기
  if (pdfPreviewPicker) {
    return (
      <PdfPreviewPickerDialog
        key={`${pdfPreviewPicker.targetDocId}:${pdfPreviewPicker.file.name}:${pdfPreviewPicker.file.lastModified}`}
        picker={pdfPreviewPicker}
        onConfirmPdfPages={onConfirmPdfPages}
        onClose={onClose}
      />
    );
  }

  // 2단계: 다중 페이지 / 섹터 선택 화면 (카탈로그 번들용)
  if (pagePicker) {
    const pages = pagePicker.sourceDoc.pages;
    const allSelected = pages.length > 0 && selectedIds.length === pages.length;

    const toggleOne = (pageId: string) => {
      setSelectedIds((prev) => (prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]));
    };
    const toggleAll = () => {
      setSelectedIds(allSelected ? [] : pages.map((p) => p.pageId));
    };
    const confirm = () => {
      if (selectedIds.length === 0) return;
      // 문서 내 원래 순서대로 정렬해 삽입
      const ordered = pages.filter((p) => selectedIds.includes(p.pageId)).map((p) => p.pageId);
      onConfirmPages(
        pagePicker.targetDocId,
        pagePicker.sourceDoc,
        ordered,
        `템플릿 페이지 ${ordered.length}개 삽입 ("${pagePicker.sourceTitle}")`
      );
    };

    return (
      <div
        data-testid="page-picker-modal"
        className="fixed inset-0 z-[120] bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-6 select-none"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden"
        >
          <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                <Layers className="w-3.5 h-3.5" />
                <span>삽입할 페이지(섹터) 선택</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 truncate mt-0.5">{pagePicker.sourceTitle}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs bg-white shrink-0">
            <span className="text-slate-600">
              원하는 페이지/섹터만 골라 문서 끝에 추가할 수 있습니다 ({selectedIds.length}/{pages.length} 선택)
            </span>
            <button
              type="button"
              data-testid="page-picker-toggle-all"
              onClick={toggleAll}
              className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
            >
              {allSelected ? "모두 해제" : "전체 선택"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#f8fafc]">
            {pages.map((page) => {
              const checked = selectedIds.includes(page.pageId);
              const blockNames = page.blocks.map((b) => b.title || b.kind).slice(0, 3);
              return (
                <button
                  key={page.pageId}
                  type="button"
                  data-testid={`page-picker-item-${page.pageId}`}
                  onClick={() => toggleOne(page.pageId)}
                  className={`text-left rounded-xl border p-3 flex gap-3 transition cursor-pointer bg-white ${
                    checked
                      ? "border-emerald-500 ring-2 ring-emerald-500/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="w-16 h-22 rounded border border-slate-200 overflow-hidden shrink-0 bg-slate-50">
                    <PageThumbnail doc={pagePicker.sourceDoc} pageNumber={page.pageNumber} fit="cover" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-bold text-slate-400">{page.pageNumber}p</span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            checked ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white"
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 line-clamp-2 mt-0.5">{page.pageLabel}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-2 space-y-0.5">
                      <div>블록 {page.blocks.length}개</div>
                      {blockNames.length > 0 && (
                        <div className="truncate text-[10px] text-slate-400">{blockNames.join(" · ")}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <footer className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              data-testid="page-picker-confirm-btn"
              disabled={selectedIds.length === 0}
              onClick={confirm}
              className="px-4 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition"
            >
              선택한 {selectedIds.length}개 페이지 추가
            </button>
          </footer>
        </div>
      </div>
    );
  }

  // 1단계: 카탈로그 · 섹터 템플릿 선택 창
  if (catalogBrowser) {
    const visibleCategories =
      selectedCategory === "ALL"
        ? catalogBrowser.categories
        : catalogBrowser.categories.filter((c) => c.category === selectedCategory);

    return (
      <div
        data-testid="catalog-browser-modal"
        className="fixed inset-0 z-[120] bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-6 select-none"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden"
        >
          <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                <FolderKanban className="w-3.5 h-3.5" />
                <span>카탈로그 · 섹터 템플릿에서 페이지 추가</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">추가할 서식 또는 섹터 묶음을 고르세요</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {error && (
            <div className="px-5 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={onDismissError} className="underline cursor-pointer">
                닫기
              </button>
            </div>
          )}

          {/* 카테고리 필터 탭 */}
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto bg-white shrink-0">
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer shrink-0 ${
                selectedCategory === "ALL"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              전체
            </button>
            {catalogBrowser.categories.map((cat) => (
              <button
                key={cat.category}
                type="button"
                onClick={() => setSelectedCategory(cat.category)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer shrink-0 ${
                  selectedCategory === cat.category
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat.category} ({cat.items.length})
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#f8fafc]">
            {visibleCategories.map((group) => (
              <section key={group.category} className="space-y-2">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{group.category}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {group.items.map((item) => (
                    <button
                      key={item.catalogId}
                      type="button"
                      data-testid={`catalog-template-item-${item.catalogId}`}
                      onClick={() => onSelectCatalog(catalogBrowser.targetDocId, item)}
                      className="text-left rounded-xl border border-slate-200 hover:border-emerald-500 hover:ring-2 hover:ring-emerald-500/15 bg-white p-3.5 transition cursor-pointer flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 leading-snug">{item.title}</span>
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                      </div>
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

interface PdfPreviewPickerDialogProps {
  picker: PdfPreviewPickerState;
  onConfirmPdfPages?: PagePickerModalProps["onConfirmPdfPages"];
  onClose: () => void;
}

const PdfPreviewPickerDialog: React.FC<PdfPreviewPickerDialogProps> = ({ picker, onConfirmPdfPages, onClose }) => {
  const [selectedPdfPages, setSelectedPdfPages] = useState<number[]>(() => picker.preview.pages.map((p) => p.pageNumber));
  const [pdfFidelityMode, setPdfFidelityMode] = useState<FidelityMode>("balanced");

  const allNumbers = picker.preview.pages.map((p) => p.pageNumber);
  const togglePdfPage = (pageNum: number) => {
    setSelectedPdfPages((prev) =>
      prev.includes(pageNum) ? prev.filter((n) => n !== pageNum) : [...prev, pageNum].sort((a, b) => a - b)
    );
  };
  const toggleAllPdfPages = () => {
    setSelectedPdfPages((prev) => (prev.length === allNumbers.length ? [] : allNumbers));
  };
  const confirmPdf = () => {
    if (selectedPdfPages.length === 0 || !onConfirmPdfPages) return;
    onConfirmPdfPages(picker.targetDocId, picker.file, picker.sourceTitle, selectedPdfPages, pdfFidelityMode);
  };

  return (
    <div
      data-testid="pdf-preview-picker-modal"
      className="fixed inset-0 z-[120] bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-6 select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[84vh] flex flex-col overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <Layers className="w-3.5 h-3.5" />
              <span>1단계 · 삽입할 PDF 페이지 및 정밀도 선택</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 truncate mt-0.5">{picker.sourceTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 bg-[#f8fafc]">
          <PdfPagePreviewGrid
            preview={picker.preview}
            selectedPageNumbers={selectedPdfPages}
            onTogglePage={togglePdfPage}
            onToggleAll={toggleAllPdfPages}
            fidelityMode={pdfFidelityMode}
            onFidelityModeChange={setPdfFidelityMode}
          />
        </div>

        <footer className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500">
            선택한 페이지 수만큼 캔버스 자리가 먼저 만들어지고, 앞에서부터 한 페이지씩 변환됩니다.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              data-testid="pdf-picker-confirm-btn"
              disabled={selectedPdfPages.length === 0}
              onClick={confirmPdf}
              className="px-4 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] disabled:opacity-40 text-white text-xs font-bold cursor-pointer transition"
            >
              선택한 {selectedPdfPages.length}개 페이지 추가 · 변환 시작
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

