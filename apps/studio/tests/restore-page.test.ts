import assert from "node:assert/strict";
import { test } from "node:test";

import { restorePageFrom, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";

const page = (pageId: string, slotId: string): VDocPage =>
  ({ pageId, pageNumber: 0, pageLabel: pageId, headerSlotId: "", footerSlotId: "", blocks: [{ blockId: `b-${slotId}`, kind: "text", title: "", slotId }] }) as unknown as VDocPage;
const slot = (slotId: string, content: string) => ({ slotId, label: slotId, role: "editable-slot" as const, content, backDataRefs: [] });
const doc = (pages: VDocPage[], slots: Record<string, string>): VDocDocument =>
  ({ pages, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, slot(k, v)])) }) as unknown as VDocDocument;

test("restorePageFrom: 있는 쪽은 그 버전 모습(구성 + 글)으로 바꿔 끼운다", () => {
  const then = doc([page("p1", "a"), page("p2", "b")], { a: "예전 a", b: "예전 b" });
  const now = doc([page("p1", "a"), { ...page("p2", "x") }], { a: "지금 a", b: "예전 b", x: "새 칸" });
  const out = restorePageFrom(now, then, "p2");
  assert.equal((out.pages[1].blocks[0] as unknown as { slotId: string }).slotId, "b");
  assert.equal(out.slots.a.content, "지금 a"); // 다른 쪽은 그대로
});

test("restorePageFrom: 지운 쪽은 예전 순서 자리에 다시 넣고 쪽 번호를 다시 매긴다", () => {
  const then = doc([page("p1", "a"), page("p2", "b"), page("p3", "c")], { a: "a", b: "b", c: "c" });
  const now = doc([page("p1", "a"), page("p3", "c")], { a: "a", c: "c" });
  const out = restorePageFrom(now, then, "p2");
  assert.deepEqual(out.pages.map((p) => p.pageId), ["p1", "p2", "p3"]);
  assert.deepEqual(out.pages.map((p) => p.pageNumber), [1, 2, 3]);
  assert.equal(out.slots.b.content, "b");
  assert.equal(restorePageFrom(now, then, "nope"), now);
});
