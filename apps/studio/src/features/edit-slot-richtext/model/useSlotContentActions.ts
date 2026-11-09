import {
  patchSlotConstraints,
  restoreSlotOriginal,
  setSlotContent,
  withSlotFill,
  toggleSlotLock as toggleSlotLockOp,
  type SlotConstraints,
} from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";

/**
 * 슬롯 내용 · 서식 · 잠금 명령. 변환 규칙은 `@vibe/vdoc-schema` 의 슬롯 연산이 정한다.
 * 타이핑은 슬롯 편집기 자체 이력을 쓰므로 공용 이력에 남기지 않고, 원문 복원 · 잠금만 남긴다.
 *
 * Ctrl+K(작성기 열기) · Esc(닫기) 단축키는 command-bus 의 전역 처리기가 맡는다.
 */
export function useSlotContentActions() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);

  return {
    updateSlotContent: (slotId: string, html: string) =>
      updateCurrentDoc((doc) => {
        const next = setSlotContent(doc, slotId, html);
        // AI 가 쓴 칸을 사람이 고치면 그 칸은 사람의 것이 된다 (채움 상태 · 이력의 작성자)
        const fill = doc.slots[slotId]?.fill;
        return fill?.author === "ai" && next !== doc ? withSlotFill(next, slotId, { author: "human", at: new Date().toISOString() }) : next;
      }),

    /** 사람이 내용을 확인했다 (AI 초안 → 검증됨). 다시 누르면 해제. */
    toggleSlotVerified: (slotId: string) =>
      updateCurrentDoc(
        (doc) => {
          const slot = doc.slots[slotId];
          if (!slot) return doc;
          const fill = slot.fill ?? { author: "human" as const, at: new Date().toISOString() };
          return withSlotFill(doc, slotId, { ...fill, verifiedAt: fill.verifiedAt ? undefined : new Date().toISOString() });
        },
        { history: true, label: "슬롯 검증 표시" }
      ),

    updateSlotConstraints: (slotId: string, constraints: Partial<SlotConstraints>) =>
      updateCurrentDoc((doc) => patchSlotConstraints(doc, slotId, constraints)),

    /** 첫 편집 이전 원문으로 되돌린다. */
    resetSlotEdit: (slotId: string) =>
      updateCurrentDoc((doc) => restoreSlotOriginal(doc, slotId), { history: true, label: "슬롯 원문 복원" }),

    toggleSlotLock: (slotId: string) =>
      updateCurrentDoc((doc) => toggleSlotLockOp(doc, slotId), { history: true, label: "슬롯 잠금 전환" }),
  };
}
