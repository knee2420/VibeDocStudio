/** 정의들이 함께 쓰는 작은 도구. */
import type { VDocSlot } from "../../types";
import type { BlockOutlineContext } from "../contract";

/** 슬롯 하나짜리 블록의 아웃라인: 그 슬롯을 페이지 바로 아래에 (고정 문구면 회색). */
export function outlineSingleSlot(slotId: string, ctx: BlockOutlineContext): void {
  const slot = ctx.doc.slots[slotId];
  if (!slot) return;
  ctx.emitSlot(ctx.pageNode, slotId, ctx.nameStandaloneSlot(slot, ctx.blockTitle), slot.role === "boilerplate");
}

/** 슬롯 여러 개 블록의 아웃라인: 하나면 그 슬롯, 여럿이면 컨테이너 아래에. */
export function outlineSlotGroup(slotIds: string[], ctx: BlockOutlineContext, title: string, summary: (n: number) => string): void {
  const present = slotIds.filter((id) => ctx.doc.slots[id]);
  if (present.length === 0) return;
  if (present.length === 1) {
    outlineSingleSlot(present[0], ctx);
    return;
  }
  const group = ctx.emitContainer(ctx.pageNode, ctx.blockNodeId, ctx.blockTitle || title, summary(present.length));
  ctx.emitSlotGroup(
    group,
    present.map((slotId) => ({
      slotId,
      name: ctx.nameStandaloneSlot(ctx.doc.slots[slotId], ""),
      isStatic: ctx.doc.slots[slotId].role === "boilerplate",
    }))
  );
}

export function makeSlot(
  slots: Record<string, VDocSlot>,
  slotId: string,
  label: string,
  content: string,
  refs: string[],
  extra?: Partial<VDocSlot>
): string {
  slots[slotId] = { slotId, label, role: "editable-slot", content, backDataRefs: refs, ...extra };
  return slotId;
}

export const ALIGN_PROP = { type: "string", description: "정렬", enum: ["left", "center", "right"] } as const;
