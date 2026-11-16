import React from "react";
import { Lock, Sparkles, Unlock } from "lucide-react";

import type { VDocSlot } from "@vibe/vdoc-schema";

export interface SlotMetadataCardProps {
  slot: VDocSlot;
  onToggleLock: (slotId: string) => void;
  onToggleComposer: (slotId: string) => void;
}

/**
 * 인스펙터 맨 위 (피그마 디자인 패널의 선택 머리): 슬롯 이름 · 역할 · id, 잠금 전환, 인라인 AI 열기.
 * 기능은 그대로다 — 잠금 전환(`onToggleLock`)과 슬롯 인라인 AI 열기(`onToggleComposer`).
 */
export const SlotMetadataCard: React.FC<SlotMetadataCardProps> = ({ slot, onToggleLock, onToggleComposer }) => {
  const locked = Boolean(slot.constraints?.locked);
  return (
    <div className="fig-dsec">
      <div className="fig-dsec-head !h-10">
        <span className="min-w-0 truncate text-[13px]" title={slot.label}>
          {slot.label}
        </span>
        <div className="fig-dsec-actions">
          <button
            type="button"
            data-testid="slot-lock-toggle-btn"
            aria-pressed={locked}
            onClick={() => onToggleLock(slot.slotId)}
            title={locked ? "고정 틀 잠금됨 — 클릭하면 편집 가능 (가변 슬롯)" : "가변 슬롯 (편집 가능) — 클릭하면 고정 틀로 잠금"}
            className="fig-icon-btn"
          >
            {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            data-testid="slot-open-inline-ai-btn"
            onClick={() => onToggleComposer(slot.slotId)}
            title="이 슬롯에 인라인 AI 열기 (Ctrl+K)"
            className="fig-btn"
          >
            <Sparkles className="w-3 h-3 text-[#9747ff]" />
            프롬프트로 편집
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="fig-badge !ml-0">{slot.role}</span>
        <span className={`fig-badge !ml-0 ${locked ? "!bg-[#fff1e5] !text-[#b54708]" : ""}`}>{locked ? "고정 틀 잠금됨" : "가변 슬롯 · 편집 가능"}</span>
        <code className="fig-mono text-black/40 truncate ml-auto" title={slot.slotId}>
          {slot.slotId}
        </code>
      </div>
    </div>
  );
};
