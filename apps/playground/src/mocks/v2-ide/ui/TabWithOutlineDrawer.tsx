import React, { useCallback, useMemo, useState } from "react";
import { Layers, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type {
  DocumentEditorAdapter,
  EditorHostContext,
  EditorOutlineHostContext,
} from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { LazyVaultFileGate } from "./LazyVaultFileGate";

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

    if (!OutlineComponent) {
      return <AdapterComponent host={host} />;
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
                  <LazyVaultFileGate vault={host.env.vault} path={host.path}>
                    <OutlineComponent
                      key={`${outlineHost.viewType}:${outlineHost.path}`}
                      host={outlineHost}
                    />
                  </LazyVaultFileGate>
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
          <AdapterComponent host={host} />
        </div>
      </div>
    );
  },
  areDrawerPropsStable
);
