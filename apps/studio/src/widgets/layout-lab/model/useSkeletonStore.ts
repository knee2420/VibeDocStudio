import { create } from "zustand";

import {
  findSk,
  initialDocs,
  isAncestor,
  keyPrefix,
  locate,
  makeBlock,
  makeSection,
  newId,
  partLabel,
  partSlots,
  suggestPart,
  suggestSections,
  type PartKind,
  type SkDoc,
  type SkNode,
  type SkSlot,
} from "./skeleton";

export type Phase = 1 | 2 | 3;
export type DropPos = "before" | "after" | "inside";

/** 실행된 명령 — 스키마의 OutlineCommand 어휘 그대로 */
export interface SkCommand {
  op: "insert_node" | "update_node" | "delete_node" | "move_node" | "indent_node" | "assign_template" | "update_slot" | "accept_suggestion";
  text: string;
  by: "human" | "ai";
  at: number;
}

interface SkState {
  docs: Record<string, SkDoc>;
  docId: string;
  phase: Phase;
  selected: string[];
  editing: { id: string; field: "name" | "intent" } | null;
  collapsed: Record<string, boolean>;
  undoStack: { docId: string; doc: SkDoc }[];
  log: SkCommand[];

  setDoc: (id: string) => void;
  setPhase: (p: Phase) => void;
  select: (id: string, mode?: "only" | "toggle" | "range") => void;
  clearSelect: () => void;
  setEditing: (e: SkState["editing"]) => void;
  toggle: (id: string) => void;
  setPurpose: (v: string) => void;

  addSection: (afterId?: string | null, asChild?: boolean) => void;
  rename: (id: string, name: string) => void;
  setIntent: (id: string, intent: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  nudge: (id: string, dir: -1 | 1) => void;
  moveTo: (ids: string[], targetId: string, pos: DropPos) => void;
  duplicate: (ids: string[]) => void;
  remove: (ids: string[]) => void;
  group: (ids: string[]) => void;
  assignPart: (id: string, part: PartKind) => void;
  updateSlot: (blockId: string, key: string, patch: Partial<SkSlot>) => void;
  addSlot: (blockId: string) => void;
  removeSlot: (blockId: string, key: string) => void;
  setRows: (blockId: string, rows: number) => void;
  aiFill: (blockId: string) => void;
  suggestOutline: (refSkeleton?: { label: string }[]) => void;
  suggestParts: () => void;
  accept: (id: string) => void;
  dismiss: (id: string) => void;
  undo: () => void;
  reset: () => void;
}

const clone = <T,>(v: T): T => structuredClone(v);
const nameOf = (n: SkNode | null) => (n ? `'${n.name || "이름 없음"}'` : "?");

export const useSkeletonStore = create<SkState>((set, get) => {
  /** 현재 문서를 고친다: 되돌리기 스냅숏 + 명령 기록 */
  const mutate = (op: SkCommand["op"], text: string | ((doc: SkDoc) => string), fn: (doc: SkDoc) => void | false, by: "human" | "ai" = "human") => {
    const { docs, docId, undoStack, log } = get();
    const before = docs[docId];
    const doc = clone(before);
    if (fn(doc) === false) return;
    const t = typeof text === "function" ? text(doc) : text;
    set({
      docs: { ...docs, [docId]: doc },
      undoStack: [...undoStack.slice(-49), { docId, doc: before }],
      log: [...log.slice(-49), { op, text: t, by, at: Date.now() }],
    });
  };
  const nodes = () => get().docs[get().docId].nodes;

  return {
    docs: initialDocs(),
    docId: "doc-new",
    phase: 1,
    selected: [],
    editing: null,
    collapsed: {},
    undoStack: [],
    log: [],

    setDoc: (docId) => set({ docId, selected: [], editing: null }),
    setPhase: (phase) => set({ phase }),
    select: (id, mode = "only") =>
      set((s) => {
        if (mode === "toggle") return { selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] };
        if (mode === "range" && s.selected.length) {
          const at = locate(nodes(), id);
          const first = locate(nodes(), s.selected[0]);
          if (at && first && at.list === first.list) {
            const [a, b] = [first.index, at.index].sort((x, y) => x - y);
            return { selected: at.list.slice(a, b + 1).map((n) => n.id) };
          }
        }
        return { selected: [id] };
      }),
    clearSelect: () => set({ selected: [], editing: null }),
    setEditing: (editing) => set({ editing }),
    toggle: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
    setPurpose: (v) => {
      const { docs, docId } = get();
      set({ docs: { ...docs, [docId]: { ...docs[docId], purpose: v } } });
    },

    addSection: (afterId, asChild) => {
      const sec = makeSection();
      mutate(
        "insert_node",
        (doc) => {
          const parent = asChild && afterId ? findSk(doc.nodes, afterId) : afterId ? locate(doc.nodes, afterId)?.parent : null;
          return `새 섹션${parent ? ` → ${nameOf(parent)} 안` : ""}`;
        },
        (doc) => {
          if (asChild && afterId) {
            const p = findSk(doc.nodes, afterId);
            if (!p) return false;
            p.children.push(sec);
          } else if (afterId) {
            const at = locate(doc.nodes, afterId);
            if (!at) return false;
            at.list.splice(at.index + 1, 0, sec);
          } else doc.nodes.push(sec);
        },
      );
      set((s) => ({ selected: [sec.id], editing: { id: sec.id, field: "name" }, collapsed: asChild && afterId ? { ...s.collapsed, [afterId]: false } : s.collapsed }));
    },
    rename: (id, name) => {
      const old = findSk(nodes(), id);
      if (!old || old.name === name.trim()) return set({ editing: null });
      mutate("update_node", `${nameOf(old)} → '${name.trim()}' 이름`, (doc) => {
        const n = findSk(doc.nodes, id);
        if (n) n.name = name.trim();
      });
      set({ editing: null });
    },
    setIntent: (id, intent) => {
      const old = findSk(nodes(), id);
      if (!old || old.intent === intent.trim()) return set({ editing: null });
      mutate("update_node", `${nameOf(old)} 의도: ${intent.trim() || "(비움)"}`, (doc) => {
        const n = findSk(doc.nodes, id);
        if (n) n.intent = intent.trim();
      });
      set({ editing: null });
    },
    indent: (id) =>
      mutate("indent_node", `${nameOf(findSk(nodes(), id))} 들여쓰기`, (doc) => {
        const at = locate(doc.nodes, id);
        if (!at || at.index === 0) return false;
        const prev = at.list[at.index - 1];
        if (prev.kind !== "section") return false;
        const [n] = at.list.splice(at.index, 1);
        prev.children.push(n);
      }),
    outdent: (id) =>
      mutate("indent_node", `${nameOf(findSk(nodes(), id))} 내어쓰기`, (doc) => {
        const at = locate(doc.nodes, id);
        if (!at?.parent) return false;
        const up = locate(doc.nodes, at.parent.id);
        if (!up) return false;
        const [n] = at.list.splice(at.index, 1);
        up.list.splice(up.index + 1, 0, n);
      }),
    nudge: (id, dir) =>
      mutate("move_node", `${nameOf(findSk(nodes(), id))} ${dir < 0 ? "위로" : "아래로"}`, (doc) => {
        const at = locate(doc.nodes, id);
        if (!at) return false;
        const to = at.index + dir;
        if (to < 0 || to >= at.list.length) return false;
        const [n] = at.list.splice(at.index, 1);
        at.list.splice(to, 0, n);
      }),
    moveTo: (ids, targetId, pos) => {
      const ns = nodes();
      const target = findSk(ns, targetId);
      if (!target || ids.includes(targetId) || ids.some((i) => isAncestor(ns, i, targetId))) return;
      if (pos === "inside" && target.kind !== "section") return;
      mutate(
        "move_node",
        `${ids.map((i) => nameOf(findSk(ns, i))).join(", ")} → ${nameOf(target)} ${pos === "inside" ? "안" : pos === "before" ? "앞" : "뒤"}`,
        (doc) => {
          const moving: SkNode[] = [];
          for (const i of ids) {
            const at = locate(doc.nodes, i);
            if (at) moving.push(...at.list.splice(at.index, 1));
          }
          if (pos === "inside") {
            const t = findSk(doc.nodes, targetId);
            if (!t) return false;
            t.children.push(...moving);
          } else {
            const at = locate(doc.nodes, targetId);
            if (!at) return false;
            at.list.splice(pos === "before" ? at.index : at.index + 1, 0, ...moving);
          }
        },
      );
      if (pos === "inside") set((s) => ({ collapsed: { ...s.collapsed, [targetId]: false } }));
    },
    duplicate: (ids) =>
      mutate("insert_node", `${ids.map((i) => nameOf(findSk(nodes(), i))).join(", ")} 복제`, (doc) => {
        for (const i of ids) {
          const at = locate(doc.nodes, i);
          if (!at) continue;
          const copy = clone(at.list[at.index]);
          const reid = (n: SkNode) => {
            n.id = newId(n.kind === "section" ? "s" : "b");
            n.name = n === copy ? `${n.name} 복사` : n.name;
            n.children.forEach(reid);
          };
          reid(copy);
          at.list.splice(at.index + 1, 0, copy);
        }
      }),
    remove: (ids) => {
      mutate("delete_node", `${ids.map((i) => nameOf(findSk(nodes(), i))).join(", ")} 삭제`, (doc) => {
        for (const i of ids) {
          const at = locate(doc.nodes, i);
          if (at) at.list.splice(at.index, 1);
        }
      });
      set({ selected: [] });
    },
    group: (ids) => {
      if (!ids.length) return;
      const sec = makeSection("새 묶음", "");
      mutate("insert_node", `${ids.length}개를 새 섹션으로 묶기`, (doc) => {
        const first = locate(doc.nodes, ids[0]);
        if (!first) return false;
        const list = first.list;
        const index = first.index;
        for (const i of ids) {
          const at = locate(doc.nodes, i);
          if (at) sec.children.push(...at.list.splice(at.index, 1));
        }
        list.splice(Math.min(index, list.length), 0, sec);
      });
      set({ selected: [sec.id], editing: { id: sec.id, field: "name" } });
    },
    assignPart: (id, part) => {
      const n = findSk(nodes(), id);
      if (!n) return;
      mutate("assign_template", `${nameOf(n)} ← ${partLabel(part)}`, (doc) => {
        const t = findSk(doc.nodes, id);
        if (!t) return false;
        if (t.kind === "section") t.children.push(makeBlock(part, t.name));
        else {
          const sectionName = locate(doc.nodes, id)?.parent?.name ?? t.name;
          const fresh = partSlots(part, sectionName);
          t.part = part;
          t.slots = fresh.slots;
          t.rows = fresh.rows;
          if (!t.name || t.name === partLabel(t.part)) t.name = partLabel(part);
        }
      });
      if (n.kind === "section") set((s) => ({ collapsed: { ...s.collapsed, [id]: false } }));
    },
    updateSlot: (blockId, key, patch) =>
      mutate("update_slot", `${key} ${Object.entries(patch).map(([k, v]) => `${k}=${String(v)}`).join(" ")}`, (doc) => {
        const b = findSk(doc.nodes, blockId);
        const sl = b?.slots?.find((s) => s.key === key);
        if (!sl) return false;
        Object.assign(sl, patch);
        if (patch.label && !patch.key) {
          const base = sl.key.slice(0, sl.key.lastIndexOf(".") + 1);
          sl.key = `${base}${keyPrefix(patch.label)}`;
        }
      }),
    addSlot: (blockId) =>
      mutate("update_slot", "칸 추가", (doc) => {
        const b = findSk(doc.nodes, blockId);
        if (!b) return false;
        const sectionName = locate(doc.nodes, blockId)?.parent?.name ?? b.name;
        const base = b.part === "repeat" || b.part === "list" ? `${keyPrefix(sectionName)}[]` : keyPrefix(sectionName);
        const n = (b.slots?.length ?? 0) + 1;
        b.slots = [...(b.slots ?? []), { key: `${base}.새칸${n}`, label: `새 칸 ${n}`, type: "text", filledBy: "author", aiFillable: true }];
      }),
    removeSlot: (blockId, key) =>
      mutate("update_slot", `${key} 칸 삭제`, (doc) => {
        const b = findSk(doc.nodes, blockId);
        if (!b?.slots) return false;
        b.slots = b.slots.filter((s) => s.key !== key);
      }),
    setRows: (blockId, rows) =>
      mutate("update_slot", `행 수 ${rows}`, (doc) => {
        const b = findSk(doc.nodes, blockId);
        if (!b) return false;
        b.rows = Math.max(1, Math.min(30, rows));
      }),
    aiFill: (blockId) =>
      mutate(
        "update_slot",
        (doc) => `${nameOf(findSk(doc.nodes, blockId))} AI 채우기 (근거 표시)`,
        (doc) => {
          const b = findSk(doc.nodes, blockId);
          if (!b?.slots) return false;
          let n = 0;
          for (const s of b.slots) {
            if (s.aiFillable && !s.value && (s.filledBy === "author" || s.filledBy === "applicant")) {
              s.value = s.type === "date" ? "2026.10.27" : s.type === "number" ? "1" : s.type === "longtext" ? `${b.name} 초안 (AI)` : `${s.label} (AI)`;
              n++;
            }
          }
          if (!n) return false;
        },
        "ai",
      ),
    suggestOutline: (refSkeleton) => {
      const doc = get().docs[get().docId];
      const picks = suggestSections(doc.purpose, refSkeleton).filter((p) => !doc.nodes.some((n) => n.name === p.name));
      if (!picks.length) return;
      mutate(
        "insert_node",
        `AI 목차 제안 ${picks.length}개${refSkeleton?.length ? " (레퍼런스 뼈대)" : ""}`,
        (d) => {
          for (const p of picks) d.nodes.push({ ...makeSection(p.name, p.intent), ghost: true });
        },
        "ai",
      );
    },
    suggestParts: () =>
      mutate(
        "assign_template",
        "AI 서식 추천 (부품 없는 섹션에)",
        (d) => {
          let n = 0;
          const walk = (list: SkNode[]) => {
            for (const s of list) {
              if (s.kind !== "section" || s.ghost) continue;
              if (!s.children.some((c) => c.kind === "block")) {
                s.children.push({ ...makeBlock(suggestPart(s.name, s.intent), s.name), ghost: true });
                n++;
              }
              walk(s.children);
            }
          };
          walk(d.nodes);
          if (!n) return false;
        },
        "ai",
      ),
    accept: (id) =>
      mutate("accept_suggestion", `${nameOf(findSk(nodes(), id))} 받기`, (doc) => {
        const n = findSk(doc.nodes, id);
        if (!n) return false;
        n.ghost = false;
      }),
    dismiss: (id) =>
      mutate("delete_node", `${nameOf(findSk(nodes(), id))} 제안 버리기`, (doc) => {
        const at = locate(doc.nodes, id);
        if (!at) return false;
        at.list.splice(at.index, 1);
      }),
    undo: () => {
      const { undoStack, docs, log } = get();
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      set({
        docs: { ...docs, [last.docId]: last.doc },
        docId: last.docId,
        undoStack: undoStack.slice(0, -1),
        // 되돌린 명령은 기록에서 뺀다 (명령 하나 = 되돌리기 하나)
        log: log.slice(0, -1),
        editing: null,
      });
    },
    reset: () => set({ docs: initialDocs(), undoStack: [], log: [], selected: [], editing: null }),
  };
});
