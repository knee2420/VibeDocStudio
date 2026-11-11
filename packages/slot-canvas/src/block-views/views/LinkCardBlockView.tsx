import { Link as LinkIcon, PanelTop, PanelLeft } from "lucide-react";

import type { LinkCardBlockDef } from "@vibe/vdoc-schema";

import { resolveMediaSrc } from "../../mediaSrc";
import { defineBlockView } from "../contract";

function domainOf(block: LinkCardBlockDef): string {
  if (block.domain) return block.domain;
  try {
    return block.url ? new URL(block.url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** 링크 카드 — 썸네일(선택 단위 media) + 제목 · 설명 슬롯 + 도메인 한 줄. */
export const linkCardView = defineBlockView<LinkCardBlockDef>({
  kinds: ["link-card"],
  View: ({ block, ctx }) => {
    const thumb = resolveMediaSrc(block.thumbnail);
    const left = block.layout === "thumb-left";
    const domain = domainOf(block);
    return (
      <div className="flex justify-center w-full py-1">
        <div
          className={`overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${left ? "flex" : ""}`}
          style={{ width: block.width || "72%" }}
        >
          {thumb && (
            <div
              {...ctx.unitAttrs(`${block.blockId}:thumb`, "media")}
              className={left ? "w-[34%] shrink-0 bg-slate-100" : "w-full bg-slate-100"}
            >
              <img src={thumb} alt="" draggable={false} className="block w-full h-full select-none" style={{ objectFit: "cover", aspectRatio: left ? undefined : "16 / 9" }} />
            </div>
          )}
          <div className="min-w-0 px-3.5 py-3 text-[13px] leading-[1.55] text-slate-700">
            {ctx.renderSlot(block.slotId)}
            {domain && <div className="mt-1 text-[11.5px] text-emerald-600 truncate">{domain}</div>}
          </div>
        </div>
      </div>
    );
  },
  controls: (block, api) => {
    const patch = (next: Partial<LinkCardBlockDef>) => api.updateBlock((prev) => ({ ...prev, ...next }) as LinkCardBlockDef);
    return [
      {
        id: "url",
        label: "링크 주소",
        icon: LinkIcon,
        group: "source",
        run: () => {
          const next = api.prompt("링크 주소를 입력하세요:", block.url);
          if (next !== null && next !== undefined) patch({ url: next.trim() });
        },
      },
      { id: "thumb-top", label: "썸네일 위", icon: PanelTop, group: "layout", active: block.layout !== "thumb-left", run: () => patch({ layout: "thumb-top" }) },
      { id: "thumb-left", label: "썸네일 왼쪽", icon: PanelLeft, group: "layout", active: block.layout === "thumb-left", run: () => patch({ layout: "thumb-left" }) },
    ];
  },
});
