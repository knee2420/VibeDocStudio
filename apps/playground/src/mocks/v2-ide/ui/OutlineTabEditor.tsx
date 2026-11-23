import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  EyeOff,
  FilePlus2,
  FolderInput,
  FolderKanban,
  Link2,
  RefreshCw,
  Search,
  Sparkles,
  Unlink,
  X,
} from "lucide-react";
import { getPath, type OutlineNode } from "@vibe/outliner";
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

import { parseOutlineJson, type OutlineFilePayload } from "../model/outlineCodec";
import { createVaultOutlineFiles } from "../model/outlineFileHost";
import { renderOutlineInlineMarkdown } from "../model/outlineLiveRenderer";
import {
  subscribeOutlineReveal,
  type OutlineRevealOptions,
} from "../model/outlineRevealBus";
import {
  bindVDocToExistingOutline,
  collectVDocCandidatesForOutline,
  compileOutlineTargetForPreview,
  formatProjectScopeLabel,
  importPartnerIntoProjectAndBind,
  inspectOutlineNodeVDocLink,
  materializeVDocFromOutlineDirective,
  outlineSemanticSignature,
  resolveVDocForOutlineBinding,
  unlinkOutlineNodeBinding,
  type BridgeOpenMode,
} from "../model/outlineVDocBridge";
import { fromVaultUri } from "../model/vdocCodec";
import {
  collectVaultStyleEntries,
  resolveActiveStyleEntry,
} from "../model/vdocInspectorModel";

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

const NOOP = () => {};

interface CompiledPreviewSnapshot {
  readonly doc: VDocDocument | null;
  readonly targetNodeId: string;
  readonly targetLabel: string;
  readonly signature: string;
}

export interface OutlineTabEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
  /** 붙인 파일(그림·PDF 등)을 워크벤치 탭으로 연다. */
  readonly openFile?: (path: string) => void;
  /** 일반 연결 문서를 워크벤치 탭으로 연다. */
  readonly openLink?: (path: string, mode?: BridgeOpenMode) => void;
  /** `.vdoc` 파트너 문서를 같은 그룹 탭의 페어 뷰 슬롯으로 연다. */
  readonly openInPairGroup?: (path: string) => void;
}

export const OutlineTabEditor: React.FC<OutlineTabEditorProps> = ({
  vault,
  path,
  openFile,
  openLink,
  openInPairGroup,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const fallbackTitle = basename(path).replace(/\.outline$/i, "") || "Untitled";

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
  const activeRootId = useStore(editorStore, (s) => s.activeRootId);

  useEffect(
    () =>
      subscribeOutlineReveal(path, (nodeId, options) =>
        revealNode(editorStore, session.snapshot().rootNodes, nodeId, containerRef.current, options)
      ),
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
  const files = useMemo(
    () =>
      createVaultOutlineFiles({
        vault,
        getOutlinePath: () => path,
        openFile,
      }),
    [vault, path, openFile]
  );

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
      // 1티어 태그(`<<doc:...>>`) 전용 Workflowy Note 사양 서브라인 (불릿 아래 `border-l-2` 1줄 부연 바)
      renderNodeSubline: (node) => {
        void vaultLinkRev;
        const parsed = parseOutlineDirective(node.text);
        if (parsed?.kind !== "doc") return null;
        const status = inspectOutlineNodeVDocLink(vault, path, node.id, doc);
        if (status.kind === "linked") {
          return (
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
        }
        if (status.kind === "out-of-scope") {
          return (
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
        }
        if (status.kind === "broken") {
          return (
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
        }
        return (
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
      },
      openLink: (rawTarget: string) => {
        const trimmed = rawTarget.trim();
        if (!trimmed) return;
        if (/^https?:\/\//i.test(trimmed)) {
          window.open(trimmed, "_blank", "noopener");
          return;
        }
        const vaultUriTarget = fromVaultUri(trimmed);
        if (vaultUriTarget && vault.exists(vaultUriTarget)) {
          openLink?.(vaultUriTarget, "split-right");
          return;
        }
        if (vault.exists(trimmed)) {
          openLink?.(trimmed, "split-right");
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
          openLink?.(match.path, "split-right");
        }
      },
    }),
    [path, vault, getPortalRoot, files, openLink, doc, vaultLinkRev, openVDocPartner]
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

  const showDirectiveStrip = primaryDocTargets.length > 0 || previewOpen;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
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
                className={`flex min-w-0 max-w-[300px] items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] transition-colors ${
                  activeLinkStatus.kind === "linked"
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
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                  boundVDocPath
                    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                    : "border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
                }`}
              >
                {boundVDocPath ? (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    <span>{compileFlash ? "컴파일됨 ✓" : ".vdoc 컴파일 →"}</span>
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
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                previewOpen
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
                      className={`flex w-full items-center justify-between gap-1.5 rounded px-1.5 py-1 text-left text-[10.5px] transition-colors ${
                        isCurrent
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
                        className={`shrink-0 truncate max-w-[115px] rounded px-1 py-0 text-[9.5px] ${
                          st.kind === "linked"
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
          ref={containerRef}
          className={`obs-outliner-surface min-h-0 flex-1 overflow-auto bg-[var(--obs-bg-primary,#1e1e1e)] px-8 py-6 ${
            previewOpen ? "border-r border-[var(--obs-border-subtle,#2d2d2d)]" : ""
          }`}
        >
          <div className="mx-auto w-full max-w-3xl">
            <OutlineEditorProvider
              store={editorStore}
              host={host}
              rootNodes={doc.rootNodes}
              defaultView={doc.defaultView}
            >
              <OutlineHeader
                rootTitle={doc.title}
                onUpdateRootTitle={handleUpdateTitle}
                showViewToggle
                showBreadcrumb
              />
              <div className="mt-4">
                <OutlineBody />
              </div>
            </OutlineEditorProvider>
          </div>
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
                    className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      previewIsStale
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
                    className={`rounded px-1.5 py-0.5 font-code text-[10px] ${
                      previewZoom === z
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
