import type { ImageBlockDef } from "./image-block";
import type { TextBlockDef } from "./text-block";
import type { SectionBlockDef } from "./section-block";
import type { StructuredTableBlockDef } from "./table-block";
import type { ColumnsGridBlockDef } from "./grid-block";
import type { FillableGroupBlockDef } from "./fillable-block";
import type { HeadingBlockDef, FormTitleBlockDef } from "./heading-block";
import type {
  CompositeFormFrameBlockDef,
  SummaryListBlockDef,
  CoverBannerBlockDef,
} from "./summary-banner-blocks";

export * from "./image-block";
export * from "./text-block";
export * from "./section-block";
export * from "./table-block";
export * from "./grid-block";
export * from "./fillable-block";
export * from "./heading-block";
export * from "./summary-banner-blocks";

export type LayoutBlock =
  | ImageBlockDef
  | TextBlockDef
  | SectionBlockDef
  | StructuredTableBlockDef
  | ColumnsGridBlockDef
  | FillableGroupBlockDef
  | HeadingBlockDef
  | FormTitleBlockDef
  | CompositeFormFrameBlockDef
  | SummaryListBlockDef
  | CoverBannerBlockDef;

