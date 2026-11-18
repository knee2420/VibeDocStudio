import { create } from "zustand";

import { CITATIONS, DEFAULT_ROLES, type LabRole } from "./dummy";

export type RefMode = "layout" | "text";
export type WorkMode = "gather" | "write" | "review";

interface LabState {
  /** 캔버스 옆(참고 칸)에 열린 레퍼런스 */
  openRefId: string | null;
  refMode: RefMode;
  /** 이 문서에 물린 레퍼런스 (뼈대 참고) */
  pinnedRefs: string[];
  /** 근거로 물린 리소스 — 고르는 곳은 리소스 칸 한 곳, Composer 칩은 이걸 비춘다 */
  attachedRes: string[];
  /** 눌러서 강조 중인 출처 번호 */
  activeCite: number | null;
  /** 지금 보는 쪽 */
  activePage: string;
  roles: Record<string, LabRole>;
  libraryOpen: boolean;
  /** Shift+\ — 캔버스만 */
  minimized: boolean;
  workMode: WorkMode;
  toast: string | null;

  openRef: (id: string | null) => void;
  setRefMode: (m: RefMode) => void;
  togglePinnedRef: (id: string) => void;
  toggleRes: (id: string) => void;
  cite: (n: number | null) => void;
  setPage: (id: string) => void;
  setRole: (id: string, role: keyof LabRole, on: boolean) => void;
  setLibrary: (open: boolean) => void;
  toggleMinimized: () => void;
  setWorkMode: (m: WorkMode) => void;
  say: (msg: string) => void;
}

let toastTimer: number | undefined;

export const useLabStore = create<LabState>((set, get) => ({
  openRefId: null,
  refMode: "layout",
  pinnedRefs: ["r-nyc", "r-redhash"],
  attachedRes: ["s-minutes", "s-kolas"],
  activeCite: null,
  activePage: "p1",
  roles: DEFAULT_ROLES,
  libraryOpen: false,
  minimized: false,
  workMode: "write",
  toast: null,

  openRef: (openRefId) => set({ openRefId }),
  setRefMode: (refMode) => set({ refMode }),
  togglePinnedRef: (id) =>
    set((s) => ({ pinnedRefs: s.pinnedRefs.includes(id) ? s.pinnedRefs.filter((x) => x !== id) : [...s.pinnedRefs, id] })),
  toggleRes: (id) =>
    set((s) => ({ attachedRes: s.attachedRes.includes(id) ? s.attachedRes.filter((x) => x !== id) : [...s.attachedRes, id] })),
  cite: (n) => {
    set({ activeCite: n });
    // 출처를 누르면 그 자료를 근거로 물린 것으로 본다 (근거 칸에서 바로 보이게).
    const c = n ? CITATIONS[n] : null;
    if (c && !get().attachedRes.includes(c.itemId)) set((s) => ({ attachedRes: [...s.attachedRes, c.itemId] }));
  },
  setPage: (activePage) => set({ activePage }),
  setRole: (id, role, on) =>
    set((s) => {
      const roles = { ...s.roles, [id]: { ...(s.roles[id] ?? { ref: false, res: false }), [role]: on } };
      return {
        roles,
        pinnedRefs: role === "ref" && !on ? s.pinnedRefs.filter((x) => x !== id) : s.pinnedRefs,
        attachedRes: role === "res" && !on ? s.attachedRes.filter((x) => x !== id) : s.attachedRes,
        openRefId: role === "ref" && !on && s.openRefId === id ? null : s.openRefId,
      };
    }),
  setLibrary: (libraryOpen) => set({ libraryOpen }),
  toggleMinimized: () => set((s) => ({ minimized: !s.minimized })),
  setWorkMode: (workMode) => set({ workMode }),
  say: (toast) => {
    window.clearTimeout(toastTimer);
    set({ toast });
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600);
  },
}));
