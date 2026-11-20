import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocumentProxy = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

let pdfJsPromise: Promise<PdfJsModule> | null = null;
const docCache = new Map<string, Promise<PdfDocumentProxy>>();

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((mod) => {
      try {
        mod.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
      } catch {
        mod.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      }
      return mod;
    });
  }
  return pdfJsPromise;
}

async function getCachedPdfDocument(url: string): Promise<PdfDocumentProxy> {
  const existing = docCache.get(url);
  if (existing) return existing;
  const promise = loadPdfJs()
    .then((pdfjs) => pdfjs.getDocument({ url, withCredentials: false }).promise)
    .catch((err) => {
      docCache.delete(url);
      throw err;
    });
  docCache.set(url, promise);
  return promise;
}

export interface PdfPageSurfaceProps {
  readonly url: string;
  readonly pageNumber: number;
  readonly renderWidth: number;
  readonly lazy?: boolean;
  readonly onDocumentMeta?: (info: { readonly pageCount: number; readonly width: number; readonly height: number }) => void;
}

/**
 * Renders a single PDF page directly into a `<canvas>` matching the 2D Frame surface.
 * When `lazy` is true (default for continuous multi-page scroll), uses `IntersectionObserver`
 * so even 69+ page PDFs scroll smoothly at 60fps.
 */
export const PdfPageSurface: React.FC<PdfPageSurfaceProps> = ({
  url,
  pageNumber,
  renderWidth,
  lazy = true,
  onDocumentMeta,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!lazy || pageNumber <= 2);
  const [status, setStatus] = useState<{
    readonly key: string;
    readonly state: "ready" | "error";
    readonly error?: string;
  } | null>(null);
  const renderKey = `${url}|${pageNumber}|${Math.round(renderWidth)}`;

  useEffect(() => {
    if (!lazy || visible) return;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "700px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;

    getCachedPdfDocument(url)
      .then(async (pdfDoc) => {
        if (cancelled) return;
        const safePage = Math.max(1, Math.min(pdfDoc.numPages, pageNumber));
        const page = await pdfDoc.getPage(safePage);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        onDocumentMeta?.({
          pageCount: pdfDoc.numPages,
          width: baseViewport.width,
          height: baseViewport.height,
        });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const targetCssWidth = Math.max(240, renderWidth);
        const scale = (targetCssWidth / Math.max(1, baseViewport.width)) * dpr;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const task = page.render({ canvas, canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
        if (!cancelled) {
          setStatus({ key: renderKey, state: "ready" });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err ?? "PDF render error");
        if (msg.includes("Rendering cancelled") || msg.includes("Worker was terminated")) {
          return;
        }
        setStatus({ key: renderKey, state: "error", error: msg });
      });

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // Ignore cancellation errors
      }
    };
  }, [visible, url, pageNumber, renderWidth, renderKey, onDocumentMeta]);

  const isError = status?.key === renderKey && status.state === "error";
  const isReady = status?.key === renderKey && status.state === "ready";

  return (
    <div ref={hostRef} className="relative h-full w-full bg-white">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!visible && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50 font-code text-[11px] text-slate-400">
          Page {pageNumber}
        </div>
      )}
      {visible && !isReady && !isError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-[12px] text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
          <span>Rendering page {pageNumber}...</span>
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center text-[12px] text-rose-600">
          <AlertCircle className="h-5 w-5" />
          <div className="font-semibold">PDF 페이지를 렌더링하지 못했습니다</div>
          <div className="max-w-md font-code text-[11px] text-slate-500">{status.error}</div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-500"
          >
            원본 PDF 새 탭에서 열기
          </a>
        </div>
      )}
    </div>
  );
};
