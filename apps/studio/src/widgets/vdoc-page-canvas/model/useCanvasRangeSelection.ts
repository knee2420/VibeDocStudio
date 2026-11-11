/**
 * 캔버스 전체의 슬롯 범위 선택 — 바탕화면 식 "선택 사각형"(러버밴드).
 *
 * 슬롯은 각자 독립 편집기라 브라우저 글자 선택이 슬롯 밖으로 못 나가고, 표 칸 드래그 선택도 표(구역)마다
 * 따로라서 서식 구역 경계에서 멈췄다. 여기서는 누른 자리부터 마우스 커서까지 사각형을 그리고,
 * 그 사각형에 걸친 칸을 모두 고른다 (표 구역 · 블록 · 페이지를 넘어도, 가장자리 자동 스크롤 중에도).
 * - 여백 · 빈 곳에서 누르고 끌면: 4px 움직이는 순간 사각형 선택 시작
 * - 칸 안에서 누르면: 그 칸 안에서는 평소처럼 글자 선택, 커서가 칸 밖으로 나가는 순간 사각형 선택으로 바뀐다
 * 키보드(Shift+방향키) 등으로 만든 브라우저 선택이 슬롯 여러 개에 걸친 경우도 같은 범위로 받아들인다.
 */
import { useEffect } from "react";

import { useSlotSelectionStore, type SlotRangeSelection } from "@/entities/slot";
import { studioKeyLayers } from "@/features/command-bus";

const DRAG_THRESHOLD = 4;
/** 칸 안에서 시작했을 때, 칸 경계를 이만큼 넘어야 사각형 선택으로 바뀐다. */
const LEAVE_SLOT_TOLERANCE = 4;
const EDGE_SCROLL = 48;
const IGNORE_START =
  "button, input, textarea, select, a[href], [draggable='true'], [data-block-drag], [data-block-grip], [data-resize-handle], [data-col-resize], [data-table-menu], [role='menu'], [data-keep-table-selection]";

/**
 * 선택 단위 요소 — 블록 뷰가 단위마다 붙이는 `data-vdoc-unit` (슬롯 · 이미지 …).
 * 같은 단위가 겹쳐 있으면(표 칸 td 안의 슬롯 편집기) 바깥 요소만 쓴다.
 */
const UNIT = "[data-vdoc-unit]";

function outerUnitElements(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(UNIT)].filter((el) => !el.parentElement?.closest(UNIT));
}

function outerUnitOf(target: Element | null): HTMLElement | null {
  let el = target?.closest<HTMLElement>(UNIT) ?? null;
  while (el?.parentElement?.closest(UNIT)) el = el.parentElement.closest<HTMLElement>(UNIT);
  return el;
}

/** 요소들 → 범위 (전체 단위 · 그중 슬롯 단위). */
function unitsOf(els: HTMLElement[]): { unitIds: string[]; slotIds: string[] } {
  const unitIds: string[] = [];
  const slotIds: string[] = [];
  for (const el of els) {
    const id = el.dataset.vdocUnit;
    if (!id || unitIds.includes(id)) continue;
    unitIds.push(id);
    if (el.dataset.unitKind === "slot") slotIds.push(id);
  }
  return { unitIds, slotIds };
}

function sameRange(a: SlotRangeSelection | null, b: SlotRangeSelection | null): boolean {
  if (!a || !b) return a === b;
  return a.source === b.source && a.withinTable === b.withinTable && a.unitIds.join("|") === b.unitIds.join("|");
}

interface DragState {
  /** 누른 자리 (캔버스 내용 좌표 = 화면 좌표 + 스크롤) — 자동 스크롤해도 고정된다. */
  startX: number;
  startY: number;
  /** 칸 안에서 시작했으면 그 칸. */
  anchor: HTMLElement | null;
  active: boolean;
  lastX: number;
  lastY: number;
}

export function useCanvasRangeSelection(getMain: () => HTMLElement | null): void {
  useEffect(() => {
    let drag: DragState | null = null;
    let suppressClick = false;
    let scrollTimer: number | undefined;
    let marquee: HTMLDivElement | null = null;

    const commit = (range: SlotRangeSelection | null) => {
      const store = useSlotSelectionStore.getState();
      if (!sameRange(store.slotRange, range)) store.setSlotRange(range);
    };

    /** 지금 사각형 (화면 좌표, 캔버스 영역 밖은 잘라 낸다). */
    const boxOf = (main: HTMLElement) => {
      const bounds = main.getBoundingClientRect();
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const sx = drag!.startX - main.scrollLeft;
      const sy = drag!.startY - main.scrollTop;
      return {
        // 선택 계산은 잘라 내지 않은 사각형(스크롤로 화면 밖에 나간 시작점 포함)으로 한다.
        left: Math.min(sx, drag!.lastX),
        right: Math.max(sx, drag!.lastX),
        top: Math.min(sy, drag!.lastY),
        bottom: Math.max(sy, drag!.lastY),
        // 그리기는 캔버스 안으로 자른다.
        draw: {
          left: clamp(Math.min(sx, drag!.lastX), bounds.left, bounds.right),
          right: clamp(Math.max(sx, drag!.lastX), bounds.left, bounds.right),
          top: clamp(Math.min(sy, drag!.lastY), bounds.top, bounds.bottom),
          bottom: clamp(Math.max(sy, drag!.lastY), bounds.top, bounds.bottom),
        },
      };
    };

    const compute = (main: HTMLElement): SlotRangeSelection | null => {
      if (!drag) return null;
      const box = boxOf(main);
      const hits = outerUnitElements(main).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
      });
      if (hits.length === 0) return null;
      const firstTable = hits[0].closest("table");
      const withinTable = Boolean(firstTable) && hits.every((el) => el.closest("table") === firstTable);
      return { ...unitsOf(hits), source: "drag", withinTable };
    };

    const drawMarquee = (main: HTMLElement) => {
      if (!drag) return;
      if (!marquee) {
        marquee = document.createElement("div");
        marquee.dataset.testid = "canvas-range-marquee";
        // 판다독식 범위 상자: 테두리 없는 연한 파란 면. multiply 로 겹쳐 글자 · 그림은 그대로 진하게 보이고
        // 흰 바탕만 파랗게 물든다 (내용 "아래"에 깔린 것처럼).
        Object.assign(marquee.style, {
          position: "fixed",
          zIndex: "55",
          pointerEvents: "none",
          background: "#e3ebf9",
          mixBlendMode: "multiply",
        });
        document.body.appendChild(marquee);
      }
      const { draw } = boxOf(main);
      Object.assign(marquee.style, {
        left: `${draw.left}px`,
        top: `${draw.top}px`,
        width: `${draw.right - draw.left}px`,
        height: `${draw.bottom - draw.top}px`,
      });
    };
    const removeMarquee = () => {
      marquee?.remove();
      marquee = null;
    };

    const update = (main: HTMLElement) => {
      window.getSelection()?.removeAllRanges();
      commit(compute(main));
      drawMarquee(main);
    };

    const edgeScroll = (main: HTMLElement, y: number) => {
      window.clearInterval(scrollTimer);
      const rect = main.getBoundingClientRect();
      const delta = y < rect.top + EDGE_SCROLL ? -14 : y > rect.bottom - EDGE_SCROLL ? 14 : 0;
      if (!delta) return;
      scrollTimer = window.setInterval(() => {
        if (!drag?.active) return window.clearInterval(scrollTimer);
        main.scrollTop += delta;
        update(main);
      }, 30);
    };

    const onPointerDown = (e: PointerEvent) => {
      const main = getMain();
      const target = e.target as HTMLElement | null;
      drag = null;
      if (!main || !target || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || !main.contains(target)) return;
      if (target.closest(IGNORE_START)) return;
      // 캔버스 세로 스크롤바 위에서 누른 것은 제외
      if (e.clientX > main.getBoundingClientRect().left + main.clientWidth) return;
      drag = {
        startX: e.clientX + main.scrollLeft,
        startY: e.clientY + main.scrollTop,
        anchor: outerUnitOf(target),
        active: false,
        lastX: e.clientX,
        lastY: e.clientY,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const main = getMain();
      if (!drag || !main) return;
      if ((e.buttons & 1) === 0) {
        drag = null;
        return;
      }
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      if (!drag.active) {
        const moved = Math.hypot(e.clientX + main.scrollLeft - drag.startX, e.clientY + main.scrollTop - drag.startY);
        if (moved < DRAG_THRESHOLD) return;
        if (drag.anchor) {
          // 칸 안에서 시작: 커서가 그 칸 밖으로 나갈 때까지는 평소 글자 선택
          const r = drag.anchor.getBoundingClientRect();
          const t = LEAVE_SLOT_TOLERANCE;
          const inside = e.clientX > r.left - t && e.clientX < r.right + t && e.clientY > r.top - t && e.clientY < r.bottom + t;
          if (inside) return;
        }
        drag.active = true;
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.isContentEditable) activeEl.blur();
        main.focus({ preventScroll: true });
        document.body.classList.add("vdoc-range-dragging");
      }
      update(main);
      edgeScroll(main, e.clientY);
    };

    const onPointerUp = () => {
      window.clearInterval(scrollTimer);
      const main = getMain();
      if (drag?.active) {
        suppressClick = true; // 드래그 끝의 click 이 선택을 지우지 않게
        window.setTimeout(() => (suppressClick = false), 0);
        // AI 바는 손을 뗀 자리 옆에 뜬다 (텍스트 선택 버블과 같은 방식).
        const store = useSlotSelectionStore.getState();
        if (store.slotRange && main) {
          store.setSlotRange({
            ...store.slotRange,
            endPoint: { x: drag.lastX, y: drag.lastY, scrollTop: main.scrollTop, scrollLeft: main.scrollLeft },
          });
        }
      }
      drag = null;
      removeMarquee();
      document.body.classList.remove("vdoc-range-dragging");
      window.setTimeout(syncNativeSelection, 0);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    /** 브라우저 글자 선택이 슬롯 2개 이상에 걸치면 범위로 받아들인다 (키보드 선택 · 보기 모드). */
    const syncNativeSelection = () => {
      if (drag?.active) return;
      // 범위 AI 바 · 우클릭 메뉴 · Composer 를 쓰는 동안에는 범위를 그대로 둔다.
      if ((document.activeElement as HTMLElement | null)?.closest("[data-testid='slot-range-ai-bar'], [data-testid='ai-attach-menu'], [data-testid='ai-composer-panel']")) return;
      const main = getMain();
      const sel = window.getSelection();
      const current = useSlotSelectionStore.getState().slotRange;
      if (!main || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (current?.source === "native") commit(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!main.contains(range.commonAncestorContainer)) return;
      const units = unitsOf(outerUnitElements(main).filter((el) => sel.containsNode(el, true)));
      if (units.unitIds.length >= 2) {
        // 선택이 끝난 쪽(포커스 끝) 글자 상자 아래에 바를 띄운다.
        const rects = range.getClientRects();
        const forward = sel.focusNode !== null && range.endContainer === sel.focusNode;
        const end = forward ? rects[rects.length - 1] : rects[0];
        const point = end ? { x: forward ? end.right : end.left, y: end.bottom, scrollTop: main.scrollTop, scrollLeft: main.scrollLeft } : undefined;
        const next = { ...units, source: "native" as const, endPoint: point };
        if (!sameRange(current, next)) useSlotSelectionStore.getState().setSlotRange(next);
      } else if (current?.source === "native") commit(null);
    };
    let selectionTimer: number | undefined;
    const onSelectionChange = () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(syncNativeSelection, 120);
    };

    const offKey = studioKeyLayers.register("rangeSelection", (e) => {
      if (e.key === "Escape" && useSlotSelectionStore.getState().slotRange) {
        e.preventDefault();
        commit(null);
        return true;
      }
      return false;
    });

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.clearInterval(scrollTimer);
      window.clearTimeout(selectionTimer);
      removeMarquee();
      document.body.classList.remove("vdoc-range-dragging");
      offKey();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [getMain]);
}
