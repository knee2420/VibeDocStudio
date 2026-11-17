import React from "react";

import type { CharStat } from "@/shared/lib";

import type { BlockCounts } from "../lib/blockChanges";
import { formatBlockCounts } from "../lib/blockChanges";

/**
 * 블록 변경 수를 짧게: `✎2 +1 −1 ↕1` (고침 주황 · 추가 초록 · 삭제 빨강 · 이동 회색). 0 인 것은 뺀다.
 * 올리면 "블록 2개 고침 · 1개 추가 …" 와 글자 수.
 */
export const BlockCountBadge: React.FC<{ counts: BlockCounts; chars?: CharStat; className?: string }> = ({ counts, chars, className = "" }) => {
  const title = [formatBlockCounts(counts), chars && `글자 +${chars.added.toLocaleString()} −${chars.removed.toLocaleString()}`].filter(Boolean).join("\n");
  return (
    <span data-testid="block-count" title={title} className={`inline-flex items-center gap-1.5 shrink-0 text-[11px] leading-none tabular-nums ${className}`}>
      {counts.edited > 0 && <span className="text-[#bf6c00]">✎{counts.edited}</span>}
      {counts.added > 0 && <span className="text-[#1a7f37]">+{counts.added}</span>}
      {counts.removed > 0 && <span className="text-[#cf222e]">−{counts.removed}</span>}
      {counts.moved > 0 && <span className="text-black/45">↕{counts.moved}</span>}
    </span>
  );
};
