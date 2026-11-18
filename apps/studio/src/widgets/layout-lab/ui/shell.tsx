import React from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

/** 끌어서 너비를 바꾸는 칸. side 는 손잡이가 붙는 쪽 기준 (left 칸은 오른쪽 가장자리를 끈다). */
export const PanelShell: React.FC<{
  side: "left" | "right";
  width: number;
  onWidth: (w: number) => void;
  min?: number;
  max?: number;
  className?: string;
  testId?: string;
  children: React.ReactNode;
}> = ({ side, width, onWidth, min = 200, max = 720, className = "", testId, children }) => {
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (ev: PointerEvent) => {
      const d = side === "left" ? ev.clientX - x0 : x0 - ev.clientX;
      onWidth(Math.max(min, Math.min(max, w0 + d)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <aside
      data-testid={testId}
      style={{ width }}
      className={`fig-panel relative shrink-0 min-h-0 flex flex-col bg-white ${side === "left" ? "border-r" : "border-l"} border-[var(--fig-border)] ${className}`}
    >
      {children}
      <div
        onPointerDown={start}
        title="끌어서 너비 조절"
        className={`absolute top-0 bottom-0 w-1.5 z-20 cursor-col-resize hover:bg-[var(--fig-brand)]/30 ${side === "left" ? "-right-[3px]" : "-left-[3px]"}`}
      />
    </aside>
  );
};

/** 칸 머리줄 */
export const PanelHead: React.FC<{ title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; onClose?: () => void }> = ({
  title,
  meta,
  actions,
  onClose,
}) => (
  <div className="fig-section-header border-b border-[var(--fig-border)] !h-10 !pl-3">
    <span className="flex items-center gap-1.5 min-w-0 truncate">
      {title}
      {meta && <span className="fig-section-meta">{meta}</span>}
    </span>
    <span className="flex items-center gap-0.5 shrink-0">
      {actions}
      {onClose && (
        <button type="button" className="fig-icon-btn" onClick={onClose} title="닫기">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  </div>
);

export interface TabDef {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
}

/** 칸 머리 탭 (피그마 글자 탭) */
export const PanelTabs: React.FC<{ tabs: TabDef[]; value: string; onChange: (id: string) => void; actions?: React.ReactNode }> = ({
  tabs,
  value,
  onChange,
  actions,
}) => (
  <div className="h-10 pl-1.5 pr-1.5 border-b border-[var(--fig-border)] flex items-center justify-between shrink-0">
    <div role="tablist" className="flex items-center">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className="fig-tab gap-1"
          data-testid={`lab-tab-${t.id}`}
        >
          <t.icon className="w-3.5 h-3.5" />
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-0.5">{actions}</div>
  </div>
);

export interface RailItem {
  id: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: number;
}

/** 접힌 칸 — 아이콘 레일. 누르면 펴고, 올려 두면 onPeek 로 미리 보기. */
export const Rail: React.FC<{
  side: "left" | "right";
  items: RailItem[];
  onPick: (id: string) => void;
  onPeek?: (id: string | null) => void;
  floating?: boolean;
}> = ({ side, items, onPick, onPeek, floating }) => (
  <div
    className={`fig-panel w-11 shrink-0 flex flex-col items-center gap-1 py-2 z-30 ${
      floating
        ? `absolute top-3 ${side === "left" ? "left-3" : "right-3"} rounded-xl bg-white/95 border border-[var(--fig-border)] shadow-md`
        : `bg-[#fafafa] ${side === "left" ? "border-r" : "border-l"} border-[var(--fig-border)]`
    }`}
    onMouseLeave={() => onPeek?.(null)}
  >
    {items.map((it) => (
      <button
        key={it.id}
        type="button"
        data-testid={`lab-rail-${it.id}`}
        onClick={() => onPick(it.id)}
        onMouseEnter={() => onPeek?.(it.id)}
        title={it.label}
        className={`relative w-9 h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] ${
          it.active ? "bg-[var(--fig-selected)] text-[var(--fig-brand)]" : "text-[var(--fig-text-secondary)] hover:bg-black/5 hover:text-[var(--fig-text)]"
        }`}
      >
        <it.icon className="w-4 h-4" />
        <span className="leading-none">{it.label}</span>
        {it.badge ? (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--fig-brand)] text-white text-[9px] leading-[14px] text-center">
            {it.badge}
          </span>
        ) : null}
      </button>
    ))}
  </div>
);

/** 레퍼런스 · 리소스 구분 색 (같은 자료실이어도 역할이 다르다) */
export const REF_TONE = "text-[#9747ff]";
export const RES_TONE = "text-[#0f9d58]";

export const KindBadge: React.FC<{ kind: string }> = ({ kind }) => (
  <span className="shrink-0 px-1 rounded text-[10px] leading-4 bg-black/[0.05] text-[var(--fig-text-secondary)]">{kind}</span>
);
