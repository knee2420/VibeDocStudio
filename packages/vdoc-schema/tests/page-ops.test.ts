/**
 * page-ops 단위 테스트 — 페이지 삽입 · 타 문서 템플릿 가져오기 · 사본 복제 · 이름 변경 · 삭제.
 *
 *   pnpm --filter @vibe/vdoc-schema test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSectionPage,
  duplicatePage,
  importPagesFromDocument,
  insertPages,
  removePage,
  renamePage,
  replacePageContent,
  type VDocDocument,
  type VDocSlot,
} from "../src";

function makeIdFactory() {
  let n = 0;
  return () => `id${++n}`;
}

function makeDoc(docId = "doc_a"): VDocDocument {
  const mkSlot = (slotId: string, label: string, content: string, refs: string[] = []): VDocSlot => ({
    slotId,
    label,
    role: "editable-slot",
    content,
    backDataRefs: refs,
  });

  return {
    version: "1.0.0",
    docId,
    title: "문서 A",
    status: "Draft",
    updatedAt: "2026-11-10T00:00:00Z",
    variables: { "Project.Name": "VibeDocStudio", ExistingKey: "KeepMine" },
    backdata: {
      bd_1: { chunkId: "bd_1", sourceTitle: "소스1", sourceType: "markdown", excerpt: "발췌", updatedAt: "", tags: [] },
    },
    preview: {
      pageThumbnails: ["/thumbs/p1.png", "/thumbs/p2.png"],
    },
    evidenceLinks: [
      {
        slotId: "s_p1_body",
        claim: "주장",
        locator: { kind: "resource", refId: "res_1", label: "문서1" },
        status: "ok",
      },
    ],
    pages: [
      {
        pageId: "p1",
        pageNumber: 1,
        pageLabel: "표지",
        headerSlotId: "s_shared_hdr",
        footerSlotId: "s_p1_ftr",
        blocks: [
          {
            blockId: "b_p1",
            kind: "section-block",
            title: "개요",
            headingSlotId: "s_p1_hdg",
            bodySlotId: "s_p1_body",
          },
        ],
      },
      {
        pageId: "p2",
        pageNumber: 2,
        pageLabel: "본문",
        headerSlotId: "s_shared_hdr", // p1 과 머리말 공유
        footerSlotId: "s_p2_ftr",
        blocks: [
          {
            blockId: "b_p2",
            kind: "section-block",
            title: "세부",
            headingSlotId: "s_p2_hdg",
            bodySlotId: "s_p2_body",
          },
        ],
      },
    ],
    slots: {
      s_shared_hdr: mkSlot("s_shared_hdr", "공통 머리말", "<p>회사명</p>"),
      s_p1_ftr: mkSlot("s_p1_ftr", "바닥글1", "<p>1</p>"),
      s_p2_ftr: mkSlot("s_p2_ftr", "바닥글2", "<p>2</p>"),
      s_p1_hdg: mkSlot("s_p1_hdg", "제목1", "<p>제목1</p>"),
      s_p1_body: {
        ...mkSlot("s_p1_body", "본문1", "<p>내용1</p>", ["bd_1"]),
        isEdited: true,
        originalContent: "<p>원본</p>",
        fill: { author: "ai", at: "2026-11-10T00:00:00Z" },
      },
      s_p2_hdg: mkSlot("s_p2_hdg", "제목2", "<p>제목2</p>"),
      s_p2_body: mkSlot("s_p2_body", "본문2", "<p>내용2</p>"),
    },
  };
}

describe("page-ops 순수 연산", () => {
  it("insertPages: 중간 삽입 시 pageNumber 를 재부여하고 썸네일 배열도 밀리지 않게 빈 값을 끼운다", () => {
    const doc = makeDoc();
    const { page, slots } = createSectionPage({
      pageId: "p_new",
      pageNumber: 99,
      pageLabel: "중간 페이지",
      headerHtml: "<p></p>",
      footerHtml: "<p></p>",
      headingHtml: "<p>새 제목</p>",
      bodyHtml: "<p>새 본문</p>",
    });

    const next = insertPages(doc, [page], slots, 1);
    assert.deepEqual(
      next.pages.map((p) => [p.pageId, p.pageNumber]),
      [
        ["p1", 1],
        ["p_new", 2],
        ["p2", 3],
      ]
    );
    assert.deepEqual(next.preview?.pageThumbnails, ["/thumbs/p1.png", "", "/thumbs/p2.png"]);
    assert.ok(next.slots["p_new_body"] !== undefined || Object.keys(next.slots).some((k) => k.includes("p_new")));
  });

  it("duplicatePage: 같은 문서 복제 시 공유 머리말과 backDataRefs 는 유지하고 본문 블록·슬롯만 새 ID 로 복제한다", () => {
    const doc = makeDoc();
    const next = duplicatePage(doc, "p1", makeIdFactory());

    assert.equal(next.pages.length, 3);
    assert.equal(next.pages[1].pageLabel, "표지 (사본)");
    assert.equal(next.pages[1].pageNumber, 2);
    assert.equal(next.pages[2].pageNumber, 3);
    // 공통 머리말 공유 유지
    assert.equal(next.pages[1].headerSlotId, "s_shared_hdr");
    assert.equal(next.pages[1].footerSlotId, "s_p1_ftr");
    // 썸네일도 복제 위치에 함께 삽입
    assert.deepEqual(next.preview?.pageThumbnails, ["/thumbs/p1.png", "/thumbs/p1.png", "/thumbs/p2.png"]);

    // 본문 블록과 슬롯은 새 ID여야 하며 backDataRefs 는 유지된다
    const clonedBlock = next.pages[1].blocks[0] as { blockId: string; bodySlotId: string };
    assert.notEqual(clonedBlock.blockId, "b_p1");
    assert.notEqual(clonedBlock.bodySlotId, "s_p1_body");
    assert.deepEqual(next.slots[clonedBlock.bodySlotId]?.backDataRefs, ["bd_1"]);
  });

  it("importPagesFromDocument: 다른 문서에서 가져오면 backDataRefs/fill 은 비우고, 공유 머리말은 새 ID 끼리 공유하며, 없는 변수만 병합한다", () => {
    const target = makeDoc("doc_target");
    const source: VDocDocument = {
      ...makeDoc("doc_template"),
      variables: {
        ExistingKey: "TemplateShouldNotOverwrite",
        "Blog.CTA": "지금 구독하기",
        "Author.Name": "홍길동",
      },
      preview: {
        pageThumbnails: ["/tmpl/t1.png", "/tmpl/t2.png"],
      },
      slots: {
        ...makeDoc("doc_template").slots,
        s_p1_body: {
          slotId: "s_p1_body",
          label: "본문1",
          role: "editable-slot",
          content: '<p><span data-variable="Blog.CTA">[Blog.CTA]</span> 및 {{Author.Name}} / {{ExistingKey}}</p>',
          backDataRefs: ["bd_1"],
          isEdited: true,
          originalContent: "<p>old</p>",
          fill: { author: "ai", at: "2026-11-10T00:00:00Z" },
        },
      },
    };

    const next = importPagesFromDocument(target, source, ["p1", "p2"], makeIdFactory());
    assert.equal(next.pages.length, 4);
    const imp1 = next.pages[2];
    const imp2 = next.pages[3];

    // 타 문서에서 온 페이지들은 target 과 다른 새 headerSlotId 를 쓰되, 가져온 두 페이지끼리는 공유 관계 유지
    assert.notEqual(imp1.headerSlotId, "s_shared_hdr");
    assert.equal(imp1.headerSlotId, imp2.headerSlotId);
    assert.ok(next.slots[imp1.headerSlotId]);

    // 본문 슬롯의 backDataRefs, fill, isEdited, originalContent 초기화 확인
    const impBlock1 = imp1.blocks[0] as { bodySlotId: string };
    const impSlot1 = next.slots[impBlock1.bodySlotId];
    assert.deepEqual(impSlot1.backDataRefs, []);
    assert.equal(impSlot1.fill, undefined);
    assert.equal(impSlot1.isEdited, undefined);
    assert.equal(impSlot1.originalContent, undefined);

    // 변수 병합: 기존 키는 유지, 새 키만 추가
    assert.equal(next.variables.ExistingKey, "KeepMine");
    assert.equal(next.variables["Blog.CTA"], "지금 구독하기");
    assert.equal(next.variables["Author.Name"], "홍길동");

    // evidenceLinks 는 늘어나지 않고, 썸네일은 원본 템플릿 캡처와 함께 추가됨
    assert.equal(next.evidenceLinks?.length, 1);
    assert.deepEqual(next.preview?.pageThumbnails, [
      "/thumbs/p1.png",
      "/thumbs/p2.png",
      "/tmpl/t1.png",
      "/tmpl/t2.png",
    ]);
  });

  it("renamePage: pageLabel 을 수정하고 빈 문자열은 무시한다", () => {
    const doc = makeDoc();
    assert.equal(renamePage(doc, "p1", "   "), doc);
    assert.equal(renamePage(doc, "p1", "표지"), doc);
    const next = renamePage(doc, "p1", "새 표지 이름");
    assert.equal(next.pages[0].pageLabel, "새 표지 이름");
  });

  it("removePage: 고아 슬롯은 정리하되 공유 중인 머리말은 보존하고, 썸네일 밀림 없이 제거하며, 마지막 1페이지는 지우지 않는다", () => {
    const doc = makeDoc();
    const afterRemoveP1 = removePage(doc, "p1");

    assert.equal(afterRemoveP1.pages.length, 1);
    assert.equal(afterRemoveP1.pages[0].pageId, "p2");
    assert.equal(afterRemoveP1.pages[0].pageNumber, 1);
    // 단독 슬롯은 삭제됨
    assert.equal(afterRemoveP1.slots["s_p1_body"], undefined);
    assert.equal(afterRemoveP1.slots["s_p1_hdg"], undefined);
    assert.equal(afterRemoveP1.slots["s_p1_ftr"], undefined);
    // p2가 여전히 참조하는 공통 머리말은 살아있어야 함
    assert.ok(afterRemoveP1.slots["s_shared_hdr"] !== undefined);
    // 썸네일 인덱스 동기 삭제
    assert.deepEqual(afterRemoveP1.preview?.pageThumbnails, ["/thumbs/p2.png"]);

    // 마지막 1페이지는 삭제 불가
    const same = removePage(afterRemoveP1, "p2");
    assert.equal(same, afterRemoveP1);
    assert.equal(same.pages.length, 1);
  });

  it("replacePageContent: 예약된 placeholderPageId 와 pageNumber 를 유지한 채 실제 블록·슬롯·썸네일만 갈아 끼운다", () => {
    const doc = makeDoc();
    const { page: reserved, slots: reservedSlots } = createSectionPage({
      pageId: "pending_pdf_3",
      pageNumber: 3,
      pageLabel: "PDF (3p) 대기 중",
      headerHtml: "<p></p>",
      footerHtml: "<p></p>",
      headingHtml: "<p></p>",
      bodyHtml: "<p></p>",
    });
    const withPlaceholder = insertPages(doc, [{ ...reserved, blocks: [] }], {
      [reserved.headerSlotId]: reservedSlots[reserved.headerSlotId],
      [reserved.footerSlotId]: reservedSlots[reserved.footerSlotId],
    });
    assert.equal(withPlaceholder.pages.length, 3);

    const { page: hydrated, slots: hydratedSlots } = createSectionPage({
      pageId: "page_1",
      pageNumber: 1,
      pageLabel: "추출 완료 (3p)",
      headerHtml: "<p>머리글</p>",
      footerHtml: "<p>- 3 -</p>",
      headingHtml: "<p>3쪽 제목</p>",
      bodyHtml: '<p>본문 <span data-variable="Org.Name">[Org.Name]</span></p>',
    });

    const next = replacePageContent(withPlaceholder, "pending_pdf_3", hydrated, hydratedSlots, {
      newId: makeIdFactory(),
      thumbnail: "data:image/jpeg;base64,PAGE3",
      sourceVariables: { "Org.Name": "테스트기관" },
    });

    assert.equal(next.pages.length, 3);
    assert.equal(next.pages[2].pageId, "pending_pdf_3");
    assert.equal(next.pages[2].pageNumber, 3);
    assert.equal(next.pages[2].pageLabel, "추출 완료 (3p)");
    assert.equal(next.pages[2].blocks.length, 1);
    // 예약 페이지의 옛 임시 머리말·바닥글 슬롯은 정리됨
    assert.equal(next.slots[reserved.headerSlotId], undefined);
    assert.equal(next.slots[reserved.footerSlotId], undefined);
    // 새 ID 로 클론되어 들어갔으며 변수 · 썸네일이 정확히 index 2 에 반영됨
    assert.notEqual(next.pages[2].headerSlotId, hydrated.headerSlotId);
    assert.ok(next.slots[next.pages[2].headerSlotId]);
    assert.equal(next.variables["Org.Name"], "테스트기관");
    assert.deepEqual(next.preview?.pageThumbnails, ["/thumbs/p1.png", "/thumbs/p2.png", "data:image/jpeg;base64,PAGE3"]);
  });
});

