import React from "react";
import { Check, Circle, Download, History } from "lucide-react";

import { A4Page } from "./A4Page";
import { Panel } from "./Panel";
import { livePages, tally, useMock } from "./store";

/**
 * ④ 검토 · 출력 — 인쇄 미리보기. 쪽 하나가 아니라 문서 전체를 펼쳐 본다.
 *  가운데: 8쪽 펼침 (인쇄될 모습 · 재단선 · 흑백)
 *  오른쪽: 배포 전 체크리스트 · 인쇄 설정 · 내보내기 · 버전
 */

type S = ReturnType<typeof useMock.getState>;

export function shipChecks(s: S) {
  const t = tally(s.fills, s.pageOn);
  return [
    { name: "위험한 곳 0 — 근거와 다른 숫자 · 문구", ok: t.risk === 0, fixLabel: "③ 채우기에서 위험한 곳 보기", fix: () => s.setPhase(3) },
    { name: "안 본 곳 0 — AI 초안을 사람이 다 봄", ok: t.draft === 0, fixLabel: "③ 채우기에서 안 본 곳 보기", fix: () => s.setPhase(3) },
    { name: "출시일 기재 (부가서비스 3년 유지 기준일)", ok: s.launchFound, fixLabel: "출시일 넣기", fix: s.acceptLaunch },
    { name: "혜택 요약 쪽 — 다른 카드사 5곳에 있음", ok: !!s.pageOn.p2, fixLabel: "혜택 한눈에 넣기", fix: s.acceptSummary },
    { name: "흑백으로 봐도 읽힘 — 사내 인쇄 · 팩스", ok: s.monoSeen, fixLabel: "흑백 미리보기 켜 보기", fix: () => s.setMono(true) },
  ];
}

export const PhaseShip: React.FC = () => {
  const s = useMock();
  const pages = livePages(s.pageOn);
  const checks = shipChecks(s);
  return (
    <div className="absolute inset-0 p-3 grid grid-cols-[1fr_340px] gap-3" data-testid="mock-ship">
      <div className="min-h-0 rounded-[16px] bg-[#e8e4dd] border border-[#ddd8cf] flex flex-col">
        <div className="h-12 shrink-0 px-4 flex items-center justify-between">
          <span className="text-[13px] font-bold">
            펼침 미리보기 <span className="font-normal text-[#8b857c]">— 인쇄될 모습 그대로 · {pages.length}쪽</span>
          </span>
          <span className="text-[12px] text-[#8b857c]">{s.mono ? "흑백" : "컬러"} · 도련 {s.bleed ? "3mm (재단선 표시)" : "없음"}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-8 pb-28 pt-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-10 gap-y-10 justify-items-center">
            {pages.map((p) => (
              <button key={p.id} type="button" onClick={() => (s.goPage(p.id), s.setPhase(3))} className="flex flex-col items-center gap-2 group" title="눌러서 이 쪽 고치기">
                <A4Page page={p} total={pages.length} mode="print" scale={0.26} />
                <span className="text-[12px] text-[#6f695f] group-hover:text-[#1c1b1a]">
                  <b className="tabular-nums">{p.no}</b> · {p.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Panel title="배포 전" right={<span className="text-[11.5px] text-[#8b857c]">{checks.filter((c) => c.ok).length}/{checks.length}</span>} testId="mock-ship-panel">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
          <section className="flex flex-col gap-1.5">
            {checks.map((c) => (
              <button key={c.name} type="button" onClick={c.ok ? undefined : c.fix} className={`flex items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left ${c.ok ? "" : "hover:bg-[#fff6e8]"}`} data-testid="mock-check">
                {c.ok ? <Check className="w-4 h-4 mt-0.5 text-[#16a34a] shrink-0" /> : <Circle className="w-4 h-4 mt-0.5 text-[#d97706] shrink-0" />}
                <span className="min-w-0">
                  <span className={`block text-[13px] leading-5 ${c.ok ? "text-[#6f695f]" : "font-semibold"}`}>{c.name}</span>
                  {!c.ok && <span className="block text-[11.5px] text-[#b45309]">{c.fixLabel} →</span>}
                </span>
              </button>
            ))}
          </section>

          <section>
            <h3 className="text-[12px] font-bold text-[#6f695f] mb-2">인쇄 설정</h3>
            <div className="rounded-[12px] border border-[#e6e2db] bg-white divide-y divide-[#f0ece5]">
              <Toggle label="도련 3mm · 재단선" on={s.bleed} set={s.setBleed} />
              <Toggle label="흑백 미리보기" on={s.mono} set={s.setMono} testId="mock-mono" />
              <div className="px-3 py-2.5 flex justify-between text-[13px]">
                <span>용지</span>
                <span className="text-[#6f695f]">A4 · 210 × 297mm · {pages.length}쪽</span>
              </div>
            </div>
          </section>

          <button type="button" onClick={s.exportPdf} className="h-11 rounded-[12px] bg-[#e8603c] text-white text-[14px] font-bold flex items-center justify-center gap-2" data-testid="mock-export">
            <Download className="w-4 h-4" />
            PDF 내보내기 {s.exported && "· 다시"}
          </button>

          <section>
            <h3 className="text-[12px] font-bold text-[#6f695f] mb-2 flex items-center gap-1">
              <History className="w-3.5 h-3.5" />
              이번 사이클 버전
            </h3>
            {[
              ["1 뼈대", "메모 10줄 → 8쪽 뼈대 (AI 정돈 받음)"],
              ["2 서식", "블록 배치 · 브랜드 색 · A4 판형"],
              ["3 채우기", "기획안 · 혜택 정의서로 채움 · 위험 2 고침"],
              ["4 출력", s.exported ? "PDF 내보냄" : "아직"],
            ].map(([n, d]) => (
              <div key={n} className="flex gap-2.5 py-1.5">
                <span className="w-1.5 rounded-full bg-[#1c1b1a] shrink-0" />
                <span>
                  <span className="block text-[13px] font-semibold">{n}</span>
                  <span className="block text-[11.5px] text-[#8b857c]">{d}</span>
                </span>
              </div>
            ))}
          </section>
        </div>
      </Panel>
    </div>
  );
};

const Toggle: React.FC<{ label: string; on: boolean; set: (v: boolean) => void; testId?: string }> = ({ label, on, set, testId }) => (
  <button type="button" onClick={() => set(!on)} className="w-full px-3 py-2.5 flex items-center justify-between text-[13px]" data-testid={testId}>
    <span>{label}</span>
    <span className={`w-9 h-5 rounded-full p-0.5 transition ${on ? "bg-[#1c1b1a]" : "bg-[#ddd8cf]"}`}>
      <span className={`block w-4 h-4 rounded-full bg-white transition ${on ? "translate-x-4" : ""}`} />
    </span>
  </button>
);
