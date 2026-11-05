import type { CoverBannerBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { outlineSlotGroup } from "./shared";

/** 표지 배너 (제목 · 작성자 · 수신자). */
export const coverBlock = defineBlockKind<CoverBannerBlockDef>({
  kinds: ["cover-banner"],
  label: "표지",
  category: "layout",
  icon: "panel-top",
  slotIds: (b) => [b.headlineSlotId, b.preparedBySlotId, b.preparedForSlotId].filter(Boolean),
  outline: (b, ctx) =>
    outlineSlotGroup([b.headlineSlotId, b.preparedBySlotId, b.preparedForSlotId].filter(Boolean), ctx, "표지", () => "표지 배너"),
  ai: {
    describe: (b) => [`배경 테마: ${b.backgroundTheme}`],
    editableProps: {
      backgroundTheme: { type: "string", description: "배경 테마", enum: ["dark-architecture", "emerald-gradient", "slate-minimal"] },
    },
  },
});
