import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Blocks, BookOpen, Crosshair, ExternalLink, Loader2, MapPin, Sparkles, X } from "lucide-react";
import {
  parseRefJson,
  serializeRefJson,
  type RefDocument,
} from "@vibe/ref-canvas/core";
import type { VDocAssetKind } from "@vibe/vdoc-schema";
import { RefCanvasWorkbench } from "@vibe/ref-canvas/ui";
import { dirname } from "@vibe/vault-core";
import type { EditorHostContext, EditorOutlineHostContext } from "@vibe/workspace-layout/core";

import { parseAssetFromRefViaAi } from "@vibe/ai-vault";
import { saveAssetToVault, toVaultUri } from "@vibe/vault-formats";
import type { IdeEditorEnv } from "../model/editorAdapters";
import { importLocalFileAsRef, importWebUrlAsRef } from "../model/refClient";
import {
  buildTextFragmentUrl,
  clearResourceHighlight,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";

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

  const [extractKind, setExtractKind] = useState<VDocAssetKind>("a4-page");
  const [extractingAsset, setExtractingAsset] = useState(false);
  const [incomingHighlight, setIncomingHighlight] = useState<ResourceHighlightRequest | null>(null);

  useEffect(
    () => subscribeResourceHighlight(host.path, (req) => setIncomingHighlight(req)),
    [host.path]
  );

  const activeWebUrl = incomingHighlight?.sourceUrl || doc.source.sourceUrl || doc.article?.url;
  const textFragmentHref = activeWebUrl
    ? buildTextFragmentUrl(activeWebUrl, incomingHighlight?.quoteText)
    : null;

  const handleExtractAssetFromRef = useCallback(async () => {
    if (extractingAsset) return;
    setExtractingAsset(true);
    try {
      const blockSummaries = doc.blocks
        .map((b) => {
          const text = (b.text ?? "").trim();
          const kind = b.kind ?? "";
          return kind && text ? `[${kind}] ${text}` : text || kind;
        })
        .filter(Boolean)
        .slice(0, 24);
      const firstFrameUrl = doc.frames[0]?.assetUrl;
      const { asset } = await parseAssetFromRefViaAi({
        refTitle: doc.title,
        assetKind: extractKind,
        blockSummaries,
        sourceRef: toVaultUri(host.path),
        thumbnailUrl: typeof firstFrameUrl === "string" ? firstFrameUrl : undefined,
      });
      const savedPath = saveAssetToVault(vault, asset);
      host.openLink(savedPath, "split-right");
    } finally {
      setExtractingAsset(false);
    }
  }, [doc, extractKind, extractingAsset, host, vault]);

  const hasRefContent = doc.frames.length > 0 || doc.blocks.length > 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {incomingHighlight && (
        <div
          data-testid="ref-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="font-semibold text-amber-200">
              {activeWebUrl ? "🌐 웹 리소스 하이라이트" : "🗂 레퍼런스 하이라이트"}
              {incomingHighlight.blockId ? ` · #${incomingHighlight.blockId}` : ""}
            </span>
            {incomingHighlight.quoteText && (
              <span className="truncate text-amber-100/85">“{incomingHighlight.quoteText}”</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {textFragmentHref && (
              <a
                href={textFragmentHref}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[10.5px] font-medium text-amber-100 hover:bg-amber-500/35"
                title="브라우저에서 원본 URL을 열고 인용 문구로 점프 (Chrome Text Fragment)"
              >
                <ExternalLink className="h-3 w-3" />
                <span>원본에서 하이라이트 열기</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => clearResourceHighlight(host.path)}
              className="rounded p-0.5 text-amber-200/80 hover:bg-amber-500/20 hover:text-white"
              title="하이라이트 해제"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {hasRefContent && !isReadOnly && (
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#242424)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
          <div className="flex items-center gap-1.5">
            <Blocks className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-medium text-[var(--obs-text-normal,#ececec)]">
              레퍼런스 → 구조 에셋 추출
            </span>
            <span className="hidden text-[10px] text-[var(--obs-text-faint,#808080)] sm:inline">
              (이 레퍼런스의 레이아웃·표 뉘앙스를 .vasset 으로 등록)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={extractKind}
              onChange={(ev) => setExtractKind(ev.target.value as VDocAssetKind)}
              aria-label="추출할 에셋 종류"
              className="rounded border border-[var(--obs-border,#3a3a3a)] bg-[var(--obs-bg-primary,#1a1a1a)] px-1.5 py-0.5 text-[10.5px] text-emerald-300 outline-none"
            >
              <option value="a4-page">A4 페이지</option>
              <option value="blog-section">블로그 섹션</option>
              <option value="table">표 · 서식</option>
            </select>
            <button
              type="button"
              disabled={extractingAsset}
              onClick={() => void handleExtractAssetFromRef()}
              className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {extractingAsset ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              <span>구조 에셋으로 추출</span>
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <RefCanvasWorkbench
          doc={doc}
          readOnly={isReadOnly}
          activeHighlight={
            incomingHighlight
              ? {
                  id: incomingHighlight.id,
                  frameIndex: incomingHighlight.page,
                  blockId: incomingHighlight.blockId,
                  bbox: incomingHighlight.bbox,
                  quoteText: incomingHighlight.quoteText,
                }
              : null
          }
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
      </div>
    </div>
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
