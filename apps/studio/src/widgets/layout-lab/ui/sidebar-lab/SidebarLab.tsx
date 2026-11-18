import React from "react";
import {
  ArrowRight,
  Columns2,
  Hand,
  Image as ImageIcon,
  MousePointer2,
  RotateCcw,
  Send,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Type,
  Upload,
  type LucideIcon,
} from "lucide-react";

import type { SidebarVersionId } from "@/features/layout-lab";

import { docPages, indexOf, type ScenarioId } from "../../model/sidebarDummy";
import { SCENARIOS } from "../../model/sidebarScenarios";
import { useLabStore } from "../../model/useLabStore";
import { activeDoc, countDoc, nextOpen, slotView, useScenario, useSidebarLabStore } from "../../model/useSidebarLabStore";
import { SbCanvas } from "./SbCanvas";
import { SidebarA } from "./SidebarA";
import { SidebarB } from "./SidebarB";
import { SidebarC } from "./SidebarC";
import { SidebarD } from "./SidebarD";
import { SidebarE } from "./SidebarE";
import { AiPanelE, PeekE } from "./AiPanelE";

/**
 * 사이드바 시안 화면 — 사이드바 · 툴바 · 캔버스 흐름을 Z 로 다시 놓는다.
 * ① 왼쪽 위: 사이드바 머리의 단계 표시 (지금 무슨 일을 하나)
 * ② 오른쪽 위: 문서 단위 행동 (검토 요청 · 내보내기)
 * ③ 대각선: 본문
 * ④ 오른쪽 아래: 다음 행동 하나 (다음 빈칸 / 다음 단계로)
 * 떠 있는 툴바에는 그리기 도구만 남긴다 (Phase 전환을 뺐다).
 */
export const SidebarLab: React.FC<{ variant: Exclude<SidebarVersionId, "current"> }> = ({ variant }) => (
  // --fig-brand 는 .fig-panel 안에서만 정의돼 있어서, 캔버스 테두리 · 오른쪽 아래 버튼에도 닿게 여기서 한 번 더 준다.
  <div className="flex-1 min-h-0 flex" style={{ "--fig-brand": "#0d99ff" } as React.CSSProperties} data-testid={`sb-lab-${variant}`}>
    {variant === "sa" && <SidebarA />}
    {variant === "sb" && <SidebarB />}
    {variant === "sc" && <SidebarC />}
    {variant === "sd" && <SidebarD />}
    {variant === "se" && <SidebarE />}
    <main className="flex-1 min-w-0 min-h-0 flex flex-col relative">
      <TopBar />
      <SbCanvas />
      {variant === "se" && <PeekE />}
      <DrawToolbar />
      {/* E 는 오른쪽에 대화 칸이 있어 캔버스가 좁다 — 다음 행동을 툴바 위로 올린다 */}
      <NextAction raised={variant === "se"} />
    </main>
    {variant === "se" && <AiPanelE />}
  </div>
);

/** ② 오른쪽 위 — 지금 위치 + 문서 단위 행동 */
const TopBar: React.FC = () => {
  const sc = useScenario();
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const viewChapterId = useSidebarLabStore((s) => s.viewChapterId);
  const reset = useSidebarLabStore((s) => s.reset);
  const setScenario = useSidebarLabStore((s) => s.setScenario);
  const say = useLabStore((s) => s.say);
  const doc = activeDoc(sc, docId);
  const ch = viewChapterId ? indexOf(sc).get(viewChapterId)?.chapter : undefined;
  const no = ch ? doc.chapters.indexOf(ch) + 1 : 0;
  return (
    <div className="fig-panel h-10 shrink-0 bg-white border-b border-[var(--fig-border)] px-3 flex items-center gap-3">
      {/* 실험 조건 — 시안이 한 종류 문서에만 맞지 않는지 보려고 예시 문서를 바꾼다 (실제 앱에는 없는 칸) */}
      <label className="shrink-0 h-7 pl-2 pr-1 rounded-md border border-violet-300 bg-violet-50 text-violet-800 text-[11.5px] flex items-center gap-1" title={sc.desc}>
        <span className="font-semibold">예시 문서</span>
        <select
          value={sc.id}
          onChange={(e) => setScenario(e.target.value as ScenarioId)}
          className="bg-transparent outline-none cursor-pointer text-[11.5px]"
          data-testid="sb-scenario"
          aria-label="예시 문서"
        >
          {SCENARIOS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
        <span className="text-slate-700 font-medium">{doc.name}</span>
        <span className="text-slate-400"> ({docPages(doc)}쪽)</span>
        {ch?.part && (
          <>
            <span className="mx-1.5 text-slate-300">›</span>
            {ch.part}
          </>
        )}
        {ch && no > 0 && (
          <>
            <span className="mx-1.5 text-slate-300">›</span>
            {no} {ch.name}
          </>
        )}
      </span>
      <button type="button" className="h-7 px-2 rounded-md text-[11.5px] flex items-center gap-1 text-slate-500 hover:bg-slate-100" onClick={reset} title="시제품에서 바꾼 칸 되돌리기">
        <RotateCcw className="w-3.5 h-3.5" />
        처음으로
      </button>
      <button type="button" className="h-7 px-2.5 rounded-md text-[11.5px] flex items-center gap-1 text-slate-700 border border-slate-200 hover:bg-slate-50" onClick={() => say("시제품: 내보내기 (HWPX · DOCX · PDF)")}>
        <Upload className="w-3.5 h-3.5" />
        내보내기
      </button>
      <button type="button" className="h-7 px-2.5 rounded-md text-[11.5px] flex items-center gap-1 text-white bg-slate-900 hover:bg-slate-700" onClick={() => say("시제품: 검토 요청 보내기")}>
        <Send className="w-3.5 h-3.5" />
        검토 요청
      </button>
    </div>
  );
};

const TOOLS: { id: string; icon: LucideIcon; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "선택 (V)" },
  { id: "frame", icon: SquareDashed, label: "영역 선택" },
  { id: "text", icon: Type, label: "텍스트 (T)" },
  { id: "image", icon: ImageIcon, label: "이미지" },
  { id: "columns", icon: Columns2, label: "단 나누기" },
  { id: "shapes", icon: Shapes, label: "블록 넣기" },
  { id: "hand", icon: Hand, label: "손 (H)" },
  { id: "props", icon: SlidersHorizontal, label: "속성" },
  { id: "ai", icon: Sparkles, label: "AI" },
];

/** 떠 있는 툴바 — 그리기 도구만. 지금 앱의 Phase 버튼 자리는 사이드바 머리로 옮겼다. */
const DrawToolbar: React.FC = () => {
  const [tool, setTool] = React.useState("select");
  const say = useLabStore((s) => s.say);
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-5 z-20 fig-panel h-11 px-1.5 rounded-xl bg-white border border-[var(--fig-border)] shadow-lg flex items-center gap-0.5" data-testid="sb-toolbar">
      {TOOLS.map((t, i) => (
        <React.Fragment key={t.id}>
          {(i === 6 || i === 8) && <span className="w-px h-5 bg-slate-200 mx-1" />}
          <button
            type="button"
            aria-pressed={tool === t.id}
            title={t.label}
            onClick={() => {
              setTool(t.id);
              if (t.id !== "select" && t.id !== "hand") say(`시제품: ${t.label} 도구는 동작하지 않습니다`);
            }}
            className={`w-8 h-8 rounded-lg grid place-items-center ${tool === t.id ? "bg-[var(--fig-brand)] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <t.icon className="w-4 h-4" />
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

/** ④ 오른쪽 아래 — 단계마다 다음 행동 하나. Phase 3 은 다음 남은 일(빈칸이면 쓰기, 초안이면 확인)로 데려간다. */
const NextAction: React.FC<{ raised?: boolean }> = ({ raised }) => {
  const sc = useScenario();
  const phase = useSidebarLabStore((s) => s.phase);
  const setPhase = useSidebarLabStore((s) => s.setPhase);
  const edits = useSidebarLabStore((s) => s.edits);
  const docId = useSidebarLabStore((s) => s.activeDocId);
  const selectedId = useSidebarLabStore((s) => s.selectedId);
  const select = useSidebarLabStore((s) => s.select);
  const say = useLabStore((s) => s.say);
  const doc = activeDoc(sc, docId);

  let label: React.ReactNode;
  let sub: string;
  let onClick: () => void;
  let tone = "bg-[var(--fig-brand)] text-white hover:brightness-110";

  if (phase === 1) {
    label = "기획안 확정 · 2 서식으로";
    sub = `뼈대 ${doc.chapters.length}장 · ${docPages(doc)}쪽`;
    onClick = () => setPhase(2);
  } else if (phase === 2) {
    label = "3 채우기로";
    sub = `리소스 ${sc.sources.filter((x) => x.kind === "resource").length}개 · 레퍼런스 ${sc.sources.filter((x) => x.kind === "reference").length}개 물림`;
    onClick = () => setPhase(3);
  } else {
    const next = nextOpen(doc, edits, selectedId);
    const c = countDoc(doc, edits);
    if (next) {
      const st = slotView(next.slot, edits).state;
      tone = st === "empty" ? "bg-amber-500 text-white hover:bg-amber-600" : st === "nocite" ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-violet-600 text-white hover:bg-violet-700";
      const verb = st === "empty" ? "다음 빈칸" : st === "nocite" ? "근거 없는 초안" : "확인할 초안";
      label = (
        <>
          {verb} · {next.slot.name}
        </>
      );
      sub = `${doc.chapters.indexOf(next.chapter) + 1} ${next.chapter.name} › ${next.section.name} · 남은 일 ${c.open}`;
      onClick = () => select(next.slot.id);
    } else {
      label = "검토 요청 보내기";
      sub = c.wait ? `남은 일 없음 · 대기 ${c.wait}` : "남은 일 없음";
      onClick = () => say("시제품: 검토 요청 보내기");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="sb-next-action"
      className={`absolute right-5 ${raised ? "bottom-[76px]" : "bottom-5"} z-20 max-w-[320px] rounded-xl shadow-lg px-4 py-2 text-left flex items-center gap-3 ${tone}`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-bold truncate">{label}</span>
        <span className="block text-[11px] opacity-85 truncate">{sub}</span>
      </span>
      <ArrowRight className="w-4 h-4 shrink-0" />
    </button>
  );
};
