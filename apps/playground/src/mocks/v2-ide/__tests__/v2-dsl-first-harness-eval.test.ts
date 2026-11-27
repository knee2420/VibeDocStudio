/**
 * DSL-First Harness Intelligence Upgrade — 8-KPI Quantitative Eval Suite
 *
 * 목표 달성 기준 (Baseline -> Upgraded Target: 8/8 PASS):
 *   KPI-1: Multi-column image DSL (`[img:...] | [img:...]` & `<<view:columns:strip>>`) -> `columns-grid` (plain) + lossless DSL round-trip
 *   KPI-2: Bare `<<view:section>>` -> 0 unwanted meta-heading blocks
 *   KPI-3: Inline-DSL `assets.propose({ dsl, ... })` -> validated by AssetV3 rules, 0 throwaway files in `.vibedoc/assets/v3/`
 *   KPI-4: Real Raya p1 opening refactor -> 1 single inline-DSL replace removes meta heading + 3 vertical photos, produces 2-col `columns-grid`
 *   KPI-5: `.outline` <-> `.vdoc` lossless round-trip sync on `asset-blocks` approval (preserves image `src` & memos, drops replaced nodes)
 *   KPI-6: `workspace.getState` `Structure` vs `Design` mode-aware `modeGuidance` + `outlineLink`, and `schema.inspect` DSL syntax exposure
 *   KPI-7: Standalone `image` block style renderer parity (`resolveImageBlockRenderStyle` honors `.vstyle` `media.maxHeight`)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import { createV2AiWorkspace, listAssetsV3, type V2AiWorkspace } from "@vibe/ai-vault";
import { compileBoundOutlineIntoVDoc } from "@vibe/outline-sync";
import { resolveImageBlockRenderStyle, type ResolvedStylePack } from "@vibe/style-core";
import {
  compileVsyntaxDslToAssetV3,
  instantiateAssetV3,
  renderAssetV3ToVsyntaxDsl,
  setActiveAssetSchemaVersion,
  type ColumnsGridBlockDef,
  type ImageBlockDef,
  type LayoutBlock,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import {
  parseOutlineJson,
  parseVDocJson,
  serializeOutlineJson,
  serializeVDocJson,
  toVaultUri,
  type OutlineFilePayload,
} from "@vibe/vault-formats";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const CTX: ToolRunContext = { callId: "dsl-eval-1", sessionId: null, signal: new AbortController().signal };

function getTool(ai: V2AiWorkspace, name: string): WorkspaceTool<Record<string, unknown>> {
  const t = ai.runtime.tools.get(name);
  assert.ok(t, `tool ${name} must be registered`);
  return t as WorkspaceTool<Record<string, unknown>>;
}

function setupRayaLinkedWorkspace() {
  setActiveAssetSchemaVersion("v2");
  const rt = createIdeWorkbenchRuntime({ persist: false });
  const outlinePath = "라야 부상.vproj/라야_부상_타임라인.outline";
  const docPath = "라야 부상.vproj/다비드 라야 부상 타임라인 및 현황 정리.vdoc";

  const outlinePayload: OutlineFilePayload = {
    id: "ol_raya_main",
    version: 1,
    title: "라야 부상 타임라인",
    defaultView: "bullets",
    updatedAt: "2026-11-26T00:00:00.000Z",
    rootNodes: [
      {
        id: "ol_doc_raya",
        text: "<<doc:blog>> 다비드 라야 부상 타임라인 및 현황 정리",
        isFolded: false,
        children: [
          {
            id: "ol_memo_keep",
            text: "작업 메모 :: 아스널 골키퍼 부상 취재 정리용",
            isFolded: false,
            children: [],
          },
          {
            id: "ol_sec_1",
            text: "<<view:section:opening>> 다비드 라야 부상 타임라인 및 현황 정리",
            isFolded: false,
            children: [
              {
                id: "ol_blk_title",
                text: "<<view:title:h1>> 다비드 라야 부상 타임라인 및 현황 정리",
                isFolded: false,
                children: [],
              },
              {
                id: "ol_blk_old_meta",
                text: "<<view:title:h2>> 오프닝 시각 자료",
                isFolded: false,
                children: [],
              },
              {
                id: "ol_blk_old_img1",
                text: "[img:다비드 라야 대표 사진 -> vdoc:resource/res_portrait]",
                isFolded: false,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
  rt.vault.write(outlinePath, serializeOutlineJson(outlinePayload));

  const base = parseVDocJson(rt.vault.read("01. Architecture/00. System-Proposal.vdoc"), "base");
  const rayaDoc: VDocDocument = {
    ...base,
    docId: "doc_raya_opening",
    title: "다비드 라야 부상 타임라인 및 현황 정리",
    viewId: "blog",
    genre: "blog",
    outlineRef: {
      outlinePath: toVaultUri(outlinePath),
      outlineId: "ol_raya_main",
      rootNodeId: "ol_doc_raya",
    },
    pages: [
      {
        ...base.pages[0],
        pageId: "sec_1_opening",
        pageLabel: "다비드 라야 부상 타임라인 및 현황 정리",
        sourceNodeId: "ol_sec_1",
        blocks: [
          {
            blockId: "blk_heading_1",
            kind: "heading",
            title: "제목",
            level: 1,
            slotId: "slot_h1",
            sourceNodeId: "ol_blk_title",
          } as LayoutBlock,
          {
            blockId: "asxbmv_b1",
            kind: "heading",
            title: "오프닝 시각 자료",
            level: 2,
            slotId: "slot_meta_h2",
            sourceNodeId: "ol_blk_old_meta",
          } as LayoutBlock,
          {
            blockId: "asxbmv_b3",
            kind: "image",
            title: "다비드 라야 대표 사진",
            src: "vdoc:resource/res_portrait",
            alt: "다비드 라야 대표 사진",
            styleKey: "strip",
            sourceNodeId: "ol_blk_old_img1",
          } as LayoutBlock,
          {
            blockId: "asxbmv_b4",
            kind: "image",
            title: "경기 중인 다비드 라야",
            src: "vdoc:resource/res_action",
            alt: "경기 중인 다비드 라야",
            styleKey: "strip",
          } as LayoutBlock,
          {
            blockId: "asxbmv_b5",
            kind: "image",
            title: "국내외 언론 보도 썸네일 그리드",
            src: "vdoc:resource/res_grid",
            alt: "국내외 언론 보도 썸네일 그리드",
            styleKey: "strip",
          } as LayoutBlock,
        ],
      },
    ],
    slots: {
      slot_h1: {
        slotId: "slot_h1",
        label: "제목",
        role: "editable-slot",
        content: "<p>다비드 라야 부상 타임라인 및 현황 정리</p>",
        backDataRefs: [],
      },
      slot_meta_h2: {
        slotId: "slot_meta_h2",
        label: "label:title",
        role: "editable-slot",
        content: "<p>오프닝 시각 자료</p>",
        backDataRefs: [],
      },
    },
  };
  rt.vault.write(docPath, serializeVDocJson(rayaDoc));

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
  return { rt, ai, docPath, outlinePath };
}

describe("DSL-First Harness Upgrade — 8-KPI Quantitative Eval", () => {
  it("KPI-1: compiles inline `[img] | [img]` and `<<view:columns:strip>>` to `columns-grid` (plain) with filled col.image and lossless DSL round-trip", () => {
    const inlineCompiled = compileVsyntaxDslToAssetV3(
      ["[img:{{action_photo|경기 중인 다비드 라야}}] | [img:{{news_grid|국내외 언론 보도 썸네일}}]"],
      { title: "2단 사진 스트립", scope: "element" }
    );
    assert.equal(inlineCompiled.validation.ok, true, "inline image split DSL must validate cleanly");
    assert.equal(inlineCompiled.asset.nodes.length, 1);
    assert.equal(inlineCompiled.asset.nodes[0].t, "grid");
    assert.equal(
      inlineCompiled.asset.nodes[0].t === "grid" ? inlineCompiled.asset.nodes[0].component : null,
      "columns",
      "[img] | [img] must compile to grid(component='columns'), NOT table"
    );

    const inst = instantiateAssetV3(inlineCompiled.asset, {
      action_photo: "vdoc:resource/res_action",
      news_grid: "vdoc:resource/res_grid",
    });
    assert.equal(inst.blocks.length, 1);
    assert.equal(inst.blocks[0].kind, "columns-grid");
    const grid = inst.blocks[0] as ColumnsGridBlockDef;
    assert.equal(grid.cardStyle, "plain");
    assert.equal(grid.columns?.length, 2);
    assert.equal(grid.columns?.[0]?.image?.src, "vdoc:resource/res_action");
    assert.equal(grid.columns?.[1]?.image?.src, "vdoc:resource/res_grid");
    assert.equal(grid.columns?.[0]?.blocks, undefined, "single-image column must use col.image, not nested wrapper blocks");

    // Round-trip renderAssetV3ToVsyntaxDsl (without cached asset.dsl)
    const stripped = { ...inlineCompiled.asset, dsl: undefined };
    const rendered = renderAssetV3ToVsyntaxDsl(stripped);
    const recompiled = compileVsyntaxDslToAssetV3(rendered, { title: "재컴파일", scope: "element" });
    assert.equal(recompiled.validation.ok, true);
    assert.equal(recompiled.asset.nodes[0].t === "grid" ? recompiled.asset.nodes[0].component : null, "columns");

    // Explicit `<<view:columns:strip>>` container syntax
    const explicitCols = compileVsyntaxDslToAssetV3(
      [
        "<<view:columns:strip>>",
        "  [img:{{left_img|좌측 사진}}]",
        "  [img:{{right_img|우측 사진}}]",
      ],
      { title: "명시적 다단 스트립", scope: "element" }
    );
    assert.equal(explicitCols.validation.ok, true);
    assert.equal(explicitCols.asset.nodes[0].t === "grid" ? explicitCols.asset.nodes[0].component : null, "columns");
    const explicitInst = instantiateAssetV3(explicitCols.asset, {
      left_img: "vdoc:resource/left",
      right_img: "vdoc:resource/right",
    });
    const explicitGrid = explicitInst.blocks[0] as ColumnsGridBlockDef;
    assert.equal(explicitGrid.kind, "columns-grid");
    assert.equal(explicitGrid.styleKey, "strip");
    assert.equal(explicitGrid.cardStyle, "plain");
    assert.equal(explicitGrid.columns?.[0]?.image?.src, "vdoc:resource/left");
    assert.equal(explicitGrid.columns?.[1]?.image?.src, "vdoc:resource/right");
  });

  it("KPI-2: bare `<<view:section>>` emits 0 unwanted meta-heading blocks", () => {
    const compiled = compileVsyntaxDslToAssetV3(
      [
        "<<view:section>>",
        "  [img:{{action_photo|경기 중인 다비드 라야}}] | [img:{{news_grid|언론 썸네일 그리드}}]",
      ],
      { title: "헤딩 없는 사진 섹션", scope: "section" }
    );
    assert.equal(compiled.validation.ok, true);
    const inst = instantiateAssetV3(compiled.asset, {
      action_photo: "vdoc:resource/res_action",
      news_grid: "vdoc:resource/res_grid",
    });
    assert.equal(
      inst.blocks.filter((b) => b.kind === "heading").length,
      0,
      "bare <<view:section>> must NOT fabricate a meta heading block"
    );
    assert.equal(inst.blocks.length, 1);
    assert.equal(inst.blocks[0].kind, "columns-grid");
  });

  it("KPI-3: inline-DSL `assets.propose({ dsl })` validates under AssetV3 rules with 0 throwaway `.vibedoc/assets/v3/` pollution", async () => {
    const { rt, ai } = setupRayaLinkedWorkspace();
    const propose = getTool(ai, "assets.propose");
    const beforeCount = listAssetsV3(rt.vault).length;

    const res = (await propose.run(
      {
        title: "오프닝 2단 사진 스트립",
        dsl: ["[img:{{action_photo|경기 중인 다비드 라야}}] | [img:{{news_grid|언론 보도 썸네일}}]"],
        mode: "replace",
        replaceBlockIds: ["asxbmv_b1", "asxbmv_b3", "asxbmv_b4", "asxbmv_b5"],
        records: {
          action_photo: "vdoc:resource/res_action",
          news_grid: "vdoc:resource/res_grid",
        },
        styleKey: "strip",
        intentNote: "불필요한 소제목과 세로 과다 사진 제거 후 2단 스트립으로 DSL 선행 재편",
      },
      CTX
    )) as { staged: boolean; diffId: string; inlineDsl?: boolean; assetSaved?: boolean; filled: number };

    assert.equal(res.staged, true);
    assert.equal(res.inlineDsl, true);
    assert.equal(res.assetSaved, false);
    assert.equal(res.filled, 2);
    assert.equal(
      listAssetsV3(rt.vault).length,
      beforeCount,
      "inline-DSL propose must NOT pollute `.vibedoc/assets/v3/` with throwaway asset files"
    );

    // Invalid inline DSL must be rejected by AssetV3 validation (rule enforcement intact)
    await assert.rejects(
      async () => {
        await propose.run(
          {
            title: "깨진 DSL",
            dsl: ["   "],
            mode: "insert",
          },
          CTX
        );
      },
      /사양|비어|DSL/i
    );

    ai.dispose();
    rt.dispose();
  });

  it("KPI-4: Raya opening end-to-end refactor replaces meta heading + 3 vertical photos with 1 plain 2-col image strip", async () => {
    const { rt, ai, docPath } = setupRayaLinkedWorkspace();
    const propose = getTool(ai, "assets.propose");
    const beforeAssets = listAssetsV3(rt.vault).length;

    const prop = (await propose.run(
      {
        title: "오프닝 2단 사진 스트립",
        dsl: ["[img:{{action_photo|경기 중인 다비드 라야}}] | [img:{{news_grid|국내외 언론 보도 썸네일}}]"],
        mode: "replace",
        replaceBlockIds: ["asxbmv_b1", "asxbmv_b3", "asxbmv_b4", "asxbmv_b5"],
        records: {
          action_photo: "vdoc:resource/res_action",
          news_grid: "vdoc:resource/res_grid",
        },
        styleKey: "strip",
      },
      CTX
    )) as { staged: boolean; diffId: string };

    assert.equal(prop.staged, true);
    ai.approve([prop.diffId]);

    const afterDoc = parseVDocJson(rt.vault.read(docPath), "after");
    const p1Blocks = afterDoc.pages[0].blocks;
    assert.equal(p1Blocks.length, 2, "p1 must contain only blk_heading_1 + 1 columns-grid strip");
    assert.equal(p1Blocks[0].blockId, "blk_heading_1");
    assert.equal(p1Blocks[1].kind, "columns-grid");
    const strip = p1Blocks[1] as ColumnsGridBlockDef;
    assert.equal(strip.cardStyle, "plain");
    assert.equal(strip.styleKey, "strip");
    assert.equal(strip.columns?.length, 2);
    assert.equal(strip.columns?.[0]?.image?.src, "vdoc:resource/res_action");
    assert.equal(strip.columns?.[1]?.image?.src, "vdoc:resource/res_grid");
    assert.equal(listAssetsV3(rt.vault).length, beforeAssets);

    ai.dispose();
    rt.dispose();
  });

  it("KPI-5: approving inline-DSL change on an outline-linked `.vdoc` syncs back to `.outline` and round-trips through recompile without losing image src or memos", async () => {
    const { rt, ai, docPath, outlinePath } = setupRayaLinkedWorkspace();
    const propose = getTool(ai, "assets.propose");

    const prop = (await propose.run(
      {
        title: "오프닝 2단 사진 스트립",
        dsl: ["[img:{{action_photo|경기 중인 다비드 라야}}] | [img:{{news_grid|국내외 언론 보도 썸네일}}]"],
        mode: "replace",
        replaceBlockIds: ["asxbmv_b1", "asxbmv_b3", "asxbmv_b4", "asxbmv_b5"],
        records: {
          action_photo: "vdoc:resource/res_action",
          news_grid: "vdoc:resource/res_grid",
        },
        styleKey: "strip",
      },
      CTX
    )) as { staged: boolean; diffId: string };

    ai.approve([prop.diffId]);

    // Check `.outline` updated cleanly: memo preserved, replaced meta/portrait nodes dropped, 2-col image strip with URLs written
    const syncedOutline = parseOutlineJson(rt.vault.read(outlinePath), "raya");
    const docNode = syncedOutline.rootNodes[0];
    assert.ok(
      docNode.children.some((c) => c.id === "ol_memo_keep"),
      "unrelated brainstorming memo inside <<doc>> must be preserved"
    );
    const sec1 = docNode.children.find((c) => c.id === "ol_sec_1");
    assert.ok(sec1, "section 1 node must remain");
    assert.equal(
      sec1.children.some((c) => c.id === "ol_blk_old_meta" || c.id === "ol_blk_old_img1"),
      false,
      "replaced block nodes must be removed from bound outline"
    );
    const stripNode = sec1.children.find((c) => c.text.includes("vdoc:resource/res_action") && c.text.includes("vdoc:resource/res_grid"));
    assert.ok(stripNode, "synced outline bullet must preserve BOTH image URLs in `[img:alt -> url] | [img:alt2 -> url2]` format");

    // Subsequent `.outline -> .vdoc` recompile must keep BOTH image URLs intact!
    compileBoundOutlineIntoVDoc(rt.vault, docPath);
    const recompiled = parseVDocJson(rt.vault.read(docPath), "recompiled");
    const recompiledStrip = recompiled.pages[0].blocks.find((b) => b.kind === "columns-grid") as ColumnsGridBlockDef | undefined;
    assert.ok(recompiledStrip, "recompiled .vdoc must still contain columns-grid");
    assert.equal(recompiledStrip.columns?.[0]?.image?.src, "vdoc:resource/res_action");
    assert.equal(recompiledStrip.columns?.[1]?.image?.src, "vdoc:resource/res_grid");

    ai.dispose();
    rt.dispose();
  });

  it("KPI-6: `workspace.getState` branches `modeGuidance` on `Structure` vs `Design` + reports `outlineLink`, and `schema.inspect` exposes new DSL syntax", async () => {
    const { rt, ai, docPath, outlinePath } = setupRayaLinkedWorkspace();
    const getState = getTool(ai, "workspace.getState");
    const inspect = getTool(ai, "schema.inspect");

    rt.vdocUiBridge.getState().setWorkMode(docPath, "Structure");
    const structState = (await getState.run({}, CTX)) as {
      workMode: string | null;
      outlineLink: { linked: boolean; outlinePath: string; rootNodeId: string } | null;
      modeGuidance: { mode: string; strategy: string; preferredTools: string[] } | null;
    };
    assert.equal(structState.workMode, "Structure");
    assert.equal(structState.outlineLink?.linked, true);
    assert.equal(structState.outlineLink?.outlinePath, outlinePath);
    assert.equal(structState.modeGuidance?.mode, "Structure");
    assert.ok(structState.modeGuidance?.preferredTools.includes("assets.propose"));

    rt.vdocUiBridge.getState().setWorkMode(docPath, "Design");
    const designState = (await getState.run({}, CTX)) as {
      workMode: string | null;
      modeGuidance: { mode: string; strategy: string; preferredTools: string[] } | null;
    };
    assert.equal(designState.workMode, "Design");
    assert.equal(designState.modeGuidance?.mode, "Design");
    assert.ok(designState.modeGuidance?.preferredTools.includes("style.apply"));
    assert.notEqual(structState.modeGuidance?.strategy, designState.modeGuidance?.strategy);

    const schemaRes = (await inspect.run({}, CTX)) as {
      assetSpec: {
        dslSyntax: {
          multiColumnMedia?: string;
          columnsContainer?: string;
          inlineDslPropose?: string;
        };
      };
    };
    assert.ok(schemaRes.assetSpec.dslSyntax.multiColumnMedia?.includes("[img:"));
    assert.ok(schemaRes.assetSpec.dslSyntax.columnsContainer?.includes("<<view:columns"));
    assert.ok(schemaRes.assetSpec.dslSyntax.inlineDslPropose?.includes("assets.propose"));

    ai.dispose();
    rt.dispose();
  });

  it("KPI-7: standalone `ImageBlockView` style resolver honors `.vstyle` `media.strip.maxHeight` (360px) while respecting explicit overrides", () => {
    const resolvedPack: ResolvedStylePack = {
      packId: "blog-pack",
      packName: "블로그 스타일 팩",
      version: "1.0.0",
      mode: "default",
      tokens: {},
      styles: {
        text: {},
        frame: {},
        table: {},
        pageChrome: {},
        media: {
          strip: {
            maxHeight: "360px",
            radius: "8px",
            imagePaddingY: "4px",
          },
          hero: {
            maxHeight: "480px",
            radius: "12px",
          },
        },
      },
      bindings: {},
    };

    const portraitBlock: ImageBlockDef = {
      blockId: "img_portrait",
      kind: "image",
      title: "세로 인물 사진",
      src: "vdoc:resource/res_portrait",
      alt: "다비드 라야",
      styleKey: "strip",
    };
    const resolvedStrip = resolveImageBlockRenderStyle(portraitBlock, resolvedPack);
    assert.equal(resolvedStrip.imgStyle.maxHeight, "360px", "standalone image with styleKey='strip' must inherit media.strip.maxHeight");
    assert.equal(resolvedStrip.imgStyle.borderRadius, "8px");

    const heroBlock: ImageBlockDef = {
      ...portraitBlock,
      styleKey: "hero",
    };
    const resolvedHero = resolveImageBlockRenderStyle(heroBlock, resolvedPack);
    assert.equal(resolvedHero.imgStyle.maxHeight, "480px", "standalone image must honor its own block.styleKey");

    const explicitOverride: ImageBlockDef = {
      ...portraitBlock,
      maxHeight: "220px",
    };
    const resolvedOverride = resolveImageBlockRenderStyle(explicitOverride, resolvedPack);
    assert.equal(resolvedOverride.imgStyle.maxHeight, "220px", "explicit block.maxHeight override must take precedence");
  });
});
