import React from "react";

import { indexOf } from "../../model/sidebarDummy";
import { activeDoc, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { OutlineTree } from "./OutlineTree";
import { SidebarHead, useRevealRow } from "./parts";

/**
 * 시안 A · 한 나무 목차 — Documents & Pages 와 Elements 를 한 목록으로.
 * 층은 글자 크기 · 굵기로(레이어 케이크), 상태 · 번호는 줄 맨 왼쪽(F), 장 줄은 Phase 1 요약 한 줄.
 */
export const SidebarA: React.FC = () => {
  const scroller = React.useRef<HTMLDivElement>(null);
  useRevealRow(scroller);
  return (
    <aside className="fig-panel w-[300px] shrink-0 min-h-0 flex flex-col bg-white border-r border-[var(--fig-border)]" data-testid="sb-sidebar-a">
      <SidebarHead />
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto pb-6" role="tree" aria-label="문서 목차">
        <StickyCrumb />
        <OutlineTree mode="a" />
      </div>
    </aside>
  );
};

/** 스크롤해도 지금 어느 문서 · 부 · 장 안인지 위에 붙어 있다 (VS Code 스티키 스크롤). */
export const StickyCrumb: React.FC = () => {
  const sc = useScenario();
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const select = useSidebarLabStore((s) => s.select);
  const doc = activeDoc(sc, docId);
  const ch = viewChapterId ? indexOf(sc).get(viewChapterId)?.chapter : undefined;
  const no = ch ? doc.chapters.indexOf(ch) + 1 : 0;
  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-dashed border-slate-200 px-3 h-7 flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
      <button type="button" className="truncate max-w-[45%] font-semibold text-slate-700 hover:underline" onClick={() => select(doc.id)}>
        {doc.name}
      </button>
      {ch?.part && (
        <>
          <span className="text-slate-300">›</span>
          <span className="truncate max-w-[30%]">{ch.part}</span>
        </>
      )}
      {ch && no > 0 && (
        <>
          <span className="text-slate-300">›</span>
          <button type="button" className="truncate hover:underline" onClick={() => select(ch.id)}>
            {no} {ch.name}
          </button>
        </>
      )}
    </div>
  );
};
