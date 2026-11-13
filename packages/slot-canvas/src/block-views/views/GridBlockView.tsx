import { Columns2, Columns3, ImageOff } from "lucide-react";

import type { ColumnsGridBlockDef, GridColumnDef } from "@vibe/vdoc-schema";

import { resolveMediaSrc } from "../../mediaSrc";
import { MEDIA_DRAG_MIME } from "../../tokens";
import { defineBlockView } from "../contract";

/** 칸 목록 (예전 `slotIds` 만 있는 그리드도 칸으로 본다). */
const columnsOf = (block: ColumnsGridBlockDef): GridColumnDef[] =>
  block.columns ?? (block.slotIds ?? []).map((slotId) => ({ slotId }) as GridColumnDef);

/** 사진 칸 — 묶음 사진은 같은 높이로 잘라 맞춘다. */
const photoColumn = (src: string, alt: string, height = "240px"): GridColumnDef =>
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

export const gridView = defineBlockView<ColumnsGridBlockDef>({
  kinds: ["columns-grid"],
  View: ({ block, ctx }) => {
    const cardClass =
      block.cardStyle === "plain" ? "min-w-0 bg-transparent p-0" : "min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5";
    const columns = columnsOf(block);
    // 리소스 사진을 칸에 놓으면 그 칸이 사진이 된다 (사람이 사진 묶음을 만드는 길 — 에이전트 gallery 와 같은 모양)
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
        className={`grid ${block.gap !== undefined ? "" : block.cardStyle === "plain" ? "gap-6" : "gap-4"} items-start w-full`}
        style={{ gap: block.gap, gridTemplateColumns: block.widths.map((w) => (w.endsWith("fr") ? `minmax(0, ${w})` : w)).join(" ") }}
      >
        {columns.map((col, cIdx) => (
          <div key={cIdx} className={cardClass} {...dropOn(cIdx)}>
            {col.image ? (
              <div
                {...ctx.unitAttrs(`${block.blockId}:col${cIdx}`, "media")}
                className={`flex py-1 ${col.image.align === "right" ? "justify-end" : col.image.align === "center" ? "justify-center" : "justify-start"}`}
              >
                {resolveMediaSrc(col.image.src) ? (
                  <img
                    src={resolveMediaSrc(col.image.src)}
                    alt={col.image.alt || "Image"}
                    draggable={false}
                    style={{
                      width: col.image.width || "auto",
                      height: col.image.height || "auto",
                      maxHeight: col.image.maxHeight || "90px",
                      objectFit: col.image.objectFit || "contain",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: col.image.width || "100%",
                      height: col.image.height || col.image.maxHeight || "90px",
                      backgroundImage:
                        "repeating-conic-gradient(#e5e7eb 0% 25%, #f8fafc 0% 50%)",
                      backgroundSize: "12px 12px",
                    }}
                    className="w-full rounded border border-dashed border-slate-300 flex items-center justify-center text-[11px] text-slate-400 select-none"
                  >
                    이미지
                  </div>
                )}
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
      // 사진 묶음일 때만: 2장 ↔ 3장 (마지막 사진을 하나 더 / 빼기 — 새 칸에는 리소스 사진을 끌어 놓는다)
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
