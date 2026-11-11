import { Upload, Link as LinkIcon } from "lucide-react";

import type { HeroBlockDef } from "@vibe/vdoc-schema";

import { resolveMediaSrc } from "../../mediaSrc";
import { defineBlockView } from "../contract";

/** 사진 표지 — 배경 사진(선택 단위 media) 위에 제목 · 부제 슬롯. */
export const heroView = defineBlockView<HeroBlockDef>({
  kinds: ["hero"],
  View: ({ block, ctx }) => {
    const src = resolveMediaSrc(block.image);
    const overlay = Math.max(0, Math.min(0.8, block.overlay ?? 0.35));
    const center = block.align === "center";
    return (
      <div className="relative w-full overflow-hidden rounded-md bg-gradient-to-br from-slate-700 to-emerald-900" style={{ height: block.height ?? 280 }}>
        {src && (
          <div {...ctx.unitAttrs(`${block.blockId}:image`, "media")} className="absolute inset-0">
            <img src={src} alt="" draggable={false} className="h-full w-full select-none object-cover" />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: `rgba(15, 23, 42, ${overlay})` }} />
        <div className={`relative z-10 flex h-full flex-col justify-end gap-1 px-7 pb-7 ${center ? "items-center text-center justify-center" : ""}`}>
          {ctx.renderSlot(block.titleSlotId, { className: "text-[26px] font-bold leading-snug text-white", darkTheme: true })}
          {block.subtitleSlotId && ctx.renderSlot(block.subtitleSlotId, { className: "text-[14px] text-white/85", darkTheme: true })}
        </div>
      </div>
    );
  },
  controls: (block, api) => {
    const patch = (next: Partial<HeroBlockDef>) => api.updateBlock((prev) => ({ ...prev, ...next }) as HeroBlockDef);
    return [
      {
        id: "replace",
        label: "표지 사진 교체",
        icon: Upload,
        group: "source",
        run: async () => {
          const file = await api.pickFile("image/*");
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" && patch({ image: reader.result });
          reader.readAsDataURL(file);
        },
      },
      {
        id: "url",
        label: "표지 사진 URL",
        icon: LinkIcon,
        group: "source",
        run: () => {
          const next = api.prompt("사진 주소 (또는 resource:<id>):", block.image ?? "");
          if (next?.trim()) patch({ image: next.trim() });
        },
      },
    ];
  },
});
