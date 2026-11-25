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

/** 요소가 캔버스 스크롤 영역(없으면 창) 안에 통째로 보이는지. */
export function isInCanvasView(el: Element): boolean {
  const main = el.closest("[data-vdoc-canvas-main]");
  const view = main ? main.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const r = el.getBoundingClientRect();
  return r.top >= view.top && r.bottom <= view.bottom && r.left >= view.left && r.right <= view.right;
}

/** 메인 편집 캔버스 영역 (좌측 미리보기 패널 · 스플릿 뷰와 중복 ID/속성 충돌 방지). */
function canvasRoot(): ParentNode {
  return document.querySelector("[data-vdoc-canvas-main]") ?? document;
}

function findCanvasPage(pageId: string): Element | null {
  const escaped = CSS.escape(`vdoc-page-${pageId}`);
  return canvasRoot().querySelector(`#${escaped}`) ?? document.getElementById(`vdoc-page-${pageId}`);
}

/** 캔버스의 페이지 시트로 스크롤 (`VDocPageSheet` 의 `id="vdoc-page-{pageId}"`). */
export function scrollToCanvasPage(pageId: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VDOC_REVEAL_PAGE_EVENT, { detail: { pageId } }));
  }
  afterRender(() => {
    findCanvasPage(pageId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/**
 * 블록 또는 슬롯 요소로 스크롤하고 잠깐 테두리 링을 띄운다.
 * 요소가 아직 화면(페이지 창)에 없으면 `fallbackPageId` 페이지로만 스크롤한다 — 페이지 스크롤과
 * 요소 스크롤을 연달아 부르면 두 부드러운 스크롤이 서로 끊어 먹어 화면이 뚝뚝 끊긴다.
 */
export function revealCanvasElement(target: {
  blockId?: string;
  slotId?: string;
  fallbackPageId?: string | null;
  /** 이미 캔버스 화면 안에 다 보이면 스크롤하지 않고 강조만 한다 (삽입한 블록처럼 보통은 보이는 자리일 때). */
  onlyIfHidden?: boolean;
}): void {
  const selector = target.slotId
    ? `[data-slot-id="${CSS.escape(target.slotId)}"]`
    : target.blockId
      ? `[data-block-id="${CSS.escape(target.blockId)}"]`
      : null;
  if (!selector) return;
  afterRender(() => {
    const el = canvasRoot().querySelector(selector) ?? document.querySelector(selector);
    if (!el) {
      if (target.fallbackPageId) {
        findCanvasPage(target.fallbackPageId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    if (!(target.onlyIfHidden && isInCanvasView(el))) el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(...FLASH_CLASSES);
    window.setTimeout(() => el.classList.remove(...FLASH_CLASSES), FLASH_MS);
  });
}
