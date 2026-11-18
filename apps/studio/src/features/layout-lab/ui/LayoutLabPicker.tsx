import React from "react";
import { Check, ChevronDown, FlaskConical, ListTree, type LucideIcon } from "lucide-react";

import { LAB_VERSIONS, OUTLINE_VERSIONS, useLayoutLabStore, type LabVersion } from "../model/useLayoutLabStore";

function LabPicker<T extends string>({
  label,
  icon: Icon,
  versions,
  value,
  onChange,
  testId,
  note,
}: {
  label: string;
  icon: LucideIcon;
  versions: LabVersion<T>[];
  value: T;
  onChange: (v: T) => void;
  testId: string;
  note: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = versions.find((v) => v.id === value) ?? versions[0];

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-6 pl-1.5 pr-1 rounded-md flex items-center gap-1 text-[11.5px] border cursor-pointer ${
          value === "current" ? "border-slate-300/80 bg-white text-slate-600 hover:text-slate-900" : "border-violet-300 bg-violet-50 text-violet-800"
        }`}
        title={`${label} — 시제품 고르기`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="font-medium">{label}</span>
        <span className="text-black/40">·</span>
        <span>{current.name}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="fig-panel absolute left-0 top-7 z-[80] w-[380px] rounded-lg bg-white border border-[var(--fig-border)] shadow-xl p-1">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              data-testid={`${testId.replace("-picker", "")}-${v.id}`}
              onClick={() => {
                onChange(v.id);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded-md flex gap-2 hover:bg-[var(--fig-hover)] ${v.id === value ? "bg-[var(--fig-selected)]" : ""}`}
            >
              <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${v.id === value ? "text-[var(--fig-brand)]" : "opacity-0"}`} />
              <span className="min-w-0">
                <span className="block font-semibold">{v.name}</span>
                <span className="block text-[11.5px] text-[var(--fig-text-secondary)]">{v.desc}</span>
                {v.refs && <span className="block text-[11px] text-[var(--fig-text-tertiary)]">참고 · {v.refs}</span>}
              </span>
            </button>
          ))}
          <p className="px-2 pt-1.5 pb-1 text-[11px] text-[var(--fig-text-tertiary)] border-t border-[var(--fig-border)] mt-1">{note}</p>
        </div>
      )}
    </div>
  );
}

/** 머리줄의 "레이아웃 실험" · "아웃라인 실험" 버전 고르기. */
export const LayoutLabPicker: React.FC = () => {
  const version = useLayoutLabStore((s) => s.version);
  const setVersion = useLayoutLabStore((s) => s.setVersion);
  const outline = useLayoutLabStore((s) => s.outline);
  const setOutline = useLayoutLabStore((s) => s.setOutline);
  return (
    <div className="flex items-center gap-1 ml-2">
      <LabPicker
        label="레이아웃 실험"
        icon={FlaskConical}
        versions={LAB_VERSIONS}
        value={version}
        onChange={setVersion}
        testId="layout-lab-picker"
        note="A~E 는 더미 데이터로 만든 배치 시제품입니다. 실제 문서는 바뀌지 않습니다."
      />
      <LabPicker
        label="아웃라인 실험"
        icon={ListTree}
        versions={OUTLINE_VERSIONS}
        value={outline}
        onChange={setOutline}
        testId="outline-lab-picker"
        note="고른 아웃라인은 레이아웃 시제품의 왼쪽 '구조' 칸에 들어갑니다 (레이아웃이 '지금 화면'이면 A 배치로 보여 줍니다)."
      />
    </div>
  );
};
