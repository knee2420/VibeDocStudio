import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createSectionPage,
  setSlotContent,
  type VDocDocument,
} from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "../src/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "../src/entities/vdoc-document";
import { pageMutations } from "../src/features/mutate-document-pages";
import { historyTransaction, useHistoryStore } from "../src/shared/lib/history";

function makeBaseDoc(docId = "doc_test_1"): VDocDocument {
  const s1 = createSectionPage({
    pageId: "p1",
    pageNumber: 1,
    pageLabel: "첫 페이지",
    headerHtml: "<p>머리말</p>",
    footerHtml: "<p>꼬리말</p>",
    headingHtml: "<p>제목 1</p>",
    bodyHtml: "<p>본문 1</p>",
  });
  return {
    version: "1.0.0",
    docId,
    title: "테스트 문서",
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

describe("Undo coalesce & page mutation history", () => {
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
  });

  it("merges consecutive typing commits after page insert so 1st Undo reverts typing and 2nd Undo removes page", async () => {
    const base = makeBaseDoc();
    useStudioDocumentStore.getState().upsertDocument(base);

    const newPageId = pageMutations.insertBasicPage(base.docId, { pageLabel: "추가 페이지" });
    assert.ok(newPageId);
    assert.equal(useHistoryStore.getState().past.length, 1);

    const afterInsert = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(afterInsert.pages.length, 2);
    const bodySlotId = `${newPageId}_body`;
    assert.ok(afterInsert.slots[bodySlotId]);

    // Tiptap 300ms 디바운스 커밋이 연속 3번 들어오는 상황 시뮬레이션
    const commitTyping = (html: string) => {
      useStudioDocumentStore.getState().updateCurrentDoc(
        (doc) => setSlotContent(doc, bodySlotId, html),
        { history: true, label: "슬롯 내용 수정", coalesceKey: `slot-content:${bodySlotId}` }
      );
    };
    commitTyping("<p>가</p>");
    commitTyping("<p>가나</p>");
    commitTyping("<p>가나다</p>");

    // 연속 타이핑은 하나의 Undo 항목으로 합쳐진다 (총 2개: 페이지 추가 + 타이핑)
    assert.equal(useHistoryStore.getState().past.length, 2);
    assert.equal(
      selectActiveDocument(useStudioDocumentStore.getState())!.slots[bodySlotId].content,
      "<p>가나다</p>"
    );

    // 첫 Ctrl+Z: 페이지는 남고 타이핑 전체만 한 번에 되돌아간다
    await useHistoryStore.getState().undo();
    const afterFirstUndo = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(afterFirstUndo.pages.length, 2);
    assert.equal(afterFirstUndo.slots[bodySlotId].content, "<p></p>");

    // 두 번째 Ctrl+Z: 추가한 페이지가 제거된다
    await useHistoryStore.getState().undo();
    const afterSecondUndo = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(afterSecondUndo.pages.length, 1);
    assert.equal(afterSecondUndo.slots[bodySlotId], undefined);

    // Redo 두 번: 페이지와 최종 타이핑 모두 복원
    await useHistoryStore.getState().redo();
    await useHistoryStore.getState().redo();
    const afterRedo = selectActiveDocument(useStudioDocumentStore.getState())!;
    assert.equal(afterRedo.pages.length, 2);
    assert.equal(afterRedo.slots[bodySlotId].content, "<p>가나다</p>");
  });

  it("stops coalescing when an unrelated key intervenes and keeps project-scope history across doc switch", async () => {
    const docA = makeBaseDoc("doc_a");
    const docB = makeBaseDoc("doc_b");
    useStudioDocumentStore.getState().upsertDocument(docA);
    useStudioDocumentStore.getState().upsertDocument(docB);
    useStudioDocumentStore.getState().setActiveDocId("doc_a");

    const slotId = "p1_body";
    useStudioDocumentStore.getState().updateCurrentDoc(
      (doc) => setSlotContent(doc, slotId, "<p>1차</p>"),
      { history: true, label: "내용 1", coalesceKey: `slot-content:${slotId}` }
    );
    useStudioDocumentStore.getState().updateCurrentDoc(
      (doc) => doc, // unchanged ref -> no push
      { history: true }
    );
    useStudioDocumentStore.getState().updateCurrentDoc(
      (doc) => setSlotContent(doc, slotId, "<p>2차</p>"),
      { history: true, label: "스타일 변경", coalesceKey: `slot-style:${slotId}` }
    );
    useStudioDocumentStore.getState().updateCurrentDoc(
      (doc) => setSlotContent(doc, slotId, "<p>3차</p>"),
      { history: true, label: "내용 3", coalesceKey: `slot-content:${slotId}` }
    );
    assert.equal(useHistoryStore.getState().past.length, 3);

    // project 범위 트랜잭션은 문서를 바꿔도 남는다
    await historyTransaction("프로젝트 단위 이름 동기화", "project", async () => {
      useHistoryStore.getState().push({
        label: "동기화 항목",
        scope: "project",
        undo: () => {},
        redo: () => {},
      });
    });
    assert.equal(useHistoryStore.getState().past.length, 4);

    useStudioDocumentStore.getState().setActiveDocId("doc_b");
    const remaining = useHistoryStore.getState().past;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].scope, "project");
    assert.equal(remaining[0].label, "프로젝트 단위 이름 동기화");
  });

  it("restores removed page, pruned exclusive slots, and exact preview thumbnails on Undo after removePage", async () => {
    const doc = makeBaseDoc("doc_remove");
    const p2 = createSectionPage({
      pageId: "p2",
      pageNumber: 2,
      pageLabel: "둘째 페이지",
      headerHtml: "<p>공유 머리말</p>",
      footerHtml: "<p>꼬리말 2</p>",
      headingHtml: "<p>제목 2</p>",
      bodyHtml: "<p>본문 2</p>",
    });
    // p1 과 p2 가 p1_header 를 공유하도록 구성한다
    doc.pages.push({ ...p2.page, headerSlotId: "p1_header" });
    doc.slots = { ...doc.slots, ...p2.slots };
    delete doc.slots["p2_header"];
    doc.preview = { pageThumbnails: ["thumb-p1.png", "thumb-p2.png"] };

    useStudioDocumentStore.getState().upsertDocument(doc);
    useHistoryStore.setState({ past: [], future: [], lastMessage: null });

    const ok = pageMutations.removePage("doc_remove", "p2");
    assert.equal(ok, true);

    const afterDelete = useStudioDocumentStore.getState().docs[0];
    assert.equal(afterDelete.pages.length, 1);
    assert.ok(afterDelete.slots["p1_header"], "remaining page header slot must stay intact");
    assert.equal(afterDelete.slots["p2_body"], undefined, "orphan exclusive slot must be pruned");
    assert.deepEqual(afterDelete.preview?.pageThumbnails, ["thumb-p1.png"]);

    await useHistoryStore.getState().undo();
    const afterUndo = useStudioDocumentStore.getState().docs[0];
    assert.equal(afterUndo.pages.length, 2);
    assert.equal(afterUndo.pages[1].pageId, "p2");
    assert.equal(afterUndo.slots["p2_body"]?.content, "<p>본문 2</p>");
    assert.deepEqual(afterUndo.preview?.pageThumbnails, ["thumb-p1.png", "thumb-p2.png"]);
  });
});

