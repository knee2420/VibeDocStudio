import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Lock,
  Plus,
  Settings,
  Trash2,
  Unlock,
} from "lucide-react";

import { listInsertableBlocks, type InsertableBlockKind } from "@vibe/vdoc-schema";

import { blockIcon } from "./block-views";
import { MenuItem, GripIcon } from "./InteractiveTable";
import { AFFORDANCE_BORDER, DROP_LINE, GRIP_COLOR, MENU_SHADOW } from "./tokens";

export type QuickAddKind = InsertableBlockKind;

/** 블록 사이 `+` 바로 추가 메뉴 — 블록 정의에 `insertable` 이 있는 종류 (레지스트리 순서). */
export const QUICK_ADD_ITEMS: { kind: QuickAddKind; label: string; icon: React.ReactNode }[] = listInsertableBlocks().map((item) => {
  const Icon = blockIcon(item.icon);
  return { kind: item.kind as QuickAddKind, label: item.label, icon: <Icon className="w-4 h-4" /> };
});

export type DropEdge = "before" | "after";

export interface BlockFrameProps {
  editable: boolean;
  /** Table blocks move through their own table-select grip, so no separate ⋮⋮ handle. */
  hasOwnGrip: boolean;
  locked: boolean;
  dropEdge: DropEdge | null;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragOverEdge: (edge: DropEdge) => void;
  onDropEdge: (e: React.DragEvent, edge: DropEdge) => void;
  onQuickAdd: (kind: QuickAddKind) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  /** Framed (fixed-position) blocks: the ⋮⋮ handle drags the block freely and reports the offset. */
  onFreeMove?: (dx: number, dy: number) => void;
  children: React.ReactNode;
}

const edgeFromEvent = (e: React.DragEvent, el: HTMLElement): DropEdge => {
  const r = el.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? "before" : "after";
};

/**
 * Block chrome modelled on PandaDoc's block selection (⋮⋮ move handle, ⚙ settings, `+` quick add)
 * with yesform's block drop line (2px #3b82f6 across the content width).
 */
export const BlockFrame: React.FC<BlockFrameProps> = ({
  editable,
  hasOwnGrip,
  locked,
  dropEdge,
  dragHandleProps,
  canMoveUp,
  canMoveDown,
  onDragOverEdge,
  onDropEdge,
  onQuickAdd,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleLock,
  onDelete,
  onFreeMove,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  /** A click/caret inside the block keeps its chrome up after the mouse leaves (PandaDoc). */
  const [active, setActive] = useState(false);
  const [menu, setMenu] = useState<"settings" | "add" | null>(null);

  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest?.("[data-keep-table-selection]")) return;
      if (ref.current && !ref.current.contains(target)) setActive(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

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

  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
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

  const showChrome = editable && (hovered || active || menu !== null || offset !== null);

  return (
    <div
      ref={ref}
      className="relative"
      style={offset ? { transform: `translate(${offset.dx}px, ${offset.dy}px)`, zIndex: 50 } : undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDownCapture={() => setActive(true)}
      onFocusCapture={() => setActive(true)}
      onDragOver={(e) => {
        if (!editable || !ref.current) return;
        e.preventDefault();
        onDragOverEdge(edgeFromEvent(e, ref.current));
      }}
      onDrop={(e) => {
        if (!editable || !ref.current) return;
        e.preventDefault();
        e.stopPropagation();
        onDropEdge(e, edgeFromEvent(e, ref.current));
      }}
    >
      {dropEdge && (
        <div
          className={`pointer-events-none absolute left-0 right-0 z-[40] h-[2px] ${dropEdge === "before" ? "-top-[5px]" : "-bottom-[5px]"}`}
          style={{ backgroundColor: DROP_LINE }}
        />
      )}

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

      {showChrome && (
        <>
          <button
            type="button"
            title="블록 추가"
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "add" ? null : "add");
            }}
            className="absolute top-1/2 -left-[34px] z-[33] flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-white text-slate-500 hover:bg-neutral-100"
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
            className="absolute top-0 -right-[30px] z-[33] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-neutral-100"
          >
            <Settings className="w-4 h-4" />
          </button>
        </>
      )}

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
                onQuickAdd(item.kind);
              }}
            />
          ))}
        </div>
      )}

      {menu === "settings" && (
        <div
          data-block-menu
          role="menu"
          className="absolute top-0 right-0 z-[60] w-[168px] translate-x-[calc(100%+36px)] rounded-lg border bg-white p-1"
          style={{ borderColor: AFFORDANCE_BORDER, boxShadow: MENU_SHADOW }}
        >
          <MenuItem label="위로 이동" icon={<ArrowUp className="w-4 h-4" />} disabled={!canMoveUp} onSelect={() => { setMenu(null); onMoveUp(); }} />
          <MenuItem label="아래로 이동" icon={<ArrowDown className="w-4 h-4" />} disabled={!canMoveDown} onSelect={() => { setMenu(null); onMoveDown(); }} />
          <MenuItem label="복제" icon={<Copy className="w-4 h-4" />} onSelect={() => { setMenu(null); onDuplicate(); }} />
          <MenuItem
            label={locked ? "잠금 해제" : "내용 잠금"}
            icon={locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            onSelect={() => { setMenu(null); onToggleLock(); }}
          />
          <div className="my-1 border-t" style={{ borderColor: AFFORDANCE_BORDER }} />
          <MenuItem label="삭제" icon={<Trash2 className="w-4 h-4" />} danger onSelect={() => { setMenu(null); onDelete(); }} />
        </div>
      )}

      {children}
    </div>
  );
};
