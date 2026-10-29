import type { BaseLayoutBlock } from "../base-block";
import type {
  StructuredTableSectionDef,
  TableBorderRules,
  TableSummaryItem,
} from "../types";

export interface CompositeFormFrameBlockDef extends BaseLayoutBlock {
  kind: "composite-form-frame";
  outerBorderWidth?: string;
  borderRules?: TableBorderRules;
  sections: StructuredTableSectionDef[];
}

export interface SummaryListBlockDef extends BaseLayoutBlock {
  kind: "summary-list";
  align?: "left" | "center" | "right";
  width?: string;
  items: TableSummaryItem[];
}

export interface CoverBannerBlockDef extends BaseLayoutBlock {
  kind: "cover-banner";
  backgroundTheme: "dark-architecture" | "emerald-gradient" | "slate-minimal";
  headlineSlotId: string;
  preparedBySlotId: string;
  preparedForSlotId: string;
}

