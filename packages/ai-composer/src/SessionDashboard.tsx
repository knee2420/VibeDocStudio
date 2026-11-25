import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, LocateFixed, MessageSquare, RotateCcw, Square } from "lucide-react";

import type { SessionRegistry, SessionView } from "@vibe/ai-kernel";
import { SESSION_STATUS_LABEL, SessionStatusDot, useSessionList, useSessionTabs } from "@vibe/ai-react";

/**
 * 세션 대시보드 — 모든 세션의 현황. 내 손이 필요한 것부터.
 * 행을 누르면 세션 탭이 열리고, 📍 는 화면에서 기준점으로 간다.
 */
export interface SessionDashboardProps {
  registry: SessionRegistry;
  onOpen(key: string): void;
  onReveal(key: string): void;
  onStop(key: string): void;
  onComplete(key: string): void;
  onReopen(key: string): void;
}

interface Group {
  readonly id: string;
  readonly label: string;
  readonly match: (v: SessionView) => boolean;
  readonly collapsedByDefault?: boolean;
}

const GROUPS: Group[] = [
  { id: "attention", label: "내 손 필요", match: (v) => v.lifecycle !== "completed" && (v.status === "awaiting_approval" || v.status === "needs_review" || v.status === "error") },
  { id: "running", label: "진행 중", match: (v) => v.status === "running" },
  { id: "queued", label: "대기열", match: (v) => v.status === "queued" },
  { id: "lost", label: "기준점 없음", match: (v) => v.lifecycle === "anchor-lost" && v.status !== "running" && v.status !== "queued" },
  { id: "idle", label: "끝남 · 끊김", match: (v) => v.lifecycle === "active" && (v.status === "idle" || v.status === "interrupted") },
  { id: "done", label: "완료", match: (v) => v.lifecycle === "completed", collapsedByDefault: true },
];

function ago(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export function SessionDashboard({ registry, onOpen, onReveal, onStop, onComplete, onReopen }: SessionDashboardProps) {
  const views = useSessionList(registry);
  const tabs = useSessionTabs(registry);
  const [now, setNow] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.filter((g) => g.collapsedByDefault).map((g) => [g.id, true]))
  );
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const main = views.find((v) => v.kind === "main") ?? null;
  const anchored = useMemo(() => views.filter((v) => v.kind === "anchored").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [views]);
  // 한 세션은 한 묶음에만 (앞 묶음 우선)
  const placed = new Set<string>();
  const groups = GROUPS.map((group) => ({
    group,
    items: anchored.filter((v) => {
      if (placed.has(v.key) || !group.match(v)) return false;
      placed.add(v.key);
      return true;
    }),
  }));
  const activeCount =
    anchored.filter((v) => v.lifecycle !== "completed").length +
    (main && main.status !== "idle" ? 1 : 0);

  return (
    <div data-testid="session-dashboard" className="flex h-full min-h-0 flex-col text-[12px] text-[var(--obs-text-normal,#dadada)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--obs-text-muted,#b3b3b3)]">AI 세션</span>
        <span className="text-[10.5px] text-[var(--obs-text-faint,#777)]">진행 {activeCount}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {main && (
          <Row
            view={main}
            now={now}
            active={tabs.foreground === main.key}
            onOpen={onOpen}
            icon={
              main.status === "idle" ? (
                <MessageSquare className="h-3 w-3 shrink-0 text-slate-400" />
              ) : (
                <SessionStatusDot status={main.status} />
              )
            }
            subtitle="기준점 없는 대화"
            actions={
              main.status === "running" || main.status === "awaiting_approval" ? (
                <IconButton title="멈추기" onClick={() => onStop(main.key)}>
                  <Square className="h-3 w-3" />
                </IconButton>
              ) : undefined
            }
          />
        )}
        {anchored.length === 0 && (
          <div className="px-3 py-4 text-[11px] leading-relaxed text-[var(--obs-text-faint,#777)]">
            아웃라인 불릿 · 문서 칸 · 탐색기 파일을 고르고 <b className="text-slate-300">AI Direct</b> 로 지시를 던지면, 여기에서 진행을 볼 수 있습니다.
          </div>
        )}
        {groups.map(({ group, items }) =>
          items.length === 0 ? null : (
            <div key={group.id} data-testid={`session-group-${group.id}`} className="mt-1">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                className="flex w-full items-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-[var(--obs-text-muted,#b3b3b3)] hover:text-slate-200"
              >
                {collapsed[group.id] ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {group.label}
                <span className="font-normal text-[var(--obs-text-faint,#777)]">{items.length}</span>
              </button>
              {!collapsed[group.id] &&
                items.map((v) => (
                  <Row
                    key={v.key}
                    view={v}
                    now={now}
                    active={tabs.foreground === v.key}
                    onOpen={v.lifecycle === "completed" ? onReopen : onOpen}
                    subtitle={v.anchor?.label ?? ""}
                    actions={
                      v.lifecycle === "completed" ? (
                        <IconButton title="다시 열기" onClick={() => onReopen(v.key)}>
                          <RotateCcw className="h-3 w-3" />
                        </IconButton>
                      ) : (
                        <>
                          {v.anchor && (
                            <IconButton title="기준점으로 이동" onClick={() => onReveal(v.key)}>
                              <LocateFixed className="h-3 w-3" />
                            </IconButton>
                          )}
                          {(v.status === "running" || v.status === "queued" || v.status === "awaiting_approval") && (
                            <IconButton title="멈추기" onClick={() => onStop(v.key)}>
                              <Square className="h-3 w-3" />
                            </IconButton>
                          )}
                          <IconButton title="세션 완료 (닫기)" onClick={() => onComplete(v.key)}>
                            <CheckCircle2 className="h-3 w-3" />
                          </IconButton>
                        </>
                      )
                    }
                  />
                ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-slate-100"
    >
      {children}
    </button>
  );
}

function Row({
  view,
  now,
  active,
  onOpen,
  icon,
  subtitle,
  actions,
}: {
  view: SessionView;
  now: number;
  active: boolean;
  onOpen(key: string): void;
  icon?: React.ReactNode;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="session-row"
      data-session-key={view.key}
      data-session-status={view.status}
      onClick={() => onOpen(view.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(view.key);
      }}
      className={`group mx-1 flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 ${active ? "bg-white/10" : "hover:bg-white/5"}`}
      style={active ? { backgroundColor: "rgba(255,255,255,0.08)" } : undefined}
    >
      <div className="mt-[3px]">{icon ?? <SessionStatusDot status={view.status} />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate ${view.unread ? "font-semibold text-slate-100" : ""}`}>{view.title}</span>
          {view.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />}
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--obs-text-faint,#8a8a8a)]">
          <span className="truncate">{subtitle}</span>
          {(view.kind === "anchored" || view.status !== "idle") && (
            <span className="shrink-0">· {SESSION_STATUS_LABEL[view.status]}</span>
          )}
          {view.reviewCount > 0 && <span className="shrink-0 rounded-full bg-violet-500/25 px-1 text-violet-200">변경안 {view.reviewCount}</span>}
          {view.kind === "anchored" && <span className="ml-auto shrink-0">{ago(view.completedAt ?? view.createdAt, now)}</span>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">{actions}</div>}
    </div>
  );
}
