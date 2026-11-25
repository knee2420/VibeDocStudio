import React, { useState } from "react";
import { Bookmark, ChevronDown, ChevronRight, FileDiff, FileText, LocateFixed, RotateCcw, Undo2 } from "lucide-react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import {
  addCounts,
  blockChangeDetail,
  BlockCountBadge,
  formatBlockCounts,
  pageTitle,
  type BlockChangeKind,
  type DocumentVersion,
} from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useActiveDiffStore } from "@/features/document-diff";
import {
  dayLabel,
  openVersionCompare,
  restorePageFromVersion,
  restoreSlots,
  SaveVersionForm,
  timeLabel,
} from "@/features/document-revisions";
import { changeSnippet, scrollToCanvasPage } from "@/shared/lib";
import { RedlineSegments } from "@/shared/ui";

import { FigmaDiffBadge } from "../FigmaDiffBadge";
import { useWorkingChanges, type WorkingKind, type WorkingPage } from "./useWorkingChanges";

const ICON_COLOR: Record<WorkingKind, string> = { added: "#2da44e", edited: "#f97316", deleted: "#cf222e" };
/** 블록 줄 앞 표시 — 쪽의 U/M/D 와 같은 색 규칙 (옮김은 회색). */
const BLOCK_MARK: Record<BlockChangeKind, string> = { added: "+", removed: "−", edited: "✎", moved: "↕" };
const BLOCK_COLOR: Record<BlockChangeKind, string> = { added: "#2da44e", removed: "#cf222e", edited: "#f97316", moved: "rgba(0,0,0,0.45)" };

/** 줄에 올렸을 때만 보이는 작은 버튼 (VS Code 변경 목록의 열기 · 되돌리기 자리). */
const RowAction: React.FC<{ title: string; onClick: () => void; testId?: string; children: React.ReactNode }> = ({ title, onClick, testId, children }) => (
  <button
    type="button"
    title={title}
    data-testid={testId}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="fig-icon-btn !w-5 !h-5"
  >
    {children}
  </button>
);

interface RowProps {
  doc: VDocDocument;
  p: WorkingPage;
  path: string;
  /** 비교 기준 버전과 그 문서 (없으면 버전 저장 전 — 칸의 처음 글 기준) */
  base: { version: DocumentVersion; doc: VDocDocument } | null;
  defaultOpen: boolean;
}

/**
 * Changes 한 줄 (VS Code 소스 제어처럼): 쪽 이름(상태 색) + 흐린 경로(프로젝트 › 문서) + 글자 수 + U/M/D.
 * 누르면 그 쪽을 기준 버전과 비교, 펼치면 바뀐 곳마다 제목 위치 + 빨강/초록 한 줄.
 */
const ChangeRow: React.FC<RowProps> = ({ doc, p, path, base, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const title = pageTitle({ pageNo: p.pageNo, pageLabel: p.page.pageLabel });
  const isActive = activeDiff?.pageId === p.page.pageId && (activeDiff?.type === "working" || Boolean(base && activeDiff?.version?.id === base.version.id));

  const review = (slotId?: string) => {
    if (base) {
      void openVersionCompare(doc.docId, base.version, { pageId: p.page.pageId, slotId });
      return;
    }
    openDiff({
      type: "working",
      diffKind: p.kind === "added" ? "added" : "edited",
      pageId: p.page.pageId,
      slotId,
      label: `${title} — 처음 연 뒤로 고친 것`,
      beforeSlots: p.before,
      afterSlots: p.after,
      changedSlotIds: p.slotIds,
      revertible: p.kind !== "added",
    });
  };

  // 되돌리기: 버전이 있으면 쪽 전체(구성 + 글)를 그 버전으로, 없으면 고친 글만 처음 글로.
  const revert = () => {
    if (base) restorePageFromVersion(doc.docId, base.doc, p.page.pageId, base.version.name);
    else restoreSlots(doc.docId, p.items.map((i) => ({ slotId: i.slotId, before: i.before })), `${title} 고친 것 되돌리기`);
    if (isActive) useActiveDiffStore.getState().closeDiff();
  };
  const canRevert = p.kind === "edited" || (p.kind === "deleted" && base);
  const revertTitle =
    p.kind === "deleted" ? `이 쪽을 '${base?.version.name}' 버전에서 되살리기` : base ? `이 쪽을 '${base.version.name}' 버전 모습으로 되돌리기` : "이 쪽에서 고친 글 되돌리기";

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        data-diff={p.kind}
        data-testid={p.kind === "deleted" ? "working-page-deleted" : "working-page"}
        onClick={() => review()}
        onKeyDown={(e) => e.key === "Enter" && review()}
        className={`fig-row group relative h-[26px] pl-0.5 pr-1 flex items-center gap-1 rounded-[5px] cursor-pointer ${
          isActive && !activeDiff?.slotId ? "bg-[var(--fig-selected)]" : "bg-white hover:bg-[var(--fig-hover)]"
        }`}
        title={`${path} › ${title}\n${formatBlockCounts(p.counts) || "쪽 이름 바뀜"} — 눌러서 비교`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="fig-icon-btn !w-4 !h-5 shrink-0"
          title={open ? "바뀐 곳 접기" : "바뀐 곳 펼치기"}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: ICON_COLOR[p.kind] }} />
        <span className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
          <span className="fig-row-label max-w-[65%] truncate text-[12px]" style={{ flex: "0 0 auto" }}>
            {title}
          </span>
          <span data-testid="change-location" className="min-w-0 truncate text-[11px] text-black/40">
            {path}
          </span>
        </span>
        <span className="absolute right-6 top-[3px] hidden group-hover:flex items-center rounded-[4px] pl-1 [background:inherit]">
          <RowAction title="비교해서 보기" onClick={() => review()}>
            <FileDiff className="w-3.5 h-3.5" />
          </RowAction>
          {p.kind !== "deleted" && (
            <RowAction
              title="문서에서 이 쪽 보기"
              onClick={() => {
                useActiveDiffStore.getState().closeDiff();
                scrollToCanvasPage(p.page.pageId);
              }}
            >
              <LocateFixed className="w-3.5 h-3.5" />
            </RowAction>
          )}
          {canRevert && (
            <RowAction title={revertTitle} testId={`discard-page-changes-${p.page.pageId}`} onClick={revert}>
              {p.kind === "deleted" ? <Undo2 className="w-3.5 h-3.5" /> : <RotateCcw className="w-3 h-3" />}
            </RowAction>
          )}
        </span>
        <BlockCountBadge counts={p.counts} chars={p.stat} className="!text-[10.5px]" />
        <FigmaDiffBadge diffState={{ kind: p.kind, isDirect: true }} className="w-3 text-center !ml-1" />
      </div>
      {open && (
        <div className="pl-[38px] pb-0.5">
          {p.blocks.map((b) => {
            const first = b.items.find((i) => !i.formatOnly);
            const snippet = first ? changeSnippet(first.paras, 10) : [];
            const on = isActive && Boolean(first) && activeDiff?.slotId === first?.slotId;
            return (
              <button
                key={`${b.kind}-${b.blockId}`}
                type="button"
                onClick={() => review(first?.slotId)}
                data-testid="working-block"
                data-kind={b.kind}
                className={`w-full text-left px-1.5 py-0.5 rounded-[5px] ${on ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"}`}
                title={`${b.kindLabel}${b.name ? ` · ${b.name}` : ""} — ${blockChangeDetail(b)}`}
              >
                <span className="flex items-center gap-1.5 text-[11px] min-w-0">
                  <span className="shrink-0 w-[13px] text-center font-mono font-bold" style={{ color: BLOCK_COLOR[b.kind] }}>
                    {BLOCK_MARK[b.kind]}
                  </span>
                  <span className="truncate text-black/70">
                    <span className="text-black/45">{b.kindLabel}</span>
                    {b.name ? ` · ${b.name}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-black/40">{blockChangeDetail(b)}</span>
                </span>
                {snippet.length > 0 && (
                  <span className={`block pl-[19px] text-[12px] leading-[18px] text-black/75 truncate ${b.kind === "removed" ? "opacity-70" : ""}`}>
                    <RedlineSegments segs={snippet} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * 지금 작업 — 마지막 버전 이후 어느 쪽을 얼마나 고쳤나 (U 새 쪽 · M 고친 쪽 · D 지운 쪽) · 비교 · 버전 저장.
 * 버전이 있으면 그 버전 문서 전체와 견주므로 쪽 추가 · 삭제 · 구성 변경까지 잡고, 쪽 단위로 되돌릴 수 있다.
 */
export const WorkingChanges: React.FC<{ doc: VDocDocument; lastVersion: DocumentVersion | null; baseDoc: VDocDocument | null }> = ({
  doc,
  lastVersion,
  baseDoc,
}) => {
  const base = lastVersion && baseDoc ? { version: lastVersion, doc: baseDoc } : null;
  const pages = useWorkingChanges(doc, baseDoc);
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const projectTitle = useProjectStore((s) => selectActiveProject(s)?.title) || "프로젝트";
  const [saving, setSaving] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const path = `${projectTitle} › ${doc.title}`;
  const blockTotals = addCounts(pages.map((p) => p.counts));
  const counts = { added: 0, edited: 0, deleted: 0 };
  for (const p of pages) counts[p.kind] += 1;

  const reviewAll = () => {
    if (base) {
      void openVersionCompare(doc.docId, base.version);
      return;
    }
    const all = pages.filter((p) => p.kind !== "deleted");
    openDiff({
      type: "working",
      label: "처음 연 뒤로 고친 것",
      beforeSlots: Object.assign({}, ...all.map((p) => p.before)),
      afterSlots: Object.assign({}, ...all.map((p) => p.after)),
      changedSlotIds: all.flatMap((p) => p.slotIds),
      revertible: all.every((p) => p.kind !== "added"),
    });
  };

  return (
    <section data-testid="working-changes">
      <div className="text-[11px] text-black/45 flex items-center gap-1 min-w-0">
        {lastVersion ? (
          <>
            <Bookmark className="w-3 h-3 text-[var(--fig-brand)] fill-[var(--fig-brand)] shrink-0" />
            <span className="truncate">
              <b className="font-semibold text-black/70">{lastVersion.name}</b> ({dayLabel(lastVersion.at)} {timeLabel(lastVersion.at)}) 이후
            </span>
          </>
        ) : (
          <span>저장한 버전이 없습니다 — 버전을 저장해 두면 언제든 그 상태로 되돌릴 수 있습니다</span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2" data-testid="working-summary">
        {pages.length > 0 ? (
          <>
            <span className="text-[13px] font-semibold">{pages.length}개 쪽</span>
            <span className="text-[12.5px] text-black/70 truncate">{formatBlockCounts(blockTotals)}</span>
          </>
        ) : (
          <span className="text-[12.5px] text-black/50">{lastVersion ? "마지막 버전과 같습니다" : "바뀐 곳 없음"}</span>
        )}
      </div>
      {pages.length > 0 && (
        <div className="text-[11px] text-black/45">
          {[counts.added && `새 쪽 ${counts.added}`, counts.edited && `고친 쪽 ${counts.edited}`, counts.deleted && `지운 쪽 ${counts.deleted}`].filter(Boolean).join(" · ")}
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={reviewAll} disabled={pages.length === 0} className="fig-btn flex-1 justify-center" data-testid="review-all-btn">
          {base ? "버전과 비교" : "변경 검토"}
        </button>
        <button
          type="button"
          onClick={() => setSaving(true)}
          className="fig-btn fig-btn-primary flex-1 justify-center"
          data-testid="commit-and-push-btn"
          title="지금 문서 전체를 보관합니다 — 나중에 언제든 이 상태로 되돌릴 수 있습니다"
        >
          버전 저장
        </button>
      </div>
      {saving && <SaveVersionForm docId={doc.docId} onDone={() => setSaving(false)} />}

      {/* Changes — VS Code 소스 제어 목록처럼 */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setListOpen(!listOpen)}
          className="w-full h-6 flex items-center gap-1 text-[11px] font-semibold text-black/70"
          data-testid="changes-header"
        >
          {listOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Changes
          <span className="ml-auto min-w-[18px] h-[16px] px-1 rounded-full bg-black/[0.07] text-[10px] leading-[16px] text-black/60 text-center tabular-nums">
            {pages.length}
          </span>
        </button>
        {listOpen &&
          (pages.length === 0 ? (
            <p className="pl-4 py-1 text-[11.5px] text-black/40">바뀐 쪽이 없습니다.</p>
          ) : (
            <div className="space-y-px">
              {pages.map((p) => (
                <ChangeRow
                  key={`${p.kind}-${p.page.pageId}`}
                  doc={doc}
                  p={p}
                  path={path}
                  base={base}
                  defaultOpen={pages.length <= 3 && p.items.length <= 8}
                />
              ))}
            </div>
          ))}
      </div>
    </section>
  );
};

