import type { BaseLayoutBlock } from "../base-block";
import type {
  TableBorderRules,
  TableHeaderStyle,
  TableCellSlotDef,
  TableSummarySection,
} from "../types";

export interface StructuredTableBlockDef extends BaseLayoutBlock {
  kind: "structured-table" | "table";
  columnWidths: string[];
  tableWidthRatio?: number;
  borderRules?: TableBorderRules;
  headerStyle?: TableHeaderStyle;
  cellPadding?: string;
  footerSummary?: TableSummarySection;
  tableVariant?: "bordered" | "clean-invoice";
  rows: {
    rowId: string;
    height?: string;
    cells: TableCellSlotDef[];
  }[];
}

