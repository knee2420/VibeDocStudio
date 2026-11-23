import { isBlockLocked } from "../../block-ops";
import type { ColumnsGridBlockDef, GridColumnDef, LayoutBlock } from "../../types";
import type { BlockUnit, SceneGraphNode } from "../contract";
import { defineBlockKind } from "../contract";
import { getBlockKind } from "../registry";
import { makeSlot, outlineSlotGroup } from "./shared";

const nestedGridBlockSlotIds = (blocks: readonly LayoutBlock[] | undefined): string[] =>
  blocks && blocks.length > 0 ? blocks.flatMap((nb) => getBlockKind(nb.kind).slotIds(nb)) : [];

const gridSlotIds = (b: ColumnsGridBlockDef) =>
  b.columns
    ? b.columns.flatMap((c) => [
        ...(c.slotId ? [c.slotId] : []),
        ...nestedGridBlockSlotIds(c.blocks),
      ])
    : (b.slotIds ?? []);

function formatGridRatioBadge(widths: readonly string[]): string | undefined {
  if (!widths || widths.length < 2) return undefined;
  const frs = widths.map((w) => (/^(\d+(?:\.\d+)?)fr$/i.exec(w.trim())?.[1] ?? null));
  if (frs.every(Boolean)) {
    return frs.join(":");
  }
  return `${widths.length}단`;
}

/** 다단 그리드 — 칸마다 슬롯 또는 이미지 또는 재귀 중첩 블록. */
export const gridBlock = defineBlockKind<ColumnsGridBlockDef>({
  kinds: ["columns-grid"],
  label: "다단 그리드",
  category: "layout",
  icon: "columns-2",
  outlineTag: (b) => {
    const cols = b.columns ?? [];
    if (cols.length > 0 && cols.every((c) => Boolean(c.blocks?.length))) {
      return "<<view:columns>>";
    }
    if (cols.length > 0 && cols.every((c) => Boolean(c.image))) {
      return "[img] | [img]";
    }
    return "|";
  },
  slotIds: gridSlotIds,
  sceneNode: (b, ctx) => {
    const colTag = ctx.resolveTag("section", "col-container", "<<col>>");
    const imgTag = ctx.resolveTag("section", "image-slot", "[img]");
    const cols: GridColumnDef[] =
      b.columns ?? (b.slotIds ?? []).map((slotId): GridColumnDef => ({ slotId }));
    const locked = isBlockLocked(b, ctx.slots);
    const hidden = ctx.hiddenBlockIds.has(b.blockId);

    const colNodes: SceneGraphNode[] = cols.map((col, cIdx) => {
      if (col.blocks && col.blocks.length > 0) {
        const nested = col.blocks.map((nb) => ctx.compileBlock(nb));
        return {
          id: `${b.blockId}_col_${cIdx + 1}`,
          role: "column",
          outlineTag: colTag,
          label: `${cIdx + 1}열`,
          icon: "square",
          badge: b.widths[cIdx],
          selectBlockId: b.blockId,
          children: nested,
        };
      }
      if (col.image) {
        return {
          id: `${b.blockId}:col${cIdx}`,
          role: "media",
          outlineTag: imgTag,
          label: col.image.alt || `${cIdx + 1}열 이미지`,
          icon: "image",
          badge: b.widths[cIdx],
          selectBlockId: b.blockId,
        };
      }
      const sid = col.slotId;
      const plain = ctx.plainText(sid);
      const slot = sid ? ctx.slots[sid] : undefined;
      return {
        id: sid || `${b.blockId}_col_${cIdx + 1}`,
        role: "slot",
        label: plain ? plain.slice(0, 36) : slot?.label || `${cIdx + 1}열`,
        icon: "type",
        badge: b.widths[cIdx],
        selectBlockId: b.blockId,
        selectSlotId: sid,
        locked: Boolean(slot?.constraints?.locked),
        active: Boolean(sid && sid === ctx.selectedSlotId),
      };
    });

    const isNestedContainer = cols.length > 0 && cols.every((c) => Boolean(c.blocks?.length));
    const isPhotoStrip = cols.length > 0 && cols.every((c) => Boolean(c.image));

    return {
      id: b.blockId,
      role: "block",
      outlineTag: isNestedContainer
        ? ctx.resolveTag("section", "columns-container", "<<view:columns>>")
        : isPhotoStrip
          ? `${imgTag} | ${imgTag}`
          : ctx.resolveTag("section", "horizontal-split", "|"),
      label: b.title || (isPhotoStrip ? `사진 스트립 (${cols.length}장)` : `다단 (${cols.length}단)`),
      icon: "columns-2",
      badge: b.frame ? "2D" : formatGridRatioBadge(b.widths),
      selectBlockId: b.blockId,
      sourceNodeId: b.sourceNodeId,
      isBlock: true,
      locked,
      hidden,
      active: b.blockId === ctx.selectedBlockId,
      children: colNodes,
    };
  },
  units: (b) => {
    if (!b.columns) return (b.slotIds ?? []).map((slotId) => ({ unitId: slotId, kind: "slot" as const, slotId }));
    return b.columns.flatMap((col, i): BlockUnit[] =>
      col.image
        ? [{ unitId: `${b.blockId}:col${i}`, kind: "media", label: col.image.alt || `${i + 1}열 이미지` }]
        : col.slotId
          ? [{ unitId: col.slotId, kind: "slot", slotId: col.slotId }]
          : []
    );
  },
  outline: (b, ctx) => {
    const photos = (b.columns ?? []).filter((c) => c.image).length;
    // 사진만 든 그리드(사진 묶음)도 아웃라이너에 한 줄로 나온다 — 슬롯이 없어도 선택 단위가 있다
    if (photos && gridSlotIds(b).length === 0) {
      ctx.emitStatic(ctx.blockTitle || "사진 묶음", `사진 ${photos}장`);
      return;
    }
    outlineSlotGroup(gridSlotIds(b), ctx, "다단 그리드", (n) => `다단 그리드 · ${n}칸`);
  },
  insertable: {
    label: "2단 그리드",
    description: "좌우 분할 2단 슬롯",
    order: 4,
    shortcut: 4,
    defaultFrameHeight: 96,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const left = makeSlot(slots, `slot_col1_${suffix}`, "좌측 컬럼 슬롯", "<p></p>", defaultBackdataRefs);
      const right = makeSlot(slots, `slot_col2_${suffix}`, "우측 컬럼 슬롯", "<p></p>", defaultBackdataRefs);
      return {
        block: { blockId: `blk_cols_${suffix}`, kind: "columns-grid", title: "2단 그리드", widths: ["1fr", "1fr"], cardStyle: "plain", slotIds: [left, right] },
        slots,
        focusSlotId: left,
      };
    },
  },
  ai: {
    describe: (b) => [
      `칸 너비: ${b.widths.join(" / ")}`,
      ...(b.columns ?? []).flatMap((c, i) => (c.image ? [`${i + 1}열 이미지: ${c.image.alt || c.image.src.slice(0, 80)}`] : [])),
    ],
  },
});
