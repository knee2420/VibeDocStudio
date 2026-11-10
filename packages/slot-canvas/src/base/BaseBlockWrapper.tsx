import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  Copy,
  Lock,
  Plus,
  Settings,
  Trash2,
  Unlock,
} from "lucide-react";

import type { BaseLayoutBlock } from "@vibe/vdoc-schema";

import { MenuItem, GripIcon } from "../InteractiveTable";
import { ACCENT, AFFORDANCE_BORDER, DROP_LINE, GRIP_COLOR, MENU_SHADOW } from "../tokens";
import { CornerResizeMarkers } from "./CornerResizeMarkers";
import { QUICK_ADD_ITEMS, type DropEdge, type QuickAddKind } from "../BlockFrame";

export interface BaseBlockWrapperProps {
  block: BaseLayoutBlock;
  editable: boolean;
  selected: boolean;
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
  onQuickAdd?: (kind: QuickAddKind) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onToggleLock?: () => void;
  onDelete?: () => void;
  onFreeMove?: (dx: number, dy: number) => void;
  onResizeFrame?: (dw: number, dh: number) => void;
  children: React.ReactNode;
}

const edgeFromEvent = (e: React.DragEvent, el: HTMLElement): DropEdge => {
  const r = el.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? "before" : "after";
};

/**
 * BaseBlockWrapper: Unified Base Block Chrome for all .vdoc layout blocks.
 * Implements PandaDoc-style 2px selection outline, corner resize markers,
 * left ⋮⋮ drag handle, quick-add [+] and right ⚙️ settings menu.
 */
export const BaseBlockWrapper: React.FC<BaseBlockWrapperProps> = ({
  block,
  editable,
  selected,
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
  onQuickAdd,
  onMoveUp,
  onMoveDown,
  onCopy,
  onDuplicate,
  onToggleLock,
  onDelete,
  onFreeMove,
  onResizeFrame,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [menu, setMenu] = useState<"settings" | "add" | null>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-block-menu]")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const startFreeMove = (e: React.PointerEvent) => {
    if (!onFreeMove) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let last = { dx: 0, dy: 0 };
    const move = (ev: PointerEvent) => {
      last = { dx: Math.round(ev.clientX - sx), dy: Math.round(ev.clientY - sy) };
      setOffset(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      setOffset(null);
      if (last.dx || last.dy) onFreeMove(last.dx, last.dy);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const showChrome = editable && (hovered || selected || menu !== null || offset !== null);

  const selectionOutlineClass =
    editable && selected
      ? "outline outline-2 outline-offset-[2px] z-30"
      : hovered && editable
        ? "outline outline-1 outline-dashed outline-offset-[2px] outline-slate-300"
        : "";

  return (
    <div
      ref={ref}
      data-block-id={block.blockId}
      className={`relative transition-shadow duration-75 ${selectionOutlineClass}`}
      style={{
        outlineColor: selected ? ACCENT : undefined,
        ...(offset ? { transform: `translate(${offset.dx}px, ${offset.dy}px)`, zIndex: 50 } : {}),
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={(e) => {
        // Stop bubbling so outer canvas doesn't clear block selection
        e.stopPropagation();
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
          title="끌어서 이동"
          {...(onFreeMove ? { onPointerDown: startFreeMove } : dragHandleProps)}
          className="absolute top-0 -left-[30px] z-[33] flex h-4 w-[30px] cursor-grab items-center active:cursor-grabbing"
          style={{ color: GRIP_COLOR }}
        >
          <GripIcon />
        </div>
      )}

      {/* Left [+] Quick Add & Right [⚙️] Settings Button */}
      {showChrome && (
        <>
          <button
            type="button"
            title="블록 추가"
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "add" ? null : "add");
            }}
            className="absolute top-1/2 -left-[34px] z-[33] flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-white text-slate-500 hover:bg-neutral-100 shadow-sm"
            style={{ borderColor: AFFORDANCE_BORDER }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="블록 설정"
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "settings" ? null : "settings");
            }}
            className="absolute top-0 -right-[30px] z-[33] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-neutral-100 shadow-sm"
          >
            <Settings className="w-4 h-4" />
          </button>
        </>
      )}

      {/* [+] Quick Add Popup Menu */}
      {menu === "add" && (
        <div
          data-block-menu
          role="menu"
          className="absolute top-1/2 left-0 z-[60] w-[176px] -translate-x-[calc(100%+40px)] rounded-lg border bg-white p-1"
          style={{ borderColor: AFFORDANCE_BORDER, boxShadow: MENU_SHADOW }}
        >
          <div className="px-2.5 py-1 text-[11px] text-slate-400">아래에 추가</div>
          {QUICK_ADD_ITEMS.map((item) => (
            <MenuItem
              key={item.kind}
              label={item.label}
              icon={item.icon}
              onSelect={() => {
                setMenu(null);
                onQuickAdd?.(item.kind);
              }}
            />
          ))}
        </div>
      )}

      {/* [⚙️] Block Settings Popup Menu */}
      {menu === "settings" && (
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
              setMenu(null);
              onMoveUp?.();
            }}
          />
          <MenuItem
            label="아래로 이동"
            icon={<ArrowDown className="w-4 h-4" />}
            disabled={!canMoveDown}
            onSelect={() => {
              setMenu(null);
              onMoveDown?.();
            }}
          />
          <MenuItem
            label="복사"
            icon={<ClipboardCopy className="w-4 h-4" />}
            onSelect={() => {
              setMenu(null);
              onCopy?.();
            }}
          />
          <MenuItem
            label="복제"
            icon={<Copy className="w-4 h-4" />}
            onSelect={() => {
              setMenu(null);
              onDuplicate?.();
            }}
          />
          <MenuItem
            label={locked ? "잠금 해제" : "내용 잠금"}
            icon={locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            onSelect={() => {
              setMenu(null);
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
              setMenu(null);
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

