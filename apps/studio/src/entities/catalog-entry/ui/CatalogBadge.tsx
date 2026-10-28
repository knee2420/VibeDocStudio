import React from "react";

import type { VDocCatalogManifest } from "@vibe/vdoc-schema";

export interface CatalogBadgeProps {
  manifest: VDocCatalogManifest;
}

export const CatalogBadge: React.FC<CatalogBadgeProps> = ({ manifest }) => {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
      {manifest.category} · {manifest.sourceOrigin}
    </span>
  );
};

