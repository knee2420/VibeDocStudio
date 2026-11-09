import React, { useEffect } from "react";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useProjectStore } from "@/entities/vdoc-project";
import { useHistoryStore } from "@/shared/lib";
import { ActionUndoToast } from "@/shared/ui";

const TOAST_MS = 6000;

/** 공용 이력의 마지막 변경 안내 + 서버 · AI 오류 안내 (각 저장소의 `dismissError` 로 닫는다). */
export const GlobalUndoToastHost: React.FC = () => {
  const lastMessage = useHistoryStore((s) => s.lastMessage);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const dismissMessage = useHistoryStore((s) => s.dismissMessage);

  const projectError = useProjectStore((s) => s.lastError);
  const documentError = useStudioDocumentStore((s) => s.lastError);
  const aiError = useAiStagingStore((s) => s.lastError);
  const errorMessage = projectError ?? documentError ?? aiError;

  useEffect(() => {
    if (!lastMessage) return;
    const timer = window.setTimeout(dismissMessage, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [lastMessage, dismissMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => {
      useProjectStore.getState().dismissError();
      useStudioDocumentStore.getState().dismissError();
      useAiStagingStore.getState().dismissError();
    }, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [errorMessage]);

  return (
    <>
      <ActionUndoToast
        message={lastMessage}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => void undo()}
        onRedo={() => void redo()}
        onDismiss={dismissMessage}
      />
      {errorMessage && (
        <div
          role="alert"
          data-testid="global-error-toast"
          className="fixed top-14 right-4 z-50 max-w-sm px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium shadow-lg"
        >
          {errorMessage}
        </div>
      )}
    </>
  );
};
