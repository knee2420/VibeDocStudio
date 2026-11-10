/**
 * 여러 슬롯 범위의 인라인 AI — 한 번 실행해 슬롯별 새 본문(JSON `{slotId: html}`)을 받고,
 * 미리보기에서 고른 것만 한꺼번에 반영(되돌리기 한 번)하거나 Staged 로 보낸다.
 */
import type { AiAction } from "@vibe/ai-kernel";
import inline from "@vibe/harness-packs/authoring/inline-actions.json";
import { setSlotContent, withSlotFill, type StagedAiChange } from "@vibe/vdoc-schema";

import { buildSlotHtmlChange, useAiStagingStore } from "@/entities/ai-staging";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { newId } from "@/shared/lib";

import { editableSlotIds } from "./contextBuilders";

export const SLOT_RANGE_SURFACE = "slot-range";

/** 범위 AI 지시 — 하네스 authoring 팩(`inline-actions.json`). `{each}` 는 칸마다 지킬 공통 조건이다. */
export const SLOT_RANGE_ACTIONS: AiAction[] = inline.range.actions.map((action) => ({
  ...action,
  outputFormat: action.outputFormat as AiAction["outputFormat"],
  surfaces: [SLOT_RANGE_SURFACE],
  instruction: action.instruction.replace("{each}", () => inline.range.each),
}));

/** 모델 출력 → `{slotId: html}`. 바꿀 수 있는 칸 · 실제로 달라진 칸만 남긴다. */
export function parseSlotMap(text: string, slotIds: string[]): Record<string, string> {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  if (!doc) return {};
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI 결과를 칸별로 읽지 못했습니다 (JSON 아님).");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("AI 결과를 칸별로 읽지 못했습니다 (JSON 형식 오류).");
  }
  const allowed = new Set(editableSlotIds(doc, slotIds));
  const out: Record<string, string> = {};
  for (const [slotId, html] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    if (!allowed.has(slotId) || typeof html !== "string" || !html.trim()) continue;
    if (html.trim() === doc.slots[slotId]?.content.trim()) continue;
    out[slotId] = html.trim();
  }
  return out;
}

/** 고른 칸들을 한 번에 반영한다 — 공용 이력에 한 항목(Ctrl+Z 한 번으로 모두 되돌림). */
export function applySlotMap(map: Record<string, string>, label: string): number {
  const entries = Object.entries(map);
  if (entries.length === 0) return 0;
  useStudioDocumentStore
    .getState()
    .updateCurrentDoc(
      (doc) => {
        const at = new Date().toISOString();
        return entries.reduce(
          (acc, [slotId, html]) => withSlotFill(setSlotContent(acc, slotId, html), slotId, { author: "ai", harnessId: "rewrite.range", at }),
          doc
        );
      },
      {
        history: true,
        label: `AI ${label} (${entries.length}칸)`,
        change: { slotIds: entries.map(([id]) => id), author: "ai", harnessId: "rewrite.range", label: `[범위 AI] ${label}` },
      }
    );
  return entries.length;
}

/** 바로 반영하지 않고 Staged 대기열로 보낸다 (검토 후 승인). */
export function stageSlotMap(map: Record<string, string>, reason: string): number {
  const doc = selectActiveDocument(useStudioDocumentStore.getState());
  if (!doc) return 0;
  const changes: StagedAiChange[] = Object.entries(map).flatMap(([slotId, html]) => {
    const slot = doc.slots[slotId];
    return slot ? [buildSlotHtmlChange(doc, slot, html, { source: "인라인 AI", reason, idPrefix: "stg-inline-range", harnessId: "rewrite.range" })] : [];
  });
  if (changes.length) useAiStagingStore.getState().enqueue(changes);
  return changes.length;
}
