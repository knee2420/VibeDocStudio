import React from "react";
import { AlertTriangle, Eye, FileText, Sparkles } from "lucide-react";

import { COMPANIES, CROSSWALK, FILLS, findNode, LAYOUTS, MISSING_HINT, nodeLabel, SCAFFOLD, UNITS } from "../../model/cardProtoData";
import { coverage, lineKey, missing, presentKeys, useCardProtoStore } from "../../model/useCardProtoStore";

/**
 * 오른쪽 칸 — AI 쪽. 단계마다 할 말이 다르다.
 *  1 뼈대: AI 가 이해한 뼈대 · 빠진 것 · 다른 카드사엔 있는 것 · (고른 줄) 다른 카드사는 이 부분을
 *  2 서식: 판형 고르기 · (고른 줄) 다른 카드사는 이 부분을
 *  3 채우기: 채우기 · 위험한 곳 · 안 본 곳
 */
export const ProtoSide: React.FC = () => {
  const phase = useCardProtoStore((s) => s.phase);
  return (
    <aside className="fig-panel w-[340px] shrink-0 min-h-0 flex flex-col bg-white border-l border-[var(--fig-border)]" data-testid="proto-side">
      <div className="h-10 shrink-0 px-3 flex items-center gap-1.5 border-b border-[var(--fig-border)]">
        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
        <span className="text-[12.5px] font-semibold text-slate-800">AI</span>
        <span className="text-[11px] text-slate-400">{phase === 1 ? "뼈대를 같이 다듬어요" : phase === 2 ? "판형을 골라요" : "채우고 같이 봐요"}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        {phase === 1 && <PhaseOne />}
        {phase === 2 && <LayoutPick />}
        {phase === 3 && <Review />}
        {phase !== 3 && <Crosswalk />}
      </div>
    </aside>
  );
};

const Sec: React.FC<{ title: React.ReactNode; children: React.ReactNode; testId?: string }> = ({ title, children, testId }) => (
  <section className="flex flex-col gap-1.5" data-testid={testId}>
    <h3 className="text-[11px] font-semibold text-slate-500">{title}</h3>
    {children}
  </section>
);

/* ── Phase 1 ── */

const PhaseOne: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const accepted = useCardProtoStore((s) => s.accepted);
  const proposal = useCardProtoStore((s) => s.proposal);
  const resolved = useCardProtoStore((s) => s.resolved);
  const withSummary = useCardProtoStore((s) => s.withSummary);
  const openProposal = useCardProtoStore((s) => s.openProposal);
  const resolve = useCardProtoStore((s) => s.resolve);
  const addSummary = useCardProtoStore((s) => s.addSummary);
  const focusKey = useCardProtoStore((s) => s.focusKey);
  const cov = coverage(lines);
  const miss = missing(cov, resolved);
  const userLines = lines.filter((l) => !l.key && !l.memo && l.text.trim()).length;

  return (
    <>
      {!accepted && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 flex flex-col gap-1.5">
          <p className="text-[12px] text-slate-800 leading-5">
            메모 {userLines}줄을 우리카드 안내장 뼈대 {SCAFFOLD.length}장에 맞춰 봤어요. 쓰시는 동안은 줄을 건드리지 않고, 정돈은 제안으로 드려요.
          </p>
          <button
            type="button"
            disabled={!!proposal}
            onClick={openProposal}
            className="self-start h-7 px-2.5 rounded-md text-[11.5px] font-semibold bg-violet-600 text-white disabled:bg-violet-200"
            data-testid="proto-open-proposal"
          >
            {proposal ? "왼쪽에서 보는 중" : "정돈 제안 보기"}
          </button>
        </div>
      )}

      <Sec title="AI 가 이해한 뼈대">
        <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
          {SCAFFOLD.map((n, i) => {
            const keys = [n.key, ...(n.children?.map((c) => c.key) ?? [])];
            const mine = keys.reduce((a, k) => a + (cov.mine[k]?.length ?? 0), 0);
            const via = keys.some((k) => cov.via[k]);
            const gaps = keys.filter((k) => miss.includes(k)).length;
            return (
              <button key={n.key} type="button" onClick={() => accepted && focusKey(n.key)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50">
                <span className="w-4 text-[11px] text-slate-400 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-[12px] text-slate-800">{n.title}</span>
                {mine > 0 && <span className="text-[10.5px] text-slate-500">내 말 {mine}</span>}
                {via && <span className="text-[10.5px] text-slate-400">그대로</span>}
                {gaps > 0 && <span className="text-[10.5px] font-semibold text-amber-700">빠짐 {gaps}</span>}
              </button>
            );
          })}
          {cov.unsorted.length > 0 && <div className="px-2.5 py-1.5 text-[11px] text-amber-700">어디에도 안 맞는 메모 {cov.unsorted.length}줄 — 정돈할 때 맨 아래로 모아요</div>}
        </div>
      </Sec>

      {miss.length > 0 && (
        <Sec title={`빠진 것 ${miss.length}`} testId="proto-missing">
          {miss.map((k) => (
            <div key={k} className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5">
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-slate-800">{MISSING_HINT[k].what}</span>
                <span className="block text-[10.5px] text-slate-500 truncate">{nodeLabel(k)}</span>
              </span>
              <button type="button" onClick={() => resolve(k)} className="shrink-0 h-6 px-2 rounded text-[11px] font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100">
                {MISSING_HINT[k].action}
              </button>
            </div>
          ))}
        </Sec>
      )}

      {!withSummary && (
        <Sec title="다른 카드사에는 있는데 없는 것">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5">
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] text-slate-800">혜택 한눈에 보기 쪽</span>
              <span className="block text-[10.5px] text-slate-500">KB · 삼성 · 현대 · ALL Infinite 에 있음 (우리 PAY · CBS 에는 없음)</span>
            </span>
            <button type="button" onClick={addSummary} className="shrink-0 h-6 px-2 rounded text-[11px] font-semibold border border-slate-300 hover:bg-slate-50" data-testid="proto-add-summary">
              넣기
            </button>
          </div>
        </Sec>
      )}
    </>
  );
};

/* ── 고른 줄: 다른 카드사는 이 부분을 (① 의미 단위로 찾기) ── */

const Crosswalk: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const focusId = useCardProtoStore((s) => s.focusId);
  const l = lines.find((x) => x.id === focusId);
  const key = l ? lineKey(l) : undefined;
  const node = key ? findNode(key) : undefined;
  if (!node)
    return (
      <Sec title="다른 카드사는 이 부분을">
        <p className="text-[11.5px] text-slate-400 leading-5">왼쪽에서 줄을 고르면, 같은 내용을 다른 카드사 안내장 7곳은 어디에 어떤 이름으로 두는지 보여 줘요. 이름이 달라도 같은 뜻으로 찾아요.</p>
      </Sec>
    );
  const u = node.unit;
  return (
    <Sec title={<>다른 카드사는 이 부분을 · <span className="text-slate-800">{UNITS[u].name}</span></>} testId="proto-crosswalk">
      <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
        {COMPANIES.map((c) => {
          const v = CROSSWALK[u][c.id];
          return (
            <div key={c.id} className={`px-2.5 py-1.5 ${c.mine ? "bg-slate-50" : ""}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11.5px] font-semibold text-slate-800 truncate">{c.name}</span>
                <span className="text-[10px] text-slate-400 truncate">{c.form}</span>
              </div>
              <div className={`text-[11.5px] leading-4 ${v ? "text-slate-600" : "text-slate-300"}`}>{v ?? "없음"}</div>
            </div>
          );
        })}
      </div>
      {UNITS[u].legal && <p className="text-[10.5px] text-slate-400">여러 안내장에 거의 같은 글로 나오는 곳 — 법정 문구 여부는 준법 확인이 필요해요.</p>}
    </Sec>
  );
};

/* ── Phase 2 ── */

const LayoutPick: React.FC = () => {
  const layout = useCardProtoStore((s) => s.layout);
  const setLayout = useCardProtoStore((s) => s.setLayout);
  return (
    <Sec title="판형 — 뼈대는 그대로, 쪽에 놓는 방법만 바뀌어요">
      {LAYOUTS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLayout(l.id)}
          aria-pressed={layout === l.id}
          className={`text-left rounded-md border px-2.5 py-2 ${layout === l.id ? "border-[var(--fig-brand)] bg-[var(--fig-brand)]/[0.06]" : "border-slate-200 hover:bg-slate-50"}`}
          data-testid={`proto-layout-${l.id}`}
        >
          <span className="block text-[12.5px] font-semibold text-slate-800">{l.name}</span>
          <span className="block text-[11px] text-slate-500">{l.like}</span>
        </button>
      ))}
    </Sec>
  );
};

/* ── Phase 3 ── */

const Review: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const filled = useCardProtoStore((s) => s.filled);
  const reviewed = useCardProtoStore((s) => s.reviewed);
  const fill = useCardProtoStore((s) => s.fill);
  const focusKey = useCardProtoStore((s) => s.focusKey);
  const keys = presentKeys(lines).filter((k) => FILLS[k] && !reviewed[k]);
  const risk = keys.filter((k) => FILLS[k].state === "nocite" || FILLS[k].state === "changed");
  const unseen = keys.filter((k) => FILLS[k].state === "draft");

  if (!filled)
    return (
      <Sec title="채우기">
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 flex flex-col gap-1.5">
          <p className="text-[12px] text-slate-800 leading-5">물린 리소스로 칸을 채울게요. 공통 · 법정 문구는 작년 안내장 그대로, 숫자는 혜택 정의서에서 가져와요.</p>
          <ul className="text-[11px] text-slate-500 leading-5">
            <li>· 신상품 기획안_카드의정석2 PAY.pdf</li>
            <li>· 혜택 정의서 v3 (할인율 · 한도 · 가맹점).xlsx</li>
            <li>· 연회비 · 제휴 계약 요약.docx</li>
          </ul>
          <button type="button" onClick={fill} className="self-start h-7 px-2.5 rounded-md text-[11.5px] font-semibold bg-violet-600 text-white" data-testid="proto-fill">
            채우기
          </button>
        </div>
      </Sec>
    );

  const Item: React.FC<{ k: string; tone: "risk" | "unseen" }> = ({ k, tone }) => (
    <button
      type="button"
      onClick={() => focusKey(k)}
      className={`w-full text-left rounded-md px-2.5 py-1.5 border ${tone === "risk" ? "border-rose-200 bg-rose-50 hover:bg-rose-100" : "border-slate-200 hover:bg-slate-50"}`}
    >
      <span className="block text-[12px] text-slate-800 truncate">{nodeLabel(k)}</span>
      {tone === "risk" && <span className="block text-[11px] text-rose-700 leading-4">{FILLS[k].why}</span>}
    </button>
  );

  return (
    <>
      <Sec title={<span className="flex items-center gap-1 text-rose-700"><AlertTriangle className="w-3 h-3" />위험한 곳 {risk.length}</span>} testId="proto-risk">
        {risk.length ? risk.map((k) => <Item key={k} k={k} tone="risk" />) : <p className="text-[11.5px] text-slate-400">없어요</p>}
      </Sec>
      <Sec title={<span className="flex items-center gap-1"><Eye className="w-3 h-3" />안 본 곳 {unseen.length}</span>}>
        {unseen.length ? unseen.map((k) => <Item key={k} k={k} tone="unseen" />) : <p className="text-[11.5px] text-slate-400">다 봤어요</p>}
      </Sec>
      <Sec title="근거로 쓴 것">
        <p className="text-[11px] text-slate-500 leading-5 flex gap-1">
          <FileText className="w-3 h-3 mt-1 shrink-0" />
          레퍼런스 그대로인 곳(회색)은 조용히 두고, 위 두 가지만 봐요. 칸마다 근거는 본문에 붙어 있어요.
        </p>
      </Sec>
    </>
  );
};
