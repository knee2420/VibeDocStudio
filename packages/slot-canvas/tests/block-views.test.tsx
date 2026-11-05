/**
 * 블록 뷰 규격 검사 — 모든 블록 종류에 뷰가 있고, 블록 정의가 말하는 선택 단위를 화면이 빠짐없이 표시하는지
 * (`data-vdoc-unit`) 확인한다. 이 표시가 있어야 사각형 선택 · AI 첨부 · 위치 칩이 그 요소를 찾는다.
 *
 *   pnpm --filter @vibe/slot-canvas test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getBlockUnits, LAYOUT_BLOCK_KINDS, listBlockKinds, type LayoutBlock } from "@vibe/vdoc-schema";

import { seedDocuments } from "../../vdoc-schema/tests/fixtures";
import { getBlockView, hasBlockView, type BlockRenderContext } from "../src/block-views";

/** 페이지 시트 대신 쓰는 최소 연결: 슬롯은 표시만 붙인 빈 상자로 그린다. */
function stubContext(page: BlockRenderContext["page"], slots: BlockRenderContext["slots"]): BlockRenderContext {
  const slotBox = (slotId: string) =>
    slots[slotId] ? React.createElement("div", { key: slotId, "data-vdoc-unit": slotId, "data-unit-kind": "slot" }) : null;
  return {
    page,
    slots,
    editable: false,
    selectedBlockId: null,
    selectedSlotId: null,
    renderSlot: (slotId) => slotBox(slotId),
    renderSummary: (summary) =>
      React.createElement(
        "div",
        null,
        summary.items.flatMap((i) => [i.slotId, i.labelSlotId, i.valueSlotId].filter((s): s is string => Boolean(s)).map(slotBox))
      ),
    tableBindings: () => ({
      editable: false,
      selectedSlotId: null,
      onSelectSlot: () => undefined,
      onCommand: () => undefined,
      onDeleteTable: () => undefined,
      onSelectionChange: () => undefined,
      renderCell: (cell) => slotBox(cell.slotId),
    }),
    updateBlock: () => undefined,
    unitAttrs: (unitId, kind) => ({ "data-vdoc-unit": unitId, "data-unit-kind": kind }),
  };
}

describe("블록 뷰", () => {
  it("모든 블록 종류에 뷰가 등록돼 있다", () => {
    for (const kind of LAYOUT_BLOCK_KINDS) assert.ok(hasBlockView(kind), `뷰 없음: ${kind}`);
    for (const def of listBlockKinds()) for (const kind of def.kinds) assert.ok(hasBlockView(kind), `뷰 없음: ${kind}`);
  });

  it("시드 문서의 모든 블록이 자기 선택 단위를 전부 화면에 표시한다", () => {
    for (const doc of seedDocuments()) {
      for (const page of doc.pages) {
        for (const block of page.blocks as LayoutBlock[]) {
          const { View } = getBlockView(block.kind);
          const html = renderToStaticMarkup(React.createElement(View, { block, ctx: stubContext(page, doc.slots) }));
          for (const unit of getBlockUnits(block)) {
            if (unit.kind === "slot" && !doc.slots[unit.slotId ?? unit.unitId]) continue;
            assert.ok(
              html.includes(`data-vdoc-unit="${unit.unitId}"`),
              `${doc.docId}/${block.blockId} (${block.kind}): 단위 ${unit.unitId} (${unit.kind}) 표시 없음`
            );
          }
        }
      }
    }
  });
});
