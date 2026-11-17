import React, { memo, useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  buildChanges,
  formatPageNos,
  selectActiveDocument,
  slotBlockIndex,
  slotLocations,
  summarizeChanges,
  useStudioDocumentStore,
  type SlotBlock,
  type SlotLocation,
} from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";
import { changeSnippet } from "@/shared/lib";
import { CharStatText, RedlineSegments } from "@/shared/ui";

import { authorLabel, buildHistory, dayLabel, timeRange, type EditSession } from "../model/history";
import { useRevisions } from "../model/useRevisions";

type Filter = "all" | "ai";
const FILTER_LABEL: Record<Filter, string> = { all: "전체", ai: "AI만" };

/** "dc_build" 같은 내부 이름은 글쓴이에게 뜻이 없으니 메모로 보이지 않는다. */
const readableNote = (note?: string) => (note && !/^[\w.:-]+$/.test(note) ? note : undefined);

const SessionRow = memo<{
  session: EditSession;
  where: Map<string, SlotLocation>;
  blocks: Map<string, SlotBlock>;
  active: boolean;
  onOpen: (s: EditSession) => void;
}>(function SessionRow({ session, where, blocks, active, onOpen }) {
  const items = useMemo(
    () => buildChanges(null, where, { slotIds: session.slotIds, before: session.before, after: session.after, labels: session.labels }),
    [session, where],
  );
  const summary = useMemo(() => summarizeChanges(items), [items]);
  const first = items.find((i) => !i.formatOnly);
  // 블록 단위로 센다 (표의 칸 여러 개 = 블록 하나). 지금 문서에 없는 칸은 지운 블록.
  const blockCount = useMemo(() => new Set(items.map((i) => blocks.get(i.slotId)?.blockId).filter(Boolean)).size, [items, blocks]);
  const goneCount = items.filter((i) => !blocks.has(i.slotId)).length;
  const snippet = useMemo(() => (first ? changeSnippet(first.paras, 10) : []), [first]);
  // 글이 바뀌지 않은 저장(변수 · 서식만)은 글쓴이에게 기록할 거리가 아니다.
  if (!first) return null;
  const note = readableNote(session.note);

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      data-testid="history-session"
      data-rev={session.toRev}
      className={`relative w-full text-left pl-7 pr-2 py-1.5 rounded-[6px] ${active ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"}`}
    >
      <span
        aria-hidden
        className="absolute left-[11px] top-[11px] w-[9px] h-[9px] rounded-full border-2 bg-white"
        style={{ borderColor: session.author === "ai" ? "var(--fig-component)" : "var(--fig-brand)" }}
      />
      <span className="flex items-center gap-1.5 text-[12px]">
        <span className="font-medium text-black/85 tabular-nums">{timeRange(session.start, session.end)}</span>
        <span className={session.author === "ai" ? "text-[var(--fig-component)]" : "text-black/45"}>{authorLabel(session)}</span>
        <CharStatText stat={summary.stat} className="ml-auto" />
      </span>
      <span className="block text-[11.5px] text-black/50 truncate">
        {[summary.pageNos.length ? formatPageNos(summary.pageNos) : "", blockCount ? `블록 ${blockCount}개` : "", goneCount ? "지금은 지운 블록 포함" : ""]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {note ? (
        <span className="block text-[11.5px] text-black/60 truncate">{note}</span>
      ) : (
        <span className="block text-[11.5px] leading-[18px] text-black/60 truncate" data-testid="history-snippet">
          <RedlineSegments segs={snippet} />
        </span>
      )}
    </button>
  );
});

/**
 * 세부 편집 기록 — 버전 사이에 무엇을 어디서 고쳤는지 (자동 저장을 편집 세션으로 묶고, AI 는 실행마다).
 * 누르면 그때 고친 곳을 가운데에서 보고, 곳마다 그때 이전 글로 되돌릴 수 있다. 글이 안 바뀐 저장은 뺀다.
 */
export const DocumentHistoryList: React.FC<{ docId: string | undefined }> = ({ docId }) => {
  // 글자 입력마다 다시 그리지 않게 쪽 구조만 구독한다.
  const pages = useStudioDocumentStore((s) => selectActiveDocument(s)?.pages);
  const { entries, error, loading, reload } = useRevisions(docId, { limit: 200 });
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const [filter, setFilter] = useState<Filter>("all");

  const where = useMemo(
    () => slotLocations(pages ?? [], selectActiveDocument(useStudioDocumentStore.getState())?.slots ?? {}),
    [pages],
  );
  const blocks = useMemo(
    () => slotBlockIndex(pages ? { pages, slots: selectActiveDocument(useStudioDocumentStore.getState())?.slots ?? {} } : null),
    [pages],
  );
  const history = useMemo(() => buildHistory(entries), [entries]);
  const shown = filter === "ai" ? history.filter((h) => h.author === "ai") : history;
  const days: { label: string; items: EditSession[] }[] = [];
  for (const h of shown) {
    const label = dayLabel(h.end);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(h);
    else days.push({ label, items: [h] });
  }

  const openSession = useCallback(
    (s: EditSession) =>
      openDiff({
        type: "revision",
        revisionRev: s.toRev,
        label: `${dayLabel(s.end)} ${timeRange(s.start, s.end)} · ${authorLabel(s)}`,
        beforeSlots: s.before,
        afterSlots: s.after,
        changedSlotIds: s.slotIds,
        slotLabels: s.labels,
        meta: { author: s.author, authorName: authorLabel(s), at: s.end, note: readableNote(s.note) },
        revertible: true,
      }),
    [openDiff],
  );

  if (!docId) return null;
  return (
    <div data-testid="document-history">
      <div className="h-7 flex items-center gap-1.5">
        <div className="fig-seg w-[100px]" role="group" aria-label="기록 거르기">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`history-filter-${f}`}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void reload()} className="fig-icon-btn ml-auto !w-6 !h-6" title="새로고침">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      {!error && shown.length === 0 && <p className="py-2 text-[11.5px] text-black/45">아직 기록이 없습니다.</p>}
      {days.map((d) => (
        <section key={d.label} className="relative">
          <div className="sticky top-0 z-[1] bg-white h-7 flex items-center text-[11px] font-semibold text-black/45">{d.label}</div>
          <span aria-hidden className="absolute left-[15px] top-7 bottom-1 w-px bg-black/10" />
          <div className="space-y-0.5">
            {d.items.map((h) => (
              <SessionRow
                key={h.id}
                session={h}
                where={where}
                blocks={blocks}
                active={activeDiff?.type === "revision" && !activeDiff.version && activeDiff.revisionRev === h.toRev}
                onOpen={openSession}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
