import React, { useMemo, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Globe,
  LayoutGrid,
  Lock,
  Maximize2,
  PlusCircle,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { PdfViewer, WebViewer, type WebArticlePayload } from "@vibe/document-viewer";
import { VDocPageSheet } from "@vibe/slot-canvas";
import { findBlock, getBlockSlotIds, htmlToPlainText, type VDocDocument } from "@vibe/vdoc-schema";

import { selectActiveDocument, selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  selectProjectOfDocument,
  selectReferenceProjectIndex,
  useProjectStore,
} from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";

const noop = () => {};
const ZOOM = { default: 0.7, fitWidth: 0.6, min: 0.4, max: 1.4, step: 0.1 } as const;
const FEEDBACK_MS = 2000;

const roundZoom = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, Number(z.toFixed(2))));

/** 블록이 쓰는 슬롯들의 평문 (클립보드 복사용). */
function blockPlainText(doc: VDocDocument, blockId: string): string {
  const found = findBlock(doc, blockId);
  if (!found) return "";
  return getBlockSlotIds(found.block)
    .map((id) => htmlToPlainText(doc.slots[id]?.content ?? ""))
    .filter(Boolean)
    .join("\n\n");
}

/** 문서의 슬롯들을 순서대로 추출하여 웹 리더 아티클 페이로드로 합성합니다. */
function synthesizeArticleFromDoc(doc: VDocDocument, cleanTitle: string, hasWeb: boolean): WebArticlePayload {
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const slotIds = getBlockSlotIds(block);
      for (const slotId of slotIds) {
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
 * 참조 문서 한 장을 띄우는 벤또 카드.
 * - 원본 뷰: PDF 또는 웹 아티클 원본을 직접 고품질 렌더링 (리더/스냅샷/라이브 모드)
 * - 조판 블록 뷰: 구조화된 VDoc 블록을 직접 확인하고 내 문서로 복제 (블록 가져오기)
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
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const project = useProjectStore(selectProjectOfDocument(docId));
  // getSnapshot 무한 루프를 방지하기 위해 원시 숫자(number) 셀렉터 사용
  const refDeckIndex = useProjectStore(selectReferenceProjectIndex(docId));
  const { importBlockFrom } = useMutateCanvasBlocks();

  // 참조 레이어 덱에서의 1-based 인덱스와 제목 정리 (불필요한 중복 [참조 N] 태그 제거)
  const refNumber = refDeckIndex !== -1 ? refDeckIndex + 1 : index + 1;
  const rawTitle = project?.title || refDoc?.title || "참조 문서";
  const cleanTitle = rawTitle.replace(/^(\[참조\s*\d+\]|참조\s*\d+:?)\s*/, "");

  const hasWeb = Boolean(refDoc?.preview?.sourceWebUrl);
  const hasPdf = Boolean(refDoc?.preview?.sourcePdfUrl);
  const hasVisualSource = hasWeb || hasPdf;

  const [userViewMode, setUserViewMode] = useState<"visual" | "blocks" | null>(null);
  const viewMode = userViewMode ?? (hasVisualSource ? "visual" : "blocks");
  const setViewMode = (m: "visual" | "blocks") => setUserViewMode(m);

  const [zoom, setZoom] = useState<number>(ZOOM.default);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
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

  const selectedBlock = (selectedBlockId && findBlock(refDoc, selectedBlockId)?.block) || null;
  const targetPageId = activePageId || activeDoc?.pages[0]?.pageId;

  const handleImportBlock = () => {
    if (!selectedBlock || !targetPageId) return;
    importBlockFrom(refDoc, selectedBlock, targetPageId);
    showFeedback("내 문서로 블록이 복제되었습니다!");
  };

  const handleCopyText = async () => {
    const text = selectedBlock ? blockPlainText(refDoc, selectedBlock.blockId) : "";
    if (!text || !navigator.clipboard) {
      showFeedback("복사할 텍스트가 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showFeedback("텍스트를 클립보드에 복사했습니다!");
    } catch {
      showFeedback("클립보드에 접근하지 못했습니다.");
    }
  };

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

  const zoomButton = "p-1 rounded-sm hover:bg-slate-800 text-slate-300 cursor-pointer";

  return (
    <article
      data-testid={`reference-card-${docId}`}
      className={`w-full ${
        totalCount > 1 ? "h-[620px] min-h-[460px] shrink-0" : "h-full"
      } bg-white rounded border border-slate-300 shadow-sm ring-1 ring-slate-900/5 flex flex-col overflow-hidden transition-all select-none`}
    >
      {/* 컴팩트 헤더: 라운드 축소(rounded-t), 참조 번호 일치, 뷰 모드 토글 */}
      <header className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0 rounded-t">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-violet-700 text-violet-100 text-[10px] font-bold shrink-0">
            <Lock className="w-2.5 h-2.5" />
            참조 {refNumber}
          </span>
          <h4 className="text-xs font-semibold truncate text-slate-100" title={cleanTitle}>
            {cleanTitle}
          </h4>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 원본 뷰 ↔ 조판 블록 뷰 전환 세그먼트 */}
          {hasVisualSource && (
            <div className="inline-flex items-center p-0.5 rounded-sm bg-slate-800 border border-slate-700 text-[10px]">
              <button
                type="button"
                onClick={() => setViewMode("visual")}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                  viewMode === "visual"
                    ? "bg-violet-600 text-white font-bold shadow-2xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title={hasWeb ? "원본 웹 리더 / 스냅샷 뷰" : "원본 PDF 벡터 뷰"}
              >
                {hasWeb ? <Globe className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                <span>원본 뷰</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("blocks")}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition cursor-pointer ${
                  viewMode === "blocks"
                    ? "bg-violet-600 text-white font-bold shadow-2xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="조판 블록 구조 및 블록 가져오기 뷰"
              >
                <LayoutGrid className="w-2.5 h-2.5" />
                <span>조판 블록</span>
              </button>
            </div>
          )}

          {/* 조판 블록 모드에서만 배율 조정 버튼 노출 (웹뷰어는 자체 컨트롤바 보유) */}
          {viewMode === "blocks" && (
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setZoom((z) => roundZoom(z - ZOOM.step))} className={zoomButton} title="축소">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(ZOOM.default)}
                className="px-1 py-0.5 rounded-sm hover:bg-slate-800 text-[10px] font-mono font-medium text-slate-200 cursor-pointer"
                title={`기본 배율 복원 (${ZOOM.default * 100}%)`}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => setZoom((z) => roundZoom(z + ZOOM.step))} className={zoomButton} title="확대">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setZoom(ZOOM.fitWidth)} className={zoomButton} title="너비에 맞추기">
                <Maximize2 className="w-3 h-3" />
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

      {/* 바디 영역: visual 모드 (WebViewer / PdfViewer) 또는 blocks 모드 (VDocPageSheet) */}
      <div className="flex-1 w-full h-full overflow-hidden flex flex-col relative min-h-0">
        {viewMode === "visual" && hasWeb && refDoc.preview?.sourceWebUrl ? (
          <WebViewer
            url={refDoc.preview.sourceWebUrl}
            title={cleanTitle}
            initialMode="reader"
            snapshotUrl={refDoc.preview.pageThumbnails?.[0]}
            article={articlePayload}
            onExtractText={(text) => void handleCopyExtractedText(text)}
          />
        ) : viewMode === "visual" && hasPdf && refDoc.preview?.sourcePdfUrl ? (
          <PdfViewer
            url={refDoc.preview.sourcePdfUrl}
            title={cleanTitle}
            isSpread={false}
          />
        ) : (
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-slate-100/60 select-text flex flex-col items-center"
            data-testid={`reference-viewport-${docId}`}
          >
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: "794px", transition: "transform 0.12s ease-out" }}
              className="flex flex-col gap-6"
            >
              {refDoc.pages.map((page) => (
                <div key={page.pageId} className="relative shadow-xs rounded-sm overflow-hidden border border-slate-300 bg-white">
                  <VDocPageSheet
                    docTitle={refDoc.title}
                    totalPages={refDoc.pages.length}
                    page={page}
                    slots={refDoc.slots}
                    backdata={refDoc.backdata}
                    mode="Viewing"
                    selectedBlockId={selectedBlockId}
                    selectedSlotId={null}
                    composerOpenSlotId={null}
                    onSelectPage={noop}
                    onSelectSlot={noop}
                    onSelectBlock={setSelectedBlockId}
                    onToggleComposerForSlot={noop}
                    onOpenBackdataDrawer={noop}
                    onUpdateSlotContent={noop}
                    onMoveBlock={noop}
                    onDeleteBlock={noop}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 푸터 영역: 라운드 축소(rounded-b) 및 모드별 특화 액션 바 */}
      <footer className="p-2.5 bg-slate-50 border-t border-slate-200/90 flex flex-col gap-1.5 shrink-0 rounded-b">
        <div className="flex items-center justify-between text-[11px] px-1 text-slate-600">
          <span className="truncate max-w-[340px]">
            {feedback ? (
              <span className="text-violet-700 font-bold flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" /> {feedback}
              </span>
            ) : viewMode === "visual" ? (
              <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
                {hasWeb ? (
                  <>
                    <Globe className="w-3 h-3 text-blue-500" />
                    <span>웹 아티클 원본 리더 ({refDoc.variables?.["Article.Platform"] || "Tossfeed"})</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3 h-3 text-rose-500" />
                    <span>PDF 원본 벡터 문서 ({refDoc.pages.length}p)</span>
                  </>
                )}
              </span>
            ) : selectedBlock ? (
              <span>
                선택 블록: <strong className="text-slate-900">{selectedBlock.title || selectedBlock.kind}</strong>
              </span>
            ) : (
              <span className="text-slate-400">💡 블록을 클릭하여 세부 항목을 추출하세요</span>
            )}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {viewMode === "visual" ? (hasWeb ? "Web Reader" : `${refDoc.pages.length}p PDF`) : `${refDoc.pages.length}p Blocks`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          {viewMode === "visual" ? (
            <>
              <button
                type="button"
                onClick={() => void handleCopyAllText()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-sm text-xs font-semibold cursor-pointer shadow-2xs transition active:scale-[0.98]"
                title="원문의 전체 텍스트를 클립보드로 복사"
              >
                <Copy className="w-3.5 h-3.5" />
                원문 텍스트 복사
              </button>
              <button
                type="button"
                onClick={() => setViewMode("blocks")}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition active:scale-[0.98]"
                title="블록 단위로 세부 항목을 복제할 수 있는 조판 블록 뷰로 전환"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
                조판 블록 전환
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!selectedBlock || !targetPageId}
                onClick={handleImportBlock}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-sm text-xs font-semibold cursor-pointer shadow-2xs transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                title="선택한 블록을 내 현재 편집 페이지로 복제 추가"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                블록 가져오기
              </button>
              <button
                type="button"
                disabled={!selectedBlock}
                onClick={() => void handleCopyText()}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-sm text-xs font-medium cursor-pointer shadow-2xs transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                title="선택한 블록의 텍스트 추출 복사"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                텍스트 복사
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-sm text-xs font-medium shadow-2xs opacity-40 cursor-not-allowed"
                title="블록 스타일 스포이트 (준비 중)"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                스타일
              </button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
};

/** 캔버스 왼쪽에 띄운 참조 문서 작업창들 (위아래 세로로 누적 스택). */
export const ReferenceSplitViewport: React.FC = () => {
  const openReferenceDocIds = useWorkspaceSessionStore((s) => s.openReferenceDocIds);
  const closeReferenceDoc = useWorkspaceSessionStore((s) => s.closeReferenceDoc);

  if (openReferenceDocIds.length === 0) return null;

  return (
    <aside
      data-testid="reference-bento-viewport-container"
      className="w-[520px] min-w-[460px] max-w-[600px] h-full bg-slate-100/90 border-r border-slate-300 p-2.5 flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden shrink-0 select-none shadow-xs z-10"
    >
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
