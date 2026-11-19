import type { WebFormBlockDef } from "../../types";
import { defineBlockKind } from "../contract";
import { makeSlot, outlineSingleSlot } from "./shared";

/** 웹 설문 섹션 블록 — 질문/입력/선택지 인터랙티브 폼 + UI 변형 지원. */
export const webFormBlock = defineBlockKind<WebFormBlockDef>({
  kinds: ["web-form"],
  label: "웹 설문 폼",
  category: "form",
  icon: "list-checks",
  slotIds: (b) => (b.headerSlotId ? [b.headerSlotId] : []),
  outline: (b, ctx) => {
    if (b.headerSlotId) outlineSingleSlot(b.headerSlotId, ctx);
  },
  insertable: {
    label: "웹 설문 폼",
    description: "선택지·입력 필드를 포함한 웹 설문 섹션",
    order: 8,
    shortcut: 8,
    defaultFrameHeight: 180,
    create: ({ suffix, defaultBackdataRefs = [] }) => {
      const slots = {};
      const headerSlotId = makeSlot(
        slots,
        `slot_webform_hdr_${suffix}`,
        "섹션 제목",
        "<p><strong>설문 항목</strong></p>",
        defaultBackdataRefs
      );
      return {
        block: {
          blockId: `blk_webform_${suffix}`,
          kind: "web-form",
          title: "웹 설문 폼",
          variant: "webform-card-google",
          headerSlotId,
          fields: [
            {
              fieldId: `wf_q1_${suffix}`,
              label: "참여 여부",
              inputKind: "single-choice",
              options: ["참석", "불참"],
            },
          ],
        },
        slots,
        focusSlotId: headerSlotId,
      };
    },
  },
  ai: {
    describe: (b) => [`UI 스타일: ${b.variant}`, `문항 수: ${b.fields.length}개`],
    editableProps: {
      variant: {
        type: "string",
        description: "웹 설문 UI 스타일",
        enum: [
          "webform-card-google",
          "webform-minimal-tally",
          "webform-pill-chips",
          "webform-step-accent",
        ],
      },
    },
  },
});
