import React from "react";
import { Check, CornerDownRight, Sparkles, X } from "lucide-react";

import { GAPS, PAGES, REFS, UNIT_NAME, type Unit } from "./data";
import { Panel } from "./Panel";
import { livePages, useMock } from "./store";

/**
 * ① 뼈대 — A4 는 아직 없다. 두 장을 펼친 책상.
 *  왼쪽: 내 아웃라인 (.outline 처럼 마구 쓰기 → AI 정돈 제안 → 받으면 쪽 뼈대, 내 말은 메모로)
 *  오른쪽: 레퍼런스 책상 — 다른 카드사 안내장 7곳. 왼쪽에서 줄을 고르면 같은 뜻의 자리가 카드마다 켜진다.
 */
export const PhasePlan: React.FC = () => (
  <div className="absolute inset-0 p-3 pb-3 grid grid-cols-[minmax(420px,44%)_1fr] gap-3" data-testid="mock-plan">
    <Outline />
    <RefDesk />
  </div>
);

/* ── 왼쪽: 내 아웃라인 ── */

const Outline: React.FC = () => {
  const tidied = useMock((s) => s.tidied);
  const proposal = useMock((s) => s.proposalOpen);
  return (
    <Panel
      title={tidied ? "기획안 뼈대" : proposal ? "AI 정돈 제안" : "내 메모"}
      right={<span className="text-[11.5px] text-[#8b857c]">{tidied ? "쪽마다 내가 쓴 말이 메모로" : proposal ? "받기 전에는 메모가 그대로" : "생각나는 대로 — Enter · Tab"}</span>}
      testId="mock-outline"
    >
      {tidied ? <Tidy /> : proposal ? <Proposal /> : <Messy />}
    </Panel>
  );
};

const Messy: React.FC = () => {
  const notes = useMock((s) => s.notes);
  const focus = useMock((s) => s.focusNote);
  const st = useMock.getState;
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (focus) box.current?.querySelector<HTMLInputElement>(`input[data-note="${focus}"]`)?.focus();
  }, [focus, notes.length]);
  return (
    <div ref={box} className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
      {notes.map((n) => {
        const page = n.to[0] ? PAGES.find((p) => p.id === n.to[0]) : undefined;
        return (
          <div key={n.id} className={`flex items-center gap-2 rounded-[8px] pr-2 ${focus === n.id ? "bg-[#f1ede6]" : ""}`} style={{ paddingLeft: 8 + n.depth * 22 }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1c1b1a] shrink-0" />
            <input
              data-note={n.id}
              value={n.text}
              onChange={(e) => st().setNote(n.id, e.target.value)}
              onFocus={() => st().setFocusNote(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  st().addNoteAfter(n.id);
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  st().indentNote(n.id, e.shiftKey ? -1 : 1);
                } else if (e.key === "Backspace" && !e.currentTarget.value) {
                  e.preventDefault();
                  st().removeNote(n.id);
                }
              }}
              placeholder="생각나는 대로"
              className="flex-1 min-w-0 bg-transparent outline-none py-2 text-[15px] placeholder:text-[#c0b9ae]"
            />
            {n.text.trim() && (
              <span className={`shrink-0 text-[11.5px] ${page ? "text-[#a39c91]" : "text-[#d97706]"}`} title={n.to.map((id) => PAGES.find((p) => p.id === id)?.title).join(" · ")}>
                {page ? `→ ${page.no}쪽${n.to.length > 1 ? ` 외 ${n.to.length - 1}` : ""}` : "? 어디인지 모름"}
              </span>
            )}
          </div>
        );
      })}
      <p className="mt-4 mx-2 text-[12px] leading-5 text-[#a39c91]">AI 는 쓰는 동안 줄을 건드리지 않아요. 오른쪽에 붙는 작은 글자가 "어디로 갈지" 알아들은 표시예요.</p>
    </div>
  );
};

/** 쪽마다 내가 쓴 메모 */
function memosOf(notes: ReturnType<typeof useMock.getState>["notes"], pageId: string) {
  return notes.filter((n) => n.text.trim() && n.to[0] === pageId);
}

const Proposal: React.FC = () => {
  const notes = useMock((s) => s.notes);
  const pageOn = useMock((s) => s.pageOn);
  const st = useMock.getState;
  const unsorted = notes.filter((n) => n.text.trim() && !n.to.length);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="mx-3 mt-3 rounded-[12px] bg-[#f3efff] border border-[#ddd3fb] px-4 py-3 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-[#6d28d9] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-[#3b2a6b] leading-5">메모 {notes.filter((n) => n.text.trim()).length}줄을 다른 카드사 안내장 7곳의 순서로 짜 봤어요. 쓰신 말은 쪽마다 회색 메모로 남아요.</p>
          <div className="flex gap-2 mt-2.5">
            <button type="button" onClick={st().acceptProposal} className="h-8 px-3 rounded-[9px] bg-[#6d28d9] text-white text-[12.5px] font-bold flex items-center gap-1.5" data-testid="mock-accept">
              <Check className="w-3.5 h-3.5" />
              받기
            </button>
            <button type="button" onClick={() => st().openProposal(false)} className="h-8 px-3 rounded-[9px] bg-white border border-[#ddd3fb] text-[#5b21b6] text-[12.5px] flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" />
              안 받기
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {PAGES.map((p) => {
          const memos = memosOf(notes, p.id);
          const off = !pageOn[p.id];
          return (
            <div key={p.id} className={`rounded-[10px] px-3 py-2 ${off ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2.5">
                <span className="w-6 text-[12px] font-bold text-[#a39c91] tabular-nums">{p.no}</span>
                <span className="text-[15px] font-bold flex-1">{p.title}</span>
                {off && <span className="text-[11px] text-[#d97706] font-semibold">제안 · 메모에 없음</span>}
                {!off && !memos.length && <span className="text-[11px] text-[#6d28d9]">+ 레퍼런스에서</span>}
              </div>
              {memos.map((m) => (
                <div key={m.id} className="ml-8 mt-1 text-[12.5px] text-[#8b857c] italic flex items-center gap-1.5">
                  {m.id === "n7" ? <CornerDownRight className="w-3 h-3 text-[#6d28d9] not-italic" /> : <span className="w-1 h-1 rounded-full bg-[#c0b9ae]" />}
                  {m.text}
                  {m.id === "n7" && <span className="not-italic text-[10.5px] text-[#6d28d9]">자리 옮김 — 다른 카드사는 실적 쪽에</span>}
                </div>
              ))}
            </div>
          );
        })}
        {unsorted.length > 0 && (
          <div className="mt-2 rounded-[10px] border border-dashed border-[#e3b26b] px-3 py-2">
            <div className="text-[13px] font-bold text-[#b45309]">어디에 넣을지 모르는 메모</div>
            {unsorted.map((m) => (
              <div key={m.id} className="mt-1 text-[12.5px] text-[#8b857c] italic">“{m.text}”</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Tidy: React.FC = () => {
  const notes = useMock((s) => s.notes);
  const pageOn = useMock((s) => s.pageOn);
  const launch = useMock((s) => s.launchFound);
  const focus = useMock((s) => s.focusNote);
  const st = useMock.getState;
  const gaps = GAPS.filter((g) => (g.page === "p2" ? !pageOn.p2 : !launch));
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
      {gaps.length > 0 && (
        <div className="mb-3 flex flex-col gap-2" data-testid="mock-gaps">
          {gaps.map((g) => (
            <div key={g.page} className="rounded-[12px] bg-[#fff6e8] border border-[#f2d7a8] px-4 py-2.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-[#92400e]">{g.what}</span>
                <span className="block text-[12px] text-[#a16207]">{g.how}</span>
              </span>
              <button type="button" onClick={g.page === "p2" ? st().acceptSummary : st().acceptLaunch} className="h-8 px-3 rounded-[9px] bg-[#d97706] text-white text-[12.5px] font-bold shrink-0">
                {g.page === "p2" ? "넣기" : "넣기"}
              </button>
            </div>
          ))}
        </div>
      )}
      {livePages(pageOn).map((p) => {
        const memos = memosOf(notes, p.id);
        const on = focus === p.id;
        return (
          <button key={p.id} type="button" onClick={() => st().setFocusNote(p.id)} className={`w-full text-left rounded-[12px] px-3 py-2.5 mb-1 ${on ? "bg-[#1c1b1a] text-white" : "hover:bg-[#f1ede6]"}`} data-testid="mock-tidy-page">
            <div className="flex items-baseline gap-2.5">
              <span className={`w-6 text-[12px] font-bold tabular-nums ${on ? "text-white/60" : "text-[#a39c91]"}`}>{p.no}</span>
              <span className="text-[15px] font-bold flex-1">{p.title}</span>
              <span className={`text-[11px] ${on ? "text-white/60" : "text-[#a39c91]"}`}>{UNIT_NAME[p.unit]}</span>
            </div>
            <div className={`ml-[34px] text-[12.5px] ${on ? "text-white/75" : "text-[#6f695f]"}`}>{p.intent}</div>
            {memos.map((m) => (
              <div key={m.id} className={`ml-[34px] mt-0.5 text-[12px] italic ${on ? "text-white/55" : "text-[#a39c91]"}`}>
                “{m.text}”
              </div>
            ))}
          </button>
        );
      })}
    </div>
  );
};

/* ── 오른쪽: 레퍼런스 책상 ── */

const UNIT_ORDER: Unit[] = ["identity", "summary", "benefit", "criteria", "fee", "overseas", "notice"];

const RefDesk: React.FC = () => {
  const focusNote = useMock((s) => s.focusNote);
  const notes = useMock((s) => s.notes);
  const tidied = useMock((s) => s.tidied);
  // 고른 줄의 의미 단위
  const pageId = tidied ? focusNote : notes.find((n) => n.id === focusNote)?.to[0];
  const page = pageId ? PAGES.find((p) => p.id === pageId) : undefined;
  const unit = page?.unit;
  const have = unit ? REFS.filter((r) => r.units[unit]).length : 0;
  return (
    <Panel
      title="레퍼런스 책상 — 다른 카드사 안내장 7곳"
      right={
        <span className="text-[12px] text-[#6f695f]">
          {page ? (
            <>
              <b className="text-[#1c1b1a]">{page.no}쪽 {page.title}</b> = {UNIT_NAME[page.unit]} · {have}/7곳에 있음
            </>
          ) : (
            "왼쪽에서 줄을 고르면 같은 뜻의 자리가 켜져요"
          )}
        </span>
      }
      testId="mock-refdesk"
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-24 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 content-start">
        {REFS.map((r) => (
          <div key={r.id} className={`rounded-[14px] border bg-white overflow-hidden ${unit && r.units[unit] ? "border-[#1c1b1a] shadow-md" : "border-[#e6e2db]"}`} data-testid="mock-ref">
            <div className="px-3.5 pt-3 pb-2.5" style={{ borderTop: `4px solid ${r.tone}` }}>
              <div className="text-[11.5px] text-[#8b857c]">{r.company}</div>
              <div className="text-[14px] font-bold leading-5">{r.product}</div>
              <div className="text-[11.5px] text-[#8b857c]">
                {r.form} · {r.grouping}
              </div>
              {/* 쪽 띠 */}
              <div className="flex gap-[2px] mt-2">
                {Array.from({ length: Math.min(r.pages, 20) }).map((_, i) => (
                  <span key={i} className="flex-1 h-[5px] rounded-[1px]" style={{ background: r.tone, opacity: 0.25 + (i % 3) * 0.15 }} />
                ))}
              </div>
            </div>
            <div className="border-t border-[#f0ece5] px-1.5 py-1.5">
              {UNIT_ORDER.map((u) => {
                const v = r.units[u];
                const hot = unit === u;
                return (
                  <div key={u} className={`flex items-baseline gap-2 px-2 py-1 rounded-[7px] ${hot ? (v ? "bg-[#1c1b1a] text-white" : "bg-[#fdecec]") : ""}`}>
                    <span className={`w-[78px] shrink-0 text-[11px] ${hot ? (v ? "text-white/70" : "text-[#b91c1c]") : "text-[#a39c91]"}`}>{UNIT_NAME[u].split(" ")[0]}</span>
                    <span className={`flex-1 min-w-0 text-[12px] leading-4 ${v ? "" : hot ? "text-[#b91c1c]" : "text-[#d6d0c6]"}`}>{v ?? "없음"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
};
