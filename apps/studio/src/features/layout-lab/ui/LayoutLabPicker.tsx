import React from "react";
import { Check, ChevronDown, CreditCard, FlaskConical, History, ListTree, PanelLeft, type LucideIcon } from "lucide-react";

import { LAB_VERSIONS, OUTLINE_VERSIONS, SIDEBAR_VERSIONS, useLayoutLabStore, type LabVersion } from "../model/useLayoutLabStore";

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

/**
 * 머리줄: 시제품 하나 + 이전 실험 메뉴.
 * 실험이 드롭다운 셋 × 5~7개로 늘어 무엇을 봤는지 알 수 없게 되어, 지금 보는 시제품 하나만 앞에 두고
 * 레이아웃 A–E · 아웃라인 O1–O7 · 사이드바 A–E 는 "이전 실험" 안으로 넣었다.
 */
export const LayoutLabPicker: React.FC = () => {
  const version = useLayoutLabStore((s) => s.version);
  const setVersion = useLayoutLabStore((s) => s.setVersion);
  const outline = useLayoutLabStore((s) => s.outline);
  const setOutline = useLayoutLabStore((s) => s.setOutline);
  const sidebar = useLayoutLabStore((s) => s.sidebar);
  const setSidebar = useLayoutLabStore((s) => s.setSidebar);
  const proto = useLayoutLabStore((s) => s.proto);
  const setProto = useLayoutLabStore((s) => s.setProto);
  const [old, setOld] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!old) return;
    const close = (e: MouseEvent) => {
      // 안쪽 드롭다운 목록을 누를 때는 닫지 않는다
      if (!ref.current?.contains(e.target as Node)) setOld(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [old]);
  const oldOn = version !== "current" || outline !== "current" || sidebar !== "current";

  return (
    <div className="flex items-center gap-1 ml-2">
      <button
        type="button"
        onClick={() => setProto(!proto)}
        aria-pressed={proto}
        className={`h-6 px-2 rounded-md flex items-center gap-1 text-[11.5px] border cursor-pointer ${
          proto ? "border-violet-400 bg-violet-600 text-white" : "border-slate-300/80 bg-white text-slate-700 hover:text-slate-900"
        }`}
        title="사용자 되어 보기 — 카드 상품안내장 시제품"
        data-testid="proto-toggle"
      >
        <CreditCard className="w-3.5 h-3.5" />
        <span className="font-medium">시제품 · 카드 안내장</span>
      </button>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOld((o) => !o)}
          className={`h-6 pl-1.5 pr-1 rounded-md flex items-center gap-1 text-[11.5px] border cursor-pointer ${oldOn && !proto ? "border-slate-400 bg-slate-100 text-slate-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          title="지난 실험들 — 레이아웃 · 아웃라인 · 사이드바"
          data-testid="old-lab-toggle"
        >
          <History className="w-3.5 h-3.5" />
          이전 실험
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {old && (
          <div className="fig-panel absolute left-0 top-7 z-[80] rounded-lg bg-white border border-[var(--fig-border)] shadow-xl p-2 flex flex-col gap-1.5 w-[300px]">
            <p className="text-[11px] text-[var(--fig-text-tertiary)] px-0.5">지난 실험이에요. 고르면 시제품을 끄고 그 화면을 보여 줘요.</p>
            <LabPicker label="레이아웃" icon={FlaskConical} versions={LAB_VERSIONS} value={version} onChange={(v) => (setProto(false), setVersion(v))} testId="layout-lab-picker" note="A~E 는 더미 데이터로 만든 배치 시제품입니다." />
            <LabPicker label="아웃라인" icon={ListTree} versions={OUTLINE_VERSIONS} value={outline} onChange={(v) => (setProto(false), setOutline(v))} testId="outline-lab-picker" note="고른 아웃라인은 레이아웃 시제품의 왼쪽 '구조' 칸에 들어갑니다." />
            <LabPicker label="사이드바" icon={PanelLeft} versions={SIDEBAR_VERSIONS} value={sidebar} onChange={(v) => (setProto(false), setSidebar(v))} testId="sidebar-lab-picker" note="사이드바 시안 A–E (카드 안내장 시제품 전 단계)." />
          </div>
        )}
      </div>
    </div>
  );
};
