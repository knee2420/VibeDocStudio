import React, { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Layers, PanelLeftClose, PanelLeftOpen, RotateCcw } from "lucide-react";
import type {
  DocumentEditorAdapter,
  EditorHostContext,
  EditorOutlineHostContext,
} from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { LazyVaultFileGate } from "./LazyVaultFileGate";

interface TabErrorBoundaryProps {
  readonly resetKey: string;
  readonly path: string;
  readonly label?: string;
  readonly children: React.ReactNode;
}

interface TabErrorBoundaryState {
  readonly error: Error | null;
  readonly retrySeq: number;
}

/**
 * Per-tab render error isolator: a malformed file or view crash NEVER unmounts the
 * entire IDE workbench into a black screen — only the affected tab renders a recovery card.
 */
class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { error: null, retrySeq: 0 };

  static getDerivedStateFromError(error: Error): Partial<TabErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[TabErrorBoundary] Failed to render "${this.props.path}":`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: TabErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({ error: null, retrySeq: prev.retrySeq + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-testid="tab-error-boundary"
          className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-auto bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-center text-[var(--obs-text-normal,#dadada)]"
        >
          <div className="flex max-w-md flex-col items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-5 py-4">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <div className="text-sm font-semibold text-red-200">
              {this.props.label ? `${this.props.label} 렌더링 오류` : "문서 뷰 렌더링 오류"}
            </div>
            <div className="break-all font-code text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
              {this.props.path}
            </div>
            <pre className="mt-1 max-h-32 w-full overflow-auto rounded bg-black/30 p-2 text-left font-code text-[11px] whitespace-pre-wrap text-red-300">
              {this.state.error.message || String(this.state.error)}
            </pre>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] px-3 py-1.5 text-xs font-medium text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.14))]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              다시 시도
            </button>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.retrySeq}>{this.props.children}</React.Fragment>;
  }
}

const DEFAULT_DRAWER_WIDTH = 220;
const MIN_DRAWER_WIDTH = 150;
const MAX_DRAWER_WIDTH = 420;

const resolveOutlineTitle = (adapterId: string): string => {
  switch (adapterId) {
    case "vibe-vdoc":
      return "PAGES & ELEMENTS";
    case "obsidian-markdown":
      return "OUTLINE & BACKLINKS";
    case "vibe-outliner":
      return "OUTLINE";
    case "vibe-ref":
      return "REFERENCE CANVAS & PINS";
    case "vibe-syntax":
      return "SYNTAX RULES";
    case "vibe-style":
      return "STYLE GRID KITS";
    default:
      return "DOCUMENT STRUCTURE";
  }
};

export interface TabWithOutlineDrawerProps {
  readonly adapter: DocumentEditorAdapter<IdeEditorEnv>;
  readonly host: EditorHostContext<IdeEditorEnv>;
}

const areDrawerPropsStable = (
  prev: TabWithOutlineDrawerProps,
  next: TabWithOutlineDrawerProps
): boolean =>
  prev.adapter === next.adapter &&
  prev.host.path === next.host.path &&
  prev.host.tabId === next.host.tabId &&
  prev.host.groupId === next.host.groupId &&
  prev.host.viewType === next.host.viewType &&
  prev.host.env === next.host.env;

/**
 * Per-tab collapsible left outline drawer wrapper.
 * Wraps every rendered tab (single, split, stacked, or Chrome Tab Group pair pane)
 * so each document owns its own independent outline drawer toggle and width.
 */
export const TabWithOutlineDrawer: React.FC<TabWithOutlineDrawerProps> = React.memo(
  ({ adapter, host }) => {
    const [open, setOpen] = useState(false);
    const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH);

    const AdapterComponent = adapter.Component;
    const OutlineComponent = adapter.OutlineComponent;

    const outlineHost = useMemo<EditorOutlineHostContext<IdeEditorEnv>>(
      () => ({
        env: host.env,
        path: host.path,
        viewType: host.viewType,
        openLink: host.openLink,
      }),
      [host.env, host.path, host.viewType, host.openLink]
    );

    const handleStartResize = useCallback(
      (ev: React.MouseEvent) => {
        ev.preventDefault();
        const startX = ev.clientX;
        const initialWidth = drawerWidth;
        const onMove = (m: MouseEvent) => {
          const next = Math.max(
            MIN_DRAWER_WIDTH,
            Math.min(MAX_DRAWER_WIDTH, initialWidth + (m.clientX - startX))
          );
          setDrawerWidth(next);
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      },
      [drawerWidth]
    );

    const boundaryKey = `${host.tabId}:${host.viewType}:${host.path}`;

    if (!OutlineComponent) {
      return (
        <TabErrorBoundary resetKey={boundaryKey} path={host.path}>
          <AdapterComponent host={host} />
        </TabErrorBoundary>
      );
    }

    const title = resolveOutlineTitle(adapter.id);

    return (
      <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
        {/* Per-Tab Left Outline Drawer (Collapsed slim rail <-> Expanded resizable drawer) */}
        <div className="flex h-full shrink-0 overflow-hidden">
          {open ? (
            <>
              <aside
                style={{ width: `${drawerWidth}px` }}
                aria-label={title}
                data-testid="tab-outline-drawer"
                className="flex h-full shrink-0 flex-col overflow-hidden bg-[var(--obs-bg-secondary,#262626)]"
              >
                <div className="flex h-7 shrink-0 select-none items-center justify-between gap-1 border-b border-[var(--obs-border-subtle,#2d2d2d)] px-2 text-[10.5px] font-semibold tracking-wide text-[var(--obs-text-muted,#b3b3b3)]">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <Layers className="h-3 w-3 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
                    <span className="truncate">{title}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    title={`개요 접기 · ${title}`}
                    aria-label={`개요 접기 · ${title}`}
                    aria-expanded={true}
                    data-testid="tab-outline-toggle"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--obs-text-muted,#b3b3b3)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <TabErrorBoundary resetKey={`outline:${boundaryKey}`} path={host.path} label="개요 패널">
                    <LazyVaultFileGate vault={host.env.vault} path={host.path}>
                      <OutlineComponent
                        key={`${outlineHost.viewType}:${outlineHost.path}`}
                        host={outlineHost}
                      />
                    </LazyVaultFileGate>
                  </TabErrorBoundary>
                </div>
              </aside>

              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleStartResize}
                className="group relative z-20 w-px shrink-0 cursor-col-resize bg-[var(--obs-border-subtle,#2d2d2d)]"
              >
                <div className="absolute top-0 bottom-0 -left-[3px] w-[7px] transition-colors group-hover:left-[-1px] group-hover:w-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              title={`개요 펼치기 · ${title}`}
              aria-label={`개요 펼치기 · ${title}`}
              aria-expanded={false}
              data-testid="tab-outline-toggle"
              className="group flex h-full w-[26px] shrink-0 select-none flex-col items-center gap-2 border-r border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] py-2 text-[var(--obs-text-faint,#777777)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <PanelLeftOpen className="h-3.5 w-3.5 shrink-0 text-[var(--obs-text-muted,#9a9a9a)] transition-colors group-hover:text-[var(--obs-accent,#8a5cf5)]" />
              <span
                style={{ writingMode: "vertical-rl" }}
                className="truncate text-[9.5px] font-semibold tracking-wider uppercase opacity-75 group-hover:opacity-100"
              >
                {title}
              </span>
            </button>
          )}
        </div>

        {/* Main Document Body — stable sibling slot so toggling drawer never remounts editor */}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <TabErrorBoundary resetKey={boundaryKey} path={host.path}>
            <AdapterComponent host={host} />
          </TabErrorBoundary>
        </div>
      </div>
    );
  },
  areDrawerPropsStable
);
