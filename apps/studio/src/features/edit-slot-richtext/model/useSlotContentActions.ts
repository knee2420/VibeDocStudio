import type { SlotConstraints } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";

export function useSlotContentActions() {
  // Ctrl+K(작성기 열기) · Esc(닫기) 단축키는 command-bus 의 전역 처리기가 맡는다.
  // 이 훅을 쓰는 컴포넌트마다 리스너를 달면 한 번 누를 때 여러 번 토글된다.
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);

  const updateSlotContent = (slotId: string, html: string) => {
    updateCurrentDoc((prev) => {
      // 같은 내용이면 바꾸지 않는다 (불필요한 재렌더 · 자동 저장 방지).
      if (prev.slots[slotId]?.content === html) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        slots: {
          ...prev.slots,
          [slotId]: {
            ...prev.slots[slotId],
            content: html,
            isEdited: true,
          },
        },
      };
    });
  };

  const updateSlotConstraints = (
    slotId: string,
    constraints: Partial<SlotConstraints>
  ) => {
    updateCurrentDoc((prev) => {
      const slot = prev.slots[slotId];
      if (!slot) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        slots: {
          ...prev.slots,
          [slotId]: {
            ...slot,
            constraints: {
              ...slot.constraints,
              ...constraints,
            },
          },
        },
      };
    });
  };

  const resetSlotEdit = (slotId: string) => {
    updateCurrentDoc((prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      slots: {
        ...prev.slots,
        [slotId]: {
          ...prev.slots[slotId],
          isEdited: false,
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
    updateSlotConstraints,
    resetSlotEdit,
    toggleSlotLock,
  };
}

