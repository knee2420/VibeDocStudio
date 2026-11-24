import {
  assignHandle,
  ComposerSessionController,
  createAiRuntime,
  type AiRuntime,
  type ComposerItem,
  type ComposerPersistence,
  type ComposerSnapshot,
  type ContextRef,
} from "@vibe/ai-kernel";
import type { VaultPort } from "@vibe/vault-core";
import { getAllGroups, type WorkspaceLayoutStore } from "@vibe/workspace-layout/core";
import { VIBE_VAULT_PATHS_MIME, type FileExplorerStore } from "@vibe/file-explorer/core";
import { isRefPath } from "@vibe/ref-canvas/core";
import { setMediaSrcResolver } from "@vibe/slot-canvas";

import { isVDocPath, type VDocStore } from "@vibe/vault-formats";
import { undoApprovedOutlinePatch } from "@vibe/outline-sync";
import type { EvidenceLocator } from "@vibe/vdoc-schema";
import type { VDocUiBridgeStore } from "@vibe/canvas-state";
import { oneOffScope, targetFromBlock, targetFromSlots, type ResolvedScope, type ScopeTarget } from "@vibe/ai-scope";
import {
  activeOutlinePath,
  activePageId,
  createV2ContextProviders,
  currentScope,
  docRef,
  fileRef,
  folderRef,
  projectDocPaths,
  readVDoc,
  resourceMountPayload,
  scopeContextRef,
  SCOPE_CONTEXT_KIND,
  type V2AiEnv,
} from "./contexts";
import { attachUploadedFiles, imageVaultRef, isImageFilePath } from "./media";
import { applyStagedChange, buildOutlinePatchChange, buildSlotHtmlChange, createV2Tools, isStale } from "./tools";
import { createV2AiStore, type V2AiStore, type V2StagedChange } from "./store";

/**
 * playground v2 의 AI Composer 런타임 — studio `@/shared/ai` + `registerWorkspaceAi` + `useComposerDocBinding` +
 * `registerAgentDraftSync` + `AiComposerView.scopeForSend` 를 볼트 모델로 묶은 것. 볼트(런타임)마다 하나.
 */
export interface V2AiWorkspaceDeps {
  readonly vault: VaultPort;
  readonly vaultRootPath: string | null;
  readonly layout: WorkspaceLayoutStore;
  readonly explorer: FileExplorerStore;
  readonly vdocUiBridge: VDocUiBridgeStore;
  /** 경로별 `.vdoc` 캐시 (편집기와 같은 것) — 컨텍스트 · 도구가 다시 파싱하지 않는다. */
  readonly docs?: VDocStore;
  readonly openVaultFile: (path: string, mode?: "current" | "new-tab" | "split-right") => void;
  readonly getTextSelection: () => { resourceId: string; text?: string; summary: string; nodeIds?: readonly string[] } | null;
  readonly pushLog: (level: "info" | "ok" | "warn", message: string) => void;
  /** 서버 주소 (vite 가 `/api` 를 8090 으로 넘긴다) */
  readonly apiBaseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly storage?: Storage | null;
}

export interface V2AiWorkspace {
  readonly runtime: AiRuntime;
  readonly controller: ComposerSessionController;
  readonly store: V2AiStore;
  readonly env: V2AiEnv;
  /** 보내기 직전 — 이번 메시지의 범위를 정해 범위 첨부를 바꾼다 (ComposerPanel.onBeforeSend) */
  scopeForSend(text: string, contexts: ContextRef[]): ContextRef[];
  pinnable(ref: ContextRef): boolean;
  pinContext(ref: ContextRef): void;
  isPinned(ref: ContextRef): boolean;
  /** 변경안 승인 · 거절 (`.outline` 패치는 선택적으로 바인딩된 `.vdoc` 자동 재컴파일 지원) */
  approve(
    diffIds: readonly string[],
    options?: { readonly recompileBoundVDocs?: boolean }
  ): { applied: number; failed: Array<{ diffId: string; why: string }> };
  reject(diffIds: readonly string[]): void;
  /** 마지막으로 승인한 `.outline` 패치를 되돌린다 (열린 탭은 outliner Undo, 닫힌 탭은 스냅샷 복원) */
  undoOutlineApproval(path: string): boolean;
  isStale(change: V2StagedChange): boolean;
  /** OS 파일 · 이미지 업로드/붙여넣기 → Composer 첨부 컨텍스트 변환 */
  attachFiles(files: readonly File[]): Promise<ContextRef[]>;
  /** 볼트 FS 트랜잭션(`vf_*`) 1클릭 되돌리기 */
  undoFsBatch(batchId: string): Promise<{ ok: boolean; message: string }>;
  /** 2D 디렉팅 · 칸 AI 버튼 → Composer 에 선택을 붙이고(선택) 프롬프트를 채운다 */
  directFromCanvas(prompt?: string): void;
  sendFromCanvas(prompt: string): Promise<void>;
  /** `.outline` 에디터 불릿 AI 디렉팅 */
  directFromOutline(prompt?: string): void;
  sendFromOutline(prompt: string): Promise<void>;
  conversationKey(path: string | null): string | null;
  /** 도구 · 제공자 · 구독을 건다 (두 번 불러도 한 번). 돌려준 함수로 푼다. */
  start(): () => void;
  /** 등록을 풀고 서버 세션(agy)을 놓는다 (페이지를 떠날 때) */
  dispose(): void;
}

/** 탐색기에서 끌어 온 볼트 파일 · 폴더 → 첨부 (`.vdoc` 는 @문서 대상, 폴더는 @폴더, 이미지는 @이미지, 그 밖은 @파일). */
export function vaultPathContext(ai: Pick<V2AiWorkspace, "env">, path: string): ContextRef | null {
  if (!ai.env.vault.exists(path)) return null;
  const node = ai.env.vault.getNode(path);
  if (node?.kind === "folder") return folderRef(ai.env, path);
  const doc = readVDoc(ai.env, path);
  if (doc) return docRef(doc, path);
  if (isVDocPath(path)) return null;
  if (node?.kind === "file" && isImageFilePath(path)) return imageVaultRef(ai.env, path);
  return node?.kind === "file" ? fileRef(path) : null;
}

const SELECTION_KINDS = new Set(["slot", "block", "slot-range"]);
const DC_TOOL = /(^|_)dc_(new|use|build|import)$/;
const RS_TOOL = /(^|_)rs_(ref_import|image_save|folder)$/;
const VAULT_RESOURCE = "resource:vault:";
const VAULT_URI = /vault:\/\/([^\n\r]+?\.vdoc)(?=\s|$)/;
const CONV_PREFIX = "vibe.playground.v2ide.composer.";
const CONV_INDEX = "vibe.playground.v2ide.composer.index";
const MAX_CONVERSATIONS = 30;

function persistence(storage: Storage | null): ComposerPersistence | null {
  if (!storage) return null;
  return {
    load(key) {
      try {
        const raw = storage.getItem(CONV_PREFIX + key);
        return raw ? (JSON.parse(raw) as ComposerSnapshot) : null;
      } catch {
        return null;
      }
    },
    save(key, snapshot) {
      try {
        const index: string[] = JSON.parse(storage.getItem(CONV_INDEX) ?? "[]");
        const next = [key, ...index.filter((k) => k !== key)];
        for (const old of next.splice(MAX_CONVERSATIONS)) storage.removeItem(CONV_PREFIX + old);
        if (snapshot.items.length === 0) {
          storage.removeItem(CONV_PREFIX + key);
          storage.setItem(CONV_INDEX, JSON.stringify(next.filter((k) => k !== key)));
          return;
        }
        storage.setItem(CONV_PREFIX + key, JSON.stringify(snapshot));
        storage.setItem(CONV_INDEX, JSON.stringify(next));
      } catch {
        /* 가득 찼거나 막혔다 — 이번 세션 대화만 */
      }
    },
  };
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createV2AiWorkspace(deps: V2AiWorkspaceDeps): V2AiWorkspace {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const runtime = createAiRuntime({ baseUrl: deps.apiBaseUrl ?? "", fetchFn: deps.fetchFn });
  const controller = new ComposerSessionController(runtime);
  controller.setPersistence(persistence(storage));
  const store = createV2AiStore(deps.vault.id, storage);

  // 지금 AI 가 보는 .vdoc — 활성 탭이 .vdoc 면 그것, 아니면 마지막으로 본 .vdoc (AI 패널을 눌러도 문서를 잃지 않게)
  let lastDocPath: string | null = null;
  const activeTabPath = () => deps.layout.getState().getActiveTab()?.resourceId ?? null;
  /** 화면에 보이는(각 창의 앞) `.vdoc` 탭 — 활성 탭이 `.outline` · `.md` 여도 옆 창의 문서를 따라간다 */
  const visibleDocPath = (): string | null => {
    const state = deps.layout.getState();
    for (const group of getAllGroups(state.root)) {
      const front = group.tabs.find((t) => t.id === group.activeTabId) ?? null;
      const p = front?.resourceId ?? null;
      if (p && isVDocPath(p) && deps.vault.exists(p)) return p;
    }
    return null;
  };
  const activeDocPath = () => {
    const tab = activeTabPath();
    if (tab && isVDocPath(tab) && deps.vault.exists(tab)) lastDocPath = tab;
    else if (lastDocPath && !deps.vault.exists(lastDocPath)) lastDocPath = null;
    if (!lastDocPath) lastDocPath = visibleDocPath();
    return lastDocPath;
  };

  const env: V2AiEnv = {
    vault: deps.vault,
    vaultId: deps.vault.id,
    vaultRootPath: deps.vaultRootPath,
    vdocUiBridge: deps.vdocUiBridge,
    store,
    activeDocPath,
    activeTabPath,
    textSelection: deps.getTextSelection,
    explorerSelection: () => [...deps.explorer.getState().selectedPaths],
    docs: deps.docs,
    apiBaseUrl: deps.apiBaseUrl,
    pushLog: deps.pushLog,
  };

  // AI Composer 대화는 파일 · 탭 전환에 영향받지 않고 볼트(워크스페이스) 단위로 고정 유지한다
  // (세션 전환은 향후 별도 Session Manager 에서 제어한다).
  const workspaceConversationKey = `${deps.vault.id}:workspace`;
  const conversationKey = (_path: string | null) => workspaceConversationKey;
  /** 서버가 docId 로 가리킨 문서 → 볼트 경로 (지금 문서 → 같은 프로젝트 문서 순) */
  const docPathOf = (docId: string | undefined): string | null => {
    const active = activeDocPath();
    if (!docId) return active;
    if (readVDoc(env, active)?.docId === docId) return active;
    return projectDocPaths(deps.vault, active).find((p) => readVDoc(env, p)?.docId === docId) ?? null;
  };

  let boundOnce = false;
  const bindWorkspaceConversation = () => {
    if (boundOnce) return;
    boundOnce = true;
    controller.bindConversation(workspaceConversationKey);
  };
  const seen = new Set<string>();
  /**
   * 리서치 결과를 화면 설정에 반영한다 — 다음 메시지도 같은 자료를 보게:
   *   rs_image_save → 그 사진 폴더를 리소스로 켠다 (서버는 이미 세션 마운트에 넣었다)
   *   rs_ref_import → 그 폴더의 새 .ref 를 레퍼런스로 켠다
   */
  const syncResearch = (tool: string, params: Record<string, unknown>) => {
    const folder = String(params.folder ?? params.path ?? "").split("\\").join("/").replace(/^\/+|\/+$/g, "");
    if (!folder) return;
    const s = store.getState();
    if (tool === "image_save") {
      const covered = s.resourceFolders.some((f) => f === "" || folder === f || folder.startsWith(`${f}/`));
      if (!covered) s.toggleResourceFolder(folder, true);
      if (!s.sourcesOn) s.setSourcesOn(true);
      deps.pushLog("ok", `research images -> resource folder ${folder}`);
    }
    if (tool === "ref_import") {
      let tries = 0;
      const enable = () => {
        const refs = deps.vault.listAll().filter((n) => n.kind === "file" && isRefPath(n.path) && n.path.startsWith(`${folder}/`));
        const fresh = refs.filter((n) => !store.getState().referencePaths.includes(n.path));
        fresh.forEach((n) => store.getState().toggleReference(n.path, true));
        if (fresh.length) deps.pushLog("ok", `research refs on -> ${fresh.map((n) => n.path).join(", ")}`);
        else if (tries++ < 10) setTimeout(enable, 500); // 볼트 감시가 새 .ref 를 아직 못 받았다
      };
      enable();
    }
  };

  /**
   * 도구 · 제공자 · 구독을 런타임에 건다. React StrictMode 는 effect 를 마운트 → 정리 → 재마운트로 두 번 돌리므로
   * 생성(useMemo)과 등록(useEffect)을 나누고, 정리하면 등록만 풀었다가 다시 건다. 두 번 불러도 한 번만 건다.
   */
  let offs: Array<() => void> | null = null;
  const start = (): (() => void) => {
    if (offs) return stop;
    offs = [];
    // 에이전트가 볼트 사진을 넣은 칸(`resource:vault:<경로>`)을 캔버스가 볼트 원본으로 그린다
    setMediaSrcResolver((src) => {
      if (!src.startsWith(VAULT_RESOURCE)) return null;
      const rel = src.slice(VAULT_RESOURCE.length);
      return deps.vault.getBinaryUrl?.(rel) ?? `${deps.apiBaseUrl ?? ""}/api/vaults/${encodeURIComponent(deps.vault.id)}/raw?path=${encodeURIComponent(rel)}`;
    });
    offs.push(() => setMediaSrcResolver(null));
    // 에이전트 실행 중 밖(서버)에서 생긴 파일 → 탐색기 [AI] 배지
    offs.push(
      deps.vault.subscribe((ev) => {
        if (ev.type === "create" && ev.origin === "external" && ev.node.kind === "file" && controller.getState().status !== "idle") {
          deps.explorer.getState().markExternalChange(ev.node.path, "AI");
        }
      })
    );
    offs.push(runtime.contexts.registerAll(createV2ContextProviders(env)));
    offs.push(
      runtime.tools.registerAll(
        createV2Tools(env, {
          controller,
          revealSlot: (path, slotId, pageId) => {
            if (activeTabPath() !== path) deps.openVaultFile(path, "current");
            const ui = deps.vdocUiBridge.getState();
            ui.selectSlot(path, slotId, null, pageId ?? undefined);
            ui.requestScrollTo(path, slotId, pageId ?? undefined);
          },
          revealSelection: (path, items) => {
            if (activeTabPath() !== path) deps.openVaultFile(path, "current");
            const ui = deps.vdocUiBridge.getState();
            ui.setSelection(path, items, items[0]?.id ?? null);
            if (items[0]) ui.requestScrollTo(path, items[0].id, items[0].pageId ?? undefined);
          },
          openPath: (path) => deps.openVaultFile(path, "split-right"),
          showExplorer: () => undefined,
        })
      )
    );

    // 탐색기 파일을 입력창에 끌어 놓으면 @문서 · @파일 첨부로
    offs.push(
      runtime.drops.register({
        mime: VIBE_VAULT_PATHS_MIME,
        translate: (data) => {
          try {
            const paths = JSON.parse(data) as unknown;
            return Array.isArray(paths)
              ? paths.map((p) => (typeof p === "string" ? vaultPathContext({ env }, p) : null)).filter((r): r is ContextRef => r !== null)
              : [];
          } catch {
            return [];
          }
        },
      })
    );

    // wb_propose / ol_propose_patch 로 검증을 통과한 개편안 → Staged 대기열 (기존 workbench_proposals 채널 공용)
    offs.push(
      controller.onServerEvent("workbench_proposals", (event) => {
        for (const proposal of event.proposals) {
          if (proposal.outlinePatch) {
            const op = proposal.outlinePatch;
            if (!op.path || !deps.vault.exists(op.path)) continue;
            const change = buildOutlinePatchChange(env, op.path, {
              requests: op.requests,
              targetNodeIds: op.targetNodeIds,
              baseHash: op.baseHash,
              nodeEvidence: op.nodeEvidence as Record<string, EvidenceLocator[]> | undefined,
              summary: proposal.summary,
              warnings: proposal.warnings,
              runId: proposal.proposalId,
            });
            store.getState().enqueue([change]);
            deps.pushLog("ok", `ol_propose_patch -> staged ${op.requests.length} op(s) for ${op.path}`);
            continue;
          }
          const path = docPathOf(proposal.docId);
          const doc = readVDoc(env, path);
          const candidate = proposal.candidates?.[0];
          if (!doc || !path || !candidate) continue;
          const changes = Object.entries(candidate.slots ?? {})
            .filter(([slotId, html]) => doc.slots[slotId] && !doc.slots[slotId].constraints?.locked && html.trim() && html.trim() !== doc.slots[slotId].content.trim())
            .map(([slotId, html]) => buildSlotHtmlChange(doc, path, doc.slots[slotId], html, { reason: proposal.summary || candidate.title, runId: proposal.proposalId }));
          if (changes.length) {
            store.getState().enqueue(changes);
            deps.pushLog("ok", `wb_propose -> staged ${changes.length} change(s) for ${path}`);
          }
        }
      })
    );

    // 레퍼런스(.ref)는 지연 로딩 볼트에서 본문이 늦게 온다 — 미리 받아 라이브러리 연결(serverRefId)을 알아 둔다
    const preload = (path: string) => {
      if (!isRefPath(path) || !deps.vault.ensureLoaded || !deps.vault.isLoaded || deps.vault.isLoaded(path)) return;
      void deps.vault.ensureLoaded(path).then(() => store.getState().bumpLoaded(), () => undefined);
    };
    for (const node of deps.vault.listAll()) if (node.kind === "file") preload(node.path);
    offs.push(
      deps.vault.subscribe((ev) => {
        if (ev.type === "create" && ev.node.kind === "file") preload(ev.node.path);
        if (ev.type === "vault-reset") for (const node of deps.vault.listAll()) if (node.kind === "file") preload(node.path);
      })
    );

    // 워크스페이스(볼트) 단위 대화 1회 바인딩 — 파일·탭을 바꿔도 AI Composer 대화는 고정 유지된다
    bindWorkspaceConversation();

    // 에이전트 초안 동기화 (studio registerAgentDraftSync 와 같은 역할).
    // ACP 는 MCP 도구 결과 본문을 넘기지 않을 때가 있어(output 빈 값) 세 길로 찾는다:
    //   1) 결과의 `vault://경로`  2) 인자 doc(docId) → 볼트 .vdoc 의 docId  3) dc_new 직후 밖에서 생긴 .vdoc (볼트 감시)
    let awaitingDraftUntil = 0;
    const adopt = (target: string, action: string) => {
      if (action === "new") deps.explorer.getState().markExternalChange(target, "AI");
      let tries = 0;
      const open = () => {
        if (activeTabPath() === target) return;
        if (deps.vault.exists(target)) {
          lastDocPath = target;
          deps.openVaultFile(target, action === "new" ? "new-tab" : "current");
          deps.pushLog("ok", `agent ${action === "new" ? "draft" : "target"} -> ${target}`);
        } else if (tries++ < 25) {
          setTimeout(open, 400); // 볼트 감시(SSE)가 새 파일을 아직 못 받았다
        }
      };
      open();
    };
    const findByDocId = async (docId: string): Promise<string | null> => {
      for (const node of deps.vault.listAll()) {
        if (node.kind !== "file" || !isVDocPath(node.path)) continue;
        if (deps.vault.isLoaded && !deps.vault.isLoaded(node.path) && deps.vault.ensureLoaded) {
          try {
            await deps.vault.ensureLoaded(node.path);
          } catch {
            continue;
          }
        }
        if (readVDoc(env, node.path)?.docId === docId) return node.path;
      }
      return null;
    };

    // 파일 이름 바꾸기 · 이동 → 대기열 · 설정 · 마지막 문서 경로를 따라간다 / dc_new 뒤 새로 생긴 초안
    offs.push(
      deps.vault.subscribe((ev) => {
        if (ev.type === "rename") {
          store.getState().remapPath(ev.oldPath, ev.newPath);
          if (lastDocPath === ev.oldPath) lastDocPath = ev.newPath;
        }
        if (ev.type === "create" && ev.origin === "external" && ev.node.kind === "file" && isVDocPath(ev.node.path) && Date.now() < awaitingDraftUntil) {
          awaitingDraftUntil = 0;
          adopt(ev.node.path, "new");
        }
      })
    );

    offs.push(
      controller.subscribe(() => {
        for (const item of controller.getState().items) {
          if (item.kind !== "agent_tool" || item.state !== "done" || seen.has(item.id)) continue;
          const research = RS_TOOL.exec(String(item.name || ""));
          if (research) {
            seen.add(item.id);
            syncResearch(research[2], (item as Extract<ComposerItem, { kind: "agent_tool" }>).params ?? {});
            continue;
          }
          const match = DC_TOOL.exec(String(item.name || ""));
          if (!match) continue;
          seen.add(item.id);
          const action = match[2];
          const tool = item as Extract<ComposerItem, { kind: "agent_tool" }>;
          const fromOutput = VAULT_URI.exec(String(tool.output ?? ""))?.[1]?.trim();
          if (fromOutput) {
            awaitingDraftUntil = 0;
            adopt(fromOutput, action);
            continue;
          }
          const docArg = typeof tool.params?.doc === "string" ? tool.params.doc.replace(/^doc:/, "").trim() : "";
          if (docArg) {
            void findByDocId(docArg).then((path) => {
              if (path) adopt(path, action === "build" || action === "import" ? "build" : action);
            });
          } else if (action === "new") {
            awaitingDraftUntil = Date.now() + 120_000;
          }
        }
      })
    );
    offs.push(
      controller.onServerEvent("fs_batches", (ev) => {
        if (ev.type === "fs_batches" && ev.batches.length > 0) {
          store.getState().setFsBatches(ev.batches);
          deps.pushLog("ok", `vault FS batch recorded (${ev.batches.length}): ${ev.batches[0]?.summary ?? ""}`);
        }
      })
    );
    return stop;
  };
  function stop(): void {
    offs?.forEach((off) => off());
    offs = null;
  }

  // --- 범위 · 고정 (studio AiComposerView 와 같은 규칙) -------------------------------------------------

  function refTarget(ref: ContextRef): { path: string; target: ScopeTarget } | null {
    const path = typeof ref.meta?.path === "string" ? ref.meta.path : activeDocPath();
    const doc = readVDoc(env, path);
    if (!doc || !path) return null;
    if (typeof ref.meta?.docId === "string" && ref.meta.docId !== doc.docId) return null;
    const meta = ref.meta ?? {};
    let target: ScopeTarget | null = null;
    if (ref.kind === "slot") target = targetFromSlots(doc, [ref.id], [ref.id], ref.label);
    else if (ref.kind === "block") target = targetFromBlock(doc, ref.id);
    else if (ref.kind === "slot-range") {
      const slotIds = Array.isArray(meta.slotIds) ? (meta.slotIds as string[]) : [];
      target = targetFromSlots(doc, slotIds, Array.isArray(meta.unitIds) ? (meta.unitIds as string[]) : slotIds, ref.label);
    }
    return target ? { path, target } : null;
  }

  function scopeForSend(_text: string, contexts: ContextRef[]): ContextRef[] {
    const s = store.getState();
    // 리소스를 껐으면 자동으로 붙는 마운트를 뺀다 (사용자가 직접 @ 한 것은 둔다)
    let kept = s.sourcesOn ? contexts : contexts.filter((c) => !(c.kind === "resource-mount" && !c.handle));

    // 명시적으로 첨부한 `@폴더` 들을 수집: (1) 이번 턴 resource-mount 에 자동 포함, (2) role === "target" 이면 vf_* 허용 쓰기 범위로 전달
    const explicitFolderPaths: string[] = [];
    const targetFolderPaths: string[] = [];
    for (const c of kept) {
      if (c.kind !== "folder" || !c.handle) continue;
      const fp = typeof c.meta?.path === "string" ? c.meta.path : "";
      explicitFolderPaths.push(fp);
      if (c.role === "target") targetFolderPaths.push(fp);
    }
    if (explicitFolderPaths.length > 0) {
      const mergedMount = resourceMountPayload(env, explicitFolderPaths);
      if (mergedMount) {
        const mountRef: ContextRef = {
          kind: "resource-mount",
          id: "rm:checked-resources",
          label: mergedMount.label,
          content: JSON.stringify({ roots: mergedMount.roots, files: [], idMap: {}, items: mergedMount.roots }),
          hint: `마운트 폴더 ${mergedMount.roots.length}곳 — AI 가 직접 찾아 읽음`,
          access: "read",
          role: "reference",
        };
        kept = [mountRef, ...kept.filter((c) => c.kind !== "resource-mount")];
      }
    }

    const withTargetFolders = (wbRefs: ContextRef[]): ContextRef[] => {
      if (targetFolderPaths.length === 0) return wbRefs;
      return wbRefs.map((ref) => {
        if (ref.kind !== "workbench" || !ref.content) return ref;
        try {
          const parsed = JSON.parse(ref.content) as Record<string, unknown>;
          return { ...ref, content: JSON.stringify({ ...parsed, targetFolders: targetFolderPaths }) };
        } catch {
          return ref;
        }
      });
    };

    // 프롬프트에서 @문서로 다른 볼트 문서를 지정했으면 작업대 · 탭 대상만 맞춘다 (AI 대화 스레드는 유지)
    let path = activeDocPath();
    let switched = false;
    for (let i = kept.length - 1; i >= 0; i--) {
      const c = kept[i];
      if (c.kind !== "doc" || typeof c.meta?.path !== "string" || !c.handle) continue;
      const target = c.meta.path;
      if (target !== path && readVDoc(env, target)) {
        lastDocPath = target;
        deps.openVaultFile(target, "current");
        path = target;
        switched = true;
      }
      break;
    }
    if (switched) {
      const wb = withTargetFolders(runtime.contexts.list().find((p) => p.id === "workbench")?.current?.() ?? []);
      if (wb.length) kept = [...wb, ...kept.filter((c) => c.kind !== "workbench")];
    }

    const doc = readVDoc(env, path);
    if (!doc || !path) {
      store.getState().setTurn(null);
      const wb = withTargetFolders(runtime.contexts.list().find((p) => p.id === "workbench")?.current?.() ?? []);
      return wb.length ? [...wb, ...kept.filter((c) => c.kind !== "workbench")] : kept;
    }
    const pageId = switched ? doc.pages[0]?.pageId ?? null : activePageId(env, doc, path);
    const explicit = kept.filter((c) => c.handle);
    const targets = explicit
      .filter((c) => SELECTION_KINDS.has(c.kind))
      .map((c) => refTarget(c))
      .filter((t): t is { path: string; target: ScopeTarget } => !!t && t.path === path)
      .map((t) => t.target);
    const pages = explicit.filter((c) => c.kind === "page" && doc.pages.some((p) => p.pageId === c.id)).map((c) => c.id);
    const base: ResolvedScope =
      oneOffScope(doc, targets, pages) ??
      (switched ? { docId: doc.docId, mode: "document", label: doc.title, pageIds: null, slotIds: null, blockIds: null, oneOff: true } : currentScope(env, doc, path));
    const scope = { ...base, sourcesOff: !s.sourcesOn };
    store.getState().setTurn({ ...scope, path });
    const ref = scopeContextRef(doc, path, scope, pageId);
    // 작업대도 이번 범위로 다시 만든다 (turn 을 읽는다)
    const wb = withTargetFolders(runtime.contexts.list().find((p) => p.id === "workbench")?.current?.() ?? []);
    return [ref, ...wb, ...kept.filter((c) => c.kind !== SCOPE_CONTEXT_KIND && c.kind !== "workbench")];
  }

  const pinnable = (ref: ContextRef) => SELECTION_KINDS.has(ref.kind) || ref.kind === "folder" || ref.kind === "outline-node";
  const isPinned = (ref: ContextRef) => {
    if (ref.kind === "folder") {
      const fp = typeof ref.meta?.path === "string" ? ref.meta.path : "";
      return store.getState().resourceFolders.includes(fp);
    }
    if (ref.kind === "outline-node") {
      const p = typeof ref.meta?.path === "string" ? ref.meta.path : activeOutlinePath(env);
      if (!p) return false;
      const setting = store.getState().outlineSettingFor(p);
      const ids = Array.isArray(ref.meta?.nodeIds)
        ? (ref.meta.nodeIds as string[])
        : typeof ref.meta?.nodeId === "string"
          ? [ref.meta.nodeId]
          : [];
      return setting.fixed && ids.length > 0 && ids.every((id) => setting.rootNodeIds.includes(id));
    }
    const hit = refTarget(ref);
    if (!hit) return false;
    const setting = store.getState().settingFor(hit.path);
    return setting.fixed && setting.target?.id === hit.target.id;
  };
  const pinContext = (ref: ContextRef) => {
    if (ref.kind === "folder") {
      const fp = typeof ref.meta?.path === "string" ? ref.meta.path : "";
      store.getState().toggleResourceFolder(fp);
      if (!store.getState().sourcesOn) store.getState().setSourcesOn(true);
      return;
    }
    if (ref.kind === "outline-node") {
      const p = typeof ref.meta?.path === "string" ? ref.meta.path : activeOutlinePath(env);
      if (!p) return;
      const ids = Array.isArray(ref.meta?.nodeIds)
        ? (ref.meta.nodeIds as string[])
        : typeof ref.meta?.nodeId === "string"
          ? [ref.meta.nodeId]
          : [];
      if (isPinned(ref)) store.getState().clearOutlinePin(p);
      else if (ids.length > 0) store.getState().pinOutlineNodes(p, ids);
      return;
    }
    const hit = refTarget(ref);
    if (!hit) return;
    if (isPinned(ref)) store.getState().clearPin(hit.path);
    else store.getState().pinTarget(hit.path, hit.target);
  };

  // --- 변경안 ---------------------------------------------------------------------------------------

  const approve = (diffIds: readonly string[], options?: { readonly recompileBoundVDocs?: boolean }) => {
    const queue = store.getState().queue.filter((c) => diffIds.includes(c.diffId));
    const failed: Array<{ diffId: string; why: string }> = [];
    const appliedOutlinePaths = new Set<string>();
    let applied = 0;
    for (const change of queue) {
      try {
        // 같은 .outline 파일에 연속 패치가 들어온 경우 앞선 적용으로 트리가 바뀌었으면 안전 차단
        if (change.targetKind === "outline-patch" && appliedOutlinePaths.has(change.path) && isStale(env, change)) {
          throw new Error("앞선 아웃라인 변경으로 트리가 바뀌어 충돌 방지를 위해 중단했습니다.");
        }
        applyStagedChange(env, change, options);
        if (change.targetKind === "outline-patch") {
          appliedOutlinePaths.add(change.path);
          store.getState().recordApprovedOutline(change.path);
        }
        applied += 1;
      } catch (err) {
        failed.push({ diffId: change.diffId, why: err instanceof Error ? err.message : String(err) });
      }
    }
    store.getState().remove(queue.filter((c) => !failed.some((f) => f.diffId === c.diffId)).map((c) => c.diffId));
    if (applied) deps.pushLog("ok", `staged ${applied} change(s) applied to vault`);
    if (failed.length) deps.pushLog("warn", `staged apply failed: ${failed.map((f) => f.why).join("; ")}`);
    return { applied, failed };
  };
  const reject = (diffIds: readonly string[]) => {
    store.getState().remove(diffIds);
    deps.pushLog("info", `staged ${diffIds.length} change(s) rejected`);
  };
  const undoOutlineApproval = (path: string): boolean => {
    const ok = undoApprovedOutlinePatch(deps.vault, path);
    if (ok) {
      store.getState().clearApprovedOutline(path);
      deps.pushLog("ok", `outline approval undone: ${path}`);
    }
    return ok;
  };

  const canvasSelection = () => runtime.contexts.list().find((p) => p.id === "selection")?.current?.() ?? [];
  const directFromCanvas = (prompt?: string) => {
    controller.attach(canvasSelection(), prompt ? { prompt } : {});
  };
  /** 캔버스 팝오버의 지시를 바로 보낸다 — 지금 선택이 `@칸1` 처럼 붙어 이번 메시지 범위가 된다. */
  const sendFromCanvas = (prompt: string) => {
    const picked: ContextRef[] = [];
    for (const ref of canvasSelection()) picked.push({ ...ref, handle: assignHandle(ref, picked) });
    const text = picked.length ? `${picked.map((r) => r.handle).join(" ")} ${prompt}` : prompt;
    return controller.send(text, scopeForSend(text, [...runtime.contexts.autoContexts(), ...picked]));
  };

  const directFromOutline = (prompt?: string) => {
    controller.attach(canvasSelection(), prompt ? { prompt } : {});
  };
  const sendFromOutline = (prompt: string) => sendFromCanvas(prompt);

  const attachFiles = (files: readonly File[]) => attachUploadedFiles(env, files, { fetchFn: deps.fetchFn });

  const undoFsBatch = async (batchId: string): Promise<{ ok: boolean; message: string }> => {
    const sid = controller.getState().sessionId;
    if (!sid) return { ok: false, message: "활성 AI 세션이 없습니다." };
    try {
      const res = await runtime.client.undoFsBatch(sid, batchId);
      if (res.ok) {
        store.getState().markFsBatchUndone(batchId);
        deps.pushLog("ok", `vault FS batch undone: ${batchId}`);
      } else {
        deps.pushLog("warn", `vault FS undo failed: ${res.message}`);
      }
      return { ok: res.ok, message: res.message };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.pushLog("warn", `vault FS undo error: ${message}`);
      return { ok: false, message };
    }
  };

  return {
    runtime,
    controller,
    store,
    env,
    scopeForSend,
    pinnable,
    pinContext,
    isPinned,
    approve,
    reject,
    undoOutlineApproval,
    isStale: (change) => isStale(env, change),
    attachFiles,
    undoFsBatch,
    directFromCanvas,
    sendFromCanvas,
    directFromOutline,
    sendFromOutline,
    conversationKey,
    start,
    dispose: () => {
      stop();
      controller.closeOnPageExit();
    },
  };
}
