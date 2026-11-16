import type { VDocPage } from "@vibe/vdoc-schema";

/** 배치 도구가 가리키는 삽입 자리: 페이지 · 블록 순서 · 화면에 그릴 삽입선. */
export interface BlockPlacementTarget {
  pageId: string;
  /** `page.blocks` 기준 삽입 위치 (이 앞에 넣는다). */
  index: number;
  line: { left: number; width: number; top: number };
}

interface Rect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

/**
 * 흐름 블록(고정 위치 frame 블록 제외)의 화면 위치로 포인터 Y 가 들어갈 자리를 고른다.
 * 블록 가운데보다 위면 그 블록 앞, 아니면 뒤. 삽입선은 두 블록 사이 틈 가운데에 그린다.
 */
export function placementInPage(
  page: Pick<VDocPage, "pageId" | "blocks">,
  rectOf: (blockId: string) => Rect | null,
  pageRect: Rect,
  y: number
): BlockPlacementTarget {
  let prevBottom: number | null = null;
  let lastRect: Rect | null = null;
  for (let i = 0; i < page.blocks.length; i++) {
    const block = page.blocks[i];
    if (block.frame) continue;
    const rect = rectOf(block.blockId);
    if (!rect) continue;
    if (y < rect.top + (rect.bottom - rect.top) / 2) {
      const top = prevBottom === null ? rect.top - 6 : (prevBottom + rect.top) / 2;
      return { pageId: page.pageId, index: i, line: { left: rect.left, width: rect.width, top } };
    }
    prevBottom = rect.bottom;
    lastRect = rect;
  }
  if (lastRect) {
    return { pageId: page.pageId, index: page.blocks.length, line: { left: lastRect.left, width: lastRect.width, top: lastRect.bottom + 6 } };
  }
  // 빈 페이지: 본문 영역 위쪽
  const inset = 40;
  return {
    pageId: page.pageId,
    index: page.blocks.length,
    line: { left: pageRect.left + inset, width: Math.max(0, pageRect.width - inset * 2), top: pageRect.top + 64 },
  };
}

/** 캔버스 DOM 에서 포인터 아래 페이지를 찾아 삽입 자리를 고른다 (페이지 밖이면 null). */
export function findBlockPlacement(
  main: HTMLElement,
  pages: readonly Pick<VDocPage, "pageId" | "blocks">[],
  x: number,
  y: number
): BlockPlacementTarget | null {
  for (const page of pages) {
    const pageEl = document.getElementById(`vdoc-page-${page.pageId}`);
    if (!pageEl || !main.contains(pageEl)) continue;
    const r = pageEl.getBoundingClientRect();
    if (y < r.top || y > r.bottom || x < r.left || x > r.right) continue;
    return placementInPage(
      page,
      (blockId) => {
        const el = pageEl.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, width: b.width };
      },
      { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
      y
    );
  }
  return null;
}
