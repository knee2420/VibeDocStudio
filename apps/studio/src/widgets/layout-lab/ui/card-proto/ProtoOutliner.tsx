import React from "react";
import { Check, CornerDownRight, Sparkles, X } from "lucide-react";

import { findNode, mapText, nodeLabel } from "../../model/cardProtoData";
import { useLabStore } from "../../model/useLabStore";
import { coverage, signalOf, useCardProtoStore, type OLine, type ProtoPhase } from "../../model/useCardProtoStore";

/**
 * 왼쪽 = 아웃라인. 볼트의 .outline 처럼 쓴다 — 자유 깊이, 줄마다 글자 칸.
 *  Enter 새 줄 · Tab / Shift+Tab 들이기 · 내기 · 빈 줄에서 Backspace 지우기 · ↑↓ 줄 이동 · Alt+↑↓ 옮기기 · Ctrl+Z
 * Phase 1: 줄 옆에 AI 가 알아들은 자리(→ 2 할인율 표)가 조용히 붙는다. 정돈 제안은 이 자리에 펼쳐 본다.
 * Phase 3: 신호 두 가지만 — 안 본 곳(점) · 위험한 곳(!).
 */
export const ProtoOutliner: React.FC = () => {
  const phase = useCardProtoStore((s) => s.phase);
  const proposal = useCardProtoStore((s) => s.proposal);
  return (
    <aside className="fig-panel w-[340px] shrink-0 min-h-0 flex flex-col bg-white border-r border-[var(--fig-border)]" data-testid="proto-outliner">
      <Head phase={phase} />
      {proposal ? <ProposalView lines={proposal} /> : <Lines />}
      <p className="shrink-0 px-3 py-1.5 border-t border-[var(--fig-border)] text-[10.5px] leading-4 text-slate-400">
        Enter 새 줄 · Tab 들이기 · Shift+Tab 내기 · Alt+↑↓ 옮기기 · Ctrl+Z
      </p>
    </aside>
  );
};

const Head: React.FC<{ phase: ProtoPhase }> = ({ phase }) => {
  const setPhase = useCardProtoStore((s) => s.setPhase);
  const accepted = useCardProtoStore((s) => s.accepted);
  const say = useLabStore((s) => s.say);
  const tabs: { id: ProtoPhase; label: string }[] = [
    { id: 1, label: "뼈대" },
    { id: 2, label: "서식" },
    { id: 3, label: "채우기" },
  ];
  return (
    <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-[var(--fig-border)] flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-900">카드의정석2 PAY 상품안내장</span>
        <div className="flex items-center gap-2.5 shrink-0" role="tablist" aria-label="작업 단계">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={phase === t.id}
              onClick={() => (t.id > 1 && !accepted ? say("먼저 뼈대에서 AI 정돈 제안을 받아 주세요") : setPhase(t.id))}
              className={`text-[11.5px] pb-0.5 border-b-[1.5px] ${phase === t.id ? "text-slate-900 font-semibold border-slate-900" : "text-slate-400 border-transparent hover:text-slate-700"}`}
              data-testid={`proto-phase-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-slate-400">
        리소스 3 · 레퍼런스 7곳 · {accepted ? "뼈대 정돈됨" : "메모 중"}
      </div>
    </div>
  );
};

/* ── 쓰는 아웃라인 ── */

const Lines: React.FC = () => {
  const lines = useCardProtoStore((s) => s.lines);
  const focusId = useCardProtoStore((s) => s.focusId);
  const box = React.useRef<HTMLDivElement>(null);

  // 새로 만든 줄 · 옮긴 줄로 초점을 옮긴다
  React.useEffect(() => {
    if (!focusId) return;
    const el = box.current?.querySelector<HTMLInputElement>(`input[data-line-id="${focusId}"]`);
    if (el && document.activeElement !== el) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
  }, [focusId, lines]);

  // 장 번호: 맨 윗단 뼈대 제목 줄 순서
  let top = 0;
  const numbers = new Map<string, number>();
  for (const l of lines) if (l.key && l.depth === 0 && l.key !== "unsorted") numbers.set(l.id, ++top);

  return (
    <div ref={box} className="flex-1 min-h-0 overflow-y-auto py-2" role="tree" aria-label="아웃라인" data-testid="proto-lines">
      {lines.map((l) => (
        <LineRow key={l.id} l={l} no={numbers.get(l.id)} />
      ))}
    </div>
  );
};

const LineRow: React.FC<{ l: OLine; no?: number }> = ({ l, no }) => {
  const phase = useCardProtoStore((s) => s.phase);
  const accepted = useCardProtoStore((s) => s.accepted);
  const focused = useCardProtoStore((s) => s.focusId === l.id);
  const filled = useCardProtoStore((s) => s.filled);
  const reviewed = useCardProtoStore((s) => s.reviewed);
  const st = useCardProtoStore.getState;
  const say = useLabStore((s) => s.say);

  const keys = !l.key && !l.memo ? mapText(l.text) : [];
  const sig = l.key && phase === 3 ? signalOf(l.key, filled, reviewed) : null;
  const heading = !!l.key;

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const s = st();
    const i = s.lines.findIndex((x) => x.id === l.id);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (!s.undo()) say("되돌릴 것이 없어요");
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      s.insertAfter(l.id);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (!(e.shiftKey ? s.outdent(l.id) : s.indent(l.id))) say(e.shiftKey ? "더 내어 쓸 수 없어요" : "위 줄보다 더 들일 수 없어요");
    } else if (e.key === "Backspace" && !e.currentTarget.value && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const prev = s.removeLine(l.id);
      if (prev) s.focus(prev, false);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      s.moveBlock(l.id, e.key === "ArrowUp" ? -1 : 1);
      s.focus(l.id, false);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const n = s.lines[i + (e.key === "ArrowUp" ? -1 : 1)];
      if (n) s.focus(n.id);
    }
  };

  return (
    <div
      className={`group flex items-center gap-1.5 pr-2 min-h-[26px] ${focused ? "bg-[var(--fig-brand)]/[0.07]" : "hover:bg-slate-50"}`}
      style={{ paddingLeft: 10 + l.depth * 16 }}
      role="treeitem"
      aria-level={l.depth + 1}
      data-row={l.id}
    >
      {/* 불릿 · 번호 */}
      <span className="w-4 shrink-0 grid place-items-center">
        {no ? (
          <span className="text-[11px] text-slate-400 tabular-nums">{no}</span>
        ) : l.memo ? (
          l.memo.by === "ai" ? <Sparkles className="w-2.5 h-2.5 text-violet-400" /> : <span className="w-1 h-1 rounded-full bg-slate-300" />
        ) : (
          <span className={`rounded-full ${heading ? "w-1.5 h-1.5 bg-slate-500" : "w-[5px] h-[5px] bg-slate-400"}`} />
        )}
      </span>
      <input
        data-line-id={l.id}
        value={l.text}
        onChange={(e) => st().setText(l.id, e.target.value)}
        onFocus={() => st().focusId !== l.id && st().focus(l.id)}
        onKeyDown={onKey}
        placeholder={heading ? "제목" : "생각나는 대로"}
        className={`flex-1 min-w-0 bg-transparent outline-none py-[3px] placeholder:text-slate-300 ${
          l.memo
            ? "text-[11.5px] text-slate-400 italic"
            : heading
              ? l.depth === 0
                ? "text-[13.5px] font-semibold text-slate-900"
                : "text-[12.5px] text-slate-700"
              : "text-[13px] text-slate-800"
        }`}
      />
      {/* Phase 1: AI 가 알아들은 자리 — 조용히 */}
      {phase === 1 && !accepted && !l.key && !l.memo && l.text.trim() && (
        <span
          className={`shrink-0 max-w-[120px] truncate text-[10.5px] ${keys.length ? "text-slate-400" : "text-amber-600"}`}
          title={keys.length ? keys.map(nodeLabel).join("\n") : "AI 가 어디인지 모름 — 정돈할 때 물어봐요"}
          data-testid="proto-map-tag"
        >
          {keys.length === 0 ? "? 모름" : keys.length > 2 ? `→ 장 ${new Set(keys.map((k) => nodeLabel(k).split(" ")[0])).size}개` : `→ ${shortLabel(keys[0])}`}
        </span>
      )}
      {sig === "risk" && <span className="shrink-0 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center" title="위험한 곳">!</span>}
      {sig === "unseen" && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" title="안 본 곳" />}
    </div>
  );
};

/** "2 간편결제 할인 › 결제사별 할인율 표" → "2 할인율 표" */
function shortLabel(key: string): string {
  const full = nodeLabel(key);
  const no = full.split(" ")[0];
  const n = findNode(key);
  return `${no} ${n?.title.replace(/결제사별 |실적 구간별 |대상 /g, "") ?? key}`;
}

/* ── 정돈 제안: 아웃라인 자리에 펼쳐 보고 받거나 안 받는다 (변경 검토 방식) ── */

const ProposalView: React.FC<{ lines: OLine[] }> = ({ lines }) => {
  const accept = useCardProtoStore((s) => s.acceptProposal);
  const close = useCardProtoStore((s) => s.closeProposal);
  const before = useCardProtoStore((s) => s.lines);
  const say = useLabStore((s) => s.say);
  const cov = coverage(before);
  // 내가 쓴 자리와 들어갈 자리가 다른 줄: 혜택 줄들 사이에 쓴 "최초 발급"
  const movedTexts = new Set((cov.mine["criteria-first"] ?? []).filter(Boolean));
  let top = 0;
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="proto-proposal">
      <div className="shrink-0 mx-2 mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
        <div className="text-[12px] font-semibold text-violet-900">AI 정돈 제안</div>
        <p className="text-[11px] leading-4 text-violet-800/80 mt-0.5">우리카드 안내장 순서로 뼈대를 짜고, 쓰신 말은 제목 밑에 회색으로 남겨요. 받은 뒤에도 마음대로 고칠 수 있어요.</p>
        <div className="flex gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => {
              accept();
              say("뼈대를 정돈했어요 — Ctrl+Z 로 되돌리기");
            }}
            className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold bg-violet-600 text-white flex items-center gap-1 hover:bg-violet-700"
            data-testid="proto-accept"
          >
            <Check className="w-3.5 h-3.5" />
            받기
          </button>
          <button type="button" onClick={close} className="h-7 px-2.5 rounded-md text-[11.5px] border border-violet-200 text-violet-800 bg-white flex items-center gap-1">
            <X className="w-3.5 h-3.5" />
            안 받기
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {lines.map((l) => {
          const no = l.key && l.depth === 0 && l.key !== "unsorted" ? ++top : undefined;
          const node = l.key ? findNode(l.key) : undefined;
          const hasMine = l.key ? lines.some((x) => x.memo?.of === l.key && x.memo?.by === "me") : false;
          const via = l.key ? cov.via[l.key] : undefined;
          const leafy = l.key && !node?.children?.length;
          return (
            <div key={l.id} className="flex items-center gap-1.5 pr-2 min-h-[24px]" style={{ paddingLeft: 10 + l.depth * 16 }}>
              <span className="w-4 shrink-0 grid place-items-center">
                {no ? <span className="text-[11px] text-slate-400 tabular-nums">{no}</span> : l.memo ? <span className="w-1 h-1 rounded-full bg-slate-300" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${
                  l.memo ? "text-[11.5px] text-slate-400 italic" : l.depth === 0 ? "text-[13px] font-semibold text-slate-900" : "text-[12.5px] text-slate-700"
                } ${l.key && !hasMine && !via ? "underline decoration-violet-300 decoration-2 underline-offset-2" : ""}`}
              >
                {l.memo?.by === "ai" && "✦ "}
                {l.text}
              </span>
              {l.memo && movedTexts.has(l.text) && (
                <span className="shrink-0 text-[10px] text-violet-700 flex items-center gap-0.5" title="혜택 옆에 쓰셨지만 안내장에선 실적 산정 안에 들어가요">
                  <CornerDownRight className="w-3 h-3" />
                  자리 옮김
                </span>
              )}
              {leafy && via && <span className="shrink-0 text-[10px] text-slate-400" title={`"${via}"`}>레퍼런스 그대로</span>}
              {leafy && !hasMine && !via && node?.ref && <span className="shrink-0 text-[10px] text-violet-600">+ 레퍼런스에서</span>}
              {leafy && !hasMine && !via && !node?.ref && <span className="shrink-0 text-[10px] text-amber-600">비어 있음</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
