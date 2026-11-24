import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Crosshair, Loader2, Maximize, ZoomIn, ZoomOut } from "lucide-react";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocumentProxy = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;
type PdfPageProxy = Awaited<ReturnType<PdfDocumentProxy["getPage"]>>;

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

export interface PdfHighlightTarget {
  readonly id?: string;
  readonly page?: number;
  /** 0..1000 normalized `[ymin, xmin, ymax, xmax]` */
  readonly bbox?: readonly [number, number, number, number];
  readonly quoteText?: string;
}

export interface PdfDocumentViewerProps {
  readonly url: string;
  readonly highlight?: PdfHighlightTarget | null;
}

interface HighlightBoxPct {
  readonly topPct: number;
  readonly leftPct: number;
  readonly widthPct: number;
  readonly heightPct: number;
}

interface TextItemLike {
  readonly str?: string;
  readonly transform?: readonly number[];
  readonly width?: number;
  readonly height?: number;
}

async function computeTextMatchBoxes(
  page: PdfPageProxy,
  quoteText: string
): Promise<HighlightBoxPct[]> {
  const needle = quoteText.replace(/\s+/g, " ").trim().toLowerCase();
  if (!needle) return [];

  const content = await page.getTextContent();
  const baseViewport = page.getViewport({ scale: 1 });
  const pageW = Math.max(1, baseViewport.width);
  const pageH = Math.max(1, baseViewport.height);

  const items: Array<{ text: string; start: number; end: number; item: TextItemLike }> = [];
  let joined = "";
  for (const raw of content.items as TextItemLike[]) {
    const str = (raw.str ?? "").replace(/\s+/g, " ");
    if (!str) continue;
    const start = joined.length;
    joined += str;
    const end = joined.length;
    items.push({ text: str, start, end, item: raw });
    if (!str.endsWith(" ")) joined += " ";
  }

  const hay = joined.toLowerCase();
  let matchStart = hay.indexOf(needle);
  let matchLen = needle.length;
  if (matchStart < 0) {
    // Fallback: match without spaces (helpful for Korean PDFs where pdf.js inserts spaces between glyphs)
    const compactNeedle = needle.replace(/\s+/g, "");
    const tokens = needle.split(/\s+/).filter((t) => t.length >= 2);
    for (const tok of tokens) {
      const idx = hay.indexOf(tok);
      if (idx >= 0) {
        matchStart = idx;
        matchLen = tok.length;
        break;
      }
    }
    if (matchStart < 0 && compactNeedle.length >= 4) {
      const prefix = compactNeedle.slice(0, Math.min(8, compactNeedle.length));
      const idx = hay.replace(/\s+/g, "").indexOf(prefix);
      if (idx >= 0) {
        // Approximate match on first token containing prefix substring
        const hitItem = items.find((it) => it.text.toLowerCase().includes(prefix.slice(0, 3)));
        if (hitItem) {
          matchStart = hitItem.start;
          matchLen = hitItem.end - hitItem.start;
        }
      }
    }
  }
  if (matchStart < 0) return [];
  const matchEnd = matchStart + matchLen;

  const boxes: HighlightBoxPct[] = [];
  for (const entry of items) {
    if (entry.end <= matchStart || entry.start >= matchEnd) continue;
    const tr = entry.item.transform;
    if (!tr || tr.length < 6) continue;
    const x = tr[4];
    const y = tr[5];
    const fontH = Math.max(8, Math.abs(entry.item.height ?? Math.hypot(tr[2], tr[3]) ?? 12));
    const itemW = Math.max(10, entry.item.width ?? entry.text.length * fontH * 0.55);
    const rect = baseViewport.convertToViewportRectangle([x, y, x + itemW, y + fontH]);
    const x0 = Math.min(rect[0], rect[2]);
    const x1 = Math.max(rect[0], rect[2]);
    const y0 = Math.min(rect[1], rect[3]);
    const y1 = Math.max(rect[1], rect[3]);
    boxes.push({
      leftPct: Math.max(0, (x0 / pageW) * 100),
      topPct: Math.max(0, (y0 / pageH) * 100),
      widthPct: Math.min(100, Math.max(1.2, ((x1 - x0) / pageW) * 100)),
      heightPct: Math.min(100, Math.max(1.2, ((y1 - y0) / pageH) * 100)),
    });
  }
  return boxes;
}

const PdfSinglePageCanvas: React.FC<{
  readonly pdfDoc: PdfDocumentProxy;
  readonly pageNumber: number;
  readonly renderWidth: number;
  readonly highlight?: PdfHighlightTarget | null;
  readonly isTargetPage: boolean;
  readonly registerRef: (pageNum: number, el: HTMLDivElement | null) => void;
}> = ({ pdfDoc, pageNumber, renderWidth, highlight, isTargetPage, registerRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(595 / 842);
  const [textBoxes, setTextBoxes] = useState<HighlightBoxPct[]>([]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;

    void pdfDoc.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const baseVp = page.getViewport({ scale: 1 });
      setAspect(baseVp.width / Math.max(1, baseVp.height));

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = (Math.max(200, renderWidth) / Math.max(1, baseVp.width)) * dpr;
      const vp = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));

      const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
      renderTask = task;
      await task.promise;

      if (!cancelled && isTargetPage && highlight?.quoteText) {
        const matched = await computeTextMatchBoxes(page, highlight.quoteText);
        if (!cancelled) setTextBoxes(matched);
      } else if (!cancelled) {
        setTextBoxes([]);
      }
    }).catch(() => {
      // Ignore cancellation / transient render errors
    });

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // ignore
      }
    };
  }, [pdfDoc, pageNumber, renderWidth, isTargetPage, highlight?.quoteText, highlight?.id]);

  const heightPx = Math.round(renderWidth / Math.max(0.2, aspect));

  return (
    <div
      ref={(el) => registerRef(pageNumber, el)}
      data-pdf-page={pageNumber}
      data-highlighted-page={isTargetPage ? "true" : undefined}
      style={{ width: `${renderWidth}px`, height: `${heightPx}px` }}
      className={`relative mx-auto shrink-0 overflow-hidden rounded bg-white shadow-xl transition-shadow ${
        isTargetPage ? "ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.28)]" : ""
      }`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      <span className="pointer-events-none absolute top-2 right-2 rounded bg-slate-900/75 px-1.5 py-0.5 font-code text-[10px] text-slate-200">
        p.{pageNumber}
      </span>

      {/* TextLayer sentence highlight overlays */}
      {isTargetPage &&
        textBoxes.map((b, idx) => (
          <div
            key={idx}
            data-testid="pdf-text-highlight-box"
            style={{
              top: `${b.topPct}%`,
              left: `${b.leftPct}%`,
              width: `${b.widthPct}%`,
              height: `${b.heightPct}%`,
            }}
            className="pointer-events-none absolute rounded-[2px] border border-amber-500/80 bg-amber-300/45 mix-blend-multiply"
          />
        ))}

      {/* Explicit BBox region highlight (`#p3@bbox(y1,x1,y2,x2)`) */}
      {isTargetPage && highlight?.bbox && (
        <div
          data-testid="pdf-bbox-highlight-box"
          style={{
            top: `${highlight.bbox[0] / 10}%`,
            left: `${highlight.bbox[1] / 10}%`,
            height: `${Math.max(1.5, (highlight.bbox[2] - highlight.bbox[0]) / 10)}%`,
            width: `${Math.max(2, (highlight.bbox[3] - highlight.bbox[1]) / 10)}%`,
          }}
          className="pointer-events-none absolute rounded border-2 border-amber-500 bg-amber-400/20 ring-2 ring-amber-300/60"
        >
          {highlight.quoteText && (
            <span className="absolute -top-5 left-0 max-w-[320px] truncate rounded bg-amber-600 px-1.5 py-0.5 font-code text-[10px] font-semibold text-white shadow">
              {highlight.quoteText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Multi-page PDF.js viewer with exact page jumping, TextLayer quote highlighting, and 0..1000 BBox overlays.
 */
export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({ url, highlight }) => {
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [activePage, setActivePage] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Measure actual scroll container inner width (`clientWidth` excludes vertical scrollbar)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.floor(el.clientWidth);
      if (next <= 0) return;
      setViewportWidth((prev) => (Math.abs(next - prev) >= 4 ? next : prev));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scoped Ctrl/Cmd + Mouse Wheel (and trackpad pinch) zoom on the PDF viewport
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const absY = Math.abs(ev.deltaY);
      const step = absY < 40 ? Math.max(2, Math.round(absY * 0.4)) : 10;
      const delta = ev.deltaY < 0 ? step : -step;
      setZoom((prev) => {
        const cur = prev === "fit" ? 100 : prev;
        return Math.max(40, Math.min(250, cur + delta));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const registerRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el);
    else pageRefs.current.delete(pageNum);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null);
    setError(null);
    getCachedPdfDocument(url)
      .then((doc) => {
        if (!cancelled) setPdfDoc(doc);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err ?? "PDF 로드 실패"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const scrollToPage = useCallback((pageNum: number) => {
    setActivePage(pageNum);
    window.setTimeout(() => {
      const el = pageRefs.current.get(pageNum);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
  }, []);

  useEffect(() => {
    if (!pdfDoc || !highlight) return;
    if (highlight.page && highlight.page >= 1) {
      const safe = Math.min(pdfDoc.numPages, highlight.page);
      scrollToPage(safe);
      return;
    }
    if (highlight.quoteText?.trim()) {
      const needle = highlight.quoteText.trim().toLowerCase();
      let cancelled = false;
      void (async () => {
        for (let p = 1; p <= pdfDoc.numPages; p += 1) {
          const page = await pdfDoc.getPage(p);
          const content = await page.getTextContent();
          const joined = (content.items as TextItemLike[])
            .map((i) => i.str ?? "")
            .join(" ")
            .toLowerCase();
          if (joined.includes(needle)) {
            if (!cancelled) scrollToPage(p);
            return;
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [pdfDoc, highlight, scrollToPage]);

  const numPages = pdfDoc?.numPages ?? 0;
  // Horizontal padding `px-4` (32px) + 8px breathing room so full page width fits cleanly on initial render
  const fitWidth = viewportWidth > 0 ? Math.max(220, viewportWidth - 40) : 520;
  const renderWidth = zoom === "fit" ? fitWidth : Math.max(200, Math.round(fitWidth * (zoom / 100)));
  const targetHighlightPage = highlight
    ? Math.max(1, Math.min(numPages || 1, highlight.page ?? activePage))
    : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#141518]">
      {/* Mini page jump & zoom control bar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/10 bg-[#202226] px-3 text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!pdfDoc || activePage <= 1}
            onClick={() => scrollToPage(Math.max(1, activePage - 1))}
            className="rounded p-1 hover:bg-white/10 disabled:opacity-35"
            title="이전 페이지"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-code text-[11px]">
            p.{activePage} / {numPages || "…"}
          </span>
          <button
            type="button"
            disabled={!pdfDoc || activePage >= numPages}
            onClick={() => scrollToPage(Math.min(numPages, activePage + 1))}
            className="rounded p-1 hover:bg-white/10 disabled:opacity-35"
            title="다음 페이지"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {highlight && (
            <button
              type="button"
              onClick={() => scrollToPage(targetHighlightPage ?? 1)}
              className="ml-2 flex items-center gap-1 rounded border border-amber-400/45 bg-amber-500/15 px-2 py-0.5 text-[10.5px] text-amber-200 hover:bg-amber-500/25"
            >
              <Crosshair className="h-3 w-3" />
              <span>인용 위치로 (p.{targetHighlightPage})</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => (z === "fit" ? 85 : Math.max(40, z - 15)))}
            className="rounded p-1 hover:bg-white/10"
            title="축소"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-code text-[10.5px] hover:bg-white/10 ${
              zoom === "fit" ? "text-amber-300" : "text-slate-200"
            }`}
            title="가로 폭 맞춤 (Fit)"
          >
            <Maximize className="h-3 w-3" />
            <span>{zoom === "fit" ? "Fit" : `${zoom}%`}</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => (z === "fit" ? 115 : Math.min(250, z + 15)))}
            className="rounded p-1 hover:bg-white/10"
            title="확대"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {error ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-6 text-center text-[12px] text-rose-200">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <div className="font-semibold">PDF 를 불러오지 못했습니다</div>
            <div className="font-code text-[11px] text-rose-300/80">{error}</div>
          </div>
        ) : !pdfDoc ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span>PDF.js 문서 로딩 중...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
              <PdfSinglePageCanvas
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                renderWidth={renderWidth}
                highlight={highlight}
                isTargetPage={targetHighlightPage === pageNum}
                registerRef={registerRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
