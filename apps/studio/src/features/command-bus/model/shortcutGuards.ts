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
}

/**
 * 캔버스 블록 단축키(`Ctrl+C`, `Ctrl+V`, `Delete`) 실행 여부를 판정한다.
 * - 입력 필드(`INPUT` · `TEXTAREA` · `contentEditable`)에서는 가로채지 않는다.
 * - `StaticSlotView` 등에서 텍스트를 드래그 선택(`hasTextSelection`)한 경우 `Ctrl+C` · `Delete` 를 가로채지 않는다.
 * - 블록 삭제는 `Delete` 키만 허용한다 (`Backspace` 는 브라우저/편집기 동작을 위해 차단).
 */
export function resolveCanvasShortcutAction(ctx: CanvasShortcutContext): CanvasShortcutAction {
  if (ctx.isEditingField) return null;

  if (ctx.key === "Delete") {
    if (ctx.ctrlOrMeta || ctx.shiftKey) return null;
    if (!ctx.selectedBlockId || ctx.selectedSlotId || ctx.hasTextSelection) return null;
    return "delete-block";
  }

  if (!ctx.ctrlOrMeta || ctx.shiftKey) return null;
  const lower = ctx.key.toLowerCase();

  if (lower === "c") {
    if (!ctx.selectedBlockId || ctx.selectedSlotId || ctx.hasTextSelection) return null;
    return "copy-block";
  }

  if (lower === "v") {
    if (!ctx.hasClipboardBlock || ctx.selectedSlotId || ctx.hasTextSelection) return null;
    return "paste-block";
  }

  return null;
}

