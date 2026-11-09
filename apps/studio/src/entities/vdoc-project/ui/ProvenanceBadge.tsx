import React from "react";
import { GitFork } from "lucide-react";

export interface ProvenanceBadgeProps {
  sourceProjectId?: string | null;
  sourceNodeId?: string | null;
  sourceTitle?: string;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  sourceProjectId,
  sourceNodeId,
  sourceTitle,
}) => {
  if (!sourceProjectId) return null;

  const label = sourceTitle || (sourceProjectId.startsWith("ref:") ? "레퍼런스" : sourceProjectId.replace("vproj-ref-", "참조:"));
  return (
    <span
      data-testid="provenance-badge"
      title={`참조 출처(Provenance): ${sourceProjectId} / ${sourceNodeId || "root"}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-semibold shrink-0"
    >
      <GitFork className="w-2.5 h-2.5" />
      출처: {label.slice(0, 18)}
    </span>
  );
};

