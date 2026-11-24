import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileSearch, X } from "lucide-react";

import { diffBlocks, diffWords, hunkCount, mergeHunks, type BlockOp } from "./slotDiff";

/**
 * 칸 안 변경안 검토 — 본문(편집기)은 원형 그대로 두고, 바로 아래에 얇은 제안 띠(+ 제안 글 · ✓ 승인 · ✕ 거절)를 붙인다.
 * 단어 단위 diff 를 펼치면 덩어리(hunk)마다 반영 여부를 골라 부분 승인할 수 있다.
 * 저장소를 모른다: 변경안 · 승인 · 거절은 감싸는 쪽이 넘긴다 (studio `SlotChangeReview` 의 화면을 공용으로).
 */
export interface SlotChangeReviewProps {
  slotId: string;
  /** 지금 칸 본문 HTML */
  before: string;
  /** 제안 HTML */
  after: string;
  /** 변경안을 만든 뒤 사람이 고쳤다 */
  stale?: boolean;
  /** 근거 수 (있으면 근거 버튼) */
  evidenceCount?: number;
  onOpenEvidence?(): void;
  /** 이 변경안을 낸 세션 (기준점 세션이면 이름 — 누르면 그 세션) */
  sourceLabel?: string;
  onOpenSource?(): void;
  /** 승인 — 고른 덩어리만 이어 붙인 HTML (전부 고르면 `after` 그대로) */
  onAccept(html: string): void;
  onReject(): void;
  /** 원래 본문 편집기 */
  children: React.ReactNode;
}

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const Words: React.FC<{ before: string; after: string }> = ({ before, after }) => (
  <>
    {diffWords(before, after).map((seg, i) =>
      seg.type === "eq" ? (
        <span key={i}>{seg.text}</span>
      ) : seg.type === "del" ? (
        <del key={i} className="bg-rose-100 text-rose-800 decoration-rose-500 line-through">
          {seg.text}
        </del>
      ) : (
        <ins key={i} className="bg-emerald-100 font-medium text-emerald-900 no-underline">
          {seg.text}
        </ins>
      )
    )}
  </>
);

const Hunk: React.FC<{ op: Extract<BlockOp, { kind: "hunk" }>; accepted: boolean; selectable: boolean; onToggle(): void }> = ({
  op,
  accepted,
  selectable,
  onToggle,
}) => {
  const pairs = Math.min(op.before.length, op.after.length);
  return (
    <div
      className={`relative my-0.5 rounded border-l-2 p-1 text-[11px] leading-relaxed ${
        accepted ? "border-emerald-400 bg-emerald-50/50" : "border-slate-300 bg-slate-50 opacity-70"
      }`}
    >
      {selectable && (
        <label className="mr-1 inline-block cursor-pointer" title={accepted ? "이 부분 반영" : "원래 내용 유지"}>
          <input type="checkbox" checked={accepted} onChange={onToggle} className="h-3 w-3 cursor-pointer align-middle accent-emerald-600" />
        </label>
      )}
      {Array.from({ length: pairs }, (_, i) => (
        <span key={`p${i}`}>
          <Words before={op.before[i].text} after={op.after[i].text} />
        </span>
      ))}
      {op.before.slice(pairs).map((b, i) => (
        <span key={`d${i}`} className="mx-0.5 bg-rose-50 text-rose-700 line-through decoration-rose-400" dangerouslySetInnerHTML={{ __html: b.html }} />
      ))}
      {op.after.slice(pairs).map((b, i) => (
        <span key={`a${i}`} className="mx-0.5 bg-emerald-50 font-medium text-emerald-900" dangerouslySetInnerHTML={{ __html: b.html }} />
      ))}
    </div>
  );
};

export const SlotChangeReview: React.FC<SlotChangeReviewProps> = ({
  slotId,
  before,
  after,
  stale,
  evidenceCount = 0,
  onOpenEvidence,
  sourceLabel,
  onOpenSource,
  onAccept,
  onReject,
  children,
}) => {
  const [detail, setDetail] = useState(false);
  const [choices, setChoices] = useState<Record<number, boolean>>({});
  const ops = useMemo(() => diffBlocks(before, after), [before, after]);
  const hunks = hunkCount(ops);
  const accepted = (idx: number) => choices[idx] ?? true;
  const allAccepted = ops.every((o) => o.kind !== "hunk" || accepted(o.index));
  const noneAccepted = ops.every((o) => o.kind !== "hunk" || !accepted(o.index));
  const preview = stripHtml(after) || "(빈 텍스트 제안)";

  const accept = () => {
    if (noneAccepted) {
      onReject();
      return;
    }
    onAccept(
      allAccepted ? after : mergeHunks(ops, Object.fromEntries(ops.flatMap((o) => (o.kind === "hunk" ? [[o.index, accepted(o.index)]] : []))))
    );
  };

  return (
    <div data-testid={`slot-change-review-${slotId}`} className="relative">
      <div className="relative rounded ring-1 ring-emerald-400/80">{children}</div>
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative z-10 mt-1 flex select-none flex-col gap-0.5 rounded border border-emerald-200/80 bg-emerald-50/90 px-1.5 py-1 text-left text-xs font-normal leading-normal"
      >
        <div className="flex w-full min-w-0 items-start gap-1">
          <span className="shrink-0 font-mono text-xs font-bold leading-tight text-emerald-700">+</span>
          <span className="flex-1 whitespace-normal break-words text-[12px] font-medium leading-snug text-emerald-950">{preview}</span>
          {stale && (
            <span
              className="ml-1 inline-flex shrink-0 items-center gap-0.5 self-start rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800"
              title="변경안을 만든 뒤 본문이 바뀌었습니다"
            >
              <AlertTriangle className="h-2.5 w-2.5" /> 오래됨
            </span>
          )}
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 pt-0.5">
          {sourceLabel && (
            <button
              type="button"
              onClick={onOpenSource}
              className="mr-auto max-w-[60%] truncate rounded px-1 text-[10px] text-violet-700 hover:bg-violet-100"
              title="이 변경안을 낸 세션 열기"
            >
              ✦ {sourceLabel}
            </button>
          )}
          {evidenceCount > 0 && (
            <button type="button" onClick={onOpenEvidence} className="p-0.5 text-slate-400 transition hover:text-emerald-700" title="근거 보기">
              <FileSearch className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDetail((v) => !v)}
            className="p-0.5 text-slate-400 transition hover:text-slate-700"
            title={detail ? "상세 diff 접기" : "단어별 상세 diff 보기 (덩어리별 부분 승인)"}
          >
            {detail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            data-testid={`slot-change-reject-${slotId}`}
            onClick={onReject}
            className="p-0.5 text-slate-400 transition hover:text-rose-600"
            title="거절"
          >
            <X className="h-3.5 w-3.5 stroke-[2]" />
          </button>
          <button
            type="button"
            data-testid={`slot-change-accept-${slotId}`}
            onClick={accept}
            className="p-0.5 text-emerald-600 transition hover:text-emerald-800"
            title={allAccepted ? "승인" : "고른 부분만 승인"}
          >
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>
      {detail && (
        <div onClick={(e) => e.stopPropagation()} className="mt-1 space-y-1 rounded-md border border-slate-200 bg-slate-50/95 p-2 text-left text-xs font-normal leading-normal">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1 text-[10px] font-bold text-slate-500">
            <span>단어 단위 Diff 비교</span>
            <span>{hunks > 1 ? `${hunks}개 변경 블록` : "단일 블록"}</span>
          </div>
          {ops.map((op, i) =>
            op.kind === "equal" ? (
              <div key={i} className="text-[11px] text-slate-500" dangerouslySetInnerHTML={{ __html: op.block.html }} />
            ) : (
              <Hunk
                key={i}
                op={op}
                accepted={accepted(op.index)}
                selectable={hunks > 1}
                onToggle={() => setChoices((c) => ({ ...c, [op.index]: !accepted(op.index) }))}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};
