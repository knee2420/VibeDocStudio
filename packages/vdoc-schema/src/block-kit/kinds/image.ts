import type { ImageBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { ALIGN_PROP } from "./shared";

/** 이미지 — 슬롯이 없는 블록. 블록 전체가 media 선택 단위 하나. */
export const imageBlock = defineBlockKind<ImageBlockDef>({
  kinds: ["image"],
  label: "이미지",
  category: "media",
  icon: "image",
  slotIds: () => [],
  units: (b) => [{ unitId: b.blockId, kind: "media", label: b.alt || b.title || "이미지" }],
  outline: (b, ctx) => {
    ctx.emitStatic(ctx.blockTitle || "이미지", "이미지");
  },
  layout: { resizable: true },
  insertable: {
    label: "이미지",
    description: "이미지 · 로고 추가",
    order: 2,
    shortcut: 2,
    defaultFrameHeight: 180,
    create: ({ suffix }) => ({
      block: {
        blockId: `blk_img_${suffix}`,
        kind: "image",
        title: "이미지",
        src: "",
        alt: "이미지",
        align: "center",
        width: "320px",
      },
      slots: {},
    }),
  },
  ai: {
    describe: (b) => [
      `이미지 주소: ${b.src.startsWith("data:") ? "(내장 이미지)" : b.src.slice(0, 200)}`,
      `대체 텍스트: ${b.alt || "(없음)"}`,
      ...(b.caption ? [`캡션: ${b.caption}`] : []),
      `정렬: ${b.align ?? "center"} · 너비: ${b.width ?? "auto"} · 최대 높이: ${b.maxHeight ?? "-"}`,
    ],
    editableProps: {
      alt: { type: "string", description: "대체 텍스트 (이미지 설명)" },
      align: ALIGN_PROP,
      width: { type: "string", description: "너비 (예: 240px, 50%)" },
      maxHeight: { type: "string", description: "최대 높이 (예: 120px)" },
      caption: { type: "string", description: "사진 아래 작은 설명" },
    },
  },
});
