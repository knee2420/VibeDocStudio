import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export type RulerKind = "add" | "del" | "mod";

const COLOR: Record<RulerKind, string> = { add: "#2da44e", del: "#cf222e", mod: "#f97316" };

interface Mark {
  top: number;
  height: number;
  kind: RulerKind;
  label: string;
  /** selector 로 찾은 순서 — 누를 때 다시 찾는다 (쪽 그림이 다시 그려지면 예전 요소는 떨어져 나간다). */
  index: number;
}

/**
 * 요소가 스크롤 영역 가운데(또는 위)에 오게 그 영역만 바로 옮긴다 (VS Code 눈금 · 워드 "다음 변경"처럼 즉시).
 * `scrollIntoView` 는 바깥 상자까지 밀어 화면이 틀어지므로 쓰지 않는다.
 */
export function scrollToElement(container: HTMLElement, el: Element, block: "center" | "start" = "center") {
  const r = el.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  const offset = block === "center" ? Math.max(0, (container.clientHeight - r.height) / 2) : 56;
  container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, r.top - c.top + container.scrollTop - offset));
}

/** 옮긴 자리가 잠깐 빛나게 (어디로 왔는지 눈에 들어오게). */
export function flashElement(el: Element) {
  (el as HTMLElement).animate?.(
    [{ boxShadow: "0 0 0 3px rgba(234,88,12,0.45)" }, { boxShadow: "0 0 0 3px rgba(234,88,12,0)" }],
    { duration: 900, easing: "ease-out" },
  );
}

/**
 * 변경 위치 막대 (VS Code 스크롤 막대 옆 개요 눈금) — 문서 전체에서 넣음(초록) · 지움(빨강) · 고침(주황)이 어디쯤인지.
 * 눈금을 누르면 그 자리로, 빈 곳을 누르면 그 비율 위치로 바로 옮긴다. 지금 보이는 범위는 회색 상자로.
 * 스크롤 영역 옆에 자기 칸을 차지한다 (오른쪽 패널 크기 조절 손잡이 · 스크롤 막대와 겹치지 않게).
 */
export const ChangeOverviewRuler: React.FC<{
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 표시할 요소 (scrollRef 안에서 찾는다) */
  selector: string;
  kindOf: (el: HTMLElement) => RulerKind | null;
  labelOf?: (el: HTMLElement) => string;
  onJump?: (el: HTMLElement) => void;
  /** 바뀌면 다시 잰다 */
  deps: unknown[];
  /** 미니맵이 펼쳐져 자체 뷰포트 슬라이더를 보여줄 때는 중복 스크롤 손잡이를 숨긴다. */
  hideThumb?: boolean;
}> = ({ scrollRef, selector, kindOf, labelOf, onJump, deps, hideThumb = false }) => {
  const [marks, setMarks] = useState<Mark[]>([]);
  const viewRef = useRef<HTMLSpanElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  /** 막대 높이 — 눈금 · 범위 상자는 이 높이에 맞춘다 (막대가 스크롤 영역보다 길어도 맞게). */
  const rulerH = () => Math.max(1, rulerRef.current?.clientHeight ?? scrollRef.current?.clientHeight ?? 1);

  // 보이는 범위 상자(= 스크롤 손잡이)는 스크롤마다 React 를 거치지 않고 직접 옮긴다.
  const syncView = () => {
    const el = scrollRef.current;
    const box = viewRef.current;
    if (!el || !box) return;
    const total = Math.max(1, el.scrollHeight);
    const h = rulerH();
    box.style.top = `${(el.scrollTop / total) * h}px`;
    box.style.height = `${Math.max(16, (el.clientHeight / total) * h)}px`;
    box.style.display = el.scrollHeight > el.clientHeight + 1 ? "block" : "none";
  };

  /** 막대 위 y 를 스크롤 위치로: 손잡이 위쪽이 y - grab 에 오게. */
  const scrollToRulerY = (y: number, grab: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = ((y - grab) / rulerH()) * el.scrollHeight;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const total = Math.max(1, el.scrollHeight);
      const h = rulerH();
      const base = el.getBoundingClientRect().top - el.scrollTop;
      const next: Mark[] = [];
      el.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
        const kind = kindOf(node);
        if (!kind) return;
        const r = node.getBoundingClientRect();
        next.push({ top: ((r.top - base) / total) * h, height: Math.max(4, (r.height / total) * h), kind, label: labelOf?.(node) ?? "", index });
      });
      setMarks(next);
      syncView();
    };
    // 크기 변화가 몰려 와도 한 프레임에 한 번만 잰다.
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", syncView, { passive: true });
    return () => el.removeEventListener("scroll", syncView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef]);

  const jump = (m: Mark) => {
    const container = scrollRef.current;
    const target = container?.querySelectorAll<HTMLElement>(selector)[m.index];
    if (!container || !target) return;
    scrollToElement(container, target);
    flashElement(target);
    onJump?.(target);
  };

  return (
    <div
      ref={rulerRef}
      data-testid="change-overview-ruler"
      className="group/ruler relative w-[16px] shrink-0 bg-[#fafafa] border-l border-black/5 touch-none select-none"
      // 스크롤 막대 역할: 손잡이를 끌면 따라가고, 빈 곳을 누르면 그 자리로 옮긴 뒤 끌 수 있다. 휠도 그대로.
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const top = e.currentTarget.getBoundingClientRect().top;
        const thumb = viewRef.current;
        const y = e.clientY - top;
        const tTop = thumb ? parseFloat(thumb.style.top || "0") : 0;
        const tH = thumb ? parseFloat(thumb.style.height || "0") : 0;
        const grab = y >= tTop && y <= tTop + tH ? y - tTop : tH / 2;
        scrollToRulerY(y, grab);
        e.currentTarget.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => scrollToRulerY(ev.clientY - top, grab);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onWheel={(e) => {
        const el = scrollRef.current;
        if (el) el.scrollTop += e.deltaY;
      }}
    >
      {/* 지금 보이는 범위 = 스크롤 손잡이 (미니맵이 열려 있을 때는 중복 방지를 위해 숨김) */}
      <span
        ref={viewRef}
        aria-hidden
        className={`absolute left-[2px] right-[2px] rounded-[3px] bg-black/[0.09] group-hover/ruler:bg-black/[0.14] pointer-events-none ${hideThumb ? "!hidden" : ""}`}
      />
      {marks.map((m, i) => (
        <button
          key={i}
          type="button"
          data-testid="ruler-mark"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            jump(m);
          }}
          title={`${m.label} — 누르면 그 자리로`}
          className="absolute left-[4px] right-[4px] rounded-[1px] opacity-90 hover:opacity-100 hover:left-[2px] hover:right-[2px] transition-[left,right] cursor-pointer"
          style={{ top: m.top, height: m.height, background: COLOR[m.kind] }}
        />
      ))}
    </div>
  );
};
