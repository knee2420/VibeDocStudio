import { VDOC_REVEAL_PAGE_EVENT } from "@vibe/slot-canvas";

/**
 * 캔버스 DOM 을 다루는 명령형 동작은 여기 한 곳에만 둔다.
 * 모델 훅은 "어디로 보내라"만 말하고, 어떻게 스크롤 · 강조하는지는 모른다.
 * 상태 변경 직후 다시 그려진 뒤에 찾아야 하므로 한 프레임 늦춰 실행한다.
 */
const FLASH_CLASSES = ["ring-4", "ring-emerald-400", "transition-all"];
const FLASH_MS = 1200;
const AFTER_RENDER_MS = 60;

function afterRender(run: () => void): void {
  window.setTimeout(run, AFTER_RENDER_MS);
}

/** 캔버스의 페이지 시트로 스크롤 (`VDocPageSheet` 의 `id="vdoc-page-{pageId}"`). */
export function scrollToCanvasPage(pageId: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VDOC_REVEAL_PAGE_EVENT, { detail: { pageId } }));
  }
  afterRender(() => {
    document.getElementById(`vdoc-page-${pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/** 블록 또는 슬롯 요소로 스크롤하고 잠깐 테두리 링을 띄운다. */
export function revealCanvasElement(target: { blockId?: string; slotId?: string }): void {
  const selector = target.slotId
    ? `[data-slot-id="${CSS.escape(target.slotId)}"]`
    : target.blockId
      ? `[data-block-id="${CSS.escape(target.blockId)}"]`
      : null;
  if (!selector) return;
  afterRender(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(...FLASH_CLASSES);
    window.setTimeout(() => el.classList.remove(...FLASH_CLASSES), FLASH_MS);
  });
}
