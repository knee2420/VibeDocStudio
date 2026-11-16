import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { placementInPage } from "../src/widgets/vdoc-page-canvas/model/findBlockPlacement";

// 블록 3개 (b2 는 고정 위치 frame 블록 — 흐름 순서에서 빠진다)
const page = {
  pageId: "p1",
  blocks: [{ blockId: "b1" }, { blockId: "b2", frame: { x: 0, y: 0, w: 10, h: 10 } }, { blockId: "b3" }],
} as never;
const rects: Record<string, { top: number; bottom: number; left: number; width: number }> = {
  b1: { top: 100, bottom: 200, left: 50, width: 700 },
  b3: { top: 220, bottom: 320, left: 50, width: 700 },
};
const pageRect = { top: 0, bottom: 1000, left: 0, width: 800 };
const at = (y: number) => placementInPage(page, (id) => rects[id] ?? null, pageRect, y);

describe("배치 도구 삽입 자리", () => {
  it("첫 블록 가운데보다 위 → 맨 앞", () => {
    assert.equal(at(120).index, 0);
  });
  it("두 블록 사이 → 뒤 블록 앞 (frame 블록은 건너뛴다), 삽입선은 틈 가운데", () => {
    const t = at(230);
    assert.equal(t.index, 2);
    assert.equal(t.line.top, 210);
  });
  it("마지막 블록 가운데보다 아래 → 맨 뒤", () => {
    assert.equal(at(310).index, 3);
  });
  it("빈 페이지 → 맨 뒤, 본문 영역 안쪽에 선", () => {
    const t = placementInPage({ pageId: "p2", blocks: [] } as never, () => null, pageRect, 500);
    assert.equal(t.index, 0);
    assert.equal(t.line.left, 40);
  });
});
