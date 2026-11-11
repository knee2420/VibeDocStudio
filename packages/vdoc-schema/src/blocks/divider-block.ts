import type { BaseLayoutBlock } from "../base-block";

/** 구분선 — 슬롯 없는 장식 (섹션 사이 여백 · 선). */
export interface DividerBlockDef extends BaseLayoutBlock {
  kind: "divider";
  /** line: 가로 선 · short: 가운데 짧은 선 · dots: 점 세 개 · space: 빈 여백. */
  variant?: "line" | "short" | "dots" | "space";
  /** 위아래 여백 (px). */
  spacing?: number;
}
