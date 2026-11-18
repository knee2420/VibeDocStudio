import { create } from "zustand";

import { FILLS, findNode, flatScaffold, mapText, MESSY_NOTES, MISSING_HINT, SCAFFOLD, type LayoutId } from "./cardProtoData";

/**
 * 카드 안내장 시제품 상태.
 * 아웃라인은 납작한 줄 목록 + 깊이 (.outline / Workflowy 처럼 자유 깊이).
 *  - 사용자가 쓴 줄: key 없음 → AI 가 mapText 로 뼈대 어디인지 안다
 *  - 정돈 제안을 받은 뒤: 뼈대 제목 줄(key) + 그 밑에 내가 처음 쓴 말(memo, 회색)
 */

export interface OLine {
  id: string;
  text: string;
  depth: number;
  /** 뼈대 제목 줄이면 그 뼈대 key */
  key?: string;
  /** 내가 처음 쓴 말 · AI 가 붙인 말 (제목 밑 회색 줄) — 붙은 뼈대 key 를 같이 든다 */
  memo?: { of: string; by: "me" | "ai" };
}

export type ProtoPhase = 1 | 2 | 3;

let n = 0;
const nid = () => `l${Date.now().toString(36)}${(n++).toString(36)}`;

const initialLines = (): OLine[] => MESSY_NOTES.map((m) => ({ id: nid(), text: m.text, depth: m.depth }));

/* ── AI 가 이해한 것: 뼈대 key 마다 내 말 · 그대로 · 빠짐 ── */

export interface Coverage {
  mine: Record<string, string[]>;
  /** "기존꺼 그대로" 같은 한 줄이 덮은 곳 → 그 줄 */
  via: Record<string, string>;
  /** 어디에도 안 맞는 줄 */
  unsorted: string[];
}

export function coverage(lines: OLine[]): Coverage {
  const mine: Record<string, string[]> = {};
  const via: Record<string, string> = {};
  const unsorted: string[] = [];
  for (const l of lines) {
    if (l.key) continue;
    if (l.memo) {
      if (l.memo.of === "unsorted") unsorted.push(l.text);
      else if (l.memo.by === "me" && mapText(l.text).length > 2) for (const k of mapText(l.text)) via[k] = l.text;
      else (mine[l.memo.of] ??= []).push(l.text);
      continue;
    }
    if (!l.text.trim()) continue;
    const ks = mapText(l.text);
    if (!ks.length) unsorted.push(l.text);
    else if (ks.length > 2) for (const k of ks) via[k] = l.text;
    else for (const k of ks) (mine[k] ??= []).push(l.text);
  }
  return { mine, via, unsorted };
}

/** 빠진 것: 내 말도, 그대로도 안 닿은 곳 (+ 출시일은 늘 물어봄) */
export function missing(cov: Coverage, resolved: Record<string, boolean>): string[] {
  return Object.keys(MISSING_HINT).filter((k) => {
    if (resolved[k]) return false;
    // 출시일은 "그대로" 로 덮이지 않는다 — 내가 직접 쓴 줄이 있어야 빠짐이 아니다
    if (k === "change") return !cov.mine[k]?.length;
    return !cov.mine[k]?.length && !cov.via[k];
  });
}

/** 정돈 제안 — 뼈대(우리카드 문법) 순서로 다시 짜고, 내 말은 제목 밑 메모로 */
export function buildProposal(lines: OLine[], withSummary: boolean, resolved: Record<string, boolean>): OLine[] {
  const cov = coverage(lines);
  const out: OLine[] = [];
  // "기존꺼 그대로" 처럼 여러 장을 덮는 줄은 처음 닿는 제목 밑에 한 번만 남긴다 — 내 말은 사라지지 않는다
  const placed = new Set<string>();
  for (const { node, depth } of flatScaffold(withSummary)) {
    out.push({ id: nid(), text: node.title, depth, key: node.key });
    for (const t of cov.mine[node.key] ?? []) out.push({ id: nid(), text: t, depth: depth + 1, memo: { of: node.key, by: "me" } });
    const v = cov.via[node.key];
    if (v && !placed.has(v)) {
      placed.add(v);
      out.push({ id: nid(), text: v, depth: depth + 1, memo: { of: node.key, by: "me" } });
    }
    if (resolved[node.key] && MISSING_HINT[node.key]) out.push({ id: nid(), text: aiMemo(node.key), depth: depth + 1, memo: { of: node.key, by: "ai" } });
  }
  if (cov.unsorted.length) {
    out.push({ id: nid(), text: "어디에 넣을지 모르는 메모", depth: 0, key: "unsorted" });
    for (const t of cov.unsorted) out.push({ id: nid(), text: t, depth: 1, memo: { of: "unsorted", by: "me" } });
  }
  return out;
}

function aiMemo(key: string): string {
  if (key === "change") return "출시일: 2026년 9월 30일 (물어보고 받은 답)";
  if (key === "b-daily-cond") return "작년 안내장 3쪽 조건을 가져옴";
  const f = FILLS[key];
  return f ? `기획안에서: ${f.text}` : "AI 제안";
}

/* ── Phase 3 신호: 안 본 곳 · 위험한 곳 ── */

export type Signal = "risk" | "unseen" | null;

export function signalOf(key: string, filled: boolean, reviewed: Record<string, boolean>): Signal {
  if (!filled) return null;
  const node = findNode(key);
  const keys = node?.children?.length ? node.children.map((c) => c.key) : [key];
  let s: Signal = null;
  for (const k of keys) {
    const f = FILLS[k];
    if (!f || reviewed[k]) continue;
    if (f.state === "nocite" || f.state === "changed") return "risk";
    if (f.state === "draft") s = "unseen";
  }
  return s;
}

/* ── 상태 ── */

interface CardProtoState {
  phase: ProtoPhase;
  lines: OLine[];
  past: OLine[][];
  accepted: boolean;
  /** 정돈 제안을 아웃라인 자리에 펼쳐 보는 중 */
  proposal: OLine[] | null;
  withSummary: boolean;
  resolved: Record<string, boolean>;
  focusId: string | null;
  layout: LayoutId;
  filled: boolean;
  reviewed: Record<string, boolean>;
  /** 캔버스 스크롤 요청 */
  scrollKey: { key: string; n: number } | null;

  setPhase: (p: ProtoPhase) => void;
  focus: (id: string | null, scroll?: boolean) => void;
  focusKey: (key: string) => void;
  setText: (id: string, text: string) => void;
  /** Enter: 바로 아래 새 줄 (자식이 있으면 첫 자식으로). 새 id */
  insertAfter: (id: string) => string;
  indent: (id: string) => boolean;
  outdent: (id: string) => boolean;
  removeLine: (id: string) => string | null;
  moveBlock: (id: string, dir: -1 | 1) => boolean;
  undo: () => boolean;
  openProposal: () => void;
  closeProposal: () => void;
  acceptProposal: () => void;
  resolve: (key: string) => void;
  addSummary: () => void;
  setLayout: (l: LayoutId) => void;
  fill: () => void;
  review: (key: string) => void;
  reset: () => void;
}

const initial = () => ({
  phase: 1 as ProtoPhase,
  lines: initialLines(),
  past: [] as OLine[][],
  accepted: false,
  proposal: null as OLine[] | null,
  withSummary: false,
  resolved: {} as Record<string, boolean>,
  focusId: null as string | null,
  layout: "leaflet" as LayoutId,
  filled: false,
  reviewed: {} as Record<string, boolean>,
  scrollKey: null as { key: string; n: number } | null,
});

/** 줄 i 의 덩어리(자기 + 자식) 끝 */
const blockEnd = (ls: OLine[], i: number) => {
  let j = i + 1;
  while (j < ls.length && ls[j].depth > ls[i].depth) j++;
  return j;
};

export const lineKey = (l: OLine): string | undefined => l.key ?? l.memo?.of ?? (mapText(l.text)[0] || undefined);

export const useCardProtoStore = create<CardProtoState>((set, get) => {
  const commit = (lines: OLine[]) => set({ lines, past: [...get().past, get().lines].slice(-80) });
  const idx = (id: string) => get().lines.findIndex((l) => l.id === id);

  return {
    ...initial(),
    setPhase: (phase) => set({ phase, proposal: null }),
    focus: (focusId, scroll = true) => {
      const l = get().lines.find((x) => x.id === focusId);
      const k = l ? lineKey(l) : undefined;
      set({ focusId, scrollKey: scroll && k ? { key: k, n: (get().scrollKey?.n ?? 0) + 1 } : get().scrollKey });
    },
    focusKey: (key) => {
      const l = get().lines.find((x) => x.key === key) ?? get().lines.find((x) => lineKey(x) === key);
      set({ focusId: l?.id ?? null, scrollKey: { key, n: (get().scrollKey?.n ?? 0) + 1 } });
    },
    setText: (id, text) => set({ lines: get().lines.map((l) => (l.id === id ? { ...l, text } : l)) }),
    insertAfter: (id) => {
      const ls = [...get().lines];
      const i = idx(id);
      const hasKids = ls[i + 1] && ls[i + 1].depth > ls[i].depth;
      const line: OLine = { id: nid(), text: "", depth: hasKids ? ls[i].depth + 1 : ls[i].depth };
      ls.splice(i + 1, 0, line);
      commit(ls);
      set({ focusId: line.id });
      return line.id;
    },
    indent: (id) => {
      const ls = [...get().lines];
      const i = idx(id);
      if (i <= 0 || ls[i - 1].depth < ls[i].depth) return false;
      const end = blockEnd(ls, i);
      for (let j = i; j < end; j++) ls[j] = { ...ls[j], depth: ls[j].depth + 1 };
      commit(ls);
      return true;
    },
    outdent: (id) => {
      const ls = [...get().lines];
      const i = idx(id);
      if (i < 0 || ls[i].depth === 0) return false;
      const end = blockEnd(ls, i);
      for (let j = i; j < end; j++) ls[j] = { ...ls[j], depth: ls[j].depth - 1 };
      commit(ls);
      return true;
    },
    removeLine: (id) => {
      const ls = [...get().lines];
      const i = idx(id);
      if (i < 0 || ls.length === 1) return null;
      const end = blockEnd(ls, i);
      for (let j = i + 1; j < end; j++) ls[j] = { ...ls[j], depth: ls[j].depth - 1 };
      ls.splice(i, 1);
      commit(ls);
      return ls[Math.max(0, i - 1)]?.id ?? null;
    },
    moveBlock: (id, dir) => {
      const ls = [...get().lines];
      const i = idx(id);
      const d = ls[i].depth;
      const end = blockEnd(ls, i);
      if (dir === -1) {
        let p = i - 1;
        while (p >= 0 && ls[p].depth > d) p--;
        if (p < 0 || ls[p].depth !== d) return false;
        const block = ls.splice(i, end - i);
        ls.splice(p, 0, ...block);
      } else {
        if (end >= ls.length || ls[end].depth !== d) return false;
        const nextEnd = blockEnd(ls, end);
        const next = ls.splice(end, nextEnd - end);
        ls.splice(i, 0, ...next);
      }
      commit(ls);
      return true;
    },
    undo: () => {
      const past = get().past;
      if (!past.length) return false;
      set({ lines: past[past.length - 1], past: past.slice(0, -1) });
      return true;
    },
    openProposal: () => set({ proposal: buildProposal(get().lines, get().withSummary, get().resolved) }),
    closeProposal: () => set({ proposal: null }),
    acceptProposal: () => {
      const p = get().proposal ?? buildProposal(get().lines, get().withSummary, get().resolved);
      commit(p);
      set({ proposal: null, accepted: true, focusId: null });
    },
    resolve: (key) => {
      const resolved = { ...get().resolved, [key]: true };
      set({ resolved });
      if (get().accepted) {
        // 이미 정돈했으면 그 제목 밑에 AI 메모를 바로 붙인다
        const ls = [...get().lines];
        const i = ls.findIndex((l) => l.key === key);
        if (i >= 0) {
          ls.splice(blockEnd(ls, i), 0, { id: nid(), text: aiMemo(key), depth: ls[i].depth + 1, memo: { of: key, by: "ai" } });
          commit(ls);
        }
      } else if (get().proposal) set({ proposal: buildProposal(get().lines, get().withSummary, resolved) });
    },
    addSummary: () => {
      set({ withSummary: true });
      if (get().accepted) {
        const ls = [...get().lines];
        const i = ls.findIndex((l) => l.key === "identity");
        const at = i >= 0 ? blockEnd(ls, i) : 0;
        ls.splice(at, 0, { id: nid(), text: "혜택 한눈에 보기", depth: 0, key: "summary" });
        commit(ls);
      } else if (get().proposal) set({ proposal: buildProposal(get().lines, true, get().resolved) });
    },
    setLayout: (layout) => set({ layout }),
    fill: () => set({ filled: true }),
    review: (key) => {
      const node = findNode(key);
      const keys = node?.children?.length ? node.children.map((c) => c.key) : [key];
      const reviewed = { ...get().reviewed };
      for (const k of keys) reviewed[k] = true;
      set({ reviewed });
    },
    reset: () => set(initial()),
  };
});

/** 뼈대 맨 윗단 key 들 (아웃라인 순서) — 판형 · 캔버스용 */
export function topKeys(lines: OLine[]): string[] {
  return lines.filter((l) => l.key && l.depth === 0 && l.key !== "unsorted").map((l) => l.key!);
}

/** 아웃라인에 있는 뼈대 key (순서대로, 아이 포함) */
export function presentKeys(lines: OLine[]): string[] {
  return lines.filter((l) => l.key && l.key !== "unsorted").map((l) => l.key!);
}

export const TOP_SCAFFOLD_KEYS = SCAFFOLD.map((n) => n.key);
