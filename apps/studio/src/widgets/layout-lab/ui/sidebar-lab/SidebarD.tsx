import React from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";

import { indexOf, type SbChapter, type SbDoc, type SbSection } from "../../model/sidebarDummy";
import { activeDoc, countChapter, countSection, useScenario, useSidebarLabStore, type SbPhase } from "../../model/useSidebarLabStore";
import { useRevealRow } from "./parts";

/**
 * 시안 D · 덜어낸 목차.
 * 사이드바가 답할 질문은 하나 — "내 기획안이 어떻게 생겼고, 나는 지금 어디 있나".
 *  - 줄 = 화살표 + 이름. 층은 글자 크기 · 굵기 · 들여쓰기로만. 장 앞 회색 번호.
 *  - 지금 위치: 본문이 있는 장에 옅은 배경, 위에 경로 한 줄.
 *  - 신호는 하나: "손댈 게 있음" 점 (한 색, Phase 3 만). 숫자 · 파이 · 막대 · 칸 상태 구분은 캔버스 몫.
 *  - 칸은 사이드바에 없다 (구역까지). 긴 문서는 장까지만 펼친 채로 열고, 부는 접는 머리, 찾기로 줄인다.
 */
export const SidebarD: React.FC = () => {
  const sc = useScenario();
  const scroller = React.useRef<HTMLDivElement>(null);
  useRevealRow(scroller);
  const [q, setQ] = React.useState("");
  const query = q.trim();

  return (
    <aside className="fig-panel w-[280px] shrink-0 min-h-0 flex flex-col bg-white border-r border-[var(--fig-border)]" data-testid="sb-sidebar-d">
      <div className="shrink-0 px-3 pt-2.5 pb-2 flex flex-col gap-2 border-b border-[var(--fig-border)]">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-800" title={sc.project}>
            {sc.project}
          </span>
          <PhaseTabs />
        </div>
        <label className="h-7 px-2 rounded-md bg-slate-100 flex items-center gap-1.5 text-slate-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-slate-300">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="목차에서 찾기"
            className="flex-1 min-w-0 bg-transparent outline-none text-[12px] text-slate-800 placeholder:text-slate-400"
            data-testid="sb-d-search"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} title="지우기" className="text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
      </div>
      <Crumb />
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto py-1.5 pb-8" role="tree" aria-label="문서 목차">
        {sc.docs.map((d) => (
          <DocBlock key={d.id} doc={d} query={query} />
        ))}
      </div>
    </aside>
  );
};

/** 단계 표시 — 글자 탭 정도로만 */
const PhaseTabs: React.FC = () => {
  const phase = useSidebarLabStore((s) => s.phase);
  const setPhase = useSidebarLabStore((s) => s.setPhase);
  const tabs: { id: SbPhase; label: string }[] = [
    { id: 1, label: "뼈대" },
    { id: 2, label: "서식" },
    { id: 3, label: "채우기" },
  ];
  return (
    <div className="flex items-center gap-2.5 shrink-0" role="tablist" aria-label="작업 단계">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={phase === t.id}
          onClick={() => setPhase(t.id)}
          data-testid={`sb-phase-${t.id}`}
          className={`text-[11.5px] pb-0.5 border-b-[1.5px] ${phase === t.id ? "text-slate-900 font-semibold border-slate-900" : "text-slate-400 border-transparent hover:text-slate-700"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

/** 지금 어디 — 한 줄 */
const Crumb: React.FC = () => {
  const sc = useScenario();
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const select = useSidebarLabStore((s) => s.select);
  const doc = activeDoc(sc, docId);
  const ch = viewChapterId ? indexOf(sc).get(viewChapterId)?.chapter : undefined;
  if (!ch) return null;
  const no = doc.chapters.indexOf(ch) + 1;
  return (
    <button
      type="button"
      onClick={() => select(ch.id)}
      className="shrink-0 h-7 px-3 flex items-center gap-1 text-[11px] text-slate-500 border-b border-[var(--fig-border)] whitespace-nowrap overflow-hidden hover:bg-slate-50 text-left"
      title="본문이 지금 있는 곳"
    >
      {ch.part && (
        <>
          <span className="truncate max-w-[45%]">{ch.part}</span>
          <span className="text-slate-300">›</span>
        </>
      )}
      <span className="truncate text-slate-700">
        {no} {ch.name}
      </span>
    </button>
  );
};

/* ── 줄 ── */

const NAME: Record<0 | 1 | 2, string> = {
  0: "text-[13px] font-semibold text-slate-900",
  1: "text-[13px] text-slate-800",
  2: "text-[12px] text-slate-500",
};

const Row: React.FC<{
  id: string;
  level: 0 | 1 | 2;
  indent: number;
  open?: boolean;
  onToggle?: () => void;
  no?: number;
  name: string;
  /** 손댈 게 있음 */
  dot?: boolean;
  here?: boolean;
  /** 이 줄 안의 칸을 고름 (칸은 사이드바에 없으니 구역 줄을 대신 칠한다) */
  holds?: boolean;
}> = ({ id, level, indent, open, onToggle, no, name, dot, here, holds }) => {
  const isSel = useSidebarLabStore((s) => s.selectedId === id);
  const selected = isSel || !!holds;
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
      className={`mx-1.5 rounded-md flex items-center gap-1 pr-2 h-[26px] cursor-pointer ${selected ? "bg-[var(--fig-brand)]/10" : here ? "bg-slate-100" : "hover:bg-slate-50"}`}
      style={{ paddingLeft: 4 + indent * 14 }}
    >
      <span
        className="w-4 h-4 shrink-0 grid place-items-center text-slate-400 hover:text-slate-700"
        onClick={(e) => {
          if (!onToggle) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {onToggle && (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </span>
      {no !== undefined && <span className="w-5 shrink-0 text-[11px] text-slate-400 tabular-nums">{no}</span>}
      <span className={`min-w-0 flex-1 truncate ${NAME[level]} ${selected ? "!text-[var(--fig-brand)] font-semibold" : ""}`}>{name}</span>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="손댈 게 있음" />}
    </div>
  );
};

/* ── 나무 ── */

const match = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());

const DocBlock: React.FC<{ doc: SbDoc; query: string }> = ({ doc, query }) => {
  const docOpen = useSidebarLabStore((s) => s.expanded[doc.id] ?? s.activeDocId === doc.id);
  const expanded = useSidebarLabStore((s) => s.expanded);
  const setOpen = useSidebarLabStore((s) => s.setOpen);
  const open = query ? true : docOpen;

  // 찾기: 이름이 맞는 장, 또는 이름이 맞는 구역을 가진 장만
  const hits = (ch: SbChapter) => match(ch.name, query) || ch.sections.some((s) => match(s.name, query));
  const chapters = query ? doc.chapters.filter(hits) : doc.chapters;
  if (query && chapters.length === 0) return null;

  return (
    <div className="mb-1">
      <Row id={doc.id} level={0} indent={0} open={open} onToggle={() => setOpen(doc.id, !docOpen)} name={doc.name} />
      {open &&
        chapters.map((ch) => {
          const i = doc.chapters.indexOf(ch);
          const newPart = ch.part && ch.part !== doc.chapters[i - 1]?.part;
          const partKey = `part:${doc.id}:${ch.part}`;
          const partOpen = query ? true : expanded[partKey] !== false;
          return (
            <React.Fragment key={ch.id}>
              {newPart && !query && <PartHead label={ch.part!} open={partOpen} onToggle={() => setOpen(partKey, !partOpen)} />}
              {partOpen && <ChapterRows ch={ch} no={i + 1} query={query} />}
            </React.Fragment>
          );
        })}
    </div>
  );
};

/** 부 머리 — 접는 사이 제목 (고르는 줄이 아니다) */
const PartHead: React.FC<{ label: string; open: boolean; onToggle: () => void }> = ({ label, open, onToggle }) => (
  <button type="button" onClick={onToggle} className="w-full flex items-center gap-1 pl-[22px] pr-3 pt-3 pb-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 text-left">
    {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
    <span className="truncate">{label}</span>
  </button>
);

const ChapterRows: React.FC<{ ch: SbChapter; no: number; query: string }> = ({ ch, no, query }) => {
  const phase = useSidebarLabStore((s) => s.phase);
  const edits = useSidebarLabStore((s) => s.edits);
  // 장은 접힌 채로 연다 — 펼친 것, 고른 것의 조상만 열린다 (select 가 조상을 펼친다)
  const own = useSidebarLabStore((s) => s.expanded[ch.id]);
  const here = useSidebarLabStore((s) => s.viewChapterId === ch.id);
  const setOpen = useSidebarLabStore((s) => s.setOpen);
  const open = query ? true : !!own;
  const dot = phase === 3 && countChapter(ch, edits).open > 0;
  const sections = query && !match(ch.name, query) ? ch.sections.filter((s) => match(s.name, query)) : ch.sections;
  return (
    <>
      <Row id={ch.id} level={1} indent={1} open={open} onToggle={() => setOpen(ch.id, !open)} no={no} name={ch.name} dot={dot && !open} here={here} />
      {open && sections.map((s) => <SectionRow key={s.id} s={s} phase={phase} />)}
    </>
  );
};

const SectionRow: React.FC<{ s: SbSection; phase: SbPhase }> = ({ s, phase }) => {
  const sc = useScenario();
  const edits = useSidebarLabStore((st) => st.edits);
  const holds = useSidebarLabStore((st) => !!st.selectedId && indexOf(sc).get(st.selectedId)?.anc[2] === s.id);
  const dot = phase === 3 && countSection(s, edits).open > 0;
  return <Row id={s.id} level={2} indent={2} name={s.name} dot={dot} holds={holds} />;
};
