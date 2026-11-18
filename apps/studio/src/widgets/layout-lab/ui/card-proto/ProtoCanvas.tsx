import React from "react";
import { AlertTriangle, Check } from "lucide-react";

import { FILLS, findNode, MISSING_HINT, paginate, SCAFFOLD, type ScafNode } from "../../model/cardProtoData";
import { coverage, lineKey, missing, presentKeys, topKeys, useCardProtoStore } from "../../model/useCardProtoStore";

/**
 * 가운데 캔버스 — 같은 아웃라인을 단계마다 다르게 그린다.
 *  1 뼈대: AI 가 이해한 문서 모양 (장마다 내 말 · 그대로 · 빠짐)
 *  2 서식: 판형에 따라 쪽 · 면에 놓인 모습 (접지는 인쇄 순서 ≠ 읽는 순서)
 *  3 채우기: 채운 문서. 칸마다 근거, 위험한 곳은 까닭, "확인"
 */
export const ProtoCanvas: React.FC = () => {
  const phase = useCardProtoStore((s) => s.phase);
  const scrollKey = useCardProtoStore((s) => s.scrollKey);
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!scrollKey) return;
    box.current?.querySelector(`[data-key="${scrollKey.key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollKey]);
  return (
    <div ref={box} className="flex-1 min-h-0 overflow-y-auto bg-[#eef0f3]" data-testid="proto-canvas">
      <div className="py-8 pb-32 px-6 flex flex-col items-center gap-6">
        {phase === 1 && <Shape />}
        {phase === 2 && <Pages />}
        {phase === 3 && <Doc />}
      </div>
    </div>
  );
};

function useHot(key: string) {
  return useCardProtoStore((s) => {
    const l = s.lines.find((x) => x.id === s.focusId);
    return !!l && lineKey(l) === key;
  });
}

/* ── 1 뼈대: AI 가 이해한 문서 모양 ── */

const Shape: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const accepted = useCardProtoStore((s) => s.accepted);
  const resolved = useCardProtoStore((s) => s.resolved);
  const withSummary = useCardProtoStore((s) => s.withSummary);
  const cov = coverage(lines);
  const miss = missing(cov, resolved);
  const order = accepted ? topKeys(lines) : [...SCAFFOLD.map((n) => n.key)].flatMap((k) => (k === "identity" && withSummary ? [k, "summary"] : [k]));
  return (
    <>
      <div className="w-[640px] max-w-full text-[12px] text-slate-500">
        {accepted ? "정돈한 뼈대 — 아웃라인을 고치면 여기도 바뀌어요" : "AI 가 메모를 이렇게 알아들었어요 — 아직 정돈 전이라 아웃라인은 쓰신 그대로예요"}
      </div>
      {order.map((k, i) => {
        const n = findNode(k);
        if (!n) return null;
        return <ShapeCard key={k} n={n} no={i + 1} cov={cov} miss={miss} />;
      })}
      {cov.unsorted.length > 0 && (
        <div className="w-[640px] max-w-full rounded-lg border-2 border-dashed border-amber-300 bg-white px-5 py-3">
          <div className="text-[13px] font-semibold text-amber-800">어디에 넣을지 모르는 메모</div>
          {cov.unsorted.map((t) => (
            <p key={t} className="text-[12.5px] text-slate-600 mt-1">“{t}”</p>
          ))}
        </div>
      )}
    </>
  );
};

const ShapeCard: React.FC<{ n: ScafNode; no: number; cov: ReturnType<typeof coverage>; miss: string[] }> = ({ n, no, cov, miss }) => {
  const hot = useHot(n.key);
  const focusKey = useCardProtoStore((s) => s.focusKey);
  const items = n.children?.length ? n.children : [n];
  return (
    <section data-key={n.key} onClick={() => focusKey(n.key)} className={`w-[640px] max-w-full bg-white rounded-lg shadow-sm px-6 py-4 cursor-pointer ${hot ? "ring-2 ring-[var(--fig-brand)]" : ""}`}>
      <h2 className="text-[16px] font-bold text-slate-900">
        <span className="text-slate-300 mr-2 tabular-nums">{no}</span>
        {n.title}
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((c) => {
          const mine = cov.mine[c.key] ?? [];
          const via = cov.via[c.key];
          const gap = miss.includes(c.key);
          return (
            <div key={c.key} data-key={c.key} className="flex gap-3 items-start">
              {items.length > 1 && <span className="w-36 shrink-0 text-[12px] text-slate-500 pt-0.5">{c.title}</span>}
              <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                {mine.map((t) => (
                  <span key={t} className="text-[12px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">“{t}”</span>
                ))}
                {via && <span className="text-[12px] px-2 py-0.5 rounded border border-slate-200 text-slate-500">레퍼런스 그대로 — “{via}”</span>}
                {!mine.length && !via && c.ref && !gap && <span className="text-[12px] text-violet-600">작년 안내장에서</span>}
                {gap && <span className="text-[12px] px-2 py-0.5 rounded border border-dashed border-amber-400 bg-amber-50 text-amber-800">빠짐 · {MISSING_HINT[c.key]?.what}</span>}
                {!mine.length && !via && !gap && !c.ref && <span className="text-[12px] text-slate-300">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ── 2 서식: 판형 ── */

const Pages: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const layout = useCardProtoStore((s) => s.layout);
  const focusKey = useCardProtoStore((s) => s.focusKey);
  const tops = topKeys(lines);
  const pages = paginate(layout, tops);
  const order = new Map(tops.map((k, i) => [k, i + 1]));

  if (layout === "fold")
    return (
      <div className="flex flex-col gap-6 w-full items-center">
        <p className="text-[12px] text-slate-500 w-[760px] max-w-full">접는 안내장은 종이 한 장의 앞뒤예요. 인쇄 면에 놓인 자리와 읽는 순서(작은 숫자)가 달라요. 아웃라인은 늘 읽는 순서 그대로예요.</p>
        {pages.map((p) => (
          <div key={p.label} className="w-[760px] max-w-full">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">{p.label}</div>
            <div className="bg-white shadow-sm grid grid-cols-3 aspect-[2.1/1] divide-x divide-dashed divide-slate-300">
              {p.keys.map((k, i) => (
                <PageBlock key={k} k={k} read={p.read?.[i] ?? order.get(k)} onClick={() => focusKey(k)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-5 w-full max-w-[900px]">
      {pages.map((p) => (
        <div key={p.label} className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold text-slate-500">{p.label}</div>
          <div className={`bg-white shadow-sm aspect-[3/4] flex flex-col ${p.keys.length ? "" : "border-2 border-dashed border-slate-300 bg-transparent shadow-none"}`}>
            {p.keys.length ? p.keys.map((k) => <PageBlock key={k} k={k} read={order.get(k)} onClick={() => focusKey(k)} />) : <span className="m-auto text-[11px] text-slate-400 px-3 text-center">혜택 한눈에 — 뼈대에 넣으면 생겨요</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

const PageBlock: React.FC<{ k: string; read?: number; onClick: () => void }> = ({ k, read, onClick }) => {
  const hot = useHot(k);
  const n = findNode(k);
  return (
    <button type="button" data-key={k} onClick={onClick} className={`flex-1 text-left p-3 flex flex-col gap-1 ${hot ? "bg-[var(--fig-brand)]/10 ring-2 ring-inset ring-[var(--fig-brand)]" : "hover:bg-slate-50"}`}>
      <span className="flex items-center gap-1.5">
        {read !== undefined && <span className="w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] grid place-items-center shrink-0">{read}</span>}
        <span className="text-[12px] font-semibold text-slate-800 leading-4">{n?.title}</span>
      </span>
      {n?.children?.map((c) => (
        <span key={c.key} className="h-1.5 rounded bg-slate-200" style={{ width: `${55 + ((c.title.length * 7) % 40)}%` }} />
      ))}
    </button>
  );
};

/* ── 3 채우기: 채운 문서 ── */

const Doc: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const tops = topKeys(lines);
  const present = new Set(presentKeys(lines));
  return (
    <>
      {tops.map((k, i) => {
        const n = findNode(k);
        if (!n) return null;
        const kids = n.children?.filter((c) => present.has(c.key)) ?? [];
        return (
          <section key={k} data-key={k} className="w-[680px] max-w-full bg-white shadow-sm rounded-[2px] px-10 py-8 flex flex-col gap-4">
            <h2 className="text-[19px] font-bold text-slate-900">
              <span className="text-slate-300 mr-2 tabular-nums">{i + 1}</span>
              {lines.find((l) => l.key === k)?.text || n.title}
            </h2>
            {kids.length ? kids.map((c) => <Block key={c.key} k={c.key} title={lines.find((l) => l.key === c.key)?.text || c.title} />) : <Block k={k} />}
          </section>
        );
      })}
    </>
  );
};

const Block: React.FC<{ k: string; title?: string }> = ({ k, title }) => {
  const filled = useCardProtoStore((s) => s.filled);
  const reviewed = useCardProtoStore((s) => !!s.reviewed[k]);
  const review = useCardProtoStore((s) => s.review);
  const focusKey = useCardProtoStore((s) => s.focusKey);
  const hot = useHot(k);
  const f = FILLS[k];
  const risky = f && (f.state === "nocite" || f.state === "changed") && !reviewed;
  return (
    <div data-key={k} onClick={() => focusKey(k)} className={`rounded-md px-3 py-2 -mx-3 cursor-pointer ${hot ? "ring-2 ring-[var(--fig-brand)]" : ""} ${risky ? "bg-rose-50" : ""}`}>
      {title && <div className="text-[11.5px] font-semibold text-slate-400 mb-1">{title}</div>}
      {!filled || !f ? (
        <div className="h-9 rounded border-2 border-dashed border-slate-200 text-[12px] text-slate-400 grid place-items-center">{filled ? "직접 쓰는 칸" : "채우기 전"}</div>
      ) : (
        <>
          <p className={`text-[14px] leading-7 ${f.state === "copied" ? "text-slate-500" : "text-slate-800"}`}>{f.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {f.state === "copied" && <span className="text-slate-400">레퍼런스 그대로 · {f.src}</span>}
            {f.state === "draft" && <span className="text-slate-500">근거 · {f.src}</span>}
            {f.state === "wait" && <span className="text-slate-400">{f.why}</span>}
            {(f.state === "nocite" || f.state === "changed") && (
              <span className={`flex items-center gap-1 ${reviewed ? "text-slate-400" : "text-rose-700 font-semibold"}`}>
                <AlertTriangle className="w-3 h-3" />
                {f.why}
              </span>
            )}
            {(f.state === "draft" || f.state === "nocite" || f.state === "changed") &&
              (reviewed ? (
                <span className="flex items-center gap-0.5 text-emerald-700">
                  <Check className="w-3 h-3" />
                  확인함
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    review(k);
                  }}
                  className="h-5 px-1.5 rounded border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                  data-testid="proto-review"
                >
                  확인
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
};
