import React from "react";

import type { AiRuntime, ContextRef } from "@vibe/ai-kernel";

/**
 * AI 표면(Composer · 인라인 카드)이 자식 컴포넌트에 내려주는 것.
 * 답변 속 위치 칩이 화면 요소를 찾고(`runtime.entities`), Ctrl+클릭으로 첨부(`attach`)하는 데 쓴다.
 */
export interface AiSurfaceValue {
  runtime: AiRuntime;
  attach?(refs: ContextRef[]): void;
}

const AiSurfaceContext = React.createContext<AiSurfaceValue | null>(null);

export const AiSurfaceProvider: React.FC<{ value: AiSurfaceValue; children: React.ReactNode }> = ({ value, children }) => (
  <AiSurfaceContext.Provider value={value}>{children}</AiSurfaceContext.Provider>
);

export function useAiSurface(): AiSurfaceValue | null {
  return React.useContext(AiSurfaceContext);
}
