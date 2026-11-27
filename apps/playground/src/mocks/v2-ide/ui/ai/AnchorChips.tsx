import React, { useCallback, useMemo } from "react";

import type { SessionAnchor } from "@vibe/ai-kernel";
import { AnchorChipLayer, AnchorDraftHighlight, useSessionList } from "@vibe/ai-react";
import type { V2AiWorkspace } from "@vibe/ai-vault";

/**
 * 에디터 위 세션 표시 — 이 화면 · 이 파일의 진행 중 기준점 세션을 항목 옆에 띄운다.
 * 화면 패키지(아웃라이너 · 캔버스)는 AI 를 모르므로, 항목은 이미 있는 DOM 속성으로만 찾는다.
 */
export function AnchorChips({
  ai,
  surface,
  path,
  container,
  selector,
  onOpen,
  right,
}: {
  ai: V2AiWorkspace;
  surface: string;
  path: string;
  /** 스크롤 컨테이너 (position: relative) */
  container: HTMLElement | null;
  /** 항목 id → CSS 선택자 (예: `[data-node-id="…"]`) */
  selector(id: string): string;
  /** 세션 칩 클릭 시 열기 핸들러 (우측 AI Composer 탭 전환 포함). 생략 시 ai.openSession */
  onOpen?: (key: string) => void;
  right?: number;
}) {
  const views = useSessionList(ai.sessions);
  const sessions = useMemo(
    () => views.filter((v) => v.kind === "anchored" && v.lifecycle === "active" && v.anchor?.surface === surface && v.anchor.path === path),
    [views, surface, path]
  );
  const locate = useCallback(
    (anchor: SessionAnchor): HTMLElement[] => {
      if (!container) return [];
      const out: HTMLElement[] = [];
      for (const id of anchor.itemIds) {
        const el = container.querySelector<HTMLElement>(selector(id));
        if (el && el.getClientRects().length > 0) out.push(el);
      }
      return out;
    },
    [container, selector]
  );
  if (!sessions.length) return null;
  return <AnchorChipLayer sessions={sessions} container={container} locate={locate} onOpen={onOpen ?? ai.openSession} right={right} />;
}

/** 항목 id → 화면 요소 (보이는 것만) */
function useLocate(container: HTMLElement | null, selector: (id: string) => string) {
  return useCallback(
    (anchor: SessionAnchor): HTMLElement[] => {
      if (!container) return [];
      const out: HTMLElement[] = [];
      for (const id of anchor.itemIds) {
        const el = container.querySelector<HTMLElement>(selector(id));
        if (el && el.getClientRects().length > 0) out.push(el);
      }
      return out;
    },
    [container, selector]
  );
}

/** 지시를 쓰는 동안 그 지시를 받을 항목 표시 (입력창을 누르면 화면 선택이 풀려도 대상이 보이게) */
export function AnchorDraft({
  surface,
  path,
  itemIds,
  container,
  selector,
}: {
  surface: string;
  path: string;
  itemIds: readonly string[];
  container: HTMLElement | null;
  selector(id: string): string;
}) {
  const locate = useLocate(container, selector);
  const key = itemIds.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anchor = useMemo(() => (itemIds.length ? { surface, path, itemIds: [...itemIds], label: "" } : null), [surface, path, key]);
  return <AnchorDraftHighlight anchor={anchor} container={container} locate={locate} label={`AI 지시 대상 · ${itemIds.length}개`} />;
}

export const outlineNodeSelector = (id: string) => `[data-node-id="${CSS.escape(id)}"]`;
export const vdocUnitSelector = (id: string) => `[data-slot-id="${CSS.escape(id)}"], [data-block-id="${CSS.escape(id)}"]`;
