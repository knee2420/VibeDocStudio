import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Columns2,
  Eye,
  FileCode2,
  FilePlus2,
  Heading1,
  Info,
  ListTree,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  ScrollText,
  Sparkles,
  Table2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  applyTableCommandToDocument,
  createInsertableBlock,
  createSectionPage,
  documentSurface,
  duplicateBlock,
  findBlock,
  findBlockBySlotId,
  insertBlock,
  insertPages,
  moveBlockByOffset,
  moveBlockFrame,
  moveBlockToPosition,
  removeBlock,
  resizeBlockFrame,
  setSlotContent,
  toggleBlockLock,
  type InsertableBlockKind,
  type LayoutBlock,
  type TableCommand,
  type VDocDocument,
  type VDocPage,
} from "@vibe/vdoc-schema";
import {
  MemoVDocPageSheet,
  WindowedPageChunker,
  type VDocPageSheetProps,
} from "@vibe/slot-canvas";
import { VIBE_VAULT_PATHS_MIME } from "@vibe/file-explorer/core";
import type { EditorAiDirective, EditorHostContext } from "@vibe/workspace-layout/core";
import { stem } from "@vibe/vault-core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import type { VDocUiBridgeStore } from "../model/vdocUiBridge";
import {
  createVaultLinkCardDraft,
  fromVaultUri,
  parseVDocJson,
  serializeVDocJson,
} from "../model/vdocCodec";

export interface VDocTabEditorProps {
  readonly host: EditorHostContext<IdeEditorEnv>;
}

const uidFactory = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Leaf component isolated to subscribe ONLY to hover/hidden overlay state.
 * Hovering over Left-Bottom Figma Elements updates this tiny <style> tag with
 * ZERO re-renders of VDocTabEditor or MemoVDocPageSheet.
 */
const VDocOverlayStyle = React.memo<{
  readonly bridge: VDocUiBridgeStore;
  readonly path: string;
}>(({ bridge, path }) => {
  const hoveredBlockId = useStore(bridge, (s) => s.byPath[path]?.hoveredBlockId ?? null);
  const hiddenBlockIds = useStore(bridge, (s) => s.byPath[path]?.hiddenBlockIds);

  const cssText = useMemo(() => {
    const rules: string[] = [];
    if (hoveredBlockId) {
      rules.push(
        `[data-block-id="${CSS.escape(hoveredBlockId)}"] { outline: 2px solid #0d99ff !important; outline-offset: 2px; }`
      );
    }
    if (hiddenBlockIds && hiddenBlockIds.size > 0) {
      for (const id of hiddenBlockIds) {
        rules.push(`[data-block-id="${CSS.escape(id)}"] { display: none !important; }`);
      }
    }
    return rules.join("\n");
  }, [hoveredBlockId, hiddenBlockIds]);

  return cssText ? <style>{cssText}</style> : null;
});

const VDocTabEditorImpl: React.FC<VDocTabEditorProps> = ({ host }) => {
  const { vault, vdocUiBridge } = host.env;
  const path = host.path;
  const fallbackTitle = stem(path);

  const [doc, setDoc] = useState<VDocDocument>(() => {
    try {
      return vault.exists(path)
        ? parseVDocJson(vault.read(path), fallbackTitle)
        : parseVDocJson("", fallbackTitle);
    } catch {
      return parseVDocJson("", fallbackTitle);
    }
  });
  const [mode, setMode] = useState<"Editing" | "Viewing">("Editing");
  const [zoom, setZoom] = useState(92);
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [aiBarOpen, setAiBarOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAction, setAiAction] = useState<NonNullable<EditorAiDirective["action"]>>("extract-md");

  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const localWriteRef = useRef(false);
  const hostRef = useRef(host);
  const docRef = useRef(doc);
  const pendingWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWriteDocRef = useRef<VDocDocument | null>(null);
  const lastReportedSelectionSigRef = useRef<string | null>(null);

  useEffect(() => {
    hostRef.current = host;
  }, [host]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // Fine-grained primitive subscriptions (never subscribe to hoveredBlockId or hiddenBlockIds here!)
  const storedActivePageId = useStore(vdocUiBridge, (s) => s.byPath[path]?.activePageId ?? null);
  const activePageId = storedActivePageId ?? doc.pages[0]?.pageId ?? "";
  const selectedBlockId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedBlockId ?? null);
  const selectedSlotId = useStore(vdocUiBridge, (s) => s.byPath[path]?.selectedSlotId ?? null);
  const scrollSeq = useStore(vdocUiBridge, (s) => s.byPath[path]?.scrollSeq ?? 0);
  const scrollTargetId = useStore(vdocUiBridge, (s) => s.byPath[path]?.scrollTargetId ?? null);

  const flushVaultWrite = useCallback(() => {
    if (pendingWriteTimerRef.current !== null) {
      clearTimeout(pendingWriteTimerRef.current);
      pendingWriteTimerRef.current = null;
    }
    const toWrite = pendingWriteDocRef.current;
    if (!toWrite) return;
    pendingWriteDocRef.current = null;
    localWriteRef.current = true;
    try {
      vault.write(path, serializeVDocJson(toWrite));
    } finally {
      localWriteRef.current = false;
    }
  }, [vault, path]);

  useEffect(() => {
    return () => {
      flushVaultWrite();
    };
  }, [flushVaultWrite]);

  // Sync with Vault when edited in another split pane or by AI
  useEffect(() => {
    const reload = () => {
      if (!vault.exists(path)) return;
      try {
        setDoc(parseVDocJson(vault.read(path), fallbackTitle));
      } catch {
        // Ignore transient read errors
      }
    };
    reload();
    return vault.subscribe((ev) => {
      if (localWriteRef.current) return;
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, path, fallbackTitle]);

  // Ensure an activePageId is set
  useEffect(() => {
    if (!storedActivePageId && doc.pages[0]) {
      vdocUiBridge.getState().setActivePage(path, doc.pages[0].pageId);
    }
  }, [doc.pages, path, storedActivePageId, vdocUiBridge]);

  // Scroll canvas to target when clicked from Left-Bottom Figma Structure panel
  useEffect(() => {
    if (!scrollTargetId || scrollSeq === 0) return;
    const hostEl = canvasScrollRef.current;
    if (!hostEl) return;
    const escaped = CSS.escape(scrollTargetId);
    const el =
      hostEl.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`[data-slot-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`[data-vdoc-page-id="${escaped}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollSeq, scrollTargetId]);

  const commitDoc = useCallback(
    (updater: (prev: VDocDocument) => VDocDocument, options?: { immediate?: boolean }) => {
      setDoc((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        docRef.current = next;
        pendingWriteDocRef.current = next;
        if (options?.immediate) {
          flushVaultWrite();
        } else {
          if (pendingWriteTimerRef.current !== null) {
            clearTimeout(pendingWriteTimerRef.current);
          }
          pendingWriteTimerRef.current = setTimeout(() => {
            flushVaultWrite();
          }, 160);
        }
        return next;
      });
    },
    [flushVaultWrite]
  );

  // Report 2D selection snapshot to AI-Composer WITHOUT depending on ephemeral `host` object!
  useEffect(() => {
    const report = hostRef.current.reportSelection;
    if (!report) return;
    if (!selectedBlockId && !selectedSlotId) {
      if (lastReportedSelectionSigRef.current !== null) {
        lastReportedSelectionSigRef.current = null;
        report(null);
      }
      return;
    }
    const page = doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
    const block = page?.blocks.find((b) => b.blockId === selectedBlockId);
    const slot = selectedSlotId ? doc.slots[selectedSlotId] : null;
    const rawText = slot
      ? slot.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : block?.title ?? "";

    const linkedPaths: string[] = [];
    if (block?.kind === "link-card") {
      const vaultTarget = fromVaultUri(block.url);
      if (vaultTarget) linkedPaths.push(vaultTarget);
    }

    const summary = `${page?.pageLabel ?? "Page"} › ${block?.title ?? slot?.label ?? "Block"}`;
    const snippet = rawText.slice(0, 220);
    const sig = `${path}|${page?.pageId ?? ""}|${selectedBlockId ?? ""}|${selectedSlotId ?? ""}|${summary}|${snippet}`;
    if (lastReportedSelectionSigRef.current === sig) return;
    lastReportedSelectionSigRef.current = sig;

    report({
      resourceId: path,
      kind: "canvas-nodes",
      summary,
      text: snippet,
      pageId: page?.pageId,
      blockIds: selectedBlockId ? [selectedBlockId] : [],
      slotIds: selectedSlotId ? [selectedSlotId] : [],
      linkedPaths,
    });
  }, [activePageId, doc, path, selectedBlockId, selectedSlotId]);

  const handleInsertQuickBlock = (kind: InsertableBlockKind | "callout-box" | "divider") => {
    const targetPage = doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
    if (!targetPage) return;
    const suffix = uidFactory();

    if (kind === "callout-box") {
      const slotId = `slot_callout_${suffix}`;
      const block: LayoutBlock = {
        blockId: `blk_callout_${suffix}`,
        kind: "callout-box",
        title: "안내 상자",
        slotId,
        tone: "info",
      };
      commitDoc((prev) =>
        insertBlock(
          prev,
          targetPage.pageId,
          block,
          {
            [slotId]: {
              slotId,
              label: "안내 상자",
              role: "editable-slot",
              content: "<p>핵심 메모나 AI 디렉팅 포인트를 입력하세요.</p>",
              backDataRefs: [],
            },
          },
          targetPage.blocks.length
        )
      );
      vdocUiBridge.getState().selectBlock(path, block.blockId, targetPage.pageId);
      return;
    }

    const draft = createInsertableBlock(kind, { suffix });
    commitDoc((prev) =>
      insertBlock(prev, targetPage.pageId, draft.block, draft.slots, targetPage.blocks.length)
    );
    vdocUiBridge.getState().selectBlock(path, draft.block.blockId, targetPage.pageId);
  };

  const handleAddPage = () => {
    const pageNum = doc.pages.length + 1;
    const pageId = `page_${uidFactory()}`;
    const built = createSectionPage({
      pageId,
      pageNumber: pageNum,
      pageLabel: `Page ${pageNum}`,
      headerHtml: "",
      footerHtml: "",
      headingHtml: `<h2>새 페이지 ${pageNum}</h2>`,
      bodyHtml: "<p>2D 블록을 추가하거나 좌측 File Explorer에서 파일을 끌어다 놓으세요.</p>",
    });
    const nextPage = { ...built.page, hideHeaderFooter: true };
    commitDoc((prev) => insertPages(prev, [nextPage], built.slots));
    vdocUiBridge.getState().setActivePage(path, nextPage.pageId);
  };

  const handleToggleSurface = () => {
    commitDoc((prev) => {
      const cur = documentSurface(prev);
      const nextKind = cur.kind === "paged" ? "scroll" : "paged";
      return {
        ...prev,
        surface: { kind: nextKind, width: nextKind === "scroll" ? 760 : 794 },
      };
    });
  };

  // Accept files dragged from File Explorer onto the 2D canvas center -> insert Vault LinkCard!
  const handleCanvasDragOver = (ev: React.DragEvent) => {
    if (!ev.dataTransfer.types.includes(VIBE_VAULT_PATHS_MIME)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "copy";
    if (!canvasDropActive) setCanvasDropActive(true);
  };

  const handleCanvasDrop = (ev: React.DragEvent) => {
    if (!ev.dataTransfer.types.includes(VIBE_VAULT_PATHS_MIME)) return;
    ev.preventDefault();
    ev.stopPropagation();
    setCanvasDropActive(false);

    const raw = ev.dataTransfer.getData(VIBE_VAULT_PATHS_MIME);
    if (!raw) return;
    try {
      const paths = JSON.parse(raw) as unknown[];
      const targetPage = doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
      if (!targetPage) return;

      for (const item of paths) {
        if (typeof item !== "string") continue;
        const node = vault.getNode(item);
        if (!node || node.kind !== "file") continue;
        const draft = createVaultLinkCardDraft(node.path);
        commitDoc((prev) =>
          insertBlock(prev, targetPage.pageId, draft.block, draft.slots, targetPage.blocks.length)
        );
        vdocUiBridge.getState().selectBlock(path, draft.block.blockId, targetPage.pageId);
      }
    } catch {
      // Ignore invalid payload
    }
  };

  // Intercept clicks on `vault://` links inside LinkCard blocks to open directly in workspace tab!
  const handleCanvasClickCapture = (ev: React.MouseEvent) => {
    const anchor = (ev.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    const vaultTarget = fromVaultUri(href);
    if (vaultTarget) {
      ev.preventDefault();
      ev.stopPropagation();
      hostRef.current.openLink(vaultTarget, ev.ctrlKey || ev.metaKey ? "new-tab" : "split-right");
    }
  };

  const handleRunAiDirective = (ev: React.FormEvent) => {
    ev.preventDefault();
    const promptText = aiPrompt.trim() || "선택한 2D 섹션 기반으로 문서를 확장해줘";
    const page = doc.pages.find((p) => p.pageId === activePageId) ?? doc.pages[0];
    const block = page?.blocks.find((b) => b.blockId === selectedBlockId);
    const slot = selectedSlotId ? doc.slots[selectedSlotId] : null;
    const text = slot
      ? slot.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : block?.title ?? doc.title;

    hostRef.current.dispatchAiDirective?.({
      resourceId: path,
      prompt: promptText,
      action: aiAction,
      selection: {
        resourceId: path,
        kind: "canvas-nodes",
        summary: `${page?.pageLabel ?? "Page"} › ${block?.title ?? doc.title}`,
        text,
        pageId: page?.pageId,
        blockIds: selectedBlockId ? [selectedBlockId] : [],
        slotIds: selectedSlotId ? [selectedSlotId] : [],
      },
    });
    setAiPrompt("");
    setAiBarOpen(false);
  };

  const surface = documentSurface(doc);

  // Stable MemoVDocPageSheet callbacks (100% referential stability so arePageSheetPropsEqual hits!)
  const handleSelectPage = useCallback(
    (pid: string) => {
      vdocUiBridge.getState().setActivePage(path, pid);
    },
    [vdocUiBridge, path]
  );

  const handleSelectBlock = useCallback(
    (bid: string) => {
      const loc = findBlock(docRef.current, bid);
      vdocUiBridge.getState().selectBlock(path, bid, loc?.pageId);
    },
    [vdocUiBridge, path]
  );

  const handleSelectSlot = useCallback(
    (sid: string) => {
      const loc = findBlockBySlotId(docRef.current, sid);
      vdocUiBridge
        .getState()
        .selectSlot(path, sid, loc?.block.blockId ?? null, loc?.pageId);
    },
    [vdocUiBridge, path]
  );

  const handleOpenAiForSlot = useCallback(() => {
    setAiBarOpen(true);
  }, []);

  const handleUpdateSlotContent = useCallback(
    (sid: string, html: string) => {
      commitDoc((prev) => setSlotContent(prev, sid, html));
    },
    [commitDoc]
  );

  const handleMoveBlock = useCallback(
    (pid: string, bIdx: number, dir: -1 | 1) => {
      commitDoc((prev) => moveBlockByOffset(prev, pid, bIdx, dir), { immediate: true });
    },
    [commitDoc]
  );

  const handleDeleteBlock = useCallback(
    (pid: string, bid: string) => {
      commitDoc((prev) => removeBlock(prev, pid, bid), { immediate: true });
    },
    [commitDoc]
  );

  const handleMoveBlockTo = useCallback(
    (fromPid: string, bid: string, toPid: string, toIdx: number) => {
      commitDoc((prev) => moveBlockToPosition(prev, fromPid, bid, toPid, toIdx), {
        immediate: true,
      });
    },
    [commitDoc]
  );

  const handleInsertBlock = useCallback<NonNullable<VDocPageSheetProps["onInsertBlock"]>>(
    (pid, kind, idx) => {
      const draft = createInsertableBlock(kind, { suffix: uidFactory() });
      commitDoc((prev) => insertBlock(prev, pid, draft.block, draft.slots, idx), {
        immediate: true,
      });
    },
    [commitDoc]
  );

  const handleDuplicateBlock = useCallback(
    (pid: string, bid: string) => {
      commitDoc((prev) => duplicateBlock(prev, pid, bid, uidFactory), { immediate: true });
    },
    [commitDoc]
  );

  const handleToggleBlockLock = useCallback(
    (pid: string, bid: string) => {
      commitDoc((prev) => toggleBlockLock(prev, pid, bid), { immediate: true });
    },
    [commitDoc]
  );

  const handleMoveBlockFrame = useCallback(
    (pid: string, bid: string, x: number, y: number) => {
      commitDoc((prev) => moveBlockFrame(prev, pid, bid, x, y));
    },
    [commitDoc]
  );

  const handleResizeBlockFrame = useCallback(
    (pid: string, bid: string, dw: number, dh: number) => {
      commitDoc((prev) => resizeBlockFrame(prev, pid, bid, dw, dh));
    },
    [commitDoc]
  );

  const handleUpdateBlock = useCallback(
    (pid: string, bid: string, updater: (prev: LayoutBlock) => LayoutBlock) => {
      commitDoc((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageId !== pid
            ? p
            : {
                ...p,
                blocks: p.blocks.map((b) => (b.blockId === bid ? updater(b as LayoutBlock) : b)),
              }
        ),
      }));
    },
    [commitDoc]
  );

  const handleTableCommand = useCallback(
    (pid: string, bid: string, secId: string | null, cmd: TableCommand) => {
      commitDoc((prev) => applyTableCommandToDocument(prev, pid, bid, secId, cmd, uidFactory), {
        immediate: true,
      });
    },
    [commitDoc]
  );

  const renderPage = useCallback(
    (page: VDocPage) => (
      <div
        key={page.pageId}
        data-vdoc-page-id={page.pageId}
        onClick={(ev) => {
          ev.stopPropagation();
          vdocUiBridge.getState().setActivePage(path, page.pageId);
        }}
        className="text-slate-900"
      >
        <MemoVDocPageSheet
          docTitle={doc.title}
          totalPages={doc.pages.length}
          seamless={surface.kind === "scroll"}
          page={page}
          slots={doc.slots}
          backdata={doc.backdata}
          mode={mode}
          selectedBlockId={selectedBlockId}
          selectedSlotId={selectedSlotId}
          composerOpenSlotId={null}
          onSelectPage={handleSelectPage}
          onSelectBlock={handleSelectBlock}
          onSelectSlot={handleSelectSlot}
          onToggleComposerForSlot={handleOpenAiForSlot}
          onOpenBackdataDrawer={handleOpenAiForSlot}
          onUpdateSlotContent={handleUpdateSlotContent}
          onMoveBlock={handleMoveBlock}
          onDeleteBlock={handleDeleteBlock}
          onMoveBlockTo={handleMoveBlockTo}
          onInsertBlock={handleInsertBlock}
          onDuplicateBlock={handleDuplicateBlock}
          onToggleBlockLock={handleToggleBlockLock}
          onMoveBlockFrame={handleMoveBlockFrame}
          onResizeBlockFrame={handleResizeBlockFrame}
          onUpdateBlock={handleUpdateBlock}
          onTableCommand={handleTableCommand}
        />
      </div>
    ),
    [
      doc.backdata,
      doc.pages.length,
      doc.slots,
      doc.title,
      handleDeleteBlock,
      handleDuplicateBlock,
      handleInsertBlock,
      handleMoveBlock,
      handleMoveBlockFrame,
      handleMoveBlockTo,
      handleOpenAiForSlot,
      handleResizeBlockFrame,
      handleSelectBlock,
      handleSelectPage,
      handleSelectSlot,
      handleTableCommand,
      handleToggleBlockLock,
      handleUpdateBlock,
      handleUpdateSlotContent,
      mode,
      path,
      selectedBlockId,
      selectedSlotId,
      surface.kind,
      vdocUiBridge,
    ]
  );

  return (
    <div
      onDragOver={handleCanvasDragOver}
      onDragLeave={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
          setCanvasDropActive(false);
        }
      }}
      onDrop={handleCanvasDrop}
      onClickCapture={handleCanvasClickCapture}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#2b2d31]"
      style={{
        boxShadow: canvasDropActive
          ? "inset 0 0 0 2px var(--obs-accent,#8a5cf5)"
          : undefined,
      }}
    >
      <VDocOverlayStyle bridge={vdocUiBridge} path={path} />

      {/* 2D Canvas Top Control Strip */}
      <div className="flex h-8 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "Editing" ? "Viewing" : "Editing"))}
            className="flex items-center gap-1 rounded-[4px] border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2 py-0.5 text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            {mode === "Editing" ? <Pencil className="h-3 w-3 text-sky-400" /> : <Eye className="h-3 w-3" />}
            <span>{mode}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleSurface}
            className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            title="Toggle A4 Paged vs Continuous Scroll surface"
          >
            <ScrollText className="h-3 w-3" />
            <span>{surface.kind === "paged" ? "A4 Paged" : "Scroll"}</span>
          </button>

          <button
            type="button"
            onClick={handleAddPage}
            className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <Plus className="h-3 w-3" />
            <span>Page</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-code text-[10.5px] opacity-75">
            {doc.pages.length} {doc.pages.length === 1 ? "page" : "pages"}
          </span>
          <div className="h-3.5 w-px bg-[var(--obs-border,#363636)]" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="rounded p-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            className="w-10 text-center font-code text-[11px] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            className="rounded p-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Drop Hint Banner when dragging a Vault file onto 2D canvas center */}
      {canvasDropActive && (
        <div className="pointer-events-none absolute top-11 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--obs-accent,#8a5cf5)] px-3.5 py-1 text-[11.5px] font-medium text-white shadow-lg">
          Drop onto 2D canvas to insert Vault Link Card
        </div>
      )}

      {/* Scrollable 2D Canvas Viewport */}
      <div
        ref={canvasScrollRef}
        onClick={() => vdocUiBridge.getState().selectBlock(path, null)}
        className="min-h-0 flex-1 overflow-auto px-6 py-8 pb-28"
      >
        <div
          className="mx-auto flex flex-col items-center gap-6 transition-transform"
          style={{
            transform: zoom === 100 ? undefined : `scale(${zoom / 100})`,
            transformOrigin: "top center",
          }}
        >
          <WindowedPageChunker
            pages={doc.pages}
            chunkSize={6}
            activePageId={activePageId}
            pageGapPx={surface.kind === "scroll" ? 0 : 24}
            renderPage={renderPage}
          />
        </div>
      </div>

      {/* Inline 2D AI Directing Popover */}
      {aiBarOpen && (
        <form
          onSubmit={handleRunAiDirective}
          onClick={(ev) => ev.stopPropagation()}
          className="absolute bottom-20 left-1/2 z-40 w-[460px] max-w-[92%] -translate-x-1/2 rounded-xl border border-[var(--obs-accent,#8a5cf5)] bg-[#1e1e1e] p-3 text-[12px] text-[#e6edf3] shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-[#c4b5fd]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>2D AI Directing → Vault &amp; Explorer 자동 반영</span>
            </span>
            <button
              type="button"
              onClick={() => setAiBarOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            {(
              [
                { id: "extract-md", label: "새 .md 문서 추출 + 링크카드", Icon: FilePlus2 },
                { id: "extract-outline", label: "새 .outline 추출 + 링크카드", Icon: ListTree },
                { id: "enhance-slot", label: "선택 슬롯 보강", Icon: FileCode2 },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setAiAction(id)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  aiAction === id
                    ? "border-[#8a5cf5] bg-[#8a5cf5]/25 text-white"
                    : "border-[#363636] bg-[#262626] text-slate-300 hover:bg-[#303030]"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={aiPrompt}
              onChange={(ev) => setAiPrompt(ev.target.value)}
              placeholder="예: 이 섹션의 상세 스펙 문서를 뽑아서 탐색기에 추가해줘"
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-[#363636] bg-[#141414] px-2.5 py-1.5 text-[12px] text-white placeholder:text-slate-500 outline-none focus:border-[#8a5cf5]"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[#8a5cf5] px-3 py-1.5 font-medium text-white hover:bg-[#7c4dff]"
            >
              실행
            </button>
          </div>
        </form>
      )}

      {/* Bottom Figma-style Floating 2D Toolbar */}
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 select-none items-center gap-0.5 rounded-2xl border border-white/10 bg-[#2c2c2c] p-1 text-xs text-white/90 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
      >
        <button
          type="button"
          onClick={() => vdocUiBridge.getState().selectBlock(path, null)}
          title="Select"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0d99ff] text-white"
        >
          <MousePointer2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-white/15" />

        {(
          [
            { kind: "section-block", title: "Insert Section", Icon: Heading1 },
            { kind: "text", title: "Insert Text", Icon: Type },
            { kind: "structured-table", title: "Insert Table", Icon: Table2 },
            { kind: "columns-grid", title: "Insert 2-Column Grid", Icon: Columns2 },
            { kind: "callout-box", title: "Insert Callout", Icon: Info },
            { kind: "divider", title: "Insert Divider", Icon: Minus },
          ] as const
        ).map(({ kind, title, Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => handleInsertQuickBlock(kind)}
            title={title}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-white/15" />

        <button
          type="button"
          onClick={() => setAiBarOpen((v) => !v)}
          title="2D AI Directing (파일 추출 · 슬롯 보강)"
          className={`flex h-8 items-center gap-1.5 rounded-xl px-2.5 font-medium transition-colors ${
            aiBarOpen
              ? "bg-[#8a5cf5] text-white"
              : "bg-[#8a5cf5]/20 text-[#c4b5fd] hover:bg-[#8a5cf5]/35"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Direct</span>
        </button>
      </div>
    </div>
  );
};

export const VDocTabEditor = React.memo(
  VDocTabEditorImpl,
  (prev, next) =>
    prev.host.path === next.host.path &&
    prev.host.tabId === next.host.tabId &&
    prev.host.groupId === next.host.groupId &&
    prev.host.viewType === next.host.viewType &&
    prev.host.env === next.host.env
);
