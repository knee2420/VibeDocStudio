import React from "react";

import { BRANDS, type Block, type Fill, type Page } from "./data";
import { useMock, view } from "./store";

/**
 * A4 한 장 (794 × 1123, 96dpi). 같은 쪽을 단계마다 다르게 그린다.
 *  wire  — ② 서식: 블록 자리만 (이름 · 종류)
 *  edit  — ③ 채우기: 실제 내용 + 손댈 곳 표시, 누르면 고름
 *  print — ④ 검토 · 출력: 인쇄될 모습 그대로 (흑백 · 재단선 미리보기)
 * 출력물 규칙 (피드백 반영): 브랜드 색 하나 + 옅은 색 하나, 숫자 열은 오른쪽 정렬 · 고정폭 숫자, 정렬 기준선은 왼쪽 하나.
 */
export type A4Mode = "wire" | "edit" | "print";

export const A4_W = 794;
export const A4_H = 1123;

export const A4Page: React.FC<{ page: Page; total: number; mode: A4Mode; scale?: number; onPick?: (blockId: string) => void }> = ({ page, total, mode, scale = 1, onPick }) => {
  const brandId = useMock((s) => s.brand);
  const fixes = useMock((s) => s.fixes);
  const fills = useMock((s) => s.fills);
  const sel = useMock((s) => s.block);
  const mono = useMock((s) => s.mono);
  const bleed = useMock((s) => s.bleed);
  const launch = useMock((s) => s.launchFound);
  const brand = BRANDS.find((b) => b.id === brandId) ?? BRANDS[0];
  const vars = { "--b": brand.main, "--bs": brand.soft, "--bi": brand.ink } as React.CSSProperties;

  return (
    <div style={{ width: A4_W * scale, height: A4_H * scale }} className="relative shrink-0">
      <div
        style={{ ...vars, width: A4_W, height: A4_H, transform: `scale(${scale})`, transformOrigin: "top left", filter: mode === "print" && mono ? "grayscale(1)" : undefined }}
        className="absolute left-0 top-0 bg-white text-[#1f1f22] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_30px_rgba(20,20,40,0.10)] flex flex-col"
        data-a4={page.id}
      >
        {mode === "print" && bleed && <CropMarks />}
        {/* 머리 — 브랜드 띠 */}
        <div className="h-[6px] w-full" style={{ background: "var(--b)" }} />
        <header className="px-[56px] pt-[22px] pb-[10px] flex items-center justify-between text-[11px] tracking-[0.02em] text-[#6b6b72]">
          <span className="font-semibold" style={{ color: "var(--bi)" }}>
            CLAUDE CARD <span className="font-normal text-[#9a9aa2]">· 클로드 카드 2030 상품안내장</span>
          </span>
          <span className="tabular-nums">{String(page.no).padStart(2, "0")}</span>
        </header>
        <main className="flex-1 px-[56px] pt-[14px] pb-[20px] flex flex-col gap-[18px] overflow-hidden">
          {page.blocks.map((raw) => {
            const b = view(raw, fixes);
            const f = fills[b.id];
            return (
              <BlockView
                key={b.id}
                b={b}
                fill={f}
                mode={mode}
                selected={sel === b.id}
                launch={launch}
                onPick={onPick ? () => onPick(b.id) : undefined}
              />
            );
          })}
        </main>
        <footer className="px-[56px] pb-[22px] pt-[10px] flex items-center justify-between text-[10.5px] text-[#8a8a92] border-t border-[#efeff2] mx-[56px] !px-0">
          <span>클로드 카드 고객센터 1600-2030 · claudecard.example</span>
          <span className="tabular-nums">
            {page.no} / {total}
          </span>
        </footer>
      </div>
    </div>
  );
};

const CropMarks: React.FC = () => {
  const m = "absolute w-[18px] h-[18px] border-[#111]";
  return (
    <>
      <span className={`${m} -left-[22px] -top-[22px] border-r border-b`} />
      <span className={`${m} -right-[22px] -top-[22px] border-l border-b`} />
      <span className={`${m} -left-[22px] -bottom-[22px] border-r border-t`} />
      <span className={`${m} -right-[22px] -bottom-[22px] border-l border-t`} />
      <span className="absolute inset-[-11px] border border-dashed border-[#e8603c]/50 pointer-events-none" title="도련 3mm" />
    </>
  );
};

const KIND_NAME: Record<Block["kind"], string> = { hero: "표지 히어로", heading: "제목", text: "본문", callout: "안내 상자", cards: "카드 3단", table: "표" };

const BlockView: React.FC<{ b: Block; fill: Fill; mode: A4Mode; selected: boolean; launch: boolean; onPick?: () => void }> = ({ b, fill, mode, selected, launch, onPick }) => {
  // ② 서식: 와이어프레임
  if (mode === "wire")
    return (
      <div
        onClick={onPick}
        className={`rounded-[6px] border-2 border-dashed px-4 flex items-center justify-between cursor-pointer ${selected ? "border-[var(--b)] bg-[var(--bs)]" : "border-[#d9d9e0] hover:border-[#b9b9c4]"}`}
        style={{ height: wireHeight(b) }}
      >
        <span className="text-[13px] font-semibold text-[#3a3a42]">{b.label}</span>
        <span className="text-[11px] text-[#8a8a92]">{KIND_NAME[b.kind]}</span>
      </div>
    );

  // ③ 채우기 · ④ 출력
  const mark =
    mode === "edit"
      ? fill === "risk"
        ? "outline outline-2 outline-[#e11d48] outline-offset-4 rounded-[4px]"
        : fill === "draft"
          ? "outline outline-2 outline-dashed outline-[#7c3aed]/60 outline-offset-4 rounded-[4px]"
          : selected
            ? "outline outline-2 outline-[#0d99ff] outline-offset-4 rounded-[4px]"
            : "hover:outline hover:outline-1 hover:outline-[#c8c8d2] hover:outline-offset-4 rounded-[4px]"
      : "";
  return (
    <div onClick={onPick} className={`relative ${mode === "edit" ? "cursor-pointer" : ""} ${mark} ${selected && fill !== "ok" ? "ring-2 ring-[#0d99ff] ring-offset-[6px]" : ""}`} data-block={b.id}>
      {mode === "edit" && fill !== "ok" && fill !== "ref" && (
        <span className={`absolute -top-[14px] right-0 text-[10px] font-bold px-1.5 rounded ${fill === "risk" ? "bg-[#e11d48] text-white" : "bg-[#ede9fe] text-[#6d28d9]"}`}>
          {fill === "risk" ? "위험" : "AI 초안 · 안 봄"}
        </span>
      )}
      <Content b={b} launch={launch} />
    </div>
  );
};

function wireHeight(b: Block): number {
  if (b.kind === "hero") return 360;
  if (b.kind === "heading") return 40;
  if (b.kind === "table") return 34 * b.rows.length;
  if (b.kind === "cards") return 104;
  if (b.kind === "callout") return 58;
  return 64;
}

const Content: React.FC<{ b: Block; launch: boolean }> = ({ b, launch }) => {
  switch (b.kind) {
    case "hero":
      return (
        <div className="h-[360px] rounded-[10px] p-[40px] flex flex-col justify-end relative overflow-hidden" style={{ background: "linear-gradient(135deg, var(--bi) 0%, var(--bi) 45%, var(--b) 140%)" }}>
          {/* 카드 플레이트 */}
          <div className="absolute right-[44px] top-[48px] w-[236px] h-[148px] rounded-[14px] rotate-[-8deg] shadow-[0_18px_40px_rgba(0,0,0,0.35)] p-4 flex flex-col justify-between" style={{ background: "linear-gradient(145deg, var(--b), #ffb38f)" }}>
            <span className="text-white/90 text-[12px] font-bold tracking-[0.12em]">CLAUDE CARD</span>
            <span className="w-9 h-7 rounded-[5px] bg-white/50" />
            <span className="text-white text-[22px] font-black tracking-tight">2030</span>
          </div>
          <div className="text-white text-[44px] font-extrabold leading-[1.1] tracking-[-0.02em]">{b.title}</div>
          <div className="text-white/80 text-[17px] mt-3">{b.sub}</div>
        </div>
      );
    case "heading":
      return (
        <h2 className="text-[22px] font-extrabold tracking-[-0.01em] flex items-center gap-2.5" style={{ color: "var(--bi)" }}>
          <span className="w-[5px] h-[22px] rounded-full" style={{ background: "var(--b)" }} />
          {b.text}
        </h2>
      );
    case "text":
      return <p className="text-[14px] leading-[1.75] text-[#3a3a42]">{b.id === "p8-change" && !launch ? b.text.replace("출시일 2027년 3월 2일. ", "출시일 ○○○○. ") : b.text}</p>;
    case "callout":
      return (
        <div className="rounded-[8px] px-5 py-3.5 text-[13.5px] leading-[1.65]" style={{ background: b.tone === "warn" ? "#fff6e8" : "var(--bs)", color: "#2c2c33" }}>
          <b className="mr-2" style={{ color: b.tone === "warn" ? "#b45309" : "var(--b)" }}>
            {b.label}
          </b>
          {b.text}
        </div>
      );
    case "cards":
      return (
        <div className="grid grid-cols-3 gap-3">
          {b.items.map((it) => (
            <div key={it.title} className="rounded-[8px] border border-[#ececf1] px-4 py-3.5">
              <div className="text-[16px] font-extrabold tracking-[-0.01em]" style={{ color: "var(--b)" }}>
                {it.title}
              </div>
              <div className="text-[12.5px] text-[#55555e] mt-1 leading-[1.55]">{it.body}</div>
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className={i === 0 ? "" : "border-t border-[#ececf1]"} style={i === 0 ? { background: "var(--bs)" } : undefined}>
                {r.map((c, j) => {
                  const num = b.numeric?.includes(j);
                  const last = i === b.rows.length - 1 && /합계|다음 달/.test(r[0]);
                  return (
                    <td
                      key={j}
                      className={`px-3 py-2 ${num ? "text-right tabular-nums" : ""} ${i === 0 ? "font-bold text-[12px]" : ""} ${last ? "font-extrabold" : ""}`}
                      style={i === 0 ? { color: "var(--bi)" } : undefined}
                    >
                      {c}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
};
