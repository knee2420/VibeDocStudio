import React, { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Lock,
  MousePointerClick,
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

import { selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  selectProjectOfDocument,
  selectReferenceProjectIndex,
  useProjectStore,
} from "@/entities/vdoc-project";
import { REFERENCE_SPLIT_WIDTH, useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useDragResize } from "@/shared/lib";

const FEEDBACK_MS = 2000;

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

  const [feedback, setFeedback] = useState<string | null>(null);

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
      data-testid={`reference-card-${docId}`}
      className={`w-full ${
        totalCount > 1 ? "h-[620px] min-h-[460px] shrink-0" : "h-full"
      } bg-white rounded border border-slate-300 shadow-sm ring-1 ring-slate-900/5 flex flex-col overflow-hidden transition-all`}
    >
      {/* 헤더 바: 참조 순번, 제목, PDF 인터랙션 모드 토글 */}
      <header className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0 rounded-t select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold shrink-0">
            <Lock className="w-2.5 h-2.5 text-slate-400" />
            참조 {refNumber}
          </span>
          <h4 className="text-xs font-semibold truncate text-slate-100" title={cleanTitle}>
            {cleanTitle}
          </h4>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* PDF 원본 뷰 모드일 때: [텍스트] vs [영역 선택] 인터랙션 토글 */}
          {hasPdf && (
            <div className="inline-flex items-center p-0.5 rounded-sm bg-slate-800 border border-slate-700 text-[10px]">
              <button
                type="button"
                onClick={() => setPdfInteractionMode("text")}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                  pdfInteractionMode === "text"
                    ? "bg-violet-600 text-white font-bold shadow-2xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="일반 텍스트처럼 글자나 문장을 마우스로 드래그하여 선택하고 복사하는 모드"
              >
                <Type className="w-2.5 h-2.5" />
                <span>텍스트</span>
              </button>
              <button
                type="button"
                onClick={() => setPdfInteractionMode("box")}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                  pdfInteractionMode === "box"
                    ? "bg-violet-600 text-white font-bold shadow-2xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="마우스 드래그로 사각 영역을 선택하고 모서리 핸들로 범위를 조절하는 모드"
              >
                <MousePointerClick className="w-2.5 h-2.5" />
                <span>영역 선택</span>
              </button>
            </div>
          )}

          <div className="w-px h-3 bg-slate-700 mx-0.5" />

          <button
            type="button"
            onClick={() => onClose(docId)}
            className="p-1 rounded-sm hover:bg-rose-900/60 hover:text-rose-200 text-slate-400 cursor-pointer transition-colors"
            title="참조 작업창 닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 바디 영역: 오직 원본(PDF 또는 웹뷰어)만 렌더링 */}
      <div className="flex-1 w-full h-full overflow-hidden flex flex-col relative min-h-0 select-text">
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
            enableSmartSnap={true}
            segments={customSegments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={(segment) => {
              setSelectedSegmentId(segment.id);
            }}
            onCreateSegment={(created) => {
              setCustomSegments([created]);
              setSelectedSegmentId(created.id);
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
      </div>

      {/* 푸터 영역: 원본 텍스트 복사 및 인터랙션 상태 안내 */}
      <footer className="p-2.5 bg-slate-50 border-t border-slate-200/90 flex flex-col gap-1.5 shrink-0 rounded-b select-none">
        <div className="flex items-center justify-between text-[11px] px-1 text-slate-600">
          <span className="truncate max-w-[340px]">
            {feedback ? (
              <span className="text-violet-700 font-bold flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" /> {feedback}
              </span>
            ) : hasPdf ? (
              <span className="text-slate-500 font-medium">
                {pdfInteractionMode === "box"
                  ? (customSegments.length > 0 ? "선택된 사각 영역의 모서리 핸들을 드래그하여 조절하세요" : "💡 마우스로 원하는 범위를 드래그하여 사각 영역을 선택하세요")
                  : "💡 마우스로 글자나 문장을 드래그하여 복사하세요"}
              </span>
            ) : hasWeb ? (
              <span className="text-slate-500 font-medium">
                💡 [리더] 탭에서 마우스로 텍스트를 드래그하여 복사하세요
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
          <button
            type="button"
            onClick={() => void handleCopyAllText()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white border border-slate-700 rounded-sm text-xs font-semibold cursor-pointer shadow-2xs transition active:scale-[0.98]"
            title="원문의 전체 텍스트를 클립보드로 복사"
          >
            <Copy className="w-3.5 h-3.5 text-slate-300" />
            원문 텍스트 복사
          </button>
          {customSegments.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCustomSegments([]);
                setSelectedSegmentId(null);
              }}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition active:scale-[0.98]"
              title="선택된 사각 영역 해제"
            >
              선택 해제
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};

/** 캔버스 왼쪽에 띄운 참조 문서 작업창들 (위아래 세로로 누적 스택, 너비 조절 가능). */
export const ReferenceSplitViewport: React.FC = () => {
  const openReferenceDocIds = useWorkspaceSessionStore((s) => s.openReferenceDocIds);
  const closeReferenceDoc = useWorkspaceSessionStore((s) => s.closeReferenceDoc);
  const splitWidth = useWorkspaceLayoutStore((s) => s.referenceSplitWidth);
  const setSplitWidth = useWorkspaceLayoutStore((s) => s.setReferenceSplitWidth);
  const resetSplitWidth = useWorkspaceLayoutStore((s) => s.resetReferenceSplitWidth);
  const { onResizeStart } = useDragResize({ axis: "x", size: splitWidth, onResize: setSplitWidth });

  if (openReferenceDocIds.length === 0) return null;

  return (
    <aside
      data-testid="reference-bento-viewport-container"
      style={{ width: `${splitWidth}px` }}
      className="relative h-full bg-slate-100/90 border-r border-slate-300 p-2.5 flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden shrink-0 shadow-xs z-10 transition-[width] duration-75"
    >
      <div
        data-testid="reference-split-resize-handle"
        onMouseDown={onResizeStart}
        onDoubleClick={resetSplitWidth}
        title={`드래그하여 참조 작업창 너비 조절 · 더블클릭 시 기본 너비(${REFERENCE_SPLIT_WIDTH.default}px) 복원`}
        className="absolute -right-1 top-0 bottom-0 w-2 hover:w-3 cursor-col-resize hover:bg-slate-400/40 active:bg-slate-500/60 transition-all z-30"
      />
      {openReferenceDocIds.map((docId, index) => (
        <ReferenceCard
          key={docId}
          docId={docId}
          index={index}
          totalCount={openReferenceDocIds.length}
          onClose={closeReferenceDoc}
        />
      ))}
    </aside>
  );
};
