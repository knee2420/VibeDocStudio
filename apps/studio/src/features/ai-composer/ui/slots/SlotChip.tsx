import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ContextSlot, SlotState, SlotTone } from "./types";

interface SlotChipProps {
  slot: ContextSlot;
  state: SlotState;
  open: boolean;
  onToggleOpen: () => void;
}

const MONO_ON = {
  containerOn: "bg-white border-[#e4e4e7] text-[#18181b] hover:bg-[#fafafa]",
  switchOn: "text-[#18181b] hover:bg-[#f4f4f5]",
  dividerOn: "bg-[#e4e4e7]",
  iconOn: "text-[#52525b]",
};

const TONE_STYLES: Record<
  SlotTone,
  {
    containerOn: string;
    switchOn: string;
    dividerOn: string;
    iconOn: string;
  }
> = {
  amber: MONO_ON,
  violet: MONO_ON,
  blue: MONO_ON,
};

export const SlotChip: React.FC<SlotChipProps> = ({ slot, state, open, onToggleOpen }) => {
  const { on, setOn, summary, tooltip } = state;
  const toneStyle = TONE_STYLES[slot.tone];

  // 요약 텍스트 결정 (P1, §5.3)
  const summaryText = React.useMemo(() => {
    if (!on || summary.state === "off") return "꺼짐";
    if (summary.state === "empty") return "없음";
    if (summary.state === "waiting") return summary.primary || "선택 필요";
    if (summary.secondary) return `${summary.primary} · ${summary.secondary}`;
    return summary.primary;
  }, [on, summary]);

  const switchTitle = [
    tooltip,
    `지금: ${on ? "켜짐 — 누르면 끕니다" : "꺼짐 — 누르면 켭니다"}`,
  ].join("\n");

  return (
    <div
      className={`min-w-[120px] flex-1 inline-flex items-center rounded-md border text-[11px] transition shadow-2xs select-none ${
        on ? toneStyle.containerOn : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
      }`}
    >
      {/* 1. 좌측 스위치: [아이콘 라벨] */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-testid={slot.testIds.switch}
        onClick={(e) => {
          e.stopPropagation();
          setOn(!on);
        }}
        title={switchTitle}
        className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-l-md font-bold cursor-pointer transition shrink-0 ${
          on ? toneStyle.switchOn : "text-slate-400 line-through hover:text-slate-600"
        }`}
      >
        <span className={on ? toneStyle.iconOn : "text-slate-400"}>{slot.icon}</span>
        <span>{slot.label}</span>
      </button>

      {/* 수직 구분선 */}
      <div className={`w-px h-3 shrink-0 ${on ? toneStyle.dividerOn : "bg-slate-200"}`} />

      {/* 2. 우측 요약 버튼: [요약 텍스트 ▾] */}
      <button
        type="button"
        data-testid={slot.testIds.button}
        aria-expanded={open}
        onClick={onToggleOpen}
        title={`${slot.label} 세부 설정 열기\n${tooltip}`}
        className="flex-1 min-w-0 inline-flex items-center justify-between gap-1 px-1.5 py-1 rounded-r-md cursor-pointer transition hover:bg-black/5"
      >
        <span
          data-testid={summary.testId}
          className="flex items-center gap-1 min-w-0 truncate text-left"
        >
          {summary.prefixIcon}
          <span className={`truncate ${on ? "font-semibold" : "line-through opacity-70"}`}>
            {summaryText}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 shrink-0 ml-1">
          {summary.extraBadge}
          {open ? (
            <ChevronDown className="w-3 h-3 opacity-60" />
          ) : (
            <ChevronUp className="w-3 h-3 opacity-60" />
          )}
        </span>
      </button>
    </div>
  );
};
