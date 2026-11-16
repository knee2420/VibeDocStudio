import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { OutlinerNode } from "@vibe/vdoc-schema";

export const INITIAL_SIDEBAR_LIMIT = 60;
export const SIDEBAR_BATCH_STEP = 60;

/**
 * 사이드바 트리 섹션의 대량 행(예: All 모드 수천 개 노드, 다수 페이지)을
 * 초기 60행 이내로 제한 렌더링하고 스크롤/버튼으로 점진 확장한다.
 */
export function useWindowedNodes(
  nodes: readonly OutlinerNode[],
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  options: { resetKey: string; ensureNodeId?: string | null }
) {
  const { resetKey, ensureNodeId } = options;
  const [windowState, setWindowState] = useState<{ key: string; limit: number }>({
    key: resetKey,
    limit: INITIAL_SIDEBAR_LIMIT,
  });

  const effectiveLimit = useMemo(() => {
    const base = windowState.key === resetKey ? windowState.limit : INITIAL_SIDEBAR_LIMIT;
    if (!ensureNodeId || nodes.length <= base) return base;
    const idx = nodes.findIndex((n) => n.nodeId === ensureNodeId);
    if (idx < 0 || idx + 10 <= base) return base;
    return idx + 10;
  }, [windowState, resetKey, ensureNodeId, nodes]);

  const visibleNodes = useMemo(
    () => (nodes.length > effectiveLimit ? nodes.slice(0, effectiveLimit) : nodes),
    [nodes, effectiveLimit]
  );

  const remainingCount = Math.max(0, nodes.length - visibleNodes.length);

  const showMore = useCallback(() => {
    setWindowState((prev) => {
      const current = prev.key === resetKey ? prev.limit : INITIAL_SIDEBAR_LIMIT;
      return { key: resetKey, limit: current + SIDEBAR_BATCH_STEP };
    });
  }, [resetKey]);

  useEffect(() => {
    if (remainingCount === 0) return;
    const el = scrollContainerRef.current;
    if (!el || typeof window === "undefined") return;

    let ticking = false;
    const checkBottom = () => {
      ticking = false;
      if (el.scrollHeight <= el.clientHeight + 16) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= 200) {
        showMore();
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(checkBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [remainingCount, scrollContainerRef, showMore]);

  return { visibleNodes, remainingCount, showMore };
}
