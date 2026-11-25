/**
 * 에셋 중심 Composer 도구 (docs/specs/v2-asset-centric-schema.md §2) — 실제 v2 작업 공간에서
 * 해체(capture · register) → 재편(apply) → 승인 → 문서, 새 데이터 놓기(instantiate)까지.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import { createV2AiWorkspace, listAssetsV3, type V2AiWorkspace } from "@vibe/ai-vault";
import { decomposeBlocks, scoreSkeleton, type AssetV3, type LayoutBlock, type VDocDocument, type VDocSlot } from "@vibe/vdoc-schema";
import { parseVDocJson, serializeVDocJson } from "@vibe/vault-formats";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..", "..", "..", "..");
const fx = JSON.parse(readFileSync(join(ROOT, "packages", "vdoc-schema", "tests", "fixtures", "asset-core-blocks.json"), "utf8")) as {
  rfp: { req: LayoutBlock[] };
  slots: Record<string, VDocSlot>;
};
const ECR = JSON.parse(readFileSync(join(ROOT, "evals", "asset-forms", "cases", "ecr-requirement-screenshot", "truth.json"), "utf8")) as AssetV3;
const TEMPLATE = "01. Architecture/00. System-Proposal.vdoc";
const DOC = "05. AI Eval/에셋 도구 시험.vdoc";
const CTX: ToolRunContext = { callId: "c1", sessionId: null, signal: new AbortController().signal };

function setup() {
  const rt = createIdeWorkbenchRuntime({ persist: false });
  const base = parseVDocJson(rt.vault.read(TEMPLATE), "t");
  const doc: VDocDocument = {
    ...base,
    docId: "asset-tools-test",
    title: "에셋 도구 시험",
    pages: [{ ...base.pages[0], blocks: structuredClone(fx.rfp.req) }],
    slots: { ...base.slots, ...structuredClone(fx.slots) },
  };
  rt.vault.write(DOC, serializeVDocJson(doc));
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    openVaultFile: (path, mode) => rt.openVaultFile(path, mode ?? "current"),
    getTextSelection: () => null,
    pushLog: () => undefined,
    storage: null,
    fetchFn: (async () => new Response("{}", { status: 200 })) as typeof fetch,
  });
  ai.start();
  rt.openVaultFile(DOC, "current");
  return { rt, ai };
}

const tool = (ai: V2AiWorkspace, name: string): WorkspaceTool<any> => {
  const t = ai.runtime.tools.get(name);
  assert.ok(t, `도구 ${name} 이 등록돼야 한다`);
  return t!;
};
const read = (rt: ReturnType<typeof setup>["rt"]) => parseVDocJson(rt.vault.read(DOC), "x");
const tables = (d: VDocDocument) => d.pages[0].blocks.filter((b): b is Extract<LayoutBlock, { kind: "structured-table" }> => b.kind === "structured-table");

describe("asset tools in the v2 workspace", () => {
  it("capture finds the same-shaped blocks and registers one asset", async () => {
    const { ai, rt } = setup();
    const ids = fx.rfp.req.map((b) => b.blockId);
    const res = (await tool(ai, "assets.capture").run({ blockIds: [ids[1]], title: "요구사항 표" }, CTX)) as { assetId: string; sameShapeBlocks: string[]; fields: unknown[] };
    assert.deepEqual([...res.sameShapeBlocks].sort(), [...ids].sort());
    assert.equal(res.fields.length, 6);
    assert.equal(listAssetsV3(rt.vault).length, 1);
    const again = (await tool(ai, "assets.capture").run({ blockIds: [ids[2]] }, CTX)) as { reused: boolean };
    assert.equal(again.reused, true, "같은 지문은 한 에셋");
  });

  it("register validates: a broken asset is refused with a fixable reason", async () => {
    const { ai } = setup();
    await assert.rejects(
      async () => tool(ai, "assets.register").run({ asset: { ...ECR, nodes: [{ t: "label", role: "title", text: "x", color: "#f00" }] } }, CTX),
      /사양에 맞지 않습니다[\s\S]*color/
    );
  });

  it("apply reshapes all four tables into the pasted form, keeps every value and cell, and approval writes the doc", async () => {
    const { ai, rt } = setup();
    const reg = (await tool(ai, "assets.register").run({ asset: ECR }, CTX)) as { assetId: string };
    const ids = fx.rfp.req.map((b) => b.blockId);
    const res = (await tool(ai, "assets.apply").run({ assetId: reg.assetId, blockIds: ids }, CTX)) as {
      staged: number;
      diffIds: string[];
      results: { preserved: { kept: number; total: number } }[];
    };
    assert.equal(res.staged, 4);
    for (const r of res.results) assert.equal(r.preserved.kept, r.preserved.total);
    const before = read(rt);
    assert.equal(tables(before)[0].columnWidths.length, 2, "승인 전에는 문서가 그대로");
    ai.approve(res.diffIds);
    const after = read(rt);
    const ts = tables(after);
    assert.equal(ts.length, 4);
    for (const t of ts) {
      assert.equal(t.assetRef?.assetId, reg.assetId, "인스턴스는 에셋을 가리킨다");
      const s = scoreSkeleton(ECR, { ...ECR, nodes: decomposeBlocks({ blocks: [t], slots: after.slots }).nodes });
      for (const k of ["gridShape", "cellKind", "span", "role", "labels"] as const) assert.equal(s.metrics[k], 1, k);
    }
    // 값 칸은 원래 칸 id 를 이어받는다 (근거 · 이력 보존)
    const oldValueSlots = fx.rfp.req.flatMap((b) => (b as Extract<LayoutBlock, { kind: "structured-table" }>).rows.map((r) => r.cells[1].slotId));
    const newSlots = new Set(ts.flatMap((t) => t.rows.flatMap((r) => r.cells.map((c) => c.slotId))));
    assert.equal(oldValueSlots.filter((s) => newSlots.has(s)).length, oldValueSlots.length);
    assert.equal(after.slots[oldValueSlots[1]].content, fx.slots[oldValueSlots[1]].content);
  });

  it("instantiate places new data with other labels; leftovers are reported, nothing is lost silently", async () => {
    const { ai, rt } = setup();
    const reg = (await tool(ai, "assets.register").run({ asset: ECR }, CTX)) as { assetId: string };
    const res = (await tool(ai, "assets.instantiate").run(
      {
        assetId: reg.assetId,
        afterBlockId: fx.rfp.req[3].blockId,
        items: [
          { label: "요구사항 분류", value: "보안 요구사항(SER)" },
          { label: "고유번호", value: "SER-003" },
          { label: "명칭", value: "접근 통제" },
          { label: "정의", value: "권한별 접근 제한" },
          { label: "세부내용", value: ["RBAC", "이중 인증"] },
          { label: "산출정보", value: "보안 설계서" },
          { label: "담당 부서", value: "보안팀" },
        ],
      },
      CTX
    )) as { diffId: string; filled: number; unmapped: string[] };
    assert.equal(res.filled, 6);
    assert.deepEqual(res.unmapped, ["담당 부서"]);
    ai.approve([res.diffId]);
    const after = read(rt);
    const ts = tables(after);
    assert.equal(ts.length, 5);
    assert.equal(ts[4].assetRef?.assetId, reg.assetId);
    const html = ts[4].rows.flatMap((r) => r.cells.map((c) => after.slots[c.slotId]?.content ?? "")).join(" ");
    assert.match(html, /<li>RBAC<\/li><li>이중 인증<\/li>/);
    assert.match(html, /SER-003/);
  });
});
