import React, { useMemo, useState } from "react";
import { BookCheck, CircleStop, FileSearch, Loader2, MessageSquare, Quote, Sparkles, Variable, X } from "lucide-react";

import { findBlock, fillProgress, getBlockSlotIds, isSlotEmpty, type VDocDocument } from "@vibe/vdoc-schema";

import { stagedSlotIds, useAiStagingStore } from "@/entities/ai-staging";
import { planHarness, type FocusContext, type HarnessPlan, type Intent } from "@/entities/harness";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { attachToComposer, slotRef } from "@/features/ai-workspace";
import { cancelFillScope, runFillScope, runFillSlot, runFillVariables, runVerifySlot, useFillJobStore } from "@/features/fill-slots";

type ScopeMode = "focus" | "page" | "document";

/**
 * 초점 → FocusContext. 선택(칸 · 범위 · 블록)이 있으면 그것, 없으면 지금 페이지.
 * `mode` 로 사람이 범위를 넓힐 수 있다 (페이지 · 문서 전체).
 */
function computeFocus(doc: VDocDocument, activePageId: string, mode: ScopeMode): FocusContext {
  const sel = useSlotSelectionStore.getState();
  const page = doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
  const pageSlots = (page?.blocks ?? []).flatMap((b) => getBlockSlotIds(b));
  if (mode === "document") {
    const all = doc.pages.flatMap((p) => p.blocks.flatMap((b) => getBlockSlotIds(b)));
    return { level: "document", docId: doc.docId, slotIds: [], scopeSlotIds: all, label: `문서 전체 · ${doc.title}` };
  }
  if (mode === "focus") {
    const range = sel.slotRange?.slotIds ?? [];
    if (range.length > 1) return { level: "slot-range", docId: doc.docId, slotIds: range, scopeSlotIds: range, label: `선택 범위 ${range.length}칸` };
    if (sel.selectedSlotId && doc.slots[sel.selectedSlotId]) {
      return { level: "slot", docId: doc.docId, slotIds: [sel.selectedSlotId], scopeSlotIds: [sel.selectedSlotId], label: `칸 · ${doc.slots[sel.selectedSlotId].label}` };
    }
    const loc = sel.selectedBlockId ? findBlock(doc, sel.selectedBlockId) : null;
    if (loc) {
      const ids = getBlockSlotIds(loc.block);
      return { level: "block", docId: doc.docId, blockId: loc.block.blockId, slotIds: [], scopeSlotIds: ids, label: `블록 · ${loc.block.title || loc.block.kind}` };
    }
  }
  return { level: "page", docId: doc.docId, pageId: page?.pageId, slotIds: [], scopeSlotIds: pageSlots, label: `페이지 · ${page?.pageLabel ?? ""}` };
}

/**
 * Phase 3 지시 막대 — 지금 초점에서 할 수 있는 하네스를 보여 주고 돌린다.
 * 초점(칸 · 범위 · 블록 · 페이지 · 문서)이 바뀌면 HarnessResolver 가 실행 방식(단발 · 일괄 작업)과 대상 칸을 다시 고른다.
 */
export const Phase3FocusBar: React.FC = () => {
  const doc = useStudioDocumentStore((s) => selectActiveDocument(s));
  const activePageId = useStudioDocumentStore((s) => s.activePageId);
  const selKey = useSlotSelectionStore((s) => `${s.selectedSlotId}|${s.selectedBlockId}|${(s.slotRange?.slotIds ?? []).join(",")}`);
  const queue = useAiStagingStore((s) => s.queue);
  const running = useAiStagingStore((s) => s.isRunning);
  const job = useFillJobStore();
  const openRightPanel = useWorkspaceLayoutStore((s) => s.openRightPanel);
  const [mode, setMode] = useState<ScopeMode>("focus");
  const [verify, setVerify] = useState<{ label: string; text: string } | null>(null);

  const focus = useMemo(() => (doc ? computeFocus(doc, activePageId, mode) : null), [doc, activePageId, mode, selKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc || !focus) return null;
  const staged = stagedSlotIds(queue, doc.docId);
  const lookup = {
    empty: (id: string) => Boolean(doc.slots[id]) && isSlotEmpty(doc.slots[id]),
    editable: (id: string) => Boolean(doc.slots[id]) && doc.slots[id].role !== "boilerplate" && !doc.slots[id].constraints?.locked,
  };
  const progress = fillProgress(focus.scopeSlotIds.map((id) => doc.slots[id]).filter(Boolean), staged);
  const plans: HarnessPlan[] = (["fill", "cite", "verify", "variables", "ask"] as Intent[]).map((i) => planHarness(focus, i, lookup));
  const busy = running || job.status === "running";

  const run = async (plan: HarnessPlan) => {
    if (plan.harnessId === "composer") {
      const refs = focus.slotIds.map((id) => slotRef(doc, doc.slots[id])).filter(Boolean);
      openRightPanel("composer");
      attachToComposer(refs);
      return;
    }
    if (plan.harnessId === "fill.variable") return void runFillVariables(doc.docId);
    if (plan.harnessId === "verify.slot") {
      const id = plan.slotIds[0];
      const res = await runVerifySlot(id);
      if (res) setVerify({ label: doc.slots[id]?.label ?? id, text: res.text || "(지적 사항 없음)" });
      return;
    }
    if (plan.executor === "job") return void runFillScope(plan.slotIds, { harnessId: plan.harnessId as "fill.slot" | "ground.cite" });
    return void runFillSlot(plan.slotIds[0], { harnessId: plan.harnessId as "fill.slot" | "ground.cite", docId: doc.docId });
  };

  const icon = { fill: Sparkles, cite: Quote, verify: BookCheck, variables: Variable, ask: MessageSquare } as const;

  return (
    <div data-testid="phase3-focus-bar" onClick={(e) => e.stopPropagation()} className="w-[794px] max-w-[794px] mx-auto mb-3 rounded-xl border border-violet-200 bg-white/95 shadow-2xs select-none">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
        <span className="font-bold text-violet-900 truncate max-w-[220px]" title={focus.label}>
          {focus.label}
        </span>
        <div className="flex items-center rounded-md border border-slate-200 overflow-hidden shrink-0">
          {(["focus", "page", "document"] as ScopeMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-1.5 py-0.5 text-[10px] cursor-pointer ${mode === m ? "bg-violet-600 text-white font-bold" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {m === "focus" ? "선택" : m === "page" ? "페이지" : "문서"}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0" title="채울 대상 칸의 상태 (고정 · 잠금 제외)">
          <span className="px-1 rounded bg-amber-50 text-amber-800">빈 칸 {progress.empty}</span>
          <span className="px-1 rounded bg-violet-50 text-violet-800">대기 {progress.staged}</span>
          <span className="px-1 rounded bg-indigo-50 text-indigo-800">AI {progress.aiDraft}</span>
          <span className="px-1 rounded bg-emerald-50 text-emerald-800">검증 {progress.verified}</span>
          <span>/ {progress.total}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {plans.map((plan) => {
            const Icon = icon[plan.intent];
            return (
              <button
                key={plan.intent}
                type="button"
                data-testid={`phase3-action-${plan.intent}`}
                disabled={busy || Boolean(plan.disabled)}
                onClick={() => void run(plan)}
                title={plan.disabled ?? `${plan.harnessId} · ${plan.executor === "job" ? "일괄 작업" : plan.executor === "loop" ? "Composer" : "단발"}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-semibold cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                  plan.intent === "fill" ? "bg-violet-600 border-violet-600 text-white hover:bg-violet-700" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300 hover:text-violet-700"
                }`}
              >
                <Icon className="w-3 h-3" />
                {plan.label}
              </button>
            );
          })}
        </div>
      </div>
      {(job.status === "running" || (job.status !== "idle" && job.total > 0)) && (
        <div className="flex items-center gap-2 px-3 pb-1.5 text-[10.5px]">
          {job.status === "running" ? <Loader2 className="w-3 h-3 animate-spin text-violet-600" /> : <FileSearch className="w-3 h-3 text-slate-400" />}
          <span className="text-slate-700">
            일괄 {job.harnessId === "ground.cite" ? "출처 달기" : "채우기"} {job.done}/{job.total} · 변경안 {job.staged}
            {job.failed ? ` · 실패 ${job.failed}` : ""}
            {job.status === "succeeded" ? " — 완료 (캔버스에서 칸마다 검토)" : job.status === "cancelled" ? " — 중단됨" : ""}
            {job.error ? ` — ${job.error}` : ""}
          </span>
          <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
          </div>
          {job.status === "running" && (
            <button type="button" onClick={() => void cancelFillScope()} className="inline-flex items-center gap-0.5 text-rose-600 hover:text-rose-800 cursor-pointer">
              <CircleStop className="w-3 h-3" /> 중단
            </button>
          )}
        </div>
      )}
      {verify && (
        <div className="mx-3 mb-2 p-2 rounded-lg border border-sky-200 bg-sky-50 text-[11px] text-sky-950 relative">
          <button type="button" onClick={() => setVerify(null)} className="absolute right-1 top-1 p-0.5 rounded hover:bg-white cursor-pointer">
            <X className="w-3 h-3" />
          </button>
          <div className="font-bold mb-0.5">사실 확인 · {verify.label}</div>
          <pre className="whitespace-pre-wrap font-sans leading-relaxed">{verify.text}</pre>
        </div>
      )}
    </div>
  );
};
