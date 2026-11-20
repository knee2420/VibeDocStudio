import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileOutlineToVDoc,
  compileTableOutlineNode,
  createDefaultRegistrySnapshot,
  createElementSyntaxRegistry,
  extractOutlineFromVDoc,
  type OutlineSyntaxDocument,
  type OutlineSyntaxNode,
  type VDocDocument,
  type VDocSlot,
} from "../src/index";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_VAULT_DIR = path.resolve(
  HERE,
  "../../../apps/playground/data/vaults/default-vault/문서 스키마 표준 정비 프로젝트"
);

describe("@vibe/vdoc-schema — CRUD ElementSyntaxRegistry & Bidirectional Compiler", () => {
  it("supports full CRUD lifecycle for Element definitions, Document Profiles, and JSON snapshots", () => {
    const registry = createElementSyntaxRegistry(createDefaultRegistrySnapshot("2026-11-20T00:00:00.000Z"));

    // Read built-in seeds
    assert.ok(registry.getElement("table"));
    assert.ok(registry.getElement("section"));
    assert.equal(registry.getProfile("blog")?.unitKind, "section");
    assert.equal(registry.getProfile("a4")?.unitKind, "page");

    // Create custom element (`faq`)
    registry.createElement({
      id: "faq",
      viewTag: "faq",
      version: "1.0.0",
      label: "FAQ 아코디언",
      description: "질문/답변 블록",
      allowedInViews: ["blog", "web"],
      defaultSkin: "default",
      fallbackPolicy: "plain-text",
      rules: [
        { id: "question", symbol: "Q:", primitive: "frame", position: "prefix", description: "질문" },
        { id: "answer", symbol: "A:", primitive: "stack", position: "prefix", description: "답변" },
      ],
    });
    assert.equal(registry.getElementByViewTag("faq")?.label, "FAQ 아코디언");

    // Update symbol dynamically via CRUD (`::` -> `=>`)
    const sectionDef = registry.getElement("section")!;
    registry.updateElement("section", {
      version: "1.1.0",
      rules: sectionDef.rules.map((r) => (r.id === "kv-meta" ? { ...r, symbol: "=>" } : r)),
    });
    assert.equal(registry.resolveSymbol("section", "kv-meta", "::"), "=>");

    // Export / Import JSON snapshot round-trip
    const json = JSON.stringify(registry.exportSnapshot());
    const restored = createElementSyntaxRegistry(json);
    assert.equal(restored.getElement("section")?.version, "1.1.0");
    assert.equal(restored.resolveSymbol("section", "kv-meta", "::"), "=>");
    assert.ok(restored.getElement("faq"));

    // Delete element
    assert.equal(restored.deleteElement("faq"), true);
    assert.equal(restored.getElement("faq"), undefined);
  });

  it("respects CRUD-modified syntax symbols immediately during compilation and falls back safely when deleted", () => {
    const registry = createElementSyntaxRegistry();
    const sec = registry.getElement("section")!;
    registry.updateElement("section", {
      rules: sec.rules.map((r) => (r.id === "kv-meta" ? { ...r, symbol: "=>" } : r)),
    });

    const outline: OutlineSyntaxDocument = {
      title: "커스텀 기호 테스트",
      rootNodes: [
        {
          id: "s1",
          text: "<<view:section:spot>> 테스트 스팟",
          children: [
            {
              id: "f1",
              text: "> 테스트 장소",
              children: [
                { id: "k1", text: "입장료 => 무료", children: [] },
                { id: "k2", text: "시간 => 09:00~18:00", children: [] },
              ],
            },
            {
              id: "u1",
              text: "<<view:unknown_widget>> 미등록 위젯",
              children: [{ id: "u2", text: "안전 폴백 본문", children: [] }],
            },
          ],
        },
      ],
    };

    const doc = compileOutlineToVDoc(outline, { registry, profileId: "blog" });
    assert.equal(doc.pages.length, 1);
    const infoBlk = doc.pages[0].blocks[0];
    assert.equal(infoBlk.kind, "callout-box");
    if (infoBlk.kind === "callout-box") {
      assert.equal(infoBlk.variant, "info-frame");
      assert.deepEqual(infoBlk.kvItems, [
        { key: "입장료", value: "무료" },
        { key: "시간", value: "09:00~18:00" },
      ]);
    }
    // Unknown view safely falls back to plain text instead of throwing
    assert.equal(doc.pages[0].blocks[1].kind, "text");

    // Deleting `section` definition still compiles without crashing (safe plain-text fallback)
    registry.deleteElement("section");
    const fallbackDoc = compileOutlineToVDoc(outline, { registry, profileId: "blog" });
    assert.equal(fallbackDoc.pages.length, 1);
    assert.ok(fallbackDoc.pages[0].blocks.every((b) => b.kind === "text"));
  });

  it("compiles Korean complex <<view:table>> with tree rowspan, auto-colspan stretch, and explicit merges", () => {
    const registry = createElementSyntaxRegistry();
    const slots: Record<string, VDocSlot> = {};
    const tableNode: OutlineSyntaxNode = {
      id: "t0",
      text: "<<view:table>> 응답자 기본 정보 및 참석 여부 표",
      children: [
        {
          id: "t1",
          text: "기본 인적 사항",
          children: [
            { id: "t1_1", text: "성명 | [-]", children: [] },
            { id: "t1_2", text: "파트 | [-] | 직급 | [-]", children: [] },
            { id: "t1_3", text: "차량 지참 여부 | [-]", children: [] },
          ],
        },
        { id: "t2", text: "참석 구분 | □ 참석   □ 불참(사유)   □ 현장 설비 필수 대기·교대", children: [] },
        { id: "t3", text: "불참 사유(불참자만) | [-]", children: [] },
      ],
    };

    const tbl = compileTableOutlineNode(tableNode, slots, registry, "form");
    assert.equal(tbl.rows.length, 5);
    assert.equal(tbl.columnWidths.length, 5);

    // Row 0: `기본 인적 사항` (rowSpan=3) | `성명` (header) | empty (colSpan=3)
    assert.equal(tbl.rows[0].cells[0].rowSpan, 3);
    assert.equal(tbl.rows[0].cells[0].isHeader, true);
    assert.equal(tbl.rows[0].cells[1].isHeader, true);
    assert.equal(tbl.rows[0].cells[2].colSpan, 3);

    // Row 1: `파트` (header) | empty | `직급` (header) | empty
    assert.equal(tbl.rows[1].cells.length, 4);
    assert.equal(tbl.rows[1].cells[0].isHeader, true);
    assert.equal(tbl.rows[1].cells[2].isHeader, true);

    // Row 3: `참석 구분` (header) | options (colSpan=4)
    assert.equal(tbl.rows[3].cells[1].colSpan, 4);

    // Explicit `[<]` and `[^]` merge test
    const mergeNode: OutlineSyntaxNode = {
      id: "m0",
      text: "<<view:table>> 병합 테스트",
      children: [
        { id: "m1", text: "A | B | [<]", children: [] },
        { id: "m2", text: "[^] | C | D", children: [] },
      ],
    };
    const merged = compileTableOutlineNode(mergeNode, slots, registry, "merge");
    assert.equal(merged.rows[0].cells[0].rowSpan, 2);
    assert.equal(merged.rows[0].cells[1].colSpan, 2);
  });

  it("compiles nested <<view:table>> inside <<view:section>> and supports bidirectional round-trip extraction", () => {
    const registry = createElementSyntaxRegistry();
    const outline: OutlineSyntaxDocument = {
      title: "복합 블로그 포스트",
      rootNodes: [
        {
          id: "sec1",
          text: "<<view:section:spot>> 비교 섹션",
          children: [
            { id: "p1", text: "핵심은 ==가격 비교== 입니다.", children: [] },
            { id: "g1", text: "[img:2:좌측 전경] | [img:1:우측 세로]", children: [] },
            { id: "c1", text: "[cta:할인 예약하기 -> https://example.com/deal]", children: [] },
            {
              id: "tb1",
              text: "<<view:table>> 티켓 비교표",
              children: [
                { id: "r1", text: "구분 | 가격", children: [] },
                { id: "r2", text: "현장 | 50달러", children: [] },
              ],
            },
          ],
        },
      ],
    };

    const doc = compileOutlineToVDoc(outline, { registry, profileId: "blog" });
    assert.equal(doc.viewId, "blog");
    assert.equal(doc.pages[0].unitKind, "section");
    assert.equal(doc.pages[0].sectionRole, "spot");
    assert.deepEqual(
      doc.pages[0].blocks.map((b) => b.kind),
      ["text", "columns-grid", "link-card", "structured-table"]
    );
    const grid = doc.pages[0].blocks[1];
    if (grid.kind === "columns-grid") {
      assert.deepEqual(grid.widths, ["2fr", "1fr"]);
    }

    // Reverse extraction preserves all section expressions
    const extracted = extractOutlineFromVDoc(doc, registry);
    const secNode = extracted.rootNodes.find((n) => n.text.startsWith("<<view:section:spot>>"));
    assert.ok(secNode);
    assert.ok(secNode.children?.some((c) => c.text.includes("[img:좌측 전경] | [img:우측 세로]")));
    assert.ok(secNode.children?.some((c) => c.text.includes("[cta:할인 예약하기 -> https://example.com/deal]")));
    assert.ok(secNode.children?.some((c) => c.text.startsWith("<<view:table>>")));
  });

  it("verifies the real default-vault Las Vegas schema standardization project artifacts end-to-end", () => {
    const regPath = path.join(PROJECT_VAULT_DIR, "schema", "element-registry.vsyntax");
    const outlinePath = path.join(PROJECT_VAULT_DIR, "01. 라스베가스_블로그_구조_추출.outline");
    const vdocPath = path.join(PROJECT_VAULT_DIR, "02. 미국_여행_라스베가스_스피어_하이롤러.vdoc");

    assert.equal(fs.existsSync(regPath), true, "element-registry.vsyntax must exist");
    assert.equal(fs.existsSync(outlinePath), true, "extracted .outline must exist");
    assert.equal(fs.existsSync(vdocPath), true, "compiled blog .vdoc must exist");

    const registry = createElementSyntaxRegistry(fs.readFileSync(regPath, "utf-8"));
    const outline = JSON.parse(fs.readFileSync(outlinePath, "utf-8")) as OutlineSyntaxDocument;
    const savedVDoc = JSON.parse(fs.readFileSync(vdocPath, "utf-8")) as VDocDocument;

    assert.equal(savedVDoc.viewId, "blog");
    assert.equal(savedVDoc.surface?.kind, "scroll");
    assert.equal(savedVDoc.surface?.width, 720);
    assert.equal(savedVDoc.schemaRef?.profileId, "blog");
    assert.ok(savedVDoc.sourceRef?.startsWith("vault://"));
    assert.equal(savedVDoc.pages.length, 8);
    assert.ok(savedVDoc.pages.every((p) => p.unitKind === "section"));

    // Verify all key blog expressions exist in the compiled Las Vegas .vdoc
    const allBlocks = savedVDoc.pages.flatMap((p) => p.blocks);
    assert.equal(
      allBlocks.filter((b) => b.kind === "callout-box" && b.variant === "info-frame").length,
      5,
      "5 Las Vegas spots must compile as info-frame blocks"
    );
    assert.equal(
      allBlocks.filter((b) => b.kind === "link-card" && b.variant === "cta").length,
      2,
      "2 Klook discount links must compile as CTA blocks"
    );
    assert.equal(
      allBlocks.filter((b) => b.kind === "columns-grid").length,
      7,
      "7 2-up photo strips must compile as columns-grid blocks"
    );
    assert.ok(
      allBlocks.some((b) => b.kind === "callout-box" && b.variant === "disclosure"),
      "partners disclosure badge must exist"
    );
    assert.ok(
      allBlocks.some((b) => b.kind === "callout-box" && b.variant === "quote"),
      "hero centered quote must exist"
    );
    assert.equal(
      allBlocks.filter((b) => b.kind === "callout-box" && b.variant === "accent-bar").length,
      2,
      "travel tip + photo point must compile as accent-bar blocks"
    );

    // Recompiling from the vault outline using the vault registry produces the exact same 8-section structure
    const recompiled = compileOutlineToVDoc(outline, { registry, profileId: "blog" });
    assert.equal(recompiled.pages.length, savedVDoc.pages.length);
    assert.deepEqual(
      recompiled.pages.map((p) => p.blocks.map((b) => b.kind)),
      savedVDoc.pages.map((p) => p.blocks.map((b) => b.kind))
    );
  });
});
