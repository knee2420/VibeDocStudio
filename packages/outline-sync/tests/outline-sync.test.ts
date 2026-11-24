import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestOutlineReveal, subscribeOutlineReveal } from "../src/index";

describe("@vibe/outline-sync", () => {
  it("드러내기 요청: 구독자가 있으면 바로, 없으면 마운트 때 한 번", async () => {
    const got: string[] = [];
    const off = subscribeOutlineReveal("a.outline", (id) => got.push(id));
    requestOutlineReveal("a.outline", "n1");
    off();
    requestOutlineReveal("b.outline", "n2");
    const later: string[] = [];
    subscribeOutlineReveal("b.outline", (id) => later.push(id));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(got, ["n1"]);
    assert.deepEqual(later, ["n2"]);
  });
});
