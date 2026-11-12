import React from "react";

import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { useOutlineSelector } from "@/features/zoom-hierarchy";

import { hiddenLayerSelectors } from "../model/layerVisibility";

/**
 * 눈 아이콘으로 숨긴 레이어를 캔버스에서 감춘다 (자리는 유지 — 슬롯 넘침 계산이 흔들리지 않게).
 * 캔버스에 한 번 마운트한다. 사이드바를 접어도 숨김은 유지된다.
 */
export const HiddenLayersStyle: React.FC = () => {
  const hiddenIds = useWorkspaceSessionStore((s) => s.hiddenNodeIds);
  // 선택 결과는 문자열이라, 타이핑으로 투영이 바뀌어도 숨김 대상이 같으면 다시 그리지 않는다.
  const css = useOutlineSelector((p) => {
    const selectors = hiddenLayerSelectors(p.allNodes, hiddenIds);
    return selectors.length ? `${selectors.join(",\n")} { visibility: hidden !important; }` : "";
  });
  return css ? <style data-testid="hidden-layers-style">{css}</style> : null;
};
