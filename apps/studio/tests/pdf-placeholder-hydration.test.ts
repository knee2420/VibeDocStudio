import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createSectionPage,
  getBlockSlotIds,
  setSlotContent,
  type VDocDocument,
} from "@vibe/vdoc-schema";

import { usePdfScaffoldJobStore, type ScaffoldJob, type ScaffoldJobEvent } from "../src/entities/scaffold-job";
import { useSlotSelectionStore } from "../src/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "../src/entities/vdoc-document";
import { pageMutations } from "../src/features/mutate-document-pages";
import { useHistoryStore } from "../src/shared/lib/history";

function makeBaseDoc(docId = "doc_async_test"): VDocDocument {
  const s1 = createSectionPage({
    pageId: "p1",
    pageNumber: 1,
    pageLabel: "기존 페이지 1",
    headerHtml: "<p>머리말</p>",
    footerHtml: "<p>꼬리말</p>",
    headingHtml: "<p>제목 1</p>",
    bodyHtml: "<p>원래 본문</p>",
  });
  return {
    version: "1.0.0",
    docId,
    title: "동시 편집 테스트 문서",
    status: "Draft",
    updatedAt: "2026-11-10T00:00:00.000Z",
    variables: {},
    pages: [s1.page],
    slots: s1.slots,
    backdata: {},
    preview: {
      pageThumbnails: ["thumb-p1.png"],
    },
  };
}

describe("Async PDF placeholder reservation, sequential spinner baton & ID-based Undo", () => {
  beforeEach(() => {
    useHistoryStore.setState({ past: [], future: [], lastMessage: null });
    useSlotSelectionStore.getState().clearSelection();
    useStudioDocumentStore.setState({
      docs: [],
      activeDocId: "",
      activePageId: "",
      persistedDocIds: new Set<string>(),
      saveState: {},
      lastError: null,
    });
    usePdfScaffoldJobStore.setState({
      jobs: {},
      pageStatesByPageId: {},
      pageJobRefByPageId: {},
      hydratedPageIds: {},
      lastError: null,
    });
    usePdfScaffoldJobStore.getState().registerSyncHandlers(null);
  });

  it("preserves concurrent edits on existing pages during hydration and performs ID-based Undo/Redo", async () => {
    const base = makeBaseDoc();
    useStudioDocumentStore.getState().upsertDocument(base);

    const reservation = pageMutations.reservePdfPlaceholderPages(
      base.docId,
      [
        { pageNumber: 2, thumbnailDataUrl: "thumb-src-2" },
        { pageNumber: 4, thumbnailDataUrl: "thumb-src-4" },
      ],
      { title: "제안서 양식" }
    );
    assert.ok(reservation);
    assert.equal(reservation.reserved.length, 2);

    const ph1 = reservation.reserved[0].placeholderPageId;
    const ph2 = reservation.reserved[1].placeholderPageId;

    let docNow = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(docNow.pages.length, 3);
    assert.deepEqual(docNow.preview?.pageThumbnails, ["thumb-p1.png", "thumb-src-2", "thumb-src-4"]);
    assert.equal(useHistoryStore.getState().past.length, 1);

    // 사용자가 대기 중 1페이지에 동시 타이핑 수행
    useStudioDocumentStore.getState().updateCurrentDoc(
      (doc) => setSlotContent(doc, "p1_body", "<p>사용자가 동시에 작성 중인 본문</p>"),
      { history: true, label: "슬롯 내용 수정", coalesceKey: "slot-content:p1_body" }
    );
    assert.equal(useHistoryStore.getState().past.length, 2);

    // 백그라운드에서 첫 번째 예약 페이지(ph1) 추출 완료 → history:false 로 제자리 교체
    const extracted = createSectionPage({
      pageId: "tmp_extracted",
      pageNumber: 1,
      pageLabel: "제안서 양식 (2p)",
      headerHtml: "<p></p>",
      footerHtml: "<p></p>",
      headingHtml: "<p>추출된 2페이지 제목</p>",
      bodyHtml: "<p>기관: {{orgName}}</p>",
    });
    const hydratedOk = pageMutations.hydrateReservedPdfPage(base.docId, ph1, extracted.page, extracted.slots, {
      thumbnail: "thumb-hydrated-2",
      sourceVariables: { orgName: "KOICA" },
    });
    assert.equal(hydratedOk, true);

    docNow = selectActiveDocument(useStudioDocumentStore.getState())!;
    // 1) 기존 페이지 동시 타이핑이 덮어써지지 않고 그대로 살아 있어야 한다
    assert.equal(docNow.slots["p1_body"]?.content, "<p>사용자가 동시에 작성 중인 본문</p>");
    // 2) 추출된 페이지가 ph1 자리에 꽂히고 변수·썸네일이 반영되며 Undo 스택은 2개 유지
    const hydratedPage1 = docNow.pages.find((p) => p.pageId === ph1)!;
    assert.ok(hydratedPage1.blocks.length > 0);
    const firstHydratedSlotId = getBlockSlotIds(hydratedPage1.blocks[0])[0];
    assert.ok(docNow.slots[firstHydratedSlotId]);
    assert.equal(docNow.variables.orgName, "KOICA");
    assert.equal(docNow.preview?.pageThumbnails?.[1], "thumb-hydrated-2");
    assert.equal(useHistoryStore.getState().past.length, 2);

    // Undo #1: 직전 타이핑만 되돌리고, 추출 완료된 ph1 과 대기 중인 ph2 는 유지한다
    await useHistoryStore.getState().undo();
    docNow = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(docNow.slots["p1_body"]?.content, "<p>원래 본문</p>");
    assert.equal(docNow.pages.length, 3);
    assert.ok(docNow.pages.find((p) => p.pageId === ph1)!.blocks.length > 0);

    // Undo #2: ID 기반 Undo 가 예약·이식한 ph1, ph2 만 제거한다
    await useHistoryStore.getState().undo();
    docNow = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(docNow.pages.length, 1);
    assert.equal(docNow.pages[0].pageId, "p1");

    // Redo #1: ph1(수화된 블록 포함), ph2 를 다시 복원한다
    await useHistoryStore.getState().redo();
    docNow = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(docNow.pages.length, 3);
    assert.ok(docNow.pages.find((p) => p.pageId === ph1)!.blocks.length > 0);
  });

  it("moves spinner exclusively to the active page and hydrates once on page_completed", () => {
    const base = makeBaseDoc();
    useStudioDocumentStore.getState().upsertDocument(base);
    const reservation = pageMutations.reservePdfPlaceholderPages(base.docId, [
      { pageNumber: 2, thumbnailDataUrl: "t2" },
      { pageNumber: 3, thumbnailDataUrl: "t3" },
    ])!;
    const [r1, r2] = reservation.reserved;

    let hydrateCalls = 0;
    usePdfScaffoldJobStore.getState().registerSyncHandlers({
      onHydratePage: ({ job, placeholderPageId, page, slots }) => {
        hydrateCalls += 1;
        pageMutations.hydrateReservedPdfPage(job.targetDocId, placeholderPageId, page, slots);
      },
    });

    const job: ScaffoldJob = {
      jobId: "sjob_1",
      title: "테스트 양식",
      targetDocId: base.docId,
      mode: "insert-pages",
      fidelityMode: "balanced",
      status: "running",
      createdAt: "2026-11-10T00:00:00Z",
      updatedAt: "2026-11-10T00:00:01Z",
      currentPageNumber: 2,
      error: null,
      completedCount: 0,
      totalCount: 2,
      pages: [
        {
          pageNumber: 2,
          placeholderPageId: r1.placeholderPageId,
          status: "running",
          stage: "fidelity_iter",
          iter: 1,
          verdict: null,
          spanScore: null,
          message: "검증 중",
          warnings: [],
          error: null,
          thumbnail: "t2",
          blockCount: 0,
          slotCount: 0,
        },
        {
          pageNumber: 3,
          placeholderPageId: r2.placeholderPageId,
          status: "queued",
          stage: "queued",
          iter: 0,
          verdict: null,
          spanScore: null,
          message: "순서 대기 중",
          warnings: [],
          error: null,
          thumbnail: "t3",
          blockCount: 0,
          slotCount: 0,
        },
      ],
    };

    usePdfScaffoldJobStore.getState().upsertJob(job);
    let states = usePdfScaffoldJobStore.getState().pageStatesByPageId;
    assert.equal(states[r1.placeholderPageId]?.status, "running");
    assert.equal(states[r2.placeholderPageId]?.status, "queued");
    assert.equal(states[r2.placeholderPageId]?.queuePosition, 2);
    assert.equal(states[r2.placeholderPageId]?.totalInJob, 2);

    const extracted2 = createSectionPage({
      pageId: "ext_2",
      pageNumber: 1,
      pageLabel: "테스트 양식 (2p)",
      headerHtml: "<p></p>",
      footerHtml: "<p></p>",
      headingHtml: "<p>2p 제목</p>",
      bodyHtml: "<p>2p 본문</p>",
    });

    const completedEv: ScaffoldJobEvent = {
      seq: 3,
      type: "page_completed",
      jobId: "sjob_1",
      targetDocId: base.docId,
      status: "running",
      currentPageNumber: 2,
      completedCount: 1,
      totalCount: 2,
      ts: 1000,
      detail: {
        pageNumber: 2,
        placeholderPageId: r1.placeholderPageId,
        pageTask: {
          pageNumber: 2,
          placeholderPageId: r1.placeholderPageId,
          status: "completed",
          stage: "completed",
          iter: 1,
          verdict: "PASS",
          spanScore: 98,
          message: "완료",
          warnings: [],
          error: null,
          blockCount: 1,
          slotCount: 4,
        },
        page: extracted2.page,
        slots: extracted2.slots,
      },
    };
    usePdfScaffoldJobStore.getState().applyEvent(completedEv);

    const nextStartedEv: ScaffoldJobEvent = {
      seq: 4,
      type: "page_started",
      jobId: "sjob_1",
      targetDocId: base.docId,
      status: "running",
      currentPageNumber: 3,
      completedCount: 1,
      totalCount: 2,
      ts: 1001,
      detail: {
        pageNumber: 3,
        placeholderPageId: r2.placeholderPageId,
        pageTask: {
          pageNumber: 3,
          placeholderPageId: r2.placeholderPageId,
          status: "running",
          stage: "extracting",
          iter: 0,
          verdict: null,
          spanScore: null,
          message: "시작",
          warnings: [],
          error: null,
          blockCount: 0,
          slotCount: 0,
        },
      },
    };
    usePdfScaffoldJobStore.getState().applyEvent(nextStartedEv);

    states = usePdfScaffoldJobStore.getState().pageStatesByPageId;
    // 완료된 1번 페이지는 오버레이/스피너 제거, 대기 중이던 2번 페이지가 실행 중(running)으로 전환
    assert.equal(states[r1.placeholderPageId], undefined);
    assert.equal(states[r2.placeholderPageId]?.status, "running");
    assert.equal(hydrateCalls, 1);

    // 같은 이벤트 재적용 시 중복 hydrate 방지 확인
    usePdfScaffoldJobStore.getState().applyEvent(completedEv);
    assert.equal(hydrateCalls, 1);
  });
});

