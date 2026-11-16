import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSectionPage, type VDocDocument } from "@vibe/vdoc-schema";

import { documentApi } from "../src/entities/vdoc-document/api/documentApi";
import { useStudioDocumentStore } from "../src/entities/vdoc-document";
import { ApiError } from "../src/shared/api";
import { useHistoryStore } from "../src/shared/lib/history";

// 자동 저장은 window.setTimeout 을 쓴다 (node 에는 window 가 없다).
(globalThis as { window?: unknown }).window ??= globalThis;

const AUTOSAVE_WAIT = 1000; // AUTOSAVE_DELAY_MS(800) + 여유
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeDoc(): VDocDocument {
  const s = createSectionPage({
    pageId: "p1",
    pageNumber: 1,
    pageLabel: "원래 제목",
    headerHtml: "<p>머리말</p>",
    footerHtml: "<p>꼬리말</p>",
    headingHtml: "<p>제목</p>",
    bodyHtml: "<p>본문</p>",
  });
  return {
    version: "1.0.0",
    docId: "doc_undo_save",
    title: "테스트",
    status: "Draft",
    updatedAt: "2026-11-16T00:00:00.000Z",
    revision: 1,
    variables: {},
    pages: [s.page],
    slots: s.slots,
    backdata: {},
  } as VDocDocument;
}

/** 실제 서버처럼 baseRevision 이 다르면 409 로 거절하는 가짜 저장소. */
function fakeServer(latencyMs = 0) {
  const server = { revision: 1, stored: makeDoc(), conflicts: 0, saves: 0 };
  documentApi.save = async (doc, opts = {}) => {
    await wait(latencyMs);
    if (opts.baseRevision !== server.revision) {
      server.conflicts++;
      throw new ApiError("PUT", "/documents", 409, `서버 버전 ${server.revision}, 보낸 기준 ${opts.baseRevision}`);
    }
    server.saves++;
    server.revision++;
    server.stored = { ...doc, revision: server.revision };
    return server.stored;
  };
  return server;
}

const originalSave = documentApi.save;
const label = () => useStudioDocumentStore.getState().docs[0].pages[0].pageLabel;
const relabel = (text: string) =>
  useStudioDocumentStore.getState().updateDoc(
    "doc_undo_save",
    (doc) => ({ ...doc, pages: doc.pages.map((p) => ({ ...p, pageLabel: text })) }),
    { history: true, label: "제목 바꾸기" }
  );

describe("Undo/Redo 가 서버에 저장된다 (revision 충돌 없이)", () => {
  beforeEach(() => {
    useHistoryStore.setState({ past: [], future: [], lastMessage: null });
    const doc = makeDoc();
    useStudioDocumentStore.setState({
      docs: [doc],
      activeDocId: doc.docId,
      activePageId: "p1",
      persistedDocIds: new Set([doc.docId]),
      saveState: { [doc.docId]: "saved" },
      lastError: null,
    });
  });
  afterEach(() => {
    documentApi.save = originalSave;
  });

  it("편집이 저장된 뒤 Undo · Redo 도 서버에 남는다", async () => {
    const server = fakeServer();
    relabel("바뀐 제목");
    await wait(AUTOSAVE_WAIT);
    assert.equal(server.stored.pages[0].pageLabel, "바뀐 제목");

    await useHistoryStore.getState().undo();
    await wait(AUTOSAVE_WAIT);
    assert.equal(label(), "원래 제목");
    assert.equal(server.stored.pages[0].pageLabel, "원래 제목", "Undo 가 서버에 저장돼야 한다");
    assert.equal(server.conflicts, 0);
    assert.equal(useStudioDocumentStore.getState().saveState.doc_undo_save, "saved");

    await useHistoryStore.getState().redo();
    await wait(AUTOSAVE_WAIT);
    assert.equal(server.stored.pages[0].pageLabel, "바뀐 제목", "Redo 도 서버에 저장돼야 한다");
    assert.equal(server.conflicts, 0);
  });

  it("편집 저장이 아직 진행 중일 때 Undo 해도 충돌 없이 되돌림이 저장된다", async () => {
    // 느린 서버(1초): 편집 저장(800ms 에 출발, 1.8초에 응답)이 끝나기 전에 Undo 저장(1.65초)이 출발할 차례가 된다.
    // 저장을 겹쳐 보내면 Undo 저장이 옛 기준(1)으로 나가 409 가 난다.
    const server = fakeServer(1000);
    relabel("바뀐 제목");
    await wait(850); // 편집 저장이 막 나간 시점 (아직 응답 전)
    await useHistoryStore.getState().undo();
    await wait(AUTOSAVE_WAIT + 2200);
    assert.equal(server.conflicts, 0);
    assert.equal(server.stored.pages[0].pageLabel, "원래 제목");
    assert.equal(useStudioDocumentStore.getState().saveState.doc_undo_save, "saved");
  });
});
