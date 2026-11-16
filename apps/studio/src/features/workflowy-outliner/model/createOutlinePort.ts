import type { OutlineNode, ViewMode } from "@vibe/outliner";
import type { OutlineDocumentPort } from "@vibe/outliner/editor";
import { useWorkingOutlineStore } from "@/entities/working-outline";
import { outlinerToWorkingNodes, workingToOutlinerNodes } from "./elementLabelRules";

/**
 * `@vibe/outliner` 의 `OutlineDocumentPort` 구현체.
 * 모든 트리 변경(Enter, Tab, Shift+Tab, Backspace, D&D)이 여기를 거쳐 WorkingOutline SSOT 로 반영된다.
 */
export function createOutlinePort(onDefaultViewChange?: (view: ViewMode) => void): OutlineDocumentPort {
  let cachedSourceNodes: ReturnType<typeof useWorkingOutlineStore.getState>["outline"] = null;
  let cachedRoots: OutlineNode[] = [];

  return {
    getRoots: () => {
      const outline = useWorkingOutlineStore.getState().outline;
      if (!outline) return [];
      if (outline !== cachedSourceNodes) {
        cachedSourceNodes = outline;
        cachedRoots = workingToOutlinerNodes(outline.nodes);
      }
      return cachedRoots;
    },

    commitRoots: (nextRoots: OutlineNode[]) => {
      const state = useWorkingOutlineStore.getState();
      const current = state.outline;
      if (!current) return;
      const converted = outlinerToWorkingNodes(nextRoots, current.nodes);
      const nextOutline = {
        ...current,
        revision: current.revision + 1,
        nodes: converted,
      };
      cachedSourceNodes = nextOutline;
      cachedRoots = nextRoots;
      state.setWorkingOutline(nextOutline, { dirty: true });
    },

    setDefaultView: (view: ViewMode) => {
      onDefaultViewChange?.(view);
    },
  };
}
