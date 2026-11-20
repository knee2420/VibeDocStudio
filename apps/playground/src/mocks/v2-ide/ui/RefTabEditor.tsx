import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, MapPin } from "lucide-react";
import {
  parseRefJson,
  serializeRefJson,
  type RefDocument,
} from "@vibe/ref-canvas/core";
import { RefCanvasWorkbench } from "@vibe/ref-canvas/ui";
import { dirname } from "@vibe/vault-core";
import type { EditorHostContext, EditorOutlineHostContext } from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import { importLocalFileAsRef, importWebUrlAsRef } from "../model/refClient";

/**
 * First-class `.ref` Tab Editor — bridges VaultPort <-> `@vibe/ref-canvas`'s `RefCanvasWorkbench`.
 */
export const RefTabEditor: React.FC<{
  readonly host: EditorHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [vaultTick, setVaultTick] = useState(0);

  useEffect(() => {
    return vault.subscribe((ev) => {
      if (
        (ev.type === "modify" && ev.path === host.path) ||
        ev.type === "vault-reset"
      ) {
        setVaultTick((t) => t + 1);
      }
    });
  }, [vault, host.path]);

  const doc: RefDocument = useMemo(() => {
    void vaultTick;
    if (!vault.exists(host.path)) {
      return parseRefJson("", host.path);
    }
    const stemTitle = host.path.split("/").pop()?.replace(/\.ref$/i, "") || "Reference";
    return parseRefJson(vault.read(host.path), stemTitle);
  }, [vault, host.path, vaultTick]);

  const isReadOnly = vault.isReadOnly?.() ?? false;

  const resolveAssetUrl = useCallback(
    (uri: string): string | undefined => {
      if (!uri.startsWith("vault://")) return uri;
      const targetPath = uri.slice("vault://".length);
      if (vault.getBinaryUrl) {
        return vault.getBinaryUrl(targetPath);
      }
      return undefined;
    },
    [vault]
  );

  const handleChangeDoc = useCallback(
    (next: RefDocument) => {
      if (vault.isReadOnly?.()) return;
      vault.write(host.path, serializeRefJson(next));
      setVaultTick((t) => t + 1);
    },
    [vault, host.path]
  );

  const handleImportedIntoEmpty = useCallback(
    (next: RefDocument, fileName?: string) => {
      if (vault.isReadOnly?.()) return;
      // Keep who-chose-the-name across the content swap, then let the host name the file.
      vault.write(host.path, serializeRefJson({ ...next, nameSource: doc.nameSource }));
      setVaultTick((t) => t + 1);
      host.env.settleRefFileName?.(host.path, { fileName, wasEmpty: true });
    },
    [vault, host.path, host.env, doc.nameSource]
  );

  const handleAttachToAi = useCallback(
    (payload: {
      readonly anchor: string;
      readonly summary: string;
      readonly text: string;
      readonly frameIndex: number;
    }) => {
      host.reportSelection?.({
        resourceId: host.path,
        kind: "canvas-nodes",
        summary: `${payload.summary} (${payload.anchor})`,
        text: payload.text,
      });
    },
    [host]
  );

  const handleSelectionChange = useCallback(
    (
      sel: {
        readonly summary: string;
        readonly text: string;
        readonly frameIndex: number;
        readonly blockId?: string;
        readonly pinId?: string;
      } | null
    ) => {
      if (!host.reportSelection) return;
      if (!sel) {
        host.reportSelection(null);
        return;
      }
      host.reportSelection({
        resourceId: host.path,
        kind: "canvas-nodes",
        summary: sel.summary,
        text: sel.text,
      });
    },
    [host]
  );

  return (
    <RefCanvasWorkbench
      doc={doc}
      readOnly={isReadOnly}
      resolveAssetUrl={resolveAssetUrl}
      onChangeDoc={handleChangeDoc}
      onImportUrl={importWebUrlAsRef}
      onStartAsyncUrlImport={
        host.env.startAsyncUrlRefImport
          ? (url, title, fileName) =>
              host.env.startAsyncUrlRefImport?.({
                url,
                title,
                fileName,
                targetFolder: dirname(host.path),
                replacePath: host.path,
              })
          : undefined
      }
      onImportedIntoEmpty={handleImportedIntoEmpty}
      onImportFile={importLocalFileAsRef}
      onRequestImportDialog={() => host.env.openImportReferenceModal?.(host.path)}
      onAttachToAi={handleAttachToAi}
      onSelectionChange={handleSelectionChange}
    />
  );
};

/**
 * Left-Bottom Document Structure Panel for `.ref` files — displays Frames, Pins, and Active Layers.
 */
export const RefStructurePanel: React.FC<{
  readonly host: EditorOutlineHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return vault.subscribe((ev) => {
      if ((ev.type === "modify" && ev.path === host.path) || ev.type === "vault-reset") {
        setTick((t) => t + 1);
      }
    });
  }, [vault, host.path]);

  const doc = useMemo(() => {
    void tick;
    if (!vault.exists(host.path)) return null;
    if (vault.isLoaded && !vault.isLoaded(host.path)) return null;
    return parseRefJson(vault.read(host.path), host.path);
  }, [vault, host.path, tick]);

  if (!doc) {
    return (
      <div className="p-3 text-[11px] text-[var(--obs-text-faint,#666666)]">
        레퍼런스 구조 로딩 중...
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5 text-[11.5px]">
      <div className="flex items-center justify-between font-code text-[10px] text-[var(--obs-text-faint,#888)]">
        <span className="flex items-center gap-1 font-semibold uppercase">
          <BookOpen className="h-3 w-3 text-amber-400" />
          <span>{doc.source.originType}</span>
        </span>
        <span>{doc.frames.length} canvas frame{doc.frames.length > 1 ? "s" : ""}</span>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1 font-code text-[10px] font-semibold uppercase text-[var(--obs-text-faint,#888)]">
          <MapPin className="h-3 w-3 text-amber-400" />
          <span>선택 영역 ({doc.pins.length})</span>
        </div>
        {doc.pins.length === 0 ? (
          <div className="px-1.5 text-[10.5px] text-[var(--obs-text-faint,#666)]">
            선택된 영역 없음
          </div>
        ) : (
          <div className="space-y-1">
            {doc.pins.map((p) => (
              <div
                key={p.pinId}
                className="rounded bg-white/4 px-2 py-1 text-[11px]"
              >
                <div className="truncate font-medium text-amber-200">{p.label}</div>
                {p.note && (
                  <div className="truncate text-[10px] text-[var(--obs-text-muted,#b3b3b3)]">
                    {p.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
