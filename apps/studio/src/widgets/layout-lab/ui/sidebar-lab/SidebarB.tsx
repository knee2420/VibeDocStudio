import React from "react";

import { indexOf, type SbSection, type SlotState } from "../../model/sidebarDummy";
import { countSection, slotView, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { OutlineTree } from "./OutlineTree";
import { citeNo, SidebarHead, useRevealRow } from "./parts";

/**
 * 시안 B · 목차 + 할 일 — 자르는 자리를 "페이지"에서 "구역"으로.
 * 위: 장 · 구역까지만 보이는 목차. 아래: 지금 구역의 칸 (Phase 3 은 할 일 목록, 상태 꼬리표가 왼쪽).
 */
export const SidebarB: React.FC = () => {
  const scroller = React.useRef<HTMLDivElement>(null);
  useRevealRow(scroller);
  const focus = useFocusSection();
  return (
    <aside className="fig-panel w-[300px] shrink-0 min-h-0 flex flex-col bg-white border-r border-[var(--fig-border)]" data-testid="sb-sidebar-b">
      <SidebarHead />
      <div className="h-7 px-3 flex items-center justify-between text-[11.5px] font-semibold text-slate-700 shrink-0">
        목차<span className="font-normal text-slate-400">장 · 구역까지</span>
      </div>
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto pb-3" role="tree" aria-label="문서 목차">
        <OutlineTree mode="b" />
      </div>
      <TaskPanel section={focus} />
    </aside>
  );
};

/** 아래 칸이 보여 줄 구역: 고른 구역 → 고른 칸의 구역 → 고른 장의 첫 구역 → 본문에 보이는 장의 첫 구역 */
function useFocusSection(): SbSection | undefined {
  const sc = useScenario();
  const selectedId = useSidebarLabStore((s) => s.selectedId);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const idx = indexOf(sc);
  const e = selectedId ? idx.get(selectedId) : undefined;
  if (e?.section) return e.section;
  if (e?.chapter) return e.chapter.sections[0];
  return viewChapterId ? idx.get(viewChapterId)?.chapter?.sections[0] : undefined;
}

const CHIP: Record<SlotState, { label: string; cls: string }> = {
  empty: { label: "빈칸", cls: "bg-amber-500 text-white font-bold" },
  draft: { label: "초안", cls: "bg-violet-500 text-white font-bold" },
  nocite: { label: "근거 X", cls: "bg-rose-500 text-white font-bold" },
  copied: { label: "그대로", cls: "text-slate-400" },
  checked: { label: "확인", cls: "text-slate-500" },
  wait: { label: "대기", cls: "text-slate-400" },
};

const TaskPanel: React.FC<{ section?: SbSection }> = ({ section }) => {
  const sc = useScenario();
  const phase = useSidebarLabStore((s) => s.phase);
  const edits = useSidebarLabStore((s) => s.edits);
  const selectedId = useSidebarLabStore((s) => s.selectedId);
  const select = useSidebarLabStore((s) => s.select);
  const hover = useSidebarLabStore((s) => s.hover);
  const write = useSidebarLabStore((s) => s.write);
  const confirm = useSidebarLabStore((s) => s.confirm);
  if (!section) return null;
  const c = countSection(section, edits);
  const title = phase === 1 ? "이 구역의 칸 계획" : phase === 2 ? "이 구역의 틀과 칸" : "이 구역에서 할 일";

  return (
    <div className="h-[44%] shrink-0 min-h-0 flex flex-col border-t border-[var(--fig-border)] bg-slate-50/60" data-testid="sb-task-panel">
      <div className="px-3 pt-2.5 pb-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-slate-700">{title}</span>
          {phase === 3 && c.open > 0 && <span className="text-[10.5px] font-bold px-1.5 rounded bg-amber-100 text-amber-800">{c.open} 남음</span>}
          {phase === 3 && c.open === 0 && <span className="text-[10.5px] text-slate-400">다 끝남</span>}
        </div>
        <div className="text-[12.5px] font-semibold text-slate-900 truncate mt-0.5">{section.name}</div>
        <div className="text-[11px] text-slate-500 truncate">{phase === 2 ? `틀 · ${section.formLabel}` : section.intent}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          {section.slots.map((slot) => {
            const v = slotView(slot, edits);
            const sel = selectedId === slot.id;
            const chip = CHIP[v.state];
            return (
              <div
                key={slot.id}
                role="button"
                tabIndex={0}
                onClick={() => select(slot.id)}
                onKeyDown={(e) => e.key === "Enter" && select(slot.id)}
                onMouseEnter={() => hover(slot.id)}
                onMouseLeave={() => hover(null)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left border-b border-slate-100 last:border-b-0 cursor-pointer ${sel ? "bg-[var(--fig-brand)]/10" : "hover:bg-slate-50"}`}
              >
                {phase === 3 && <span className={`shrink-0 w-11 text-center text-[10.5px] rounded py-px ${chip.cls}`}>{chip.label}</span>}
                <span className={`flex-1 min-w-0 truncate text-[12px] ${phase === 3 && (v.state === "wait" || v.state === "copied") ? "text-slate-400" : "text-slate-800"} ${sel ? "font-semibold" : ""}`}>
                  {slot.name}
                </span>
                {phase === 3 && v.state === "empty" && (
                  <button type="button" className="shrink-0 px-1.5 rounded bg-amber-500 text-white text-[10px] font-semibold" onClick={(e) => (e.stopPropagation(), write(slot))}>
                    AI 쓰기
                  </button>
                )}
                {phase === 3 && (v.state === "draft" || v.state === "nocite") && (
                  <button type="button" className="shrink-0 px-1.5 rounded border border-slate-300 text-slate-700 text-[10px] font-semibold bg-white" onClick={(e) => (e.stopPropagation(), confirm(slot))}>
                    확인
                  </button>
                )}
                <span className="shrink-0 max-w-[80px] truncate font-mono text-[10px] text-slate-400">
                  {phase === 2
                    ? slot.key ?? ""
                    : v.state === "wait"
                      ? slot.waitFor
                      : v.state === "copied"
                        ? "레퍼런스"
                        : v.cites?.length
                          ? v.cites.map((id) => `[${citeNo(sc, id)}]`).join("")
                          : ""}
                </span>
              </div>
            );
          })}
        </div>
        {phase !== 3 && (
          <p className="text-[10.5px] text-slate-400 mt-2 px-1">
            {phase === 1 ? "Phase 1 에서는 이 칸이 할 일이 없다 — 칸 이름만 미리 본다." : "Phase 2 에서는 칸마다 연결할 변수를 확인한다."}
          </p>
        )}
      </div>
    </div>
  );
};
