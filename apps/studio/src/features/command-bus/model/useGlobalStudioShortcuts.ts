import { useEffect, useLayoutEffect, useRef } from "react";

import { useActiveSlotEditorStore } from "@vibe/slot-editor";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useBlockClipboardStore, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useHistoryStore } from "@/shared/lib";

import { studioKeyLayers } from "./keyLayers";
import { resolveCanvasShortcutAction } from "./shortcutGuards";

export interface CanvasBlockShortcutHandlers {
  onCopySelectedBlock?: () => void;
  onPasteBlock?: () => void;
  onDeleteSelectedBlock?: () => void;
  onFocusCanvas?: () => void;
}

function isEditableElement(target: HTMLElement | null): boolean {
  return Boolean(
    target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

/**
 * 스튜디오 키보드 명령 버스 (`editor → table → rangeSelection → canvas → global`):
 * - 단일 `window` 리스너를 통해 `studioKeyLayers`를 순서대로 평가한다.
 * - `Esc` 순서: 실행 중 AI 중단 · 도움말 닫기 · 인라인 작성기 닫기 → (표/범위/메뉴) → 편집 중 칸을 소유 블록 선택으로 승격 → 블록 선택 해제 → 토스트 닫기.
 * - `Ctrl+C` / `Ctrl+V` / `Delete` (블록 선택 상태): `shortcutGuards` 판정에 따라 블록 복사·붙여넣기·삭제.
 * - `Ctrl+Z` / `Ctrl+Y` / `Cmd+Shift+Z`, `?`, `Ctrl+K`.
 */
export function useGlobalStudioShortcuts(blockActions?: CanvasBlockShortcutHandlers): void {
  const actionsRef = useRef(blockActions);
  useLayoutEffect(() => {
    actionsRef.current = blockActions;
  });

  useEffect(() => {
    const offEditor = studioKeyLayers.register("editor", (e) => {
      const slots = useSlotSelectionStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (slots.selectedSlotId) slots.toggleComposerForSlot(slots.selectedSlotId);
        return true;
      }

      if (e.key !== "Escape") return false;

      const staging = useAiStagingStore.getState();
      if (staging.isRunning) {
        e.preventDefault();
        staging.abortRun();
        return true;
      }

      const layout = useWorkspaceLayoutStore.getState();
      if (layout.shortcutHelpOpen) {
        e.preventDefault();
        layout.setShortcutHelpOpen(false);
        return true;
      }

      if (slots.composerOpenSlotId) {
        e.preventDefault();
        slots.setComposerOpenSlotId(null);
        return true;
      }

      return false;
    });

    const offCanvas = studioKeyLayers.register("canvas", (e) => {
      const target = e.target as HTMLElement | null;
      const slots = useSlotSelectionStore.getState();

      if (e.key === "Escape") {
        if (target?.closest?.('[role="dialog"], [role="tree"], [data-testid="ai-composer-panel"]')) {
          return false;
        }
        // 캔버스 슬롯(또는 캔버스 내부)에서 Esc 를 누르면 편집을 마치고 해당 블록을 선택한다.
        if (slots.selectedSlotId) {
          if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return false;
          e.preventDefault();
          const activeEd = useActiveSlotEditorStore.getState().activeEditor;
          if (activeEd && !activeEd.isDestroyed && activeEd.isFocused) {
            activeEd.commands.blur();
          }
          const activeEl = document.activeElement as HTMLElement | null;
          if (activeEl?.isContentEditable) activeEl.blur();

          const doc = selectActiveDocument(useStudioDocumentStore.getState());
          const ownerBlockId = slots.selectOwnerBlockFromSlot(doc);
          if (ownerBlockId) actionsRef.current?.onFocusCanvas?.();
          return true;
        }

        if (slots.selectedBlockId) {
          e.preventDefault();
          slots.clearSelection();
          return true;
        }
        return false;
      }

      const isEditingField = isEditableElement(target);
      if (isEditingField) return false;
      if (target?.closest?.('[role="tree"], [role="dialog"]')) return false;

      const sel = window.getSelection();
      const hasTextSelection = Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
      const hasRangeSelection = Boolean(slots.slotRange || slots.tableSelection?.range);

      const canvasAction = resolveCanvasShortcutAction({
        key: e.key,
        ctrlOrMeta: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        isEditingField,
        hasTextSelection,
        selectedBlockId: slots.selectedBlockId,
        selectedSlotId: slots.selectedSlotId,
        hasClipboardBlock: Boolean(useBlockClipboardStore.getState().copied),
        hasRangeSelection,
      });

      if (canvasAction === "copy-block") {
        e.preventDefault();
        actionsRef.current?.onCopySelectedBlock?.();
        return true;
      }
      if (canvasAction === "paste-block") {
        e.preventDefault();
        actionsRef.current?.onPasteBlock?.();
        return true;
      }
      if (canvasAction === "delete-block") {
        e.preventDefault();
        actionsRef.current?.onDeleteSelectedBlock?.();
        return true;
      }

      return false;
    });

    const offGlobal = studioKeyLayers.register("global", (e) => {
      const target = e.target as HTMLElement | null;
      const history = useHistoryStore.getState();

      if (e.key === "Escape") {
        history.dismissMessage();
        return true;
      }

      if (isEditableElement(target)) return false;

      if (e.key === "?") {
        e.preventDefault();
        const layout = useWorkspaceLayoutStore.getState();
        layout.setShortcutHelpOpen(!layout.shortcutHelpOpen);
        return true;
      }

      if (!(e.ctrlKey || e.metaKey)) return false;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey && history.past.length > 0) {
        e.preventDefault();
        void history.undo();
        return true;
      }
      if ((key === "y" || (key === "z" && e.shiftKey)) && history.future.length > 0) {
        e.preventDefault();
        void history.redo();
        return true;
      }
      return false;
    });

    const onKeyDown = (e: KeyboardEvent) => {
      studioKeyLayers.dispatch(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      offEditor();
      offCanvas();
      offGlobal();
    };
  }, []);
}
