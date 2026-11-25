import React from "react";

import type { AiRuntime, ContextRef } from "@vibe/ai-kernel";

export interface AssetCardSummary {
  readonly id: string;
  readonly title: string;
  readonly badges: readonly string[];
  readonly summary: string;
  readonly flowMode?: string;
}

/**
 * AI 표면(Composer · 인라인 카드)이 자식 컴포넌트에 내려주는 것.
 * 답변 속 위치 칩이 화면 요소를 찾고(`runtime.entities`), Ctrl+클릭으로 첨부(`attach`)하는 데 쓴다.
 */
export interface AiSurfaceValue {
  runtime: AiRuntime;
  attach?(refs: ContextRef[]): void;
  /** 채팅 답변 속 `<<resource: 대상 위치 | 본문>>` 배지 클릭 시 페어 탭으로 열고 하이라이트한다. */
  openResource?(rawTag: string): void;
  /** 채팅 답변 속 `<<agui:asset-picks: id1,id2>>` 카드의 [미리보기] 클릭 시 AI Staged Preview 를 띄운다. */
  previewAsset?(assetId: string): void;
  /** 채팅 답변 속 `<<agui:asset-picks: id1,id2>>` 카드의 [뼈대 꽂기] 클릭 시 에셋 스켈레톤을 삽입한다. */
  insertAssetSkeleton?(assetId: string): void;
  /** 에셋 ID 에 대응하는 카드 메타 정보(제목·v2 배지·요약)를 조회한다. */
  resolveAssetCard?(assetId: string): AssetCardSummary | null;
}

const AiSurfaceContext = React.createContext<AiSurfaceValue | null>(null);

export const AiSurfaceProvider: React.FC<{ value: AiSurfaceValue; children: React.ReactNode }> = ({ value, children }) => (
  <AiSurfaceContext.Provider value={value}>{children}</AiSurfaceContext.Provider>
);

export function useAiSurface(): AiSurfaceValue | null {
  return React.useContext(AiSurfaceContext);
}
