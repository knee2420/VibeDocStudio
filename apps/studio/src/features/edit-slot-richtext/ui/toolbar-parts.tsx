import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { COLOR_PALETTE } from "@vibe/slot-editor";
import type { TableBorderMode } from "@vibe/vdoc-schema";

const MENU_SHADOW = "0px 4px 12px 0px rgba(47,44,44,0.1)";

/** 28×28 compact toolbar button. Keeps editor focus. */
export const ToolButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, className = "", children, ...rest }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[6px] px-1 text-gray-800 transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
      active ? "bg-[#f3f3f3]" : ""
    } ${className}`}
    {...rest}
  >
    {children}
  </button>
);

export const ToolDivider: React.FC = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />;

/**
 * Toolbar button that opens a popover below it. Closes on outside click or Escape.
 * `keepFocus` buttons don't steal the editor selection; popovers with inputs may take focus.
 */
export const ToolPopover: React.FC<{
  trigger: React.ReactNode;
  title: string;
  disabled?: boolean;
  active?: boolean;
  width?: number;
  caret?: boolean;
  children: (close: () => void) => React.ReactNode;
}> = ({ trigger, title, disabled, active, width, caret, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <ToolButton title={title} disabled={disabled} active={active || open} onClick={() => setOpen((o) => !o)}>
        {trigger}
        {caret && <ChevronDown className="ml-0.5 h-3 w-3 text-slate-400" />}
      </ToolButton>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-[1100] mt-1 rounded-lg border border-[#eaeaea] bg-white p-2"
          style={{ width, boxShadow: MENU_SHADOW }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

/** yesform colour picker: 7×10 기본 팔레트 + 색상 선택 (native picker) + hex readout. */
export const ColorPalette: React.FC<{
  value: string | null;
  onPick: (color: string | null) => void;
  allowNone?: boolean;
}> = ({ value, onPick, allowNone }) => (
  <div className="w-[208px]">
    <div className="mb-1 text-[11px] text-slate-500">기본 팔레트</div>
    <div className="grid grid-cols-10">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          className={`h-5 w-5 cursor-pointer ${value?.toLowerCase() === c ? "outline-2 outline-[#0472e3] relative z-[1]" : ""}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
    <div className="mt-2 flex items-center gap-2">
      <span className="text-[11px] text-slate-500">색상 선택</span>
      <input
        type="color"
        aria-label="색상 선택"
        value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onPick(e.target.value)}
        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
      />
      <span className="font-mono text-[11px] text-slate-600">{value ?? "없음"}</span>
      {allowNone && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(null)}
          className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-neutral-100 cursor-pointer"
        >
          지우기
        </button>
      )}
    </div>
  </div>
);

/** 16px icon for one of yesform's 10 border buttons: faint 2×2 grid with the affected lines dark. */
export const BorderModeIcon: React.FC<{ mode: TableBorderMode }> = ({ mode }) => {
  const outer = { top: "M2 2H14", bottom: "M2 14H14", left: "M2 2V14", right: "M14 2V14" };
  const inner = { h: "M2 8H14", v: "M8 2V14" };
  const dark: string[] = {
    all: [...Object.values(outer), inner.h, inner.v],
    inner: [inner.h, inner.v],
    innerH: [inner.h],
    innerV: [inner.v],
    outer: Object.values(outer),
    left: [outer.left],
    top: [outer.top],
    right: [outer.right],
    bottom: [outer.bottom],
    none: [],
  }[mode];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 2H14V14H2Z M2 8H14 M8 2V14" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="1.5 1.5" />
      {dark.map((d) => (
        <path key={d} d={d} stroke="#1f2937" strokeWidth="1.6" strokeLinecap="square" />
      ))}
    </svg>
  );
};

export const BORDER_MODES: { mode: TableBorderMode; label: string }[] = [
  { mode: "all", label: "모든 테두리" },
  { mode: "inner", label: "안쪽 테두리" },
  { mode: "innerH", label: "가로 가운데" },
  { mode: "innerV", label: "세로 가운데" },
  { mode: "outer", label: "바깥쪽 테두리" },
  { mode: "left", label: "왼쪽 테두리" },
  { mode: "top", label: "위쪽 테두리" },
  { mode: "right", label: "오른쪽 테두리" },
  { mode: "bottom", label: "아래쪽 테두리" },
  { mode: "none", label: "테두리 없음" },
];

/** Re-renders on every editor transaction/selection change so toolbar state follows the caret. */
export function useEditorTick(editor: { on: (e: "transaction", f: () => void) => unknown; off: (e: "transaction", f: () => void) => unknown } | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => t + 1);
    editor.on("transaction", bump);
    return () => {
      editor.off("transaction", bump);
    };
  }, [editor]);
}
