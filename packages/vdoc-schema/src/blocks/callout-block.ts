import type { BaseLayoutBlock } from "../base-block";

/** 안내 · 강조 상자 — 본문 슬롯 하나를 연한 배경 상자로 감싼다 (참조 문서 import 에서 나온다). */
export interface CalloutBoxBlockDef extends BaseLayoutBlock {
  kind: "callout-box";
  slotId: string;
  tone?: "neutral" | "info" | "warning";
}
