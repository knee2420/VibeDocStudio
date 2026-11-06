import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, Sparkles } from "lucide-react";

import { slotFillState, type StagedSlotHtmlChange, type VDocSlot } from "@vibe/vdoc-schema";

import { stagedSlotIds, useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useSlotContentActions } from "@/features/edit-slot-richtext";
import { openEvidence, useEvidenceFocusStore } from "@/features/evidence-focus";
import { SlotChangeReview } from "@/features/stage-ai-changes";

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
    <div ref={frameRef} className={`relative ${ring}`} data-fill-state={state} data-overflow={overflow ? "1" : undefined}>
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
