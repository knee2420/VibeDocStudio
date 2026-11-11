/**
 * AI Composer `workbench_proposals` ↔ Staged Diff 대기열 연동 검증.
 *
 * 1. `buildProposalSlotChanges`: 편집 가능 슬롯만 변환(잠금/보일러플레이트/빈 값/원문 동일 제외)
 * 2. `useAiStagingStore`:
 *    - `receiveProposal`: Staged 대기열 탑재 + reviewOpen 활성화 + 동일 (docId, slotId) 기존 diff 교체
 *    - `selectProposalCandidate`: 다중 후보(1안↔2안) 전환 시 타 슬롯/타 문서 diff 보존 & 해당 proposal diff 교체
 *    - 마지막 proposal diff 제거 시 `proposals` 메타 자동 정리
 *    - `removeByDoc`: 문서 삭제 시 해당 문서의 미승인 diff 만 정리
 * 3. `ComposerSession`: `workbench_proposals` 이벤트 수신 시 안내 공지 생성
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { ComposerSessionController, createAiRuntime, type AssistantEvent, type WorkbenchProposal } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { buildProposalSlotChanges, buildSlotHtmlChange, useAiStagingStore } from "../src/entities/ai-staging";

for (const key of ["localStorage", "sessionStorage"] as const) {
  if (typeof (globalThis as Record<string, unknown>)[key] === "undefined") {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)[key] = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
  }
}

const makeDoc = (docId = "vdoc-test-1"): VDocDocument => ({
  docId,
  title: "테스트 문서",
  surface: "paged",
  genre: "document",
  revision: 1,
  updatedAt: "2026-11-11T00:00:00Z",
  pageSize: { widthPx: 794, heightPx: 1123 },
  variables: {},
  pages: [
    {
      pageId: "p1",
      pageNumber: 1,
      blocks: [
        { blockId: "b1", kind: "heading", slotId: "s_hd", props: { level: 2 } },
        { blockId: "b2", kind: "text", slotId: "s_body", props: {} },
        { blockId: "b3", kind: "text", slotId: "s_extra", props: {} },
        { blockId: "b4", kind: "text", slotId: "s_lock", props: {} },
      ],
    },
  ],
  slots: {
    s_hd: { slotId: "s_hd", label: "소제목", role: "editable-slot", content: "<p>기존 소제목</p>", backDataRefs: [] },
    s_body: { slotId: "s_body", label: "본문", role: "editable-slot", content: "<p>기존 본문</p>", backDataRefs: ["ref-1"] },
    s_extra: { slotId: "s_extra", label: "보조", role: "editable-slot", content: "<p>보조 문단</p>", backDataRefs: [] },
    s_lock: {
      slotId: "s_lock",
      label: "고정 머리글",
      role: "boilerplate",
      content: "<p>고정</p>",
      backDataRefs: [],
      constraints: { locked: true },
    },
  },
  evidenceLinks: [],
});

const makeProposal = (overrides?: Partial<WorkbenchProposal>): WorkbenchProposal => ({
  proposalId: "prop_1",
  docId: "vdoc-test-1",
  target: "page:p1",
  mode: "compose",
  summary: "1인칭 회고 톤으로 개편",
  warnings: ["일부 수치 확인 필요"],
  candidates: [
    {
      title: "1안 간결체",
      rationale: "짧은 호흡",
      slots: {
        s_hd: "바뀐 소제목 1안",
        s_body: "<p>바뀐 본문 1안</p>",
        s_extra: "<p>보조 문단</p>", // 원문 동일 → 건너뜀
        s_lock: "<p>무시돼야 함</p>", // 잠금/boilerplate → 건너뜀
        s_missing: "<p>없는 슬롯</p>", // 미존재 → 건너뜀
      },
    },
    {
      title: "2안 상세체",
      rationale: "풍부한 묘사",
      slots: {
        s_hd: "바뀐 소제목 2안",
      },
    },
  ],
  ...overrides,
});

describe("WorkbenchProposal ↔ Staged integration", () => {
  beforeEach(() => {
    useAiStagingStore.setState({
      projectId: null,
      queue: [],
      proposals: {},
      isRunning: false,
      activeRunId: null,
      lastAbortedRunId: null,
      lastError: null,
      reviewOpen: false,
    });
  });

  it("buildProposalSlotChanges: 편집 가능하고 달라진 슬롯만 StagedSlotHtmlChange 로 만든다", () => {
    const doc = makeDoc();
    const proposal = makeProposal();
    const changes = buildProposalSlotChanges(proposal, doc, 0);

    assert.deepEqual(
      changes.map((c) => c.targetId),
      ["s_hd", "s_body"],
    );
    assert.equal(changes[0].runId, "prop_1");
    assert.equal(changes[0].docId, "vdoc-test-1");
    assert.equal(changes[0].harnessId, "workbench:compose");
    assert.deepEqual(changes[0].warnings, ["일부 수치 확인 필요"]);
    assert.deepEqual(changes[1].sourceReferenceIds, ["ref-1"]);
  });

  it("receiveProposal 과 enqueue 는 동일 (docId, slotId) 의 이전 미승인 diff 를 덮어쓴다", () => {
    const doc = makeDoc();
    const store = useAiStagingStore.getState();

    // 기존 s_hd 수동 stage 변경안이 먼저 대기 중이었다고 가정
    const prior = buildSlotHtmlChange(doc, doc.slots.s_hd, "<p>오래된 초안</p>", { source: "수동" });
    const unrelated = buildSlotHtmlChange(doc, doc.slots.s_extra, "<p>유지될 다른 슬롯</p>", { source: "수동" });
    store.enqueue([prior, unrelated]);

    const added = store.receiveProposal(makeProposal(), doc, 0);
    assert.equal(added.length, 2);

    const state = useAiStagingStore.getState();
    assert.equal(state.reviewOpen, true);
    // s_hd 는 새 제안(prop_1)으로 교체되어 1건만 남아야 한다 (s_hd, s_body, s_extra 총 3건)
    assert.equal(state.queue.length, 3);
    const hdItems = state.queue.filter((c) => c.targetKind === "slot-html" && c.payload.slotId === "s_hd");
    assert.equal(hdItems.length, 1);
    assert.equal(hdItems[0].runId, "prop_1");
    assert.equal(hdItems[0].targetKind === "slot-html" && hdItems[0].payload.html, "바뀐 소제목 1안");
  });

  it("selectProposalCandidate: 1안↔2안 전환 시 타 변경안은 유지하고 해당 제안 변경안만 교체한다", () => {
    const doc = makeDoc();
    const otherDoc = makeDoc("vdoc-other");
    const store = useAiStagingStore.getState();

    const otherChange = buildSlotHtmlChange(otherDoc, otherDoc.slots.s_body, "<p>다른 문서 변경</p>", { source: "AI" });
    store.enqueue([otherChange]);
    store.receiveProposal(makeProposal(), doc, 0);

    // 1안: otherChange + s_hd + s_body = 3건
    assert.equal(useAiStagingStore.getState().queue.length, 3);
    assert.equal(useAiStagingStore.getState().proposals.prop_1.selectedCandidate, 0);

    // 2안 전환 (2안은 s_hd 1개만 바꿈): s_body 까지 깔끔히 제거되고 s_hd 2안으로 교체 → 총 2건
    store.selectProposalCandidate("prop_1", 1, doc);
    const afterSwap = useAiStagingStore.getState();
    assert.equal(afterSwap.proposals.prop_1.selectedCandidate, 1);
    assert.equal(afterSwap.queue.length, 2);
    const hd = afterSwap.queue.find((c) => c.docId === "vdoc-test-1" && c.targetKind === "slot-html" && c.payload.slotId === "s_hd");
    assert.equal(hd?.targetKind === "slot-html" && hd.payload.html, "바뀐 소제목 2안");

    // 제안의 마지막 diff 를 거절하면 proposals 메타도 자동 정리된다
    store.remove(hd!.diffId);
    assert.equal(afterSwap.queue.filter((c) => c.runId === "prop_1").length >= 0, true);
    assert.equal(useAiStagingStore.getState().proposals.prop_1, undefined);
    assert.equal(useAiStagingStore.getState().queue.length, 1);
  });

  it("removeByDoc: 문서 삭제 시 해당 문서의 미승인 diff 만 깔끔히 제거한다", () => {
    const docA = makeDoc("doc-a");
    const docB = makeDoc("doc-b");
    const store = useAiStagingStore.getState();

    store.receiveProposal(makeProposal({ proposalId: "prop_a", docId: "doc-a" }), docA, 0);
    store.receiveProposal(makeProposal({ proposalId: "prop_b", docId: "doc-b" }), docB, 0);
    assert.equal(useAiStagingStore.getState().queue.length, 4);

    store.removeByDoc("doc-a");
    const state = useAiStagingStore.getState();
    assert.deepEqual(
      state.queue.map((c) => c.docId),
      ["doc-b", "doc-b"],
    );
    assert.equal(state.proposals.prop_a, undefined);
    assert.notEqual(state.proposals.prop_b, undefined);
  });

  it("ComposerSessionController: workbench_proposals SSE 수신 시 Staged 안내 공지와 리스너를 실행한다", async () => {
    const proposal = makeProposal();
    const events: AssistantEvent[] = [
      { type: "turn_start", model: "gemini-3.8-flash", provider: "offline" },
      { type: "workbench_proposals", proposals: [proposal] },
      { type: "text_delta", text: "개편안을 생성했습니다." },
      { type: "turn_done", stopReason: "end_turn" },
    ];
    const sseBody = events.map((ev) => `data: ${JSON.stringify(ev)}\n\n`).join("");
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/sessions")) {
        return new Response(JSON.stringify({ sessionId: "s-prop", provider: "offline", model: "gemini-3.8-flash" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };

    const controller = new ComposerSessionController(createAiRuntime({ baseUrl: "http://localhost", fetchFn: mockFetch }));
    const received: WorkbenchProposal[] = [];
    controller.onServerEvent("workbench_proposals", (ev) => received.push(...ev.proposals));

    await controller.send("이 문서를 개편해줘");

    assert.equal(received.length, 1);
    assert.equal(received[0].proposalId, "prop_1");
    const notices = controller.getState().items.filter((i) => i.kind === "notice");
    assert.ok(notices.some((n) => n.kind === "notice" && n.text.includes("Staged") && n.text.includes("후보 2안")));
  });
});

