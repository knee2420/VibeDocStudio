import React from "react";

import { indexOf, pageRange, type SbChapter, type SbDoc, type SbSection } from "../../model/sidebarDummy";
import { countChapter, countDoc, countSection, isOpenState, slotView, useIsOpen, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { Branch, Count, GroupMark, PartRow, SlotMark, SlotRight, TreeRow } from "./parts";

/**
 * 세 시안이 같이 쓰는 목차 나무. 시안마다 다른 점만 mode 로 가른다.
 *  a: 장 줄 두 줄(이름 + Phase 1 요약), 칸까지
 *  b: 한 줄짜리, 구역까지 (칸은 아래 할 일 칸에서)
 *  c: 한 줄짜리, 칸은 고른 구역만
 * 긴 문서(청원서)를 위해: 부(部) 머리, 장 줄의 쪽 수, 보일 단계(장 · 구역 · 칸), 남은 일만.
 */
export type TreeMode = "a" | "b" | "c";

export const OutlineTree: React.FC<{ mode: TreeMode }> = ({ mode }) => {
  const sc = useScenario();
  return (
    <>
      {sc.docs.map((d) => (
        <DocNode key={d.id} doc={d} mode={mode} />
      ))}
    </>
  );
};

function useOnPath(id: string) {
  const sc = useScenario();
  return useSidebarLabStore((s) => !!s.selectedId && (s.selectedId === id || !!indexOf(sc).get(s.selectedId)?.anc.includes(id)));
}

const DocNode: React.FC<{ doc: SbDoc; mode: TreeMode }> = ({ doc, mode }) => {
  const phase = useSidebarLabStore((s) => s.phase);
  const edits = useSidebarLabStore((s) => s.edits);
  const setOpen = useSidebarLabStore((s) => s.setOpen);
  const open = useIsOpen(doc.id, 0);
  const onPath = useOnPath(doc.id);
  const c = countDoc(doc, edits);
  const pages = doc.chapters.reduce((n, ch) => n + ch.pages, 0);

  // 부 머리: 장의 part 가 바뀌는 자리마다
  const partPages: Record<string, number> = {};
  for (const ch of doc.chapters) if (ch.part) partPages[ch.part] = (partPages[ch.part] ?? 0) + ch.pages;

  return (
    <div className="mt-1">
      <TreeRow
        id={doc.id}
        level={0}
        depth={0}
        compact={mode !== "a"}
        open={open}
        onToggle={() => setOpen(doc.id, !open)}
        mark={phase === 3 ? <GroupMark c={c} /> : undefined}
        name={doc.name}
        tail={`${pages}쪽`}
        right={<Count c={c} phase={phase} />}
      />
      {open && (
        <Branch depth={0} onPath={onPath}>
          {doc.chapters.map((ch, i) => (
            <React.Fragment key={ch.id}>
              {ch.part && ch.part !== doc.chapters[i - 1]?.part && <PartRow label={ch.part} depth={1} pages={partPages[ch.part]} />}
              <ChapterNode doc={doc} ch={ch} no={i + 1} mode={mode} />
            </React.Fragment>
          ))}
        </Branch>
      )}
    </div>
  );
};

const ChapterNode: React.FC<{ doc: SbDoc; ch: SbChapter; no: number; mode: TreeMode }> = ({ doc, ch, no, mode }) => {
  const phase = useSidebarLabStore((s) => s.phase);
  const edits = useSidebarLabStore((s) => s.edits);
  const only = useSidebarLabStore((s) => s.onlyOpen && s.phase === 3);
  const inView = useSidebarLabStore((s) => s.viewChapterId === ch.id);
  const setOpen = useSidebarLabStore((s) => s.setOpen);
  const open = useIsOpen(ch.id, 1);
  const onPath = useOnPath(ch.id);
  const c = countChapter(ch, edits);
  if (only && c.open === 0) return null;
  const sub = mode !== "a" ? undefined : phase === 2 ? ch.template : ch.syn;
  return (
    <>
      <TreeRow
        id={ch.id}
        level={1}
        depth={1}
        compact={mode !== "a"}
        open={open}
        onToggle={() => setOpen(ch.id, !open)}
        mark={phase === 3 ? <GroupMark c={c} /> : undefined}
        no={no}
        name={ch.name}
        tail={ch.pages > 1 ? pageRange(doc, ch) : undefined}
        sub={sub}
        right={<Count c={c} phase={phase} />}
        inView={inView}
      />
      {open && (
        <Branch depth={1} onPath={onPath}>
          {ch.sections.map((s) => (
            <SectionNode key={s.id} s={s} mode={mode} />
          ))}
          {phase === 1 && (
            <div className="text-[11px] text-slate-400 py-1" style={{ paddingLeft: 6 + 2 * 14 + 20 }}>
              + 구역 추가 (Enter)
            </div>
          )}
        </Branch>
      )}
    </>
  );
};

const SectionNode: React.FC<{ s: SbSection; mode: TreeMode }> = ({ s, mode }) => {
  const sc = useScenario();
  const phase = useSidebarLabStore((st) => st.phase);
  const edits = useSidebarLabStore((st) => st.edits);
  const only = useSidebarLabStore((st) => st.onlyOpen && st.phase === 3);
  const setOpen = useSidebarLabStore((st) => st.setOpen);
  const depthOpen = useIsOpen(s.id, 2);
  // C 는 고른 구역(또는 그 안의 칸을 고른 구역)만 칸을 펼친다
  const onSelectedPath = useSidebarLabStore((st) => !!st.selectedId && (st.selectedId === s.id || indexOf(sc).get(st.selectedId)?.anc[2] === s.id));
  const onPath = useOnPath(s.id);
  const c = countSection(s, edits);
  if (only && c.open === 0) return null;

  const canShowSlots = phase !== 1 && mode !== "b";
  const open = mode === "c" ? depthOpen || onSelectedPath : depthOpen;
  return (
    <>
      <TreeRow
        id={s.id}
        level={2}
        depth={2}
        compact
        open={canShowSlots ? open : undefined}
        onToggle={canShowSlots ? () => setOpen(s.id, !open) : undefined}
        mark={phase === 3 ? <GroupMark c={c} /> : undefined}
        name={s.name}
        tail={phase === 1 ? undefined : s.formLabel}
        sub={phase === 1 && mode === "a" ? s.intent : undefined}
        right={<Count c={c} phase={phase} />}
      />
      {canShowSlots && open && (
        <Branch depth={2} onPath={onPath}>
          {s.slots.map((slot) => {
            const v = slotView(slot, edits);
            if (only && !isOpenState(v.state)) return null;
            return (
              <TreeRow
                key={slot.id}
                id={slot.id}
                level={3}
                depth={3}
                compact
                mark={phase === 3 ? <SlotMark state={v.state} /> : undefined}
                name={slot.name}
                dim={phase === 3 && (v.state === "wait" || v.state === "copied")}
                right={<SlotRight v={v} slot={slot} phase={phase} />}
              />
            );
          })}
        </Branch>
      )}
    </>
  );
};
