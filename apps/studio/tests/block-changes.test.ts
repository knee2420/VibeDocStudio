import assert from "node:assert/strict";
import { test } from "node:test";

import type { LayoutBlock, VDocPage } from "@vibe/vdoc-schema";

import { blockChangeDetail, countBlocks, pageBlockChanges } from "../src/entities/vdoc-document/lib/blockChanges";
import { slotLocations } from "../src/entities/vdoc-document/lib/changeSet";

const text = (blockId: string, slotId: string) => ({ blockId, kind: "text", title: "", slotId }) as unknown as LayoutBlock;
const table = (blockId: string, cells: string[][]) =>
  ({
    blockId,
    kind: "structured-table",
    title: "중동여행 비용",
    columnWidths: cells[0].map(() => "1fr"),
    rows: cells.map((row, r) => ({ rowId: `${blockId}-r${r}`, cells: row.map((slotId, c) => ({ cellId: `${blockId}-c${r}${c}`, slotId })) })),
  }) as unknown as LayoutBlock;
const page = (pageId: string, blocks: LayoutBlock[]): VDocPage => ({ pageId, pageNumber: 1, pageLabel: pageId, headerSlotId: "", footerSlotId: "", blocks });
const slots = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { slotId: k, label: k, role: "editable-slot" as const, content: v, backDataRefs: [] }]));

function run(basePage: VDocPage | null, nowPage: VDocPage | null, baseSlots: Record<string, string>, nowSlots: Record<string, string>, live: string[]) {
  const base = { slots: slots(baseSlots) };
  const doc = { slots: slots(nowSlots) };
  return pageBlockChanges({
    page: nowPage,
    basePage,
    doc,
    base,
    afterOf: (id) => doc.slots[id]?.content ?? "",
    where: slotLocations(nowPage ? [nowPage] : [], doc.slots),
    baseWhere: slotLocations(basePage ? [basePage] : [], base.slots),
    liveBlockIds: new Set(live),
  });
}

test("표는 블록 하나 — 바뀐 칸 수만 따로", () => {
  const t = table("t1", [["h1", "h2"], ["a", "b"]]);
  const out = run(page("p", [t]), page("p", [t]), { h1: "항목", h2: "내용", a: "비용", b: "상금 [확인 필요]" }, { h1: "항목", h2: "내용", a: "비용", b: "10,000,000원" }, ["t1"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "edited");
  assert.equal(out[0].kindLabel, "표");
  assert.equal(out[0].name, "중동여행 비용");
  assert.equal(blockChangeDetail(out[0]), "칸 1개 고침");
});

test("표에 행을 더하면 구성 바뀜 + 새 칸", () => {
  const before = table("t1", [["a", "b"]]);
  const after = table("t1", [["a", "b"], ["c", "d"]]);
  const out = run(page("p", [before]), page("p", [after]), { a: "1", b: "2" }, { a: "1", b: "2", c: "3", d: "" }, ["t1"]);
  assert.equal(blockChangeDetail(out[0]), "칸 1개 고침 · 구성 바뀜");
});

test("추가 · 삭제 · 이동, 다른 쪽으로 옮긴 블록은 삭제가 아니다", () => {
  const A = text("A", "sa");
  const B = text("B", "sb");
  const C = text("C", "sc");
  const D = text("D", "sd");
  const E = text("E", "se");
  const out = run(
    page("p", [A, B, C, D]),
    page("p", [B, A, C, E]),
    { sa: "a", sb: "b", sc: "c", sd: "d" },
    { sa: "a", sb: "b", sc: "c", se: "e" },
    ["A", "B", "C", "E"],
  );
  assert.deepEqual(countBlocks(out), { edited: 0, added: 1, removed: 1, moved: 1 });
  // A · B 를 맞바꾼 것은 둘 중 하나가 옮겨 간 것 (어느 쪽이든 1개)
  const moved = out.find((b) => b.kind === "moved")!.blockId;
  assert.ok(moved === "A" || moved === "B");
  assert.equal(out.find((b) => b.kind === "removed")!.blockId, "D");
  assert.equal(out.find((b) => b.kind === "added")!.blockId, "E");

  const elsewhere = run(page("p", [A, D]), page("p", [A]), { sa: "a", sd: "d" }, { sa: "a" }, ["A", "D"]);
  assert.equal(elsewhere.length, 0);
});
