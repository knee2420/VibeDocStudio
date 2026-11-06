import React, { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Layers,
  Loader2,
  Lock,
  MapPin,
  MousePointerClick,
  PanelLeftClose,
  Sparkles,
  SquareSplitHorizontal,
  Type,
  X,
} from "lucide-react";

import {
  PdfViewer,
  WebViewer,
  type ViewerSegment,
  type WebArticlePayload,
} from "@vibe/document-viewer";
import { htmlToPlainText, type VDocDocument } from "@vibe/vdoc-schema";

import {
  useReferencePinStore,
  type ReferenceSnippet,
  type RegionPinSnippet,
  type TextHighlightSnippet,
} from "@/entities/reference-manager";
import { selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  selectBoundReferenceProjects,
  selectProjectOfDocument,
  selectReferenceProjectIndex,
  useProjectStore,
} from "@/entities/vdoc-project";
import { REFERENCE_SPLIT_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import {
  attachable,
  attachToComposer,
  extractPdfRegionText,
  referenceRegionRef,
  referenceTextRef,
  useReferenceRegionStore,
} from "@/features/ai-workspace";
import { useDragResize } from "@/shared/lib";
import { CollapsedPanelRail } from "@/shared/ui";

const FEEDBACK_MS = 2000;
const EMPTY_SNIPPETS: ReferenceSnippet[] = [];

/** 문서의 슬롯들을 순서대로 추출하여 웹 리더 아티클 페이로드로 합성합니다. */
function synthesizeArticleFromDoc(doc: VDocDocument, cleanTitle: string, hasWeb: boolean): WebArticlePayload {
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const b = block as unknown as { slotId?: string; slotIds?: string[] };
      const ids = b.slotId ? [b.slotId] : b.slotIds ?? [];
      for (const slotId of ids) {
        const slot = doc.slots[slotId];
        if (slot?.content) {
          htmlParts.push(slot.content);
          const plain = htmlToPlainText(slot.content);
          if (plain) textParts.push(plain);
        }
      }
    }
  }

  if (htmlParts.length === 0) {
    for (const slot of Object.values(doc.slots)) {
      if (slot?.content) {
        htmlParts.push(slot.content);
        const plain = htmlToPlainText(slot.content);
        if (plain) textParts.push(plain);
      }
    }
  }

  return {
    title: cleanTitle,
    siteName: doc.variables?.["Article.Platform"] || (hasWeb ? "웹 아티클" : undefined),
    byline: [doc.variables?.["Article.Series"], doc.variables?.["Article.Partner"]].filter(Boolean).join(" · "),
    contentHtml: htmlParts.join("\n"),
    textContent: textParts.join("\n\n"),
  };
}

/**
 * 참조 문서 벤또 카드.
 * - 오직 '원본'(PDF 원본 또는 웹 원본)만을 전담하여 렌더링합니다.
 * - PDF 인터랙션:
 *   - [텍스트]: 마우스로 글자나 문장을 직접 긁어서 드래그 선택 및 복사
 *   - [영역 선택]: 마우스로 원하는 범위를 사각 드래그하여 핸들이 잡히는 선택 영역 지정
 * - Web 인터랙션:
 *   - [리더]: 본문 텍스트 드래그 및 복사/발췌
 *   - [라이브]: 외부 실시간 웹사이트 탐색 (동일 출처 정책으로 인해 읽기/조회 전용)
 */
const ReferenceCard: React.FC<{
  docId: string;
  index: number;
  totalCount?: number;
  onClose: (docId: string) => void;
}> = ({
  docId,
  index,
  totalCount = 1,
  onClose,
}) => {
  const refDoc = useStudioDocumentStore(selectDocument(docId));
  const project = useProjectStore(selectProjectOfDocument(docId));
  const refDeckIndex = useProjectStore(selectReferenceProjectIndex(docId));

  // 참조 레이어 덱에서의 1-based 인덱스와 제목 정리
  const refNumber = refDeckIndex !== -1 ? refDeckIndex + 1 : index + 1;
  const rawTitle = project?.title || refDoc?.title || "참조 문서";
  const cleanTitle = rawTitle.replace(/^(\[참조\s*\d+\]|참조\s*\d+:?)\s*/, "");

  const hasWeb = Boolean(refDoc?.preview?.sourceWebUrl);
  const hasPdf = Boolean(refDoc?.preview?.sourcePdfUrl);

  // PDF 인터랙션 모드: 'text' (글자 드래그 선택) vs 'box' (사각 범위 드래그 선택)
  const [pdfInteractionMode, setPdfInteractionMode] = useState<"text" | "box">("text");

  // 사용자가 직접 마우스 드래그로 그린 영역만 담습니다.
  const [customSegments, setCustomSegments] = useState<ViewerSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // 텍스트 드래그 선택 상태 (텍스트 핀 및 복사용)
  const [selectedTextInfo, setSelectedTextInfo] = useState<{ text: string; page: number } | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);
  // 고른 영역의 글자 (AI 첨부용). 끌기 시작 순간에는 비동기로 읽을 수 없어서 미리 뽑아 둔다.
  const [regionText, setRegionText] = useState<{ segmentId: string; text: string } | null>(null);
  const selectedSegment = customSegments.find((s) => s.id === selectedSegmentId) ?? customSegments[0] ?? null;
  const pdfUrl = refDoc?.preview?.sourcePdfUrl;

  // ⭐️ 핀 스토어 연동: 현재 문서에 꽂힌 핀 목록 (getSnapshot 캐싱을 위해 undefined fallback 유지)
  const rawSnippets = useReferencePinStore((s) => s.snippetsByDoc[docId]);
  const docSnippets = rawSnippets ?? EMPTY_SNIPPETS;
  const docPins = useMemo(
    () =>
      docSnippets.filter(
        (s): s is RegionPinSnippet | TextHighlightSnippet => s.kind === "region" || s.kind === "text"
      ),
    [docSnippets]
  );
  const totalPages = Math.max(1, refDoc?.pages?.length || 1);

  const handleCreatePin = () => {
    if (!selectedSegment) return;
    const pin = useReferencePinStore.getState().addRegionPin(
      docId,
      selectedSegment.page,
      selectedSegment.box,
      regionText?.text
    );
    showFeedback("📌 참조 핀이 저장되었습니다!");
    useReferencePinStore.getState().setFocusedSnippet(pin);
  };

  const handleCreateTextPin = () => {
    if (!selectedTextInfo) return;
    const pin = useReferencePinStore.getState().addTextPin(
      docId,
      selectedTextInfo.page,
      selectedTextInfo.text
    );
    showFeedback("📌 텍스트 핀이 저장되었습니다!");
    useReferencePinStore.getState().setFocusedSnippet(pin);
    setSelectedTextInfo(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleScrollToPin = (pin: ReferenceSnippet) => {
    const page = "page" in pin && typeof pin.page === "number" ? pin.page : 1;
    if (pin.kind === "region") {
      useReferenceRegionStore.getState().setFocus({ docId, page: pin.page, box: pin.bbox });
    } else {
      const root = articleRef.current;
      const pageEl = root?.querySelector<HTMLElement>(`[data-page-number="${page}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    useReferencePinStore.getState().setFocusedSnippet(pin);
  };

  useEffect(() => {
    if (!selectedSegment || !pdfUrl) return; // 지난 글자는 segmentId 가 달라 쓰이지 않는다
    let cancelled = false;
    const timer = window.setTimeout(() => {
      extractPdfRegionText(pdfUrl, selectedSegment.page, selectedSegment.box)
        .then((text) => !cancelled && setRegionText({ segmentId: selectedSegment.id, text }))
        .catch(() => !cancelled && setRegionText({ segmentId: selectedSegment.id, text: "" }));
    }, 250); // 모서리 핸들을 끄는 동안은 기다린다
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pdfUrl, selectedSegment?.id, selectedSegment?.page, selectedSegment?.box.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const regionReady = Boolean(selectedSegment && regionText?.segmentId === selectedSegment.id);
  const regionRef = useMemo(
    () =>
      selectedSegment && regionReady
        ? referenceRegionRef(docId, { page: selectedSegment.page, box: selectedSegment.box, text: regionText!.text, deckNumber: refNumber })
        : null,
    [docId, selectedSegment, regionReady, regionText, refNumber]
  );

  // AI 답변의 영역 칩을 누르면 그 자리에 강조 상자를 그리고 스크롤한다 (8초 뒤 사라짐).
  const focus = useReferenceRegionStore((s) => (s.focus?.docId === docId ? s.focus : null));
  const articleRef = React.useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focus) return;
    const timer = window.setTimeout(() => {
      const root = articleRef.current;
      const pageEl = root?.querySelector<HTMLElement>(`[data-page-number="${focus.page}"]`);
      if (!pageEl) return;
      pageEl.scrollIntoView({ block: "start" });
      const scroller = pageEl.closest<HTMLElement>(".overflow-y-auto, .overflow-auto");
      if (scroller) scroller.scrollTop += (focus.box[0] / 1000) * pageEl.offsetHeight - 24;
    }, 400); // 작업창이 막 열렸으면 PDF 가 그려질 때까지 기다린다
    const clear = window.setTimeout(() => {
      const store = useReferenceRegionStore.getState();
      if (store.focus?.at === focus.at) store.setFocus(null);
    }, 8000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clear);
    };
  }, [focus]);
  const focusHighlights = useMemo(
    () => (focus ? [{ id: `ai-focus-${focus.at}`, page: focus.page, box: focus.box, label: "AI", variant: "primary" as const }] : undefined),
    [focus]
  );

  // Ctrl+L 이 "지금 고른 영역"을 알 수 있게 알린다.
  useEffect(() => {
    const store = useReferenceRegionStore.getState();
    if (regionRef) store.setCurrent(regionRef);
    else if (store.current?.meta?.entityId === docId) store.setCurrent(null);
  }, [regionRef, docId]);
  useEffect(
    () => () => {
      const store = useReferenceRegionStore.getState();
      if (store.current?.meta?.entityId === docId) store.setCurrent(null);
    },
    [docId]
  );

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
  };

  const articlePayload = useMemo<WebArticlePayload>(() => {
    if (!refDoc) return { title: cleanTitle };
    return synthesizeArticleFromDoc(refDoc, cleanTitle, hasWeb);
  }, [refDoc, cleanTitle, hasWeb]);

  if (!refDoc) {
    return (
      <div className="w-full h-full bg-white rounded border border-slate-300 shadow-sm flex items-center justify-center p-6 text-slate-400 text-xs shrink-0">
        참조 문서를 불러오는 중입니다...
      </div>
    );
  }

  const handleCopyExtractedText = async (text: string) => {
    if (!text || !navigator.clipboard) {
      showFeedback("복사할 텍스트가 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showFeedback("텍스트를 클립보드에 복사했습니다!");
    } catch {
      showFeedback("클립보드 접근 권한이 필요합니다.");
    }
  };

  const handleCopyAllText = async () => {
    const text = articlePayload.textContent || "";
    await handleCopyExtractedText(text);
  };

  return (
    <article
      ref={articleRef}
      data-testid={`reference-card-${docId}`}
      data-ai-entity={docId}
      className={`w-full ${
        totalCount > 1 ? "h-[620px] min-h-[460px] shrink-0" : "h-full"
      } bg-white rounded border border-slate-300 shadow-sm ring-1 ring-slate-900/5 flex flex-col overflow-hidden transition-all`}
    >
      {/* 헤더 바: 참조 순번, 제목, PDF 인터랙션 모드 토글 */}
      <header className="px-3 py-2 bg-slate-300 text-slate-800 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0 rounded-t select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-white/90 text-slate-700 border border-slate-300/90 text-[10px] font-bold shrink-0 shadow-2xs">
            <Lock className="w-2.5 h-2.5 text-slate-500" />
            참조 {refNumber}
          </span>
          <h4 className="text-xs font-bold truncate text-slate-800" title={cleanTitle}>
            {cleanTitle}
          </h4>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* PDF 원본 뷰 모드일 때: [텍스트] vs [영역 선택] 인터랙션 토글 */}
          {hasPdf && (
            <div className="inline-flex items-center p-0.5 rounded-sm bg-slate-200 border border-slate-300 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setPdfInteractionMode("text");
                  setSelectedTextInfo(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                  pdfInteractionMode === "text"
                    ? "bg-amber-600 text-white font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="일반 텍스트처럼 글자나 문장을 마우스로 드래그하여 선택하고 복사하는 모드"
              >
                <Type className="w-2.5 h-2.5" />
                <span>텍스트</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPdfInteractionMode("box");
                  setSelectedTextInfo(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                  pdfInteractionMode === "box"
                    ? "bg-amber-600 text-white font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="마우스 드래그로 사각 영역을 선택하고 모서리 핸들로 범위를 조절하는 모드"
              >
                <MousePointerClick className="w-2.5 h-2.5" />
                <span>영역 선택</span>
              </button>
            </div>
          )}

          <div className="w-px h-3 bg-slate-400 mx-0.5" />

          <button
            type="button"
            onClick={() => onClose(docId)}
            className="p-1 rounded-sm hover:bg-rose-100 hover:text-rose-700 text-slate-500 cursor-pointer transition-colors"
            title="참조 작업창 닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 바디 영역: 오직 원본(PDF 또는 웹뷰어)만 렌더링 */}
      <div
        className="flex-1 w-full h-full overflow-hidden flex flex-col relative min-h-0 select-text"
        onMouseUp={() => {
          if (pdfInteractionMode === "box") return;
          const sel = window.getSelection();
          const text = sel?.toString().trim();
          if (!text) {
            setSelectedTextInfo(null);
            return;
          }
          let page = 1;
          const anchorNode = sel?.anchorNode;
          if (anchorNode) {
            const el = anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement;
            const pageEl = el?.closest<HTMLElement>("[data-page-number]");
            if (pageEl) {
              const p = parseInt(pageEl.getAttribute("data-page-number") || "1", 10);
              if (!isNaN(p) && p > 0) page = p;
            }
          }
          setSelectedTextInfo({ text, page });
        }}
        onContextMenu={
          // 긁어 둔 글자 위에서 우클릭하면 AI 첨부 메뉴 (선택이 없으면 브라우저 기본 메뉴)
          attachable(() => {
            const text = window.getSelection()?.toString() ?? "";
            return text.trim() ? [referenceTextRef(docId, text)] : [];
          }).onContextMenu
        }
      >
        {hasWeb && refDoc.preview?.sourceWebUrl ? (
          <WebViewer
            url={refDoc.preview.sourceWebUrl}
            title={cleanTitle}
            initialMode="reader"
            article={articlePayload}
            onExtractText={(text) => void handleCopyExtractedText(text)}
          />
        ) : hasPdf && refDoc.preview?.sourcePdfUrl ? (
          <PdfViewer
            url={refDoc.preview.sourcePdfUrl}
            title={cleanTitle}
            isSpread={false}
            isEditMode={pdfInteractionMode === "box"}
            highlights={focusHighlights}
            enableSmartSnap={true}
            segments={customSegments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={(segment) => {
              setSelectedSegmentId(segment.id);
            }}
            onCreateSegment={(created) => {
              setCustomSegments([created]);
              setSelectedSegmentId(created.id);
              setSelectedTextInfo(null);
              showFeedback("선택 영역이 지정되었습니다!");
            }}
            onUpdateSegment={(updated) => {
              setCustomSegments((prev) =>
                prev.some((s) => s.id === updated.id)
                  ? prev.map((s) => (s.id === updated.id ? updated : s))
                  : [updated]
              );
            }}
            onDeleteSegment={(id) => {
              setCustomSegments((prev) => prev.filter((s) => s.id !== id));
              if (selectedSegmentId === id) setSelectedSegmentId(null);
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-xs text-slate-400 bg-slate-50">
            표시할 원본 문서(PDF 또는 웹 URL)가 없습니다.
          </div>
        )}

        {/* ⭐️ VSCode Diff 스타일 오버뷰 룰러 (우측 핀 마킹 레일) */}
        {hasPdf && docPins.length > 0 && (
          <div
            className="absolute top-2 bottom-2 right-1.5 w-3 z-30 pointer-events-none flex flex-col"
            title="참조 핀 위치 마킹 (클릭하여 해당 핀으로 스크롤)"
          >
            {docPins.map((pin) => {
              const p = pin.page ?? 1;
              const yOffset = pin.kind === "region" ? pin.bbox[0] / 1000 : 0.35;
              const topPct = Math.min(
                97,
                Math.max(3, (((p - 1) + yOffset) / totalPages) * 100)
              );
              return (
                <button
                  key={pin.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScrollToPin(pin);
                  }}
                  style={{ top: `${topPct}%` }}
                  className={`absolute right-0 ${
                    pin.kind === "text"
                      ? "w-2 h-1 bg-amber-400 hover:w-3.5 hover:h-2"
                      : "w-2.5 h-1.5 bg-amber-500 hover:w-4 hover:h-2.5"
                  } -translate-y-1/2 rounded-xs hover:bg-amber-600 transition-all cursor-pointer pointer-events-auto shadow-xs border border-amber-600/60`}
                  title={`${pin.kind === "text" ? "🔤" : "📍"} ${pin.label} (클릭 시 이동)`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 푸터 영역: 원본 텍스트 복사 및 인터랙션 상태 안내 (도구 상자 재편) */}
      <footer className="p-2.5 bg-slate-50 border-t border-slate-200/90 flex flex-col gap-1.5 shrink-0 rounded-b select-none">
        <div className="flex items-center justify-between text-[11px] px-1 text-slate-600">
          <span className="truncate max-w-[340px]">
            {feedback ? (
              <span className="text-amber-800 font-bold flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" /> {feedback}
              </span>
            ) : customSegments.length > 0 ? (
              <span className="text-amber-800 font-bold">
                선택 영역이 지정되었습니다. [📌 핀 꽂기] 로 보관하세요
              </span>
            ) : selectedTextInfo && selectedTextInfo.text.length > 0 ? (
              <span className="text-amber-800 font-bold">
                선택된 텍스트 ({selectedTextInfo.page}p, {selectedTextInfo.text.length}자) [📌 핀 꽂기] 로 보관하세요
              </span>
            ) : hasPdf ? (
              <span className="text-slate-500 font-medium">
                {pdfInteractionMode === "box"
                  ? "💡 마우스로 원하는 범위를 드래그하여 사각 영역을 선택하세요"
                  : "💡 마우스로 글자나 문장을 드래그하여 핀을 꽂거나 복사하세요"}
              </span>
            ) : hasWeb ? (
              <span className="text-slate-500 font-medium">
                💡 [리더] 탭에서 마우스로 텍스트를 드래그하여 핀을 꽂거나 복사하세요
              </span>
            ) : (
              <span className="text-slate-400">참조 문서 원본</span>
            )}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {hasWeb
              ? "Web"
              : `${refDoc.pages.length}p PDF (${pdfInteractionMode === "box" ? "영역 선택" : "텍스트"})`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          {customSegments.length > 0 ? (
            <>
              {/* 1. 📌 사각 영역 핀 꽂기 (Primary 앰버 액션) */}
              <button
                type="button"
                data-testid="reference-pin-create-btn"
                onClick={handleCreatePin}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-sm text-xs font-bold cursor-pointer shadow-2xs transition active:scale-[0.98]"
                title="이 사각 영역을 참조 핀으로 목록에 저장"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>핀 꽂기</span>
              </button>

              {/* 2. 📋 텍스트 복사 */}
              <button
                type="button"
                onClick={() => void handleCopyExtractedText(regionText?.text || "")}
                disabled={!regionText?.text}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition disabled:opacity-50"
                title="선택 영역 안의 텍스트 복사"
              >
                <Copy className="w-3 h-3 text-slate-500" />
                <span>텍스트 복사</span>
              </button>

              {/* 3. ✦ AI 첨부 */}
              <button
                type="button"
                data-testid="reference-region-attach"
                disabled={!regionRef}
                {...(regionRef ? attachable(() => [regionRef]) : {})}
                onClick={() => regionRef && attachToComposer([regionRef])}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-sm text-xs font-semibold cursor-grab active:cursor-grabbing shadow-2xs transition disabled:opacity-50"
                title="AI Composer 에 1회성 첨부"
              >
                {regionRef ? <Sparkles className="w-3 h-3 text-amber-600" /> : <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
                <span>AI 첨부</span>
              </button>

              {/* 4. ✕ 취소 */}
              <button
                type="button"
                onClick={() => {
                  setCustomSegments([]);
                  setSelectedSegmentId(null);
                }}
                className="inline-flex items-center justify-center px-2 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition active:scale-[0.98] ml-auto"
                title="선택 영역 해제"
              >
                취소
              </button>
            </>
          ) : selectedTextInfo && selectedTextInfo.text.length > 0 ? (
            <>
              {/* 1. 📌 텍스트 핀 꽂기 (Primary 앰버 액션) */}
              <button
                type="button"
                data-testid="reference-text-pin-create-btn"
                onClick={handleCreateTextPin}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-sm text-xs font-bold cursor-pointer shadow-2xs transition active:scale-[0.98]"
                title="선택한 텍스트를 참조 핀으로 목록에 저장"
              >
                <Type className="w-3.5 h-3.5" />
                <span>핀 꽂기</span>
              </button>

              {/* 2. 📋 텍스트 복사 */}
              <button
                type="button"
                onClick={() => void handleCopyExtractedText(selectedTextInfo.text)}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition"
                title="선택한 텍스트 복사"
              >
                <Copy className="w-3 h-3 text-slate-500" />
                <span>텍스트 복사</span>
              </button>

              {/* 3. ✦ AI 첨부 */}
              <button
                type="button"
                data-testid="reference-text-attach"
                onClick={() => {
                  const ref = referenceTextRef(docId, selectedTextInfo.text);
                  attachToComposer([ref]);
                  showFeedback("✦ AI Composer 에 첨부되었습니다!");
                }}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-sm text-xs font-semibold cursor-pointer shadow-2xs transition"
                title="AI Composer 에 1회성 첨부"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>AI 첨부</span>
              </button>

              {/* 4. ✕ 취소 */}
              <button
                type="button"
                onClick={() => {
                  setSelectedTextInfo(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="inline-flex items-center justify-center px-2 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition active:scale-[0.98] ml-auto"
                title="선택 해제"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void handleCopyAllText()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-300 hover:bg-slate-400/80 text-slate-800 border border-slate-400/70 rounded-sm text-xs font-semibold cursor-pointer shadow-2xs transition active:scale-[0.98]"
              title="원문의 전체 텍스트를 클립보드로 복사"
            >
              <Copy className="w-3.5 h-3.5 text-slate-600" />
              원문 텍스트 복사
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};


/**
 * [ReferenceManagerWidget: 통합 레퍼런스 매니저 위젯]
 * 
 * - 상단: 위계 목록 (4종 참조 프로젝트 및 상태)
 * - 중단: 퀵 스위처 가로 탭 바
 * - 하단: 단일 풀사이즈 통합 뷰어
 * - 좌측 탭 모드 및 독립 스플릿 모드 양쪽에서 공통으로 재사용됩니다.
 */
export const ReferenceManagerWidget: React.FC<{ isSplit?: boolean }> = ({ isSplit = false }) => {
  const boundRefProjects = useProjectStore(useShallow(selectBoundReferenceProjects));
  const setSelectedReferenceProjectId = useProjectStore((s) => s.setSelectedReferenceProjectId);

  const setRefPlacement = useWorkspaceLayoutStore((s) => s.setRefPlacement);
  const setRefSplitCollapsed = useWorkspaceLayoutStore((s) => s.setRefSplitCollapsed);
  const setLeftSidebarOpen = useWorkspaceLayoutStore((s) => s.setLeftSidebarOpen);
  const activeReferenceDocId = useWorkspaceLayoutStore((s) => s.activeReferenceDocId);
  const setActiveReferenceDocId = useWorkspaceLayoutStore((s) => s.setActiveReferenceDocId);
  const closeAllReferenceDocs = useWorkspaceSessionStore((s) => s.closeAllReferenceDocs);

  // 상단 위계 목록 접기/펼치기 상태
  const [hierarchyExpanded, setHierarchyExpanded] = useState(true);

  // 문서별 하위 핀 트리 접기/펼치기 상태
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});

  // ⭐️ 핀 스토어 상태 연동
  const snippetsByDoc = useReferencePinStore((s) => s.snippetsByDoc);
  const checkedSnippetIds = useReferencePinStore((s) => s.checkedSnippetIds);
  const focusedSnippet = useReferencePinStore((s) => s.focusedSnippet);
  const toggleSnippetChecked = useReferencePinStore((s) => s.toggleSnippetChecked);
  const toggleAllDocSnippets = useReferencePinStore((s) => s.toggleAllDocSnippets);
  const clearChecked = useReferencePinStore((s) => s.clearChecked);
  const removeSnippet = useReferencePinStore((s) => s.removeSnippet);
  const setFocusedSnippet = useReferencePinStore((s) => s.setFocusedSnippet);

  const totalPinsCount = useMemo(
    () =>
      Object.values(snippetsByDoc)
        .flat()
        .filter((s) => s.kind === "region" || s.kind === "text").length,
    [snippetsByDoc]
  );

  const toggleDocExpand = (docId: string, defaultExpanded: boolean) => {
    setExpandedDocs((prev) => ({
      ...prev,
      [docId]: !(prev[docId] ?? defaultExpanded),
    }));
  };

  // 체크된 핀들을 모아 AI Composer 에 일괄 첨부 (영역 핀 및 텍스트 핀 모두 지원)
  const handleAttachCheckedPins = () => {
    const allSnippets = Object.values(snippetsByDoc).flat();
    const checked = allSnippets.filter(
      (s): s is RegionPinSnippet | TextHighlightSnippet =>
        checkedSnippetIds.includes(s.id) && (s.kind === "region" || s.kind === "text")
    );
    if (checked.length === 0) return;
    const refs = checked.map((p) => {
      if (p.kind === "region") {
        return referenceRegionRef(p.docId, {
          page: p.page,
          box: p.bbox,
          text: p.excerpt || p.label,
        });
      } else {
        return referenceTextRef(p.docId, p.text);
      }
    });
    attachToComposer(refs);
  };

  // 하단 뷰어 패널 열림/닫힘 상태 (닫기 시 이 뷰어만 닫힘)
  const [viewerOpen, setViewerOpen] = useState(true);

  // 현재 열려있는 뷰어의 대상 docId
  const currentDocId = useMemo(() => {
    if (activeReferenceDocId && boundRefProjects.some((p) => p.docIds.includes(activeReferenceDocId))) {
      return activeReferenceDocId;
    }
    return boundRefProjects[0]?.docIds[0] ?? null;
  }, [activeReferenceDocId, boundRefProjects]);

  // 목록 항목 또는 [Doc/PDF] 버튼 클릭 시: 뷰어를 열고 해당 문서 표시
  const handleOpenViewer = (docId: string, projectId?: string) => {
    setActiveReferenceDocId(docId);
    if (projectId) setSelectedReferenceProjectId(projectId);
    setViewerOpen(true);
  };

  // 뷰어 헤더의 [X] 클릭 시: 오직 하단 뷰어 영역만 닫음
  const handleCloseViewer = () => {
    setViewerOpen(false);
  };

  return (
    <div
      data-testid="reference-manager-widget"
      className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden min-h-0 relative"
    >
      {/* 1. 최상단 헤더 바 (도킹/스플릿 컨트롤러 및 문서 수) */}
      <header className="px-3 py-2 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {!isSplit ? (
            <button
              type="button"
              data-testid="ref-popout-btn"
              onClick={() => setRefPlacement("split")}
              className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-800 transition cursor-pointer"
              title="에디터 좌측 독립 스플릿 뷰로 꺼내기 (Pop-out to Split View)"
            >
              <SquareSplitHorizontal className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                data-testid="ref-dockin-btn"
                onClick={() => setRefPlacement("left-tab")}
                className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-800 transition cursor-pointer"
                title="좌측 패널 탭으로 다시 집어넣기 (Dock to Left Tab)"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="ref-collapse-rail-btn"
                onClick={() => setRefSplitCollapsed(true)}
                className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                title="참조 작업창 접기 (세로 레일로 접기)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <span className="font-bold text-xs text-slate-800 tracking-tight flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Reference Manager
          </span>
          <span
            className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold font-mono"
            title="연결된 참조 문서 및 꽂아둔 핀 수"
          >
            {boundRefProjects.length}종 참조{totalPinsCount > 0 ? ` · 핀 ${totalPinsCount}개` : ""}
          </span>
        </div>

        <div className="flex items-center gap-1 text-slate-500">
          <button
            type="button"
            onClick={() => setHierarchyExpanded(!hierarchyExpanded)}
            className="p-1 rounded hover:bg-slate-200 text-slate-600 transition cursor-pointer flex items-center gap-0.5 text-[11px]"
            title={hierarchyExpanded ? "위계 목록 접기" : "위계 목록 펼치기"}
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[10px] font-medium">{hierarchyExpanded ? "목록 접기" : "목록 보기"}</span>
            {hierarchyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isSplit) {
                setRefPlacement("closed");
                closeAllReferenceDocs();
              } else {
                setLeftSidebarOpen(false);
              }
            }}
            className="p-1 rounded hover:bg-rose-100 hover:text-rose-600 transition cursor-pointer"
            title={isSplit ? "스플릿 작업창 닫기" : "좌측 사이드바 패널 닫기"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ⭐️ 체크된 핀 액션 툴바 (리소스 매니저 다중 선택 스타일) */}
      {checkedSnippetIds.length > 0 && (
        <div className="px-2.5 py-1 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs font-semibold text-amber-950 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            <span>선택된 핀 {checkedSnippetIds.length}개</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleAttachCheckedPins}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10.5px] font-bold shadow-2xs transition cursor-pointer"
              title="선택된 모든 핀을 AI Composer 에 첨부"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI 첨부</span>
            </button>
            <button
              type="button"
              onClick={clearChecked}
              className="px-1.5 py-0.5 text-slate-500 hover:text-slate-800 text-[10.5px] cursor-pointer"
            >
              선택 해제
            </button>
          </div>
        </div>
      )}

      {/* 2. 상단: 참조 문서 및 하위 핀 트리 목록 (Explorer) - 리소스 매니저 스타일 */}
      {hierarchyExpanded && (
        <div
          className={`border-b border-slate-200 bg-slate-50/50 p-1.5 overflow-y-auto space-y-1 shrink-0 transition-all ${
            viewerOpen ? "max-h-[190px]" : "flex-1 min-h-0"
          }`}
        >
          {boundRefProjects.map((rp, idx) => {
            const docId = rp.docIds[0];
            const isSelected = viewerOpen && docId === currentDocId;
            const cleanTitle = rp.title.replace(/^(\[참조\s*\d+\]|참조\s*\d+:?)\s*/, "");
            const isPdf = rp.docIds[0]?.includes(".pdf");

            // 이 문서에 소속된 핀 목록 (영역 핀 및 텍스트 핀)
            const docPins = (snippetsByDoc[docId] ?? EMPTY_SNIPPETS).filter(
              (s): s is RegionPinSnippet | TextHighlightSnippet => s.kind === "region" || s.kind === "text"
            );
            const defaultExpanded = docPins.length > 0;
            const isExpanded = expandedDocs[docId] ?? defaultExpanded;

            // 체크박스 상태
            const isAllChecked =
              docPins.length > 0 && docPins.every((p) => checkedSnippetIds.includes(p.id));
            const isPartialChecked =
              docPins.some((p) => checkedSnippetIds.includes(p.id)) && !isAllChecked;

            return (
              <div key={rp.projectId} className="flex flex-col">
                {/* 부모 문서 행 */}
                <div
                  onClick={() => {
                    if (docId) handleOpenViewer(docId, rp.projectId);
                  }}
                  className={`flex items-center justify-between px-1.5 py-1.5 rounded text-xs transition cursor-pointer border ${
                    isSelected
                      ? "bg-amber-100/80 text-amber-950 border-amber-400 font-bold shadow-2xs"
                      : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                  title="클릭하여 하단 뷰어에서 열기"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                    {/* 하위 핀 트리 접기/펼치기 화살표 */}
                    {docPins.length > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDocExpand(docId, defaultExpanded);
                        }}
                        className="p-0.5 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition shrink-0"
                        title={isExpanded ? "핀 목록 접기" : "핀 목록 펼치기"}
                      >
                        <ChevronRight
                          className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}

                    {/* 문서 전체 체크박스 (리소스 매니저 다중 선택 스타일) */}
                    {docPins.length > 0 && (
                      <input
                        type="checkbox"
                        checked={isAllChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = isPartialChecked;
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleAllDocSnippets(docId, e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-3.5 h-3.5 shrink-0"
                        title={isAllChecked ? "문서 내 핀 전체 선택 해제" : "문서 내 핀 전체 선택"}
                      />
                    )}

                    <Lock
                      className={`w-3 h-3 shrink-0 ${isSelected ? "text-amber-600" : "text-slate-400"}`}
                    />
                    <span className="text-[11px] font-mono shrink-0 text-amber-800">참조 {idx + 1}</span>
                    <span className="text-xs truncate">{cleanTitle}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* 꽂아둔 핀 개수 뱃지 */}
                    {docPins.length > 0 && (
                      <span
                        className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-[9.5px] font-mono font-bold flex items-center gap-0.5"
                        title={`이 문서에 꽂힌 핀 ${docPins.length}개`}
                      >
                        <MapPin className="w-2.5 h-2.5 text-amber-600" />
                        <span>{docPins.length}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      data-testid={`ref-open-viewer-btn-${idx + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (docId) handleOpenViewer(docId, rp.projectId);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 transition cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                          : "bg-slate-100 hover:bg-amber-100 hover:text-amber-800 hover:border-amber-300 text-slate-600 border-slate-200"
                      }`}
                      title="하단 뷰어 열기"
                    >
                      <span>{isPdf ? "PDF" : "Doc"}</span>
                    </button>
                  </div>
                </div>

                {/* ⭐️ 자식 핀 목록 (리소스 매니저 하위 트리 스타일: 영역 핀 + 텍스트 핀) */}
                {isExpanded && docPins.length > 0 && (
                  <div className="space-y-0.5 ml-4 pl-2 border-l-2 border-amber-300/80 my-1">
                    {docPins.map((pin) => {
                      const isChecked = checkedSnippetIds.includes(pin.id);
                      const isFocused = focusedSnippet?.snippetId === pin.id;
                      const pageNum = "page" in pin && typeof pin.page === "number" ? pin.page : 1;

                      return (
                        <div
                          key={pin.id}
                          onClick={() => {
                            if (currentDocId !== docId) handleOpenViewer(docId, rp.projectId);
                            if (pin.kind === "region") {
                              useReferenceRegionStore.getState().setFocus({
                                docId,
                                page: pin.page,
                                box: pin.bbox,
                              });
                            } else {
                              const root = document.querySelector<HTMLElement>(`[data-testid="reference-card-${docId}"]`);
                              const pageEl = root?.querySelector<HTMLElement>(`[data-page-number="${pageNum}"]`);
                              if (pageEl) {
                                pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                            }
                            setFocusedSnippet(pin);
                          }}
                          className={`group/pin flex items-center justify-between px-2 py-1 rounded text-[11px] transition cursor-pointer border ${
                            isFocused
                              ? "bg-amber-100 text-amber-950 border-amber-400 font-bold shadow-2xs"
                              : isChecked
                              ? "bg-amber-50/70 text-slate-800 border-amber-200"
                              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200/70"
                          }`}
                          title="클릭하여 하단 뷰어에서 해당 핀 위치로 스크롤 & 포커스"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSnippetChecked(pin.id)}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer w-3 h-3 shrink-0"
                              title="체크하여 AI 일괄 첨부 대상으로 선택"
                            />
                            {pin.kind === "text" ? (
                              <Type className="w-3 h-3 text-amber-600 shrink-0" />
                            ) : (
                              <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                            )}
                            <span className="truncate">{pin.label}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[9.5px] font-mono text-slate-400">{pageNum}p</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeSnippet(docId, pin.id);
                              }}
                              className="p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer opacity-0 group-hover/pin:opacity-100"
                              title="핀 삭제"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. 뷰어가 닫혀 있을 때의 바닥 안내 바 */}
      {!viewerOpen && (
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-400 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">뷰어가 닫혀 있습니다 (위 목록을 클릭하면 열립니다)</span>
          {currentDocId && (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer transition shadow-2xs"
            >
              뷰어 열기
            </button>
          )}
        </div>
      )}

      {/* 4. 중단: 퀵 스위처 가로 탭 바 (뷰어가 열려있을 때만 표시) */}
      {viewerOpen && (
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 border-b border-slate-200 overflow-x-auto shrink-0 select-none">
          {boundRefProjects.map((rp, idx) => {
            const docId = rp.docIds[0];
            const isSelected = docId === currentDocId;
            const cleanTitle = rp.title.replace(/^(\[참조\s*\d+\]|참조\s*\d+:?)\s*/, "");

            return (
              <button
                key={rp.projectId}
                type="button"
                onClick={() => {
                  if (docId) handleOpenViewer(docId, rp.projectId);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? "bg-amber-600 text-white font-bold shadow-2xs"
                    : "bg-white text-slate-700 hover:bg-amber-50 hover:text-amber-800 border border-slate-200"
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>참조{idx + 1}: {cleanTitle.slice(0, 14)}…</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 5. 하단: 통합 단일 풀사이즈 뷰어 (남은 공간 100% 활용, onClose 시 뷰어만 닫힘) */}
      {viewerOpen && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-1.5 bg-slate-100/60">
          {currentDocId ? (
            <ReferenceCard
              docId={currentDocId}
              index={Math.max(0, boundRefProjects.findIndex((p) => p.docIds.includes(currentDocId)))}
              totalCount={1}
              onClose={handleCloseViewer}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <BookOpen className="w-8 h-8 mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">선택된 참조 문서가 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">상단 목록에서 열람할 참조 문서를 선택하세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ReferenceSplitViewport: React.FC = () => {
  const refPlacement = useWorkspaceLayoutStore((s) => s.refPlacement);
  const openReferenceDocIds = useWorkspaceSessionStore((s) => s.openReferenceDocIds);
  const splitWidth = useWorkspaceLayoutStore((s) => s.referenceSplitWidth);
  const setSplitWidth = useWorkspaceLayoutStore((s) => s.setReferenceSplitWidth);
  const resetSplitWidth = useWorkspaceLayoutStore((s) => s.resetReferenceSplitWidth);
  const refSplitCollapsed = useWorkspaceLayoutStore((s) => s.refSplitCollapsed);
  const setRefSplitCollapsed = useWorkspaceLayoutStore((s) => s.setRefSplitCollapsed);
  const boundRefProjects = useProjectStore(useShallow(selectBoundReferenceProjects));

  const { onResizeStart } = useDragResize({ axis: "x", size: splitWidth, onResize: setSplitWidth });

  const isOpen = refPlacement === "split" || openReferenceDocIds.length > 0;
  if (!isOpen) return null;

  if (refSplitCollapsed) {
    return (
      <CollapsedPanelRail
        side="left"
        label="Reference Manager"
        badgeCount={boundRefProjects.length}
        tone="amber"
        onExpand={() => setRefSplitCollapsed(false)}
        testId="reference-split-collapsed-rail"
      />
    );
  }

  return (
    <aside
      data-testid="reference-bento-viewport-container"
      style={{ width: `${splitWidth}px` }}
      className="relative h-full bg-slate-100/90 border-r border-slate-300 flex flex-col overflow-hidden shrink-0 shadow-xs z-10 transition-[width] duration-75 select-text"
    >
      {/* 우측 리사이즈 드래그 핸들 (에디터 캔버스와의 경계) */}
      <div
        data-testid="reference-split-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetSplitWidth}
        title={`드래그하여 참조 작업창 너비 조절 · 더블클릭 시 기본 너비(${REFERENCE_SPLIT_WIDTH.default}px) 복원`}
        className="absolute -right-1 top-0 bottom-0 w-2 hover:w-3 cursor-col-resize hover:bg-amber-400/40 active:bg-amber-600/60 transition-all z-30"
      />
      <ReferenceManagerWidget isSplit={true} />
    </aside>
  );
};
