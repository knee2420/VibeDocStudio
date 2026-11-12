import React from "react";

import { useOutlineSelector } from "../model/useFractalZoomNavigation";
import { zoomFocusDimBlockIds } from "../model/zoomFocus";

/**
 * 엘리먼트 줌일 때 캔버스에서 그 엘리먼트의 블록만 또렷하게, 같은 페이지의 다른 블록은 흐리게 한다.
 * 페이지 격리(한 페이지만 그리기)는 캔버스가 맡고, 이 스타일은 그 페이지 안의 초점만 맡는다.
 * 전환 애니메이션은 쓰지 않는다 — 큰 블록을 매 프레임 다시 그리면 선택 · 스크롤이 끊긴다.
 */
export const ZoomFocusStyle: React.FC = () => {
  // 선택 결과는 문자열이라, 타이핑으로 투영이 바뀌어도 초점 대상이 같으면 다시 그리지 않는다.
  const css = useOutlineSelector((p) => {
    const ids = zoomFocusDimBlockIds(p.allNodes, p.rootNodeId);
    if (ids.length === 0) return "";
    const pageId = p.allNodes.find((n) => n.nodeId === p.rootNodeId)?.targetPageId;
    const selectors = ids.map((id) => `[data-block-id="${CSS.escape(id)}"]`);
    // 블록에 속하지 않은 페이지 머리말 · 꼬리말 슬롯도 흐리게.
    if (pageId) selectors.push(`[id="vdoc-page-${CSS.escape(pageId)}"] [data-slot-id]:not([data-block-id] [data-slot-id])`);
    return `${selectors.join(",\n")} { opacity: 0.25; }`;
  });
  return css ? <style data-testid="zoom-focus-style">{css}</style> : null;
};
