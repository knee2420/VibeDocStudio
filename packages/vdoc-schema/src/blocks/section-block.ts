import type { BaseLayoutBlock } from "../base-block";

export interface SectionBlockDef extends BaseLayoutBlock {
  kind: "section-block";
  headingSlotId: string;
  bodySlotId: string;
}

