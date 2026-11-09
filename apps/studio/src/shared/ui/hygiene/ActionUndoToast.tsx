import React from "react";
import { RotateCcw, RotateCw, X } from "lucide-react";

export interface ActionUndoToastProps {
  message: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDismiss: () => void;
}

/**
 * UI Hygiene Primitive (Law of Symmetry & Forgiving UI).
 * Appears whenever a structural/destructive mutation occurs, offering 1-click or `Ctrl+Z` Undo.
 */
export const ActionUndoToast: React.FC<ActionUndoToastProps> = ({
  message,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDismiss,
}) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="action-undo-toast"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-xl border border-slate-700"
    >
      <span className="font-medium text-slate-100 max-w-[320px] truncate" title={message}>
        {message}
      </span>
      <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-[11px] cursor-pointer transition"
          title="실행 취소 (Ctrl+Z)"
        >
          <RotateCcw className="w-3 h-3" />
          되돌리기 (Ctrl+Z)
        </button>
        {canRedo && (
          <button
            type="button"
            onClick={onRedo}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] cursor-pointer transition"
            title="다시 실행 (Ctrl+Y)"
          >
            <RotateCw className="w-3 h-3" />
            재실행
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          title="알림 닫기 (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

