import React from "react";
import {
  ArrowUp,
  Check,
  ClipboardCopy,
  FileText,
  GitPullRequestDraft,
  GripVertical,
  Languages,
  Loader2,
  MessageSquareShare,
  Minimize2,
  PencilLine,
  RotateCcw,
  Wand2,
  X,
} from "lucide-react";

import { useInlineAiRun, useRegistryList } from "@vibe/ai-react";

import { useSlotSelectionStore, type SlotRangeSelection } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  applySlotMap,
  attachable,
  attachToComposer,
  parseSlotMap,
  SLOT_RANGE_SURFACE,
  slotRangeRef,
  stageSlotMap,
} from "@/features/ai-workspace";
import { aiRuntime } from "@/shared/ai";
import { htmlToPlain } from "@/shared/lib";

/** 캔버스 텍스트 선택 버블(`SlotRichTextEditor`)과 같은 표면 · 버튼 규격. */
const SURFACE = "rounded-lg border border-[#eaeaea] bg-white shadow-[0px_4px_12px_0px_rgba(47,44,44,0.1)] text-[12px] text-gray-800";
const BUTTON = "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-gray-800 hover:bg-neutral-100 cursor-pointer disabled:opacity-40 disabled:cursor-default";
const ICON_BUTTON = "inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-neutral-100 hover:text-gray-800 cursor-pointer";
const PRIMARY = "inline-flex h-7 items-center gap-1 rounded-md bg-[#0472e3] px-2 text-[12px] font-semibold text-white hover:bg-[#0363c7] cursor-pointer disabled:opacity-40 disabled:cursor-default";
const ACCENT = "#0472e3";

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  wand: Wand2,
  file: FileText,
  minimize: Minimize2,
  pencil: PencilLine,
  languages: Languages,
};

/** 범위 안 선택 단위의 바깥 요소 (표 칸 td · 슬롯 상자 · 이미지). */
function rangeElements(unitIds: string[]): HTMLElement[] {
  const wanted = new Set(unitIds);
  return [...document.querySelectorAll<HTMLElement>("main [data-vdoc-unit]")].filter(
    (el) => wanted.has(el.dataset.vdocUnit!) && !el.parentElement?.closest("[data-vdoc-unit]")
  );
}

/** 고른 칸의 글자를 표 배치대로 (같은 행은 탭, 행 · 블록은 줄바꿈). */
function rangeText(slotIds: string[]): string {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  if (!doc) return "";
  const lines: string[] = [];
  let row: Element | null = null;
  let cells: string[] = [];
  for (const el of rangeElements(slotIds)) {
    const id = el.dataset.vdocUnit!;
    const text = doc.slots[id] ? htmlToPlain(doc.slots[id].content) : `[${el.querySelector("img")?.getAttribute("alt") || "이미지"}]`;
    const tr = el.closest("tr");
    if (tr && tr === row) cells.push(text);
    else {
      if (cells.length) lines.push(cells.join("\t"));
      row = tr;
      cells = [text];
    }
  }
  if (cells.length) lines.push(cells.join("\t"));
  return lines.join("\n");
}

/** 범위 강조 — 캔버스 선택 색(#0472e3)으로 옅게 칠하고 칸 테두리를 그린다. */
const RangeHighlight: React.FC<{ unitIds: string[]; withinTable?: boolean }> = ({ unitIds, withinTable }) => {
  const css = unitIds
    .map((id) => {
      const sel = CSS.escape(id);
      return `td[data-vdoc-unit="${sel}"], [data-vdoc-unit="${sel}"]:not(td *) {
        ${withinTable ? "" : "background-color: rgba(4, 114, 227, 0.07) !important;"}
        box-shadow: inset 0 0 0 1.5px rgba(4, 114, 227, 0.6) !important;
      }`;
    })
    .join("\n");
  return <style>{css}</style>;
};

/** 바를 띄울 자리: 손을 뗀 점(스크롤을 따라감) → 없으면 범위 상자 아래. */
function anchorPoint(range: SlotRangeSelection): { x: number; y: number } | null {
  const main = document.querySelector<HTMLElement>("main");
  if (range.endPoint && main) {
    return {
      x: range.endPoint.x - (main.scrollLeft - range.endPoint.scrollLeft),
      y: range.endPoint.y - (main.scrollTop - range.endPoint.scrollTop),
    };
  }
  const rects = rangeElements(range.unitIds).map((el) => el.getBoundingClientRect());
  if (rects.length === 0) return null;
  return { x: Math.min(...rects.map((r) => r.left)), y: Math.max(...rects.map((r) => r.bottom)) };
}

type Phase =
  | { kind: "bar" }
  | { kind: "prompt" }
  | { kind: "preview"; map: Record<string, string>; picked: Set<string>; label: string }
  | { kind: "done"; message: string; tone: "ok" | "error" };

/**
 * 여러 슬롯 범위의 AI 바 — 드래그를 끝낸 자리 옆에 뜬다 (텍스트 선택 버블과 같은 모양).
 * 빠른 지시 · 직접 지시 → 칸별 미리보기 → 모두 적용(되돌리기 한 번) / Staged 로 / Composer 에서 이어하기.
 */
export const SlotRangeAiBar: React.FC = () => {
  const range = useSlotSelectionStore((s) => s.slotRange);
  const doc = useStudioDocumentStore(selectActiveDocument);
  const actions = useRegistryList(aiRuntime.actions).filter((a) => a.surfaces.includes(SLOT_RANGE_SURFACE));
  const run = useInlineAiRun(aiRuntime);
  const [instruction, setInstruction] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>({ kind: "bar" });
  const [point, setPoint] = React.useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const lastLabel = React.useRef("AI 지시");
  const barRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rangeKey = range?.unitIds.join("|") ?? "";

  // 범위가 바뀌면 새로 시작
  React.useEffect(() => {
    setPhase({ kind: "bar" });
    run.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  // 위치: 손을 뗀 자리를 스크롤 · 창 크기에 맞춰 따라간다 (백그라운드 탭에서도 돌도록 타이머)
  React.useEffect(() => {
    if (!range) return;
    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setPoint(anchorPoint(range));
        setDragging(document.body.classList.contains("vdoc-range-dragging"));
      }, 16);
    };
    measure();
    const onUp = () => window.setTimeout(measure, 0);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [range]);

  // 결과가 오면 칸별로 풀어 미리보기
  React.useEffect(() => {
    if (run.status !== "done" || !run.result || !range) return;
    try {
      const map = parseSlotMap(run.result, range.slotIds);
      setPhase({ kind: "preview", map, picked: new Set(Object.keys(map)), label: lastLabel.current });
    } catch (err) {
      setPhase({ kind: "done", message: err instanceof Error ? err.message : String(err), tone: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status, run.result]);

  // Ctrl+C: 편집기 글자 선택이 없으면 고른 칸들을 표 배치대로 복사
  React.useEffect(() => {
    if (!range) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
      if (range.source === "native" && window.getSelection()?.toString()) return; // 브라우저 복사를 그대로
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest("input, textarea, [data-testid='ai-composer-panel']")) return;
      e.preventDefault();
      void navigator.clipboard?.writeText(rangeText(range.unitIds));
      setPhase({ kind: "done", message: `${range.unitIds.length}개를 복사했습니다 (같은 행은 탭으로 구분)`, tone: "ok" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [range]);

  React.useEffect(() => {
    if (phase.kind === "prompt") window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [phase.kind]);

  if (!range || !doc) return null;
  const ref = slotRangeRef(doc, range.slotIds, range.unitIds);
  const mediaCount = range.unitIds.length - range.slotIds.length;
  const lockedCount = range.slotIds.filter((id) => {
    const s = doc.slots[id];
    return !s || s.role === "boilerplate" || s.constraints?.locked;
  }).length;
  const running = run.status === "running";

  const start = (text: string, label: string) => {
    const body = text.trim();
    if (!body) return;
    lastLabel.current = label;
    setPhase({ kind: "bar" });
    void run.run({ instruction: body, contexts: [ref], outputFormat: "slot-map" });
  };

  const close = () => {
    run.cancel();
    useSlotSelectionStore.getState().setSlotRange(null);
  };

  // 손을 뗀 점 바로 아래(버블과 같은 간격). 화면 아래로 넘치면 점 위로 올린다.
  // 너비는 맨 윗줄(도구 줄)에 맞춘다 — 입력칸 · 미리보기는 그 폭을 그대로 쓴다.
  const width = undefined;
  const estimatedH = phase.kind === "preview" ? 380 : phase.kind === "prompt" || running ? 84 : 40;
  const estimatedW = barRef.current?.offsetWidth || 700;
  const anchor = point ?? { x: 24, y: window.innerHeight - estimatedH - 24 };
  const left = Math.max(12, Math.min(anchor.x - 12, window.innerWidth - estimatedW - 12));
  const top = anchor.y + 12 + estimatedH < window.innerHeight - 8 ? anchor.y + 12 : Math.max(60, anchor.y - estimatedH - 12);

  return (
    <>
      <RangeHighlight unitIds={range.unitIds} withinTable={range.withinTable} />
      {!dragging && (
        <div
          ref={barRef}
          data-testid="slot-range-ai-bar"
          data-keep-table-selection
          style={{ left, top, width }}
          className={`fixed z-[60] select-none ${SURFACE}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 p-1 whitespace-nowrap">
            <span
              {...attachable(() => [ref])}
              title={`${ref.hint ?? ""}\n끌어서 Composer 에 놓으면 첨부`}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#eef5fd] px-1.5 text-[11.5px] font-semibold text-[#0363c7] cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3 h-3 opacity-60" />
              {range.slotIds.length}칸
              {mediaCount > 0 && <span className="font-normal text-[#5a8fc9]">· 이미지 {mediaCount}</span>}
              {lockedCount > 0 && <span className="font-normal text-[#5a8fc9]">· 잠김 {lockedCount}</span>}
            </span>
            <button
              type="button"
              data-testid="slot-range-prompt"
              disabled={running}
              onClick={() => setPhase((p) => (p.kind === "prompt" ? { kind: "bar" } : { kind: "prompt" }))}
              className={PRIMARY}
              title="고른 칸들에 직접 지시"
            >
              <Wand2 className="w-3.5 h-3.5" /> AI 제안
            </button>
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.icon ?? ""] ?? Wand2;
              return (
                <button
                  key={action.id}
                  type="button"
                  data-testid={`slot-range-action-${action.id}`}
                  disabled={running}
                  title={typeof action.instruction === "string" ? action.instruction : action.label}
                  onClick={() => start(typeof action.instruction === "string" ? action.instruction : action.instruction({}), action.label)}
                  className={BUTTON}
                >
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  {action.label}
                </button>
              );
            })}
            <span className="mx-0.5 h-4 w-px bg-[#eaeaea]" />
            <button
              type="button"
              data-testid="slot-range-to-composer"
              title="Composer 에 첨부 (Ctrl+L)"
              onClick={() => attachToComposer([ref], { role: "target" })}
              className={ICON_BUTTON}
            >
              <MessageSquareShare className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="복사 (Ctrl+C)"
              onClick={() => {
                void navigator.clipboard?.writeText(rangeText(range.unitIds));
                setPhase({ kind: "done", message: `${range.unitIds.length}개를 복사했습니다`, tone: "ok" });
              }}
              className={ICON_BUTTON}
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
            </button>
            <button type="button" title="선택 해제 (Esc)" onClick={close} className={ICON_BUTTON}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {phase.kind === "prompt" && !running && (
            <form
              className="flex w-0 min-w-full items-center gap-1.5 border-t border-[#eaeaea] px-2 py-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                start(instruction, instruction.slice(0, 16));
              }}
            >
              <input
                ref={inputRef}
                data-testid="slot-range-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setPhase({ kind: "bar" })}
                placeholder="고른 칸들에 지시 (예: 결의사항을 항목별 한 줄로)"
                className="h-7 flex-1 min-w-0 rounded-md border border-[#eaeaea] bg-white px-2 text-[12px] text-gray-800 placeholder-gray-400 focus:border-[#0472e3] focus:outline-none select-text"
              />
              <button type="submit" disabled={!instruction.trim()} className={PRIMARY} title="실행 (Enter)">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {running && (
            <div className="flex w-0 min-w-full items-center gap-2 border-t border-[#eaeaea] px-2.5 py-2 text-gray-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: ACCENT }} />
              <span className="flex-1">
                {lastLabel.current} — {run.streamText ? `${run.streamText.length}자 받는 중` : "작성 중"}
              </span>
              <button type="button" onClick={() => run.cancel()} className={BUTTON}>
                중단
              </button>
            </div>
          )}
          {run.status === "error" && <div className="w-0 min-w-full border-t border-[#eaeaea] px-2.5 py-2 text-rose-600">{run.error}</div>}
          {phase.kind === "done" && (
            <div className={`w-0 min-w-full border-t border-[#eaeaea] px-2.5 py-2 ${phase.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{phase.message}</div>
          )}

          {phase.kind === "preview" && (
            <RangePreview
              phase={phase}
              onToggle={(slotId) =>
                setPhase((p) => {
                  if (p.kind !== "preview") return p;
                  const picked = new Set(p.picked);
                  if (picked.has(slotId)) picked.delete(slotId);
                  else picked.add(slotId);
                  return { ...p, picked };
                })
              }
              onApply={(map) => {
                const n = applySlotMap(map, phase.label);
                setPhase({ kind: "done", message: `${n}칸을 반영했습니다 · Ctrl+Z 한 번으로 모두 되돌립니다`, tone: "ok" });
              }}
              onStage={(map) => {
                const n = stageSlotMap(map, phase.label);
                setPhase({ kind: "done", message: `${n}건을 Staged 대기열에 올렸습니다`, tone: "ok" });
              }}
              onComposer={() => {
                attachToComposer([ref], { role: "target", prompt: `{handles} 에 대해: ${lastLabel.current}` });
                setPhase({ kind: "bar" });
              }}
              onRetry={() => run.retry()}
              onCancel={() => setPhase({ kind: "bar" })}
            />
          )}
        </div>
      )}
    </>
  );
};

const RangePreview: React.FC<{
  phase: Extract<Phase, { kind: "preview" }>;
  onToggle(slotId: string): void;
  onApply(map: Record<string, string>): void;
  onStage(map: Record<string, string>): void;
  onComposer(): void;
  onRetry(): void;
  onCancel(): void;
}> = ({ phase, onToggle, onApply, onStage, onComposer, onRetry, onCancel }) => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const entries = Object.entries(phase.map);
  const pickedMap = Object.fromEntries(entries.filter(([id]) => phase.picked.has(id)));
  const count = Object.keys(pickedMap).length;
  return (
    <div data-testid="slot-range-preview" className="w-0 min-w-full border-t border-[#eaeaea] select-text">
      <div className="px-2.5 pt-2 pb-1.5 text-[11px] text-gray-500">
        {entries.length === 0 ? "바꿀 칸이 없다고 답했습니다." : `${phase.label} · ${entries.length}칸 변경안 — 체크한 칸만 반영합니다`}
      </div>
      <div className="max-h-64 overflow-y-auto px-2 space-y-1">
        {entries.map(([slotId, html]) => {
          const slot = doc?.slots[slotId];
          const on = phase.picked.has(slotId);
          return (
            <label
              key={slotId}
              className={`flex gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                on ? "border-[#b9d6f5] bg-[#f5f9fe]" : "border-[#eaeaea] bg-white opacity-60"
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => onToggle(slotId)} className="mt-0.5 accent-[#0472e3]" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="truncate text-[11.5px] font-semibold text-gray-800">{slot?.label ?? slotId}</div>
                <div className="truncate text-[11px] text-gray-400 line-through">{htmlToPlain(slot?.content ?? "", 90) || "(비어 있음)"}</div>
                <div className="line-clamp-3 text-[11.5px] leading-snug text-gray-800">{htmlToPlain(html, 240)}</div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-1 p-1.5">
        <button type="button" data-testid="slot-range-apply" disabled={count === 0} onClick={() => onApply(pickedMap)} className={PRIMARY}>
          <Check className="w-3.5 h-3.5" /> 모두 적용 ({count})
        </button>
        <button type="button" data-testid="slot-range-stage" disabled={count === 0} onClick={() => onStage(pickedMap)} className={BUTTON}>
          <GitPullRequestDraft className="w-3.5 h-3.5 text-gray-500" /> Staged 로
        </button>
        <button type="button" onClick={onComposer} className={BUTTON}>
          <MessageSquareShare className="w-3.5 h-3.5 text-gray-500" /> Composer 에서
        </button>
        <span className="flex-1" />
        <button type="button" title="다시 생성" onClick={onRetry} className={ICON_BUTTON}>
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          닫기
        </button>
      </div>
    </div>
  );
};
