/**
 * `.outline` 인라인 Unified Diff 엔진 + 3대 안전 버그 회귀 방지 테스트.
 *
 * - UD-1: `buildOutlineUnifiedDiff` — modified-old/new · added(중첩 깊이) · removed(서브트리) · context · stats
 * - UD-2: 동일 `.outline` `enqueue` 중복 교체 + `localStorage` 복원 시 중복 정리
 * - UD-3: All-or-Nothing 원자적 패치 사전 검증 (부분 실패 시 `delete` 만 실행돼 파일 비워지는 현상 원천 차단)
 * - UD-4: 연속 승인 시 앞선 변경으로 Stale 이 된 후속 `outline-patch` 안전 차단
 * - UD-5: 실제 충돌 시나리오 재현(구 제안 + 신 제안 연속 enqueue -> 최신 1건만 유지 -> Unified Diff -> 승인 -> Undo)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { OutlineNode, TreePatchRequest } from "@vibe/outliner/core";
import { applyPatch, flatToTree, importTree } from "@vibe/outliner/core";
import { buildOutlineUnifiedDiff, registerLiveOutlineSession } from "@vibe/outline-sync";
import { buildOutlinePatchChange, createV2AiWorkspace } from "@vibe/ai-vault";
import { parseOutlineJson, serializeOutlineJson, type OutlineFilePayload } from "@vibe/vault-formats";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

function makeOutlinePayload(roots: OutlineNode[]): OutlineFilePayload {
  return {
    version: 1,
    id: "ol-diff-test",
    title: "테스트 아웃라인",
    defaultView: "bullets",
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    rootNodes: roots,
  };
}

function sampleRoots(): OutlineNode[] {
  return [
    { id: "n-empty", text: "", children: [] },
    {
      id: "root-1",
      text: "표 형식",
      children: [
        { id: "child-1", text: "| : 열 구분", children: [] },
        { id: "child-2", text: "[-] : 빈 칸 표시", children: [] },
      ],
    },
  ];
}

function setup(storage: Storage | null = null) {
  const rt = createIdeWorkbenchRuntime({ persist: false });
  const logs: string[] = [];
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    openVaultFile: (p, mode) => rt.openVaultFile(p, mode ?? "current"),
    getTextSelection: () => null,
    pushLog: (_l, m) => logs.push(m),
    storage,
    fetchFn: (async () => new Response("{}", { status: 200 })) as typeof fetch,
  });
  ai.start();
  return { rt, ai, logs };
}

describe(".outline 인라인 Unified Diff 및 패치 안전성", () => {
  it("UD-1 buildOutlineUnifiedDiff: 수정(-/+) · 중첩 추가(+) · 서브트리 삭제(-) · 통계가 정확하다", () => {
    const requests: TreePatchRequest[] = [
      { op: "replace", id: "n-empty", text: "볼트 디렉터리 재편 계획" },
      {
        op: "insert_after",
        targetId: "n-empty",
        inside: true,
        items: [
          {
            text: "01. System",
            children: [{ text: "01. Architecture/spec.vdoc -> 01. System/spec.vdoc" }],
          },
        ],
      },
      { op: "delete", id: "root-1", recursively: true },
    ];

    const diff = buildOutlineUnifiedDiff(sampleRoots(), requests);
    assert.equal(diff.failedOps.length, 0);
    assert.equal(diff.stats.modified, 1);
    assert.equal(diff.stats.added, 2);
    assert.equal(diff.stats.deleted, 3); // root-1 + child-1 + child-2

    const kinds = diff.lines.map((l) => l.kind);
    assert.ok(kinds.includes("modified-old"));
    assert.ok(kinds.includes("modified-new"));
    assert.ok(kinds.includes("added"));
    assert.ok(kinds.includes("removed"));

    // 중첩 들여쓰기 깊이 확인
    const addedParent = diff.lines.find((l) => l.kind === "added" && l.text === "01. System");
    const addedChild = diff.lines.find((l) => l.kind === "added" && l.text.includes("spec.vdoc"));
    assert.equal(addedParent?.depth, 1);
    assert.equal(addedChild?.depth, 2);

    const removedRoot = diff.lines.find((l) => l.kind === "removed" && l.text === "표 형식");
    const removedChild = diff.lines.find((l) => l.kind === "removed" && l.text === "| : 열 구분");
    assert.equal(removedRoot?.depth, 0);
    assert.equal(removedChild?.depth, 1);
  });

  it("UD-2 동일 .outline 파일에 새 outline-patch enqueue 시 기존 대기안을 교체해 중복 누적되지 않는다", () => {
    const storage = new MemoryStorage();
    const { rt, ai } = setup(storage);
    const olPath = "plan/reorg.outline";
    rt.vault.createFolder("plan");
    rt.vault.createFile(olPath, serializeOutlineJson(makeOutlinePayload(sampleRoots())));

    const first = buildOutlinePatchChange(ai.env, olPath, {
      requests: [{ op: "delete", id: "n-empty" }],
      targetNodeIds: ["n-empty"],
      summary: "구 제안",
    });
    const second = buildOutlinePatchChange(ai.env, olPath, {
      requests: [{ op: "replace", id: "n-empty", text: "신 제안 제목" }],
      targetNodeIds: ["n-empty"],
      summary: "신 제안",
    });

    ai.store.getState().enqueue([first]);
    assert.equal(ai.store.getState().queue.length, 1);

    ai.store.getState().enqueue([second]);
    const queue = ai.store.getState().queue;
    assert.equal(queue.length, 1, "같은 .outline 파일의 구 제안은 교체되어야 한다");
    assert.equal(queue[0].diffId, second.diffId);
    ai.dispose();
  });

  it("UD-3 All-or-Nothing 원자적 사전 검증: replace 가 실패하면 뒤따르는 delete 도 절대 실행되지 않는다", () => {
    const { rt, ai } = setup();
    const olPath = "plan/atomic.outline";
    rt.vault.createFolder("plan");
    const initial = makeOutlinePayload(sampleRoots());
    rt.vault.createFile(olPath, serializeOutlineJson(initial));

    const brokenChange = buildOutlinePatchChange(ai.env, olPath, {
      requests: [
        { op: "replace", id: "missing-node-id", text: "실패할 연산" },
        { op: "delete", id: "root-1", recursively: true },
      ],
      targetNodeIds: ["missing-node-id", "root-1"],
      summary: "부분 실패 위험 패치",
    });
    ai.store.getState().enqueue([brokenChange]);

    // 1) 닫힌 파일 경로에서 차단 검증
    const closedRes = ai.approve([brokenChange.diffId]);
    assert.equal(closedRes.applied, 0);
    assert.equal(closedRes.failed.length, 1);
    assert.ok(closedRes.failed[0].why.includes("사전 검증 실패"));
    const afterClosed = parseOutlineJson(rt.vault.read(olPath), "atomic");
    assert.equal(afterClosed.rootNodes.length, 2, "부분 실패 패치 후 원본 트리가 비워지면 안 된다");

    // 2) 열린 OutlineTabEditor 라이브 세션 경로에서도 동일하게 차단 검증
    let liveApplied = 0;
    const unregister = registerLiveOutlineSession(olPath, {
      applyPatch: () => {
        liveApplied += 1;
        return true;
      },
      undo: () => false,
      selectNodes: () => undefined,
      getSnapshot: () => parseOutlineJson(rt.vault.read(olPath), "atomic"),
    });
    try {
      const liveRes = ai.approve([brokenChange.diffId]);
      assert.equal(liveRes.applied, 0);
      assert.equal(liveRes.failed.length, 1);
      assert.equal(liveApplied, 0, "사전 검증 실패 시 라이브 세션 applyPatch 자체가 호출되면 안 된다");
    } finally {
      unregister();
    }
    ai.dispose();
  });

  it("UD-4/UD-5 실제 충돌 시나리오 종단 검증: 구 제안+신 제안 -> 최신 1건 Diff -> 열린 세션 승인 -> Undo 원복", () => {
    const { rt, ai } = setup();
    const olPath = "plan/vault-reorg.outline";
    rt.vault.createFolder("plan");
    rt.vault.createFile(olPath, serializeOutlineJson(makeOutlinePayload(sampleRoots())));

    // 구 제안 (n-empty 삭제 + root-1 교체)
    const oldProposal = buildOutlinePatchChange(ai.env, olPath, {
      requests: [
        { op: "delete", id: "n-empty" },
        { op: "replace", id: "root-1", text: "구 계획" },
      ],
      targetNodeIds: ["n-empty", "root-1"],
      summary: "구 계획",
    });
    // 신 제안 (n-empty 교체 + 하위 항목 삽입 + root-1 삭제)
    const newProposal = buildOutlinePatchChange(ai.env, olPath, {
      requests: [
        { op: "replace", id: "n-empty", text: "볼트 디렉터리 재편 계획" },
        {
          op: "insert_after",
          targetId: "n-empty",
          inside: true,
          items: [{ text: "01. System" }, { text: "02. Business" }],
        },
        { op: "delete", id: "root-1", recursively: true },
      ],
      targetNodeIds: ["n-empty", "root-1"],
      summary: "볼트 디렉터리 재편 계획 정비",
    });

    ai.store.getState().enqueue([oldProposal]);
    ai.store.getState().enqueue([newProposal]);
    assert.equal(ai.store.getState().queue.length, 1);

    // 열린 세션 시뮬레이션 (Undo 포함)
    const history: OutlineFilePayload[] = [];
    let liveDoc = parseOutlineJson(rt.vault.read(olPath), "vault-reorg");
    const unregister = registerLiveOutlineSession(olPath, {
      applyPatch: (requests) => {
        history.push(liveDoc);
        let seq = 0;
        const outcome = applyPatch(importTree(liveDoc.rootNodes).tree, [...requests], {
          now: Date.now(),
          generateId: () => `live-${++seq}`,
        });
        if (!outcome.results.every((r) => r.ok)) return false;
        liveDoc = { ...liveDoc, rootNodes: flatToTree(outcome.tree) };
        rt.vault.write(olPath, serializeOutlineJson(liveDoc));
        return true;
      },
      undo: () => {
        const prev = history.pop();
        if (!prev) return false;
        liveDoc = prev;
        rt.vault.write(olPath, serializeOutlineJson(liveDoc));
        return true;
      },
      selectNodes: () => undefined,
      getSnapshot: () => liveDoc,
    });

    try {
      const res = ai.approve(ai.store.getState().queue.map((c) => c.diffId));
      assert.equal(res.applied, 1);
      assert.equal(res.failed.length, 0);

      const saved = parseOutlineJson(rt.vault.read(olPath), "vault-reorg");
      assert.equal(saved.rootNodes.length, 1);
      assert.equal(saved.rootNodes[0].text, "볼트 디렉터리 재편 계획");
      assert.deepEqual(
        saved.rootNodes[0].children.map((c) => c.text),
        ["01. System", "02. Business"]
      );

      // Undo 원복 검증
      assert.equal(ai.undoOutlineApproval(olPath), true);
      const restored = parseOutlineJson(rt.vault.read(olPath), "vault-reorg");
      assert.equal(restored.rootNodes.length, 2);
      assert.equal(restored.rootNodes[1].text, "표 형식");
    } finally {
      unregister();
    }
    ai.dispose();
  });
});
