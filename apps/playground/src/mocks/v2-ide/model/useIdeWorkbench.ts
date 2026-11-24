import { insertBlock, setSlotContent } from "@vibe/vdoc-schema";
import {
  createIngestingRefDocument,
  createRefFromVaultFile,
  isRefPath,
  parseRefJson,
  refFileStemFromTitle,
  rewriteRefPointersOnRename,
  serializeRefJson,
  type RefDocument,
} from "@vibe/ref-canvas/core";
import {
  LocalApiVaultAdapter,
  MemoryVaultAdapter,
  VaultMetadataCache,
  createOrMountLocalVault,
  basename,
  dirname,
  listLocalVaults,
  rewriteWikilinksOnRename,
  runVaultRenameRewriters,
  saveLocalVaultAppState,
  type LocalApiVaultStatusSnapshot,
  type LocalVaultSessionPayload,
  type LocalVaultSummary,
  type VaultEvent,
  type VaultPort,
  type VaultSortOrder,
} from "@vibe/vault-core";
import {
  createFileExplorerStore,
  type FileExplorerStore,
} from "@vibe/file-explorer/core";
import {
  createWorkspaceLayoutStore,
  findTabLocation,
  getAllGroups,
  type EditorAiDirective,
  type EditorRegistry,
  type EditorSelectionSnapshot,
  type OpenResourceMode,
  type WorkspaceLayoutSnapshot,
  type WorkspaceLayoutStore,
} from "@vibe/workspace-layout/core";

import { createIdeEditorRegistry, type IdeEditorEnv } from "./editorAdapters";
import { mountLocalFolderAsVault } from "./localVaultMount";
import {
  createVaultLinkCardDraft,
  createVDocStore,
  isOutlinePath,
  isVDocPath,
  parseOutlineJson,
  parseVDocJson,
  rewriteOutlineBindingsOnRename,
  rewriteVDocPointersOnRename,
  serializeVDocJson,
  type VDocStore,
} from "@vibe/vault-formats";
import { importWebUrlAsRefStream } from "./refClient";
import { V2_SAMPLE_VAULT_SEEDS, resolveTabTitle } from "./sampleVault";
import { createVDocUiBridgeStore, type VDocUiBridgeStore } from "@vibe/canvas-state";

export interface IdeLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly source: "vault" | "layout" | "explorer" | "composer" | "ref" | "agent";
  readonly level: "info" | "ok" | "warn";
  readonly message: string;
}

export interface AiDirectiveExecutionResult {
  readonly createdPath?: string;
  readonly summary: string;
}

export interface IdeWorkbenchRuntime {
  readonly mode: "local" | "memory";
  readonly vaultRootPath: string | null;
  readonly vault: VaultPort;
  readonly metadataCache: VaultMetadataCache;
  readonly explorer: FileExplorerStore;
  readonly layout: WorkspaceLayoutStore;
  readonly editorRegistry: EditorRegistry<IdeEditorEnv>;
  readonly vdocUiBridge: VDocUiBridgeStore;
  readonly docs: VDocStore;
  readonly openVaultFile: (
    path: string,
    mode?: OpenResourceMode,
    explicitViewType?: string
  ) => void;
  /**
   * 현재 탭과 같은 Chrome 스타일 그룹 탭(TabGroup)에 대상 파일을 추가(또는 재사용)하고,
   * 그룹의 2분할 페어 뷰(L/R) 슬롯만 치환해 나란히 보여 준다. (별도 물리 분할 금지 · 기존 그룹 탭 보존)
   */
  readonly openFileInPairTabGroup: (
    targetPath: string,
    options?: { readonly sourceTabId?: string; readonly sourcePath?: string }
  ) => void;
  readonly openWikilink: (
    linkTarget: string,
    fromPath: string,
    mode?: OpenResourceMode
  ) => boolean;
  readonly promoteFileToRef: (
    vaultPath: string,
    openMode?: OpenResourceMode
  ) => Promise<string | null>;
  readonly importRefDocument: (
    targetFolder: string,
    doc: RefDocument,
    options?: {
      readonly replacePath?: string | null;
      readonly openMode?: OpenResourceMode;
      /** File name a person typed for this reference; wins over the source title. */
      readonly fileName?: string;
    }
  ) => string | null;
  readonly startAsyncUrlRefImport: (options: {
    readonly url: string;
    readonly title?: string;
    readonly targetFolder: string;
    readonly replacePath?: string | null;
    readonly openMode?: OpenResourceMode;
    /** File name a person typed for this reference; wins over the source title. */
    readonly fileName?: string;
  }) => string | null;
  /**
   * Gives a `.ref` file its proper name after content was imported into it: the typed name if any,
   * otherwise the source's original title while the current name is still app-chosen.
   * Returns the (possibly new) path.
   */
  readonly settleRefFileName: (
    path: string,
    options: { readonly fileName?: string; readonly wasEmpty: boolean }
  ) => string;
  readonly executeAiDirective: (directive: EditorAiDirective) => AiDirectiveExecutionResult;
  readonly resetWorkspace: () => void;
  readonly resyncLocalVault: () => Promise<void>;
  readonly revealInOsExplorer: (path?: string) => Promise<void>;
  readonly getSyncStatus: () => LocalApiVaultStatusSnapshot;
  readonly subscribeSyncStatus: (
    listener: (snap: LocalApiVaultStatusSnapshot) => void
  ) => () => void;
  readonly subscribeLogs: (listener: (logs: readonly IdeLogEntry[]) => void) => () => void;
  readonly getLogs: () => readonly IdeLogEntry[];
  readonly pushLog: (
    source: IdeLogEntry["source"],
    level: IdeLogEntry["level"],
    message: string
  ) => void;
  readonly setActiveSelection: (sel: EditorSelectionSnapshot | null) => void;
  readonly getActiveSelection: () => EditorSelectionSnapshot | null;
  readonly subscribeSelection: (
    listener: (sel: EditorSelectionSnapshot | null) => void
  ) => () => void;
  readonly dispose: () => void;
}

export interface CreateIdeWorkbenchOptions {
  readonly persist?: boolean;
  readonly mode?: "local" | "memory";
  readonly vaultAdapter?: VaultPort;
  readonly initialSession?: LocalVaultSessionPayload | null;
}

export interface LocalVaultBootstrapResult {
  readonly runtime: IdeWorkbenchRuntime;
  readonly vaults: readonly LocalVaultSummary[];
  readonly activeVaultId: string;
  readonly mode: "local" | "memory";
  readonly error?: string;
}

const VAULT_STORAGE_KEY = "vibe.playground.v2ide.vault.v4";
const LAYOUT_STORAGE_KEY = "vibe.playground.v2ide.layout.v5";

function nowStamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

/**
 * Headless 4대 패키지 + 2D .vdoc 어댑터 + 좌측 Document Structure 브릿지를
 * 단방향 이벤트로 결합하는 순수 런타임 팩토리.
 */
export function createIdeWorkbenchRuntime(
  options?: CreateIdeWorkbenchOptions
): IdeWorkbenchRuntime {
  const localAdapter =
    options?.vaultAdapter instanceof LocalApiVaultAdapter ? options.vaultAdapter : null;
  const mode: "local" | "memory" = options?.mode ?? (localAdapter ? "local" : "memory");
  const persist = options?.persist ?? mode === "memory";
  let logSeq = 0;
  let logs: IdeLogEntry[] = [];
  const logListeners = new Set<(entries: readonly IdeLogEntry[]) => void>();
  let activeSelection: EditorSelectionSnapshot | null = null;
  let activeSelectionSig = "";
  const selectionListeners = new Set<(sel: EditorSelectionSnapshot | null) => void>();

  const setActiveSelection: IdeWorkbenchRuntime["setActiveSelection"] = (sel) => {
    const sig = sel
      ? `${sel.resourceId}|${sel.kind}|${sel.summary}|${sel.text ?? ""}|${sel.pageId ?? ""}|${(sel.blockIds ?? []).join(",")}|${(sel.slotIds ?? []).join(",")}`
      : "";
    if (sig === activeSelectionSig) return;
    activeSelectionSig = sig;
    activeSelection = sel;
    for (const listener of selectionListeners) {
      listener(activeSelection);
    }
  };

  const pushLog: IdeWorkbenchRuntime["pushLog"] = (source, level, message) => {
    logSeq += 1;
    const entry: IdeLogEntry = {
      id: `log-${logSeq}`,
      timestamp: nowStamp(),
      source,
      level,
      message,
    };
    logs = [...logs.slice(-199), entry];
    for (const listener of logListeners) {
      listener(logs);
    }
  };

  const memoryVault: MemoryVaultAdapter | null = options?.vaultAdapter
    ? null
    : new MemoryVaultAdapter({
      id: "vibe-ide-vault",
      name: "VibeDoc Vault",
      initialEntries: V2_SAMPLE_VAULT_SEEDS,
      storageKey: persist ? VAULT_STORAGE_KEY : undefined,
    });

  const vault: VaultPort = options?.vaultAdapter ?? memoryVault!;

  const metadataCache = new VaultMetadataCache(vault);
  const editorRegistry = createIdeEditorRegistry();
  const vdocUiBridge = createVDocUiBridgeStore();
  // 경로별 문서 캐시 — 편집기 · 인스펙터 · 구조 패널 · AI 가 같은 파싱 결과를 나눠 쓴다
  const docs = createVDocStore(vault);

  const savedExplorer = options?.initialSession?.explorer as
    | {
      expandedPaths?: string[];
      sortOrder?: VaultSortOrder;
      autoReveal?: boolean;
    }
    | undefined;

  const defaultExpanded = [
    "01. Architecture",
    "02. Specs",
    "03. Harness",
    "04. Launch-Campaign.vproj",
  ].filter((p) => vault.exists(p));
  const explorer = createFileExplorerStore(vault, {
    initialExpandedPaths: savedExplorer?.expandedPaths ?? defaultExpanded,
    initialSortOrder: savedExplorer?.sortOrder,
    initialAutoReveal: savedExplorer?.autoReveal ?? true,
  });

  const savedLayout = options?.initialSession?.layout as WorkspaceLayoutSnapshot | undefined;
  const layout = createWorkspaceLayoutStore({
    initialSnapshot: savedLayout?.version === 1 ? savedLayout : undefined,
    storageKey: mode === "memory" && persist ? LAYOUT_STORAGE_KEY : undefined,
  });

  const resolveViewTypeForPath = (path: string): string => {
    let preview: string | undefined;
    try {
      if (
        vault.exists(path) &&
        vault.getNode(path)?.kind === "file" &&
        (!vault.isLoaded || vault.isLoaded(path))
      ) {
        preview = vault.read(path).slice(0, 256);
      }
    } catch {
      // Ignore
    }
    return editorRegistry.resolveDefault(path, preview)?.id ?? "raw-code";
  };

  const openVaultFile: IdeWorkbenchRuntime["openVaultFile"] = (
    path,
    mode = "current",
    explicitViewType
  ) => {
    const node = vault.getNode(path);
    if (!node || node.kind !== "file") return;
    const viewType = explicitViewType ?? resolveViewTypeForPath(node.path);
    layout.getState().openResource({
      resourceId: node.path,
      title: resolveTabTitle(node.path),
      viewType,
      mode,
    });
    explorer.getState().setActiveFilePath(node.path);
    pushLog("layout", "info", `open(${mode}, ${viewType}) -> ${node.path}`);
  };

  const openFileInPairTabGroup: IdeWorkbenchRuntime["openFileInPairTabGroup"] = (
    targetPath,
    options
  ) => {
    const node = vault.getNode(targetPath);
    if (!node || node.kind !== "file") return;
    const viewType = resolveViewTypeForPath(node.path);

    const initialState = layout.getState();
    const allPanes = getAllGroups(initialState.root);

    // 1. Locate the source tab (exact tabId > sourcePath in active pane > sourcePath anywhere > active tab)
    let sourceLoc = options?.sourceTabId
      ? findTabLocation(initialState.root, options.sourceTabId)
      : null;
    if (!sourceLoc && options?.sourcePath) {
      const activePane = initialState.getActiveGroup();
      const inActive = activePane?.tabs.find((t) => t.resourceId === options.sourcePath);
      if (inActive) {
        sourceLoc = findTabLocation(initialState.root, inActive.id);
      } else {
        for (const pane of allPanes) {
          const hit = pane.tabs.find((t) => t.resourceId === options.sourcePath);
          if (hit) {
            sourceLoc = findTabLocation(initialState.root, hit.id);
            break;
          }
        }
      }
    }
    if (!sourceLoc) {
      const fallbackActive = initialState.getActiveTab();
      if (fallbackActive) {
        sourceLoc = findTabLocation(initialState.root, fallbackActive.id);
      }
    }
    if (!sourceLoc) {
      openVaultFile(node.path, "new-tab", viewType);
      return;
    }

    const sourceTabId = sourceLoc.tab.id;
    const sourcePaneId = sourceLoc.group.id;
    const existingSourceGroupId =
      sourceLoc.tab.tabGroupId && initialState.tabGroups[sourceLoc.tab.tabGroupId]
        ? sourceLoc.tab.tabGroupId
        : null;

    // 2. Find an existing tab for targetPath (prefer same group > same pane > anywhere) or add to the same pane
    let targetTabId: string | null = null;
    if (existingSourceGroupId) {
      const inSameGroup = sourceLoc.group.tabs.find(
        (t) => t.resourceId === node.path && t.tabGroupId === existingSourceGroupId
      );
      if (inSameGroup) targetTabId = inSameGroup.id;
    }
    if (!targetTabId) {
      const inSamePane = sourceLoc.group.tabs.find((t) => t.resourceId === node.path);
      if (inSamePane) targetTabId = inSamePane.id;
    }
    if (!targetTabId) {
      for (const pane of allPanes) {
        const anywhere = pane.tabs.find((t) => t.resourceId === node.path);
        if (anywhere) {
          targetTabId = anywhere.id;
          break;
        }
      }
    }
    if (!targetTabId) {
      const created = layout.getState().openResource({
        resourceId: node.path,
        title: resolveTabTitle(node.path),
        viewType,
        mode: "new-tab",
        groupId: sourcePaneId,
      });
      targetTabId = created.tabId;
    }

    if (targetTabId === sourceTabId) return;

    // 3. Ensure targetTab belongs to sourceTab's Chrome Tab Group (adds to existing group pool, or creates a new group)
    const afterOpen = layout.getState();
    const curSourceLoc = findTabLocation(afterOpen.root, sourceTabId);
    const curTargetLoc = findTabLocation(afterOpen.root, targetTabId);
    if (!curSourceLoc || !curTargetLoc) return;

    let tabGroupId =
      curSourceLoc.tab.tabGroupId && afterOpen.tabGroups[curSourceLoc.tab.tabGroupId]
        ? curSourceLoc.tab.tabGroupId
        : null;

    if (!tabGroupId || curTargetLoc.tab.tabGroupId !== tabGroupId) {
      // mergeTabsIntoGroup(source, target): attaches `targetTabId` right next to `sourceTabId` in `sourceTabId`'s group
      // (or creates a new Chrome Tab Group if neither had one), preserving all other tabs in the group pool.
      tabGroupId = layout.getState().mergeTabsIntoGroup(targetTabId, sourceTabId);
    }
    if (!tabGroupId) {
      openVaultFile(node.path, "split-right", viewType);
      return;
    }

    // 4. Replace ONLY the opposite Pair View slot inside the group (never closes existing group member tabs)
    const latest = layout.getState();
    const meta = latest.tabGroups[tabGroupId];
    if (!meta) return;

    if (meta.pair) {
      if (sourceTabId === meta.pair.leftTabId) {
        latest.setTabGroupPairSlot(tabGroupId, "right", targetTabId);
      } else if (sourceTabId === meta.pair.rightTabId) {
        latest.setTabGroupPairSlot(tabGroupId, "left", targetTabId);
      } else {
        latest.enableTabGroupPair(tabGroupId, {
          leftTabId: sourceTabId,
          rightTabId: targetTabId,
          activeSide: "right",
        });
      }
    } else {
      latest.enableTabGroupPair(tabGroupId, {
        leftTabId: sourceTabId,
        rightTabId: targetTabId,
        activeSide: "right",
      });
    }

    explorer.getState().setActiveFilePath(node.path);
    pushLog("layout", "info", `pair-group(${meta.title}, ${viewType}) -> ${node.path}`);
  };

  const openWikilink: IdeWorkbenchRuntime["openWikilink"] = (
    linkTarget,
    fromPath,
    mode = "current"
  ) => {
    const resolved = metadataCache.resolveLink(linkTarget, fromPath);
    if (resolved) {
      openVaultFile(resolved, mode);
      return true;
    }
    pushLog("vault", "warn", `unresolved [[${linkTarget}]] from ${fromPath}`);
    return false;
  };

  // Seed initial 2D-First workspace with Chrome Tab Group ("Architecture Pair") + sibling tab!
  // Clicking "크게 보기" expands Architecture Pair (.vdoc | .md) across the entire workspace;
  // clicking "되돌리기" folds it cleanly back into the Chrome Tab Group.
  const ensureInitialOpenTabs = () => {
    const activeTab = layout.getState().getActiveTab();
    if (!activeTab || activeTab.resourceId === null) {
      const groupedTabIds: string[] = [];
      if (vault.exists("01. Architecture/00. System-Proposal.vdoc")) {
        openVaultFile("01. Architecture/00. System-Proposal.vdoc", "current");
        const firstTab = layout.getState().getActiveTab();
        if (firstTab) groupedTabIds.push(firstTab.id);
      }
      if (vault.exists("01. Architecture/01. Vault-Contract.md")) {
        openVaultFile("01. Architecture/01. Vault-Contract.md", "new-tab");
        const secondTab = layout.getState().getActiveTab();
        if (secondTab) groupedTabIds.push(secondTab.id);
      }
      if (vault.exists("01. Architecture/02. Layout-Parity-Checklist.md")) {
        openVaultFile("01. Architecture/02. Layout-Parity-Checklist.md", "new-tab");
      }
      if (groupedTabIds.length > 0) {
        layout.getState().createTabGroupCollection(groupedTabIds, {
          title: "Architecture Pair",
          color: "purple",
        });
        const pane = layout.getState().getActiveGroup();
        if (pane) {
          layout.getState().activateTab(pane.id, groupedTabIds[0]);
        }
      }
      explorer.getState().setActiveFilePath("01. Architecture/00. System-Proposal.vdoc");
    }
  };
  ensureInitialOpenTabs();

  // 2D-First AI Directing executor -> creates Vault file, flags AI badge in Explorer, attaches link card on 2D canvas!
  const executeAiDirective: IdeWorkbenchRuntime["executeAiDirective"] = (directive) => {
    const action = directive.action ?? "extract-md";
    const sourcePath = directive.resourceId;
    const targetFolder = dirname(sourcePath) || "02. Specs";
    const selSummary = directive.selection?.summary ?? sourcePath;
    const selText = directive.selection?.text ?? "";

    pushLog("composer", "info", `2D directive(${action}): "${directive.prompt}" [${selSummary}]`);

    if (action === "enhance-slot" && isVDocPath(sourcePath) && vault.exists(sourcePath)) {
      const slotId = directive.selection?.slotIds?.[0];
      const doc = parseVDocJson(vault.read(sourcePath), sourcePath);
      const targetSlotId = slotId ?? Object.keys(doc.slots).find((k) => !k.includes("hdr") && !k.includes("ftr"));
      if (targetSlotId && doc.slots[targetSlotId]) {
        const curHtml = doc.slots[targetSlotId].content;
        const nextHtml = `${curHtml}<p><em>[AI 보강] ${directive.prompt}</em></p>`;
        const updated = setSlotContent(doc, targetSlotId, nextHtml);
        vault.write(sourcePath, serializeVDocJson(updated));
        pushLog("composer", "ok", `enhanced slot ${targetSlotId} in ${sourcePath}`);
        return { summary: `Updated slot ${targetSlotId}` };
      }
    }

    const ext = action === "extract-outline" ? "outline" : "md";
    const slug = directive.prompt
      .replace(/[\\/:*?"<>|]/g, "")
      .trim()
      .slice(0, 28) || "AI-Directed-Spec";
    const newPath = vault.getUniquePath(targetFolder, slug, ext);

    if (ext === "outline") {
      const now = new Date().toISOString();
      const outlinePayload = JSON.stringify(
        {
          version: 1,
          id: `outline-ai-${Date.now().toString(36)}`,
          title: slug,
          defaultView: "bullets",
          createdAt: now,
          updatedAt: now,
          rootNodes: [
            {
              id: "ai-r1",
              text: directive.prompt,
              isFolded: false,
              children: [
                {
                  id: "ai-c1",
                  text: `출처 2D 문서: ${selSummary}`,
                  isFolded: false,
                  children: [],
                },
                {
                  id: "ai-c2",
                  text: selText ? `원문 컨텍스트: ${selText.slice(0, 120)}` : "후속 작업 항목 정리",
                  isFolded: false,
                  children: [],
                },
              ],
            },
          ],
        },
        null,
        2
      );
      vault.createFile(newPath, outlinePayload);
    } else {
      const mdBody = `---
title: ${slug}
tags: [ai-directed, 2d-extracted]
source: ${sourcePath}
---

# ${slug}

> [!tip] 2D 캔버스 AI 디렉팅으로 자동 생성된 문서입니다
> 원본 컨텍스트: [[${sourcePath}]] (${selSummary})

## 지시 내용
- ${directive.prompt}

## 추출된 컨텍스트
${selText || "(선택된 블록 요약)"}
`;
      vault.createFile(newPath, mdBody);
    }

    // Highlight newly generated file in File Explorer with AI badge!
    explorer.getState().markExternalChange(newPath, "AI");

    // Append linked Vault LinkCard onto the source 2D .vdoc page!
    if (isVDocPath(sourcePath) && vault.exists(sourcePath)) {
      const doc = parseVDocJson(vault.read(sourcePath), sourcePath);
      const targetPageId = directive.selection?.pageId ?? doc.pages[0]?.pageId;
      const targetPage = doc.pages.find((p) => p.pageId === targetPageId) ?? doc.pages[0];
      if (targetPage) {
        const draft = createVaultLinkCardDraft(newPath, `AI 디렉팅 생성: ${directive.prompt}`);
        const updatedDoc = insertBlock(
          doc,
          targetPage.pageId,
          draft.block,
          draft.slots,
          targetPage.blocks.length
        );
        vault.write(sourcePath, serializeVDocJson(updatedDoc));
        vdocUiBridge.getState().selectBlock(sourcePath, draft.block.blockId, targetPage.pageId);
      }
    }

    pushLog("composer", "ok", `created ${newPath} -> Explorer [AI] badge + 2D link-card attached`);
    return { createdPath: newPath, summary: `Created ${newPath}` };
  };

  const rewriteVaultRefPointersOnRename = (
    targetVault: VaultPort,
    oldPath: string,
    newPath: string
  ) => {
    const updatedFiles: string[] = [];
    let totalReplacements = 0;
    for (const node of targetVault.listAll()) {
      if (node.kind !== "file" || !isRefPath(node.path)) continue;
      if (targetVault.isLoaded && !targetVault.isLoaded(node.path)) continue;
      const raw = targetVault.read(node.path);
      const res = rewriteRefPointersOnRename(raw, oldPath, newPath);
      if (res.replacements > 0) {
        targetVault.write(node.path, res.content);
        updatedFiles.push(node.path);
        totalReplacements += res.replacements;
      }
    }
    return { updatedFiles, totalReplacements };
  };

  const promoteFileToRef: IdeWorkbenchRuntime["promoteFileToRef"] = async (
    vaultPath,
    openMode = "split-right"
  ) => {
    if (vault.isReadOnly?.()) {
      pushLog("vault", "warn", "읽기 전용 볼트입니다 — 상태바 RO를 클릭해 잠금 해제 후 .ref를 생성하세요");
      return null;
    }
    const node = vault.getNode(vaultPath);
    if (!node || node.kind !== "file" || isRefPath(node.path)) return null;

    const lower = node.path.toLowerCase();
    const isBinary = /\.(pdf|png|jpg|jpeg|webp|gif|svg)$/.test(lower);
    let content: string | undefined;
    if (!isBinary) {
      if (vault.isLoaded && !vault.isLoaded(node.path) && vault.ensureLoaded) {
        content = await vault.ensureLoaded(node.path);
      } else {
        content = vault.read(node.path);
      }
    }

    const refDoc = createRefFromVaultFile({
      vaultPath: node.path,
      content,
      binaryUrl: isBinary ? vault.getBinaryUrl?.(node.path) : undefined,
    });

    const folder = dirname(node.path);
    const baseStem = node.stem || node.name.replace(/\.[^.]+$/, "") || "Reference";
    const newPath = vault.getUniquePath(folder, baseStem, "ref");
    vault.createFile(newPath, serializeRefJson(refDoc));
    explorer.getState().markExternalChange(newPath, "NEW");
    openVaultFile(newPath, openMode, "vibe-ref");
    pushLog("vault", "ok", `promoted ${node.path} -> ${newPath} (.ref)`);
    return newPath;
  };

  const importRefDocument: IdeWorkbenchRuntime["importRefDocument"] = (
    targetFolder,
    doc,
    options
  ) => {
    if (vault.isReadOnly?.()) {
      pushLog("vault", "warn", "읽기 전용 볼트입니다 — 상태바 RO를 클릭해 잠금 해제 후 Import하세요");
      return null;
    }
    const openMode = options?.openMode ?? "current";
    if (options?.replacePath && vault.exists(options.replacePath)) {
      const prev = parseRefJson(vault.read(options.replacePath), doc.title);
      vault.write(options.replacePath, serializeRefJson({ ...doc, nameSource: prev.nameSource }));
      const finalPath = settleRefFileName(options.replacePath, {
        fileName: options.fileName,
        wasEmpty: prev.frames.length === 0,
      });
      openVaultFile(finalPath, openMode, "vibe-ref");
      pushLog("vault", "ok", `imported "${doc.title}" into ${finalPath}`);
      return finalPath;
    }

    const typedStem = refFileStemFromTitle(options?.fileName ?? "");
    const safeStem = typedStem || refFileStemFromTitle(doc.title) || doc.refId;
    const newPath = vault.getUniquePath(targetFolder, safeStem, "ref");
    vault.createFile(
      newPath,
      serializeRefJson({ ...doc, nameSource: typedStem ? "user" : "auto" })
    );
    explorer.getState().markExternalChange(newPath, "NEW");
    openVaultFile(newPath, openMode, "vibe-ref");
    pushLog(
      "ref",
      "ok",
      `imported .ref "${doc.title}" (${doc.frames.length} frames · ${doc.blocks.length} blocks) -> ${newPath}`
    );
    return newPath;
  };

  /** `true` while this runtime renames a `.ref` itself, so the rename is not mistaken for a person's. */
  let renamingRefForTitle = false;

  const settleRefFileName: IdeWorkbenchRuntime["settleRefFileName"] = (path, options) => {
    if (!vault.exists(path) || vault.isReadOnly?.()) return path;
    const currentStem = basename(path).replace(/\.ref$/i, "");
    const doc = parseRefJson(vault.read(path), currentStem);
    const typedStem = refFileStemFromTitle(options.fileName ?? "");

    let nextSource: "auto" | "user";
    let desiredStem: string;
    if (typedStem) {
      nextSource = "user";
      desiredStem = typedStem;
    } else if (doc.nameSource === "auto" || (doc.nameSource === undefined && options.wasEmpty)) {
      // The name was app-chosen (or this was a blank file being filled for the first time):
      // follow the source's original title.
      nextSource = "auto";
      desiredStem = refFileStemFromTitle(doc.title);
    } else {
      return path;
    }

    if (doc.nameSource !== nextSource) {
      vault.write(path, serializeRefJson({ ...doc, nameSource: nextSource }));
    }
    if (!desiredStem || desiredStem === currentStem) return path;

    const nextPath = vault.getUniquePath(dirname(path), desiredStem, "ref");
    renamingRefForTitle = true;
    try {
      vault.rename(path, basename(nextPath));
    } catch (err) {
      pushLog("ref", "warn", `이름 변경 실패 (${path}): ${err instanceof Error ? err.message : String(err)}`);
      return path;
    } finally {
      renamingRefForTitle = false;
    }
    pushLog("ref", "ok", `이름 지정: ${basename(path)} -> ${basename(nextPath)}`);
    return nextPath;
  };

  const startAsyncUrlRefImport: IdeWorkbenchRuntime["startAsyncUrlRefImport"] = (options) => {
    if (vault.isReadOnly?.()) {
      pushLog("ref", "warn", "읽기 전용 볼트입니다 — 상태바 RO를 클릭해 잠금 해제 후 URL Import하세요");
      return null;
    }
    const trimmedUrl = options.url.trim();
    if (!trimmedUrl) return null;

    let displayTitle = options.title?.trim() || "";
    if (!displayTitle) {
      try {
        displayTitle = new URL(trimmedUrl).hostname;
      } catch {
        displayTitle = "Web Reference";
      }
    }

    const ingestingDoc = createIngestingRefDocument({
      title: displayTitle,
      targetUrl: trimmedUrl,
      stage: "init",
      message: "백엔드 웹 수집 · 렌더링 요청 중...",
      percent: 5,
    });

    const openMode = options.openMode ?? "current";
    let targetPath: string;
    let wasEmpty = true;
    if (options.replacePath && vault.exists(options.replacePath)) {
      targetPath = options.replacePath;
      const prev = parseRefJson(vault.read(targetPath), displayTitle);
      wasEmpty = prev.frames.length === 0;
      vault.write(targetPath, serializeRefJson({ ...ingestingDoc, nameSource: prev.nameSource }));
      // A typed name is the person's decision — apply it now so the tab shows it while capturing.
      if (options.fileName?.trim()) {
        targetPath = settleRefFileName(targetPath, { fileName: options.fileName, wasEmpty });
      }
    } else {
      const typedStem = refFileStemFromTitle(options.fileName ?? "");
      const safeStem = typedStem || refFileStemFromTitle(displayTitle) || "Web-Reference";
      targetPath = vault.getUniquePath(options.targetFolder, safeStem, "ref");
      vault.createFile(
        targetPath,
        serializeRefJson({
          ...ingestingDoc,
          nameSource: typedStem || options.title?.trim() ? "user" : "auto",
        })
      );
      explorer.getState().markExternalChange(targetPath, "NEW");
    }

    openVaultFile(targetPath, openMode, "vibe-ref");
    const startedAt = Date.now();
    pushLog("ref", "info", `[시작] URL Import -> ${targetPath} (${trimmedUrl})`);

    void importWebUrlAsRefStream(trimmedUrl, options.title, (ev) => {
      pushLog("ref", "info", `[${ev.percent}% · ${ev.stage}] ${ev.message}`);
      if (vault.exists(targetPath) && !vault.isReadOnly?.()) {
        const cur = parseRefJson(vault.read(targetPath), displayTitle);
        if (cur.status === "ingesting") {
          vault.write(
            targetPath,
            serializeRefJson({
              ...cur,
              ingestProgress: {
                stage: ev.stage,
                percent: ev.percent,
                message: ev.message,
                startedAt,
                targetUrl: trimmedUrl,
              },
              updatedAt: Date.now(),
            })
          );
        }
      }
    })
      .then((finalDoc) => {
        const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
        if (vault.exists(targetPath) && !vault.isReadOnly?.()) {
          const cur = parseRefJson(vault.read(targetPath), displayTitle);
          vault.write(targetPath, serializeRefJson({ ...finalDoc, nameSource: cur.nameSource }));
          targetPath = settleRefFileName(targetPath, { wasEmpty });
          explorer.getState().markExternalChange(targetPath, "NEW");
        }
        const surface = finalDoc.frames[0]?.surfaceKind ?? "unknown";
        pushLog(
          "ref",
          "ok",
          `[완료 · ${sec}s] "${finalDoc.title}" (${finalDoc.frames.length} ${surface} frames · ${finalDoc.blocks.length} blocks · ${finalDoc.layerSet}) -> ${targetPath}`
        );
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "URL Import 실패";
        const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
        pushLog("ref", "warn", `[실패 · ${sec}s] ${targetPath}: ${msg}`);
        if (vault.exists(targetPath) && !vault.isReadOnly?.()) {
          const cur = parseRefJson(vault.read(targetPath), displayTitle);
          vault.write(
            targetPath,
            serializeRefJson({
              ...cur,
              status: "failed",
              error: msg,
              ingestProgress: undefined,
              updatedAt: Date.now(),
            })
          );
        }
      });

    return targetPath;
  };

  // Bridge 1: Vault -> Layout + Auto Reference Rewriters (.md wikilinks + .vdoc/.ref pointers!)
  let runningRewriters = false;
  const unsubVault = vault.subscribe((event: VaultEvent) => {
    if (event.type === "create") {
      pushLog("vault", "ok", `create ${event.node.kind}: ${event.node.path}`);
      return;
    }
    if (event.type === "modify") {
      if (!runningRewriters) {
        pushLog("vault", "info", `write ${event.path} (${event.content.length} chars)`);
      }
      return;
    }
    if (event.type === "rename") {
      let totalRefUpdates = 0;
      const refUpdatedFiles = new Set<string>();

      for (const mapping of event.affectedMap) {
        vdocUiBridge.getState().remapPath(mapping.oldPath, mapping.newPath);
        const node = vault.getNode(mapping.newPath);
        if (node?.kind === "file") {
          layout
            .getState()
            .syncResourceRenamed(
              mapping.oldPath,
              mapping.newPath,
              resolveTabTitle(mapping.newPath),
              resolveViewTypeForPath(mapping.newPath)
            );

          runningRewriters = true;
          try {
            const summary = runVaultRenameRewriters(vault, mapping.oldPath, mapping.newPath, [
              rewriteWikilinksOnRename,
              rewriteVDocPointersOnRename,
              rewriteOutlineBindingsOnRename,
              rewriteVaultRefPointersOnRename,
            ]);
            totalRefUpdates += summary.totalReplacements;
            for (const f of summary.updatedFiles) refUpdatedFiles.add(f);
          } finally {
            runningRewriters = false;
          }

          // 제목을 따로 바꾼 적 없는 .outline 은 파일 이름을 바꾸면 제목도 따라간다.
          const oldStem = basename(mapping.oldPath).replace(/\.outline$/i, "");
          const newStem = basename(mapping.newPath).replace(/\.outline$/i, "");
          if (isOutlinePath(mapping.newPath) && oldStem !== newStem && !vault.isReadOnly?.()) {
            const raw = vault.read(mapping.newPath);
            const outline = parseOutlineJson(raw, newStem);
            if (outline.title === oldStem) {
              vault.write(mapping.newPath, JSON.stringify({ ...outline, title: newStem }, null, 2));
            }
          }

          // A person renamed this reference — keep their name from now on.
          if (
            !renamingRefForTitle &&
            isRefPath(mapping.newPath) &&
            basename(mapping.oldPath) !== basename(mapping.newPath) &&
            !vault.isReadOnly?.()
          ) {
            const renamed = parseRefJson(vault.read(mapping.newPath), basename(mapping.newPath));
            if (renamed.nameSource !== "user") {
              vault.write(mapping.newPath, serializeRefJson({ ...renamed, nameSource: "user" }));
            }
          }
        }
      }

      pushLog(
        "vault",
        "ok",
        `rename ${event.oldPath} -> ${event.newPath} (${event.affectedMap.length} affected)`
      );
      if (totalRefUpdates > 0) {
        pushLog(
          "vault",
          "ok",
          `auto-updated ${totalRefUpdates} pointer(s) (.md/.vdoc) in ${refUpdatedFiles.size} file(s)`
        );
      }
      return;
    }
    if (event.type === "delete") {
      layout.getState().syncResourceDeleted(event.affectedPaths);
      pushLog("vault", "warn", `delete ${event.path} (${event.affectedPaths.length} removed)`);
      return;
    }
    if (event.type === "vault-reset") {
      pushLog("vault", "info", "vault snapshot synchronized");
    }
  });

  // Bridge 2: Layout active tab -> File Explorer activeFilePath (+ auto-reveal)
  let prevActiveResource: string | null = layout.getState().getActiveTab()?.resourceId ?? null;
  if (prevActiveResource) {
    explorer.getState().setActiveFilePath(prevActiveResource);
  }
  const unsubLayout = layout.subscribe((state) => {
    const activeResource = state.getActiveTab()?.resourceId ?? null;
    if (activeResource !== prevActiveResource) {
      prevActiveResource = activeResource;
      explorer.getState().setActiveFilePath(activeResource);
    }
  });

  // Bridge 3: Persist `.vibe/workspace.json` & `.vibe/metadata-cache.json` inside local vault!
  let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let cacheSaveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSessionSave = () => {
    if (!localAdapter) return;
    if (sessionSaveTimer !== null) clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(() => {
      sessionSaveTimer = null;
      const ex = explorer.getState();
      void localAdapter
        .saveWorkspaceSession({
          layout: layout.getState().serializeLayout() as unknown as Record<string, unknown>,
          explorer: {
            expandedPaths: Array.from(ex.expandedPaths),
            sortOrder: ex.sortOrder,
            autoReveal: ex.autoReveal,
          },
        })
        .catch(() => {
          // Status reflected via adapter
        });
    }, 350);
  };

  const scheduleCacheSave = () => {
    if (!localAdapter) return;
    if (cacheSaveTimer !== null) clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(() => {
      cacheSaveTimer = null;
      const files: Record<string, unknown> = {};
      for (const node of vault.listAll()) {
        if (node.kind !== "file") continue;
        const meta = metadataCache.getMetadata(node.path);
        if (meta) {
          files[node.path] = {
            tags: meta.tags,
            headings: meta.headings.length,
            links: meta.links.map((l) => l.target),
          };
        }
      }
      void localAdapter.saveMetadataCache({ version: 1, files }).catch(() => {
        // Ignore transient cache write errors
      });
    }, 800);
  };

  const unsubLayoutSession = localAdapter ? layout.subscribe(scheduleSessionSave) : null;
  const unsubExplorerSession = localAdapter ? explorer.subscribe(scheduleSessionSave) : null;
  const unsubVaultCache = localAdapter
    ? vault.subscribe((ev) => {
      if (ev.type !== "vault-reset") scheduleCacheSave();
    })
    : null;

  const resyncLocalVault = async (): Promise<void> => {
    if (!localAdapter) return;
    await localAdapter.waitForIdle();
    await localAdapter.hydrate();
    explorer.getState().refresh();
    pushLog("vault", "ok", `Re-synced local vault "${vault.name}" from disk`);
  };

  const revealInOsExplorer = async (path = ""): Promise<void> => {
    if (!localAdapter) {
      pushLog(
        "explorer",
        "warn",
        "Memory 모드에서는 OS 파일 탐색기를 열 수 없습니다. 로컬 API(:8090)를 실행해 주세요."
      );
      return;
    }
    try {
      const resolvedPath = await localAdapter.revealInOsExplorer(path);
      pushLog("explorer", "ok", `reveal in File Explorer -> ${resolvedPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Reveal failed";
      pushLog("explorer", "warn", `reveal failed (${path || "/"}): ${msg}`);
    }
  };

  const resetWorkspace = () => {
    if (localAdapter) {
      void resyncLocalVault();
      return;
    }
    if (persist && typeof globalThis.localStorage !== "undefined") {
      try {
        globalThis.localStorage.removeItem(VAULT_STORAGE_KEY);
        globalThis.localStorage.removeItem(LAYOUT_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    memoryVault?.reset(V2_SAMPLE_VAULT_SEEDS);
    const freshLayout = createWorkspaceLayoutStore();
    layout.getState().restoreLayout(freshLayout.getState().serializeLayout());
    explorer.getState().expandAll();
    ensureInitialOpenTabs();
    pushLog("vault", "ok", "Sample Vault & 2D Layout restored to defaults");
  };

  const memoryStatus: LocalApiVaultStatusSnapshot = {
    status: "ready",
    pendingWrites: 0,
    lastError: null,
  };

  pushLog(
    "vault",
    "ok",
    `Mounted "${vault.name}" [${mode === "local" ? `local: ${localAdapter?.rootPath}` : "memory"}] (${vault.listAll().length} entries · ${editorRegistry.listAll().length} editor adapters)`
  );

  return {
    mode,
    vaultRootPath: localAdapter?.rootPath ?? null,
    vault,
    metadataCache,
    explorer,
    layout,
    editorRegistry,
    vdocUiBridge,
    docs,
    openVaultFile,
    openFileInPairTabGroup,
    openWikilink,
    promoteFileToRef,
    importRefDocument,
    startAsyncUrlRefImport,
    settleRefFileName,
    executeAiDirective,
    resetWorkspace,
    resyncLocalVault,
    revealInOsExplorer,
    getSyncStatus() {
      return localAdapter ? localAdapter.getStatus() : memoryStatus;
    },
    subscribeSyncStatus(listener) {
      if (localAdapter) return localAdapter.subscribeStatus(listener);
      listener(memoryStatus);
      return () => { };
    },
    subscribeLogs(listener) {
      logListeners.add(listener);
      listener(logs);
      return () => {
        logListeners.delete(listener);
      };
    },
    getLogs() {
      return logs;
    },
    pushLog,
    setActiveSelection,
    getActiveSelection() {
      return activeSelection;
    },
    subscribeSelection(listener) {
      selectionListeners.add(listener);
      listener(activeSelection);
      return () => {
        selectionListeners.delete(listener);
      };
    },
    dispose() {
      if (sessionSaveTimer !== null) clearTimeout(sessionSaveTimer);
      if (cacheSaveTimer !== null) clearTimeout(cacheSaveTimer);
      unsubLayoutSession?.();
      unsubExplorerSession?.();
      unsubVaultCache?.();
      unsubVault();
      unsubLayout();
      metadataCache.dispose();
      docs.dispose();
      explorer.getState().dispose();
      layout.getState().dispose();
      vault.dispose?.();
    },
  };
}

/**
 * 로컬 백엔드(`/api/vaults`)에서 볼트를 부팅한다.
 * - 기본 볼트가 비어 있으면 `apps/playground/data/vaults/default-vault/`에 초기 샘플 파일을 1회 시드
 * - `<vault>/.vibe/workspace.json`에서 탭·분할·그룹·탐색기 세션 복원
 * - 백엔드가 꺼져 있으면 메모리 볼트로 안전하게 폴백
 */
export async function bootstrapIdeWorkbench(options?: {
  readonly vaultId?: string;
  readonly apiBaseUrl?: string;
}): Promise<LocalVaultBootstrapResult> {
  const apiBaseUrl = options?.apiBaseUrl ?? "";
  try {
    let listed: Awaited<ReturnType<typeof listLocalVaults>> | null = null;
    let lastErr: unknown = null;
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        listed = await listLocalVaults(apiBaseUrl);
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    if (!listed) {
      throw lastErr ?? new Error("Local vault backend unreachable");
    }
    const chosenId =
      options?.vaultId && listed.vaults.some((v) => v.id === options.vaultId)
        ? options.vaultId
        : listed.activeVaultId || listed.vaults[0]?.id || "default-vault";
    const meta = listed.vaults.find((v) => v.id === chosenId) ?? listed.vaults[0];
    if (!meta) {
      throw new Error("No local vault registered");
    }

    const adapter = new LocalApiVaultAdapter({
      vaultId: meta.id,
      name: meta.name,
      rootPath: meta.rootPath,
      apiBaseUrl,
      includeContents: meta.isDefault,
    });

    await adapter.hydrate();
    const initialSession = await adapter.loadWorkspaceSession().catch(() => null);

    if (options?.vaultId && options.vaultId !== listed.activeVaultId) {
      void saveLocalVaultAppState(apiBaseUrl, {
        activeVaultId: meta.id,
        theme: "dark",
      }).catch(() => { });
    }

    const runtime = createIdeWorkbenchRuntime({
      mode: "local",
      vaultAdapter: adapter,
      initialSession,
      persist: false,
    });

    return {
      runtime,
      vaults: listed.vaults,
      activeVaultId: meta.id,
      mode: "local",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Local vault backend unreachable";
    const runtime = createIdeWorkbenchRuntime({ persist: true, mode: "memory" });
    runtime.pushLog(
      "vault",
      "warn",
      `Local API(:8090) offline -> fallback to Memory Vault (${msg})`
    );
    return {
      runtime,
      vaults: [],
      activeVaultId: "vibe-ide-vault",
      mode: "memory",
      error: msg,
    };
  }
}

export async function createOrMountWorkbenchVault(
  name: string,
  rootPath?: string,
  apiBaseUrl = ""
): Promise<LocalVaultSummary> {
  return createOrMountLocalVault(apiBaseUrl, {
    name: name.trim(),
    rootPath: rootPath?.trim() || undefined,
  });
}

/**
 * Vite Dev Server 로컬 FS 브릿지(`/local-vault-api`)를 통해 임의의 로컬 디렉터리
 * (전체 볼트 또는 부분 이관 폴더)를 읽기 전용 기본 잠금 + 지연 로딩 모드로 즉시 마운트한다.
 */
export async function mountDirectLocalFolderWorkbench(options: {
  readonly rootPath: string;
  readonly name?: string;
  readonly readOnly?: boolean;
}): Promise<LocalVaultBootstrapResult> {
  const { adapter, summary } = await mountLocalFolderAsVault({
    rootPath: options.rootPath,
    name: options.name,
    readOnly: options.readOnly ?? true,
  });

  const runtime = createIdeWorkbenchRuntime({
    mode: "local",
    vaultAdapter: adapter,
    persist: false,
  });
  runtime.pushLog(
    "vault",
    "ok",
    `Mounted local folder "${summary.name}" (${summary.rootPath}) [lazy · ${adapter.isReadOnly() ? "read-only" : "read-write"}]`
  );

  return {
    runtime,
    vaults: [summary],
    activeVaultId: summary.id,
    mode: "local",
  };
}

export function getVaultFileStats(vault: VaultPort): { files: number; folders: number } {
  let files = 0;
  let folders = 0;
  for (const node of vault.listAll()) {
    if (node.kind === "file") files += 1;
    else folders += 1;
  }
  return { files, folders };
}
