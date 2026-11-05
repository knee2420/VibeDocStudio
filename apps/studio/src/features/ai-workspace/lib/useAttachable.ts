import type React from "react";

import { writeContextDrag, type ContextRef } from "@vibe/ai-kernel";

import { useAttachMenuStore } from "../model/attach";

export interface AttachableProps {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  "data-ai-attachable": string;
}

/**
 * 화면 요소를 AI 첨부 가능하게 만든다 — 끌기(Composer 에 놓기) · 우클릭 메뉴.
 * `getRefs` 는 그 순간 호출된다 (여러 개 고른 묶음이면 묶음 전체를 돌려주면 된다).
 *
 * ```tsx
 * <div {...attachable(() => [blockRef(doc, page, block)])}>…</div>
 * ```
 */
export function attachable(getRefs: () => ContextRef[], options: { draggable?: boolean } = {}): AttachableProps {
  return {
    draggable: options.draggable ?? true,
    "data-ai-attachable": "true",
    onDragStart: (e) => {
      const refs = getRefs();
      if (refs.length === 0) return;
      e.stopPropagation();
      writeContextDrag(e.dataTransfer, refs);
    },
    onContextMenu: (e) => {
      const refs = getRefs();
      if (refs.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      useAttachMenuStore.getState().open(e.clientX, e.clientY, refs);
    },
  };
}
