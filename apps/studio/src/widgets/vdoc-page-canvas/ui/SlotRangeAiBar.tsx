import React from "react";
import {
  ArrowUp,
  Check,
  ChevronUp,
  ClipboardCopy,
  FileText,
  GitPullRequestDraft,
  GripVertical,
  Languages,
  LayoutGrid,
  Loader2,
  MessageSquareShare,
  Minimize2,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

import { useInlineAiRun, useRegistryList } from "@vibe/ai-react";
import { findBlock, getBlockUnits, type VDocDocument } from "@vibe/vdoc-schema";

import { useAssetLibraryStore } from "@/entities/asset-library";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useKeyLayer } from "@/features/command-bus";
import { useMutateCanvasBlocks } from "@/features/mutate-canvas-blocks";
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
  if (unitIds.length === 0) return [];
  // 고른 단위만 속성 선택자로 찾는다. 예전에는 캔버스의 모든 단위(수천 개)를 훑어 걸러서,
  // 선택 · 스크롤 · 타이핑 반영 때마다 수십 ms 가 들었다. 아주 큰 범위만 예전 방식으로 훑는다.
  const candidates =
    unitIds.length <= 300
      ? document.querySelectorAll<HTMLElement>(unitIds.map((id) => `main [data-vdoc-unit="${CSS.escape(id)}"]`).join(","))
      : document.querySelectorAll<HTMLElement>("main [data-vdoc-unit]");
  const wanted = new Set(unitIds);
  return [...candidates].filter((el) => wanted.has(el.dataset.vdocUnit!) && !el.parentElement?.closest("[data-vdoc-unit]"));
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
      return `td[data-vdoc-unit="${sel}"], [data-vdoc-unit="${sel}"][data-unit-kind="slot"]:not(td *) {
        ${withinTable ? "" : "background-color: rgba(4, 114, 227, 0.07) !important;"}
        box-shadow: inset 0 0 0 1.5px rgba(4, 114, 227, 0.6) !important;
      }
      /* 이미지 같은 슬롯 아닌 단위: 배경 · 안쪽 그림자는 그림에 가려지므로 그림 "위"에 덮는다. */
      [data-vdoc-unit="${sel}"]:not([data-unit-kind="slot"]) { position: relative; }
      [data-vdoc-unit="${sel}"]:not([data-unit-kind="slot"])::after {
        content: ""; position: absolute; inset: 0; z-index: 5; pointer-events: none;
        background: rgba(4, 114, 227, 0.12); box-shadow: inset 0 0 0 1.5px rgba(4, 114, 227, 0.6);
      }`;
    })
    .join("\n");
  return <style>{css}</style>;
};

/** 범위를 감싸는 상자 (화면 좌표). */
function rangeBox(unitIds: string[]): DOMRect | null {
  const rects = rangeElements(unitIds).map((el) => el.getBoundingClientRect());
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  return new DOMRect(left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top);
}

type Phase =
  | { kind: "bar" }
  | { kind: "prompt" }
  | { kind: "preview"; map: Record<string, string>; picked: Set<string>; label: string }
  | { kind: "done"; message: string; tone: "ok" | "error" };

/**
 * 선택 도구는 단계적으로 펼친다 — 고를 때마다 큰 AI 바가 뜨지 않게.
 * - icon: 범위 오른쪽 위에 기본 아이콘 하나 (끌어서 Composer 에 놓을 수도 있다)
 * - menu: AI 디렉팅 · Composer 에 첨부 · 복사
 * - ai:   AI 작업창 (빠른 지시 · 직접 지시 · 칸별 미리보기 · 적용 / Staged / Composer)
 */
type Level = "icon" | "menu" | "ai";

const ICON_SIZE = 28;
const GAP = 6;

/** 선택 도구가 다루는 것: 여러 요소 범위, 없으면 지금 고른 슬롯 하나 · 블록 하나. */
interface ToolSelection {
  unitIds: string[];
  slotIds: string[];
  source: "drag" | "native" | "single";
  withinTable?: boolean;
}

function singleSelection(doc: VDocDocument | undefined, slotId: string | null, blockId: string | null): ToolSelection | null {
  if (!doc) return null;
  if (slotId && doc.slots[slotId]) return { unitIds: [slotId], slotIds: [slotId], source: "single" };
  const loc = blockId ? findBlock(doc, blockId) : null;
  if (!loc) return null;
  const units = getBlockUnits(loc.block).filter((u) => u.kind !== "slot" || doc.slots[u.slotId ?? u.unitId]);
  if (units.length === 0) return null;
  return { unitIds: units.map((u) => u.unitId), slotIds: units.filter((u) => u.kind === "slot").map((u) => u.unitId), source: "single" };
}

export const SlotRangeAiBar: React.FC = () => {
  const multi = useSlotSelectionStore((s) => s.slotRange);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const selectedBlockId = useSlotSelectionStore((s) => s.selectedBlockId);
  const doc = useStudioDocumentStore(selectActiveDocument);
  // 여러 요소를 고르지 않았어도, 슬롯 하나 · 블록 하나를 고르면 같은 선택 도구가 뜬다.
  const computed = React.useMemo<ToolSelection | null>(
    () => multi ?? singleSelection(doc, selectedSlotId, selectedBlockId),
    [multi, doc, selectedSlotId, selectedBlockId]
  );
  // 문서가 바뀔 때마다(타이핑 반영) 같은 범위의 새 객체가 생겨 위치 측정 effect 가 다시 돌지 않게,
  // 내용이 같으면 이전 객체를 유지한다.
  const stableRange = React.useRef<ToolSelection | null>(null);
  const sameRange = (a: ToolSelection | null, b: ToolSelection | null) =>
    a === b ||
    (!!a &&
      !!b &&
      a.source === b.source &&
      a.withinTable === b.withinTable &&
      a.unitIds.join("|") === b.unitIds.join("|") &&
      a.slotIds.join("|") === b.slotIds.join("|"));
  if (!sameRange(stableRange.current, computed)) stableRange.current = computed;
  const range = stableRange.current;
  const { copyUnitRange, deleteUnitRange } = useMutateCanvasBlocks();
  const actions = useRegistryList(aiRuntime.actions).filter((a) => a.surfaces.includes(SLOT_RANGE_SURFACE));
  const run = useInlineAiRun(aiRuntime);
  const [instruction, setInstruction] = React.useState("");
  const [level, setLevel] = React.useState<Level>("icon");
  const [phase, setPhase] = React.useState<Phase>({ kind: "bar" });
  const [copied, setCopied] = React.useState(false);
  const [box, setBox] = React.useState<DOMRect | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const lastLabel = React.useRef("AI 지시");
  const barRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rangeKey = range?.unitIds.join("|") ?? "";

  // 범위가 바뀌면 다시 아이콘부터
  React.useEffect(() => {
    setLevel("icon");
    setPhase({ kind: "bar" });
    setCopied(false);
    run.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  // 위치: 범위 상자를 스크롤 · 창 크기에 맞춰 따라간다 (백그라운드 탭에서도 돌도록 타이머)
  React.useEffect(() => {
    if (!range) return;
    let timer = 0;
    const measure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setBox(rangeBox(range.unitIds));
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

  const copy = React.useCallback(() => {
    if (!range) return;
    const text = rangeText(range.unitIds);
    if (range.source !== "single") {
      copyUnitRange(range.unitIds, text);
    } else {
      void navigator.clipboard?.writeText(text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [range, copyUnitRange]);

  const canDeleteRange = Boolean(range && (range.source !== "single" || selectedBlockId));

  const deleteSelection = React.useCallback(() => {
    if (!range || !canDeleteRange) return;
    if (deleteUnitRange(range.unitIds)) {
      document.querySelector<HTMLElement>("[data-vdoc-canvas-main]")?.focus({ preventScroll: true });
    }
  }, [range, canDeleteRange, deleteUnitRange]);

  // 펼친 AI 바를 Esc 로 먼저 접고, 범위 선택 Ctrl+C(TSV 복사) · Delete(범위 삭제)는 범위 선택 계층에서 처리한다.
  useKeyLayer(
    "editor",
    (e) => {
      if (e.key !== "Escape" || level === "icon") return false;
      e.preventDefault();
      if (level === "ai") run.cancel();
      setLevel("icon");
      return true;
    },
    Boolean(range) && level !== "icon"
  );

  useKeyLayer(
    "rangeSelection",
    (e) => {
      if (!range || range.source === "single") return false;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest("input, textarea, [data-testid='ai-composer-panel']")) return false;
      if (e.key === "Delete" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        deleteSelection();
        return true;
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return false;
      if (range.source === "native" && window.getSelection()?.toString()) return false;
      e.preventDefault();
      copy();
      return true;
    },
    Boolean(range && range.source !== "single")
  );

  // 메뉴는 바깥을 누르면 접힌다 (AI 작업창은 작업 중일 수 있어 그대로 둔다).
  React.useEffect(() => {
    if (level !== "menu") return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setLevel("icon");
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [level]);

  React.useEffect(() => {
    if (level === "ai" && phase.kind === "prompt") window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [level, phase.kind]);

  if (!range || !doc) return null;
  const ref = slotRangeRef(doc, range.slotIds, range.unitIds);
  const mediaCount = range.unitIds.length - range.slotIds.length;
  const lockedCount = range.slotIds.filter((id) => {
    const s = doc.slots[id];
    return !s || s.constraints?.locked;
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
    const store = useSlotSelectionStore.getState();
    if (range.source === "single") store.clearSelection();
    else store.setSlotRange(null);
  };

  // 자리: 범위 오른쪽 위 모서리 바로 위. 펼치면 오른쪽 끝을 맞춘 채 왼쪽 · 아래로 넓어진다. 캔버스 안에서만.
  const canvas = document.querySelector("main")?.getBoundingClientRect();
  const bounds = {
    left: (canvas?.left ?? 0) + 8,
    right: (canvas?.right ?? window.innerWidth) - 8,
    top: (canvas?.top ?? 0) + 8,
    bottom: (canvas?.bottom ?? window.innerHeight) - 8,
  };
  // 오른쪽 끝(right)으로 고정한다 — 펼칠 때 폭을 미리 몰라도 늘 왼쪽으로 넓어진다.
  const height = level === "ai" ? 84 : ICON_SIZE;
  const anchorRight = Math.min(box ? box.right : bounds.right, bounds.right);
  const anchorTop = box ? box.top - ICON_SIZE - GAP : bounds.top;
  const right = Math.max(0, window.innerWidth - anchorRight);
  const maxWidth = Math.max(ICON_SIZE, anchorRight - bounds.left);
  const top = Math.max(bounds.top, Math.min(anchorTop, bounds.bottom - height));
  const countLabel = `${range.slotIds.length}칸${mediaCount > 0 ? ` · 이미지 ${mediaCount}` : ""}`;

  return (
    <>
      {/* 하나만 고른 것은 슬롯 · 블록이 자기 선택 테두리를 그린다 */}
      {range.source !== "single" && <RangeHighlight unitIds={range.unitIds} withinTable={range.withinTable} />}
      {!dragging && (
        <div
          ref={barRef}
          data-testid="slot-range-ai-bar"
          data-level={level}
          data-keep-table-selection
          style={{ right, top, maxWidth }}
          className={`fixed z-[60] select-none ${SURFACE}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {level === "icon" && (
            <button
              type="button"
              data-testid="slot-range-toolbar-icon"
              {...attachable(() => [ref])}
              onClick={() => setLevel("menu")}
              title={`선택 도구 · ${countLabel}\n클릭: 도구 열기 · 끌기: Composer 에 첨부`}
              className="relative flex h-7 w-7 items-center justify-center rounded-lg text-[#0472e3] hover:bg-[#eef5fd] cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#0472e3] text-white text-[9.5px] font-bold leading-4 text-center">
                {range.unitIds.length}
              </span>
            </button>
          )}

          {level === "menu" && (
            <div className="flex items-center gap-0.5 p-1 whitespace-nowrap">
              <button
                type="button"
                data-testid="slot-range-ai-directing"
                onClick={() => {
                  setLevel("ai");
                  setPhase({ kind: "prompt" });
                }}
                className={PRIMARY}
                title="고른 요소들에 AI 로 지시"
              >
                <Wand2 className="w-3.5 h-3.5" /> AI 디렉팅
              </button>
              <button
                type="button"
                data-testid="slot-range-to-composer"
                onClick={() => {
                  attachToComposer([ref], { role: "target" });
                  setLevel("icon");
                }}
                className={BUTTON}
                title="Composer 에 첨부 (Ctrl+L)"
              >
                <MessageSquareShare className="w-3.5 h-3.5 text-gray-500" /> Composer 에 첨부
              </button>
              <button type="button" data-testid="slot-range-copy" onClick={copy} className={BUTTON} title="복사 (Ctrl+C)">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5 text-gray-500" />}
                {copied ? "복사됨" : "복사"}
              </button>
              <button
                type="button"
                data-testid="slot-range-wrap-section"
                onClick={() => {
                  const doc = selectActiveDocument(useStudioDocumentStore.getState());
                  if (!doc) return;
                  const created = useAssetLibraryStore.getState().createSectionFromSelection(doc, range.unitIds);
                  if (created) {
                    const layout = useWorkspaceLayoutStore.getState();
                    layout.setLeftSidebarOpen(true);
                    layout.setActiveActivityTab("assets");
                  }
                  useSlotSelectionStore.getState().setSlotRange(null);
                  setLevel("icon");
                }}
                className={BUTTON}
                title="선택 영역을 새 섹션으로 묶어 Assets에 추가 (Wrap in new section)"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#0d99ff]" /> Wrap in new section
              </button>
              {canDeleteRange && (
                <>
                  <span className="mx-0.5 h-4 w-px bg-[#eaeaea]" />
                  <button
                    type="button"
                    data-testid="slot-range-delete"
                    onClick={deleteSelection}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="선택 영역 삭제 (Delete)"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 삭제
                  </button>
                </>
              )}
            </div>
          )}

          {level === "ai" && (
            <>
              <div className="flex items-center gap-1 p-1 whitespace-nowrap">
                <span
                  {...attachable(() => [ref])}
                  title={`${ref.hint ?? ""}\n끌어서 Composer 에 놓으면 첨부`}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#eef5fd] px-1.5 text-[11.5px] font-semibold text-[#0363c7] cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-3 h-3 opacity-60" />
                  {countLabel}
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
                  <Wand2 className="w-3.5 h-3.5" /> 직접 지시
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
                  title="접기 (Esc)"
                  onClick={() => {
                    run.cancel();
                    setLevel("icon");
                  }}
                  className={ICON_BUTTON}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="선택 해제" onClick={close} className={ICON_BUTTON}>
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
                    placeholder="고른 요소들에 지시 (예: 결의사항을 항목별 한 줄로)"
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
                <div className={`w-0 min-w-full border-t border-[#eaeaea] px-2.5 py-2 ${phase.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
                  {phase.message}
                </div>
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
                    setLevel("icon");
                  }}
                  onRetry={() => run.retry()}
                  onCancel={() => setPhase({ kind: "prompt" })}
                />
              )}
            </>
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
