/**
 * @vibe/vdoc-schema — 블록 박스에서 새로 끼워 넣는 기본 블록 틀.
 * 블록과 그 블록이 쓰는 빈 슬롯을 함께 만든다. 담당자 같은 사람 정보는 비워 둔다.
 */
import type { LayoutBlock, VDocSlot } from "./types";

export type InsertableBlockKind = "columns-grid" | "structured-table" | "section-block" | "fillable-group";

export interface InsertableBlockDraft {
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
  /** 끼워 넣은 뒤 바로 편집할 슬롯. */
  focusSlotId: string;
}

export interface InsertableBlockOptions {
  /** 모든 id 에 붙는 고유 접미사. */
  suffix: string;
  /** 본문 슬롯에 미리 연결할 백데이터 청크. */
  defaultBackdataRefs?: string[];
}

export function createInsertableBlock(
  kind: InsertableBlockKind,
  { suffix, defaultBackdataRefs = [] }: InsertableBlockOptions
): InsertableBlockDraft {
  const slots: Record<string, VDocSlot> = {};
  const slot = (slotId: string, label: string, content: string, refs: string[], extra?: Partial<VDocSlot>) => {
    slots[slotId] = { slotId, label, role: "editable-slot", content, backDataRefs: refs, ...extra };
    return slotId;
  };

  switch (kind) {
    case "columns-grid": {
      const left = slot(`slot_col1_${suffix}`, "좌측 컬럼 슬롯", "<p></p>", defaultBackdataRefs);
      const right = slot(`slot_col2_${suffix}`, "우측 컬럼 슬롯", "<p></p>", defaultBackdataRefs);
      return {
        block: {
          blockId: `blk_cols_${suffix}`,
          kind: "columns-grid",
          title: "2단 그리드",
          widths: ["1fr", "1fr"],
          cardStyle: "plain",
          slotIds: [left, right],
        },
        slots,
        focusSlotId: left,
      };
    }

    case "structured-table": {
      const h1 = slot(`slot_th1_${suffix}`, "표 헤더 1", "<p>항목</p>", []);
      const h2 = slot(`slot_th2_${suffix}`, "표 헤더 2", "<p>내용</p>", []);
      const c1 = slot(`slot_tc1_${suffix}`, "표 1행 1열", "<p></p>", defaultBackdataRefs);
      const c2 = slot(`slot_tc2_${suffix}`, "표 1행 2열", "<p></p>", defaultBackdataRefs);
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
    }

    case "fillable-group": {
      const field = slot(`slot_fill_${suffix}`, "할당형 입력 슬롯", "<p></p>", defaultBackdataRefs, {
        role: "fillable-field",
      });
      return {
        block: {
          blockId: `blk_fill_${suffix}`,
          kind: "fillable-group",
          title: "할당형 입력 필드",
          slotId: field,
          assigneeName: "",
          fieldType: "text-area",
        },
        slots,
        focusSlotId: field,
      };
    }

    case "section-block": {
      const heading = slot(`slot_sec_h_${suffix}`, "섹션 제목", "<h2>새 섹션</h2>", []);
      const body = slot(`slot_sec_b_${suffix}`, "섹션 본문", "<p></p>", defaultBackdataRefs);
      return {
        block: {
          blockId: `blk_sec_${suffix}`,
          kind: "section-block",
          title: "텍스트 섹션",
          headingSlotId: heading,
          bodySlotId: body,
        },
        slots,
        focusSlotId: body,
      };
    }
  }
}
