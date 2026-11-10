import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  Copy,
  Lock,
  Settings,
  Trash2,
  Unlock,
} from "lucide-react";

import type { BaseLayoutBlock } from "@vibe/vdoc-schema";

import { MenuItem, GripIcon } from "../InteractiveTable";
import { useCanvasKeyLayer } from "../keyLayer";
import { ACCENT, AFFORDANCE_BORDER, DROP_LINE, GRIP_COLOR, MENU_SHADOW } from "../tokens";
import { CornerResizeMarkers } from "./CornerResizeMarkers";
import type { DropEdge } from "../BlockFrame";

export interface BaseBlockWrapperProps {
  block: BaseLayoutBlock;
  editable: boolean;
  selected: boolean;
  /** 내부 칸(슬롯/셀) 편집 중일 때 참 — 선택과 구분되는 블록 테두리를 유지한다. */
  editing?: boolean;
  resizable?: boolean;
  hasOwnGrip?: boolean;
  locked?: boolean;
  dropEdge?: DropEdge | null;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onSelectBlock?: (blockId: string) => void;
  onDragOverEdge?: (edge: DropEdge) => void;
  onDropEdge?: (e: React.DragEvent, edge: DropEdge) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onToggleLock?: () => void;
  onDelete?: () => void;
  onFreeMove?: (dx: number, dy: number) => void;
  onSnapMove?: (dx: number, dy: number, altKey: boolean) => { dx: number; dy: number };
  onEndSnapMove?: () => void;
  onResizeFrame?: (dw: number, dh: number) => void;
  children: React.ReactNode;
}

const edgeFromEvent = (e: React.DragEvent, el: HTMLElement): DropEdge => {
  const r = el.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? "before" : "after";
};

/**
 * BaseBlockWrapper: Unified Base Block Chrome for all .vdoc layout blocks.
 * Implements PandaDoc-style selection & editing outlines, corner resize markers,
 * left ⋮⋮ drag handle, body drag + snap for selected framed blocks, and ⚙️ settings menu.
 */
export const BaseBlockWrapper: React.FC<BaseBlockWrapperProps> = ({
  block,
  editable,
  selected,
  editing = false,
  resizable = false,
  hasOwnGrip = false,
  locked = false,
  dropEdge = null,
  dragHandleProps = {},
  canMoveUp = false,
  canMoveDown = false,
  onSelectBlock,
  onDragOverEdge,
  onDropEdge,
  onMoveUp,
  onMoveDown,
  onCopy,
  onDuplicate,
  onToggleLock,
  onDelete,
  onFreeMove,
  onSnapMove,
  onEndSnapMove,
  onResizeFrame,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-block-menu]")) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
    };
  }, [menuOpen]);

  useCanvasKeyLayer(
    "canvas",
    (e) => {
      if (e.key === "Escape" && menuOpen) {
        e.preventDefault();
        setMenuOpen(false);
        return true;
      }
      return false;
    },
    menuOpen
  );

  const beginFreeDrag = (e: React.PointerEvent, threshold: number) => {
    if (!onFreeMove) return;
    if (threshold === 0) {
      e.preventDefault();
      e.stopPropagation();
    }
    const sx = e.clientX;
    const sy = e.clientY;
    let engaged = threshold === 0;
    let lastClientX = sx;
    let lastClientY = sy;
    let last = { dx: 0, dy: 0 };

    const applyMove = (cx: number, cy: number, altKey: boolean) => {
      const rawDx = Math.round(cx - sx);
      const rawDy = Math.round(cy - sy);
      const snapped = onSnapMove ? onSnapMove(rawDx, rawDy, altKey) : { dx: rawDx, dy: rawDy };
      last = snapped;
      setOffset(snapped);
    };

    const move = (ev: PointerEvent) => {
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      if (!engaged) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < threshold) return;
        engaged = true;
        window.getSelection()?.removeAllRanges();
      }
      applyMove(ev.clientX, ev.clientY, ev.altKey);
    };

    const onKeyToggleAlt = (kev: KeyboardEvent) => {
      if (!engaged || kev.key !== "Alt") return;
      applyMove(lastClientX, lastClientY, kev.altKey);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", onKeyToggleAlt);
      window.removeEventListener("keyup", onKeyToggleAlt);
      onEndSnapMove?.();
      if (engaged && (last.dx !== 0 || last.dy !== 0)) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        setOffset(null);
        onFreeMove(last.dx, last.dy);
      } else {
        setOffset(null);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", onKeyToggleAlt);
    window.addEventListener("keyup", onKeyToggleAlt);
    window.addEventListener("pointerup", up, { once: true });
  };

  const canDragBody = editable && selected && Boolean(onFreeMove);
  const showChrome = editable && (hovered || selected || editing || menuOpen || offset !== null);

  const selectionOutlineClass =
    editable && selected
      ? "outline outline-2 outline-offset-[2px] z-30"
      : editable && editing
        ? "outline outline-1 outline-offset-[2px] z-20"
        : hovered && editable
          ? "outline outline-1 outline-dashed outline-offset-[2px] outline-slate-300"
          : "";

  return (
    <div
      ref={ref}
      data-block-id={block.blockId}
      data-block-drag={canDragBody ? "" : undefined}
      className={`relative transition-shadow duration-75 ${selectionOutlineClass} ${
        canDragBody ? "cursor-move" : ""
      }`}
      style={{
        outlineColor: selected ? ACCENT : editing ? `${ACCENT}73` : undefined,
        ...(offset ? { transform: `translate(${offset.dx}px, ${offset.dy}px)`, zIndex: 50 } : {}),
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        if (!canDragBody || e.button !== 0) return;
        const target = e.target as Element | null;
        if (target?.closest?.("button, [data-block-menu], [data-resize-handle], [data-col-resize], [data-block-grip]")) {
          return;
        }
        beginFreeDrag(e, 3);
      }}
      onClick={(e) => {
        // Stop bubbling so outer canvas doesn't clear block selection
        e.stopPropagation();
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onSelectBlock?.(block.blockId);
      }}
      onDragOver={(e) => {
        if (!editable || !ref.current) return;
        e.preventDefault();
        onDragOverEdge?.(edgeFromEvent(e, ref.current));
      }}
      onDrop={(e) => {
        if (!editable || !ref.current) return;
        e.preventDefault();
        e.stopPropagation();
        onDropEdge?.(e, edgeFromEvent(e, ref.current));
      }}
    >
      {/* Drop indicator line */}
      {dropEdge && (
        <div
          className={`pointer-events-none absolute left-0 right-0 z-[40] h-[2px] ${
            dropEdge === "before" ? "-top-[5px]" : "-bottom-[5px]"
          }`}
          style={{ backgroundColor: DROP_LINE }}
        />
      )}

      {/* Resize corner markers when block is selected and resizable */}
      {editable && selected && resizable && onResizeFrame && (
        <CornerResizeMarkers onResize={onResizeFrame} color={ACCENT} />
      )}

      {/* Left ⋮⋮ Move Grip */}
      {showChrome && !hasOwnGrip && (
        <div
          data-block-grip=""
          title="끌어서 이동"
          {...(onFreeMove ? { onPointerDown: (e) => beginFreeDrag(e, 0) } : dragHandleProps)}
          className="absolute top-0 -left-[30px] z-[33] flex h-4 w-[30px] cursor-grab items-center active:cursor-grabbing"
          style={{ color: GRIP_COLOR }}
        >
          <GripIcon />
        </div>
      )}

      {/* Right [⚙️] Settings Button */}
      {showChrome && (
        <button
          type="button"
          title="블록 설정"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className="absolute top-0 -right-[30px] z-[33] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-neutral-100 shadow-sm"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {/* [⚙️] Block Settings Popup Menu */}
      {menuOpen && (
        <div
          data-block-menu
          role="menu"
          className="absolute top-0 right-0 z-[60] w-[168px] translate-x-[calc(100%+36px)] rounded-lg border bg-white p-1"
          style={{ borderColor: AFFORDANCE_BORDER, boxShadow: MENU_SHADOW }}
        >
          <MenuItem
            label="위로 이동"
            icon={<ArrowUp className="w-4 h-4" />}
            disabled={!canMoveUp}
            onSelect={() => {
              setMenuOpen(false);
              onMoveUp?.();
            }}
          />
          <MenuItem
            label="아래로 이동"
            icon={<ArrowDown className="w-4 h-4" />}
            disabled={!canMoveDown}
            onSelect={() => {
              setMenuOpen(false);
              onMoveDown?.();
            }}
          />
          <MenuItem
            label="복사"
            icon={<ClipboardCopy className="w-4 h-4" />}
            onSelect={() => {
              setMenuOpen(false);
              onCopy?.();
            }}
          />
          <MenuItem
            label="복제"
            icon={<Copy className="w-4 h-4" />}
            onSelect={() => {
              setMenuOpen(false);
              onDuplicate?.();
            }}
          />
          <MenuItem
            label={locked ? "잠금 해제" : "내용 잠금"}
            icon={locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            onSelect={() => {
              setMenuOpen(false);
              onToggleLock?.();
            }}
          />
          <div className="my-1 border-t" style={{ borderColor: AFFORDANCE_BORDER }} />
          <MenuItem
            label="삭제"
            icon={<Trash2 className="w-4 h-4" />}
            disabled={locked}
            danger
            onSelect={() => {
              if (locked) return;
              setMenuOpen(false);
              onDelete?.();
            }}
          />
        </div>
      )}

      {/* Injected Block Body */}
      {children}
    </div>
  );
};
