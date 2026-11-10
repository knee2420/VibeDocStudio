import React, { useEffect, useRef, useState } from "react";
import {
  CONTEXT_SLOTS,
  SlotChip,
  SlotMenu,
  type ContextSlot,
} from "./slots";

interface SlotItemProps {
  slot: ContextSlot;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  align?: "left" | "right";
}

const SlotItem: React.FC<SlotItemProps> = ({
  slot,
  isOpen,
  onToggle,
  onClose,
  align = "left",
}) => {
  const state = slot.useSlot();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={ref} className="relative flex-1 min-w-[120px] flex">
      <SlotChip
        slot={slot}
        state={state}
        open={isOpen}
        onToggleOpen={onToggle}
      />
      {isOpen && (
        <SlotMenu
          slot={slot}
          state={state}
          align={align}
          onClose={onClose}
        />
      )}
    </div>
  );
};

/**
 * Composer 설정바 — 입력창 위, 오래 걸어 두는 컨텍스트 슬롯 세팅.
 *
 * 표준 패턴(P1~P7)과 슬롯 레지스트리 기반으로 구성됩니다.
 * 슬롯을 추가하려면 `slots/registry.ts`에 추가하기만 하면 됩니다.
 */
export const ComposerSettingsBar: React.FC = () => {
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  return (
    <div
      data-testid="composer-settings-bar"
      className="mb-1.5 flex flex-wrap gap-1.5 text-[11px]"
    >
      {CONTEXT_SLOTS.map((slot, index) => {
        const isLast = index === CONTEXT_SLOTS.length - 1;
        return (
          <SlotItem
            key={slot.id}
            slot={slot}
            isOpen={activeSlotId === slot.id}
            onToggle={() =>
              setActiveSlotId((prev) => (prev === slot.id ? null : slot.id))
            }
            onClose={() => setActiveSlotId(null)}
            align={isLast ? "right" : "left"}
          />
        );
      })}
    </div>
  );
};
