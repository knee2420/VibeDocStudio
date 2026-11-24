import React, { useEffect, useMemo, useState } from "react";
import { Grid, Image as ImageIcon, LayoutGrid, Palette, Square, Type } from "lucide-react";
import {
  resolveFrameStyle,
  resolveMediaGridStyle,
  resolvePageGridStyle,
  resolveStylePack,
  resolveTableGridStyle,
  resolveTextRoleStyle,
  type StylePack,
} from "@vibe/style-core";
import type { EditorHostContext, EditorOutlineHostContext } from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { parseStylePackJson } from "@vibe/vault-formats";
import { StylePackSettingsView } from "./settings";

export const StyleTabEditor: React.FC<{
  readonly host: EditorHostContext<IdeEditorEnv>;
}> = ({ host }) => (
  <div className="h-full w-full overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
    <StylePackSettingsView vault={host.env.vault} path={host.path} />
  </div>
);

export const StyleStructurePanel: React.FC<{
  readonly host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [pack, setPack] = useState<StylePack | null>(() =>
    vault.exists(host.path) && (!vault.isLoaded || vault.isLoaded(host.path))
      ? parseStylePackJson(vault.read(host.path))
      : null
  );

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(host.path)) return;
      if (vault.isLoaded && !vault.isLoaded(host.path)) return;
      setPack(parseStylePackJson(vault.read(host.path)));
    };
    reload();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === host.path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, host.path]);

  const kitSummary = useMemo(() => {
    if (!pack) return null;
    const resolved = resolveStylePack(pack, "default");
    const pageKey = Object.keys(pack.styles.pageChrome)[0] ?? "blog";
    const page = resolvePageGridStyle(resolved, pageKey);
    const body = resolveTextRoleStyle(resolved, "body");
    const h1 = resolveTextRoleStyle(resolved, "h1");
    const frame = resolveFrameStyle(resolved, "info-frame");
    const table = resolveTableGridStyle(resolved, "default");
    const media = resolveMediaGridStyle(resolved, "strip");
    const accentCandidate =
      frame.titleColor ??
      frame.ornamentColor ??
      resolved.tokens["brand.accent"] ??
      pack.primitives.color?.accent;
    const canvasCandidate =
      page.background ??
      resolved.tokens["surface.canvas"] ??
      pack.primitives.color?.paper;
    return {
      accent: typeof accentCandidate === "string" ? accentCandidate : "#8a5cf5",
      canvasBg: typeof canvasCandidate === "string" ? canvasCandidate : "#ffffff",
      kits: [
        {
          id: "page",
          label: "지면 그리드",
          icon: LayoutGrid,
          summary: `${page.width}px · ${page.surfaceKind}`,
        },
        {
          id: "typography",
          label: "타이포그래피",
          icon: Type,
          summary: `${body.fontSize} · ${h1.fontSize}`,
        },
        {
          id: "frame",
          label: "프레임 · CTA",
          icon: Square,
          summary: frame.ornament,
        },
        {
          id: "table",
          label: "표 5선 테두리",
          icon: Grid,
          summary: table.cellPadding,
        },
        {
          id: "media",
          label: "미디어 · 콜라주",
          icon: ImageIcon,
          summary: `r ${media.radius} · gap ${media.stripGap}px`,
        },
      ],
    };
  }, [pack]);

  if (!pack || !kitSummary) {
    return (
      <div className="px-3 py-3 text-[11px] text-[var(--obs-text-faint,#777)]">
        스타일 팩을 불러오는 중입니다…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-2.5 py-2 text-[11.5px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#777)] uppercase">
          <Palette className="h-3 w-3 text-cyan-400" />
          <span>5 GRID KITS</span>
        </span>
        <span className="flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 rounded-full border border-white/20"
            style={{ backgroundColor: kitSummary.accent }}
          />
          <span
            className="h-2.5 w-2.5 rounded-full border border-white/20"
            style={{ backgroundColor: kitSummary.canvasBg }}
          />
        </span>
      </div>

      <div className="space-y-1">
        {kitSummary.kits.map((kit) => {
          const Icon = kit.icon;
          return (
            <div
              key={kit.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[var(--obs-text-normal,#dcdcdc)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))]"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="h-3 w-3 shrink-0 text-cyan-400" />
                <span className="truncate font-medium">{kit.label}</span>
              </span>
              <span className="shrink-0 font-code text-[10px] text-[var(--obs-text-faint,#777)]">
                {kit.summary}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
