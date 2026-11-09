/**
 * 여러 슬롯 범위의 인라인 AI — 한 번 실행해 슬롯별 새 본문(JSON `{slotId: html}`)을 받고,
 * 미리보기에서 고른 것만 한꺼번에 반영(되돌리기 한 번)하거나 Staged 로 보낸다.
 */
import type { AiAction } from "@vibe/ai-kernel";
import { setSlotContent, withSlotFill, type StagedAiChange } from "@vibe/vdoc-schema";

import { buildSlotHtmlChange, useAiStagingStore } from "@/entities/ai-staging";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { newId } from "@/shared/lib";

import { editableSlotIds } from "./contextBuilders";

export const SLOT_RANGE_SURFACE = "slot-range";

const each = "각 칸의 역할 · 표 위치 · 분량을 지키고, 칸끼리 내용이 겹치지 않게";

export const SLOT_RANGE_ACTIONS: AiAction[] = [
  { id: "range-polish", label: "다듬기", icon: "wand", surfaces: [SLOT_RANGE_SURFACE], outputFormat: "html", instruction: `고른 칸들의 문장을 더 명확하고 자연스럽게 다듬어라. ${each}.` },
  { id: "range-formal", label: "공문서체로", icon: "file", surfaces: [SLOT_RANGE_SURFACE], outputFormat: "html", instruction: `고른 칸들을 공문서 · 회의록 문체(간결한 개조식, 명사형 종결)로 바꿔라. ${each}.` },
  { id: "range-concise", label: "간결하게", icon: "minimize", surfaces: [SLOT_RANGE_SURFACE], outputFormat: "html", instruction: `고른 칸들을 핵심만 남겨 더 짧게 줄여라. ${each}.` },
  { id: "range-fill", label: "빈 칸 채우기", icon: "pencil", surfaces: [SLOT_RANGE_SURFACE], outputFormat: "html", instruction: `고른 칸 중 비어 있거나 자리표시만 있는 칸을 주변 칸 · 문서 맥락에 맞게 채워라. 이미 내용이 있는 칸은 넣지 마라.` },
  { id: "range-translate-en", label: "영어로", icon: "languages", surfaces: [SLOT_RANGE_SURFACE], outputFormat: "html", instruction: `고른 칸들을 자연스러운 업무용 영어로 번역하라. ${each}.` },
];

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
