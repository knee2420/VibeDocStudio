import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
import { basename, dirname, type VaultPort } from "@vibe/vault-core";

import { parseOutlineJson, type OutlineFilePayload } from "../model/outlineCodec";
import { createVaultOutlineFiles } from "../model/outlineFileHost";
import { subscribeOutlineReveal } from "../model/outlineRevealBus";

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

/** 구조 패널에서 고른 불릿을 화면에 보여 준다 (접힌 조상 안이면 부모로 줌인). */
function revealNode(
  store: OutlineEditorStore,
  roots: OutlineNode[],
  nodeId: string,
  container: HTMLElement | null
): void {
  const chain = getPath(roots, nodeId);
  const node = chain[chain.length - 1];
  if (!node) return;
  const ancestors = chain.slice(0, -1);
  const state = store.getState();
  const hiddenByFold = ancestors.some((a) => a.isFolded);
  const parent = ancestors[ancestors.length - 1];
  if (hiddenByFold && parent) {
    state.setZoom(parent.id);
  } else if (state.activeRootId && !ancestors.some((a) => a.id === state.activeRootId)) {
    state.setZoom(null);
  }
  store.getState().setFocus(node.id, node.text.length);
  requestAnimationFrame(() => {
    container
      ?.querySelector(`[data-row-id="${CSS.escape(node.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

export interface OutlineTabEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
  /** 붙인 파일(그림·PDF 등)을 워크벤치 탭으로 연다. */
  readonly openFile?: (path: string) => void;
}

export const OutlineTabEditor: React.FC<OutlineTabEditorProps> = ({ vault, path, openFile }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackTitle = basename(path).replace(/\.outline$/i, "") || "Untitled";

  const session = useMemo(
    () => createOutlineFileSession(vault, path, fallbackTitle),
    [vault, path, fallbackTitle]
  );
  const doc = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);

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

  useEffect(
    () =>
      subscribeOutlineReveal(path, (nodeId) =>
        revealNode(editorStore, session.snapshot().rootNodes, nodeId, containerRef.current)
      ),
    [path, editorStore, session]
  );

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
          const stem = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/[\\/:*?"<>|]/g, " ").trim();
          const ext = dot > 0 ? fileName.slice(dot + 1) : "md";
          const target = vault.getUniquePath(dirname(path), stem || "outline-export", ext);
          vault.createFile(target, text);
        } catch {
          void navigator.clipboard?.writeText(text);
        }
      },
      getPortalRoot,
      // 불릿에 그림·PDF 를 붙이고 보여 주고 연다 (끌어다 놓기 · 붙여넣기 · 메뉴).
      files,
    }),
    [path, vault, getPortalRoot, files]
  );

  const handleUpdateTitle = (nextTitle: string) => {
    const current = session.snapshot();
    if (current.title === nextTitle) return;
    session.write({ ...current, title: nextTitle, updatedAt: new Date().toISOString() });
  };

  return (
    <div
      ref={containerRef}
      className="obs-outliner-surface flex h-full w-full flex-col overflow-auto bg-[var(--obs-bg-primary,#1e1e1e)] px-8 py-6"
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
  );
};
