import React, { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, FolderSync, GitPullRequestArrow, LocateFixed, RotateCcw, X } from "lucide-react";
import { useStore } from "zustand";

import type { V2AiWorkspace, V2StagedChange } from "@vibe/ai-vault";

/**
 * AI 변경안(Staged) 검토 + 볼트 FS 트랜잭션(`vf_*`) 1클릭 되돌리기 바.
 */
export const V2StagedChangesPanel: React.FC<{
  readonly ai: V2AiWorkspace;
  /** 이 세션이 만든 변경안 · 파일 묶음만 (없으면 메인 — 꼬리표 없는 것) */
  readonly sessionKey?: string;
}> = ({ ai, sessionKey }) => {
  const allQueue = useStore(ai.store, (s) => s.queue);
  const allFsBatches = useStore(ai.store, (s) => s.fsBatches);
  const allApprovedOutlinePaths = useStore(ai.store, (s) => s.approvedOutlinePaths);
  const mainKey = ai.sessions.mainKey;
  const forKey = sessionKey ?? mainKey;
  const isMain = forKey === mainKey;
  const isMine = (key: string | undefined) => (key ?? mainKey) === forKey;
  const queue = allQueue.filter((c) => isMine(c.sessionKey));
  const fsBatches = allFsBatches.filter((b) => isMine(b.sessionKey));
  const approvedOutlinePaths = isMain ? allApprovedOutlinePaths : [];
  const [open, setOpen] = useState(true);
  const [fsOpen, setFsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const activeFsBatches = fsBatches.filter((b) => !b.undone);
  if (queue.length === 0 && activeFsBatches.length === 0 && approvedOutlinePaths.length === 0) return null;

  const activeTab = isMain ? ai.env.activeTabPath() : null;
  const active = !isMain ? null : activeTab && queue.some((c) => c.path === activeTab) ? activeTab : ai.env.activeDocPath();
  const mine = isMain ? queue.filter((c) => c.path === active) : queue;
  const others = queue.length - mine.length;
  const shown = mine.length ? mine : queue;

  const approve = (ids: string[], options?: { readonly recompileBoundVDocs?: boolean }) => {
    const res = ai.approve(ids, options);
    setError(res.failed.length ? res.failed.map((f) => f.why).join(" · ") : null);
  };

  const revealTargetOnCanvas = (c: V2StagedChange) => {
    if (c.targetKind === "asset-blocks") {
      const targetBlockId = c.payload.replaceBlockIds?.[0] ?? c.payload.anchorBlockId;
      if (targetBlockId) {
        ai.env.vdocUiBridge.getState().requestScrollTo(c.path, targetBlockId);
      }
      return;
    }
    if (c.targetKind === "style-change") {
      const targetBlockId = c.payload.blockPatches[0]?.blockId;
      if (targetBlockId) {
        ai.env.vdocUiBridge.getState().requestScrollTo(c.path, targetBlockId);
      }
      return;
    }
    if (c.targetKind === "slot-html") {
      ai.env.vdocUiBridge.getState().requestScrollTo(c.path, c.payload.slotId);
    } else if (c.targetKind === "block-props") {
      ai.env.vdocUiBridge.getState().requestScrollTo(c.path, c.payload.blockId);
    }
  };

  const handleUndoFs = async (batchId: string) => {
    setUndoingId(batchId);
    try {
      const res = await ai.undoFsBatch(batchId);
      setError(res.ok ? null : res.message);
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <>
      {approvedOutlinePaths.length > 0 && (
        <div data-testid="v2-outline-undo-bar" className="flex items-center justify-between gap-1.5 border-t border-emerald-200 bg-emerald-50/70 px-2 py-1 text-[11px] text-emerald-900">
          <span className="truncate">아웃라인 승인 반영됨 · {approvedOutlinePaths[0].split("/").pop()}</span>
          <button
            type="button"
            data-testid="v2-outline-undo"
            onClick={() => ai.undoOutlineApproval(approvedOutlinePaths[0])}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-[10.5px] font-medium text-emerald-800 hover:bg-emerald-100"
            title="방금 승인한 아웃라인 패치 되돌리기"
          >
            <RotateCcw className="h-3 w-3" />
            되돌리기
          </button>
        </div>
      )}
      {activeFsBatches.length > 0 && (
        <div data-testid="v2-fs-batches-panel" className="border-t border-sky-200 bg-sky-50/70 px-2 py-1.5 text-[11.5px] text-slate-700">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setFsOpen(!fsOpen)} className="flex min-w-0 flex-1 items-center gap-1 font-semibold text-sky-900">
              {fsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <FolderSync className="h-3.5 w-3.5" />
              <span data-testid="v2-fs-batch-count">디렉토리 작업 {activeFsBatches.length}건</span>
            </button>
            <button
              type="button"
              data-testid="v2-fs-batch-undo-latest"
              disabled={undoingId !== null}
              onClick={() => void handleUndoFs(activeFsBatches[0].batchId)}
              className="inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-0.5 text-[11px] font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
              title="가장 최근 디렉토리 변경 배치 되돌리기"
            >
              <RotateCcw className="h-3 w-3" />
              되돌리기
            </button>
          </div>
          {fsOpen && (
            <ul className="mt-1 max-h-[160px] space-y-1 overflow-y-auto">
              {activeFsBatches.map((b) => (
                <li key={b.batchId} data-testid="v2-fs-batch-item" className="flex items-start gap-1 rounded border border-sky-200 bg-white px-2 py-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{b.summary || `배치 ${b.batchId}`}</span>
                    <span className="block truncate text-[10.5px] text-slate-500">{b.ops.slice(0, 3).join(" · ")}{b.ops.length > 3 ? ` 외 ${b.ops.length - 3}건` : ""}</span>
                  </span>
                  <button
                    type="button"
                    data-testid="v2-fs-batch-undo"
                    disabled={undoingId === b.batchId}
                    onClick={() => void handleUndoFs(b.batchId)}
                    className="rounded p-0.5 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                    title="이 배치 되돌리기"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {queue.length > 0 && (
        <div data-testid="v2-staged-panel" className="border-t border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11.5px] text-slate-700">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1 font-semibold text-amber-900">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <GitPullRequestArrow className="h-3.5 w-3.5" />
              <span data-testid="v2-staged-count">변경안 {shown.length}건</span>
              {others > 0 && mine.length > 0 && <span className="font-normal text-amber-700">(다른 문서 {others})</span>}
            </button>
            <button type="button" data-testid="v2-staged-approve-all" onClick={() => approve(shown.map((c) => c.diffId))} className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700">
              모두 승인
            </button>
            <button type="button" data-testid="v2-staged-reject-all" onClick={() => ai.reject(shown.map((c) => c.diffId))} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100">
              모두 거절
            </button>
          </div>
          {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
          {open && (
            <ul className="mt-1 max-h-[220px] space-y-1 overflow-y-auto">
              {shown.map((c) => {
                const stale = ai.isStale(c);
                return (
                  <li key={c.diffId} data-testid="v2-staged-item" className="rounded border border-amber-200 bg-white px-2 py-1">
                    <div className="flex items-start gap-1">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800" title={c.title}>{c.title.replace(/^\[AI Composer\]\s*/, "")}</span>
                        <span className="block truncate text-[10.5px] text-slate-400 line-through" title={c.beforeSummary}>{c.beforeSummary}</span>
                        <span className="block text-[11px] leading-4 text-slate-700" title={c.afterSummary}>{c.afterSummary}</span>
                        {stale && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> {c.targetKind === "outline-patch" ? "그사이 대상 서브트리가 바뀌었습니다 — 승인하면 덮어씁니다" : "그사이 이 칸이 바뀌었습니다 — 승인하면 덮어씁니다"}
                          </span>
                        )}
                        {c.warnings && c.warnings.length > 0 && (
                          <span className="mt-0.5 block text-[10px] text-amber-700">{c.warnings[0]}</span>
                        )}
                        {c.targetKind === "asset-blocks" && c.payload.report && (
                          <span data-testid="v2-staged-asset-report" className="mt-0.5 block text-[10px] text-slate-500">
                            {c.payload.mode === "replace" ? "교체" : "추가"} · 채움 {c.payload.report.filled} · 빈 자리 {c.payload.report.empty}
                            {c.payload.report.preserved ? ` · 옮긴 값 ${c.payload.report.preserved.kept}/${c.payload.report.preserved.total}` : ""}
                            {c.payload.report.leftover.length > 0 && <span className="text-amber-700"> · 못 옮김: {c.payload.report.leftover.join(", ")}</span>}
                          </span>
                        )}
                        {(c.targetKind === "asset-blocks" || c.targetKind === "style-change") && c.payload.intentNote && (
                          <span className="mt-0.5 block truncate text-[10px] text-indigo-700" title={c.payload.intentNote}>
                            ✦ {c.payload.intentNote}
                          </span>
                        )}
                      </span>
                      {c.targetKind === "outline-patch" && c.payload.compiledDocPath && (
                        <button
                          type="button"
                          data-testid="v2-staged-approve-compile"
                          onClick={() => approve([c.diffId], { recompileBoundVDocs: true })}
                          className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                          title="승인 후 바인딩된 .vdoc 자동 재컴파일"
                        >
                          승인+컴파일
                        </button>
                      )}
                      {(c.targetKind === "asset-blocks" || (c.targetKind === "style-change" && c.payload.blockPatches.length > 0) || c.targetKind === "slot-html" || c.targetKind === "block-props") && (
                        <button
                          type="button"
                          data-testid="v2-staged-reveal"
                          onClick={() => revealTargetOnCanvas(c)}
                          className="rounded p-0.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                          title="캔버스에서 Unified Diff 위치로 이동"
                        >
                          <LocateFixed className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" data-testid="v2-staged-approve" onClick={() => approve([c.diffId])} className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50" title="승인 (볼트 파일에 반영)">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" data-testid="v2-staged-reject" onClick={() => ai.reject([c.diffId])} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600" title="거절">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
};
