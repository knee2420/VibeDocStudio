import React from "react";
import { Image as ImageIcon, Sparkles } from "lucide-react";

import type { SkNode, SkSlot } from "../../model/skeleton";
import { useSkeletonStore, type Phase } from "../../model/useSkeletonStore";

const td = "border border-black/60 px-1.5 py-1 align-middle";
const th = `${td} bg-[#f2f2f2] font-medium whitespace-nowrap`;

const Val: React.FC<{ s: SkSlot }> = ({ s }) =>
  s.value ? (
    <span className={s.value.includes("(AI)") || s.value.includes("초안 (AI)") ? "text-[#7a3bd6]" : ""}>{s.value}</span>
  ) : (
    <span className="text-black/25">{s.filledBy === "agency" ? "기관" : s.filledBy === "approver" ? "결재" : ""}</span>
  );

/** 서식 부품 그리기 (Phase 2 · 3) */
const Part: React.FC<{ b: SkNode }> = ({ b }) => {
  const slots = b.slots ?? [];
  switch (b.part) {
    case "title":
      return <h2 className="text-center text-[17px] font-bold tracking-[0.3em]">{slots[0]?.value || b.name}</h2>;
    case "text":
      return slots[0]?.value ? (
        <p className="text-[11.5px] leading-[19px]"><Val s={slots[0]} /></p>
      ) : (
        <div className="space-y-1.5 py-1">
          {[100, 96, 70].map((w, i) => (
            <div key={i} className="h-2 rounded bg-black/[0.08]" style={{ width: `${w}%` }} />
          ))}
        </div>
      );
    case "meta":
      return (
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            {Array.from({ length: Math.ceil(slots.length / 2) }, (_, r) => (
              <tr key={r}>
                {slots.slice(r * 2, r * 2 + 2).map((s) => (
                  <React.Fragment key={s.key}>
                    <td className={`${th} w-[18%]`}>{s.label}</td>
                    <td className={`${td} w-[32%]`}><Val s={s} /></td>
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "repeat":
    case "list":
      return (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {b.part === "list" && <th className={`${th} w-8`}>번호</th>}
              {slots.map((s) => (
                <th key={s.key} className={th}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: b.rows ?? 1 }, (_, r) => (
              <tr key={r}>
                {b.part === "list" && <td className={`${td} text-center`}>{r + 1}</td>}
                {slots.map((s) => (
                  <td key={s.key} className={td}>{r === 0 ? <Val s={s} /> : <span className="inline-block h-3" />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "sign":
      return (
        <div className="text-[11px] text-right space-y-1 pr-4">
          {slots.map((s) =>
            s.type === "sign" ? (
              <div key={s.key}>{s.label} : ____________ (서명 또는 인)</div>
            ) : (
              <div key={s.key}>{s.label} : {s.value ? <Val s={s} /> : "20    년    월    일"}</div>
            ),
          )}
        </div>
      );
    case "approval":
      return (
        <table className="ml-auto border-collapse text-[11px]">
          <tbody>
            <tr>
              <td rowSpan={2} className={`${th} w-6 leading-[13px] text-center`}>결<br />재</td>
              {slots.map((s) => (
                <td key={s.key} className={`${th} text-center w-14`}>{s.label}</td>
              ))}
            </tr>
            <tr>
              {slots.map((s) => (
                <td key={s.key} className={`${td} h-10`} />
              ))}
            </tr>
          </tbody>
        </table>
      );
    case "image":
      return (
        <div className="h-24 rounded bg-black/[0.04] border border-dashed border-black/15 flex items-center justify-center text-[11px] text-black/40">
          <ImageIcon className="w-4 h-4 mr-1" />{slots.find((s) => s.type !== "image")?.value || "이미지"}
        </div>
      );
    case "notice":
      return <div className="text-[10px] text-black/55">※ {b.name} (고정 글 — AI 에게 규칙으로)</div>;
    default:
      return null;
  }
};

const Block: React.FC<{ b: SkNode; phase: Phase }> = ({ b, phase }) => {
  const selected = useSkeletonStore((s) => s.selected.includes(b.id));
  const select = useSkeletonStore((s) => s.select);
  return (
    <div
      data-sk={b.id}
      onClick={(e) => {
        e.stopPropagation();
        select(b.id);
      }}
      className={`relative rounded-sm p-1 -m-1 ${b.ghost ? "outline outline-1 outline-dashed outline-[#9747ff]/60 bg-[#9747ff]/[0.03]" : ""} ${selected ? "outline outline-2 outline-[var(--fig-brand)]" : "hover:outline hover:outline-1 hover:outline-[var(--fig-brand)]/40"}`}
    >
      {b.ghost && (
        <span className="absolute -top-2 right-1 px-1 rounded bg-[#9747ff] text-white text-[9px] inline-flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" />AI 제안 · {b.name}
        </span>
      )}
      {phase === 1 ? null : <Part b={b} />}
    </div>
  );
};

const Section: React.FC<{ n: SkNode; phase: Phase; num: string; depth: number }> = ({ n, phase, num, depth }) => {
  const selected = useSkeletonStore((s) => s.selected.includes(n.id));
  const select = useSkeletonStore((s) => s.select);
  const blocks = n.children.filter((c) => c.kind === "block");
  let k = 0;
  return (
    <section
      data-sk={n.id}
      onClick={(e) => {
        e.stopPropagation();
        select(n.id);
      }}
      className={`relative rounded-md transition-colors ${
        phase === 1
          ? `border ${n.ghost ? "border-dashed border-[#9747ff]/60 bg-[#9747ff]/[0.04]" : "border-black/10 bg-[#f6f7f9]"} p-3`
          : n.ghost
            ? "outline outline-1 outline-dashed outline-[#9747ff]/60 p-1"
            : "p-1"
      } ${selected ? "ring-2 ring-[var(--fig-brand)]" : ""}`}
      style={{ marginLeft: depth * 14 }}
    >
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className="text-[10px] tabular-nums text-black/35">{num}</span>
        <span className={`font-semibold ${depth ? "text-[12px]" : "text-[13px]"} ${n.name ? "" : "italic text-black/30"}`}>{n.name || "이름 없는 섹션"}</span>
        {n.ghost && <span className="text-[9.5px] text-[#7a3bd6] inline-flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />AI 제안</span>}
      </div>
      {phase === 1 && (
        <>
          <p className={`text-[11px] ${n.intent ? "text-black/55" : "text-black/25 italic"}`}>{n.intent || "의도가 아직 없습니다"}</p>
          {blocks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {blocks.map((b) => (
                <span key={b.id} className="h-5 px-1.5 rounded bg-white border border-black/10 text-[10px] text-black/50 inline-flex items-center">{b.name}</span>
              ))}
            </div>
          )}
        </>
      )}
      {phase >= 2 && blocks.length === 0 && n.children.length === 0 && (
        <div className="h-10 rounded border border-dashed border-[#e8a33d]/60 bg-[#fff8eb] text-[10.5px] text-[#b26b00] flex items-center justify-center">서식 없음 — 왼쪽 ⋯ → 서식 꽂기</div>
      )}
      <div className="space-y-3">
        {n.children.map((c) => {
          if (c.kind === "block") return <Block key={c.id} b={c} phase={phase} />;
          k += 1;
          return <Section key={c.id} n={c} phase={phase} num={`${num}.${k}`} depth={1} />;
        })}
      </div>
    </section>
  );
};

/** O7 캔버스 — 아웃라인 데이터로 그린다 (트리에서 옮기면 여기서도 옮겨진다) */
export const SkeletonCanvas: React.FC = () => {
  const doc = useSkeletonStore((s) => s.docs[s.docId]);
  const phase = useSkeletonStore((s) => s.phase);
  const clear = useSkeletonStore((s) => s.clearSelect);
  let k = 0;
  return (
    <div className="flex flex-col items-center gap-6" data-testid="sk-canvas" onClick={() => clear()}>
      <div className="bg-white shadow-sm border border-black/5 w-full max-w-[794px] min-h-[1000px] p-[6%] text-black">
        <div className="flex items-center gap-2 text-[10.5px] text-black/40 mb-3">
          <span>{doc.origin === "import" ? "가져온 서식" : "새 문서"}</span>
          <span>·</span>
          <span>{phase === 1 ? "Phase 1 뼈대 — 와이어프레임" : phase === 2 ? "Phase 2 서식" : "Phase 3 내용"}</span>
          {doc.purpose && <span className="truncate">· 목적: {doc.purpose}</span>}
        </div>
        {doc.nodes.length === 0 ? (
          <div className="h-[600px] rounded-lg border-2 border-dashed border-black/10 flex flex-col items-center justify-center text-[12px] text-black/35 gap-1">
            <span>빈 뼈대</span>
            <span>왼쪽에서 섹션을 추가하거나 AI 목차 제안을 누르세요</span>
          </div>
        ) : (
          <div className={phase === 1 ? "space-y-2" : "space-y-5"}>
            {doc.nodes.map((n) => {
              if (n.kind === "block") return <Block key={n.id} b={n} phase={phase} />;
              if (!n.ghost) k += 1;
              return <Section key={n.id} n={n} phase={phase} num={n.ghost ? "" : String(k)} depth={0} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
};
