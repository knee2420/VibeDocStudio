import type { BaseLayoutBlock } from "../base-block";

export interface FillableGroupBlockDef extends BaseLayoutBlock {
  kind: "fillable-group";
  slotId: string;
  assigneeName: string;
  fieldType: "text-area" | "signature" | "date" | "kpi-summary";
}

