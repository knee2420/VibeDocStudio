import React from "react";
import { ArrowDownToLine, ChevronDown, ChevronRight, Eye, EyeOff, Maximize2, MessageSquarePlus, Plus, Search, X } from "lucide-react";

import type { SbChapter, SbDoc, SbProject, SbSection } from "../../model/sidebarDummy";
import { indexOf } from "../../model/sidebarDummy";
import { getScenario } from "../../model/sidebarScenarios";
import { DRAG_MIME, useELabStore, type DragNode } from "../../model/useELabStore";
import { useLabStore } from "../../model/useLabStore";
import { activeDoc, countChapter, countSection, useScenario, useSidebarLabStore, type SbPhase } from "../../model/useSidebarLabStore";

/**
 * 시안 E · 작업 공간 아웃라이너.
 * D 처럼 조용하되, 목차가 실제로 일을 한다:
 *  - 아웃라이너: 두 번 눌러 이름 고치기 · Enter 새 줄 · Tab / Shift+Tab 들이기 · 내기 · Alt+↑↓ 옮기기 · 끌어 놓기 ·
 *    번호(·)를 눌러 그 장만 확대 · Ctrl+Z 되돌리기. 고치면 캔버스가 따라 그려진다.
 *  - 요약 한 줄: Phase 1 에 쓴 의도가 목차에 보인다 (끄고 켤 수 있다).
 *  - 작업 공간: 같은 작업 공간의 다른 프로젝트(초판 · 개정판 · 단행본 · 칼럼)가 아래에 뿌리로 붙는다.
 *    읽기 전용 — 누르면 미리보기, 끌어서 대화에 참고로 붙이거나 내 목차로 가져온다.
 *  - 신호는 D 와 같이 하나: 손댈 게 있음 점 (Phase 3).
 */

/* ── 펼친 줄 목록 (키보드 이동 · 그리기 공용) ── */

type FlatRow =
  | { t: "doc"; id: string; doc: SbDoc; depth: number; open: boolean }
  | { t: "part"; id: string; label: string; depth: number }
  | { t: "chapter"; id: string; doc: SbDoc; ch: SbChapter; no: number; depth: number; open: boolean }
  | { t: "section"; id: string; s: SbSection; ch: SbChapter; depth: number };

const has = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());

function flatten(docs: SbDoc[], expanded: Record<string, boolean>, activeDocId: string, zoomId: string | null, q: string): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const doc of docs) {
    if (zoomId) {
      const ch = doc.chapters.find((c) => c.id === zoomId);
      if (!ch) continue;
      for (const s of ch.sections) if (!q || has(s.name, q)) rows.push({ t: "section", id: s.id, s, ch, depth: 0 });
      continue;
    }
    const docOpen = q ? true : (expanded[doc.id] ?? doc.id === activeDocId);
    rows.push({ t: "doc", id: doc.id, doc, depth: 0, open: docOpen });
    if (!docOpen) continue;
    doc.chapters.forEach((ch, i) => {
      const secHits = q ? ch.sections.filter((s) => has(s.name, q)) : ch.sections;
      if (q && !has(ch.name, q) && secHits.length === 0) return;
      if (ch.part && ch.part !== doc.chapters[i - 1]?.part && !q) rows.push({ t: "part", id: `part:${ch.part}`, label: ch.part, depth: 1 });
      const open = q ? true : !!expanded[ch.id];
      rows.push({ t: "chapter", id: ch.id, doc, ch, no: i + 1, depth: 1, open });
      if (open) for (const s of q && !has(ch.name, q) ? secHits : ch.sections) rows.push({ t: "section", id: s.id, s, ch, depth: 2 });
    });
  }
  return rows;
}

export const SidebarE: React.FC = () => {
  const sc = useScenario();
  const scenarioId = useSidebarLabStore((s) => s.scenario);
  const docs = useSidebarLabStore((s) => s.docs);
  const expanded = useSidebarLabStore((s) => s.expanded);
  const activeDocId = useSidebarLabStore((s) => s.activeDocId);
  const selectedId = useSidebarLabStore((s) => s.selectedId);
  const zoomId = useELabStore((s) => s.zoomId);
  const editingId = useELabStore((s) => s.editingId);
  const resetE = useELabStore((s) => s.reset);
  const [q, setQ] = React.useState("");
  const tree = React.useRef<HTMLDivElement>(null);

  // 예시 문서를 바꾸면 E 화면 상태도 처음으로
  React.useEffect(() => resetE(), [scenarioId, resetE]);

  const rows = React.useMemo(() => flatten(docs, expanded, activeDocId, zoomId, q.trim()), [docs, expanded, activeDocId, zoomId, q]);

  // 본문에서 칸을 고르면 그 칸이 든 구역 줄을 고른 것으로 본다
  const selRow = React.useMemo(() => {
    if (!selectedId) return null;
    if (rows.some((r) => r.id === selectedId)) return selectedId;
    return indexOf(sc).get(selectedId)?.anc[2] ?? null;
  }, [rows, selectedId, sc]);

  React.useEffect(() => {
    if (selRow) tree.current?.querySelector(`[data-row-id="${selRow}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selRow]);

  const onKey = useTreeKeys(rows, selRow, tree);
  // 고치던 줄이 사라졌으면 (지웠거나 접혔거나) 고치기 상태를 푼다 — 안 풀면 키보드가 먹통이 된다
  const editingLive = !!editingId && rows.some((r) => r.id === editingId);
  const setEditing = useELabStore((s) => s.setEditing);
  React.useEffect(() => {
    if (editingId && !editingLive) setEditing(null);
  }, [editingId, editingLive, setEditing]);

  return (
    <aside className="fig-panel w-[300px] shrink-0 min-h-0 flex flex-col bg-white border-r border-[var(--fig-border)]" data-testid="sb-sidebar-e">
      <Head q={q} setQ={setQ} />
      <Crumb />
      <div
        ref={tree}
        tabIndex={0}
        onKeyDown={editingLive ? undefined : onKey}
        className="flex-1 min-h-0 overflow-y-auto pt-1 pb-6 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--fig-brand)]/30"
        role="tree"
        aria-label="작업 공간 목차"
        data-testid="sb-e-tree"
      >
        <RootHead label={sc.project} note="쓰는 중" mine />
        {rows.map((r) =>
          r.t === "part" ? (
            <div key={r.id} className="pl-[34px] pr-3 pt-2.5 pb-0.5 text-[10.5px] font-semibold text-slate-400 truncate">
              {r.label}
            </div>
          ) : (
            <MineRow key={r.id} r={r} selected={selRow === r.id} />
          ),
        )}
        {zoomId && rows.length === 0 && <p className="px-6 py-2 text-[11.5px] text-slate-400">구역이 없어요 — Enter 로 새 구역</p>}
        <Workspace q={q.trim()} />
      </div>
      <p className="shrink-0 px-3 py-1.5 border-t border-[var(--fig-border)] text-[10.5px] leading-4 text-slate-400">
        두 번 눌러 이름 · Enter 새 줄 · Tab 들이기 · Alt+↑↓ 옮기기 · 번호를 눌러 확대 · Ctrl+Z
      </p>
    </aside>
  );
};

/* ── 머리 ── */

const Head: React.FC<{ q: string; setQ: (v: string) => void }> = ({ q, setQ }) => {
  const sc = useScenario();
  const showSyn = useELabStore((s) => s.showSyn);
  const toggleSyn = useELabStore((s) => s.toggleSyn);
  const setEditing = useELabStore((s) => s.setEditing);
  const zoomId = useELabStore((s) => s.zoomId);
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const addAfter = useSidebarLabStore((s) => s.addAfter);
  const addChild = useSidebarLabStore((s) => s.addChild);
  const select = useSidebarLabStore((s) => s.select);
  const add = () => {
    const id = zoomId ? addChild(zoomId) : addAfter(docId);
    if (id) {
      select(id, { scroll: false });
      setEditing(id);
    }
  };
  return (
    <div className="shrink-0 px-3 pt-2.5 pb-2 flex flex-col gap-2 border-b border-[var(--fig-border)]">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-800" title={sc.workspaceName ?? sc.project}>
          {sc.workspaceName ?? sc.project}
        </span>
        <PhaseTabs />
      </div>
      <div className="flex items-center gap-1">
        <label className="flex-1 min-w-0 h-7 px-2 rounded-md bg-slate-100 flex items-center gap-1.5 text-slate-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-slate-300">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="작업 공간에서 찾기"
            className="flex-1 min-w-0 bg-transparent outline-none text-[12px] text-slate-800 placeholder:text-slate-400"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} title="지우기" className="text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        <button type="button" className="fig-icon-btn" onClick={toggleSyn} aria-pressed={showSyn} title={showSyn ? "요약 한 줄 숨기기" : "요약 한 줄 보이기"}>
          {showSyn ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button type="button" className="fig-icon-btn" onClick={add} title={zoomId ? "이 장에 구역 추가" : "장 추가"} data-testid="sb-e-add">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

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

/** 확대 중이면 돌아갈 경로, 아니면 본문이 있는 곳 */
const Crumb: React.FC = () => {
  const sc = useScenario();
  const zoomId = useELabStore((s) => s.zoomId);
  const setZoom = useELabStore((s) => s.setZoom);
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const select = useSidebarLabStore((s) => s.select);
  const doc = activeDoc(sc, docId);
  const id = zoomId ?? viewChapterId;
  const ch = id ? indexOf(sc).get(id)?.chapter : undefined;
  if (!ch) return null;
  const no = doc.chapters.indexOf(ch) + 1;
  if (zoomId)
    return (
      <div className="shrink-0 px-3 pt-2 pb-1.5 border-b border-[var(--fig-border)] bg-slate-50/70" data-testid="sb-e-zoom">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
          <button type="button" className="hover:underline truncate" onClick={() => setZoom(null)}>
            {sc.project}
          </button>
          <span className="text-slate-300">›</span>
          {ch.part && <span className="truncate">{ch.part}</span>}
        </div>
        <div className="text-[15px] font-bold text-slate-900 truncate mt-0.5">
          <span className="text-slate-300 mr-1.5 tabular-nums">{no}</span>
          {ch.name || "이름 없는 장"}
        </div>
        {ch.syn && <div className="text-[11.5px] text-slate-500 truncate">{ch.syn}</div>}
      </div>
    );
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

/** 프로젝트 뿌리 머리 */
const RootHead: React.FC<{ label: string; note: string; mine?: boolean; open?: boolean; onToggle?: () => void }> = ({ label, note, mine, open, onToggle }) => (
  <div
    onClick={onToggle}
    className={`mx-1.5 mt-1 px-1.5 h-7 rounded-md flex items-center gap-1.5 ${onToggle ? "cursor-pointer hover:bg-slate-50" : ""}`}
  >
    {onToggle ? (open ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />) : <span className="w-3" />}
    <span className={`truncate text-[11.5px] font-semibold tracking-wide ${mine ? "text-slate-800" : "text-slate-500"}`}>{label}</span>
    <span className={`shrink-0 text-[10.5px] ${mine ? "text-[var(--fig-brand)] font-semibold" : "text-slate-400"}`}>{note}</span>
  </div>
);

/* ── 내 목차 줄 (고칠 수 있음) ── */

const MineRow: React.FC<{ r: Exclude<FlatRow, { t: "part" }>; selected: boolean }> = ({ r, selected }) => {
  const phase = useSidebarLabStore((s) => s.phase);
  const edits = useSidebarLabStore((s) => s.edits);
  const here = useSidebarLabStore((s) => r.t === "chapter" && s.viewChapterId === r.id);
  const select = useSidebarLabStore((s) => s.select);
  const hover = useSidebarLabStore((s) => s.hover);
  const setOpen = useSidebarLabStore((s) => s.setOpen);
  const addAfter = useSidebarLabStore((s) => s.addAfter);
  const moveTo = useSidebarLabStore((s) => s.moveTo);
  const importChapter = useSidebarLabStore((s) => s.importChapter);
  const showSyn = useELabStore((s) => s.showSyn);
  const editing = useELabStore((s) => s.editingId === r.id);
  const setEditing = useELabStore((s) => s.setEditing);
  const setZoom = useELabStore((s) => s.setZoom);
  const setPeek = useELabStore((s) => s.setPeek);
  const dragging = useELabStore((s) => s.dragging);
  const setDragging = useELabStore((s) => s.setDragging);
  const say = useLabStore((s) => s.say);
  const [drop, setDrop] = React.useState<"before" | "after" | "inside" | null>(null);

  const name = r.t === "doc" ? r.doc.name : r.t === "chapter" ? r.ch.name : r.s.name;
  const level = r.t === "doc" ? 0 : r.t === "chapter" ? 1 : 2;
  const sub =
    !showSyn || r.t === "doc"
      ? undefined
      : r.t === "chapter"
        ? phase === 2
          ? r.ch.template
          : r.ch.syn
        : phase === 1
          ? r.s.intent
          : phase === 2
            ? r.s.formLabel
            : undefined;
  const open = r.t === "section" ? undefined : r.open;
  const canOpen = r.t === "doc" || (r.t === "chapter" && r.ch.sections.length > 0);
  const c = r.t === "chapter" ? countChapter(r.ch, edits) : r.t === "section" ? countSection(r.s, edits) : null;
  const dot = phase === 3 && !!c && c.open > 0 && !(r.t === "chapter" && r.open);

  const label = r.t === "chapter" ? `${r.no} ${r.ch.name}` : name;
  const dragNode: DragNode | null = r.t === "doc" ? null : { projectId: null, id: r.id, kind: r.t, label };

  // 놓을 자리: 위 30% 앞 · 아래 30% 뒤 · 가운데는 장 안으로 (구역을 끌 때)
  const zone = (e: React.DragEvent): "before" | "after" | "inside" | null => {
    if (!dragging || dragging.id === r.id) return null;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    if (r.t === "doc") return dragging.kind === "chapter" ? "inside" : null;
    if (dragging.projectId !== null) return dragging.kind === "chapter" && r.t === "chapter" ? (y < 0.5 ? "before" : "after") : null;
    if (dragging.kind === "chapter") return r.t === "chapter" ? (y < 0.5 ? "before" : "after") : null;
    if (r.t === "chapter") return y < 0.3 ? null : "inside";
    return y < 0.5 ? "before" : "after";
  };

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={canOpen ? !!open : undefined}
      aria-level={level + 1}
      data-row-id={r.id}
      draggable={!!dragNode && !editing}
      onDragStart={(e) => {
        if (!dragNode) return;
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragNode));
        e.dataTransfer.effectAllowed = "copyMove";
        setDragging(dragNode);
      }}
      onDragEnd={() => {
        setDragging(null);
        setDrop(null);
      }}
      onDragOver={(e) => {
        const z = zone(e);
        if (!z) return setDrop(null);
        e.preventDefault();
        setDrop(z);
      }}
      onDragLeave={() => setDrop(null)}
      onDrop={(e) => {
        e.preventDefault();
        const z = drop;
        setDrop(null);
        const d = dragging;
        setDragging(null);
        if (!d || !z) return;
        if (d.projectId === null) {
          if (!moveTo(d.id, r.id, z)) say("여기로는 옮길 수 없어요");
          return;
        }
        // 다른 프로젝트의 장 → 내 목차로 가져오기
        const src = findInWorkspace(d.projectId, d.id);
        if (src?.chapter && d.kind === "chapter") {
          const id = importChapter(src.chapter, `${src.project.name} (${src.project.note}) ${src.no}장`, r.id, z === "before" ? "before" : "after");
          if (id) say(`${d.label} — 내 목차로 가져왔어요 (칸은 '레퍼런스 그대로')`);
        }
      }}
      onClick={(e) => {
        select(r.id);
        setPeek(null);
        // 키보드 조작이 바로 되게 트리에 초점
        (e.currentTarget.closest("[role=tree]") as HTMLElement | null)?.focus();
      }}
      onDoubleClick={() => r.t !== "doc" && setEditing(r.id)}
      onMouseEnter={() => hover(r.id)}
      onMouseLeave={() => hover(null)}
      className={`group relative mx-1.5 rounded-md flex items-start gap-1 pr-1.5 py-[3px] cursor-pointer ${
        selected ? "bg-[var(--fig-brand)]/10" : here ? "bg-slate-100" : drop === "inside" ? "bg-[var(--fig-brand)]/10 ring-1 ring-[var(--fig-brand)]" : "hover:bg-slate-50"
      }`}
      style={{ paddingLeft: 4 + r.depth * 14 }}
    >
      {drop === "before" && <span className="absolute left-2 right-2 -top-px h-[2px] rounded bg-[var(--fig-brand)]" />}
      {drop === "after" && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded bg-[var(--fig-brand)]" />}
      <span
        className="w-4 h-5 shrink-0 grid place-items-center text-slate-400 hover:text-slate-700"
        onClick={(e) => {
          if (!canOpen) return;
          e.stopPropagation();
          setOpen(r.id, !open);
        }}
      >
        {canOpen && (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </span>
      {r.t === "chapter" && (
        <button
          type="button"
          tabIndex={-1}
          className="w-5 h-5 shrink-0 text-[11px] text-slate-400 tabular-nums text-left hover:text-[var(--fig-brand)]"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(r.id);
            select(r.id);
            (e.currentTarget.closest("[role=tree]") as HTMLElement | null)?.focus();
          }}
          title="이 장만 보기 (확대)"
        >
          {r.no}
        </button>
      )}
      {r.t === "section" && <span className="w-3 h-5 shrink-0 grid place-items-center"><span className="w-1 h-1 rounded-full bg-slate-400" /></span>}
      <span className="min-w-0 flex-1 flex flex-col">
        {editing ? (
          <NameInput id={r.id} initial={name} />
        ) : (
          <span
            className={`truncate leading-5 ${level === 0 ? "text-[13px] font-semibold text-slate-900" : level === 1 ? "text-[13px] text-slate-800" : "text-[12.5px] text-slate-600"} ${
              selected ? "!text-[var(--fig-brand)] font-semibold" : ""
            } ${!name ? "!text-slate-400 italic" : ""}`}
          >
            {name || (r.t === "chapter" ? "이름 없는 장" : "이름 없는 구역")}
          </span>
        )}
        {sub && !editing && <span className="truncate text-[11px] leading-4 text-slate-400">{sub}</span>}
      </span>
      {dot && <span className="w-1.5 h-1.5 mt-2 rounded-full bg-amber-500 shrink-0" title="손댈 게 있음" />}
      {!editing && r.t !== "section" && (
        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-0.5">
          {r.t === "chapter" && (
            <button
              type="button"
              className="w-5 h-5 rounded grid place-items-center text-slate-400 hover:text-slate-800 hover:bg-white"
              title="이 장만 보기 (확대)"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(r.id);
              }}
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            className="w-5 h-5 rounded grid place-items-center text-slate-400 hover:text-slate-800 hover:bg-white"
            title={r.t === "doc" ? "맨 끝에 장 추가" : "아래에 장 추가"}
            onClick={(e) => {
              e.stopPropagation();
              const id = addAfter(r.id);
              if (id) {
                select(id, { scroll: false });
                setEditing(id);
              }
            }}
          >
            <Plus className="w-3 h-3" />
          </button>
        </span>
      )}
    </div>
  );
};

/** 이름 고치기 — Enter 다음 줄, Tab 들이기, Esc 취소, 비우고 나가면 줄을 지운다 */
const NameInput: React.FC<{ id: string; initial: string }> = ({ id, initial }) => {
  const rename = useSidebarLabStore((s) => s.rename);
  const remove = useSidebarLabStore((s) => s.remove);
  const addAfter = useSidebarLabStore((s) => s.addAfter);
  const indent = useSidebarLabStore((s) => s.indent);
  const outdent = useSidebarLabStore((s) => s.outdent);
  const select = useSidebarLabStore((s) => s.select);
  const setEditing = useELabStore((s) => s.setEditing);
  const done = React.useRef(false);
  // Tab 으로 들인 뒤에도 같은 줄을 계속 고치므로, 마지막으로 저장한 이름을 따로 기억한다
  const saved = React.useRef(initial);
  const input = React.useRef<HTMLInputElement>(null);
  // 고치기를 마치면 트리로 초점을 돌려 키보드 조작이 이어지게
  const backToTree = () => {
    const t = input.current?.closest("[role=tree]") as HTMLElement | null;
    window.setTimeout(() => t?.focus(), 0);
  };

  const commit = (v: string) => {
    if (done.current) return;
    done.current = true;
    const name = v.trim();
    if (!name) remove(id);
    else if (name !== saved.current) rename(id, name);
    setEditing(null);
    backToTree();
  };

  return (
    <input
      ref={input}
      autoFocus
      defaultValue={initial}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        const v = e.currentTarget.value;
        if (e.key === "Escape") {
          done.current = true;
          if (!saved.current) remove(id);
          setEditing(null);
          backToTree();
        } else if (e.key === "Enter") {
          e.preventDefault();
          commit(v);
          if (v.trim()) {
            const next = addAfter(id);
            if (next) {
              select(next, { scroll: false });
              setEditing(next);
            }
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          if (v.trim() && v.trim() !== saved.current) {
            rename(id, v.trim());
            saved.current = v.trim();
          }
          if (e.shiftKey) outdent(id);
          else indent(id);
          // 같은 id 로 다시 고치기 (들인 뒤에도 계속 쓰게)
          done.current = false;
        }
      }}
      className="w-full h-5 px-1 -ml-1 rounded border border-[var(--fig-brand)] bg-white text-[13px] text-slate-900 outline-none"
      placeholder="이름"
      data-testid="sb-e-name-input"
    />
  );
};

/* ── 키보드 ── */

function useTreeKeys(rows: FlatRow[], current: string | null, tree: React.RefObject<HTMLDivElement | null>) {
  const s = useSidebarLabStore;
  const e = useELabStore;
  const say = useLabStore((st) => st.say);
  return (ev: React.KeyboardEvent) => {
    const nav = rows.filter((r) => r.t !== "part") as Exclude<FlatRow, { t: "part" }>[];
    const i = nav.findIndex((r) => r.id === current);
    const r = nav[i];
    const st = s.getState();
    const go = (k: number) => {
      const n = nav[Math.max(0, Math.min(nav.length - 1, k))];
      if (n) st.select(n.id);
    };
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      if (!st.undo()) say("되돌릴 것이 없어요");
      return;
    }
    if (ev.key === "ArrowDown" && !ev.altKey) return ev.preventDefault(), go(i + 1);
    if (ev.key === "ArrowUp" && !ev.altKey) return ev.preventDefault(), go(i - 1);
    if (!r) return;
    if (ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
      ev.preventDefault();
      if (r.t !== "doc") st.move(r.id, ev.key === "ArrowUp" ? -1 : 1);
    } else if (ev.altKey && ev.key === "ArrowRight" && r.t === "chapter") {
      ev.preventDefault();
      e.getState().setZoom(r.id);
    } else if (ev.altKey && ev.key === "ArrowLeft") {
      ev.preventDefault();
      e.getState().setZoom(null);
    } else if (ev.key === "ArrowRight") {
      ev.preventDefault();
      if (r.t !== "section" && !r.open) st.setOpen(r.id, true);
      else go(i + 1);
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      if (r.t !== "section" && r.open) st.setOpen(r.id, false);
      else {
        const parent = r.t === "section" ? r.ch.id : r.t === "chapter" ? r.doc.id : null;
        if (parent && nav.some((n) => n.id === parent)) st.select(parent);
      }
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const id = st.addAfter(r.id);
      if (id) {
        st.select(id, { scroll: false });
        e.getState().setEditing(id);
      }
    } else if (ev.key === "F2") {
      ev.preventDefault();
      if (r.t !== "doc") e.getState().setEditing(r.id);
    } else if (ev.key === "Tab") {
      ev.preventDefault();
      const ok = ev.shiftKey ? st.outdent(r.id) : st.indent(r.id);
      if (!ok) say(ev.shiftKey ? "장은 더 내어 쓸 수 없어요" : r.t === "section" ? "구역 아래는 칸이라 목차로 들이지 않아요" : "첫 장은 들일 곳이 없어요");
    } else if (ev.key === "Delete") {
      ev.preventDefault();
      if (r.t !== "doc" && st.remove(r.id)) {
        say("지웠어요 — Ctrl+Z 로 되돌리기");
        go(i - 1);
      }
    }
    tree.current?.focus();
  };
}

/* ── 작업 공간의 다른 프로젝트 (읽기 전용) ── */

export function findInWorkspace(projectId: string, id: string) {
  const ws = getScenario(useSidebarLabStore.getState().scenario).workspace ?? [];
  const project = ws.find((p) => p.id === projectId);
  if (!project) return null;
  for (const d of project.docs)
    for (let i = 0; i < d.chapters.length; i++) {
      const ch = d.chapters[i];
      if (ch.id === id) return { project, doc: d, chapter: ch, no: i + 1 };
      const s = ch.sections.find((x) => x.id === id);
      if (s) return { project, doc: d, chapter: ch, section: s, no: i + 1 };
    }
  return null;
}

const Workspace: React.FC<{ q: string }> = ({ q }) => {
  const sc = useScenario();
  const ws = sc.workspace ?? [];
  if (!ws.length)
    return (
      <p className="mx-3 mt-5 pt-3 border-t border-dashed border-slate-200 text-[11px] leading-4 text-slate-400">
        이 작업 공간에는 다른 프로젝트가 없어요. 위 &lsquo;예시 문서&rsquo;를 &lsquo;넛지 시리즈&rsquo;로 바꾸면 여러 프로젝트를 묶은 모습을 볼 수 있어요.
      </p>
    );
  return (
    <div className="mt-4 pt-1 border-t border-[var(--fig-border)]" data-testid="sb-e-workspace">
      <div className="px-3 pt-2 pb-0.5 text-[10.5px] font-semibold text-slate-400">같은 작업 공간 · 끌어서 대화에 붙이거나 내 목차로</div>
      {ws.map((p) => (
        <RefProject key={p.id} p={p} q={q} />
      ))}
    </div>
  );
};

const RefProject: React.FC<{ p: SbProject; q: string }> = ({ p, q }) => {
  const closed = useELabStore((s) => s.closedRoots[p.id] ?? true);
  const toggle = useELabStore((s) => s.toggleRoot);
  const [openCh, setOpenCh] = React.useState<Record<string, boolean>>({});
  const open = q ? true : !closed;
  const chapters = p.docs.flatMap((d) => d.chapters.map((ch, i) => ({ d, ch, no: i + 1 })));
  const hits = q ? chapters.filter(({ ch }) => has(ch.name, q) || ch.sections.some((s) => has(s.name, q))) : chapters;
  if (q && !hits.length) return null;
  return (
    <div>
      <RootHead label={p.name} note={p.note} open={open} onToggle={() => toggle(p.id, true)} />
      {open &&
        hits.map(({ d, ch, no }) => (
          <React.Fragment key={ch.id}>
            <RefRow p={p} id={ch.id} kind="chapter" depth={1} no={no} name={ch.name} sub={p.docs.length > 1 ? d.name : undefined} open={!!openCh[ch.id]} onToggle={() => setOpenCh({ ...openCh, [ch.id]: !openCh[ch.id] })} chapterId={ch.id} />
            {(openCh[ch.id] || (q && !has(ch.name, q))) &&
              ch.sections.filter((s) => !q || has(ch.name, q) || has(s.name, q)).map((s) => <RefRow key={s.id} p={p} id={s.id} kind="section" depth={2} name={s.name} chapterId={ch.id} label={`${p.name} · ${no} ${ch.name} › ${s.name}`} />)}
          </React.Fragment>
        ))}
    </div>
  );
};

const RefRow: React.FC<{
  p: SbProject;
  id: string;
  kind: "chapter" | "section";
  depth: number;
  no?: number;
  name: string;
  sub?: string;
  open?: boolean;
  onToggle?: () => void;
  chapterId: string;
  label?: string;
}> = ({ p, id, kind, depth, no, name, sub, open, onToggle, chapterId, label }) => {
  const setPeek = useELabStore((s) => s.setPeek);
  const peeking = useELabStore((s) => s.peek?.chapterId === chapterId && kind === "chapter");
  const addChip = useELabStore((s) => s.addChip);
  const setDragging = useELabStore((s) => s.setDragging);
  const say = useLabStore((s) => s.say);
  const node: DragNode = { projectId: p.id, id, kind, label: label ?? `${p.name} · ${no} ${name}` };
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(node));
        e.dataTransfer.effectAllowed = "copy";
        setDragging(node);
      }}
      onDragEnd={() => setDragging(null)}
      onClick={() => setPeek({ projectId: p.id, chapterId })}
      className={`group mx-1.5 rounded-md flex items-center gap-1 pr-1.5 h-[24px] cursor-pointer ${peeking ? "bg-slate-100" : "hover:bg-slate-50"}`}
      style={{ paddingLeft: 4 + depth * 14 }}
      title="누르면 미리보기 · 끌어서 대화나 내 목차에 놓기"
    >
      <span
        className="w-4 h-4 shrink-0 grid place-items-center text-slate-300 hover:text-slate-600"
        onClick={(e) => {
          if (!onToggle) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {onToggle && (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </span>
      {no !== undefined && <span className="w-5 shrink-0 text-[11px] text-slate-300 tabular-nums">{no}</span>}
      {kind === "section" && <span className="w-3 shrink-0 grid place-items-center"><span className="w-1 h-1 rounded-full bg-slate-300" /></span>}
      <span className={`min-w-0 flex-1 truncate ${kind === "chapter" ? "text-[12.5px] text-slate-500" : "text-[12px] text-slate-400"}`}>
        {name}
        {sub && <span className="text-slate-300"> · {sub}</span>}
      </span>
      <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          className="w-5 h-5 rounded grid place-items-center text-slate-400 hover:text-slate-800 hover:bg-white"
          title="대화에 참고로 붙이기"
          onClick={(e) => {
            e.stopPropagation();
            addChip(node);
            say(`대화에 붙였어요 — ${node.label}`);
          }}
        >
          <MessageSquarePlus className="w-3 h-3" />
        </button>
        {kind === "chapter" && <ImportButton projectId={p.id} id={id} />}
      </span>
    </div>
  );
};

/** 다른 프로젝트의 장을 내 목차로 (고른 장 뒤, 없으면 맨 끝) */
export const ImportButton: React.FC<{ projectId: string; id: string; big?: boolean }> = ({ projectId, id, big }) => {
  const importChapter = useSidebarLabStore((s) => s.importChapter);
  const select = useSidebarLabStore((s) => s.select);
  const say = useLabStore((s) => s.say);
  const run = (e: React.MouseEvent) => {
    e.stopPropagation();
    const src = findInWorkspace(projectId, id);
    if (!src) return;
    const st = useSidebarLabStore.getState();
    const sel = st.selectedId ? findMineChapter(st.selectedId) : null;
    const target = sel ?? st.activeDocId;
    const newId = importChapter(src.chapter, `${src.project.name} (${src.project.note}) ${src.no}장`, target, "after");
    if (newId) {
      select(newId);
      say(`${src.project.name} ${src.no}장 — 내 목차로 가져왔어요`);
    }
  };
  return big ? (
    <button type="button" onClick={run} className="h-7 px-2.5 rounded-md text-[11.5px] flex items-center gap-1 border border-slate-200 text-slate-700 hover:bg-slate-50">
      <ArrowDownToLine className="w-3.5 h-3.5" />내 목차로 가져오기
    </button>
  ) : (
    <button type="button" onClick={run} className="w-5 h-5 rounded grid place-items-center text-slate-400 hover:text-slate-800 hover:bg-white" title="내 목차로 가져오기 (고른 장 뒤)">
      <ArrowDownToLine className="w-3 h-3" />
    </button>
  );
};

/** 내 목차에서 id(장 · 구역 · 칸)가 든 장 */
function findMineChapter(id: string): string | null {
  for (const d of useSidebarLabStore.getState().docs)
    for (const ch of d.chapters) {
      if (ch.id === id) return ch.id;
      for (const s of ch.sections) if (s.id === id || s.slots.some((x) => x.id === id)) return ch.id;
    }
  return null;
}
