import type { BaseLayoutBlock } from "../base-block";
import type { GridColumnDef } from "../types";

export interface ColumnsGridBlockDef extends BaseLayoutBlock {
  kind: "columns-grid";
  widths: string[];
  cardStyle?: "card" | "plain";
  slotIds?: string[];
  columns?: GridColumnDef[];
}

