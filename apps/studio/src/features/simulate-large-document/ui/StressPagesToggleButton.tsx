import React from "react";
import { Layers } from "lucide-react";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";

import { hasStressPages, STRESS_PAGE_COUNT, toggleStressPages } from "../model/stressPages";

/** 개발 빌드 전용: 활성 문서에 시뮬레이션 페이지를 붙이거나 걷어낸다 (되돌리기 가능). */
export const StressPagesToggleButton: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  if (!import.meta.env.DEV || !doc) return null;
  const active = hasStressPages(doc);

  return (
    <button
      type="button"
      data-testid="simulate-25pages-btn"
      onClick={() => updateCurrentDoc(toggleStressPages, { history: true, label: "페이지 시뮬레이션 전환" })}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-semibold shadow-2xs cursor-pointer transition font-mono tabular-nums"
    >
      <Layers className="w-3.5 h-3.5 text-emerald-600" />
      {active
        ? `시뮬레이션 페이지 걷어내기 (현재 ${doc.pages.length}p)`
        : `⚡ ${STRESS_PAGE_COUNT}p 대용량 슬라이딩 윈도우 시뮬레이션`}
    </button>
  );
};
