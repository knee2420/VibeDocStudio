import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  Check,
  Columns2,
  Eye,
  FilePlus2,
  FolderInput,
  Heading1,
  Info,
  Link2,
  ListTree,
  Loader2,
  Minus,
  MousePointer2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  Type,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  BUILTIN_VDOC_ASSETS,
  applyTableCommandToDocument,
  buildEvidenceBacklinkIndex,
  createInsertableBlock,
  documentSurface,
  duplicateBlock,
  findBlock,
  findBlockBySlotId,
  getBlockSlotIds,
  insertBlock,
  mapBlock,
  moveBlockByOffset,
  moveBlockFrame,
  moveBlockToPosition,
  removeBlock,
  removeBlocks,
  resizeBlockFrame,
  resolveDocumentView,
  setSlotContent,
  toggleBlockLock,
  type EvidenceLink,
  type InsertableBlockKind,
  type LayoutBlock,
  type SceneGraphNodeRole,
  type TableCommand,
  type VDocDocument,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";
import {
  MarqueeOverlay,
  MemoVDocPageSheet,
  VDocStyleProvider,
  WindowedPageChunker,
  useMarqueeSelection,
  type MarqueeCandidate,
  type VDocPageSheetProps,
} from "@vibe/slot-canvas";
import { intentFromModifiers, selectionKey } from "@vibe/selection-core";
import { VIBE_VAULT_PATHS_MIME } from "@vibe/file-explorer/core";
import type { EditorHostContext } from "@vibe/workspace-layout/core";
import { basename, findOwningProjectPath, stem } from "@vibe/vault-core";

import { applyAssetPreviewViaAi } from "@vibe/ai-vault";
import {
  describeCanvasSelection,
  type CanvasSelectionItem,
  type VDocUiBridgeStore,
  type VDocWorkMode,
} from "@vibe/canvas-state";
import {
  bindVDocToExistingOutline,
  collectOutlineCandidatesForVDoc,
  commitStagedAssetToOutlineAndVDoc,
  compileBoundOutlineIntoVDoc,
  formatProjectScopeLabel,
  importPartnerIntoProjectAndBind,
  inspectVDocOutlineLink,
  openOrCreateOutlineForVDoc,
  requestOutlineReveal,
  resolveOutlineForVDoc,
  syncVDocMeaningBackToOutline,
  unlinkVDocFromOutline,
} from "@vibe/outline-sync";
import {
  collectVaultAssets,
  collectVaultStyleEntries,
  createVaultLinkCardDraft,
  fromVaultUri,
  parseVDocJson,
  resolveActiveStyleEntry,
} from "@vibe/vault-formats";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { DocumentViewIcon } from "./DocumentSurfaceIcons";
import { AnchorChips, vdocUnitSelector } from "./ai/AnchorChips";
import { V2SlotReview } from "./ai/V2SlotReview";
import {
  VDocEvidenceBottomPanel,
  VDocSidenoteRail,
  VDocSlotEvidenceInline,
  collectVDocEvidenceEntries,
  resolveEvidenceVaultPath,
  type EvidenceLayerMode,
} from "./EvidenceExpressions";
import {
  clearResourceHighlight,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";

export interface VDocTabEditorProps {
  readonly host: EditorHostContext<IdeEditorEnv>;
}

const uidFactory = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function selectorForSceneNode(role: SceneGraphNodeRole, id: string): string {
  const esc = CSS.escape(id);
  switch (role) {
    case "row":
      return `tr[data-row-id="${esc}"]`;
    case "cell":
      return `td[data-cell-id="${esc}"]`;
    case "column":
      return `[data-col-id="${esc}"]`;
    case "media":
      return `[data-vdoc-unit="${esc}"]`;
    case "slot":
      return `[data-slot-id="${esc}"]`;
    default:
      return `[data-block-id="${esc}"]`;
  }
}

/**
 * Leaf component isolated to subscribe ONLY to hover/selection/hidden overlay state.
 * Draws razor-sharp 1:1 Figma-style bounding boxes for ANY Scene Graph node
 * (`block` / `row` / `cell` / `column` / `media` / `slot`) with ZERO re-renders of MemoVDocPageSheet.
 */
const VDocOverlayStyle = React.memo<{
  readonly bridge: VDocUiBridgeStore;
  readonly path: string;
  readonly structureMode: boolean;
}>(({ bridge, path, structureMode }) => {
  const hoveredSceneNode = useStore(bridge, (s) => s.byPath[path]?.hoveredSceneNode ?? null);
  const selectedSceneNode = useStore(bridge, (s) => s.byPath[path]?.selectedSceneNode ?? null);
  const selection = useStore(bridge, (s) => s.byPath[path]?.selection ?? null);
  const hiddenBlockIds = useStore(bridge, (s) => s.byPath[path]?.hiddenBlockIds);

  const cssText = useMemo(() => {
    const rules: string[] = [];
    if (structureMode) {
      rules.push(
        `[data-vdoc-structure-mode="true"] [data-block-id] { cursor: pointer; }`,
        // Deepest-only hover outline so nested blocks NEVER trigger double overlapping outlines with their parent table
        `[data-vdoc-structure-mode="true"] [data-block-id]:hover:not(:has([data-block-id]:hover)) { outline: 1px solid rgba(13, 153, 255, 0.72); outline-offset: -1px; }`
      );
    }

    if (selectedSceneNode && (structureMode || selectedSceneNode.role !== "block")) {
      const sel = selectorForSceneNode(selectedSceneNode.role, selectedSceneNode.id);
      const isTableSub = selectedSceneNode.role === "row" || selectedSceneNode.role === "cell";
      rules.push(
        isTableSub
          ? `${sel} { outline: 1.5px solid #0d99ff !important; outline-offset: -1px; background-color: rgba(13, 153, 255, 0.06) !important; position: relative; z-index: 4; }`
          : `${sel} { outline: 1.5px solid #0d99ff !important; outline-offset: -1px; box-shadow: inset 0 0 0 1px rgba(13, 153, 255, 0.18); position: relative; z-index: 4; }`
      );
    }

    // 다중 선택: 주 항목 말고 나머지도 같은 색 테두리 (디자인 · 구조 모드 모두)
    if (selection && selection.items.length > 1) {
      const others = selection.items
        .filter((it) => selectionKey(it) !== selection.primaryKey)
        .map((it) => selectorForSceneNode(it.kind, it.id));
      if (others.length) {
        rules.push(
          `${others.join(", ")} { outline: 2px solid rgba(13, 153, 255, 0.9) !important; outline-offset: 2px; border-radius: 2px; position: relative; z-index: 3; }`
        );
      }
      if (!structureMode && selectedSceneNode?.role === "block") {
        rules.push(`${selectorForSceneNode("block", selectedSceneNode.id)} { outline: 2.5px solid #0d99ff !important; outline-offset: 2px; position: relative; z-index: 4; }`);
      }
    }

    if (hoveredSceneNode) {
      const hovSel = selectorForSceneNode(hoveredSceneNode.role, hoveredSceneNode.id);
      const isTableSub = hoveredSceneNode.role === "row" || hoveredSceneNode.role === "cell";
      rules.push(
        isTableSub
          ? `${hovSel} { outline: 1.5px solid #0d99ff !important; outline-offset: -1px; background-color: rgba(13, 153, 255, 0.05) !important; }`
          : `${hovSel} { outline: 1.5px solid #0d99ff !important; outline-offset: -1px; }`
      );
    }

    if (hiddenBlockIds && hiddenBlockIds.size > 0) {
      for (const id of hiddenBlockIds) {
        rules.push(`[data-block-id="${CSS.escape(id)}"] { display: none !important; }`);
      }
    }
    return rules.join("\n");
  }, [hoveredSceneNode, selectedSceneNode, selection, hiddenBlockIds, structureMode]);

  return cssText ? <style>{cssText}</style> : null;
});

const VDocTabEditorImpl: React.FC<VDocTabEditorProps> = ({ host }) => {
  const { vault, vdocUiBridge, docs } = host.env;
  const path = host.path;
  const fallbackTitle = stem(path);

  const [doc, setDoc] = useState<VDocDocument>(() => docs.get(path) ?? parseVDocJson("", fallbackTitle));
  const storedWorkMode = useStore(vdocUiBridge, (s) => s.byPath[path]?.workMode ?? null);
  const workMode: VDocWorkMode = storedWorkMode ?? (doc.outlineRef ? "Structure" : "Design");
  const setWorkMode = useCallback(
    (nextMode: VDocWorkMode) => {
      vdocUiBridge.getState().setWorkMode(path, nextMode);
    },
    [vdocUiBridge, path]
  );
  const stagedPreview = useStore(vdocUiBridge, (s) => s.byPath[path]?.stagedAssetPreview ?? null);
  const [stagedFeedback, setStagedFeedback] = useState("");
  const [stagedSyncOutline, setStagedSyncOutline] = useState(true);
  const [syncFlash, setSyncFlash] = useState<"idle" | "synced" | "noop">("idle");
  const sheetMode: "Editing" | "Viewing" = workMode === "Design" ? "Editing" : "Viewing";
  const [zoom, setZoom] = useState(92);
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [aiBarOpen, setAiBarOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [styleRevision, setStyleRevision] = useState(0);
  const [outlineRevision, setOutlineRevision] = useState(0);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceLayerMode>("review");

  const openEvidenceSource = useCallback(
    (targetPath: string) => {
      const openPair = hostRef.current.env.openInPairTabGroup;
      if (openPair) {
        openPair(targetPath, { sourceTabId: hostRef.current.tabId, sourcePath: path });
      } else {
        hostRef.current.openLink(targetPath, "split-right");
      }
    },
    [path]
  );

  const vdocEvidenceIndex = useMemo(
    () => buildEvidenceBacklinkIndex(collectVDocEvidenceEntries(doc)),
    [doc]
  );

  const evidenceLinksBySlotId = useMemo(() => {
    const map = new Map<string, EvidenceLink[]>();
    for (const link of doc.evidenceLinks ?? []) {
      const list = map.get(link.slotId);
      if (list) list.push(link);
      else map.set(link.slotId, [link]);
    }
    return map;
  }, [doc.evidenceLinks]);

  const canvasScrollRef = useRef<HTMLDivElement>(null);
  /** 세션 표시 겹층용 — 캔버스 스크롤 컨테이너 요소 */
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  /** 칸 안 변경안 검토 (승인 · 거절 · 부분 승인) + 근거·인용 표현(Case 1~6) */
  const aiWorkspace = host.env.ai;
  const wrapSlotContent = useCallback(
    (slot: VDocSlot, content: React.ReactNode) => {
      const slotLinks = evidenceLinksBySlotId.get(slot.slotId);
      const inner =
        slotLinks && slotLinks.length > 0 && evidenceMode !== "clean" ? (
          <>
            {content}
            <VDocSlotEvidenceInline
              links={slotLinks}
              mode={evidenceMode}
              citationNumberBySourceKey={vdocEvidenceIndex.citationNumberBySourceKey}
              backlinkGroups={vdocEvidenceIndex.groups}
              onOpenSource={openEvidenceSource}
            />
          </>
        ) : (
          content
        );
      return aiWorkspace ? (
        <V2SlotReview ai={aiWorkspace} path={path} slot={slot}>
          {inner}
        </V2SlotReview>
      ) : (
        inner
      );
    },
    [
      aiWorkspace,
      path,
      evidenceLinksBySlotId,
      evidenceMode,
      vdocEvidenceIndex.citationNumberBySourceKey,
      vdocEvidenceIndex.groups,
      openEvidenceSource,
    ]
  );
  const attachCanvas = useCallback((el: HTMLDivElement | null) => {
    canvasScrollRef.current = el;
    setCanvasEl(el);
  }, []);
  const editorRootRef = useRef<HTMLDivElement>(null);
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
  const selection = useStore(vdocUiBridge, (s) => s.byPath[path]?.selection ?? null);
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
      // `.vdoc` 편집 중에는 `.vdoc` 만 저장한다 (`.outline` 반영은 명시적 [구조 동기화] 클릭 시에만 실행).
      docs.write(path, toWrite);
    } finally {
      localWriteRef.current = false;
    }
  }, [docs, path]);

  useEffect(() => {
    return () => {
      flushVaultWrite();
    };
  }, [flushVaultWrite]);

  // 다른 분할 창 · AI · 디스크가 이 문서를 바꾸면 공유 캐시가 새 문서를 준다 (다시 파싱은 캐시가 한 번만)
  useEffect(() => {
    const current = docs.get(path);
    if (current) setDoc(current);
    return docs.subscribe(path, (next) => {
      if (localWriteRef.current || !next) return;
      setDoc(next);
    });
  }, [docs, path]);

  // `.vstyle` 이 바뀌면 스타일 목록만, `.outline` 이 바뀌면 연결 상태만 다시 본다
  useEffect(
    () =>
      vault.subscribe((ev) => {
        if (ev.type === "vault-reset") {
          setStyleRevision((r) => r + 1);
          setOutlineRevision((r) => r + 1);
          return;
        }
        const changed =
          ev.type === "create" ? ev.node.path : ev.type === "rename" ? ev.newPath : ev.path;
        if (changed.endsWith(".vstyle") || changed.endsWith(".vstyle.json")) setStyleRevision((r) => r + 1);
        else if (changed.endsWith(".outline")) setOutlineRevision((r) => r + 1);
      }),
    [vault]
  );

  // Ensure an activePageId & initial workMode are published to the bridge for Right Dock sync
  useEffect(() => {
    if (!storedActivePageId && doc.pages[0]) {
      vdocUiBridge.getState().setActivePage(path, doc.pages[0].pageId);
    }
    if (storedWorkMode === null) {
      vdocUiBridge.getState().setWorkMode(path, doc.outlineRef ? "Structure" : "Design");
    }
  }, [doc.pages, doc.outlineRef, path, storedActivePageId, storedWorkMode, vdocUiBridge]);

  // Scroll canvas to target when clicked from Left-Bottom Figma Structure panel
  useEffect(() => {
    if (!scrollTargetId || scrollSeq === 0) return;
    const hostEl = canvasScrollRef.current;
    if (!hostEl) return;
    const escaped = CSS.escape(scrollTargetId);
    const el =
      hostEl.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`tr[data-row-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`td[data-cell-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`[data-col-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`[data-vdoc-unit="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`[data-slot-id="${escaped}"]`) ??
      hostEl.querySelector<HTMLElement>(`[data-vdoc-page-id="${escaped}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollSeq, scrollTargetId]);

  // Scoped Ctrl/Cmd + Mouse Wheel (and trackpad pinch) zoom ONLY on this 2D canvas viewport
  // Must use `{ passive: false }` native listener to block browser-wide page zoom cleanly.
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const absY = Math.abs(ev.deltaY);
      const step = absY < 40 ? Math.max(2, Math.round(absY * 0.4)) : 8;
      const delta = ev.deltaY < 0 ? step : -step;
      setZoom((prev) => Math.max(40, Math.min(200, prev + delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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

  // 캔버스 선택(여러 개 포함)을 AI Composer 에 알린다 — `host` 객체가 아니라 ref 로 (매 렌더 재보고 방지)
  useEffect(() => {
    const report = hostRef.current.reportSelection;
    if (!report) return;
    const snap = selection ? describeCanvasSelection(doc, selection, activePageId) : null;
    if (!snap) {
      if (lastReportedSelectionSigRef.current !== null) {
        lastReportedSelectionSigRef.current = null;
        report(null);
      }
      return;
    }
    const sig = `${path}|${snap.pageId ?? ""}|${snap.blockIds.join(",")}|${snap.slotIds.join(",")}|${snap.summary}|${snap.text}`;
    if (lastReportedSelectionSigRef.current === sig) return;
    lastReportedSelectionSigRef.current = sig;
    report({
      resourceId: path,
      kind: "canvas-nodes",
      summary: snap.summary,
      text: snap.text,
      pageId: snap.pageId,
      blockIds: snap.blockIds,
      slotIds: snap.slotIds,
      linkedPaths: snap.linkedPaths,
    });
  }, [activePageId, doc, path, selection]);

  /** 읽는 순서의 최상위 블록 (Shift 범위 · 마키 · 전체 선택의 단위). */
  const topLevelOrder = useMemo<CanvasSelectionItem[]>(
    () =>
      doc.pages.flatMap((p) =>
        p.blocks.map((b) => ({ id: b.blockId, kind: "block" as const, blockId: b.blockId, pageId: p.pageId }))
      ),
    [doc.pages]
  );
  const topLevelOrderRef = useRef(topLevelOrder);
  topLevelOrderRef.current = topLevelOrder;

  /** 클릭한 요소 → 고를 단위 (보조키 클릭용). 칸을 Ctrl 로 누르면 칸, 아니면 그 칸을 품은 최상위 블록. */
  const selectionItemFromTarget = useCallback(
    (targetEl: HTMLElement, preferSlot: boolean): CanvasSelectionItem | null => {
      const topIds = new Set(topLevelOrderRef.current.map((i) => i.id));
      if (preferSlot) {
        // 칸 안이 아니어도 그리드 열 · 단위 상자(테두리 · 여백)를 누르면 그 안의 칸으로
        const slotEl =
          targetEl.closest<HTMLElement>("[data-slot-id]") ??
          targetEl.closest<HTMLElement>("[data-col-id], [data-vdoc-unit]")?.querySelector<HTMLElement>("[data-slot-id]") ??
          null;
        const sid = slotEl?.dataset.slotId;
        if (sid && docRef.current.slots[sid]) {
          const loc = findBlockBySlotId(docRef.current, sid);
          return { id: sid, kind: "slot", blockId: loc?.block.blockId ?? null, pageId: loc?.pageId ?? null };
        }
      }
      let el: HTMLElement | null = targetEl.closest<HTMLElement>("[data-block-id]");
      while (el) {
        const bid = el.dataset.blockId;
        if (bid && topIds.has(bid)) return topLevelOrderRef.current.find((i) => i.id === bid) ?? null;
        el = el.parentElement?.closest<HTMLElement>("[data-block-id]") ?? null;
      }
      return null;
    },
    []
  );

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

  // Intercept clicks on `vault://` links, and in Structure mode perform v1-style Block Select ONLY!
  const handleCanvasClickCapture = (ev: React.MouseEvent) => {
    if (modifierSelectRef.current) {
      swallowIfModifierSelect(ev);
      return;
    }
    const targetEl = ev.target as HTMLElement | null;
    const citeEl = targetEl?.closest<HTMLElement>("sup[data-cite]");
    if (citeEl) {
      const citeId = citeEl.getAttribute("data-cite") ?? "";
      const slotEl = citeEl.closest<HTMLElement>("[data-slot-id]");
      const sid = slotEl?.dataset.slotId;
      const links = docRef.current.evidenceLinks ?? [];
      const hit =
        links.find((l) => (!sid || l.slotId === sid) && l.citationIds?.includes(citeId)) ??
        links.find((l) => l.citationIds?.includes(citeId));
      const vp = hit ? resolveEvidenceVaultPath(hit.locator) : null;
      if (vp) {
        ev.preventDefault();
        ev.stopPropagation();
        openEvidenceSource(vp);
        return;
      }
    }
    const anchor = targetEl?.closest<HTMLAnchorElement>("a[href]");
    if (anchor) {
      const href = anchor.getAttribute("href") ?? "";
      const vaultTarget = fromVaultUri(href);
      if (vaultTarget) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.ctrlKey || ev.metaKey) {
          hostRef.current.openLink(vaultTarget, "new-tab");
        } else if (ev.altKey) {
          hostRef.current.openLink(vaultTarget, "split-right");
        } else if (hostRef.current.env.openInPairTabGroup) {
          hostRef.current.env.openInPairTabGroup(vaultTarget, {
            sourceTabId: hostRef.current.tabId,
            sourcePath: path,
          });
        } else {
          hostRef.current.openLink(vaultTarget, "split-right");
        }
        return;
      }
    }

    if (workMode === "Structure") {
      const blockEl = targetEl?.closest<HTMLElement>("[data-block-id]");
      if (blockEl?.dataset.blockId) {
        ev.preventDefault();
        ev.stopPropagation();
        const bid = blockEl.dataset.blockId;
        const loc = findBlock(docRef.current, bid);
        vdocUiBridge.getState().selectBlock(path, bid, loc?.pageId);
        // Cross-highlight the source bullet in the paired `.outline` pane (read-only reveal)
        const sourceNodeId = loc?.block.sourceNodeId;
        const resolvedOutline = sourceNodeId
          ? resolveOutlineForVDoc(vault, path, docRef.current, { heal: false })
          : null;
        if (sourceNodeId && resolvedOutline) {
          requestOutlineReveal(resolvedOutline.outlinePath, sourceNodeId, { zoom: false });
        }
      }
    }
  };

  // v1-parity: Double-clicking a block/slot in Structure mode enters Design (Filling) mode immediately!
  const handleCanvasDoubleClickCapture = (ev: React.MouseEvent) => {
    if (workMode !== "Structure") return;
    const targetEl = ev.target as HTMLElement | null;
    const blockEl = targetEl?.closest<HTMLElement>("[data-block-id]");
    if (!blockEl?.dataset.blockId) return;
    ev.stopPropagation();
    const bid = blockEl.dataset.blockId;
    const slotEl = targetEl?.closest<HTMLElement>("[data-slot-id]");
    const sid = slotEl?.dataset.slotId ?? null;
    const loc = findBlock(docRef.current, bid);
    setWorkMode("Design");
    if (sid) {
      vdocUiBridge.getState().selectSlot(path, sid, bid, loc?.pageId);
    } else {
      vdocUiBridge.getState().selectBlock(path, bid, loc?.pageId);
    }
  };

  const [outlinePickerOpen, setOutlinePickerOpen] = useState(false);
  const [outlineSearch, setOutlineSearch] = useState("");

  const openOutlineInPair = useCallback(
    (target: string) => {
      const openPair = hostRef.current.env.openInPairTabGroup;
      if (openPair) {
        openPair(target, { sourceTabId: hostRef.current.tabId, sourcePath: path });
      } else {
        hostRef.current.openLink(target, "split-right");
      }
    },
    [path]
  );

  const owningProjectPath = useMemo(() => findOwningProjectPath(path), [path]);
  const projectScopeLabel = formatProjectScopeLabel(owningProjectPath);

  // Read-only link status (never mutates vault during render)
  const linkStatus = useMemo(() => {
    void outlineRevision;
    return inspectVDocOutlineLink(vault, path, doc);
  }, [vault, path, doc, outlineRevision]);

  const outlineCandidates = useMemo(() => {
    if (!outlinePickerOpen) return [];
    void outlineRevision;
    const all = collectOutlineCandidatesForVDoc(vault, path, doc, { includeExternal: false });
    const q = outlineSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.outlinePath.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.docDirectives.some((d) => d.label.toLowerCase().includes(q))
    );
  }, [outlinePickerOpen, outlineRevision, vault, path, doc, outlineSearch]);

  const handleEnterStructureMode = () => {
    setWorkMode("Structure");
    const opened = openOrCreateOutlineForVDoc(vault, path, openOutlineInPair, {
      allowCreate: false,
    });
    if (opened) {
      setOutlinePickerOpen(false);
    } else {
      setOutlineSearch("");
      setOutlinePickerOpen(true);
    }
  };

  const handleBindExistingOutline = (outlinePath: string, rootNodeId?: string) => {
    bindVDocToExistingOutline(vault, path, outlinePath, {
      rootNodeId,
      openLink: openOutlineInPair,
    });
    setOutlinePickerOpen(false);
    setWorkMode("Structure");
  };

  const handleImportExternalOutline = (externalOutlinePath: string, rootNodeId?: string) => {
    importPartnerIntoProjectAndBind(vault, path, externalOutlinePath, {
      rootNodeId,
      openLink: openOutlineInPair,
    });
    setOutlinePickerOpen(false);
    setWorkMode("Structure");
  };

  const handleCreateNewOutline = () => {
    openOrCreateOutlineForVDoc(vault, path, openOutlineInPair, {
      allowCreate: true,
    });
    setOutlinePickerOpen(false);
    setWorkMode("Structure");
  };

  const handleExplicitSyncAction = () => {
    flushVaultWrite();
    const changed =
      workMode === "Structure"
        ? compileBoundOutlineIntoVDoc(vault, path)
        : syncVDocMeaningBackToOutline(vault, path, docRef.current);
    setSyncFlash(changed ? "synced" : "noop");
    setTimeout(() => setSyncFlash("idle"), 1600);
  };

  const handleRunAiDirective = (ev: React.FormEvent) => {
    ev.preventDefault();
    const promptText = aiPrompt.trim();
    if (!promptText) return;
    const snap = selection ? describeCanvasSelection(doc, selection, activePageId) : null;
    const page = doc.pages.find((p) => p.pageId === (snap?.pageId ?? activePageId)) ?? doc.pages[0];
    hostRef.current.dispatchAiDirective?.({
      resourceId: path,
      prompt: promptText,
      selection: {
        resourceId: path,
        kind: "canvas-nodes",
        summary: snap?.summary ?? `${page?.pageLabel ?? "Page"} › ${doc.title}`,
        text: snap?.text ?? doc.title,
        pageId: page?.pageId,
        blockIds: snap?.blockIds ?? [],
        slotIds: snap?.slotIds ?? [],
      },
    });
    setAiPrompt("");
    setAiBarOpen(false);
  };

  const activeView = resolveDocumentView(doc);
  const surface = documentSurface(doc);

  // 볼트 `.vstyle` + 기본 팩 목록 (`.vstyle` 이 바뀔 때만 다시 모은다) — 형식 해석은 @vibe/vault-formats
  const styleCatalog = useMemo(() => {
    void styleRevision;
    return collectVaultStyleEntries(vault);
  }, [vault, styleRevision]);

  const activeStyleEntry = useMemo(
    () => resolveActiveStyleEntry(doc, vault, styleCatalog),
    // 스타일 연결 · 보기만 따른다 (본문 편집으로 다시 찾지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.styleRef, doc.viewId, doc.surface, styleCatalog, vault]
  );

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
      commitDoc((prev) => mapBlock(prev, pid, bid, updater));
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

  // Non-destructive Staged AI Asset Preview overlay (never mutates Vault until Apply!)
  const displayDoc = useMemo<VDocDocument>(() => {
    if (
      !stagedPreview ||
      stagedPreview.status !== "ready" ||
      stagedPreview.previewBlocks.length === 0
    ) {
      return doc;
    }
    const nextPages = doc.pages.map((p) => {
      if (p.pageId !== stagedPreview.targetPageId) return p;
      if (stagedPreview.targetScope === "block" && stagedPreview.targetBlockId) {
        const idx = p.blocks.findIndex((b) => b.blockId === stagedPreview.targetBlockId);
        if (idx >= 0) {
          const replaced = [
            ...p.blocks.slice(0, idx),
            ...stagedPreview.previewBlocks,
            ...p.blocks.slice(idx + 1),
          ];
          return { ...p, blocks: replaced };
        }
      }
      if (stagedPreview.mode === "insert") {
        return { ...p, blocks: [...p.blocks, ...stagedPreview.previewBlocks] };
      }
      return { ...p, blocks: [...stagedPreview.previewBlocks] };
    });
    return {
      ...doc,
      pages: nextPages,
      slots: { ...doc.slots, ...stagedPreview.previewSlots },
    };
  }, [doc, stagedPreview]);

  const handleApplyStagedAsset = useCallback(() => {
    if (!stagedPreview || stagedPreview.status !== "ready") return;
    flushVaultWrite();
    const result = commitStagedAssetToOutlineAndVDoc(vault, path, stagedPreview, {
      syncOutline: stagedSyncOutline && linkStatus.kind === "linked",
    });
    if (result.updatedVDoc) {
      docRef.current = result.updatedVDoc;
      setDoc(result.updatedVDoc);
    }
    vdocUiBridge.getState().clearStagedAssetPreview(path);
    setStagedFeedback("");
    if (result.firstBlockId) {
      vdocUiBridge
        .getState()
        .selectBlock(path, result.firstBlockId, stagedPreview.targetPageId);
    }
  }, [stagedPreview, stagedSyncOutline, linkStatus.kind, flushVaultWrite, vault, path, vdocUiBridge]);

  const handleRegenerateStagedAsset = useCallback(
    async (ev: React.FormEvent) => {
      ev.preventDefault();
      if (!stagedPreview) return;
      const fb = stagedFeedback.trim();
      const catalog = collectVaultAssets(vault);
      const asset =
        catalog.find((e) => e.asset.assetId === stagedPreview.assetId)?.asset ??
        BUILTIN_VDOC_ASSETS.find((a) => a.assetId === stagedPreview.assetId);
      if (!asset) return;

      const combinedFeedback = [...stagedPreview.feedbackHistory, ...(fb ? [fb] : [])];
      vdocUiBridge.getState().setStagedAssetPreview(path, {
        ...stagedPreview,
        status: "loading",
        rationale: fb
          ? `피드백("${fb}")을 반영해 구조를 다시 구성하고 있습니다...`
          : "구조를 다시 생성하고 있습니다...",
        feedbackHistory: combinedFeedback,
      });

      const res = await applyAssetPreviewViaAi({
        asset,
        userOutlineDsl: stagedPreview.userOutlineDsl,
        userPlainText: stagedPreview.userPlainText,
        documentTitle: docRef.current.title,
        targetScope: stagedPreview.targetScope,
        mode: stagedPreview.mode,
        feedback: combinedFeedback.join(" / "),
        viewId: resolveDocumentView(docRef.current).id === "blog" ? "blog" : "a4",
      });

      vdocUiBridge.getState().setStagedAssetPreview(path, {
        ...stagedPreview,
        status: "ready",
        engine: res.engine,
        rationale: res.rationale,
        suggestedOutlineDsl: res.outlineDsl,
        previewBlocks: res.blocks,
        previewSlots: res.slots,
        feedbackHistory: combinedFeedback,
      });
      setStagedFeedback("");
    },
    [stagedPreview, stagedFeedback, vault, vdocUiBridge, path]
  );

  const renderPage = useCallback(
    (page: VDocPage) => {
      const pageSlotIds = new Set<string>();
      const collectBlockSlots = (blk: LayoutBlock) => {
        for (const sid of getBlockSlotIds(blk)) pageSlotIds.add(sid);
        if (blk.kind === "columns-grid") {
          for (const c of blk.columns ?? []) {
            for (const nested of c.blocks ?? []) collectBlockSlots(nested);
          }
        } else if (blk.kind === "structured-table") {
          for (const r of blk.rows ?? []) {
            for (const cell of r.cells ?? []) {
              for (const nested of cell.blocks ?? []) collectBlockSlots(nested);
            }
          }
        }
      };
      for (const blk of page.blocks) collectBlockSlots(blk);
      const pageLinks =
        evidenceMode === "review"
          ? (displayDoc.evidenceLinks ?? []).filter((l) => pageSlotIds.has(l.slotId))
          : [];
      const hasSidenotes = pageLinks.some(
        (l) => (l.presentation ?? l.locator.presentation) === "sidenote"
      );

      const sheetEl = (
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
            docTitle={displayDoc.title}
            totalPages={displayDoc.pages.length}
            seamless={surface.kind === "scroll"}
            page={page}
            slots={displayDoc.slots}
            backdata={displayDoc.backdata}
            mode={stagedPreview ? "Viewing" : sheetMode}
            selectedBlockId={workMode === "Design" && !stagedPreview ? selectedBlockId : null}
            selectedSlotId={workMode === "Design" && !stagedPreview ? selectedSlotId : null}
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
            wrapSlotContent={wrapSlotContent}
          />
        </div>
      );

      if (!hasSidenotes) return sheetEl;
      return (
        <div key={page.pageId} className="flex items-start gap-4">
          {sheetEl}
          <VDocSidenoteRail
            links={pageLinks}
            citationNumberBySourceKey={vdocEvidenceIndex.citationNumberBySourceKey}
            onOpenSource={openEvidenceSource}
          />
        </div>
      );
    },
    [
      wrapSlotContent,
      displayDoc.backdata,
      displayDoc.evidenceLinks,
      displayDoc.pages.length,
      displayDoc.slots,
      displayDoc.title,
      evidenceMode,
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
      openEvidenceSource,
      path,
      selectedBlockId,
      selectedSlotId,
      sheetMode,
      stagedPreview,
      surface.kind,
      vdocEvidenceIndex.citationNumberBySourceKey,
      vdocUiBridge,
      workMode,
    ]
  );

  // --- 마키 선택: 빈 곳에서 끌어 최상위 블록 여러 개 고르기 ---------------------------------------
  const marqueeBaseRef = useRef<readonly CanvasSelectionItem[]>([]);
  const applyMarquee = useCallback(
    (ids: readonly string[], mods: { additive: boolean }) => {
      const byId = new Map(topLevelOrderRef.current.map((i) => [i.id, i] as const));
      const hit = ids.map((id) => byId.get(id)).filter((x): x is CanvasSelectionItem => Boolean(x));
      const items = mods.additive ? [...marqueeBaseRef.current, ...hit] : hit;
      vdocUiBridge.getState().setSelection(path, items);
    },
    [vdocUiBridge, path]
  );
  const marquee = useMarqueeSelection({
    containerRef: canvasScrollRef,
    enabled: workMode !== "Preview" && !stagedPreview,
    canStart: (target) =>
      !target.closest("[data-block-id], button, input, textarea, select, a[href], [contenteditable='true'], form"),
    collect: () => {
      const hostEl = canvasScrollRef.current;
      if (!hostEl) return [];
      const top = new Set(topLevelOrderRef.current.map((i) => i.id));
      const out: MarqueeCandidate[] = [];
      for (const el of hostEl.querySelectorAll<HTMLElement>("[data-vdoc-page-id] [data-block-id]")) {
        const id = el.dataset.blockId;
        if (id && top.has(id)) out.push({ id, el });
      }
      return out;
    },
    onStart: () => {
      marqueeBaseRef.current = vdocUiBridge.getState().getForPath(path).selection.items;
    },
    onUpdate: applyMarquee,
    onCommit: applyMarquee,
  });

  // --- 키보드: Esc 해제 · Ctrl/⌘+A 이 쪽 전부 · Delete 고른 블록 지우기 (글을 고치는 중엔 끼어들지 않는다) ---
  const handleCanvasKeyDown = (ev: React.KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable='true']")) return;
    const bridge = vdocUiBridge.getState();
    if (ev.key === "Escape") {
      if (bridge.getForPath(path).selection.items.length) {
        ev.preventDefault();
        bridge.clearSelection(path);
      }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "a" && workMode !== "Preview") {
      ev.preventDefault();
      const pageItems = topLevelOrderRef.current.filter((i) => i.pageId === activePageId);
      bridge.setSelection(path, pageItems.length ? pageItems : topLevelOrderRef.current);
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && workMode === "Structure" && !stagedPreview) {
      const blocks = bridge.getForPath(path).selection.items.filter((i) => i.kind === "block");
      if (!blocks.length) return;
      ev.preventDefault();
      commitDoc((prev) => removeBlocks(prev, blocks.map((b) => b.id)).doc, { immediate: true });
      bridge.clearSelection(path);
    }
  };

  // 보조키 클릭 = 여러 개 고르기 (Ctrl/⌘ 토글 · Shift 범위 · Ctrl+Shift 범위 더하기).
  // 시트는 mousedown 에서 바로 선택을 바꾸고 다시 그리므로(그 뒤 click 이 오지 않는다) pointerdown 캡처에서 먼저 가로챈다.
  const modifierSelectRef = useRef(false);
  const handleCanvasPointerDownCapture = (ev: React.PointerEvent) => {
    modifierSelectRef.current = false;
    const t = ev.target as HTMLElement;
    const editingText = Boolean(t.closest("input, textarea, select, [contenteditable='true']"));
    const intent = ev.button === 0 ? intentFromModifiers(ev) : "replace";
    if (intent !== "replace" && workMode !== "Preview" && !stagedPreview && !t.closest("a[href]")) {
      // 표 안 Shift = 표 칸 범위 선택 (표가 직접 처리)
      const inTableCell = Boolean(t.closest("td[data-cell-id]"));
      if (!(intent === "range" && inTableCell)) {
        const item = selectionItemFromTarget(t, workMode === "Design" && intent === "toggle");
        if (item) {
          ev.preventDefault();
          ev.stopPropagation();
          modifierSelectRef.current = true;
          vdocUiBridge.getState().applySelectIntent(path, intent, item, topLevelOrderRef.current);
          editorRootRef.current?.focus({ preventScroll: true });
          return;
        }
      }
    }
    if (!editingText) editorRootRef.current?.focus({ preventScroll: true });
  };
  /** 보조키 선택이 가로챈 누름의 mousedown · click 은 시트로 보내지 않는다. */
  const swallowIfModifierSelect = (ev: React.MouseEvent) => {
    if (!modifierSelectRef.current) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.type === "click") modifierSelectRef.current = false;
  };

  const [incomingHighlight, setIncomingHighlight] = useState<ResourceHighlightRequest | null>(null);

  useEffect(
    () =>
      subscribeResourceHighlight(path, (req) => {
        setIncomingHighlight(req);
        if (!req) return;
        let hitSlotId: string | null = req.slotId ?? null;
        if (!hitSlotId && req.quoteText?.trim()) {
          const needle = req.quoteText.trim().toLowerCase();
          for (const [sid, slot] of Object.entries(doc.slots)) {
            const plain = String(slot.content ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
            if (plain.includes(needle)) {
              hitSlotId = sid;
              break;
            }
          }
        }
        if (hitSlotId) {
          const hitBlock = findBlockBySlotId(doc, hitSlotId);
          if (hitBlock) {
            vdocUiBridge.getState().selectBlock(path, hitBlock.block.blockId, hitBlock.pageId);
          }
          window.setTimeout(() => {
            const root = editorRootRef.current;
            if (!root) return;
            const el = root.querySelector<HTMLElement>(`[data-slot-id="${CSS.escape(hitSlotId!)}"]`);
            if (el) {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
              el.style.outline = "2px solid #fbbf24";
              el.style.backgroundColor = "rgba(251, 191, 36, 0.22)";
              window.setTimeout(() => {
                el.style.outline = "";
                el.style.backgroundColor = "";
              }, 3500);
            }
          }, 80);
        }
      }),
    [path, doc, vdocUiBridge]
  );

  return (
    <div
      ref={editorRootRef}
      tabIndex={-1}
      onKeyDown={handleCanvasKeyDown}
      onPointerDownCapture={handleCanvasPointerDownCapture}
      onMouseDownCapture={swallowIfModifierSelect}
      onDragOver={handleCanvasDragOver}
      onDragLeave={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
          setCanvasDropActive(false);
        }
      }}
      onDrop={handleCanvasDrop}
      onClickCapture={handleCanvasClickCapture}
      onDoubleClickCapture={handleCanvasDoubleClickCapture}
      data-vdoc-structure-mode={workMode === "Structure" ? "true" : undefined}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#2b2d31] outline-none"
      style={{
        boxShadow: canvasDropActive
          ? "inset 0 0 0 2px var(--obs-accent,#8a5cf5)"
          : undefined,
      }}
    >
      <VDocOverlayStyle
        bridge={vdocUiBridge}
        path={path}
        structureMode={workMode === "Structure"}
      />

      {incomingHighlight && (
        <div
          data-testid="vdoc-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-semibold text-amber-200">
              🎯 2D 문서 하이라이트{incomingHighlight.slotId ? ` · #${incomingHighlight.slotId}` : ""}
            </span>
            {incomingHighlight.quoteText && (
              <span className="truncate text-amber-100/85">“{incomingHighlight.quoteText}”</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => clearResourceHighlight(path)}
            className="shrink-0 rounded p-0.5 text-amber-200/80 hover:bg-amber-500/20 hover:text-white"
            title="하이라이트 해제"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 2D Canvas Top Control Strip */}
      <div className="relative flex h-8 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
        <div className="flex items-center gap-1.5">
          {/* 3-Mode Workflow Toggle: [ 구조(틀) ] [ 디자인(Filling) ] [ 미리보기 ] */}
          <div
            role="group"
            aria-label="Document working mode"
            className="flex shrink-0 items-center rounded-[5px] border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-0.5"
          >
            <button
              type="button"
              onClick={handleEnterStructureMode}
              title={
                linkStatus.kind === "linked"
                  ? `구조 모드 (${basename(linkStatus.outlinePath)} 열기)`
                  : linkStatus.kind === "out-of-scope"
                    ? `프로젝트 경계 외부 .outline (${linkStatus.externalOutlinePath}) — 클릭해 등록 또는 변경`
                    : linkStatus.kind === "broken"
                      ? "연결된 .outline 경로가 끊어졌습니다 — 클릭해 복구"
                      : "구조 모드 (같은 프로젝트의 .outline 연결 또는 새로 추출)"
              }
              className={`flex items-center gap-1 rounded-[3px] px-2 py-0.5 transition-colors ${
                workMode === "Structure"
                  ? "bg-emerald-500/25 font-medium text-emerald-200"
                  : "text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
              }`}
            >
              <ListTree className="h-3 w-3 text-emerald-400" />
              <span>구조</span>
              {linkStatus.kind === "linked" ? (
                <span
                  aria-label="Outline bound"
                  className={`h-1.5 w-1.5 rounded-full ${
                    linkStatus.healed ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
              ) : linkStatus.kind === "out-of-scope" ? (
                <span
                  aria-label="Outline out of project scope"
                  className="h-1.5 w-1.5 rounded-full bg-amber-400"
                />
              ) : linkStatus.kind === "broken" ? (
                <span
                  aria-label="Outline link broken"
                  className="h-1.5 w-1.5 rounded-full bg-rose-400"
                />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setWorkMode("Design")}
              title="디자인 / Filling 모드 (WYSIWYG 개별 텍스트·표·2D 편집)"
              className={`flex items-center gap-1 rounded-[3px] px-2 py-0.5 transition-colors ${
                workMode === "Design"
                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[var(--obs-text-normal,#ececec)]"
                  : "text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
              }`}
            >
              <Pencil className="h-3 w-3 text-sky-400" />
              <span>디자인</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkMode("Preview")}
              title="발행 미리보기 모드 (읽기 전용)"
              className={`flex items-center gap-1 rounded-[3px] px-2 py-0.5 transition-colors ${
                workMode === "Preview"
                  ? "bg-[var(--obs-accent,#8a5cf5)]/25 font-medium text-[var(--obs-text-normal,#ececec)]"
                  : "text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>미리보기</span>
            </button>
          </div>

          {/* 1st-class Toolbar Link Chip — always shows bound `.outline` without opening Inspector */}
          <button
            type="button"
            onClick={() => {
              setOutlineSearch("");
              setOutlinePickerOpen((v) => !v);
            }}
            title={
              linkStatus.kind === "linked"
                ? `연결된 .outline: ${linkStatus.outlinePath} (클릭해 열기/변경/해제)`
                : linkStatus.kind === "out-of-scope"
                  ? `프로젝트 경계 외부 .outline: ${linkStatus.externalOutlinePath} (클릭해 등록 또는 해제)`
                  : linkStatus.kind === "broken"
                    ? `경로 끊어짐: ${linkStatus.rawOutlineUri}`
                    : "클릭해 같은 프로젝트의 .outline 연결"
            }
            className={`flex min-w-0 max-w-[200px] items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10.5px] transition-colors ${
              linkStatus.kind === "linked"
                ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20"
                : linkStatus.kind === "out-of-scope"
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                  : linkStatus.kind === "broken"
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                    : "border-dashed border-[var(--obs-border,#444)] bg-transparent text-[var(--obs-text-muted,#9a9a9a)] hover:border-emerald-500/40 hover:text-emerald-200"
            }`}
          >
            {linkStatus.kind === "out-of-scope" || linkStatus.kind === "broken" ? (
              <AlertTriangle className="h-3 w-3 shrink-0" />
            ) : (
              <Link2 className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">
              {linkStatus.kind === "linked"
                ? basename(linkStatus.outlinePath)
                : linkStatus.kind === "out-of-scope"
                  ? `외부 · ${basename(linkStatus.externalOutlinePath)}`
                  : linkStatus.kind === "broken"
                    ? "끊어짐 · 복구"
                    : ".outline 연결"}
            </span>
          </button>

          {linkStatus.kind === "linked" && workMode !== "Preview" && (
            <button
              type="button"
              onClick={handleExplicitSyncAction}
              title={
                workMode === "Structure"
                  ? "연결된 .outline 구조를 컴파일해 이 .vdoc 에 반영 (.outline → .vdoc)"
                  : "디자인(Filling)에서 수정한 텍스트를 원본 태그 손상 없이 .outline 에 반영 (.vdoc → .outline)"
              }
              className="flex shrink-0 items-center gap-1 rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              <span>
                {syncFlash === "synced"
                  ? workMode === "Structure"
                    ? "컴파일됨 ✓"
                    : "반영됨 ✓"
                  : syncFlash === "noop"
                    ? "변경 없음"
                    : workMode === "Structure"
                      ? "← 구조에서 컴파일"
                      : "→ 구조로 반영"}
              </span>
            </button>
          )}

          {/* 근거 레이어 표시 모드 토글 (근거 링크가 있는 문서에서만 표시) */}
          {(displayDoc.evidenceLinks?.length ?? 0) > 0 && (
            <div
              data-testid="vdoc-evidence-layer-toggle"
              className="inline-flex shrink-0 overflow-hidden rounded-[4px] border border-amber-500/35 bg-black/25 text-[10px]"
              title="근거 레이어 전환: 검토(전체) / 각주만 / 제출본(숨김)"
            >
              {(
                [
                  { id: "review", label: "근거: 검토" },
                  { id: "footnote-only", label: "각주만" },
                  { id: "clean", label: "제출본" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEvidenceMode(opt.id)}
                  className={`px-1.5 py-0.5 transition-colors ${
                    evidenceMode === opt.id
                      ? "bg-amber-500/30 font-semibold text-amber-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* 양식은 문서 생성 시 하나로 정해진다 — 전환 토글 없이 읽기 전용 배지로만 보여준다. */}
          <span
            aria-label="Document format"
            title={activeView.description}
            className={`flex shrink-0 items-center gap-1 rounded-[4px] border px-2 py-0.5 font-medium ${activeView.id === "blog"
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              : "border-sky-500/30 bg-sky-500/15 text-sky-300"
              }`}
          >
            <DocumentViewIcon viewId={activeView.id} className="h-3 w-3" />
            <span>{activeView.label}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="font-code text-[10px] opacity-75">
            {activeView.unitKind === "section"
              ? `${doc.pages.length}sec · ${surface.width}px`
              : `${doc.pages.length} ${doc.pages.length === 1 ? "page" : "pages"}`}
          </span>
          <div className="h-3.5 w-px bg-[var(--obs-border,#363636)]" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(40, z - 10))}
            className="rounded p-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            title="Zoom out (Ctrl + 휠 아래)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            title="100%로 초기화 (캔버스 위에서 Ctrl + 마우스 휠로 확대/축소)"
            className="w-9 text-center font-code text-[10.5px] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            className="rounded p-0.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            title="Zoom in (Ctrl + 휠 위)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Explicit Outline Link Picker Popover (strictly scoped to owning `.vproj`) */}
      {outlinePickerOpen && (
        <div
          onClick={(ev) => ev.stopPropagation()}
          className="absolute top-9 left-3 z-40 w-[360px] rounded-md border border-[var(--obs-border,#3d3d3d)] bg-[var(--obs-bg-secondary,#242424)] p-2.5 text-[11.5px] text-[var(--obs-text-normal,#ececec)] shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-medium">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="truncate">원천 .outline 연결</span>
              <span className="shrink-0 rounded border border-violet-500/30 bg-violet-500/15 px-1.5 py-0 text-[9.5px] text-violet-200">
                {owningProjectPath ? `PROJ · ${projectScopeLabel}` : "단독 영역"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOutlinePickerOpen(false)}
              className="rounded p-0.5 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {linkStatus.kind === "linked" && (
            <div className="mb-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-200">
                <ListTree className="h-3 w-3 shrink-0 text-emerald-400" />
                <span className="truncate">{basename(linkStatus.outlinePath)}</span>
              </div>
              <div className="mt-0.5 truncate pl-4 font-code text-[9.5px] text-emerald-300/75">
                {linkStatus.outlinePath}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    openOrCreateOutlineForVDoc(vault, path, openOutlineInPair, {
                      allowCreate: false,
                    });
                    setOutlinePickerOpen(false);
                  }}
                  className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10.5px] text-emerald-100 hover:bg-emerald-500/30"
                >
                  페어 탭 열기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlinkVDocFromOutline(vault, path);
                    setOutlinePickerOpen(false);
                  }}
                  className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] text-rose-300 hover:bg-rose-500/15"
                >
                  <Unlink className="h-3 w-3" />
                  <span>연결 해제</span>
                </button>
              </div>
            </div>
          )}

          {linkStatus.kind === "out-of-scope" && (
            <div className="mb-2 rounded border border-amber-500/35 bg-amber-500/10 p-2 text-[10.5px] text-amber-100">
              <div className="flex items-center gap-1 font-medium text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>프로젝트 경계 외부의 .outline 입니다</span>
              </div>
              <div className="mt-0.5 truncate font-code text-[9.5px] opacity-80">
                {linkStatus.externalOutlinePath}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleImportExternalOutline(
                      linkStatus.externalOutlinePath,
                      linkStatus.rootNodeId
                    )
                  }
                  className="flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/25 px-2 py-1 text-[10.5px] font-medium text-amber-100 hover:bg-amber-500/35"
                >
                  <FolderInput className="h-3 w-3" />
                  <span>이 프로젝트로 등록 (가져오기)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlinkVDocFromOutline(vault, path);
                    setOutlinePickerOpen(false);
                  }}
                  className="ml-auto rounded px-1.5 py-1 text-[10px] text-rose-300 hover:bg-rose-500/15"
                >
                  해제
                </button>
              </div>
            </div>
          )}

          {linkStatus.kind === "broken" && (
            <div className="mb-2 flex items-start justify-between gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[10.5px] text-rose-200">
              <div className="flex min-w-0 items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                <div className="min-w-0">
                  <div className="font-medium">기존 연결 경로를 찾을 수 없습니다</div>
                  <div className="truncate font-code text-[10px] opacity-80">
                    {fromVaultUri(linkStatus.rawOutlineUri) ?? linkStatus.rawOutlineUri}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  unlinkVDocFromOutline(vault, path);
                  setOutlinePickerOpen(false);
                }}
                className="shrink-0 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] hover:bg-rose-500/30"
              >
                해제
              </button>
            </div>
          )}

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-[var(--obs-text-faint,#777)]" />
            <input
              type="text"
              value={outlineSearch}
              onChange={(ev) => setOutlineSearch(ev.target.value)}
              placeholder=".outline 검색..."
              className="w-full rounded border border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-primary,#1a1a1a)] py-1 pr-2 pl-6 text-[11px] outline-none focus:border-emerald-400"
            />
          </div>

          <div className="max-h-52 space-y-1 overflow-y-auto pr-0.5">
            <div className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#808080)] uppercase">
              같은 경계 내 .outline ({outlineCandidates.length})
            </div>
            {outlineCandidates.length === 0 ? (
              <div className="rounded bg-black/20 px-2 py-2.5 text-center text-[10.5px] text-[var(--obs-text-faint,#777)]">
                같은 경계에 연결할 .outline 파일이 없습니다.
              </div>
            ) : (
              outlineCandidates.map((cand) => (
                <div
                  key={cand.outlinePath}
                  className="rounded border border-transparent bg-[var(--obs-bg-primary,#1b1b1b)] p-1.5 hover:border-emerald-500/35"
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleBindExistingOutline(
                        cand.outlinePath,
                        cand.docDirectives[0]?.nodeId
                      )
                    }
                    className="flex w-full items-center justify-between gap-1.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <ListTree className="h-3 w-3 shrink-0 text-emerald-400" />
                        <span className="truncate font-medium text-[var(--obs-text-normal,#ececec)]">
                          {basename(cand.outlinePath)}
                        </span>
                        {cand.sameFolder && (
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0 text-[9.5px] text-emerald-300">
                            같은 폴더
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate pl-4 font-code text-[9.5px] text-[var(--obs-text-faint,#808080)]">
                        {cand.folder || "/"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
                      연결
                    </span>
                  </button>

                  {cand.docDirectives.length > 1 && (
                    <div className="mt-1.5 space-y-0.5 border-t border-white/5 pt-1 pl-4">
                      {cand.docDirectives.map((dir) => (
                        <button
                          key={dir.nodeId}
                          type="button"
                          onClick={() =>
                            handleBindExistingOutline(cand.outlinePath, dir.nodeId)
                          }
                          className="flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-[10px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/5 hover:text-white"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="mr-1 font-code text-emerald-300">
                              {dir.rawToken}
                            </span>
                            {dir.label}
                          </span>
                          <span className="shrink-0 text-[9.5px] text-emerald-400">
                            {dir.boundVDocPath ? basename(dir.boundVDocPath) : "선택"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--obs-border-subtle,#323232)] pt-2">
            <span className="text-[10px] text-[var(--obs-text-faint,#808080)]">
              현재 경계 안에 새 구조 추출
            </span>
            <button
              type="button"
              onClick={handleCreateNewOutline}
              className="flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/15 px-2 py-1 text-[10.5px] font-medium text-sky-200 transition-colors hover:bg-sky-500/25"
            >
              <FilePlus2 className="h-3 w-3" />
              <span>새 .outline 추출</span>
            </button>
          </div>
        </div>
      )}

      {/* Drop Hint Banner when dragging a Vault file onto 2D canvas center */}
      {canvasDropActive && (
        <div className="pointer-events-none absolute top-11 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--obs-accent,#8a5cf5)] px-3.5 py-1 text-[11.5px] font-medium text-white shadow-lg">
          Drop onto 2D canvas to insert Vault Link Card
        </div>
      )}

      {/* Scrollable 2D Canvas Viewport */}
      <div
        ref={attachCanvas}
        onClick={() => vdocUiBridge.getState().selectBlock(path, null)}
        onPointerDown={marquee.onPointerDown}
        className="relative min-h-0 flex-1 overflow-auto px-4 py-6 pb-28"
      >
        <MarqueeOverlay rect={marquee.rect} />
        {host.env.ai && <AnchorChips ai={host.env.ai} surface="vdoc" path={path} container={canvasEl} selector={vdocUnitSelector} />}
        <div
          className="mx-auto flex flex-col items-center gap-6 transition-transform"
          style={{
            transform: zoom === 100 ? undefined : `scale(${zoom / 100})`,
            transformOrigin: "top center",
          }}
        >
          <VDocStyleProvider
            pack={activeStyleEntry?.pack ?? null}
            mode={doc.styleRef?.mode}
            viewKey={activeView.id}
          >
            <WindowedPageChunker
              pages={displayDoc.pages}
              chunkSize={6}
              activePageId={activePageId}
              pageGapPx={surface.kind === "scroll" ? 0 : 24}
              renderPage={renderPage}
            />
            <VDocEvidenceBottomPanel
              doc={displayDoc}
              mode={evidenceMode}
              groups={vdocEvidenceIndex.groups}
              onOpenSource={openEvidenceSource}
              onSelectSlot={handleSelectSlot}
            />
          </VDocStyleProvider>
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
              <span>AI Composer 에 지시 — 선택한 칸 · 블록이 이번 메시지 범위가 됩니다</span>
            </span>
            <button
              type="button"
              onClick={() => setAiBarOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={aiPrompt}
              onChange={(ev) => setAiPrompt(ev.target.value)}
              placeholder="예: 이 칸을 리소스를 근거로 채워서 변경안으로 올려줘"
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-[#363636] bg-[#141414] px-2.5 py-1.5 text-[12px] text-white placeholder:text-slate-500 outline-none focus:border-[#8a5cf5]"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[#8a5cf5] px-3 py-1.5 font-medium text-white hover:bg-[#7c4dff]"
            >
              보내기
            </button>
          </div>
        </form>
      )}

      {/* Floating Staged AI Asset Preview Bar (Non-Destructive Preview -> Apply / Feedback / Revert) */}
      {stagedPreview && (
        <div
          onClick={(ev) => ev.stopPropagation()}
          className="absolute bottom-5 left-1/2 z-40 w-[580px] max-w-[94%] -translate-x-1/2 rounded-xl border border-[var(--obs-accent,#8a5cf5)] bg-[#1c1b24]/95 p-3 text-[11.5px] text-[#e6edf3] shadow-[0_14px_40px_rgba(0,0,0,0.6)] backdrop-blur-md"
        >
          {stagedPreview.status === "loading" ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#ddd6fe]">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--obs-accent,#8a5cf5)]" />
                <div className="min-w-0">
                  <div className="font-semibold">에셋 느낌 보기: {stagedPreview.assetTitle}</div>
                  <div className="truncate text-[10.5px] text-white/70">
                    {stagedPreview.rationale}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => vdocUiBridge.getState().clearStagedAssetPreview(path)}
                className="shrink-0 rounded border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/15"
              >
                취소
              </button>
            </div>
          ) : stagedPreview.status === "error" ? (
            <div className="flex items-center justify-between gap-2 text-rose-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{stagedPreview.errorMessage ?? "에셋 미리보기 생성에 실패했습니다."}</span>
              </div>
              <button
                type="button"
                onClick={() => vdocUiBridge.getState().clearStagedAssetPreview(path)}
                className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20"
              >
                닫기
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold text-[#ddd6fe]">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
                    <span className="truncate">에셋 느낌 보기 · {stagedPreview.assetTitle}</span>
                    <span className="rounded bg-[var(--obs-accent,#8a5cf5)]/25 px-1.5 py-0 font-code text-[9.5px] text-[#e9d5ff]">
                      {stagedPreview.engine === "llm" ? "AI" : "규칙 폴백"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-4 text-white/75">
                    {stagedPreview.rationale}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => vdocUiBridge.getState().clearStagedAssetPreview(path)}
                  title="되돌리기"
                  className="shrink-0 rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <form onSubmit={(ev) => void handleRegenerateStagedAsset(ev)} className="flex gap-1.5">
                <input
                  type="text"
                  value={stagedFeedback}
                  onChange={(ev) => setStagedFeedback(ev.target.value)}
                  placeholder="한 줄 피드백 (예: 비고 열 추가해줘 / 항목을 2그룹으로 나눠줘)"
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/35 px-2.5 py-1 text-[11px] text-white placeholder:text-white/40 outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
                />
                <button
                  type="submit"
                  className="flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>재생성</span>
                </button>
              </form>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                {linkStatus.kind === "linked" ? (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-white/75">
                    <input
                      type="checkbox"
                      checked={stagedSyncOutline}
                      onChange={(ev) => setStagedSyncOutline(ev.target.checked)}
                      className="h-3 w-3 accent-emerald-400"
                    />
                    <span>연결된 .outline 구조에도 함께 반영</span>
                  </label>
                ) : (
                  <span className="text-[10px] text-white/50">
                    적용 전까지 원본 .vdoc 파일은 변경되지 않습니다
                  </span>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => vdocUiBridge.getState().clearStagedAssetPreview(path)}
                    className="flex items-center gap-1 rounded-md border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>되돌리기</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyStagedAsset}
                    className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-950 shadow hover:bg-emerald-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>적용 (Apply)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Structure Mode Subtle Hint Pill (v1-parity frame selection mode) */}
      {workMode === "Structure" && !stagedPreview && (
        <div
          onClick={(ev) => ev.stopPropagation()}
          className="pointer-events-none absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 select-none items-center gap-2 rounded-full border border-emerald-500/30 bg-[#1e2422]/90 px-3.5 py-1.5 text-[11px] text-emerald-200 shadow-lg backdrop-blur-sm"
        >
          <ListTree className="h-3.5 w-3.5 text-emerald-400" />
          <span>구조 모드 · 우측 에셋 패널에서 양식 느낌 보기 · 더블클릭으로 디자인(Filling) 진입</span>
        </div>
      )}

      {/* Bottom Figma-style Floating 2D Toolbar (only in Design / Filling mode) */}
      {workMode === "Design" && !stagedPreview && (
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
            className={`flex h-8 items-center gap-1.5 rounded-xl px-2.5 font-medium transition-colors ${aiBarOpen
              ? "bg-[#8a5cf5] text-white"
              : "bg-[#8a5cf5]/20 text-[#c4b5fd] hover:bg-[#8a5cf5]/35"
              }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Direct</span>
          </button>
        </div>
      )}
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
