import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const MARGIN = 8;
/** 카드 높이를 재기 전 어림값 (입력칸 + 아래 줄). */
const ESTIMATED_CARD_HEIGHT = 140;

/**
 * 슬롯에 붙어 떠 있는 팝오버 (피그마 "프롬프트로 편집하기"처럼 캔버스 위에 뜬다).
 * 예전에는 슬롯 안 흐름에 끼워 넣어 아래 내용을 밀어냈다. 이제는 슬롯 바로 아래(공간이 없으면 위)에
 * 고정 위치로 띄우고, 캔버스 스크롤 · 창 크기 · 슬롯/카드 크기가 바뀌면 따라간다.
 *
 * 부모 요소(슬롯 상자)를 기준점으로 쓴다 — 보이지 않는 표식 하나를 슬롯 안에 두고 그 부모를 잰다.
 * 포털 안 클릭 · 누르기는 슬롯 선택 · 캔버스 선택 해제로 새지 않게 막는다 (예전 감싸개와 같다).
 */
export const FloatingSlotPopover: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const markerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 열자마자: 슬롯이 화면 밖이거나 아래에 카드 놓을 자리가 없으면 슬롯을 가운데로 데려온다
  // (안 그러면 화면 밖에서 열려 "눌러도 아무 일도 없는" 것처럼 보였다). 카드는 스크롤을 따라온다.
  useLayoutEffect(() => {
    const anchor = markerRef.current?.parentElement;
    if (!anchor) return;
    const scroller = anchor.closest("[data-vdoc-canvas-main]");
    const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const r = anchor.getBoundingClientRect();
    const roomBelow = view.bottom - r.bottom;
    const roomAbove = r.top - view.top;
    const offscreen = r.bottom < view.top || r.top > view.bottom;
    if (offscreen || (roomBelow < ESTIMATED_CARD_HEIGHT && roomAbove < ESTIMATED_CARD_HEIGHT)) {
      anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // 자리를 잡은 뒤 지시 입력칸으로 포커스 (숨겨진 동안에는 포커스를 받을 수 없다).
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (!pos || focused.current) return;
    focused.current = true;
    cardRef.current?.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
  }, [pos]);

  useLayoutEffect(() => {
    const anchor = markerRef.current?.parentElement;
    if (!anchor) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const r = anchor.getBoundingClientRect();
      const card = cardRef.current;
      const h = card?.offsetHeight ?? 160;
      const w = card?.offsetWidth ?? 360;
      let top = r.bottom + GAP;
      if (top + h > window.innerHeight - MARGIN && r.top - GAP - h >= MARGIN) top = r.top - GAP - h;
      const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - w - MARGIN));
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(anchor);
    if (cardRef.current) ro?.observe(cardRef.current);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, []);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      <span ref={markerRef} hidden />
      {createPortal(
        <div
          ref={cardRef}
          data-testid="slot-floating-popover"
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          onDoubleClick={stop}
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            zIndex: 70,
            visibility: pos ? "visible" : "hidden",
          }}
          className="text-left"
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
};
