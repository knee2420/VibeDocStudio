import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, RotateCcw, Sparkles, X } from "lucide-react";

import { slotFillState, type StagedSlotHtmlChange, type VDocSlot } from "@vibe/vdoc-schema";

import { stagedSlotIds, useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { restoreSlots } from "@/features/document-revisions";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { openEvidence, useEvidenceFocusStore } from "@/features/evidence-focus";
import { SlotChangeReview } from "@/features/stage-ai-changes";
import { htmlToPlain } from "@/shared/lib";

import { useSlotGutterChange, type GutterChangeKind } from "../model/WorkingChangeContext";

const GUTTER_COLOR: Record<GutterChangeKind, string> = {
  add: "bg-[#2da44e]",
  mod: "bg-[#0d99ff]",
  del: "bg-[#cf222e]",
};
const GUTTER_TITLE: Record<GutterChangeKind, string> = {
  add: "새로 추가됨",
  mod: "수정됨",
  del: "삭제됨",
};

export interface SlotFrameProps {
  slot: VDocSlot;
  children: React.ReactNode;
  onOpenEvidence?: (change: StagedSlotHtmlChange, index: number) => void;
}

/**
 * 캔버스 슬롯 하나를 감싸는 틀 (Phase 3):
 * - 승인 대기 변경안이 있으면 그 자리에서 diff 검토 (`SlotChangeReview`)
 * - 채움 상태: 빈 칸(점선) · AI 초안(보라 배지 — 눌러서 검증) · 검증됨(초록)
 * - 근거 역방향 강조: RM 에서 자료를 가리키면 그 자료를 쓰는 칸이 빛난다 (`evidence-focus`)
 */
export const SlotFrame: React.FC<SlotFrameProps> = ({ slot, children, onOpenEvidence }) => {
  const docId = useStudioDocumentStore((s) => s.activeDocId);
  const drafting = useWorkspaceSessionStore((s) => s.currentPhase === "drafting");
  const staged = useAiStagingStore((s) => stagedSlotIds(s.queue, docId).has(slot.slotId));
  const highlighted = useEvidenceFocusStore((s) => s.highlightedSlotIds.has(slot.slotId));
  const { toggleSlotVerified } = useSlotContentActions();
  const gutterChange = useSlotGutterChange(slot.slotId);
  const [gutterOpen, setGutterOpen] = useState(false);
  const state = slotFillState(slot, staged ? new Set([slot.slotId]) : undefined);
  const [frameRef, lines] = useRenderedLines(slot.constraints?.maxLines ? slot : null);
  const maxLines = slot.constraints?.maxLines;
  const overflow = maxLines && lines > maxLines;
  // 근거 무효화: 이 칸의 근거 원문이 바뀌었거나 사라졌으면 표시 (내용은 그대로 — 사람이 판단)
  const staleKey = useStudioDocumentStore((s) => {
    const d = s.docs.find((x) => x.docId === docId);
    const bad = (d?.evidenceLinks ?? []).filter((l) => l.slotId === slot.slotId && l.status && l.status !== "ok");
    return bad.map((l) => `${l.status}:${l.locator.label}`).join("|");
  });

  const ring = highlighted
    ? "ring-2 ring-amber-400 ring-offset-1 rounded-sm bg-amber-50/40"
    : drafting && state === "empty"
      ? "outline outline-1 outline-dashed outline-amber-300/80 outline-offset-2 rounded-sm"
      : "";

  return (
    <div
      ref={frameRef}
      className={`relative ${ring}`}
      data-fill-state={state}
      data-overflow={overflow ? "1" : undefined}
      data-change-gutter={gutterChange?.kind}
      data-change-label={gutterChange ? `${gutterChange.label} ${gutterChange.statText}` : undefined}
    >
      {/* Antigravity / VS Code 스타일 왼쪽 3px 변경 거터 막대 */}
      {gutterChange && !staged && (
        <button
          type="button"
          data-testid={`slot-change-gutter-${slot.slotId}`}
          onClick={(e) => {
            e.stopPropagation();
            setGutterOpen((v) => !v);
          }}
          title={`${GUTTER_TITLE[gutterChange.kind]} (${gutterChange.statText}) · 클릭해 이전 글 보기`}
          className={`absolute -left-2.5 top-0.5 bottom-0.5 w-[3px] hover:w-[5px] rounded-full transition-all cursor-pointer z-20 ${GUTTER_COLOR[gutterChange.kind]}`}
        />
      )}

      {/* 거터 클릭 시 이전 글 인라인 미니 팝오버 + 1클릭 되돌리기 */}
      {gutterChange && gutterOpen && !staged && (
        <div
          data-testid={`slot-gutter-popover-${slot.slotId}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1.5 z-40 w-[min(360px,90vw)] rounded-lg border border-slate-200 bg-white shadow-xl p-2.5 text-[11.5px] text-slate-700 select-text"
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
              <span className={`w-2 h-2 rounded-full ${GUTTER_COLOR[gutterChange.kind]}`} />
              {GUTTER_TITLE[gutterChange.kind]}
              <span className="font-mono text-[10.5px] font-normal text-slate-400">{gutterChange.statText}</span>
            </span>
            <div className="flex items-center gap-1">
              {gutterChange.kind !== "add" && (
                <button
                  type="button"
                  onClick={() => {
                    restoreSlots(docId, [{ slotId: slot.slotId, before: gutterChange.before }], `${gutterChange.label} 되돌리기`);
                    setGutterOpen(false);
                  }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  되돌리기
                </button>
              )}
              <button
                type="button"
                onClick={() => setGutterOpen(false)}
                className="p-0.5 rounded hover:bg-slate-100 text-slate-400 cursor-pointer"
                title="닫기"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {gutterChange.kind === "add" ? (
            <p className="text-[11px] text-emerald-700">마지막 버전 이후 새로 추가된 내용입니다.</p>
          ) : (
            <div className="max-h-32 overflow-y-auto rounded bg-rose-50/70 border border-rose-200/70 px-2 py-1.5 text-[11px] text-rose-900/90 whitespace-pre-wrap leading-relaxed">
              {htmlToPlain(gutterChange.before) || "(비어 있음)"}
            </div>
          )}
        </div>
      )}

      <SlotChangeReview
        slot={slot}
        docId={docId}
        onOpenEvidence={onOpenEvidence ?? ((change, i) => {
          const ev = change.evidence?.[i];
          if (ev) openEvidence(ev.locator);
        })}
      >
        {children}
      </SlotChangeReview>
      {overflow && (
        <span
          className="absolute -left-1 -top-2 z-10 px-1 py-px rounded-full bg-rose-50 border border-rose-300 text-rose-700 text-[9px] font-bold shadow-sm select-none"
          title={`이 칸은 최대 ${maxLines}줄입니다 — 지금 ${lines}줄로 넘칩니다 (출력 · 인쇄에서 잘림)`}
        >
          넘침 {lines}/{maxLines}줄
        </span>
      )}
      {staleKey && (
        <button
          type="button"
          data-testid={`slot-evidence-stale-${slot.slotId}`}
          onClick={(e) => {
            e.stopPropagation();
            const link = useStudioDocumentStore
              .getState()
              .docs.find((x) => x.docId === docId)
              ?.evidenceLinks?.find((l) => l.slotId === slot.slotId && l.status && l.status !== "ok");
            if (link) openEvidence(link.locator);
          }}
          className="absolute left-12 -top-2 z-10 px-1 py-px rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[9px] font-bold shadow-sm cursor-pointer select-none"
          title={["근거 원문이 바뀌었습니다 — 다시 확인하세요", ...staleKey.split("|")].join("\n")}
        >
          근거 변경됨
        </button>
      )}
      {drafting && (state === "ai-draft" || state === "verified") && !staged && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleSlotVerified(slot.slotId);
          }}
          className={`absolute -right-1 -top-2 z-10 inline-flex items-center gap-0.5 px-1 py-px rounded-full border text-[9px] font-bold shadow-sm cursor-pointer select-none ${
            state === "verified" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-violet-50 border-violet-300 text-violet-700"
          }`}
          title={
            state === "verified"
              ? "사람이 확인한 칸 (누르면 확인 해제)"
              : `AI 가 쓴 칸${slot.fill?.harnessId ? ` (${slot.fill.harnessId})` : ""} — 내용을 확인했으면 누르세요`
          }
        >
          {state === "verified" ? <BadgeCheck className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
          {state === "verified" ? "검증" : "AI"}
        </button>
      )}
    </div>
  );
};

/**
 * 렌더된 본문의 실제 줄 수 (줄 수 제약 실측). 서버 게이트의 글자 수 어림과 달리 화면 그대로를 잰다.
 * 제약이 없는 칸은 재지 않는다 (ResizeObserver 비용).
 */
function useRenderedLines(slot: VDocSlot | null): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = useState(0);
  const content = slot?.content;
  useEffect(() => {
    const host = ref.current;
    if (!slot || !host) return;
    const measure = () => {
      const body = host.querySelector<HTMLElement>(".ProseMirror") ?? host;
      const style = getComputedStyle(body);
      const font = parseFloat(style.fontSize) || 14;
      const lh = parseFloat(style.lineHeight) || font * 1.45;
      setLines(Math.max(0, Math.round(body.scrollHeight / lh)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [slot, content]);
  return [ref, lines];
}
