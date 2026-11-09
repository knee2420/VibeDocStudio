import type { ContextRef } from "@vibe/ai-kernel";
import { getSlotBackdata, type VDocDocument, type VDocSlot } from "@vibe/vdoc-schema";

import { htmlToPlain } from "@/shared/lib";

/** 슬롯 → 컨텍스트 (본문 + 제약 + 연결 백데이터). 인라인 표면과 Composer 가 같은 직렬화를 쓴다. */
export function slotContext(d: VDocDocument, slot: VDocSlot, kind: "slot" | "selection" = "slot"): ContextRef {
  const constraints = slot.constraints ?? {};
  const lines = [
    `slotId: ${slot.slotId}`,
    `label: ${slot.label}`,
    `role: ${slot.role}`,
    constraints.maxLines ? `maxLines: ${constraints.maxLines}` : "",
    constraints.tone ? `tone: ${constraints.tone}` : "",
    constraints.locked ? "locked: true" : "",
    `content_html:\n${slot.content}`,
  ];
  const chunks = getSlotBackdata(d, slot);
  if (chunks.length) {
    lines.push("linked_backdata:");
    for (const c of chunks) lines.push(`- [${c.sourceTitle}] ${c.excerpt}`);
  }
  return {
    kind,
    id: slot.slotId,
    label: kind === "selection" ? `선택: ${slot.label}` : slot.label,
    content: lines.filter(Boolean).join("\n"),
    hint: htmlToPlain(slot.content, 60),
  };
}
