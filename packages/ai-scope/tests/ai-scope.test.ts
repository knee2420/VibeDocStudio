import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { insertBlock, type LayoutBlock, type VDocDocument } from "@vibe/vdoc-schema";

import { DEFAULT_SCOPE, resolveScope, scopeAllowsSlot, targetFromBlock, targetFromSlots } from "../src/index";

function doc3(): VDocDocument {
  let doc: VDocDocument = {
    version: "1.0.0", docId: "d", title: "D", status: "Draft", updatedAt: "", variables: {}, backdata: {}, slots: {},
    pages: [{ pageId: "p1", pageNumber: 1, pageLabel: "1쪽", blocks: [] }],
  } as unknown as VDocDocument;
  for (const i of [1, 2, 3]) {
    const block = { blockId: `b${i}`, kind: "callout-box", title: `B${i}`, slotId: `s${i}`, tone: "info" } as unknown as LayoutBlock;
    doc = insertBlock(doc, "p1", block, { [`s${i}`]: { slotId: `s${i}`, label: `칸${i}`, role: "editable-slot", content: "", backDataRefs: [] } }, i - 1);
  }
  return doc;
}

describe("@vibe/ai-scope", () => {
  it("여러 단위 선택 → slot-range 범위 (그 칸들만 허용)", () => {
    const doc = doc3();
    const target = targetFromSlots(doc, ["s3"], ["b1", "s3"]);
    assert.ok(target);
    assert.equal(target.kind, "slot-range");
    assert.deepEqual([...target.slotIds].sort(), ["s1", "s3"]);
    const scope = resolveScope(doc, { ...DEFAULT_SCOPE, mode: "selection" }, { target, pageId: "p1" });
    assert.ok(scopeAllowsSlot(doc, scope, "s1"));
    assert.ok(scopeAllowsSlot(doc, scope, "s3"));
    assert.ok(!scopeAllowsSlot(doc, scope, "s2"));
  });

  it("블록 하나 → block 범위", () => {
    assert.equal(targetFromBlock(doc3(), "b2")?.kind, "block");
  });
});
