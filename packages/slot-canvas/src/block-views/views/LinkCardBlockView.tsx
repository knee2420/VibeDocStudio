import { ExternalLink, Link as LinkIcon, PanelLeft, PanelTop, Sparkles } from "lucide-react";
import { resolveFrameStyle, resolveTextRoleStyle } from "@vibe/style-core";
import type { LinkCardBlockDef } from "@vibe/vdoc-schema";

import { resolveMediaSrc } from "../../mediaSrc";
import { useVDocStyle } from "../../styleContext";
import { defineBlockView } from "../contract";

function domainOf(block: LinkCardBlockDef): string {
  if (block.domain) return block.domain;
  try {
    return block.url ? new URL(block.url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** 링크 카드 & 블로그 CTA 배너 — `@vibe/style-core` Frame/Typography Kit 소비. */
export const linkCardView = defineBlockView<LinkCardBlockDef>({
  kinds: ["link-card"],
  View: ({ block, ctx }) => {
    const docStyle = useVDocStyle();
    const domain = domainOf(block);

    if (block.variant === "cta") {
      const frame = docStyle
        ? resolveFrameStyle(docStyle.resolvedPack, "cta", undefined, block.styleOverrides)
        : null;
      const textRole = docStyle
        ? resolveTextRoleStyle(
            docStyle.resolvedPack,
            "cta",
            "link-card[variant=cta]",
            undefined,
            block.styleOverrides
          )
        : null;
      const align = frame?.align ?? "center";
      const showChevron = block.ctaChevron !== undefined ? block.ctaChevron : (frame?.chevron ?? true);
      const itemsClass =
        align === "left" ? "items-start text-left" : align === "right" ? "items-end text-right" : "items-center text-center";

      return (
        <div
          className={`flex w-full flex-col justify-center gap-1.5 ${itemsClass}`}
          style={{
            marginTop: frame?.marginY ?? "16px",
            marginBottom: frame?.marginY ?? "16px",
          }}
        >
          {showChevron && (
            <div
              aria-hidden="true"
              className="select-none text-[11px] tracking-[0.25em]"
              style={{ color: frame?.chevronColor ?? "#f43f5e" }}
            >
              ▼▼▼
            </div>
          )}
          <div
            className="inline-flex items-center gap-1.5 underline underline-offset-4"
            style={{
              backgroundColor: frame?.fill ?? "rgba(254, 240, 138, 0.9)",
              color: textRole?.color ?? frame?.color ?? "#1e293b",
              border: frame?.border,
              borderRadius: frame?.radius ?? "2px",
              padding: frame?.padding ?? "4px 12px",
              fontSize: textRole?.fontSize ?? "14px",
              fontWeight: textRole?.fontWeight ?? "600",
              textDecorationColor: frame?.underlineColor ?? "rgba(5, 150, 105, 0.7)",
            }}
          >
            <div className="min-w-0">{ctx.renderSlot(block.slotId)}</div>
            {block.url && (
              <a
                href={block.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={block.url}
                className="inline-flex shrink-0 items-center hover:opacity-80"
                style={{ color: frame?.titleColor ?? "#047857" }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {domain && <div className="text-[11px] text-slate-400">{domain}</div>}
        </div>
      );
    }

    const thumb = resolveMediaSrc(block.thumbnail);
    const left = block.layout === "thumb-left";
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
              <img
                src={thumb}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                draggable={false}
                className="block w-full h-full select-none"
                style={{ objectFit: "cover", aspectRatio: left ? undefined : "16 / 9" }}
              />
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
    const isCta = block.variant === "cta";
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
      {
        id: "variant-toggle",
        label: isCta ? "CTA 배너" : "링크 카드",
        icon: Sparkles,
        group: "layout",
        showLabel: true,
        active: isCta,
        run: () => patch({ variant: isCta ? "card" : "cta", ctaChevron: !isCta }),
      },
      { id: "thumb-top", label: "썸네일 위", icon: PanelTop, group: "layout", active: !isCta && block.layout !== "thumb-left", run: () => patch({ variant: "card", layout: "thumb-top" }) },
      { id: "thumb-left", label: "썸네일 왼쪽", icon: PanelLeft, group: "layout", active: !isCta && block.layout === "thumb-left", run: () => patch({ variant: "card", layout: "thumb-left" }) },
    ];
  },
});
