import { create } from "zustand";

import { OUTLINE_TREE, type ONode } from "./outline";

export type Lens = "skeleton" | "form" | "content";

/** 트리 안 위치: 부모 목록 · 그 안의 순번 */
function locate(tree: ONode[], id: string): { list: ONode[]; index: number; parent: ONode | null } | null {
  const walk = (list: ONode[], parent: ONode | null): ReturnType<typeof locate> => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { list, index: i, parent };
      const hit = list[i].children ? walk(list[i].children!, list[i]) : null;
      if (hit) return hit;
    }
    return null;
  };
  return walk(tree, null);
}

export function findNode(tree: ONode[], id: string): ONode | null {
  const at = locate(tree, id);
  return at ? at.list[at.index] : null;
}

/** 부모 노드 찾기 (최상위면 null) */
export function parentOf(tree: ONode[], id: string): ONode | null {
  return locate(tree, id)?.parent ?? null;
}

let seq = 0;

interface OutlineState {
  tree: ONode[];
  selected: string | null;
  editing: string | null;
  lens: Lens;
  collapsed: Record<string, boolean>;
  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setLens: (l: Lens) => void;
  toggle: (id: string) => void;
  rename: (id: string, name: string) => void;
  addAfter: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  /** 같은 부모 안에서 drag 를 target 앞으로 */
  moveBefore: (dragId: string, targetId: string) => void;
  accept: (id: string) => void;
  dismiss: (id: string) => void;
  reset: () => void;
}

const clone = (t: ONode[]) => structuredClone(t) as ONode[];

export const useOutlineStore = create<OutlineState>((set, get) => ({
  tree: clone(OUTLINE_TREE),
  selected: null,
  editing: null,
  lens: "skeleton",
  collapsed: { p2: true, p3: true, p4: true, p5: true },
  select: (selected) => set({ selected }),
  setEditing: (editing) => set({ editing }),
  setLens: (lens) => set({ lens }),
  toggle: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
  rename: (id, name) => {
    const tree = clone(get().tree);
    const n = findNode(tree, id);
    if (n) {
      n.name = name.trim() || null;
      if (n.name) n.nameFrom = "human";
    }
    set({ tree, editing: null });
  },
  addAfter: (id) => {
    const tree = clone(get().tree);
    const at = locate(tree, id);
    if (!at) return;
    const node: ONode = { id: `new-${++seq}`, name: "", intent: "", fill: 0, blanks: 0, cites: 0 };
    at.list.splice(at.index + 1, 0, node);
    set({ tree, selected: node.id, editing: node.id });
  },
  indent: (id) => {
    const tree = clone(get().tree);
    const at = locate(tree, id);
    if (!at || at.index === 0) return;
    const prev = at.list[at.index - 1];
    const [node] = at.list.splice(at.index, 1);
    prev.children = [...(prev.children ?? []), node];
    set((s) => ({ tree, collapsed: { ...s.collapsed, [prev.id]: false } }));
  },
  outdent: (id) => {
    const tree = clone(get().tree);
    const at = locate(tree, id);
    if (!at?.parent) return;
    const grand = locate(tree, at.parent.id);
    if (!grand) return;
    const [node] = at.list.splice(at.index, 1);
    grand.list.splice(grand.index + 1, 0, node);
    set({ tree });
  },
  moveBefore: (dragId, targetId) => {
    if (dragId === targetId) return;
    const tree = clone(get().tree);
    const a = locate(tree, dragId);
    const b = locate(tree, targetId);
    if (!a || !b || a.list !== b.list) return;
    const [node] = a.list.splice(a.index, 1);
    const to = a.list.findIndex((n) => n.id === targetId);
    a.list.splice(to, 0, node);
    set({ tree });
  },
  accept: (id) => {
    const tree = clone(get().tree);
    const n = findNode(tree, id);
    if (n) {
      if (n.ghost) n.ghost = false;
      else if (!n.name && n.suggestName) {
        n.name = n.suggestName;
        n.nameFrom = "ai";
        n.suggestName = undefined;
      }
    }
    set({ tree });
  },
  dismiss: (id) => {
    const tree = clone(get().tree);
    const at = locate(tree, id);
    if (!at) return;
    const n = at.list[at.index];
    if (n.ghost) at.list.splice(at.index, 1);
    else n.suggestName = undefined;
    set({ tree });
  },
  reset: () => set({ tree: clone(OUTLINE_TREE), selected: null, editing: null }),
}));

/** 보이는 순서대로 펼친 목록 (번호 · 깊이 포함). 쪽 노드는 번호 대신 "1쪽". 흐린 제안은 번호를 받지 않는다. */
export interface FlatRow {
  node: ONode;
  depth: number;
  num: string;
  hasChildren: boolean;
}

export function flatten(tree: ONode[], collapsed: Record<string, boolean>, opts: { ghosts: boolean }): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (list: ONode[], depth: number, prefix: string) => {
    let k = 0;
    for (const node of list) {
      if (node.ghost && !opts.ghosts) continue;
      const num = node.page ? node.page : node.ghost ? "" : prefix ? `${prefix}.${++k}` : `${++k}`;
      const kids = (node.children ?? []).filter((c) => opts.ghosts || !c.ghost);
      out.push({ node, depth, num, hasChildren: kids.length > 0 });
      if (kids.length && !collapsed[node.id]) walk(node.children!, depth + 1, node.page ? "" : num);
    }
  };
  walk(tree, 0, "");
  return out;
}
