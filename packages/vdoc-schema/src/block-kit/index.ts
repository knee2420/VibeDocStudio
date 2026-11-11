/**
 * block-kit — 블록 정의 규격 · 레지스트리 · 기본 종류. 새 블록 추가 방법은 `BLOCKS.md`.
 */
import { calloutBlock } from "./kinds/callout";
import { coverBlock } from "./kinds/cover";
import { fillableBlock } from "./kinds/fillable";
import { frameBlock } from "./kinds/frame";
import { gridBlock } from "./kinds/grid";
import { headingBlock } from "./kinds/heading";
import { imageBlock } from "./kinds/image";
import { sectionBlock } from "./kinds/section";
import { summaryBlock } from "./kinds/summary";
import { tableBlock } from "./kinds/table";
import { textBlock } from "./kinds/text";
import { linkCardBlock } from "./kinds/link-card";
import { dividerBlock } from "./kinds/divider";
import { heroBlock } from "./kinds/hero";
import { registerBlockKind } from "./registry";

/** 기본 블록 종류 (블록 추가 메뉴는 이 순서로 보인다). */
export const BUILTIN_BLOCK_KINDS = [
  sectionBlock,
  tableBlock,
  gridBlock,
  fillableBlock,
  textBlock,
  headingBlock,
  imageBlock,
  frameBlock,
  summaryBlock,
  coverBlock,
  calloutBlock,
  linkCardBlock,
  dividerBlock,
  heroBlock,
] as const;

for (const def of BUILTIN_BLOCK_KINDS) registerBlockKind(def as never);

export * from "./contract";
export * from "./registry";
