import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ClipboardPaste,
  Copy,
  Crop,
  ExternalLink,
  FileUp,
  Globe,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  addRefPin,
  appendImageFrameToRef,
  createRefFromImageDataUrl,
  deleteRefPin,
  updateRefPin,
} from "../core/normalizer";
import { computeWebTileCoverage } from "../core/coverage";
import type { RefBBox, RefDocument, RefFrame, RefPin } from "../core/types";
import { PdfPageSurface } from "./PdfPageSurface";

export interface RefActiveHighlight {
  readonly id?: string;
  readonly frameIndex?: number;
  readonly blockId?: string;
  readonly bbox?: RefBBox;
  readonly quoteText?: string;
}

export interface RefCanvasWorkbenchProps {
  readonly doc: RefDocument;
  readonly readOnly?: boolean;
  /** 외부 `<<resource:...>>` 점프로 전달된 블록·영역·인용문 하이라이트 */
  readonly activeHighlight?: RefActiveHighlight | null;
  /** Resolves `vault://...` URI to a fetchable binary URL when the `.ref` points to an in-vault asset. */
  readonly resolveAssetUrl?: (uri: string) => string | undefined;
  readonly onChangeDoc: (next: RefDocument) => void;
  /** Optional host handler to import a URL synchronously into this `.ref` document via backend. */
  readonly onImportUrl?: (url: string, title?: string) => Promise<RefDocument>;
  /**
   * Preferred non-blocking async URL import handler managed by the host runtime (streams to Terminal).
   * `fileName` is the name a person typed on the import card (empty = follow the source title).
   */
  readonly onStartAsyncUrlImport?: (url: string, title?: string, fileName?: string) => void;
  /**
   * Called instead of `onChangeDoc` when content is imported into an empty `.ref`, so the host can
   * also name the file (typed `fileName`, otherwise the source's original title).
   */
  readonly onImportedIntoEmpty?: (doc: RefDocument, fileName?: string) => void;
  /** Optional host handler to import a local file into this `.ref` document. */
  readonly onImportFile?: (file: File) => Promise<RefDocument>;
  /** Optional host handler to open the full Import Reference modal (library / vault picker). */
  readonly onRequestImportDialog?: () => void;
  /** Optional host handler to attach a user-selected range (`ref:<id>#pin:...`) to AI Composer. */
  readonly onAttachToAi?: (payload: {
    readonly anchor: string;
    readonly summary: string;
    readonly text: string;
    readonly frameIndex: number;
    readonly bbox: RefBBox | null;
  }) => void;
  readonly onSelectionChange?: (selection: {
    readonly summary: string;
    readonly text: string;
    readonly frameIndex: number;
    readonly blockId?: string;
    readonly pinId?: string;
  } | null) => void;
}

const ORIGIN_BADGE: Record<string, { readonly label: string; readonly cls: string }> = {
  pdf: { label: "PDF", cls: "border-rose-500/40 bg-rose-500/15 text-rose-300" },
  web: { label: "WEB", cls: "border-sky-500/40 bg-sky-500/15 text-sky-300" },
  image: { label: "IMG", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  markdown: { label: "MD", cls: "border-violet-500/40 bg-violet-500/15 text-violet-300" },
  vdoc: { label: "VDOC", cls: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300" },
  html: { label: "HTML", cls: "border-blue-500/40 bg-blue-500/15 text-blue-300" },
  composite: { label: "FLOW", cls: "border-amber-500/40 bg-amber-500/15 text-amber-300" },
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/** Placeholder for page height that exists in the source but is missing from the captured tiles. */
const UncapturedBand: React.FC<{ readonly heightPx: number; readonly sourcePx: number }> = ({
  heightPx,
  sourcePx,
}) => (
  <div
    style={{
      height: `${Math.max(18, heightPx)}px`,
      backgroundImage:
        "repeating-linear-gradient(135deg, rgba(245,158,11,0.16) 0 8px, rgba(245,158,11,0.04) 8px 16px)",
    }}
    className="flex shrink-0 items-center justify-center border-y border-dashed border-amber-500/60 bg-[#2a2216]"
    title="원본 페이지에는 있지만 캡처되지 않은 구간"
  >
    <span className="rounded bg-black/55 px-2 py-0.5 font-code text-[10.5px] text-amber-200">
      캡처되지 않은 구간 · {Math.round(sourcePx).toLocaleString()}px
    </span>
  </div>
);

/**
 * Clean, distraction-free unified 2D Canvas viewer for `.ref` files.
 *
 * - Renders ALL formats (PDF, Web full-page strips, Images, HTML/Markdown fallback) on ONE
 *   continuous vertical scrolling 2D Canvas (no forced page slicing, no auto-BBox clutter).
 * - Users freely scroll the clean source and drag to add ONLY the specific ranges they want.
 */
export const RefCanvasWorkbench: React.FC<RefCanvasWorkbenchProps> = ({
  doc,
  readOnly = false,
  activeHighlight = null,
  resolveAssetUrl,
  onChangeDoc,
  onImportUrl,
  onStartAsyncUrlImport,
  onImportedIntoEmpty,
  onImportFile,
  onRequestImportDialog,
  onAttachToAi,
  onSelectionChange,
}) => {
  const [zoomPct, setZoomPct] = useState(100);
  const [selectMode, setSelectMode] = useState(false);
  const [pinsPanelOpen, setPinsPanelOpen] = useState(doc.pins.length > 0);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // Per-frame drag-to-select state (normalized 0..1000)
  const [dragState, setDragState] = useState<{
    readonly frameIndex: number;
    readonly startX: number;
    readonly startY: number;
    readonly curX: number;
    readonly curY: number;
  } | null>(null);

  const frameElMapRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const blockElMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const appendFileRef = useRef<HTMLInputElement>(null);

  const matchedBlock = useMemo(() => {
    if (!activeHighlight) return null;
    if (activeHighlight.blockId) {
      const byId = doc.blocks.find((b) => b.id === activeHighlight.blockId);
      if (byId) return byId;
    }
    const needle = activeHighlight.quoteText?.trim().toLowerCase();
    if (needle) {
      const exact = doc.blocks.find((b) => b.text.toLowerCase().includes(needle));
      if (exact) return exact;
      const token = needle.split(/\s+/).find((t) => t.length >= 2);
      if (token) {
        return doc.blocks.find((b) => b.text.toLowerCase().includes(token)) ?? null;
      }
    }
    return null;
  }, [activeHighlight, doc.blocks]);

  useEffect(() => {
    if (!activeHighlight) return;
    const timer = window.setTimeout(() => {
      if (matchedBlock) {
        const blkEl = blockElMapRef.current.get(matchedBlock.id);
        if (blkEl) {
          blkEl.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
      }
      const targetFrame = activeHighlight.frameIndex ?? matchedBlock?.frameIndex ?? 1;
      const frameEl = frameElMapRef.current.get(targetFrame);
      frameEl?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeHighlight, matchedBlock]);

  const renderHighlightedText = useCallback(
    (text: string): React.ReactNode => {
      const needle = activeHighlight?.quoteText?.trim();
      if (!needle) return text;
      const idx = text.toLowerCase().indexOf(needle.toLowerCase());
      if (idx < 0) return text;
      return (
        <>
          {text.slice(0, idx)}
          <mark className="rounded bg-amber-300/90 px-1 py-0.5 font-semibold text-slate-950 shadow-sm">
            {text.slice(idx, idx + needle.length)}
          </mark>
          {text.slice(idx + needle.length)}
        </>
      );
    },
    [activeHighlight?.quoteText]
  );

  // Empty-state quick URL import
  const [importUrlInput, setImportUrlInput] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNameInput, setImportNameInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const deliverImportedIntoEmpty = useCallback(
    (imported: RefDocument) => {
      const typedName = importNameInput.trim() || undefined;
      if (onImportedIntoEmpty) onImportedIntoEmpty(imported, typedName);
      else onChangeDoc(imported);
    },
    [importNameInput, onChangeDoc, onImportedIntoEmpty]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2000);
  }, []);

  // Elapsed timer while ingesting in background
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (doc.status !== "ingesting") return;
    const startedAt = doc.ingestProgress?.startedAt ?? doc.updatedAt;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 500);
    return () => window.clearInterval(id);
  }, [doc.status, doc.ingestProgress?.startedAt, doc.updatedAt]);

  // Clipboard Ctrl+V support: paste image directly into empty `.ref` or append frame
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      if (readOnly) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          ev.preventDefault();
          void readFileAsDataUrl(file).then((dataUrl) => {
            if (doc.status === "empty" || doc.frames.length === 0) {
              deliverImportedIntoEmpty(
                createRefFromImageDataUrl({
                  title: doc.title || "Clipboard Capture",
                  dataUrl,
                })
              );
            } else {
              const appended = appendImageFrameToRef(doc, {
                assetUrl: dataUrl,
                label: `Clipboard ${doc.frames.length + 1}`,
              });
              onChangeDoc(appended);
            }
            showToast("클립보드 이미지를 캔버스에 추가했습니다");
          });
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [deliverImportedIntoEmpty, doc, onChangeDoc, readOnly, showToast]);

  const resolveFrameAssetUrl = useCallback(
    (frame: RefFrame): string | undefined => {
      const candidate = frame.assetUrl || doc.source.uri;
      if (!candidate) return undefined;
      if (candidate.startsWith("vault://") && resolveAssetUrl) {
        return resolveAssetUrl(candidate);
      }
      return candidate;
    },
    [doc.source.uri, resolveAssetUrl]
  );

  const handlePdfDocumentMeta = useCallback(
    (info: { readonly pageCount: number; readonly width: number; readonly height: number }) => {
      if (readOnly || info.pageCount <= doc.frames.length || doc.source.originType !== "pdf") return;
      const baseAsset = doc.frames[0]?.assetUrl || doc.source.uri;
      const expandedFrames: RefFrame[] = Array.from({ length: info.pageCount }, (_, i) => {
        const existing = doc.frames[i];
        return (
          existing ?? {
            frameId: `frame-${i + 1}`,
            index: i + 1,
            surfaceKind: "pdf-page",
            width: info.width || 595,
            height: info.height || 842,
            label: `Page ${i + 1}`,
            assetUrl: baseAsset,
            pageNumber: i + 1,
          }
        );
      });
      onChangeDoc({
        ...doc,
        frames: expandedFrames,
        updatedAt: Date.now(),
      });
    },
    [doc, onChangeDoc, readOnly]
  );

  const handleJumpToPin = useCallback(
    (pin: RefPin) => {
      setSelectedPinId(pin.pinId);
      const frameEl = frameElMapRef.current.get(pin.frameIndex);
      if (frameEl) {
        frameEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      onSelectionChange?.({
        summary: `선택 영역 · ${pin.label}`,
        text: pin.note || pin.text || pin.anchor,
        frameIndex: pin.frameIndex,
        pinId: pin.pinId,
      });
    },
    [onSelectionChange]
  );

  const toNormCoords = (
    ev: React.PointerEvent<HTMLDivElement>,
    el: HTMLDivElement
  ): { x: number; y: number } | null => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1000, Math.round(((ev.clientX - rect.left) / rect.width) * 1000))),
      y: Math.max(0, Math.min(1000, Math.round(((ev.clientY - rect.top) / rect.height) * 1000))),
    };
  };

  const handleFramePointerDown = (
    frameIndex: number,
    ev: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!selectMode || readOnly || ev.button !== 0) return;
    const pt = toNormCoords(ev, ev.currentTarget);
    if (!pt) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setDragState({
      frameIndex,
      startX: pt.x,
      startY: pt.y,
      curX: pt.x,
      curY: pt.y,
    });
  };

  const handleFramePointerMove = (
    frameIndex: number,
    ev: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!dragState || dragState.frameIndex !== frameIndex) return;
    const pt = toNormCoords(ev, ev.currentTarget);
    if (!pt) return;
    setDragState((prev) => (prev ? { ...prev, curX: pt.x, curY: pt.y } : null));
  };

  const handleFramePointerUp = (frameIndex: number) => {
    if (!dragState || dragState.frameIndex !== frameIndex) {
      setDragState(null);
      return;
    }
    const y0 = Math.min(dragState.startY, dragState.curY);
    const x0 = Math.min(dragState.startX, dragState.curX);
    const y1 = Math.max(dragState.startY, dragState.curY);
    const x1 = Math.max(dragState.startX, dragState.curX);
    setDragState(null);

    if (y1 - y0 < 8 || x1 - x0 < 8) return;
    const bbox: RefBBox = [y0, x0, y1, x1];

    // Quietly collect any underlying text inside the user's drawn region for AI context
    const overlappedText = doc.blocks
      .filter((b) => {
        if (b.frameIndex !== frameIndex || !b.bbox) return false;
        return !(b.bbox[2] < y0 || b.bbox[0] > y1 || b.bbox[3] < x0 || b.bbox[1] > x1);
      })
      .map((b) => b.text)
      .filter(Boolean)
      .join("\n")
      .slice(0, 600);

    const { doc: nextDoc, pin } = addRefPin(doc, {
      kind: "region",
      frameIndex,
      bbox,
      text: overlappedText,
      label: `영역 ${doc.pins.length + 1}`,
    });
    onChangeDoc(nextDoc);
    setSelectedPinId(pin.pinId);
    setPinsPanelOpen(true);
    showToast(`선택 영역 추가됨 (${pin.label})`);
  };

  const handleAppendImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly) return;
    let next = doc;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await readFileAsDataUrl(file);
      next = appendImageFrameToRef(next, {
        assetUrl: dataUrl,
        label: file.name,
      });
    }
    onChangeDoc(next);
    showToast("이미지 프레임을 추가했습니다");
  };

  const pinsByFrame = useMemo(() => {
    const map = new Map<number, RefPin[]>();
    for (const p of doc.pins) {
      const list = map.get(p.frameIndex) ?? [];
      list.push(p);
      map.set(p.frameIndex, list);
    }
    return map;
  }, [doc.pins]);

  // --- 1. Non-Blocking Async Ingesting State ---
  if (doc.status === "ingesting") {
    const progress = doc.ingestProgress;
    const pct = Math.max(4, Math.min(99, progress?.percent ?? 10));
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const secs = String(elapsedSec % 60).padStart(2, "0");
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-[var(--obs-text-normal,#dadada)]">
        <div className="w-full max-w-lg rounded-xl border border-amber-500/40 bg-[var(--obs-bg-secondary,#262626)] p-6 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>레퍼런스 캔버스 렌더링 중</span>
            </div>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-code text-[11px] font-semibold text-amber-300">
              {pct}% · {mins}:{secs}
            </span>
          </div>

          {progress?.targetUrl && (
            <div
              className="mb-3 truncate rounded bg-[var(--obs-bg-primary,#1e1e1e)] px-2.5 py-1.5 font-code text-[11px] text-sky-300"
              title={progress.targetUrl}
            >
              {progress.targetUrl}
            </div>
          )}

          <div className="mb-2.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              style={{ width: `${pct}%` }}
              className="h-full rounded-full bg-amber-500 transition-all duration-300"
            />
          </div>

          <div className="mb-4 flex items-center justify-between text-[12px]">
            <span className="font-medium text-[var(--obs-text-normal,#dadada)]">
              {progress?.message ?? "원본 화면을 2D 캔버스로 렌더링 중..."}
            </span>
            <span className="shrink-0 font-code text-[10.5px] uppercase text-[var(--obs-text-faint,#888)]">
              {progress?.stage ?? "ingesting"}
            </span>
          </div>

          <div className="rounded-md border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] px-3 py-2 text-[11px] leading-relaxed text-[var(--obs-text-muted,#b3b3b3)]">
            비동기 백그라운드 작업 중입니다. <b>다른 탭으로 이동해도 중단되지 않으며</b>, 상세
            진행 로그는 하단 <b>TERMINAL</b>에서 확인할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  // --- 2. Empty-State / Failed Import Launcher ---
  if (doc.status === "empty" || doc.frames.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-[var(--obs-text-normal,#dadada)]">
        <div className="w-full max-w-lg rounded-xl border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-secondary,#262626)] p-6 shadow-2xl">
          <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold">
            <BookOpen className="h-4 w-4 text-amber-400" />
            <span>Import Reference — {doc.title}</span>
          </div>
          {doc.status === "failed" && doc.error && (
            <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
              이전 Import 실패: {doc.error}
            </div>
          )}
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--obs-text-muted,#b3b3b3)]">
            PDF · 웹페이지 · 이미지를 단일 연속 2D 캔버스로 불러와 그대로 열람하고, 원하는
            구간만 직접 드래그해 선택·활용합니다.
          </p>

          {(onStartAsyncUrlImport || onImportUrl) && (
            <form
              onSubmit={async (ev) => {
                ev.preventDefault();
                const url = importUrlInput.trim();
                if (!url || importBusy) return;
                if (onStartAsyncUrlImport) {
                  setImportError(null);
                  onStartAsyncUrlImport(url, undefined, importNameInput.trim() || undefined);
                  return;
                }
                if (!onImportUrl) return;
                setImportBusy(true);
                setImportError(null);
                try {
                  const imported = await onImportUrl(url);
                  deliverImportedIntoEmpty(imported);
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : "URL 가져오기 실패");
                } finally {
                  setImportBusy(false);
                }
              }}
              className="mb-3 flex items-center gap-1.5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-2.5 py-1.5">
                <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <input
                  type="url"
                  value={importUrlInput}
                  onChange={(e) => setImportUrlInput(e.target.value)}
                  placeholder="https://... 웹 URL 붙여넣기"
                  className="w-full bg-transparent font-code text-[12px] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={importBusy || !importUrlInput.trim()}
                className="flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-amber-500 disabled:opacity-40"
              >
                {importBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>URL Import</span>
              </button>
            </form>
          )}

          <div className="grid grid-cols-2 gap-2">
            {onImportFile && (
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-3 py-2 text-[12px] hover:border-amber-400/60">
                <FileUp className="h-3.5 w-3.5 text-amber-400" />
                <span>로컬 파일 (PDF/IMG/HTML)</span>
                <input
                  type="file"
                  accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif"
                  className="hidden"
                  onChange={async (ev) => {
                    const file = ev.target.files?.[0];
                    ev.target.value = "";
                    if (!file) return;
                    setImportBusy(true);
                    setImportError(null);
                    try {
                      const imported = await onImportFile(file);
                      deliverImportedIntoEmpty(imported);
                    } catch (err) {
                      setImportError(err instanceof Error ? err.message : "파일 Import 실패");
                    } finally {
                      setImportBusy(false);
                    }
                  }}
                />
              </label>
            )}

            {onRequestImportDialog && (
              <button
                type="button"
                onClick={onRequestImportDialog}
                className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-3 py-2 text-[12px] hover:border-amber-400/60"
              >
                <BookOpen className="h-3.5 w-3.5 text-violet-400" />
                <span>등록 라이브러리 · Vault 선택</span>
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1.5 rounded-md bg-[var(--obs-bg-primary,#1e1e1e)] px-3 py-2 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">
            <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>
              Tip: 화면 캡처 후 여기서 <kbd className="rounded bg-white/10 px-1 font-code">Ctrl+V</kbd>
              하면 바로 2D 캔버스 레퍼런스로 열립니다.
            </span>
          </div>

          {/* 파일 이름: 비워두면 가져온 원본 제목으로 자동 지정, 입력하면 그 이름을 쓴다. */}
          {!readOnly && (
            <label className="mt-2 flex items-center gap-2 rounded-md border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-3 py-1.5 text-[12px]">
              <span className="shrink-0 text-[11px] text-[var(--obs-text-muted,#b3b3b3)]">이름</span>
              <input
                type="text"
                value={importNameInput}
                onChange={(e) => setImportNameInput(e.target.value)}
                placeholder="비워두면 가져온 원본 제목으로 자동 지정"
                maxLength={120}
                aria-label="레퍼런스 파일 이름"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--obs-text-faint,#777)]"
              />
              <span className="shrink-0 font-code text-[10.5px] text-[var(--obs-text-faint,#777)]">.ref</span>
            </label>
          )}

          {importError && (
            <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">
              {importError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- 3. Clean Continuous Unified 2D Canvas ---
  const originBadge = ORIGIN_BADGE[doc.source.originType] ?? {
    label: doc.source.originType.toUpperCase(),
    cls: "border-slate-500/40 bg-slate-500/15 text-slate-300",
  };

  const isSeamlessWebCanvas = doc.frames.every((f) => f.surfaceKind === "web-tile");
  const isLegacySemanticWeb =
    doc.source.originType === "web" &&
    doc.frames.every((f) => f.surfaceKind === "semantic-canvas");
  const baseCanvasWidth = isSeamlessWebCanvas ? 920 : 800;
  const scaledWidth = Math.round((baseCanvasWidth * zoomPct) / 100);
  const webCoverage = isSeamlessWebCanvas ? computeWebTileCoverage(doc.frames) : null;
  const pxToCanvas = (px: number): number => Math.round((px * scaledWidth) / Math.max(1, doc.frames[0]?.width ?? 1));
  const coveragePct = webCoverage
    ? Math.floor((webCoverage.coveredPx / Math.max(1, webCoverage.pageHeightPx)) * 100)
    : 100;
  const canRecaptureWeb =
    Boolean(doc.source.sourceUrl && onStartAsyncUrlImport && !readOnly) &&
    (isLegacySemanticWeb || (webCoverage !== null && !webCoverage.complete));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)]">
      {/* Minimal Single-Line Top Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-3 text-[11.5px]">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 font-code text-[10px] font-semibold ${originBadge.cls}`}
          >
            {originBadge.label}
          </span>
          <span className="truncate font-semibold" title={doc.title}>
            {doc.title}
          </span>
          <span className="shrink-0 font-code text-[10.5px] text-[var(--obs-text-faint,#888)]">
            {webCoverage
              ? `${webCoverage.pageHeightPx.toLocaleString()}px`
              : doc.frames[0]?.surfaceKind === "pdf-page"
                ? `${doc.frames.length}p`
                : `${doc.frames.length} frame${doc.frames.length > 1 ? "s" : ""}`}
          </span>
          {webCoverage && !webCoverage.complete && (
            <span
              className="shrink-0 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-300"
              title="페이지 일부가 캡처되지 않았습니다. 빗금 구간은 원본에는 있지만 캡처에 빠진 부분입니다."
            >
              캡처 {coveragePct}%
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {toast && (
            <span className="rounded bg-amber-600/90 px-2 py-0.5 text-[10.5px] font-medium text-white">
              {toast}
            </span>
          )}

          {canRecaptureWeb && (
            <button
              type="button"
              onClick={() => onStartAsyncUrlImport?.(doc.source.sourceUrl!, doc.title)}
              className="flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/25"
              title="웹페이지를 끊김 없는 풀페이지 캔버스로 다시 캡처"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{isLegacySemanticWeb ? "시각 캔버스로 캡처" : "전체 다시 캡처"}</span>
            </button>
          )}

          {/* Primary Visual Control: Drag-to-Select Range */}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setSelectMode((v) => !v)}
            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-40 ${
              selectMode
                ? "border-amber-500 bg-amber-600 text-white"
                : "border-[var(--obs-border,#363636)] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/8 hover:text-white"
            }`}
            title={
              selectMode
                ? "영역 선택 켜짐 — 캔버스 위를 드래그해 원하는 범위를 추가 (클릭해 해제)"
                : "클릭 후 캔버스에서 원하는 범위를 드래그해 추가"
            }
          >
            <Crop className="h-3 w-3" />
            <span>{selectMode ? "영역 지정 중" : "영역 추가"}</span>
          </button>

          {/* Zoom */}
          <div className="flex items-center gap-0.5 rounded border border-[var(--obs-border,#363636)] bg-[var(--obs-bg-primary,#1e1e1e)] px-1">
            <button
              type="button"
              onClick={() => setZoomPct((z) => Math.max(50, z - 15))}
              className="p-0.5 text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
              title="축소"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setZoomPct(100)}
              className="w-9 text-center font-code text-[10.5px] text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
              title="100% 맞춤"
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              onClick={() => setZoomPct((z) => Math.min(200, z + 15))}
              className="p-0.5 text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
              title="확대"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>

          {!readOnly && (
            <>
              <input
                ref={appendFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(ev) => {
                  void handleAppendImageFiles(ev.target.files);
                  ev.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => appendFileRef.current?.click()}
                className="rounded p-1 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/8 hover:text-white"
                title="이미지 프레임 추가 (Ctrl+V 붙여넣기 가능)"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {doc.source.sourceUrl && (
            <a
              href={doc.source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/8 hover:text-sky-300"
              title={`원본 열기: ${doc.source.sourceUrl}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={() => setPinsPanelOpen((v) => !v)}
            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${
              pinsPanelOpen
                ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                : "border-[var(--obs-border,#363636)] text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/8"
            }`}
          >
            <MapPin className="h-3 w-3" />
            <span>선택 영역 ({doc.pins.length})</span>
          </button>
        </div>
      </div>

      {/* Main Workspace: Continuous 2D Canvas + Optional Slim User-Clips Drawer */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Continuous Vertical 2D Canvas Viewport */}
        <div className="min-w-0 flex-1 overflow-auto bg-[#141414] px-6 py-5">
          {isLegacySemanticWeb ? (
            /* Legacy web item without visual screenshots yet: render clean readable document sheet (NOT fake BBox boxes!) */
            <div
              ref={(el) => {
                if (el) frameElMapRef.current.set(1, el);
                else frameElMapRef.current.delete(1);
              }}
              style={{ width: `${scaledWidth}px` }}
              className="relative mx-auto overflow-hidden rounded-md border border-white/15 bg-white text-slate-800 shadow-2xl"
            >
              <div className="space-y-4 px-10 py-8 leading-relaxed">
                <h1 className="border-b border-slate-200 pb-3 text-[20px] font-bold text-slate-900">
                  {doc.title}
                </h1>
                {doc.blocks.length > 0 ? (
                  doc.blocks.map((b) => {
                    const isHitBlock = matchedBlock?.id === b.id;
                    return (
                      <div
                        key={b.id}
                        ref={(el) => {
                          if (el) blockElMapRef.current.set(b.id, el);
                          else blockElMapRef.current.delete(b.id);
                        }}
                        data-ref-block-id={b.id}
                        data-highlighted={isHitBlock ? "true" : undefined}
                        className={
                          isHitBlock
                            ? "rounded-md border-l-4 border-amber-500 bg-amber-100/75 px-3 py-2 ring-2 ring-amber-400/70 transition-all"
                            : undefined
                        }
                      >
                        {b.kind === "heading" ? (
                          <h2 className="mt-4 text-[16px] font-bold text-slate-900">
                            {isHitBlock ? renderHighlightedText(b.text) : b.text}
                          </h2>
                        ) : b.kind === "divider" ? (
                          <hr className="my-3 border-slate-200" />
                        ) : b.kind === "media" && b.media?.src?.[0] ? (
                          <img
                            src={b.media.src[0]}
                            alt={b.text}
                            referrerPolicy="no-referrer"
                            className="mx-auto my-3 max-w-full rounded"
                          />
                        ) : b.text ? (
                          <p className="whitespace-pre-line text-[13.5px] leading-7 text-slate-700">
                            {isHitBlock ? renderHighlightedText(b.text) : b.text}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                ) : doc.article?.html ? (
                  <div
                    className="prose prose-sm max-w-none space-y-3 text-[13.5px] leading-7 text-slate-700 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_img]:mx-auto [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded"
                    dangerouslySetInnerHTML={{ __html: doc.article.html }}
                  />
                ) : null}
              </div>

              {/* User-selected range boxes */}
              <div className="pointer-events-none absolute inset-0 z-20">
                {(pinsByFrame.get(1) ?? []).map((pin) => {
                  if (!pin.bbox) return null;
                  const [y0, x0, y1, x1] = pin.bbox;
                  const active = selectedPinId === pin.pinId;
                  return (
                    <div
                      key={pin.pinId}
                      onClick={() => handleJumpToPin(pin)}
                      style={{
                        top: `${y0 / 10}%`,
                        left: `${x0 / 10}%`,
                        height: `${Math.max(1.2, (y1 - y0) / 10)}%`,
                        width: `${Math.max(2, (x1 - x0) / 10)}%`,
                      }}
                      className={`pointer-events-auto absolute cursor-pointer rounded-[3px] border-2 ${
                        active
                          ? "border-amber-500 bg-amber-400/25 ring-2 ring-amber-300"
                          : "border-amber-500/80 bg-amber-400/12 hover:bg-amber-400/20"
                      }`}
                    >
                      <span className="absolute -top-5 left-0 rounded bg-amber-600 px-1.5 py-0.5 font-code text-[10px] font-semibold text-white shadow">
                        {pin.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {selectMode && !readOnly && (
                <div
                  onPointerDown={(ev) => handleFramePointerDown(1, ev)}
                  onPointerMove={(ev) => handleFramePointerMove(1, ev)}
                  onPointerUp={() => handleFramePointerUp(1)}
                  className="absolute inset-0 z-30 cursor-crosshair"
                >
                  {dragState?.frameIndex === 1 && (
                    <div
                      style={{
                        top: `${Math.min(dragState.startY, dragState.curY) / 10}%`,
                        left: `${Math.min(dragState.startX, dragState.curX) / 10}%`,
                        height: `${Math.abs(dragState.curY - dragState.startY) / 10}%`,
                        width: `${Math.abs(dragState.curX - dragState.startX) / 10}%`,
                      }}
                      className="absolute rounded-[2px] border-2 border-dashed border-amber-500 bg-amber-400/20"
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Unified Continuous Canvas Stack: Web full-page strips (gap-0!) / PDF pages / Images */
            <div
              style={{ width: `${scaledWidth}px` }}
              className={`mx-auto flex flex-col ${
                isSeamlessWebCanvas
                  ? "gap-0 overflow-hidden rounded-md border border-white/15 bg-white shadow-2xl"
                  : "gap-4"
              }`}
            >
              {doc.frames.map((frame) => {
                const assetUrl = resolveFrameAssetUrl(frame);
                const aspect = frame.width / Math.max(1, frame.height);
                const fullHeightPx = Math.round(scaledWidth / Math.max(0.05, aspect));
                const placement = webCoverage?.placements.get(frame.index);
                const cropTopPx = placement ? Math.min(fullHeightPx, pxToCanvas(placement.cropTopPx)) : 0;
                const frameHeightPx = fullHeightPx - cropTopPx;
                const framePins = pinsByFrame.get(frame.index) ?? [];
                const isDraggingThis = dragState?.frameIndex === frame.index;
                const isLastFrame = frame === doc.frames[doc.frames.length - 1];

                return (
                  <React.Fragment key={frame.frameId}>
                  {placement && placement.gapBeforePx > 2 && (
                    <UncapturedBand heightPx={pxToCanvas(placement.gapBeforePx)} sourcePx={placement.gapBeforePx} />
                  )}
                  {frameHeightPx > 0 && (
                  <div
                    ref={(el) => {
                      if (el) frameElMapRef.current.set(frame.index, el);
                      else frameElMapRef.current.delete(frame.index);
                    }}
                    style={{
                      width: `${scaledWidth}px`,
                      height: `${frameHeightPx}px`,
                    }}
                    className={`relative shrink-0 overflow-hidden bg-white ${
                      isSeamlessWebCanvas ? "" : "rounded-md border border-white/15 shadow-xl"
                    }`}
                  >
                    {/* Surface Renderer */}
                    {frame.surfaceKind === "pdf-page" && assetUrl ? (
                      <PdfPageSurface
                        url={assetUrl}
                        pageNumber={frame.pageNumber ?? frame.index}
                        renderWidth={scaledWidth}
                        lazy={true}
                        onDocumentMeta={frame.index === 1 ? handlePdfDocumentMeta : undefined}
                      />
                    ) : (frame.surfaceKind === "image" || frame.surfaceKind === "web-tile") &&
                      assetUrl ? (
                      <img
                        src={assetUrl}
                        alt={frame.label || doc.title}
                        draggable={false}
                        loading="lazy"
                        style={
                          cropTopPx > 0
                            ? { height: `${fullHeightPx}px`, marginTop: `-${cropTopPx}px` }
                            : undefined
                        }
                        className={`block w-full select-none bg-white ${
                          cropTopPx > 0 ? "max-w-none" : "h-full object-cover"
                        }`}
                      />
                    ) : (
                      /* Markdown / VDoc plain document surface */
                      <div className="h-full w-full overflow-hidden bg-white p-8 text-slate-800">
                        {doc.blocks
                          .filter((b) => b.frameIndex === frame.index)
                          .map((b) => (
                            <p
                              key={b.id}
                              className={
                                b.kind === "heading"
                                  ? "mb-2 mt-3 text-[16px] font-bold text-slate-900"
                                  : "mb-2 whitespace-pre-line text-[13px] leading-6 text-slate-700"
                              }
                            >
                              {b.text}
                            </p>
                          ))}
                      </div>
                    )}

                    {/* Subtle page number tag on multi-page PDFs only */}
                    {frame.surfaceKind === "pdf-page" && doc.frames.length > 1 && (
                      <div className="pointer-events-none absolute right-2 bottom-2 z-10 rounded bg-black/55 px-1.5 py-0.5 font-code text-[10px] text-white">
                        {frame.index} / {doc.frames.length}
                      </div>
                    )}

                    {/* ONLY User-Selected Range Boxes (NO auto-parsed BBox clutter!) */}
                    {framePins.length > 0 && (
                      <div className="pointer-events-none absolute inset-0 z-20">
                        {framePins.map((pin) => {
                          if (!pin.bbox) return null;
                          const [y0, x0, y1, x1] = pin.bbox;
                          const active = selectedPinId === pin.pinId;
                          return (
                            <div
                              key={pin.pinId}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleJumpToPin(pin);
                              }}
                              style={{
                                top: `${y0 / 10}%`,
                                left: `${x0 / 10}%`,
                                height: `${Math.max(1.2, (y1 - y0) / 10)}%`,
                                width: `${Math.max(2, (x1 - x0) / 10)}%`,
                              }}
                              className={`pointer-events-auto absolute cursor-pointer rounded-[3px] border-2 ${
                                active
                                  ? "border-amber-500 bg-amber-400/25 shadow-lg ring-2 ring-amber-300"
                                  : "border-amber-500/85 bg-amber-400/12 hover:bg-amber-400/20"
                              }`}
                            >
                              <span className="absolute -top-5 left-0 rounded bg-amber-600 px-1.5 py-0.5 font-code text-[10px] font-semibold text-white shadow">
                                {pin.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Drag-to-Select Overlay (active ONLY when user toggled 영역 추가) */}
                    {selectMode && !readOnly && (
                      <div
                        onPointerDown={(ev) => handleFramePointerDown(frame.index, ev)}
                        onPointerMove={(ev) => handleFramePointerMove(frame.index, ev)}
                        onPointerUp={() => handleFramePointerUp(frame.index)}
                        className="absolute inset-0 z-30 cursor-crosshair"
                      >
                        {isDraggingThis && dragState && (
                          <div
                            style={{
                              top: `${Math.min(dragState.startY, dragState.curY) / 10}%`,
                              left: `${Math.min(dragState.startX, dragState.curX) / 10}%`,
                              height: `${Math.abs(dragState.curY - dragState.startY) / 10}%`,
                              width: `${Math.abs(dragState.curX - dragState.startX) / 10}%`,
                            }}
                            className="absolute rounded-[2px] border-2 border-dashed border-amber-500 bg-amber-400/20"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  )}
                  {isLastFrame && webCoverage && webCoverage.tailGapPx > 2 && (
                    <UncapturedBand heightPx={pxToCanvas(webCoverage.tailGapPx)} sourcePx={webCoverage.tailGapPx} />
                  )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Slim Right Drawer: ONLY User-Selected Ranges */}
        {pinsPanelOpen && (
          <aside className="flex w-[268px] shrink-0 flex-col border-l border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] text-[12px]">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--obs-border-subtle,#2d2d2d)] px-3 text-[11.5px] font-semibold">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                <span>선택 영역 ({doc.pins.length})</span>
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setSelectMode((v) => !v)}
                  className={`rounded px-2 py-0.5 text-[10.5px] ${
                    selectMode
                      ? "bg-amber-600 text-white"
                      : "bg-white/8 text-[var(--obs-text-muted,#b3b3b3)] hover:text-white"
                  }`}
                >
                  {selectMode ? "지정 중" : "+ 드래그 추가"}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              {doc.pins.length === 0 ? (
                <div className="py-10 text-center text-[11.5px] leading-relaxed text-[var(--obs-text-faint,#777)]">
                  선택한 영역이 없습니다.
                  <br />
                  상단 <b>영역 추가</b>를 켜고 원하는 구간을 드래그해 추가하세요.
                </div>
              ) : (
                doc.pins.map((pin) => {
                  const active = selectedPinId === pin.pinId;
                  return (
                    <div
                      key={pin.pinId}
                      onClick={() => handleJumpToPin(pin)}
                      className={`cursor-pointer rounded-md border p-2.5 transition ${
                        active
                          ? "border-amber-500 bg-amber-500/12"
                          : "border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-primary,#1e1e1e)] hover:border-white/20"
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-1">
                        <input
                          type="text"
                          disabled={readOnly}
                          value={pin.label}
                          onClick={(ev) => ev.stopPropagation()}
                          onChange={(ev) =>
                            onChangeDoc(updateRefPin(doc, pin.pinId, { label: ev.target.value }))
                          }
                          className="min-w-0 flex-1 bg-transparent font-semibold text-amber-200 outline-none focus:underline"
                        />
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void navigator.clipboard?.writeText(pin.anchor);
                              showToast(`앵커 복사됨: ${pin.anchor}`);
                            }}
                            className="rounded p-1 text-[var(--obs-text-muted,#b3b3b3)] hover:bg-white/10"
                            title="앵커 복사"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {onAttachToAi && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onAttachToAi({
                                  anchor: pin.anchor,
                                  summary: `${doc.title} · ${pin.label}`,
                                  text: pin.note || pin.text || pin.label,
                                  frameIndex: pin.frameIndex,
                                  bbox: pin.bbox,
                                });
                                showToast("AI Composer에 첨부했습니다");
                              }}
                              className="rounded p-1 text-violet-300 hover:bg-violet-500/20"
                              title="AI Composer에 첨부"
                            >
                              <Sparkles className="h-3 w-3" />
                            </button>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onChangeDoc(deleteRefPin(doc, pin.pinId));
                              }}
                              className="rounded p-1 text-[var(--obs-text-faint,#888)] hover:bg-rose-500/20 hover:text-rose-300"
                              title="삭제"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        disabled={readOnly}
                        value={pin.note}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) =>
                          onChangeDoc(updateRefPin(doc, pin.pinId, { note: ev.target.value }))
                        }
                        placeholder="메모 (예: 이 표 스타일 참고)..."
                        className="w-full rounded border border-[var(--obs-border-subtle,#2d2d2d)] bg-[var(--obs-bg-secondary,#262626)] px-2 py-1 text-[11px] outline-none focus:border-amber-500"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
