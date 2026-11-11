import type { BaseLayoutBlock } from "../base-block";
import type { GridColumnDef } from "../types";

export interface ColumnsGridBlockDef extends BaseLayoutBlock {
  kind: "columns-grid";
  widths: string[];
  cardStyle?: "card" | "plain";
  /** 칸 사이 간격 (px). 사진 묶음은 4 정도. */
  gap?: number;
  slotIds?: string[];
  columns?: GridColumnDef[];
}

