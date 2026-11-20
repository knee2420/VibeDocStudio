import React, { useEffect, useMemo, useRef, useState } from "react";
import type { OutlineNode, ViewMode } from "@vibe/outliner";
import {
  OutlineBoard,
  OutlineEditorProvider,
  OutlineHeader,
  OutlineTree,
  createOutlineEditorStore,
  type OutlineHost,
} from "@vibe/outliner/editor";
import type { VaultPort } from "@vibe/vault-core";

interface OutlineFilePayload {
  version: number;
  id: string;
  title: string;
  defaultView: ViewMode;
  createdAt?: string;
  updatedAt?: string;
  rootNodes: OutlineNode[];
}

function parseOutlineJson(raw: string, fallbackTitle: string): OutlineFilePayload {
  try {
    const parsed = JSON.parse(raw) as Partial<OutlineFilePayload>;
    if (Array.isArray(parsed.rootNodes)) {
      return {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        id: typeof parsed.id === "string" ? parsed.id : `outline-${Date.now()}`,
        title: typeof parsed.title === "string" ? parsed.title : fallbackTitle,
        defaultView: parsed.defaultView === "board" ? "board" : "bullets",
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        rootNodes: parsed.rootNodes,
      };
    }
  } catch {
    // Fallback to single-bullet outline if file is empty or malformed
  }
  return {
    version: 1,
    id: `outline-${Date.now()}`,
    title: fallbackTitle,
    defaultView: "bullets",
    rootNodes: [
      {
        id: "node-1",
        text: raw.trim() || "새 아웃라인 항목",
        isFolded: false,
        children: [],
      },
    ],
  };
}

function readOutlineFromVault(
  vault: VaultPort,
  path: string,
  fallbackTitle: string
): OutlineFilePayload {
  try {
    if (vault.exists(path)) {
      return parseOutlineJson(vault.read(path), fallbackTitle);
    }
  } catch {
    // Ignore transient read error
  }
  return parseOutlineJson("", fallbackTitle);
}

export interface OutlineTabEditorProps {
  readonly vault: VaultPort;
  readonly path: string;
}

export const OutlineTabEditor: React.FC<OutlineTabEditorProps> = ({ vault, path }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackTitle = path.split("/").pop()?.replace(/\.outline$/i, "") ?? "Untitled";

  const [doc, setDoc] = useState<OutlineFilePayload>(() =>
    readOutlineFromVault(vault, path, fallbackTitle)
  );

  // Sync when path changes or same file is edited in another split pane
  useEffect(() => {
    const reload = () => {
      setDoc(readOutlineFromVault(vault, path, fallbackTitle));
    };
    reload();
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === path) || ev.type === "vault-reset") {
        reload();
      }
    });
  }, [vault, path, fallbackTitle]);

  const editorStore = useMemo(() => {
    return createOutlineEditorStore({
      getRoots: () => readOutlineFromVault(vault, path, fallbackTitle).rootNodes,
      commitRoots: (roots) => {
        const current = readOutlineFromVault(vault, path, fallbackTitle);
        const next: OutlineFilePayload = {
          ...current,
          rootNodes: roots,
          updatedAt: new Date().toISOString(),
        };
        vault.write(path, JSON.stringify(next, null, 2));
      },
      setDefaultView: (view) => {
        const current = readOutlineFromVault(vault, path, fallbackTitle);
        const next: OutlineFilePayload = {
          ...current,
          defaultView: view,
          updatedAt: new Date().toISOString(),
        };
        vault.write(path, JSON.stringify(next, null, 2));
      },
    });
  }, [vault, path, fallbackTitle]);

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
      exportText: (_fileName, text) => {
        try {
          void navigator.clipboard?.writeText(text);
        } catch {
          // Ignore
        }
      },
      getPortalRoot: () => containerRef.current ?? document.body,
    }),
    [path]
  );

  const handleUpdateTitle = (nextTitle: string) => {
    const current = readOutlineFromVault(vault, path, fallbackTitle);
    const next: OutlineFilePayload = {
      ...current,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
    };
    vault.write(path, JSON.stringify(next, null, 2));
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
            {doc.defaultView === "board" ? <OutlineBoard /> : <OutlineTree />}
          </div>
        </OutlineEditorProvider>
      </div>
    </div>
  );
};
