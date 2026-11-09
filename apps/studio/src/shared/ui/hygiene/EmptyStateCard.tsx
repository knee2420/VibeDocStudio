import React from "react";

export interface EmptyStateCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  testId?: string;
}

/**
 * UI Hygiene Primitive (9 States of Design — Empty / 0-Item / No Filter Match State).
 * Never leaves a blank white box when a list has 0 items; always provides context + recovery CTA.
 */
export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  testId,
}) => {
  return (
    <div
      data-testid={testId || "empty-state-card"}
      className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center space-y-2 my-2"
    >
      {icon && (
        <div className="mx-auto w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs">
          {icon}
        </div>
      )}
      <div className="text-xs font-bold text-slate-800">{title}</div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{description}</p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="px-2.5 py-1 rounded-md bg-[#248567] hover:bg-[#1d6b52] text-white text-[11px] font-semibold shadow-2xs cursor-pointer transition"
            >
              {actionLabel}
            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium cursor-pointer transition"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

