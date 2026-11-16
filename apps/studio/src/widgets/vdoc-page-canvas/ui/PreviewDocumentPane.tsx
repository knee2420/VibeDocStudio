import React, { useEffect, useMemo, useRef, useState } from "react";
import { MemoVDocPageSheet } from "@vibe/slot-canvas";
import { documentSurface, resolvePageDimensionsPx, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";
import { Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useWorkingOutlineStore } from "@/entities/working-outline";
import { useCompileAndCommit } from "@/features/workflowy-outliner";

const NOOP = () => {};
const VIEWPORT_HORIZONTAL_PADDING = 32;
const INITIAL_PREVIEW_PAGES = 8;

/** 컨테이너 가용 폭에 맞춰 페이지 축소 비율을 `[0.2, 1]` 범위로 계산한다. */
export function computePreviewFitScale(availableWidth: number, pageWidth: number): number {
  if (availableWidth <= 0 || pageWidth <= 0) return 1;
  return Math.min(1, Math.max(0.2, availableWidth / pageWidth));
}

interface ScaledPageFrameProps {
  doc: VDocDocument;
  page: VDocPage;
  seamless: boolean;
  availableWidth: number;
  fitToWidth: boolean;
}

const ScaledPageFrame: React.FC<ScaledPageFrameProps> = ({
  doc,
  page,
  seamless,
  availableWidth,
  fitToWidth,
}) => {
  const pageDims = useMemo(() => resolvePageDimensionsPx(page), [page]);
  const scale = fitToWidth ? computePreviewFitScale(availableWidth, pageDims.width) : 1;
  const isScaled = scale < 0.999;

  const innerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(pageDims.height);

  useEffect(() => {
    if (!isScaled) return;
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const h = el.offsetHeight;
      if (h > 0) setMeasuredHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isScaled, page]);

  const sheet = (
    <MemoVDocPageSheet
      docTitle={doc.title}
      totalPages={doc.pages.length}
      seamless={seamless}
      page={page}
      slots={doc.slots}
      backdata={doc.backdata}
      mode="Viewing"
      selectedSlotId={null}
      composerOpenSlotId={null}
      onSelectPage={NOOP}
      onSelectSlot={NOOP}
      onToggleComposerForSlot={NOOP}
      onOpenBackdataDrawer={NOOP}
      onUpdateSlotContent={NOOP}
      onMoveBlock={NOOP}
      onDeleteBlock={NOOP}
    />
  );

  if (!isScaled) {
    return (
      <div className="shrink-0 shadow-sm border border-slate-200 bg-white">
        {sheet}
      </div>
    );
  }

  return (
    <div
      style={{
        width: Math.round(pageDims.width * scale),
        height: Math.round((measuredHeight > 0 ? measuredHeight : pageDims.height) * scale),
      }}
      className="relative shrink-0 overflow-hidden shadow-sm border border-slate-200 bg-white"
    >
      <div
        ref={innerRef}
        style={{
          width: pageDims.width,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {sheet}
      </div>
    </div>
  );
};

export interface PreviewDocumentPaneProps {
  onClose: () => void;
}

export const PreviewDocumentPane: React.FC<PreviewDocumentPaneProps> = ({ onClose }) => {
  const project = useProjectStore(selectActiveProject);
  const documents = useStudioDocumentStore((s) => s.docs);
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const previewDocuments = useWorkingOutlineStore((s) => s.previewDocuments);
  const dirty = useWorkingOutlineStore((s) => Boolean(s.outline?.dirty));
  const { compiling, compilePreview } = useCompileAndCommit();

  const [fitToWidth, setFitToWidth] = useState(true);
  const [availableWidth, setAvailableWidth] = useState(440);
  const [pageWindow, setPageWindow] = useState<{ docId: string; limit: number }>({
    docId: "",
    limit: INITIAL_PREVIEW_PAGES,
  });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const inner = Math.max(220, el.clientWidth - VIEWPORT_HORIZONTAL_PADDING);
      setAvailableWidth((prev) => (Math.abs(prev - inner) < 1 ? prev : inner));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayedDoc = useMemo(() => {
    if (previewDocuments && previewDocuments.length > 0) {
      if (activeDoc) {
        const activeMatch = previewDocuments.find((d) => d.docId === activeDoc.docId);
        if (activeMatch) return activeMatch;
      }
      return previewDocuments[0];
    }
    if (activeDoc && (!project || project.docIds.includes(activeDoc.docId))) {
      return activeDoc;
    }
    if (project) {
      const match = documents.find((d) => project.docIds.includes(d.docId));
      if (match) return match;
    }
    return activeDoc ?? null;
  }, [activeDoc, documents, previewDocuments, project]);

  const firstPageDims = useMemo(
    () => resolvePageDimensionsPx(displayedDoc?.pages[0]),
    [displayedDoc]
  );
  const fitPercent = Math.round(computePreviewFitScale(availableWidth, firstPageDims.width) * 100);
  const seamless = displayedDoc ? documentSurface(displayedDoc).kind === "scroll" : false;
  const activeDocKey = displayedDoc?.docId ?? "";
  const effectivePageLimit = pageWindow.docId === activeDocKey ? pageWindow.limit : INITIAL_PREVIEW_PAGES;
  const visiblePages = useMemo(() => {
    if (!displayedDoc) return [];
    return displayedDoc.pages.length > effectivePageLimit
      ? displayedDoc.pages.slice(0, effectivePageLimit)
      : displayedDoc.pages;
  }, [displayedDoc, effectivePageLimit]);
  const remainingPages = displayedDoc ? Math.max(0, displayedDoc.pages.length - visiblePages.length) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-700 truncate">
            {displayedDoc?.title || "실시간 .vdoc 미리보기"}
          </span>
          {previewDocuments ? (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
              컴파일 프리뷰{dirty ? " (미반영)" : ""}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-600 shrink-0">
              원본 문서
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="preview-fit-toggle-btn"
            aria-pressed={fitToWidth}
            onClick={() => setFitToWidth((v) => !v)}
            title={fitToWidth ? "원본 크기(100%)로 확대 보기" : "미리보기 창 너비에 맞추기"}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
              fitToWidth
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            }`}
          >
            {fitToWidth ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {fitToWidth ? `맞춤 ${fitPercent}%` : "100%"}
          </button>
          <button
            type="button"
            disabled={compiling}
            onClick={() => void compilePreview()}
            title="지금 아웃라인을 미리보기로 다시 컴파일"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${compiling ? "animate-spin" : ""}`} />
            다시 컴파일
          </button>
          <button
            type="button"
            onClick={onClose}
            title="미리보기 닫기"
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`flex-1 min-h-0 overflow-y-auto p-4 ${fitToWidth ? "overflow-x-hidden" : "overflow-x-auto"}`}
      >
        {!displayedDoc ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            미리볼 문서가 없습니다. 좌측에서 항목을 작성한 뒤 &ldquo;미리보기 컴파일&rdquo;을 누르세요.
          </div>
        ) : (
          <div className={`flex flex-col ${fitToWidth ? "items-center" : "items-start min-w-max mx-auto"} gap-4`}>
            {visiblePages.map((page) => (
              <ScaledPageFrame
                key={page.pageId}
                doc={displayedDoc}
                page={page}
                seamless={seamless}
                availableWidth={availableWidth}
                fitToWidth={fitToWidth}
              />
            ))}
            {remainingPages > 0 && (
              <button
                type="button"
                onClick={() =>
                  setPageWindow((prev) => ({
                    docId: activeDocKey,
                    limit: (prev.docId === activeDocKey ? prev.limit : INITIAL_PREVIEW_PAGES) + INITIAL_PREVIEW_PAGES,
                  }))
                }
                className="px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-xs"
              >
                나머지 {remainingPages}페이지 더 보기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
