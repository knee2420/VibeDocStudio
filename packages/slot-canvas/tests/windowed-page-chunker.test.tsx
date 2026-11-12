/**
 * WindowedPageChunker 단위 테스트:
 * - 16~18페이지 등 maxStart 가 작은 문서에서 하단 페이지가 스페이서에 갇히지 않는지
 * - 초기 activePageId 가 창 밖(예: 17p)일 때 첫 렌더부터 해당 페이지를 마운트하는지
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { A4_PAGE_GAP_PX, createSectionPage, type VDocPage } from "@vibe/vdoc-schema";

import {
  clampWindowStart,
  computeNextWindowStartOnScroll,
  computeWindowStartForPage,
  WindowedPageChunker,
} from "../src/WindowedPageChunker";

function makePages(count: number): VDocPage[] {
  return Array.from({ length: count }, (_, i) =>
    createSectionPage({
      pageId: `page_${i + 1}`,
      pageNumber: i + 1,
      pageLabel: `Page ${i + 1}`,
    }).page
  );
}

describe("WindowedPageChunker", () => {
  it("17페이지 문서에서 prevStart=1 일 때 하단 스크롤(15~17p)이 데드락 없이 windowStart=3 으로 이동한다", () => {
    assert.equal(clampWindowStart(16, 17, 15), 3);

    // 페이지 15 하단에서 페이지 16이 뷰포트에 들어오는 순간 즉시 windowStart=3 으로 이동
    assert.equal(
      computeNextWindowStartOnScroll({
        prevStart: 1,
        viewingStartPage: 15,
        viewingEndPage: 16,
        totalPages: 17,
        chunkSize: 15,
      }),
      3
    );

    // 페이지 11에 닿아 next === maxStart(3) 가 될 때도 히스테리시스(<5)에 막히지 않고 3으로 이동
    assert.equal(
      computeNextWindowStartOnScroll({
        prevStart: 1,
        viewingStartPage: 11,
        viewingEndPage: 12,
        totalPages: 17,
        chunkSize: 15,
      }),
      3
    );

    // 다시 맨 위(1p)로 올라갈 때도 데드락 없이 1로 복귀
    assert.equal(
      computeNextWindowStartOnScroll({
        prevStart: 3,
        viewingStartPage: 1,
        viewingEndPage: 2,
        totalPages: 17,
        chunkSize: 15,
      }),
      1
    );
  });

  it("50페이지 문서에서는 창 내부 미세 스크롤을 억제하고 창 이탈 시 즉시 점프한다", () => {
    // 1..15 mounted, viewport sees 7..8 -> next=2, |1-2|=1 < 5, both inside -> stay 1
    assert.equal(
      computeNextWindowStartOnScroll({
        prevStart: 1,
        viewingStartPage: 7,
        viewingEndPage: 8,
        totalPages: 50,
        chunkSize: 15,
      }),
      1
    );

    // viewport end hits 16 (> 15) -> jump immediately to 10
    assert.equal(
      computeNextWindowStartOnScroll({
        prevStart: 1,
        viewingStartPage: 15,
        viewingEndPage: 16,
        totalPages: 50,
        chunkSize: 15,
      }),
      10
    );
  });

  it("초기 마운트 시 activePageId 가 17페이지면 17페이지를 바로 마운트하고 하단 스페이서를 두지 않는다", () => {
    const pages = makePages(17);
    const html = renderToStaticMarkup(
      React.createElement(WindowedPageChunker, {
        pages,
        activePageId: "page_17",
        chunkSize: 15,
        pageGapPx: A4_PAGE_GAP_PX,
        renderPage: (p) => React.createElement("div", { key: p.pageId, "data-page": p.pageId }),
      })
    );
    assert.equal(computeWindowStartForPage(17, 17, 15), 3);
    assert.ok(html.includes('data-page="page_17"'), "17페이지가 마운트되어야 한다");
    assert.ok(html.includes('data-page="page_16"'), "16페이지가 마운트되어야 한다");
    assert.ok(html.includes("chunker-top-spacer"), "1~2페이지는 상단 스페이서로 치환된다");
    assert.ok(!html.includes("chunker-bottom-spacer"), "하단 스페이서는 남지 않아야 한다");
  });
});

