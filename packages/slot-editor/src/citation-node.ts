import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 인용 표식 `<sup data-cite="1"></sup>` — AI 가 근거로 채운 문장 끝에 붙는다.
 *
 * 편집기가 모르는 태그는 열 때 지워지므로, 인용이 편집 · 정적 화면을 거쳐도 살아남게 노드로 정의한다.
 * 번호는 CSS(`::before`)가 그리고, 누르면 `setCitationClickHandler` 로 등록한 처리기가 원본 위치를 연다.
 * 인용 id ↔ 근거 위치는 문서의 근거 링크(`doc.evidenceLinks[].citationIds`)가 잇는다.
 */
export const CitationNode = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      cite: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-cite") || "",
        renderHTML: (attributes) => ({ "data-cite": attributes.cite }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-cite]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "vdoc-cite", contenteditable: "false" })];
  },
});

type CitationHandler = (slotId: string, citeId: string, anchor: HTMLElement) => void;
let citationHandler: CitationHandler | null = null;

/** 인용 표식을 눌렀을 때 — 스튜디오가 근거 링크를 찾아 원본 위치를 연다. */
export function setCitationClickHandler(handler: CitationHandler | null): void {
  citationHandler = handler;
}

/** 포인터가 인용 표식 위면 처리기를 부르고 true (편집기 활성화 · 캐럿 이동을 막는다). */
export function handleCitationPointer(slotId: string, target: EventTarget | null): boolean {
  const el = (target as HTMLElement | null)?.closest?.("sup[data-cite]") as HTMLElement | null;
  if (!el || !citationHandler) return false;
  citationHandler(slotId, el.getAttribute("data-cite") ?? "", el);
  return true;
}
