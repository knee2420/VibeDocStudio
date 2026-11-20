import { Palette, Quote } from "lucide-react";
import { resolveFrameStyle, resolveTextRoleStyle } from "@vibe/style-core";
import type { CalloutBoxBlockDef, CalloutBoxVariant } from "@vibe/vdoc-schema";

import { useVDocStyle } from "../../styleContext";
import { defineBlockView } from "../contract";

const TONES: Record<string, string> = {
  neutral: "border-slate-200 bg-slate-50/80",
  info: "border-sky-200 bg-sky-50/70",
  warning: "border-amber-200 bg-amber-50/70",
};
const TONE_ORDER = ["neutral", "info", "warning"] as const;
const TONE_LABEL: Record<string, string> = { neutral: "기본", info: "정보", warning: "주의" };

const VARIANT_ORDER: readonly CalloutBoxVariant[] = [
  "default",
  "quote",
  "info-frame",
  "accent-bar",
  "disclosure",
];
const VARIANT_LABEL: Record<CalloutBoxVariant, string> = {
  default: "기본 상자",
  quote: "중앙 인용구",
  "info-frame": "스팟 정보 프레임",
  "accent-bar": "강조 바",
  disclosure: "고지 배지",
};

export const calloutView = defineBlockView<CalloutBoxBlockDef>({
  kinds: ["callout-box"],
  View: ({ block, ctx }) => {
    const docStyle = useVDocStyle();
    const variant: CalloutBoxVariant = block.variant ?? "default";
    const frame = docStyle
      ? resolveFrameStyle(docStyle.resolvedPack, variant, undefined, block.styleOverrides)
      : null;

    if (variant === "quote") {
      const quoteText = docStyle
        ? resolveTextRoleStyle(
            docStyle.resolvedPack,
            "quote",
            "callout-box[variant=quote]",
            undefined,
            block.styleOverrides
          )
        : null;
      const ornament = frame?.ornament ?? "quote-top-bottom";
      const align = block.align ?? frame?.align ?? "center";

      if (ornament === "left-bar") {
        return (
          <div
            style={{
              backgroundColor: frame?.fill ?? "#f9fafb",
              borderLeft: frame?.borderLeft ?? "4px solid #2563eb",
              borderRadius: frame?.radius ?? "0px",
              padding: frame?.padding ?? "12px 18px",
              marginTop: frame?.marginY ?? "18px",
              marginBottom: frame?.marginY ?? "18px",
              textAlign: align,
              color: quoteText?.color ?? frame?.color ?? "#111827",
              fontSize: quoteText?.fontSize ?? "16px",
              fontWeight: quoteText?.fontWeight ?? "600",
              fontStyle: quoteText?.fontStyle ?? "normal",
              lineHeight: quoteText?.lineHeight ?? "1.6",
            }}
          >
            {ctx.renderSlot(block.slotId)}
          </div>
        );
      }

      if (ornament === "none") {
        return (
          <div
            style={{
              backgroundColor: frame?.fill ?? "#ffffff",
              border: frame?.border ?? "1px solid #000000",
              borderRadius: frame?.radius ?? "0px",
              padding: frame?.padding ?? "10px 16px",
              marginTop: frame?.marginY ?? "12px",
              marginBottom: frame?.marginY ?? "12px",
              textAlign: align,
              color: quoteText?.color ?? frame?.color ?? "#111111",
            }}
          >
            {ctx.renderSlot(block.slotId)}
          </div>
        );
      }

      return (
        <div
          className="flex flex-col items-center justify-center text-center"
          style={{
            padding: frame?.padding ?? "12px 24px",
            marginTop: frame?.marginY ?? "20px",
            marginBottom: frame?.marginY ?? "20px",
          }}
        >
          <span
            aria-hidden="true"
            className="select-none font-serif text-[28px] leading-none"
            style={{ color: frame?.ornamentColor ?? "#cbd5e1" }}
          >
            “
          </span>
          <div
            className="my-2 w-full"
            style={{
              fontSize: quoteText?.fontSize ?? "15px",
              fontWeight: quoteText?.fontWeight ?? "500",
              fontStyle: quoteText?.fontStyle ?? "italic",
              lineHeight: quoteText?.lineHeight ?? "1.7",
              color: quoteText?.color ?? frame?.color ?? "#475569",
              textAlign: align,
            }}
          >
            {ctx.renderSlot(block.slotId)}
          </div>
          <span
            aria-hidden="true"
            className="select-none font-serif text-[28px] leading-none"
            style={{ color: frame?.ornamentColor ?? "#cbd5e1" }}
          >
            ”
          </span>
        </div>
      );
    }

    if (variant === "info-frame") {
      const kvItems = block.kvItems ?? [];
      const titleText = docStyle
        ? resolveTextRoleStyle(
            docStyle.resolvedPack,
            "spotTitle",
            "callout-box[variant=info-frame]",
            undefined,
            block.styleOverrides
          )
        : null;
      const ornament = frame?.ornament ?? "quote-left-underline";
      const kvMarker = frame?.kvMarker ?? "▫️";

      return (
        <div
          className="w-full text-left"
          style={{
            backgroundColor: frame?.fill ?? "transparent",
            border: frame?.border,
            borderTop: frame?.borderTop,
            borderBottom: frame?.borderBottom ?? "1px solid #cbd5e1",
            borderLeft: frame?.borderLeft,
            borderRadius: frame?.radius ?? "0px",
            padding: frame?.padding ?? "8px 0 16px 0",
            marginTop: frame?.marginY ?? "16px",
            marginBottom: frame?.marginY ?? "16px",
          }}
        >
          {ornament === "quote-left-underline" && (
            <div
              aria-hidden="true"
              className="mb-1 select-none font-serif text-[24px] leading-none"
              style={{ color: frame?.ornamentColor ?? "#94a3b8" }}
            >
              “
            </div>
          )}
          <div
            style={{
              fontSize: titleText?.fontSize ?? "15.5px",
              fontWeight: titleText?.fontWeight ?? "600",
              lineHeight: titleText?.lineHeight ?? "1.6",
              letterSpacing: titleText?.letterSpacing,
              color: frame?.titleColor ?? titleText?.color ?? "#047857",
            }}
          >
            {ctx.renderSlot(block.slotId)}
          </div>
          {kvItems.length > 0 && (
            <dl
              className="mt-2.5 space-y-1 text-[13px] leading-[1.65]"
              style={{ color: frame?.kvTextColor ?? "#475569" }}
            >
              {kvItems.map((item, idx) => (
                <div key={`${item.key}-${idx}`} className="flex items-start gap-1.5">
                  <dt className="shrink-0 font-medium text-slate-700">
                    {kvMarker !== "none" && <span className="mr-1 opacity-70">{kvMarker}</span>}
                    {item.key} :
                  </dt>
                  <dd className="min-w-0 flex-1">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      );
    }

    if (variant === "accent-bar") {
      const colorKey = block.accentColor ?? "pink";
      const palette = frame?.accentPalettes[colorKey];
      const align = block.align ?? frame?.align ?? "center";
      const justifyClass =
        align === "right" ? "justify-end" : align === "left" ? "justify-start" : "justify-center";

      return (
        <div
          className={`flex w-full ${justifyClass}`}
          style={{
            marginTop: frame?.marginY ?? "12px",
            marginBottom: frame?.marginY ?? "12px",
          }}
        >
          <div
            className="inline-block max-w-full text-[13.5px] leading-[1.6]"
            style={{
              backgroundColor: palette?.fill ?? frame?.fill ?? "#fde2e4",
              color: palette?.color ?? frame?.color ?? "#1e293b",
              border: palette?.border ?? frame?.border,
              borderLeft: frame?.borderLeft,
              borderRadius: frame?.radius ?? "2px",
              padding: frame?.padding ?? "4px 12px",
              textAlign: align,
            }}
          >
            {ctx.renderSlot(block.slotId)}
          </div>
        </div>
      );
    }

    if (variant === "disclosure") {
      const align = block.align ?? frame?.align ?? "left";
      const justifyClass =
        align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

      return (
        <div
          className={`flex w-full ${justifyClass}`}
          style={{
            marginTop: frame?.marginY ?? "8px",
            marginBottom: frame?.marginY ?? "8px",
          }}
        >
          <div
            className="text-[11px] leading-[1.5]"
            style={{
              maxWidth: frame?.maxWidth ?? "260px",
              backgroundColor: frame?.fill ?? "#f8fafc",
              color: frame?.color ?? "#64748b",
              border: frame?.border ?? "1px solid #e2e8f0",
              borderRadius: frame?.radius ?? "4px",
              padding: frame?.padding ?? "8px 12px",
              textAlign: align === "left" ? "center" : align,
            }}
          >
            {ctx.renderSlot(block.slotId)}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`my-2 rounded-md border p-3.5 ${TONES[block.tone ?? "neutral"] ?? TONES.neutral}`}
        style={
          frame && !block.tone
            ? {
                backgroundColor: frame.fill,
                border: frame.border,
                borderLeft: frame.borderLeft,
                borderRadius: frame.radius,
                padding: frame.padding,
                color: frame.color,
              }
            : undefined
        }
      >
        {ctx.renderSlot(block.slotId)}
      </div>
    );
  },
  controls: (block, api) => {
    const tone = block.tone ?? "neutral";
    const nextTone = TONE_ORDER[(TONE_ORDER.indexOf(tone) + 1) % TONE_ORDER.length];
    const variant: CalloutBoxVariant = block.variant ?? "default";
    const nextVariant = VARIANT_ORDER[(VARIANT_ORDER.indexOf(variant) + 1) % VARIANT_ORDER.length];
    return [
      {
        id: "variant",
        label: `표현: ${VARIANT_LABEL[variant]}`,
        icon: Quote,
        showLabel: true,
        run: () => api.updateBlock((prev) => ({ ...prev, variant: nextVariant }) as CalloutBoxBlockDef),
      },
      {
        id: "tone",
        label: `상자 색: ${TONE_LABEL[tone]}`,
        icon: Palette,
        showLabel: true,
        run: () => api.updateBlock((prev) => ({ ...prev, tone: nextTone }) as CalloutBoxBlockDef),
      },
    ];
  },
});
