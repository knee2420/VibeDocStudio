import React from "react";
import { ArrowRight, RotateCcw, Send, Upload } from "lucide-react";

import { FILLS, nodeLabel } from "../../model/cardProtoData";
import { useLabStore } from "../../model/useLabStore";
import { presentKeys, useCardProtoStore } from "../../model/useCardProtoStore";
import { ProtoCanvas } from "./ProtoCanvas";
import { ProtoOutliner } from "./ProtoOutliner";
import { ProtoSide } from "./ProtoSide";

/**
 * 카드 상품안내장 시제품 — reports/사용자 되어보기 - 카드 상품안내장.md 의 순서 그대로.
 *  왼쪽: 내 아웃라인 (마구 쓰기 → AI 정돈 제안 받기)
 *  가운데: 캔버스 (뼈대 모양 → 판형 → 채운 문서)
 *  오른쪽: AI (알아들은 뼈대 · 빠진 것 · 다른 카드사 · 판형 · 검토)
 *  오른쪽 아래: 다음 할 일 하나 (Z 의 끝)
 */
export const CardProto: React.FC = () => (
  <div className="flex-1 min-h-0 flex" style={{ "--fig-brand": "#0d99ff" } as React.CSSProperties} data-testid="card-proto">
    <ProtoOutliner />
    <main className="flex-1 min-w-0 min-h-0 flex flex-col relative">
      <TopBar />
      <ProtoCanvas />
      <NextStep />
    </main>
    <ProtoSide />
  </div>
);

const TopBar: React.FC = () => {
  const reset = useCardProtoStore((s) => s.reset);
  const say = useLabStore((s) => s.say);
  return (
    <div className="fig-panel h-10 shrink-0 bg-white border-b border-[var(--fig-border)] px-3 flex items-center gap-2">
      <span className="flex-1 min-w-0 truncate text-[12px] text-slate-500">
        사용자 되어 보기 · 카드 상품안내장 — 메모 → 정돈 → 판형 → 채우고 검토
      </span>
      <button type="button" onClick={reset} className="h-7 px-2 rounded-md text-[11.5px] flex items-center gap-1 text-slate-500 hover:bg-slate-100" title="처음 메모 상태로">
        <RotateCcw className="w-3.5 h-3.5" />
        처음으로
      </button>
      <button type="button" onClick={() => say("시제품: 내보내기 (PDF · HWPX)")} className="h-7 px-2.5 rounded-md text-[11.5px] flex items-center gap-1 border border-slate-200 text-slate-700 hover:bg-slate-50">
        <Upload className="w-3.5 h-3.5" />
        내보내기
      </button>
      <button type="button" onClick={() => say("시제품: 준법 검토 요청")} className="h-7 px-2.5 rounded-md text-[11.5px] flex items-center gap-1 bg-slate-900 text-white hover:bg-slate-700">
        <Send className="w-3.5 h-3.5" />
        검토 요청
      </button>
    </div>
  );
};

/** 다음 할 일 하나 */
const NextStep: React.FC = () => {
  const s = useCardProtoStore();
  const say = useLabStore((x) => x.say);
  let label = "";
  let sub = "";
  let tone = "bg-[var(--fig-brand)] hover:brightness-110";
  let run = () => {};

  if (s.phase === 1) {
    if (!s.accepted) {
      label = s.proposal ? "왼쪽 제안을 받거나 안 받기" : "정돈 제안 보기";
      sub = "쓴 메모는 그대로 두고 뼈대를 제안받아요";
      tone = "bg-violet-600 hover:bg-violet-700";
      run = () => (s.proposal ? say("왼쪽 위 '받기'를 눌러 주세요") : s.openProposal());
    } else {
      label = "기획안 확정 · 2 서식으로";
      sub = "뼈대는 그대로 가져가요";
      run = () => s.setPhase(2);
    }
  } else if (s.phase === 2) {
    label = "3 채우기로";
    sub = "리소스 3개로 채워요";
    run = () => s.setPhase(3);
  } else if (!s.filled) {
    label = "AI 로 채우기";
    sub = "기획안 · 혜택 정의서 · 연회비 계약";
    tone = "bg-violet-600 hover:bg-violet-700";
    run = s.fill;
  } else {
    const keys = presentKeys(s.lines).filter((k) => FILLS[k] && !s.reviewed[k]);
    const risk = keys.find((k) => FILLS[k].state === "nocite" || FILLS[k].state === "changed");
    const unseen = keys.find((k) => FILLS[k].state === "draft");
    const next = risk ?? unseen;
    if (next) {
      label = `${risk ? "위험한 곳" : "안 본 곳"} · ${nodeLabel(next).split(" › ").pop()}`;
      sub = risk ? FILLS[next].why ?? "" : `남은 곳 ${keys.filter((k) => FILLS[k].state !== "copied" && FILLS[k].state !== "wait").length}`;
      tone = risk ? "bg-rose-500 hover:bg-rose-600" : "bg-amber-500 hover:bg-amber-600";
      run = () => s.focusKey(next);
    } else {
      label = "준법 검토 요청 보내기";
      sub = "다 봤어요 · 심의필 번호는 심의 후에";
      run = () => say("시제품: 준법 검토 요청");
    }
  }

  return (
    <button type="button" onClick={run} className={`absolute right-5 bottom-5 z-20 max-w-[340px] rounded-xl shadow-lg px-4 py-2 text-left text-white flex items-center gap-3 ${tone}`} data-testid="proto-next">
      <span className="min-w-0">
        <span className="block text-[13px] font-bold truncate">{label}</span>
        <span className="block text-[11px] opacity-85 truncate">{sub}</span>
      </span>
      <ArrowRight className="w-4 h-4 shrink-0" />
    </button>
  );
};
