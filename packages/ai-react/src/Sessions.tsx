import React, { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { SessionAnchor, SessionRegistry, SessionStatus, SessionTabState, SessionView } from "@vibe/ai-kernel";

/**
 * 기준점 세션 화면 조각 — 상태 점 · 세션 표시(칩) · 표시 겹층.
 * 데이터는 모두 `SessionRegistry` 하나에서 온다 (표시 · 탭 · 대시보드가 같은 원본).
 */

export function useSessionList(registry: SessionRegistry): SessionView[] {
  return useSyncExternalStore(registry.subscribe, registry.list, registry.list);
}

export function useSessionTabs(registry: SessionRegistry): SessionTabState {
  return useSyncExternalStore(registry.subscribe, registry.getTabState, registry.getTabState);
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  running: "진행 중",
  awaiting_approval: "승인 대기",
  needs_review: "검토 필요",
  error: "오류",
  queued: "대기열",
  interrupted: "끊김",
  idle: "끝남",
  completed: "완료",
};

const DOT_CLASS: Record<SessionStatus, string> = {
  running: "bg-sky-400 animate-pulse",
  awaiting_approval: "bg-amber-400",
  needs_review: "bg-violet-400",
  error: "bg-rose-500",
  queued: "border border-slate-400 bg-transparent",
  interrupted: "border border-slate-400 bg-slate-600",
  idle: "bg-emerald-400",
  completed: "bg-slate-500",
};

export function SessionStatusDot({ status, className = "" }: { status: SessionStatus; className?: string }) {
  return (
    <span
      aria-label={SESSION_STATUS_LABEL[status]}
      title={SESSION_STATUS_LABEL[status]}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[status]} ${className}`}
    />
  );
}

const clip = (text: string, n: number) => (text.length <= n ? text : `${text.slice(0, n - 1)}…`);

/** 선택 옆 작은 세션 표시 — 누르면 그 세션 탭이 열린다 */
export function SessionChip({
  session,
  extra = 0,
  onOpen,
}: {
  session: SessionView;
  /** 같은 자리에 더 있는 세션 수 */
  extra?: number;
  onOpen(key: string): void;
}) {
  const tip = [
    session.instruction || session.title,
    `${SESSION_STATUS_LABEL[session.status]}${session.reviewCount ? ` · 변경안 ${session.reviewCount}` : ""}`,
    session.anchor?.label ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      data-testid="session-chip"
      data-session-key={session.key}
      data-session-status={session.status}
      title={tip}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(session.key);
      }}
      className="pointer-events-auto relative inline-flex max-w-[180px] cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-[#1e1f24]/95 px-2 py-[3px] text-[10.5px] font-medium leading-none text-slate-200 shadow-md shadow-black/40 backdrop-blur-sm transition-colors hover:border-violet-400/60 hover:bg-[#2a2b33]"
    >
      <SessionStatusDot status={session.status} />
      <span className="truncate">{clip(session.title, 22)}</span>
      {session.reviewCount > 0 && (
        <span className="rounded-full bg-violet-500/30 px-1 text-[9.5px] text-violet-200">{session.reviewCount}</span>
      )}
      {extra > 0 && <span className="text-[9.5px] text-slate-400">+{extra}</span>}
      {session.unread && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-rose-400" />}
    </button>
  );
}

/** 기준점 항목들이 화면에서 차지하는 띠 (붙어 있는 줄은 하나로 합친다). 좌표는 스크롤 컨테이너 내용 기준 */
export interface AnchorBand {
  readonly top: number;
  readonly height: number;
  readonly left: number;
}

interface BandTarget {
  readonly key: string;
  readonly anchor: SessionAnchor;
}

const BAND_GAP = 10;

function sameBands(a: readonly AnchorBand[] | undefined, b: readonly AnchorBand[]): boolean {
  return !!a && a.length === b.length && a.every((x, i) => x.top === b[i].top && x.height === b[i].height && x.left === b[i].left);
}

/**
 * 기준점 → 화면 띠. 화면 패키지는 AI 를 모른다: 항목 요소는 `locate` 로 찾는다 (예: `[data-node-id]`).
 * 위치는 내용 기준으로 재므로 스크롤에는 다시 재지 않고, 크기 · 내용 변화(프레임당 한 번)와 대상 변화에만 다시 잰다.
 */
export function useAnchorBands(
  container: HTMLElement | null,
  targets: readonly BandTarget[],
  locate: (anchor: SessionAnchor) => HTMLElement[]
): ReadonlyMap<string, readonly AnchorBand[]> {
  const [bands, setBands] = useState<ReadonlyMap<string, readonly AnchorBand[]>>(() => new Map());
  const frame = useRef<number | null>(null);
  const latest = useRef({ targets, locate, container });
  latest.current = { targets, locate, container };

  const schedule = useRef(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const { targets: list, locate: find, container: box } = latest.current;
      if (!box) return;
      const base = box.getBoundingClientRect();
      const next = new Map<string, AnchorBand[]>();
      for (const { key, anchor } of list) {
        const rects = find(anchor)
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0)
          .map((r) => ({ top: r.top - base.top + box.scrollTop, bottom: r.bottom - base.top + box.scrollTop, left: r.left - base.left + box.scrollLeft }))
          .sort((a, b) => a.top - b.top);
        const merged: { top: number; bottom: number; left: number }[] = [];
        for (const r of rects) {
          const last = merged[merged.length - 1];
          if (last && r.top - last.bottom <= BAND_GAP) {
            last.bottom = Math.max(last.bottom, r.bottom);
            last.left = Math.min(last.left, r.left);
          } else merged.push({ ...r });
        }
        if (merged.length) next.set(key, merged.map((m) => ({ top: Math.round(m.top), height: Math.round(m.bottom - m.top), left: Math.round(m.left) })));
      }
      setBands((prev) => (prev.size === next.size && [...next].every(([k, v]) => sameBands(prev.get(k), v)) ? prev : next));
    });
  }).current;

  useLayoutEffect(() => {
    if (!container) return;
    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const mutation = new MutationObserver(schedule);
    mutation.observe(container, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [container, schedule]);

  const sig = targets.map((t) => `${t.key}:${t.anchor.path}:${t.anchor.itemIds.join(",")}`).join("|");
  useLayoutEffect(() => {
    schedule();
  }, [sig, schedule]);
  return bands;
}

/** 세션 상태별 띠 색 (왼쪽 줄 · 옅은 바탕). 끝났거나 끊긴 세션은 띠 없이 표시만 */
const BAND_TONE: Partial<Record<SessionStatus, { bar: string; bg: string }>> = {
  running: { bar: "rgba(56,189,248,0.85)", bg: "rgba(56,189,248,0.06)" },
  queued: { bar: "rgba(148,163,184,0.7)", bg: "rgba(148,163,184,0.05)" },
  awaiting_approval: { bar: "rgba(251,191,36,0.85)", bg: "rgba(251,191,36,0.07)" },
  needs_review: { bar: "rgba(167,139,250,0.9)", bg: "rgba(167,139,250,0.08)" },
  error: { bar: "rgba(244,63,94,0.85)", bg: "rgba(244,63,94,0.07)" },
};

/**
 * 표시 겹층 — 스크롤 컨테이너 안에 깔아, 기준점 항목에 띠(진행 중 · 검토 필요 등)를 두르고 오른쪽 끝에 세션 표시를 띄운다.
 */
export function AnchorChipLayer({
  sessions,
  container,
  locate,
  onOpen,
  right = 10,
}: {
  /** 이 화면 · 이 파일의 진행 중 세션 */
  sessions: SessionView[];
  /** 스크롤 컨테이너 (position: relative) */
  container: HTMLElement | null;
  /** 기준점 항목 → 화면 요소들 (없으면 빈 배열 — 접힘 · 화면 밖) */
  locate(anchor: SessionAnchor): HTMLElement[];
  onOpen(key: string): void;
  right?: number;
}) {
  const targets = useMemo(
    () => sessions.filter((s): s is SessionView & { anchor: SessionAnchor } => Boolean(s.anchor)).map((s) => ({ key: s.key, anchor: s.anchor })),
    [sessions]
  );
  const bands = useAnchorBands(container, targets, locate);
  if (!container || bands.size === 0) return null;

  // 같은 줄에서 시작하는 세션은 표시 하나로 쌓는다 (최근 것 앞)
  const byTop = new Map<number, SessionView[]>();
  for (const session of sessions) {
    const first = bands.get(session.key)?.[0];
    if (first) byTop.set(first.top, [...(byTop.get(first.top) ?? []), session]);
  }
  return (
    <div data-testid="anchor-chip-layer" className="pointer-events-none absolute left-0 top-0 z-40 w-full" style={{ height: 0 }}>
      {sessions.map((session) => {
        const tone = BAND_TONE[session.status];
        if (!tone) return null;
        return (bands.get(session.key) ?? []).map((band, i) => (
          <div
            key={`${session.key}:${i}`}
            data-testid="anchor-band"
            data-session-key={session.key}
            className="absolute rounded-md"
            style={{
              top: band.top - 2,
              height: band.height + 4,
              left: Math.max(0, band.left - 10),
              right: right - 4,
              background: tone.bg,
              boxShadow: `inset 2px 0 0 ${tone.bar}`,
            }}
          />
        ));
      })}
      {[...byTop.entries()].map(([top, list]) => {
        const [first, ...rest] = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return (
          <div key={`${top}:${first.key}`} className="absolute flex items-center gap-1" style={{ top: top + 2, right }}>
            <SessionChip session={first} extra={rest.length} onOpen={onOpen} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * 지시를 쓰는 동안 — 지시를 받을 항목을 표시한다 (입력창을 누르면 화면 선택이 풀리는 표면에서 대상을 잃지 않게).
 */
export function AnchorDraftHighlight({
  anchor,
  container,
  locate,
  label = "AI 지시 대상",
  right = 10,
}: {
  anchor: SessionAnchor | null;
  container: HTMLElement | null;
  locate(anchor: SessionAnchor): HTMLElement[];
  label?: string;
  right?: number;
}) {
  const targets = useMemo(() => (anchor ? [{ key: "draft", anchor }] : []), [anchor]);
  const bands = useAnchorBands(container, targets, locate);
  const list = bands.get("draft") ?? [];
  if (!container || !anchor || list.length === 0) return null;
  return (
    <div data-testid="anchor-draft-layer" className="pointer-events-none absolute left-0 top-0 z-30 w-full" style={{ height: 0 }}>
      {list.map((band, i) => (
        <div
          key={i}
          data-testid="anchor-draft-band"
          className="absolute rounded-md border border-dashed"
          style={{
            top: band.top - 3,
            height: band.height + 6,
            left: Math.max(0, band.left - 12),
            right: right - 4,
            borderColor: "rgba(167,139,250,0.75)",
            background: "rgba(139,92,246,0.10)",
          }}
        />
      ))}
      <div
        data-testid="anchor-draft-label"
        className="absolute flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-medium leading-none text-white shadow-md shadow-black/40"
        style={{ top: list[0].top - 12, right: right + 4, background: "#7c3aed" }}
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        {label}
      </div>
    </div>
  );
}
