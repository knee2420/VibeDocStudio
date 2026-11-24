/**
 * `.vdoc` → 구조 패널(workspace-layout `DocumentStructureNode`) 투영. 화면 조립이라 앱에 둔다.
 */
import {
  compilePageSceneGraph,
  resolveDocumentView,
  type ElementSyntaxRegistry,
  type SceneGraphNode,
  type VDocDocument,
  type VDocPage,
} from "@vibe/vdoc-schema";
import type { DocumentStructureNode } from "@vibe/workspace-layout/core";

function sceneNodeToStructureNode(node: SceneGraphNode): DocumentStructureNode {
  return {
    id: node.id,
    kind: node.isBlock ? "block" : "slot",
    label: node.label,
    badge: node.badge ?? node.outlineTag,
    locked: node.locked,
    hidden: node.hidden,
    active: node.active,
    ...(node.children && node.children.length > 0
      ? { children: node.children.map(sceneNodeToStructureNode) }
      : {}),
  };
}

/**
 * Codec -> 자동 컴파일 2D Scene Graph & Schema-agnostic DocumentStructureNode 프로젝션.
 * `block-kit` 의 `compilePageSceneGraph` 를 통해 `.outline` 태그와 1:1 대칭되는 재귀 트리를 자동 생성한다.
 */
export function projectVDocToStructure(
  doc: VDocDocument,
  activePageId: string,
  selectedBlockId: string | null,
  selectedSlotId: string | null,
  hiddenBlockIds: ReadonlySet<string>,
  registry?: ElementSyntaxRegistry
): {
  pages: DocumentStructureNode[];
  elements: DocumentStructureNode[];
  sceneGraph: SceneGraphNode[];
} {
  const view = resolveDocumentView(doc);
  const pages: DocumentStructureNode[] = doc.pages.map((page) => {
    const isSection = page.unitKind === "section" || view.unitKind === "section";
    const roleTag = isSection && page.sectionRole ? `${page.sectionRole} · ` : "";
    return {
      id: page.pageId,
      kind: isSection ? "section" : "page",
      label: page.pageLabel || (isSection ? `Section ${page.pageNumber}` : `Page ${page.pageNumber}`),
      badge: `${roleTag}${page.blocks.length}`,
      active: page.pageId === activePageId,
    };
  });

  const activePage: VDocPage | undefined =
    doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
  if (!activePage) {
    return { pages, elements: [], sceneGraph: [] };
  }

  const sceneGraph = compilePageSceneGraph(activePage, doc.slots, {
    selectedBlockId,
    selectedSlotId,
    hiddenBlockIds,
    registry,
  });
  const elements = sceneGraph.map(sceneNodeToStructureNode);

  return { pages, elements, sceneGraph };
}
