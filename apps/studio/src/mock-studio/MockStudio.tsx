import React from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";

import { GAPS } from "./data";
import { PhaseDesign } from "./PhaseDesign";
import { PhasePlan } from "./PhasePlan";
import { PhaseShip, shipChecks } from "./PhaseShip";
import { PhaseWrite } from "./PhaseWrite";
import { livePages, tally, useMock, type Phase } from "./store";

/**
 * 목업 스튜디오 — 클로드 카드 2030 상품안내장을 한 사이클(① 뼈대 → ② 서식 → ③ 채우기 → ④ 검토 · 출력)로 만든다.
 * 백엔드 없이 돈다 (`?mock=1`). 단계마다 화면 판 자체가 바뀐다 — 같은 아웃라인을 다른 작업대에 올린다.
 *
 * 화면 원칙
 *  - Z: 왼쪽 위 = 지금 어디(프로젝트 · 단계 진행), 오른쪽 아래 = 다음 할 일 하나
 *  - 넛지: 단계마다 손이 갈 곳 하나만 앞에. 나머지는 지우지 않고 뒤로
 *  - 책상 위의 판: 칸들은 바탕 위에 떠 있는 판 — 무엇이 작업대이고 무엇이 도구인지 모양으로 갈린다
 */

const STEPS: { id: Phase; name: string; desk: string }[] = [
  { id: 1, name: "뼈대", desk: "메모 · 레퍼런스 책상" },
  { id: 2, name: "서식", desk: "쪽 · 블록 · 브랜드" },
  { id: 3, name: "채우기", desk: "할 일 · AI 동료 · 근거" },
  { id: 4, name: "검토 · 출력", desk: "펼침 · 체크 · 인쇄" },
];

export const MockStudio: React.FC = () => {
  const phase = useMock((s) => s.phase);
  const toast = useMock((s) => s.toast);
  return (
    <div className="h-screen w-screen flex flex-col bg-[#f2f0ec] text-[#1c1b1a] overflow-hidden select-none" style={{ fontFamily: '"Pretendard", "Inter", system-ui, sans-serif' }} data-testid="mock-studio">
      <TopBar />
      <div className="flex-1 min-h-0 relative">
        {phase === 1 && <PhasePlan />}
        {phase === 2 && <PhaseDesign />}
        {phase === 3 && <PhaseWrite />}
        {phase === 4 && <PhaseShip />}
        <NextStep />
      </div>
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[100] px-4 h-10 rounded-full bg-[#1c1b1a] text-white text-[13px] flex items-center shadow-xl" data-testid="mock-toast">
          {toast}
        </div>
      )}
    </div>
  );
};

/* ── 머리: 왼쪽 프로젝트 · 가운데 사이클 진행 · 오른쪽 공용 행동 ── */

const TopBar: React.FC = () => {
  const s = useMock();
  const t = tally(s.fills, s.pageOn);
  const checks = shipChecks(s);
  const status: Record<Phase, string> = {
    1: s.tidied ? `${livePages(s.pageOn).length}쪽 뼈대` : `메모 ${s.notes.filter((n) => n.text.trim()).length}줄`,
    2: s.phase > 2 ? "A4 · 브랜드 정함" : "판형 · 브랜드",
    3: t.risk ? `위험 ${t.risk} · 안 봄 ${t.draft}` : t.draft ? `안 봄 ${t.draft}` : "다 봄",
    4: `체크 ${checks.filter((c) => c.ok).length}/${checks.length}`,
  };
  const done = (p: Phase) => (p === 1 ? s.tidied : p === 2 ? s.phase > 2 : p === 3 ? t.risk + t.draft === 0 : s.exported);
  return (
    <header className="h-[60px] shrink-0 px-4 flex items-center gap-4 bg-[#fbfaf8] border-b border-[#e6e2db]">
      <div className="flex items-center gap-2.5 w-[300px] shrink-0 min-w-0">
        <span className="w-8 h-8 rounded-[9px] grid place-items-center text-white text-[13px] font-black" style={{ background: "#e8603c" }}>
          C
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold truncate">클로드 카드 2030 출시</div>
          <div className="text-[11.5px] text-[#8b857c] truncate">상품안내장 · A4 {livePages(s.pageOn).length}쪽</div>
        </div>
      </div>

      <nav className="flex-1 flex items-center justify-center" aria-label="사이클" data-testid="mock-steps">
        {STEPS.map((st, i) => {
          const active = s.phase === st.id;
          const ok = done(st.id);
          return (
            <React.Fragment key={st.id}>
              {i > 0 && <span className={`w-10 h-[2px] mx-1 rounded ${s.phase > i ? "bg-[#1c1b1a]" : "bg-[#ddd8cf]"}`} />}
              <button
                type="button"
                onClick={() => (st.id > 1 && !s.tidied ? s.say("① 뼈대에서 AI 정돈 제안을 먼저 받아 주세요") : s.setPhase(st.id))}
                className={`h-11 pl-2 pr-3.5 rounded-[12px] flex items-center gap-2.5 transition ${active ? "bg-[#1c1b1a] text-white shadow-md" : "hover:bg-[#efebe4]"}`}
                data-testid={`mock-step-${st.id}`}
              >
                <span className={`w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold ${active ? "bg-white text-[#1c1b1a]" : ok ? "bg-[#1c1b1a] text-white" : "bg-[#e6e2db] text-[#6f695f]"}`}>
                  {ok && !active ? <Check className="w-3.5 h-3.5" /> : st.id}
                </span>
                <span className="text-left">
                  <span className="block text-[13px] font-bold leading-4">{st.name}</span>
                  <span className={`block text-[11px] leading-4 ${active ? "text-white/70" : "text-[#8b857c]"}`}>{active ? st.desk : status[st.id]}</span>
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="w-[300px] shrink-0 flex items-center justify-end gap-2">
        <button type="button" onClick={s.reset} className="h-9 px-3 rounded-[10px] text-[12.5px] text-[#6f695f] hover:bg-[#efebe4] flex items-center gap-1.5" title="처음 메모 상태로">
          <RotateCcw className="w-3.5 h-3.5" />
          처음부터
        </button>
        <span className="flex -space-x-2">
          {["서", "AI"].map((n, i) => (
            <span key={n} className={`w-8 h-8 rounded-full border-2 border-[#fbfaf8] grid place-items-center text-[11px] font-bold ${i ? "bg-[#ede9fe] text-[#6d28d9]" : "bg-[#fde3d9] text-[#b4411f]"}`} title={i ? "AI 동료" : "나 (상품팀)"}>
              {n}
            </span>
          ))}
        </span>
      </div>
    </header>
  );
};

/* ── 다음 할 일 하나 (가운데 작업대 오른쪽 아래) ── */

/** 단계마다 오른쪽 칸 너비 + 여백 — 그 왼쪽(작업대)에 붙인다 */
const RIGHT_OFFSET: Record<Phase, number> = { 1: 28, 2: 320 + 40, 3: 340 + 40, 4: 340 + 40 };

const NextStep: React.FC = () => {
  const s = useMock();
  const t = tally(s.fills, s.pageOn);
  let label = "";
  let sub = "";
  let tone = "bg-[#1c1b1a]";
  let run = () => {};

  if (s.phase === 1) {
    const gaps = GAPS.filter((g) => (g.page === "p2" ? !s.pageOn.p2 : !s.launchFound)).length;
    if (!s.tidied) {
      label = s.proposalOpen ? "왼쪽 제안을 받아 주세요" : "AI 정돈 제안 보기";
      sub = "메모는 그대로 — 뼈대는 제안으로 와요";
      tone = "bg-[#6d28d9]";
      run = () => s.openProposal(true);
    } else if (gaps) {
      label = `빠진 것 ${gaps}개 확인`;
      sub = "AI 가 메모만으로 못 채운 곳";
      tone = "bg-[#d97706]";
      run = () => (!s.pageOn.p2 ? s.acceptSummary() : s.acceptLaunch());
    } else {
      label = "기획안 확정 · ② 서식으로";
      sub = `${livePages(s.pageOn).length}쪽 뼈대를 그대로 가져가요`;
      run = () => s.setPhase(2);
    }
  } else if (s.phase === 2) {
    label = "③ 채우기로";
    sub = "기획안 · 혜택 정의서로 AI 가 채워 둔 초안을 봐요";
    run = () => s.setPhase(3);
  } else if (s.phase === 3) {
    const pages = livePages(s.pageOn);
    const find = (f: string) => {
      for (const p of pages) for (const b of p.blocks) if (s.fills[b.id] === f) return { p, b };
      return null;
    };
    const risk = find("risk");
    const draft = find("draft");
    const next = risk ?? draft;
    if (next) {
      label = `${risk ? "위험한 곳" : "안 본 곳"} · ${next.p.no}쪽 ${next.b.label}`;
      sub = risk ? "근거와 다른 숫자 · 문구" : `남은 곳 ${t.risk + t.draft}`;
      tone = risk ? "bg-[#e11d48]" : "bg-[#6d28d9]";
      run = () => s.goPage(next.p.id, next.b.id);
    } else {
      label = "④ 검토 · 출력으로";
      sub = "모든 칸을 봤어요";
      run = () => s.setPhase(4);
    }
  } else {
    const checks = shipChecks(s);
    const bad = checks.find((c) => !c.ok);
    if (bad) {
      label = bad.fixLabel;
      sub = bad.name;
      tone = "bg-[#d97706]";
      run = bad.fix;
    } else if (!s.exported) {
      label = "PDF 내보내기";
      sub = `A4 ${livePages(s.pageOn).length}쪽 · 도련 ${s.bleed ? "3mm" : "없음"}`;
      tone = "bg-[#e8603c]";
      run = s.exportPdf;
    } else {
      label = "준법 심의 요청 보내기";
      sub = "심의필 번호를 받으면 8쪽에 넣어요";
      run = () => s.say("심의 요청을 보냈어요 (목업)");
    }
  }

  return (
    // 오른쪽 칸(서랍 · AI 동료 · 체크리스트)을 가리지 않게 가운데 작업대의 오른쪽 아래에 둔다
    <button type="button" onClick={run} style={{ right: RIGHT_OFFSET[s.phase] }} className={`absolute bottom-6 z-50 max-w-[360px] rounded-[16px] shadow-[0_12px_30px_rgba(0,0,0,0.18)] px-5 py-3 text-left text-white flex items-center gap-4 hover:brightness-110 ${tone}`} data-testid="mock-next">
      <span className="min-w-0">
        <span className="block text-[14px] font-bold truncate">{label}</span>
        <span className="block text-[11.5px] opacity-80 truncate">{sub}</span>
      </span>
      <ArrowRight className="w-4 h-4 shrink-0" />
    </button>
  );
};

