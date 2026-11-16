import React, { memo, useCallback, useMemo, useState } from "react";
import { Bookmark, Pencil, RefreshCw, X } from "lucide-react";

import type { VDocNamedVersion } from "@vibe/vdoc-schema";

import {
  buildChanges,
  formatPageNos,
  selectActiveDocument,
  slotLocations,
  summarizeChanges,
  useStudioDocumentStore,
  type SlotLocation,
} from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";
import { changeSnippet } from "@/shared/lib";
import { CharStatText, RedlineSegments } from "@/shared/ui";

import { authorLabel, buildHistory, changesSince, dayLabel, timeLabel, timeRange, type EditSession, type HistoryItem } from "../model/history";
import { updateNamedVersion } from "../model/namedVersions";
import { useRevisions } from "../model/useRevisions";

type Filter = "all" | "versions" | "ai";
const FILTER_LABEL: Record<Filter, string> = { all: "전체", versions: "버전", ai: "AI" };

const SessionRow = memo<{ session: EditSession; where: Map<string, SlotLocation>; active: boolean; onOpen: (s: EditSession) => void }>(function SessionRow({
  session,
  where,
  active,
  onOpen,
}) {
  const items = useMemo(
    () => buildChanges(null, where, { slotIds: session.slotIds, before: session.before, after: session.after, labels: session.labels }),
    [session, where],
  );
  const summary = useMemo(() => summarizeChanges(items), [items]);
  const first = items.find((i) => !i.formatOnly);
  const snippet = useMemo(() => (first ? changeSnippet(first.paras, 10) : []), [first]);
  const formatOnly = items.length > 0 && !first;
  const empty = items.length === 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      data-testid="history-session"
      data-rev={session.toRev}
      className={`relative w-full text-left pl-7 pr-2 py-1.5 rounded-[6px] ${active ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"} ${
        formatOnly || empty ? "opacity-60" : ""
      }`}
    >
      <span
        aria-hidden
        className="absolute left-[11px] top-[11px] w-[9px] h-[9px] rounded-full border-2 bg-white"
        style={{ borderColor: session.author === "ai" ? "var(--fig-component)" : "var(--fig-brand)" }}
      />
      <span className="flex items-center gap-1.5 text-[12px]">
        <span className="font-medium text-black/85 tabular-nums">{timeRange(session.start, session.end)}</span>
        <span className={session.author === "ai" ? "text-[var(--fig-component)]" : "text-black/45"}>{authorLabel(session)}</span>
        {!empty && !formatOnly && <CharStatText stat={summary.stat} className="ml-auto" />}
      </span>
      <span className="block text-[11.5px] text-black/50 truncate">
        {empty
          ? "변수만 바뀜"
          : formatOnly
            ? `서식만 바뀜 · ${summary.places}곳`
            : `${summary.places}곳${summary.pageNos.length ? ` · ${formatPageNos(summary.pageNos)}` : " · 지금 문서에 없는 칸"}`}
      </span>
      {session.note ? (
        <span className="block text-[11.5px] text-black/60 truncate">{session.note}</span>
      ) : (
        snippet.length > 0 && (
          <span className="block text-[11.5px] leading-[18px] text-black/60 truncate" data-testid="history-snippet">
            <RedlineSegments segs={snippet} />
          </span>
        )
      )}
    </button>
  );
});

const VersionRow = memo<{ docId: string; version: VDocNamedVersion; active: boolean; onOpen: (v: VDocNamedVersion) => void }>(function VersionRow({
  docId,
  version,
  active,
  onOpen,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(version.name);
  if (editing) {
    return (
      <form
        className="pl-7 pr-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          updateNamedVersion(docId, version.id, { name: name.trim() || version.name });
          setEditing(false);
        }}
      >
        <label className="fig-input !h-7">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setEditing(false)} aria-label="버전 이름" />
        </label>
      </form>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(version)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(version)}
      data-testid="history-version"
      className={`group relative pl-7 pr-1.5 py-1.5 rounded-[6px] cursor-pointer ${active ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"}`}
      title="이 버전 이후 바뀐 것 보기"
    >
      <Bookmark aria-hidden className="absolute left-[8px] top-[8px] w-[15px] h-[15px] text-[var(--fig-brand)] fill-[var(--fig-brand)]" />
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-[12.5px] text-black/90 truncate">{version.name}</span>
        <span className="text-[11.5px] text-black/45 shrink-0">{timeLabel(version.at)}</span>
        <span className="ml-auto hidden group-hover:flex items-center">
          <button
            type="button"
            className="fig-icon-btn !w-5 !h-5"
            title="이름 바꾸기"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="fig-icon-btn !w-5 !h-5"
            title="버전 표시 지우기 (기록은 남는다)"
            onClick={(e) => {
              e.stopPropagation();
              updateNamedVersion(docId, version.id, null);
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      </div>
      {version.note && <p className="text-[11.5px] text-black/55 line-clamp-2 whitespace-pre-wrap">{version.note}</p>}
    </div>
  );
});

/**
 * 문서 기록 — 구글 문서 "버전 기록"처럼 날짜별로, 자동 저장은 편집 세션으로 묶고 이름 붙인 버전을 굵게.
 * 세션을 누르면 그때 바뀐 곳을, 버전을 누르면 그 버전 이후 바뀐 것을 가운데 검토 화면에 띄운다.
 */
export const DocumentHistoryList: React.FC<{ docId: string | undefined }> = ({ docId }) => {
  // 글자 입력마다 다시 그리지 않게 쪽 구조 · 버전 목록만 구독한다.
  const pages = useStudioDocumentStore((s) => selectActiveDocument(s)?.pages);
  const versions = useStudioDocumentStore((s) => selectActiveDocument(s)?.versions);
  const { entries, error, loading, reload } = useRevisions(docId, { limit: 200 });
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const [filter, setFilter] = useState<Filter>("all");

  // 위치(쪽 · 제목)는 문서 구조가 바뀔 때만 다시 센다.
  const where = useMemo(
    () => slotLocations(pages ?? [], (selectActiveDocument(useStudioDocumentStore.getState())?.slots) ?? {}),
    [pages],
  );
  const history = useMemo(() => buildHistory(entries, versions ?? []), [entries, versions]);

  const shown = history.filter((h) =>
    filter === "all" ? true : filter === "versions" ? h.type === "version" : h.type === "session" && h.author === "ai",
  );
  const days: { label: string; items: HistoryItem[] }[] = [];
  for (const h of shown) {
    const label = dayLabel(h.type === "version" ? h.version.at : h.end);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(h);
    else days.push({ label, items: [h] });
  }

  const openSession = useCallback((s: EditSession) =>
    openDiff({
      type: "revision",
      revisionRev: s.toRev,
      label: `${dayLabel(s.end)} ${timeRange(s.start, s.end)} · ${authorLabel(s)}`,
      beforeSlots: s.before,
      afterSlots: s.after,
      changedSlotIds: s.slotIds,
      slotLabels: s.labels,
      meta: { author: s.author, authorName: authorLabel(s), at: s.end, note: s.note },
      revertible: true,
    }), [openDiff]);

  const openVersion = useCallback((v: VDocNamedVersion) => {
    const since = changesSince(entries, v.rev);
    openDiff({
      type: "revision",
      diffId: `since-${v.id}`,
      label: `'${v.name}' 이후 바뀐 것`,
      beforeSlots: since.before,
      afterSlots: since.after,
      changedSlotIds: since.slotIds,
      slotLabels: since.labels,
      meta: { at: v.at, note: v.note },
      revertible: true,
    });
  }, [entries, openDiff]);

  if (!docId) return null;
  return (
    <div data-testid="document-history">
      <div className="h-8 flex items-center gap-1.5">
        <span className="text-[12px] font-semibold">기록</span>
        <div className="fig-seg ml-auto w-[132px]" role="group" aria-label="기록 거르기">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`history-filter-${f}`}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void reload()} className="fig-icon-btn !w-6 !h-6" title="새로고침">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      {!error && shown.length === 0 && (
        <p className="py-3 text-[11.5px] text-black/45">
          {filter === "versions" ? "이름 붙인 버전이 없습니다. 위의 '버전 저장'으로 제출본 같은 기준점을 남겨 두세요." : "아직 기록이 없습니다."}
        </p>
      )}
      {days.map((d) => (
        <section key={d.label} className="relative">
          <div className="sticky top-0 z-[1] bg-white h-7 flex items-center text-[11px] font-semibold text-black/45">{d.label}</div>
          {/* 세로 선 */}
          <span aria-hidden className="absolute left-[15px] top-7 bottom-1 w-px bg-black/10" />
          <div className="space-y-0.5">
            {d.items.map((h) =>
              h.type === "version" ? (
                <VersionRow
                  key={h.version.id}
                  docId={docId}
                  version={h.version}
                  active={activeDiff?.diffId === `since-${h.version.id}`}
                  onOpen={openVersion}
                />
              ) : (
                <SessionRow
                  key={h.id}
                  session={h}
                  where={where}
                  active={activeDiff?.type === "revision" && !activeDiff.diffId && activeDiff.revisionRev === h.toRev}
                  onOpen={openSession}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
};
