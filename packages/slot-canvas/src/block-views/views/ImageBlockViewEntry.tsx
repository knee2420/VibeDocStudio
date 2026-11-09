import { AlignCenter, AlignLeft, AlignRight, Link, RefreshCw, Upload } from "lucide-react";

import type { ImageBlockDef } from "@vibe/vdoc-schema";

import { ImageBlockView } from "../../blocks/ImageBlockView";
import { defineBlockView } from "../contract";

/** 이미지 — 블록 전체가 media 선택 단위 하나 (사각형 선택 · AI 첨부 대상). 조작은 위쪽 툴바의 블록 도구. */
export const imageView = defineBlockView<ImageBlockDef>({
  kinds: ["image"],
  View: ({ block, ctx }) => (
    <div {...ctx.unitAttrs(block.blockId, "media")}>
      <ImageBlockView block={block} />
    </div>
  ),
  controls: (block, api) => {
    const patch = (next: Partial<ImageBlockDef>) => api.updateBlock((prev) => ({ ...prev, ...next }) as ImageBlockDef);
    const align = block.align ?? "left";
    return [
      {
        id: "replace",
        label: "이미지 교체",
        icon: Upload,
        group: "source",
        run: async () => {
          const file = await api.pickFile("image/*");
          if (file) patch({ src: URL.createObjectURL(file), alt: file.name });
        },
      },
      {
        id: "url",
        label: "이미지 URL",
        icon: Link,
        group: "source",
        run: () => {
          const next = api.prompt("이미지 URL을 입력하세요:", block.src.startsWith("blob:") ? "" : block.src);
          if (next?.trim()) patch({ src: next.trim() });
        },
      },
      { id: "align-left", label: "왼쪽 정렬", icon: AlignLeft, group: "align", active: align === "left", run: () => patch({ align: "left" }) },
      { id: "align-center", label: "가운데 정렬", icon: AlignCenter, group: "align", active: align === "center", run: () => patch({ align: "center" }) },
      { id: "align-right", label: "오른쪽 정렬", icon: AlignRight, group: "align", active: align === "right", run: () => patch({ align: "right" }) },
      {
        id: "reset-size",
        label: "원래 크기로",
        icon: RefreshCw,
        group: "size",
        run: () =>
          api.updateBlock((prev) => {
            const img = prev as ImageBlockDef;
            return { ...img, width: undefined, height: undefined, frame: img.frame ? { ...img.frame, w: 320, h: undefined } : undefined };
          }),
      },
    ];
  },
});
