import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import {
  getAssetDriver,
  rankAssetsForContext,
  setActiveAssetSchemaVersion,
} from "@vibe/vdoc-schema";
import { createV2AiWorkspace, type V2AiWorkspace } from "@vibe/ai-vault";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import {
  dispatchAssetHubCommand,
  getPinnedAssetIds,
  getRecentAssetIds,
  recordRecentAssetUse,
  requestOpenAguiAssetFunnel,
  subscribeAguiAssetFunnel,
  subscribeAssetHubCommand,
  togglePinnedAssetId,
} from "../model/assetActionBus";

const CTX: ToolRunContext = { callId: "asset-ux-1", sessionId: null, signal: new AbortController().signal };

function getTool(ai: V2AiWorkspace, name: string): WorkspaceTool<Record<string, unknown>> {
  const t = ai.runtime.tools.get(name);
  assert.ok(t, `tool ${name} must be registered`);
  return t as WorkspaceTool<Record<string, unknown>>;
}

describe("v2 Asset Hub UX · Context Ranking, AG-UI Funnel & Agent Asset Tools", () => {
  it("boosts legal prose asset (상고이유서) to top for legal prose bullets and keeps unrelated assets out of recommended", () => {
    const driver = getAssetDriver("v2");
    const catalog = driver.getSeeds();
    const result = rankAssetsForContext(catalog, driver, {
      activeSurface: "outline",
      contentSample: [
        "사건 2026다12345 부당이득금반환",
        "원고(상고인) 홍길동",
        "피고(피상고인) 김철수",
        "1. 상고이유 제1점",
        "가. 원심판결은 주택임대차보호법상 우선변제권에 관한 법리를 오해하여 판결에 영향을 미친 잘못이 있습니다.",
      ].join("\n"),
    });

    assert.ok(result.recommended.length >= 1, "must produce recommended candidates");
    assert.equal(result.recommended[0].asset.assetId, "asset-v2-legal-appeal-brief");
    assert.equal(result.lowConfidence, false);
    assert.ok(result.others.length >= 1, "unrelated assets must be relegated to others");
  });

  it("isolates grid/table assets to top when pipe-delimited outline or structured-table block is active", () => {
    const driver = getAssetDriver("v2");
    const v2Catalog = driver.getSeeds();
    const v2Result = rankAssetsForContext(v2Catalog, driver, {
      activeSurface: "vdoc",
      documentView: "a4",
      selectedBlockKind: "structured-table",
      contentSample: "항목 | 1분기 | 2분기 | 비고\n매출 | 120억 | 150억 | 성장",
    });

    assert.ok(v2Result.recommended.length >= 1);
    assert.equal(
      driver.summarizeForSelect(v2Result.recommended[0].asset).flowMode,
      "grid-form",
      "v2 grid-form asset must rank #1 for structured-table block"
    );
    assert.equal(
      v2Result.recommended.some((r) => r.asset.assetKind === "blog-section"),
      false,
      "mismatched blog-section assets must be isolated out of recommended"
    );
    assert.equal(
      v2Result.recommended.some((r) => r.asset.v2?.flowMode === "prose-form"),
      false,
      "mismatched prose-form assets must be isolated out of recommended"
    );

    // When pure element-level `table` assets exist in catalog, `assetKind === "table"` ranks #1
    const mixedCatalog = [...v2Catalog, ...getAssetDriver("v1").getSeeds()];
    const mixedResult = rankAssetsForContext(mixedCatalog, driver, {
      activeSurface: "vdoc",
      documentView: "a4",
      selectedBlockKind: "structured-table",
      contentSample: "항목 | 1분기 | 2분기 | 비고\n매출 | 120억 | 150억 | 성장",
    });
    assert.equal(mixedResult.recommended[0]?.asset.assetKind, "table");
  });

  it("marks empty plain outline as lowConfidence so UI surfaces AG-UI Funnel CTA", () => {
    const driver = getAssetDriver("v2");
    const catalog = driver.getSeeds();
    const result = rankAssetsForContext(catalog, driver, {
      activeSurface: "outline",
      contentSample: "",
    });

    assert.equal(result.lowConfidence, true);
  });

  it("separates pinned and recent assets into pinnedAndRecent bucket", () => {
    const driver = getAssetDriver("v2");
    const catalog = driver.getSeeds();
    const targetId = catalog[0].assetId;
    const result = rankAssetsForContext(catalog, driver, {
      activeSurface: "outline",
      contentSample: "사건 2026다12345 상고이유 제1점 원심판결 법리오해",
      pinnedIds: [targetId],
    });

    const inRecommended = result.recommended.some((r) => r.asset.assetId === targetId);
    const inPinned = result.pinnedAndRecent.some((r) => r.asset.assetId === targetId);
    assert.ok(inRecommended || inPinned, "pinned asset must appear in recommended or pinnedAndRecent");
  });

  it("registers assets.search and assets.stagePreview in V2AiWorkspace and triggers host preview callback", async () => {
    setActiveAssetSchemaVersion("v2");
    const rt = createIdeWorkbenchRuntime({ persist: false });
    const stagedCalls: string[] = [];
    const ai = createV2AiWorkspace({
      vault: rt.vault,
      vaultRootPath: "C:/vaults/demo",
      layout: rt.layout,
      explorer: rt.explorer,
      vdocUiBridge: rt.vdocUiBridge,
      openVaultFile: (p, mode) => rt.openVaultFile(p, mode ?? "current"),
      stageAssetPreview: (assetId) => {
        stagedCalls.push(assetId);
        return true;
      },
      getTextSelection: () => null,
      pushLog: () => undefined,
      storage: null,
      fetchFn: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    });
    ai.start();

    const searchTool = getTool(ai, "assets.search");
    const searchRes = (await searchTool.run({ query: "상고이유서 법률 문단", limit: 3 }, CTX)) as {
      schemaVersion: string;
      totalCatalogCount: number;
      candidates: Array<{ assetId: string; title: string; badges: string[] }>;
      aguiTokenHint: string | null;
    };
    assert.equal(searchRes.schemaVersion, "v2");
    assert.ok(searchRes.totalCatalogCount >= 1, "assets.search must return vault assets");
    assert.ok(Array.isArray(searchRes.candidates) && searchRes.candidates.length > 0);
    assert.ok(searchRes.aguiTokenHint?.startsWith("<<agui:asset-picks:"));

    const firstId = searchRes.candidates[0].assetId;
    const previewTool = getTool(ai, "assets.stagePreview");
    const previewRes = (await previewTool.run({ assetId: firstId }, CTX)) as {
      ok: boolean;
      assetId: string;
    };
    assert.equal(previewRes.ok, true);
    assert.equal(previewRes.assetId, firstId);
    assert.deepEqual(stagedCalls, [firstId]);

    const missingRes = (await previewTool.run({ assetId: "non-existent-asset-id" }, CTX)) as {
      ok: boolean;
      error?: string;
    };
    assert.equal(missingRes.ok, false);
    assert.ok(missingRes.error);

    ai.dispose();
    rt.dispose();
  });

  it("delivers cross-panel Asset Hub commands, AG-UI Funnel requests, and tracks pin/recent prefs", () => {
    const receivedCmds: string[] = [];
    const offCmd = subscribeAssetHubCommand((cmd) => {
      receivedCmds.push(`${cmd.type}:${"assetId" in cmd ? cmd.assetId : ""}`);
    });
    const delivered = dispatchAssetHubCommand({
      type: "stage-preview",
      assetId: "asset-v2-legal-appeal-brief",
    });
    assert.equal(delivered, true);
    assert.deepEqual(receivedCmds, ["stage-preview:asset-v2-legal-appeal-brief"]);
    offCmd();

    const funnelReqs: string[] = [];
    const offFunnel = subscribeAguiAssetFunnel((req) => {
      funnelReqs.push(req.sourcePath ?? "");
    });
    requestOpenAguiAssetFunnel({ sourcePath: "초안.outline" });
    assert.deepEqual(funnelReqs, ["초안.outline"]);
    offFunnel();

    const added = togglePinnedAssetId("test-pin-1");
    assert.equal(added, true);
    assert.ok(getPinnedAssetIds().includes("test-pin-1"));
    const removed = togglePinnedAssetId("test-pin-1");
    assert.equal(removed, false);

    recordRecentAssetUse("test-recent-1");
    assert.equal(getRecentAssetIds()[0], "test-recent-1");
  });
});
