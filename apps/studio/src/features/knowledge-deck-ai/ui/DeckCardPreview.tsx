import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Copy, ExternalLink, FileText, Loader2, MousePointerClick, Sparkles, Type, X } from "lucide-react";

import { PdfViewer } from "@vibe/document-viewer";

import { type DeckCardDetail, knowledgeDeckApi, useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { composerController } from "@/shared/ai";
import { useDragResize } from "@/shared/lib";

import { attachDeckToComposer } from "../model/attach";

interface ParsedLine {
  lineNum: number | null;
  text: string;
  isHighlighted: boolean;
  isSecondaryHighlight?: boolean;
  siblingCardId?: string;
}

/**
 * [SourceSplitViewer: 원문 뷰어 스플릿 패널]
 *
 * 1) 에디터(Canvas)와 AI Composer 사이에 독립된 스플릿 패널로 도킹 (캔버스 본문 가림 0%).
 * 2) 가공된 요약문(JSON) 대신 라인 거터(L57, L58...)가 달린 실제 원문 문서 직접 렌더링.
 * 3) 해당 파트(L57-L68)를 소프트 바이올렛 형광펜으로 하이라이트하고 자동 센터 스크롤.
 */
export const DeckCardPreview: React.FC = () => {
  const preview = useKnowledgeDeckStore((s) => s.previewCard);
  const close = useKnowledgeDeckStore((s) => s.closeCardPreview);
  const open = useKnowledgeDeckStore((s) => s.openCardPreview);
  const deck = useKnowledgeDeckStore((s) => s.decks.find((d) => d.id === preview?.deckId));

  const [card, setCard] = useState<DeckCardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 스플릿 패널 너비 조절 (기본 480px, 340px ~ 800px)
  const [splitWidth, setSplitWidth] = useState(480);
  const { onResizeStart } = useDragResize({
    axis: "x",
    size: splitWidth,
    onResize: (w) => setSplitWidth(Math.max(340, Math.min(850, w))),
  });

  const firstHighlightRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pdfInteractionMode, setPdfInteractionMode] = useState<"text" | "box">("text");

  // PDF 인 경우 카드가 변경되거나 로드되면 해당 페이지로 스크롤
  useEffect(() => {
    if (!card?.isPdf || !card?.pdfPage) return;
    const timer = setTimeout(() => {
      const root = pdfContainerRef.current;
      const pageEl = root?.querySelector<HTMLElement>(`[data-page-number="${card.pdfPage}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [card?.isPdf, card?.pdfPage]);

  // 현재 선택된 활성 카드 ID (동일 문서 내에서는 네트워크 재호출 없이 포커스만 전환)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 특정 카드로 즉시 스크롤 점프하는 함수
  const jumpToLine = (targetLineNum: number) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-line-number="${targetLineNum}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const jumpToCard = (cardId: string) => {
    setSelectedCardId(cardId);
    if (!card?.siblings) return;
    const target = card.siblings.find((s) => s.cardId === cardId);
    if (target?.lines) {
      jumpToLine(target.lines[0]);
    }
  };

  useEffect(() => {
    if (!preview) return;

    // 만약 이미 로드된 카드 문서의 siblings 에 포함되어 있다면, 새로 API 를 부르지 않고 스크롤만 이동!
    if (card && card.siblings?.some((s) => s.cardId === preview.cardId)) {
      jumpToCard(preview.cardId);
      return;
    }

    let alive = true;
    setLoading(true);
    setCard(null);
    setError(null);
    setSelectedCardId(preview.cardId);

    knowledgeDeckApi
      .card(preview.deckId, preview.cardId)
      .then((c) => {
        if (!alive) return;
        setCard(c);
        setSelectedCardId(preview.cardId);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "카드를 불러오지 못했습니다.");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [preview]);

  // 카드가 로드되거나 변경되면 첫 번째 하이라이트 라인으로 자동 센터 스크롤
  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => {
      firstHighlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, [card]);

  // Esc 키 누르면 닫기
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, close]);

  // 현재 활성화된 카드 ID (기본값: preview.cardId)
  const currentActiveId = selectedCardId || preview?.cardId || card?.cardId;

  // 이번 AI 대화 세션에서 실제로 인용/언급된 카드 ID 목록 추출 (인용되지 않은 카드는 하이라이트 제외!)
  const citedCardIds = useMemo(() => {
    const ids = new Set<string>();
    if (preview?.cardId) ids.add(preview.cardId);
    try {
      const items = composerController.getState().items || [];
      for (const item of items) {
        if (item.kind === "assistant") {
          for (const m of item.text.matchAll(/vdoc:kcard\/(?:[^/:]+:)?([A-Za-z0-9-]+)/g)) {
            ids.add(m[1]);
          }
          for (const m of item.text.matchAll(/\b(C-\d+-\d+)\b/g)) {
            ids.add(m[1]);
          }
        }
      }
    } catch {
      /* ignore */
    }
    return ids;
  }, [preview?.cardId]);

  // 같은 문서의 siblings 중에서 "이번 답변에서 실제로 인용된 카드들"만 엄선!
  const citedSiblings = useMemo(() => {
    if (!card?.siblings) return [];
    return card.siblings.filter((s) => citedCardIds.has(s.cardId));
  }, [card?.siblings, citedCardIds]);

  // 원문 전체 문서 라인 단위 파싱 (오직 실제로 인용된 카드들만 하이라이트 적용)
  const parsedLines = useMemo((): ParsedLine[] => {
    const textSource = card?.fullDocument || card?.sourceText;
    if (!textSource) return [];

    const rawLines = textSource.split("\n");

    // 1) 현재 활성 카드의 범위
    let activeLo = -1;
    let activeHi = -1;
    const currentSibling = card?.siblings?.find((s) => s.cardId === currentActiveId);
    if (currentSibling?.lines) {
      activeLo = currentSibling.lines[0];
      activeHi = currentSibling.lines[1];
    } else if (card?.highlightRange) {
      activeLo = card.highlightRange[0];
      activeHi = card.highlightRange[1];
    }

    // 2) 오직 "함께 인용된 다른 카드"만 보조 하이라이트 대상에 포함 (인용 안 된 다른 카드는 제외!)
    const siblingRanges = citedSiblings.filter((s) => s.cardId !== currentActiveId && s.lines);

    return rawLines.map((line: string, idx: number): ParsedLine => {
      const linePrefixMatch = /^L(\d+):\s?(.*)$/.exec(line);
      const lineNum = linePrefixMatch ? parseInt(linePrefixMatch[1], 10) : idx + 1;
      const text = linePrefixMatch ? linePrefixMatch[2] : line;

      // 주 하이라이트 (현재 보고 있는 카드 구간)
      const isPrimary = activeLo > 0 && activeHi > 0 ? lineNum >= activeLo && lineNum <= activeHi : true;

      // 보조 하이라이트 (같은 문서 내 다른 인용 카드의 구간)
      let isSecondary = false;
      let siblingCardId: string | undefined;
      if (!isPrimary && siblingRanges.length > 0) {
        const found = siblingRanges.find((s) => lineNum >= s.lines![0] && lineNum <= s.lines![1]);
        if (found) {
          isSecondary = true;
          siblingCardId = found.cardId;
        }
      }

      return {
        lineNum,
        text,
        isHighlighted: isPrimary,
        isSecondaryHighlight: isSecondary,
        siblingCardId,
      };
    });
  }, [card, currentActiveId]);

  const handleCopySource = async () => {
    if (!card?.sourceText) return;
    try {
      await navigator.clipboard.writeText(card.sourceText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!preview) return null;

  return (
    <aside
      data-testid="source-split-viewer"
      style={{ width: `${splitWidth}px` }}
      className="relative h-full flex flex-col bg-white border-l border-r border-slate-300 shadow-sm z-20 shrink-0 transition-[width] duration-75 select-text"
    >
      {/* 0. 좌측 리사이즈 드래그 핸들 */}
      <div
        onMouseDown={onResizeStart}
        onDoubleClick={() => setSplitWidth(480)}
        title="드래그하여 원문 뷰어 너비 조절 · 더블클릭 시 기본 너비(480px) 복원"
        className="absolute -left-1 top-0 bottom-0 w-2 hover:w-3 cursor-col-resize hover:bg-purple-400/40 active:bg-purple-600/60 transition-all z-30"
      />

      {/* 1. 상단 메인 헤더: 덱 제목, 카드 ID, 컴포저 첨부, 닫기 */}
      <header className="px-3.5 py-2.5 border-b border-purple-200/80 bg-gradient-to-r from-purple-50/90 via-white to-purple-50/40 flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Bookmark className="w-4 h-4 text-purple-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-purple-700 truncate">
              {deck?.title ?? preview.deckId}
              {card?.section ? ` › ${card.section}` : ""}
            </div>
            <div className="text-xs font-bold text-slate-800 truncate">
              <span className="text-purple-800 font-mono mr-1">{preview.cardId}</span>
              <span>{card?.title ?? ""}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {deck && (
            <button
              type="button"
              onClick={() => attachDeckToComposer(deck, `@{handles} 의 ${preview.cardId} 카드를 근거로 `)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-purple-600 hover:bg-purple-700 text-white cursor-pointer transition shadow-2xs"
              title="이 덱을 Composer 에 첨부하고 이 카드를 가리키는 지시문을 넣습니다"
            >
              <Sparkles className="w-3 h-3" />
              <span>Composer 첨부</span>
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 cursor-pointer transition"
            title="원문 뷰어 닫기 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. 서브 헤더: 원문 파일명, 앵커 라인/페이지 정보, 모드/복사 버튼 */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] select-none shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 font-mono text-[11px] text-slate-700" title={card?.source || card?.path}>
          <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <span className="truncate font-semibold text-slate-800">{card?.source?.split("#")[0] || card?.path || "원문 문서"}</span>
          {/* 동일 문서 내 실제로 인용된 카드들만 빠른 점프 버튼 표시 (C-03-03, C-03-08 등) */}
          {citedSiblings.length > 1 && (
            <div className="flex items-center gap-1 shrink-0 ml-1">
              {citedSiblings.map((sib) => {
                const isCurrent = sib.cardId === currentActiveId;
                return (
                  <button
                    key={sib.cardId}
                    type="button"
                    onClick={() => jumpToCard(sib.cardId)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition select-none ${
                      isCurrent
                        ? "bg-amber-500 text-white shadow-2xs scale-105"
                        : "bg-amber-100/70 text-amber-900 hover:bg-amber-200/90"
                    }`}
                    title={`${sib.cardId} (L${sib.lines?.[0]}-L${sib.lines?.[1]}): ${sib.title} — 클릭 시 즉시 스크롤`}
                  >
                    {sib.cardId}
                  </button>
                );
              })}
            </div>
          )}
          {card?.isPdf ? (
            <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold shrink-0">
              Page {card.pdfPage ?? 1}p 영역 하이라이트
            </span>
          ) : card?.source?.includes("#") ? (
            <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] font-bold shrink-0">
              {card.source.split("#")[1]}
            </span>
          ) : card?.highlightRange ? (
            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0">
              L{card.highlightRange[0]}-L{card.highlightRange[1]}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {card?.isPdf ? (
            <div className="inline-flex items-center p-0.5 rounded-sm bg-slate-200 border border-slate-300 text-[10px]">
              <button
                type="button"
                onClick={() => setPdfInteractionMode("text")}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer ${
                  pdfInteractionMode === "text"
                    ? "bg-white text-purple-800 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="글자 드래그 선택 모드"
              >
                <Type className="w-2.5 h-2.5" />
                텍스트
              </button>
              <button
                type="button"
                onClick={() => setPdfInteractionMode("box")}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer ${
                  pdfInteractionMode === "box"
                    ? "bg-white text-purple-800 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="사각 영역 선택 모드"
              >
                <MousePointerClick className="w-2.5 h-2.5" />
                영역
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleCopySource()}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-[10.5px] cursor-pointer transition"
              title="원문 텍스트 복사"
            >
              <Copy className="w-3 h-3" />
              <span>{copied ? "복사됨!" : "복사"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. 본문 뷰어 (PDF 뷰어 또는 마크다운 텍스트 원문 매핑 + 형광펜 하이라이트) */}
      {card?.isPdf && card?.pdfUrl ? (
        <div
          ref={pdfContainerRef}
          className="flex-1 w-full h-full overflow-hidden flex flex-col relative min-h-0 select-text bg-slate-100"
        >
          <PdfViewer
            url={card.pdfUrl}
            title={card.title}
            isSpread={false}
            isEditMode={pdfInteractionMode === "box"}
            highlights={
              card.pdfPage
                ? [
                    {
                      id: `deck-${preview.cardId}`,
                      page: card.pdfPage,
                      box: card.pdfBox ?? [150, 100, 350, 900],
                      label: card.title,
                      variant: "primary",
                    },
                  ]
                : undefined
            }
          />
        </div>
      ) : (
      <div
        ref={containerRef}
        className="flex-1 relative overflow-y-auto overflow-x-auto p-2 pr-4 bg-[#fdfdfd] font-mono text-xs leading-relaxed"
      >
        {/* VSCode 형 Overview Ruler (우측 스크롤바 미니맵 — 오직 인용된 카드 위치만 마커 표시) */}
        {card && parsedLines.length > 0 && citedSiblings.length > 0 && (
          <div
            title="스크롤바 인용 구간 미니맵 (클릭 시 해당 위치로 점프)"
            className="absolute right-0.5 top-1 bottom-1 w-2 z-30 pointer-events-auto flex flex-col select-none"
          >
            {citedSiblings.map((sib) => {
              if (!sib.lines) return null;
              const [lo, hi] = sib.lines;
              const total = parsedLines.length;
              const topPct = (lo / total) * 100;
              const heightPct = Math.max(((hi - lo + 1) / total) * 100, 2.5);
              const isCurrent = sib.cardId === currentActiveId;

              return (
                <div
                  key={sib.cardId}
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToCard(sib.cardId);
                  }}
                  title={`${sib.cardId} (L${lo}-L${hi}): ${sib.title}`}
                  style={{
                    position: "absolute",
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    right: 0,
                    width: isCurrent ? "7px" : "4px",
                  }}
                  className={`rounded-xs cursor-pointer transition-all ${
                    isCurrent
                      ? "bg-amber-500 shadow-xs ring-1 ring-amber-600 z-10 hover:w-2.5"
                      : "bg-amber-400/50 hover:bg-amber-500 hover:w-2.5"
                  }`}
                />
              );
            })}
          </div>
        )}
        {loading && (
          <div className="h-40 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
            <span>원문 문서를 불러오는 중…</span>
          </div>
        )}

        {error && (
          <div className="p-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg m-2">
            {error}
          </div>
        )}

        {!loading && !error && parsedLines.length === 0 && (
          <div className="h-40 flex items-center justify-center text-slate-400 text-xs">
            원문 텍스트가 비어 있습니다.
          </div>
        )}

        {!loading && !error && parsedLines.length > 0 && (
          <div className="space-y-0.5">
                        {(() => {
              let firstRefAssigned = false;
              return parsedLines.map((line, idx) => {
                const attachFirstRef = line.isHighlighted && !firstRefAssigned;
                if (attachFirstRef) firstRefAssigned = true;
                return (
                  <div
                    key={idx}
                    data-line-number={line.lineNum}
                    ref={attachFirstRef ? firstHighlightRef : undefined}
                    onClick={() => {
                      if (line.isSecondaryHighlight && line.siblingCardId) {
                        jumpToCard(line.siblingCardId);
                      }
                    }}
                    className={`flex items-start py-0.5 px-2 rounded-sm transition ${
                      line.isHighlighted
                        ? "bg-amber-100/95 text-amber-950 font-medium border-l-4 border-amber-500 shadow-2xs"
                        : line.isSecondaryHighlight
                        ? "bg-amber-50/60 text-slate-800 border-l-2 border-dashed border-amber-400/80 hover:bg-amber-100/60 cursor-pointer"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/40"
                    }`}
                  >
                    {/* 좌측 라인 번호 거터 */}
                    <span className={`w-10 text-right pr-3 select-none font-mono text-[11px] shrink-0 pt-0.5 ${
                      line.isHighlighted ? "text-amber-800 font-bold" : "text-slate-400"
                    }`}>
                      {line.lineNum != null ? `L${line.lineNum}` : `${idx + 1}`}
                    </span>
                    {/* 우측 원문 텍스트 */}
                    <span className={`flex-1 min-w-0 whitespace-pre-wrap break-words ${
                      line.isHighlighted ? "text-slate-900" : ""
                    }`}>
                      {line.text}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
      )}

      {/* 4. 하단 미니 접이식: 추출 요소 요약 및 외부 링크 */}
      {card && (
        <footer className="border-t border-slate-200 bg-slate-50/90 text-[11px] select-none shrink-0">
          {card.elements && card.elements.length > 0 && (
            <details className="group">
              <summary className="px-3 py-1.5 cursor-pointer font-bold text-slate-600 hover:text-purple-700 flex items-center justify-between">
                <span>매핑 추출 요소 ({card.elements.length}개)</span>
                <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="p-2 max-h-32 overflow-y-auto space-y-1 bg-white border-t border-slate-200 text-[11px]">
                {card.elements.map((el, i) => (
                  <div key={i} className="flex items-start gap-1.5 py-0.5">
                    <span className="font-mono text-purple-800 font-bold shrink-0">{el.name}</span>
                    <span className="text-slate-600 flex-1 truncate" title={el.detail}>{el.detail}</span>
                    {el.line && <span className="text-[10px] text-slate-400 font-mono shrink-0">L{el.line}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {card.linksOut && card.linksOut.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-200/60 flex items-center gap-1.5 overflow-x-auto text-[10.5px]">
              <span className="font-bold text-slate-500 shrink-0">연결 카드:</span>
              {card.linksOut.map((l) => (
                <button
                  key={l.cardId}
                  type="button"
                  onClick={() => open(preview.deckId, l.cardId)}
                  className="px-1.5 py-0.5 rounded border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 cursor-pointer shrink-0 truncate max-w-[150px]"
                  title={`${l.cardId} ${l.title}`}
                >
                  {l.cardId} {l.title}
                </button>
              ))}
            </div>
          )}
        </footer>
      )}
    </aside>
  );
};
