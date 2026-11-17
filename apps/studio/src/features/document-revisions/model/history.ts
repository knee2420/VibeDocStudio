import type { RevisionEntry } from "@/entities/vdoc-document";

/** 이만큼 쉬면 다른 편집 세션 (구글 문서 버전 기록처럼 자동 저장을 작업 단위로 묶는다). */
export const SESSION_GAP_MS = 20 * 60 * 1000;

/** 자동 저장 여러 번을 묶은 한 번의 작업 — 사람의 연속 편집, 또는 AI 실행 하나. */
export interface EditSession {
  type: "session";
  id: string;
  author: "human" | "ai";
  harnessId?: string | null;
  runId?: string | null;
  start: string;
  end: string;
  fromRev: number;
  toRev: number;
  /** 바뀐 칸마다 세션 시작 전 · 끝 내용 */
  slotIds: string[];
  before: Record<string, string>;
  after: Record<string, string>;
  labels: Record<string, string>;
  /** AI 실행이 남긴 설명 (사람 편집은 "편집"뿐이라 쓰지 않는다) */
  note?: string;
  saves: number;
}


const t = (at: string) => {
  const v = Date.parse(at);
  return Number.isNaN(v) ? 0 : v;
};

function sameWork(s: EditSession, e: RevisionEntry): boolean {
  if (s.author !== e.author) return false;
  if (e.author === "ai") return (s.runId ?? null) === (e.runId ?? null) && (s.harnessId ?? null) === (e.harnessId ?? null);
  return t(e.at) - t(s.end) <= SESSION_GAP_MS;
}

function startSession(e: RevisionEntry): EditSession {
  return {
    type: "session",
    id: `s${e.rev}`,
    author: e.author,
    harnessId: e.harnessId,
    runId: e.runId,
    start: e.since ?? e.at,
    end: e.at,
    fromRev: e.rev,
    toRev: e.rev,
    slotIds: [],
    before: {},
    after: {},
    labels: {},
    note: e.author === "ai" && e.label && e.label !== "AI 변경 적용" ? e.label : undefined,
    saves: 0,
  };
}

function absorb(s: EditSession, e: RevisionEntry) {
  s.end = e.at;
  s.toRev = e.rev;
  s.saves += 1;
  for (const c of e.slots) {
    if (!(c.slotId in s.before)) {
      s.slotIds.push(c.slotId);
      s.before[c.slotId] = c.before;
    }
    s.after[c.slotId] = c.after;
    s.labels[c.slotId] = c.label;
  }
}

/**
 * 개정 기록(저장 하나하나) → 최신순 편집 세션 (자동 저장을 작업 단위로 묶는다).
 * 사람은 20분 넘게 쉬면 다른 세션, AI 는 실행마다 따로. 변수만 바뀐 저장은 칸 변경이 없는 세션이 된다.
 */
export function buildHistory(entries: RevisionEntry[]): EditSession[] {
  const out: EditSession[] = [];
  let cur: EditSession | null = null;
  for (const e of [...entries].sort((a, b) => a.rev - b.rev)) {
    if (!cur || !sameWork(cur, e)) {
      if (cur) out.push(cur);
      cur = startSession(e);
    }
    absorb(cur, e);
  }
  if (cur) out.push(cur);
  return out.reverse();
}

/** "오늘" · "어제" · "11월 14일 (금)" */
export function dayLabel(at: string, now = new Date()): string {
  const d = new Date(t(at));
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("ko-KR", { ...(sameYear ? {} : { year: "numeric" }), month: "long", day: "numeric", weekday: "short" });
}

/** "오후 2:10" */
export const timeLabel = (at: string) => new Date(t(at)).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

/** "오후 2:10 – 2:45" (같은 시각이면 하나) */
export function timeRange(start: string, end: string): string {
  const a = timeLabel(start);
  const b = timeLabel(end);
  if (a === b) return a;
  const [ap, ...rest] = b.split(" ");
  return a.startsWith(ap) ? `${a} – ${rest.join(" ")}` : `${a} – ${b}`;
}

export const authorLabel = (s: Pick<EditSession, "author" | "harnessId">) =>
  s.author === "ai" ? `AI${s.harnessId ? ` · ${s.harnessId}` : ""}` : "직접 편집";
