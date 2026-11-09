import React from "react";

import type { VDocDocument } from "@vibe/vdoc-schema";

export interface DocumentStatusBadgesProps {
  doc: Pick<VDocDocument, "status" | "totalValueText">;
}

export const DocumentStatusBadges: React.FC<DocumentStatusBadgesProps> = ({ doc }) => {
  return (
    <>
      {doc.totalValueText && (
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-slate-100 text-slate-600 font-medium">
          {doc.totalValueText}
        </span>
      )}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-emerald-50 text-[#248567] font-medium border border-emerald-200">
        ● {doc.status}
      </span>
    </>
  );
};
