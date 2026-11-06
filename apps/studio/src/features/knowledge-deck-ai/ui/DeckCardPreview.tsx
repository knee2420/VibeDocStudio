import React, { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Image as ImageIcon, Loader2, Sparkles, Table, X } from "lucide-react";

import { type DeckCardDetail, knowledgeDeckApi, useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

import { attachDeckToComposer } from "../model/attach";

/**
 * 지식 덱 카드 미리보기 — 목록에서 카드를 누르거나, Composer 답변 속 출처 링크(`vdoc:kcard/…`)를 누르면 뜬다.
 * 화면 오른쪽 아래에 떠 있으므로 Composer 를 닫지 않고 근거를 확인할 수 있다.
 */
export const DeckCardPreview: React.FC = () => {
  const preview = useKnowledgeDeckStore((s) => s.previewCard);
  const close = useKnowledgeDeckStore((s) => s.closeCardPreview);
  const open = useKnowledgeDeckStore((s) => s.openCardPreview);
  const deck = useKnowledgeDeckStore((s) => s.decks.find((d) => d.id === preview?.deckId));
  const [card, setCard] = useState<DeckCardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  // 오른쪽 패널(Composer) 바로 왼쪽에 띄운다 — 답변과 근거 카드를 나란히 본다
  const rightOffset = useWorkspaceLayoutStore((s) => (s.rightSidebarOpen ? s.rightSidebarWidth : 0)) + 16;

  useEffect(() => {
    if (!preview) return;
    let alive = true;
    setCard(null);
    setError(null);
    setShowSource(Boolean(preview.showSource));
    knowledgeDeckApi
      .card(preview.deckId, preview.cardId)
      .then((c) => alive && setCard(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "카드를 불러오지 못했습니다."));
    return () => {
      alive = false;
    };
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, close]);

  if (!preview) return null;
  return (
    <div
      data-testid="deck-card-preview"
      style={{ right: rightOffset }}
      className="fixed bottom-4 z-[60] w-[440px] max-h-[70vh] flex flex-col rounded-xl border border-violet-200 bg-white shadow-2xl overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-violet-700 truncate">{deck?.title ?? preview.deckId}{card ? ` · ${card.section}` : ""}</div>
          <div className="text-xs font-bold text-slate-800 truncate">
            {preview.cardId} {card?.title ?? ""}
          </div>
        </div>
        {deck && (
          <button
            type="button"
            onClick={() => attachDeckToComposer(deck, `@{handles} 의 ${preview.cardId} 카드를 근거로 `)}
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600 text-white hover:bg-violet-700 cursor-pointer"
            title="이 덱을 Composer 에 첨부하고 이 카드를 가리키는 지시문을 넣습니다"
          >
            Composer 첨부
          </button>
        )}
        <button type="button" onClick={close} className="p-1 rounded hover:bg-white text-slate-500 cursor-pointer" title="닫기 (Esc)">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {!card && !error && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 카드를 불러오는 중…
          </div>
        )}
        {error && <div className="text-rose-600">{error}</div>}
        {card && (
          <>
            <div className="text-[10px] text-slate-500">{card.path}</div>
            <p className="leading-relaxed text-slate-800">{card.summary}</p>
            {card.elements.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-slate-600 mb-1">요소</div>
                <table className="w-full text-[11px] border-collapse">
                  <tbody>
                    {card.elements.slice(0, 24).map((el, i) => (
                      <tr key={`${el.name}-${i}`} className="border-t border-slate-100 align-top">
                        <td className="py-0.5 pr-2 font-mono text-violet-800 whitespace-nowrap max-w-[150px] truncate" title={el.name}>
                          {el.name}
                        </td>
                        <td className="py-0.5 text-slate-600">{el.detail}</td>
                        <td className="py-0.5 pl-1 text-slate-400 text-right">{el.line ? `L${el.line}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {card.assets.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.assets.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700" title={a.columns.join(", ")}>
                    {a.kind === "table" ? <Table className="w-3 h-3 text-blue-500" /> : <ImageIcon className="w-3 h-3 text-teal-500" />}
                    {a.id} {a.caption}
                    {a.kind === "table" ? ` (${a.rows}행)` : ""}
                  </span>
                ))}
              </div>
            )}
            {(card.aliases?.length || card.keywords?.length) ? (
              <div className="text-[10px] text-slate-500">
                <span className="font-bold text-slate-600">찾게 해 주는 말: </span>
                {[...(card.aliases ?? []), ...(card.keywords ?? [])].slice(0, 14).join(" · ")}
              </div>
            ) : null}
            {card.linksOut.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-slate-600 mb-1">밖으로 (연결)</div>
                <div className="flex flex-wrap gap-1">
                  {card.linksOut.map((l) => (
                    <button
                      key={l.cardId}
                      type="button"
                      onClick={() => open(preview.deckId, l.cardId)}
                      className="px-1.5 py-0.5 rounded border border-violet-200 text-[10px] text-violet-700 hover:bg-violet-50 cursor-pointer"
                    >
                      {l.cardId} {l.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-violet-700 cursor-pointer"
              >
                <BookOpen className="w-3 h-3" /> 원문 {card.source}
                <ExternalLink className="w-3 h-3" />
              </button>
              {showSource && (
                <pre className="mt-1 p-2 rounded bg-slate-50 border border-slate-200 text-[10.5px] leading-snug whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto">
                  {card.sourceText}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
