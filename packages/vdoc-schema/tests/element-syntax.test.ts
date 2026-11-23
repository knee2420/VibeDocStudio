import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileDirectiveSubtreeToVDoc,
  compileOutlineToVDoc,
  compilePageSceneGraph,
  compileTableOutlineNode,
  createDefaultRegistrySnapshot,
  createElementSyntaxRegistry,
  extractBoundOutlineFromVDoc,
  extractOutlineAssets,
  extractOutlineFromVDoc,
  findBlock,
  findSceneNodeAncestorIds,
  mapBlock,
  parseOutlineDirective,
  removeBlock,
  resolveActiveDirectiveContext,
  scanOutlineDirectives,
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
    const regPath = path.resolve(PROJECT_VAULT_DIR, "..", ".vibedoc", "element-registry.vsyntax");
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

  it("scans <<doc>>, <<view>>, <<asset>>, <<template>> directives at arbitrary depth and isolates brainstorming branches", () => {
    const masterNodes: OutlineSyntaxNode[] = [
      {
        id: "n-memo",
        text: "팀장님 초기 리퀘스트",
        children: [{ id: "n-todo", text: "Todo: 장소 확정", children: [] }],
      },
      {
        id: "n-research",
        text: "후보지 리서치",
        children: [
          {
            id: "n-ski",
            text: "스키 리조트",
            children: [
              {
                id: "n-deep-table",
                text: "스키 후보 비교 <<view:table @table-grouped-compare>>",
                children: [
                  { id: "r1", text: "리조트 | 1인 비용 | 비고", children: [] },
                  { id: "r2", text: "용평 | 25만원 | 스키장 인접", children: [] },
                ],
              },
              {
                id: "n-deep-list",
                text: "<<view:list>> 스키 준비물",
                children: [
                  { id: "l1", text: "방한 장갑", children: [] },
                  { id: "l2", text: "고글", children: [] },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "n-doc-blog",
        text: "<<doc:blog>> 2026 하반기 워크샵 후기",
        children: [
          {
            id: "n-sec-1",
            text: "<<view:section:hero>> 도입부",
            children: [
              { id: "n-p1", text: "올해 워크샵은 ==강원도== 로 다녀왔습니다.", children: [] },
              { id: "n-img1", text: "[img:단체사진]", children: [] },
            ],
          },
        ],
      },
      {
        id: "n-assets",
        text: "에셋 라이브러리",
        children: [
          {
            id: "n-asset-tbl",
            text: "1. 다중 행 병합 비교표 <<asset:table-grouped-compare>>",
            children: [
              { id: "a-vis", text: "시각스타일:: 세로선 제거, 굵은 상단 테두리, #ecfdf5", children: [] },
              {
                id: "a-tpl",
                text: "<<template:table>>",
                children: [{ id: "a-r1", text: "항목 | 값", children: [] }],
              },
            ],
          },
        ],
      },
    ];

    // Parse directive anywhere in string
    const parsedAsset = parseOutlineDirective("1. 다중 행 병합 비교표 <<asset:table-grouped-compare>>");
    assert.equal(parsedAsset?.kind, "asset");
    assert.equal(parsedAsset?.target, "table-grouped-compare");
    assert.equal(parsedAsset?.label, "1. 다중 행 병합 비교표");

    const parsedTable = parseOutlineDirective("스키 후보 비교 <<view:table @table-grouped-compare>>");
    assert.equal(parsedTable?.kind, "view");
    assert.equal(parsedTable?.target, "table");
    assert.equal(parsedTable?.assetHint, "table-grouped-compare");
    assert.equal(parsedTable?.label, "스키 후보 비교");

    // Scan at any depth
    const scanned = scanOutlineDirectives(masterNodes);
    assert.equal(scanned.length, 6);
    assert.equal(scanned.find((s) => s.nodeId === "n-deep-table")?.depth, 2);
    assert.equal(scanned.find((s) => s.nodeId === "n-sec-1")?.parentDocNodeId, "n-doc-blog");

    // Active directive resolution by cursor
    assert.equal(resolveActiveDirectiveContext(masterNodes, "n-todo").effectiveTarget, null);
    assert.equal(
      resolveActiveDirectiveContext(masterNodes, "r2").effectiveTarget?.nodeId,
      "n-deep-table"
    );
    assert.equal(
      resolveActiveDirectiveContext(masterNodes, "n-p1").effectiveTarget?.nodeId,
      "n-doc-blog"
    );

    // Inline asset extraction
    const assets = extractOutlineAssets(masterNodes);
    assert.ok(assets["table-grouped-compare"]);
    assert.equal(assets["table-grouped-compare"].targetViewTag, "table");

    // Compile depth-2 <<view:table @table-grouped-compare>> cleanly with asset visual preset
    const tableDoc = compileDirectiveSubtreeToVDoc(masterNodes, "n-deep-table");
    assert.ok(tableDoc);
    assert.equal(tableDoc.pages.length, 1);
    const tblBlk = tableDoc.pages[0].blocks[0];
    assert.equal(tblBlk.kind, "structured-table");
    if (tblBlk.kind === "structured-table") {
      assert.equal(tblBlk.borderRules?.vertical, "none");
      assert.equal(tblBlk.borderRules?.headerTop, "2px solid #1e293b");
      assert.equal(tblBlk.headerStyle?.bg, "#ecfdf5");
      assert.equal(tblBlk.sourceNodeId, "n-deep-table");
    }

    // Compile depth-2 <<view:list>>
    const listDoc = compileDirectiveSubtreeToVDoc(masterNodes, "n-deep-list");
    assert.ok(listDoc);
    const listBlk = listDoc.pages[0].blocks[0];
    assert.equal(listBlk.kind, "text");
    if (listBlk.kind === "text") {
      assert.ok(listDoc.slots[listBlk.slotId].content.includes("<ul>"));
      assert.ok(listDoc.slots[listBlk.slotId].content.includes("방한 장갑"));
    }

    // Compile <<doc:blog>> ignoring unrelated Todo & research branches
    const blogDoc = compileDirectiveSubtreeToVDoc(masterNodes, "n-doc-blog", {
      assetResolver: ({ label }) => (label === "단체사진" ? "https://cdn.example.com/group.jpg" : undefined),
    });
    assert.ok(blogDoc);
    assert.equal(blogDoc.viewId, "blog");
    assert.equal(blogDoc.title, "2026 하반기 워크샵 후기");
    assert.equal(blogDoc.pages.length, 1);
    assert.equal(blogDoc.pages[0].sourceNodeId, "n-sec-1");
    const imgBlk = blogDoc.pages[0].blocks[1];
    assert.equal(imgBlk.kind, "image");
    if (imgBlk.kind === "image") {
      assert.equal(imgBlk.src, "https://cdn.example.com/group.jpg");
      assert.equal(imgBlk.sourceNodeId, "n-img1");
    }
  });

  it("extracts bound outline from rich .vdoc and preserves all visual design properties on non-destructive recompile", () => {
    const registry = createElementSyntaxRegistry();
    const original: VDocDocument = {
      version: "1.0.0",
      docId: "vdoc-rich-blog",
      title: "여행 블로그 원본",
      viewId: "blog",
      surface: { kind: "scroll", width: 720 },
      genre: "blog",
      status: "Review",
      updatedAt: "2026-11-23T00:00:00.000Z",
      styleRef: { packId: "naver-travel-blog", packPath: "vault://styles/blog.vstyle.json", mode: "warm" },
      variables: { location: "강원도" },
      pages: [
        {
          pageId: "sec-hero",
          pageNumber: 1,
          pageLabel: "인트로",
          unitKind: "section",
          sectionRole: "hero",
          headerSlotId: "hdr-1",
          footerSlotId: "ftr-1",
          hideHeaderFooter: true,
          blocks: [
            {
              blockId: "blk-img",
              kind: "image",
              title: "대표 전경",
              src: "https://cdn.example.com/hero.jpg",
              alt: "대표 전경",
              width: "85%",
              objectFit: "contain",
              align: "center",
              locked: true,
            },
            {
              blockId: "blk-grid",
              kind: "columns-grid",
              title: "2장 스트립",
              widths: ["2fr", "1fr"],
              gap: 12,
              cardStyle: "plain",
              columns: [
                { image: { src: "https://cdn.example.com/a.jpg", alt: "좌측 컷", objectFit: "cover" } },
                { image: { src: "https://cdn.example.com/b.jpg", alt: "우측 컷", objectFit: "cover" } },
              ],
            },
            {
              blockId: "blk-tip",
              kind: "callout-box",
              title: "포인트",
              slotId: "slot-tip",
              variant: "accent-bar",
              accentColor: "sky",
              align: "left",
            },
          ],
        },
      ],
      slots: {
        "hdr-1": { slotId: "hdr-1", label: "Header", role: "editable-slot", content: "", backDataRefs: [] },
        "ftr-1": { slotId: "ftr-1", label: "Footer", role: "editable-slot", content: "", backDataRefs: [] },
        "slot-tip": { slotId: "slot-tip", label: "팁", role: "editable-slot", content: "<p>일찍 도착하세요</p>", backDataRefs: [] },
      },
      backdata: {},
    };

    // 1. Reverse extract bound outline & stamp sourceNodeId on patchedDoc
    const { outline, patchedDoc, docNodeId } = extractBoundOutlineFromVDoc(original, registry);
    assert.ok(outline.rootNodes[0].text.startsWith("<<doc:blog>>"));
    assert.equal(outline.rootNodes[0].id, docNodeId);
    assert.ok(patchedDoc.pages[0].sourceNodeId);
    assert.ok(patchedDoc.pages[0].blocks.every((b) => Boolean(b.sourceNodeId)));

    // 2. Edit text inside the extracted outline (change tip wording)
    const secNode = outline.rootNodes[0].children!.find((n) => n.text.startsWith("<<view:section:hero>>"))!;
    const tipNode = secNode.children!.find((n) => n.text.startsWith("!"))!;
    tipNode.text = "! 오전 9시 전에 도착하세요";

    // 3. Recompile with `baseDoc: patchedDoc` -> text updates, ALL visual props preserved!
    const recompiled = compileDirectiveSubtreeToVDoc(outline.rootNodes, docNodeId, {
      registry,
      baseDoc: patchedDoc,
    });
    assert.ok(recompiled);
    assert.equal(recompiled.docId, "vdoc-rich-blog");
    assert.equal(recompiled.status, "Review");
    assert.deepEqual(recompiled.styleRef, original.styleRef);

    const [imgBlk, gridBlk, tipBlk] = recompiled.pages[0].blocks;
    assert.equal(imgBlk.kind, "image");
    if (imgBlk.kind === "image") {
      assert.equal(imgBlk.src, "https://cdn.example.com/hero.jpg");
      assert.equal(imgBlk.width, "85%");
      assert.equal(imgBlk.objectFit, "contain");
      assert.equal(imgBlk.locked, true);
    }
    assert.equal(gridBlk.kind, "columns-grid");
    if (gridBlk.kind === "columns-grid") {
      assert.deepEqual(gridBlk.widths, ["2fr", "1fr"]);
      assert.equal(gridBlk.gap, 12);
      assert.equal(gridBlk.columns[0].image?.src, "https://cdn.example.com/a.jpg");
      assert.equal(gridBlk.columns[1].image?.src, "https://cdn.example.com/b.jpg");
    }
    assert.equal(tipBlk.kind, "callout-box");
    if (tipBlk.kind === "callout-box") {
      assert.equal(tipBlk.accentColor, "sky");
      assert.equal(tipBlk.align, "left");
      assert.ok(recompiled.slots[tipBlk.slotId].content.includes("오전 9시 전에 도착하세요"));
    }
  });

  it("compiles pure semantic <<cell>> / <<col>> / <<view:list>> containers, respects dynamic .vsyntax symbols, and preserves .vdoc design properties on recompile", () => {
    const registry = createElementSyntaxRegistry();
    assert.equal(registry.resolveSymbol("table", "cell-container", ""), "<<cell>>");
    assert.equal(registry.resolveSymbol("table", "row-container", ""), "<<row>>");
    assert.equal(registry.resolveSymbol("section", "form-title", ""), "<<view:title>>");
    assert.equal(registry.resolveSymbol("section", "list-view", ""), "<<view:list>>");
    assert.equal(registry.resolveSymbol("section", "columns-container", ""), "<<view:columns>>");
    assert.equal(registry.resolveSymbol("section", "col-container", ""), "<<col>>");

    const outline: OutlineSyntaxDocument = {
      title: "재귀 컨테이너 테스트",
      rootNodes: [
        {
          id: "p3",
          text: "<<view:section>> Page 3 · [붙임 6호 서식] 기술적용계획표",
          children: [
            { id: "t-tag", text: "[붙임 6호 서식]", children: [] },
            { id: "t-title", text: "<<view:title>> [   ]기술적용계획표", children: [] },
            {
              id: "t-meta",
              text: "<<view:table>> 사업 정보",
              children: [
                { id: "m1", text: "사업명 | 통합 AX 포털 사이트 구축", children: [] },
                { id: "m2", text: "작성일 | 2025. 9. 19.", children: [] },
              ],
            },
            {
              id: "t-laws",
              text: "<<view:table:header>> 법률 및 고시 등",
              children: [
                { id: "h1", text: "구분 | 항 목", children: [] },
                {
                  id: "r-law",
                  text: "법률 | <<cell>>",
                  children: [
                    {
                      id: "l-law",
                      text: "<<view:list>>",
                      children: [
                        { id: "law1", text: "지능정보화 기본법", children: [] },
                        { id: "law2", text: "개인정보 보호법", children: [] },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              id: "c-grid",
              text: "<<view:columns>> 다단 컨테이너",
              children: [
                {
                  id: "col-1",
                  text: "<<col>>",
                  children: [{ id: "col-1-p", text: "좌측 컨테이너 본문", children: [] }],
                },
                {
                  id: "col-2",
                  text: "<<col>>",
                  children: [{ id: "col-2-p", text: "우측 컨테이너 본문", children: [] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const doc = compileOutlineToVDoc(outline, { registry, profileId: "a4" });
    assert.equal(doc.pages.length, 1);
    const blocks = doc.pages[0].blocks;
    assert.equal(blocks[1].kind, "form-title");

    // Pure semantic compile: equal widths and clean semantic <ul><li> HTML (no hardcoded `◦` glyph)
    const lawTbl = blocks[3];
    assert.equal(lawTbl.kind, "structured-table");
    if (lawTbl.kind === "structured-table") {
      assert.deepEqual(lawTbl.columnWidths, ["50%", "50%"]);
      assert.equal(lawTbl.rows[0].cells[0].isHeader, true);
      assert.equal(lawTbl.rows[0].cells[1].isHeader, true);
      const richCell = lawTbl.rows[1].cells[1];
      assert.ok(Array.isArray(richCell.blocks) && richCell.blocks.length === 1);
      const nestedList = richCell.blocks[0];
      assert.equal(nestedList.kind, "text");
      if (nestedList.kind === "text") {
        const html = doc.slots[nestedList.slotId].content;
        assert.ok(html.includes("<ul>"));
        assert.ok(html.includes("지능정보화 기본법"));
        assert.equal(html.includes("◦"), false, "visual marker must NOT be hardcoded in HTML");
      }

      // Simulate design tuning in .vdoc Inspector: 18:82 widths, official borders, circle listMarker
      lawTbl.columnWidths = ["18%", "82%"];
      lawTbl.borderRules = {
        outer: "none",
        headerTop: "1.5px solid #0f172a",
        headerBottom: "1px solid #475569",
        rowBottom: "1px solid #64748b",
        vertical: "1px solid #94a3b8",
        radius: "0px",
      };
      lawTbl.rows[0].cells[0].borderTop = "1.5px solid #0f172a";
      if (nestedList.kind === "text") {
        nestedList.listMarker = "circle";
      }
    }

    // Recompile after editing a law item in .outline -> ALL design properties survive!
    outline.rootNodes[0].children![3].children![1].children![0].children![0].text =
      "지능정보화 기본법 (개정)";
    const recompiled = compileOutlineToVDoc(outline, { registry, profileId: "a4", baseDoc: doc });
    const reLawTbl = recompiled.pages[0].blocks[3];
    assert.equal(reLawTbl.kind, "structured-table");
    if (reLawTbl.kind === "structured-table") {
      assert.deepEqual(reLawTbl.columnWidths, ["18%", "82%"]);
      assert.equal(reLawTbl.borderRules?.outer, "none");
      assert.equal(reLawTbl.rows[0].cells[0].borderTop, "1.5px solid #0f172a");
      const reNested = reLawTbl.rows[1].cells[1].blocks?.[0];
      assert.equal(reNested?.kind, "text");
      if (reNested?.kind === "text") {
        assert.equal(reNested.listMarker, "circle");
        assert.ok(recompiled.slots[reNested.slotId].content.includes("지능정보화 기본법 (개정)"));

        // Recursive block ops (`findBlock`, `mapBlock`, `removeBlock`) work seamlessly on nested cell.blocks!
        const nestedLoc = findBlock(recompiled, reNested.blockId);
        assert.equal(nestedLoc?.block.blockId, reNested.blockId);
        const mappedDoc = mapBlock(recompiled, recompiled.pages[0].pageId, reNested.blockId, (b) =>
          b.kind === "text" ? { ...b, listMarker: "square" } : b
        );
        const updatedNested = findBlock(mappedDoc, reNested.blockId)?.block;
        assert.equal(updatedNested?.kind === "text" ? updatedNested.listMarker : undefined, "square");
        const removedDoc = removeBlock(mappedDoc, recompiled.pages[0].pageId, reNested.blockId);
        assert.equal(findBlock(removedDoc, reNested.blockId), null);
      }
    }

    // Recursive <<view:columns>> with <<col>> containers
    const colsBlk = blocks[4];
    assert.equal(colsBlk.kind, "columns-grid");
    if (colsBlk.kind === "columns-grid") {
      assert.deepEqual(colsBlk.widths, ["1fr", "1fr"]);
      assert.equal(colsBlk.columns?.[0]?.blocks?.length, 1);
      assert.equal(colsBlk.columns?.[1]?.blocks?.length, 1);
    }

    // Dynamic .vsyntax override: rename `cell-container` symbol `<<cell>>` -> `[cell]`
    const tblDef = registry.getElement("table")!;
    registry.updateElement("table", {
      rules: tblDef.rules.map((r) => (r.id === "cell-container" ? { ...r, symbol: "[cell]" } : r)),
    });
    const customSymOutline: OutlineSyntaxDocument = {
      title: "커스텀 셀 기호 테스트",
      rootNodes: [
        {
          id: "cs-sec",
          text: "<<view:section>> 커스텀",
          children: [
            {
              id: "cs-tbl",
              text: "<<view:table:header>> 커스텀 표",
              children: [
                { id: "cs-h", text: "구분 | 내용", children: [] },
                {
                  id: "cs-r",
                  text: "법률 | [cell]",
                  children: [{ id: "cs-p", text: "동적 셀 본문", children: [] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const customDoc = compileOutlineToVDoc(customSymOutline, { registry, profileId: "a4" });
    const customTbl = customDoc.pages[0].blocks[0];
    assert.equal(customTbl.kind, "structured-table");
    if (customTbl.kind === "structured-table") {
      assert.equal(customTbl.rows[1].cells[1].blocks?.length, 1);
    }

    // Automatic 1:1 Scene Graph compiler reflects Table -> Row -> Cell -> Nested Blocks AND dynamic .vsyntax symbols!
    const sceneGraph = compilePageSceneGraph(recompiled.pages[0], recompiled.slots, {
      registry,
    });
    assert.equal(sceneGraph.length, 5);
    assert.equal(sceneGraph[1].outlineTag, "<<view:title>>");
    const lawScene = sceneGraph[3];
    assert.equal(lawScene.outlineTag, "<<view:table:header>>");
    assert.equal(lawScene.children?.length, 2); // Row 1 (Header) + Row 2 (법률)
    const row2Scene = lawScene.children?.[1];
    assert.equal(row2Scene?.role, "row");
    assert.equal(row2Scene?.children?.length, 2); // Cell 1 (법률) + Cell 2 (컨테이너 셀)
    const containerCellScene = row2Scene?.children?.[1];
    assert.equal(containerCellScene?.role, "cell");
    assert.equal(containerCellScene?.outlineTag, "[cell]"); // Dynamic registry symbol reflected automatically!
    const nestedListScene = containerCellScene?.children?.[0];
    assert.equal(nestedListScene?.isBlock, true);
    assert.equal(nestedListScene?.outlineTag, "<<view:list>>");
    assert.equal(nestedListScene?.icon, "list");

    // Auto-expand ancestor path finds [Table, Row 2, Container Cell] when nested list is selected
    const ancestors = findSceneNodeAncestorIds(
      sceneGraph,
      nestedListScene?.selectBlockId ?? null,
      null
    );
    assert.deepEqual(ancestors, [lawScene.id, row2Scene!.id, containerCellScene!.id]);
  });
});
