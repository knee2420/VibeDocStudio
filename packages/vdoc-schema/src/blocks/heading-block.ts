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
  /** 장식: quote = 위에 따옴표 · bar = 왼쪽 세로 막대 · none (블로그 소제목 등). */
  decoration?: "none" | "quote" | "bar";
  /** 장식 · 글자 강조색 (예: #00a84b). */
  accent?: string;
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

