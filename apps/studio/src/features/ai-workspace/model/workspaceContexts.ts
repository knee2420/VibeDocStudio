import type { ContextProvider, ContextRef } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { slotContext, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { htmlToPlain } from "@/shared/lib";

import { backdataRef, blockRef, docIndex, pageRef, referenceRef, resolveContextContent, slotRef, variableRef } from "./contextBuilders";
import { referenceDocs } from "./referenceDocs";

const doc = (): VDocDocument | undefined => selectActiveDocument(useStudioDocumentStore.getState());

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true;
  return fields.some((f) => f.toLowerCase().includes(query));
}

export const WORKSPACE_CONTEXT_PROVIDERS: ContextProvider[] = [
  {
    id: "selection",
    label: "현재 선택한 슬롯",
    auto: true,
    current: () => {
      const d = doc();
      const slotId = useSlotSelectionStore.getState().selectedSlotId;
      const slot = d && slotId ? d.slots[slotId] : undefined;
      return d && slot ? [slotContext(d, slot, "selection")] : [];
    },
  },
  {
    id: "document",
    label: "열린 문서",
    auto: true,
    current: () => {
      const d = doc();
      if (!d) return [];
      const pageId = useStudioDocumentStore.getState().activePageId;
      const page = d.pages.find((p) => p.pageId === pageId);
      return [
        {
          kind: "document",
          id: d.docId,
          label: d.title,
          content: `docId: ${d.docId}\ntitle: ${d.title}\nstatus: ${d.status}\npages: ${d.pages.length}\nactivePage: ${page?.pageLabel ?? pageId}\n(구조는 document.getOutline 도구로 읽는다)`,
          hint: `${d.pages.length}페이지`,
        },
      ];
    },
  },
  {
    id: "slots",
    label: "슬롯",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return Object.values(d.slots)
        .filter((s) => s.role !== "boilerplate" && matches(q, s.label, s.slotId))
        .slice(0, 10)
        .map((s) => ({ ...slotRef(d, s), hint: htmlToPlain(s.content, 40) }));
    },
  },
  {
    id: "blocks",
    label: "블록",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      const out: ContextRef[] = [];
      for (const { page, block } of docIndex(d).blocks.values()) {
        if (matches(q, block.title ?? "", block.blockId, block.kind)) out.push(blockRef(d, page, block));
        if (out.length >= 8) break;
      }
      return out;
    },
  },
  {
    id: "pages",
    label: "페이지",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return d.pages
        .filter((p) => matches(q, p.pageLabel ?? "", p.pageId))
        .slice(0, 6)
        .map((p) => pageRef(d, p));
    },
  },
  {
    id: "backdata",
    label: "백데이터",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return Object.values(d.backdata)
        .filter((c) => matches(q, c.sourceTitle, c.excerpt))
        .slice(0, 6)
        .map((c) => backdataRef(d, c.chunkId))
        .filter((r): r is ContextRef => Boolean(r));
    },
  },
  {
    id: "references",
    label: "참조 문서",
    search: (q) =>
      referenceDocs()
        .filter((r) => matches(q, r.title))
        .map((r) => ({ ...referenceRef(r.docId, r.title), hint: `${r.pageCount ?? "?"}페이지${r.openInSplit ? " · 분할보기" : ""}` })),
  },
  {
    id: "variables",
    label: "문서 변수",
    search: (q) => {
      const d = doc();
      if (!d) return [];
      return Object.keys(d.variables ?? {})
        .filter((name) => matches(q, name, d.variables[name] ?? ""))
        .slice(0, 6)
        .map((name) => variableRef(d, name));
    },
  },
  {
    // 끌어 놓기 · 우클릭 · Ctrl+L · @ 로 붙은 칩(슬롯 · 블록 · 페이지 · 노드 · 참조)의 본문을 보내기 직전에 채운다.
    id: "workspace-elements",
    label: "워크스페이스 요소",
    resolve: (ref) => {
      const content = resolveContextContent(ref);
      return content == null ? ref : { ...ref, content };
    },
  },
];
