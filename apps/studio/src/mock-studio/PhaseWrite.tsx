import React from "react";
import { AlertTriangle, ArrowUp, BadgeCheck, ChevronLeft, ChevronRight, FileText, Sparkles } from "lucide-react";

import { A4Page } from "./A4Page";
import { SOURCES, type Block, type Fill } from "./data";
import { Panel } from "./Panel";
import { livePages, tally, useMock, view } from "./store";

/**
 * ③ 채우기 — 원고지. AI 가 기획안 · 혜택 정의서로 채워 둔 초안을 사람이 본다.
 *  왼쪽: 할 일 (위험한 곳 · 안 본 곳만 앞에 — 확인함 · 레퍼런스로 쓴 고지는 접어 둠)
 *  가운데: 채운 A4 (위험은 빨간 테, 안 본 곳은 보라 점선)
 *  오른쪽: AI 동료 — 고른 칸을 왜 이렇게 썼는지, 근거 원문, 고치기 · 확인
 */
export const PhaseWrite: React.FC = () => {
  const pageOn = useMock((s) => s.pageOn);
  const pageId = useMock((s) => s.page);
  const goPage = useMock((s) => s.goPage);
  const fills = useMock((s) => s.fills);
  const pages = livePages(pageOn);
  const idx = Math.max(0, pages.findIndex((p) => p.id === pageId));
  const page = pages[idx];
  const box = React.useRef<HTMLDivElement>(null);
  const block = useMock((s) => s.block);
  React.useEffect(() => {
    if (block) box.current?.querySelector(`[data-block="${block}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [block, pageId]);

  return (
    <div className="absolute inset-0 p-3 grid grid-cols-[264px_1fr_340px] gap-3" data-testid="mock-write">
      <Todo />
      <div className="min-h-0 rounded-[16px] bg-[#e8e4dd] border border-[#ddd8cf] flex flex-col">
        <div className="h-12 shrink-0 px-3 flex items-center gap-2">
          <button type="button" disabled={idx === 0} onClick={() => goPage(pages[idx - 1].id)} className="w-8 h-8 rounded-[9px] grid place-items-center hover:bg-[#ddd8cf] disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1">
            {pages.map((p) => {
              const st = p.blocks.map((b) => fills[b.id]);
              const dot = st.includes("risk") ? "bg-[#e11d48]" : st.includes("draft") ? "bg-[#7c3aed]" : "bg-transparent";
              return (
                <button key={p.id} type="button" onClick={() => goPage(p.id)} className={`relative h-8 min-w-8 px-2 rounded-[9px] text-[12px] font-bold tabular-nums ${p.id === page.id ? "bg-[#1c1b1a] text-white" : "hover:bg-[#ddd8cf] text-[#6f695f]"}`} title={p.title}>
                  {p.no}
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${dot}`} />
                </button>
              );
            })}
          </div>
          <button type="button" disabled={idx === pages.length - 1} onClick={() => goPage(pages[idx + 1].id)} className="w-8 h-8 rounded-[9px] grid place-items-center hover:bg-[#ddd8cf] disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div ref={box} className="flex-1 min-h-0 overflow-auto flex justify-center pt-3 pb-28">
          <A4Page page={page} total={pages.length} mode="edit" scale={0.8} onPick={(id) => goPage(page.id, id)} />
        </div>
      </div>
      <Colleague />
    </div>
  );
};

/* ── 왼쪽: 할 일 ── */

const Todo: React.FC = () => {
  const pageOn = useMock((s) => s.pageOn);
  const fills = useMock((s) => s.fills);
  const block = useMock((s) => s.block);
  const goPage = useMock((s) => s.goPage);
  const [showDone, setShowDone] = React.useState(false);
  const t = tally(fills, pageOn);
  const items = livePages(pageOn).flatMap((p) => p.blocks.map((b) => ({ p, b, f: fills[b.id] })));
  const group = (f: Fill) => items.filter((i) => i.f === f);
  const Row: React.FC<{ i: (typeof items)[number] }> = ({ i }) => (
    <button type="button" onClick={() => goPage(i.p.id, i.b.id)} className={`w-full text-left rounded-[10px] px-2.5 py-2 flex items-start gap-2 ${block === i.b.id ? "bg-[#1c1b1a] text-white" : "hover:bg-[#f1ede6]"}`} data-testid="mock-todo">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${i.f === "risk" ? "bg-[#e11d48]" : i.f === "draft" ? "bg-[#7c3aed]" : i.f === "ref" ? "bg-[#a39c91]" : "bg-[#16a34a]"}`} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-5 truncate">{i.b.label}</span>
        <span className={`block text-[11.5px] ${block === i.b.id ? "text-white/60" : "text-[#a39c91]"}`}>
          {i.p.no}쪽 · {i.p.title}
        </span>
      </span>
    </button>
  );
  return (
    <Panel title="할 일" right={<span className="text-[11.5px] text-[#8b857c]">{t.risk + t.draft} 남음</span>} testId="mock-todo-panel">
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <h4 className="px-2 pt-1 pb-1 text-[11.5px] font-bold text-[#e11d48]">위험한 곳 {t.risk}</h4>
        {group("risk").map((i) => <Row key={i.b.id} i={i} />)}
        {!t.risk && <p className="px-2 pb-1 text-[12px] text-[#a39c91]">없어요</p>}
        <h4 className="px-2 pt-3 pb-1 text-[11.5px] font-bold text-[#6d28d9]">안 본 곳 {t.draft}</h4>
        {group("draft").map((i) => <Row key={i.b.id} i={i} />)}
        {!t.draft && <p className="px-2 pb-1 text-[12px] text-[#a39c91]">다 봤어요</p>}
        <button type="button" onClick={() => setShowDone(!showDone)} className="mt-3 px-2 text-[11.5px] font-bold text-[#8b857c] hover:text-[#1c1b1a]">
          {showDone ? "▾" : "▸"} 확인함 {t.ok} · 레퍼런스로 쓴 고지 {t.ref}
        </button>
        {showDone && [...group("ref"), ...group("ok")].map((i) => <Row key={i.b.id} i={i} />)}
      </div>
    </Panel>
  );
};

/* ── 오른쪽: AI 동료 ── */

const FILL_TEXT: Record<Fill, string> = {
  risk: "위험 — 근거와 다름",
  draft: "AI 초안 — 아직 안 봄",
  ref: "레퍼런스 구조를 따라 새로 쓴 고지",
  ok: "확인함",
};

const Colleague: React.FC = () => {
  const pageOn = useMock((s) => s.pageOn);
  const blockId = useMock((s) => s.block);
  const fills = useMock((s) => s.fills);
  const fixes = useMock((s) => s.fixes);
  const confirm = useMock((s) => s.confirm);
  const fixRisk = useMock((s) => s.fixRisk);
  const say = useMock((s) => s.say);
  const [msg, setMsg] = React.useState("");
  const found = livePages(pageOn)
    .flatMap((p) => p.blocks.map((b) => ({ p, b })))
    .find((x) => x.b.id === blockId);
  const t = tally(fills, pageOn);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#6d28d9]" />
          AI 동료
        </span>
      }
      right={<span className="text-[11.5px] text-[#8b857c]">근거: 기획안 · 혜택 정의서 · 레퍼런스 8종</span>}
      testId="mock-colleague"
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        {!found ? (
          <div className="rounded-[14px] bg-[#f3efff] px-4 py-3 text-[13px] leading-6 text-[#3b2a6b]">
            {livePages(pageOn).length}쪽을 기획안과 혜택 정의서로 채워 뒀어요. <b>위험한 곳 {t.risk}</b> · <b>안 본 곳 {t.draft}</b> — 오른쪽 아래 버튼이 순서대로 데려가요. 법정 · 공통 고지는 다른 카드사 문장을 옮기지 않고 구조만 따라 새로 썼어요.
          </div>
        ) : (
          <BlockCard p={found.p} b={view(found.b, fixes)} fill={fills[found.b.id]} onConfirm={() => confirm(found.b.id)} onFix={() => fixRisk(found.b.id)} onRedo={() => say("다시 쓴 초안을 검토 대기로 올렸어요 (목업)")} />
        )}
      </div>
      <div className="m-3 rounded-[14px] border border-[#e6e2db] bg-white p-2.5">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(found ? ["이 칸을 2030 말투로", "더 짧게", "근거를 붙여 줘"] : ["위험한 곳부터 보여 줘", "8쪽 법정 고지 빠진 것 있어?"]).map((q) => (
            <button key={q} type="button" onClick={() => setMsg(q)} className="h-7 px-2.5 rounded-full bg-[#f1ede6] text-[11.5px] text-[#4a4540] hover:bg-[#e6e1d8]">
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder={found ? `'${found.b.label}'에 대해 말하기` : "AI 동료에게 말하기"} className="flex-1 resize-none outline-none text-[13px] leading-5 placeholder:text-[#c0b9ae]" />
          <button
            type="button"
            disabled={!msg.trim()}
            onClick={() => {
              say(`AI: "${msg}" — 초안을 검토 대기로 올렸어요 (목업)`);
              setMsg("");
            }}
            className="w-8 h-8 rounded-[10px] grid place-items-center bg-[#1c1b1a] text-white disabled:bg-[#ddd8cf]"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Panel>
  );
};

const BlockCard: React.FC<{ p: { no: number; title: string; follows: string }; b: Block; fill: Fill; onConfirm: () => void; onFix: () => void; onRedo: () => void }> = ({ p, b, fill, onConfirm, onFix, onRedo }) => {
  const src = SOURCES[b.src];
  const why = "why" in b ? b.why : undefined;
  return (
    <>
      <div>
        <div className="text-[11.5px] text-[#a39c91]">
          {p.no}쪽 · {p.title}
        </div>
        <div className="text-[17px] font-bold">{b.label}</div>
        <div className={`mt-1 inline-flex items-center gap-1 text-[11.5px] font-bold px-2 py-0.5 rounded-full ${fill === "risk" ? "bg-[#fde7ec] text-[#be123c]" : fill === "draft" ? "bg-[#ede9fe] text-[#6d28d9]" : fill === "ok" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f1ede6] text-[#6f695f]"}`}>
          {fill === "risk" ? <AlertTriangle className="w-3 h-3" /> : fill === "ok" ? <BadgeCheck className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {FILL_TEXT[fill]}
        </div>
      </div>

      {fill === "risk" && why && (
        <div className="rounded-[14px] border border-[#fecdd6] bg-[#fff1f3] px-4 py-3">
          <div className="text-[12.5px] font-bold text-[#be123c]">왜 위험한가요</div>
          <p className="text-[13px] leading-6 text-[#4c0519] mt-0.5">{why}</p>
        </div>
      )}

      <div className="rounded-[14px] border border-[#e6e2db] bg-white px-4 py-3">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#6f695f]">
          <FileText className="w-3.5 h-3.5" />
          근거 · {src?.name ?? b.src}
        </div>
        <p className="text-[13px] leading-6 text-[#3a3a42] mt-1">“{src?.excerpt}”</p>
        <div className="text-[11.5px] text-[#a39c91] mt-1">이 쪽은 {p.follows} 를 따라 짰어요</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {fill === "risk" && (
          <button type="button" onClick={onFix} className="h-9 px-3.5 rounded-[10px] bg-[#e11d48] text-white text-[13px] font-bold" data-testid="mock-fix">
            근거대로 고치기
          </button>
        )}
        {fill !== "ok" && (
          <button type="button" onClick={onConfirm} className={`h-9 px-3.5 rounded-[10px] text-[13px] font-bold ${fill === "risk" ? "border border-[#e6e2db] bg-white" : "bg-[#1c1b1a] text-white"}`} data-testid="mock-confirm">
            {fill === "risk" ? "이대로 두기 (확인)" : "확인"}
          </button>
        )}
        <button type="button" onClick={onRedo} className="h-9 px-3.5 rounded-[10px] border border-[#e6e2db] bg-white text-[13px]">
          다시 써 줘
        </button>
      </div>
    </>
  );
};
