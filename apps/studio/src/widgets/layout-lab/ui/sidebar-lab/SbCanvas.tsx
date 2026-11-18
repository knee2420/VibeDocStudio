import React from "react";
import { Check } from "lucide-react";

import { pageRange, type SbChapter, type SbDoc, type SbSection, type SbSlot } from "../../model/sidebarDummy";
import { activeDoc, slotView, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { citeNo } from "./parts";

/**
 * 캔버스 더미 — 같은 뼈대를 단계마다 다르게 그린다.
 * 1 뼈대: 장 카드 + 구역 상자(이름 · 의도) / 2 서식: 틀 와이어프레임 + 칸 변수 / 3 채우기: 실제 내용과 상태.
 * 긴 문서는 장 하나가 여러 쪽이라 카드 머리에 쪽 범위를 단다 (실제 쪽 넘김은 그리지 않는다).
 */
export const SbCanvas: React.FC = () => {
  const sc = useScenario();
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const scrollReq = useSidebarLabStore((s) => s.scrollReq);
  const setViewChapter = useSidebarLabStore((s) => s.setViewChapter);
  const select = useSidebarLabStore((s) => s.select);
  const ref = React.useRef<HTMLDivElement>(null);
  const doc = activeDoc(sc, docId);

  // 트리에서 고르면 본문 그 자리로
  React.useEffect(() => {
    if (!scrollReq) return;
    const el = ref.current?.querySelector(`[data-sb-id="${scrollReq.id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollReq]);

  // 문서를 바꾸면 맨 위로 (목차를 고쳐 doc 객체만 바뀐 때는 그대로)
  const firstChapterId = doc.chapters[0]?.id ?? null;
  const firstRef = React.useRef(firstChapterId);
  firstRef.current = firstChapterId;
  React.useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    setViewChapter(firstRef.current);
  }, [doc.id, sc.id, setViewChapter]);

  // 스크롤 스파이: 화면 위쪽에 걸린 마지막 장
  const raf = React.useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const box = ref.current;
      if (!box) return;
      const top = box.getBoundingClientRect().top + 160;
      let current: string | null = null;
      box.querySelectorAll<HTMLElement>("[data-sb-page]").forEach((p) => {
        if (p.getBoundingClientRect().top <= top) current = p.dataset.sbPage ?? null;
      });
      const id = current ?? doc.chapters[0]?.id ?? null;
      if (useSidebarLabStore.getState().viewChapterId !== id) setViewChapter(id);
    });
  };

  return (
    <div ref={ref} onScroll={onScroll} onClick={() => select(null)} className="flex-1 min-h-0 overflow-y-auto bg-[#eef0f3]" data-testid="sb-canvas">
      <div className="py-8 pb-40 flex flex-col items-center gap-8">
        {doc.chapters.map((ch, i) => (
          <React.Fragment key={ch.id}>
            {ch.part && ch.part !== doc.chapters[i - 1]?.part && <div className="w-[640px] max-w-[calc(100%-48px)] -mb-4 text-[12px] font-bold tracking-wide text-slate-400">{ch.part}</div>}
            <Page doc={doc} ch={ch} no={i + 1} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

/** 고름 · 올림 테두리 */
function useMark(id: string) {
  const selected = useSidebarLabStore((s) => s.selectedId === id);
  const hovered = useSidebarLabStore((s) => s.hoverId === id);
  return selected ? "ring-2 ring-[var(--fig-brand)]" : hovered ? "ring-2 ring-[var(--fig-brand)]/40" : "";
}

function usePick(id: string) {
  const select = useSidebarLabStore((s) => s.select);
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    select(id, { scroll: false });
  };
}

const Page: React.FC<{ doc: SbDoc; ch: SbChapter; no: number }> = ({ doc, ch, no }) => {
  const phase = useSidebarLabStore((s) => s.phase);
  const mark = useMark(ch.id);
  const pick = usePick(ch.id);
  return (
    <section
      data-sb-id={ch.id}
      data-sb-page={ch.id}
      onClick={pick}
      className={`w-[640px] max-w-[calc(100%-48px)] bg-white shadow-sm rounded-[2px] px-10 py-9 flex flex-col gap-5 transition-shadow ${mark}`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-3">
        <h2 className="text-[19px] font-bold text-slate-900 min-w-0">
          <span className="text-slate-300 font-mono mr-2">{no}</span>
          {ch.name || <span className="text-slate-300">이름 없는 장</span>}
        </h2>
        <span className="text-[11px] shrink-0 text-slate-400 tabular-nums">{pageRange(doc, ch)}</span>
      </header>
      <p className={`text-[12px] -mt-2 ${phase === 2 ? "text-violet-600" : "text-slate-500"}`}>{phase === 2 ? ch.template : ch.syn}</p>
      {ch.sections.map((s) => (
        <Section key={s.id} s={s} />
      ))}
      {ch.sections.length === 0 && <p className="text-[12px] text-slate-400 border-2 border-dashed border-slate-200 rounded-md px-4 py-3">구역이 아직 없어요 — 목차에서 이 장을 고르고 Enter, 또는 AI 대화로 제안받기</p>}
      {ch.pages > 3 && phase === 3 && <p className="text-[11px] text-slate-400 text-center border-t border-dashed border-slate-200 pt-3">… 이 장은 {ch.pages}쪽 — 시제품은 구역 머리와 칸만 보여 줍니다</p>}
    </section>
  );
};

const Section: React.FC<{ s: SbSection }> = ({ s }) => {
  const phase = useSidebarLabStore((st) => st.phase);
  const mark = useMark(s.id);
  const pick = usePick(s.id);
  const box = `rounded-md transition-shadow ${mark}`;

  if (phase === 1)
    return (
      <div data-sb-id={s.id} onClick={pick} className={`${box} border-2 border-dashed border-slate-200 px-4 py-3 cursor-pointer`}>
        <div className="text-[14px] font-semibold text-slate-800">{s.name || "이름 없는 구역"}</div>
        <div className="text-[12.5px] text-slate-500">{s.intent}</div>
      </div>
    );

  if (phase === 2)
    return (
      <div data-sb-id={s.id} onClick={pick} className={`${box} border border-violet-200 bg-violet-50/40 px-4 py-3 cursor-pointer`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-slate-800">{s.name}</span>
          <span className="text-[11px] text-violet-700">{s.formLabel}</span>
        </div>
        <div className={s.form === "info" || s.form === "sign" ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1.5"}>
          {s.slots.map((slot) => (
            <SlotFrame key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
    );

  return (
    <div data-sb-id={s.id} onClick={pick} className={`${box} -mx-2 px-2 py-1.5`}>
      <div className="text-[11px] font-semibold text-slate-400 mb-1.5 tracking-wide">{s.name || "이름 없는 구역"}</div>
      {s.slots.length ? <Filled s={s} /> : <p className="text-[12px] text-slate-400">{s.intent || "아직 칸이 없어요"}</p>}
    </div>
  );
};

/** Phase 2 — 칸 자리만 */
const SlotFrame: React.FC<{ slot: SbSlot }> = ({ slot }) => {
  const mark = useMark(slot.id);
  const pick = usePick(slot.id);
  return (
    <div data-sb-id={slot.id} onClick={pick} className={`rounded bg-white border border-violet-100 px-2 py-1 flex items-center justify-between gap-2 cursor-pointer ${mark}`}>
      <span className="text-[12px] text-slate-600 truncate">{slot.name}</span>
      {slot.key ? (
        <span className="font-mono text-[10px] text-violet-600 shrink-0">{slot.key}</span>
      ) : slot.state === "copied" ? (
        <span className="text-[10px] text-slate-400 shrink-0">레퍼런스 문구</span>
      ) : null}
    </div>
  );
};

/** Phase 3 — 틀마다 실제 모양 */
const Filled: React.FC<{ s: SbSection }> = ({ s }) => {
  if (s.form === "info")
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {s.slots.map((slot) => (
          <div key={slot.id} className="flex flex-col gap-0.5 text-[13.5px] min-w-0">
            <span className="text-[11.5px] font-semibold text-slate-500">{slot.name}</span>
            <SlotView slot={slot} />
          </div>
        ))}
      </div>
    );
  if (s.form === "table")
    return (
      <table className="w-full text-[13px] border border-slate-200">
        <tbody>
          {s.slots.map((slot) => (
            <tr key={slot.id}>
              <td className="px-3 py-1.5 border-b border-r border-slate-200 bg-slate-50 text-slate-700 w-[36%] align-top">{slot.name}</td>
              <td className="px-2 py-1 border-b border-slate-200">
                <SlotView slot={slot} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (s.form === "sign")
    return (
      <div className="flex justify-end gap-2">
        {s.slots.map((slot) => (
          <div key={slot.id} className="w-[150px] border border-slate-300 text-center text-[12px]">
            <div className="bg-slate-50 border-b border-slate-300 py-1 text-slate-600">{slot.name}</div>
            <div className="min-h-14 grid place-items-center p-1.5">
              <SlotView slot={slot} />
            </div>
          </div>
        ))}
      </div>
    );
  if (s.form === "notice")
    return (
      <ul className="flex flex-col gap-1.5 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2.5">
        {s.slots.map((slot) => (
          <li key={slot.id} className="flex gap-1.5">
            <span className="text-slate-400">※</span>
            <SlotView slot={slot} />
          </li>
        ))}
      </ul>
    );
  return (
    <div className="flex flex-col gap-2">
      {s.slots.map((slot) => (
        <div key={slot.id} className="text-[13.5px] leading-relaxed">
          <SlotView slot={slot} label={s.form === "text"} bullet={s.form === "list"} />
        </div>
      ))}
    </div>
  );
};

/** 칸 하나 — 상태마다 모양과 할 일이 다르다 */
const SlotView: React.FC<{ slot: SbSlot; label?: boolean; bullet?: boolean }> = ({ slot, label, bullet }) => {
  const sc = useScenario();
  const edits = useSidebarLabStore((s) => s.edits);
  const write = useSidebarLabStore((s) => s.write);
  const confirm = useSidebarLabStore((s) => s.confirm);
  const select = useSidebarLabStore((s) => s.select);
  const mark = useMark(slot.id);
  const pick = usePick(slot.id);
  const v = slotView(slot, edits);
  const head = label ? <b className="mr-1.5 text-slate-900">{slot.name}.</b> : bullet ? <span className="mr-1.5 text-slate-400">•</span> : null;
  const cites = v.cites?.length ? (
    <span className="ml-1 whitespace-nowrap">
      {v.cites.map((id) => (
        <sup key={id} className="text-[10px] text-[var(--fig-brand)] font-semibold mr-0.5" title={sc.sources.find((x) => x.id === id)?.label}>
          [{citeNo(sc, id)}]
        </sup>
      ))}
    </span>
  ) : null;

  if (v.state === "wait")
    return (
      <span data-sb-id={slot.id} onClick={pick} className={`inline-flex items-center px-2 py-0.5 rounded border border-dashed border-slate-300 text-[11.5px] text-slate-400 cursor-pointer ${mark}`}>
        대기 · {slot.waitFor}
      </span>
    );

  if (v.state === "empty")
    return (
      <span
        data-sb-id={slot.id}
        onClick={pick}
        className={`inline-flex items-center gap-2 px-2 py-0.5 rounded border border-dashed border-amber-400 bg-amber-50 text-[12px] text-amber-800 cursor-pointer max-w-full ${mark}`}
      >
        <span className="truncate">{slot.name} — 비어 있음</span>
        <button
          type="button"
          className="shrink-0 px-1.5 rounded bg-amber-500 text-white text-[10.5px] font-semibold hover:bg-amber-600"
          onClick={(e) => {
            e.stopPropagation();
            write(slot);
            select(slot.id, { scroll: false });
          }}
          title={slot.sampleCites?.length ? "물린 리소스를 근거로 AI 초안 쓰기" : "근거 리소스가 없어 근거 없는 초안이 됩니다"}
        >
          AI 로 쓰기
        </button>
      </span>
    );

  const tone =
    v.state === "draft"
      ? "bg-violet-50 border-l-2 border-violet-400 pl-1.5"
      : v.state === "nocite"
        ? "bg-rose-50 border-l-2 border-rose-400 pl-1.5"
        : v.state === "copied"
          ? "text-slate-600"
          : "";

  return (
    <span data-sb-id={slot.id} onClick={pick} className={`group rounded px-0.5 cursor-pointer text-slate-800 ${tone} ${mark}`}>
      {head}
      {v.value}
      {cites}
      {v.state === "draft" && <Tag cls="bg-violet-100 text-violet-700">AI 초안</Tag>}
      {v.state === "nocite" && <Tag cls="bg-rose-100 text-rose-700">근거 없음</Tag>}
      {v.state === "copied" && <Tag cls="bg-slate-100 text-slate-500">레퍼런스 그대로 · {slot.from}</Tag>}
      {v.state === "checked" && <Check className="inline w-3 h-3 ml-1 text-emerald-600 opacity-60" />}
      {(v.state === "draft" || v.state === "nocite") && (
        <button
          type="button"
          className="ml-1.5 px-1.5 rounded border border-slate-300 bg-white text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50 align-middle"
          onClick={(e) => {
            e.stopPropagation();
            confirm(slot);
            select(slot.id, { scroll: false });
          }}
        >
          확인
        </button>
      )}
    </span>
  );
};

const Tag: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
  <span className={`ml-1.5 px-1 rounded text-[10px] font-semibold align-middle whitespace-nowrap ${cls}`}>{children}</span>
);
