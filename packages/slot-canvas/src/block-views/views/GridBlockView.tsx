import React, { useEffect, useState } from "react";
import { Columns2, Columns3, ImageIcon, ImageOff } from "lucide-react";
import { resolveMediaGridStyle } from "@vibe/style-core";
import type { ColumnsGridBlockDef, GridColumnDef } from "@vibe/vdoc-schema";

import { resolveMediaSrc } from "../../mediaSrc";
import { useVDocStyle } from "../../styleContext";
import { MEDIA_DRAG_MIME } from "../../tokens";
import { defineBlockView } from "../contract";

/** 칸 목록 (예전 `slotIds` 만 있는 그리드도 칸으로 본다). */
const columnsOf = (block: ColumnsGridBlockDef): GridColumnDef[] =>
  block.columns ?? (block.slotIds ?? []).map((slotId) => ({ slotId }) as GridColumnDef);

/** 사진 칸 — 묶음 사진은 같은 높이로 잘라 맞춘다. */
const photoColumn = (src: string, alt: string, height = "280px"): GridColumnDef =>
  ({ image: { src, alt, width: "100%", height, maxHeight: height, align: "center", objectFit: "cover" } }) as GridColumnDef;

const readMedia = (e: React.DragEvent): { src: string; alt: string } | null => {
  const raw = e.dataTransfer.getData(MEDIA_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { src?: string; alt?: string };
    return parsed.src ? { src: parsed.src, alt: parsed.alt ?? "" } : null;
  } catch {
    return null;
  }
};

const GridPhotoCell: React.FC<{
  image: NonNullable<GridColumnDef["image"]>;
  isPlainStrip: boolean;
  defaultHeight?: string;
  defaultMaxHeight?: string;
  radius?: string;
}> = ({ image, isPlainStrip, defaultHeight, defaultMaxHeight, radius }) => {
  const resolved = resolveMediaSrc(image.src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return (
      <div
        className="w-full border border-dashed border-slate-300 bg-slate-50/90 px-3 py-6 flex flex-col items-center justify-center gap-1 text-slate-400 select-none"
        style={{ minHeight: image.height || defaultHeight || "180px", borderRadius: radius ?? "4px" }}
      >
        <ImageIcon className="w-5 h-5 text-slate-300" />
        <span className="text-[11px] font-medium text-slate-500 text-center">
          [img] {image.alt || "이미지 슬롯"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={image.alt || "Image"}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className="block select-none"
      style={{
        width: image.width || (isPlainStrip ? "100%" : "auto"),
        height: image.height || (isPlainStrip ? defaultHeight : "auto") || "auto",
        maxHeight: image.maxHeight || (isPlainStrip ? defaultMaxHeight || "360px" : "90px"),
        objectFit: image.objectFit || (isPlainStrip ? "cover" : "contain"),
        borderRadius: radius ?? "0px",
      }}
    />
  );
};

export const gridView = defineBlockView<ColumnsGridBlockDef>({
  kinds: ["columns-grid"],
  View: ({ block, ctx }) => {
    const docStyle = useVDocStyle();
    const mediaGrid = docStyle
      ? resolveMediaGridStyle(docStyle.resolvedPack, "strip", undefined, block.styleOverrides)
      : null;

    const isPlainStrip = block.cardStyle === "plain";
    const cardClass = isPlainStrip
      ? "min-w-0 bg-transparent p-0"
      : "min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5";
    const columns = columnsOf(block);
    const widths =
      Array.isArray(block.widths) && block.widths.length > 0
        ? block.widths
        : columns.map(() => "1fr");
    const effectiveGap = isPlainStrip
      ? (mediaGrid?.stripGap ?? block.gap ?? 4)
      : block.gap;

    const dropOn = (cIdx: number) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(MEDIA_DRAG_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
      },
      onDrop: (e: React.DragEvent) => {
        const media = readMedia(e);
        if (!media) return;
        e.preventDefault();
        e.stopPropagation();
        ctx.updateBlock((prev) => {
          const grid = prev as ColumnsGridBlockDef;
          const next = columnsOf(grid).map((col, i) => (i === cIdx ? photoColumn(media.src, media.alt) : col));
          return { ...grid, columns: next, slotIds: undefined, cardStyle: "plain", gap: grid.gap ?? 4 } as ColumnsGridBlockDef;
        });
      },
    });
    return (
      <div
        className={`grid ${effectiveGap !== undefined ? "" : isPlainStrip ? "gap-6" : "gap-4"} items-start w-full`}
        style={{ gap: effectiveGap, gridTemplateColumns: widths.map((w) => (w.endsWith("fr") ? `minmax(0, ${w})` : w)).join(" ") }}
      >
        {columns.map((col, cIdx) => (
          <div
            key={cIdx}
            data-col-id={`${block.blockId}_col_${cIdx + 1}`}
            className={cardClass}
            {...dropOn(cIdx)}
          >
            {col.blocks && col.blocks.length > 0 ? (
              ctx.renderNestedBlocks(col.blocks)
            ) : col.image ? (
              <div
                {...ctx.unitAttrs(`${block.blockId}:col${cIdx}`, "media")}
                className={`flex ${isPlainStrip && effectiveGap !== undefined ? "py-0" : "py-1"} ${
                  col.image.align === "right" ? "justify-end" : col.image.align === "center" ? "justify-center" : "justify-start"
                }`}
              >
                <GridPhotoCell
                  image={col.image}
                  isPlainStrip={isPlainStrip}
                  defaultHeight={mediaGrid?.stripRowHeight}
                  defaultMaxHeight={mediaGrid?.maxHeight}
                  radius={mediaGrid?.radius}
                />
              </div>
            ) : col.slotId ? (
              ctx.renderSlot(col.slotId)
            ) : null}
          </div>
        ))}
      </div>
    );
  },
  controls: (block, api) => {
    const columns = columnsOf(block);
    const photos = columns.filter((c) => c.image);
    const setColumns = (next: GridColumnDef[]) =>
      api.updateBlock((prev) => ({ ...(prev as ColumnsGridBlockDef), columns: next, slotIds: undefined, widths: next.map(() => "1fr") }) as ColumnsGridBlockDef);
    return [
      ...(photos.length === columns.length && columns.length > 0
        ? [
            {
              id: "photo-2",
              label: "사진 2장",
              icon: Columns2,
              group: "layout",
              active: columns.length === 2,
              run: () => setColumns(columns.slice(0, 2).concat(columns.length < 2 ? [columns[0]] : [])),
            },
            {
              id: "photo-3",
              label: "사진 3장",
              icon: Columns3,
              group: "layout",
              active: columns.length === 3,
              run: () => setColumns(columns.length >= 3 ? columns.slice(0, 3) : [...columns, ...Array(3 - columns.length).fill(columns[columns.length - 1])]),
            },
            {
              id: "unphoto",
              label: "사진 빼기 (빈 칸)",
              icon: ImageOff,
              group: "layout",
              run: () => setColumns(columns.slice(0, Math.max(1, columns.length - 1))),
            },
          ]
        : []),
    ];
  },
});
