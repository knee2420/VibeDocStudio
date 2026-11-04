import type { ContextProvider } from "@vibe/ai-kernel";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { slotContext, useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { htmlToPlain } from "@/shared/lib";

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
        .map((s) => ({ kind: "slot", id: s.slotId, label: s.label, hint: htmlToPlain(s.content, 40) }));
    },
    resolve: (ref) => {
      const d = doc();
      if (ref.kind !== "slot" || !d?.slots[ref.id]) return ref;
      return slotContext(d, d.slots[ref.id]);
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
        .map((c) => ({ kind: "backdata", id: c.chunkId, label: c.sourceTitle, hint: c.excerpt.slice(0, 40) }));
    },
    resolve: (ref) => {
      const chunk = ref.kind === "backdata" ? doc()?.backdata[ref.id] : undefined;
      return chunk ? { ...ref, content: `[${chunk.sourceTitle}] (${chunk.sourceType})\n${chunk.excerpt}` } : ref;
    },
  },
  {
    id: "references",
    label: "참조 문서",
    search: (q) =>
      referenceDocs()
        .filter((r) => matches(q, r.title))
        .map((r) => ({ kind: "reference", id: r.docId, label: r.title, hint: `${r.pageCount ?? "?"}페이지${r.openInSplit ? " · 분할보기" : ""}` })),
    resolve: (ref) => {
      if (ref.kind !== "reference") return ref;
      const d = useStudioDocumentStore.getState().docs.find((x) => x.docId === ref.id);
      if (!d) return ref;
      const text = Object.values(d.slots)
        .map((s) => `[${s.label}] ${htmlToPlain(s.content)}`)
        .filter((line) => line.length > 4)
        .join("\n");
      return { ...ref, content: `참조 문서: ${d.title}\n${text.slice(0, 12000)}` };
    },
  },
];
