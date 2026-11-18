import React from "react";

import { pageRange } from "../../model/sidebarDummy";
import { activeDoc, countChapter, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { OutlineTree } from "./OutlineTree";
import { SidebarHead, useRevealRow } from "./parts";

/**
 * 시안 C · 장 지도 레일 + 목차 — 전체 먼저, 확대 · 거르기, 자세한 건 필요할 때.
 * 왼쪽 띠: 장마다 막대(높이 = 쪽 수, 초록 = 끝난 만큼, 점 = 남은 일 · 빨강은 근거 없음, 파란 틀 = 지금 본문 위치).
 * 부가 바뀌는 자리는 띠 사이를 조금 더 띄운다.
 */
export const SidebarC: React.FC = () => {
  const scroller = React.useRef<HTMLDivElement>(null);
  useRevealRow(scroller);
  return (
    <aside className="fig-panel w-[300px] shrink-0 min-h-0 flex flex-col bg-white border-r border-[var(--fig-border)]" data-testid="sb-sidebar-c">
      <SidebarHead />
      <div className="flex-1 min-h-0 flex">
        <Rail />
        <div ref={scroller} className="flex-1 min-w-0 overflow-y-auto py-1 pb-6" role="tree" aria-label="문서 목차">
          <OutlineTree mode="c" />
        </div>
      </div>
    </aside>
  );
};

const Rail: React.FC = () => {
  const sc = useScenario();
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const edits = useSidebarLabStore((s) => s.edits);
  const phase = useSidebarLabStore((s) => s.phase);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const select = useSidebarLabStore((s) => s.select);
  const hover = useSidebarLabStore((s) => s.hover);
  const doc = activeDoc(sc, docId);
  const many = doc.chapters.length > 20;
  return (
    <div className="w-[34px] shrink-0 border-r border-[var(--fig-border)] bg-slate-50 py-2 px-[7px] flex flex-col" aria-label="장 지도" data-testid="sb-rail">
      {doc.chapters.map((ch, i) => {
        const c = countChapter(ch, edits);
        const pct = c.total ? (c.done / c.total) * 100 : 100;
        const here = viewChapterId === ch.id;
        const newPart = i > 0 && ch.part !== doc.chapters[i - 1].part;
        return (
          <button
            key={ch.id}
            type="button"
            onClick={() => select(ch.id)}
            onMouseEnter={() => hover(ch.id)}
            onMouseLeave={() => hover(null)}
            title={`${i + 1}. ${ch.name} · ${pageRange(doc, ch)}${phase === 3 ? ` · 남은 일 ${c.open}` : ""}${ch.part ? ` (${ch.part})` : ""}`}
            className={`relative w-full rounded-[2px] overflow-hidden bg-slate-200 ${here ? "ring-2 ring-[var(--fig-brand)] ring-offset-1 ring-offset-slate-50 z-10" : "hover:ring-1 hover:ring-slate-400"}`}
            style={{ flexGrow: ch.pages, flexBasis: 0, minHeight: many ? 3 : 10, marginTop: i === 0 ? 0 : newPart ? 7 : many ? 1.5 : 3 }}
          >
            {phase === 3 && <span className={`absolute inset-y-0 left-0 ${c.nocite ? "bg-rose-400" : "bg-emerald-600/85"}`} style={{ width: `${pct}%` }} />}
            {phase !== 3 && <span className="absolute inset-0 bg-slate-300" />}
            {phase === 3 && c.open > 0 && (
              <span className={`absolute right-[2px] top-1/2 -mt-[3px] w-[6px] h-[6px] rounded-full ring-1 ring-white ${c.nocite ? "bg-rose-600" : c.empty ? "bg-amber-500" : "bg-violet-500"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
};
