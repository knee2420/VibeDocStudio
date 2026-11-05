import type { ImageBlockDef, LayoutBlock } from "@vibe/vdoc-schema";

import { ImageBlockView } from "../../blocks/ImageBlockView";
import { defineBlockView } from "../contract";

/** 이미지 — 블록 전체가 media 선택 단위 하나 (사각형 선택 · AI 첨부 대상). */
export const imageView = defineBlockView<ImageBlockDef>({
  kinds: ["image"],
  View: ({ block, ctx }) => (
    <div {...ctx.unitAttrs(block.blockId, "media")}>
      <ImageBlockView
        block={block}
        editable={ctx.editable}
        selected={ctx.selectedBlockId === block.blockId}
        onUpdateBlock={(updater) => ctx.updateBlock(updater as unknown as (prev: LayoutBlock) => LayoutBlock)}
      />
    </div>
  ),
});
