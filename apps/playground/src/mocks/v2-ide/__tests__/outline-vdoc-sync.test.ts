import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MemoryVaultAdapter,
  runVaultRenameRewriters,
} from "@vibe/vault-core";
import {
  setSlotContent,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { getAllGroups } from "@vibe/workspace-layout/core";

import {
  createDefaultVDoc,
  type OutlineFilePayload,
  parseOutlineJson,
  parseVDocJson,
  rewriteOutlineBindingsOnRename,
  rewriteVDocPointersOnRename,
  serializeOutlineJson,
  serializeVDocJson,
  toVaultUri,
} from "@vibe/vault-formats";
import {
  bindVDocToExistingOutline,
  collectOutlineBacklinks,
  collectOutlineCandidatesForVDoc,
  compileOutlineTargetForPreview,
  importPartnerIntoProjectAndBind,
  inspectOutlineNodeVDocLink,
  inspectVDocOutlineLink,
  isInSameProjectScope,
  materializeVDocFromOutlineDirective,
  openOrCreateOutlineForVDoc,
  type OutlineRevealOptions,
  outlineSemanticSignature,
  requestOutlineReveal,
  resolveOutlineForVDoc,
  resolveVDocForOutlineBinding,
  subscribeOutlineReveal,
  syncAllBoundVDocsFromOutline,
  syncVDocMeaningBackToOutline,
  unlinkOutlineNodeBinding,
  unlinkVDocFromOutline,
} from "@vibe/outline-sync";
import { createVaultOutlineFiles } from "../model/outlineFileHost";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { createSampleProposalVDoc } from "../model/sampleProposalVDoc";

describe("Bidirectional .outline <-> .vdoc (WYSIWYM <-> WYSIWYG) Sync Engine", () => {
  it("supports 1:N master .outline with deep <<view:table @asset>>, multiple <<doc>> bindings, and non-destructive live sync", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "워크샵/2026_하반기_워크샵.outline";
    const master: OutlineFilePayload = {
      version: 1,
      id: "outline-workshop-master",
      title: "2026 하반기 워크샵",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "n-todo",
          text: "팀장님 초기 리퀘스트",
          isFolded: false,
          children: [
            { id: "n-todo-1", text: "Todo: 11월 중순 장소 확정", isFolded: false, children: [] },
          ],
        },
        {
          id: "n-research",
          text: "후보지 리서치",
          isFolded: false,
          children: [
            {
              id: "n-ski",
              text: "스키 리조트",
              isFolded: false,
              children: [
                {
                  id: "n-ski-table",
                  text: "스키 후보 비교표 <<view:table @table-grouped-compare>>",
                  isFolded: false,
                  children: [
                    { id: "n-r1", text: "리조트 | 1인 예상 비용 | 특징", isFolded: false, children: [] },
                    { id: "n-r2", text: "용평 | 25만원 | 슬로프 다양", isFolded: false, children: [] },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "n-doc-blog",
          text: "<<doc:blog>> 워크샵 후기 블로그",
          isFolded: false,
          children: [
            {
              id: "n-blog-sec1",
              text: "<<view:section:hero>> 행사 하이라이트",
              isFolded: false,
              children: [
                { id: "n-blog-p1", text: "올해 워크샵은 ==강원도 평창== 에서 진행했습니다.", isFolded: false, children: [] },
                { id: "n-blog-tip", text: "! 방한 장비를 꼭 챙기세요", isFolded: false, children: [] },
              ],
            },
          ],
        },
        {
          id: "n-doc-a4",
          text: "<<doc:a4>> 워크샵 활동계획서",
          isFolded: false,
          children: [
            {
              id: "n-a4-sec1",
              text: "<<view:section>> 행사 개요",
              isFolded: false,
              children: [
                { id: "n-a4-p1", text: "일시 :: 2026년 11월 27일 ~ 28일", isFolded: false, children: [] },
              ],
            },
          ],
        },
        {
          id: "n-asset-lib",
          text: "재사용 에셋",
          isFolded: false,
          children: [
            {
              id: "n-asset-1",
              text: "1. 그룹 비교표 <<asset:table-grouped-compare>>",
              isFolded: false,
              children: [
                { id: "n-asset-vis", text: "시각스타일:: 세로선 제거, #ecfdf5", isFolded: false, children: [] },
                {
                  id: "n-asset-tpl",
                  text: "<<template:table>>",
                  isFolded: false,
                  children: [{ id: "n-tpl-r1", text: "구분 | 내용", isFolded: false, children: [] }],
                },
              ],
            },
          ],
        },
      ],
    };

    vault.createFile(outlinePath, serializeOutlineJson(master));

    // 1. Preview depth-2 table with inline asset preset
    const tablePreview = compileOutlineTargetForPreview(vault, outlinePath, master, "n-ski-table");
    assert.ok(tablePreview.doc);
    const tblBlk = tablePreview.doc.pages[0].blocks[0];
    assert.equal(tblBlk.kind, "structured-table");
    if (tblBlk.kind === "structured-table") {
      assert.equal(tblBlk.borderRules?.vertical, "none");
      assert.equal(tblBlk.headerStyle?.bg, "#ecfdf5");
    }

    // 2. Materialize TWO independent .vdoc files from the SAME master .outline (1:N)
    const opened: string[] = [];
    const openLink = (p: string) => opened.push(p);

    const blogRes = materializeVDocFromOutlineDirective(vault, outlinePath, "n-doc-blog", openLink);
    const a4Res = materializeVDocFromOutlineDirective(vault, outlinePath, "n-doc-a4", openLink);
    assert.ok(blogRes?.created);
    assert.ok(a4Res?.created);
    assert.notEqual(blogRes.vdocPath, a4Res.vdocPath);
    assert.equal(opened.length, 2);

    const outlineAfterBind = parseOutlineJson(vault.read(outlinePath), "master");
    assert.equal(outlineAfterBind.docBindings?.["n-doc-blog"]?.vdocPath, toVaultUri(blogRes.vdocPath));
    assert.equal(outlineAfterBind.docBindings?.["n-doc-a4"]?.vdocPath, toVaultUri(a4Res.vdocPath));

    // 3. Customize visual design in Blog .vdoc (styleRef + accentColor + locked)
    const blogDoc = parseVDocJson(vault.read(blogRes.vdocPath), "blog");
    assert.equal(blogDoc.outlineRef?.outlinePath, toVaultUri(outlinePath));
    assert.equal(blogDoc.outlineRef?.rootNodeId, "n-doc-blog");
    assert.equal(blogDoc.viewId, "blog");

    const styledBlog: VDocDocument = {
      ...blogDoc,
      styleRef: { packId: "naver-travel-blog", mode: "warm" },
      pages: blogDoc.pages.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) =>
          b.kind === "callout-box"
            ? { ...b, accentColor: "sky" as const, align: "left" as const, locked: true }
            : b
        ),
      })),
    };
    vault.write(blogRes.vdocPath, serializeVDocJson(styledBlog));

    // 4. Edit text inside master .outline & sync -> updates Blog .vdoc WITHOUT destroying visual design!
    const editedPayload = parseOutlineJson(vault.read(outlinePath), "master");
    const blogBranch = editedPayload.rootNodes.find((n) => n.id === "n-doc-blog")!;
    blogBranch.children![0].children![1].text = "! 영하 5도 예보 — 핫팩을 꼭 챙기세요";
    vault.write(outlinePath, serializeOutlineJson(editedPayload));

    const syncedPaths = syncAllBoundVDocsFromOutline(vault, outlinePath, editedPayload);
    assert.deepEqual(syncedPaths, [blogRes.vdocPath]);

    const updatedBlog = parseVDocJson(vault.read(blogRes.vdocPath), "blog");
    assert.deepEqual(updatedBlog.styleRef, { packId: "naver-travel-blog", mode: "warm" });
    const tipBlk = updatedBlog.pages[0].blocks[1];
    assert.equal(tipBlk.kind, "callout-box");
    if (tipBlk.kind === "callout-box") {
      assert.equal(tipBlk.accentColor, "sky");
      assert.equal(tipBlk.align, "left");
      assert.equal(tipBlk.locked, true);
      assert.ok(updatedBlog.slots[tipBlk.slotId].content.includes("핫팩을 꼭 챙기세요"));
    }
  });

  it("supports symmetric VDoc -> Outline creation for both rich and blank .vdoc files and reuses existing outlineRef", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const blankPath = "문서/새_기획서.vdoc";
    const blankDoc = createDefaultVDoc("새 기획서", "a4");
    vault.createFile(blankPath, serializeVDocJson(blankDoc));

    const opened: string[] = [];
    const first = openOrCreateOutlineForVDoc(vault, blankPath, (p) => opened.push(p));
    assert.ok(first);
    assert.equal(first.created, true);
    assert.equal(vault.exists(first.outlinePath), true);

    // Check symmetric binding
    const patchedVDoc = parseVDocJson(vault.read(blankPath), "새 기획서");
    assert.equal(patchedVDoc.outlineRef?.outlinePath, toVaultUri(first.outlinePath));
    assert.equal(patchedVDoc.outlineRef?.rootNodeId, first.rootNodeId);
    assert.ok(patchedVDoc.pages[0].sourceNodeId);
    assert.ok(patchedVDoc.pages[0].blocks.every((b) => Boolean(b.sourceNodeId)));

    const createdOutline = parseOutlineJson(vault.read(first.outlinePath), "새 기획서");
    assert.equal(createdOutline.docBindings?.[first.rootNodeId]?.vdocPath, toVaultUri(blankPath));
    assert.ok(createdOutline.rootNodes[0].text.startsWith("<<doc:a4>>"));

    // Calling again reuses existing outline without creating a duplicate file
    const second = openOrCreateOutlineForVDoc(vault, blankPath, (p) => opened.push(p));
    assert.ok(second);
    assert.equal(second.created, false);
    assert.equal(second.outlinePath, first.outlinePath);
    assert.equal(second.rootNodeId, first.rootNodeId);
  });

  it("reverse-syncs semantic VDoc edits to bound .outline subtree only and skips pure visual edits", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "프로젝트/마스터.outline";
    const master: OutlineFilePayload = {
      version: 1,
      id: "outline-rev",
      title: "마스터",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "n-keep-memo",
          text: "보존되어야 하는 브레인스토밍 메모",
          isFolded: false,
          children: [{ id: "n-keep-1", text: "아이디어 A", isFolded: false, children: [] }],
        },
        {
          id: "n-doc-1",
          text: "<<doc:blog>> 제품 소개",
          isFolded: false,
          children: [
            {
              id: "n-sec-1",
              text: "<<view:section:hero>> 첫 섹션",
              isFolded: false,
              children: [
                { id: "n-txt-1", text: "초기 소개 문구입니다.", isFolded: false, children: [] },
              ],
            },
          ],
        },
      ],
    };
    vault.createFile(outlinePath, serializeOutlineJson(master));

    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, "n-doc-1");
    assert.ok(mat);
    const vdoc = parseVDocJson(vault.read(mat.vdocPath), "제품 소개");

    // 1. Pure visual change (styleRef) must NOT touch .outline (preserves Undo!)
    const visualOnlyDoc: VDocDocument = {
      ...vdoc,
      styleRef: { packId: "naver-travel-blog" },
    };
    const visualSynced = syncVDocMeaningBackToOutline(vault, mat.vdocPath, visualOnlyDoc);
    assert.equal(visualSynced, false);

    // 2. Semantic slot text edit MUST update ONLY `n-doc-1` subtree and keep `n-keep-memo` intact!
    const txtBlk = vdoc.pages[0].blocks[0];
    assert.equal(txtBlk.kind, "text");
    const editedDoc = setSlotContent(vdoc, txtBlk.slotId, "<p>수정된 소개 문구입니다.</p>");
    const semanticSynced = syncVDocMeaningBackToOutline(vault, mat.vdocPath, editedDoc);
    assert.equal(semanticSynced, true);

    const updatedOutline = parseOutlineJson(vault.read(outlinePath), "마스터");
    assert.equal(updatedOutline.rootNodes[0].id, "n-keep-memo");
    assert.equal(updatedOutline.rootNodes[0].children[0].text, "아이디어 A");
    const updatedDocNode = updatedOutline.rootNodes[1];
    assert.equal(updatedDocNode.id, "n-doc-1");
    assert.equal(updatedDocNode.children[0].children[0].text, "수정된 소개 문구입니다.");
  });

  it("rewrites outlineRef and docBindings automatically on Vault file renames and queues reveal for newly mounted tabs", async () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "기획/원본.outline";
    const vdocPath = "기획/블로그.vdoc";

    const doc = createDefaultVDoc("블로그", "blog");
    doc.outlineRef = { outlinePath: toVaultUri(outlinePath), rootNodeId: "n-doc" };
    vault.createFile(vdocPath, serializeVDocJson(doc));

    const payload: OutlineFilePayload = {
      version: 1,
      id: "outline-rename",
      title: "원본",
      defaultView: "bullets",
      docBindings: {
        "n-doc": { vdocPath: toVaultUri(vdocPath), profileId: "blog" },
      },
      rootNodes: [{ id: "n-doc", text: "<<doc:blog>> 블로그", isFolded: false, children: [] }],
    };
    vault.createFile(outlinePath, serializeOutlineJson(payload));

    // Rename .outline -> .vdoc outlineRef updates automatically
    const renamedOutlinePath = "기획/마스터_개정.outline";
    vault.rename(outlinePath, renamedOutlinePath);
    runVaultRenameRewriters(vault, outlinePath, renamedOutlinePath, [
      rewriteVDocPointersOnRename,
      rewriteOutlineBindingsOnRename,
    ]);
    assert.equal(
      parseVDocJson(vault.read(vdocPath), "블로그").outlineRef?.outlinePath,
      toVaultUri(renamedOutlinePath)
    );

    // Rename .vdoc -> .outline docBindings updates automatically
    const renamedVDocPath = "기획/블로그_최종.vdoc";
    vault.rename(vdocPath, renamedVDocPath);
    runVaultRenameRewriters(vault, vdocPath, renamedVDocPath, [
      rewriteVDocPointersOnRename,
      rewriteOutlineBindingsOnRename,
    ]);
    assert.equal(
      parseOutlineJson(vault.read(renamedOutlinePath), "마스터").docBindings?.["n-doc"]?.vdocPath,
      toVaultUri(renamedVDocPath)
    );

    // Queued reveal fires when tab subscribes right after request
    requestOutlineReveal(renamedOutlinePath, "n-doc", { zoom: true });
    let received: { id: string; options?: OutlineRevealOptions } | null = null;
    const unsub = subscribeOutlineReveal(renamedOutlinePath, (id, options) => {
      received = { id, options };
    });
    await new Promise((r) => setTimeout(r, 10));
    unsub();
    assert.deepEqual(received, { id: "n-doc", options: { zoom: true } });
  });

  it("opens .outline in Chrome Tab Group Pair View without creating physical split panes and preserves multi-tab group pool", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const docAPath = "문서/제안서.vdoc";
    const docBPath = "문서/블로그.vdoc";
    vault.createFile(docAPath, serializeVDocJson(createDefaultVDoc("제안서", "a4")));
    vault.createFile(docBPath, serializeVDocJson(createDefaultVDoc("블로그", "blog")));

    const runtime = createIdeWorkbenchRuntime({
      persist: false,
      mode: "memory",
      vaultAdapter: vault,
    });

    try {
      // Case 1: Existing multi-tab Chrome Tab Group (`Group 1`) with Pair View [docA | docB]
      runtime.openVaultFile(docAPath, "current");
      const tabA = runtime.layout.getState().getActiveTab()!;
      runtime.openVaultFile(docBPath, "new-tab");
      const tabB = runtime.layout.getState().getActiveTab()!;
      const groupId = runtime.layout.getState().mergeTabsIntoGroup(tabB.id, tabA.id)!;
      runtime.layout.getState().enableTabGroupPair(groupId, {
        leftTabId: tabA.id,
        rightTabId: tabB.id,
        activeSide: "left",
      });

      // Click [구조] on docA -> creates .outline, adds it to Group 1 pool, replaces ONLY right pair slot!
      const res = openOrCreateOutlineForVDoc(vault, docAPath, (target) =>
        runtime.openFileInPairTabGroup(target, { sourceTabId: tabA.id, sourcePath: docAPath })
      );
      assert.ok(res);

      const state = runtime.layout.getState();
      // Must NOT create a separate physical split pane!
      assert.equal(state.getGroupCount(), 1);

      const pane = getAllGroups(state.root)[0];
      const groupTabs = pane.tabs.filter((t) => t.tabGroupId === groupId);
      const resourceIds = groupTabs.map((t) => t.resourceId);
      // All 3 tabs live in Group 1 pool (docB is NOT closed!)
      assert.ok(resourceIds.includes(docAPath));
      assert.ok(resourceIds.includes(docBPath));
      assert.ok(resourceIds.includes(res.outlinePath));
      assert.equal(groupTabs.length, 3);

      // Pair view slots are now [L: docA | R: docA.outline]
      const outlineTab = groupTabs.find((t) => t.resourceId === res.outlinePath)!;
      assert.equal(state.tabGroups[groupId]?.pair?.leftTabId, tabA.id);
      assert.equal(state.tabGroups[groupId]?.pair?.rightTabId, outlineTab.id);

      // Clicking again reuses the existing outline tab with zero duplicates
      openOrCreateOutlineForVDoc(vault, docAPath, (target) =>
        runtime.openFileInPairTabGroup(target, { sourceTabId: tabA.id, sourcePath: docAPath })
      );
      const afterSecond = getAllGroups(runtime.layout.getState().root)[0].tabs.filter(
        (t) => t.tabGroupId === groupId
      );
      assert.equal(afterSecond.length, 3);
    } finally {
      runtime.dispose();
    }
  });

  it("opens consecutive .outline attachment clicks inside ONE Pair Tab Group without spawning extra split panes", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const planPath = "계획/볼트_계획.outline";
    const f1 = "01. System/00. Proposal.outline";
    const f2 = "01. System/00. Proposal.vdoc";
    const f3 = "01. System/스키마.outline";
    const f4 = "01. System/style.vstyle";

    vault.createFile(
      planPath,
      serializeOutlineJson({ version: 1, id: "ol-plan", title: "볼트 계획", defaultView: "bullets", rootNodes: [], updatedAt: "" })
    );
    vault.createFile(
      f1,
      serializeOutlineJson({ version: 1, id: "ol-f1", title: "Proposal Outline", defaultView: "bullets", rootNodes: [], updatedAt: "" })
    );
    vault.createFile(f2, serializeVDocJson(createDefaultVDoc("Proposal", "a4")));
    vault.createFile(
      f3,
      serializeOutlineJson({ version: 1, id: "ol-f3", title: "스키마", defaultView: "bullets", rootNodes: [], updatedAt: "" })
    );
    vault.createFile(f4, JSON.stringify({ id: "style", name: "Style", tokens: {}, bindings: [] }));

    const runtime = createIdeWorkbenchRuntime({
      persist: false,
      mode: "memory",
      vaultAdapter: vault,
    });

    try {
      runtime.openVaultFile(planPath, "current");
      const planTab = runtime.layout.getState().getActiveTab()!;
      const filesHost = createVaultOutlineFiles({
        vault,
        getOutlinePath: () => planPath,
        openFile: (target) =>
          runtime.openFileInPairTabGroup(target, { sourceTabId: planTab.id, sourcePath: planPath }),
      });

      // Click 4 different attachment chips consecutively from the left .outline
      filesHost.open(f1);
      filesHost.open(f2);
      filesHost.open(f3);
      filesHost.open(f4);

      const state = runtime.layout.getState();
      // Must remain 1 physical pane (NO runaway split-right panes!)
      assert.equal(state.getGroupCount(), 1);
      const pane = getAllGroups(state.root)[0];
      const groupId = pane.tabs.find((t) => t.id === planTab.id)?.tabGroupId;
      assert.ok(groupId, "source .outline tab must belong to a Chrome Tab Group");

      const groupTabs = pane.tabs.filter((t) => t.tabGroupId === groupId);
      assert.deepEqual(
        new Set(groupTabs.map((t) => t.resourceId)),
        new Set([planPath, f1, f2, f3, f4])
      );
      assert.equal(groupTabs.length, 5);

      // Pair slots: left stays fixed on planPath, right shows the latest clicked attachment (f4)
      const pair = state.tabGroups[groupId]?.pair;
      assert.ok(pair);
      assert.equal(pair.leftTabId, planTab.id);
      assert.equal(
        pane.tabs.find((t) => t.id === pair.rightTabId)?.resourceId,
        f4
      );

      // Re-clicking an earlier attachment (f2) reuses its tab in the same group and swaps ONLY right slot
      filesHost.open(f2);
      const afterReclick = runtime.layout.getState();
      assert.equal(afterReclick.getGroupCount(), 1);
      const afterPane = getAllGroups(afterReclick.root)[0];
      assert.equal(afterPane.tabs.filter((t) => t.tabGroupId === groupId).length, 5);
      const afterPair = afterReclick.tabGroups[groupId]?.pair;
      assert.equal(afterPair?.leftTabId, planTab.id);
      assert.equal(
        afterPane.tabs.find((t) => t.id === afterPair?.rightTabId)?.resourceId,
        f2
      );
    } finally {
      runtime.dispose();
    }
  });

  it("ignores UI-only isFolded toggles and preserves rich A4 blocks (hero, columns-grid h3, horizontal-header table, non-CTA link-card, fixed frames) on sync", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const vdocPath = "01. Architecture/00. System-Proposal.vdoc";
    const sample = createSampleProposalVDoc();
    vault.createFile(vdocPath, serializeVDocJson(sample));

    const bound = openOrCreateOutlineForVDoc(vault, vdocPath);
    assert.ok(bound);

    // 1. Toggling `isFolded` on outline nodes MUST keep outlineSemanticSignature identical
    const payload = parseOutlineJson(vault.read(bound.outlinePath), "proposal");
    const sigBeforeFold = outlineSemanticSignature(payload.rootNodes);
    const foldedRoots = payload.rootNodes.map((n) => ({
      ...n,
      isFolded: !n.isFolded,
      children: n.children.map((c) => ({ ...c, isFolded: !c.isFolded })),
    }));
    const sigAfterFold = outlineSemanticSignature(foldedRoots);
    assert.equal(sigBeforeFold, sigAfterFold);

    // 2. Even if sync runs with untouched outline, ZERO rich A4 blocks are degraded
    syncAllBoundVDocsFromOutline(vault, bound.outlinePath, payload);
    const untouchedDoc = parseVDocJson(vault.read(vdocPath), "proposal");
    assert.equal(untouchedDoc.pages[0].blocks[0].kind, "hero");
    assert.equal(untouchedDoc.pages[0].blocks[1].kind, "columns-grid");
    if (untouchedDoc.pages[0].blocks[1].kind === "columns-grid") {
      assert.equal(untouchedDoc.pages[0].blocks[1].cardStyle, undefined);
      const col1Slot = untouchedDoc.pages[0].blocks[1].columns?.[0]?.slotId;
      assert.ok(col1Slot && untouchedDoc.slots[col1Slot].content.includes("<h3>2D-First 디렉팅</h3>"));
    }
    const tbl = untouchedDoc.pages[0].blocks[2];
    assert.equal(tbl.kind, "structured-table");
    if (tbl.kind === "structured-table") {
      assert.equal(tbl.rows[0].cells.every((c) => c.isHeader), true);
      assert.equal(Boolean(tbl.rows[1].cells[0].isHeader), false);
    }
    const link = untouchedDoc.pages[0].blocks[3];
    assert.equal(link.kind, "link-card");
    if (link.kind === "link-card") {
      assert.equal(link.variant, undefined);
    }
    assert.deepEqual(untouchedDoc.pages[1].blocks[0].frame, { x: 44, y: 48, w: 330, h: 170 });

    // 3. Editing ONLY the hero headline updates hero title while keeping kind==="hero" and all sibling blocks verbatim!
    const edited = parseOutlineJson(vault.read(bound.outlinePath), "proposal");
    const page1Sec = edited.rootNodes[0].children.find((n) => n.text.includes("Page 1"))!;
    page1Sec.children[0].text = "> VibeDoc 2D 아키텍처 제안서 v2";
    vault.write(bound.outlinePath, serializeOutlineJson(edited));

    const updated = syncAllBoundVDocsFromOutline(vault, bound.outlinePath, edited);
    assert.deepEqual(updated, [vdocPath]);

    const afterEdit = parseVDocJson(vault.read(vdocPath), "proposal");
    const heroBlk = afterEdit.pages[0].blocks[0];
    assert.equal(heroBlk.kind, "hero");
    if (heroBlk.kind === "hero") {
      assert.ok(afterEdit.slots[heroBlk.titleSlotId].content.includes("VibeDoc 2D 아키텍처 제안서 v2"));
    }
    // Untouched sibling link-card & fixed-frame cards remain 100% intact
    const linkAfter = afterEdit.pages[0].blocks[3];
    assert.equal(linkAfter.kind, "link-card");
    if (linkAfter.kind === "link-card") {
      assert.equal(linkAfter.variant, undefined);
    }
    assert.deepEqual(afterEdit.pages[1].blocks[0].frame, { x: 44, y: 48, w: 330, h: 170 });
  });

  it("preserves original outline tags (==highlight==, [img:2:...], @assetId, tree-indented table, <<view:list>>, memos) during Design(Filling) -> Structure sync", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "기획/풀사이클.outline";
    const master: OutlineFilePayload = {
      version: 1,
      id: "outline-full-cycle",
      title: "풀사이클",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "n-doc",
          text: "<<doc:blog>> 2026 리포트",
          isFolded: false,
          children: [
            {
              id: "n-internal-memo",
              text: "작성자 내부 메모 (비지시어 — 역동기화 시 유지)",
              isFolded: false,
              children: [],
            },
            {
              id: "n-sec",
              text: "<<view:section:spot>> 핵심 비교",
              isFolded: false,
              children: [
                { id: "n-p-edit", text: "수정 대상 문장입니다.", isFolded: false, children: [] },
                { id: "n-p-hi", text: "보존할 ==형광펜 문장== 입니다.", isFolded: false, children: [] },
                { id: "n-grid", text: "[img:2:좌측] | [img:1:우측]", isFolded: false, children: [] },
                {
                  id: "n-list",
                  text: "<<view:list>> 체크리스트",
                  isFolded: false,
                  children: [
                    { id: "n-li1", text: "항목 A", isFolded: false, children: [] },
                    { id: "n-li2", text: "항목 B", isFolded: false, children: [] },
                  ],
                },
                {
                  id: "n-tree-tbl",
                  text: "<<view:table @table-grouped-compare>> 복합 표",
                  isFolded: false,
                  children: [
                    {
                      id: "n-grp",
                      text: "그룹 A",
                      isFolded: false,
                      children: [
                        { id: "n-sub1", text: "세부 1 | 값 1", isFolded: false, children: [] },
                        { id: "n-sub2", text: "세부 2 | [<]", isFolded: false, children: [] },
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
    vault.createFile(outlinePath, serializeOutlineJson(master));

    // 1. Compile Outline -> .vdoc
    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, "n-doc");
    assert.ok(mat);
    const vdoc = parseVDocJson(vault.read(mat.vdocPath), "리포트");

    // 2. Filling(Design) edit on ONLY `n-p-edit` text slot
    const editBlk = vdoc.pages[0].blocks.find((b) => b.sourceNodeId === "n-p-edit");
    assert.ok(editBlk && editBlk.kind === "text");
    const filledDoc = setSlotContent(vdoc, editBlk.slotId, "<p>디자인 모드에서 다듬은 문장입니다.</p>");

    // 3. Explicit [구조 동기화] -> patches ONLY edited text, preserves ALL original tags & memos!
    const synced = syncVDocMeaningBackToOutline(vault, mat.vdocPath, filledDoc);
    assert.equal(synced, true);

    const after = parseOutlineJson(vault.read(outlinePath), "풀사이클");
    const docNode = after.rootNodes[0];
    assert.equal(docNode.children[0].id, "n-internal-memo");
    const secNode = docNode.children[1];
    assert.equal(secNode.text, "<<view:section:spot>> 핵심 비교");
    assert.equal(secNode.children[0].text, "디자인 모드에서 다듬은 문장입니다.");
    assert.equal(secNode.children[1].text, "보존할 ==형광펜 문장== 입니다.");
    assert.equal(secNode.children[2].text, "[img:2:좌측] | [img:1:우측]");
    assert.equal(secNode.children[3].text, "<<view:list>> 체크리스트");
    assert.equal(secNode.children[4].text, "<<view:table @table-grouped-compare>> 복합 표");
    assert.equal(secNode.children[4].children[0].children.length, 2);
    assert.equal(secNode.children[4].children[0].children[1].text, "세부 2 | [<]");
  });

  it("self-heals moved .vdoc and .outline links INSIDE the same .vproj via immutable IDs without spawning duplicates", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "여행프로젝트.vproj/원천구조.outline";
    const master: OutlineFilePayload = {
      version: 1,
      id: "outline-immutable-001",
      title: "원천구조",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "doc-root-1",
          text: "<<doc:blog>> 라스베가스 여행 가이드",
          isFolded: false,
          children: [
            {
              id: "sec-1",
              text: "<<view:section:hero>> 도입부",
              isFolded: false,
              children: [{ id: "p-1", text: "핵심 안내 본문", isFolded: false, children: [] }],
            },
          ],
        },
      ],
    };
    vault.createFile(outlinePath, serializeOutlineJson(master));

    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, "doc-root-1");
    assert.ok(mat);

    const createdDoc = parseVDocJson(vault.read(mat.vdocPath), "가이드");
    assert.equal(createdDoc.outlineRef?.outlineId, "outline-immutable-001");
    const createdOutline = parseOutlineJson(vault.read(outlinePath), "원천구조");
    assert.equal(createdOutline.docBindings?.["doc-root-1"]?.docId, createdDoc.docId);

    // 1. Move `.vdoc` into a nested subfolder INSIDE the same `.vproj` WITHOUT rename rewriters
    const movedVDocPath = "여행프로젝트.vproj/published/라스베가스 여행 가이드.vdoc";
    vault.rename(mat.vdocPath, movedVDocPath);

    const healedVDoc = resolveVDocForOutlineBinding(
      vault,
      outlinePath,
      "doc-root-1",
      parseOutlineJson(vault.read(outlinePath), "원천구조").docBindings!["doc-root-1"]
    );
    assert.ok(healedVDoc);
    assert.equal(healedVDoc.vdocPath, movedVDocPath);
    assert.equal(healedVDoc.healed, true);
    assert.equal(
      parseOutlineJson(vault.read(outlinePath), "원천구조").docBindings?.["doc-root-1"]?.vdocPath,
      toVaultUri(movedVDocPath)
    );

    // 2. Move `.outline` into another subfolder INSIDE the same `.vproj` WITHOUT rename rewriters
    const movedOutlinePath = "여행프로젝트.vproj/structures/원천구조_이동됨.outline";
    vault.rename(outlinePath, movedOutlinePath);

    const opened: string[] = [];
    const res = openOrCreateOutlineForVDoc(vault, movedVDocPath, (p) => opened.push(p), {
      allowCreate: false,
    });
    assert.ok(res);
    assert.equal(res.created, false);
    assert.equal(res.healed, true);
    assert.equal(res.outlinePath, movedOutlinePath);
    assert.deepEqual(opened, [movedOutlinePath]);

    // Verify zero duplicate `.outline` files exist in the vault
    const allOutlines = vault
      .listAll()
      .filter((n) => n.kind === "file" && n.path.endsWith(".outline"));
    assert.equal(allOutlines.length, 1);
    assert.equal(allOutlines[0].path, movedOutlinePath);

    const healedDoc = parseVDocJson(vault.read(movedVDocPath), "가이드");
    assert.equal(healedDoc.outlineRef?.outlinePath, toVaultUri(movedOutlinePath));
    assert.equal(healedDoc.outlineRef?.outlineId, "outline-immutable-001");
  });

  it("enforces strict .vproj project boundaries (blocks cross-project linking) and supports explicit import-to-project registration", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outsideOutline = "공용폴더/라스베가스_원천.outline";
    const projAVDoc = "문서정비/test-test project.vproj/라스베가스.vdoc";
    const projBOutline = "다른프로젝트.vproj/타프로젝트_구조.outline";

    assert.equal(isInSameProjectScope(projAVDoc, outsideOutline), false);
    assert.equal(isInSameProjectScope(projAVDoc, projBOutline), false);
    assert.equal(
      isInSameProjectScope(projAVDoc, "문서정비/test-test project.vproj/sub/구조.outline"),
      true
    );

    vault.createFile(
      outsideOutline,
      serializeOutlineJson({
        version: 1,
        id: "out-outside-01",
        title: "라스베가스 원천",
        defaultView: "bullets",
        rootNodes: [{ id: "lv-root", text: "<<doc:blog>> 라스베가스", isFolded: false, children: [] }],
      })
    );
    vault.createFile(
      projBOutline,
      serializeOutlineJson({
        version: 1,
        id: "out-proj-b",
        title: "타프로젝트 구조",
        defaultView: "bullets",
        rootNodes: [{ id: "b-root", text: "<<doc:blog>> 다른 프로젝트", isFolded: false, children: [] }],
      })
    );

    // Create a `.vdoc` inside `test-test project.vproj` whose stale `outlineRef` points OUTSIDE the `.vproj`
    const doc = createDefaultVDoc("라스베가스", "blog");
    doc.outlineRef = {
      outlinePath: toVaultUri(outsideOutline),
      outlineId: "out-outside-01",
      rootNodeId: "lv-root",
    };
    vault.createFile(projAVDoc, serializeVDocJson(doc));

    // 1. Cross-boundary resolution & direct binding MUST be refused!
    assert.equal(resolveOutlineForVDoc(vault, projAVDoc, undefined, { heal: false }), null);
    assert.equal(bindVDocToExistingOutline(vault, projAVDoc, outsideOutline), null);
    assert.equal(bindVDocToExistingOutline(vault, projAVDoc, projBOutline), null);

    // 2. Default candidate list MUST NOT leak external `.outline` files across `.vproj` boundaries
    assert.equal(collectOutlineCandidatesForVDoc(vault, projAVDoc).length, 0);
    assert.equal(
      collectOutlineCandidatesForVDoc(vault, projAVDoc, undefined, { includeExternal: true }).length,
      2
    );

    // 3. Link inspector accurately flags `out-of-scope` with the external outline path
    const statusBefore = inspectVDocOutlineLink(vault, projAVDoc);
    assert.equal(statusBefore.kind, "out-of-scope");
    if (statusBefore.kind === "out-of-scope") {
      assert.equal(statusBefore.externalOutlinePath, outsideOutline);
      assert.equal(statusBefore.currentProjectPath, "문서정비/test-test project.vproj");
    }

    // 4. Explicit [이 프로젝트로 등록 (가져오기)] moves the partner into `.vproj` and binds symmetrically!
    const imported = importPartnerIntoProjectAndBind(vault, projAVDoc, outsideOutline, {
      rootNodeId: "lv-root",
    });
    assert.ok(imported);
    assert.equal(imported.importedPath, "문서정비/test-test project.vproj/라스베가스_원천.outline");
    assert.equal(vault.exists(outsideOutline), false);
    assert.equal(vault.exists(imported.importedPath), true);

    const statusAfter = inspectVDocOutlineLink(vault, projAVDoc);
    assert.equal(statusAfter.kind, "linked");
    const outlineSideStatus = inspectOutlineNodeVDocLink(vault, imported.importedPath, "lv-root");
    assert.equal(outlineSideStatus.kind, "linked");
    if (outlineSideStatus.kind === "linked") {
      assert.equal(outlineSideStatus.vdocPath, projAVDoc);
    }

    // 5. Explicit unlink from the `.outline` side cleanly disconnects both sides
    assert.equal(unlinkOutlineNodeBinding(vault, imported.importedPath, "lv-root"), true);
    assert.equal(inspectVDocOutlineLink(vault, projAVDoc).kind, "unlinked");
    assert.equal(inspectOutlineNodeVDocLink(vault, imported.importedPath, "lv-root").kind, "unlinked");
  });

  it("auto-prunes stale nested <<view:section>> duplicate docBindings and never truncates multi-section .vdoc on compile", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "여행.vproj/가이드.outline";
    const vdocPath = "여행.vproj/가이드.vdoc";

    const doc = createDefaultVDoc("여행 가이드", "blog");
    doc.outlineRef = {
      outlinePath: toVaultUri(outlinePath),
      outlineId: "out-dup-guard",
      rootNodeId: "doc-root",
    };
    vault.createFile(vdocPath, serializeVDocJson(doc));

    // Simulate legacy corrupted `docBindings` with BOTH `doc-root` AND nested child `sec-2` pointing to the same `.vdoc`
    const payload: OutlineFilePayload = {
      version: 1,
      id: "out-dup-guard",
      title: "여행 가이드",
      defaultView: "bullets",
      docBindings: {
        "doc-root": { docId: doc.docId, vdocPath: toVaultUri(vdocPath), profileId: "blog" },
        "sec-2": { docId: doc.docId, vdocPath: toVaultUri(vdocPath), profileId: "blog" },
      },
      rootNodes: [
        {
          id: "doc-root",
          text: "<<doc:blog>> 여행 가이드",
          isFolded: false,
          children: [
            {
              id: "sec-1",
              text: "<<view:section:hero>> 섹션 1",
              isFolded: false,
              children: [{ id: "p-1", text: "첫 번째 섹션 본문", isFolded: false, children: [] }],
            },
            {
              id: "sec-2",
              text: "<<view:section:spot>> 섹션 2",
              isFolded: false,
              children: [{ id: "p-2", text: "두 번째 섹션 본문", isFolded: false, children: [] }],
            },
            {
              id: "sec-3",
              text: "<<view:section:spot>> 섹션 3",
              isFolded: false,
              children: [{ id: "p-3", text: "세 번째 섹션 본문", isFolded: false, children: [] }],
            },
          ],
        },
      ],
    };
    vault.createFile(outlinePath, serializeOutlineJson(payload));

    // 1. Compiling `doc-root` MUST produce ALL 3 sections AND auto-prune stale `sec-2` binding!
    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, "doc-root");
    assert.ok(mat);
    const compiledDoc = parseVDocJson(vault.read(vdocPath), "여행 가이드");
    assert.equal(compiledDoc.pages.length, 3);
    assert.equal(compiledDoc.outlineRef?.rootNodeId, "doc-root");

    const cleanedOutline = parseOutlineJson(vault.read(outlinePath), "여행 가이드");
    assert.deepEqual(Object.keys(cleanedOutline.docBindings ?? {}), ["doc-root"]);

    // 2. Attempting to bind to child `sec-2` automatically normalizes to enclosing `doc-root` with 0 duplicates!
    const rebound = bindVDocToExistingOutline(vault, vdocPath, outlinePath, {
      rootNodeId: "sec-2",
    });
    assert.ok(rebound);
    assert.equal(rebound.rootNodeId, "doc-root");
    assert.deepEqual(
      Object.keys(parseOutlineJson(vault.read(outlinePath), "여행 가이드").docBindings ?? {}),
      ["doc-root"]
    );
  });

  it("never collides slotId when inserting new plain bullets after existing blocks, and preserves nested plain-bullet hierarchies", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const outlinePath = "테스트.vproj/테스트.outline";
    const initial: OutlineFilePayload = {
      version: 1,
      id: "out-nested-plain",
      title: "테스트",
      defaultView: "bullets",
      rootNodes: [
        {
          id: "doc-a4",
          text: "<<doc:a4>> 테스트 문서",
          isFolded: false,
          children: [
            { id: "n-1", text: "테스트용 페이지", isFolded: false, children: [] },
          ],
        },
      ],
    };
    vault.createFile(outlinePath, serializeOutlineJson(initial));

    const mat = materializeVDocFromOutlineDirective(vault, outlinePath, "doc-a4");
    assert.ok(mat);

    // Now add a new sibling bullet AND a bullet with deep nested children (exact user repro!)
    const updated: OutlineFilePayload = {
      ...parseOutlineJson(vault.read(outlinePath), "테스트"),
      rootNodes: [
        {
          id: "doc-a4",
          text: "<<doc:a4>> 테스트 문서",
          isFolded: false,
          children: [
            { id: "n-1", text: "테스트용 페이지", isFolded: false, children: [] },
            { id: "n-2", text: "여기서 새로 만든거", isFolded: false, children: [] },
            {
              id: "n-3",
              text: "outline",
              isFolded: false,
              children: [
                { id: "n-3-1", text: "일단 만들었음", isFolded: false, children: [] },
                {
                  id: "n-3-2",
                  text: "추가적으로 구현한 것들",
                  isFolded: false,
                  children: [
                    { id: "n-3-2-1", text: "outline - doc 스키마 연동", isFolded: false, children: [] },
                    { id: "n-3-2-2", text: "outline - vdoc - design 스키마 통일", isFolded: false, children: [] },
                    { id: "n-3-2-3", text: "element 동기화", isFolded: false, children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    vault.write(outlinePath, serializeOutlineJson(updated));
    materializeVDocFromOutlineDirective(vault, outlinePath, "doc-a4");

    const doc = parseVDocJson(vault.read(mat.vdocPath), "테스트");
    assert.equal(doc.pages.length, 1);
    const blks = doc.pages[0].blocks;
    assert.equal(blks.length, 3);
    assert.equal(blks[0].kind, "text");
    assert.equal(blks[1].kind, "text");
    assert.equal(blks[2].kind, "text");

    // Zero slotId collisions!
    const slotIds = blks.map((b) => (b.kind === "text" ? b.slotId : ""));
    assert.equal(new Set(slotIds).size, 3);

    // Every bullet preserves its EXACT own content (no duplicate overwrite!)
    assert.ok(doc.slots[slotIds[0]].content.includes("테스트용 페이지"));
    assert.ok(doc.slots[slotIds[1]].content.includes("여기서 새로 만든거"));
    assert.ok(doc.slots[slotIds[2]].content.includes("outline"));
    assert.ok(doc.slots[slotIds[2]].content.includes("일단 만들었음"));
    assert.ok(doc.slots[slotIds[2]].content.includes("추가적으로 구현한 것들"));
    assert.ok(doc.slots[slotIds[2]].content.includes("outline - doc 스키마 연동"));
    assert.ok(doc.slots[slotIds[2]].content.includes("element 동기화"));
  });

  it("rewrites all descendant vault:// pointers when a parent folder is renamed or moved", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const oldFolder = "작업폴더/프로젝트1";
    const newFolder = "보관함/프로젝트1_완료";
    const outlinePath = `${oldFolder}/구조.outline`;
    const vdocPath = `${oldFolder}/문서.vdoc`;
    const stylePath = `${oldFolder}/테마.vstyle`;

    const doc = createDefaultVDoc("문서", "blog");
    doc.outlineRef = {
      outlinePath: toVaultUri(outlinePath),
      outlineId: "out-folder-test",
      rootNodeId: "n-doc",
    };
    doc.styleRef = { packId: "custom", packPath: toVaultUri(stylePath) };
    doc.sourceRef = toVaultUri(`${oldFolder}/참고.ref`);
    vault.createFile(vdocPath, serializeVDocJson(doc));
    vault.createFile(
      outlinePath,
      serializeOutlineJson({
        version: 1,
        id: "out-folder-test",
        title: "구조",
        defaultView: "bullets",
        docBindings: {
          "n-doc": { docId: doc.docId, vdocPath: toVaultUri(vdocPath), profileId: "blog" },
        },
        rootNodes: [{ id: "n-doc", text: "<<doc:blog>> 문서", isFolded: false, children: [] }],
      })
    );

    vault.rename(oldFolder, newFolder);
    runVaultRenameRewriters(vault, oldFolder, newFolder, [
      rewriteVDocPointersOnRename,
      rewriteOutlineBindingsOnRename,
    ]);

    const movedDoc = parseVDocJson(vault.read(`${newFolder}/문서.vdoc`), "문서");
    assert.equal(movedDoc.outlineRef?.outlinePath, toVaultUri(`${newFolder}/구조.outline`));
    assert.equal(movedDoc.styleRef?.packPath, toVaultUri(`${newFolder}/테마.vstyle`));
    assert.equal(movedDoc.sourceRef, toVaultUri(`${newFolder}/참고.ref`));

    const movedOutline = parseOutlineJson(vault.read(`${newFolder}/구조.outline`), "구조");
    assert.equal(
      movedOutline.docBindings?.["n-doc"]?.vdocPath,
      toVaultUri(`${newFolder}/문서.vdoc`)
    );
  });

  it("blocks silent auto-creation when allowCreate=false, supports explicit bind/rebind/unlink, and collects 1:N backlinks", () => {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    const vdocPath = "여행/라스베가스.vdoc";
    const outlineA = "여행/기존_라스베가스_구조.outline";
    const outlineB = "기타/다른_구조.outline";

    vault.createFile(vdocPath, serializeVDocJson(createDefaultVDoc("라스베가스 여행", "blog")));
    vault.createFile(
      outlineA,
      serializeOutlineJson({
        version: 1,
        id: "out-lv-a",
        title: "라스베가스 구조",
        defaultView: "bullets",
        rootNodes: [{ id: "lv-doc", text: "<<doc:blog>> 라스베가스 여행", isFolded: false, children: [] }],
      })
    );
    vault.createFile(
      outlineB,
      serializeOutlineJson({
        version: 1,
        id: "out-other-b",
        title: "다른 문서",
        defaultView: "bullets",
        rootNodes: [{ id: "other-doc", text: "<<doc:a4>> 다른 보고서", isFolded: false, children: [] }],
      })
    );

    // 1. allowCreate: false on unbound vdoc returns null and creates ZERO files
    const blocked = openOrCreateOutlineForVDoc(vault, vdocPath, undefined, { allowCreate: false });
    assert.equal(blocked, null);
    assert.equal(
      vault.listAll().filter((n) => n.kind === "file" && n.path.endsWith(".outline")).length,
      2
    );

    // 2. Candidate ranking puts same-folder + matching-title outline first
    const candidates = collectOutlineCandidatesForVDoc(vault, vdocPath);
    assert.equal(candidates[0]?.outlinePath, outlineA);
    assert.equal(candidates[0]?.sameFolder, true);

    // 3. Explicit bind pins both sides symmetrically and appears in Outline Backlinks
    const bound = bindVDocToExistingOutline(vault, vdocPath, outlineA);
    assert.ok(bound);
    assert.equal(bound.outlineId, "out-lv-a");
    assert.equal(bound.rootNodeId, "lv-doc");

    const resolved = resolveOutlineForVDoc(vault, vdocPath, undefined, { heal: false });
    assert.equal(resolved?.outlinePath, outlineA);
    assert.equal(resolved?.outlineId, "out-lv-a");

    const backlinksA = collectOutlineBacklinks(vault, outlineA);
    assert.equal(backlinksA.length, 1);
    assert.equal(backlinksA[0].vdocPath, vdocPath);
    assert.equal(backlinksA[0].broken, false);

    // 4. Rebinding to outlineB cleans up old binding from outlineA
    bindVDocToExistingOutline(vault, vdocPath, outlineB);
    assert.equal(collectOutlineBacklinks(vault, outlineA).length, 0);
    assert.equal(collectOutlineBacklinks(vault, outlineB).length, 1);

    // 5. Explicit unlink clears both sides cleanly
    const unlinked = unlinkVDocFromOutline(vault, vdocPath);
    assert.equal(unlinked, true);
    assert.equal(parseVDocJson(vault.read(vdocPath), "라스베가스").outlineRef, undefined);
    assert.equal(collectOutlineBacklinks(vault, outlineB).length, 0);
  });
});
