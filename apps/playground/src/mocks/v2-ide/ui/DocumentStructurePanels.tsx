import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Heading,
  Image as ImageIcon,
  Layers,
  Link2,
  List,
  ListTree,
  Lock,
  MessageSquareQuote,
  Minus,
  Plus,
  Rows3,
  Square,
  Table2,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import {
  createElementSyntaxRegistry,
  createSectionPage,
  duplicatePage,
  findSceneNodeAncestorIds,
  insertPages,
  parseOutlineDirective,
  removePage,
  resolveDocumentView,
  toggleBlockLock,
  type OutlineDirectiveKind,
  type SceneGraphNode,
} from "@vibe/vdoc-schema";
import { dirname, stem } from "@vibe/vault-core";
import type {
  DocumentStructureNode,
  EditorOutlineHostContext,
} from "@vibe/workspace-layout/core";

import type { OutlineNode } from "@vibe/outliner";

import type { CanvasSelectionItem } from "@vibe/canvas-state";
import {
  collectOutlineBacklinks,
  importPartnerIntoProjectAndBind,
  requestOutlineReveal,
  resolveOutlineForVDoc,
} from "@vibe/outline-sync";
import { intentFromModifiers, type ModifierState } from "@vibe/selection-core";
import { STANDARD_SYNTAX_PATH, fromVaultUri, parseOutlineJson } from "@vibe/vault-formats";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { projectVDocToStructure } from "../model/vdocStructure";
import { useVDocDocument } from "./useVDocDocument";

const uidFactory = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const SCENE_NODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  table: Table2,
  rows: Rows3,
  square: Square,
  "columns-2": Columns2,
  image: ImageIcon,
  list: List,
  type: Type,
  heading: Heading,
  "message-square-quote": MessageSquareQuote,
  link: Link2,
  minus: Minus,
};

/** 장면 노드 → 캔버스 선택 단위 (블록 노드는 블록 id, 나머지는 자기 id · 역할). */
function sceneNodeItem(node: SceneGraphNode, pageId: string): CanvasSelectionItem {
  return node.role === "block"
    ? { id: node.selectBlockId, kind: "block", blockId: node.selectBlockId, pageId }
    : node.role === "slot"
      ? { id: node.selectSlotId ?? node.id, kind: "slot", blockId: node.selectBlockId, pageId }
      : { id: node.id, kind: node.role, blockId: node.selectBlockId, pageId };
}
const sceneNodeKey = (node: SceneGraphNode) => {
  const it = sceneNodeItem(node, "");
  return `${it.kind}:${it.id}`;
};
/** 트리 읽는 순서 (Shift 범위 선택용). */
function flattenScene(nodes: readonly SceneGraphNode[], out: SceneGraphNode[] = []): SceneGraphNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenScene(n.children, out);
  }
  return out;
}

const SceneGraphTreeItem: React.FC<{
  readonly node: SceneGraphNode;
  readonly depth: number;
  readonly selectedSceneNodeId: string | null;
  /** 다중 선택 키 (`역할:id`). 2개 이상일 때만 쓴다. */
  readonly selectedKeys: ReadonlySet<string>;
  readonly expandedIds: ReadonlySet<string>;
  readonly autoExpandedIds: ReadonlySet<string>;
  readonly manuallyCollapsedIds: ReadonlySet<string>;
  readonly onToggleExpand: (nodeId: string, currentlyExpanded: boolean) => void;
  readonly onSelectNode: (node: SceneGraphNode, ev: ModifierState) => void;
  readonly onHoverNode: (node: SceneGraphNode | null) => void;
  readonly onToggleLock: (blockId: string) => void;
  readonly onToggleHidden: (blockId: string) => void;
}> = ({
  node,
  depth,
  selectedSceneNodeId,
  selectedKeys,
  expandedIds,
  autoExpandedIds,
  manuallyCollapsedIds,
  onToggleExpand,
  onSelectNode,
  onHoverNode,
  onToggleLock,
  onToggleHidden,
}) => {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded =
    hasChildren &&
    (expandedIds.has(node.id) ||
      (autoExpandedIds.has(node.id) && !manuallyCollapsedIds.has(node.id)));
  const isActive =
    selectedKeys.size > 1
      ? selectedKeys.has(sceneNodeKey(node))
      : selectedSceneNodeId
        ? selectedSceneNodeId === node.id
        : Boolean(node.active);
  const Icon = SCENE_NODE_ICON[node.icon] ?? Box;

  const iconTintClass =
    node.role === "row"
      ? "text-slate-500"
      : node.role === "cell" || node.role === "column"
        ? node.outlineTag
          ? "text-violet-400/80"
          : "text-slate-500"
        : node.icon === "image" || node.icon === "columns-2"
          ? "text-sky-400/85"
          : node.icon === "table"
            ? "text-emerald-400/85"
            : node.icon === "list"
              ? "text-amber-300/85"
              : "text-[var(--obs-text-faint,#888)]";

  return (
    <div>
      <div
        onMouseEnter={() => onHoverNode(node)}
        onMouseLeave={() => onHoverNode(null)}
        onClick={(ev) => onSelectNode(node, ev)}
        title={
          node.outlineTag ? `${node.outlineTag} · ${node.label}` : node.label
        }
        style={{
          paddingLeft: `${4 + depth * 12}px`,
          backgroundColor: isActive
            ? "var(--obs-bg-selected,rgba(138,92,245,0.22))"
            : "transparent",
          color: isActive
            ? "var(--obs-text-normal,#ececec)"
            : node.role === "row" || (node.role === "cell" && !hasChildren)
              ? "var(--obs-text-faint,#8a8a8a)"
              : "var(--obs-text-muted,#c2c2c2)",
          opacity: node.hidden ? 0.45 : 1,
        }}
        className="group relative flex h-6 cursor-pointer items-center gap-1 rounded-[4px] pr-1.5 transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
      >
        {depth > 0 && (
          <span
            aria-hidden="true"
            style={{ left: `${depth * 12 - 2}px` }}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--obs-indent-guide,rgba(255,255,255,0.08))]"
          />
        )}

        {hasChildren ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onToggleExpand(node.id, isExpanded);
            }}
            className="flex h-4 w-3.5 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <Icon className={`h-3 w-3 shrink-0 ${iconTintClass}`} />

        <span className="min-w-0 flex-1 truncate text-[11.5px]">{node.label}</span>

        {(node.badge || node.outlineTag) && (
          <span
            className={`shrink-0 rounded px-1 font-code text-[9px] ${
              node.isBlock ? "group-hover:hidden" : ""
            } ${
              node.outlineTag && !node.badge
                ? "bg-violet-500/12 text-violet-300/80"
                : "bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] text-[var(--obs-text-faint,#777)]"
            }`}
          >
            {node.badge ?? node.outlineTag}
          </span>
        )}

        {node.isBlock && (
          <>
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onToggleLock(node.selectBlockId);
              }}
              title={node.locked ? "Unlock block" : "Lock block"}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] ${
                node.locked ? "opacity-100 text-amber-400" : "hidden group-hover:flex opacity-80"
              }`}
            >
              {node.locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
            </button>

            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onToggleHidden(node.selectBlockId);
              }}
              title={node.hidden ? "Show block" : "Hide block"}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] ${
                node.hidden ? "opacity-100 text-sky-400" : "hidden group-hover:flex opacity-80"
              }`}
            >
              {node.hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            </button>
          </>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <SceneGraphTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedSceneNodeId={selectedSceneNodeId}
              selectedKeys={selectedKeys}
              expandedIds={expandedIds}
              autoExpandedIds={autoExpandedIds}
              manuallyCollapsedIds={manuallyCollapsedIds}
              onToggleExpand={onToggleExpand}
              onSelectNode={onSelectNode}
              onHoverNode={onHoverNode}
              onToggleLock={onToggleLock}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * [.vdoc 활성 시] Figma UI3 스타일 Pages + Elements 구조 패널
 * (DocumentStructureNode 추상 프로젝션 소비 -> 스키마 변경 시에도 UI 무수정!)
 */
export const VDocFigmaStructurePanel: React.FC<{
  host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault, vdocUiBridge, docs } = host.env;
  const path = host.path;

  const [doc, mutateDoc] = useVDocDocument(docs, path);
  const [syntaxTick, setSyntaxTick] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(() => new Set());
  const [unitPaneHeight, setUnitPaneHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitPaneRef = useRef<HTMLDivElement>(null);

  // Fine-grained selectors: NEVER subscribe to hoveredBlockId so mouse sweeps cause 0 re-renders!
  const storedActivePageId = useStore(vdocUiBridge, (s) => s.byPath[path]?.activePageId ?? null);
  const activePageId = storedActivePageId ?? doc.pages[0]?.pageId ?? "";
  const selectedBlockId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedBlockId ?? null);
  const selectedSlotId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedSlotId ?? null);
  const selectedSceneNodeId = useStore(
    vdocUiBridge,
    (s) => s.byPath[path]?.selectedSceneNode?.id ?? null
  );
  const selection = useStore(vdocUiBridge, (s) => s.byPath[path]?.selection ?? null);
  const selectedKeys = useMemo(
    () => new Set(selection && selection.items.length > 1 ? selection.items.map((i) => `${i.kind}:${i.id}`) : []),
    [selection]
  );
  const rawHiddenBlockIds = useStore(vdocUiBridge, (s) => s.byPath[path]?.hiddenBlockIds);
  const hiddenBlockIds = useMemo(
    () => rawHiddenBlockIds ?? new Set<string>(),
    [rawHiddenBlockIds]
  );

  useEffect(() => {
    return vault.subscribe((ev) => {
      if (
        ev.type === "vault-reset" ||
        (ev.type === "modify" && ev.path === STANDARD_SYNTAX_PATH)
      ) {
        setSyntaxTick((t) => t + 1);
      }
    });
  }, [vault]);


  const syntaxRegistry = useMemo(() => {
    void syntaxTick;
    if (vault.exists(STANDARD_SYNTAX_PATH)) {
      try {
        return createElementSyntaxRegistry(vault.read(STANDARD_SYNTAX_PATH));
      } catch {
        // Fall through to built-in seed registry
      }
    }
    return createElementSyntaxRegistry();
  }, [vault, syntaxTick]);

  const { pages, sceneGraph } = useMemo(
    () =>
      projectVDocToStructure(
        doc,
        activePageId,
        selectedBlockId,
        selectedSlotId,
        hiddenBlockIds,
        syntaxRegistry
      ),
    [doc, activePageId, selectedBlockId, selectedSlotId, hiddenBlockIds, syntaxRegistry]
  );

  const autoExpandedIds = useMemo(
    () => new Set(findSceneNodeAncestorIds(sceneGraph, selectedBlockId, selectedSlotId)),
    [sceneGraph, selectedBlockId, selectedSlotId]
  );

  const handleToggleNodeExpand = (nodeId: string, currentlyExpanded: boolean) => {
    if (currentlyExpanded) {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setManuallyCollapsed((prev) => new Set(prev).add(nodeId));
    } else {
      setExpandedNodes((prev) => new Set(prev).add(nodeId));
      setManuallyCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const handleSelectSceneNode = (node: SceneGraphNode, ev: ModifierState) => {
    // Ctrl/⌘ 토글 · Shift 범위 — 캔버스와 같은 규칙 (선택 집합은 하나)
    const intent = intentFromModifiers(ev);
    if (intent !== "replace") {
      const order = flattenScene(sceneGraph).map((n) => sceneNodeItem(n, activePageId));
      vdocUiBridge.getState().applySelectIntent(path, intent, sceneNodeItem(node, activePageId), order);
      return;
    }
    vdocUiBridge.getState().selectSceneNode(
      path,
      {
        id: node.id,
        role: node.role,
        selectBlockId: node.selectBlockId,
        selectSlotId: node.selectSlotId,
      },
      activePageId
    );
    vdocUiBridge.getState().requestScrollTo(path, node.id, activePageId);
    if (node.sourceNodeId && doc.outlineRef?.outlinePath) {
      const outlinePath = fromVaultUri(doc.outlineRef.outlinePath);
      if (outlinePath) {
        requestOutlineReveal(outlinePath, node.sourceNodeId, { zoom: false });
      }
    }
  };

  const activeView = useMemo(() => resolveDocumentView(doc), [doc]);
  const isSectionView = activeView.unitKind === "section" || Boolean(activeView.showSectionsSection);
  const showUnitList = activeView.showPagesSection || isSectionView;

  const handleAddUnit = () => {
    const unitNum = doc.pages.length + 1;
    const pageId = `${isSectionView ? "sec" : "page"}_${uidFactory()}`;
    const built = createSectionPage({
      pageId,
      pageNumber: unitNum,
      pageLabel: isSectionView ? `섹션 ${unitNum}` : `Page ${unitNum}`,
      headerHtml: "",
      footerHtml: "",
      headingHtml: isSectionView ? `<h2>섹션 ${unitNum}</h2>` : `<h2>페이지 ${unitNum}</h2>`,
      bodyHtml: isSectionView ? "<p>새 섹션 본문</p>" : "<p>새 페이지 본문</p>",
    });
    const nextPage = {
      ...built.page,
      unitKind: isSectionView ? ("section" as const) : ("page" as const),
      sectionRole: isSectionView ? "body" : undefined,
      hideHeaderFooter: true,
    };
    mutateDoc((prev) => insertPages(prev, [nextPage], built.slots));
    vdocUiBridge.getState().requestScrollTo(path, nextPage.pageId, nextPage.pageId);
  };

  const handleStartUnitResize = (ev: React.MouseEvent) => {
    ev.preventDefault();
    const startY = ev.clientY;
    const startH = unitPaneRef.current?.getBoundingClientRect().height ?? 160;
    const containerH = containerRef.current?.getBoundingClientRect().height ?? 500;
    const maxH = Math.max(96, containerH - 72);
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";

    const onMove = (moveEv: MouseEvent) => {
      const next = Math.max(64, Math.min(maxH, Math.round(startH + (moveEv.clientY - startY))));
      setUnitPaneHeight(next);
    };
    const onUp = () => {
      document.body.style.cursor = prevCursor;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full select-none flex-col overflow-hidden text-[12px]"
    >
      {/* Top Sub-section: Figma Pages (A4) or Sections (Blog/Web) */}
      {showUnitList && (
        <>
          <div
            ref={unitPaneRef}
            style={
              unitPaneHeight !== null
                ? { height: `${unitPaneHeight}px`, maxHeight: "calc(100% - 72px)" }
                : undefined
            }
            className={`flex shrink-0 flex-col overflow-hidden ${
              unitPaneHeight === null ? "max-h-[45%]" : ""
            }`}
          >
            <div className="flex h-7 shrink-0 items-center justify-between px-3 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
              <span>
                {isSectionView ? `Sections (${pages.length})` : `Pages (${pages.length})`}
              </span>
              <button
                type="button"
                onClick={handleAddUnit}
                title={isSectionView ? "Add section" : "Add page"}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
              {pages.map((pageNode: DocumentStructureNode) => (
                <div
                  key={pageNode.id}
                  onClick={() => {
                    vdocUiBridge.getState().setActivePage(path, pageNode.id);
                    vdocUiBridge.getState().requestScrollTo(path, pageNode.id, pageNode.id);
                  }}
                  className="group flex h-6 cursor-pointer items-center justify-between rounded-[4px] px-2 transition-colors"
                  style={{
                    backgroundColor: pageNode.active
                      ? "var(--obs-bg-selected,rgba(138,92,245,0.22))"
                      : "transparent",
                    color: pageNode.active
                      ? "var(--obs-text-normal,#dadada)"
                      : "var(--obs-text-muted,#b3b3b3)",
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {isSectionView ? (
                      <Hash className="h-3 w-3 shrink-0 opacity-70 text-emerald-400" />
                    ) : (
                      <FileText className="h-3 w-3 shrink-0 opacity-70" />
                    )}
                    <span className="truncate">{pageNode.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <span className="mr-1 text-[10px] text-[var(--obs-text-faint,#666666)] group-hover:hidden">
                      {pageNode.badge}
                    </span>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        mutateDoc((prev) => duplicatePage(prev, pageNode.id, uidFactory));
                      }}
                      title={isSectionView ? "Duplicate section" : "Duplicate page"}
                      className="hidden h-4 w-4 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] group-hover:flex"
                    >
                      <Copy className="h-2.5 w-2.5" />
                    </button>
                    {pages.length > 1 && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          mutateDoc((prev) => removePage(prev, pageNode.id));
                        }}
                        title={isSectionView ? "Delete section" : "Delete page"}
                        className="hidden h-4 w-4 items-center justify-center rounded text-[var(--obs-danger,#fb464c)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] group-hover:flex"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Draggable Horizontal Splitter (Sections/Pages <-> Elements) */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize sections and elements split"
            onMouseDown={handleStartUnitResize}
            onDoubleClick={() => setUnitPaneHeight(null)}
            title="드래그하여 높이 조절 (더블클릭 시 기본값 복원)"
            className="group relative z-20 h-px shrink-0 cursor-row-resize bg-[var(--obs-border-subtle,#2d2d2d)]"
          >
            <div className="absolute right-0 left-0 -top-[3px] h-[7px] transition-colors group-hover:top-[-1px] group-hover:h-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
          </div>
        </>
      )}

      {/* Bottom Sub-section: Figma 1:1 Recursive Scene Graph (Block -> Row/Col -> Cell -> Nested Blocks) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-7 shrink-0 items-center justify-between px-3 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            <span>
              {isSectionView
                ? `Section Elements (${sceneGraph.length})`
                : `Elements (${sceneGraph.length})`}
            </span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {sceneGraph.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-[var(--obs-text-faint,#666666)]">
              No blocks on this page.
            </div>
          ) : (
            sceneGraph.map((node) => (
              <SceneGraphTreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedSceneNodeId={selectedSceneNodeId}
                selectedKeys={selectedKeys}
                expandedIds={expandedNodes}
                autoExpandedIds={autoExpandedIds}
                manuallyCollapsedIds={manuallyCollapsed}
                onToggleExpand={handleToggleNodeExpand}
                onSelectNode={handleSelectSceneNode}
                onHoverNode={(n) =>
                  vdocUiBridge.getState().setHoveredSceneNode(
                    path,
                    n ? { id: n.id, role: n.role, selectBlockId: n.selectBlockId } : null
                  )
                }
                onToggleLock={(blockId) =>
                  mutateDoc((prev) => toggleBlockLock(prev, activePageId, blockId))
                }
                onToggleHidden={(blockId) =>
                  vdocUiBridge.getState().toggleHiddenBlock(path, blockId)
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * [.md 활성 시] Obsidian Outline (Headings) + Backlinks 패널
 */
export const MarkdownStructurePanel: React.FC<{
  host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { metadataCache } = host.env;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return metadataCache.subscribe(() => setTick((t) => t + 1));
  }, [metadataCache]);

  const { headings, backlinks } = useMemo(() => {
    void tick;
    const meta = metadataCache.getMetadata(host.path);
    return {
      headings: meta?.headings ?? [],
      backlinks: metadataCache.getBacklinks(host.path),
    };
  }, [metadataCache, host.path, tick]);

  return (
    <div className="flex h-full w-full select-none flex-col overflow-y-auto px-2 py-1.5 text-[12px]">
      <div className="mb-1 flex items-center gap-1 px-1 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
        <Hash className="h-3 w-3" />
        <span>Outline ({headings.length})</span>
      </div>
      {headings.length === 0 ? (
        <div className="px-2 py-1 text-[11px] text-[var(--obs-text-faint,#666666)]">
          No headings in this note.
        </div>
      ) : (
        <div className="space-y-0.5 pb-2">
          {headings.map((h) => (
            <div
              key={`${h.line}-${h.text}`}
              style={{ paddingLeft: `${6 + (h.level - 1) * 10}px` }}
              className="flex items-center justify-between rounded-[4px] py-0.5 pr-1.5 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <span className="truncate">{h.text}</span>
              <span className="font-code text-[10px] text-[var(--obs-text-faint,#666666)]">
                L{h.line}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 mb-1 flex items-center gap-1 border-t border-[var(--obs-border-subtle,#2d2d2d)] px-1 pt-2 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
        <Link2 className="h-3 w-3" />
        <span>Backlinks ({backlinks.length})</span>
      </div>
      {backlinks.length === 0 ? (
        <div className="px-2 py-1 text-[11px] text-[var(--obs-text-faint,#666666)]">
          No linked mentions yet.
        </div>
      ) : (
        <div className="space-y-0.5">
          {backlinks.map((b, idx) => (
            <button
              key={`${b.sourcePath}-${idx}`}
              type="button"
              onClick={() => host.openLink(b.sourcePath, "current")}
              className="flex w-full items-center justify-between gap-1 rounded-[4px] px-2 py-1 text-left text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            >
              <span className="truncate">{b.sourcePath}</span>
              <span className="font-code text-[10px] text-[var(--obs-text-faint,#666666)]">
                L{b.link.line}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const DIRECTIVE_BADGE_CLASS: Record<OutlineDirectiveKind, string> = {
  doc: "bg-emerald-500/20 text-emerald-300",
  view: "bg-sky-500/20 text-sky-300",
  asset: "bg-amber-500/20 text-amber-300",
  template: "bg-purple-500/20 text-purple-300",
};

/**
 * [.outline 활성 시] 아웃라인 전체 트리 / `<<지시어>>` 필터 목차 패널
 */
export const OutlineStructurePanel: React.FC<{
  host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [tick, setTick] = useState(0);
  const [filterMode, setFilterMode] = useState<"all" | "directives">("all");

  useEffect(() => {
    return vault.subscribe((ev) => {
      const touched =
        ev.type === "create"
          ? ev.node.path
          : ev.type === "modify" || ev.type === "delete"
            ? ev.path
            : ev.type === "rename"
              ? ev.newPath
              : "";
      if (
        ev.type === "vault-reset" ||
        touched === host.path ||
        touched.endsWith(".vdoc") ||
        touched.endsWith(".vdoc.json")
      ) {
        setTick((t) => t + 1);
      }
    });
  }, [vault, host.path]);

  const backlinks = useMemo(() => {
    void tick;
    return collectOutlineBacklinks(vault, host.path);
  }, [vault, host.path, tick]);

  // 편집 화면과 같은 규칙으로 읽고, 깊이와 상관없이 전체 트리와 `<<...>>` 지시어 메타를 수집한다.
  const { rows, directiveCount } = useMemo(() => {
    void tick;
    let roots: OutlineNode[] = [];
    let bindings: Record<string, unknown> = {};
    try {
      const parsed = parseOutlineJson(vault.read(host.path), stem(host.path));
      roots = parsed.rootNodes;
      bindings = parsed.docBindings ?? {};
    } catch {
      roots = [];
    }
    const out: {
      id: string;
      text: string;
      depth: number;
      folded: boolean;
      childCount: number;
      directiveKind: OutlineDirectiveKind | null;
      directiveTag: string | null;
      displayLabel: string;
      isBound: boolean;
    }[] = [];
    let dirCount = 0;

    const walk = (nodes: OutlineNode[], depth: number) => {
      for (const node of nodes) {
        const children = node.children ?? [];
        const parsedDir = parseOutlineDirective(node.text);
        if (parsedDir) dirCount += 1;
        out.push({
          id: node.id,
          text: node.text,
          depth,
          folded: Boolean(node.isFolded) && children.length > 0,
          childCount: children.length,
          directiveKind: parsedDir?.kind ?? null,
          directiveTag: parsedDir
            ? `${parsedDir.kind}:${parsedDir.target}${parsedDir.role ? `:${parsedDir.role}` : ""}`
            : null,
          displayLabel: parsedDir ? parsedDir.label || parsedDir.rawToken : node.text.trim(),
          isBound: Boolean(bindings[node.id]),
        });
        walk(children, depth + 1);
      }
    };
    walk(roots, 0);
    return { rows: out, directiveCount: dirCount };
  }, [vault, host.path, tick]);

  const visibleRows =
    filterMode === "directives" ? rows.filter((r) => r.directiveKind !== null) : rows;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden text-[12px]">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[var(--obs-border-subtle,#2d2d2d)] px-2.5 py-1.5">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
          <ListTree className="h-3 w-3" />
          <span>{filterMode === "directives" ? `Directives (${directiveCount})` : `Bullets (${rows.length})`}</span>
        </span>
        <div className="flex items-center rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-0.5 text-[10px]">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              filterMode === "all"
                ? "bg-[var(--obs-accent,#8a5cf5)]/25 text-[var(--obs-text-normal,#ececec)]"
                : "text-[var(--obs-text-muted,#9a9a9a)] hover:text-white"
            }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("directives")}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              filterMode === "directives"
                ? "bg-emerald-500/25 text-emerald-300"
                : "text-[var(--obs-text-muted,#9a9a9a)] hover:text-white"
            }`}
          >
            &lt;&lt;{directiveCount}&gt;&gt;
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {visibleRows.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-[var(--obs-text-faint,#666666)]">
            {filterMode === "directives"
              ? "선언된 <<doc>> / <<view>> / <<asset>> 지시어가 없습니다."
              : "빈 아웃라인입니다."}
          </div>
        ) : (
          visibleRows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => requestOutlineReveal(host.path, row.id, { zoom: false })}
              title="편집 화면에서 이 불릿으로 이동"
              style={{
                paddingLeft: `${6 + (filterMode === "directives" ? Math.min(row.depth, 2) : row.depth) * 12}px`,
              }}
              className={`flex w-full min-w-0 items-center gap-1 rounded-[4px] py-0.5 pr-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] ${
                row.depth === 0 || row.directiveKind === "doc"
                  ? "font-medium text-[var(--obs-text-normal,#dadada)]"
                  : "text-[11.5px] text-[var(--obs-text-muted,#b3b3b3)]"
              }`}
            >
              {row.folded ? (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
              ) : (
                <span className="w-3 shrink-0 text-center opacity-60">
                  {row.isBound ? (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : row.depth === 0 ? (
                    "•"
                  ) : (
                    "◦"
                  )}
                </span>
              )}
              {row.directiveKind && row.directiveTag && (
                <span
                  className={`shrink-0 rounded px-1 py-0 font-code text-[9.5px] ${DIRECTIVE_BADGE_CLASS[row.directiveKind]}`}
                >
                  {row.directiveTag}
                </span>
              )}
              <span className={`truncate ${row.displayLabel ? "" : "italic opacity-50"}`}>
                {row.displayLabel || "(빈 불릿)"}
              </span>
              {row.folded && (
                <span className="ml-auto shrink-0 font-code text-[10px] opacity-50">
                  {row.childCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Obsidian-style Backlinks (.vdoc) section */}
      <div className="shrink-0 border-t border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)]/60 px-2 py-1.5">
        <div className="mb-1 flex items-center justify-between px-1 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#777)] uppercase">
          <span className="flex items-center gap-1">
            <Link2 className="h-3 w-3 text-emerald-400" />
            <span>Backlinks · .vdoc ({backlinks.length})</span>
          </span>
        </div>
        {backlinks.length === 0 ? (
          <div className="px-1.5 py-1 text-[10.5px] text-[var(--obs-text-faint,#666)]">
            연결된 .vdoc 문서가 없습니다.
          </div>
        ) : (
          <div className="max-h-32 space-y-0.5 overflow-y-auto">
            {backlinks.map((bl) => {
              const targetPath = bl.vdocPath ?? bl.externalVDocPath ?? "";
              const folder = targetPath ? dirname(targetPath) : "";
              return (
                <button
                  key={`${bl.rootNodeId}-${bl.rawVDocUri}`}
                  type="button"
                  disabled={bl.broken}
                  onClick={() => {
                    const openPair = host.env.openInPairTabGroup;
                    const opener = (target: string) => {
                      if (openPair) {
                        openPair(target, { sourcePath: host.path });
                      } else {
                        host.openLink(target, "split-right");
                      }
                    };
                    if (bl.outOfScope && bl.externalVDocPath) {
                      importPartnerIntoProjectAndBind(vault, host.path, bl.externalVDocPath, {
                        rootNodeId: bl.rootNodeId,
                        openLink: opener,
                      });
                      return;
                    }
                    if (!bl.vdocPath) return;
                    if (bl.needsHeal) {
                      resolveOutlineForVDoc(vault, bl.vdocPath, undefined, { heal: true });
                    }
                    opener(bl.vdocPath);
                  }}
                  title={
                    bl.broken
                      ? `끊어진 경로: ${bl.rawVDocUri}`
                      : bl.outOfScope
                        ? `프로젝트 외부 파일 (${bl.externalVDocPath}) — 클릭해 현재 프로젝트로 등록`
                        : `${bl.vdocPath} (${bl.rootDirectiveLabel})`
                  }
                  className={`flex w-full items-center justify-between gap-1.5 rounded-[4px] px-1.5 py-1 text-left transition-colors ${
                    bl.broken
                      ? "cursor-not-allowed bg-rose-500/5 text-rose-300/80"
                      : bl.outOfScope
                        ? "bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                        : "text-[var(--obs-text-muted,#c2c2c2)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {bl.broken ? (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
                      ) : bl.outOfScope ? (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                      ) : (
                        <FileText className="h-3 w-3 shrink-0 text-emerald-400" />
                      )}
                      <span className="truncate text-[11px] font-medium">{bl.title}</span>
                    </div>
                    <div className="truncate pl-4 font-code text-[9.5px] text-[var(--obs-text-faint,#777)]">
                      {folder || "/"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {bl.outOfScope && (
                      <span className="rounded bg-amber-500/20 px-1 py-0 text-[9px] text-amber-200">
                        외부 · 등록
                      </span>
                    )}
                    {bl.needsHeal && !bl.broken && !bl.outOfScope && (
                      <span className="rounded bg-amber-500/15 px-1 py-0 text-[9px] text-amber-300">
                        복구
                      </span>
                    )}
                    {bl.profileId && (
                      <span className="rounded bg-emerald-500/15 px-1 py-0 font-code text-[9px] uppercase text-emerald-300">
                        {bl.profileId}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
