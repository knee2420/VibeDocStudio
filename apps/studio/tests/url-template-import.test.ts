import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSectionPage, importPagesFromDocument, type VDocDocument } from "@vibe/vdoc-schema";

import { TEMPLATE_SOURCE_REGISTRY } from "../src/features/insert-template-pages/model/templateSources";

function makeTargetDoc(): VDocDocument {
  const s1 = createSectionPage({
    pageId: "p1",
    pageNumber: 1,
    pageLabel: "기존 문서 (1p)",
    headerHtml: "<p></p>",
    footerHtml: "<p></p>",
    headingHtml: "<p>기존 제목</p>",
    bodyHtml: "<p>기존 내용</p>",
  });
  return {
    version: "1.0.0",
    docId: "vdoc-target",
    title: "작업 문서",
    status: "Draft",
    updatedAt: "2026-11-11T00:00:00.000Z",
    variables: {},
    pages: [s1.page],
    slots: s1.slots,
    backdata: {},
    preview: { pageThumbnails: ["thumb-existing"] },
  };
}

function makeWebExtractedDoc(): VDocDocument {
  return {
    version: "1.0.0",
    docId: "vdoc-web-1",
    title: "웹 아티클 샘플",
    status: "Draft",
    updatedAt: "2026-11-11T00:00:00.000Z",
    variables: {},
    pages: [
      {
        pageId: "wpage_1",
        pageNumber: 1,
        pageLabel: "웹 아티클 샘플 (1p)",
        hideHeaderFooter: false,
        headerSlotId: "wpage_1_header",
        footerSlotId: "wpage_1_footer",
        blocks: [
          { blockId: "w_hd_1", kind: "heading", title: "제목", slotId: "w_hd_1_s", level: 1, align: "left" },
          { blockId: "w_txt_2", kind: "text", title: "본문", slotId: "w_txt_2_s", align: "left" },
        ],
      },
      {
        pageId: "wpage_2",
        pageNumber: 2,
        pageLabel: "두 번째 섹션 (2p)",
        hideHeaderFooter: false,
        headerSlotId: "wpage_2_header",
        footerSlotId: "wpage_2_footer",
        pageRect: { width: 794, height: 1500, unit: "px" },
        blocks: [
          { blockId: "w_qt_3", kind: "callout-box", title: "인용", slotId: "w_qt_3_s", tone: "neutral" },
          { blockId: "w_img_4", kind: "image", title: "이미지", src: "data:image/jpeg;base64,AAA", align: "center" },
        ],
      },
    ],
    slots: {
      wpage_1_header: { slotId: "wpage_1_header", label: "머리글", role: "editable-slot", content: "<p>Web</p>", backDataRefs: [] },
      wpage_1_footer: { slotId: "wpage_1_footer", label: "바닥글", role: "editable-slot", content: "<p>- 1 -</p>", backDataRefs: [] },
      w_hd_1_s: { slotId: "w_hd_1_s", label: "제목", role: "editable-slot", content: "<p>제목</p>", backDataRefs: [] },
      w_txt_2_s: { slotId: "w_txt_2_s", label: "본문", role: "editable-slot", content: "<p>내용</p>", backDataRefs: [] },
      wpage_2_header: { slotId: "wpage_2_header", label: "머리글", role: "editable-slot", content: "<p>Web</p>", backDataRefs: [] },
      wpage_2_footer: { slotId: "wpage_2_footer", label: "바닥글", role: "editable-slot", content: "<p>- 2 -</p>", backDataRefs: [] },
      w_qt_3_s: { slotId: "w_qt_3_s", label: "인용", role: "editable-slot", content: "<blockquote><p>요약</p></blockquote>", backDataRefs: [] },
    },
    backdata: {},
    preview: {
      sourceWebUrl: "https://blog.example.com/post/1",
      pageThumbnails: ["data:image/jpeg;base64,T1", "data:image/jpeg;base64,T2"],
    },
  };
}

describe("URL template import registration & page insertion", () => {
  it("registers url source at the bottom of TEMPLATE_SOURCE_REGISTRY", () => {
    const kinds = TEMPLATE_SOURCE_REGISTRY.map((s) => s.kind);
    assert.deepEqual(kinds, ["blank", "pdf", "catalog", "url"]);
    const catalogDesc = TEMPLATE_SOURCE_REGISTRY.find((s) => s.kind === "catalog")?.description ?? "";
    assert.equal(catalogDesc.includes("블로그"), false);
  });

  it("imports selected web pages and their thumbnails into target document", () => {
    const target = makeTargetDoc();
    const webDoc = makeWebExtractedDoc();
    let seq = 0;
    const next = importPagesFromDocument(target, webDoc, ["wpage_2"], () => `imp_${++seq}`);

    assert.equal(next.pages.length, 2);
    assert.equal(next.pages[1].pageLabel, "두 번째 섹션 (2p)");
    assert.equal(next.pages[1].blocks.length, 2);
    assert.equal(next.pages[1].blocks[0].kind, "callout-box");
    assert.equal(next.pages[1].blocks[1].kind, "image");
    assert.deepEqual(next.pages[1].pageRect, { width: 794, height: 1500, unit: "px" });
    assert.deepEqual(next.preview?.pageThumbnails, ["thumb-existing", "data:image/jpeg;base64,T2"]);
  });
});
