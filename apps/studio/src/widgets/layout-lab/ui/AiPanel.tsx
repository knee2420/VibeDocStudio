import React from "react";
import { ArrowUp, BookOpen, ChevronDown, ChevronRight, LayoutTemplate, Sparkles, Wrench } from "lucide-react";

import { AI_TOOL_LOG, CITATIONS, itemById } from "../model/dummy";
import { useLabStore } from "../model/useLabStore";

const CiteChip: React.FC<{ n: number }> = ({ n }) => {
  const cite = useLabStore((s) => s.cite);
  const active = useLabStore((s) => s.activeCite === n);
  const src = CITATIONS[n];
  return (
    <button
      type="button"
      onClick={() => cite(active ? null : n)}
      title={itemById(src.itemId)?.title}
      className={`mx-0.5 px-1 rounded text-[10.5px] font-semibold align-[1px] ${active ? "bg-[#0f9d58] text-white" : "bg-[#0f9d58]/10 text-[#0f9d58] hover:bg-[#0f9d58]/20"}`}
    >
      {n}
    </button>
  );
};

/** 입력창 위 칩 — 레퍼런스 · 근거 선택을 그대로 비추기만 한다 (고르는 곳은 각 칸). */
const MirrorChips: React.FC = () => {
  const pinned = useLabStore((s) => s.pinnedRefs.length);
  const attached = useLabStore((s) => s.attachedRes.length);
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="px-1.5 h-5 rounded-md inline-flex items-center gap-1 bg-[#9747ff]/10 text-[#7a3bd6]" title="레퍼런스 칸에서 고릅니다">
        <LayoutTemplate className="w-3 h-3" />레퍼런스 {pinned}
      </span>
      <span className="px-1.5 h-5 rounded-md inline-flex items-center gap-1 bg-[#0f9d58]/10 text-[#0b7a43]" title="리소스 칸에서 고릅니다">
        <BookOpen className="w-3 h-3" />근거 {attached}
      </span>
    </div>
  );
};

export const AiThread: React.FC = () => {
  const [logOpen, setLogOpen] = React.useState(false);
  const say = useLabStore((s) => s.say);
  return (
    <div className="space-y-3">
      <div className="ml-8 rounded-2xl rounded-br-md bg-[var(--fig-brand)] text-white px-3 py-2 text-[12.5px] leading-[19px]">
        결정사항 표를 회의 녹취록이랑 검토서 근거로 채워줘. 숫자는 꼭 출처 달고.
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setLogOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11.5px] text-[var(--fig-text-secondary)] hover:text-[var(--fig-text)]"
          data-testid="lab-ai-toollog"
        >
          {logOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Wrench className="w-3 h-3" />
          자료 {AI_TOOL_LOG.length}곳 살펴봄 · 41초
        </button>
        {logOpen && (
          <div className="ml-4 pl-2 border-l border-[var(--fig-border)] space-y-0.5 font-mono text-[10.5px] text-[var(--fig-text-tertiary)]">
            {AI_TOOL_LOG.map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
        )}
        <div className="text-[12.5px] leading-[20px]">
          표의 결정사항 3칸을 근거로 채웠어요. 코어 + 플러그인 구조 합의는 녹취록에서
          <CiteChip n={1} />, 슬롯 분리 효과 수치는 Kolas 검토서에서
          <CiteChip n={2} /> 가져왔습니다. 예산 집행률은 지식 덱 표를 썼어요
          <CiteChip n={3} />.
        </div>
        <div className="rounded-lg border border-[var(--fig-border)] p-2 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#9747ff]" />
          <span className="text-[12px] flex-1">변경안 · 표 칸 3개 고침</span>
          <button type="button" className="fig-btn" onClick={() => say("변경 검토 화면을 연다고 가정합니다 (더미)")}>
            검토
          </button>
        </div>
      </div>
    </div>
  );
};

export const AiComposerBox: React.FC<{ autoFocus?: boolean; onFocus?: () => void }> = ({ autoFocus, onFocus }) => {
  const say = useLabStore((s) => s.say);
  const [text, setText] = React.useState("");
  return (
    <div className="rounded-xl border border-[var(--fig-border)] bg-white p-2 focus-within:border-[var(--fig-brand)]" onMouseDown={onFocus}>
      <MirrorChips />
      <div className="flex items-end gap-2 mt-1.5">
        <textarea
          autoFocus={autoFocus}
          onFocus={onFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="무엇을 할까요? @ 로 자료 · 칸 지정"
          className="flex-1 resize-none outline-none text-[12.5px] leading-[19px] bg-transparent max-h-24"
          data-testid="lab-ai-input"
        />
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) return;
            setText("");
            say("더미 시제품이라 실제로 보내지 않습니다");
          }}
          className="w-7 h-7 rounded-full bg-[var(--fig-brand)] text-white flex items-center justify-center shrink-0"
          title="보내기"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

/** AI 칸 — 도구 기록은 한 줄로 접고 답만. */
export const AiPanel: React.FC = () => (
  <div className="flex-1 min-h-0 flex flex-col" data-testid="lab-ai">
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
      <AiThread />
    </div>
    <div className="p-2 border-t border-[var(--fig-border)]">
      <AiComposerBox />
    </div>
  </div>
);
