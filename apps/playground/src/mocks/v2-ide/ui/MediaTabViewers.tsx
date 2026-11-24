import React, { useEffect, useState } from "react";
import { Crosshair, ExternalLink, FileImage, FileText, Maximize, X, ZoomIn, ZoomOut } from "lucide-react";
import { PdfDocumentViewer } from "@vibe/ref-canvas/ui";
import type { VaultPort } from "@vibe/vault-core";

import {
  clearResourceHighlight,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface MediaTabViewerProps {
  readonly vault: VaultPort;
  readonly path: string;
}

export const ImageTabViewer: React.FC<MediaTabViewerProps> = ({ vault, path }) => {
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [highlight, setHighlight] = useState<ResourceHighlightRequest | null>(null);
  const node = vault.getNode(path);
  const srcUrl = vault.getBinaryUrl ? vault.getBinaryUrl(path) : null;
  const sizeLabel = node?.kind === "file" ? formatBytes(node.size) : "";

  useEffect(() => subscribeResourceHighlight(path, (req) => setHighlight(req)), [path]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
      <div className="flex h-8 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <FileImage className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate font-code">{path}</span>
          {sizeLabel && (
            <span className="shrink-0 text-[10px] text-[var(--obs-text-faint,#666666)]">
              ({sizeLabel})
            </span>
          )}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => (z === "fit" ? 75 : Math.max(25, z - 25)))}
            title="Zoom out"
            className="rounded p-1 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            title="Fit to viewport"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 font-code text-[10.5px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <Maximize className="h-3 w-3" />
            <span>{zoom === "fit" ? "Fit" : `${zoom}%`}</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => (z === "fit" ? 125 : Math.min(300, z + 25)))}
            title="Zoom in"
            className="rounded p-1 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {srcUrl && (
            <a
              href={srcUrl}
              target="_blank"
              rel="noreferrer"
              title="Open raw image in browser tab"
              className="ml-1 rounded p-1 hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {highlight && (
        <div
          data-testid="image-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="font-semibold text-amber-200">
              🖼 이미지 영역 하이라이트
              {highlight.bbox ? ` · bbox(${highlight.bbox.join(",")})` : ""}
            </span>
            {highlight.quoteText && (
              <span className="truncate text-amber-100/85">“{highlight.quoteText}”</span>
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

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#16171a] p-6">
        {srcUrl ? (
          <div className="relative inline-block max-h-full max-w-full">
            <img
              src={srcUrl}
              alt={path}
              draggable={false}
              className="block rounded shadow-lg"
              style={
                zoom === "fit"
                  ? { maxWidth: "100%", maxHeight: "calc(100vh - 180px)", objectFit: "contain" }
                  : { width: `${zoom}%`, height: "auto", maxWidth: "none" }
              }
            />
            {highlight?.bbox && (
              <div
                data-testid="image-bbox-highlight-box"
                style={{
                  top: `${highlight.bbox[0] / 10}%`,
                  left: `${highlight.bbox[1] / 10}%`,
                  height: `${Math.max(2, (highlight.bbox[2] - highlight.bbox[0]) / 10)}%`,
                  width: `${Math.max(2, (highlight.bbox[3] - highlight.bbox[1]) / 10)}%`,
                }}
                className="pointer-events-none absolute rounded border-2 border-amber-400 bg-amber-400/22 shadow-[0_0_18px_rgba(251,191,36,0.45)]"
              >
                {highlight.quoteText && (
                  <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-950 shadow">
                    {highlight.quoteText}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-[var(--obs-text-faint,#666666)]">
            Binary streaming is available when mounted via a local/remote Vault adapter.
          </div>
        )}
      </div>
    </div>
  );
};

export const PdfTabViewer: React.FC<MediaTabViewerProps> = ({ vault, path }) => {
  const [highlight, setHighlight] = useState<ResourceHighlightRequest | null>(null);
  const node = vault.getNode(path);
  const srcUrl = vault.getBinaryUrl ? vault.getBinaryUrl(path) : null;
  const sizeLabel = node?.kind === "file" ? formatBytes(node.size) : "";

  useEffect(() => subscribeResourceHighlight(path, (req) => setHighlight(req)), [path]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)]">
      <div className="flex h-8 shrink-0 select-none items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <FileText className="h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="truncate font-code">{path}</span>
          {sizeLabel && (
            <span className="shrink-0 text-[10px] text-[var(--obs-text-faint,#666666)]">
              ({sizeLabel})
            </span>
          )}
        </span>
        {srcUrl && (
          <a
            href={srcUrl}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] hover:bg-[var(--obs-bg-hover,rgba(255,255,255,0.067))] hover:text-[var(--obs-text-normal,#dadada)]"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Open PDF</span>
          </a>
        )}
      </div>

      {highlight && (
        <div
          data-testid="pdf-resource-highlight-banner"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11.5px] text-amber-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="font-semibold text-amber-200">
              📕 PDF 하이라이트{highlight.page ? ` · p.${highlight.page}` : ""}
              {highlight.bbox ? " · 영역" : ""}
            </span>
            {highlight.quoteText && (
              <span className="truncate text-amber-100/85">“{highlight.quoteText}”</span>
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

      <div className="min-h-0 flex-1 overflow-hidden bg-[#16171a]">
        {srcUrl ? (
          <PdfDocumentViewer
            url={srcUrl}
            highlight={
              highlight
                ? {
                    id: highlight.id,
                    page: highlight.page,
                    bbox: highlight.bbox,
                    quoteText: highlight.quoteText,
                  }
                : null
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--obs-text-faint,#666666)]">
            PDF streaming is available when mounted via a local/remote Vault adapter.
          </div>
        )}
      </div>
    </div>
  );
};
