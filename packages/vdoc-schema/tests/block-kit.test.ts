/**
 * 블록 규격 검사 — 등록된 모든 블록 종류를 같은 기준으로 확인한다.
 * 새 블록을 추가하고 이 검사가 통과하면, 아웃라이너 · 선택 · 복제 · 블록 추가 메뉴 · AI 가 그 블록을 다룰 수 있다.
 *
 *   pnpm --filter @vibe/vdoc-schema test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildProjectFractalTree,
  cloneBlockWithSlots,
  getBlockKind,
  getBlockUnits,
  hasBlockKind,
  LAYOUT_BLOCK_KINDS,
  listBlockKinds,
  listInsertableBlocks,
  createInsertableBlock,
  type LayoutBlock,
  type VDocDocument,
} from "../src";
import { SNAPSHOT_PATH, seedDocuments, seedProjects } from "./fixtures";
import { computeBehavior } from "./snapshot";

const docs = seedDocuments();
const seedBlocks: { doc: VDocDocument; block: LayoutBlock }[] = docs.flatMap((doc) =>
  doc.pages.flatMap((page) => page.blocks.map((block) => ({ doc, block })))
);

describe("블록 종류 목록", () => {
  it("LAYOUT_BLOCK_KINDS 의 모든 종류에 정의가 있다", () => {
    for (const kind of LAYOUT_BLOCK_KINDS) assert.ok(hasBlockKind(kind), `정의 없음: ${kind}`);
  });

  it("정의가 맡는 종류는 모두 LAYOUT_BLOCK_KINDS 에 있다 (목록에 빠진 종류가 없다)", () => {
    for (const def of listBlockKinds()) {
      for (const kind of def.kinds) assert.ok((LAYOUT_BLOCK_KINDS as readonly string[]).includes(kind), `목록에 없음: ${kind}`);
    }
  });

  it("시드 문서의 모든 블록 종류가 등록돼 있다 (일반 정의로 떨어지는 블록이 없다)", () => {
    for (const { doc, block } of seedBlocks) assert.ok(hasBlockKind(block.kind), `${doc.docId}/${block.blockId}: ${block.kind}`);
  });

  it("정의마다 이름 · 분류 · 아이콘이 있다", () => {
    for (const def of listBlockKinds()) {
      assert.ok(def.label && def.category && def.icon, def.kinds.join(","));
    }
  });
});

describe("슬롯 · 선택 단위", () => {
  it("슬롯 id 가 겹치지 않고, 문서에 실제로 있다", () => {
    for (const { doc, block } of seedBlocks) {
      const ids = getBlockKind(block.kind).slotIds(block);
      assert.equal(new Set(ids).size, ids.length, `${block.blockId}: 슬롯 중복`);
      for (const id of ids) assert.ok(doc.slots[id], `${doc.docId}/${block.blockId}: 없는 슬롯 ${id}`);
    }
  });

  it("모든 슬롯이 slot 단위로 나오고, 단위 id 는 겹치지 않는다", () => {
    for (const { block } of seedBlocks) {
      const units = getBlockUnits(block);
      assert.equal(new Set(units.map((u) => u.unitId)).size, units.length, `${block.blockId}: 단위 중복`);
      const slotUnits = units.filter((u) => u.kind === "slot").map((u) => u.slotId);
      for (const id of getBlockKind(block.kind).slotIds(block)) assert.ok(slotUnits.includes(id), `${block.blockId}: 단위 없는 슬롯 ${id}`);
    }
  });

  it("슬롯이 없는 블록(이미지)도 선택 단위가 하나 이상 있다", () => {
    for (const { block } of seedBlocks) {
      if (getBlockKind(block.kind).slotIds(block).length === 0) {
        assert.ok(getBlockUnits(block).length > 0, `${block.blockId} (${block.kind}): 선택할 수 없는 블록`);
      }
    }
  });

  it("복제하면 슬롯이 같은 수만큼 새로 생긴다", () => {
    for (const { doc, block } of seedBlocks) {
      let n = 0;
      const clone = cloneBlockWithSlots(block, doc.slots, () => `t${n++}`);
      const before = getBlockKind(block.kind).slotIds(block);
      const after = getBlockKind(clone.block.kind).slotIds(clone.block);
      assert.equal(after.length, before.length, block.blockId);
      for (const id of after) assert.ok(clone.slots[id] && !before.includes(id), `${block.blockId}: 복제 슬롯 ${id}`);
    }
  });
});

describe("아웃라인", () => {
  it("슬롯이나 선택 단위가 있는 블록은 아웃라이너에 나온다", () => {
    for (const project of seedProjects()) {
      const projectDocs = docs.filter((d) => project.docIds.includes(d.docId));
      const nodes = buildProjectFractalTree(project, projectDocs, null, "", []).allNodes;
      const shown = new Set(nodes.map((n) => n.targetBlockId).filter(Boolean));
      for (const doc of projectDocs) {
        for (const page of doc.pages) {
          for (const block of page.blocks) {
            const slots = getBlockKind(block.kind).slotIds(block).filter((id) => doc.slots[id]);
            if (slots.length === 0 && getBlockUnits(block).length === 0) continue;
            assert.ok(shown.has(block.blockId), `${doc.docId}/${block.blockId} (${block.kind}) 가 아웃라인에 없음`);
          }
        }
      }
    }
  });

  it("리팩터 전후 동작이 같다 (슬롯 목록 · 잠금 · 복제 · 아웃라인 트리 스냅샷)", () => {
    const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));
    const actual = JSON.parse(JSON.stringify(computeBehavior()));
    assert.deepEqual(actual, expected);
  });
});

describe("표 · 새 블록 · AI", () => {
  it("tables 와 replaceTable 은 함께 있고, 같은 표로 바꾸면 슬롯이 그대로다", () => {
    for (const { block } of seedBlocks) {
      const def = getBlockKind(block.kind);
      assert.equal(Boolean(def.tables), Boolean(def.replaceTable), `${block.kind}: tables/replaceTable 짝`);
      for (const t of def.tables?.(block) ?? []) {
        const replaced = def.replaceTable!(block, t.sectionId, t.table);
        assert.deepEqual(def.slotIds(replaced), def.slotIds(block), `${block.blockId}: 표 교체 후 슬롯`);
      }
    }
  });

  it("블록 추가 메뉴의 종류는 빈 틀을 만들 수 있다 (슬롯 · 포커스 슬롯 포함)", () => {
    const items = listInsertableBlocks();
    assert.ok(items.length > 0);
    for (const item of items) {
      const draft = createInsertableBlock(item.kind, { suffix: "conf" });
      assert.equal(draft.block.kind, item.kind);
      const ids = getBlockKind(draft.block.kind).slotIds(draft.block);
      assert.ok(ids.length > 0, item.kind);
      for (const id of ids) assert.ok(draft.slots[id], `${item.kind}: 틀에 없는 슬롯 ${id}`);
      assert.ok(draft.slots[draft.focusSlotId], `${item.kind}: 포커스 슬롯`);
    }
  });

  it("AI 설명은 문자열 줄이고, 바꿀 수 있는 속성 규격이 올바르다", () => {
    for (const { block } of seedBlocks) {
      const ai = getBlockKind(block.kind).ai;
      const lines = ai?.describe?.(block) ?? [];
      assert.ok(Array.isArray(lines) && lines.every((l) => typeof l === "string"), block.blockId);
      for (const [key, spec] of Object.entries(ai?.editableProps ?? {})) {
        assert.ok(["string", "number", "boolean"].includes(spec.type), `${block.kind}.${key}`);
        assert.ok(spec.description, `${block.kind}.${key}: 설명`);
        if (spec.enum) assert.ok(spec.enum.length > 0, `${block.kind}.${key}: enum`);
      }
    }
  });
});
