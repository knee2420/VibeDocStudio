import React from "react";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown } from "lucide-react";

import type { SlotConstraints, VDocSlot } from "@vibe/vdoc-schema";

import {
  FONT_SIZE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  SLOT_TYPOGRAPHY_DEFAULTS,
  TEXT_COLOR_PRESETS,
} from "../model/typographyPresets";
import { useSlotContentActions } from "../model/useSlotContentActions";

const ALIGN_OPTIONS = [
  { id: "left", icon: AlignLeft, label: "왼쪽 정렬" },
  { id: "center", icon: AlignCenter, label: "가운데 정렬" },
  { id: "right", icon: AlignRight, label: "오른쪽 정렬" },
] as const;

/** 프리셋에 없는 지금 값도 고를 수 있게 맨 앞에 붙인다 (기본값 13px 같은 경우). */
const withCurrent = (options: readonly string[], current: string) => (options.includes(current) ? options : [current, ...options]);

/** 피그마 텍스트 구역처럼 회색 입력칸 + 펼침 단추. */
const FieldSelect: React.FC<{
  prefix: React.ReactNode;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
  title: string;
  testId?: string;
}> = ({ prefix, value, options, onChange, title, testId }) => (
  <label className="fig-input relative" title={title}>
    <span className="fig-input-prefix">{prefix}</span>
    <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none pr-4">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="w-3 h-3 text-black/40 absolute right-1.5 pointer-events-none" />
  </label>
);

/**
 * 슬롯 단위 타이포그래피 제약 (글자 크기 · 행간 · 정렬 · 굵기 · 색) — 피그마 "텍스트" 구역 모양.
 * 선택지 · 동작은 예전과 같다 (`updateSlotConstraints`, 프리셋 목록 그대로).
 */
export const SlotTypographyCard: React.FC<{ slot: VDocSlot }> = ({ slot }) => {
  const { updateSlotConstraints } = useSlotContentActions();
  const c = { ...SLOT_TYPOGRAPHY_DEFAULTS, ...slot.constraints };
  const update = (patch: Partial<SlotConstraints>) => updateSlotConstraints(slot.slotId, patch);
  const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

  return (
    <div className="fig-dsec" data-testid="slot-typography-section">
      <div className="fig-dsec-head">
        <span>텍스트</span>
        <span className="fig-mono font-normal text-black/40 pr-2">
          {c.fontSize} / {c.lineHeight}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FieldSelect
          testId="slot-font-size-select"
          title="글자 크기 (Font Size)"
          prefix={<span className="font-semibold">Aa</span>}
          value={c.fontSize}
          options={toOptions(withCurrent(FONT_SIZE_OPTIONS, c.fontSize))}
          onChange={(v) => update({ fontSize: v })}
        />
        <FieldSelect
          testId="slot-line-height-select"
          title="줄간격 / 행간 (Line Height)"
          prefix={<span className="text-[10px] leading-none">↕</span>}
          value={c.lineHeight}
          options={toOptions(withCurrent(LINE_HEIGHT_OPTIONS, c.lineHeight))}
          onChange={(v) => update({ lineHeight: v })}
        />
        <FieldSelect
          testId="slot-font-weight-select"
          title="굵기 (Weight)"
          prefix={<span className="font-bold">B</span>}
          value={c.fontWeight}
          options={FONT_WEIGHT_OPTIONS}
          onChange={(v) => update({ fontWeight: v })}
        />
        <div className="fig-seg" role="group" aria-label="정렬">
          {ALIGN_OPTIONS.map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" aria-pressed={c.align === id} onClick={() => update({ align: id })} title={label}>
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      <span className="fig-dlabel">색상</span>
      <div className="flex items-center gap-2">
        <label className="fig-input flex-1" title="텍스트 색상 (HEX)">
          <span className="fig-swatch" style={{ backgroundColor: c.color }} />
          <input
            type="text"
            value={c.color}
            onChange={(e) => update({ color: e.target.value })}
            placeholder="#000000"
            className="fig-mono uppercase"
          />
        </label>
        <div className="flex items-center">
          {TEXT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              aria-pressed={c.color === preset.value}
              onClick={() => update({ color: preset.value })}
              title={`${preset.label} (${preset.value})`}
              className="fig-swatch-btn"
            >
              <span className="fig-swatch block" style={{ backgroundColor: preset.value }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
