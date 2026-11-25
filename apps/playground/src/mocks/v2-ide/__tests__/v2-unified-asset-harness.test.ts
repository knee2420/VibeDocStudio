/**
 * Option A 정본 통합 E2E 테스트:
 * 1) `schema.inspect` 가 볼트 `.vibedoc/element-registry.vsyntax` 및 `.vstyle` 변경을 실시간 반영한다.
 * 2) `assets.register({ title, dsl, style })` 가 3줄 `.vsyntax` DSL 을 컴파일해 등록하고,
 *    에셋 허브(`collectVaultAssets`)와 AI Composer(`listAssetsV3` / `assets.search`)가 동일 정본을 공유한다.
 * 3) `{{category:text^|구분}}` (`mergeSame`) 반복 행 전개 시 10행이 동적 세로 병합(`rowSpan: 2,4,2,2`)된다.
 * 4) `assets.apply` 에서 컬럼 불일치로 보존값 0건일 때 빈 표 덮어쓰기를 차단하고 `validFields` 를 돌려준다.
 * 5) `ComposerSessionController` 가 `tool_call_progress` 후 스트림 종료 시 `drafting` 좀비 카드를 `error` 로 정리한다.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ComposerSessionController,
  createAiRuntime,
  type ToolRunContext,
  type WorkspaceTool,
} from "@vibe/ai-kernel";
import { createV2AiWorkspace, listAssetsV3, type V2AiWorkspace } from "@vibe/ai-vault";
import {
  getTableCellPlacements,
  setActiveAssetSchemaVersion,
  type LayoutBlock,
  type StructuredTableBlockDef,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import {
  resolveStylePack,
  resolveTableCellStyle,
  resolveTableGridStyle,
  resolveTextRoleStyle,
} from "@vibe/style-core";
import {
  STANDARD_SYNTAX_PATH,
  collectVaultAssets,
  collectVaultStyleEntries,
  companionStylePathForVDoc,
  parseStylePackJson,
  parseSyntaxSnapshot,
  parseVDocJson,
  resolveActiveStyleEntry,
  serializeSyntaxSnapshot,
  serializeVDocJson,
} from "@vibe/vault-formats";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const CTX: ToolRunContext = { callId: "unified-1", sessionId: null, signal: new AbortController().signal };

function setupWorkspace() {
  setActiveAssetSchemaVersion("v2");
  const rt = createIdeWorkbenchRuntime({ persist: false });
  const docPath = "05. AI Eval/통합-하네스-테스트.vdoc";
  const base = parseVDocJson(rt.vault.read("01. Architecture/00. System-Proposal.vdoc"), "base");
  const testDoc: VDocDocument = {
    ...base,
    docId: "unified-harness-doc",
    title: "통합 하네스 테스트 문서",
    pages: [
      {
        ...base.pages[0],
        blocks: [
          {
            blockId: "tbl_summary_orig",
            kind: "structured-table",
            title: "요구사항 분류 목록",
            columnWidths: ["25%", "15%", "15%", "45%"],
            rows: [
              {
                rowId: "r0",
                cells: [
                  { cellId: "c00", slotId: "s00", isHeader: true },
                  { cellId: "c01", slotId: "s01", isHeader: true },
                  { cellId: "c02", slotId: "s02", isHeader: true },
                  { cellId: "c03", slotId: "s03", isHeader: true },
                ],
              },
              {
                rowId: "r1",
                cells: [
                  { cellId: "c10", slotId: "s10" },
                  { cellId: "c11", slotId: "s11" },
                  { cellId: "c12", slotId: "s12" },
                  { cellId: "c13", slotId: "s13" },
                ],
              },
            ],
          } as LayoutBlock,
        ],
      },
    ],
    slots: {
      s00: { slotId: "s00", label: "h0", role: "editable-slot", content: "<p>요구사항 분류</p>", backDataRefs: [] },
      s01: { slotId: "s01", label: "h1", role: "editable-slot", content: "<p>식별자</p>", backDataRefs: [] },
      s02: { slotId: "s02", label: "h2", role: "editable-slot", content: "<p>요구사항 항목 수</p>", backDataRefs: [] },
      s03: { slotId: "s03", label: "h3", role: "editable-slot", content: "<p>분류별 주요 정의 및 범위</p>", backDataRefs: [] },
      s10: { slotId: "s10", label: "v0", role: "editable-slot", content: "<p>시스템 구성</p>", backDataRefs: [] },
      s11: { slotId: "s11", label: "v1", role: "editable-slot", content: "<p>ECR</p>", backDataRefs: [] },
      s12: { slotId: "s12", label: "v2", role: "editable-slot", content: "<p>2건</p>", backDataRefs: [] },
      s13: { slotId: "s13", label: "v3", role: "editable-slot", content: "<p>도메인 중립 스캐폴딩 엔진</p>", backDataRefs: [] },
    },
  };
  rt.vault.write(docPath, serializeVDocJson(testDoc));
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    openVaultFile: (p, mode) => rt.openVaultFile(p, mode ?? "current"),
    getTextSelection: () => null,
    pushLog: () => undefined,
    storage: null,
    fetchFn: (async () => new Response("{}", { status: 200 })) as typeof fetch,
  });
  ai.start();
  rt.openVaultFile(docPath, "current");
  return { rt, ai, docPath };
}

function getTool(ai: V2AiWorkspace, name: string): WorkspaceTool<Record<string, unknown>> {
  const t = ai.runtime.tools.get(name);
  assert.ok(t, `tool ${name} must be registered`);
  return t as WorkspaceTool<Record<string, unknown>>;
}

describe("Option A Unified Asset Schema & Harness (vsyntax -> AssetV3 -> Unified Hub/Composer)", () => {
  it("schema.inspect dynamically reflects live edits to .vibedoc/element-registry.vsyntax and active .vstyle", async () => {
    const { rt, ai } = setupWorkspace();
    const inspect = getTool(ai, "schema.inspect");

    // Mutate .vibedoc/element-registry.vsyntax as if user added a custom syntax rule in Settings UI
    const currentRaw = rt.vault.exists(STANDARD_SYNTAX_PATH)
      ? rt.vault.read(STANDARD_SYNTAX_PATH)
      : "";
    const snap = parseSyntaxSnapshot(currentRaw);
    const updatedSnap = {
      ...snap,
      elements: snap.elements.map((el) =>
        el.id === "table"
          ? {
              ...el,
              rules: [
                ...el.rules,
                {
                  id: "custom-badge-col",
                  symbol: "[@badge]",
                  primitive: "accent" as const,
                  position: "prefix" as const,
                  description: "사용자 커스텀 상태 배지 열",
                },
              ],
            }
          : el
      ),
    };
    rt.vault.write(STANDARD_SYNTAX_PATH, serializeSyntaxSnapshot(updatedSnap));

    const res = (await inspect.run({ elementId: "table" }, CTX)) as {
      elements: Array<{ id: string; rules: Array<{ id: string; symbol: string }> }>;
      assetSpec: { schema: string; dslSyntax: { dynamicVerticalMerge: string } };
      activeStylePack: { id: string } | null;
    };

    assert.equal(res.elements.length, 1);
    assert.equal(res.elements[0].id, "table");
    assert.ok(
      res.elements[0].rules.some((r) => r.id === "custom-badge-col" && r.symbol === "[@badge]"),
      "schema.inspect must expose live user-added .vsyntax rules immediately"
    );
    assert.equal(res.assetSpec.schema, "vibe-asset/3");
    assert.ok(res.assetSpec.dslSyntax.dynamicVerticalMerge.includes("^"));

    ai.dispose();
    rt.dispose();
  });

  it("registers compact .vsyntax DSL asset, exposes it in BOTH Asset Hub and AI Composer, and instantiates 10 rows with dynamic vertical merges", async () => {
    const { rt, ai, docPath } = setupWorkspace();
    const register = getTool(ai, "assets.register");
    const search = getTool(ai, "assets.search");
    const propose = getTool(ai, "assets.propose");

    const reg = (await register.run(
      {
        title: "요구사항 목록표 (vsyntax)",
        scope: "element",
        dsl: [
          "<<view:table>> 요구사항 목록표",
          "  순번 | 구분 | 요구사항 고유번호 | 요구사항 명",
          "  * {{seq:number|순번}} | {{category:text^|구분}} | {{req_id:text|요구사항 고유번호}} | {{req_name:text|요구사항 명}}",
        ],
        style: {
          selectors: ["table.column-header", "table.value"],
          tokens: {
            "table.column-header": { backgroundColor: "#e6ecf5", fontWeight: "bold", hAlign: "center" },
          },
        },
      },
      CTX
    )) as { ok: boolean; assetId: string; dsl: string[]; repeats: string[] };

    assert.equal(reg.ok, true);
    assert.deepEqual(reg.repeats, ["rows"]);
    assert.equal(reg.dsl.length, 3);

    // Unified catalog check: visible in BOTH listAssetsV3 (AI) AND collectVaultAssets (VDocAssetPanel / Gallery / assets.search)
    assert.ok(listAssetsV3(rt.vault).some((e) => e.asset.assetId === reg.assetId));
    const hubEntries = collectVaultAssets(rt.vault);
    assert.ok(
      hubEntries.some((e) => e.asset.assetId === reg.assetId),
      "AI-registered v3 asset must immediately appear in collectVaultAssets (Human Asset Hub)"
    );

    const searchRes = (await search.run({ query: "요구사항 목록표", limit: 5 }, CTX)) as {
      candidates: Array<{ assetId: string }>;
    };
    assert.ok(searchRes.candidates.some((c) => c.assetId === reg.assetId));

    // Propose 10 rows & approve -> verify exact vertical merges (rowSpan 2, 4, 2, 2)
    const prop = (await propose.run(
      {
        assetId: reg.assetId,
        mode: "replace",
        replaceBlockIds: ["tbl_summary_orig"],
        records: {
          rows: [
            { seq: "1", category: "시스템 구성(ECR)", req_id: "ECR-001", req_name: "도메인 중립 엔진" },
            { seq: "2", category: "시스템 구성(ECR)", req_id: "ECR-002", req_name: "확장 아키텍처" },
            { seq: "3", category: "기능 요구사항(SFR)", req_id: "SFR-001", req_name: "딥리딩 엔진" },
            { seq: "4", category: "기능 요구사항(SFR)", req_id: "SFR-002", req_name: "팩트 앵커링" },
            { seq: "5", category: "기능 요구사항(SFR)", req_id: "SFR-003", req_name: "근거 추적" },
            { seq: "6", category: "기능 요구사항(SFR)", req_id: "SFR-004", req_name: "스타일 팩" },
            { seq: "7", category: "성능 요구사항(PER)", req_id: "PER-001", req_name: "인덱싱 지연" },
            { seq: "8", category: "성능 요구사항(PER)", req_id: "PER-002", req_name: "렌더 응답" },
            { seq: "9", category: "품질 요구사항(QUR)", req_id: "QUR-001", req_name: "무결성 검증" },
            { seq: "10", category: "품질 요구사항(QUR)", req_id: "QUR-002", req_name: "감사 로그" },
          ],
        },
      },
      CTX
    )) as { staged: boolean; diffId: string; filled: number };

    assert.equal(prop.staged, true);
    assert.equal(prop.filled, 40);
    ai.approve([prop.diffId]);

    const afterDoc = parseVDocJson(rt.vault.read(docPath), "after");
    const tbl = afterDoc.pages[0].blocks[0] as StructuredTableBlockDef;
    assert.equal(tbl.rows.length, 11);
    const col1Merged = getTableCellPlacements(tbl).filter((p) => p.col === 1 && p.row >= 1);
    assert.deepEqual(
      col1Merged.map((p) => p.rowSpan),
      [2, 4, 2, 2],
      "구분 column must dynamically vertical-merge identical consecutive categories"
    );

    ai.dispose();
    rt.dispose();
  });

  it("blocks assets.apply from overwriting a non-empty table with an empty shell when 0 values match", async () => {
    const { rt, ai } = setupWorkspace();
    const register = getTool(ai, "assets.register");
    const apply = getTool(ai, "assets.apply");

    const reg = (await register.run(
      {
        title: "요구사항 목록표 (다른 열 구조)",
        scope: "element",
        dsl: [
          "<<view:table>> 요구사항 목록표",
          "  순번 | 구분 | 요구사항 고유번호 | 요구사항 명",
          "  * {{seq|순번}} | {{category^|구분}} | {{req_id|요구사항 고유번호}} | {{req_name|요구사항 명}}",
        ],
      },
      CTX
    )) as { assetId: string };

    const res = (await apply.run(
      { assetId: reg.assetId, blockIds: ["tbl_summary_orig"] },
      CTX
    )) as {
      staged: number;
      results: Array<{ staged?: boolean; error?: string; validFields?: { assetId: string } }>;
    };

    assert.equal(res.staged, 0, "must NOT stage an empty-shell replacement when preserved.kept === 0");
    assert.equal(res.results[0]?.staged, false);
    assert.match(res.results[0]?.error ?? "", /자동 이관된 값이 0건/);
    assert.equal(res.results[0]?.validFields?.assetId, reg.assetId);

    ai.dispose();
    rt.dispose();
  });

  it("exposes built-in v2 seeds to AI Composer assets.list and assets.propose via unified bridge", async () => {
    const { rt, ai } = setupWorkspace();
    const listTool = getTool(ai, "assets.list");
    const listed = (await listTool.run({}, CTX)) as { assets: Array<{ assetId: string }> };
    assert.ok(
      listed.assets.some((a) => a.assetId === "asset-v2-legal-appeal-brief"),
      "AI assets.list must also expose vault/builtin assets seamlessly"
    );

    ai.dispose();
    rt.dispose();
  });

  it("settles unfinished 'drafting' tool_call cards to 'error' when stream ends without a closing tool_call event", async () => {
    const sseBody = [
      `event: turn_start\ndata: ${JSON.stringify({ type: "turn_start", provider: "agy_cli", model: "gemini-3.8-flash" })}\n\n`,
      `event: tool_call_progress\ndata: ${JSON.stringify({ type: "tool_call_progress", name: "assets.register", chars: 3371 })}\n\n`,
      `event: status\ndata: ${JSON.stringify({ type: "status", state: "warning", message: "도구 호출 파싱 실패" })}\n\n`,
      `event: turn_done\ndata: ${JSON.stringify({ type: "turn_done", stopReason: "end_turn", durationMs: 1200 })}\n\n`,
    ].join("");

    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        return new Response(
          JSON.stringify({ sessionId: "sess-draft-test", provider: "agy_cli", model: "gemini-3.8-flash" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/messages")) {
        return new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const runtime = createAiRuntime({ baseUrl: "http://127.0.0.1:0/api/assistant", fetchFn });
    const controller = new ComposerSessionController(runtime);
    controller.setMode("auto-stage");

    await controller.send("표 양식을 등록해줘", []);

    const toolCards = controller.getState().items.filter((i) => i.kind === "tool_call");
    assert.equal(toolCards.length, 1);
    assert.equal(
      toolCards[0].status,
      "error",
      "unfinished drafting tool card must settle to error instead of freezing forever"
    );
    assert.match(toolCards[0].error ?? "", /3371자/);
  });

  it("supports end-to-end live style fidelity workflow: style.inspect -> style.upsertVariant -> style.apply without inline hex baking", async () => {
    const { rt, ai, docPath } = setupWorkspace();
    const styleInspect = getTool(ai, "style.inspect");
    const styleUpsert = getTool(ai, "style.upsertVariant");
    const styleApply = getTool(ai, "style.apply");

    // 1. Inspect available packs & orthogonal primitives
    const initial = (await styleInspect.run({}, CTX)) as {
      availablePacks: Array<{ id: string; tableVariants: string[] }>;
      orthogonalPrimitives: { table: { borders: string[] } };
    };
    assert.ok(initial.availablePacks.some((p) => p.id === "gov-rfp"));
    assert.ok(initial.orthogonalPrimitives.table.borders.includes("outerLeft"));

    // 2. Agent registers a custom open-sided list variant + heading prefix into vault .vstyle
    const upsertedTable = (await styleUpsert.run(
      {
        packId: "gov-rfp",
        category: "table",
        variantKey: "rfp-custom-list",
        target: "a4",
        definition: {
          borders: {
            outerTop: "2px solid #000000",
            outerBottom: "1.5px solid #000000",
            outerLeft: "none",
            outerRight: "none",
            headerBottom: "1.5px solid #000000",
            rowBottom: "0.75px solid #000000",
            vertical: "0.75px solid #000000",
          },
          cellPadding: "4px 6px",
          columnWidths: ["8%", "17%", "15%", "60%"],
          cells: {
            "column-header": { fill: "#dce6f1", color: "#000000", fontWeight: "700", align: "center", vAlign: "middle" },
            "value.item": { align: "center", vAlign: "middle", whiteSpace: "nowrap" },
            value: { align: "left", vAlign: "middle" },
          },
        },
        extensions: { customPrint: { bleedMm: 3 } },
      },
      CTX
    )) as { saved: boolean; vaultPath: string; documentBound: boolean };

    assert.equal(upsertedTable.saved, true);
    assert.equal(upsertedTable.documentBound, true);
    const expectedCompanionPath = companionStylePathForVDoc(docPath);
    assert.equal(
      upsertedTable.vaultPath,
      expectedCompanionPath,
      "must colocate a single companion .vstyle right beside the .vdoc instead of mutating shared packs"
    );
    assert.ok(rt.vault.exists(expectedCompanionPath));

    const upsertedText = (await styleUpsert.run(
      {
        packId: "gov-rfp",
        category: "text",
        variantKey: "square-title",
        definition: { prefix: "□ ", fontWeight: "700", align: "left", color: "#000000" },
      },
      CTX
    )) as { vaultPath: string };
    assert.equal(
      upsertedText.vaultPath,
      expectedCompanionPath,
      "subsequent style upserts must merge into the SAME single companion .vstyle file"
    );

    // 3. Apply variant + open cellRoleMap onto existing table block, clearing inline overrides
    const applied = (await styleApply.run(
      {
        blockIds: ["tbl_summary_orig"],
        styleKey: "rfp-custom-list",
        cellRoleMap: { "0": "value.item", "1": "value" },
        clearInlineCellStyles: true,
        syncColumnWidths: true,
      },
      CTX
    )) as { applied: boolean; updatedBlockIds: string[]; clearedInlineOverrides: boolean };

    assert.equal(applied.applied, true);
    assert.deepEqual(applied.updatedBlockIds, ["tbl_summary_orig"]);
    assert.equal(applied.clearedInlineOverrides, true);

    // 4. Verify live document + single companion .vstyle resolution (even if doc.styleRef were stripped)
    const afterDoc = parseVDocJson(rt.vault.read(docPath), "after");
    assert.equal(afterDoc.styleRef?.packPath, `vault://${expectedCompanionPath}`);
    const tbl = afterDoc.pages[0].blocks.find((b) => b.blockId === "tbl_summary_orig") as StructuredTableBlockDef;
    assert.equal(tbl.styleKey, "rfp-custom-list");
    assert.deepEqual(tbl.columnWidths, ["8%", "17%", "15%", "60%"]);
    assert.equal(tbl.borderRules, undefined, "inline borderRules cleared for live .vstyle binding");
    assert.equal(tbl.rows[1].cells[0].cellRole, "value.item");
    assert.equal(tbl.rows[1].cells[0].backgroundColor, undefined);

    const catalog = collectVaultStyleEntries(rt.vault);
    const autoDiscovered = resolveActiveStyleEntry(
      { ...afterDoc, styleRef: undefined },
      rt.vault,
      catalog,
      docPath
    );
    assert.equal(
      autoDiscovered?.vaultPath,
      expectedCompanionPath,
      "colocated companion .vstyle must be auto-discovered even if doc.styleRef is absent"
    );
    const savedPack = parseStylePackJson(rt.vault.read(expectedCompanionPath))!;
    const resolved = resolveStylePack(savedPack);
    const resolvedGrid = resolveTableGridStyle(resolved, "rfp-custom-list");
    assert.equal(resolvedGrid.borders.outerLeft, "none");
    assert.equal(resolvedGrid.borders.outerTop, "2px solid #000000");
    assert.equal(resolveTableCellStyle(resolvedGrid, "value.item").align, "center");
    assert.equal(resolveTextRoleStyle(resolved, "square-title").prefix, "□ ");
    assert.equal(resolved.extensions?.customPrint?.bleedMm, 3);

    // 5. Verify assets.propose automatically syncs columnWidths from the companion .vstyle
    const register = getTool(ai, "assets.register");
    const propose = getTool(ai, "assets.propose");
    const reg = (await register.run(
      {
        title: "동반 스타일 열비율 시험표",
        scope: "element",
        dsl: [
          "<<view:table:rfp-custom-list>> 시험표",
          "  순번 | 구분 | 코드 | 설명",
          "  * {value.item}{{seq|순번}} | {{cat|구분}} | {{code|코드}} | {{desc|설명}}",
        ],
      },
      CTX
    )) as { assetId: string };
    await propose.run(
      {
        assetId: reg.assetId,
        mode: "insert",
        records: { rows: [{ seq: "1", cat: "A", code: "C1", desc: "내용" }] },
      },
      CTX
    );
    const staged = ai.store.getState().queue.find((q) => q.targetKind === "asset-blocks");
    assert.ok(staged && staged.targetKind === "asset-blocks");
    const proposedTbl = staged.payload.blocks[0] as StructuredTableBlockDef;
    assert.deepEqual(
      proposedTbl.columnWidths,
      ["8%", "17%", "15%", "60%"],
      "assets.propose must inherit columnWidths from the active companion .vstyle variant"
    );

    ai.dispose();
    rt.dispose();
  });
});
