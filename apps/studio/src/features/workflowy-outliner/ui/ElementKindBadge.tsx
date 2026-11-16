import React, { useState } from "react";
import { getElementDef, listElementKinds, type ElementKind } from "@vibe/vdoc-schema";
import { useWorkingOutlineStore } from "@/entities/working-outline";

const TURN_INTO_OPTIONS = listElementKinds({ turnIntoOnly: true });

const TONE_CLASS: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

export interface ElementKindBadgeProps {
  nodeId: string;
  kind?: ElementKind;
  onTurnInto: (nextKind: ElementKind) => void;
}

export const ElementKindBadge: React.FC<ElementKindBadgeProps> = React.memo(({ nodeId, kind: kindOverride, onTurnInto }) => {
  const [open, setOpen] = useState(false);
  const storeKind = useWorkingOutlineStore((s) => s.kindByNodeId[nodeId] ?? "text");
  const kind = kindOverride ?? storeKind;
  const def = getElementDef(kind);
  const toneClass = TONE_CLASS[def.badgeTone] ?? TONE_CLASS.slate;

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`요소 역할: ${def.label} (클릭해 유형 전환)`}
        className={`px-1.5 py-0.5 text-[10px] font-medium rounded border leading-none cursor-pointer transition-colors hover:brightness-95 ${toneClass}`}
      >
        {def.shortLabel || def.label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {open ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-50 w-52 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg p-1"
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">
            요소 유형 전환 (Turn into)
          </div>
          {TURN_INTO_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => {
                onTurnInto(opt.kind);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2 py-1.5 text-left text-xs rounded hover:bg-slate-100 ${
                opt.kind === kind ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700"
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-[10px] text-slate-400">{opt.tier}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
});
