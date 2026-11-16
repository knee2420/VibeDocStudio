import React, { useMemo } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";

import type { RevisionEntry } from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";
import { changeSnippet, diffParagraphs, paraStat, sumStats } from "@/shared/lib";
import { CharStatText, RedlineSegments } from "@/shared/ui";

import { authorLabel, dayLabel, timeLabel } from "../model/history";
import { restoreSlots, useRevisions } from "../model/useRevisions";

const EntryRow: React.FC<{ entry: RevisionEntry; docId: string; slotId?: string }> = ({ entry, docId, slotId }) => {
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const slots = slotId ? entry.slots.filter((s) => s.slotId === slotId) : entry.slots;
  const paras = useMemo(() => slots.map((s) => diffParagraphs(s.before, s.after)), [slots]);
  const stat = sumStats(paras.map(paraStat));
  const snippet = useMemo(() => changeSnippet(paras.find((p) => p.some((x) => x.kind !== "same")) ?? [], 10), [paras]);
  const active = activeDiff?.type === "revision" && activeDiff.revisionRev === entry.rev && !activeDiff.diffId;
  const who = authorLabel(entry);

  const open = () =>
    openDiff({
      type: "revision",
      revisionRev: entry.rev,
      slotId,
      label: `${dayLabel(entry.at)} ${timeLabel(entry.at)} · ${who}`,
      beforeSlots: Object.fromEntries(slots.map((s) => [s.slotId, s.before])),
      afterSlots: Object.fromEntries(slots.map((s) => [s.slotId, s.after])),
      changedSlotIds: slots.map((s) => s.slotId),
      slotLabels: Object.fromEntries(slots.map((s) => [s.slotId, s.label])),
      meta: { author: entry.author, authorName: who, at: entry.at },
      revertible: true,
    });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      data-testid="revision-entry"
      className={`group relative pl-6 pr-1.5 py-1 rounded-[6px] cursor-pointer ${active ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"}`}
    >
      <span
        aria-hidden
        className="absolute left-[7px] top-[9px] w-[9px] h-[9px] rounded-full border-2 bg-white"
        style={{ borderColor: entry.author === "ai" ? "var(--fig-component)" : "var(--fig-brand)" }}
      />
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span className="text-black/75 tabular-nums">
          {dayLabel(entry.at)} {timeLabel(entry.at)}
        </span>
        <span className={entry.author === "ai" ? "text-[var(--fig-component)]" : "text-black/45"}>{who}</span>
        <CharStatText stat={stat} className="ml-auto group-hover:hidden" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            restoreSlots(docId, slots.map((s) => ({ slotId: s.slotId, before: s.before })), `${timeLabel(entry.at)} 이전 글로 되돌리기`);
          }}
          className="ml-auto hidden group-hover:inline-flex items-center gap-0.5 h-5 px-1.5 rounded-[4px] text-[11px] text-black/70 hover:bg-black/5"
          title="이 변경 이전 글로 되돌립니다 (새 변경으로 남아 실행 취소 가능)"
        >
          <RotateCcw className="w-3 h-3" /> 복원
        </button>
      </div>
      {snippet.length > 0 ? (
        <div className="text-[11.5px] leading-[18px] text-black/60 truncate">
          <RedlineSegments segs={snippet} />
        </div>
      ) : (
        <div className="text-[11px] text-black/40">서식만 바뀜</div>
      )}
    </div>
  );
};

export interface RevisionTimelineProps {
  docId: string | undefined;
  /** 주면 그 칸의 기록만 (인스펙터의 "누가 썼나") */
  slotId?: string;
  limit?: number;
  title?: string;
}

/** 칸 · 문서의 저장 기록 — 언제 · 누가 · 무엇을 (빨강 취소선 · 초록 밑줄), 눌러 검토, 복원. */
export const RevisionTimeline: React.FC<RevisionTimelineProps> = ({ docId, slotId, limit, title = "개정 이력" }) => {
  const { entries, error, loading, reload } = useRevisions(docId, { slotId, limit });
  if (!docId) return null;
  return (
    <div data-testid={slotId ? "slot-revision-timeline" : "revision-timeline"}>
      <div className="h-7 flex items-center gap-1">
        <span className="text-[11px] font-semibold">{title}</span>
        <span className="text-[11px] text-[var(--fig-text-tertiary)]">{entries.length}</span>
        <button type="button" onClick={() => void reload()} className="fig-icon-btn ml-auto !w-5 !h-5" title="새로고침">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      {!error && entries.length === 0 && (
        <p className="text-[11px] text-[var(--fig-text-tertiary)]">아직 기록이 없습니다. 저장되면 바뀐 글이 작성자와 함께 남습니다.</p>
      )}
      <div className="relative">
        {entries.length > 1 && <span aria-hidden className="absolute left-[11px] top-3 bottom-3 w-px bg-black/10" />}
        {entries.map((entry) => (
          <EntryRow key={`${entry.rev}-${entry.at}`} entry={entry} docId={docId} slotId={slotId} />
        ))}
      </div>
    </div>
  );
};
