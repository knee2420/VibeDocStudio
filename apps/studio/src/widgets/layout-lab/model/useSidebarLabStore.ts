import { create } from "zustand";

import { allSlots, indexOf, type SbChapter, type SbDoc, type SbScenario, type SbSection, type SbSlot, type ScenarioId, type SlotState } from "./sidebarDummy";
import * as ops from "./outlineOps";
import { getScenario } from "./sidebarScenarios";

export type SbPhase = 1 | 2 | 3;
/** 보일 단계 (Word 탐색 창 "보일 단계"): 1 장까지 · 2 구역까지 · 3 칸까지 */
export type SbDepth = 1 | 2 | 3;

/** 시제품에서 바꾼 칸 */
export interface SlotEdit {
  state: SlotState;
  value?: string;
  cites?: string[];
}

interface SidebarLabState {
  scenario: ScenarioId;
  phase: SbPhase;
  depth: SbDepth;
  activeDocId: string;
  /** 고른 노드 (문서 · 장 · 구역 · 칸 아무거나) */
  selectedId: string | null;
  /** 트리 줄에 마우스를 올린 노드 → 캔버스 테두리 */
  hoverId: string | null;
  /** 본문 스크롤 위치에 있는 장 (스크롤 스파이) */
  viewChapterId: string | null;
  edits: Record<string, SlotEdit>;
  /** 사용자가 직접 펼치거나 접은 노드 — 없으면 보일 단계를 따른다 */
  expanded: Record<string, boolean>;
  /** Phase 3 "남은 일만" 거르개 */
  onlyOpen: boolean;
  /** 캔버스에 "여기로 스크롤" 요청 — nonce 로 같은 곳 다시 눌러도 움직이게 */
  scrollReq: { id: string; n: number } | null;
  /** 지금 쓰는 프로젝트의 문서들 — 목차를 고치면 여기가 바뀌고 캔버스 · 다른 시안도 따라간다 */
  docs: SbDoc[];
  /** 되돌리기 (Ctrl+Z) */
  past: SbDoc[][];

  setScenario: (id: ScenarioId) => void;
  setPhase: (p: SbPhase) => void;
  setDepth: (d: SbDepth) => void;
  setDoc: (id: string) => void;
  select: (id: string | null, opts?: { scroll?: boolean }) => void;
  hover: (id: string | null) => void;
  setViewChapter: (id: string | null) => void;
  setOpen: (id: string, open: boolean) => void;
  /** 빈칸 → AI 초안 (근거가 없으면 '근거 없음') */
  write: (slot: SbSlot) => void;
  /** 초안 · 근거 없음 · 그대로 → 확인함 */
  confirm: (slot: SbSlot) => void;
  setOnlyOpen: (v: boolean) => void;
  reset: () => void;

  /* 목차 구조 고치기 — 성공하면 true (만든 줄이 있으면 그 id) */
  rename: (id: string, name: string) => boolean;
  addAfter: (id: string) => string | null;
  addChild: (chapterId: string) => string | null;
  remove: (id: string) => boolean;
  indent: (id: string) => boolean;
  outdent: (id: string) => boolean;
  move: (id: string, dir: -1 | 1) => boolean;
  moveTo: (dragId: string, targetId: string, pos: "before" | "after" | "inside") => boolean;
  importChapter: (src: SbChapter, fromLabel: string, targetId: string, pos: "before" | "after") => string | null;
  addSections: (chapterId: string, items: { name: string; intent: string; sample: string; cites?: string[] }[]) => boolean;
  undo: () => boolean;
}

const KEY = "vds.layoutLab.sidebarScenario";
function loadScenario(): ScenarioId {
  try {
    const v = localStorage.getItem(KEY);
    return v === "minutes" || v === "card" || v === "petition" || v === "nudge" ? v : "card";
  } catch {
    return "card";
  }
}

function fresh(id: ScenarioId) {
  const sc = getScenario(id);
  const doc = sc.docs[0];
  return {
    scenario: id,
    activeDocId: doc.id,
    selectedId: null,
    hoverId: null,
    viewChapterId: doc.chapters[0]?.id ?? null,
    edits: {},
    // 긴 문서는 장까지만, 짧은 문서는 구역까지 펼친 채로 연다
    depth: (doc.chapters.length > 12 ? 1 : 2) as SbDepth,
    expanded: { [doc.chapters[0]?.id ?? ""]: true },
    onlyOpen: false,
    scrollReq: null,
    docs: structuredClone(sc.docs),
    past: [] as SbDoc[][],
  };
}

export const useSidebarLabStore = create<SidebarLabState>((set, get) => {
  /** 구조를 바꾸고 되돌리기 기록에 남긴다 */
  const commit = (next: SbDoc[] | null | undefined) => {
    if (!next) return false;
    set({ docs: next, past: [...get().past, get().docs].slice(-60) });
    return true;
  };
  const commitWithId = (r: { docs: SbDoc[]; id: string } | null) => (r && commit(r.docs) ? r.id : null);
  const reveal = (id: string, ok: boolean) => {
    if (!ok) return false;
    for (const d of get().docs)
      for (const ch of d.chapters)
        if (ch.id === id || ch.sections.some((x) => x.id === id)) set({ expanded: { ...get().expanded, [ch.id]: true, [d.id]: true } });
    return true;
  };

  return {
  phase: 3,
  ...fresh(loadScenario()),

  setScenario: (id) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* 이번 세션만 */
    }
    set(fresh(id));
  },
  setPhase: (phase) => set({ phase }),
  setDepth: (depth) => set({ depth, expanded: {} }),
  setDoc: (activeDocId) => set({ activeDocId, selectedId: null }),
  select: (id, opts) => {
    if (!id) return set({ selectedId: null });
    const e = indexOf(scenarioOf(get().scenario, get().docs)).get(id);
    if (!e) return;
    // 고른 노드의 조상을 펼친다 (본문에서 눌러도 트리가 그 줄까지 열리게)
    const expanded = { ...get().expanded };
    for (const a of e.anc) expanded[a] = true;
    const prev = get().scrollReq?.n ?? 0;
    set({
      selectedId: id,
      expanded,
      activeDocId: e.doc.id,
      scrollReq: opts?.scroll === false ? get().scrollReq : { id, n: prev + 1 },
    });
  },
  hover: (hoverId) => set({ hoverId }),
  setViewChapter: (viewChapterId) => set({ viewChapterId }),
  setOpen: (id, open) => set({ expanded: { ...get().expanded, [id]: open } }),
  write: (slot) =>
    set({
      edits: {
        ...get().edits,
        [slot.id]: { state: slot.sampleCites?.length ? "draft" : "nocite", value: slot.sample ?? "AI 초안", cites: slot.sampleCites },
      },
    }),
  confirm: (slot) => {
    const cur = slotView(slot, get().edits);
    set({ edits: { ...get().edits, [slot.id]: { state: "checked", value: cur.value, cites: cur.cites } } });
  },
  setOnlyOpen: (onlyOpen) => set({ onlyOpen }),
  reset: () => set(fresh(get().scenario)),

  rename: (id, name) => commit(ops.rename(get().docs, id, name)),
  addAfter: (id) => commitWithId(ops.addAfter(get().docs, id)),
  addChild: (id) => commitWithId(ops.addChild(get().docs, id)),
  remove: (id) => commit(ops.remove(get().docs, id)),
  // 들이거나 내면 그 줄이 든 장을 펼쳐 둔다 (줄이 접힌 장 속으로 사라지지 않게)
  indent: (id) => reveal(id, commit(ops.indent(get().docs, id))),
  outdent: (id) => reveal(id, commit(ops.outdent(get().docs, id))),
  move: (id, dir) => commit(ops.move(get().docs, id, dir)),
  moveTo: (a, b, pos) => commit(ops.moveTo(get().docs, a, b, pos)),
  importChapter: (src, from, target, pos) => commitWithId(ops.importChapter(get().docs, src, from, target, pos)),
  addSections: (id, items) => commit(ops.addSections(get().docs, id, items)),
  undo: () => {
    const past = get().past;
    if (!past.length) return false;
    set({ docs: past[past.length - 1], past: past.slice(0, -1) });
    return true;
  },
  };
});

/** 예시 문서 + 고친 목차. 같은 docs 면 같은 객체라 색인(indexOf) 캐시가 맞는다. */
const merged = new WeakMap<SbDoc[], SbScenario>();
export function scenarioOf(id: ScenarioId, docs: SbDoc[]): SbScenario {
  const hit = merged.get(docs);
  if (hit && hit.id === id) return hit;
  const sc = { ...getScenario(id), docs };
  merged.set(docs, sc);
  return sc;
}

export const useScenario = (): SbScenario => {
  const id = useSidebarLabStore((s) => s.scenario);
  const docs = useSidebarLabStore((s) => s.docs);
  return scenarioOf(id, docs);
};

/* ── 칸 상태 ── */

export function slotView(slot: SbSlot, edits: Record<string, SlotEdit>): SlotEdit {
  return edits[slot.id] ?? { state: slot.state, value: slot.value, cites: slot.cites };
}

/** 사람이 손댈 일이 남은 상태 */
export const isOpenState = (st: SlotState) => st === "empty" || st === "draft" || st === "nocite";

export interface FillCount {
  /** 내가 끝낼 수 있는 칸 (대기 제외) */
  total: number;
  /** 확인함 + 그대로 */
  done: number;
  empty: number;
  /** 확인할 초안 (근거 없음 포함) */
  review: number;
  nocite: number;
  wait: number;
  /** 남은 일 = 빈칸 + 확인할 초안 */
  open: number;
}

function count(slots: SbSlot[], edits: Record<string, SlotEdit>): FillCount {
  const c: FillCount = { total: 0, done: 0, empty: 0, review: 0, nocite: 0, wait: 0, open: 0 };
  for (const s of slots) {
    const st = slotView(s, edits).state;
    if (st === "wait") {
      c.wait++;
      continue;
    }
    c.total++;
    if (st === "checked" || st === "copied") c.done++;
    else if (st === "empty") c.empty++;
    else {
      c.review++;
      if (st === "nocite") c.nocite++;
    }
  }
  c.open = c.empty + c.review;
  return c;
}

export const countSection = (s: SbSection, e: Record<string, SlotEdit>) => count(s.slots, e);
export const countChapter = (c: SbChapter, e: Record<string, SlotEdit>) => count(c.sections.flatMap((s) => s.slots), e);
export const countDoc = (d: SbDoc, e: Record<string, SlotEdit>) => count(d.chapters.flatMap((c) => c.sections.flatMap((s) => s.slots)), e);

/** 지금 고른 곳 다음의 남은 일 (문서 순서, 끝에 닿으면 처음부터) */
export function nextOpen(doc: SbDoc, edits: Record<string, SlotEdit>, fromId: string | null) {
  const list = allSlots(doc);
  const start = fromId ? list.findIndex((r) => r.slot.id === fromId) : -1;
  for (let i = 1; i <= list.length; i++) {
    const r = list[(start + i + list.length) % list.length];
    if (isOpenState(slotView(r.slot, edits).state)) return r;
  }
  return null;
}

export const activeDoc = (sc: SbScenario, id: string) => sc.docs.find((d) => d.id === id) ?? sc.docs[0];

/* ── 펼침: 직접 펼치거나 접은 것이 먼저, 없으면 보일 단계 ── */

export function useIsOpen(id: string, level: 0 | 1 | 2): boolean {
  return useSidebarLabStore((s) => {
    const own = s.expanded[id];
    if (own !== undefined) return own;
    if (level === 0) return id === s.activeDocId;
    return s.depth > level;
  });
}
