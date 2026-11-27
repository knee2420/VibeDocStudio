import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  Camera,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileCode2,
  Globe,
  Highlighter,
  Image as ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Upload,
  X,
} from "lucide-react";
import { joinPath, type VaultPort } from "@vibe/vault-core";
import {
  VCLIP_ASSETS_DIR,
  VCLIP_CAPTURE_FILE,
  VCLIP_CONTENT_FILE,
  VCLIP_META_FILE,
  VCLIP_SNAPSHOT_FILE,
  clipBundleFilePath,
  readWebClipBundle,
  writeWebClipBundle,
  type WebClipBundle,
  type WebClipCaptureMode,
  type WebClipCaptureStatus,
} from "@vibe/vault-formats";
import type { EditorHostContext } from "@vibe/workspace-layout/core";

import type { IdeEditorEnv } from "../model/editorAdapters";
import {
  saveScrapedWebClipToVault,
  scrapeWebClipFromApi,
} from "../model/clipClient";
import {
  buildTextFragmentUrl,
  clearResourceHighlight,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";

const STATUS_BADGE: Record<
  WebClipCaptureStatus,
  { readonly label: string; readonly cls: string }
> = {
  full: {
    label: "본문 수집",
    cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  },
  manual: {
    label: "수동 보강",
    cls: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  },
  partial: {
    label: "목록 · 일부",
    cls: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  },
  "blocked-fallback": {
    label: "차단 폴백",
    cls: "border-rose-500/35 bg-rose-500/15 text-rose-300",
  },
};

function renderHighlightedLine(text: string, needle: string): React.ReactNode {
  const clean = needle.trim();
  if (!clean) return text;
  const idx = text.toLowerCase().indexOf(clean.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-300/85 px-0.5 text-slate-950">
        {text.slice(idx, idx + clean.length)}
      </mark>
      {text.slice(idx + clean.length)}
    </>
  );
}

function formatReadableUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURI(trimmed);
  } catch {
    return trimmed;
  }
}

const IMAGE_MD_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

const ReaderContentView: React.FC<{
  readonly bundlePath: string;
  readonly vault: VaultPort;
  readonly contentMd: string;
  readonly highlight: ResourceHighlightRequest | null;
}> = ({ bundlePath, vault, contentMd, highlight }) => {
  const markRef = useRef<HTMLElement | null>(null);
  const assignMarkRef = useCallback((el: HTMLElement | null) => {
    markRef.current = el;
  }, []);
  const quote = highlight?.quoteText?.trim() ?? "";

  useEffect(() => {
    if (highlight && markRef.current) {
      markRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  const blocks = useMemo(() => {
    return contentMd.replace(/\r\n/g, "\n").split(/\n{2,}/);
  }, [contentMd]);

  const firstMatchedIndex = useMemo(() => {
    if (!quote) return -1;
    const lower = quote.toLowerCase();
    return blocks.findIndex((b) => b.toLowerCase().includes(lower));
  }, [blocks, quote]);

  return (
    <article className="mx-auto max-w-[780px] space-y-3.5 px-6 py-6 text-[14px] leading-[1.75] text-[var(--obs-text-normal,#e2e2e2)]">
      {blocks.map((raw, idx) => {
        const block = raw.trim();
        if (!block) return null;
        const isMatched = firstMatchedIndex === idx;
        const wrapRef = isMatched ? assignMarkRef : undefined;

        const imgMatch = IMAGE_MD_RE.exec(block);
        if (imgMatch) {
          const alt = imgMatch[1] || "스크랩 이미지";
          const rawSrc = imgMatch[2];
          let resolvedSrc = rawSrc;
          if (rawSrc.startsWith("./") || rawSrc.startsWith("assets/")) {
            const inner = rawSrc.replace(/^\.\//, "");
            const fullPath = clipBundleFilePath(bundlePath, inner);
            resolvedSrc = vault.getBinaryUrl ? vault.getBinaryUrl(fullPath) : rawSrc;
          }
          return (
            <figure key={idx} ref={wrapRef} className="my-4 flex flex-col items-center gap-1.5">
              <img
                src={resolvedSrc}
                alt={alt}
                referrerPolicy="no-referrer"
                className="max-h-[460px] max-w-full rounded-md border border-white/10 object-contain"
              />
              {alt && alt !== "스크랩 이미지" && (
                <figcaption className="text-[11px] text-[var(--obs-text-muted,#9ca3af)]">
                  {alt}
                </figcaption>
              )}
            </figure>
          );
        }

        if (block.startsWith("# ")) {
          return (
            <h1
              key={idx}
              ref={wrapRef}
              className="border-b border-white/10 pb-2 text-[20px] font-bold leading-snug text-white"
            >
              {renderHighlightedLine(block.slice(2), quote)}
            </h1>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h2
              key={idx}
              ref={wrapRef}
              className="pt-2 text-[16px] font-semibold leading-snug text-slate-100"
            >
              {renderHighlightedLine(block.slice(3), quote)}
            </h2>
          );
        }
        if (block.startsWith("### ")) {
          return (
            <h3 key={idx} ref={wrapRef} className="pt-1 text-[14.5px] font-semibold text-slate-200">
              {renderHighlightedLine(block.slice(4), quote)}
            </h3>
          );
        }
        if (block.startsWith("> ")) {
          const text = block
            .split("\n")
            .map((l) => l.replace(/^>\s?/, ""))
            .join("\n");
          return (
            <blockquote
              key={idx}
              ref={wrapRef}
              className="whitespace-pre-wrap rounded-r border-l-2 border-emerald-400/60 bg-white/[0.03] px-3.5 py-2 text-[13px] text-slate-300"
            >
              {renderHighlightedLine(text, quote)}
            </blockquote>
          );
        }
        if (block === "---") {
          return <hr key={idx} className="my-4 border-white/10" />;
        }

        return (
          <div
            key={idx}
            ref={wrapRef}
            className={`whitespace-pre-wrap break-words rounded px-1 ${
              isMatched ? "bg-amber-400/10 ring-1 ring-amber-400/40" : ""
            }`}
          >
            {renderHighlightedLine(block, quote)}
          </div>
        );
      })}
    </article>
  );
};

export const WebClipTabEditor: React.FC<{
  readonly host: EditorHostContext<IdeEditorEnv>;
}> = ({ host }) => {
  const { vault } = host.env;
  const bundlePath = host.path;

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<"reader" | "snapshot">("reader");
  const [snapshotView, setSnapshotView] = useState<"capture" | "html">("capture");
  const [captureFitMode, setCaptureFitMode] = useState<"fit" | "actual">("fit");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftMd, setDraftMd] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [busyMode, setBusyMode] = useState<WebClipCaptureMode | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<ResourceHighlightRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const metaPath = clipBundleFilePath(bundlePath, VCLIP_META_FILE);
  const contentPath = clipBundleFilePath(bundlePath, VCLIP_CONTENT_FILE);
  const snapshotPath = clipBundleFilePath(bundlePath, VCLIP_SNAPSHOT_FILE);

  const pendingLoadPaths = useMemo(() => {
    void revision;
    const out: string[] = [];
    if (!vault.ensureLoaded) return out;
    for (const p of [metaPath, contentPath, snapshotPath]) {
      if (vault.exists(p) && (!vault.isLoaded || !vault.isLoaded(p))) {
        out.push(p);
      }
    }
    return out;
  }, [vault, metaPath, contentPath, snapshotPath, revision]);

  const loading = pendingLoadPaths.length > 0 && loadedKey !== `${vault.id}:${bundlePath}`;

  // 번들 내부 파일(`clip.json`, `content.md`, 선택 `snapshot.html`) 지연 로드
  useEffect(() => {
    if (pendingLoadPaths.length === 0 || !vault.ensureLoaded) return;
    let cancelled = false;
    const ensure = vault.ensureLoaded.bind(vault);
    void Promise.all(pendingLoadPaths.map((p) => ensure(p).catch(() => ""))).finally(() => {
      if (!cancelled) {
        setLoadedKey(`${vault.id}:${bundlePath}`);
        setRevision((r) => r + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vault, bundlePath, pendingLoadPaths]);

  useEffect(() => {
    return vault.subscribe((ev) => {
      if (ev.type === "modify" && ev.path.startsWith(`${bundlePath}/`)) {
        setRevision((r) => r + 1);
      } else if (ev.type === "create" && ev.node.path.startsWith(`${bundlePath}/`)) {
        setRevision((r) => r + 1);
      } else if (ev.type === "delete" && ev.path.startsWith(`${bundlePath}/`)) {
        setRevision((r) => r + 1);
      }
    });
  }, [vault, bundlePath]);

  useEffect(() => {
    return subscribeResourceHighlight(bundlePath, (req) => {
      setHighlight(req);
      if (req) {
        setActiveTab("reader");
        setEditing(false);
      }
    });
  }, [bundlePath]);

  const bundle: WebClipBundle | null = useMemo(() => {
    void revision;
    return readWebClipBundle(vault, bundlePath);
  }, [vault, bundlePath, revision]);

  const beginEditing = useCallback(() => {
    if (!bundle) return;
    setDraftMd(bundle.contentMd);
    setUrlInput(bundle.meta.url || bundle.meta.canonicalUrl || "");
    setEditing(true);
  }, [bundle]);

  const assetPaths = useMemo(() => {
    void revision;
    const assetsDir = joinPath(bundlePath, VCLIP_ASSETS_DIR);
    if (!vault.exists(assetsDir)) return [];
    return vault
      .listChildren(assetsDir)
      .filter((n) => n.kind === "file")
      .map((n) => n.path);
  }, [vault, bundlePath, revision]);

  const handleSaveManual = useCallback(() => {
    if (!bundle) return;
    const nextUrl = urlInput.trim() || bundle.meta.url;
    const nextMeta = {
      ...bundle.meta,
      url: nextUrl,
      canonicalUrl: nextUrl || bundle.meta.canonicalUrl,
      captureStatus: "manual" as const,
      sourceMethod:
        bundle.meta.captureStatus === "blocked-fallback"
          ? ("user-paste" as const)
          : bundle.meta.sourceMethod,
      captureNote: "이용자 정본 편집 · 보강 완료",
      capturedAt: new Date().toISOString(),
    };
    writeWebClipBundle(vault, bundlePath, {
      meta: nextMeta,
      contentMd: draftMd,
    });
    setEditing(false);
    setStatusMessage("정본(content.md)이 저장되었습니다.");
    setRevision((r) => r + 1);
  }, [bundle, bundlePath, draftMd, urlInput, vault]);

  const handleRescrape = useCallback(
    async (mode: WebClipCaptureMode) => {
      if (!bundle) return;
      const targetUrl = (urlInput.trim() || bundle.meta.url || bundle.meta.canonicalUrl).trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        setStatusMessage("유효한 http(s) URL 을 먼저 입력해 주세요.");
        return;
      }
      setBusyMode(mode);
      setStatusMessage(
        mode === "archive"
          ? "실제 브라우저로 원사이트 화면 캡처 · 이미지 딥 아카이브 수집 중..."
          : "본문 재수집 중..."
      );
      try {
        const scraped = await scrapeWebClipFromApi({
          url: targetUrl,
          mode,
          title: bundle.meta.title,
          sourceMethod: "user-url",
          clipId: bundle.meta.clipId,
        });
        await saveScrapedWebClipToVault(vault, bundlePath, scraped);
        setEditing(false);
        setRevision((r) => r + 1);
        const tileCount = scraped.captureTiles?.length ?? 0;
        if (mode === "archive" && scraped.meta.captureStatus !== "blocked-fallback") {
          setActiveTab("snapshot");
          setSnapshotView(tileCount > 0 ? "capture" : "html");
        }
        setStatusMessage(
          scraped.meta.captureStatus === "blocked-fallback"
            ? `접근 제한 감지 (${scraped.meta.captureNote}) — 편집 버튼으로 본문을 직접 붙여넣을 수 있습니다.`
            : mode === "archive"
              ? tileCount > 0
                ? `딥 아카이브 완료 (원사이트 화면 캡처 ${tileCount}장, ${scraped.wordCount}단어, ${scraped.stageUsed})`
                : `딥 아카이브 완료 (${scraped.wordCount}단어, ${scraped.stageUsed})`
              : `본문 스크랩 완료 (${scraped.wordCount}단어, ${scraped.stageUsed})`
        );
      } catch (err: unknown) {
        setStatusMessage(
          `수집 실패: ${err instanceof Error ? err.message : "서버 연결 확인 필요"}`
        );
      } finally {
        setBusyMode(null);
      }
    },
    [bundle, bundlePath, urlInput, vault]
  );

  const handlePasteInEditor = useCallback(
    async (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = ev.clipboardData?.items;
      if (!items || !vault.importBinaryFiles) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return;
      ev.preventDefault();
      const assetsDir = joinPath(bundlePath, VCLIP_ASSETS_DIR);
      if (!vault.exists(assetsDir)) vault.createFolder(assetsDir);
      const saved = await vault.importBinaryFiles(
        assetsDir,
        imageFiles,
        imageFiles.map((f, idx) => f.name || `paste_${Date.now()}_${idx + 1}.png`)
      );
      const inserted = saved
        .map((p) => `![붙여넣은 이미지](./assets/${p.split("/").pop()})`)
        .join("\n\n");
      setDraftMd((prev) => `${prev.trimEnd()}\n\n${inserted}\n`);
      setStatusMessage(`이미지 ${saved.length}장을 assets/ 에 저장했습니다.`);
    },
    [bundlePath, vault]
  );

  const handleAttachSnapshotFile = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !bundle) return;
      const file = files[0];
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        const htmlText = await file.text();
        writeWebClipBundle(vault, bundlePath, {
          meta: {
            ...bundle.meta,
            hasSnapshotHtml: true,
            sourceMethod: "user-drop",
          },
          contentMd: bundle.contentMd,
          snapshotHtml: htmlText,
        });
        setStatusMessage(`원형 HTML(${file.name})을 snapshot.html 로 보관했습니다.`);
        setActiveTab("snapshot");
        setSnapshotView("html");
        setRevision((r) => r + 1);
      } else if (file.type.startsWith("image/") && vault.importBinaryFiles) {
        const assetsDir = joinPath(bundlePath, VCLIP_ASSETS_DIR);
        if (!vault.exists(assetsDir)) vault.createFolder(assetsDir);
        const targetIsCapture = lower.includes("capture") || !bundle.captureImagePath;
        if (targetIsCapture) {
          await vault.importBinaryFiles(bundlePath, [file], [VCLIP_CAPTURE_FILE]);
        } else {
          await vault.importBinaryFiles(assetsDir, [file], [file.name]);
        }
        setStatusMessage(`이미지(${file.name})를 번들에 추가했습니다.`);
        setActiveTab("snapshot");
        setSnapshotView("capture");
        setRevision((r) => r + 1);
      }
    },
    [bundle, bundlePath, vault]
  );

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 bg-[var(--obs-bg-primary,#1e1e1e)] text-[12px] text-[var(--obs-text-muted,#b3b3b3)]">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
        <span>웹 스크랩 번들 불러오는 중...</span>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--obs-bg-primary,#1e1e1e)] p-6 text-[13px] text-[var(--obs-text-muted,#9ca3af)]">
        웹 스크랩 번들({bundlePath})을 찾을 수 없습니다.
      </div>
    );
  }

  const badge = STATUS_BADGE[bundle.meta.captureStatus];
  const liveUrl = bundle.meta.canonicalUrl || bundle.meta.url;
  const readableUrl = formatReadableUrl(liveUrl);
  const fragmentUrl = liveUrl ? buildTextFragmentUrl(liveUrl, highlight?.quoteText) : "";
  const capturePaths = [
    ...bundle.captureTilePaths,
    ...(bundle.captureImagePath ? [bundle.captureImagePath] : []),
  ];
  const hasCapture = capturePaths.length > 0;
  const hasSnapshotHtml = Boolean(bundle.snapshotHtml && bundle.snapshotHtml.trim());
  const effectiveSnapshotView: "capture" | "html" =
    snapshotView === "html" && hasSnapshotHtml
      ? "html"
      : hasCapture
        ? "capture"
        : hasSnapshotHtml
          ? "html"
          : "capture";
  const archiveCount = capturePaths.length + (hasSnapshotHtml ? 1 : 0) + assetPaths.length;

  const handleCopyUrl = () => {
    if (!liveUrl || !navigator.clipboard) return;
    void navigator.clipboard.writeText(liveUrl).then(() => {
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1500);
    });
  };

  return (
    <div className="flex h-full w-full flex-col bg-[var(--obs-bg-primary,#1e1e1e)] text-[var(--obs-text-normal,#dadada)]">
      {/* 상단 메타 · 액션 바 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--obs-border,#2d2d2d)] bg-[var(--obs-bg-secondary,#252526)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="truncate text-[13px] font-semibold text-white">
            {bundle.meta.title}
          </span>
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}
          >
            {badge.label}
          </span>
          {bundle.meta.domain && (
            <span className="hidden shrink-0 text-[11px] text-[var(--obs-text-muted,#9ca3af)] sm:inline">
              {bundle.meta.domain}
              {bundle.meta.publishedAt ? ` · ${bundle.meta.publishedAt.slice(0, 10)}` : ""}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* 2탭 전환: 정본 | 원형 */}
          <div className="flex rounded-md border border-white/10 bg-black/25 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveTab("reader")}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                activeTab === "reader"
                  ? "bg-emerald-500/20 font-medium text-emerald-200"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="h-3 w-3" />
              정본
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("snapshot")}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                activeTab === "snapshot"
                  ? "bg-emerald-500/20 font-medium text-emerald-200"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Archive className="h-3 w-3" />
              원형
              {archiveCount > 0 && (
                <span className="ml-0.5 rounded bg-emerald-500/25 px-1 text-[9px] text-emerald-200">
                  {archiveCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === "reader" &&
            (editing ? (
              <button
                type="button"
                onClick={handleSaveManual}
                className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30"
              >
                <Save className="h-3 w-3" />
                저장
              </button>
            ) : (
              <button
                type="button"
                onClick={beginEditing}
                className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-200 hover:bg-white/[0.08]"
              >
                <Edit3 className="h-3 w-3" />
                편집 · 붙여넣기
              </button>
            ))}

          <button
            type="button"
            disabled={busyMode !== null}
            onClick={() => void handleRescrape("content")}
            title="본문(content.md) 다시 수집"
            className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
          >
            {busyMode === "content" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            본문 수집
          </button>

          <button
            type="button"
            disabled={busyMode !== null}
            onClick={() => void handleRescrape("archive")}
            title="실제 브라우저로 원사이트 디자인 그대로 연속 화면 캡처 + 이미지 딥 아카이브"
            className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
          >
            {busyMode === "archive" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
            딥 아카이브
          </button>

          {liveUrl && (
            <a
              href={fragmentUrl || liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-sky-300 hover:bg-white/[0.08]"
              title={
                highlight?.quoteText
                  ? "Chrome Text Fragment(#:~:text=)로 원본에서 하이라이트 열기"
                  : "원본 웹페이지 열기"
              }
            >
              <ExternalLink className="h-3 w-3" />
              {highlight?.quoteText ? "원본 하이라이트" : "원본 열기"}
            </a>
          )}

          {liveUrl && host.env.startAsyncUrlRefImport && (
            <button
              type="button"
              onClick={() =>
                host.env.startAsyncUrlRefImport?.({
                  url: liveUrl,
                  title: bundle.meta.title,
                  targetFolder: "00. References",
                })
              }
              title="레이아웃·스타일 참고가 필요할 때만 별도 .ref 로 복제 (원본 리소스 .vclip 과 분리 유지)"
              className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20"
            >
              <BookOpen className="h-3 w-3" />
              .ref 복제
            </button>
          )}
        </div>
      </div>

      {/* 상시 노출 원본 링크 바 — 클릭 시 원사이트 즉시 확인 */}
      {liveUrl && (
        <div
          data-testid="vclip-source-url-bar"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-3 py-1.5 text-[11.5px]"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
              <Link2 className="h-3 w-3" />
              원본 링크
            </span>
            <a
              href={fragmentUrl || liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`원본 웹페이지 바로 열기: ${readableUrl}`}
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-sky-300/95 underline-offset-2 hover:text-sky-200 hover:underline"
            >
              {readableUrl}
            </a>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCopyUrl}
              title="원본 URL 복사"
              className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-slate-300 hover:bg-white/[0.08]"
            >
              {copiedUrl ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-300">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>복사</span>
                </>
              )}
            </button>
            <a
              href={fragmentUrl || liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10.5px] font-medium text-sky-200 hover:bg-sky-500/25"
            >
              <ExternalLink className="h-3 w-3" />
              <span>바로 열기</span>
            </a>
          </div>
        </div>
      )}

      {/* 인용 페어 하이라이트 배너 */}
      {highlight && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11.5px] text-amber-200">
          <div className="flex min-w-0 items-center gap-2">
            <Highlighter className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="truncate">
              근거 하이라이트: <strong>{highlight.quoteText || highlight.label || "인용 위치"}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => clearResourceHighlight(bundlePath)}
            className="rounded p-0.5 text-amber-300 hover:bg-amber-400/20"
            aria-label="하이라이트 닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 차단 폴백 / 알림 배너 */}
      {(bundle.meta.captureStatus === "blocked-fallback" || statusMessage) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-slate-300">
          <span className="truncate">
            {statusMessage ||
              `⚠ ${bundle.meta.captureNote || "안티봇/접근 제한 사이트입니다."} — '편집 · 붙여넣기'로 원문을 넣으면 즉시 리소스 정본으로 전환됩니다.`}
          </span>
          {statusMessage && (
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 본문 영역 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "reader" ? (
          editing ? (
            <div className="mx-auto flex h-full max-w-[820px] flex-col gap-2.5 p-4">
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-[11px] text-slate-400">원본 URL</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2.5 py-1 text-[12px] text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <textarea
                value={draftMd}
                onChange={(e) => setDraftMd(e.target.value)}
                onPaste={(e) => void handlePasteInEditor(e)}
                placeholder="브라우저에서 복사한 본문(또는 이미지 Ctrl+V)을 붙여넣고 저장하세요..."
                className="min-h-[360px] flex-1 resize-none rounded-md border border-white/15 bg-black/30 p-3 font-mono text-[12.5px] leading-relaxed text-slate-100 outline-none focus:border-emerald-400"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Ctrl+V 로 이미지 붙여넣기 시 번들 내 assets/ 폴더에 자동 보관됩니다.</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftMd(bundle.contentMd);
                      setEditing(false);
                    }}
                    className="rounded border border-white/10 px-2.5 py-1 text-slate-300 hover:bg-white/5"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveManual}
                    className="rounded bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-500"
                  >
                    정본 저장
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ReaderContentView
              bundlePath={bundlePath}
              vault={vault}
              contentMd={bundle.contentMd}
              highlight={highlight}
            />
          )
        ) : (
          <div className="flex min-h-full flex-col gap-3 p-4">
            {/* 원형 컨트롤 · 수동 증빙 보강 바 */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2 text-[11.5px]">
              <div className="flex flex-wrap items-center gap-2 text-slate-300">
                {hasCapture && hasSnapshotHtml ? (
                  <div className="flex rounded-md border border-white/10 bg-black/30 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSnapshotView("capture")}
                      className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                        effectiveSnapshotView === "capture"
                          ? "bg-emerald-500/20 font-medium text-emerald-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Camera className="h-3 w-3" />
                      원사이트 화면 캡처 ({capturePaths.length}장)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSnapshotView("html")}
                      className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                        effectiveSnapshotView === "html"
                          ? "bg-emerald-500/20 font-medium text-emerald-200"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <FileCode2 className="h-3 w-3" />
                      HTML 스냅샷
                    </button>
                  </div>
                ) : hasCapture ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                    <Camera className="h-3.5 w-3.5" />
                    원사이트 실제 브라우저 화면 캡처 ({capturePaths.length}장 · 1280px)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-slate-300">
                    <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
                    딥 아카이브로 원사이트 화면을 캡처하거나, 캡처 이미지 · SingleFile `.html`을 첨부할 수 있습니다.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {effectiveSnapshotView === "capture" && hasCapture && (
                  <button
                    type="button"
                    onClick={() =>
                      setCaptureFitMode((m) => (m === "fit" ? "actual" : "fit"))
                    }
                    className="flex items-center gap-1 rounded border border-white/15 bg-white/[0.05] px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                    title="창 너비에 맞추거나 원본 데스크톱 해상도(1280px)로 보기"
                  >
                    {captureFitMode === "fit" ? (
                      <>
                        <Maximize2 className="h-3 w-3" />
                        원본 폭(1280px)
                      </>
                    ) : (
                      <>
                        <Minimize2 className="h-3 w-3" />
                        창 너비 맞춤
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,image/*"
                  className="hidden"
                  onChange={(e) => void handleAttachSnapshotFile(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 rounded border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                >
                  <Upload className="h-3 w-3" />
                  캡처 · HTML 첨부
                </button>
              </div>
            </div>

            {effectiveSnapshotView === "capture" && hasCapture ? (
              <div className="overflow-x-auto rounded-lg border border-white/15 bg-[#121316] shadow-xl">
                {/* 미니 브라우저 프레임 상단 */}
                <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#1f2128] px-3 py-1.5 text-[11px] text-slate-400">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-400/70" />
                      <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                      <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-slate-300">
                      {readableUrl || bundle.meta.domain || bundle.meta.title}
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {bundle.meta.capturedAt
                      ? `캡처: ${bundle.meta.capturedAt.slice(0, 16).replace("T", " ")}`
                      : ""}
                  </span>
                </div>

                {/* 원사이트 연속 화면 타일 스택 */}
                <div
                  data-testid="vclip-capture-stack"
                  className={`mx-auto flex flex-col bg-white ${
                    captureFitMode === "actual" ? "w-[1280px] min-w-[1280px]" : "w-full max-w-[1280px]"
                  }`}
                >
                  {capturePaths.map((imgPath, idx) => {
                    const src = vault.getBinaryUrl ? vault.getBinaryUrl(imgPath) : "";
                    if (!src) return null;
                    return (
                      <img
                        key={imgPath}
                        src={src}
                        alt={`${bundle.meta.title} 원사이트 화면 캡처 ${idx + 1}`}
                        loading={idx < 2 ? "eager" : "lazy"}
                        className="block h-auto w-full select-none"
                      />
                    );
                  })}
                </div>
              </div>
            ) : hasSnapshotHtml ? (
              <div className="flex min-h-[480px] flex-1 flex-col gap-2">
                {!hasCapture && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11.5px] text-amber-200">
                    <span>
                      현재 정적 HTML 스냅샷만 보관되어 있습니다. 원사이트 디자인 그대로 확인하려면{" "}
                      <strong>딥 아카이브</strong>를 다시 실행해 브라우저 화면 캡처를 생성하세요.
                    </span>
                    <button
                      type="button"
                      disabled={busyMode !== null}
                      onClick={() => void handleRescrape("archive")}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                    >
                      <Camera className="h-3 w-3" />
                      화면 캡처 다시 수집
                    </button>
                  </div>
                )}
                <div className="min-h-[440px] flex-1 overflow-hidden rounded-lg border border-white/10 bg-white">
                  <iframe
                    title={`${bundle.meta.title} 원형 스냅샷`}
                    sandbox=""
                    srcDoc={bundle.snapshotHtml ?? ""}
                    className="h-full w-full border-0"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-black/20 py-14 text-center text-[12px] text-slate-400">
                <Camera className="h-7 w-7 opacity-50" />
                <div>보관된 원사이트 화면 캡처가 아직 없습니다.</div>
                <div>
                  상단 <strong>딥 아카이브</strong> 버튼을 누르면 실제 브라우저로 원사이트 디자인 그대로 캡처해 보관합니다.
                </div>
              </div>
            )}

            {assetPaths.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
                  본문 추출 이미지 ({assetPaths.length}장)
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assetPaths.map((imgPath) => {
                    const src = vault.getBinaryUrl ? vault.getBinaryUrl(imgPath) : "";
                    return (
                      <div
                        key={imgPath}
                        className="overflow-hidden rounded-md border border-white/10 bg-black/30 p-1.5"
                      >
                        {src ? (
                          <img
                            src={src}
                            alt={imgPath.split("/").pop() || "asset"}
                            className="h-36 w-full rounded object-cover"
                          />
                        ) : null}
                        <div className="mt-1 truncate text-[10.5px] text-slate-400">
                          {imgPath.split("/").pop()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
