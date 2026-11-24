/**
 * `.outline` ↔ `ai-composer` ↔ `resource` 통합 단위/연동 테스트 (E2, E3, E4, E5).
 *
 * - E2: `@vibe/ai-scope` 아웃라인 범위 + 서브트리 `baseHash` Stale 판정 (무관한 브랜치 편집 시 stale=false)
 * - E3: `collectOutlineResources` 문서 파일(`.vdoc`/`.outline`/`.ref`) 제외 + `sourcesOn=false` 존중 (강제 마운트 없음)
 * - E4: `workbench_proposals` SSE(`outlinePatch`) -> Staged 큐 -> 열린 `OutlineTabEditor` 세션 `applyPatch` 승인 -> Undo 원복
 * - E5: `resource:vault:` 이미지 해석 + `nodeEvidence` 사이드카 -> `outline.compileCheck` 객관 측정값 -> `.vdoc` 컴파일 `EvidenceLink` 승계
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyPatch, flatToTree, importTree, type OutlineNode } from "@vibe/outliner/core";
import { computeOutlineSubtreeHash, outlineScopeAllowsNode, resolveOutlineScope } from "@vibe/ai-scope";
import type { ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import { collectOutlineResources, registerLiveOutlineSession, mergeOutlineNodeEvidence } from "@vibe/outline-sync";
import { createV2AiWorkspace } from "@vibe/ai-vault";
import { parseOutlineJson, parseVDocJson, serializeOutlineJson, type OutlineFilePayload } from "@vibe/vault-formats";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const CTX: ToolRunContext = { callId: "c-ol", sessionId: null, signal: new AbortController().signal };

function makeSampleOutline(): OutlineFilePayload {
  return {
    version: 1,
    id: "ol-test-1",
    title: "테스트 아웃라인",
    defaultView: "bullets",
    docBindings: {
      "n-doc": {
        docId: "doc-ol-1",
        vdocPath: "vault://01. Architecture/00. System-Proposal.vdoc",
        profileId: "a4",
      },
    },
    rootNodes: [
      {
        id: "n-doc",
        text: "<<doc:a4>> 시스템 제안서",
        isFolded: false,
        children: [
          {
            id: "n-sec1",
            text: "<<view:section>> 1. 개요",
            isFolded: false,
            children: [
              { id: "n-p1", text: "초기 개요 본문", isFolded: false, children: [] },
              { id: "n-link", text: "참고: [[notes]] 및 [[00. System-Proposal.vdoc]]", isFolded: false, children: [] },
            ],
          },
          {
            id: "n-sec2",
            text: "<<view:section>> 2. 예산",
            isFolded: false,
            children: [
              { id: "n-p2", text: "총 예산 5000만원 투입", isFolded: false, children: [] },
            ],
          },
        ],
      },
    ],
  };
}

function setup(fetchFn?: typeof fetch) {
  const rt = createIdeWorkbenchRuntime({ persist: false });
  rt.vault.createFolder("02. Resources");
  rt.vault.createFile("02. Resources/notes.md", "# 참고 노트\n총 예산 5000만원");
  rt.vault.createFile("02. Resources/cover.png", "png-stub");
  rt.vault.createFile("01. Architecture/master.outline", serializeOutlineJson(makeSampleOutline()));
  rt.openVaultFile("01. Architecture/master.outline", "current");

  const logs: string[] = [];
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    openVaultFile: (p, mode) => rt.openVaultFile(p, mode ?? "current"),
    getTextSelection: () => rt.getActiveSelection(),
    pushLog: (_l, m) => logs.push(m),
    storage: null,
    fetchFn: fetchFn ?? ((async () => new Response("{}", { status: 200 })) as typeof fetch),
  });
  ai.start();
  return { rt, ai, logs };
}

describe(".outline ↔ ai-composer ↔ resource 통합 (E2~E5)", () => {
  it("E2: @vibe/ai-scope 아웃라인 범위 잠금 + 서브트리 baseHash Stale 격리 판정", () => {
    const ol = makeSampleOutline();
    const scope = resolveOutlineScope(
      "01. Architecture/master.outline",
      ol.rootNodes,
      { mode: "selection", fixed: true, rootNodeIds: ["n-sec1"] },
      {},
      true
    );
    assert.equal(outlineScopeAllowsNode(scope, "n-sec1"), true);
    assert.equal(outlineScopeAllowsNode(scope, "n-p1"), true);
    assert.equal(outlineScopeAllowsNode(scope, "n-sec2"), false);
    assert.equal(outlineScopeAllowsNode(scope, "n-p2"), false);

    const { rt, ai } = setup();
    const hSec1 = computeOutlineSubtreeHash(ol.rootNodes, ["n-sec1"]);
    const change = {
      path: "01. Architecture/master.outline",
      diffId: "stg-e2",
      phase: "storylining" as const,
      targetKind: "outline-patch" as const,
      targetId: "n-sec1",
      title: "섹션1 수정",
      beforeSummary: "초기",
      afterSummary: "수정",
      payload: {
        requests: [{ op: "replace", id: "n-p1", text: "수정됨" }],
        targetNodeIds: ["n-sec1"],
      },
      sourceReferenceIds: [],
      baseHash: hSec1,
    };

    // 무관한 브랜치(n-sec2)를 수정해도 n-sec1 대상 변경안은 stale 이 아니어야 함
    const editedOther = makeSampleOutline();
    editedOther.rootNodes[0].children[1].children[0].text = "예산 6000만원으로 변경";
    rt.vault.write("01. Architecture/master.outline", serializeOutlineJson(editedOther));
    assert.equal(ai.isStale(change), false);

    // 대상 서브트리(n-sec1) 안의 노드를 수정하면 stale=true
    editedOther.rootNodes[0].children[0].children[0].text = "사람이 직접 고친 개요";
    rt.vault.write("01. Architecture/master.outline", serializeOutlineJson(editedOther));
    assert.equal(ai.isStale(change), true);
    ai.dispose();
  });

  it("E3: resourceCollector 문서 파일 제외 + sourcesOn=false 존중 (강제 마운트 금지)", () => {
    const { rt, ai } = setup();
    const ol = parseOutlineJson(rt.vault.read("01. Architecture/master.outline"), "master");
    // 이미지 첨부 추가
    ol.rootNodes[0].children[0].file = { target: "02. Resources/cover.png" };
    rt.vault.write("01. Architecture/master.outline", serializeOutlineJson(ol));

    const collected = collectOutlineResources(rt.vault, "01. Architecture/master.outline", ol.rootNodes);
    const paths = collected.items.map((i) => i.path);
    assert.ok(paths.includes("02. Resources/notes.md"), "순수 리소스 .md 포함");
    assert.ok(paths.includes("02. Resources/cover.png"), "이미지 첨부 포함");
    assert.ok(!paths.some((p) => p.endsWith(".vdoc")), "문서 파일 .vdoc 은 제외되어야 함");

    // 제안 칩으로만 노출되며 settings.resourceFolders 를 몰래 바꾸지 않음
    assert.equal(ai.store.getState().resourceFolders.length, 0);
    const suggestedOn = ai.runtime.contexts.suggestedContexts();
    assert.ok(suggestedOn.some((c) => c.meta?.path === "02. Resources/notes.md"));

    // sourcesOn=false 면 제안 칩도 비워야 함
    ai.store.getState().setSourcesOn(false);
    const suggestedOff = ai.runtime.contexts.suggestedContexts();
    assert.ok(!suggestedOff.some((c) => c.meta?.path === "02. Resources/notes.md"));
    ai.dispose();
  });

  it("E4: workbench_proposals(outlinePatch) -> Staged -> 열린 세션 applyPatch 승인 -> Undo 완전 원복", async () => {
    const { rt, ai } = setup(async (input) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        return new Response(JSON.stringify({ sessionId: "s-ol-e4", provider: "offline", model: "offline" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/messages")) {
        const sse = [
          `data: ${JSON.stringify({
            type: "workbench_proposals",
            proposals: [
              {
                proposalId: "olp-e4",
                docId: "ol-test-1",
                target: "outline:01. Architecture/master.outline",
                mode: "outline-patch",
                summary: "개요 문단 수정",
                candidates: [],
                outlinePatch: {
                  path: "01. Architecture/master.outline",
                  baseHash: computeOutlineSubtreeHash(makeSampleOutline().rootNodes, ["n-p1"]),
                  targetNodeIds: ["n-p1"],
                  requests: [{ op: "replace", id: "n-p1", text: "AI가 제안한 개요 본문" }],
                  nodeEvidence: {
                    "n-p1": [{ kind: "resource", refId: "vault:02. Resources/notes.md", label: "notes.md", sourcePath: "02. Resources/notes.md" }],
                  },
                },
              },
            ],
          })}\n\n`,
          `data: ${JSON.stringify({ type: "turn_done", stopReason: "end_turn" })}\n\n`,
        ].join("");
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response("{}", { status: 200 });
    });

    // 열린 OutlineTabEditor 세션을 시뮬레이션 (Undo 히스토리 포함)
    const history: OutlineFilePayload[] = [];
    let liveDoc = parseOutlineJson(rt.vault.read("01. Architecture/master.outline"), "master");
    let liveApplyCount = 0;
    const unregister = registerLiveOutlineSession("01. Architecture/master.outline", {
      applyPatch: (requests, nodeEvidence) => {
        liveApplyCount += 1;
        history.push(JSON.parse(JSON.stringify(liveDoc)) as OutlineFilePayload);
        const imported = importTree(liveDoc.rootNodes);
        const outcome = applyPatch(imported.tree, [...requests], { now: Date.now(), generateId: () => "new-1" });
        liveDoc = {
          ...liveDoc,
          rootNodes: flatToTree(outcome.tree),
          nodeEvidence: mergeOutlineNodeEvidence(liveDoc.nodeEvidence, nodeEvidence),
        };
        rt.vault.write("01. Architecture/master.outline", serializeOutlineJson(liveDoc));
        return outcome.results.every((r) => r.ok);
      },
      undo: () => {
        const prev = history.pop();
        if (!prev) return false;
        liveDoc = prev;
        rt.vault.write("01. Architecture/master.outline", serializeOutlineJson(liveDoc));
        return true;
      },
      selectNodes: () => {},
      getSnapshot: () => liveDoc,
    });

    try {
      await ai.controller.send("개요 고쳐줘", []);
      const staged = ai.store.getState().queue.find((c) => c.targetKind === "outline-patch");
      assert.ok(staged, "기존 workbench_proposals 를 통해 Staged 큐에 적재되어야 함");

      // 승인 -> 열린 세션 applyPatch 경유 확인
      const res = ai.approve([staged!.diffId]);
      assert.equal(res.applied, 1);
      assert.equal(liveApplyCount, 1);
      assert.equal(liveDoc.rootNodes[0].children[0].children[0].text, "AI가 제안한 개요 본문");
      assert.equal(liveDoc.nodeEvidence?.["n-p1"]?.[0]?.sourcePath, "02. Resources/notes.md");

      // 1클릭 되돌리기 -> 열린 세션 undo() 호출 및 원문 완전 복원
      assert.equal(ai.undoOutlineApproval("01. Architecture/master.outline"), true);
      assert.equal(liveDoc.rootNodes[0].children[0].children[0].text, "초기 개요 본문");
    } finally {
      unregister();
      ai.dispose();
    }
  });

  it("E5: resource:vault: 이미지 해석 + nodeEvidence -> outline.compileCheck 측정값 + .vdoc EvidenceLink 승계", async () => {
    const { rt, ai } = setup();
    const ol = makeSampleOutline();
    ol.rootNodes[0].children[0].children.push({
      id: "n-img",
      text: "[img:대표 커버 -> resource:vault:02. Resources/cover.png]",
      isFolded: false,
      children: [],
    } as OutlineNode);
    ol.nodeEvidence = {
      "n-sec2": [{ kind: "resource", refId: "vault:02. Resources/notes.md", label: "notes.md", sourcePath: "02. Resources/notes.md" }],
    };
    rt.vault.write("01. Architecture/master.outline", serializeOutlineJson(ol));

    const getSyntax = ai.runtime.tools.get("outline.getSyntax") as WorkspaceTool<any>;
    const syntax = (await getSyntax.run({}, CTX)) as { elements: unknown[]; profiles: unknown[] };
    assert.ok(syntax.profiles.length > 0 && syntax.elements.length > 0);

    const compileCheck = ai.runtime.tools.get("outline.compileCheck") as WorkspaceTool<any>;
    const report = (await compileCheck.run({ path: "01. Architecture/master.outline" }, CTX)) as {
      measurements: {
        nodeCount: number;
        compiledBlockCount: number;
        unresolvedImages: string[];
        inheritedEvidenceLinks: number;
      };
    };
    assert.ok(report.measurements.nodeCount >= 6);
    assert.ok(report.measurements.compiledBlockCount > 0);
    assert.deepEqual(report.measurements.unresolvedImages, []);
    assert.ok(report.measurements.inheritedEvidenceLinks > 0, "사이드카 nodeEvidence 가 컴파일된 .vdoc EvidenceLink 로 승계되어야 함");

    // 승인 + 바인딩 .vdoc 자동 재컴파일 검증
    const patchChange = {
      path: "01. Architecture/master.outline",
      diffId: "stg-e5",
      phase: "storylining" as const,
      targetKind: "outline-patch" as const,
      targetId: "n-p2",
      title: "예산 근거 반영",
      beforeSummary: "총 예산 5000만원 투입",
      afterSummary: "총 예산 5000만원 확정",
      payload: {
        requests: [{ op: "replace", id: "n-p2", text: "총 예산 5000만원 확정" } as Record<string, unknown>],
        targetNodeIds: ["n-p2"],
        nodeEvidence: {
          "n-p2": [{ kind: "resource" as const, refId: "vault:02. Resources/notes.md", label: "notes.md", sourcePath: "02. Resources/notes.md" }],
        },
        compiledDocPath: "01. Architecture/00. System-Proposal.vdoc",
      },
      sourceReferenceIds: [],
    };
    ai.store.getState().enqueue([patchChange]);
    const res = ai.approve(["stg-e5"], { recompileBoundVDocs: true });
    assert.equal(res.applied, 1);

    const recompiledVDoc = parseVDocJson(rt.vault.read("01. Architecture/00. System-Proposal.vdoc"), "proposal");
    assert.ok((recompiledVDoc.evidenceLinks?.length ?? 0) > 0, "재컴파일된 .vdoc 파일에 EvidenceLink 가 영속 저장되어야 함");
    ai.dispose();
  });
});
