import { create } from "zustand";

/** 시안 E 전용 — 화면 상태만 (목차 데이터는 useSidebarLabStore.docs). */

/** 끌어 옮기는 줄 — 내 목차의 줄이거나 다른 프로젝트의 장 · 구역 */
export interface DragNode {
  /** 지금 쓰는 프로젝트면 null */
  projectId: string | null;
  id: string;
  kind: "chapter" | "section";
  /** "넛지 1 · 4 기본값이 정하는 것" */
  label: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "ai";
  text: string;
  /** 이 말을 할 때 붙어 있던 참고 */
  refs?: string[];
  /** AI 가 제안한 구역 — "목차에 넣기" */
  proposal?: { chapterId: string; chapterName: string; items: { name: string; intent: string; sample: string; cites?: string[] }[]; applied?: boolean };
}

interface ELabState {
  /** 확대(줌)한 장 — Workflowy 처럼 그 장만 뿌리가 된다 */
  zoomId: string | null;
  /** 이름을 고치는 줄 */
  editingId: string | null;
  /** 요약 한 줄 보이기 */
  showSyn: boolean;
  /** 대화에 붙인 참고 */
  chips: DragNode[];
  messages: ChatMsg[];
  /** 다른 프로젝트의 장 미리보기 */
  peek: { projectId: string; chapterId: string } | null;
  /** 끄는 중 (대화 칸 · 목차가 놓을 자리를 보여 준다) */
  dragging: DragNode | null;
  /** 접은 프로젝트 뿌리 */
  closedRoots: Record<string, boolean>;

  setZoom: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  toggleSyn: () => void;
  addChip: (n: DragNode) => void;
  removeChip: (id: string) => void;
  push: (m: ChatMsg) => void;
  markApplied: (msgId: string) => void;
  setPeek: (p: { projectId: string; chapterId: string } | null) => void;
  setDragging: (n: DragNode | null) => void;
  toggleRoot: (id: string, defaultClosed: boolean) => void;
  reset: () => void;
}

const initial = {
  zoomId: null,
  editingId: null,
  showSyn: true,
  chips: [] as DragNode[],
  messages: [] as ChatMsg[],
  peek: null,
  dragging: null,
  closedRoots: {} as Record<string, boolean>,
};

export const useELabStore = create<ELabState>((set, get) => ({
  ...initial,
  setZoom: (zoomId) => set({ zoomId }),
  setEditing: (editingId) => set({ editingId }),
  toggleSyn: () => set({ showSyn: !get().showSyn }),
  addChip: (n) => set({ chips: get().chips.some((c) => c.id === n.id) ? get().chips : [...get().chips, n] }),
  removeChip: (id) => set({ chips: get().chips.filter((c) => c.id !== id) }),
  push: (m) => set({ messages: [...get().messages, m] }),
  markApplied: (msgId) =>
    set({ messages: get().messages.map((m) => (m.id === msgId && m.proposal ? { ...m, proposal: { ...m.proposal, applied: true } } : m)) }),
  setPeek: (peek) => set({ peek }),
  setDragging: (dragging) => set({ dragging }),
  toggleRoot: (id, defaultClosed) => set({ closedRoots: { ...get().closedRoots, [id]: !(get().closedRoots[id] ?? defaultClosed) } }),
  reset: () => set(initial),
}));

export const DRAG_MIME = "application/x-vds-outline-node";
