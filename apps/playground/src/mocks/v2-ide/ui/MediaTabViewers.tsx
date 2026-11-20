import React, { useState } from "react";
import { ExternalLink, FileImage, FileText, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import type { VaultPort } from "@vibe/vault-core";

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
  const node = vault.getNode(path);
  const srcUrl = vault.getBinaryUrl ? vault.getBinaryUrl(path) : null;
  const sizeLabel = node?.kind === "file" ? formatBytes(node.size) : "";

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

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#16171a] p-6">
        {srcUrl ? (
          <img
            src={srcUrl}
            alt={path}
            draggable={false}
            className="rounded shadow-lg"
            style={
              zoom === "fit"
                ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }
                : { width: `${zoom}%`, height: "auto", maxWidth: "none" }
            }
          />
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
  const node = vault.getNode(path);
  const srcUrl = vault.getBinaryUrl ? vault.getBinaryUrl(path) : null;
  const sizeLabel = node?.kind === "file" ? formatBytes(node.size) : "";

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

      <div className="min-h-0 flex-1 overflow-hidden bg-[#16171a]">
        {srcUrl ? (
          <iframe
            src={srcUrl}
            title={path}
            className="h-full w-full border-0"
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
