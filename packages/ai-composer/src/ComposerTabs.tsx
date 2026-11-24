import React, { useEffect, useRef } from "react";
import { ArrowLeft, CheckCircle2, LocateFixed, MessageSquare, X } from "lucide-react";

import type { ComposerSessionController, SessionRegistry, SessionView } from "@vibe/ai-kernel";
import { SessionStatusDot, useSessionList, useSessionTabs } from "@vibe/ai-react";

/**
 * Composer 탭 — 메인 대화(고정) + 기준점 세션 탭. 다른 세션 대화를 보다가 원래 하던 대화로 돌아온다.
 *   - 탭 닫기(×)는 화면에서만 치운다 (세션은 계속 돈다 · 표시 · 대시보드에 남는다)
 *   - 직전 탭: ← 버튼 (단축키는 앱이 전역으로 건다 — Composer 가 접혀 있어도 되게)
 *   - 패널 본문은 활성 탭의 컨트롤러로 그린다 (`renderPanel`)
 */
export function ComposerTabs({
  registry,
  renderPanel,
  onSelect,
  onReveal,
  onComplete,
}: {
  registry: SessionRegistry;
  renderPanel(key: string, controller: ComposerSessionController, view: SessionView | null): React.ReactNode;
  /** 탭을 눌렀을 때 (기본: 앞 세션으로). 앱은 미뤄 둔 화면 이동까지 하는 `openSession` 을 넘긴다 */
  onSelect?(key: string): void;
  /** 기준점 띠: 화면에서 기준점으로 */
  onReveal?(key: string): void;
  /** 기준점 띠: 세션 완료 (닫기) */
  onComplete?(key: string): void;
}) {
  const tabs = useSessionTabs(registry);
  const views = useSessionList(registry);
  const byKey = new Map(views.map((v) => [v.key, v]));
  const select = onSelect ?? ((key: string) => registry.setForeground(key));
  const stripRef = useRef<HTMLDivElement | null>(null);

  // 앞 탭이 보이게 스크롤
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(tabs.foreground)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tabs.foreground]);

  const fgKey = tabs.foreground;
  const controller = registry.controller(fgKey);
  const showStrip = tabs.tabs.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showStrip && (
        <div
          data-testid="composer-tabs"
          className="flex shrink-0 items-center gap-0.5 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-1 py-1"
        >
          <button
            type="button"
            data-testid="composer-tab-back"
            disabled={!tabs.canGoBack}
            onClick={() => registry.back()}
            title="직전 탭 (Alt+[)"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
            {tabs.tabs.map((key) => {
              const view = byKey.get(key);
              const isMain = key === registry.mainKey;
              const active = key === fgKey;
              return (
                <div
                  key={key}
                  data-tab-key={key}
                  data-testid={isMain ? "composer-tab-main" : "composer-tab"}
                  className={`group flex h-6 min-w-0 shrink-0 items-center gap-1.5 rounded px-2 text-[11px] ${
                    active ? "bg-white/12 text-slate-100" : "text-slate-400 hover:bg-white/6 hover:text-slate-200"
                  }`}
                  style={active ? { backgroundColor: "rgba(255,255,255,0.1)" } : undefined}
                >
                  <button type="button" onClick={() => select(key)} className="flex min-w-0 items-center gap-1.5" title={view?.instruction || view?.title}>
                    {isMain ? <MessageSquare className="h-3 w-3 shrink-0" /> : view ? <SessionStatusDot status={view.status} /> : null}
                    <span className={`truncate ${isMain ? "" : "max-w-[120px]"}`}>{isMain ? "메인" : view?.title ?? key}</span>
                    {!isMain && view?.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />}
                  </button>
                  {!isMain && (
                    <button
                      type="button"
                      onClick={() => registry.closeTab(key)}
                      title="탭 닫기 (세션은 계속 돈다)"
                      className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 opacity-0 hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!showStrip ? null : fgKey !== registry.mainKey && byKey.get(fgKey)?.anchor ? (
        <div data-testid="composer-anchor-bar" className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1 text-[10.5px] text-slate-500">
          <span className="min-w-0 flex-1 truncate">
            기준점: {byKey.get(fgKey)?.anchor?.label}
            {byKey.get(fgKey)?.lifecycle === "anchor-lost" ? " (지워짐)" : ""}
          </span>
          {onReveal && (
            <button type="button" onClick={() => onReveal(fgKey)} title="화면에서 기준점으로" className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-800">
              <LocateFixed className="h-3 w-3" /> 보기
            </button>
          )}
          {onComplete && (
            <button
              type="button"
              data-testid="composer-session-complete"
              onClick={() => onComplete(fgKey)}
              title="세션 완료 — 서버 세션을 닫고 탭 · 표시를 치운다 (대시보드에 이력으로 남는다)"
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-3 w-3" /> 완료
            </button>
          )}
        </div>
      ) : null}
      <div className="min-h-0 flex-1" key={fgKey}>
        {renderPanel(fgKey, controller, byKey.get(fgKey) ?? null)}
      </div>
    </div>
  );
}
