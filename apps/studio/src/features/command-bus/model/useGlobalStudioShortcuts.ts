import { useEffect, useLayoutEffect, useRef } from "react";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useBlockClipboardStore, useSlotSelectionStore } from "@/entities/slot";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { useHistoryStore } from "@/shared/lib";

import { resolveCanvasShortcutAction } from "./shortcutGuards";

export interface CanvasBlockShortcutHandlers {
  onCopySelectedBlock?: () => void;
  onPasteBlock?: () => void;
  onDeleteSelectedBlock?: () => void;
}

/**
 * Global keyboard hygiene & reversible command bus shortcuts:
 * - `Ctrl+Z` / `Cmd+Z`: 공용 이력에서 가장 마지막 변경(프로젝트든 문서든)을 되돌린다
 * - `Ctrl+Y` / `Cmd+Shift+Z`: 다시 실행
 * - `Ctrl+C` / `Ctrl+V` / `Delete` (블록 선택 · 텍스트 미선택 상태): 캔버스 블록 복사 · 붙여넣기 · 잠금 제외 삭제
 * - `Escape`:
 *    1) 실행 중인 AI 를 중단 (요청 중단 + 서버 취소, 버튼과 같은 경로)
 *    2) 단축키 도움말 닫기
 *    3) 인라인 슬롯 작성기 닫기
 *    4) 되돌리기 안내 닫기
 * - `?` (편집 필드 밖): 단축키 도움말 열고 닫기
 * - `Ctrl+K` / `Cmd+K`: 선택한 슬롯의 인라인 AI 작성기 열고 닫기 (편집 중에도 동작)
 *
 * 리스너는 한 번만 등록하고, 누를 때마다 저장소의 최신 상태를 읽는다.
 */
export function useGlobalStudioShortcuts(blockActions?: CanvasBlockShortcutHandlers): void {
  const actionsRef = useRef(blockActions);
  useLayoutEffect(() => {
    actionsRef.current = blockActions;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingField =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const staging = useAiStagingStore.getState();
      const layout = useWorkspaceLayoutStore.getState();
      const slots = useSlotSelectionStore.getState();
      const history = useHistoryStore.getState();

      if (e.key === "Escape") {
        if (staging.isRunning) {
          e.preventDefault();
          staging.abortRun();
        } else if (layout.shortcutHelpOpen) {
          e.preventDefault();
          layout.setShortcutHelpOpen(false);
        } else if (slots.composerOpenSlotId) {
          e.preventDefault();
          slots.setComposerOpenSlotId(null);
        } else if (slots.selectedBlockId || slots.selectedSlotId) {
          e.preventDefault();
          slots.clearSelection();
        } else {
          history.dismissMessage();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (slots.selectedSlotId) slots.toggleComposerForSlot(slots.selectedSlotId);
        return;
      }

      if (isEditingField) return;

      if (e.key === "?") {
        e.preventDefault();
        layout.setShortcutHelpOpen(!layout.shortcutHelpOpen);
        return;
      }

      if (!e.defaultPrevented && !target?.closest?.('[role="tree"], [role="dialog"]')) {
        const sel = window.getSelection();
        const hasTextSelection = Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
        const canvasAction = resolveCanvasShortcutAction({
          key: e.key,
          ctrlOrMeta: e.ctrlKey || e.metaKey,
          shiftKey: e.shiftKey,
          isEditingField,
          hasTextSelection,
          selectedBlockId: slots.selectedBlockId,
          selectedSlotId: slots.selectedSlotId,
          hasClipboardBlock: Boolean(useBlockClipboardStore.getState().copied),
        });
        if (canvasAction === "copy-block") {
          e.preventDefault();
          actionsRef.current?.onCopySelectedBlock?.();
          return;
        }
        if (canvasAction === "paste-block") {
          e.preventDefault();
          actionsRef.current?.onPasteBlock?.();
          return;
        }
        if (canvasAction === "delete-block") {
          e.preventDefault();
          actionsRef.current?.onDeleteSelectedBlock?.();
          return;
        }
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey && history.past.length > 0) {
        e.preventDefault();
        void history.undo();
      } else if ((key === "y" || (key === "z" && e.shiftKey)) && history.future.length > 0) {
        e.preventDefault();
        void history.redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
