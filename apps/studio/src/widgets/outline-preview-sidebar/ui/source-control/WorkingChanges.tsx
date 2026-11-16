import React, { useMemo, useState } from "react";
import { Bookmark, ChevronDown, ChevronRight, FileDiff, FileText, LocateFixed, RotateCcw } from "lucide-react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { formatPageNos, pageTitle } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { useActiveDiffStore } from "@/features/document-diff";
import { dayLabel, restoreSlots, SaveVersionForm, timeLabel } from "@/features/document-revisions";
import { changeSnippet, scrollToCanvasPage } from "@/shared/lib";
import { CharStatText, RedlineSegments } from "@/shared/ui";

import type { FigmaDiffKind } from "../../model/useFigmaDiffStatus";
import { FigmaDiffBadge } from "../FigmaDiffBadge";
import { useWorkingChanges, type WorkingPage } from "./useWorkingChanges";

const ICON_COLOR: Record<FigmaDiffKind, string> = { added: "#2ea043", edited: "#d97706", deleted: "#cf222e" };

/** 줄 오른쪽 위에 올렸을 때만 보이는 작은 버튼 (VS Code 변경 목록의 열기 · 되돌리기 자리). */
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

/**
 * Changes 한 줄 (VS Code 소스 제어처럼): 쪽 이름(상태 색) + 흐린 경로(프로젝트 › 문서) + 글자 수 + U/M/D.
 * 누르면 그 쪽 변경 검토, 펼치면 바뀐 곳마다 제목 위치 + 빨강/초록 한 줄.
 */
const ChangeRow: React.FC<{ docId: string; p: WorkingPage; path: string; defaultOpen: boolean }> = ({ docId, p, path, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const title = pageTitle({ pageNo: p.pageNo, pageLabel: p.page.pageLabel });
  const isActive = activeDiff?.type === "working" && activeDiff.pageId === p.page.pageId;
  const kind: FigmaDiffKind = p.added ? "added" : "edited";

  const review = (slotId?: string) =>
    openDiff({
      type: "working",
      diffKind: p.added ? "added" : "edited",
      pageId: p.page.pageId,
      slotId,
      label: `${title} — 마지막 버전 이후`,
      beforeSlots: p.before,
      afterSlots: p.after,
      changedSlotIds: p.slotIds,
      revertible: !p.added,
    });

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        data-diff={kind}
        data-testid="working-page"
        onClick={() => review()}
        onKeyDown={(e) => e.key === "Enter" && review()}
        className={`fig-row group h-[26px] pl-0.5 pr-1 flex items-center gap-1 rounded-[5px] cursor-pointer ${
          isActive && !activeDiff?.slotId ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"
        }`}
        title={`${path} › ${title}\n${p.items.length}곳 · +${p.summary.stat.added}자 −${p.summary.stat.removed}자 — 눌러서 검토`}
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
        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: ICON_COLOR[kind] }} />
        <span className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
          <span className="fig-row-label max-w-[65%] truncate text-[12px]" style={{ flex: "0 0 auto" }}>
            {title}
          </span>
          <span data-testid="change-location" className="min-w-0 truncate text-[11px] text-black/40">
            {path}
          </span>
        </span>
        <span className="hidden group-hover:flex items-center shrink-0">
          <RowAction title="변경 검토" onClick={() => review()}>
            <FileDiff className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction
            title="문서에서 이 쪽 보기"
            onClick={() => {
              useActiveDiffStore.getState().closeDiff();
              scrollToCanvasPage(p.page.pageId);
            }}
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </RowAction>
          {!p.added && (
            <RowAction
              title="이 쪽에서 고친 것 모두 되돌리기 (실행 취소 가능)"
              testId={`discard-page-changes-${p.page.pageId}`}
              onClick={() => {
                restoreSlots(docId, p.items.map((i) => ({ slotId: i.slotId, before: i.before })), `${title} 고친 것 되돌리기`);
                if (isActive) useActiveDiffStore.getState().closeDiff();
              }}
            >
              <RotateCcw className="w-3 h-3" />
            </RowAction>
          )}
        </span>
        <CharStatText stat={p.summary.stat} className="group-hover:hidden !text-[10.5px]" />
        <FigmaDiffBadge diffState={{ kind, isDirect: true }} className="w-3 text-center !ml-1" />
      </div>
      {open && (
        <div className="pl-[38px] pb-0.5">
          {p.items.map((item) => {
            const snippet = changeSnippet(item.paras, 10);
            const on = isActive && activeDiff?.slotId === item.slotId;
            return (
              <button
                key={item.slotId}
                type="button"
                onClick={() => review(item.slotId)}
                data-testid="working-change"
                className={`w-full text-left px-1.5 py-0.5 rounded-[5px] ${on ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"}`}
              >
                <span className="flex items-center gap-1.5 text-[11px] text-black/40">
                  <span className="truncate">
                    {item.location?.heading ? `${item.location.heading} › ` : ""}
                    {item.label}
                  </span>
                  <CharStatText stat={item.stat} className="ml-auto !text-[10px]" />
                </span>
                <span className="block text-[12px] leading-[18px] text-black/75 truncate">
                  {item.formatOnly ? <span className="text-black/40">서식만 바뀜</span> : <RedlineSegments segs={snippet} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 마지막 버전 이후 지운 쪽 (D) — 버전에 남긴 쪽 목록과 비교. 내용은 이미 없으니 표시만. */
const DeletedRow: React.FC<{ label: string; path: string }> = ({ label, path }) => (
  <div
    data-diff="deleted"
    data-testid="working-page-deleted"
    className="fig-row h-[26px] pl-[22px] pr-1 flex items-center gap-1 rounded-[5px] hover:bg-[var(--fig-hover)]"
    title={`${path} › ${label} — 마지막 버전 이후 지운 쪽`}
  >
    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: ICON_COLOR.deleted }} />
    <span className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
      <span className="fig-row-label max-w-[65%] truncate text-[12px]" style={{ flex: "0 0 auto" }}>
        {label}
      </span>
      <span className="min-w-0 truncate text-[11px] text-black/40">{path}</span>
    </span>
    <FigmaDiffBadge diffState={{ kind: "deleted", isDirect: true }} className="w-3 text-center !ml-1" />
  </div>
);

/**
 * 지금 작업 — 마지막 버전 이후 바뀐 곳 요약 · 전체 검토 · 버전 저장, 그리고 쪽별 Changes 목록 (U 새 쪽 · M 고친 쪽 · D 지운 쪽).
 * (예전 Changes + Commit & Push 자리: 버전 저장이 기준점을 옮긴다.)
 */
export const WorkingChanges: React.FC<{ doc: VDocDocument }> = ({ doc }) => {
  const { pages, total } = useWorkingChanges(doc);
  const openDiff = useActiveDiffStore((s) => s.openDiff);
  const projectTitle = useProjectStore((s) => selectActiveProject(s)?.title) || "프로젝트";
  const [saving, setSaving] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const last = doc.versions?.[doc.versions.length - 1];
  const path = `${projectTitle} › ${doc.title}`;

  // 마지막 버전에 있던 쪽 중 지금 없는 쪽.
  const deleted = useMemo(() => {
    if (!last?.pages) return [];
    const now = new Set(doc.pages.map((p) => p.pageId));
    return last.pages.filter((p) => !now.has(p.pageId));
  }, [last, doc.pages]);
  const count = pages.length + deleted.length;

  const reviewAll = () =>
    openDiff({
      type: "working",
      label: last ? `'${last.name}' 이후 지금까지` : "지금까지 고친 것",
      beforeSlots: Object.assign({}, ...pages.map((p) => p.before)),
      afterSlots: Object.assign({}, ...pages.map((p) => p.after)),
      changedSlotIds: pages.flatMap((p) => p.slotIds),
      revertible: pages.every((p) => !p.added),
    });

  return (
    <section data-testid="working-changes">
      <div className="text-[11px] text-black/45 flex items-center gap-1 min-w-0">
        {last ? (
          <>
            <Bookmark className="w-3 h-3 text-[var(--fig-brand)] fill-[var(--fig-brand)] shrink-0" />
            <span className="truncate">
              <b className="font-semibold text-black/70">{last.name}</b> ({dayLabel(last.at)} {timeLabel(last.at)}) 이후
            </span>
          </>
        ) : (
          <span>아직 저장한 버전이 없습니다 · 처음부터 고친 것</span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2" data-testid="working-summary">
        {total.places > 0 ? (
          <>
            <span className="text-[13px] font-semibold">
              {total.pageNos.length}개 쪽 · {total.places}곳
            </span>
            <CharStatText stat={total.stat} />
          </>
        ) : (
          <span className="text-[12.5px] text-black/50">바뀐 곳 없음</span>
        )}
      </div>
      {total.pageNos.length > 0 && <div className="text-[11px] text-black/40 truncate">{formatPageNos(total.pageNos)}</div>}

      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={reviewAll} disabled={total.places === 0} className="fig-btn flex-1 justify-center" data-testid="review-all-btn">
          변경 검토
        </button>
        <button
          type="button"
          onClick={() => setSaving(true)}
          className="fig-btn fig-btn-primary flex-1 justify-center"
          data-testid="commit-and-push-btn"
          title="지금 상태에 이름을 붙여 기준점으로 남깁니다 (제출본 · 검토 요청본 등)"
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
            {count}
          </span>
        </button>
        {listOpen &&
          (count === 0 ? (
            <p className="pl-4 py-1 text-[11.5px] text-black/40">바뀐 쪽이 없습니다.</p>
          ) : (
            <div className="space-y-px">
              {pages.map((p) => (
                <ChangeRow key={p.page.pageId} docId={doc.docId} p={p} path={path} defaultOpen={pages.length <= 3 && p.items.length <= 8} />
              ))}
              {deleted.map((d) => (
                <DeletedRow key={d.pageId} label={d.label} path={path} />
              ))}
            </div>
          ))}
      </div>
    </section>
  );
};
