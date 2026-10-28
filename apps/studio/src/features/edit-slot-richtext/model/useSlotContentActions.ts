import { useEffect } from "react";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

export function useSlotContentActions() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const setComposerOpenSlotId = useSlotSelectionStore(
    (s) => s.setComposerOpenSlotId
  );
  const toggleComposerForSlot = useSlotSelectionStore(
    (s) => s.toggleComposerForSlot
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (selectedSlotId) {
          toggleComposerForSlot(selectedSlotId);
        }
      } else if (e.key === "Escape") {
        setComposerOpenSlotId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSlotId, setComposerOpenSlotId, toggleComposerForSlot]);

  const updateSlotContent = (slotId: string, html: string) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      slots: {
        ...prev.slots,
        [slotId]: {
          ...prev.slots[slotId],
          content: html,
        },
      },
    }));
  };

  const toggleSlotLock = (slotId: string) => {
    updateCurrentDoc((prev) => {
      const slot = prev.slots[slotId];
      if (!slot) return prev;
      const isLocked = Boolean(slot.constraints?.locked);
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: {
            ...slot,
            role: isLocked ? "editable-slot" : "boilerplate",
            constraints: {
              ...slot.constraints,
              locked: !isLocked,
            },
          },
        },
      };
    });
  };

  return {
    updateSlotContent,
    toggleSlotLock,
  };
}

