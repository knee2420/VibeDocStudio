import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FilePlus2,
  FolderInput,
  FolderKanban,
  Link2,
  Loader2,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Unlink,
  Wand2,
  X,
} from "lucide-react";
import { getPath, type OutlineNode } from "@vibe/outliner";
import type { TreePatchRequest } from "@vibe/outliner/core";
import type { V2AiWorkspace, V2StagedChange } from "@vibe/ai-vault";
import {
  OutlineBoard,
  OutlineEditorProvider,
  OutlineHeader,
  OutlineTree,
  createOutlineEditorStore,
  useOutlineView,
  type OutlineEditorStore,
  type OutlineHost,
} from "@vibe/outliner/editor";
import {
  MemoVDocPageSheet,
  VDocStyleProvider,
} from "@vibe/slot-canvas";
import {
  buildEvidenceBacklinkIndex,
  documentSurface,
  extractOutlineAssets,
  parseOutlineDirective,
  resolveActiveDirectiveContext,
  resolveDocumentView,
  scanOutlineDirectives,
  type OutlineSyntaxNode,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import { basename, dirname, findOwningProjectPath, type VaultPort } from "@vibe/vault-core";

import {
  collectVaultStyleEntries,
  fromVaultUri,
  type OutlineFilePayload,
  parseOutlineJson,
  resolveActiveStyleEntry,
} from "@vibe/vault-formats";
import { createVaultOutlineFiles } from "../model/outlineFileHost";
import { renderOutlineInlineMarkdown } from "./outlineLiveRenderer";
import {
  clearResourceHighlight,
  openResourceTagInPair,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";
import { requestOpenAguiAssetFunnel } from "../model/assetActionBus";
import {
  OutlineEvidenceLegendPanel,
  OutlineNodeEvidenceSubline,
  collectOutlineEvidenceEntries,
} from "./EvidenceExpressions";
import { AnchorChips, AnchorDraft, outlineNodeSelector } from "./ai/AnchorChips";
import {
  bindVDocToExistingOutline,
  type BridgeOpenMode,
  buildOutlineUnifiedDiff,
  collectVDocCandidatesForOutline,
  commitStagedAssetToOutlineAndVDoc,
  compileOutlineTargetForPreview,
  formatProjectScopeLabel,
  importPartnerIntoProjectAndBind,
  inspectOutlineNodeVDocLink,
  materializeVDocFromOutlineDirective,
  mergeOutlineNodeEvidence,
  type OutlineRevealOptions,
  type OutlineUnifiedDiffLine,
  outlineSemanticSignature,
  registerLiveOutlineSession,
  resolveVDocForOutlineBinding,
  subscribeOutlineReveal,
  unlinkOutlineNodeBinding,
} from "@vibe/outline-sync";
import type { VDocUiBridgeStore } from "@vibe/canvas-state";
import type { EditorSelectionSnapshot } from "@vibe/workspace-layout/core";

/**
 * 탭 하나가 보는 `.outline` 파일. 파일 내용이 그대로인 동안에는 **같은 객체**를 돌려준다.
 *
 * 편집 스토어(`@vibe/outliner`)는 `getRoots()` 가 돌려준 배열이 바뀌었는지(객체 동일성)로
 * "밖에서 파일이 바뀌었다"를 판단하고, 그때 실행 취소 기록을 비운다. 그래서 읽을 때마다 새로
 * 파싱하면 모든 편집이 외부 변경으로 보여 실행 취소가 영영 동작하지 않는다.
 * 여기서는 마지막으로 읽거나 쓴 원문을 기억해, 원문이 실제로 달라졌을 때만 새로 파싱한다.
 */
export interface OutlineFileSession {
  readonly snapshot: () => OutlineFilePayload;
  readonly write: (next: OutlineFilePayload) => void;
  readonly subscribe: (onChange: () => void) => () => void;
}

export function createOutlineFileSession(
  vault: VaultPort,
  path: string,
  fallbackTitle: string
): OutlineFileSession {
  let lastRaw: string | null = null;
  let payload: OutlineFilePayload | null = null;

  const snapshot = (): OutlineFilePayload => {
    let raw = "";
    try {
      raw = vault.exists(path) ? vault.read(path) : "";
    } catch {
      raw = lastRaw ?? "";
    }
    if (payload === null || raw !== lastRaw) {
      lastRaw = raw;
      payload = parseOutlineJson(raw, fallbackTitle);
    }
    return payload;
  };

  const write = (next: OutlineFilePayload) => {
    const text = JSON.stringify(next, null, 2);
    // 먼저 기억해 두어야, 쓰기가 일으키는 modify 알림에서 읽은 원문이 같다고 판단된다.
    lastRaw = text;
    payload = next;
    vault.write(path, text);
  };

  const subscribe = (onChange: () => void) =>
    vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") onChange();
    });

  return { snapshot, write, subscribe };
}

/** 줌인한 불릿에 지정된 보기 방식이 있으면 그것을, 없으면 문서 기본 보기 방식을 따른다. */
const OutlineBody: React.FC = () => {
  const { view } = useOutlineView();
  return view === "board" ? <OutlineBoard /> : <OutlineTree />;
};

/** 구조 패널 또는 `.vdoc` 에서 고른 불릿을 화면에 보여 준다 (자동 줌인 금지 — 접힌 조상만 펼치고 포커스·스크롤). */
function revealNode(
  store: OutlineEditorStore,
  roots: OutlineNode[],
  nodeId: string,
  container: HTMLElement | null,
  options?: OutlineRevealOptions
): void {
  const chain = getPath(roots, nodeId);
  const node = chain[chain.length - 1];
  if (!node) return;
  const ancestors = chain.slice(0, -1);
  const state = store.getState();

  if (options?.zoom) {
    state.setZoom(node.id);
  } else {
    // 접힌 조상이 있으면 줌인 대신 조상만 펼친다 (set_fold 는 Undo 히스토리를 건드리지 않음).
    const foldedAncestors = ancestors.filter((a) => a.isFolded);
    if (foldedAncestors.length > 0) {
      state.applyPatch(
        foldedAncestors.map((a) => ({ op: "set_fold" as const, id: a.id, isFolded: false }))
      );
    }
    // 이미 다른 브랜치에 수동 줌인되어 대상이 보이지 않는 경우에만 줌을 해제한다.
    if (
      state.activeRootId &&
      state.activeRootId !== node.id &&
      !ancestors.some((a) => a.id === state.activeRootId)
    ) {
      state.setZoom(null);
    }
  }

  store.getState().setFocus(node.id, node.text.length);
  requestAnimationFrame(() => {
    container
      ?.querySelector(`[data-row-id="${CSS.escape(node.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

const NOOP = () => { };

/**
 * Isolated leaf overlay for `.outline` tab — subscribes ONLY to `stagedAssetPreview`
 * matching this `.outline` (NEVER `hoveredBlockId`) so `.outline` and `.vdoc` show
 * synchronized Staged AI Tag Preview + Apply / Revert controls simultaneously.
 */
const OutlineStagedAssetBar = React.memo<{
  readonly bridge: VDocUiBridgeStore;
  readonly outlinePath: string;
  readonly vault: VaultPort;
  readonly boundVDocPaths: readonly string[];
}>(({ bridge, outlinePath, vault, boundVDocPaths }) => {
  const matchedVDocPath = useStore(bridge, (s) => {
    for (const [vdocPath, ui] of Object.entries(s.byPath)) {
      const staged = ui.stagedAssetPreview;
      if (!staged) continue;
      if (staged.linkedOutlinePath === outlinePath) return vdocPath;
      if (boundVDocPaths.includes(vdocPath)) return vdocPath;
    }
    return null;
  });

  const staged = useStore(bridge, (s) =>
    matchedVDocPath ? (s.byPath[matchedVDocPath]?.stagedAssetPreview ?? null) : null
  );

  if (!matchedVDocPath || !staged) return null;

  const handleApply = () => {
    if (staged.status !== "ready") return;
    const res = commitStagedAssetToOutlineAndVDoc(vault, matchedVDocPath, staged, {
      syncOutline: true,
    });
    bridge.getState().clearStagedAssetPreview(matchedVDocPath);
    if (res.firstBlockId) {
      bridge.getState().selectBlock(matchedVDocPath, res.firstBlockId, staged.targetPageId);
    }
  };

  const handleRevert = () => {
    bridge.getState().clearStagedAssetPreview(matchedVDocPath);
  };

  return (
    <div className="shrink-0 border-t border-[var(--obs-accent,#8a5cf5)]/60 bg-[#1c1b24]/95 px-3.5 py-2.5 text-[11.5px] text-[#e6edf3] shadow-[0_-10px_28px_rgba(0,0,0,0.45)]">
      {staged.status === "loading" ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-[#ddd6fe]">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--obs-accent,#8a5cf5)]" />
            <span className="truncate font-medium">
              AI가 &lsquo;{staged.assetTitle}&rsquo; 구조 태그를 생성 중입니다...
            </span>
          </div>
          <button
            type="button"
            onClick={handleRevert}
            className="shrink-0 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10.5px] text-white/80 hover:bg-white/15"
          >
            취소
          </button>
        </div>
      ) : staged.status === "error" ? (
        <div className="flex items-center justify-between gap-2 text-rose-200">
          <span className="truncate">{staged.errorMessage ?? "에셋 태그 미리보기 생성 실패"}</span>
          <button
            type="button"
            onClick={handleRevert}
            className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10.5px] text-white"
          >
            닫기
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-semibold text-[#ddd6fe]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--obs-accent,#8a5cf5)]" />
              <span className="truncate">아웃라인 구조 태그 미리보기 · {staged.assetTitle}</span>
              <span className="shrink-0 rounded bg-[var(--obs-accent,#8a5cf5)]/25 px-1.5 py-0 font-code text-[9.5px] text-[#e9d5ff]">
                {staged.engine === "llm" ? "AI" : "규칙 폴백"}
              </span>
              <span className="hidden shrink-0 rounded bg-emerald-500/15 px-1.5 py-0 font-code text-[9.5px] text-emerald-300 sm:inline">
                {basename(matchedVDocPath)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRevert}
              title="되돌리기"
              className="shrink-0 rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Preview of exact `.outline` DSL tags that will be written on Apply */}
          <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--obs-accent,#8a5cf5)]/35 bg-[#14141b] px-2.5 py-2 font-code text-[11px] leading-5">
            {staged.suggestedOutlineDsl.map((rawLine, idx) => {
              const indent = rawLine.length - rawLine.trimStart().length;
              const depth = Math.floor(indent / 2);
              const trimmed = rawLine.trim();
              return (
                <div
                  key={`${idx}-${trimmed.slice(0, 16)}`}
                  style={{ paddingLeft: `${depth * 14}px` }}
                  className="flex items-start gap-1.5 text-emerald-100/95"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--obs-accent,#8a5cf5)]" />
                  <span className="min-w-0 flex-1 break-words">
                    {trimmed.startsWith("<<") ? (
                      <span className="rounded bg-violet-500/25 px-1 py-0.5 text-violet-200">
                        {trimmed}
                      </span>
                    ) : trimmed.startsWith("[img:") || trimmed.startsWith("[cta:") || trimmed.startsWith("[embed:") ? (
                      <span className="text-sky-300">{trimmed}</span>
                    ) : trimmed.startsWith("> ") || trimmed.startsWith("! ") ? (
                      <span className="text-amber-200">{trimmed}</span>
                    ) : (
                      trimmed
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10.5px] text-white/65">
              적용 시 이 아웃라인 태그와 연결된 .vdoc 이 함께 저장됩니다
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleRevert}
                className="flex items-center gap-1 rounded-md border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10"
              >
                <RotateCcw className="h-3 w-3" />
                <span>되돌리기</span>
              </button>
              <button
                type="button"
                onClick={handleApply}
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
  );
});

interface CompiledPreviewSnapshot {
  readonly doc: VDocDocument | null;
  readonly targetNodeId: string;
  readonly targetLabel: string;
  readonly signature: string;
}

/**
 * `.outline` 에디터 인라인 Unified Diff 리뷰 레이어 (`agy-ide` Review Changes 스타일).
 * - 대기 중인 `outline-patch` Staged 제안이 있으면 코드 에디터처럼 `-`(삭제/원문) · `+`(추가/수정) 인라인 Diff 로 보여 준다.
 * - `Alt+Enter` 로 즉시 승인, `Alt+Shift+Enter` 로 거절 가능하며, 실패 연산(`failedOps`)이 있으면 위험한 부분 적용을 차단한다.
 */
const OutlineDiffRow: React.FC<{ readonly line: OutlineUnifiedDiffLine }> = React.memo(({ line }) => {
  const isRemoved = line.kind === "removed" || line.kind === "modified-old";
  const isAdded = line.kind === "added" || line.kind === "modified-new";
  const gutterChar = isRemoved ? "−" : isAdded ? "+" : " ";
  const rowCls = isRemoved
    ? "border-l-2 border-rose-500/80 bg-rose-500/12 text-rose-200/85"
    : isAdded
      ? "border-l-2 border-emerald-400/90 bg-emerald-500/12 text-emerald-100"
      : "border-l-2 border-transparent text-slate-400";
  const gutterCls = isRemoved
    ? "text-rose-400 font-bold"
    : isAdded
      ? "text-emerald-400 font-bold"
      : "text-slate-600";

  return (
    <div
      data-testid="outline-diff-line"
      data-diff-kind={line.kind}
      className={`flex items-start gap-2 rounded-r px-2 py-0.5 text-[13px] leading-[1.55] transition-colors ${rowCls}`}
    >
      <span className={`w-4 shrink-0 select-none text-center font-mono text-[12px] ${gutterCls}`}>
        {gutterChar}
      </span>
      <div
        className="flex min-w-0 flex-1 items-start gap-2"
        style={{ paddingLeft: `${Math.min(line.depth, 10) * 18}px` }}
      >
        <span
          className={`mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full ${
            isRemoved ? "bg-rose-400/80" : isAdded ? "bg-emerald-400" : "bg-slate-500/70"
          }`}
        />
        <div className="min-w-0 flex-1">
          <span className={`break-words ${isRemoved ? "line-through decoration-rose-400/70" : ""}`}>
            {line.text}
          </span>
          {line.detail && (
            <span className="ml-2 inline-block rounded bg-white/10 px-1.5 py-px text-[10px] font-medium text-amber-200">
              {line.detail}
            </span>
          )}
          {line.note && (
            <div className="mt-0.5 text-[11.5px] text-slate-400/90 whitespace-pre-wrap">{line.note}</div>
          )}
        </div>
      </div>
    </div>
  );
});

const EMPTY_STAGED_QUEUE: readonly V2StagedChange[] = [];

const OutlineDiffAwareCanvas: React.FC<{
  readonly ai?: V2AiWorkspace;
  readonly path: string;
  readonly doc: OutlineFilePayload;
  readonly editorStore: OutlineEditorStore;
  readonly host: OutlineHost;
  readonly onUpdateRootTitle: (next: string) => void;
}> = React.memo(({ ai, path, doc, editorStore, host, onUpdateRootTitle }) => {
  const subscribeQueue = useCallback(
    (onStoreChange: () => void) => (ai ? ai.store.subscribe(onStoreChange) : () => {}),
    [ai]
  );
  const getQueueSnapshot = useCallback(
    () => (ai ? ai.store.getState().queue : EMPTY_STAGED_QUEUE),
    [ai]
  );
  const queue = useSyncExternalStore(subscribeQueue, getQueueSnapshot, getQueueSnapshot);

  const pendingChange = useMemo(
    () =>
      queue.find(
        (c): c is Extract<V2StagedChange, { targetKind: "outline-patch" }> =>
          c.targetKind === "outline-patch" && c.path === path
      ) ?? null,
    [queue, path]
  );

  // diffId 기준으로 모드/에러를 격리하여 새 outline-patch 유입 시 자동으로 Unified Diff 로 전환한다
  const [modeOverride, setModeOverride] = useState<{
    readonly diffId: string;
    readonly mode: "diff" | "edit";
  } | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const [errorState, setErrorState] = useState<{
    readonly diffId: string;
    readonly message: string;
  } | null>(null);

  const activeDiffId = pendingChange?.diffId ?? null;
  const viewMode: "diff" | "edit" =
    activeDiffId && modeOverride?.diffId === activeDiffId ? modeOverride.mode : "diff";
  const applyError =
    activeDiffId && errorState?.diffId === activeDiffId ? errorState.message : null;

  const setViewMode = useCallback(
    (mode: "diff" | "edit") => {
      if (!activeDiffId) return;
      setModeOverride({ diffId: activeDiffId, mode });
    },
    [activeDiffId]
  );

  const diff = useMemo(() => {
    if (!pendingChange) return null;
    return buildOutlineUnifiedDiff(
      doc.rootNodes,
      pendingChange.payload.requests as unknown as TreePatchRequest[]
    );
  }, [pendingChange, doc.rootNodes]);

  const stale = Boolean(ai && pendingChange && ai.isStale(pendingChange));

  const hasBoundVDoc = Boolean(
    pendingChange?.payload.compiledDocPath ||
      (doc.docBindings && Object.keys(doc.docBindings).length > 0)
  );
  const canApprove = Boolean(ai && pendingChange && diff && diff.failedOps.length === 0);

  const handleApprove = useCallback(
    (recompileBoundVDocs = false) => {
      if (!ai || !pendingChange || !canApprove) return;
      const res = ai.approve([pendingChange.diffId], { recompileBoundVDocs });
      if (res.failed.length > 0) {
        setErrorState({
          diffId: pendingChange.diffId,
          message: res.failed.map((f) => f.why).join(" · "),
        });
      } else {
        setErrorState(null);
      }
    },
    [ai, pendingChange, canApprove]
  );

  const handleReject = useCallback(() => {
    if (!ai || !pendingChange) return;
    setErrorState(null);
    ai.reject([pendingChange.diffId]);
  }, [ai, pendingChange]);

  // agy-ide 동일 단축키: Alt+Enter 승인 / Alt+Shift+Enter 거절
  useEffect(() => {
    if (!pendingChange || viewMode !== "diff") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== "Enter") return;
      e.preventDefault();
      if (e.shiftKey) handleReject();
      else handleApprove(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingChange, viewMode, handleApprove, handleReject]);

  const visibleLines = useMemo(() => {
    if (!diff) return [];
    if (!changesOnly) return diff.lines;
    return diff.lines.filter((l) => l.kind !== "context");
  }, [diff, changesOnly]);

  const showUnifiedDiff = Boolean(pendingChange && diff && viewMode === "diff");

  return (
    <div className="mx-auto w-full max-w-3xl">
      {pendingChange && diff && (
        <div
          data-testid="outline-diff-review-bar"
          className="mb-4 rounded-lg border border-amber-500/40 bg-[#25262b] px-3 py-2 text-[11.5px] text-slate-200 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-200">
                <Sparkles className="h-3 w-3" />
                AI Unified Diff
              </span>
              <span className="truncate font-medium text-slate-100" title={pendingChange.title}>
                {pendingChange.title.replace(/^\[(AI Composer|Outline AI)\]\s*/, "")}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-[10.5px]">
                {diff.stats.added > 0 && (
                  <span className="rounded bg-emerald-500/15 px-1 text-emerald-300">+{diff.stats.added}</span>
                )}
                {diff.stats.modified > 0 && (
                  <span className="rounded bg-amber-500/15 px-1 text-amber-300">~{diff.stats.modified}</span>
                )}
                {diff.stats.deleted > 0 && (
                  <span className="rounded bg-rose-500/15 px-1 text-rose-300">−{diff.stats.deleted}</span>
                )}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="inline-flex overflow-hidden rounded border border-white/15 bg-black/20 text-[10.5px]">
                <button
                  type="button"
                  data-testid="outline-diff-mode-diff"
                  onClick={() => setViewMode("diff")}
                  className={`px-2 py-0.5 ${viewMode === "diff" ? "bg-violet-500/30 font-semibold text-violet-100" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Unified Diff
                </button>
                <button
                  type="button"
                  data-testid="outline-diff-mode-edit"
                  onClick={() => setViewMode("edit")}
                  className={`px-2 py-0.5 ${viewMode === "edit" ? "bg-violet-500/30 font-semibold text-violet-100" : "text-slate-400 hover:text-slate-200"}`}
                >
                  원본 편집
                </button>
              </div>
              {viewMode === "diff" && (
                <button
                  type="button"
                  data-testid="outline-diff-filter-toggle"
                  onClick={() => setChangesOnly((v) => !v)}
                  className={`rounded border px-2 py-0.5 text-[10.5px] ${
                    changesOnly
                      ? "border-sky-400/50 bg-sky-500/20 text-sky-200"
                      : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {changesOnly ? "변경만" : "전체 트리"}
                </button>
              )}
              <button
                type="button"
                data-testid="outline-diff-approve"
                disabled={!canApprove}
                onClick={() => handleApprove(false)}
                title="이 변경안을 아웃라인에 반영 (Alt+Enter)"
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-3 w-3" />
                승인
              </button>
              {hasBoundVDoc && (
                <button
                  type="button"
                  data-testid="outline-diff-approve-recompile"
                  disabled={!canApprove}
                  onClick={() => handleApprove(true)}
                  title="아웃라인 승인 후 연결된 .vdoc 도 즉시 재컴파일"
                  className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  승인+.vdoc
                </button>
              )}
              <button
                type="button"
                data-testid="outline-diff-reject"
                onClick={handleReject}
                title="변경안 거절 (Alt+Shift+Enter)"
                className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-rose-200"
              >
                <X className="h-3 w-3" />
                거절
              </button>
            </div>
          </div>

          {diff.failedOps.length > 0 && (
            <div
              data-testid="outline-diff-failed-warning"
              className="mt-2 flex items-start gap-1.5 rounded border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 text-[11px] text-rose-200"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>
                패치 연산 {diff.failedOps.length}건이 현재 트리와 맞지 않아 부분 삭제 방지를 위해 승인을 차단했습니다 (
                {diff.failedOps.slice(0, 2).map((f) => `#${f.index + 1}: ${f.error}`).join(" · ")}). 거절 후 AI에게 다시 요청하세요.
              </span>
            </div>
          )}

          {stale && diff.failedOps.length === 0 && (
            <div className="mt-2 flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>제안 이후 아웃라인이 수정되었습니다. 아래 Diff 내용을 확인한 뒤 승인하세요.</span>
            </div>
          )}

          {applyError && (
            <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] text-rose-200">
              {applyError}
            </div>
          )}
        </div>
      )}

      {showUnifiedDiff ? (
        <div data-testid="outline-unified-diff">
          <h1 className="mb-4 text-[22px] font-bold tracking-tight text-[var(--obs-text-normal,#ececec)]">
            {doc.title}
          </h1>
          <div className="space-y-0.5 rounded-lg border border-white/10 bg-[#18191c] p-2.5 font-sans">
            {visibleLines.length === 0 ? (
              <p className="px-2 py-4 text-center text-[12px] text-slate-400">
                표시할 변경 줄이 없습니다.
              </p>
            ) : (
              visibleLines.map((line) => <OutlineDiffRow key={line.key} line={line} />)
            )}
          </div>
          <p className="mt-2 text-right text-[10.5px] text-slate-500">
            단축키: Alt+Enter 승인 · Alt+Shift+Enter 거절
          </p>
        </div>
      ) : (
        <OutlineEditorProvider
          store={editorStore}
          host={host}
          rootNodes={doc.rootNodes}
          defaultView={doc.defaultView}
        >
          <OutlineHeader
            rootTitle={doc.title}
            onUpdateRootTitle={onUpdateRootTitle}
            showViewToggle
            showBreadcrumb
          />
          <div className="mt-4">
            <OutlineBody />
          </div>
        </OutlineEditorProvider>
      )}
    </div>
  );
});

export interface OutlineTabEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
  readonly vdocUiBridge?: VDocUiBridgeStore;
  /** AI Composer 워크스페이스 — 대기 중인 `outline-patch` 를 인라인 Unified Diff 로 검토 · 승인한다. */
  readonly ai?: V2AiWorkspace;
  /** 붙인 파일(그림·PDF 등)을 워크벤치 탭으로 연다. */
  readonly openFile?: (path: string) => void;
  /** 일반 연결 문서를 워크벤치 탭으로 연다. */
  readonly openLink?: (path: string, mode?: BridgeOpenMode) => void;
  /** `.vdoc` 파트너 문서를 같은 그룹 탭의 페어 뷰 슬롯으로 연다. */
  readonly openInPairGroup?: (path: string) => void;
  /** 고른 불릿(여러 개)을 AI Composer 에 알린다. */
  readonly reportSelection?: (sel: EditorSelectionSnapshot | null) => void;
  /** 선택 불릿을 AI Composer 로 바로 디렉팅한다 (`nodeIds` = 지시를 던진 불릿 — 입력창을 누르면 화면 선택이 풀리므로 미리 잡아 둔 것). */
  readonly onAiDirect?: (prompt?: string, nodeIds?: readonly string[]) => void;
}

/** 고른 불릿 → 들여쓴 글 (하위 불릿 포함, 최대 글자 수). */
function outlineSelectionText(roots: readonly OutlineNode[], ids: readonly string[], max = 6000): { text: string; labels: string[] } {
  const byId = new Map<string, OutlineNode>();
  const walk = (nodes: readonly OutlineNode[]) => {
    for (const n of nodes) {
      byId.set(n.id, n);
      walk(n.children);
    }
  };
  walk(roots);
  const picked = new Set(ids);
  const lines: string[] = [];
  const labels: string[] = [];
  const emit = (n: OutlineNode, depth: number) => {
    lines.push(`${"  ".repeat(depth)}- ${n.text}`);
    if (n.note) lines.push(`${"  ".repeat(depth + 1)}${n.note}`);
    for (const c of n.children) emit(c, depth + 1);
  };
  for (const id of ids) {
    const n = byId.get(id);
    if (!n) continue;
    // 이미 고른 조상 밑에 있으면 조상이 함께 낸다
    let skip = false;
    for (const other of ids) {
      if (other !== id && picked.has(other) && containsNode(byId.get(other), id)) skip = true;
    }
    if (skip) continue;
    labels.push(n.text.slice(0, 40));
    emit(n, 0);
  }
  return { text: lines.join("\n").slice(0, max), labels };
}

function containsNode(root: OutlineNode | undefined, id: string): boolean {
  if (!root) return false;
  return root.children.some((c) => c.id === id || containsNode(c, id));
}

export const OutlineTabEditor: React.FC<OutlineTabEditorProps> = ({
  vault,
  path,
  vdocUiBridge,
  ai,
  openFile,
  openLink,
  openInPairGroup,
  reportSelection,
  onAiDirect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  /** 세션 표시 겹층이 다시 그려지게 컨테이너 요소를 상태로도 든다 */
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const attachContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    setContainerEl(el);
  }, []);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const fallbackTitle = basename(path).replace(/\.outline$/i, "") || "Untitled";
  /** 고른 불릿에 지시 던지기 (뒤에서 도는 세션) */
  const [directOpen, setDirectOpen] = useState(false);
  const [directText, setDirectText] = useState("");
  /** 지시를 던질 불릿 — AI Direct 를 누르는 순간(바깥 클릭으로 선택이 풀리기 전)의 선택 */
  const [directIds, setDirectIds] = useState<readonly string[]>([]);
  const pressedIdsRef = useRef<readonly string[]>([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [compiledPreview, setCompiledPreview] = useState<CompiledPreviewSnapshot | null>(null);
  const [lastSyncedSig, setLastSyncedSig] = useState<string | null>(null);
  const [compileFlash, setCompileFlash] = useState(false);
  const [selectedDocNodeId, setSelectedDocNodeId] = useState<string | null>(null);
  const [assetOverrideByNodeId, setAssetOverrideByNodeId] = useState<Record<string, string>>({});
  const [previewZoom, setPreviewZoom] = useState(82);
  const [vaultLinkRev, setVaultLinkRev] = useState(0);
  const [linkPopoverNodeId, setLinkPopoverNodeId] = useState<string | null>(null);
  const [vdocSearch, setVdocSearch] = useState("");

  useEffect(() => {
    return vault.subscribe((ev) => {
      if (
        ev.type === "vault-reset" ||
        ev.type === "rename" ||
        ev.type === "create" ||
        ev.type === "delete" ||
        (ev.type === "modify" && (ev.path.endsWith(".vdoc") || ev.path.endsWith(".vdoc.json")))
      ) {
        setVaultLinkRev((r) => r + 1);
      }
    });
  }, [vault]);

  const owningProjectPath = useMemo(() => findOwningProjectPath(path), [path]);
  const projectScopeLabel = formatProjectScopeLabel(owningProjectPath);

  const openVDocPartner = useCallback(
    (targetPath: string) => {
      if (openInPairGroup) {
        openInPairGroup(targetPath);
      } else if (openLink) {
        openLink(targetPath, "split-right");
      } else {
        openFile?.(targetPath);
      }
    },
    [openInPairGroup, openLink, openFile]
  );

  const session = useMemo(
    () => createOutlineFileSession(vault, path, fallbackTitle),
    [vault, path, fallbackTitle]
  );
  const doc = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);

  // 아웃라인 편집은 오직 `.outline` 파일만 저장한다.
  // `.vdoc` 컴파일·반영은 사용자가 [프리뷰] 또는 [.vdoc 동기화/생성]을 명시적으로 눌렀을 때만 실행한다.
  const editorStore = useMemo(
    () =>
      createOutlineEditorStore({
        getRoots: () => session.snapshot().rootNodes,
        commitRoots: (roots) => {
          session.write({
            ...session.snapshot(),
            rootNodes: roots,
            updatedAt: new Date().toISOString(),
          });
        },
        setDefaultView: (view) => {
          session.write({
            ...session.snapshot(),
            defaultView: view,
            updatedAt: new Date().toISOString(),
          });
        },
      }),
    [session]
  );

  const focusedNodeId = useStore(editorStore, (s) => s.focusedNodeId);
  const selectedNodeIds = useStore(editorStore, (s) => s.selectedNodeIds);

  // 고른 불릿(여러 개)을 AI Composer 에 알린다 — 캔버스 선택과 같은 통로 (text 첨부 후보)
  const reportSelectionRef = useRef(reportSelection);
  useEffect(() => {
    reportSelectionRef.current = reportSelection;
  }, [reportSelection]);
  const lastOutlineSelSig = useRef<string | null>(null);
  useEffect(() => {
    const report = reportSelectionRef.current;
    if (!report) return;
    const ids = selectedNodeIds ?? [];
    const sig = `${path}|${ids.join(",")}`;
    if (sig === lastOutlineSelSig.current) return;
    lastOutlineSelSig.current = sig;
    if (!ids.length) {
      report(null);
      return;
    }
    const { text, labels } = outlineSelectionText(session.snapshot().rootNodes, ids);
    report({
      resourceId: path,
      kind: "outline-nodes",
      summary: ids.length === 1 ? labels[0] ?? "불릿" : `불릿 ${ids.length}개 (${labels.slice(0, 3).join(", ")}${ids.length > 3 ? " …" : ""})`,
      text,
      nodeIds: ids,
    });
  }, [selectedNodeIds, path, session]);
  const activeRootId = useStore(editorStore, (s) => s.activeRootId);

  const [incomingHighlight, setIncomingHighlight] = useState<ResourceHighlightRequest | null>(null);

  useEffect(
    () =>
      subscribeOutlineReveal(path, (nodeId, options) =>
        revealNode(editorStore, session.snapshot().rootNodes, nodeId, containerRef.current, options)
      ),
    [path, editorStore, session]
  );

  useEffect(
    () =>
      subscribeResourceHighlight(path, (req) => {
        setIncomingHighlight(req);
        if (!req) return;
        const roots = session.snapshot().rootNodes;
        let hitNodeId: string | null = req.nodeId ?? null;
        if (!hitNodeId && req.quoteText?.trim()) {
          const needle = req.quoteText.trim().toLowerCase();
          const findByText = (nodes: readonly OutlineNode[]): string | null => {
            for (const n of nodes) {
              if (n.text.toLowerCase().includes(needle)) return n.id;
              const sub = findByText(n.children);
              if (sub) return sub;
            }
            return null;
          };
          hitNodeId = findByText(roots);
        }
        if (hitNodeId) {
          editorStore.getState().selectNodes([hitNodeId]);
          revealNode(editorStore, roots, hitNodeId, containerRef.current);
        }
      }),
    [path, editorStore, session]
  );

  // AI Staged `.outline` 승인 반영 시 열린 에디터 세션(`applyPatch` + Undo 스택)을 경유하게 등록한다 (덮어쓰기 경합 방지)
  useEffect(
    () =>
      registerLiveOutlineSession(path, {
        applyPatch: (requests, nodeEvidence) => {
          const outcome = editorStore.getState().applyPatch([...requests]);
          if (nodeEvidence && Object.keys(nodeEvidence).length > 0) {
            const cur = session.snapshot();
            session.write({
              ...cur,
              updatedAt: new Date().toISOString(),
              nodeEvidence: mergeOutlineNodeEvidence(cur.nodeEvidence, nodeEvidence),
            });
          }
          return outcome.every((r) => r.ok);
        },
        undo: () => {
          const st = editorStore.getState();
          if (typeof st.undo !== "function") return false;
          st.undo();
          return true;
        },
        selectNodes: (nodeIds, zoom) => {
          editorStore.getState().selectNodes([...nodeIds]);
          if (nodeIds[0]) {
            revealNode(editorStore, session.snapshot().rootNodes, nodeIds[0], containerRef.current, { zoom });
          }
        },
        getSnapshot: () => session.snapshot(),
        // 기준점 세션(완료 감지 · 지워진 불릿)이 트리 변화를 본다
        subscribe: (listener) => session.subscribe(listener),
      }),
    [path, editorStore, session]
  );

  // Scoped Ctrl/Cmd + Mouse Wheel zoom on the inline preview canvas (blocks browser zoom)
  useEffect(() => {
    if (!previewOpen) return;
    const el = previewScrollRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const absY = Math.abs(ev.deltaY);
      const step = absY < 40 ? Math.max(2, Math.round(absY * 0.4)) : 8;
      const delta = ev.deltaY < 0 ? step : -step;
      setPreviewZoom((prev) => Math.max(40, Math.min(200, prev + delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [previewOpen]);

  const getPortalRoot = useCallback(() => containerRef.current ?? document.body, []);
  const openAttachmentTarget = useCallback(
    (targetPath: string) => {
      if (openInPairGroup) {
        openInPairGroup(targetPath);
      } else if (openFile) {
        openFile(targetPath);
      } else {
        openLink?.(targetPath, "split-right");
      }
    },
    [openInPairGroup, openFile, openLink]
  );
  const files = useMemo(
    () =>
      createVaultOutlineFiles({
        vault,
        getOutlinePath: () => path,
        openFile: openAttachmentTarget,
      }),
    [vault, path, openAttachmentTarget]
  );

  const outlineEvidenceIndex = useMemo(() => {
    const resolveTarget = (rawTarget: string): string | undefined => {
      const trimmed = rawTarget.trim();
      if (!trimmed) return undefined;
      if (vault.exists(trimmed)) return trimmed;
      const needle = trimmed.toLowerCase();
      const hit = vault.listAll().find((n) => {
        if (n.kind !== "file") return false;
        const base = basename(n.path).toLowerCase();
        const noExt = base.replace(/\.[^.]+$/, "");
        return base === needle || noExt === needle || n.path.toLowerCase().endsWith(`/${needle}`);
      });
      return hit?.path;
    };
    return buildEvidenceBacklinkIndex(
      collectOutlineEvidenceEntries(doc.rootNodes, doc.nodeEvidence, resolveTarget)
    );
  }, [doc.rootNodes, doc.nodeEvidence, vault]);

  const host = useMemo<OutlineHost>(
    () => ({
      confirm: async (message) => window.confirm(message),
      copyNodeLink: async (nodeId) => {
        try {
          await navigator.clipboard?.writeText(`${path}#${nodeId}`);
        } catch {
          // Ignore clipboard errors in non-secure contexts
        }
      },
      // "내보내기 (텍스트 파일)": 아웃라인 옆에 실제 파일로 만든다 (클립보드로 몰래 복사하지 않는다).
      exportText: (fileName, text) => {
        try {
          const dot = fileName.lastIndexOf(".");
          const stemText = (dot > 0 ? fileName.slice(0, dot) : fileName)
            .replace(/[\\/:*?"<>|]/g, " ")
            .trim();
          const ext = dot > 0 ? fileName.slice(dot + 1) : "md";
          const target = vault.getUniquePath(dirname(path), stemText || "outline-export", ext);
          vault.createFile(target, text);
        } catch {
          void navigator.clipboard?.writeText(text);
        }
      },
      getPortalRoot,
      files,
      renderMarkdown: renderOutlineInlineMarkdown,
      // 1티어 태그(`<<doc:...>>`) 전용 Workflowy Note 사양 서브라인 + 불릿별 근거/인용 표현(Case 1~6)
      renderNodeSubline: (node) => {
        void vaultLinkRev;
        const evLocators = doc.nodeEvidence?.[node.id] ?? [];
        const evidenceNode =
          evLocators.length > 0 ? (
            <OutlineNodeEvidenceSubline
              nodeId={node.id}
              locators={evLocators}
              backlinkGroups={outlineEvidenceIndex.groups}
              citationNumberBySourceKey={outlineEvidenceIndex.citationNumberBySourceKey}
              onOpenSource={openAttachmentTarget}
            />
          ) : null;
        const parsed = parseOutlineDirective(node.text);
        if (parsed?.kind !== "doc") return evidenceNode;
        const status = inspectOutlineNodeVDocLink(vault, path, node.id, doc);
        let docSubline: React.ReactNode;
        if (status.kind === "linked") {
          docSubline = (
            <div
              onMouseDown={(ev) => ev.stopPropagation()}
              className="group/subline flex w-fit max-w-full items-center gap-2 rounded-r border-l-2 border-emerald-500/50 bg-emerald-500/[0.06] py-0.5 pr-1.5 pl-2.5 text-[11.5px] leading-[1.45] text-emerald-200/90 select-none transition-colors hover:border-emerald-400 hover:bg-emerald-500/[0.11]"
            >
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (status.healed && doc.docBindings?.[node.id]) {
                    resolveVDocForOutlineBinding(
                      vault,
                      path,
                      node.id,
                      doc.docBindings[node.id],
                      doc,
                      { heal: true }
                    );
                  }
                  openVDocPartner(status.vdocPath);
                }}
                title={`연결된 .vdoc 열기 (${status.vdocPath})`}
                className="flex min-w-0 items-center gap-1.5 text-left hover:text-emerald-100"
              >
                <Link2 className="h-3 w-3 shrink-0 text-emerald-400" />
                <span className="truncate font-medium">{basename(status.vdocPath)}</span>
              </button>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedDocNodeId(node.id);
                  setVdocSearch("");
                  setLinkPopoverNodeId((prev) => (prev === node.id ? null : node.id));
                }}
                title="연결 변경 또는 해제"
                className="shrink-0 rounded px-1.5 py-0 text-[10px] text-emerald-300/70 opacity-75 transition-opacity hover:bg-emerald-500/20 hover:text-emerald-100 group-hover/subline:opacity-100"
              >
                변경
              </button>
            </div>
          );
        } else if (status.kind === "out-of-scope") {
          docSubline = (
            <button
              type="button"
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                setSelectedDocNodeId(node.id);
                setVdocSearch("");
                setLinkPopoverNodeId(node.id);
              }}
              title={`프로젝트 경계 외부 파일: ${status.externalVDocPath} — 클릭해 프로젝트로 등록 또는 해제`}
              className="flex w-fit max-w-full items-center gap-1.5 rounded-r border-l-2 border-amber-400/70 bg-amber-500/10 py-0.5 pr-2 pl-2.5 text-[11.5px] leading-[1.45] text-amber-200 select-none hover:bg-amber-500/20"
            >
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
              <span className="truncate">
                프로젝트 외부 · {basename(status.externalVDocPath)}
              </span>
              <span className="shrink-0 text-[10px] text-amber-300/80">등록/해제</span>
            </button>
          );
        } else if (status.kind === "broken") {
          docSubline = (
            <button
              type="button"
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                setSelectedDocNodeId(node.id);
                setVdocSearch("");
                setLinkPopoverNodeId(node.id);
              }}
              title={`끊어진 .vdoc 경로: ${status.rawVDocUri}`}
              className="flex w-fit max-w-full items-center gap-1.5 rounded-r border-l-2 border-rose-400/70 bg-rose-500/10 py-0.5 pr-2 pl-2.5 text-[11.5px] leading-[1.45] text-rose-200 select-none hover:bg-rose-500/20"
            >
              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
              <span>연결 끊어짐 · 복구</span>
            </button>
          );
        } else {
          docSubline = (
            <button
              type="button"
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                setSelectedDocNodeId(node.id);
                setVdocSearch("");
                setLinkPopoverNodeId(node.id);
              }}
              title="같은 프로젝트의 .vdoc 연결 또는 새로 생성"
              className="flex w-fit max-w-full items-center gap-1.5 rounded-r border-l-2 border-slate-500/40 bg-white/[0.02] py-0.5 pr-2 pl-2.5 text-[11.5px] leading-[1.45] text-[var(--obs-text-faint,#888)] select-none transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/[0.08] hover:text-emerald-200"
            >
              <Link2 className="h-3 w-3 shrink-0" />
              <span>연결된 .vdoc 없음 · 클릭해 연결</span>
            </button>
          );
        }
        return evidenceNode ? (
          <div className="space-y-1">
            {docSubline}
            {evidenceNode}
          </div>
        ) : (
          docSubline
        );
      },
      openLink: (rawTarget: string) => {
        const trimmed = rawTarget.trim();
        if (!trimmed) return;
        if (trimmed.startsWith("resource-tag:")) {
          const rawTag = trimmed.slice("resource-tag:".length).trim();
          openResourceTagInPair(rawTag, {
            vault,
            sourcePath: path,
            openInPair: openAttachmentTarget,
          });
          return;
        }
        if (/^https?:\/\//i.test(trimmed)) {
          window.open(trimmed, "_blank", "noopener");
          return;
        }
        const vaultUriTarget = fromVaultUri(trimmed);
        if (vaultUriTarget && vault.exists(vaultUriTarget)) {
          openAttachmentTarget(vaultUriTarget);
          return;
        }
        if (vault.exists(trimmed)) {
          openAttachmentTarget(trimmed);
          return;
        }
        // Resolve Obsidian-style `[[NoteName]]` against vault files
        const needle = trimmed.toLowerCase();
        const match = vault.listAll().find((n) => {
          if (n.kind !== "file") return false;
          const base = basename(n.path).toLowerCase();
          const noExt = base.replace(/\.[^.]+$/, "");
          return base === needle || noExt === needle || n.path.toLowerCase().endsWith(`/${needle}`);
        });
        if (match) {
          openAttachmentTarget(match.path);
        }
      },
    }),
    [path, vault, getPortalRoot, files, openAttachmentTarget, doc, vaultLinkRev, openVDocPartner, outlineEvidenceIndex]
  );

  const handleUpdateTitle = (nextTitle: string) => {
    const current = session.snapshot();
    if (current.title === nextTitle) return;
    session.write({ ...current, title: nextTitle, updatedAt: new Date().toISOString() });
  };

  // Universal `<<...>>` directive scanning (1:N document-root first!)
  const syntaxRoots = doc.rootNodes as OutlineSyntaxNode[];
  const allDirectives = useMemo(() => scanOutlineDirectives(syntaxRoots), [syntaxRoots]);
  // 1:N 문서 단위 대상: 모든 `<<doc:...>>` + (`<<doc>>` 밖의 독립 `<<view:...>>` 만 허용, 하위 `<<view:section>>` 제외!)
  const primaryDocTargets = useMemo(
    () =>
      allDirectives.filter(
        (d) =>
          d.directive.kind === "doc" ||
          (d.directive.kind === "view" && d.parentDocNodeId === null)
      ),
    [allDirectives]
  );
  const outlineAssets = useMemo(() => extractOutlineAssets(syntaxRoots), [syntaxRoots]);
  const tableAssets = useMemo(
    () => Object.values(outlineAssets).filter((a) => a.targetViewTag === "table"),
    [outlineAssets]
  );

  const cursorAnchorId = focusedNodeId ?? activeRootId;
  const activeCtx = useMemo(
    () => resolveActiveDirectiveContext(syntaxRoots, cursorAnchorId),
    [syntaxRoots, cursorAnchorId]
  );

  // 커서가 `<<doc>>` 안의 하위 `<<view:section>>` 에 있어도 항상 감싸는 상위 `<<doc>>` 문서 루트로 해석한다.
  const cursorDocTarget = useMemo(() => {
    const raw = activeCtx.effectiveTarget;
    if (!raw) return null;
    if (raw.parentDocNodeId) {
      return primaryDocTargets.find((d) => d.nodeId === raw.parentDocNodeId) ?? null;
    }
    return primaryDocTargets.find((d) => d.nodeId === raw.nodeId) ?? null;
  }, [activeCtx.effectiveTarget, primaryDocTargets]);

  const manualEntry = selectedDocNodeId
    ? primaryDocTargets.find((d) => d.nodeId === selectedDocNodeId) ?? null
    : null;
  const effectiveTarget = cursorDocTarget ?? manualEntry ?? primaryDocTargets[0] ?? null;

  const effectiveAssetHint = effectiveTarget
    ? assetOverrideByNodeId[effectiveTarget.nodeId] ?? effectiveTarget.directive.assetHint
    : undefined;

  const activeLinkStatus = useMemo(() => {
    void vaultLinkRev;
    if (!effectiveTarget) return null;
    return inspectOutlineNodeVDocLink(vault, path, effectiveTarget.nodeId, doc);
  }, [doc, effectiveTarget, path, vault, vaultLinkRev]);

  const boundVDocPath = activeLinkStatus?.kind === "linked" ? activeLinkStatus.vdocPath : null;

  const popoverLinkStatus = useMemo(() => {
    void vaultLinkRev;
    if (!linkPopoverNodeId) return null;
    return inspectOutlineNodeVDocLink(vault, path, linkPopoverNodeId, doc);
  }, [doc, linkPopoverNodeId, path, vault, vaultLinkRev]);

  // Strict `.vproj` boundary: ONLY list `.vdoc` candidates inside the SAME project scope!
  const vdocCandidates = useMemo(() => {
    if (!linkPopoverNodeId) return [];
    void vaultLinkRev;
    const all = collectVDocCandidatesForOutline(vault, path, { includeExternal: false });
    const q = vdocSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.vdocPath.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
    );
  }, [linkPopoverNodeId, vaultLinkRev, vault, path, vdocSearch]);

  const currentSemanticSig = useMemo(
    () => outlineSemanticSignature(syntaxRoots),
    [syntaxRoots]
  );

  // Explicit on-demand preview compile (runs ONLY when user clicks [프리뷰] / [컴파일])
  const runPreviewCompile = useCallback(
    (targetId: string, assetHintOverride?: string) => {
      const currentPayload = session.snapshot();
      const result = compileOutlineTargetForPreview(vault, path, currentPayload, targetId, {
        assetHint: assetHintOverride,
      });
      const label = result.target
        ? `${result.target.directive.rawToken} ${result.target.directive.label}`.trim()
        : "프리뷰";
      setCompiledPreview({
        doc: result.doc,
        targetNodeId: targetId,
        targetLabel: label,
        signature: outlineSemanticSignature(currentPayload.rootNodes as OutlineSyntaxNode[]),
      });
    },
    [vault, path, session]
  );

  const handleTogglePreview = () => {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    if (effectiveTarget) {
      runPreviewCompile(effectiveTarget.nodeId, effectiveAssetHint);
    } else {
      setCompiledPreview(null);
    }
  };

  // Explicit on-demand `.vdoc` compile & sync (runs ONLY when user clicks [.vdoc 동기화] / [.vdoc 생성])
  const handleSyncOrCreateVDoc = () => {
    if (!effectiveTarget) return;
    const opener = openInPairGroup
      ? (p: string) => openInPairGroup(p)
      : openLink ?? (openFile ? (p: string) => openFile(p) : undefined);
    materializeVDocFromOutlineDirective(vault, path, effectiveTarget.nodeId, opener, {
      assetHint: effectiveAssetHint,
    });
    setLastSyncedSig(currentSemanticSig);
    setCompileFlash(true);
    setTimeout(() => setCompileFlash(false), 1500);
    if (previewOpen) {
      runPreviewCompile(effectiveTarget.nodeId, effectiveAssetHint);
    }
  };

  const previewDoc = compiledPreview?.doc ?? null;
  const previewIsStale = Boolean(
    previewOpen &&
    compiledPreview &&
    (compiledPreview.signature !== currentSemanticSig ||
      (effectiveTarget && compiledPreview.targetNodeId !== effectiveTarget.nodeId))
  );
  const vdocHasPendingChanges = Boolean(
    boundVDocPath && lastSyncedSig !== null && lastSyncedSig !== currentSemanticSig
  );

  const previewStylePack = useMemo(() => {
    if (!previewDoc) return null;
    const catalog = collectVaultStyleEntries(vault);
    return resolveActiveStyleEntry(previewDoc, vault, catalog)?.pack ?? null;
  }, [previewDoc, vault]);

  const previewView = previewDoc ? resolveDocumentView(previewDoc) : null;
  const previewSurface = previewDoc ? documentSurface(previewDoc) : null;

  const handlePreviewBlockClick = useCallback(
    (blockId: string) => {
      if (!previewDoc) return;
      for (const p of previewDoc.pages) {
        const blk = p.blocks.find((b) => b.blockId === blockId);
        if (blk?.sourceNodeId) {
          revealNode(editorStore, session.snapshot().rootNodes, blk.sourceNodeId, containerRef.current);
          return;
        }
      }
    },
    [previewDoc, editorStore, session]
  );

  const handleSelectDocTarget = (nodeId: string) => {
    if (!nodeId) return;
    setSelectedDocNodeId(nodeId);
    setLinkPopoverNodeId(nodeId);
    revealNode(editorStore, session.snapshot().rootNodes, nodeId, containerRef.current);
    if (previewOpen) {
      const targetDir = primaryDocTargets.find((d) => d.nodeId === nodeId);
      runPreviewCompile(nodeId, assetOverrideByNodeId[nodeId] ?? targetDir?.directive.assetHint);
    }
  };

  // Plain `.outline` (with 0 `<<doc>>` directives) -> 1-click promote to `.vdoc` in Pair Tab Group
  const handlePromotePlainOutlineToVDoc = useCallback(
    (profile: "a4" | "blog") => {
      const current = session.snapshot();
      const wrapperId = `doc_${Date.now().toString(36)}`;
      const fallbackTitle = basename(path).replace(/\.outline$/i, "") || "새 문서";
      const title = (current.title || fallbackTitle).trim() || fallbackTitle;
      const nonEmptyRoots = current.rootNodes.filter(
        (n) => n.text.trim().length > 0 || n.children.length > 0
      );
      const wrapperNode: OutlineNode = {
        id: wrapperId,
        text: `<<doc:${profile}>> ${title}`,
        children:
          nonEmptyRoots.length > 0
            ? nonEmptyRoots
            : [{ id: `${wrapperId}_c1`, text: "", children: [] }],
      };
      session.write({
        ...current,
        rootNodes: [wrapperNode],
      });
      const opener = openInPairGroup
        ? (p: string) => openInPairGroup(p)
        : openLink ?? (openFile ? (p: string) => openFile(p) : undefined);
      materializeVDocFromOutlineDirective(vault, path, wrapperId, opener);
      setSelectedDocNodeId(wrapperId);
      setCompileFlash(true);
      setTimeout(() => setCompileFlash(false), 1500);
    },
    [session, path, openInPairGroup, openLink, openFile, vault]
  );

  const showDirectiveStrip = primaryDocTargets.length > 0 || previewOpen;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
      {incomingHighlight && (
        <div
          data-testid="outline-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-semibold text-amber-200">
              🎯 아웃라인 하이라이트{incomingHighlight.nodeId ? ` · #${incomingHighlight.nodeId}` : ""}
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
      {/* Plain `.outline` (태그 없는 상태) 1-click `.vdoc` 승격 & AI 양식 추천 바 */}
      {!showDirectiveStrip && (
        <div
          data-testid="outline-plain-promote-strip"
          className="flex h-8 shrink-0 select-none items-center justify-between gap-2 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {owningProjectPath && (
              <span
                title={`프로젝트 경계: ${owningProjectPath}`}
                className="hidden shrink-0 items-center gap-1 rounded border border-violet-500/30 bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-medium text-violet-200 xl:inline-flex"
              >
                <FolderKanban className="h-2.5 w-2.5 text-violet-400" />
                <span className="max-w-[110px] truncate">{projectScopeLabel}</span>
              </span>
            )}
            <span className="truncate text-[10.5px] text-[var(--obs-text-faint,#8a8a8a)]">
              일반 아웃라인 · 태그 없이 바로 문서로 펼치거나 AI 양식을 추천받을 수 있습니다
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="outline-promote-a4"
              onClick={() => handlePromotePlainOutlineToVDoc("a4")}
              title="현재 불릿을 <<doc:a4>> 로 감싸고 페어 탭에 A4 .vdoc 문서를 즉시 생성합니다"
              className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
            >
              <FilePlus2 className="h-3 w-3 text-emerald-300" />
              <span>.vdoc 만들기 (A4)</span>
            </button>
            <button
              type="button"
              data-testid="outline-promote-blog"
              onClick={() => handlePromotePlainOutlineToVDoc("blog")}
              title="현재 불릿을 <<doc:blog>> 로 감싸고 페어 탭에 블로그 .vdoc 문서를 즉시 생성합니다"
              className="inline-flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/12 px-2 py-0.5 text-[10.5px] font-medium text-sky-200 transition-colors hover:bg-sky-500/22"
            >
              <span>블로그 .vdoc</span>
            </button>
            <button
              type="button"
              data-testid="outline-promote-ai-funnel"
              onClick={() =>
                requestOpenAguiAssetFunnel({
                  sourcePath: path,
                  selectedNodeIds,
                })
              }
              title="AI Composer 의 AG-UI 양식 추천 깔때기를 열어 현재 내용에 맞는 에셋을 고릅니다"
              className="inline-flex items-center gap-1 rounded border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10.5px] font-medium text-violet-200 transition-colors hover:bg-violet-500/25"
            >
              <Sparkles className="h-3 w-3 text-violet-300" />
              <span>AI 양식 추천</span>
            </button>
          </div>
        </div>
      )}
      {/* Top Explicit Compile & Unified 1:N Link Dropdown Strip */}
      {showDirectiveStrip && (
        <div className="flex h-8 shrink-0 select-none items-center justify-between gap-2 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
          <div className="flex min-w-0 items-center gap-1.5">
            {owningProjectPath && (
              <span
                title={`프로젝트 경계: ${owningProjectPath}`}
                className="hidden shrink-0 items-center gap-1 rounded border border-violet-500/30 bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-medium text-violet-200 xl:inline-flex"
              >
                <FolderKanban className="h-2.5 w-2.5 text-violet-400" />
                <span className="max-w-[110px] truncate">{projectScopeLabel}</span>
              </span>
            )}

            {/* Unified 1:N Link Dropdown (replaces separate directive select + pin + separate link chip!) */}
            {effectiveTarget && activeLinkStatus ? (
              <button
                type="button"
                onClick={() => {
                  setVdocSearch("");
                  setLinkPopoverNodeId((prev) =>
                    prev === effectiveTarget.nodeId ? null : effectiveTarget.nodeId
                  );
                }}
                title={
                  activeLinkStatus.kind === "linked"
                    ? `${effectiveTarget.directive.rawToken} → ${activeLinkStatus.vdocPath} (클릭해 1:N 문서 전환·연결 관리)`
                    : activeLinkStatus.kind === "out-of-scope"
                      ? `프로젝트 외부 파일: ${activeLinkStatus.externalVDocPath}`
                      : "클릭해 같은 프로젝트의 .vdoc 연결 관리"
                }
                className={`flex min-w-0 max-w-[300px] items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] transition-colors ${activeLinkStatus.kind === "linked"
                  ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20"
                  : activeLinkStatus.kind === "out-of-scope"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : activeLinkStatus.kind === "broken"
                      ? "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                      : "border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)] hover:border-emerald-500/40"
                  }`}
              >
                {activeLinkStatus.kind === "out-of-scope" || activeLinkStatus.kind === "broken" ? (
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                ) : (
                  <Link2 className="h-3 w-3 shrink-0 text-emerald-400" />
                )}
                <span className="truncate font-medium">
                  {activeLinkStatus.kind === "linked"
                    ? basename(activeLinkStatus.vdocPath)
                    : activeLinkStatus.kind === "out-of-scope"
                      ? `외부 · ${basename(activeLinkStatus.externalVDocPath)}`
                      : activeLinkStatus.kind === "broken"
                        ? "끊어짐 · 복구"
                        : `.vdoc 연결 (${effectiveTarget.directive.label || effectiveTarget.directive.target})`}
                </span>
                {primaryDocTargets.length > 1 && (
                  <span className="shrink-0 rounded bg-white/10 px-1 py-0 font-code text-[9.5px] text-white/80">
                    1:{primaryDocTargets.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
              </button>
            ) : (
              <span className="flex items-center gap-1 text-[10.5px] text-[var(--obs-text-faint,#888888)]">
                <Sparkles className="h-3 w-3 opacity-60" />
                <span>&lt;&lt;doc:blog&gt;&gt; 로 컴파일 문서 지정</span>
              </span>
            )}

            {effectiveTarget?.directive.kind === "view" &&
              effectiveTarget.directive.target === "table" &&
              tableAssets.length > 0 && (
                <select
                  aria-label="Table visual asset preset"
                  value={effectiveAssetHint ?? ""}
                  onChange={(ev) => {
                    const val = ev.target.value;
                    setAssetOverrideByNodeId((prev) => ({
                      ...prev,
                      [effectiveTarget.nodeId]: val,
                    }));
                    if (previewOpen) {
                      runPreviewCompile(effectiveTarget.nodeId, val || undefined);
                    }
                  }}
                  className="max-w-[160px] truncate rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-200 outline-none"
                >
                  <option value="">기본 표 스타일</option>
                  {tableAssets.map((a) => (
                    <option key={a.assetId} value={a.assetId}>
                      @{a.assetId} ({a.label})
                    </option>
                  ))}
                </select>
              )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {effectiveTarget && (
              <button
                type="button"
                onClick={handleSyncOrCreateVDoc}
                title={
                  boundVDocPath
                    ? `현재 아웃라인을 컴파일해 바인딩된 .vdoc 에 반영 (${boundVDocPath})`
                    : "이 지시어 블록을 컴파일해 새 .vdoc 파일 생성 및 그룹 페어 열기"
                }
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${boundVDocPath
                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  : "border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                  }`}
              >
                {boundVDocPath ? (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    <span>{compileFlash ? "컴파일됨 ✓" : ".outline → .vdoc 컴파일"}</span>
                    {vdocHasPendingChanges && !compileFlash && (
                      <span
                        title="마지막 컴파일 이후 변경사항 있음"
                        className="h-1.5 w-1.5 rounded-full bg-amber-400"
                      />
                    )}
                  </>
                ) : (
                  <>
                    <FilePlus2 className="h-3 w-3 text-sky-400" />
                    <span>.vdoc 생성</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleTogglePreview}
              title="현재 지시어를 컴파일해 인라인 프리뷰 열기/닫기"
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${previewOpen
                ? "border-[var(--obs-accent,#8a5cf5)] bg-[var(--obs-accent,#8a5cf5)]/25 text-[#e9d5ff]"
                : "border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                }`}
            >
              {previewOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              <span>프리뷰</span>
            </button>
          </div>
        </div>
      )}

      {/* Explicit .vdoc Link Manager Popover (scoped strictly to owning `.vproj`) */}
      {linkPopoverNodeId && popoverLinkStatus && (
        <div
          onClick={(ev) => ev.stopPropagation()}
          className="absolute top-9 left-3 z-40 w-[350px] rounded-md border border-[var(--obs-border,#3d3d3d)] bg-[var(--obs-bg-secondary,#242424)] p-2.5 text-[11.5px] text-[var(--obs-text-normal,#ececec)] shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-medium">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="truncate">.vdoc 연결 관리</span>
              <span className="shrink-0 rounded border border-violet-500/30 bg-violet-500/15 px-1.5 py-0 text-[9.5px] text-violet-200">
                {owningProjectPath ? `PROJ · ${projectScopeLabel}` : "단독 영역"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLinkPopoverNodeId(null)}
              className="rounded p-0.5 text-[var(--obs-text-muted,#9a9a9a)] hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 1:N Document Switcher inside the same `.outline` when multiple `<<doc:...>>` exist */}
          {primaryDocTargets.length > 1 && (
            <div className="mb-2 border-b border-white/5 pb-2">
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#808080)] uppercase">
                아웃라인 내 문서 매핑 (1:{primaryDocTargets.length})
              </div>
              <div className="max-h-28 space-y-0.5 overflow-y-auto">
                {primaryDocTargets.map((item) => {
                  const st = inspectOutlineNodeVDocLink(vault, path, item.nodeId, doc);
                  const isCurrent = item.nodeId === linkPopoverNodeId;
                  return (
                    <button
                      key={item.nodeId}
                      type="button"
                      onClick={() => handleSelectDocTarget(item.nodeId)}
                      className={`flex w-full items-center justify-between gap-1.5 rounded px-1.5 py-1 text-left text-[10.5px] transition-colors ${isCurrent
                        ? "bg-[var(--obs-accent,#8a5cf5)]/20 text-white"
                        : "text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/5 hover:text-white"
                        }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="mr-1 font-code text-[9.5px] text-violet-300">
                          {item.directive.rawToken}
                        </span>
                        {item.directive.label || "(제목 없음)"}
                      </span>
                      <span
                        className={`shrink-0 truncate max-w-[115px] rounded px-1 py-0 text-[9.5px] ${st.kind === "linked"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : st.kind === "out-of-scope"
                            ? "bg-amber-500/15 text-amber-200"
                            : "bg-white/5 text-[var(--obs-text-faint,#808080)]"
                          }`}
                      >
                        {st.kind === "linked"
                          ? basename(st.vdocPath)
                          : st.kind === "out-of-scope"
                            ? "외부"
                            : "미연결"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {popoverLinkStatus.kind === "linked" && (
            <div className="mb-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2">
              <div className="truncate text-[11px] font-medium text-emerald-200">
                {basename(popoverLinkStatus.vdocPath)}
              </div>
              <div className="mt-0.5 truncate font-code text-[9.5px] text-emerald-300/75">
                {popoverLinkStatus.vdocPath}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    openVDocPartner(popoverLinkStatus.vdocPath);
                    setLinkPopoverNodeId(null);
                  }}
                  className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10.5px] text-emerald-100 hover:bg-emerald-500/30"
                >
                  페어 탭 열기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlinkOutlineNodeBinding(vault, path, linkPopoverNodeId);
                    setLinkPopoverNodeId(null);
                  }}
                  className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] text-rose-300 hover:bg-rose-500/15"
                >
                  <Unlink className="h-3 w-3" />
                  <span>연결 해제</span>
                </button>
              </div>
            </div>
          )}

          {popoverLinkStatus.kind === "out-of-scope" && (
            <div className="mb-2 rounded border border-amber-500/35 bg-amber-500/10 p-2 text-[10.5px] text-amber-100">
              <div className="flex items-center gap-1 font-medium text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>프로젝트 경계 외부의 .vdoc 입니다</span>
              </div>
              <div className="mt-0.5 truncate font-code text-[9.5px] opacity-80">
                {popoverLinkStatus.externalVDocPath}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    importPartnerIntoProjectAndBind(
                      vault,
                      path,
                      popoverLinkStatus.externalVDocPath,
                      { rootNodeId: linkPopoverNodeId, openLink: openVDocPartner }
                    );
                    setLinkPopoverNodeId(null);
                  }}
                  className="flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/25 px-2 py-1 text-[10.5px] font-medium text-amber-100 hover:bg-amber-500/35"
                >
                  <FolderInput className="h-3 w-3" />
                  <span>이 프로젝트로 등록 (가져오기)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlinkOutlineNodeBinding(vault, path, linkPopoverNodeId);
                    setLinkPopoverNodeId(null);
                  }}
                  className="ml-auto rounded px-1.5 py-1 text-[10px] text-rose-300 hover:bg-rose-500/15"
                >
                  해제
                </button>
              </div>
            </div>
          )}

          {popoverLinkStatus.kind === "broken" && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[10.5px] text-rose-200">
              <span className="truncate">끊어짐: {popoverLinkStatus.rawVDocUri}</span>
              <button
                type="button"
                onClick={() => {
                  unlinkOutlineNodeBinding(vault, path, linkPopoverNodeId);
                  setLinkPopoverNodeId(null);
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
              value={vdocSearch}
              onChange={(ev) => setVdocSearch(ev.target.value)}
              placeholder="같은 프로젝트 .vdoc 검색..."
              className="w-full rounded border border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-primary,#1a1a1a)] py-1 pr-2 pl-6 text-[11px] outline-none focus:border-emerald-400"
            />
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
            <div className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--obs-text-faint,#808080)] uppercase">
              같은 경계 내 .vdoc ({vdocCandidates.length})
            </div>
            {vdocCandidates.length === 0 ? (
              <div className="rounded bg-black/20 px-2 py-2.5 text-center text-[10.5px] text-[var(--obs-text-faint,#777)]">
                같은 경계에 연결할 .vdoc 이 없습니다.
              </div>
            ) : (
              vdocCandidates.map((cand) => (
                <button
                  key={cand.vdocPath}
                  type="button"
                  onClick={() => {
                    bindVDocToExistingOutline(vault, cand.vdocPath, path, {
                      rootNodeId: linkPopoverNodeId,
                    });
                    openVDocPartner(cand.vdocPath);
                    setLinkPopoverNodeId(null);
                  }}
                  className="flex w-full items-center justify-between gap-1.5 rounded border border-transparent bg-[var(--obs-bg-primary,#1b1b1b)] p-1.5 text-left hover:border-emerald-500/35"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{basename(cand.vdocPath)}</div>
                    <div className="truncate font-code text-[9.5px] text-[var(--obs-text-faint,#808080)]">
                      {cand.folder || "/"}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
                    연결
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--obs-border-subtle,#323232)] pt-2">
            <span className="text-[10px] text-[var(--obs-text-faint,#808080)]">
              현재 경계 안에 새 문서 생성
            </span>
            <button
              type="button"
              onClick={() => {
                materializeVDocFromOutlineDirective(
                  vault,
                  path,
                  linkPopoverNodeId,
                  openVDocPartner,
                  { assetHint: effectiveAssetHint }
                );
                setLinkPopoverNodeId(null);
              }}
              className="flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/15 px-2 py-1 text-[10.5px] font-medium text-sky-200 hover:bg-sky-500/25"
            >
              <FilePlus2 className="h-3 w-3" />
              <span>새 .vdoc 생성</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace: Outline Editor + Explicit On-Demand Preview */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${previewOpen ? "border-r border-[var(--obs-border-subtle,#2d2d2d)]" : ""
            }`}
        >
          <div
            ref={attachContainer}
            className="obs-outliner-surface relative min-h-0 flex-1 overflow-auto bg-[var(--obs-bg-primary,#1e1e1e)] px-8 py-6"
          >
            <OutlineDiffAwareCanvas
              ai={ai}
              path={path}
              doc={doc}
              editorStore={editorStore}
              host={host}
              onUpdateRootTitle={handleUpdateTitle}
            />
            {outlineEvidenceIndex.groups.length > 0 && (
              <div className="mx-auto w-full max-w-3xl">
                <OutlineEvidenceLegendPanel
                  groups={outlineEvidenceIndex.groups}
                  onOpenSource={openAttachmentTarget}
                />
              </div>
            )}
            {ai && <AnchorChips ai={ai} surface="outline" path={path} container={containerEl} selector={outlineNodeSelector} />}
            {directOpen && directIds.length > 0 && (
              <AnchorDraft surface="outline" path={path} itemIds={directIds} container={containerEl} selector={outlineNodeSelector} />
            )}
          </div>

          {onAiDirect && (
            <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-[#202124] px-3 py-1.5 text-[11px] text-slate-300">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-slate-400">
                  {selectedNodeIds.length > 0
                    ? `선택 불릿 ${selectedNodeIds.length}개`
                    : doc.nodeEvidence && Object.keys(doc.nodeEvidence).length > 0
                      ? `근거 연결 노드 ${Object.keys(doc.nodeEvidence).length}개`
                      : "불릿을 선택하거나 AI 에 구조 작업을 요청하세요"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="outline-quick-asset-funnel"
                  onMouseDown={() => {
                    pressedIdsRef.current = editorStore.getState().selectedNodeIds;
                  }}
                  onClick={() => {
                    const ids = pressedIdsRef.current.length ? pressedIdsRef.current : selectedNodeIds;
                    pressedIdsRef.current = [];
                    requestOpenAguiAssetFunnel({
                      sourcePath: path,
                      selectedNodeIds: ids,
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200 hover:bg-emerald-500/22"
                  title="현재 불릿 내용에 맞는 에셋을 AG-UI 2-클릭 깔때기로 추천받습니다"
                >
                  <Sparkles className="h-3 w-3 text-emerald-300" />
                  <span>에셋 추천</span>
                </button>
                <button
                  type="button"
                  data-testid="outline-quick-structure"
                  onMouseDown={() => {
                    pressedIdsRef.current = editorStore.getState().selectedNodeIds;
                  }}
                  onClick={() => {
                    const ids = pressedIdsRef.current.length ? pressedIdsRef.current : selectedNodeIds;
                    pressedIdsRef.current = [];
                    const prompt =
                      "현재 아웃라인 내용을 분석해 가장 알맞은 <<doc>> / <<view>> 구조 태그를 입히고 문단 계층을 깔끔하게 정돈해줘.";
                    if (ids.length > 0) onAiDirect(prompt, ids);
                    else onAiDirect(prompt);
                  }}
                  className="hidden items-center gap-1 rounded border border-sky-500/35 bg-sky-500/12 px-2 py-0.5 text-[10.5px] font-medium text-sky-200 hover:bg-sky-500/22 sm:inline-flex"
                  title="AI 에게 현재 아웃라인의 문서 구조화(<<doc>>/<<view>> 태그 부착)를 바로 요청합니다"
                >
                  <Wand2 className="h-3 w-3 text-sky-300" />
                  <span>구조화</span>
                </button>
                <button
                  type="button"
                  data-testid="outline-quick-resource"
                  onMouseDown={() => {
                    pressedIdsRef.current = editorStore.getState().selectedNodeIds;
                  }}
                  onClick={() => {
                    const ids = pressedIdsRef.current.length ? pressedIdsRef.current : selectedNodeIds;
                    pressedIdsRef.current = [];
                    const prompt =
                      "선택한(또는 전체) 불릿의 주장·수치에 맞는 볼트 리소스(PDF·CSV·MD)를 찾아 <<resource: 대상 위치 | 핵심 근거 발췌>> 하위 불릿으로 붙여줘.";
                    if (ids.length > 0) onAiDirect(prompt, ids);
                    else onAiDirect(prompt);
                  }}
                  className="hidden items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/12 px-2 py-0.5 text-[10.5px] font-medium text-cyan-200 hover:bg-cyan-500/22 md:inline-flex"
                  title="AI 에게 볼트 리소스를 검색해 <<resource:...>> 근거 링크를 붙이도록 요청합니다"
                >
                  <Paperclip className="h-3 w-3 text-cyan-300" />
                  <span>근거 붙이기</span>
                </button>
                <button
                  type="button"
                  data-testid="outline-ai-direct"
                  onMouseDown={() => {
                    // 아웃라이너는 트리 밖을 누르면(창 mousedown) 선택을 푼다 — 그 전에 잡아 둔다
                    pressedIdsRef.current = editorStore.getState().selectedNodeIds;
                  }}
                  onClick={() => {
                    // 불릿을 골랐으면 그 자리에서 지시를 던진다 (뒤에서 도는 세션). 안 골랐으면 예전처럼 Composer 로
                    const ids = pressedIdsRef.current.length ? pressedIdsRef.current : selectedNodeIds;
                    pressedIdsRef.current = [];
                    if (directOpen) setDirectOpen(false);
                    else if (ids.length > 0) {
                      setDirectIds([...ids]);
                      setDirectOpen(true);
                    } else onAiDirect();
                  }}
                  className="inline-flex items-center gap-1 rounded border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-200 hover:bg-violet-500/25"
                  title={selectedNodeIds.length > 0 || directOpen ? "고른 불릿에 지시 던지기 — 뒤에서 실행되고 끝나면 알려 준다" : "AI Composer 에 구조 작업 요청"}
                >
                  <span>AI Direct</span>
                </button>
              </div>
            </div>
          )}
          {onAiDirect && directOpen && directIds.length > 0 && (
            <form
              data-testid="outline-direct-form"
              className="flex items-center gap-1.5 border-t border-white/10 bg-[#1b1c20] px-3 py-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const prompt = directText.trim();
                if (!prompt) return;
                onAiDirect(prompt, directIds);
                setDirectText("");
                setDirectOpen(false);
                setDirectIds([]);
              }}
            >
              <input
                autoFocus
                data-testid="outline-direct-input"
                value={directText}
                onChange={(e) => setDirectText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setDirectOpen(false);
                }}
                placeholder={`불릿 ${directIds.length}개에 지시 — 예: 근거 자료를 조사해 리스트업해줘`}
                className="min-w-0 flex-1 rounded border border-white/10 bg-[#25262c] px-2 py-1 text-[12px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400/60"
              />
              <button
                type="submit"
                data-testid="outline-direct-send"
                disabled={!directText.trim()}
                className="shrink-0 rounded bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
              >
                던지기
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectOpen(false);
                  onAiDirect();
                }}
                className="shrink-0 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10 hover:text-slate-200"
                title="고른 불릿을 메인 Composer 에 첨부만 한다"
              >
                Composer 에 첨부
              </button>
            </form>
          )}

          {vdocUiBridge && (
            <OutlineStagedAssetBar
              bridge={vdocUiBridge}
              outlinePath={path}
              vault={vault}
              boundVDocPaths={Object.values(doc.docBindings ?? {})
                .map((b) => fromVaultUri(b.vdocPath))
                .filter((p): p is string => Boolean(p))}
            />
          )}
        </div>

        {/* Inline On-Demand Compiled Preview Pane */}
        {previewOpen && (
          <div className="flex min-h-0 w-[46%] min-w-[320px] shrink-0 flex-col overflow-hidden bg-[#2b2d31]">
            <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#232529] px-3 text-[10.5px] text-slate-300">
              <span className="min-w-0 truncate font-medium">
                {compiledPreview?.targetLabel ??
                  (effectiveTarget
                    ? `${effectiveTarget.directive.rawToken} ${effectiveTarget.directive.label}`
                    : "프리뷰")}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {effectiveTarget && (
                  <button
                    type="button"
                    onClick={() => runPreviewCompile(effectiveTarget.nodeId, effectiveAssetHint)}
                    title="현재 아웃라인으로 프리뷰 다시 컴파일"
                    className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${previewIsStale
                      ? "border-amber-500/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                      : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/15"
                      }`}
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                    <span>{previewIsStale ? "재컴파일" : "컴파일"}</span>
                  </button>
                )}
                {([70, 82, 100] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPreviewZoom(z)}
                    className={`rounded px-1.5 py-0.5 font-code text-[10px] ${previewZoom === z
                      ? "bg-white/15 text-white"
                      : "text-slate-400 hover:text-white"
                      }`}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </div>

            <div ref={previewScrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-4">
              {previewDoc && previewView && previewSurface ? (
                <div
                  className="mx-auto flex flex-col items-center gap-4"
                  style={{
                    transform: previewZoom === 100 ? undefined : `scale(${previewZoom / 100})`,
                    transformOrigin: "top center",
                  }}
                >
                  <VDocStyleProvider
                    pack={previewStylePack}
                    mode={previewDoc.styleRef?.mode}
                    viewKey={previewView.id}
                  >
                    {previewDoc.pages.map((page) => (
                      <div key={page.pageId} className="text-slate-900">
                        <MemoVDocPageSheet
                          docTitle={previewDoc.title}
                          totalPages={previewDoc.pages.length}
                          seamless={previewSurface.kind === "scroll"}
                          page={page}
                          slots={previewDoc.slots}
                          backdata={previewDoc.backdata}
                          mode="Viewing"
                          selectedBlockId={null}
                          selectedSlotId={null}
                          composerOpenSlotId={null}
                          onSelectPage={NOOP}
                          onSelectBlock={handlePreviewBlockClick}
                          onSelectSlot={NOOP}
                          onToggleComposerForSlot={NOOP}
                          onOpenBackdataDrawer={NOOP}
                          onUpdateSlotContent={NOOP}
                          onMoveBlock={NOOP}
                          onDeleteBlock={NOOP}
                          onMoveBlockTo={NOOP}
                          onInsertBlock={NOOP}
                          onDuplicateBlock={NOOP}
                          onToggleBlockLock={NOOP}
                          onMoveBlockFrame={NOOP}
                          onResizeBlockFrame={NOOP}
                          onUpdateBlock={NOOP}
                          onTableCommand={NOOP}
                        />
                      </div>
                    ))}
                  </VDocStyleProvider>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[11.5px] text-slate-400">
                  <p className="leading-5">
                    일반 메모·브레인스토밍 영역입니다.
                    <br />
                    <code className="rounded bg-black/30 px-1 text-emerald-300">
                      &lt;&lt;doc:blog&gt;&gt;
                    </code>{" "}
                    또는{" "}
                    <code className="rounded bg-black/30 px-1 text-sky-300">
                      &lt;&lt;view:table&gt;&gt;
                    </code>{" "}
                    지시어를 선택하고 <strong>컴파일</strong>을 누르면 프리뷰가 렌더링됩니다.
                  </p>
                  {primaryDocTargets.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {primaryDocTargets.slice(0, 6).map((item) => (
                        <button
                          key={item.nodeId}
                          type="button"
                          onClick={() => {
                            setSelectedDocNodeId(item.nodeId);
                            revealNode(
                              editorStore,
                              session.snapshot().rootNodes,
                              item.nodeId,
                              containerRef.current
                            );
                            runPreviewCompile(
                              item.nodeId,
                              assetOverrideByNodeId[item.nodeId] ?? item.directive.assetHint
                            );
                          }}
                          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] text-slate-200 hover:bg-white/15"
                        >
                          {item.directive.rawToken} {item.directive.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
