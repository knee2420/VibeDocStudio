import React from "react";
import { AlignCenter, AlignLeft, AlignRight, Type } from "lucide-react";

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
  { id: "left", icon: AlignLeft },
  { id: "center", icon: AlignCenter },
  { id: "right", icon: AlignRight },
] as const;

const chip = (active: boolean) =>
  active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100";

/** 슬롯 단위 타이포그래피 제약 (글자 크기 · 행간 · 정렬 · 굵기 · 색). */
export const SlotTypographyCard: React.FC<{ slot: VDocSlot }> = ({ slot }) => {
  const { updateSlotConstraints } = useSlotContentActions();
  const c = { ...SLOT_TYPOGRAPHY_DEFAULTS, ...slot.constraints };
  const update = (patch: Partial<SlotConstraints>) => updateSlotConstraints(slot.slotId, patch);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-blue-600" />
          타이포그래피 및 스타일 제약
        </h4>
        <span className="text-[10px] text-slate-400 font-mono">
          {c.fontSize} / {c.lineHeight}
        </span>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-600 flex items-center justify-between">
          <span>글자 크기 (Font Size)</span>
          <span className="text-slate-400 font-mono text-[10px]">{c.fontSize}</span>
        </label>
        <div className="flex flex-wrap gap-1">
          {FONT_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => update({ fontSize: size })}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition ${chip(c.fontSize === size)}`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-600 flex items-center justify-between">
          <span>줄간격 / 행간 (Line Height)</span>
          <span className="text-slate-400 font-mono text-[10px]">{c.lineHeight}</span>
        </label>
        <div className="flex gap-1">
          {LINE_HEIGHT_OPTIONS.map((lh) => (
            <button
              key={lh}
              type="button"
              onClick={() => update({ lineHeight: lh })}
              className={`flex-1 py-0.5 rounded text-[11px] font-medium border text-center cursor-pointer transition ${chip(c.lineHeight === lh)}`}
            >
              {lh}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
        <div>
          <label className="text-[11px] font-medium text-slate-600 block mb-1">정렬</label>
          <div className="flex rounded border border-slate-200 bg-white overflow-hidden">
            {ALIGN_OPTIONS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => update({ align: id })}
                className={`flex-1 p-1 flex items-center justify-center cursor-pointer transition ${
                  c.align === id ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-600 block mb-1">굵기 (Weight)</label>
          <select
            value={c.fontWeight}
            onChange={(e) => update({ fontWeight: e.target.value })}
            className="w-full text-xs bg-white border border-slate-200 rounded p-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {FONT_WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pt-1 border-t border-slate-200/80">
        <label className="text-[11px] font-medium text-slate-600 block mb-1">텍스트 색상 (Color)</label>
        <div className="flex items-center gap-1.5">
          {TEXT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => update({ color: preset.value })}
              title={`${preset.label} (${preset.value})`}
              style={{ backgroundColor: preset.value }}
              className={`w-4 h-4 rounded-full cursor-pointer transition hover:scale-125 ${
                c.color === preset.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
              }`}
            />
          ))}
          <input
            type="text"
            value={c.color}
            onChange={(e) => update({ color: e.target.value })}
            className="ml-auto w-20 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-700 focus:outline-none"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );
};
