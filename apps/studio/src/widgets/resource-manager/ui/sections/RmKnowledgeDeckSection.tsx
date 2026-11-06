import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Table,
  Trash2,
  X,
} from "lucide-react";
import { writeContextDrag } from "@vibe/ai-kernel";
import {
  isDeckBusy,
  type DeckFileProgress,
  type KnowledgeDeck,
  type TopicNode,
  useKnowledgeDeckStore,
} from "@/entities/knowledge-deck";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { slotsUsingCard, useEvidenceFocusStore } from "@/features/evidence-focus";
import { deckContextRef } from "@/features/knowledge-deck-ai";
import { DeckFileProgressList, deckFileSummary } from "./DeckFileProgressList";
import { ImportDeckModal } from "./ImportDeckModal";

/** 섹션(1단) → 카드(2단). 카드를 누르면 오른쪽에 카드 미리보기가 열린다. */
const DeckOutline: React.FC<{ deck: KnowledgeDeck; projectId: string }> = ({ deck, projectId }) => {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const selectDeckSections = useKnowledgeDeckStore((s) => s.selectDeckSections);
  const toggleDeckChoice = useKnowledgeDeckStore((s) => s.toggleDeckChoice);
  const allIds = deck.topics.map((t) => t.id);
  // 비어 있으면 전부 — 덱 체크가 꺼져 있으면 아무것도 안 쓴다
  const chosen = new Set(deck.isChecked ? (deck.selectedSections?.length ? deck.selectedSections : allIds) : []);
  const toggleSection = (sectionId: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(sectionId);
    else next.delete(sectionId);
    if (next.size === 0) {
      // 마지막 섹션까지 끄면 덱 자체를 끈다 (선택은 전부로 되돌려 둔다)
      void toggleDeckChoice(projectId, deck.id, false);
      void selectDeckSections(projectId, deck.id, null);
      return;
    }
    if (!deck.isChecked) void toggleDeckChoice(projectId, deck.id, true);
    const ordered = allIds.filter((id) => next.has(id));
    void selectDeckSections(projectId, deck.id, ordered.length === allIds.length ? null : ordered);
  };
  const openCardPreview = useKnowledgeDeckStore((s) => s.openCardPreview);
  const preview = useKnowledgeDeckStore((s) => s.previewCard);
  const focusKey = useEvidenceFocusStore((s) => (s.focusCards[deck.id] ?? []).join(","));
  const follow = useEvidenceFocusStore((s) => s.follow);
  const focusCards = new Set(focusKey ? focusKey.split(",") : []);
  // 초점 따라가기: 초점 카드가 든 섹션을 펼친다 (자동 선택 — 덱 체크는 건드리지 않는다)
  useEffect(() => {
    if (!follow || !focusKey) return;
    const ids = new Set(focusKey.split(","));
    const sections = deck.topics.filter((sec) => (sec.children ?? []).some((c) => ids.has(c.id))).map((sec) => sec.id);
    if (sections.length) setOpen((prev) => new Set([...prev, ...sections]));
  }, [follow, focusKey, deck.topics]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="space-y-0.5">
      {deck.topics.map((sec: TopicNode) => {
        const isOpen = open.has(sec.id);
        return (
          <div key={sec.id} className="text-xs">
            <div
              onClick={() => toggle(sec.id)}
              data-deck-section={sec.id}
              className={`py-1 px-1.5 flex items-center gap-1.5 rounded hover:bg-slate-100 cursor-pointer select-none font-medium ${
                chosen.has(sec.id) ? "text-slate-800" : "text-slate-400"
              }`}
              title={sec.snippet}
            >
              {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
              <input
                type="checkbox"
                checked={chosen.has(sec.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => toggleSection(sec.id, e.target.checked)}
                title="체크한 섹션만 AI Composer · 채우기가 근거로 씁니다"
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5 shrink-0"
              />
              <span className="truncate">{sec.title}</span>
              {(sec.children ?? []).some((c) => focusCards.has(c.id)) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="초점 근거 카드가 있음" />
              )}
              <span className="ml-auto text-[10px] text-slate-400 shrink-0">{sec.children?.length ?? 0}</span>
            </div>
            {isOpen && (
              <div className="ml-3 pl-2 border-l border-slate-200 space-y-px my-0.5">
                {(sec.children ?? []).map((card) => {
                  const active = preview?.deckId === deck.id && preview.cardId === card.id;
                  const focused = focusCards.has(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      data-deck-card={`${deck.id}:${card.id}`}
                      onClick={() => openCardPreview(deck.id, card.id)}
                      onMouseEnter={() => useEvidenceFocusStore.getState().setHighlightedSlots(slotsUsingCard(deck.id, card.id))}
                      onMouseLeave={() => useEvidenceFocusStore.getState().clearHighlightedSlots()}
                      title={focused ? "지금 고른 칸의 근거 카드" : undefined}
                      className={`w-full text-left py-0.5 px-1.5 rounded truncate text-[11px] cursor-pointer ${
                        active
                          ? "bg-violet-100 text-violet-800 font-semibold"
                          : focused
                          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {card.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** 파일별 진행 — 서버가 준 목록, 없으면(예전 덱) 원본 경로로 만든다. */
function deckFiles(deck: KnowledgeDeck): DeckFileProgress[] {
  if (deck.files?.length) return deck.files;
  const ready = deck.status === "ready";
  return deck.sourcePaths.map((path) => ({
    path,
    title: path.split(/[\\/]/).filter(Boolean).pop() || path,
    segments: 0,
    done: 0,
    status: ready ? "done" : "pending",
  }));
}

/** 덱 전체 진행 = 파일별 처리 조각 합 / 전체 조각 합 (파일 목록의 %와 같은 기준). 조각 수를 모르면 null. */
function deckFilesPercent(files: DeckFileProgress[]): number | null {
  const counted = files.filter((f) => f.status !== "skipped" && f.segments > 0);
  const total = counted.reduce((n, f) => n + f.segments, 0);
  if (!total) return null;
  return Math.round((counted.reduce((n, f) => n + Math.min(f.done, f.segments), 0) / total) * 100);
}

const DeckFocusBadge: React.FC<{ deckId: string }> = ({ deckId }) => {
  const n = useEvidenceFocusStore((s) => s.focusCards[deckId]?.length ?? 0);
  if (!n) return null;
  return (
    <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800 shrink-0" title="지금 고른 칸이 이 덱의 카드를 근거로 씁니다">
      초점 {n}
    </span>
  );
};

const StatusBadge: React.FC<{ deck: KnowledgeDeck }> = ({ deck }) => {
  // 색인 중에는 배지를 두지 않는다 — 진행은 막대와 파일별 목록(파일 n/N 완료)이 보여 준다
  if (isDeckBusy(deck)) return null;
  if (deck.status === "failed") return <span className="text-[10px] font-bold px-1.5 rounded bg-rose-100 text-rose-700 shrink-0">실패</span>;
  if (deck.status === "cancelled") return <span className="text-[10px] font-bold px-1.5 rounded bg-slate-200 text-slate-600 shrink-0">취소됨</span>;
  if (!deck.builtAt) {
    // 예전 방식(목차만)으로 만든 덱 · Import 한 덱 — 카드 · 원문 본체가 없어 Composer 도구를 쓸 수 없다
    return (
      <span className="text-[10px] font-bold px-1.5 rounded bg-amber-100 text-amber-800 shrink-0" title="카드 · 원문 본체가 없습니다. ↻ 로 재색인하세요">
        재색인 필요
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-1.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
      {deck.depth === "enriched" ? "AI 색인" : "구조 색인"}
    </span>
  );
};

export const RmKnowledgeDeckSection: React.FC = () => {
  const selectDeckSections = useKnowledgeDeckStore((s) => s.selectDeckSections);
  const activeProject = useProjectStore(selectActiveProject);
  const projectId = activeProject?.projectId || "default_project";

  const decks = useKnowledgeDeckStore((s) => s.decks);
  const loadDecks = useKnowledgeDeckStore((s) => s.loadDecks);
  const toggleDeckChoice = useKnowledgeDeckStore((s) => s.toggleDeckChoice);
  const toggleAllDecksChoice = useKnowledgeDeckStore((s) => s.toggleAllDecksChoice);
  const deleteDeck = useKnowledgeDeckStore((s) => s.deleteDeck);
  const reindexDeck = useKnowledgeDeckStore((s) => s.reindexDeck);
  const cancelIndexing = useKnowledgeDeckStore((s) => s.cancelIndexing);
  const filterKeyword = useKnowledgeDeckStore((s) => s.filterKeyword);
  const setFilterKeyword = useKnowledgeDeckStore((s) => s.setFilterKeyword);
  const sortBy = useKnowledgeDeckStore((s) => s.sortBy);
  const setSortBy = useKnowledgeDeckStore((s) => s.setSortBy);
  const storeError = useKnowledgeDeckStore((s) => s.error);

  const [isSectionOpen, setIsSectionOpen] = useState(() => {
    try {
      const stored = sessionStorage.getItem("vdoc:rm_knowledge_deck_open");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });
  const [expandedDeckIds, setExpandedDeckIds] = useState<Set<string>>(new Set());
  // 파일 목록 펼침: 사람이 누른 것만 기억 — 기본은 "여러 파일 덱을 색인 중이면 펼침"
  const [fileToggles, setFileToggles] = useState<Record<string, boolean>>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    void loadDecks(projectId);
  }, [projectId, loadDecks]);

  const handleToggleSection = () => {
    setIsSectionOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("vdoc:rm_knowledge_deck_open", String(next));
      } catch {
        /* 저장소를 못 쓰면 이번 세션만 */
      }
      return next;
    });
  };

  const toggleExpanded = (deckId: string) =>
    setExpandedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });

  const checkedDecks = decks.filter((d) => d.isChecked);
  const allChecked = decks.length > 0 && decks.every((d) => d.isChecked);

  const filteredDecks = decks
    .filter((d) => {
      if (!filterKeyword.trim()) return true;
      const kw = filterKeyword.toLowerCase();
      return (
        d.title.toLowerCase().includes(kw) ||
        d.tags.some((t) => t.toLowerCase().includes(kw)) ||
        d.topics.some((t) => t.title.toLowerCase().includes(kw) || (t.children ?? []).some((c) => c.title.toLowerCase().includes(kw)))
      );
    })
    .sort((a, b) => {
      if (sortBy === "topics") return (b.stat.cardsCount ?? b.stat.topicsCount) - (a.stat.cardsCount ?? a.stat.topicsCount);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return b.updatedAt - a.updatedAt;
    });

  return (
    <div className="border-t border-slate-200 bg-white flex flex-col shrink-0">
      <div
        onClick={handleToggleSection}
        className="px-3 py-2 bg-gradient-to-r from-violet-50/70 to-indigo-50/50 hover:from-violet-100/70 hover:to-indigo-100/60 border-b border-violet-100/80 flex items-center justify-between cursor-pointer transition select-none"
      >
        <div className="flex items-center gap-1.5">
          {isSectionOpen ? <ChevronDown className="w-4 h-4 text-violet-700" /> : <ChevronRight className="w-4 h-4 text-violet-700" />}
          <Sparkles className="w-3.5 h-3.5 text-violet-600 fill-violet-200" />
          <span className="text-xs font-bold text-violet-900 tracking-tight">Knowledge Deck (구조화 지식 덱)</span>
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-200/80 text-violet-800">
          {checkedDecks.length}/{decks.length}
        </span>
      </div>

      {isSectionOpen && (
        <div className="flex flex-col">
          <div className="px-3 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer" title="체크한 덱은 AI Composer 대화에 자동으로 첨부됩니다">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => void toggleAllDecksChoice(projectId, e.target.checked)}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5"
                />
                <span>전체 선택</span>
              </label>
              <div className="w-[1px] h-3 bg-slate-200 mx-0.5" />
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white border border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300 text-slate-700 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                title="외부에서 사전 구축된 지식 덱(.deck.json) 불러오기"
              >
                <Download className="w-3 h-3 text-violet-600" />
                <span>덱 Import</span>
              </button>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "latest" | "topics" | "title")}
              className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer"
            >
              <option value="latest">최근 색인순</option>
              <option value="topics">카드 많은순</option>
              <option value="title">이름순</option>
            </select>
          </div>

          <div className="px-3 py-1 border-b border-slate-100 flex items-center gap-1.5">
            <Search className="w-3 h-3 text-slate-400 shrink-0" />
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="지식 덱 · 섹션 · 카드 검색..."
              className="w-full text-[11px] placeholder:text-slate-400 focus:outline-none bg-transparent"
            />
          </div>

          {storeError && (
            <div className="mx-2 mt-2 px-2 py-1 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="truncate">{storeError}</span>
            </div>
          )}

          <div className="p-2 space-y-2 max-h-[360px] overflow-y-auto">
            {filteredDecks.length === 0 ? (
              <div className="py-6 px-3 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 space-y-1.5">
                <Database className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">등록된 구조화 지식 덱이 없습니다.</p>
                <p className="text-[11px] text-slate-400 max-w-[260px] mx-auto leading-relaxed">
                  위의 <strong>Raw Resource Explorer</strong>에서 문서를 선택해 <strong>[⚡ 지식 덱 승격]</strong>하면
                  서버가 뒤에서 색인합니다. 진행률은 여기 실시간으로 표시됩니다.
                </p>
              </div>
            ) : (
              filteredDecks.map((deck) => {
                const isExpanded = expandedDeckIds.has(deck.id);
                const busy = isDeckBusy(deck);
                const files = deckFiles(deck);
                const fileSum = deckFileSummary(files);
                const filesOpen = fileToggles[deck.id] ?? (busy && files.length > 1);
                const partial = deck.isChecked && (deck.selectedSections?.length ?? 0) > 0;
                const failing = deck.quality?.failing ?? [];
                return (
                  <div
                    key={deck.id}
                    data-testid="knowledge-deck-card"
                    draggable={deck.status === "ready"}
                    onDragStart={(e) => writeContextDrag(e.dataTransfer, [deckContextRef(deck)])}
                    onMouseEnter={() => useEvidenceFocusStore.getState().setHighlightedSlots(slotsUsingCard(deck.id))}
                    onMouseLeave={() => useEvidenceFocusStore.getState().clearHighlightedSlots()}
                    className={`rounded-lg border transition ${
                      deck.isChecked ? "bg-violet-50/30 border-violet-200 hover:border-violet-300" : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="p-2.5 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={deck.isChecked}
                          data-testid="deck-choice"
                          ref={(el) => {
                            // 섹션 일부만 골랐으면 "일부" 표시
                            if (el) el.indeterminate = partial;
                          }}
                          onChange={(e) => {
                            // 일부만 고른 상태에서 누르면 전부 고르기
                            if (partial) void selectDeckSections(projectId, deck.id, null);
                            else void toggleDeckChoice(projectId, deck.id, e.target.checked);
                          }}
                          title={partial ? `섹션 ${deck.selectedSections?.length}/${deck.topics.length} 만 사용 중 — 누르면 전부 사용` : "체크하면 AI Composer 가 이 덱을 근거로 탐색합니다"}
                          className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer w-3.5 h-3.5 mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800 truncate" title={deck.sourcePaths.join("\n")}>
                              {deck.title}
                            </span>
                            <StatusBadge deck={deck} />
                            <DeckFocusBadge deckId={deck.id} />
                          </div>
                          {busy && (
                            <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${Math.max(3, deckFilesPercent(files) ?? deck.progress)}%` }} />
                            </div>
                          )}
                          {deck.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {deck.tags.map((tag) => (
                                <span key={tag} className="text-[9px] font-medium px-1 rounded bg-slate-100 text-slate-600">#{tag}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2.5 mt-1.5 text-[10px] text-slate-500 font-medium flex-wrap">
                            <span className="flex items-center gap-1" title="섹션 · 카드">
                              <BookOpen className="w-3 h-3 text-violet-500" />
                              {deck.stat.sectionsCount ?? 0}섹션 · {deck.stat.cardsCount ?? deck.stat.topicsCount}카드
                            </span>
                            {partial && (
                              <span className="px-1 rounded bg-violet-100 text-violet-800 font-bold" title="펼쳐서 섹션 체크박스로 고릅니다">
                                {deck.selectedSections?.length}/{deck.topics.length} 섹션 사용
                              </span>
                            )}
                            {deck.stat.tablesCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Table className="w-3 h-3 text-blue-500" />표 {deck.stat.tablesCount}
                              </span>
                            )}
                            {(deck.stat.figuresCount ?? 0) > 0 && (
                              <span className="flex items-center gap-1">
                                <ImageIcon className="w-3 h-3 text-teal-500" />그림 {deck.stat.figuresCount}
                              </span>
                            )}
                            <button
                              type="button"
                              data-testid="deck-files-toggle"
                              onClick={() => setFileToggles((t) => ({ ...t, [deck.id]: !filesOpen }))}
                              className={`flex items-center gap-1 px-1 -mx-1 rounded cursor-pointer hover:bg-slate-100 ${
                                fileSum.total > 0 && fileSum.done === fileSum.total ? "text-emerald-700" : busy ? "text-violet-700" : ""
                              }`}
                              title={filesOpen ? "원본 파일 목록 접기" : "원본 파일별 진행 보기"}
                            >
                              {filesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <FileText className="w-3 h-3 text-slate-400" />
                              {busy || fileSum.total > 1 ? `파일 ${fileSum.done}/${fileSum.total} 완료` : `파일 ${fileSum.total}`}
                              {fileSum.skipped > 0 && <span className="text-amber-600">· 건너뜀 {fileSum.skipped}</span>}
                            </button>
                            {deck.status === "ready" && deck.builtAt && deck.quality?.metrics && (
                              <span
                                className={`flex items-center gap-1 ${failing.length ? "text-amber-600" : "text-emerald-600"}`}
                                title={failing.length ? `미달 게이트: ${failing.join(", ")}` : "품질 게이트 모두 통과"}
                              >
                                <ShieldCheck className="w-3 h-3" />
                                {failing.length ? `품질 ${failing.length}개 미달` : "품질 통과"}
                              </span>
                            )}
                          </div>
                          {filesOpen && files.length > 0 && (
                            <div className="mt-1.5 -ml-0.5">
                              <DeckFileProgressList files={files} />
                            </div>
                          )}
                          {deck.error && <p className="mt-1 text-[10px] text-rose-600 line-clamp-2">{deck.error}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {busy ? (
                          <button
                            type="button"
                            onClick={() => void cancelIndexing(deck.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="색인 취소"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void reindexDeck(projectId, deck.id)}
                            className="p-1 rounded text-slate-400 hover:text-violet-700 hover:bg-violet-50 cursor-pointer"
                            title="원본을 다시 읽어 재색인 (바뀐 조각만 AI 를 다시 부릅니다)"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleExpanded(deck.id)}
                          disabled={deck.topics.length === 0}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer disabled:opacity-30"
                          title={isExpanded ? "섹션 · 카드 접기" : "섹션 · 카드 펼치기"}
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-violet-600" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`'${deck.title}' 지식 덱을 삭제하시겠습니까? (원본 파일은 그대로 남습니다)`)) {
                              void deleteDeck(projectId, deck.id);
                            }
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="지식 덱 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && deck.topics.length > 0 && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-2 rounded-b-lg">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1 px-1">
                          <span>섹션 → 카드 (원문 순서)</span>
                          <span className="text-slate-400">{deck.topics.length}개 섹션</span>
                        </div>
                        <DeckOutline deck={deck} projectId={projectId} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <ImportDeckModal projectId={projectId} isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
    </div>
  );
};
