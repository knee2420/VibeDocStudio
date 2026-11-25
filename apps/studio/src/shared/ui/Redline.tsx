import React from "react";

import type { CharStat, WordSeg } from "@/shared/lib";

/** 지운 글: 빨강 취소선 · 넣은 글: 초록 밑줄 (워드 변경 내용 추적 · 구글 문서 제안과 같은 표기). */
export const DEL_CLASS = "bg-[#ffebe9] text-[#a40e26] line-through decoration-[#a40e26]/60 rounded-[2px]";
export const ADD_CLASS = "bg-[#dafbe1] text-[#116329] underline decoration-[#116329]/40 underline-offset-2 rounded-[2px]";

export const RedlineSegments: React.FC<{ segs: WordSeg[]; show?: "both" | "before" | "after" }> = ({ segs, show = "both" }) => (
  <>
    {segs.map((s, i) =>
      s.kind === "same" ? (
        <span key={i}>{s.text}</span>
      ) : s.kind === "del" ? (
        show === "after" ? null : (
          <del key={i} className={show === "both" ? DEL_CLASS : "bg-[#ffebe9] no-underline rounded-[2px]"}>
            {s.text}
          </del>
        )
      ) : show === "before" ? null : (
        <ins key={i} className={show === "both" ? ADD_CLASS : "bg-[#dafbe1] no-underline rounded-[2px]"}>
          {s.text}
        </ins>
      ),
    )}
  </>
);

/** "+120자 −30자" — 0 인 쪽은 흐리게. */
export const CharStatText: React.FC<{ stat: CharStat; className?: string }> = ({ stat, className = "" }) => (
  <span
    data-testid="char-stat"
    className={`inline-flex items-center gap-1 shrink-0 tabular-nums text-[11px] leading-none ${className}`}
    title={`${stat.added.toLocaleString()}자 넣음 · ${stat.removed.toLocaleString()}자 지움 (공백 제외)`}
  >
    <span className={stat.added ? "text-[#1a7f37]" : "text-black/25"}>+{stat.added.toLocaleString()}</span>
    <span className={stat.removed ? "text-[#9a3412]" : "text-black/25"}>−{stat.removed.toLocaleString()}</span>
  </span>
);
