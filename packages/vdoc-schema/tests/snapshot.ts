/** 블록 동작 스냅샷: 리팩터 전후로 결과가 같은지 비교하는 기준 (`--write` 로 갱신). */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { buildProjectFractalTree, cloneBlockWithSlots, getBlockSlotIds, isBlockLocked } from "../src";
import { SNAPSHOT_PATH, seedDocuments, seedProjects } from "./fixtures";

export function computeBehavior() {
  const docs = seedDocuments();
  const blocks: Record<string, unknown> = {};
  for (const doc of docs) {
    for (const page of doc.pages) {
      for (const block of page.blocks) {
        let n = 0;
        const clone = cloneBlockWithSlots(block, doc.slots, () => `x${n++}`);
        blocks[`${doc.docId}/${page.pageId}/${block.blockId}`] = {
          kind: block.kind,
          slots: getBlockSlotIds(block),
          locked: isBlockLocked(block, doc.slots),
          cloneSlots: getBlockSlotIds(clone.block),
        };
      }
    }
  }
  const outlines: Record<string, unknown> = {};
  for (const project of seedProjects()) {
    const projectDocs = docs.filter((d) => project.docIds.includes(d.docId));
    const tree = buildProjectFractalTree(project, projectDocs, null, "", []);
    outlines[project.projectId] = tree.allNodes.map((n) =>
      [n.nodeId, n.parentId, n.depth, n.zoomLevel, n.title, n.summary, n.targetPageId ?? "", n.targetBlockId ?? "", n.targetSlotId ?? "", n.isStatic ? 1 : 0, n.nameNeedsReview ? 1 : 0].join(" | ")
    );
  }
  return { blocks, outlines };
}

if (process.argv.includes("--write")) {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(computeBehavior(), null, 1));
  console.log("snapshot written", SNAPSHOT_PATH);
}
