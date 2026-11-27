import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  Check,
  ChevronUp,
  ClipboardCopy,
  FileText,
  Languages,
  MessageSquareShare,
  Minimize2,
  MoreHorizontal,
  PencilLine,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { findBlock, getBlockSlotIds, slotPlainText, type VDocDocument } from "@vibe/vdoc-schema";
import { describeCanvasSelection, type CanvasSelection } from "@vibe/canvas-state";

/** 본 프로젝트(`apps/studio` `SlotRangeAiBar`)와 동일한 표면 · 버튼 규격 */
const SURFACE =
  "rounded-lg border border-[#eaeaea] bg-white shadow-[0px_4px_12px_0px_rgba(47,44,44,0.14)] text-[12px] text-gray-800";
const BUTTON =
  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-gray-800 hover:bg-neutral-100 cursor-pointer disabled:opacity-40 disabled:cursor-default";
const ICON_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-neutral-100 hover:text-gray-800 cursor-pointer";
const PRIMARY =
  "inline-flex h-7 items-center gap-1 rounded-md bg-[#0472e3] px-2 text-[12px] font-semibold text-white hover:bg-[#0363c7] cursor-pointer disabled:opacity-40 disabled:cursor-default";

const ICON_SIZE = 28;
const GAP = 6;

type Level = "icon" | "menu" | "ai";

export interface VDocQuickDirectAction {
  readonly id: string;
  readonly label: string;
  readonly instruction: string;
  readonly icon: "minimize" | "pencil" | "file" | "wand" | "languages";
}

export const VDOC_QUICK_DIRECT_ACTIONS: readonly VDocQuickDirectAction[] = [
  {
    id: "summarize",
    label: "요약",
    instruction: "선택한 영역의 핵심 내용만 간결하게 요약해줘",
    icon: "minimize",
  },
  {
    id: "polish",
    label: "다듬기",
    instruction: "선택한 영역의 문장과 흐름을 더 명확하고 자연스럽게 다듬어줘",
    icon: "pencil",
  },
  {
    id: "evidence",
    label: "근거 보강",
    instruction: "선택한 영역의 주장에 맞는 리소스 근거와 출처를 확인해 보강해줘",
    icon: "file",
  },
  {
    id: "expand",
    label: "확장",
    instruction: "선택한 영역의 내용을 맥락에 맞게 더 구체적으로 확장해줘",
    icon: "wand",
  },
  {
    id: "translate",
    label: "영문 번역",
    instruction: "선택한 영역을 자연스러운 영어로 번역해줘",
    icon: "languages",
  },
];

const QUICK_ICON: Record<VDocQuickDirectAction["icon"], React.ComponentType<{ className?: string }>> = {
  minimize: Minimize2,
  pencil: PencilLine,
  file: FileText,
  wand: Wand2,
  languages: Languages,
};

export interface VDocSelectionTarget {
  /** DOM 기준점 및 `ai.sendAnchored("vdoc", ...)` 에 넘길 정확한 단위 ID 목록 (슬롯 ID 또는 블록 ID) */
  readonly unitIds: readonly string[];
  readonly slotIds: readonly string[];
  readonly blockIds: readonly string[];
  readonly pageId: string | undefined;
  readonly summary: string;
  readonly plainText: string;
  readonly countLabel: string;
  readonly canDelete: boolean;
}

/**
 * `.vdoc` 캔버스 선택 상태 → 점 세 개(`⋯`) 인라인 AI 바의 대상 정보 (순수 함수).
 * 다중 선택(`selection.items`)을 우선하고, 없으면 단일 선택된 슬롯/블록으로 폴백한다.
 */
export function resolveVDocSelectionTarget(
  doc: VDocDocument,
  selection: CanvasSelection | null | undefined,
  selectedSlotId: string | null,
  selectedBlockId: string | null,
  activePageId?: string | null
): VDocSelectionTarget | null {
  const unitIds: string[] = [];
  const slotIds: string[] = [];
  const blockIds: string[] = [];
  const pushUnique = (arr: string[], id: string) => {
    if (!arr.includes(id)) arr.push(id);
  };

  if (selection && selection.items.length > 0) {
    for (const item of selection.items) {
      if (item.kind === "slot") {
        if (!doc.slots[item.id]) continue;
        pushUnique(slotIds, item.id);
        pushUnique(unitIds, item.id);
      } else {
        const bid = item.kind === "block" ? item.id : item.blockId;
        if (bid && findBlock(doc, bid)) {
          pushUnique(blockIds, bid);
          pushUnique(unitIds, bid);
        }
      }
    }
  } else if (selectedSlotId && doc.slots[selectedSlotId]) {
    pushUnique(slotIds, selectedSlotId);
    pushUnique(unitIds, selectedSlotId);
  } else if (selectedBlockId && findBlock(doc, selectedBlockId)) {
    pushUnique(blockIds, selectedBlockId);
    pushUnique(unitIds, selectedBlockId);
  }

  if (unitIds.length === 0) return null;

  const snap = selection?.items.length ? describeCanvasSelection(doc, selection, activePageId) : null;
  const pageId =
    snap?.pageId ??
    (blockIds[0] ? findBlock(doc, blockIds[0])?.pageId : undefined) ??
    activePageId ??
    doc.pages[0]?.pageId;

  const lines: string[] = [];
  for (const id of unitIds) {
    const slot = doc.slots[id];
    if (slot) {
      const t = slotPlainText(slot.content).trim();
      if (t) lines.push(t);
      continue;
    }
    const loc = findBlock(doc, id);
    if (!loc) continue;
    const parts: string[] = [];
    for (const sid of getBlockSlotIds(loc.block)) {
      const t = slotPlainText(doc.slots[sid]?.content ?? "").trim();
      if (t) parts.push(t);
    }
    if (parts.length > 0) lines.push(parts.join(" "));
    else if (loc.block.title) lines.push(loc.block.title);
  }

  const plainText = snap?.text || lines.join("\n");
  const allSlots = slotIds.length === unitIds.length;
  const allBlocks = blockIds.length === unitIds.length;
  const countLabel = allSlots
    ? `${slotIds.length}칸`
    : allBlocks
      ? `블록 ${blockIds.length}개`
      : `${unitIds.length}개 항목`;

  const summary = snap?.summary ?? `${doc.title} › ${countLabel}`;

  return {
    unitIds,
    slotIds,
    blockIds,
    pageId,
    summary,
    plainText,
    countLabel,
    canDelete: blockIds.length > 0,
  };
}

function measureTargetRect(container: HTMLElement, unitIds: readonly string[]): DOMRect | null {
  const rects: DOMRect[] = [];
  for (const id of unitIds) {
    const esc = CSS.escape(id);
    const el = container.querySelector<HTMLElement>(`[data-slot-id="${esc}"], [data-block-id="${esc}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) rects.push(r);
  }
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

export interface VDocSelectionAiBarProps {
  readonly doc: VDocDocument;
  readonly selection: CanvasSelection | null | undefined;
  readonly selectedBlockId: string | null;
  readonly selectedSlotId: string | null;
  readonly activePageId: string;
  readonly canvasEl: HTMLElement | null;
  readonly zoom: number;
  readonly enabled: boolean;
  readonly dragging: boolean;
  readonly onAiDirect: (prompt: string, target: VDocSelectionTarget) => void;
  readonly onAttachToComposer: (target: VDocSelectionTarget) => void;
  readonly onDeleteBlocks?: (blockIds: readonly string[]) => void;
  readonly onClearSelection: () => void;
  readonly onDraftTargetChange?: (unitIds: readonly string[]) => void;
}

/**
 * `.vdoc` 선택 범위 오른쪽 위에 뜨는 점 세 개(`⋯`) 단계형 인라인 AI 바.
 * - `apps/studio` 의 `SlotRangeAiBar` UI(`icon` → `menu` → `ai`)를 그대로 이식
 * - 실행 엔진은 `AI Direct`(기준점 백그라운드 세션 `ai.sendAnchored("vdoc", ...)`)를 사용한다.
 */
export const VDocSelectionAiBar: React.FC<VDocSelectionAiBarProps> = ({
  doc,
  selection,
  selectedBlockId,
  selectedSlotId,
  activePageId,
  canvasEl,
  zoom,
  enabled,
  dragging,
  onAiDirect,
  onAttachToComposer,
  onDeleteBlocks,
  onClearSelection,
  onDraftTargetChange,
}) => {
  const liveTarget = useMemo(
    () =>
      enabled
        ? resolveVDocSelectionTarget(doc, selection, selectedSlotId, selectedBlockId, activePageId)
        : null,
    [enabled, doc, selection, selectedSlotId, selectedBlockId, activePageId]
  );

  const [uiState, setUiState] = useState<{
    readonly level: Level;
    readonly selectionKey: string;
    readonly frozenTarget: VDocSelectionTarget | null;
    readonly copied: boolean;
  }>({ level: "icon", selectionKey: "", frozenTarget: null, copied: false });
  const [instruction, setInstruction] = useState("");
  const [box, setBox] = useState<DOMRect | null>(null);

  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const liveKey = liveTarget ? liveTarget.unitIds.join("|") : "";
  const isAiOpen = enabled && uiState.level === "ai";
  const level: Level = !enabled
    ? "icon"
    : isAiOpen
      ? "ai"
      : uiState.level === "menu" && uiState.selectionKey === liveKey
        ? "menu"
        : "icon";
  const copied = uiState.copied && uiState.selectionKey === liveKey;
  const activeTarget: VDocSelectionTarget | null = !enabled
    ? null
    : isAiOpen
      ? liveTarget && liveKey !== uiState.selectionKey
        ? liveTarget
        : (uiState.frozenTarget ?? liveTarget)
      : liveTarget;
  const activeKey = activeTarget ? activeTarget.unitIds.join("|") : "";

  const closeToIcon = useCallback(() => {
    setUiState({ level: "icon", selectionKey: "", frozenTarget: null, copied: false });
  }, []);

  // AI 입력 단계일 때만 AnchorDraft 하이라이트로 대상 고정 표시 (키 변화가 있을 때만 호출)
  const prevDraftKeyRef = useRef("");
  useEffect(() => {
    const nextIds = level === "ai" && activeTarget ? activeTarget.unitIds : [];
    const nextKey = nextIds.join("|");
    if (prevDraftKeyRef.current === nextKey) return;
    prevDraftKeyRef.current = nextKey;
    onDraftTargetChange?.(nextIds);
  }, [level, activeKey, activeTarget, onDraftTargetChange]);

  useEffect(
    () => () => {
      if (prevDraftKeyRef.current) {
        prevDraftKeyRef.current = "";
        onDraftTargetChange?.([]);
      }
    },
    [onDraftTargetChange]
  );

  // 메뉴/AI 창 바깥 클릭 및 Escape 처리
  useEffect(() => {
    if (level === "icon") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeToIcon();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [level, closeToIcon]);

  useEffect(() => {
    if (level !== "menu") return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        closeToIcon();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [level, closeToIcon]);

  useEffect(() => {
    if (level === "ai") {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [level]);

  // 선택 대상 DOM 사각형 추적 (스크롤 · 줌 · 창 크기 변경에 동기화)
  useLayoutEffect(() => {
    if (!canvasEl || !activeTarget || dragging) return;
    const unitIds = activeTarget.unitIds;
    let timer = 0;
    const measureNow = () => {
      setBox(unitIds.length ? measureTargetRect(canvasEl, unitIds) : null);
    };
    const scheduleMeasure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measureNow, 16);
    };
    const raf = window.requestAnimationFrame(measureNow);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    ro?.observe(canvasEl);
    window.addEventListener("scroll", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("pointerup", scheduleMeasure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      ro?.disconnect();
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("pointerup", scheduleMeasure, true);
    };
  }, [canvasEl, activeKey, zoom, dragging, activeTarget]);

  const dispatchPrompt = useCallback(
    (rawPrompt: string) => {
      const prompt = rawPrompt.trim();
      if (!prompt || !activeTarget) return;
      onAiDirect(prompt, activeTarget);
      setInstruction("");
      closeToIcon();
    },
    [activeTarget, onAiDirect, closeToIcon]
  );

  const handleCopy = useCallback(() => {
    if (!activeTarget) return;
    void navigator.clipboard?.writeText(activeTarget.plainText);
    setUiState((prev) => ({ ...prev, selectionKey: liveKey, copied: true }));
    window.setTimeout(() => {
      setUiState((prev) => (prev.copied ? { ...prev, copied: false } : prev));
    }, 1500);
  }, [activeTarget, liveKey]);

  if (!enabled || !activeTarget || !canvasEl || !box || dragging) return null;

  const canvasRect = canvasEl.getBoundingClientRect();
  const bounds = {
    left: canvasRect.left + 8,
    right: canvasRect.right - 8,
    top: canvasRect.top + 8,
    bottom: canvasRect.bottom - 8,
  };

  // 선택 대상이 현재 스크롤 뷰포트 바깥으로 완전히 나가면 숨긴다
  const completelyOffscreen =
    box.bottom < bounds.top ||
    box.top > bounds.bottom ||
    box.right < bounds.left ||
    box.left > bounds.right;
  if (completelyOffscreen) return null;

  const estimatedHeight = level === "ai" ? 84 : ICON_SIZE;
  const anchorRight = Math.min(box.right, bounds.right);
  const anchorTop = box.top - ICON_SIZE - GAP;
  const right = Math.max(8, window.innerWidth - anchorRight);
  const maxWidth = Math.max(ICON_SIZE, anchorRight - bounds.left);
  const top = Math.max(bounds.top, Math.min(anchorTop, bounds.bottom - estimatedHeight));

  const bar = (
    <div
      ref={barRef}
      data-testid="vdoc-selection-ai-bar"
      data-level={level}
      data-keep-table-selection
      style={{ right, top, maxWidth }}
      className={`fixed z-[60] select-none ${SURFACE}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {level === "icon" && (
        <button
          type="button"
          data-testid="vdoc-selection-toolbar-icon"
          onClick={() =>
            setUiState({
              level: "menu",
              selectionKey: liveKey,
              frozenTarget: null,
              copied: false,
            })
          }
          title={`선택 도구 · ${activeTarget.countLabel}\n클릭: AI Direct · Composer 첨부 · 복사`}
          className="relative flex h-7 w-7 items-center justify-center rounded-lg text-[#0472e3] hover:bg-[#eef5fd] cursor-pointer transition-transform hover:scale-105"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#0472e3] text-white text-[9.5px] font-bold leading-4 text-center shadow-xs">
            {activeTarget.unitIds.length}
          </span>
        </button>
      )}

      {level === "menu" && (
        <div className="flex items-center gap-0.5 p-1 whitespace-nowrap">
          <button
            type="button"
            data-testid="vdoc-selection-ai-direct"
            onClick={() =>
              setUiState({
                level: "ai",
                selectionKey: liveKey,
                frozenTarget: activeTarget,
                copied: false,
              })
            }
            className={PRIMARY}
            title="고른 영역에 AI Direct 지시 던지기 (뒤에서 실행 · 끝나면 알림)"
          >
            <Wand2 className="w-3.5 h-3.5" /> AI Direct
          </button>
          <button
            type="button"
            data-testid="vdoc-selection-to-composer"
            onClick={() => {
              onAttachToComposer(activeTarget);
              closeToIcon();
            }}
            className={BUTTON}
            title="메인 AI Composer 에 첨부"
          >
            <MessageSquareShare className="w-3.5 h-3.5 text-gray-500" /> Composer 에 첨부
          </button>
          <button
            type="button"
            data-testid="vdoc-selection-copy"
            onClick={handleCopy}
            className={BUTTON}
            title="텍스트 복사"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ClipboardCopy className="w-3.5 h-3.5 text-gray-500" />
            )}
            {copied ? "복사됨" : "복사"}
          </button>
          {activeTarget.canDelete && onDeleteBlocks && (
            <>
              <span className="mx-0.5 h-4 w-px bg-[#eaeaea]" />
              <button
                type="button"
                data-testid="vdoc-selection-delete"
                onClick={() => {
                  onDeleteBlocks(activeTarget.blockIds);
                  closeToIcon();
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-rose-600 hover:bg-rose-50 cursor-pointer"
                title="선택 블록 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </button>
            </>
          )}
        </div>
      )}

      {level === "ai" && (
        <div className="min-w-[360px]">
          <div className="flex items-center gap-1 overflow-x-auto p-1 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span
              title={`${activeTarget.summary} — 백그라운드 AI Direct 세션으로 실행됩니다`}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-[#eef5fd] px-2 text-[11.5px] font-semibold text-[#0363c7]"
            >
              <Sparkles className="w-3 h-3" />
              {activeTarget.countLabel}
            </span>
            {VDOC_QUICK_DIRECT_ACTIONS.map((action) => {
              const Icon = QUICK_ICON[action.icon];
              return (
                <button
                  key={action.id}
                  type="button"
                  data-testid={`vdoc-selection-action-${action.id}`}
                  title={action.instruction}
                  onClick={() => dispatchPrompt(action.instruction)}
                  className={`${BUTTON} shrink-0`}
                >
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  {action.label}
                </button>
              );
            })}
            <span className="mx-0.5 h-4 w-px shrink-0 bg-[#eaeaea]" />
            <button
              type="button"
              title="접기 (Esc)"
              onClick={closeToIcon}
              className={`${ICON_BUTTON} shrink-0`}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="선택 해제"
              onClick={() => {
                closeToIcon();
                onClearSelection();
              }}
              className={`${ICON_BUTTON} shrink-0`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <form
            data-testid="vdoc-selection-ai-form"
            className="flex items-center gap-1.5 border-t border-[#eaeaea] px-2 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              dispatchPrompt(instruction);
            }}
          >
            <input
              ref={inputRef}
              data-testid="vdoc-selection-ai-input"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") {
                  closeToIcon();
                }
              }}
              placeholder={`${activeTarget.countLabel}에 AI Direct 지시 — 뒤에서 실행되고 끝나면 알려 줍니다`}
              className="h-7 min-w-0 flex-1 rounded-md border border-[#eaeaea] bg-white px-2 text-[12px] text-gray-800 placeholder-gray-400 focus:border-[#0472e3] focus:outline-none select-text"
            />
            <button
              type="submit"
              data-testid="vdoc-selection-ai-send"
              disabled={!instruction.trim()}
              className={PRIMARY}
              title="AI Direct 던지기 (Enter)"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>던지기</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onAttachToComposer(activeTarget);
                closeToIcon();
              }}
              className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-gray-500 hover:bg-neutral-100 hover:text-gray-800 cursor-pointer"
              title="메인 Composer 에 첨부만 하기"
            >
              Composer
            </button>
          </form>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(bar, document.body) : null;
};
