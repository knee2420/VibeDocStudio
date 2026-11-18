import React from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Search } from "lucide-react";

import type { SbScenario, SbSlot, SlotState } from "../../model/sidebarDummy";
import { activeDoc, countDoc, useScenario, useSidebarLabStore, type FillCount, type SbDepth, type SbPhase, type SlotEdit } from "../../model/useSidebarLabStore";

/* ── 사이드바 머리 (Z 시작점): 프로젝트 · 단계 표시 · 보일 단계 · 진행 ── */

const PHASES: { id: SbPhase; label: string; hint: string }[] = [
  { id: 1, label: "뼈대", hint: "Phase 1 · 기획 — 목차 짜기 (장 · 구역 이름과 의도)" },
  { id: 2, label: "서식", hint: "Phase 2 · 레퍼런스를 따라 형식 입히기 (구역마다 틀)" },
  { id: 3, label: "채우기", hint: "Phase 3 · 리소스를 근거로 쓰고 확인하기" },
];

const DEPTHS: { id: SbDepth; label: string }[] = [
  { id: 1, label: "장" },
  { id: 2, label: "구역" },
  { id: 3, label: "칸" },
];

export const SidebarHead: React.FC = () => {
  const sc = useScenario();
  const phase = useSidebarLabStore((s) => s.phase);
  const setPhase = useSidebarLabStore((s) => s.setPhase);
  const depth = useSidebarLabStore((s) => s.depth);
  const setDepth = useSidebarLabStore((s) => s.setDepth);
  const edits = useSidebarLabStore((s) => s.edits);
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const onlyOpen = useSidebarLabStore((s) => s.onlyOpen);
  const setOnlyOpen = useSidebarLabStore((s) => s.setOnlyOpen);
  const c = countDoc(activeDoc(sc, docId), edits);
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 100;

  return (
    <div className="shrink-0 border-b border-[var(--fig-border)]">
      <div className="h-10 pl-3 pr-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-800" title={sc.project}>
          {sc.project}
        </span>
        <span className="flex items-center shrink-0 text-slate-400">
          <span className="fig-icon-btn" title="찾기 (시제품)">
            <Search className="w-3.5 h-3.5" />
          </span>
          <span className="fig-icon-btn" title="더 보기 (시제품)">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </span>
        </span>
      </div>
      <div className="px-2.5 pb-2 flex gap-1" role="tablist" aria-label="작업 단계" data-testid="sb-phase-steps">
        {PHASES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={phase === p.id}
            title={p.hint}
            onClick={() => setPhase(p.id)}
            data-testid={`sb-phase-${p.id}`}
            className={`flex-1 h-7 rounded-md text-[11.5px] flex items-center justify-center gap-1 transition-colors ${
              phase === p.id ? "bg-[var(--fig-brand)] text-white font-semibold" : "bg-slate-100 text-slate-500 hover:text-slate-800"
            }`}
          >
            <span className={`tabular-nums ${phase === p.id ? "opacity-80" : "opacity-60"}`}>{p.id}</span>
            {p.label}
          </button>
        ))}
      </div>
      <div className="px-3 pb-2 flex items-center gap-2 text-[11px] text-slate-500">
        <span className="shrink-0">보일 단계</span>
        <div className="fig-seg !h-[22px] flex-1" role="group" aria-label="보일 단계">
          {DEPTHS.map((d) => (
            <button key={d.id} type="button" aria-pressed={depth === d.id} onClick={() => setDepth(d.id)} data-testid={`sb-depth-${d.id}`}>
              {d.label}까지
            </button>
          ))}
        </div>
      </div>
      {phase === 3 && (
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
              <span className="block h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular-nums shrink-0">{pct}% 끝남</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap text-[10.5px]">
            {c.empty > 0 && <span className="px-1.5 rounded bg-amber-100 text-amber-800 font-semibold tabular-nums">빈칸 {c.empty}</span>}
            {c.review - c.nocite > 0 && <span className="px-1.5 rounded bg-violet-100 text-violet-800 font-semibold tabular-nums">초안 {c.review - c.nocite}</span>}
            {c.nocite > 0 && <span className="px-1.5 rounded bg-rose-100 text-rose-700 font-semibold tabular-nums">근거 없음 {c.nocite}</span>}
            {c.wait > 0 && <span className="px-1.5 rounded bg-slate-100 text-slate-500 tabular-nums">대기 {c.wait}</span>}
            <button
              type="button"
              aria-pressed={onlyOpen}
              onClick={() => setOnlyOpen(!onlyOpen)}
              data-testid="sb-only-open"
              className={`ml-auto h-5 px-1.5 rounded border ${onlyOpen ? "bg-amber-100 border-amber-300 text-amber-800 font-semibold" : "border-slate-200 text-slate-500 hover:text-slate-800"}`}
              title="끝난 칸 · 다 끝난 구역과 장 숨기기"
            >
              남은 일만
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── 상태 표시 (F 시선이 머무는 줄 맨 왼쪽) ── */

export const GroupMark: React.FC<{ c: FillCount }> = ({ c }) => {
  if (c.total === 0) return <span className="w-3 h-3 mt-[3px] rounded-full border-[1.5px] border-dashed border-slate-400 shrink-0" title="남이 채울 칸만 있음" />;
  const p = Math.round((c.done / c.total) * 100);
  const warn = c.nocite > 0;
  if (p === 100) return <span className="w-3 h-3 mt-[3px] rounded-full bg-emerald-600 shrink-0" title="다 끝남" />;
  return (
    <span
      className={`relative w-3 h-3 mt-[3px] rounded-full border-[1.5px] shrink-0 ${warn ? "border-rose-500" : "border-emerald-600"}`}
      style={{ background: `conic-gradient(${warn ? "rgb(244 63 94)" : "rgb(5 150 105)"} 0 ${p}%, transparent 0)` }}
      title={`${p}% 끝남 · 빈칸 ${c.empty} · 확인할 초안 ${c.review}${warn ? ` · 근거 없음 ${c.nocite}` : ""}`}
    />
  );
};

const SLOT_MARK: Record<SlotState, { cls: string; title: string }> = {
  empty: { cls: "w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200", title: "빈칸" },
  draft: { cls: "w-2 h-2 rounded-[2px] bg-violet-500", title: "AI 초안 — 확인 필요" },
  nocite: { cls: "w-2 h-2 rounded-[2px] bg-rose-500 ring-2 ring-rose-200", title: "근거 없는 초안" },
  copied: { cls: "w-2 h-2 rounded-full border-[1.5px] border-slate-400", title: "레퍼런스 그대로" },
  checked: { cls: "w-2 h-2 rounded-full bg-emerald-600/70", title: "확인함" },
  wait: { cls: "w-2.5 h-2.5 rounded-full border-[1.5px] border-dashed border-slate-400", title: "남이 채울 칸" },
};

export const SlotMark: React.FC<{ state: SlotState }> = ({ state }) => (
  <span className="w-3 h-3 mt-[3px] grid place-items-center shrink-0" title={SLOT_MARK[state].title}>
    <span className={SLOT_MARK[state].cls} />
  </span>
);

/* ── 트리 줄 ── */

export type RowLevel = 0 | 1 | 2 | 3;

const NAME_CLS: Record<RowLevel, string> = {
  0: "text-[13.5px] font-bold text-slate-900",
  1: "text-[13px] font-semibold text-slate-800",
  2: "text-[12.5px] font-medium text-slate-700",
  3: "text-[12px] text-slate-600",
};

export const TreeRow: React.FC<{
  id: string;
  level: RowLevel;
  depth: number;
  open?: boolean;
  onToggle?: () => void;
  mark?: React.ReactNode;
  no?: React.ReactNode;
  name: React.ReactNode;
  tail?: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  /** 본문 스크롤이 지금 이 장에 있음 */
  inView?: boolean;
  compact?: boolean;
  dim?: boolean;
}> = ({ id, level, depth, open, onToggle, mark, no, name, tail, sub, right, inView, compact, dim }) => {
  const selected = useSidebarLabStore((s) => s.selectedId === id);
  const select = useSidebarLabStore((s) => s.select);
  const hover = useSidebarLabStore((s) => s.hover);
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={onToggle ? !!open : undefined}
      data-row-id={id}
      onClick={() => select(id)}
      onMouseEnter={() => hover(id)}
      onMouseLeave={() => hover(null)}
      className={`relative flex items-start gap-1.5 pr-2 cursor-pointer ${compact ? "py-[3px]" : "py-1"} ${
        selected ? "bg-[var(--fig-brand)]/10" : inView ? "bg-slate-100/80" : "hover:bg-slate-50"
      }`}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <span
        className="w-3.5 h-4 mt-[2px] shrink-0 grid place-items-center text-slate-400 hover:text-slate-700"
        onClick={(e) => {
          if (!onToggle) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {onToggle && (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </span>
      {mark}
      {no !== undefined && <span className="w-5 shrink-0 text-[11px] leading-5 text-slate-400 tabular-nums font-mono">{no}</span>}
      <span className="min-w-0 flex-1 flex flex-col">
        <span className={`truncate leading-5 ${NAME_CLS[level]} ${selected ? "!text-[var(--fig-brand)]" : ""} ${dim ? "!text-slate-400" : ""}`}>
          {name}
          {tail && <span className="font-normal text-slate-400 text-[11px]"> · {tail}</span>}
        </span>
        {sub && <span className="truncate text-[11px] leading-4 text-slate-500">{sub}</span>}
      </span>
      {right && <span className="shrink-0 leading-5">{right}</span>}
    </div>
  );
};

/** 부(部) 머리 — 긴 문서에서 장 위의 층. 줄이 아니라 사이 제목이라 고르지 않는다. */
export const PartRow: React.FC<{ label: string; depth: number; pages?: number }> = ({ label, depth, pages }) => (
  <div className="flex items-center gap-2 pt-2.5 pb-0.5 pr-2 text-[10.5px] font-bold tracking-wide text-slate-400" style={{ paddingLeft: 6 + depth * 14 + 20 }}>
    <span className="truncate">{label}</span>
    <span className="flex-1 h-px bg-slate-200" />
    {pages !== undefined && <span className="font-normal tabular-nums">{pages}쪽</span>}
  </div>
);

/** 자식 묶음 + 세로 안내선. 고른 줄이 이 안에 있으면 선을 파랗게 (Logseq 스레딩). */
export const Branch: React.FC<{ depth: number; onPath: boolean; children: React.ReactNode }> = ({ depth, onPath, children }) => (
  <div className="relative">
    <span
      aria-hidden
      className={`absolute top-0 bottom-1 ${onPath ? "w-[1.5px] bg-[var(--fig-brand)]" : "w-px bg-slate-200"}`}
      style={{ left: 6 + depth * 14 + 7 }}
    />
    {children}
  </div>
);

/** 장 · 구역 줄 오른쪽: 남은 일 수 (근거 없음이 있으면 빨강) */
export const Count: React.FC<{ c: FillCount; phase: SbPhase }> = ({ c, phase }) => {
  if (phase !== 3) return null;
  if (c.open > 0)
    return (
      <span className={`text-[11px] font-semibold tabular-nums ${c.nocite ? "text-rose-600" : c.empty ? "text-amber-700" : "text-violet-700"}`}>
        {c.nocite ? "!" : ""}
        {c.open}
      </span>
    );
  if (c.total === 0 && c.wait > 0) return <span className="text-[10.5px] text-slate-400">대기</span>;
  return <span className="text-[10.5px] text-slate-400">완료</span>;
};

/** 칸 줄 오른쪽 — 값보다 출처: 빈칸 / 초안 · 근거 n / 근거 없음 / 그대로 / 값 */
export const SlotRight: React.FC<{ v: SlotEdit; slot: SbSlot; phase: SbPhase }> = ({ v, slot, phase }) => {
  if (phase === 2) return slot.key ? <span className="font-mono text-[10px] text-violet-600 bg-violet-50 px-1 rounded">{slot.key}</span> : null;
  if (phase === 1) return null;
  switch (v.state) {
    case "empty":
      return <span className="text-[10.5px] font-semibold text-amber-700">빈칸</span>;
    case "draft":
      return <span className="text-[10.5px] font-semibold text-violet-700">초안 · 근거 {v.cites?.length ?? 0}</span>;
    case "nocite":
      return <span className="text-[10.5px] font-semibold text-rose-600">근거 없음</span>;
    case "copied":
      return <span className="text-[10.5px] text-slate-400">그대로</span>;
    case "wait":
      return <span className="text-[10.5px] text-slate-400">대기</span>;
    default:
      return <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 rounded max-w-[84px] truncate inline-block align-middle">{v.value}</span>;
  }
};

/** [1] [2] — 근거 리소스 번호 (사이드바 · 캔버스 공통) */
export function citeNo(sc: SbScenario, id: string): number {
  return sc.sources.findIndex((s) => s.id === id) + 1;
}

/** 고른 줄이 트리 밖에 있으면 보이게 스크롤 (본문에서 눌렀을 때) */
export function useRevealRow(container: React.RefObject<HTMLElement | null>) {
  const selectedId = useSidebarLabStore((s) => s.selectedId);
  React.useEffect(() => {
    if (!selectedId) return;
    const el = container.current?.querySelector(`[data-row-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId, container]);
}
