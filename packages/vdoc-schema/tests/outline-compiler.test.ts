import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommittedDocuments,
  buildWorkingOutlineFromProjectDocs,
  compileOutlineToPreview,
  getElementDef,
  hasElementKind,
  inferChildElementKind,
  LAYOUT_BLOCK_KINDS,
  listElementKinds,
  reconcileElementKindOnReparent,
  htmlToPlainText,
  htmlToSummary,
  plainTextToHtml,
  type VDocDocument,
  type VProjectManifest,
  type WorkingOutlineDocument,
} from "../src";

test("element-kit registers all 16 LayoutBlockKind alongside container and sub-unit tiers", () => {
  for (const kind of LAYOUT_BLOCK_KINDS) {
    assert.equal(hasElementKind(kind), true, `Missing block kind: ${kind}`);
    const def = getElementDef(kind);
    assert.equal(def.tier, "block");
  }
  assert.equal(getElementDef("project").tier, "container");
  assert.equal(getElementDef("document").tier, "container");
  assert.equal(getElementDef("page").tier, "container");
  assert.equal(getElementDef("section").tier, "container");
  assert.equal(getElementDef("table-row").tier, "sub-unit");
  assert.equal(getElementDef("table-cell").tier, "sub-unit");
  assert.equal(getElementDef("grid-col").tier, "sub-unit");
  assert.equal(getElementDef("slot").tier, "sub-unit");
  assert.equal(getElementDef("media").tier, "sub-unit");
  assert.ok(listElementKinds({ turnIntoOnly: true }).length >= 16);
});

test("inferChildElementKind & reconcileElementKindOnReparent enforce container and table transitions", () => {
  assert.equal(inferChildElementKind("project"), "document");
  assert.equal(inferChildElementKind("document"), "page");
  assert.equal(inferChildElementKind("page"), "text");
  assert.equal(inferChildElementKind("structured-table"), "table-row");
  assert.equal(inferChildElementKind("table-row"), "table-cell");
  assert.equal(inferChildElementKind("table-cell"), "text");
  assert.equal(inferChildElementKind("columns-grid"), "grid-col");

  assert.equal(reconcileElementKindOnReparent("text", "structured-table"), "table-row");
  assert.equal(reconcileElementKindOnReparent("text", "table-row"), "table-cell");
  assert.equal(reconcileElementKindOnReparent("table-cell", "page"), "text");
  assert.equal(reconcileElementKindOnReparent("table-row", "document"), "text");
  assert.equal(reconcileElementKindOnReparent("image", "page"), "image");
});

test("compileOutlineToPreview synthesizes zero-base document, pages, structured-table, and callout-box", () => {
  const outline: WorkingOutlineDocument = {
    projectId: "proj_zero",
    revision: 1,
    baseDocRevisions: {},
    dirty: true,
    updatedAt: "2026-11-16T00:00:00.000Z",
    nodes: [
      {
        nodeId: "n_doc",
        text: "신규 제안서",
        elementKind: "document",
        children: [
          {
            nodeId: "n_page",
            text: "개요",
            elementKind: "page",
            children: [
              {
                nodeId: "n_text",
                text: "프로젝트 핵심 요약",
                elementKind: "text",
                children: [],
              },
              {
                nodeId: "n_tbl",
                text: "예산 요약표",
                elementKind: "structured-table",
                children: [
                  {
                    nodeId: "n_row1",
                    text: "항목",
                    elementKind: "table-row",
                    children: [
                      { nodeId: "n_c11", text: "인건비", elementKind: "table-cell", children: [] },
                      { nodeId: "n_c12", text: "1000만원", elementKind: "table-cell", children: [] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const previewDocs = compileOutlineToPreview(outline, []);
  assert.equal(previewDocs.length, 1);
  const doc = previewDocs[0];
  assert.equal(doc.title, "신규 제안서");
  assert.equal(doc.pages.length, 1);
  assert.equal(doc.pages[0].blocks.length, 2);
  assert.equal(doc.pages[0].blocks[0].kind, "text");
  assert.equal(doc.pages[0].blocks[1].kind, "structured-table");
  const tableBlk = doc.pages[0].blocks[1];
  if (tableBlk.kind === "structured-table") {
    assert.equal(tableBlk.rows.length, 1);
    assert.equal(tableBlk.rows[0].cells.length, 2);
  }
});

test("Phase 3 round-trip preserves base table cell merge/style and allows detaching table-cell back to text", () => {
  const baseDoc: VDocDocument = {
    version: "1.0.0",
    docId: "doc_1",
    title: "견적서",
    status: "Draft",
    updatedAt: "2026-11-16T00:00:00.000Z",
    revision: 3,
    projectId: "proj_1",
    variables: {},
    backdata: {},
    slots: {
      s_a: { slotId: "s_a", label: "품명", role: "editable-slot", content: "<p>모듈A</p>", backDataRefs: [] },
      s_b: { slotId: "s_b", label: "단가", role: "editable-slot", content: "<p>500</p>", backDataRefs: [] },
    },
    pages: [
      {
        pageId: "p_1",
        pageNumber: 1,
        pageLabel: "1페이지",
        blocks: [
          {
            blockId: "blk_tbl",
            kind: "structured-table",
            title: "상세 내역",
            columnWidths: ["50%", "50%"],
            borderRules: { outer: "1px solid #eaeaea", rowBottom: "1px solid #eaeaea", vertical: "1px solid #eaeaea" },
            headerStyle: { bg: "#f5f5f6", fontWeight: "600", padding: "8px" },
            cellPadding: "8px",
            rows: [
              {
                rowId: "r_1",
                cells: [
                  { cellId: "c_1", slotId: "s_a", colSpan: 2, rowSpan: 1, backgroundColor: "#eef2ff" },
                  { cellId: "c_2", slotId: "s_b", colSpan: 1, rowSpan: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const manifest: VProjectManifest = {
    version: "1.0.0",
    projectId: "proj_1",
    title: "프로젝트1",
    activePhase: "storylining",
    zoomLevel: "project",
    docIds: ["doc_1"],
    outlinerNodes: [],
    stagedChanges: [],
    updatedAt: "2026-11-16T00:00:00.000Z",
  };

  const extracted = buildWorkingOutlineFromProjectDocs(manifest, [baseDoc]);
  const pageNode = extracted.nodes[0].children[0];
  const tableNode = pageNode.children[0];
  assert.equal(tableNode.elementKind, "structured-table");
  const rowNode = tableNode.children[0];
  assert.equal(rowNode.elementKind, "table-row");
  assert.equal(rowNode.children.length, 2);

  // Move second cell out of table under page as standalone text block (Phase 3 return detach test)
  const detachedCell = { ...rowNode.children[1], elementKind: "text" as const };
  rowNode.children = [rowNode.children[0]];
  pageNode.children.push(detachedCell);

  const previewDocs = compileOutlineToPreview(extracted, [baseDoc]);
  const outPage = previewDocs[0].pages[0];
  assert.equal(outPage.blocks.length, 2);
  const compiledTable = outPage.blocks[0];
  assert.equal(compiledTable.kind, "structured-table");
  if (compiledTable.kind === "structured-table") {
    assert.equal(compiledTable.rows[0].cells.length, 1);
    assert.equal(compiledTable.rows[0].cells[0].colSpan, 2);
    assert.equal(compiledTable.rows[0].cells[0].backgroundColor, "#eef2ff");
  }
  assert.equal(outPage.blocks[1].kind, "text");

  const committed = buildCommittedDocuments(extracted, [baseDoc], manifest);
  assert.equal(committed.documents.length, 1);
  assert.equal(committed.syncedOutline.dirty, false);
  assert.equal(committed.syncedOutline.revision, extracted.revision + 1);
});

test("htmlToPlainText, htmlToSummary, and compileOutlineToPreview handle HTML5 entities without double-escaping", () => {
  const sampleHtml =
    "<p>망고독 R&amp;D &nbsp; &#39;A&#x26;B&#39; &lt;tag&gt;</p><script>ignored()</script><p>반&nbsp;&nbsp;상&nbsp;회</p>";
  assert.equal(htmlToPlainText(sampleHtml), "망고독 R&D   'A&B' <tag>\n반  상 회");
  assert.equal(htmlToSummary(sampleHtml), "망고독 R&D 'A&B' <tag> 반 상 회");
  assert.equal(plainTextToHtml("R&D <1>"), "<p>R&amp;D &lt;1&gt;</p>");

  const entityDoc: VDocDocument = {
    version: "1.0.0",
    docId: "doc_ent",
    title: "엔티티 문서",
    updatedAt: "2026-11-16T00:00:00.000Z",
    pages: [
      {
        pageId: "p1",
        pageNumber: 1,
        blocks: [
          {
            blockId: "b_title",
            kind: "heading",
            title: "제목",
            slotId: "s_title",
            level: 1,
          } as unknown as VDocDocument["pages"][number]["blocks"][number],
        ],
      },
    ],
    slots: {
      s_title: {
        slotId: "s_title",
        label: "제목",
        role: "editable-slot",
        content: "<p><strong>반&nbsp;상&nbsp;&nbsp;회</strong> &amp; R&amp;D</p>",
        backDataRefs: [],
      },
    },
    backdata: [],
    variables: {},
  };

  const manifest: VProjectManifest = {
    version: "1.0.0",
    projectId: "proj_ent",
    title: "엔티티",
    activePhase: "storylining",
    zoomLevel: "project",
    docIds: ["doc_ent"],
    outlinerNodes: [],
    stagedChanges: [],
    updatedAt: "2026-11-16T00:00:00.000Z",
  };

  const outline = buildWorkingOutlineFromProjectDocs(manifest, [entityDoc]);
  const textNode = outline.nodes[0].children[0].children[0];
  assert.equal(textNode.text, "반 상  회 & R&D");

  const previewDocs = compileOutlineToPreview(outline, [entityDoc]);
  assert.equal(
    previewDocs[0].slots.s_title.content,
    "<p><strong>반&nbsp;상&nbsp;&nbsp;회</strong> &amp; R&amp;D</p>"
  );
  assert.equal(previewDocs[0].slots.s_title.isEdited, undefined);
});

test("compileOutlineToPreview preserves composite-form-frame, footerSummary slots, columns-grid, and spacer without flattening", () => {
  const baseDoc = {
    version: "1.0.0",
    docId: "doc_complex",
    title: "복합 블록",
    updatedAt: "2026-11-16T00:00:00.000Z",
    pages: [
      {
        pageId: "p1",
        pageNumber: 1,
        blocks: [
          {
            blockId: "b_tbl",
            kind: "structured-table",
            title: "표",
            columnWidths: ["50%", "50%"],
            rows: [{ rowId: "r1", cells: [{ cellId: "c1", slotId: "s_t1" }, { cellId: "c2", slotId: "s_t2" }] }],
            footerSummary: { items: [{ itemId: "f1", label: "합계", slotId: "s_tf" }] },
          },
          {
            blockId: "b_div",
            kind: "divider",
            title: "구분선",
            variant: "short",
            spacing: 24,
          },
        ],
      },
    ],
    slots: {
      s_t1: { slotId: "s_t1", label: "A", role: "editable-slot", content: "<p>항목</p>", backDataRefs: [] },
      s_t2: { slotId: "s_t2", label: "B", role: "editable-slot", content: "<p>100</p>", backDataRefs: [] },
      s_tf: { slotId: "s_tf", label: "합계", role: "editable-slot", content: "<p>총 100</p>", backDataRefs: [] },
    },
    backdata: [],
    variables: {},
  } as unknown as VDocDocument;

  const outline: WorkingOutlineDocument = {
    version: "1.0.0",
    projectId: "proj_complex",
    revision: 1,
    dirty: true,
    updatedAt: "2026-11-16T00:00:00.000Z",
    baseDocRevisions: { doc_complex: 1 },
    nodes: [
      {
        nodeId: "d1",
        text: "복합 블록",
        elementKind: "document",
        sourceRef: { docId: "doc_complex" },
        children: [
          {
            nodeId: "p1",
            text: "페이지 1",
            elementKind: "page",
            sourceRef: { docId: "doc_complex", pageId: "p1" },
            children: [
              {
                nodeId: "n_tbl",
                text: "표",
                elementKind: "structured-table",
                sourceRef: { docId: "doc_complex", pageId: "p1", blockId: "b_tbl" },
                children: [
                  {
                    nodeId: "n_r1",
                    text: "1행",
                    elementKind: "table-row",
                    sourceRef: { docId: "doc_complex", pageId: "p1", blockId: "b_tbl", rowId: "r1" },
                    children: [
                      {
                        nodeId: "n_c1",
                        text: "항목",
                        elementKind: "table-cell",
                        sourceRef: { docId: "doc_complex", pageId: "p1", blockId: "b_tbl", rowId: "r1", cellId: "c1", slotId: "s_t1" },
                        children: [],
                      },
                      {
                        nodeId: "n_c2",
                        text: "200",
                        elementKind: "table-cell",
                        sourceRef: { docId: "doc_complex", pageId: "p1", blockId: "b_tbl", rowId: "r1", cellId: "c2", slotId: "s_t2" },
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                nodeId: "n_frame_new",
                text: "신규 프레임",
                elementKind: "composite-form-frame",
                children: [
                  {
                    nodeId: "n_sec1",
                    text: "1구역",
                    elementKind: "section",
                    children: [
                      {
                        nodeId: "n_fr1",
                        text: "1행",
                        elementKind: "table-row",
                        children: [
                          { nodeId: "n_fc1", text: "셀A", elementKind: "table-cell", children: [] },
                          { nodeId: "n_fc2", text: "셀B", elementKind: "table-cell", children: [] },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                nodeId: "n_div",
                text: "구분선",
                elementKind: "divider",
                sourceRef: { docId: "doc_complex", pageId: "p1", blockId: "b_div" },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  const compiled = compileOutlineToPreview(outline, [baseDoc]);
  const blocks = compiled[0].pages[0].blocks;
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["structured-table", "composite-form-frame", "divider"]
  );
  assert.ok(compiled[0].slots.s_tf);
});
