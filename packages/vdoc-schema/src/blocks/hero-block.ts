import type { BaseLayoutBlock } from "../base-block";

/** 사진 표지 — 배경 사진 위에 제목 · 부제 (블로그 · 칼럼 첫머리). */
export interface HeroBlockDef extends BaseLayoutBlock {
  kind: "hero";
  /** 배경 사진 (`resource:<id>` · http · data:). 없으면 색 바탕. */
  image?: string;
  titleSlotId: string;
  subtitleSlotId?: string;
  /** 높이 (px). */
  height?: number;
  /** 글자 위치. */
  align?: "left" | "center";
  /** 사진 어둡게 (0~0.8). */
  overlay?: number;
}
