import React, { useMemo, useState } from "react";
import { listElementKinds, type ElementKind } from "@vibe/vdoc-schema";

export interface SlashMenuTarget {
  nodeId: string;
  top: number;
  left: number;
}

export interface SlashElementMenuProps {
  target: SlashMenuTarget | null;
  onSelect: (nodeId: string, kind: ElementKind) => void;
  onClose: () => void;
}

export const SlashElementMenu: React.FC<SlashElementMenuProps> = ({
  target,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const allOptions = useMemo(() => listElementKinds({ turnIntoOnly: true }), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.kind.toLowerCase().includes(q) ||
        (opt.shortLabel?.toLowerCase().includes(q) ?? false)
    );
  }, [allOptions, query]);

  if (!target) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        style={{ top: target.top, left: target.left }}
        className="fixed z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-xl p-1.5"
      >
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              onSelect(target.nodeId, filtered[0].kind);
              onClose();
            }
          }}
          placeholder="/ 블록 유형 검색 (표, 다단, 콜아웃...)"
          className="w-full px-2 py-1 text-xs border border-slate-200 rounded mb-1 focus:outline-none focus:border-indigo-400"
        />
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-xs text-slate-400">일치하는 유형이 없습니다</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                onClick={() => {
                  onSelect(target.nodeId, opt.kind);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 text-left text-xs rounded hover:bg-indigo-50 text-slate-700"
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-[10px] text-slate-400 font-mono">{opt.kind}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
};
