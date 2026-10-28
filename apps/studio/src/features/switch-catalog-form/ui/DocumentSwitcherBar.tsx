import React from "react";

import { useSwitchCatalogForm } from "../model/useSwitchCatalogForm";

export const DocumentSwitcherBar: React.FC = () => {
  const { docs, activeDocId, switchDocument } = useSwitchCatalogForm();

  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
      <span className="font-medium text-slate-700">문서 전환:</span>
      {docs.map((d) => (
        <button
          key={d.docId}
          type="button"
          onClick={() => switchDocument(d.docId)}
          className={`px-2 py-0.5 rounded transition cursor-pointer ${
            d.docId === activeDocId
              ? "bg-slate-900 text-white font-medium"
              : "hover:bg-slate-100 text-slate-600"
          }`}
        >
          {d.title}
        </button>
      ))}
    </div>
  );
};

