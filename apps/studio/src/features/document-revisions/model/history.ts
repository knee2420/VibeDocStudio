import type { VDocNamedVersion } from "@vibe/vdoc-schema";

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

export interface VersionMark {
  type: "version";
  version: VDocNamedVersion;
}

export type HistoryItem = EditSession | VersionMark;

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
 * 개정 기록(저장 하나하나) → 최신순 작업 기록: 편집 세션과 이름 붙인 버전이 섞인 타임라인.
 * 세션은 이름 붙인 버전을 넘어 이어지지 않는다 (버전 앞뒤가 섞이지 않게).
 * 변수만 바뀐 저장은 세션에 들어가되 칸 변경은 없다.
 */
export function buildHistory(entries: RevisionEntry[], versions: VDocNamedVersion[] = []): HistoryItem[] {
  const asc = [...entries].sort((a, b) => a.rev - b.rev);
  const marks = [...versions].sort((a, b) => a.rev - b.rev);
  const out: HistoryItem[] = [];
  let cur: EditSession | null = null;
  let vi = 0;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const e of asc) {
    while (vi < marks.length && marks[vi].rev < e.rev) {
      flush();
      out.push({ type: "version", version: marks[vi++] });
    }
    if (!cur || !sameWork(cur, e)) {
      flush();
      cur = startSession(e);
    }
    absorb(cur!, e);
  }
  flush();
  while (vi < marks.length) out.push({ type: "version", version: marks[vi++] });
  return out.reverse();
}

/** 이 버전 이후 지금까지 바뀐 칸 (각 칸의 버전 당시 내용 → 지금 기록의 마지막 내용). */
export function changesSince(entries: RevisionEntry[], rev: number) {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const slotIds: string[] = [];
  for (const e of [...entries].filter((x) => x.rev > rev).sort((a, b) => a.rev - b.rev)) {
    for (const c of e.slots) {
      if (!(c.slotId in before)) {
        slotIds.push(c.slotId);
        before[c.slotId] = c.before;
      }
      after[c.slotId] = c.after;
      labels[c.slotId] = c.label;
    }
  }
  return { slotIds, before, after, labels };
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
