import React, { useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import type { StagedSlotHtmlChange, VDocSlot } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";

import { diffWords } from "../lib/htmlDiff";
import { useStageAiChanges } from "../model/useStageAiChanges";

export interface SlotChangeReviewProps {
  slot: VDocSlot;
  docId: string;
  /** 원래 본문 편집기 (원형 100% 보존) */
  children: React.ReactNode;
  /** 근거를 눌렀을 때 (원본 위치로 이동) */
  onOpenEvidence?: (change: StagedSlotHtmlChange, index: number) => void;
}

const stripHtml = (html: string): string => {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

/**
 * Manyfast 스타일 순수 인라인 Diff:
 * - 박스·테두리·버튼 없이 문서 본문 흐름 그대로 표시
 * - 삭제: 흐린 회색 취소선
 * - 추가: 연한 프라이머리 하이라이트 (형광펜)
 */
const InlineWords: React.FC<{ before: string; after: string }> = ({ before, after }) => (
  <>
    {diffWords(before, after).map((seg, i) =>
      seg.type === "eq" ? (
        <span key={i}>{seg.text}</span>
      ) : seg.type === "del" ? (
        <del key={i} className="opacity-45 line-through decoration-current/60">
          {seg.text}
        </del>
      ) : (
        <ins
          key={i}
          className="no-underline rounded-[3px] px-0.5 bg-[var(--vds-accent)]/14"
        >
          {seg.text}
        </ins>
      ),
    )}
  </>
);

/**
 * Manyfast 스타일 문서 인라인 제안 표시:
 * - 평소에는 문서 위에 어떤 박스·테두리·버튼도 띄우지 않고, 본문 그 자리에서
 *   깔끔한 인라인 하이라이트(또는 제안된 새 서식 미리보기)만 보여준다.
 * - 승인과 거절은 하단 단일 플로팅 필에서 하나씩 넘기며 처리하고,
 *   특정 슬롯 위에 마우스를 올렸을 때만 우측 상단에 미니 `[거절] [승인]` 필이 조용히 나타난다.
 */
export const SlotChangeReview: React.FC<SlotChangeReviewProps> = ({ slot, docId, children }) => {
  const change = useAiStagingStore((s) =>
    s.queue.find(
      (c): c is StagedSlotHtmlChange =>
        c.targetKind === "slot-html" && c.payload.slotId === slot.slotId && (!c.docId || c.docId === docId),
    ),
  );
  const { acceptStagedChange, rejectStagedChange } = useStageAiChanges();
  const [peekOriginal, setPeekOriginal] = useState(false);

  const beforeText = useMemo(() => stripHtml(slot.content), [slot.content]);
  const afterText = useMemo(() => (change ? stripHtml(change.payload.html) : ""), [change]);

  if (!change) {
    return <>{children}</>;
  }

  const isStyleOnlyChange = Boolean(beforeText) && beforeText === afterText && slot.content !== change.payload.html;
  const isAdd = !beforeText;
  const isDel = !afterText;

  return (
    <div
      data-testid={`slot-change-review-${slot.slotId}`}
      data-staged-diff-id={change.diffId}
      onClick={(e) => e.stopPropagation()}
      className="relative group/slot-review transition-all"
    >
      {/* 호버 시에만 조용히 뜨는 미니 액션 필 (pb-2 브릿지로 마우스 이동 시 안 사라지게) */}
      <div className="pointer-events-none opacity-0 group-hover/slot-review:opacity-100 group-hover/slot-review:pointer-events-auto transition-opacity absolute -top-8 right-0 pb-2 z-30 select-none">
        <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/98 backdrop-blur-md border border-[var(--vds-border)] shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
          {isStyleOnlyChange && (
            <button
              type="button"
              onMouseDown={() => setPeekOriginal(true)}
              onMouseUp={() => setPeekOriginal(false)}
              onMouseLeave={() => setPeekOriginal(false)}
              className="h-5 px-2 rounded-full text-[10.5px] font-medium text-[var(--vds-ink-secondary)] hover:bg-[var(--vds-hover)] hover:text-[var(--vds-ink)] cursor-pointer transition"
              title="누르고 있으면 원래 서식 보기"
            >
              원본
            </button>
          )}
          <button
            type="button"
            data-testid={`slot-change-reject-${slot.slotId}`}
            onClick={() => rejectStagedChange(change.diffId)}
            className="h-5 px-2 rounded-full text-[10.5px] font-medium text-[var(--vds-ink-secondary)] hover:bg-[var(--vds-hover)] hover:text-[var(--vds-ink)] inline-flex items-center gap-0.5 cursor-pointer transition"
          >
            <X className="w-2.5 h-2.5" />
            거절
          </button>
          <button
            type="button"
            data-testid={`slot-change-accept-${slot.slotId}`}
            onClick={() => void acceptStagedChange(change)}
            className="h-5 px-2 rounded-full bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white text-[10.5px] font-medium inline-flex items-center gap-0.5 cursor-pointer transition"
          >
            <Check className="w-2.5 h-2.5 stroke-[2.5]" />
            승인
          </button>
        </div>
      </div>

      {/* 문서 본문 그대로 — 박스·카드·테두리 없음 */}
      {isStyleOnlyChange ? (
        <div
          className="rounded-[3px] ring-1 ring-[var(--vds-accent)]/35 ring-offset-2 ring-offset-transparent transition-all"
          dangerouslySetInnerHTML={{ __html: peekOriginal ? slot.content : change.payload.html }}
        />
      ) : isAdd ? (
        <ins className="no-underline rounded-[3px] px-0.5 bg-[var(--vds-accent)]/14">{afterText}</ins>
      ) : isDel ? (
        <del className="opacity-45 line-through decoration-current/60">{beforeText}</del>
      ) : (
        <InlineWords before={beforeText} after={afterText} />
      )}
    </div>
  );
};
