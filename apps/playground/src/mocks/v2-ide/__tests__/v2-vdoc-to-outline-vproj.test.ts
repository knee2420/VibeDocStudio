import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findOwningProjectPath, MemoryVaultAdapter } from "@vibe/vault-core";
import {
  parseOutlineJson,
  parseVDocJson,
  serializeOutlineJson,
  serializeVDocJson,
  type OutlineFilePayload,
} from "@vibe/vault-formats";
import type { VDocDocument } from "@vibe/vdoc-schema";
import {
  appendVDocBranchToExistingOutline,
  openOrCreateOutlineForVDoc,
  syncVDocMeaningBackToOutline,
} from "@vibe/outline-sync";

function sampleVDoc(docId: string, title: string, bodyText: string): VDocDocument {
  return {
    version: "1.0.0",
    docId,
    title,
    status: "Draft",
    updatedAt: "2026-11-25T00:00:00.000Z",
    variables: {},
    backdata: {},
    pages: [
      {
        pageId: `${docId}_p1`,
        pageNumber: 1,
        pageLabel: "개요",
        headerSlotId: `${docId}_h1`,
        footerSlotId: `${docId}_f1`,
        blocks: [
          {
            blockId: `${docId}_b1`,
            kind: "text",
            title: "본문",
            slotId: `${docId}_s1`,
          },
        ],
      },
    ],
    slots: {
      [`${docId}_h1`]: { slotId: `${docId}_h1`, label: "머리글", role: "editable-slot", content: "", backDataRefs: [] },
      [`${docId}_f1`]: { slotId: `${docId}_f1`, label: "바닥글", role: "editable-slot", content: "", backDataRefs: [] },
      [`${docId}_s1`]: { slotId: `${docId}_s1`, label: "본문", role: "editable-slot", content: `<p>${bodyText}</p>`, backDataRefs: [] },
    },
  };
}

describe("vdoc -> outline .vproj User Flow", () => {
  it("Case C: promotes standalone .vdoc outside .vproj into a new .vproj folder together with new .outline", () => {
    const vault = new MemoryVaultAdapter({ id: "v-promote", name: "v-promote" });
    const oldPath = "05. AI Eval/제안요청서.vdoc";
    vault.write(oldPath, serializeVDocJson(sampleVDoc("doc-standalone", "제안요청서", "초안 본문")));

    const openedLinks: string[] = [];
    const res = openOrCreateOutlineForVDoc(
      vault,
      oldPath,
      (p) => openedLinks.push(p),
      { allowCreate: true, outlineName: "제안요청서_구조", promoteStandaloneToProject: true }
    );

    assert.ok(res);
    assert.equal(res.created, true);
    assert.equal(res.promotedToProject, true);
    assert.equal(res.projectPath, "05. AI Eval/제안요청서_구조.vproj");
    assert.equal(res.vdocPath, "05. AI Eval/제안요청서_구조.vproj/제안요청서.vdoc");
    assert.equal(res.outlinePath, "05. AI Eval/제안요청서_구조.vproj/제안요청서_구조.outline");

    assert.equal(vault.exists(oldPath), false);
    assert.equal(vault.exists(res.vdocPath!), true);
    assert.equal(vault.exists(res.outlinePath), true);
    assert.equal(findOwningProjectPath(res.vdocPath!), res.projectPath);
    assert.equal(findOwningProjectPath(res.outlinePath), res.projectPath);
    assert.deepEqual(openedLinks, [res.outlinePath]);

    // Symmetrical binding & sourceNodeId stamped on both sides
    const movedDoc = parseVDocJson(vault.read(res.vdocPath!), "제안요청서");
    const outline = parseOutlineJson(vault.read(res.outlinePath), "제안요청서_구조");
    assert.equal(movedDoc.outlineRef?.rootNodeId, res.rootNodeId);
    assert.equal(outline.docBindings?.[res.rootNodeId]?.docId, "doc-standalone");
    assert.ok(movedDoc.pages[0].blocks[0].sourceNodeId);
  });

  it("Case B1: inside an existing .vproj, creates only the new .outline without nesting another .vproj", () => {
    const vault = new MemoryVaultAdapter({ id: "v-inproj", name: "v-inproj" });
    vault.createFolder("05. AI Eval/입찰.vproj");
    const vdocPath = "05. AI Eval/입찰.vproj/제안서.vdoc";
    vault.write(vdocPath, serializeVDocJson(sampleVDoc("doc-inproj", "제안서", "프로젝트 내부 문서")));

    const res = openOrCreateOutlineForVDoc(vault, vdocPath, undefined, {
      allowCreate: true,
      outlineName: "제안서_아웃라인",
      promoteStandaloneToProject: true,
    });

    assert.ok(res);
    assert.equal(res.created, true);
    assert.equal(res.promotedToProject, false);
    assert.equal(res.vdocPath, vdocPath);
    assert.equal(res.outlinePath, "05. AI Eval/입찰.vproj/제안서_아웃라인.outline");
    assert.equal(vault.exists(res.outlinePath), true);
  });

  it("Case B2: appends current .vdoc as a new <<doc>> branch inside an existing .outline in the same .vproj", () => {
    const vault = new MemoryVaultAdapter({ id: "v-append", name: "v-append" });
    vault.createFolder("05. AI Eval/입찰.vproj");
    const outlinePath = "05. AI Eval/입찰.vproj/마스터.outline";
    const existingOutline: OutlineFilePayload = {
      version: 1,
      id: "ol-master",
      title: "마스터 기획",
      defaultView: "bullets",
      createdAt: "2026-11-25T00:00:00.000Z",
      updatedAt: "2026-11-25T00:00:00.000Z",
      rootNodes: [
        {
          id: "doc_existing",
          text: "<<doc:a4>> 기존 요약본",
          isFolded: false,
          children: [],
        },
      ],
    };
    vault.write(outlinePath, serializeOutlineJson(existingOutline));

    const vdocPath = "05. AI Eval/입찰.vproj/상세제안서.vdoc";
    vault.write(vdocPath, serializeVDocJson(sampleVDoc("doc-detail", "상세제안서", "합류할 본문 내용")));

    const res = appendVDocBranchToExistingOutline(vault, vdocPath, outlinePath);
    assert.ok(res);
    assert.equal(res.outlinePath, outlinePath);

    const updatedOutline = parseOutlineJson(vault.read(outlinePath), "마스터");
    assert.equal(updatedOutline.rootNodes.length, 2);
    assert.equal(updatedOutline.rootNodes[0].id, "doc_existing");
    assert.equal(updatedOutline.rootNodes[1].id, res.rootNodeId);
    assert.ok(updatedOutline.rootNodes[1].text.includes("상세제안서"));
    assert.equal(updatedOutline.docBindings?.[res.rootNodeId]?.docId, "doc-detail");

    const updatedDoc = parseVDocJson(vault.read(vdocPath), "상세제안서");
    assert.equal(updatedDoc.outlineRef?.outlineId, "ol-master");
    assert.equal(updatedDoc.outlineRef?.rootNodeId, res.rootNodeId);
    assert.ok(updatedDoc.pages[0].blocks[0].sourceNodeId);
  });

  it("reverse sync appends newly inserted blocks (without sourceNodeId) into .outline and stamps sourceNodeId back", () => {
    const vault = new MemoryVaultAdapter({ id: "v-revsync", name: "v-revsync" });
    vault.createFolder("05. AI Eval/역반영.vproj");
    const vdocPath = "05. AI Eval/역반영.vproj/문서.vdoc";
    vault.write(vdocPath, serializeVDocJson(sampleVDoc("doc-rev", "문서", "초기 문단")));

    const created = openOrCreateOutlineForVDoc(vault, vdocPath, undefined, { allowCreate: true });
    assert.ok(created);

    // Simulate adding a brand-new block (e.g. via Design mode or asset insert) WITHOUT sourceNodeId
    const boundDoc = parseVDocJson(vault.read(vdocPath), "문서");
    const editedDoc: VDocDocument = {
      ...boundDoc,
      pages: [
        {
          ...boundDoc.pages[0],
          blocks: [
            ...boundDoc.pages[0].blocks,
            {
              blockId: "blk_new_asset",
              kind: "text",
              title: "추가 블록",
              slotId: "slot_new_asset",
            },
          ],
        },
      ],
      slots: {
        ...boundDoc.slots,
        slot_new_asset: {
          slotId: "slot_new_asset",
          label: "추가 블록",
          role: "editable-slot",
          content: "<p>에셋으로 새로 삽입된 내용</p>",
          backDataRefs: [],
        },
      },
    };
    vault.write(vdocPath, serializeVDocJson(editedDoc));

    const synced = syncVDocMeaningBackToOutline(vault, vdocPath, editedDoc);
    assert.equal(synced, true);

    const nextOutline = parseOutlineJson(vault.read(created.outlinePath), "문서");
    const secChildren = nextOutline.rootNodes[0].children[0].children;
    assert.equal(secChildren.length, 2);
    assert.ok(secChildren[1].text.includes("에셋으로 새로 삽입된 내용"));

    // Verify sourceNodeId was stamped back onto the new block in .vdoc!
    const finalDoc = parseVDocJson(vault.read(vdocPath), "문서");
    const newBlk = finalDoc.pages[0].blocks.find((b) => b.blockId === "blk_new_asset");
    assert.equal(newBlk?.sourceNodeId, secChildren[1].id);
  });
});
