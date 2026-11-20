import React, { useEffect, useMemo, useState } from "react";
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
  toggleBlockLock,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { stem } from "@vibe/vault-core";
import type {
  DocumentStructureNode,
  EditorOutlineHostContext,
} from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
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

  const handleAddPage = () => {
    const pageNum = doc.pages.length + 1;
    const pageId = `page_${uidFactory()}`;
    const built = createSectionPage({
      pageId,
      pageNumber: pageNum,
      pageLabel: `Page ${pageNum}`,
      headerHtml: "",
      footerHtml: "",
      headingHtml: `<h2>페이지 ${pageNum}</h2>`,
      bodyHtml: "<p>새 페이지 본문</p>",
    });
    const nextPage = { ...built.page, hideHeaderFooter: true };
    mutateDoc((prev) => insertPages(prev, [nextPage], built.slots));
    vdocUiBridge.getState().requestScrollTo(path, nextPage.pageId, nextPage.pageId);
  };

  const toggleBlockExpand = (blockId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden text-[12px]">
      {/* Top Sub-section: Figma Pages */}
      <div className="shrink-0 border-b border-[var(--obs-border-subtle,#2d2d2d)]">
        <div className="flex h-7 items-center justify-between px-3 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
          <span>Pages ({pages.length})</span>
          <button
            type="button"
            onClick={handleAddPage}
            title="Add page"
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-32 overflow-y-auto px-1.5 pb-1.5">
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
                <FileText className="h-3 w-3 shrink-0 opacity-70" />
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
                  title="Duplicate page"
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
                    title="Delete page"
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

      {/* Bottom Sub-section: Figma Elements (Block -> Slot) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-7 shrink-0 items-center justify-between px-3 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            <span>Elements ({elements.length})</span>
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

  const branches = useMemo(() => {
    void tick;
    try {
      const parsed = JSON.parse(vault.read(host.path)) as {
        rootNodes?: Array<{ id: string; text: string; children?: Array<{ id: string; text: string }> }>;
      };
      return parsed.rootNodes ?? [];
    } catch {
      return [];
    }
  }, [vault, host.path, tick]);

  return (
    <div className="flex h-full w-full select-none flex-col overflow-y-auto px-2 py-1.5 text-[12px]">
      <div className="mb-1 flex items-center gap-1 px-1 text-[10.5px] font-semibold tracking-wider text-[var(--obs-text-faint,#666666)] uppercase">
        <ListTree className="h-3 w-3" />
        <span>Branches ({branches.length})</span>
      </div>
      {branches.map((root) => (
        <div key={root.id} className="mb-1.5">
          <div className="truncate rounded-[4px] px-1.5 py-0.5 font-medium text-[var(--obs-text-normal,#dadada)]">
            • {root.text}
          </div>
          {(root.children ?? []).map((child) => (
            <div
              key={child.id}
              className="truncate py-0.5 pl-4 text-[11.5px] text-[var(--obs-text-muted,#b3b3b3)]"
            >
              ◦ {child.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
