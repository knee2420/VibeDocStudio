import {
  AnchorSurfaceRegistry,
  assignHandle,
  ComposerSessionController,
  createAiRuntime,
  SessionRegistry,
  type AiRuntime,
  type ComposerItem,
  type ComposerPersistence,
  type ComposerSnapshot,
  type ContextProvider,
  type ContextRef,
  type SessionAnchor,
  type SessionEntry,
  type SessionMetaStore,
  type SessionRegistryMeta,
  type ToolRunContext,
  type WorkspaceTool,
} from "@vibe/ai-kernel";
import coreSettings from "@vibe/harness-packs/core/settings.json";
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
import { applyStagedChange, buildOutlinePatchChange, buildSlotHtmlChange, createV2Tools, isStale, stage, type V2ToolHost } from "./tools";
import { createV2AiStore, type V2AiStore, type V2StagedChange } from "./store";
import {
  boundVDocOfOutline,
  createV2AnchorSurfaces,
  EXPLORER_SURFACE,
  OUTLINE_SURFACE,
  outlineAnchorContext,
  remapAnchor,
  splitVDocItems,
  VDOC_SURFACE,
} from "./anchors";

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
  /** 통일 `<<resource:...>>` 태그를 페어 탭으로 열고 정확히 하이라이팅한다. */
  readonly revealResource?: (rawTag: string, sourcePath?: string) => boolean;
  /** 에셋(assetId)의 AI 느낌 보기(Staged Preview)를 실행한다. */
  readonly stageAssetPreview?: (assetId: string) => boolean;
  readonly getTextSelection: () => { resourceId: string; text?: string; summary: string; nodeIds?: readonly string[] } | null;
  /** 에디터가 보고한 지금 선택 그대로 (아웃라인 불릿 id 포함) — 기준점 세션이 읽는다 */
  readonly getEditorSelection?: () => { readonly resourceId: string; readonly kind: string; readonly nodeIds?: readonly string[] } | null;
  readonly pushLog: (level: "info" | "ok" | "warn", message: string) => void;
  /** 세션(에이전트) 활동 로그 — 시작 · 대기 · 도구 · 변경안 · 파일 작업 · 끝. 없으면 `pushLog` */
  readonly pushAgentLog?: (level: "info" | "ok" | "warn", message: string) => void;
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
  /** 채팅 답변 / 도구의 `<<resource:...>>` 태그를 페어 탭으로 열고 하이라이팅한다. */
  revealResource(rawTag: string, sourcePath?: string): boolean;
  /** 채팅 AG-UI 카드 / 도구의 에셋(assetId) AI 느낌 보기 프리뷰를 실행한다. */
  stageAssetPreview(assetId: string): boolean;
  conversationKey(path: string | null): string | null;

  // --- 기준점 세션 (무마찰 디렉팅) ---------------------------------------------------------------
  /** 메인 + 기준점 세션 전부 (표시 · 탭 · 대시보드가 읽는다) */
  readonly sessions: SessionRegistry;
  /** 다중 선택 + 인라인 AI 화면들 */
  readonly surfaces: AnchorSurfaceRegistry;
  /** 그 화면의 지금 선택에 세션을 붙여 지시를 던진다 (선택이 없으면 null — 호출자가 메인으로 보낸다) */
  sendAnchored(surfaceId: string, prompt: string, anchor?: SessionAnchor): SessionEntry | null;
  /** 세션 키 → 컨트롤러 */
  controllerFor(key: string): ComposerSessionController;
  /** 그 세션 탭의 자동 첨부 · 첨부 제안 (기준점 세션은 기준점 기준) */
  contextsFor(key: string): { auto: ContextRef[]; suggested: ContextRef[] };
  /** 그 세션 탭에서 보내기 직전 (범위 확정) */
  scopeForSendIn(key: string): (text: string, contexts: ContextRef[]) => ContextRef[];
  /** 세션을 Composer 앞 탭으로 (뒤에서 미뤄 둔 화면 이동을 한 번 실행) */
  openSession(key: string): void;
  /** 화면에서 기준점으로 이동 */
  revealAnchor(key: string): void;
  /** 세션 완료 (검토 안 한 변경안 처리 포함) */
  completeSession(key: string, options?: { discardStaged?: boolean }): Promise<void>;
  /** 사용자가 "완료"를 눌렀다 — 검토 안 한 변경안이 있으면 확인 요청을 거친다 */
  requestCompleteSession(key: string): void;
  /**
   * 기준점이 화면에서 "완료" 됐다 — 검토 안 한 변경안이 있으면 앱이 묻는다.
   * 구독자가 없으면 바로 (변경안을 버리고) 완료한다.
   */
  onCompletionRequest(listener: (request: SessionCompletionRequest) => void): () => void;

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
/** 메인 + 기준점 세션(진행 중 + 완료 이력 30) 대화 */
const MAX_CONVERSATIONS = 60;
const SESSIONS_KEY = (vaultId: string) => `vibe.playground.v2ide.sessions.${vaultId}.v1`;

/** 기준점이 화면에서 완료됐을 때 앱에 묻는 것 (검토 안 한 변경안이 있으면 확인창) */
export interface SessionCompletionRequest {
  readonly key: string;
  readonly title: string;
  readonly reviewCount: number;
  /** 완료 (변경안을 버릴지) */
  confirm(discardStaged: boolean): void;
  /** 완료하지 않는다 (세션 유지) */
  cancel(): void;
}

function sessionMetaStore(storage: Storage | null, vaultId: string): SessionMetaStore | null {
  if (!storage) return null;
  return {
    load() {
      try {
        const raw = storage.getItem(SESSIONS_KEY(vaultId));
        return raw ? (JSON.parse(raw) as SessionRegistryMeta) : null;
      } catch {
        return null;
      }
    },
    save(meta) {
      try {
        storage.setItem(SESSIONS_KEY(vaultId), JSON.stringify(meta));
      } catch {
        /* 가득 찼으면 이번 세션만 */
      }
    },
  };
}

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
    remove(key) {
      try {
        storage.removeItem(CONV_PREFIX + key);
        const index: string[] = JSON.parse(storage.getItem(CONV_INDEX) ?? "[]");
        storage.setItem(CONV_INDEX, JSON.stringify(index.filter((k) => k !== key)));
      } catch {
        /* 무시 */
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
  const persist = persistence(storage);
  const controller = new ComposerSessionController(runtime);
  controller.setPersistence(persist);
  const store = createV2AiStore(deps.vault.id, storage);
  /** 세션 레지스트리 — 아래에서 컨트롤러 배선 · 도구 · 문맥이 다 정해진 뒤 만든다 (생성 중 배선 훅이 불린다) */
  let registry!: SessionRegistry;

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
  const mainKey = workspaceConversationKey;
  const docPathOf = (envK: V2AiEnv, docId: string | undefined): string | null => {
    const active = envK.activeDocPath();
    if (!docId) return active;
    if (readVDoc(envK, active)?.docId === docId) return active;
    return projectDocPaths(deps.vault, active).find((p) => readVDoc(envK, p)?.docId === docId) ?? null;
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

  // --- 세션별 env (기준점 세션은 화면이 아니라 기준점을 본다) -------------------------------------------

  interface SessionEnvHandle {
    readonly env: V2AiEnv;
    /** 세션 안에서 다른 문서로 옮겼다 (@문서 · dc_new 초안) */
    setDoc(path: string | null): void;
    remap(oldPath: string, newPath: string): void;
  }
  const sessionEnvs = new Map<string, SessionEnvHandle>();
  const sessionEnv = (key: string): SessionEnvHandle => {
    const cached = sessionEnvs.get(key);
    if (cached) return cached;
    let docOverride: string | null = null;
    const anchorOf = () => registry.get(key)?.anchor ?? null;
    const anchorDoc = (): string | null => {
      const a = anchorOf();
      if (!a) return null;
      if (a.surface === VDOC_SURFACE) return deps.vault.exists(a.path) ? a.path : null;
      if (a.surface === OUTLINE_SURFACE) return boundVDocOfOutline(env, a.path);
      return a.itemIds.find((p) => isVDocPath(p) && deps.vault.exists(p)) ?? null;
    };
    const senv: V2AiEnv = {
      ...env,
      sessionKey: key,
      activeDocPath: () => (docOverride && deps.vault.exists(docOverride) ? docOverride : anchorDoc()),
      activeTabPath: () => {
        const a = anchorOf();
        return a && a.surface !== EXPLORER_SURFACE ? a.path : null;
      },
      textSelection: () => {
        const a = anchorOf();
        if (!a || a.surface !== OUTLINE_SURFACE) return null;
        const ref = outlineAnchorContext(env, a);
        if (!ref) return null;
        const ids = Array.isArray(ref.meta?.nodeIds) ? (ref.meta.nodeIds as string[]) : [...a.itemIds];
        return { resourceId: a.path, text: ref.content, summary: ref.label, nodeIds: ids };
      },
      explorerSelection: () => {
        const a = anchorOf();
        return a?.surface === EXPLORER_SURFACE ? [...a.itemIds] : [];
      },
      selectionFor: (path) => {
        const a = anchorOf();
        if (!a || a.surface !== VDOC_SURFACE || a.path !== path) return null;
        const doc = readVDoc(env, path);
        return doc ? splitVDocItems(doc, a.itemIds) : null;
      },
    };
    const handle: SessionEnvHandle = {
      env: senv,
      setDoc: (path) => {
        docOverride = path;
      },
      remap: (oldPath, newPath) => {
        if (docOverride === oldPath) docOverride = newPath;
      },
    };
    sessionEnvs.set(key, handle);
    return handle;
  };
  const envFor = (key: string): V2AiEnv => (key === mainKey ? env : sessionEnv(key).env);
  const controllerFor = (key: string): ComposerSessionController => (key === mainKey ? controller : registry.controller(key));

  const sessionProviders = new Map<string, ContextProvider[]>();
  const providersFor = (key: string): readonly ContextProvider[] => {
    if (key === mainKey) return runtime.contexts.list();
    let list = sessionProviders.get(key);
    if (!list) {
      list = createV2ContextProviders(envFor(key));
      sessionProviders.set(key, list);
    }
    return list;
  };
  const safeCurrent = (p: ContextProvider): ContextRef[] => {
    try {
      return p.current?.() ?? [];
    } catch {
      return [];
    }
  };
  const contextsFor = (key: string): { auto: ContextRef[]; suggested: ContextRef[] } => {
    if (key === mainKey) return { auto: runtime.contexts.autoContexts(), suggested: runtime.contexts.suggestedContexts() };
    const list = providersFor(key);
    return {
      auto: list.filter((p) => p.auto && !p.suggest).flatMap(safeCurrent),
      suggested: list.filter((p) => p.suggest).flatMap(safeCurrent),
    };
  };

  /** 실행 중(또는 승인 대기)인 세션이 하나라도 있는가 — 밖에서 생긴 파일에 [AI] 배지를 다는 기준 */
  const anyRunning = () => registry.list().some((v) => v.status === "running" || v.status === "awaiting_approval");

  /** 터미널 에이전트 로그 — `‹세션›` 꼬리표 (토큰마다 찍지 않는다: 상태 변화 · 도구 · 결과만) */
  const agentLog = deps.pushAgentLog ?? deps.pushLog;
  const sessionTag = (key: string) => {
    if (key === mainKey) return "메인";
    const title = registry?.get(key)?.title ?? key;
    return title.length > 20 ? `${title.slice(0, 19)}…` : title;
  };
  const logAgent = (key: string, level: "info" | "ok" | "warn", message: string) => agentLog(level, `‹${sessionTag(key)}› ${message}`);

  // --- 에이전트 초안 · 리서치 결과 따라가기 (세션별) ------------------------------------------------

  /** 뒤 세션이 열려던 파일 — 그 세션을 열 때 연다 */
  const OPEN_HINT = "@open";
  /** dc_new 결과에 경로가 없을 때, 곧 밖에서 생기는 .vdoc 을 그 세션의 초안으로 본다 */
  let awaitingDraft: { key: string; until: number } | null = null;
  const adopt = (target: string, action: string, key: string) => {
    if (action === "new") deps.explorer.getState().markExternalChange(target, "AI");
    const isMain = key === mainKey;
    if (!isMain) sessionEnv(key).setDoc(target);
    if (!isMain && !registry.isForeground(key)) {
      // 뒤에서 도는 세션은 화면을 옮기지 않는다 — 그 세션을 열 때 연다
      registry.addRevealHint(key, { tool: OPEN_HINT, args: { path: target, mode: action === "new" ? "new-tab" : "current" } });
      deps.pushLog("ok", `agent ${action === "new" ? "draft" : "target"} (background ${key}) -> ${target}`);
      return;
    }
    let tries = 0;
    const open = () => {
      if (activeTabPath() === target) return;
      if (deps.vault.exists(target)) {
        if (isMain) lastDocPath = target;
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

  /**
   * 컨트롤러 하나의 서버 이벤트 배선 (메인 · 기준점 세션 공통). 레지스트리가 컨트롤러를 만들 때 한 번 건다.
   *   - wb_propose / ol_propose_patch 개편안 → 그 세션 꼬리표를 단 변경안
   *   - dc_* 초안 · rs_* 리서치 결과 → 화면 설정 · 초안 따라가기
   *   - vf_* 파일 묶음 → 그 세션 · 서버 세션 꼬리표 (되돌리기는 그 서버 세션으로)
   */
  const wireController = (key: string, c: ComposerSessionController): (() => void) => {
    const isMain = key === mainKey;
    const offProposals = c.onServerEvent("workbench_proposals", (event) => {
      const envK = envFor(key);
      for (const proposal of event.proposals) {
        if (proposal.outlinePatch) {
          const op = proposal.outlinePatch;
          if (!op.path || !deps.vault.exists(op.path)) continue;
          const change = buildOutlinePatchChange(envK, op.path, {
            requests: op.requests,
            targetNodeIds: op.targetNodeIds,
            baseHash: op.baseHash,
            nodeEvidence: op.nodeEvidence as Record<string, EvidenceLocator[]> | undefined,
            summary: proposal.summary,
            warnings: proposal.warnings,
            runId: proposal.proposalId,
          });
          stage(envK, [change]);
          logAgent(key, "ok", `변경안 ← 아웃라인 패치 ${op.requests.length}건 (${op.path})`);
          continue;
        }
        const path = docPathOf(envK, proposal.docId);
        const doc = readVDoc(envK, path);
        const candidate = proposal.candidates?.[0];
        if (!doc || !path || !candidate) continue;
        const changes = Object.entries(candidate.slots ?? {})
          .filter(([slotId, html]) => doc.slots[slotId] && !doc.slots[slotId].constraints?.locked && html.trim() && html.trim() !== doc.slots[slotId].content.trim())
          .map(([slotId, html]) => buildSlotHtmlChange(doc, path, doc.slots[slotId], html, { reason: proposal.summary || candidate.title, runId: proposal.proposalId }));
        if (changes.length) {
          stage(envK, changes);
          logAgent(key, "ok", `변경안 ← 칸 ${changes.length}개 (${path})`);
        }
      }
    });
    // 에이전트 초안 동기화 (studio registerAgentDraftSync 와 같은 역할).
    // ACP 는 MCP 도구 결과 본문을 넘기지 않을 때가 있어(output 빈 값) 세 길로 찾는다:
    //   1) 결과의 `vault://경로`  2) 인자 doc(docId) → 볼트 .vdoc 의 docId  3) dc_new 직후 밖에서 생긴 .vdoc (볼트 감시)
    const offItems = c.subscribe(() => {
      for (const item of c.getState().items) {
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
          if (awaitingDraft?.key === key) awaitingDraft = null;
          adopt(fromOutput, action, key);
          continue;
        }
        const docArg = typeof tool.params?.doc === "string" ? tool.params.doc.replace(/^doc:/, "").trim() : "";
        if (docArg) {
          void findByDocId(docArg).then((path) => {
            if (path) adopt(path, action === "build" || action === "import" ? "build" : action, key);
          });
        } else if (action === "new") {
          awaitingDraft = { key, until: Date.now() + 120_000 };
        }
      }
    });
    const offBatches = c.onServerEvent("fs_batches", (ev) => {
      if (ev.type === "fs_batches" && ev.batches.length > 0) {
        store.getState().setFsBatches(ev.batches, {
          sessionKey: isMain ? undefined : key,
          serverSessionId: c.getState().sessionId ?? undefined,
        });
        logAgent(key, "ok", `파일 작업 ${ev.batches.length}건 · ${ev.batches[0]?.summary ?? ""} (되돌리기 가능)`);
      }
    });
    // 에이전트 도구 · 프론트 도구 · 경고 · 오류 (도구는 시작 한 번 · 실패만 — 같은 호출을 다시 찍지 않는다)
    const seenTools = new Set<string>();
    const offAgentTools = c.onServerEvent("agent_tool", (ev) => {
      const id = ev.callId ?? `${ev.stepIndex ?? ""}:${ev.name}`;
      const where = ev.locations?.[0]?.path ? ` · ${ev.locations[0].path}` : "";
      if (ev.state === "error") logAgent(key, "warn", `✕ ${ev.title || ev.name}${where}${ev.error ? ` — ${ev.error}` : ""}`);
      else if (!seenTools.has(id)) {
        seenTools.add(id);
        logAgent(key, "info", `→ ${ev.title || ev.name}${where}`);
      }
    });
    const offClientTools = c.onServerEvent("tool_call", (ev) => {
      logAgent(key, "info", `→ ${ev.summary || ev.name}${ev.server ? " (서버)" : ""}`);
    });
    const offStatus = c.onServerEvent("status", (ev) => {
      if (ev.state === "warning" || ev.state === "queued") logAgent(key, ev.state === "warning" ? "warn" : "info", ev.message);
    });
    const offErrors = c.onServerEvent("error", (ev) => {
      if (ev.code !== "interrupted") logAgent(key, "warn", `오류 — ${ev.message}`);
    });
    return () => {
      offProposals();
      offItems();
      offBatches();
      offAgentTools();
      offClientTools();
      offStatus();
      offErrors();
    };
  };

  // --- 도구: 한 벌 등록, 호출한 세션의 env 로 실행 --------------------------------------------------

  const hostFor = (key: string): V2ToolHost => ({
    get controller() {
      return controllerFor(key);
    },
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
    revealResource: (rawTag, sourcePath) =>
      deps.revealResource ? deps.revealResource(rawTag, sourcePath ?? activeTabPath() ?? undefined) : false,
    stageAssetPreview: (assetId) =>
      deps.stageAssetPreview ? deps.stageAssetPreview(assetId) : false,
    showExplorer: () => undefined,
  });
  const toolsByKey = new Map<string, Map<string, WorkspaceTool<any>>>();
  const toolsFor = (key: string): Map<string, WorkspaceTool<any>> => {
    let map = toolsByKey.get(key);
    if (!map) {
      map = new Map(createV2Tools(envFor(key), hostFor(key)).map((t) => [t.name, t]));
      toolsByKey.set(key, map);
    }
    return map;
  };
  /** 도구 호출 → 그 호출을 낸 세션 (서버 세션 id). 모르면 메인 */
  const sessionKeyOf = (ctx?: ToolRunContext): string => registry.byServerSessionId(ctx?.sessionId)?.key ?? mainKey;
  const sessionTools = (): WorkspaceTool<any>[] =>
    [...toolsFor(mainKey).values()].map((tool) => ({
      ...tool,
      run: (args: unknown, ctx: ToolRunContext) => {
        const key = sessionKeyOf(ctx);
        if (tool.risk === "ui" && !registry.isForeground(key)) {
          // 보고 있지 않은 세션은 화면을 옮기지 않는다 — 세션을 열 때 마지막 이동을 한 번 실행한다
          registry.addRevealHint(key, { tool: tool.name, args: { ...((args as Record<string, unknown>) ?? {}) } });
          return {
            deferred: true,
            note: "사용자가 지금 다른 작업을 보고 있어 화면을 옮기지 않았다. 사용자가 이 세션을 열면 그때 보여 준다. 같은 이동을 다시 부르지 마라.",
          };
        }
        const impl = toolsFor(key).get(tool.name) ?? tool;
        return impl.run(args as never, ctx);
      },
    }));

  // --- 기준점 지켜보기 · 완료 -------------------------------------------------------------------------

  const completionListeners = new Set<(request: SessionCompletionRequest) => void>();
  /** 완료를 이미 물었다 (같은 완료 상태에서 다시 묻지 않는다 — 완료를 풀면 지운다) */
  const completionAsked = new Set<string>();

  const completeSession = async (key: string, options: { discardStaged?: boolean } = {}): Promise<void> => {
    completionAsked.delete(key);
    await registry.complete(key, { discardStaged: options.discardStaged ?? true });
  };

  const requestCompletion = (key: string) => {
    if (completionAsked.has(key)) return;
    completionAsked.add(key);
    const view = registry.view(key);
    if (!view) return;
    const finish = (discard: boolean) => void completeSession(key, { discardStaged: discard });
    if (view.reviewCount === 0 || completionListeners.size === 0) {
      finish(true);
      return;
    }
    const request: SessionCompletionRequest = {
      key,
      title: view.title,
      reviewCount: view.reviewCount,
      confirm: (discard) => finish(discard),
      cancel: () => undefined, // 완료를 풀 때까지 다시 묻지 않는다
    };
    completionListeners.forEach((listener) => {
      try {
        listener(request);
      } catch {
        /* 확인창 오류 — 세션은 그대로 */
      }
    });
  };

  const checkAnchor = (key: string) => {
    const entry = registry.get(key);
    if (!entry || entry.kind !== "anchored" || !entry.anchor || entry.lifecycle === "completed") return;
    const surface = surfaces.get(entry.anchor.surface);
    if (!surface) return;
    const missing = surface.missing(entry.anchor);
    if (missing.length >= entry.anchor.itemIds.length) {
      registry.setLifecycle(key, "anchor-lost");
      return;
    }
    if (entry.lifecycle === "anchor-lost") registry.setLifecycle(key, "active");
    if (surface.isCompleted(entry.anchor)) requestCompletion(key);
    else completionAsked.delete(key);
  };

  /** 진행 중 기준점마다 화면 변화를 구독한다 (기준점이 바뀌면 다시 붙는다). 확인은 마이크로태스크로 모은다 */
  const watchAnchors = (): (() => void) => {
    const watches = new Map<string, { anchor: SessionAnchor; off: () => void }>();
    const pending = new Set<string>();
    let flushing = false;
    const schedule = (key: string) => {
      pending.add(key);
      if (flushing) return;
      flushing = true;
      queueMicrotask(() => {
        flushing = false;
        const keys = [...pending];
        pending.clear();
        keys.forEach(checkAnchor);
      });
    };
    const sync = () => {
      const live = new Set<string>();
      for (const view of registry.list()) {
        if (view.kind !== "anchored" || !view.anchor || view.lifecycle === "completed") continue;
        live.add(view.key);
        const current = watches.get(view.key);
        if (current && current.anchor === view.anchor) continue;
        current?.off();
        const surface = surfaces.get(view.anchor.surface);
        if (!surface) continue;
        const key = view.key;
        watches.set(key, { anchor: view.anchor, off: surface.watch(view.anchor, () => schedule(key)) });
        schedule(key);
      }
      for (const [key, w] of watches) {
        if (!live.has(key)) {
          w.off();
          watches.delete(key);
        }
      }
    };
    sync();
    const off = registry.subscribe(sync);
    return () => {
      off();
      for (const w of watches.values()) w.off();
      watches.clear();
    };
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
        if (ev.type === "create" && ev.origin === "external" && ev.node.kind === "file" && anyRunning()) {
          deps.explorer.getState().markExternalChange(ev.node.path, "AI");
        }
      })
    );
    offs.push(runtime.contexts.registerAll(createV2ContextProviders(env)));
    // 도구는 한 벌만 등록하고, 호출한 세션(서버 세션 id)의 env 로 실행한다 — 기준점 세션은 기준점 문서를 본다
    offs.push(runtime.tools.registerAll(sessionTools()));

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

    // 파일 이름 바꾸기 · 이동 → 대기열 · 설정 · 마지막 문서 경로 · 기준점을 따라간다 / dc_new 뒤 새로 생긴 초안
    offs.push(
      deps.vault.subscribe((ev) => {
        if (ev.type === "rename") {
          store.getState().remapPath(ev.oldPath, ev.newPath);
          if (lastDocPath === ev.oldPath) lastDocPath = ev.newPath;
          for (const view of registry.list()) {
            if (!view.anchor) continue;
            const next = remapAnchor(view.anchor, ev.oldPath, ev.newPath);
            if (next !== view.anchor) registry.updateAnchor(view.key, next);
          }
          for (const handle of sessionEnvs.values()) handle.remap(ev.oldPath, ev.newPath);
        }
        if (ev.type === "create" && ev.origin === "external" && ev.node.kind === "file" && isVDocPath(ev.node.path) && awaitingDraft && Date.now() < awaitingDraft.until) {
          const key = awaitingDraft.key;
          awaitingDraft = null;
          adopt(ev.node.path, "new", key);
        }
      })
    );

    // 기준점 지켜보기 — 완료 표시 · 지워짐 · 되살아남
    offs.push(watchAnchors());
    return stop;
  };
  function stop(): void {
    offs?.forEach((off) => off());
    offs = null;
  }

  // --- 범위 · 고정 (studio AiComposerView 와 같은 규칙) -------------------------------------------------

  function refTarget(ref: ContextRef, envK: V2AiEnv = env): { path: string; target: ScopeTarget } | null {
    const path = typeof ref.meta?.path === "string" ? ref.meta.path : envK.activeDocPath();
    const doc = readVDoc(envK, path);
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

  /**
   * 보내기 직전 — 이번 메시지의 범위를 정해 범위 · 작업대 첨부를 바꾼다. 세션마다 자기 env 로 계산한다:
   * 메인은 지금 화면(활성 문서), 기준점 세션은 기준점 문서. 메인만 @문서 전환 때 탭을 연다 (기준점 세션은 화면을 옮기지 않는다).
   */
  const scopeFns = new Map<string, (text: string, contexts: ContextRef[]) => ContextRef[]>();
  const scopeForSendIn = (key: string) => {
    let fn = scopeFns.get(key);
    if (!fn) {
      fn = (text, contexts) => scopeForSendWith(key, text, contexts);
      scopeFns.set(key, fn);
    }
    return fn;
  };
  function scopeForSend(text: string, contexts: ContextRef[]): ContextRef[] {
    return scopeForSendWith(mainKey, text, contexts);
  }
  function scopeForSendWith(key: string, _text: string, contexts: ContextRef[]): ContextRef[] {
    const isMain = key === mainKey;
    const envK = envFor(key);
    const turnKey = isMain ? undefined : key;
    const workbenchNow = () => providersFor(key).find((p) => p.id === "workbench")?.current?.() ?? [];
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
      const mergedMount = resourceMountPayload(envK, explicitFolderPaths);
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
    let path = envK.activeDocPath();
    let switched = false;
    for (let i = kept.length - 1; i >= 0; i--) {
      const c = kept[i];
      if (c.kind !== "doc" || typeof c.meta?.path !== "string" || !c.handle) continue;
      const target = c.meta.path;
      if (target !== path && readVDoc(envK, target)) {
        if (isMain) {
          lastDocPath = target;
          deps.openVaultFile(target, "current");
        } else {
          sessionEnv(key).setDoc(target);
        }
        path = target;
        switched = true;
      }
      break;
    }
    if (switched) {
      const wb = withTargetFolders(workbenchNow());
      if (wb.length) kept = [...wb, ...kept.filter((c) => c.kind !== "workbench")];
    }

    const doc = readVDoc(envK, path);
    if (!doc || !path) {
      store.getState().setTurn(null, turnKey);
      const wb = withTargetFolders(workbenchNow());
      return wb.length ? [...wb, ...kept.filter((c) => c.kind !== "workbench")] : kept;
    }
    const pageId = switched ? doc.pages[0]?.pageId ?? null : activePageId(envK, doc, path);
    const explicit = kept.filter((c) => c.handle);
    const targets = explicit
      .filter((c) => SELECTION_KINDS.has(c.kind))
      .map((c) => refTarget(c, envK))
      .filter((t): t is { path: string; target: ScopeTarget } => !!t && t.path === path)
      .map((t) => t.target);
    const pages = explicit.filter((c) => c.kind === "page" && doc.pages.some((p) => p.pageId === c.id)).map((c) => c.id);
    const base: ResolvedScope =
      oneOffScope(doc, targets, pages) ??
      (switched ? { docId: doc.docId, mode: "document", label: doc.title, pageIds: null, slotIds: null, blockIds: null, oneOff: true } : currentScope(envK, doc, path));
    const scope = { ...base, sourcesOff: !s.sourcesOn };
    store.getState().setTurn({ ...scope, path }, turnKey);
    const ref = scopeContextRef(doc, path, scope, pageId);
    // 작업대도 이번 범위로 다시 만든다 (turn 을 읽는다)
    const wb = withTargetFolders(workbenchNow());
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

  /** 볼트 FS 묶음 되돌리기 — 그 묶음을 만든 서버 세션으로 (없으면 메인 세션) */
  const undoFsBatch = async (batchId: string): Promise<{ ok: boolean; message: string }> => {
    const batch = store.getState().fsBatches.find((b) => b.batchId === batchId);
    const sid = batch?.serverSessionId ?? controllerFor(batch?.sessionKey ?? mainKey).getState().sessionId ?? controller.getState().sessionId;
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

  // --- 기준점 세션: 화면 · 레지스트리 --------------------------------------------------------------

  const surfaces = new AnchorSurfaceRegistry();
  surfaces.registerAll(
    createV2AnchorSurfaces({
      env,
      editorSelection: () => deps.getEditorSelection?.() ?? null,
      openVaultFile: deps.openVaultFile,
      explorer: deps.explorer,
    })
  );

  /** 세션별 검토 안 한 변경안 수 (대기열이 바뀔 때만 다시 센다) */
  let reviewCache: { queue: readonly V2StagedChange[]; counts: Map<string, number> } | null = null;
  const reviewCount = (key: string): number => {
    const queue = store.getState().queue;
    if (!reviewCache || reviewCache.queue !== queue) {
      const counts = new Map<string, number>();
      for (const change of queue) {
        const k = change.sessionKey ?? mainKey;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      reviewCache = { queue, counts };
    }
    return reviewCache.counts.get(key) ?? 0;
  };

  const sessionLimits = (coreSettings as { sessions?: { maxConcurrentRuns?: number; maxOpenTabs?: number; maxCompleted?: number } }).sessions ?? {};
  registry = new SessionRegistry({
    main: controller,
    mainKey,
    mainTitle: "메인",
    createController: () => {
      const c = new ComposerSessionController(runtime);
      c.setPersistence(persist);
      return c;
    },
    metaStore: sessionMetaStore(storage, deps.vault.id),
    maxConcurrentRuns: sessionLimits.maxConcurrentRuns,
    maxOpenTabs: sessionLimits.maxOpenTabs,
    maxCompleted: sessionLimits.maxCompleted,
    pendingReviewCount: reviewCount,
    onControllerCreated: wireController,
    onComplete: (entry, { discardStaged }) => {
      const s = store.getState();
      if (discardStaged) {
        const removed = s.removeBySession(entry.key);
        if (removed) deps.pushLog("info", `session ${entry.key} completed — ${removed} staged change(s) discarded`);
      } else {
        // 남긴 변경안은 메인에서 검토한다 (완료된 세션 꼬리표를 뗀다)
        store.setState((st) => ({ queue: st.queue.map((c) => (c.sessionKey === entry.key ? { ...c, sessionKey: undefined } : c)) }));
        s.setTurn(null, entry.key);
      }
      sessionEnvs.delete(entry.key);
      sessionProviders.delete(entry.key);
      toolsByKey.delete(entry.key);
      scopeFns.delete(entry.key);
    },
    removeConversation: (key) => persist?.remove?.(key),
  });
  const offReviewSync = store.subscribe((s, prev) => {
    if (s.queue !== prev.queue) registry.refresh();
  });
  // 세션 상태 변화 → 터미널 (시작 · 대기 · 승인 대기 · 검토 필요 · 오류 · 끝 · 완료)
  const runStarted = new Map<string, number>();
  const offStatusLog = registry.onStatus((ev) => {
    const view = registry.view(ev.key);
    const secs = () => {
      const t0 = runStarted.get(ev.key);
      return t0 ? ` · ${Math.max(1, Math.round((Date.now() - t0) / 1000))}초` : "";
    };
    switch (ev.to) {
      case "queued":
        logAgent(ev.key, "info", "⏸ 대기열 — 실행 슬롯이 나면 시작");
        break;
      case "running":
        if (ev.from !== "awaiting_approval") runStarted.set(ev.key, Date.now());
        logAgent(ev.key, "info", ev.from === "awaiting_approval" ? "▶ 승인됨, 이어서 실행" : `▶ 실행${view?.anchor ? ` @ ${view.anchor.label}` : ""}`);
        break;
      case "awaiting_approval":
        logAgent(ev.key, "warn", "✋ 승인 대기 — 세션을 열어 확인");
        break;
      case "needs_review":
        logAgent(ev.key, "ok", `● 검토할 변경안 ${view?.reviewCount ?? 0}개${ev.from === "running" ? secs() : ""}`);
        break;
      case "error":
        logAgent(ev.key, "warn", `✕ 오류로 멈춤${secs()}`);
        break;
      case "idle":
        if (ev.from === "running") logAgent(ev.key, "ok", `✓ 끝남${secs()}`);
        break;
      case "completed":
        runStarted.delete(ev.key);
        logAgent(ev.key, "ok", "■ 완료 — 세션을 닫았다");
        break;
      default:
        break;
    }
  });

  const clipText = (text: string, n = 60) => (text.length <= n ? text : `${text.slice(0, n - 1)}…`);

  /**
   * `anchor` 를 주면 그것을 쓴다 — 지시 입력창을 누르는 순간 화면 선택이 풀리는 표면(아웃라이너)은
   * 누르기 직전의 선택을 잡아 넘긴다. 없으면 그 화면의 지금 선택.
   */
  const sendAnchored = (surfaceId: string, prompt: string, explicit?: SessionAnchor): SessionEntry | null => {
    const instruction = prompt.trim();
    if (!instruction) return null;
    const surface = surfaces.get(surfaceId);
    const anchor = explicit && explicit.surface === surfaceId && explicit.itemIds.length ? explicit : surface?.current() ?? null;
    if (!surface || !anchor) return null;
    const entry = registry.createAnchored({
      anchor,
      instruction,
      contexts: (key) => {
        // 지시 기록은 실행 시작보다 먼저 (보내기 직전 — 세션은 이미 있다)
        logAgent(key, "info", `지시 ← "${clipText(instruction)}" @ ${anchor.label}`);
        const picked: ContextRef[] = [];
        for (const ref of surface.toContexts(anchor)) picked.push({ ...ref, handle: assignHandle(ref, picked) });
        const text = picked.length ? `${picked.map((r) => r.handle).join(" ")} ${instruction}` : instruction;
        return { text, contexts: scopeForSendIn(key)(text, [...contextsFor(key).auto, ...picked]) };
      },
    });
    return entry;
  };

  const openSession = (key: string) => {
    registry.setForeground(key);
    const hints = registry.takeRevealHints(key);
    const last = hints[hints.length - 1];
    if (!last) return;
    if (last.tool === OPEN_HINT) {
      const path = typeof last.args.path === "string" ? last.args.path : "";
      if (path && deps.vault.exists(path)) deps.openVaultFile(path, last.args.mode === "new-tab" ? "new-tab" : "current");
      return;
    }
    const tool = runtime.tools.get(last.tool);
    if (!tool) return;
    const sessionId = controllerFor(key).getState().sessionId;
    try {
      void Promise.resolve(tool.run(last.args, { callId: `reveal-${Date.now().toString(36)}`, sessionId, signal: new AbortController().signal })).catch(
        () => undefined
      );
    } catch {
      /* 대상이 사라졌다 */
    }
  };

  const revealAnchor = (key: string) => {
    const anchor = registry.get(key)?.anchor;
    if (!anchor) return;
    surfaces.get(anchor.surface)?.reveal?.(anchor);
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
    revealResource: (rawTag, sourcePath) =>
      deps.revealResource ? deps.revealResource(rawTag, sourcePath ?? activeTabPath() ?? undefined) : false,
    stageAssetPreview: (assetId) =>
      deps.stageAssetPreview ? deps.stageAssetPreview(assetId) : false,
    conversationKey,
    sessions: registry,
    surfaces,
    sendAnchored,
    controllerFor,
    contextsFor,
    scopeForSendIn,
    openSession,
    revealAnchor,
    completeSession,
    requestCompleteSession: (key) => {
      completionAsked.delete(key);
      requestCompletion(key);
    },
    onCompletionRequest: (listener) => {
      completionListeners.add(listener);
      return () => completionListeners.delete(listener);
    },
    start,
    dispose: () => {
      stop();
      offReviewSync();
      offStatusLog();
      registry.pageExit();
      registry.dispose();
    },
  };
}
