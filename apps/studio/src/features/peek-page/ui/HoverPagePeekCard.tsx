import React from "react";
import { Lock } from "lucide-react";

import { getPageNumber, PageThumbnail, selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { selectIsReferenceDocument, useProjectStore } from "@/entities/vdoc-project";

import { usePagePeekStore, usePeekKeyboard } from "../model/usePagePeek";

const CARD_WIDTH = 280;
const CARD_HEIGHT = 440;

/** Ctrl + 호버 시 커서 옆에 뜨는 페이지 썸네일. 문서 제목 · 참조 여부는 실제 데이터에서 읽는다. */
export const HoverPagePeekCard: React.FC = () => {
  usePeekKeyboard();
  const peek = usePagePeekStore((s) => s.open);
  const doc = useStudioDocumentStore(selectDocument(peek?.docId));
  const isReference = useProjectStore(selectIsReferenceDocument(peek?.docId));

  if (!peek) return null;

  const pageNumber = getPageNumber(doc, peek.pageId);
  const left = Math.min(peek.x + 18, window.innerWidth - CARD_WIDTH - 20);
  const top = Math.max(16, Math.min(peek.y - 80, window.innerHeight - CARD_HEIGHT));

  return (
    <div
      data-testid="hover-page-peek-card"
      style={{ left, top, width: CARD_WIDTH }}
      className="fixed z-50 pointer-events-none select-none rounded-xl bg-white shadow-2xl border border-slate-300 ring-1 ring-black/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="px-2.5 py-1.5 bg-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {isReference && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-violet-600 text-violet-100 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              참조
            </span>
          )}
          <span title={doc?.title} className="text-[11px] font-semibold text-slate-100 truncate">
            {doc?.title ?? "문서를 불러오는 중…"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">P.{pageNumber}</span>
      </div>

      <div className="h-[396px] bg-slate-100 overflow-hidden relative shrink-0 flex items-center justify-center p-1.5">
        <div className="w-full h-full rounded-xs shadow-md border border-slate-200 bg-white overflow-hidden">
          <PageThumbnail doc={doc} pageNumber={pageNumber} fit="contain" />
        </div>
      </div>
    </div>
  );
};
