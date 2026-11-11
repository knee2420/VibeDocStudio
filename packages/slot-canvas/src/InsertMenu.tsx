import React, { useEffect, useMemo } from "react";

import { listInsertableBlocks, type InsertableBlockKind } from "@vibe/vdoc-schema";

import { blockIcon } from "./block-views";
import { useCanvasKeyLayer } from "./keyLayer";
import { MenuItem } from "./InteractiveTable";
import { AFFORDANCE_BORDER, MENU_SHADOW } from "./tokens";

export interface InsertMenuProps {
  y: number;
  onSelect: (kind: InsertableBlockKind | string) => void;
  onClose: () => void;
}

/**
 * 플로팅 `+` 버튼을 눌렀을 때 열리는 블록 삽입 메뉴 (`block-kit` 레지스트리 순서 · 숫자 단축키 `1`~`N`).
 */
export const InsertMenu: React.FC<InsertMenuProps> = ({ y, onSelect, onClose }) => {
  const items = useMemo(() => listInsertableBlocks(), []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.("[data-insert-menu], [data-insert-cursor-btn]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  useCanvasKeyLayer(
    "canvas",
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return true;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= 9) {
        const hit = items.find((item) => item.shortcut === num);
        if (hit) {
          e.preventDefault();
          onSelect(hit.kind);
          onClose();
          return true;
        }
      }
      return false;
    },
    true
  );

  return (
    <div
      data-insert-menu=""
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        top: Math.max(8, Math.round(y - 12)),
        left: 0,
        borderColor: AFFORDANCE_BORDER,
        boxShadow: MENU_SHADOW,
      }}
      className="absolute z-[60] w-[204px] rounded-lg border bg-white p-1"
    >
      <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400">블록 삽입 (1~{items.length})</div>
      {items.map((item) => {
        const Icon = blockIcon(item.icon);
        return (
          <MenuItem
            key={item.kind}
            label={item.label}
            icon={<Icon className="w-4 h-4 text-slate-500" />}
            trailing={
              <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 text-[10px] font-semibold text-slate-500">
                {item.shortcut}
              </span>
            }
            onSelect={() => {
              onSelect(item.kind);
              onClose();
            }}
          />
        );
      })}
    </div>
  );
};

