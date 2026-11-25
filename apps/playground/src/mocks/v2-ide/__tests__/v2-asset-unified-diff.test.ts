import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryVaultAdapter } from "@vibe/vault-core";
import { serializeVDocJson } from "@vibe/vault-formats";
import type { AssetV3, VDocDocument } from "@vibe/vdoc-schema";
import { createVDocUiBridgeStore } from "@vibe/canvas-state";
import {
  clientTool,
  createAssetV3Tools,
  createV2AiStore,
  registerAssetV3,
  stage,
  workbenchPayload,
  type V2AiEnv,
  type V2StagedChange,
} from "@vibe/ai-vault";

import { matchBlockAssetChanges, matchPageEndAssetChanges } from "../ui/ai/V2BlockReview";

function makeAssetChange(
  overrides: Partial<Extract<V2StagedChange, { targetKind: "asset-blocks" }>> & {
    payload: Extract<V2StagedChange, { targetKind: "asset-blocks" }>["payload"];
  }
): V2StagedChange {
  return {
    path: "05. AI Eval/제안요청서.vdoc",
    diffId: "stg-asset-1",
    phase: "drafting",
    targetKind: "asset-blocks",
    targetId: "blk-1",
    title: "[에셋] 요구사항 분류 목록 → 요구사항 목록표",
    beforeSummary: "블록 1개",
    afterSummary: "요구사항 목록표 · 블록 1개",
    sourceReferenceIds: [],
    docId: "doc-1",
    createdAt: "2026-11-25T00:00:00.000Z",
    ...overrides,
  } as V2StagedChange;
}

function makeSampleEnv(): { env: V2AiEnv; docPath: string; assetId: string } {
  const docPath = "05. AI Eval/샘플.vdoc";
  const doc: VDocDocument = {
    version: "1.0.0",
    docId: "doc-sample",
    title: "샘플 문서",
    status: "Draft",
    updatedAt: "2026-11-25T00:00:00.000Z",
    variables: {},
    backdata: {},
    pages: [
      {
        pageId: "p1",
        pageNumber: 1,
        pageLabel: "1쪽",
        headerSlotId: "h1",
        footerSlotId: "f1",
        blocks: [
          {
            blockId: "blk-1",
            kind: "text",
            title: "기존 요약",
            slotId: "s1",
          },
        ],
      },
    ],
    slots: {
      h1: { slotId: "h1", label: "머리글", role: "editable-slot", content: "", backDataRefs: [] },
      f1: { slotId: "f1", label: "바닥글", role: "editable-slot", content: "", backDataRefs: [] },
      s1: { slotId: "s1", label: "요약", role: "editable-slot", content: "<p>기존 내용</p>", backDataRefs: [] },
    },
  };
  const vault = new MemoryVaultAdapter({ id: "test-vault", name: "test-vault" });
  vault.write(docPath, serializeVDocJson(doc));
  const store = createV2AiStore("test-vault", null);
  const vdocUiBridge = createVDocUiBridgeStore();
  const env: V2AiEnv = {
    vault,
    vaultId: "test-vault",
    vaultRootPath: null,
    vdocUiBridge,
    store,
    activeDocPath: () => docPath,
    activeTabPath: () => docPath,
    textSelection: () => null,
    pushLog: () => undefined,
  };
  const reqTableAsset: AssetV3 = {
    schema: "vibe-asset/3",
    assetId: "req-table",
    title: "요구사항 목록표",
    scope: "element",
    nodes: [
      {
        t: "grid",
        component: "table",
        rows: [
          {
            cells: [
              { role: "column-header", text: "순번" },
              { role: "column-header", text: "요구사항 명" },
            ],
          },
          {
            repeat: "rows",
            cells: [
              { role: "value", field: { id: "no", type: "text", hint: "순번" } },
              { role: "value", field: { id: "name", type: "text", hint: "요구사항 명" } },
            ],
          },
        ],
      },
    ],
  };
  const { entry } = registerAssetV3(vault, reqTableAsset);
  return { env, docPath, assetId: entry.asset.assetId };
}

describe("V2BlockReview unified diff matching", () => {
  const docPath = "05. AI Eval/제안요청서.vdoc";
  const otherPath = "01. Architecture/other.vdoc";

  it("matches replace mode primary and secondary blocks strictly by path", () => {
    const queue: V2StagedChange[] = [
      makeAssetChange({
        diffId: "stg-rep-1",
        path: docPath,
        payload: {
          assetId: "req-table",
          mode: "replace",
          replaceBlockIds: ["blk-1", "blk-2"],
          blocks: [],
          slots: {},
          report: { filled: 2, empty: 2, leftover: ["rows (4행)"], preserved: { kept: 2, total: 16 } },
        },
      }),
      makeAssetChange({
        diffId: "stg-rep-other",
        path: otherPath,
        payload: {
          assetId: "req-table",
          mode: "replace",
          replaceBlockIds: ["blk-1"],
          blocks: [],
          slots: {},
        },
      }),
    ];

    const primary = matchBlockAssetChanges(queue, docPath, "blk-1");
    assert.equal(primary.replacePrimary?.diffId, "stg-rep-1");
    assert.equal(primary.replaceSecondary, null);
    assert.equal(primary.anchoredInserts.length, 0);

    const secondary = matchBlockAssetChanges(queue, docPath, "blk-2");
    assert.equal(secondary.replacePrimary, null);
    assert.equal(secondary.replaceSecondary?.diffId, "stg-rep-1");

    const unrelated = matchBlockAssetChanges(queue, docPath, "blk-999");
    assert.equal(unrelated.replacePrimary, null);
    assert.equal(unrelated.replaceSecondary, null);
    assert.equal(unrelated.anchoredInserts.length, 0);
  });

  it("matches anchored inserts to their anchorBlockId and unanchored inserts to page end", () => {
    const queue: V2StagedChange[] = [
      makeAssetChange({
        diffId: "stg-ins-anchored-1",
        path: docPath,
        payload: {
          assetId: "summary-card",
          mode: "insert",
          anchorBlockId: "blk-1",
          blocks: [],
          slots: {},
        },
      }),
      makeAssetChange({
        diffId: "stg-ins-anchored-2",
        path: docPath,
        payload: {
          assetId: "callout",
          mode: "insert",
          anchorBlockId: "blk-1",
          blocks: [],
          slots: {},
        },
      }),
      makeAssetChange({
        diffId: "stg-ins-page-end",
        path: docPath,
        payload: {
          assetId: "signoff",
          mode: "insert",
          blocks: [],
          slots: {},
        },
      }),
    ];

    const anchored = matchBlockAssetChanges(queue, docPath, "blk-1");
    assert.equal(anchored.replacePrimary, null);
    assert.deepEqual(
      anchored.anchoredInserts.map((c) => c.diffId),
      ["stg-ins-anchored-1", "stg-ins-anchored-2"]
    );

    const pageEnd = matchPageEndAssetChanges(queue, docPath);
    assert.deepEqual(
      pageEnd.map((c) => c.diffId),
      ["stg-ins-page-end"]
    );
    assert.equal(matchPageEndAssetChanges(queue, otherPath).length, 0);
  });
});

describe("V2AiStore asset-blocks dedupe, revisionOf, and replace-insert mode switching", () => {
  it("dedupes replace proposals on the same replaceBlockIds while preserving multiple insert proposals", () => {
    const store = createV2AiStore("v-dedupe", null);
    store.getState().enqueue([
      makeAssetChange({
        diffId: "rep-1",
        payload: { assetId: "a", mode: "replace", replaceBlockIds: ["blk-1"], blocks: [], slots: {} },
      }),
      makeAssetChange({
        diffId: "rep-2",
        payload: { assetId: "a", mode: "replace", replaceBlockIds: ["blk-1"], blocks: [], slots: {} },
      }),
      makeAssetChange({
        diffId: "ins-1",
        payload: { assetId: "card", mode: "insert", anchorBlockId: "blk-1", blocks: [], slots: {} },
      }),
      makeAssetChange({
        diffId: "ins-2",
        payload: { assetId: "card", mode: "insert", anchorBlockId: "blk-1", blocks: [], slots: {} },
      }),
    ]);

    const ids = store.getState().queue.map((c) => c.diffId);
    assert.deepEqual(ids, ["rep-2", "ins-1", "ins-2"]);
  });

  it("toggles replace <-> insert in-place while preserving target block pointers", () => {
    const store = createV2AiStore("v-toggle", null);
    store.getState().enqueue([
      makeAssetChange({
        diffId: "stg-tog",
        payload: {
          assetId: "req-table",
          mode: "replace",
          replaceBlockIds: ["blk-1", "blk-2"],
          anchorBlockId: "blk-1",
          blocks: [],
          slots: {},
        },
      }),
    ]);

    assert.equal(store.getState().setAssetPlacementMode("stg-tog", "insert"), true);
    let cur = store.getState().queue[0];
    assert.equal(cur.targetKind, "asset-blocks");
    if (cur.targetKind === "asset-blocks") {
      assert.equal(cur.payload.mode, "insert");
      assert.equal(cur.payload.anchorBlockId, "blk-1");
      assert.deepEqual(cur.payload.replaceBlockIds, ["blk-1", "blk-2"]);
    }

    assert.equal(store.getState().setAssetPlacementMode("stg-tog", "replace"), true);
    cur = store.getState().queue[0];
    if (cur.targetKind === "asset-blocks") {
      assert.equal(cur.payload.mode, "replace");
      assert.deepEqual(cur.payload.replaceBlockIds, ["blk-1", "blk-2"]);
    }
  });
});

describe("assets.propose organic flow: zero-match guard, replace+records, revisionOf, and workbench stagedChanges", () => {
  it("blocks zero-match explicit data instead of polluting staged queue, then stages & revises cleanly", () => {
    const { env, assetId } = makeSampleEnv();
    const tools = new Map(createAssetV3Tools(env, { clientTool, stage }).map((t) => [t.name, t]));
    const propose = tools.get("assets.propose")!;
    assert.ok(propose, "assets.propose tool must be registered");

    // 1) Wrong field keys with 0 matches -> must NOT stage a broken empty card!
    const failed = propose.run(
      {
        assetId,
        mode: "insert",
        afterBlockId: "blk-1",
        records: { rows: [{ wrongKeyA: "1", wrongKeyB: "foo" }] },
      },
      { callId: "c1", sessionId: null, signal: new AbortController().signal }
    ) as { staged: boolean; error?: string; validFields?: { fields: unknown[] } };
    assert.equal(failed.staged, false);
    assert.ok(failed.error);
    assert.ok((failed.validFields?.fields?.length ?? 0) >= 2);
    assert.equal(env.store.getState().queue.length, 0);

    // 2) Replace existing block WITH brand-new records + intentNote -> stages cleanly
    const ok1 = propose.run(
      {
        assetId,
        mode: "replace",
        replaceBlockIds: ["blk-1"],
        records: { rows: [{ no: "1", name: "스캐폴딩 엔진" }] },
        intentNote: "기존 요약을 1행 목록표로 교체 제안",
      },
      { callId: "c2", sessionId: null, signal: new AbortController().signal }
    ) as { staged: boolean; diffId: string; filled: number; mode: string };
    assert.equal(ok1.staged, true);
    assert.equal(ok1.mode, "replace");
    assert.equal(ok1.filled, 2);
    assert.equal(env.store.getState().queue.length, 1);

    // 3) workbenchPayload exposes active stagedChanges so agent knows diffId
    const wb = workbenchPayload(env) as { stagedChanges?: Array<{ diffId: string; mode?: string }> } | null;
    assert.equal(wb?.stagedChanges?.length, 1);
    assert.equal(wb?.stagedChanges?.[0].diffId, ok1.diffId);
    assert.equal(wb?.stagedChanges?.[0].mode, "replace");

    // 4) Follow-up conversational revision via revisionOf updates in-place (still 1 card!)
    const ok2 = propose.run(
      {
        assetId,
        mode: "insert",
        afterBlockId: "blk-1",
        replaceBlockIds: ["blk-1"],
        records: {
          rows: [
            { no: "1", name: "스캐폴딩 엔진" },
            { no: "2", name: "캔버스 통합 Diff" },
          ],
        },
        revisionOf: ok1.diffId,
        intentNote: "기존 요약은 유지하고 아래에 2행 목록표 추가",
      },
      { callId: "c3", sessionId: null, signal: new AbortController().signal }
    ) as { staged: boolean; revised: boolean; diffId: string; filled: number };
    assert.equal(ok2.staged, true);
    assert.equal(ok2.revised, true);
    assert.equal(ok2.diffId, ok1.diffId);
    assert.equal(ok2.filled, 4);
    assert.equal(env.store.getState().queue.length, 1);

    const stagedItem = env.store.getState().queue[0];
    assert.equal(stagedItem.targetKind, "asset-blocks");
    if (stagedItem.targetKind === "asset-blocks") {
      assert.equal(stagedItem.payload.mode, "insert");
      assert.equal(stagedItem.payload.intentNote, "기존 요약은 유지하고 아래에 2행 목록표 추가");
    }
  });
});
