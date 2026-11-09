import type { CompositeFormFrameBlockDef, StructuredTableSectionDef } from "../../types";
import { defineBlockKind } from "../contract";

/** 복합 서식 프레임 — 위아래로 쌓은 표 구역들 (예스폼 · 반상회 회의록). */
export const frameBlock = defineBlockKind<CompositeFormFrameBlockDef>({
  kinds: ["composite-form-frame"],
  label: "복합 서식",
  category: "form",
  icon: "layout-template",
  slotIds: (b) => b.sections.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => c.slotId))),
  outline: (b, ctx) => ctx.emitFrame(b),
  tables: (b) => b.sections.map((s) => ({ sectionId: s.sectionId, title: s.title, table: s })),
  replaceTable: (b, sectionId, table) => ({
    ...b,
    sections: b.sections.map((s) => (s.sectionId === sectionId ? ({ ...s, ...table } as StructuredTableSectionDef) : s)),
  }),
  layout: { ownGrip: true },
  ai: { describe: (b) => [`구역 ${b.sections.length}개: ${b.sections.map((s, i) => `${i + 1}.${s.title || "제목 없음"}`).join(" / ")}`] },
});
