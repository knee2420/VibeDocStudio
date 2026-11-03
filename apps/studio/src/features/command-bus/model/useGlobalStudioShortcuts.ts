import { useEffect } from "react";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";

/**
 * Global keyboard hygiene & reversible command bus shortcuts:
 * - `Ctrl+Z` / `Cmd+Z`: Undo project/outliner or document structural change
 * - `Ctrl+Y` / `Cmd+Shift+Z`: Redo
 * - `Escape`:
 *    1) Abort active AI streaming (`stopAiStreaming(true)`)
 *    2) Close shortcut cheatsheet popover
 *    3) Close inline slot composer
 *    4) Dismiss undo toast
 * - `?` (Shift+`/` outside editable fields): Toggle Shortcut Cheatsheet Popover
 */
export function useGlobalStudioShortcuts(): void {
  const undoProject = useProjectStore((s) => s.undoProject);
  const redoProject = useProjectStore((s) => s.redoProject);
  const projectPastCount = useProjectStore((s) => s.past.length);
  const projectFutureCount = useProjectStore((s) => s.future.length);
  const dismissUndoToast = useProjectStore((s) => s.dismissUndoToast);

  const undoDoc = useStudioDocumentStore((s) => s.undoDoc);
  const redoDoc = useStudioDocumentStore((s) => s.redoDoc);
  const docPastCount = useStudioDocumentStore((s) => s.past.length);
  const docFutureCount = useStudioDocumentStore((s) => s.future.length);

  const isAiStreaming = useWorkspaceSessionStore((s) => s.isAiStreaming);
  const stopAiStreaming = useWorkspaceSessionStore((s) => s.stopAiStreaming);
  const shortcutPopoverOpen = useWorkspaceSessionStore(
    (s) => s.shortcutPopoverOpen
  );
  const setShortcutPopoverOpen = useWorkspaceSessionStore(
    (s) => s.setShortcutPopoverOpen
  );

  const composerOpenSlotId = useSlotSelectionStore((s) => s.composerOpenSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore(
    (s) => s.setComposerOpenSlotId
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (isAiStreaming) {
          e.preventDefault();
          stopAiStreaming(true);
          return;
        }
        if (shortcutPopoverOpen) {
          e.preventDefault();
          setShortcutPopoverOpen(false);
          return;
        }
        if (composerOpenSlotId) {
          e.preventDefault();
          setComposerOpenSlotId(null);
          return;
        }
        dismissUndoToast();
        return;
      }

      if (!isEditingField && e.key === "?") {
        e.preventDefault();
        setShortcutPopoverOpen(!shortcutPopoverOpen);
        return;
      }

      if (!isEditingField && (e.ctrlKey || e.metaKey)) {
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
          if (projectPastCount > 0) {
            e.preventDefault();
            undoProject();
          } else if (docPastCount > 0) {
            e.preventDefault();
            undoDoc();
          }
        } else if (
          e.key.toLowerCase() === "y" ||
          (e.key.toLowerCase() === "z" && e.shiftKey)
        ) {
          if (projectFutureCount > 0) {
            e.preventDefault();
            redoProject();
          } else if (docFutureCount > 0) {
            e.preventDefault();
            redoDoc();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isAiStreaming,
    stopAiStreaming,
    shortcutPopoverOpen,
    setShortcutPopoverOpen,
    composerOpenSlotId,
    setComposerOpenSlotId,
    dismissUndoToast,
    projectPastCount,
    projectFutureCount,
    undoProject,
    redoProject,
    docPastCount,
    docFutureCount,
    undoDoc,
    redoDoc,
  ]);
}

