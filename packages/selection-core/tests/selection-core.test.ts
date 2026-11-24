import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyIntent,
  clearSelection,
  emptySelection,
  hitTestRects,
  intentFromModifiers,
  isMarqueeDrag,
  isSelected,
  primaryItem,
  rectFromPoints,
  removeItems,
  selectOnly,
  selectRange,
  selectedIds,
  selectionKey,
  setSelection,
  toggleItem,
  type SelectionItem,
} from "../src/index";

const b = (id: string): SelectionItem => ({ id, kind: "block" });
const order = ["a", "b", "c", "d", "e"].map(b);

describe("@vibe/selection-core", () => {
  it("selectOnly → 하나 · 주 항목 · 앵커", () => {
    const s = selectOnly(emptySelection(), b("c"));
    assert.deepEqual(selectedIds(s), ["c"]);
    assert.equal(s.primaryKey, "block:c");
    assert.equal(s.anchorKey, "block:c");
  });

  it("toggle 은 더하고 빼며, 뺀 것이 주 항목이면 남은 마지막이 주 항목", () => {
    let s = selectOnly(emptySelection(), b("a"));
    s = toggleItem(s, b("c"));
    s = toggleItem(s, b("e"));
    assert.deepEqual(selectedIds(s), ["a", "c", "e"]);
    assert.equal(primaryItem(s)?.id, "e");
    s = toggleItem(s, b("e"));
    assert.deepEqual(selectedIds(s), ["a", "c"]);
    assert.equal(primaryItem(s)?.id, "c");
  });

  it("range 는 앵커부터 읽는 순서로 고르고 앵커를 지킨다 (양방향)", () => {
    let s = selectOnly(emptySelection(), b("b"));
    s = selectRange(s, b("d"), order);
    assert.deepEqual(selectedIds(s), ["b", "c", "d"]);
    s = selectRange(s, b("a"), order);
    assert.deepEqual(selectedIds(s), ["a", "b"]);
    assert.equal(s.anchorKey, "block:b");
  });

  it("range-add 는 기존 선택을 지킨다", () => {
    let s = selectOnly(emptySelection(), b("a"));
    s = toggleItem(s, b("d"));
    s = applyIntent(s, "range-add", b("e"), order);
    assert.deepEqual(selectedIds(s), ["a", "d", "e"]);
  });

  it("바뀌지 않으면 같은 객체 (구독자 다시 그리기 생략)", () => {
    const s = setSelection(emptySelection(), [b("a"), b("b")]);
    assert.equal(setSelection(s, [b("a"), b("b")]), s);
    assert.equal(selectOnly(selectOnly(emptySelection(), b("a")), b("a")).items.length, 1);
    const one = selectOnly(emptySelection(), b("a"));
    assert.equal(selectOnly(one, b("a")), one);
    const empty = emptySelection();
    assert.equal(clearSelection(empty), empty);
    assert.equal(removeItems(s, () => false), s);
  });

  it("종류가 다르면 다른 항목 · 중복 제거", () => {
    const s = setSelection(emptySelection(), [b("x"), { id: "x", kind: "slot" }, b("x")]);
    assert.equal(s.items.length, 2);
    assert.ok(isSelected(s, { id: "x", kind: "slot" }));
    assert.deepEqual(selectedIds(s, "slot"), ["x"]);
    assert.equal(selectionKey(s.items[0]), "block:x");
  });

  it("modifier → intent", () => {
    assert.equal(intentFromModifiers({}), "replace");
    assert.equal(intentFromModifiers({ ctrlKey: true }), "toggle");
    assert.equal(intentFromModifiers({ metaKey: true }), "toggle");
    assert.equal(intentFromModifiers({ shiftKey: true }), "range");
    assert.equal(intentFromModifiers({ shiftKey: true, ctrlKey: true }), "range-add");
  });

  it("마키 적중: intersect · contain · 빈 사각형 무시 · 드래그 문턱", () => {
    const cands = [
      { item: b("a"), rect: { left: 0, top: 0, right: 100, bottom: 50 } },
      { item: b("b"), rect: { left: 0, top: 60, right: 100, bottom: 110 } },
      { item: b("c"), rect: { left: 0, top: 200, right: 0, bottom: 200 } },
    ];
    const m = rectFromPoints(90, 120, 10, 40);
    assert.deepEqual(hitTestRects(cands, m).map((x) => x.id), ["a", "b"]);
    assert.deepEqual(hitTestRects(cands, m, "contain").map((x) => x.id), []);
    assert.deepEqual(hitTestRects(cands, rectFromPoints(-5, 55, 105, 115), "contain").map((x) => x.id), ["b"]);
    assert.equal(isMarqueeDrag(0, 0, 2, 3), false);
    assert.equal(isMarqueeDrag(0, 0, 5, 0), true);
  });
});
