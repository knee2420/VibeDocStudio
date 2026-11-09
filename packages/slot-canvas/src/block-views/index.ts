/**
 * 블록 뷰 — 기본 종류 등록. 새 블록 추가 방법은 `@vibe/vdoc-schema` 의 `BLOCKS.md`.
 */
import { registerBlockView } from "./registry";
import { calloutView } from "./views/CalloutBlockView";
import { coverView } from "./views/CoverBlockView";
import { fillableView } from "./views/FillableBlockView";
import { frameView } from "./views/FrameBlockView";
import { gridView } from "./views/GridBlockView";
import { headingView } from "./views/HeadingBlockView";
import { imageView } from "./views/ImageBlockViewEntry";
import { sectionView } from "./views/SectionBlockView";
import { summaryView } from "./views/SummaryBlockView";
import { tableView } from "./views/TableBlockView";
import { textView } from "./views/TextBlockView";

export const BUILTIN_BLOCK_VIEWS = [
  textView,
  headingView,
  calloutView,
  sectionView,
  fillableView,
  coverView,
  gridView,
  tableView,
  frameView,
  summaryView,
  imageView,
] as const;

for (const view of BUILTIN_BLOCK_VIEWS) registerBlockView(view as never);

export * from "./contract";
export * from "./registry";
export { blockIcon } from "./icons";
