import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileSearch, X } from "lucide-react";

import type { StagedSlotHtmlChange, VDocSlot } from "@vibe/vdoc-schema";

import { isStagedChangeStale, useAiStagingStore } from "@/entities/ai-staging";
import { selectDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

import { diffBlocks, diffWords, hunkCount, mergeHunks, type BlockOp } from "../lib/htmlDiff";
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
        <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline font-medium">
          {seg.text}
        </ins>
      )
    )}
  </>
);

const Hunk: React.FC<{
  op: Extract<BlockOp, { kind: "hunk" }>;
  accepted: boolean;
  selectable: boolean;
  onToggle: () => void;
}> = ({ op, accepted, selectable, onToggle }) => {
  const pairs = Math.min(op.before.length, op.after.length);
  return (
    <div
      className={`relative my-0.5 rounded p-1 text-[11px] leading-relaxed border-l-2 ${
        accepted ? "border-emerald-400 bg-emerald-50/50" : "border-slate-300 bg-slate-50 opacity-70"
      }`}
    >
      {selectable && (
        <label className="mr-1 inline-block cursor-pointer" title={accepted ? "이 부분 반영" : "원래 내용 유지"}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={onToggle}
            className="w-3 h-3 accent-emerald-600 cursor-pointer align-middle"
          />
        </label>
      )}
      {Array.from({ length: pairs }, (_, i) => (
        <span key={`p${i}`}>
          <Words before={op.before[i].text} after={op.after[i].text} />
        </span>
      ))}
      {op.before.slice(pairs).map((b, i) => (
        <span
          key={`d${i}`}
          className="bg-rose-50 text-rose-700 line-through decoration-rose-400 mx-0.5"
          dangerouslySetInnerHTML={{ __html: b.html }}
        />
      ))}
      {op.after.slice(pairs).map((b, i) => (
        <span
          key={`a${i}`}
          className="bg-emerald-50 text-emerald-900 font-medium mx-0.5"
          dangerouslySetInnerHTML={{ __html: b.html }}
        />
      ))}
    </div>
  );
};

/**
 * [시안 A: 본문 직하단 슬림 리본]
 * 본문(편집기)은 1픽셀도 건드리지 않고 원형 그대로 렌더링하고,
 * 슬롯 바로 아래에 두께 22px 초박형 Diff 리본 바를 부착하여 깔끔함 극대화.
 */
export const SlotChangeReview: React.FC<SlotChangeReviewProps> = ({ slot, docId, children, onOpenEvidence }) => {
  const change = useAiStagingStore((s) =>
    s.queue.find(
      (c): c is StagedSlotHtmlChange =>
        c.targetKind === "slot-html" && c.payload.slotId === slot.slotId && (!c.docId || c.docId === docId)
    )
  );
  const doc = useStudioDocumentStore(selectDocument(docId));
  const { acceptStagedChange, rejectStagedChange } = useStageAiChanges();
  const [showDetailedDiff, setShowDetailedDiff] = useState(false);
  const [choices, setChoices] = useState<Record<number, boolean>>({});

  const ops = useMemo(() => (change ? diffBlocks(slot.content, change.payload.html) : []), [change, slot.content]);

  // 변경안이 없으면 원래 본문만 순수하게 반환
  if (!change) {
    return <>{children}</>;
  }

  const hunks = hunkCount(ops);
  const accepted = (idx: number) => choices[idx] ?? true;
  const allAccepted = ops.every((o) => o.kind !== "hunk" || accepted(o.index));
  const noneAccepted = ops.every((o) => o.kind !== "hunk" || !accepted(o.index));
  const stale = isStagedChangeStale(change, doc);

  const previewNewText = stripHtml(change.payload.html) || "(빈 텍스트 제안)";

  const accept = async () => {
    if (noneAccepted) {
      rejectStagedChange(change.diffId);
      return;
    }
    const target = allAccepted
      ? change
      : {
          ...change,
          payload: {
            ...change.payload,
            html: mergeHunks(
              ops,
              Object.fromEntries(ops.flatMap((o) => (o.kind === "hunk" ? [[o.index, accepted(o.index)]] : [])))
            ),
          },
        };
    await acceptStagedChange(target);
  };

  return (
    <div
      data-testid={`slot-change-review-${slot.slotId}`}
      className="relative group/slot-review"
    >
      {/* 1. 원래 본문: 폰트, 크기, 마진, 패딩 100% 원형 보존 + 은은한 제안 암시 테두리 */}
      <div className="relative rounded ring-1 ring-emerald-400/80 transition-all">
        {children}
      </div>

      {/* 2. 본문 직하단 초박형 Diff 리본:
          - 가로폭 100%를 제안 텍스트가 온전히 차지 (작은 셀에서도 한 글자씩 떨어지지 않음)
          - X, V 등 액션 버튼은 텍스트 아래쪽으로 확 내려서 분리
          - 버튼의 네모 박스(테두리, 배경, 그림자)를 완전히 없애고 극도로 슬림한 플랫 아이콘만 배치
      */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-1 px-1.5 py-1 rounded bg-emerald-50/80 border border-emerald-200/80 text-xs select-none z-10 transition hover:bg-emerald-50 flex flex-col gap-0.5"
      >
        {/* 상단: 제안 텍스트가 가로폭 전체를 다 씀 */}
        <div className="flex items-start gap-1 w-full min-w-0">
          <span className="text-emerald-700 font-mono font-bold text-xs select-none shrink-0 leading-tight">+</span>
          <span className="text-emerald-950 font-medium text-[12px] leading-snug break-words whitespace-normal flex-1">
            {previewNewText}
          </span>
          {stale && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold shrink-0 self-start ml-1"
              title="변경안을 만든 뒤 본문이 바뀌었습니다"
            >
              <AlertTriangle className="w-2.5 h-2.5" /> 오래됨
            </span>
          )}
        </div>

        {/* 하단: X, V 및 도구가 아래로 확 내려가고, 네모 박스 없이 투명한 플랫 아이콘만 우측 배치 */}
        <div className="flex items-center justify-end gap-1.5 w-full shrink-0 pt-0.5">
          {/* 근거 앵커 버튼 */}
          {(change.evidence ?? []).length > 0 && (
            <button
              type="button"
              onClick={() => onOpenEvidence?.(change, 0)}
              className="p-0.5 text-slate-400 hover:text-emerald-700 cursor-pointer transition"
              title="지식 덱 출처 근거 보기"
            >
              <FileSearch className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 단어별 diff 펼치기/접기 */}
          <button
            type="button"
            onClick={() => setShowDetailedDiff(!showDetailedDiff)}
            className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer transition"
            title={showDetailedDiff ? "상세 diff 접기" : "단어별 상세 diff 보기"}
          >
            {showDetailedDiff ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* 거절 버튼 (네모 박스 완전 제거, 플랫 아이콘) */}
          <button
            type="button"
            data-testid={`slot-change-reject-${slot.slotId}`}
            onClick={() => rejectStagedChange(change.diffId)}
            className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer transition"
            title="거절"
          >
            <X className="w-3.5 h-3.5 stroke-[2]" />
          </button>

          {/* 승인 버튼 (네모 박스 완전 제거, 플랫 아이콘) */}
          <button
            type="button"
            data-testid={`slot-change-accept-${slot.slotId}`}
            onClick={() => void accept()}
            className="p-0.5 text-emerald-600 hover:text-emerald-800 cursor-pointer transition"
            title="승인"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>
      {/* 3. 단어별 상세 비교 토글 (필요할 때만 얇게 확장) */}
      {showDetailedDiff && (
        <div className="mt-1 p-2 rounded-md border border-slate-200 bg-slate-50/95 shadow-xs space-y-1 text-xs">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pb-1 border-b border-slate-200">
            <span>단어 단위 Diff 비교</span>
            <span>{hunks > 1 ? `${hunks}개 변경 블록` : "단일 블록"}</span>
          </div>
          {ops.map((op, i) =>
            op.kind === "equal" ? (
              <div key={i} className="text-slate-500 text-[11px]" dangerouslySetInnerHTML={{ __html: op.block.html }} />
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
