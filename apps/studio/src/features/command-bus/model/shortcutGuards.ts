export type CanvasShortcutAction = "copy-block" | "paste-block" | "delete-block" | null;

export interface CanvasShortcutContext {
  key: string;
  ctrlOrMeta: boolean;
  shiftKey: boolean;
  isEditingField: boolean;
  hasTextSelection: boolean;
  selectedBlockId: string | null;
  selectedSlotId: string | null;
  hasClipboardBlock: boolean;
  hasRangeSelection?: boolean;
}

/**
 * 캔버스 블록 단축키(`Ctrl+C`, `Ctrl+V`, `Delete`) 실행 여부를 판정한다.
 * - 입력 필드(`INPUT` · `TEXTAREA` · `contentEditable`)에서는 가로채지 않는다.
 * - `StaticSlotView` 등에서 텍스트를 드래그 선택(`hasTextSelection`)하거나 다중 범위 선택(`hasRangeSelection`)한 경우 가로채지 않는다.
 * - 블록 삭제는 `Delete` 키만 허용한다 (`Backspace` 는 브라우저/편집기 동작을 위해 차단).
 */
export function resolveCanvasShortcutAction(ctx: CanvasShortcutContext): CanvasShortcutAction {
  if (ctx.isEditingField) return null;

  if (ctx.key === "Delete") {
    if (ctx.ctrlOrMeta || ctx.shiftKey || ctx.hasRangeSelection) return null;
    if (!ctx.selectedBlockId || ctx.selectedSlotId || ctx.hasTextSelection) return null;
    return "delete-block";
  }

  if (!ctx.ctrlOrMeta || ctx.shiftKey) return null;
  const lower = ctx.key.toLowerCase();

  if (lower === "c") {
    if (ctx.hasRangeSelection || !ctx.selectedBlockId || ctx.selectedSlotId || ctx.hasTextSelection) return null;
    return "copy-block";
  }

  if (lower === "v") {
    if (!ctx.hasClipboardBlock || ctx.selectedSlotId || ctx.hasTextSelection) return null;
    return "paste-block";
  }

  return null;
}

export type StudioEscapeAction =
  | "abort-ai"
  | "close-help"
  | "close-composer"
  | "close-table"
  | "collapse-range-bar"
  | "clear-range"
  | "close-block-menu"
  | "select-owner-block"
  | "clear-block-selection"
  | "dismiss-history"
  | null;

export interface EscapeContext {
  isAiRunning: boolean;
  shortcutHelpOpen: boolean;
  composerOpenSlotId: string | null;
  hasTableOverlay: boolean;
  isRangeBarExpanded: boolean;
  hasRangeSelection: boolean;
  hasBlockMenuOpen: boolean;
  selectedSlotId: string | null;
  selectedBlockId: string | null;
  hasHistoryMessage: boolean;
}

/**
 * `Esc` 키 입력 시 상태별 해소 우선순위를 판정한다.
 * (모달/편집기 → 표 범위/메뉴 → AI 범위 바 → 블록 메뉴 → 칸 편집→블록 선택 승격 → 블록 선택 해제 → 토스트 닫기)
 */
export function resolveEscapeAction(ctx: EscapeContext): StudioEscapeAction {
  if (ctx.isAiRunning) return "abort-ai";
  if (ctx.shortcutHelpOpen) return "close-help";
  if (ctx.composerOpenSlotId) return "close-composer";
  if (ctx.hasTableOverlay) return "close-table";
  if (ctx.isRangeBarExpanded) return "collapse-range-bar";
  if (ctx.hasRangeSelection) return "clear-range";
  if (ctx.hasBlockMenuOpen) return "close-block-menu";
  if (ctx.selectedSlotId) return "select-owner-block";
  if (ctx.selectedBlockId) return "clear-block-selection";
  if (ctx.hasHistoryMessage) return "dismiss-history";
  return null;
}
