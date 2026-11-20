import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  A4_DOCUMENT_VIEW,
  BLOG_DOCUMENT_VIEW,
  VPROJ_FOLDER_EXT,
  applyDocumentView,
  documentSurface,
  listDocumentViews,
  resolveDocumentView,
  type VDocDocument,
} from "../src/index";

function makeSampleDoc(overrides: Partial<VDocDocument> = {}): VDocDocument {
  return {
    version: "1.0.0",
    docId: "vdoc-test-1",
    title: "Test Doc",
    status: "Draft",
    updatedAt: "2026-11-20T00:00:00.000Z",
    variables: { author: "team" },
    pages: [
      {
        pageId: "p1",
        pageNumber: 1,
        pageLabel: "Page 1",
        headerSlotId: "s-hdr",
        footerSlotId: "s-ftr",
        hideHeaderFooter: false,
        blocks: [
          {
            blockId: "b1",
            kind: "heading",
            title: "제목",
            level: 1,
            slotId: "s1",
          },
        ],
      },
    ],
    slots: {
      "s-hdr": { slotId: "s-hdr", label: "Header", role: "editable-slot", content: "", backDataRefs: [] },
      "s-ftr": { slotId: "s-ftr", label: "Footer", role: "editable-slot", content: "", backDataRefs: [] },
      s1: { slotId: "s1", label: "제목", role: "editable-slot", content: "<h1>Hello</h1>", backDataRefs: [] },
    },
    backdata: {},
    ...overrides,
  };
}

describe("@vibe/vdoc-schema — Document View Registry (A4 & Blog)", () => {
  it("resolves built-in A4 and Blog views with full backward compatibility for legacy surface/genre", () => {
    assert.equal(VPROJ_FOLDER_EXT, "vproj");
    assert.ok(listDocumentViews().some((v) => v.id === "a4"));
    assert.ok(listDocumentViews().some((v) => v.id === "blog"));

    // Legacy document without viewId defaults to A4
    assert.equal(resolveDocumentView(makeSampleDoc()).id, "a4");
    assert.deepEqual(documentSurface(makeSampleDoc()), A4_DOCUMENT_VIEW.surface);

    // Legacy scroll document without viewId resolves to Blog
    const legacyScroll = makeSampleDoc({ surface: { kind: "scroll", width: 720 } });
    assert.equal(resolveDocumentView(legacyScroll).id, "blog");
    assert.equal(resolveDocumentView(legacyScroll).showPagesSection, false);

    // Legacy genre=blog without surface resolves to Blog
    const legacyGenre = makeSampleDoc({ genre: "blog" });
    assert.equal(resolveDocumentView(legacyGenre).id, "blog");
  });

  it("switches A4 <-> Blog view without mutating content/slots/variables", () => {
    const original = makeSampleDoc();
    const asBlog = applyDocumentView(original, "blog");

    assert.equal(asBlog.viewId, "blog");
    assert.deepEqual(asBlog.surface, BLOG_DOCUMENT_VIEW.surface);
    assert.equal(asBlog.genre, "blog");
    assert.equal(asBlog.pages[0].hideHeaderFooter, true);
    assert.equal(asBlog.slots.s1.content, "<h1>Hello</h1>");
    assert.deepEqual(asBlog.variables, { author: "team" });

    const backToA4 = applyDocumentView(asBlog, "a4");
    assert.equal(backToA4.viewId, "a4");
    assert.deepEqual(backToA4.surface, A4_DOCUMENT_VIEW.surface);
    assert.equal(backToA4.genre, "document");
    assert.equal(backToA4.slots.s1.content, "<h1>Hello</h1>");
  });
});
