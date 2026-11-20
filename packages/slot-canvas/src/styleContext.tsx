import React, { createContext, useContext, useMemo } from "react";
import {
  buildStyleCssVars,
  resolveMediaGridStyle,
  resolvePageGridStyle,
  resolveStylePack,
  resolveTableGridStyle,
  resolveTextRoleStyle,
  type CssVarMap,
  type ResolvedMediaGrid,
  type ResolvedPageGrid,
  type ResolvedStylePack,
  type ResolvedTableGrid,
  type ResolvedTextRole,
  type StylePack,
} from "@vibe/style-core";

export interface VDocStyleContextValue {
  readonly pack: StylePack;
  readonly resolvedPack: ResolvedStylePack;
  readonly pageGrid: ResolvedPageGrid;
  readonly bodyText: ResolvedTextRole;
  readonly mediaGrid: ResolvedMediaGrid;
  readonly tableGrid: ResolvedTableGrid;
  readonly cssVars: CssVarMap;
}

const VDocStyleContext = createContext<VDocStyleContextValue | null>(null);

export interface VDocStyleProviderProps {
  readonly pack?: StylePack | null;
  readonly mode?: string;
  readonly viewKey?: string;
  readonly children: React.ReactNode;
}

/**
 * 분리된 `@vibe/style-core` 엔진을 `@vibe/slot-canvas` 트리에 주입하는 Provider.
 * StylePack 이 바뀌면 하위 모든 PageSheet · Callout · Text · Grid · Table · LinkCard 가
 * 본문/구조 변경 없이 즉시 새 그리드 스타일로 재렌더링된다.
 */
export const VDocStyleProvider: React.FC<VDocStyleProviderProps> = ({
  pack,
  mode,
  viewKey,
  children,
}) => {
  const value = useMemo<VDocStyleContextValue | null>(() => {
    if (!pack) return null;
    const resolvedPack = resolveStylePack(pack, mode);
    const pageGrid = resolvePageGridStyle(resolvedPack, viewKey ?? pack.genre ?? "default");
    const bodyText = resolveTextRoleStyle(resolvedPack, "body");
    const mediaGrid = resolveMediaGridStyle(resolvedPack, "strip");
    const tableGrid = resolveTableGridStyle(resolvedPack, "default");
    const cssVars = buildStyleCssVars(resolvedPack);
    return { pack, resolvedPack, pageGrid, bodyText, mediaGrid, tableGrid, cssVars };
  }, [pack, mode, viewKey]);

  if (!value) {
    return <>{children}</>;
  }

  return (
    <VDocStyleContext.Provider value={value}>
      <div
        data-vdoc-style-pack={value.resolvedPack.packId}
        data-vdoc-style-mode={value.resolvedPack.mode}
        style={value.cssVars as React.CSSProperties}
      >
        {children}
      </div>
    </VDocStyleContext.Provider>
  );
};

export function useVDocStyle(): VDocStyleContextValue | null {
  return useContext(VDocStyleContext);
}
