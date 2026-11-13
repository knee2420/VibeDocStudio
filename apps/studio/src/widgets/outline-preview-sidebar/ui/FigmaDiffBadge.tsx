import React from "react";
import type { NodeDiffState } from "../model/useFigmaDiffStatus";

interface FigmaDiffBadgeProps {
  diffState?: NodeDiffState;
  className?: string;
}

/**
 * 안티그래비티 / VS Code 스타일 Git 상태 인디케이터.
 * - isDirect: true -> 우측에 미니멀한 'U' (초록) 또는 'M' (골드) 문자
 * - isDirect: false -> 상위 컨테이너 우측에 작은 원형 도트 '●' (초록/골드)
 */
export const FigmaDiffBadge: React.FC<FigmaDiffBadgeProps> = ({ diffState, className = "" }) => {
  if (!diffState) return null;

  const { kind, isDirect } = diffState;

  if (isDirect) {
    return (
      <span
        data-testid={`git-status-${kind}`}
        className={`fig-git-letter fig-git-${kind} ${className}`}
        title={kind === "added" ? "신규 추가됨 (U)" : "수정됨 (M)"}
      >
        {kind === "added" ? "U" : "M"}
      </span>
    );
  }

  return (
    <span
      data-testid={`git-status-dot-${kind}`}
      className={`fig-git-dot fig-git-${kind} ${className}`}
      title={kind === "added" ? "하위에 신규 추가된 항목이 있음" : "하위에 수정된 항목이 있음"}
    />
  );
};
