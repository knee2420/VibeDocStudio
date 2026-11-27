import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Blocks,
  BookOpen,
  Check,
  ChevronsUpDown,
  FilePlus2,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderTree,
  Globe,
  HelpCircle,
  Keyboard,
  ListTree,
  Lock,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  Unlock,
  X,
  ListChecks,
} from "lucide-react";
import { SessionDashboard } from "@vibe/ai-composer";
import { anchorLabel } from "@vibe/ai-kernel";
import {
  createEmptyRefDocument,
  isRefPath,
  serializeRefJson,
} from "@vibe/ref-canvas/core";
import {
  basename,
  findOwningProjectPath,
  stripProjectFolderExt,
  type LocalApiVaultStatusSnapshot,
  type LocalVaultSummary,
  type VaultFileNode,
  type VaultPort,
} from "@vibe/vault-core";
import {
  FileExplorer,
  type ExplorerCustomContextAction,
  type FileCreateSchema,
  type FileExplorerPresentationOverride,
} from "@vibe/file-explorer/ui";
import { VIBE_VAULT_PATHS_MIME } from "@vibe/file-explorer/core";
import { WorkspaceLayoutView, type ExternalDropResource } from "@vibe/workspace-layout/ui";
import {
  getAllGroups,
  type EditorHostContext,
  type TabGroupNode,
  type WorkspaceTab,
} from "@vibe/workspace-layout/core";

import { createV2AiWorkspace, vaultPathContext, type V2AiWorkspace } from "@vibe/ai-vault";
import { scrapeAndSaveWebClipBundle } from "../model/clipClient";
import { openResourceTagInPair } from "../model/resourceHighlightBus";
import {
  dispatchAssetHubCommand,
  subscribeAguiAssetFunnel,
  type AguiAssetFunnelRequest,
} from "../model/assetActionBus";
import {
  createDefaultOutlineJson,
  createDefaultStylePackJson,
  createDefaultSyntaxJson,
  createDefaultVDoc,
  detectVDocViewId,
  isAssetPath,
  isOutlinePath,
  isStylePath,
  isSyntaxPath,
  isVDocPath,
  serializeVDocJson,
} from "@vibe/vault-formats";
import type { IdeEditorEnv } from "../model/editorAdapters";
import { resolveTabTitle } from "../model/sampleVault";
import {
  bootstrapIdeWorkbench,
  createOrMountWorkbenchVault,
  mountDirectLocalFolderWorkbench,
  type IdeLogEntry,
  type IdeWorkbenchRuntime,
} from "../model/useIdeWorkbench";
import { PagedDocumentIcon, ScrollDocumentIcon } from "./DocumentSurfaceIcons";
import { ImportReferenceModal } from "./ImportReferenceModal";
import { TabWithOutlineDrawer } from "./TabWithOutlineDrawer";
import { VDocAssetPanel } from "./VDocAssetPanel";
import { VDocInspectorPanel } from "./VDocInspectorPanel";
import { V2ComposerView } from "./ai/V2ComposerView";
import { CompletionConfirm, DirectivePromptDialog, SessionToasts, useSessionActivity } from "./ai/V2SessionOverlays";
import { installV2PerfProbe, shouldInstallPerfProbe } from "./perfProbe";
import { IdeSettingsModal } from "./settings";

/**
 * Isolated Terminal Drawer — subscribes to logs independently so incoming Vault/Layout logs
 * NEVER re-render the central 2D Canvas or Markdown editors.
 */
const IdeTerminalDrawer = React.memo<{
  readonly runtime: IdeWorkbenchRuntime;
  readonly height: number;
  readonly onClose: () => void;
}>(({ runtime, height, onClose }) => {
  const [logs, setLogs] = useState<readonly IdeLogEntry[]>(() => runtime.getLogs());
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => runtime.subscribeLogs(setLogs), [runtime]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <section
      style={{ height: `${height}px` }}
      className="flex shrink-0 flex-col bg-[var(--obs-bg-secondary-alt,#1a1a1a)]"
    >
      <div className="flex h-7 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3 text-[11px]">
        <div className="flex items-center gap-2 font-code font-semibold text-[var(--obs-text-muted,#b3b3b3)]">
          <TerminalIcon className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
          <span>TERMINAL · AI &amp; VAULT STREAM</span>
          <span className="rounded bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] px-1.5 text-[10px]">
            {logs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Hide Terminal"
          className="rounded p-0.5 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-code text-[11.5px] leading-5"
      >
        {logs.map((entry) => (
          <div key={entry.id} className="flex items-baseline gap-2">
            <span className="shrink-0 text-[var(--obs-text-faint,#666666)]">{entry.timestamp}</span>
            <span
              className="w-16 shrink-0 font-semibold uppercase"
              style={{
                color:
                  entry.source === "vault"
                    ? "#58a6ff"
                    : entry.source === "layout"
                      ? "#a68af9"
                      : entry.source === "composer"
                        ? "#3fb950"
                        : entry.source === "ref"
                          ? "#f59e0b"
                          : entry.source === "agent"
                            ? "#22d3ee"
                            : "#d29922",
              }}
            >
              [{entry.source}]
            </span>
            <span className="min-w-0 flex-1 break-all text-[var(--obs-text-normal,#dadada)]">
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
});

/**
 * Isolated Right Dock Sidebar — `[에셋 | Inspector | AI]` tri-tab panel.
 * Automatically shows `에셋` in `.vdoc` `[구조]` mode & `.outline` tabs, and `Inspector` in `[디자인]` mode.
 * Never subscribes to `hoveredBlockId` so canvas hover stays 0-re-render (M5 SLA).
 */
const IdeComposerSidebar = React.memo<{
  readonly runtime: IdeWorkbenchRuntime;
  readonly ai: V2AiWorkspace;
  readonly subscribeAi: (cb: () => void) => () => void;
  /** 바뀌면 AI 탭으로 (캔버스 2D 디렉팅 · 칸 AI 버튼) */
  readonly focusAiSeq: number;
  readonly aguiFunnelTrigger: { readonly seq: number; readonly req: AguiAssetFunnelRequest } | null;
  readonly width: number;
  readonly activeResourceId: string | null;
  readonly activeViewType: string | null;
}>(({ runtime, ai, subscribeAi, focusAiSeq, aguiFunnelTrigger, width, activeResourceId, activeViewType }) => {
  const isVDocActive = Boolean(
    activeResourceId && (activeViewType === "vibe-vdoc" || isVDocPath(activeResourceId))
  );
  const isOutlineActive = Boolean(
    activeResourceId && (activeViewType === "vibe-outliner" || isOutlinePath(activeResourceId))
  );
  const activeVDocWorkMode = useStore(runtime.vdocUiBridge, (s) =>
    isVDocActive && activeResourceId ? (s.byPath[activeResourceId]?.workMode ?? null) : null
  );

  type RightDockTab = "assets" | "inspector" | "ai";
  const autoDefaultTab: RightDockTab = isVDocActive
    ? activeVDocWorkMode === "Design"
      ? "inspector"
      : "assets"
    : isOutlineActive
      ? "assets"
      : "inspector";
  const tabAnchorKey = `${activeResourceId ?? ""}|${activeVDocWorkMode ?? "default"}`;

  const [tabState, setTabState] = useState<{
    readonly tab: RightDockTab;
    readonly anchorKey: string;
  }>({ tab: focusAiSeq > 0 ? "ai" : autoDefaultTab, anchorKey: tabAnchorKey });

  // Keep `AI` tab sticky across document tab switches (L8), while still auto-switching
  // `에셋` <-> `Inspector` when toggling `.vdoc` [구조] <-> [디자인] modes.
  const rightTab: RightDockTab =
    tabState.tab === "ai"
      ? "ai"
      : tabState.anchorKey === tabAnchorKey
        ? tabState.tab
        : autoDefaultTab;
  const setRightTab = useCallback(
    (next: RightDockTab) => {
      setTabState({ tab: next, anchorKey: tabAnchorKey });
    },
    [tabAnchorKey]
  );

  const [composerDragOver, setComposerDragOver] = useState(false);

  // 캔버스에서 AI 를 부르면 AI 탭으로
  const lastFocusSeqRef = useRef(focusAiSeq);
  useEffect(() => {
    if (focusAiSeq !== lastFocusSeqRef.current) {
      lastFocusSeqRef.current = focusAiSeq;
      setRightTab("ai");
    }
  }, [focusAiSeq, setRightTab]);

  // 탐색기에서 파일 · 폴더를 끌어 놓거나 OS 외부 파일을 드롭하면 Composer 첨부로
  const handleComposerDrop = (ev: React.DragEvent) => {
    const raw = ev.dataTransfer.getData(VIBE_VAULT_PATHS_MIME);
    if (raw) {
      ev.preventDefault();
      setComposerDragOver(false);
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const refs = parsed
          .filter((p): p is string => typeof p === "string" && runtime.vault.exists(p))
          .map((p) => vaultPathContext(ai, p))
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (refs.length > 0) {
          ai.controller.attach(refs);
          setRightTab("ai");
          runtime.pushLog("composer", "ok", `attached @mention context: ${refs.map((r) => r.label).join(", ")}`);
        }
      } catch {
        // Ignore
      }
      return;
    }
    if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
      ev.preventDefault();
      setComposerDragOver(false);
      const files = Array.from(ev.dataTransfer.files);
      void ai.attachFiles(files).then((refs) => {
        if (refs.length > 0) {
          ai.controller.attach(refs);
          setRightTab("ai");
          runtime.pushLog("composer", "ok", `attached external file(s): ${refs.map((r) => r.label).join(", ")}`);
        }
      });
    }
  };

  const activeProjectName = useMemo(() => {
    if (!activeResourceId) return null;
    const projPath = findOwningProjectPath(activeResourceId);
    return projPath ? stripProjectFolderExt(basename(projPath)) : null;
  }, [activeResourceId]);


  return (
    <aside
      style={{
        width: `${width}px`,
        boxShadow: composerDragOver ? "inset 0 0 0 2px var(--obs-accent,#8a5cf5)" : undefined,
      }}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes(VIBE_VAULT_PATHS_MIME) || ev.dataTransfer.types.includes("Files")) {
          ev.preventDefault();
          setComposerDragOver(true);
        }
      }}
      onDragLeave={() => setComposerDragOver(false)}
      onDrop={handleComposerDrop}
      className="flex h-full shrink-0 flex-col bg-[var(--obs-bg-secondary,#262626)]"
    >
      {/* Mode-Aware Tri-Tab Header: [에셋] | [Inspector] | [AI] */}
      <div className="flex h-9 shrink-0 select-none items-center justify-between gap-1.5 border-b border-[var(--obs-border-subtle,#2d2d2d)] px-2 text-[11.5px]">
        <div role="tablist" aria-label="Right dock mode" className="flex items-center gap-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === "assets"}
            onClick={() => setRightTab("assets")}
            className={`flex items-center gap-1 rounded-[5px] px-2 py-1 font-medium transition-colors ${rightTab === "assets"
              ? "bg-emerald-500/20 text-emerald-200"
              : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))] hover:text-[var(--obs-text-normal,#dadada)]"
              }`}
          >
            <Blocks className="h-3.5 w-3.5 text-emerald-400" />
            <span>에셋</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === "inspector"}
            onClick={() => setRightTab("inspector")}
            className={`flex items-center gap-1 rounded-[5px] px-2 py-1 font-medium transition-colors ${rightTab === "inspector"
              ? "bg-[var(--obs-bg-hover,rgba(255,255,255,0.09))] text-[var(--obs-text-normal,#ececec)]"
              : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))] hover:text-[var(--obs-text-normal,#dadada)]"
              }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
            <span>Inspector</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === "ai"}
            onClick={() => setRightTab("ai")}
            className={`flex items-center gap-1 rounded-[5px] px-2 py-1 font-medium transition-colors ${rightTab === "ai"
              ? "bg-[var(--obs-bg-hover,rgba(255,255,255,0.09))] text-[var(--obs-text-normal,#ececec)]"
              : "text-[var(--obs-text-muted,#9a9a9a)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.05))] hover:text-[var(--obs-text-normal,#dadada)]"
              }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />
            <span>AI</span>
          </button>
        </div>

        {activeProjectName && (
          <span
            title={`소속 프로젝트: ${activeProjectName}`}
            className="flex max-w-[92px] items-center gap-1 rounded bg-[rgba(138,92,245,0.18)] px-1.5 py-0.5 font-code text-[10px] font-medium text-[#c4b5fd]"
          >
            <FolderKanban className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{activeProjectName}</span>
          </span>
        )}
      </div>

      {/* VDocAssetPanel 은 AI 탭에서도 assets.stagePreview / AG-UI 카드 명령을 즉시 받도록 마운트 유지 (hoveredBlockId 미구독) */}
      <div className={rightTab === "assets" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}>
        <VDocAssetPanel runtime={runtime} activeResourceId={activeResourceId} />
      </div>
      {rightTab === "inspector" ? (
        isVDocActive && activeResourceId ? (
          <VDocInspectorPanel
            runtime={runtime}
            path={activeResourceId}
            onSwitchToAi={() => setRightTab("ai")}
            onSwitchToAssets={() => setRightTab("assets")}
            onAttachSelectionToAi={() => {
              ai.directFromCanvas();
              setRightTab("ai");
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 p-5 text-center text-[12px] text-[var(--obs-text-muted,#9a9a9a)]">
            <SlidersHorizontal className="h-6 w-6 opacity-40" />
            <div className="space-y-1">
              <p className="font-medium text-[var(--obs-text-normal,#dadada)]">
                WYSIWYM 인스펙터
              </p>
              <p className="text-[11px] leading-4 text-[var(--obs-text-faint,#777777)]">
                <code>.vdoc</code> 문서를 열면 스타일 팩·섹션 역할·블록 의미 속성을 이곳에서 바로 조작할 수 있습니다.
              </p>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRightTab("assets")}
                className="flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/25"
              >
                <Blocks className="h-3 w-3 text-emerald-400" />
                <span>에셋 보기</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab("ai")}
                className="flex items-center gap-1 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2.5 py-1 text-[11px] text-[var(--obs-text-normal,#dadada)] hover:border-[var(--obs-accent,#8a5cf5)]"
              >
                <Sparkles className="h-3 w-3 text-[var(--obs-accent,#8a5cf5)]" />
                <span>AI 탭</span>
              </button>
            </div>
          </div>
        )
      ) : rightTab === "ai" ? (
        <V2ComposerView
          ai={ai}
          subscribe={subscribeAi}
          vault={runtime.vault}
          activeResourceId={activeResourceId}
          aguiFunnelTrigger={aguiFunnelTrigger}
        />
      ) : null}
    </aside>
  );
});

interface IdeWorkbenchViewProps {
  readonly runtime: IdeWorkbenchRuntime;
  readonly vaults: readonly LocalVaultSummary[];
  readonly isDirectLocalMount: boolean;
  readonly onSwitchVault: (vaultId: string) => void;
  readonly onCreateOrMountVault: (name: string, rootPath?: string) => Promise<void>;
  readonly onMountDirectLocalFolder: (
    rootPath: string,
    name: string,
    readOnly: boolean
  ) => Promise<void>;
  readonly onReturnToDefaultVault: () => void;
  readonly onRetryLocal: () => void;
}

const IdeWorkbenchView: React.FC<IdeWorkbenchViewProps> = ({
  runtime,
  vaults,
  isDirectLocalMount,
  onSwitchVault,
  onCreateOrMountVault,
  onMountDirectLocalFolder,
  onReturnToDefaultVault,
  onRetryLocal,
}) => {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showExplorer, setShowExplorer] = useState(true);
  /** 왼쪽 사이드바: 탐색기 · AI 세션 대시보드 */
  const [leftView, setLeftView] = useState<"explorer" | "sessions">("explorer");
  /** 입력창 없는 화면(탐색기)에서 지시를 받는 창 */
  const [directiveTarget, setDirectiveTarget] = useState<{ surface: string; label: string } | null>(null);
  const [explorerWidth, setExplorerWidth] = useState(270);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(145);
  const [showComposer, setShowComposer] = useState(true);
  const [composerWidth, setComposerWidth] = useState(360);
  const [focusAiSeq, setFocusAiSeq] = useState(0);
  const [aguiFunnelTrigger, setAguiFunnelTrigger] = useState<{
    readonly seq: number;
    readonly req: AguiAssetFunnelRequest;
  } | null>(null);

  useEffect(() => {
    return subscribeAguiAssetFunnel((req) => {
      setShowComposer(true);
      setFocusAiSeq((n) => n + 1);
      setAguiFunnelTrigger({ seq: Date.now(), req });
    });
  }, []);

  // AI Composer 런타임 (볼트마다 하나) — studio @/shared/ai + ai-workspace 를 볼트 모델로 옮긴 것
  const ai = useMemo(
    () =>
      createV2AiWorkspace({
        vault: runtime.vault,
        vaultRootPath: runtime.vaultRootPath,
        layout: runtime.layout,
        explorer: runtime.explorer,
        vdocUiBridge: runtime.vdocUiBridge,
        docs: runtime.docs,
        openVaultFile: (path, mode) => runtime.openVaultFile(path, mode ?? "current"),
        stageAssetPreview: (assetId) =>
          dispatchAssetHubCommand({ type: "stage-preview", assetId }),
        revealResource: (rawTag, sourcePath) =>
          openResourceTagInPair(rawTag, {
            vault: runtime.vault,
            sourcePath,
            openInPair: (targetPath) =>
              runtime.openFileInPairTabGroup(targetPath, { sourcePath }),
          }),
        getTextSelection: () => {
          const sel = runtime.getActiveSelection();
          // 글 선택(.md · .ref) · 아웃라인 불릿 선택 → "선택한 글" 첨부 후보
          return sel && (sel.kind === "text" || sel.kind === "outline-nodes")
            ? { resourceId: sel.resourceId, text: sel.text, summary: sel.summary }
            : null;
        },
        getEditorSelection: () => runtime.getActiveSelection(),
        pushLog: (level, message) => runtime.pushLog("composer", level, message),
        pushAgentLog: (level, message) => runtime.pushLog("agent", level, message),
      }),
    [runtime]
  );
  const sessionActivity = useSessionActivity(ai);
  const attentionCount = sessionActivity.attention;
  const activeRuns = sessionActivity.running + sessionActivity.queued;
  // 세션을 앞으로 가져오면(선택 옆 표시 · 알림 · 대시보드) Composer 를 보이고 AI 탭으로
  useEffect(() => {
    let last = ai.sessions.getTabState().foreground;
    return ai.sessions.subscribe(() => {
      const fg = ai.sessions.getTabState().foreground;
      if (fg === last) return;
      last = fg;
      setShowComposer(true);
      setFocusAiSeq((n) => n + 1);
    });
  }, [ai]);
  /** 세션 열기 — Composer 를 보이고 AI 탭으로 전환 (미뤄 둔 화면 이동도 이때) */
  const openSession = useCallback(
    (key: string) => {
      setShowComposer(true);
      setFocusAiSeq((n) => n + 1);
      ai.openSession(key);
    },
    [ai]
  );
  useEffect(() => {
    // 개발 중 화면 검증 스크립트(CDP)가 대화 · 첨부 · 대기열을 직접 잰다 (studio window.__studioPerf 와 같은 자리)
    if (import.meta.env.DEV) (window as unknown as { __v2ai?: V2AiWorkspace }).__v2ai = ai;
    // StrictMode 의 정리 → 재마운트에도 도구 · 제공자가 남도록 등록만 걸고 푼다
    return ai.start();
  }, [ai]);
  useEffect(() => (shouldInstallPerfProbe() ? installV2PerfProbe(runtime) : undefined), [runtime]);
  useEffect(() => {
    // 페이지를 떠나면 서버 세션(agy 프로세스)을 바로 놓는다 (bfcache 보관은 둔다) — studio @/shared/ai 와 같다
    const onHide = (e: PageTransitionEvent) => {
      if (!e.persisted) ai.dispose();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [ai]);
  // 자동 첨부를 다시 계산할 때: 탭 · 선택(호버는 빼고) · 설정 · 볼트 · 텍스트 선택
  const subscribeAi = useCallback(
    (cb: () => void) => {
      const uiSig = () => {
        const path = ai.env.activeDocPath();
        const ui = path ? runtime.vdocUiBridge.getState().byPath[path] : undefined;
        const sel = ui?.selection.items.map((i) => `${i.kind}:${i.id}`).join(",") ?? "";
        return `${path}|${ui?.activePageId ?? ""}|${ui?.selectedBlockId ?? ""}|${ui?.selectedSlotId ?? ""}|${sel}`;
      };
      let lastUi = uiSig();
      let lastExplorerSel = runtime.explorer.getState().selectedPaths;
      const offs = [
        runtime.layout.subscribe(cb),
        runtime.vdocUiBridge.subscribe(() => {
          const next = uiSig();
          if (next !== lastUi) {
            lastUi = next;
            cb();
          }
        }),
        // 탐색기 다중 선택 → "탐색기에서 고른 파일" 첨부 후보
        runtime.explorer.subscribe((s) => {
          if (s.selectedPaths !== lastExplorerSel) {
            lastExplorerSel = s.selectedPaths;
            cb();
          }
        }),
        ai.store.subscribe(cb),
        runtime.vault.subscribe(cb),
        runtime.subscribeSelection(cb),
      ];
      return () => offs.forEach((off) => off());
    },
    [ai, runtime]
  );

  const [syncStatus, setSyncStatus] = useState<LocalApiVaultStatusSnapshot>(() =>
    runtime.getSyncStatus()
  );
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false);
  const [manageVaultModalOpen, setManageVaultModalOpen] = useState(false);
  const vaultMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!vaultMenuOpen) return;
    const handleClickOutside = (ev: MouseEvent) => {
      if (vaultMenuRef.current && !vaultMenuRef.current.contains(ev.target as Node)) {
        setVaultMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [vaultMenuOpen]);
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultPath, setNewVaultPath] = useState("");
  const [mountReadOnly, setMountReadOnly] = useState(true);
  const [readOnly, setReadOnly] = useState<boolean>(() => runtime.vault.isReadOnly?.() ?? false);
  const [vaultActionError, setVaultActionError] = useState<string | null>(null);
  const [vaultActionBusy, setVaultActionBusy] = useState(false);
  const [refImportModal, setRefImportModal] = useState<{
    readonly open: boolean;
    readonly targetFolder: string;
    readonly replaceRefPath: string | null;
  }>({ open: false, targetFolder: "00. References", replaceRefPath: null });
  const [settingsModal, setSettingsModal] = useState<{
    readonly open: boolean;
    readonly sectionId?: string;
  }>({ open: false });

  const openSettings = useCallback((sectionId?: string) => {
    setSettingsModal({ open: true, sectionId });
  }, []);

  const supportsReadOnlyToggle = Boolean(runtime.vault.isReadOnly && runtime.vault.setReadOnly);
  const handleToggleReadOnly = useCallback(() => {
    if (!runtime.vault.setReadOnly) return;
    const next = !readOnly;
    runtime.vault.setReadOnly(next);
    setReadOnly(next);
    runtime.pushLog(
      "vault",
      next ? "info" : "warn",
      next ? "Vault locked (Read-Only protection ON)" : "Vault unlocked (Read-Write enabled)"
    );
  }, [readOnly, runtime]);

  useEffect(() => runtime.subscribeSyncStatus(setSyncStatus), [runtime]);

  const handleCloseTerminal = useCallback(() => setShowTerminal(false), []);

  const layoutRoot = useStore(runtime.layout, (s) => s.root);
  const activeGroupId = useStore(runtime.layout, (s) => s.activeGroupId);
  const isGroupExpanded = useStore(runtime.layout, (s) => Boolean(s.expandedTabGroup));

  const paneCount = useMemo(() => getAllGroups(layoutRoot).length, [layoutRoot]);
  const activeTab = useMemo(() => {
    const groups = getAllGroups(layoutRoot);
    const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
    if (!activeGroup) return null;
    return activeGroup.tabs.find((t) => t.id === activeGroup.activeTabId) ?? null;
  }, [layoutRoot, activeGroupId]);

  const openImportReferenceModal = useCallback((replaceRefPath?: string, targetFolder?: string) => {
    setRefImportModal({
      open: true,
      targetFolder: targetFolder ?? "00. References",
      replaceRefPath: replaceRefPath ?? null,
    });
  }, []);

  const startAsyncUrlImport = useCallback(
    (opts: {
      readonly url: string;
      readonly title?: string;
      readonly targetFolder: string;
      readonly replacePath?: string | null;
      readonly fileName?: string;
    }) => {
      setShowTerminal(true);
      runtime.startAsyncUrlRefImport({
        ...opts,
        openMode: "current",
      });
    },
    [runtime]
  );

  const editorEnv = useMemo<IdeEditorEnv>(
    () => ({
      vault: runtime.vault,
      metadataCache: runtime.metadataCache,
      vdocUiBridge: runtime.vdocUiBridge,
      ai,
      openAiSession: openSession,
      docs: runtime.docs,
      openInPairTabGroup: runtime.openFileInPairTabGroup,
      openImportReferenceModal: (replaceRefPath) => openImportReferenceModal(replaceRefPath),
      startAsyncUrlRefImport: startAsyncUrlImport,
      settleRefFileName: runtime.settleRefFileName,
    }),
    [
      runtime.vault,
      runtime.settleRefFileName,
      runtime.metadataCache,
      runtime.vdocUiBridge,
      ai,
      openSession,
      runtime.docs,
      runtime.openFileInPairTabGroup,
      openImportReferenceModal,
      startAsyncUrlImport,
    ]
  );

  const fileCreateSchemas = useMemo<readonly FileCreateSchema[]>(
    () => [
      {
        id: "md",
        label: "새 노트 (.md)",
        description: "WYSIWYM 메모 · 개발 Docs",
        extension: "md",
        icon: <FilePlus2 className="h-3.5 w-3.5 text-[var(--obs-text-muted,#b3b3b3)]" />,
      },
      {
        id: "vdoc-a4",
        label: "새 문서 · A4 (.vdoc)",
        description: "페이지 단위 일반 문서 (794px)",
        extension: "vdoc",
        baseName: "New Document",
        icon: <PagedDocumentIcon className="h-3.5 w-3.5 text-sky-400" />,
        contentFactory: (title) => serializeVDocJson(createDefaultVDoc(title, "a4")),
      },
      {
        id: "vdoc-blog",
        label: "새 블로그 글 (.vdoc)",
        description: "이음매 없는 한 단 스크롤 글 (720px)",
        extension: "vdoc",
        baseName: "New Blog Post",
        icon: <ScrollDocumentIcon className="h-3.5 w-3.5 text-emerald-400" />,
        contentFactory: (title) => serializeVDocJson(createDefaultVDoc(title, "blog")),
      },
      {
        id: "outline",
        label: "새 아웃라인 (.outline)",
        description: "트리 계층 구조 설계",
        extension: "outline",
        icon: <ListTree className="h-3.5 w-3.5 text-[var(--obs-accent,#8a5cf5)]" />,
        contentFactory: (title) => createDefaultOutlineJson(title),
      },
      {
        id: "ref",
        label: "새 레퍼런스 (.ref)",
        description: "2D 캔버스 · 핀 · 층위 표본",
        extension: "ref",
        baseName: "Reference",
        icon: <BookOpen className="h-3.5 w-3.5 text-amber-400" />,
        // 앱이 정한 임시 이름이라 표시 — 내용을 가져오면 원본 제목으로 바뀐다.
        contentFactory: (title) =>
          serializeRefJson({ ...createEmptyRefDocument(title), nameSource: "auto" }),
      },
      {
        id: "vsyntax",
        label: "새 기호 규격 (.vsyntax)",
        description: "아웃라인 · 문서 요소 표현 기호 규격",
        extension: "vsyntax",
        baseName: "element-syntax",
        icon: <Keyboard className="h-3.5 w-3.5 text-indigo-400" />,
        contentFactory: (title) => createDefaultSyntaxJson(title),
      },
      {
        id: "vstyle",
        label: "새 스타일 팩 (.vstyle)",
        description: "5대 Grid Kit 토큰 · 디자인 팩",
        extension: "vstyle",
        baseName: "custom-style",
        icon: <Palette className="h-3.5 w-3.5 text-cyan-400" />,
        contentFactory: (title) => createDefaultStylePackJson(title),
      },
    ],
    []
  );

  const resolveExplorerFilePresentation = useCallback(
    (node: VaultFileNode, vault: VaultPort): FileExplorerPresentationOverride | null => {
      if (isSyntaxPath(node.path)) {
        return {
          icon: <Keyboard className="h-3.5 w-3.5 text-indigo-400" />,
          badge: "SYNTAX",
          badgeToneClass: "bg-indigo-500/15 text-indigo-300",
        };
      }
      if (isStylePath(node.path)) {
        return {
          icon: <Palette className="h-3.5 w-3.5 text-cyan-400" />,
          badge: "STYLE",
          badgeToneClass: "bg-cyan-500/15 text-cyan-300",
        };
      }
      if (isRefPath(node.path)) {
        return {
          icon: <BookOpen className="h-3.5 w-3.5 text-amber-400" />,
          badge: "REF",
          badgeToneClass: "bg-amber-500/15 text-amber-300",
        };
      }
      if (isVDocPath(node.path)) {
        let viewId: "a4" | "blog" = "a4";
        try {
          if (!vault.isLoaded || vault.isLoaded(node.path)) {
            viewId = detectVDocViewId(vault.read(node.path));
          }
        } catch {
          viewId = "a4";
        }
        if (viewId === "blog") {
          return {
            icon: <ScrollDocumentIcon className="h-3.5 w-3.5 text-emerald-400" />,
            badge: "BLOG",
            badgeToneClass: "bg-emerald-500/15 text-emerald-300",
          };
        }
        return {
          icon: <PagedDocumentIcon className="h-3.5 w-3.5 text-sky-400" />,
          badge: "A4",
          badgeToneClass: "bg-sky-500/15 text-sky-300",
        };
      }
      return null;
    },
    []
  );

  const explorerContextActions = useMemo<readonly ExplorerCustomContextAction[]>(
    () => [
      {
        id: "promote-to-ref",
        label: "레퍼런스로 만들기 (.ref)",
        icon: <BookOpen className="h-3.5 w-3.5 text-amber-400" />,
        targetKinds: ["file"],
        when: (filePath) => !isRefPath(filePath),
        onSelect: (filePath) => {
          void runtime.promoteFileToRef(filePath, "split-right");
        },
      },
      {
        id: "scrape-webclip-here",
        label: "웹 스크랩 추가 (.vclip)...",
        icon: <Globe className="h-3.5 w-3.5 text-emerald-400" />,
        targetKinds: ["folder", "root"],
        onSelect: (folderPath) => {
          const url = window.prompt("스크랩할 웹 URL 을 입력하세요 (https://...):", "https://");
          if (!url || !/^https?:\/\//i.test(url.trim())) return;
          const targetFolder = folderPath ? `${folderPath}/sources` : "sources";
          void scrapeAndSaveWebClipBundle(runtime.vault, {
            url: url.trim(),
            targetFolder,
            mode: "content",
            sourceMethod: "user-url",
          }).then(({ bundlePath }) => {
            runtime.openVaultFile(bundlePath, "new-tab");
            runtime.pushLog("vault", "ok", `웹 스크랩 생성: ${bundlePath}`);
          });
        },
      },
      {
        id: "import-ref-here",
        label: "Import Reference (.ref)...",
        icon: <BookOpen className="h-3.5 w-3.5 text-amber-400" />,
        targetKinds: ["folder", "root"],
        onSelect: (folderPath) => {
          openImportReferenceModal(undefined, folderPath);
        },
      },
      {
        id: "direct-ai-here",
        label: "AI 에 지시 던지기 (뒤에서 실행)",
        icon: <Sparkles className="h-3.5 w-3.5 text-violet-400" />,
        targetKinds: ["file", "folder"],
        onSelect: (path) => {
          // 우클릭한 항목이 선택에 없으면 그것만 고른다 (선택 여러 개 위에서 누르면 그 선택 전부)
          const ex = runtime.explorer.getState();
          if (!ex.selectedPaths.has(path)) ex.selectSingle(path);
          const count = runtime.explorer.getState().selectedPaths.size;
          const name = path.split("/").pop() || path;
          setDirectiveTarget({ surface: "explorer", label: count > 1 ? `${name} 외 ${count - 1}개` : name });
        },
      },
      {
        id: "attach-folder-to-ai",
        label: "AI 입력창에 폴더 첨부 (@폴더)",
        icon: <Sparkles className="h-3.5 w-3.5 text-violet-400" />,
        targetKinds: ["folder", "root"],
        onSelect: (folderPath) => {
          const ref = vaultPathContext(ai, folderPath) ?? {
            kind: "folder",
            id: `folder:${folderPath || "/"}`,
            label: folderPath || runtime.vault.name,
            access: "write" as const,
            role: "reference" as const,
            meta: { path: folderPath, entityKind: "folder" },
          };
          ai.controller.attach([ref]);
          setShowComposer(true);
          setFocusAiSeq((n) => n + 1);
          runtime.pushLog("composer", "ok", `attached folder to AI: ${folderPath || "/"}`);
        },
      },
      {
        id: "toggle-resource-folder",
        label: "AI 리소스 폴더 켜기 / 끄기",
        icon: <FolderOpen className="h-3.5 w-3.5 text-emerald-400" />,
        targetKinds: ["folder", "root"],
        onSelect: (folderPath) => {
          const clean = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
          ai.store.getState().toggleResourceFolder(clean);
          if (!ai.store.getState().sourcesOn) ai.store.getState().setSourcesOn(true);
          runtime.pushLog("composer", "info", `toggled AI resource folder: ${clean || "/"}`);
        },
      },
    ],
    [openImportReferenceModal, runtime, ai]
  );

  // Global IDE keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((ev.ctrlKey || ev.metaKey) && ev.key === ",") {
        ev.preventDefault();
        setSettingsModal((prev) => ({ open: !prev.open, sectionId: prev.sectionId }));
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "b") {
        ev.preventDefault();
        setShowExplorer((v) => !v);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "j") {
        ev.preventDefault();
        setShowTerminal((v) => !v);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "\\") {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().splitTab(cur.id, "right", "duplicate");
        return;
      }
      if ((ev.altKey || ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === "t") {
        ev.preventDefault();
        const reopened = runtime.layout.getState().reopenClosedTab();
        if (reopened) runtime.pushLog("layout", "info", "reopenClosedTab()");
        return;
      }
      // Composer 직전 탭 (Alt+[) — Composer 가 접혀 있어도 된다 (앞 세션이 바뀌면 Composer 를 연다). 한글 입력 중에도 물리 키로
      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && (ev.code === "BracketLeft" || ev.key === "[")) {
        ev.preventDefault();
        ai.sessions.back();
        return;
      }
      if (ev.altKey && ev.key === "ArrowLeft" && !inInput) {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().navigateBack(cur.id);
        return;
      }
      if (ev.altKey && ev.key === "ArrowRight" && !inInput) {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().navigateForward(cur.id);
        return;
      }
      if (ev.altKey && ev.key.toLowerCase() === "w" && !inInput) {
        ev.preventDefault();
        const cur = runtime.layout.getState().getActiveTab();
        if (cur) runtime.layout.getState().closeTab(cur.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runtime, ai]);

  const startHorizontalPanelResize = (
    ev: React.MouseEvent,
    currentWidth: number,
    direction: 1 | -1,
    min: number,
    max: number,
    setter: (next: number) => void
  ) => {
    ev.preventDefault();
    const startX = ev.clientX;
    const onMove = (m: MouseEvent) => {
      const next = Math.max(min, Math.min(max, currentWidth + (m.clientX - startX) * direction));
      setter(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startVerticalResize = (
    ev: React.MouseEvent,
    currentHeight: number,
    min: number,
    max: number,
    setter: (next: number) => void
  ) => {
    ev.preventDefault();
    const startY = ev.clientY;
    const onMove = (m: MouseEvent) => {
      const next = Math.max(min, Math.min(max, currentHeight - (m.clientY - startY)));
      setter(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const parseExplorerDrop = useCallback(
    (dt: DataTransfer): ExternalDropResource | null => {
      const raw = dt.getData(VIBE_VAULT_PATHS_MIME);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        for (const candidate of parsed) {
          if (typeof candidate !== "string") continue;
          const node = runtime.vault.getNode(candidate);
          if (node?.kind === "file") {
            const defaultAdapter = runtime.editorRegistry.resolveDefault(node.path);
            return {
              resourceId: node.path,
              title: resolveTabTitle(node.path),
              viewType: defaultAdapter?.id ?? "raw-code",
            };
          }
        }
      } catch {
        return null;
      }
      return null;
    },
    [runtime.vault, runtime.editorRegistry]
  );

  const renderTabIcon = useCallback(
    (tab: WorkspaceTab) => {
      if (tab.resourceId && isVDocPath(tab.resourceId) && tab.viewType === "vibe-vdoc") {
        let viewId: "a4" | "blog" = "a4";
        try {
          if (
            runtime.vault.exists(tab.resourceId) &&
            (!runtime.vault.isLoaded || runtime.vault.isLoaded(tab.resourceId))
          ) {
            viewId = detectVDocViewId(runtime.vault.read(tab.resourceId));
          }
        } catch {
          viewId = "a4";
        }
        return viewId === "blog" ? (
          <ScrollDocumentIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <PagedDocumentIcon className="h-3.5 w-3.5 shrink-0 text-sky-400" />
        );
      }
      if (tab.resourceId && isRefPath(tab.resourceId)) {
        return <BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
      }
      if (tab.resourceId && isSyntaxPath(tab.resourceId) && tab.viewType === "vibe-syntax") {
        return <Keyboard className="h-3.5 w-3.5 shrink-0 text-indigo-400" />;
      }
      if (tab.resourceId && isStylePath(tab.resourceId) && tab.viewType === "vibe-style") {
        return <Palette className="h-3.5 w-3.5 shrink-0 text-cyan-400" />;
      }
      if (tab.resourceId && isAssetPath(tab.resourceId) && tab.viewType === "vibe-asset") {
        return <Blocks className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
      }
      const adapter = tab.resourceId
        ? runtime.editorRegistry.resolveForTab(tab.resourceId, tab.viewType)
        : runtime.editorRegistry.getById(tab.viewType);
      const Icon = adapter?.icon ?? FileText;
      const colorClass =
        adapter?.id === "vibe-vdoc"
          ? "text-sky-400"
          : adapter?.id === "vibe-outliner"
            ? "text-[var(--obs-accent,#8a5cf5)]"
            : adapter?.id === "vibe-syntax"
              ? "text-indigo-400"
              : adapter?.id === "vibe-style"
                ? "text-cyan-400"
                : adapter?.id === "raw-code"
                  ? "text-amber-400"
                  : "opacity-75";
      return <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass}`} />;
    },
    [runtime.editorRegistry, runtime.vault]
  );

  const getAvailableViewTypes = useCallback(
    (tab: WorkspaceTab) => {
      if (!tab.resourceId) return [];
      return runtime.editorRegistry.listForPath(tab.resourceId).map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
      }));
    },
    [runtime.editorRegistry]
  );

  const acceptsCanvasDropForTab = useCallback(
    (tab: WorkspaceTab) => {
      if (!tab.resourceId) return false;
      const adapter = runtime.editorRegistry.resolveForTab(tab.resourceId, tab.viewType);
      return Boolean(adapter?.capabilities?.acceptsCanvasDrop);
    },
    [runtime.editorRegistry]
  );

  const renderEmptyTab = useCallback(
    (group: TabGroupNode, tab: WorkspaceTab) => (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-center">
        <div className="text-[14px] font-medium text-[var(--obs-text-muted,#b3b3b3)]">
          No file is open
        </div>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "vdoc", {
                baseName: "New Document",
                contentFactory: (title) => serializeVDocJson(createDefaultVDoc(title, "a4")),
              });
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "vibe-vdoc",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-sky-400 hover:underline"
          >
            Create new A4 document (.vdoc)
          </button>
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "vdoc", {
                baseName: "New Blog Post",
                contentFactory: (title) => serializeVDocJson(createDefaultVDoc(title, "blog")),
              });
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "vibe-vdoc",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-emerald-400 hover:underline"
          >
            Create new Blog post (.vdoc)
          </button>
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "outline");
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "vibe-outliner",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-[var(--obs-accent-hover,#a68af9)] hover:underline"
          >
            Create new outline (.outline)
          </button>
          <button
            type="button"
            onClick={() => {
              const { path } = runtime.explorer.getState().createNewFile("", "md");
              runtime.layout.getState().openResource({
                resourceId: path,
                title: resolveTabTitle(path),
                viewType: runtime.editorRegistry.resolveDefault(path)?.id ?? "obsidian-markdown",
                mode: "current",
                groupId: group.id,
              });
            }}
            className="text-[var(--obs-accent-hover,#a68af9)] hover:underline"
          >
            Create new note (.md)
          </button>
          <button
            type="button"
            onClick={() => runtime.layout.getState().closeTab(tab.id)}
            className="text-[var(--obs-text-faint,#666666)] hover:text-[var(--obs-text-muted,#b3b3b3)]"
          >
            Close
          </button>
        </div>
      </div>
    ),
    [runtime]
  );

  // Pure adapter-driven tab rendering
  const renderTabContent = useCallback(
    (tab: WorkspaceTab, group: TabGroupNode) => {
      if (!tab.resourceId) return null;
      const adapter = runtime.editorRegistry.resolveForTab(tab.resourceId, tab.viewType);
      if (!adapter) {
        return (
          <div className="flex h-full items-center justify-center text-xs text-[var(--obs-text-faint,#666666)]">
            No editor adapter registered for {tab.resourceId}
          </div>
        );
      }

      const host: EditorHostContext<IdeEditorEnv> = {
        env: editorEnv,
        path: tab.resourceId,
        tabId: tab.id,
        groupId: group.id,
        viewType: adapter.id,
        openLink: (target, mode) => {
          runtime.openWikilink(target, tab.resourceId!, mode ?? "current");
        },
        renameSelf: (newName) => {
          try {
            const res = runtime.vault.rename(tab.resourceId!, newName);
            return { ok: true, newPath: res.newPath };
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : "Rename failed",
            };
          }
        },
        notifyDirty: (dirty) => {
          runtime.layout.getState().setTabDirty(tab.resourceId!, dirty);
        },
        switchViewType: (nextViewType) => {
          runtime.layout.getState().setTabViewType(tab.id, nextViewType);
        },
        reportSelection: (sel) => {
          runtime.setActiveSelection(sel);
        },
        dispatchAiDirective: (directive) => {
          // 무마찰 디렉팅: 선택이 있으면 그 선택에 세션을 붙여 뒤에서 돌린다 (화면 · 포커스는 그대로)
          const directivePrompt = directive.prompt.trim();
          const surface = isOutlinePath(directive.resourceId) ? "outline" : isVDocPath(directive.resourceId) ? "vdoc" : null;
          const pickedOutline = surface === "outline" && directive.selection?.nodeIds?.length ? directive.selection.nodeIds : null;
          const pickedVdoc =
            surface === "vdoc"
              ? directive.selection?.nodeIds?.length
                ? directive.selection.nodeIds
                : directive.selection?.blockIds?.length
                  ? directive.selection.blockIds
                  : directive.selection?.slotIds?.length
                    ? directive.selection.slotIds
                    : null
              : null;
          const explicit =
            surface === "outline" && pickedOutline
              ? { surface, path: directive.resourceId, itemIds: [...pickedOutline], label: anchorLabel(directive.resourceId, pickedOutline.length, "불릿") }
              : surface === "vdoc" && pickedVdoc
                ? { surface, path: directive.resourceId, itemIds: [...pickedVdoc], label: anchorLabel(directive.resourceId, pickedVdoc.length, "칸") }
                : undefined;
          const anchored = directivePrompt && surface ? ai.sendAnchored(surface, directivePrompt, explicit) : null;
          if (anchored) {
            runtime.pushLog("composer", "ok", `directive -> background session [${anchored.anchor?.label}]: "${directivePrompt}"`);
            return;
          }
          // 캔버스 2D 디렉팅 → 진짜 Composer: 선택을 첨부하고 그 지시를 보낸다 (키워드 목업 실행기를 쓰지 않는다)
          setShowComposer(true);
          setFocusAiSeq((n) => n + 1);
          const prompt = directive.prompt.trim();
          if (prompt) void ai.sendFromCanvas(prompt);
          else ai.directFromCanvas();
          runtime.pushLog("composer", "info", `2D directive -> composer: "${prompt}" [${directive.selection?.summary ?? directive.resourceId}]`);
        },
      };

      return (
        <TabWithOutlineDrawer
          key={`${tab.id}:${adapter.id}:${tab.resourceId}`}
          adapter={adapter}
          host={host}
        />
      );
    },
    [editorEnv, runtime, ai]
  );

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)] ${theme === "dark" ? "obs-theme-dark" : "obs-theme-light"
        }`}
    >
      {/* Main 4-Zone IDE Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 1. Obsidian Left Ribbon (44px) */}
        <aside className="flex w-11 shrink-0 select-none flex-col items-center justify-between border-r border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary-alt,#1a1a1a)] py-2">
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (showExplorer && leftView === "explorer") setShowExplorer(false);
                else {
                  setShowExplorer(true);
                  setLeftView("explorer");
                }
              }}
              title="Toggle File Explorer (Ctrl+B)"
              aria-label="Toggle File Explorer"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showExplorer && leftView === "explorer"
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <FolderTree className="h-4 w-4" />
            </button>

            <button
              type="button"
              data-testid="ribbon-sessions"
              onClick={() => {
                if (showExplorer && leftView === "sessions") setShowExplorer(false);
                else {
                  setShowExplorer(true);
                  setLeftView("sessions");
                }
              }}
              title={`AI 세션 현황${activeRuns ? ` · 진행 ${sessionActivity.running}${sessionActivity.queued ? ` · 대기 ${sessionActivity.queued}` : ""}` : ""}${attentionCount ? ` · 확인 필요 ${attentionCount}` : ""}`}
              aria-label="Toggle AI Sessions Dashboard"
              className="relative flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showExplorer && leftView === "sessions"
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <ListChecks className="h-4 w-4" />
              {activeRuns > 0 && (
                <>
                  {/* 세션이 도는 동안 아이콘을 도는 고리 + 진행 수 */}
                  <span
                    data-testid="ribbon-sessions-running"
                    aria-hidden
                    className="pointer-events-none absolute inset-[3px] animate-spin rounded-full border-2 border-sky-400/80 border-r-transparent border-b-transparent"
                    style={{ animationDuration: "1.1s" }}
                  />
                  <span
                    data-testid="ribbon-sessions-running-count"
                    className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[9px] font-bold leading-none text-white"
                  >
                    {activeRuns}
                  </span>
                </>
              )}
              {attentionCount > 0 && (
                <span data-testid="ribbon-sessions-badge" className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white">
                  {attentionCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowTerminal((v) => !v)}
              title="Toggle AI Terminal Logs (Ctrl+J)"
              aria-label="Toggle AI Terminal Logs"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showTerminal
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <TerminalIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowComposer((v) => !v)}
              title="Toggle AI-Composer Panel"
              aria-label="Toggle AI-Composer Panel"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
              style={{
                color: showComposer
                  ? "var(--obs-accent,#8a5cf5)"
                  : "var(--obs-text-muted,#b3b3b3)",
              }}
            >
              <Sparkles className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => openImportReferenceModal(undefined, "00. References")}
              title="Import Reference (.ref) — 등록 라이브러리 10종 · 웹 URL · 파일 · Vault 승격"
              aria-label="Import Reference"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-amber-400 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} theme`}
              aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => runtime.resetWorkspace()}
              title={
                runtime.mode === "local"
                  ? "Re-sync Local Vault from disk"
                  : "Reset Sample Vault & Layout"
              }
              aria-label={runtime.mode === "local" ? "Re-sync Local Vault" : "Reset Sample Vault"}
              className="flex h-8 w-8 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </aside>

        {/* 2. Left Sidebar: Full-height Obsidian File Explorer + Bottom Vault Footer */}
        {showExplorer && (
          <>
            <aside
              style={{ width: `${explorerWidth}px` }}
              className="flex h-full shrink-0 flex-col overflow-hidden bg-[var(--obs-bg-secondary,#262626)]"
            >
              {/* Obsidian File Explorer · AI 세션 대시보드 */}
              {leftView === "sessions" && (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <SessionDashboard
                    registry={ai.sessions}
                    onOpen={openSession}
                    onReveal={ai.revealAnchor}
                    onStop={(key) => ai.sessions.stop(key)}
                    onComplete={ai.requestCompleteSession}
                    onReopen={(key) => {
                      setShowComposer(true);
                      ai.sessions.reopen(key);
                    }}
                  />
                </div>
              )}
              <div className={leftView === "sessions" ? "hidden" : "min-h-0 flex-1 overflow-hidden"}>
                <FileExplorer
                  store={runtime.explorer}
                  vaultName={runtime.vault.name}
                  fileCreateSchemas={fileCreateSchemas}
                  customContextActions={explorerContextActions}
                  resolveFilePresentation={resolveExplorerFilePresentation}
                  onToggleProjectFolder={({ oldPath, newPath, isProject }) => {
                    runtime.pushLog(
                      "explorer",
                      "ok",
                      isProject
                        ? `promoted to Project Folder: ${oldPath} -> ${newPath}`
                        : `converted to normal folder: ${oldPath} -> ${newPath}`
                    );
                  }}
                  onOpenFile={(path, mode) => runtime.openVaultFile(path, mode)}
                  onCopyPath={(path) => {
                    void navigator.clipboard?.writeText(path);
                    runtime.pushLog("explorer", "info", `copied path: ${path}`);
                  }}
                  onRevealInOsExplorer={(path) => {
                    void runtime.revealInOsExplorer(path);
                  }}
                />
              </div>

              {/* Obsidian 1.15 Left Sidebar Bottom Footer: [Vault ▾]   [?] [⚙️] */}
              <div className="relative flex h-9 shrink-0 select-none items-center justify-between gap-1 border-t border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-2">
                <button
                  type="button"
                  onClick={() => {
                    setVaultActionError(null);
                    setVaultMenuOpen((v) => !v);
                  }}
                  title={`보관함 전환 · ${runtime.vault.name}`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[12px] font-medium text-[var(--obs-text-muted,#b8b8b8)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--obs-text-faint,#777)]" />
                  <span className="truncate">{runtime.vault.name}</span>
                </button>

                {/* Obsidian Popover Menu: Vaults list + Manage vaults */}
                {vaultMenuOpen && (
                  <div
                    ref={vaultMenuRef}
                    className="absolute bottom-full left-1 z-50 mb-1 w-64 rounded-md border border-[var(--obs-border,#333333)] bg-[#202020] p-1 font-sans text-[12px] shadow-2xl backdrop-blur"
                  >
                    <div className="max-h-60 space-y-0.5 overflow-y-auto py-0.5">
                      {vaults.map((v) => {
                        const isCurrent =
                          (runtime.mode === "local" && runtime.vault.id === v.id) ||
                          runtime.vault.name === v.name;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              onSwitchVault(v.id);
                              setVaultMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-[12px] transition-colors ${isCurrent
                              ? "bg-[rgba(255,255,255,0.08)] font-medium text-[#ececec]"
                              : "text-[#b3b3b3] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#ececec]"
                              }`}
                          >
                            <span className="truncate">{v.name}</span>
                            {isCurrent && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="my-1 border-t border-[var(--obs-border-subtle,#2d2d2d)]" />

                    <button
                      type="button"
                      onClick={() => {
                        setVaultMenuOpen(false);
                        setManageVaultModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] text-[#8b949e] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#ececec]"
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#8b949e]" />
                      <span>보관함 관리하기...</span>
                    </button>
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openSettings("options:files")}
                    title="파일 확장자 · Code as Doc 도움말"
                    aria-label="Help"
                    className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#9a9a9a)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettings("options:syntax")}
                    title="설정 열기 (Ctrl+,)"
                    aria-label="Settings"
                    data-testid="ide-settings-trigger"
                    className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--obs-text-muted,#9a9a9a)] transition-colors hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#ececec)]"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </aside>

            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(ev) =>
                startHorizontalPanelResize(ev, explorerWidth, 1, 200, 480, setExplorerWidth)
              }
              className="group relative z-20 w-px shrink-0 cursor-col-resize bg-[var(--obs-border,#363636)]"
            >
              <div className="absolute top-0 bottom-0 -left-[3px] w-[7px] transition-colors group-hover:left-[-1px] group-hover:w-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
            </div>
          </>
        )}

        {/* 3. Center Column: @vibe/workspace-layout + Bottom AI Terminal */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <WorkspaceLayoutView
              store={runtime.layout}
              renderTabContent={renderTabContent}
              renderEmptyTab={renderEmptyTab}
              parseExternalDrop={parseExplorerDrop}
              renderTabIcon={renderTabIcon}
              getAvailableViewTypes={getAvailableViewTypes}
              acceptsCanvasDropForTab={acceptsCanvasDropForTab}
            />
          </div>

          {showTerminal && !isGroupExpanded && (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={(ev) =>
                  startVerticalResize(ev, terminalHeight, 96, 420, setTerminalHeight)
                }
                className="group relative z-20 h-px shrink-0 cursor-row-resize bg-[var(--obs-border,#363636)]"
              >
                <div className="absolute right-0 left-0 -top-[3px] h-[7px] transition-colors group-hover:top-[-1px] group-hover:h-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
              </div>

              <IdeTerminalDrawer
                runtime={runtime}
                height={terminalHeight}
                onClose={handleCloseTerminal}
              />
            </>
          )}
        </div>

        {/* 4. Right Sidebar — AGY-IDE AI-Composer (Isolated Selection & Draft State) */}
        {showComposer && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(ev) =>
                startHorizontalPanelResize(ev, composerWidth, -1, 280, 760, setComposerWidth)
              }
              className="group relative z-20 w-px shrink-0 cursor-col-resize bg-[var(--obs-border,#363636)]"
            >
              <div className="absolute top-0 bottom-0 -left-[3px] w-[7px] transition-colors group-hover:left-[-1px] group-hover:w-[3px] group-hover:bg-[var(--obs-accent,#8a5cf5)]" />
            </div>

            <IdeComposerSidebar
              runtime={runtime}
              ai={ai}
              subscribeAi={subscribeAi}
              focusAiSeq={focusAiSeq}
              aguiFunnelTrigger={aguiFunnelTrigger}
              width={composerWidth}
              activeResourceId={activeTab?.resourceId ?? null}
              activeViewType={activeTab?.viewType ?? null}
            />
          </>
        )}
      </div>

      {/* Obsidian Bottom Status Bar (24px) */}
      <footer className="relative flex h-6 shrink-0 select-none items-center justify-between border-t border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary-alt,#1a1a1a)] px-3 font-code text-[11px] text-[var(--obs-text-faint,#666666)]">
        <div className="flex items-center gap-3 truncate">
          {supportsReadOnlyToggle && (
            <button
              type="button"
              onClick={handleToggleReadOnly}
              title={
                readOnly
                  ? "읽기 전용 보호 켜짐 — 원본 파일 수정 차단 중 (클릭하여 잠금 해제)"
                  : "쓰기 허용됨 — 수정 사항이 디스크에 반영됨 (클릭하여 읽기 전용 잠금)"
              }
              className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium transition-colors ${readOnly
                ? "bg-[rgba(250,204,21,0.14)] text-[#facc15] hover:bg-[rgba(250,204,21,0.22)]"
                : "bg-[rgba(74,222,128,0.12)] text-[#4ade80] hover:bg-[rgba(74,222,128,0.20)]"
                }`}
            >
              {readOnly ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
              <span>{readOnly ? "RO" : "RW"}</span>
            </button>
          )}

          {runtime.mode === "local" && syncStatus.status === "syncing" && (
            <span className="text-[#facc15]">saving...</span>
          )}
          {syncStatus.lastError && (
            <span className="truncate text-[#fb464c]" title={syncStatus.lastError}>
              {syncStatus.lastError}
            </span>
          )}
          {activeTab?.resourceId &&
            (() => {
              const projPath = findOwningProjectPath(activeTab.resourceId);
              if (!projPath) return null;
              return (
                <span
                  title={`소속 프로젝트 폴더: ${projPath}`}
                  className="flex shrink-0 items-center gap-1 rounded bg-[rgba(138,92,245,0.18)] px-1.5 py-0.5 text-[10px] font-medium text-[#c4b5fd]"
                >
                  <FolderKanban className="h-2.5 w-2.5" />
                  <span>PROJ · {stripProjectFolderExt(basename(projPath))}</span>
                </span>
              );
            })()}
          {activeTab?.resourceId && (
            <span className="truncate text-[var(--obs-text-muted,#b3b3b3)]">
              {activeTab.resourceId} ({activeTab.viewType})
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span>
            {paneCount} {paneCount === 1 ? "pane" : "panes"}
          </span>
          <span>{theme === "dark" ? "Obsidian Dark" : "Obsidian Light"}</span>
        </div>

      </footer>

      {/* Obsidian Style Manage Vaults Modal */}
      {manageVaultModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="보관함 관리"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-lg border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] p-4 font-sans text-[12px] text-[var(--obs-text-normal,#dadada)] shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] pb-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#ececec]">
                <FolderOpen className="h-4 w-4 text-[var(--obs-accent,#8a5cf5)]" />
                <span>보관함 관리</span>
              </span>
              <div className="flex items-center gap-1">
                {isDirectLocalMount && (
                  <button
                    type="button"
                    onClick={() => {
                      onReturnToDefaultVault();
                      setManageVaultModalOpen(false);
                    }}
                    title="기본 보관함으로 복귀"
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>기본 보관함</span>
                  </button>
                )}
                {runtime.mode === "local" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void runtime.resyncLocalVault();
                    }}
                    title="디스크에서 다시 동기화"
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>동기화</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onRetryLocal();
                      setManageVaultModalOpen(false);
                    }}
                    className="flex items-center gap-1 rounded bg-[var(--obs-accent,#8a5cf5)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>로컬 연결 재시도</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setManageVaultModalOpen(false)}
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--obs-text-muted,#b3b3b3)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {runtime.vaultRootPath && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-2.5 py-1.5 font-code text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
                <span className="min-w-0 flex-1 truncate" title={runtime.vaultRootPath}>
                  현재 경로: {runtime.vaultRootPath}
                </span>
                {!isDirectLocalMount && (
                  <button
                    type="button"
                    onClick={() => {
                      void runtime.revealInOsExplorer("");
                    }}
                    title="OS 파일 탐색기에서 열기"
                    className="shrink-0 rounded px-1.5 py-0.5 font-sans text-[11px] text-[var(--obs-accent-hover,#a68af9)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  >
                    탐색기 열기
                  </button>
                )}
              </div>
            )}

            <div className="mb-3">
              <div className="mb-1.5 text-[11px] font-semibold text-[var(--obs-text-muted,#b3b3b3)]">
                등록된 보관함 목록
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] p-1.5">
                {vaults.map((v) => {
                  const isCurrent =
                    (runtime.mode === "local" && runtime.vault.id === v.id) ||
                    runtime.vault.name === v.name;
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-[#ececec]">{v.name}</span>
                          {isCurrent && (
                            <span className="rounded bg-[var(--obs-accent,#8a5cf5)]/20 px-1 py-0.2 text-[10px] text-[var(--obs-accent,#8a5cf5)]">
                              현재
                            </span>
                          )}
                        </div>
                        <span className="block truncate font-code text-[10px] text-[var(--obs-text-faint,#666666)]">
                          {v.rootPath}
                        </span>
                      </div>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => {
                            onSwitchVault(v.id);
                            setManageVaultModalOpen(false);
                          }}
                          className="shrink-0 rounded bg-[var(--obs-bg-secondary-alt,#1a1a1a)] px-2 py-0.5 text-[11px] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-accent,#8a5cf5)] hover:text-white"
                        >
                          열기
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <form
              onSubmit={async (ev) => {
                ev.preventDefault();
                const trimmedPath = newVaultPath.trim();
                const trimmedName = newVaultName.trim();
                if (vaultActionBusy) return;
                if (!trimmedPath && (runtime.mode !== "local" || isDirectLocalMount || !trimmedName)) {
                  return;
                }
                setVaultActionBusy(true);
                setVaultActionError(null);
                try {
                  if (trimmedPath) {
                    await onMountDirectLocalFolder(
                      trimmedPath,
                      trimmedName || trimmedPath.split(/[\\/]/).filter(Boolean).pop() || "Local Vault",
                      mountReadOnly
                    );
                  } else {
                    await onCreateOrMountVault(trimmedName, undefined);
                  }
                  setNewVaultName("");
                  setNewVaultPath("");
                  setManageVaultModalOpen(false);
                } catch (err) {
                  setVaultActionError(
                    err instanceof Error ? err.message : "보관함 생성/마운트 실패"
                  );
                } finally {
                  setVaultActionBusy(false);
                }
              }}
              className="space-y-2 border-t border-[var(--obs-border-subtle,#2d2d2d)] pt-3"
            >
              <div className="text-[11px] font-semibold text-[var(--obs-text-muted,#b3b3b3)]">
                새 로컬 폴더 직접 마운트
              </div>
              <input
                type="text"
                value={newVaultPath}
                onChange={(e) => setNewVaultPath(e.target.value)}
                placeholder="로컬 절대 경로 (예: C:\path\to\folder)"
                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2.5 py-1.5 font-code text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
              />
              <input
                type="text"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                placeholder="표시 이름 (선택 · 비우면 폴더명 사용)"
                className="w-full rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--obs-accent,#8a5cf5)]"
              />
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
                <input
                  type="checkbox"
                  checked={mountReadOnly}
                  onChange={(e) => setMountReadOnly(e.target.checked)}
                  className="rounded accent-[var(--obs-accent,#8a5cf5)]"
                />
                <span>읽기 전용 안전 잠금 (원본 볼트 보호 · 권장)</span>
              </label>
              {vaultActionError && (
                <div className="text-[11px] text-[#fb464c]">{vaultActionError}</div>
              )}
              <button
                type="submit"
                disabled={
                  vaultActionBusy ||
                  (!newVaultPath.trim() &&
                    (runtime.mode !== "local" || isDirectLocalMount || !newVaultName.trim()))
                }
                className="flex w-full items-center justify-center gap-1.5 rounded bg-[var(--obs-accent,#8a5cf5)] px-3 py-1.5 text-[11.5px] font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {vaultActionBusy
                    ? "마운트 중..."
                    : newVaultPath.trim()
                      ? mountReadOnly
                        ? "로컬 폴더 마운트 (읽기 전용)"
                        : "로컬 폴더 마운트 (쓰기 허용)"
                      : "새 보관함 등록"}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      <ImportReferenceModal
        open={refImportModal.open}
        targetFolder={refImportModal.targetFolder}
        replaceRefPath={refImportModal.replaceRefPath}
        vault={runtime.vault}
        onClose={() => setRefImportModal((s) => ({ ...s, open: false }))}
        onImportedDoc={(doc, opts) => {
          runtime.importRefDocument(refImportModal.targetFolder, doc, {
            replacePath: opts?.replacePath ?? refImportModal.replaceRefPath,
            openMode: "current",
          });
        }}
        onStartAsyncUrlImport={(url, title) => {
          startAsyncUrlImport({
            url,
            title,
            targetFolder: refImportModal.targetFolder,
            replacePath: refImportModal.replaceRefPath,
          });
        }}
        onPromoteVaultFile={(vaultPath) => {
          void runtime.promoteFileToRef(vaultPath, "current");
        }}
      />

      {/* Obsidian 1.15 Full-Overlay Settings Modal (Ctrl+, / Sidebar ⚙️) */}
      {settingsModal.open && (
        <IdeSettingsModal
          key={settingsModal.sectionId ?? "options:syntax"}
          open={settingsModal.open}
          onClose={() => setSettingsModal((prev) => ({ ...prev, open: false }))}
          vault={runtime.vault}
          theme={theme}
          onChangeTheme={setTheme}
          initialSectionId={settingsModal.sectionId}
          onOpenFileInTab={(filePath) => runtime.openVaultFile(filePath, "current")}
        />
      )}

      {/* 무마찰 디렉팅 — 뒤 세션 알림 · 완료 확인 · 지시 입력 */}
      <SessionToasts ai={ai} composerVisible={showComposer} onOpen={openSession} />
      <CompletionConfirm ai={ai} />
      {directiveTarget && (
        <DirectivePromptDialog
          label={directiveTarget.label}
          onClose={() => setDirectiveTarget(null)}
          onSubmit={(prompt) => {
            const entry = ai.sendAnchored(directiveTarget.surface, prompt);
            if (entry) runtime.pushLog("composer", "ok", `directive -> background session [${entry.anchor?.label}]: "${prompt}"`);
            else runtime.pushLog("composer", "warn", "선택한 항목이 없어 지시를 보내지 않았습니다.");
          }}
        />
      )}
    </div>
  );
};

export const IdeWorkbenchPage: React.FC = () => {
  const [bootState, setBootState] = useState<{
    readonly runtime: IdeWorkbenchRuntime | null;
    readonly vaults: readonly LocalVaultSummary[];
    readonly isDirectLocalMount: boolean;
  }>({ runtime: null, vaults: [], isDirectLocalMount: false });
  const [bootSeq, setBootSeq] = useState(0);
  const [directMountSeq, setDirectMountSeq] = useState(0);
  const [requestedVaultId, setRequestedVaultId] = useState<string | undefined>(undefined);
  const runtimeRef = useRef<IdeWorkbenchRuntime | null>(null);

  const swapRuntime = useCallback(
    (next: {
      readonly runtime: IdeWorkbenchRuntime;
      readonly vaults: readonly LocalVaultSummary[];
      readonly isDirectLocalMount: boolean;
    }) => {
      const prev = runtimeRef.current;
      if (prev && prev !== next.runtime) {
        prev.dispose();
      }
      runtimeRef.current = next.runtime;
      setBootState(next);
    },
    []
  );

  useEffect(() => {
    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void bootstrapIdeWorkbench({ vaultId: requestedVaultId }).then((res) => {
      if (cancelled) {
        res.runtime.dispose();
        return;
      }
      swapRuntime({
        runtime: res.runtime,
        vaults: res.vaults,
        isDirectLocalMount: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [requestedVaultId, bootSeq, swapRuntime]);

  const handleSwitchVault = useCallback((vaultId: string) => {
    setRequestedVaultId(vaultId);
    setBootSeq((n) => n + 1);
  }, []);

  const handleCreateOrMountVault = useCallback(async (name: string, rootPath?: string) => {
    const created = await createOrMountWorkbenchVault(name, rootPath);
    setRequestedVaultId(created.id);
    setBootSeq((n) => n + 1);
  }, []);

  const handleMountDirectLocalFolder = useCallback(
    async (rootPath: string, name: string, readOnly: boolean) => {
      const res = await mountDirectLocalFolderWorkbench({
        rootPath,
        name: name || undefined,
        readOnly,
      });
      setDirectMountSeq((n) => n + 1);
      swapRuntime({
        runtime: res.runtime,
        vaults: bootState.isDirectLocalMount ? res.vaults : bootState.vaults,
        isDirectLocalMount: true,
      });
    },
    [bootState.isDirectLocalMount, bootState.vaults, swapRuntime]
  );

  const handleReturnToDefaultVault = useCallback(() => {
    setRequestedVaultId(undefined);
    setBootSeq((n) => n + 1);
  }, []);

  const handleRetryLocal = useCallback(() => {
    setBootSeq((n) => n + 1);
  }, []);

  if (!bootState.runtime) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1e1e1e] font-code text-xs text-[#b3b3b3]">
        Mounting local vault...
      </div>
    );
  }

  return (
    <IdeWorkbenchView
      key={`${bootState.runtime.mode}:${bootState.runtime.vault.id}:${bootSeq}:${directMountSeq}`}
      runtime={bootState.runtime}
      vaults={bootState.vaults}
      isDirectLocalMount={bootState.isDirectLocalMount}
      onSwitchVault={handleSwitchVault}
      onCreateOrMountVault={handleCreateOrMountVault}
      onMountDirectLocalFolder={handleMountDirectLocalFolder}
      onReturnToDefaultVault={handleReturnToDefaultVault}
      onRetryLocal={handleRetryLocal}
    />
  );
};
