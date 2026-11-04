import React, { useEffect } from "react";
import { Lock } from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

function getThumbnailUrl(docId?: string | null, pageNumber: number = 1): string {
  if (!docId) return `/thumbnails/doc_main_p${Math.min(Math.max(1, pageNumber), 5)}.png`;
  const lower = docId.toLowerCase();
  if (lower.includes("intl") || lower.includes("ref1")) return `/thumbnails/ref1_p1.png`;
  if (lower.includes("reward") || lower.includes("ref2")) return `/thumbnails/ref2_p${Math.min(Math.max(1, pageNumber), 3)}.png`;
  if (lower.includes("seoul") || lower.includes("startup") || lower.includes("ref3")) return `/thumbnails/ref3_p${Math.min(Math.max(1, pageNumber), 7)}.png`;
  if (lower.includes("toss") || lower.includes("safezone") || lower.includes("ref4")) return `/thumbnails/ref4_p1.png`;
  return `/thumbnails/doc_main_p${Math.min(Math.max(1, pageNumber), 5)}.png`;
}

function getDocTitle(docId?: string | null, fallbackTitle?: string): string {
  if (!docId) return fallbackTitle || "10월 4주차 VibeDocStudio 아키텍처 정례 회의록";
  const lower = docId.toLowerCase();
  if (lower.includes("intl") || lower.includes("ref1")) return "국제교류위원회 규정 및 운영세칙 안내";
  if (lower.includes("reward") || lower.includes("ref2")) return "상벌위원회 규정 및 회의록 서식 자료모음";
  if (lower.includes("seoul") || lower.includes("startup") || lower.includes("ref3")) return "2026 서울창업허브 글로벌 진출 PoC·액셀러레이팅 사업공고";
  if (lower.includes("toss") || lower.includes("safezone") || lower.includes("ref4")) return "바쁜 마음을 내려놓는 가을 여행지 3곳 (토스피드)";
  return fallbackTitle || "10월 4주차 VibeDocStudio 아키텍처 정례 회의록";
}

function isReferenceDoc(docId?: string | null, activeDocId?: string): boolean {
  if (!docId) return false;
  if (activeDocId && docId === activeDocId) return false;
  const lower = docId.toLowerCase();
  return lower.includes("ref") || lower.includes("intl") || lower.includes("reward") || lower.includes("startup") || lower.includes("toss");
}

function getPageNum(pageId?: string | null, targetDoc?: { pages: { pageId: string; pageNumber: number }[] }): number {
  if (!pageId) return 1;
  const found = targetDoc?.pages.find((p) => p.pageId === pageId);
  if (found) return found.pageNumber;
  const match = pageId.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 1;
}

/**
 * Ctrl + 마우스 호버 시 마우스 커서 옆에 실시간으로 뜨는
 * 순수 페이지 실물 캡처 '썸네일' 뷰어 (Thumbnail Peek Modal).
 */
export const HoverPagePeekCard: React.FC = () => {
  const peekPageId = useWorkspaceSessionStore((s) => s.peekPageId);
  const peekPosition = useWorkspaceSessionStore((s) => s.peekPosition);
  const peekDocId = useWorkspaceSessionStore((s) => s.peekDocId);
  const setPeekPage = useWorkspaceSessionStore((s) => s.setPeekPage);

  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const docs = useStudioDocumentStore((s) => s.docs);

  // Ctrl 키를 떼거나 창 포커스가 빠지면 즉시 썸네일 닫기
  useEffect(() => {
    if (!peekPageId) return;

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setPeekPage(null);
      }
    };

    const handleWindowBlur = () => {
      setPeekPage(null);
    };

    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [peekPageId, setPeekPage]);

  if (!peekPageId || !peekPosition) return null;

  const targetDocId = peekDocId || activeDocId;
  const targetDoc = docs.find((d) => d.docId === targetDocId);
  const docTitle = getDocTitle(targetDocId, targetDoc?.title);
  const pageNum = getPageNum(peekPageId, targetDoc);
  const isOtherDoc = isReferenceDoc(targetDocId, activeDocId);
  const thumbnailUrl = getThumbnailUrl(targetDocId, pageNum);

  // 뷰포트 클램핑 (280px 폭, 약 420px 높이 기준)
  const left = Math.min(peekPosition.x + 18, window.innerWidth - 300);
  const top = Math.max(16, Math.min(peekPosition.y - 80, window.innerHeight - 440));

  return (
    <div
      data-testid="hover-page-peek-card"
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 pointer-events-none select-none w-[280px] rounded-xl bg-white shadow-2xl border border-slate-300 ring-1 ring-black/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1) 썸네일 상단 캡션 바 */}
      <div className="px-2.5 py-1.5 bg-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {isOtherDoc && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-violet-600 text-violet-100 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              참조
            </span>
          )}
          <span
            title={docTitle}
            className="text-[11px] font-semibold text-slate-100 truncate"
          >
            {docTitle}
          </span>
        </div>

        <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">
          P.{pageNum}
        </span>
      </div>

      {/* 2) 실물 고해상도 캡처 썸네일 (깨짐 없는 1:1 사진 스냅샷) */}
      <div className="w-[280px] h-[396px] bg-slate-100 overflow-hidden relative shrink-0 flex items-center justify-center p-1.5">
        <img
          src={thumbnailUrl}
          alt={`Page ${pageNum} preview`}
          className="w-full h-full object-contain rounded-xs shadow-md border border-slate-200 bg-white select-none pointer-events-none"
        />
      </div>
    </div>
  );
};
