import type { BaseLayoutBlock } from "../base-block";

export interface TextBlockDef extends BaseLayoutBlock {
  kind: "text";
  slotId: string;
  align?: "left" | "center" | "right";
}

