import { create } from "zustand";

import { MESSY, PAGES, type Block, type Fill, type Note } from "./data";

export type Phase = 1 | 2 | 3 | 4;

interface MockState {
  phase: Phase;
  /* ① 뼈대 */
  notes: Note[];
  tidied: boolean;
  proposalOpen: boolean;
  /** 쪽 넣고 빼기 (혜택 한눈에는 제안을 받아야 들어간다) */
  pageOn: Record<string, boolean>;
  launchFound: boolean;
  focusNote: string | null;
  focusRef: string | null;
  /* ② 서식 */
  brand: string;
  format: string;
  /* ③ 채우기 */
  page: string;
  block: string | null;
  fills: Record<string, Fill>;
  fixes: Record<string, Partial<Block>>;
  /* ④ 검토 · 출력 */
  bleed: boolean;
  mono: boolean;
  /** 흑백 미리보기를 한 번이라도 봤나 (체크리스트) */
  monoSeen: boolean;
  exported: boolean;
  toast: string | null;

  setPhase: (p: Phase) => void;
  setNote: (id: string, text: string) => void;
  addNoteAfter: (id: string) => string;
  indentNote: (id: string, d: 1 | -1) => void;
  removeNote: (id: string) => void;
  setFocusNote: (id: string | null) => void;
  setFocusRef: (id: string | null) => void;
  openProposal: (open: boolean) => void;
  acceptProposal: () => void;
  acceptSummary: () => void;
  acceptLaunch: () => void;
  setBrand: (id: string) => void;
  setFormat: (id: string) => void;
  goPage: (id: string, block?: string | null) => void;
  confirm: (blockId: string) => void;
  fixRisk: (blockId: string) => void;
  setBleed: (v: boolean) => void;
  setMono: (v: boolean) => void;
  exportPdf: () => void;
  say: (m: string) => void;
  reset: () => void;
}

let tid: number | undefined;
let seq = 0;

const initial = () => ({
  phase: 1 as Phase,
  notes: MESSY.map((n) => ({ ...n })),
  tidied: false,
  proposalOpen: false,
  pageOn: Object.fromEntries(PAGES.map((p) => [p.id, p.id !== "p2"])) as Record<string, boolean>,
  launchFound: false,
  focusNote: null as string | null,
  focusRef: null as string | null,
  brand: "coral",
  format: "a4-8",
  page: "p1",
  block: null as string | null,
  fills: Object.fromEntries(PAGES.flatMap((p) => p.blocks.map((b) => [b.id, b.fill]))) as Record<string, Fill>,
  fixes: {} as Record<string, Partial<Block>>,
  bleed: true,
  mono: false,
  monoSeen: false,
  exported: false,
  toast: null as string | null,
});

/** 위험한 곳을 근거대로 고친 결과 */
const FIX: Record<string, Partial<Block>> = {
  "p3-t2": { rows: [["결제 수단", "할인율", "통합 월 한도"], ["클로드페이", "10%", "6천 · 1만 · 1만 5천원"], ["네이버페이 · 카카오페이 · 토스페이", "5%", "위와 통합"]] } as Partial<Block>,
  "p6-first": { text: "처음 발급받은 달과 그다음 달은 실적이 없어도 1구간 혜택을 드려요." } as Partial<Block>,
};

export const useMock = create<MockState>((set, get) => ({
  ...initial(),
  setPhase: (phase) => set({ phase }),
  setNote: (id, text) =>
    set({
      notes: get().notes.map((n) => (n.id === id ? { ...n, text, to: guess(text, n.to) } : n)),
    }),
  addNoteAfter: (id) => {
    const notes = [...get().notes];
    const i = notes.findIndex((n) => n.id === id);
    const nn: Note = { id: `u${seq++}`, text: "", depth: notes[i]?.depth ?? 0, to: [] };
    notes.splice(i + 1, 0, nn);
    set({ notes, focusNote: nn.id });
    return nn.id;
  },
  indentNote: (id, d) => set({ notes: get().notes.map((n) => (n.id === id ? { ...n, depth: Math.max(0, Math.min(3, n.depth + d)) } : n)) }),
  removeNote: (id) => {
    const notes = get().notes;
    const i = notes.findIndex((n) => n.id === id);
    if (notes.length <= 1) return;
    set({ notes: notes.filter((n) => n.id !== id), focusNote: notes[Math.max(0, i - 1)]?.id ?? null });
  },
  setFocusNote: (focusNote) => set({ focusNote }),
  setFocusRef: (focusRef) => set({ focusRef }),
  openProposal: (proposalOpen) => set({ proposalOpen }),
  acceptProposal: () => {
    set({ tidied: true, proposalOpen: false });
    get().say("뼈대를 정돈했어요 — 쓰신 말은 쪽마다 메모로 남았어요");
  },
  acceptSummary: () => {
    set({ pageOn: { ...get().pageOn, p2: true } });
    get().say("2쪽 '혜택 한눈에'를 넣었어요");
  },
  acceptLaunch: () => {
    set({ launchFound: true });
    get().say("출시일 2027년 3월 2일을 8쪽에 넣었어요");
  },
  setBrand: (brand) => set({ brand }),
  setFormat: (format) => set({ format }),
  goPage: (page, block = null) => set({ page, block }),
  confirm: (id) => set({ fills: { ...get().fills, [id]: "ok" } }),
  fixRisk: (id) => {
    set({ fixes: { ...get().fixes, [id]: FIX[id] ?? {} }, fills: { ...get().fills, [id]: "ok" } });
    get().say("근거(혜택 정의서 · 기획안)대로 고쳤어요");
  },
  setBleed: (bleed) => set({ bleed }),
  setMono: (mono) => set({ mono, monoSeen: get().monoSeen || mono }),
  exportPdf: () => {
    set({ exported: true });
    get().say("PDF 를 만들었어요 (목업) — 클로드카드_2030_상품안내장.pdf");
  },
  say: (toast) => {
    window.clearTimeout(tid);
    set({ toast });
    tid = window.setTimeout(() => set({ toast: null }), 2600);
  },
  reset: () => set(initial()),
}));

/** 새로 쓴 메모가 어느 쪽인지 — 목업용 짐작 */
function guess(text: string, prev: string[]): string[] {
  const t = text.toLowerCase();
  if (!t.trim()) return [];
  const rules: [RegExp, string][] = [
    [/표지|이름|슬로건|한 줄/, "p1"],
    [/요약|한눈/, "p2"],
    [/구독|넷플|티빙|멜론|노션|간편|페이/, "p3"],
    [/팩|배달|카페|운동/, "p4"],
    [/해외|라운지|여행/, "p5"],
    [/실적|구간|제외|첫 ?카드/, "p6"],
    [/연회비|발급|캐시백/, "p7"],
    [/법정|고지|심의|연체|유의/, "p8"],
  ];
  const hit = rules.filter(([r]) => r.test(t)).map(([, p]) => p);
  return hit.length ? [...new Set(hit)] : prev.length && text.length < 3 ? prev : [];
}

/** 화면에 보일 블록 (고친 내용 덮어쓰기) */
export function view(b: Block, fixes: Record<string, Partial<Block>>): Block {
  return { ...b, ...(fixes[b.id] ?? {}) } as Block;
}

/** 지금 문서에 들어가는 쪽 */
export function livePages(pageOn: Record<string, boolean>) {
  return PAGES.filter((p) => pageOn[p.id]);
}

/** 채우기 상태 세기 */
export function tally(fills: Record<string, Fill>, pageOn: Record<string, boolean>) {
  const c = { ok: 0, draft: 0, risk: 0, ref: 0, total: 0 };
  for (const p of livePages(pageOn))
    for (const b of p.blocks) {
      c[fills[b.id]]++;
      c.total++;
    }
  return c;
}
