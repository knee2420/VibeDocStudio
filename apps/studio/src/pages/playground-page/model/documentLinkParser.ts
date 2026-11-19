import type {
  FormAssetId,
  LinkedDocumentSpec,
  LinkedPageSpec,
  PlaygroundDocSpec,
  PlaygroundNode,
  SurfaceKind,
} from "./types";

export type ContainerTagKind =
  | "document"
  | "page"
  | "section"
  | "title"
  | "list"
  | "table"
  | "view"
  | "callout"
  | "quote";

const DOC_DIRECTIVE_REGEX = /<<\s*document(?:\s*:\s*([^>\n]+?))?\s*>>/i;
const PAGE_DIRECTIVE_REGEX = /<<\s*page(?:\s*:\s*([^>\n]+?))?\s*>>/i;
const BLOCK_DIRECTIVE_REGEX = /<<\s*block(?:\s*:\s*([^>\n]+?))?\s*>>/i;
const CONTAINER_DIRECTIVE_REGEX =
  /<<\s*(document|page|section|title|list|table|view|callout|quote|block)(?:\s*:\s*([^>\n]+?))?\s*>>/i;
const ANY_DIRECTIVE_GLOBAL =
  /\s*<<\s*(?:document|page|section|title|list|table|view|callout|quote|block)(?:\s*:\s*[^>\n]+?)?\s*>>/gi;

export function parseDocumentDirective(text: string): { matched: boolean; format?: string } {
  const m = DOC_DIRECTIVE_REGEX.exec(text);
  if (!m) return { matched: false };
  const param = m[1]?.trim();
  return { matched: true, ...(param ? { format: param } : null) };
}

export function parsePageDirective(text: string): { matched: boolean; format?: string } {
  const m = PAGE_DIRECTIVE_REGEX.exec(text);
  if (!m) return { matched: false };
  const param = m[1]?.trim();
  return { matched: true, ...(param ? { format: param } : null) };
}

export function parseBlockDirective(text: string): { matched: boolean; blockType?: string } {
  const m = CONTAINER_DIRECTIVE_REGEX.exec(text);
  if (!m) return { matched: false };
  const rawName = m[1].toLowerCase();
  const param = m[2]?.trim();
  if (rawName === "block") {
    return { matched: true, ...(param ? { blockType: param } : null) };
  }
  if (rawName === "document" || rawName === "page") {
    return { matched: false };
  }
  return { matched: true, blockType: rawName };
}

export function parseContainerDirective(
  text: string
): { matched: boolean; kind?: ContainerTagKind; param?: string } {
  const m = CONTAINER_DIRECTIVE_REGEX.exec(text);
  if (!m) return { matched: false };
  const rawName = m[1].toLowerCase();
  const param = m[2]?.trim();
  if (rawName === "block") {
    const sub = (param ?? "").toLowerCase();
    const mapped: ContainerTagKind =
      sub === "list"
        ? "list"
        : sub === "table"
          ? "table"
          : sub === "section"
            ? "section"
            : sub === "callout"
              ? "callout"
              : sub === "quote"
                ? "quote"
                : "title";
    return { matched: true, kind: mapped, ...(param ? { param } : null) };
  }
  return {
    matched: true,
    kind: rawName as ContainerTagKind,
    ...(param ? { param } : null),
  };
}

export function hasDocumentTag(text: string): boolean {
  return DOC_DIRECTIVE_REGEX.test(text);
}

export function hasPageTag(text: string): boolean {
  return PAGE_DIRECTIVE_REGEX.test(text);
}

export function hasBlockTag(text: string): boolean {
  if (BLOCK_DIRECTIVE_REGEX.test(text)) return true;
  const c = parseContainerDirective(text);
  return c.matched && c.kind !== "document" && c.kind !== "page";
}

export function stripLinkTags(text: string): string {
  return text.replace(ANY_DIRECTIVE_GLOBAL, "").replace(/\s{2,}/g, " ").trim();
}

export function toggleNodeLinkTag(
  text: string,
  kind: ContainerTagKind | "block",
  defaultParam?: string
): string {
  const regex = new RegExp(`<<\\s*${kind}(?:\\s*:\\s*[^>\\n]+?)?\\s*>>`, "i");
  if (regex.test(text)) {
    return text
      .replace(new RegExp(`\\s*<<\\s*${kind}(?:\\s*:\\s*[^>\\n]+?)?\\s*>>`, "gi"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  const base = text.trim();
  const suffix = defaultParam ? `<<${kind}:${defaultParam}>>` : `<<${kind}>>`;
  return base ? `${base} ${suffix}` : suffix;
}

export function resolveSurfaceFromDocFormat(
  docFormat: string | undefined,
  fallback: SurfaceKind
): SurfaceKind {
  if (!docFormat) return fallback;
  const lower = docFormat.toLowerCase();
  if (lower.includes("blog") || lower.includes("scroll") || lower.includes("web")) {
    return "scroll";
  }
  if (
    lower.includes("hwp") ||
    lower.includes("a4") ||
    lower.includes("rfp") ||
    lower.includes("품의") ||
    lower === "text" ||
    lower === "raw" ||
    lower === "plain"
  ) {
    return "paged";
  }
  return fallback;
}

function matchAssetPattern(text: string): FormAssetId | null {
  const lower = text.toLowerCase();
  if (/blog|아티클|스크롤|rfp|표준/.test(lower)) {
    return "asset-general-doc";
  }
  if (/수요조사|조사표|체크서식|체크|수합명부|명부|설문|조사/.test(lower)) {
    return "asset-survey-sheet";
  }
  if (/예산|견적|분담/.test(lower)) {
    return "asset-budget-compare";
  }
  if (/일정|역할|트랙|운영/.test(lower)) {
    return "asset-schedule-ops";
  }
  if (/품의|결재|기안|목적/.test(lower)) {
    return "asset-approval-plan";
  }
  return null;
}

export function resolveAssetIdFromHint(
  hint: string | undefined,
  docFormat: string | undefined,
  docTitle: string
): FormAssetId {
  const fmtLower = (docFormat ?? "").toLowerCase();
  if (fmtLower === "text" || fmtLower === "raw" || fmtLower === "plain") {
    return "asset-general-doc";
  }

  // 1순위: <<page:유형>> 에 선언된 명시적 페이지 유형 힌트
  if (hint) {
    const byHint = matchAssetPattern(hint);
    if (byHint) return byHint;
  }

  // 2순위: <<document:유형>> 포맷 및 문서 제목 (수요조사를 일정보다 우선 매칭)
  const docCombined = `${docFormat ?? ""} ${docTitle}`;
  const byDoc = matchAssetPattern(docCombined);
  if (byDoc) return byDoc;

  if (fmtLower.includes("hwp") || fmtLower.includes("a4")) {
    return "asset-approval-plan";
  }
  return "asset-general-doc";
}

function resolvePageDisplayTitle(
  node: PlaygroundNode,
  format: string | undefined,
  pageIndex: number
): string {
  const own = stripLinkTags(node.text);
  if (own) return own;
  if (format) return format;
  const firstChild = node.children.find((c) => stripLinkTags(c.text).length > 0);
  if (firstChild) return stripLinkTags(firstChild.text);
  return `${pageIndex + 1}페이지`;
}

function collectPageNodes(nodes: readonly PlaygroundNode[]): LinkedPageSpec[] {
  const pages: LinkedPageSpec[] = [];

  const visit = (list: readonly PlaygroundNode[]) => {
    for (const node of list) {
      if (hasDocumentTag(node.text)) continue;
      const pg = parsePageDirective(node.text);
      if (pg.matched) {
        pages.push({
          id: `page_${node.id}`,
          nodeId: node.id,
          title: resolvePageDisplayTitle(node, pg.format, pages.length),
          assetHint: pg.format,
          node,
        });
        continue;
      }
      if (node.children.length > 0) visit(node.children);
    }
  };

  visit(nodes);
  return pages;
}

export interface Phase2LinkExtraction {
  hasExplicitLinks: boolean;
  documents: LinkedDocumentSpec[];
}

/**
 * Phase 1 아웃라이너에서 `<<document:유형>>` · `<<page:유형>>` 선언이 붙은 항목만 Phase 2 로 연계한다.
 * `메모` 및 `ToDo` 의 일반 불릿·체크항목은 선언이 없는 한 절대 Phase 2 로 넘어가지 않는다.
 */
export function extractPhase2Links(spec: PlaygroundDocSpec): Phase2LinkExtraction {
  const documents: LinkedDocumentSpec[] = [];
  const orphanPages: LinkedPageSpec[] = [];

  const scan = (list: readonly PlaygroundNode[]) => {
    for (const node of list) {
      const docDir = parseDocumentDirective(node.text);
      if (docDir.matched) {
        const declaredPages = collectPageNodes(node.children);
        const pages: LinkedPageSpec[] =
          declaredPages.length > 0
            ? declaredPages
            : [
                {
                  id: `page_${node.id}_default`,
                  nodeId: node.id,
                  title: stripLinkTags(node.text) || "기본 페이지",
                  assetHint: docDir.format,
                  node,
                  isImplicit: true,
                },
              ];

        documents.push({
          id: `doc_${node.id}`,
          nodeId: node.id,
          title: stripLinkTags(node.text) || "제목 없는 문서",
          docFormat: docDir.format,
          node,
          pages,
        });
        continue;
      }

      const pgDir = parsePageDirective(node.text);
      if (pgDir.matched) {
        orphanPages.push({
          id: `page_${node.id}`,
          nodeId: node.id,
          title: resolvePageDisplayTitle(node, pgDir.format, orphanPages.length),
          assetHint: pgDir.format,
          node,
        });
        continue;
      }

      if (node.children.length > 0) scan(node.children);
    }
  };

  scan(spec.nodes);

  if (orphanPages.length > 0) {
    documents.push({
      id: "doc_orphan_pages",
      nodeId: orphanPages[0].nodeId,
      title: `${spec.title || "새 문서"} (<<page>> 묶음)`,
      docFormat: "A4",
      node: orphanPages[0].node,
      pages: orphanPages,
      isImplicitDoc: true,
    });
  }

  const hasExplicitLinks = documents.length > 0;
  const optInStrict = spec.id === "blank" || spec.id === "workshop-request";

  if (!hasExplicitLinks && !optInStrict && spec.nodes.length > 0) {
    documents.push({
      id: `doc_fallback_${spec.id}`,
      nodeId: spec.nodes[0].id,
      title: spec.title,
      docFormat: spec.surfaceKind === "scroll" ? "blog" : "A4",
      node: spec.nodes[0],
      pages: spec.nodes.map((n) => ({
        id: `page_${n.id}`,
        nodeId: n.id,
        title: n.text,
        node: n,
      })),
      isFallbackFullTree: true,
    });
  }

  return { hasExplicitLinks, documents };
}

export function resolveNodesForLinkedDoc(
  spec: PlaygroundDocSpec,
  linkedDoc: LinkedDocumentSpec | undefined
): PlaygroundNode[] {
  if (!linkedDoc) {
    return spec.id === "blank" || spec.id === "workshop-request" ? [] : spec.nodes;
  }
  if (linkedDoc.isFallbackFullTree) return spec.nodes;

  if (linkedDoc.pages.length === 1 && linkedDoc.pages[0].isImplicit) {
    const root = linkedDoc.node;
    return root.children.length > 0
      ? root.children.map((child) => ({
          ...child,
          text: stripLinkTags(child.text),
          role: child.role === "body" && child.children.length > 0 ? "section" : child.role,
          layoutChoice:
            child.role === "body" && child.children.length > 0 ? "section-block" : child.layoutChoice,
        }))
      : [{ ...root, text: stripLinkTags(root.text) }];
  }

  return linkedDoc.pages.map((p) => ({
    ...p.node,
    text: stripLinkTags(p.node.text),
    role: p.node.role === "body" ? "section" : p.node.role,
    layoutChoice: p.node.layoutChoice === "text" ? "section-block" : p.node.layoutChoice,
  }));
}
