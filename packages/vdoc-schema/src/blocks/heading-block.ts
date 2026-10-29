import type { BaseLayoutBlock } from "../base-block";

export interface HeadingBlockDef extends BaseLayoutBlock {
  kind: "heading";
  slotId: string;
  level?: 1 | 2 | 3 | 4;
  align?: "left" | "center" | "right";
  letterSpacing?: string;
  underlineWidth?: string;
  underlineThickness?: string;
  underline?: {
    width?: string;
    thickness?: string;
    color?: string;
    marginTop?: string;
  };
}

export interface FormTitleBlockDef extends BaseLayoutBlock {
  kind: "form-title";
  slotId: string;
  align?: "left" | "center" | "right";
  underlineWidth?: string;
  underlineThickness?: string;
  letterSpacing?: string;
  underline?: {
    width?: string;
    thickness?: string;
    color?: string;
    marginTop?: string;
  };
}

