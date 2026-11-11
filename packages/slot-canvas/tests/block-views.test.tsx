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
import { AlignmentGuides } from "../src/AlignmentGuides";
import { InsertCursorButton } from "../src/InsertCursorButton";
import { InsertMenu } from "../src/InsertMenu";
import { WindowedPageChunker } from "../src/WindowedPageChunker";
import { ImageBlockView } from "../src/blocks/ImageBlockView";

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

  it("블록 전용 조작(controls)은 id 가 겹치지 않고 이름 · 아이콘이 있으며, 실행해도 오류가 나지 않는다", async () => {
    for (const doc of seedDocuments()) {
      for (const page of doc.pages) {
        for (const block of page.blocks as LayoutBlock[]) {
          let updated = 0;
          const controls =
            getBlockView(block.kind).controls?.(block, {
              updateBlock: () => void updated++,
              pickFile: async () => null,
              prompt: () => null,
            }) ?? [];
          assert.equal(new Set(controls.map((c) => c.id)).size, controls.length, `${block.blockId}: 조작 id 중복`);
          for (const control of controls) {
            assert.ok(control.label && control.icon, `${block.kind}.${control.id}: 이름 · 아이콘`);
            await control.run();
          }
        }
      }
    }
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

  it("정렬 가이드 · 삽입 메뉴(1~6) · 빈 이미지 플레이스홀더를 오류 없이 그린다", () => {
    const guidesHtml = renderToStaticMarkup(
      React.createElement(AlignmentGuides, {
        guides: [
          { axis: "vertical", pos: 100, start: 0, end: 500 },
          { axis: "horizontal", pos: 240, start: 50, end: 700 },
        ],
      })
    );
    assert.ok(guidesHtml.includes('data-guide-axis="vertical"'));
    assert.ok(guidesHtml.includes('data-guide-axis="horizontal"'));

    const menuHtml = renderToStaticMarkup(
      React.createElement(InsertMenu, { y: 120, onSelect: () => undefined, onClose: () => undefined })
    );
    for (const label of ["텍스트", "이미지", "표", "2단 그리드", "텍스트 섹션", "할당형 입력 필드"]) {
      assert.ok(menuHtml.includes(label), `삽입 메뉴 항목 누락: ${label}`);
    }

    const cursorBtnHtml = renderToStaticMarkup(
      React.createElement(InsertCursorButton, { y: 120, menuOpen: false, onToggleMenu: () => undefined })
    );
    assert.ok(cursorBtnHtml.includes("data-insert-gutter"));
    assert.ok(cursorBtnHtml.includes("data-insert-cursor-btn"));

    const emptyImgHtml = renderToStaticMarkup(
      React.createElement(ImageBlockView, {
        block: { blockId: "img_1", kind: "image", title: "이미지", src: "" },
      })
    );
    assert.ok(emptyImgHtml.includes("이미지를 추가하세요"));
  });

  it("WindowedPageChunker 는 가변 pageRect 높이를 합산해 가상 스크롤 스페이서를 계산한다", () => {
    const pages = [1, 2, 3, 4].map((num) => ({
      pageId: `wp_${num}`,
      pageNumber: num,
      pageLabel: `P${num}`,
      headerSlotId: `h_${num}`,
      footerSlotId: `f_${num}`,
      pageRect: { width: 794, height: num === 4 ? 2000 : 1500, unit: "px" as const },
      blocks: [],
    }));
    const html = renderToStaticMarkup(
      React.createElement(WindowedPageChunker, {
        pages,
        chunkSize: 2,
        renderPage: (p) => React.createElement("div", { key: p.pageId }, p.pageId),
      })
    );
    // 1~2p 활성(chunkSize=2), 남은 3p(1500+24=1524) + 4p(2000+24=2024) = 3548px
    assert.ok(html.includes('data-testid="chunker-bottom-spacer"'));
    assert.ok(html.includes("height:3548px"));
  });
});
