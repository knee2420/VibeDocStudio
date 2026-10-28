import React from "react";
import { Lock, Unlock, Sparkles } from "lucide-react";

import type { VDocSlot } from "@vibe/vdoc-schema";

export interface SlotMetadataCardProps {
  slot: VDocSlot;
  onToggleLock: (slotId: string) => void;
  onToggleComposer: (slotId: string) => void;
}

export const SlotMetadataCard: React.FC<SlotMetadataCardProps> = ({
  slot,
  onToggleLock,
  onToggleComposer,
}) => {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#248567] text-[11px] font-bold">
          {slot.role}
        </span>
        <code className="text-[11px] text-slate-500">{slot.slotId}</code>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-500 block">
          선택된 슬롯 이름
        </label>
        <div className="text-sm font-bold text-slate-900 mt-0.5">
          {slot.label}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
        <button
          type="button"
          onClick={() => onToggleLock(slot.slotId)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition cursor-pointer ${
            slot.constraints?.locked
              ? "bg-amber-50 border-amber-300 text-amber-900"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
          }`}
        >
          {slot.constraints?.locked ? (
            <>
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" /> 고정 틀
              잠금됨
            </>
          ) : (
            <>
              <Unlock className="w-3.5 h-3.5 text-slate-500 shrink-0" /> 가변
              슬롯 (편집 가능)
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleComposer(slot.slotId)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#248567] hover:bg-[#1d6b52] text-white text-xs font-semibold whitespace-nowrap transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          슬롯에 AI 호출
        </button>
      </div>
    </div>
  );
};

