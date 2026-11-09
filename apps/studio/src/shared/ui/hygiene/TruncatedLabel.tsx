import React from "react";

export interface TruncatedLabelProps {
  text: string;
  className?: string;
  as?: "span" | "div" | "h3" | "h4" | "p";
  testId?: string;
}

/**
 * UI Hygiene Primitive (`min-w-0 truncate` + hover full-text `title` tooltip).
 * Defends against 100-character unbroken strings or deep hierarchy labels breaking flex layouts.
 */
export const TruncatedLabel: React.FC<TruncatedLabelProps> = ({
  text,
  className = "",
  as: Tag = "span",
  testId,
}) => {
  return (
    <Tag
      title={text}
      data-testid={testId}
      className={`min-w-0 truncate block ${className}`}
    >
      {text}
    </Tag>
  );
};

