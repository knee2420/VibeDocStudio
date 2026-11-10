import type { StructuredTableBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot } from "./shared";
import { summaryItemSlotIds } from "./summary";

/** 표 (행 · 열 · 병합 칸, 아래 합계 줄). */
export const tableBlock = defineBlockKind<StructuredTableBlockDef>({
  kinds: ["structured-table", "table"],
  label: "표",
  category: "table",
  icon: "table",
  slotIds: (b) => [...b.rows.flatMap((r) => r.cells.map((c) => c.slotId)), ...summaryItemSlotIds(b.footerSummary?.items ?? [])],
  outline: (b, ctx) => ctx.emitTable(b),
  tables: (b) => [{ sectionId: null, title: b.title, table: b }],
  replaceTable: (b, _sectionId, table) => ({ ...b, ...table }) as StructuredTableBlockDef,
  layout: { ownGrip: true },
  insertable: {
    label: "표",
    description: "행/열 데이터 테이블",
    order: 3,
    shortcut: 3,
    defaultFrameHeight: 140,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const h1 = makeSlot(slots, `slot_th1_${suffix}`, "표 헤더 1", "<p>항목</p>", []);
      const h2 = makeSlot(slots, `slot_th2_${suffix}`, "표 헤더 2", "<p>내용</p>", []);
      const c1 = makeSlot(slots, `slot_tc1_${suffix}`, "표 1행 1열", "<p></p>", defaultBackdataRefs);
      const c2 = makeSlot(slots, `slot_tc2_${suffix}`, "표 1행 2열", "<p></p>", defaultBackdataRefs);
      return {
        block: {
          blockId: `blk_tbl_${suffix}`,
          kind: "structured-table",
          title: "표",
          columnWidths: ["32%", "68%"],
          borderRules: { outer: "1px solid #eaeaea", rowBottom: "1px solid #eaeaea", vertical: "1px solid #eaeaea" },
          headerStyle: { bg: "#f5f5f6", fontWeight: "600", padding: "8px" },
          cellPadding: "8px",
          rows: [
            {
              rowId: `r_h_${suffix}`,
              cells: [
                { cellId: `ch1_${suffix}`, slotId: h1, isHeader: true, hAlign: "center", vAlign: "middle" },
                { cellId: `ch2_${suffix}`, slotId: h2, isHeader: true, hAlign: "center", vAlign: "middle" },
              ],
            },
            {
              rowId: `r_1_${suffix}`,
              cells: [
                { cellId: `cc1_${suffix}`, slotId: c1, vAlign: "middle" },
                { cellId: `cc2_${suffix}`, slotId: c2, vAlign: "middle" },
              ],
            },
          ],
        },
        slots,
        focusSlotId: c1,
      };
    },
  },
  ai: { describe: (b) => [`열 너비: ${b.columnWidths.join(" / ")}`] },
});
