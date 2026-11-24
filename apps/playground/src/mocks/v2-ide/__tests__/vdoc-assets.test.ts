import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILTIN_VDOC_ASSETS,
  compileDirectiveSubtreeToVDoc,
  compileOutlineToVDoc,
  createElementSyntaxRegistry,
  extractAssetFromVDocBlock,
  extractAssetFromVDocPage,
  getBuiltinVDocAsset,
  instantiateAssetForInsert,
  isValidVDocAsset,
  validateCompiledAssetBlocks,
  type LayoutBlock,
  type OutlineSyntaxNode,
  type StructuredTableBlockDef,
  type VDocSlot,
} from "@vibe/vdoc-schema";
import { MemoryVaultAdapter } from "@vibe/vault-core";

import { applyAssetPreviewViaAi, parseAssetFromRefViaAi } from "@vibe/ai-vault";
import {
  assetDefaultVaultPath,
  collectVaultAssets,
  compileOutlineDslLinesToAssetBlocks,
  createDefaultVAssetJson,
  createDefaultVDoc,
  parseOutlineJson,
  parseVAssetJson,
  parseVDocJson,
  rewriteVDocPointersOnRename,
  saveAssetToVault,
  serializeOutlineJson,
  serializeVDocJson,
  toVaultUri,
} from "@vibe/vault-formats";
import { commitStagedAssetToOutlineAndVDoc, compileBoundOutlineIntoVDoc } from "@vibe/outline-sync";

describe("AI-Native Structural Assets (.vasset) & Compiler Regression Suite", () => {
  it("provides 6 valid extracted built-in assets (a4-page ×2, blog-section ×2, table ×2)", () => {
    assert.equal(BUILTIN_VDOC_ASSETS.length, 6);

    const byKind = new Map<string, number>();
    for (const asset of BUILTIN_VDOC_ASSETS) {
      assert.equal(isValidVDocAsset(asset), true, `invalid asset: ${asset.assetId}`);
      assert.ok(asset.structure.outlineDsl.length >= 3, `${asset.assetId} outlineDsl too short`);
      assert.ok(asset.structure.blocks.length >= 1, `${asset.assetId} has no blocks`);
      assert.ok(Object.keys(asset.structure.slots).length >= 1, `${asset.assetId} has no slots`);

      const validation = validateCompiledAssetBlocks(asset.structure.blocks, asset.structure.slots);
      assert.equal(
        validation.ok,
        true,
        `${asset.assetId} failed validation: ${validation.errors.join(", ")}`
      );
      byKind.set(asset.assetKind, (byKind.get(asset.assetKind) ?? 0) + 1);
    }

    assert.equal(byKind.get("a4-page"), 2);
    assert.equal(byKind.get("blog-section"), 2);
    assert.equal(byKind.get("table"), 2);

    // Rich-cell table asset must actually contain nested cell blocks (list + image/columns)
    const richTableAsset = getBuiltinVDocAsset("asset-table-category-rich-cell");
    assert.ok(richTableAsset);
    const tbl = richTableAsset.structure.blocks[0] as StructuredTableBlockDef;
    assert.equal(tbl.kind, "structured-table");
    const hasNested = tbl.rows.some((r) => r.cells.some((c) => (c.blocks?.length ?? 0) > 0));
    assert.equal(hasNested, true, "rich-cell table asset must preserve nested cell blocks");

    // Attach 5 performance cert must contain complex rowSpan/colSpan cells
    const attach5 = getBuiltinVDocAsset("asset-a4-attach5-performance-cert");
    assert.ok(attach5);
    const certTable = attach5.structure.blocks.find(
      (b): b is StructuredTableBlockDef => b.kind === "structured-table"
    );
    assert.ok(certTable, "attach5 must contain a structured-table");
    const hasSpan = certTable.rows.some((r) =>
      r.cells.some((c) => (c.rowSpan ?? 1) > 1 || (c.colSpan ?? 1) > 1)
    );
    assert.equal(hasSpan, true, "attach5 table must preserve rowSpan/colSpan merges");
  });

  it("captures block & page into .vasset, saves to Vault, and instantiates with collision-free IDs", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const richTableAsset = getBuiltinVDocAsset("asset-table-category-rich-cell")!;
    const srcBlock = richTableAsset.structure.blocks[0];

    const captured = extractAssetFromVDocBlock(srcBlock, richTableAsset.structure.slots, {
      title: "테스트 캡처 표",
      sourceRef: "vault://docs/sample.vdoc#blk-1",
    });
    assert.equal(isValidVDocAsset(captured), true);
    assert.equal(captured.assetKind, "table");

    const savedPath = saveAssetToVault(vault, captured);
    assert.equal(savedPath, assetDefaultVaultPath(captured.assetId));
    const listed = collectVaultAssets(vault);
    assert.ok(listed.some((e) => e.asset.assetId === captured.assetId && e.vaultPath === savedPath));

    const inst1 = instantiateAssetForInsert(captured, "s1");
    const inst2 = instantiateAssetForInsert(captured, "s2");
    assert.notEqual(inst1.blocks[0].blockId, inst2.blocks[0].blockId);
    assert.equal(inst1.blocks[0].assetRef?.assetId, captured.assetId);

    // Page capture round-trip
    const attach6 = getBuiltinVDocAsset("asset-a4-attach6-tech-plan")!;
    const pageCaptured = extractAssetFromVDocPage(
      {
        pageId: "p-1",
        pageNumber: 1,
        pageLabel: "붙임 6호 샘플",
        headerSlotId: "h",
        footerSlotId: "f",
        blocks: attach6.structure.blocks,
      },
      attach6.structure.slots,
      { assetKind: "a4-page" }
    );
    assert.equal(isValidVDocAsset(pageCaptured), true);
    assert.equal(pageCaptured.assetKind, "a4-page");
    assert.ok(pageCaptured.structure.blocks.length >= 4);

    // Default asset creation JSON parses cleanly
    const parsedDefault = parseVAssetJson(createDefaultVAssetJson("신규 커스텀 표", "table"));
    assert.ok(parsedDefault);
    assert.equal(parsedDefault.assetKind, "table");
  });

  it("projects 2-row user table data into rich-cell table & A4 performance cert via fallback AI pipeline", async () => {
    const richAsset = getBuiltinVDocAsset("asset-table-category-rich-cell")!;
    const res1 = await applyAssetPreviewViaAi({
      asset: richAsset,
      userOutlineDsl: ["<<view:table>> 사업 기본 정보", "  사업명 | 통합 AX 포털 사이트 구축", "  작성일 | 2025. 9. 19."],
      userPlainText: "사업명 | 통합 AX 포털 사이트 구축\n작성일 | 2025. 9. 19.",
      documentTitle: "AX 포털 추진 계획",
      targetScope: "block",
      mode: "transform",
      feedback: "비고 열도 참고해줘",
    });

    assert.equal(res1.ok, true);
    assert.ok(res1.blocks.length >= 1);
    const compiledTable = res1.blocks[0] as StructuredTableBlockDef;
    assert.equal(compiledTable.kind, "structured-table");
    const allSlotHtml = Object.values(res1.slots)
      .map((s) => s.content)
      .join(" ");
    assert.ok(allSlotHtml.includes("통합 AX 포털 사이트 구축"), "user data must be preserved");

    const attach5 = getBuiltinVDocAsset("asset-a4-attach5-performance-cert")!;
    const res2 = await applyAssetPreviewViaAi({
      asset: attach5,
      userOutlineDsl: ["사업명 | 통합 AX 포털", "발주처 | 행안부"],
      userPlainText: "사업명 | 통합 AX 포털\n발주처 | 행안부",
      documentTitle: "AX 실적 증명서",
      targetScope: "page",
      mode: "transform",
    });
    assert.equal(res2.ok, true);
    assert.ok(res2.blocks.length >= 3);

    // Ref extraction offline fallback produces valid asset
    const refExtracted = await parseAssetFromRefViaAi({
      refTitle: "공공 제안서 표지 레퍼런스",
      assetKind: "a4-page",
      blockSummaries: ["[title] 제안서", "[table] 사업 개요"],
      sourceRef: "vault://refs/proposal.ref",
    });
    assert.equal(isValidVDocAsset(refExtracted.asset), true);
    assert.ok(refExtracted.asset.structure.blocks.length >= 2);
  });

  it("rewrites block.assetRef.assetPath on Vault file/folder rename", () => {
    const oldAssetPath = "assets/custom-table.vasset";
    const newAssetPath = "library/renamed-table.vasset";
    const doc = createDefaultVDoc("에셋 참조 테스트", "a4");
    doc.pages[0].blocks[0] = {
      ...doc.pages[0].blocks[0],
      assetRef: {
        assetId: "asset-custom-1",
        assetPath: toVaultUri(oldAssetPath),
        appliedAt: "2026-11-23T09:00:00.000Z",
      },
    };

    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    vault.createFile(oldAssetPath, createDefaultVAssetJson("커스텀 표", "table"));
    vault.createFile("docs/target.vdoc", serializeVDocJson(doc));

    const report = rewriteVDocPointersOnRename(vault, oldAssetPath, newAssetPath);
    assert.equal(report.totalReplacements, 1);
    const updatedDoc = parseVDocJson(vault.read("docs/target.vdoc"), "target");
    assert.equal(updatedDoc.pages[0].blocks[0].assetRef?.assetPath, toVaultUri(newAssetPath));
  });

  it("keeps <<view:list>> + <<view:table>> directly under <<doc:a4>> on a single page & heals duplicate slotIds", () => {
    const registry = createElementSyntaxRegistry();
    const docRoot: OutlineSyntaxNode = {
      id: "doc-root",
      text: "<<doc:a4>> 테스트용으로 새로 만들어짐",
      children: [
        {
          id: "list-1",
          text: "<<view:list>>",
          children: [
            { id: "li-1", text: "테스트용 페이지", children: [] },
            { id: "li-2", text: "outline", children: [{ id: "li-2-1", text: "일단 만들었음", children: [] }] },
          ],
        },
        {
          id: "tbl-1",
          text: "<<view:table>> 사업 기본 정보",
          children: [
            { id: "r-1", text: "사업명 | 통합 AX 포털 사이트 구축", children: [] },
            { id: "r-2", text: "작성일 | 2025. 9. 19.", children: [] },
          ],
        },
      ],
    };

    const compiled = compileDirectiveSubtreeToVDoc([docRoot], "doc-root", { registry });
    assert.ok(compiled, "directive subtree must compile");
    assert.equal(compiled.pages.length, 1, "list + table without <<view:section>> must stay on 1 page");
    assert.equal(compiled.pages[0].blocks.length, 2);

    // Pre-corrupted duplicate slotId recovery check
    const corruptedPrev = structuredClone(compiled);
    const dupSlotId = "slot_corrupted_shared";
    corruptedPrev.pages[0].blocks = corruptedPrev.pages[0].blocks.map((b: LayoutBlock) =>
      b.kind === "text" ? { ...b, slotId: dupSlotId } : b
    );
    corruptedPrev.slots[dupSlotId] = {
      slotId: dupSlotId,
      label: "dup",
      role: "editable-slot",
      content: "<p>dup</p>",
      backDataRefs: [],
    };
    const recompiled = compileOutlineToVDoc(
      {
        version: 1,
        title: "Dup Recovery",
        rootNodes: [
          {
            id: "sec-1",
            text: "<<view:section>> 페이지 1",
            children: [
              { id: "t1", text: "첫 번째 문단", children: [] },
              { id: "t2", text: "두 번째 문단", children: [] },
            ],
          },
        ],
      },
      {
        registry,
        profileId: "a4",
        baseDoc: {
          ...corruptedPrev,
          pages: [
            {
              ...corruptedPrev.pages[0],
              sourceNodeId: "sec-1",
              blocks: [
                { blockId: "b1", kind: "text", title: "1", slotId: dupSlotId, sourceNodeId: "t1" } as LayoutBlock,
                { blockId: "b2", kind: "text", title: "2", slotId: dupSlotId, sourceNodeId: "t2" } as LayoutBlock,
              ],
            },
          ],
        },
      }
    );
    const b1 = recompiled.pages[0].blocks[0] as { slotId: string };
    const b2 = recompiled.pages[0].blocks[1] as { slotId: string };
    assert.notEqual(b1.slotId, b2.slotId, "recompiler must heal pre-existing duplicate slotIds");
    assert.ok(recompiled.slots[b1.slotId].content.includes("첫 번째 문단"));
    assert.ok(recompiled.slots[b2.slotId].content.includes("두 번째 문단"));

    // Validation gate auto-repairs missing slot
    const brokenSlotMap: Record<string, VDocSlot> = {};
    const rep = validateCompiledAssetBlocks(
      [{ blockId: "b-miss", kind: "text", title: "Missing", slotId: "slot-missing" }],
      brokenSlotMap
    );
    assert.equal(rep.ok, false);
    assert.ok(rep.sanitizedSlots["slot-missing"], "validator must repair missing slot");

    // DSL compilation helper compiles clean blocks
    const dslCompiled = compileOutlineDslLinesToAssetBlocks([
      "<<view:table:header>> 검증 표",
      "  구분 | 내용",
      "  항목 A | 값 A",
    ]);
    assert.equal(dslCompiled.ok, true);
    assert.equal(dslCompiled.blocks.length, 1);
  });

  it("atomically commits Staged AI Asset Preview into BOTH .outline tags AND .vdoc so restart/recompile persists", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "proj.vproj/master.outline";
    const vdocPath = "proj.vproj/target.vdoc";

    const outlinePayload = {
      version: 1,
      id: "outline-master-1",
      title: "마스터 아웃라인",
      defaultView: "bullets" as const,
      docBindings: {
        "doc-a4": {
          docId: "vdoc-target-1",
          vdocPath: toVaultUri(vdocPath),
          profileId: "a4",
        },
      },
      rootNodes: [
        {
          id: "doc-a4",
          text: "<<doc:a4>> 테스트용으로 새로 만들어짐",
          isFolded: false,
          children: [
            {
              id: "sec-1",
              text: "<<view:section>> 섹션 1",
              isFolded: false,
              children: [
                {
                  id: "old-list",
                  text: "<<view:list>>",
                  isFolded: false,
                  children: [{ id: "li-1", text: "테스트용 페이지", isFolded: false, children: [] }],
                },
                {
                  id: "old-table",
                  text: "<<view:table>> 사업 기본 정보",
                  isFolded: false,
                  children: [
                    { id: "r-1", text: "사업명 | 통합 AX 포털 사이트 구축", isFolded: false, children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const initialVDoc = createDefaultVDoc("테스트용으로 새로 만들어짐", "a4");
    initialVDoc.docId = "vdoc-target-1";
    initialVDoc.outlineRef = {
      outlinePath: toVaultUri(outlinePath),
      outlineId: "outline-master-1",
      rootNodeId: "doc-a4",
    };
    initialVDoc.pages[0].sourceNodeId = "sec-1";

    vault.createFile(outlinePath, serializeOutlineJson(outlinePayload));
    vault.createFile(vdocPath, serializeVDocJson(initialVDoc));

    const newDsl = [
      "[img:통합 AX 포털 시스템 아키텍처 대표컷]",
      "> 사업 기본 정보",
      "  사업명 :: 통합 AX 포털 사이트 구축",
      "  진행 단계 :: 테스트용 페이지",
      "! 여기서 새로 만든거: 핵심 구조 완성",
      "[img:outline - doc 스키마 연동] | [img:outline - vdoc 스키마 통일]",
    ];
    const compiledPreview = compileOutlineDslLinesToAssetBlocks(newDsl, {
      profileId: "a4",
      prefix: "spot_prev",
    });

    const commitRes = commitStagedAssetToOutlineAndVDoc(
      vault,
      vdocPath,
      {
        assetId: "asset-blog-spot-review",
        assetPath: "vault://.vibedoc/assets/asset-blog-spot-review.vasset",
        assetTitle: "블로그 스팟 리뷰 섹션",
        assetKind: "blog-section",
        targetScope: "page",
        mode: "transform",
        targetPageId: initialVDoc.pages[0].pageId,
        targetBlockId: null,
        linkedOutlinePath: outlinePath,
        linkedOutlineRootNodeId: "doc-a4",
        targetSourceNodeId: "sec-1",
        status: "ready",
        engine: "llm",
        rationale: "스팟 리뷰 뉘앙스로 재구성",
        suggestedOutlineDsl: newDsl,
        previewBlocks: compiledPreview.blocks,
        previewSlots: compiledPreview.slots,
        userOutlineDsl: [],
        userPlainText: "",
        feedbackHistory: [],
        sourceInputHash: "abcd1234",
      },
      { syncOutline: true }
    );

    assert.equal(commitRes.outlineUpdated, true);
    assert.equal(commitRes.outlinePath, outlinePath);
    assert.ok(commitRes.updatedVDoc);

    // 1. Verify `.outline` file on disk now holds the NEW tags (NOT old <<view:list>>/<<view:table>>)
    const updatedOutline = parseOutlineJson(vault.read(outlinePath), "master");
    const secNode = updatedOutline.rootNodes[0].children[0];
    const childTexts = secNode.children.map((c) => c.text);
    assert.equal(childTexts.some((t) => t.includes("<<view:list>>")), false, "old list tag must be replaced");
    assert.equal(childTexts.some((t) => t.includes("<<view:table>>")), false, "old table tag must be replaced");
    assert.ok(childTexts.some((t) => t.includes("[img:통합 AX 포털 시스템 아키텍처 대표컷]")));
    assert.ok(childTexts.some((t) => t.includes("> 사업 기본 정보")));
    assert.ok(childTexts.some((t) => t.includes("! 여기서 새로 만든거")));

    // 2. Verify `.vdoc` file on disk has assetRef + valid sourceNodeIds pointing to new outline nodes
    const savedVDoc = parseVDocJson(vault.read(vdocPath), "target");
    assert.ok(savedVDoc.pages[0].blocks.length >= 4);
    assert.equal(savedVDoc.pages[0].blocks[0].assetRef?.assetId, "asset-blog-spot-review");
    assert.ok(
      savedVDoc.pages[0].blocks.every((b) => typeof b.sourceNodeId === "string" && b.sourceNodeId.length > 0),
      "every compiled block must link back to new outline nodeId"
    );

    // 3. Simulate app restart + `[구조에서 컴파일]` -> structure MUST remain identical (no rollback to old tags!)
    compileBoundOutlineIntoVDoc(vault, vdocPath);
    const afterRecompile = parseVDocJson(vault.read(vdocPath), "target");
    assert.equal(afterRecompile.pages[0].blocks.length, savedVDoc.pages[0].blocks.length);
    assert.equal(afterRecompile.pages[0].blocks[0].kind, "image");
  });
});
