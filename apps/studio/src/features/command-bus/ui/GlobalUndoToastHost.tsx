import React, { useEffect } from "react";

import { useProjectStore } from "@/entities/vdoc-project";
import { ActionUndoToast } from "@/shared/ui";

export const GlobalUndoToastHost: React.FC = () => {
  const lastUndoMessage = useProjectStore((s) => s.lastUndoMessage);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undoProject = useProjectStore((s) => s.undoProject);
  const redoProject = useProjectStore((s) => s.redoProject);
  const dismissUndoToast = useProjectStore((s) => s.dismissUndoToast);

  useEffect(() => {
    if (!lastUndoMessage) return;
    const timer = window.setTimeout(() => {
      dismissUndoToast();
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [lastUndoMessage, dismissUndoToast]);

  return (
    <ActionUndoToast
      message={lastUndoMessage}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undoProject}
      onRedo={redoProject}
      onDismiss={dismissUndoToast}
    />
  );
};

