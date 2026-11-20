import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Layers,
  Link2,
  ListTree,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  createSectionPage,
  duplicatePage,
  insertPages,
  removePage,
  resolveDocumentView,
  toggleBlockLock,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { stem } from "@vibe/vault-core";
import type {
  DocumentStructureNode,
  EditorOutlineHostContext,
} from "@vibe/workspace-layout/core";

import type { OutlineNode } from "@vibe/outliner";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { requestOutlineReveal } from "../model/outlineRevealBus";
import { parseOutlineJson } from "../model/outlineCodec";
import {
  parseVDocJson,
  projectVDocToStructure,
  serializeVDocJson,
} from "../model/vdocCodec";

const uidFactory = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * [.vdoc 활성 시] Figma UI3 스타일 Pages + Elements 구조 패널
 * (DocumentStructureNode 추상 프로젝션 소비 -> 스키마 변경 시에도 UI 무수정!)
 */
export const VDocFigmaStructurePanel: React.FC<{
  host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault, vdocUiBridge } = host.env;
  const path = host.path;
  const fallbackTitle = stem(path);

  const [doc, setDoc] = useState<VDocDocument>(() =>
    parseVDocJson(vault.exists(path) ? vault.read(path) : "", fallbackTitle)
  );
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(() => new Set());
  const [unitPaneHeight, setUnitPaneHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitPaneRef = useRef<HTMLDivElement>(null);

  // Fine-grained selectors: NEVER subscribe to hoveredBlockId so mouse sweeps cause 0 re-renders!
  const storedActivePageId = useStore(vdocUiBridge, (s) => s.byPath[path]?.activePageId ?? null);
  const activePageId = storedActivePageId ?? doc.pages[0]?.pageId ?? "";
  const selectedBlockId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedBlockId ?? null);
  const selectedSlotId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedSlotId ?? null);
  const rawHiddenBlockIds = useStore(vdocUiBridge, (s) => s.byPath[path]?.hiddenBlockIds);
  const hiddenBlockIds = useMemo(
    () => rawHiddenBlockIds ?? new Set<string>(),
    [rawHiddenBlockIds]
  );

  useEffect(() => {
    const reload = () => {
      if (!vault.exists(path)) return;
      try {
        setDoc(parseVDocJson(vault.read(path), fallbackTitle));
      } catch {
        // Ignore
      }
    };
    reload();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, path, fallbackTitle]);

  const mutateDoc = (updater: (prev: VDocDocument) => VDocDocument) => {
    const next = updater(doc);
    setDoc(next);
    vault.write(path, serializeVDocJson(next));
  };

  const { pages, elements } = useMemo(
    () =>
      projectVDocToStructure(
        doc,
        activePageId,
        selectedBlockId,
        selectedSlotId,
        hiddenBlockIds
      ),
    [doc, activePageId, selectedBlockId, selectedSlotId, hiddenBlockIds]
  );

  const toggleBlockExpand = (blockId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
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

      {/* Bottom Sub-section: Figma Elements (Block -> Slot) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-7 shrink-0 items-center justify-between px-3 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            <span>
              {isSectionView
                ? `Section Elements (${elements.length})`
                : `Elements (${elements.length})`}
            </span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {elements.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-[var(--obs-text-faint,#666666)]">
              No blocks on this page.
            </div>
          ) : (
            elements.map((blk) => {
              const hasSlots = Boolean(blk.children && blk.children.length > 0);
              const isExpanded = expandedBlocks.has(blk.id);
              return (
                <div key={blk.id}>
                  <div
                    onMouseEnter={() => vdocUiBridge.getState().setHoveredBlock(path, blk.id)}
                    onMouseLeave={() => vdocUiBridge.getState().setHoveredBlock(path, null)}
                    onClick={() => {
                      vdocUiBridge.getState().selectBlock(path, blk.id, activePageId);
                      vdocUiBridge.getState().requestScrollTo(path, blk.id, activePageId);
                    }}
                    className="group flex h-6 cursor-pointer items-center gap-1 rounded-[4px] px-1.5 transition-colors"
                    style={{
                      backgroundColor: blk.active
                        ? "var(--obs-bg-selected,rgba(138,92,245,0.22))"
                        : "transparent",
                      color: blk.active
                        ? "var(--obs-text-normal,#dadada)"
                        : "var(--obs-text-muted,#b3b3b3)",
                      opacity: blk.hidden ? 0.45 : 1,
                    }}
                  >
                    {hasSlots ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggleBlockExpand(blk.id);
                        }}
                        className="flex h-4 w-4 shrink-0 items-center justify-center opacity-70"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}

                    <span className="min-w-0 flex-1 truncate">{blk.label}</span>

                    {blk.badge && (
                      <span className="shrink-0 rounded bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] px-1 text-[9px] text-[var(--obs-text-faint,#666666)] group-hover:hidden">
                        {blk.badge}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        mutateDoc((prev) => toggleBlockLock(prev, activePageId, blk.id));
                      }}
                      title={blk.locked ? "Unlock block" : "Lock block"}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] ${
                        blk.locked ? "opacity-100 text-amber-400" : "opacity-0 group-hover:opacity-80"
                      }`}
                    >
                      {blk.locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        vdocUiBridge.getState().toggleHiddenBlock(path, blk.id);
                      }}
                      title={blk.hidden ? "Show block" : "Hide block"}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.08))] ${
                        blk.hidden ? "opacity-100 text-sky-400" : "opacity-0 group-hover:opacity-80"
                      }`}
                    >
                      {blk.hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                    </button>
                  </div>

                  {hasSlots && isExpanded && (
                    <div className="pl-5">
                      {blk.children!.map((slotNode) => (
                        <div
                          key={slotNode.id}
                          onClick={() => {
                            vdocUiBridge
                              .getState()
                              .selectSlot(path, slotNode.id, blk.id, activePageId);
                            vdocUiBridge.getState().requestScrollTo(path, slotNode.id, activePageId);
                          }}
                          className="flex h-6 cursor-pointer items-center gap-1.5 rounded-[4px] px-2 text-[11.5px]"
                          style={{
                            backgroundColor: slotNode.active
                              ? "var(--obs-bg-active,rgba(255,255,255,0.11))"
                              : "transparent",
                            color: slotNode.active
                              ? "var(--obs-text-normal,#dadada)"
                              : "var(--obs-text-faint,#666666)",
                          }}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--obs-accent,#8a5cf5)] opacity-60" />
                          <span className="truncate">{slotNode.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
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

/**
 * [.outline 활성 시] 아웃라인 상위 브랜치 목차 패널
 */
export const OutlineStructurePanel: React.FC<{
  host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === host.path) || ev.type === "vault-reset") {
        setTick((t) => t + 1);
      }
    });
  }, [vault, host.path]);

  // 편집 화면과 같은 규칙으로 읽고, 깊이와 상관없이 전체 트리를 펼쳐 보여 준다.
  const rows = useMemo(() => {
    void tick;
    let roots: OutlineNode[] = [];
    try {
      roots = parseOutlineJson(vault.read(host.path), stem(host.path)).rootNodes;
    } catch {
      roots = [];
    }
    const out: { id: string; text: string; depth: number; folded: boolean; childCount: number }[] = [];
    const walk = (nodes: OutlineNode[], depth: number) => {
      for (const node of nodes) {
        const children = node.children ?? [];
        out.push({
          id: node.id,
          text: node.text,
          depth,
          folded: Boolean(node.isFolded) && children.length > 0,
          childCount: children.length,
        });
        walk(children, depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [vault, host.path, tick]);

  return (
    <div className="flex h-full w-full select-none flex-col overflow-y-auto px-2 py-1.5 text-[12px]">
      <div className="mb-1 flex items-center gap-1 px-1 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
        <ListTree className="h-3 w-3" />
        <span>Bullets ({rows.length})</span>
      </div>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => requestOutlineReveal(host.path, row.id)}
          title="편집 화면에서 이 불릿으로 이동"
          style={{ paddingLeft: `${6 + row.depth * 12}px` }}
          className={`flex w-full min-w-0 items-center gap-1 rounded-[4px] py-0.5 pr-1.5 text-left hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] ${
            row.depth === 0
              ? "font-medium text-[var(--obs-text-normal,#dadada)]"
              : "text-[11.5px] text-[var(--obs-text-muted,#b3b3b3)]"
          }`}
        >
          {row.folded ? (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <span className="w-3 shrink-0 text-center opacity-60">{row.depth === 0 ? "•" : "◦"}</span>
          )}
          <span className={`truncate ${row.text.trim() ? "" : "italic opacity-50"}`}>
            {row.text.trim() || "(빈 불릿)"}
          </span>
          {row.folded && (
            <span className="ml-auto shrink-0 font-code text-[10px] opacity-50">{row.childCount}</span>
          )}
        </button>
      ))}
    </div>
  );
};
