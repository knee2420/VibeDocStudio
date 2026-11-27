/**
 * 웹 스크랩 폴더 번들(`.vclip/`) 도메인 계약 및 볼트 저장 어댑터 (`@vibe/vault-formats`).
 *
 * `.ref`(형식·구조 참고 표본)와 완전히 분리된 1급 리소스(사실·근거·인용 원천) 규격이다.
 * 향후 DB + Object Storage 이관을 전제로 `WebClipStore` 포트와 1:1 매핑된다:
 * - `<제목>.vclip/clip.json`     → DB 메타 행 (`clipId` 불변 키)
 * - `<제목>.vclip/content.md`    → DB 본문 텍스트 / 색인 / 줄 앵커(`#L`) 정본
 * - `<제목>.vclip/snapshot.html` → Object Storage 원형 HTML 스냅샷 (선택)
 * - `<제목>.vclip/capture.png`   → Object Storage 캡처 증빙 (선택)
 * - `<제목>.vclip/assets/*`      → Object Storage 로컬 보존 이미지 (선택)
 */
import {
  basename,
  ensureClipBundleName,
  findOwningClipBundlePath,
  isClipBundlePath,
  joinPath,
  normalizeVaultPath,
  stripClipBundleExt,
  type VaultPort,
} from "@vibe/vault-core";

export const VCLIP_PROTOCOL = "vibe-clip/1.0" as const;
export const VCLIP_META_FILE = "clip.json" as const;
export const VCLIP_CONTENT_FILE = "content.md" as const;
export const VCLIP_SNAPSHOT_FILE = "snapshot.html" as const;
export const VCLIP_CAPTURE_FILE = "capture.png" as const;
export const VCLIP_ASSETS_DIR = "assets" as const;
export const VCLIP_CAPTURES_DIR = "captures" as const;

export type WebClipCaptureMode = "bookmark" | "content" | "archive";
export type WebClipCaptureStatus = "full" | "partial" | "manual" | "blocked-fallback";
export type WebClipSourceMethod = "research-auto" | "user-url" | "user-paste" | "user-drop";

export interface WebClipAssetMeta {
  readonly id: string;
  readonly file: string;
  readonly originUrl?: string;
  readonly mime?: string;
  readonly caption?: string;
}

export interface WebClipCaptureTileMeta {
  readonly index: number;
  readonly file: string;
  readonly mime?: string;
  readonly width?: number;
  readonly height?: number;
  readonly scrollY?: number;
  readonly totalHeight?: number;
}

export interface WebClipMeta {
  readonly protocol: typeof VCLIP_PROTOCOL;
  readonly clipId: string;
  readonly url: string;
  readonly canonicalUrl: string;
  readonly domain: string;
  readonly title: string;
  readonly author: string;
  readonly publishedAt: string;
  readonly capturedAt: string;
  readonly captureMode: WebClipCaptureMode;
  readonly sourceMethod: WebClipSourceMethod;
  readonly captureStatus: WebClipCaptureStatus;
  readonly captureNote: string;
  readonly contentSha256: string;
  readonly hasSnapshotHtml: boolean;
  readonly hasCaptureImage: boolean;
  readonly assets: readonly WebClipAssetMeta[];
  readonly captureTiles?: readonly WebClipCaptureTileMeta[];
}

export interface WebClipBundle {
  readonly bundlePath: string;
  readonly meta: WebClipMeta;
  readonly contentMd: string;
  readonly snapshotHtml: string | null;
  readonly captureImagePath: string | null;
  readonly captureTilePaths: readonly string[];
}

/** 향후 DB + Object Storage 어댑터로 무손실 교체하기 위한 웹 스크랩 저장 포트. */
export interface WebClipStore {
  read(bundlePath: string): WebClipBundle | null;
  write(bundlePath: string, bundle: {
    readonly meta: WebClipMeta;
    readonly contentMd: string;
    readonly snapshotHtml?: string | null;
  }): void;
  findByUrl(url: string): string | null;
  findByClipId(clipId: string): string | null;
}

export function clipBundleFilePath(
  bundlePath: string,
  innerPath: string
): string {
  const owner = findOwningClipBundlePath(bundlePath) ?? normalizeVaultPath(bundlePath);
  return joinPath(owner, innerPath);
}

export function extractDomainFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function normalizeUrlForClipMatch(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function slugifyWebClipTitle(raw: string, fallback = "웹스크랩"): string {
  const withoutControls = Array.from(raw, (ch) => (ch.charCodeAt(0) <= 0x1f ? " " : ch)).join("");
  const cleaned = withoutControls
    .replace(/[\\/:*?"<>|#%{}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 72)
    .trim();
  return cleaned || fallback;
}

export function createWebClipMeta(input: {
  readonly clipId?: string;
  readonly url: string;
  readonly canonicalUrl?: string;
  readonly title?: string;
  readonly author?: string;
  readonly publishedAt?: string;
  readonly capturedAt?: string;
  readonly captureMode?: WebClipCaptureMode;
  readonly sourceMethod?: WebClipSourceMethod;
  readonly captureStatus?: WebClipCaptureStatus;
  readonly captureNote?: string;
  readonly contentSha256?: string;
  readonly hasSnapshotHtml?: boolean;
  readonly hasCaptureImage?: boolean;
  readonly assets?: readonly WebClipAssetMeta[];
  readonly captureTiles?: readonly WebClipCaptureTileMeta[];
}): WebClipMeta {
  const cleanUrl = input.url.trim();
  const canonicalUrl = (input.canonicalUrl || cleanUrl).trim();
  const domain = extractDomainFromUrl(canonicalUrl) || extractDomainFromUrl(cleanUrl);
  const captureTiles = input.captureTiles ? [...input.captureTiles] : [];
  return {
    protocol: VCLIP_PROTOCOL,
    clipId:
      input.clipId?.trim() ||
      `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    url: cleanUrl,
    canonicalUrl,
    domain,
    title: (input.title || domain || cleanUrl || "웹 스크랩").trim(),
    author: (input.author || "").trim(),
    publishedAt: (input.publishedAt || "").trim(),
    capturedAt: input.capturedAt || new Date().toISOString(),
    captureMode: input.captureMode ?? "content",
    sourceMethod: input.sourceMethod ?? "user-url",
    captureStatus: input.captureStatus ?? "full",
    captureNote: (input.captureNote || "").trim(),
    contentSha256: input.contentSha256 || "",
    hasSnapshotHtml: Boolean(input.hasSnapshotHtml),
    hasCaptureImage: Boolean(input.hasCaptureImage) || captureTiles.length > 0,
    assets: input.assets ? [...input.assets] : [],
    captureTiles,
  };
}

export function parseWebClipMeta(raw: string, fallbackTitle = "웹 스크랩"): WebClipMeta {
  try {
    const parsed = JSON.parse(raw) as Partial<WebClipMeta>;
    if (parsed && typeof parsed === "object") {
      return createWebClipMeta({
        clipId: typeof parsed.clipId === "string" ? parsed.clipId : undefined,
        url: typeof parsed.url === "string" ? parsed.url : "",
        canonicalUrl: typeof parsed.canonicalUrl === "string" ? parsed.canonicalUrl : undefined,
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : fallbackTitle,
        author: typeof parsed.author === "string" ? parsed.author : "",
        publishedAt: typeof parsed.publishedAt === "string" ? parsed.publishedAt : "",
        capturedAt: typeof parsed.capturedAt === "string" ? parsed.capturedAt : undefined,
        captureMode:
          parsed.captureMode === "bookmark" ||
          parsed.captureMode === "content" ||
          parsed.captureMode === "archive"
            ? parsed.captureMode
            : "content",
        sourceMethod:
          parsed.sourceMethod === "research-auto" ||
          parsed.sourceMethod === "user-url" ||
          parsed.sourceMethod === "user-paste" ||
          parsed.sourceMethod === "user-drop"
            ? parsed.sourceMethod
            : "user-url",
        captureStatus:
          parsed.captureStatus === "full" ||
          parsed.captureStatus === "partial" ||
          parsed.captureStatus === "manual" ||
          parsed.captureStatus === "blocked-fallback"
            ? parsed.captureStatus
            : "partial",
        captureNote: typeof parsed.captureNote === "string" ? parsed.captureNote : "",
        contentSha256: typeof parsed.contentSha256 === "string" ? parsed.contentSha256 : "",
        hasSnapshotHtml: Boolean(parsed.hasSnapshotHtml),
        hasCaptureImage: Boolean(parsed.hasCaptureImage),
        assets: Array.isArray(parsed.assets) ? parsed.assets : [],
        captureTiles: Array.isArray(parsed.captureTiles) ? parsed.captureTiles : [],
      });
    }
  } catch {
    // fallback below
  }
  return createWebClipMeta({
    url: "",
    title: fallbackTitle,
    captureStatus: "partial",
  });
}

export function serializeWebClipMeta(meta: WebClipMeta): string {
  return JSON.stringify(meta, null, 2);
}

export function allocateUniqueClipBundlePath(
  vault: VaultPort,
  folder: string,
  titleOrStem: string
): string {
  const normFolder = normalizeVaultPath(folder);
  const stem = slugifyWebClipTitle(stripClipBundleExt(titleOrStem));
  for (let i = 1; i <= 100; i += 1) {
    const name = ensureClipBundleName(i === 1 ? stem : `${stem} (${i})`);
    const candidate = normFolder ? joinPath(normFolder, name) : name;
    if (!vault.exists(candidate)) return candidate;
  }
  return joinPath(normFolder, ensureClipBundleName(`${stem}-${Date.now().toString(36)}`));
}

export function readWebClipBundle(vault: VaultPort, rawPath: string): WebClipBundle | null {
  const bundlePath = findOwningClipBundlePath(rawPath) ?? normalizeVaultPath(rawPath);
  if (!bundlePath || !isClipBundlePath(bundlePath)) return null;

  const metaPath = clipBundleFilePath(bundlePath, VCLIP_META_FILE);
  const contentPath = clipBundleFilePath(bundlePath, VCLIP_CONTENT_FILE);
  const snapshotPath = clipBundleFilePath(bundlePath, VCLIP_SNAPSHOT_FILE);
  const capturePath = clipBundleFilePath(bundlePath, VCLIP_CAPTURE_FILE);
  const capturesDir = clipBundleFilePath(bundlePath, VCLIP_CAPTURES_DIR);

  const fallbackTitle = stripClipBundleExt(basename(bundlePath));
  const meta = vault.exists(metaPath)
    ? parseWebClipMeta(vault.read(metaPath), fallbackTitle)
    : createWebClipMeta({ url: "", title: fallbackTitle, captureStatus: "partial" });
  const contentMd = vault.exists(contentPath) ? vault.read(contentPath) : "";
  const snapshotHtml = vault.exists(snapshotPath) ? vault.read(snapshotPath) : null;
  const captureImagePath = vault.exists(capturePath) ? capturePath : null;
  const captureTilePaths = vault.exists(capturesDir)
    ? vault
        .listChildren(capturesDir)
        .filter((n) => n.kind === "file")
        .map((n) => n.path)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];

  return {
    bundlePath,
    meta: {
      ...meta,
      hasSnapshotHtml: Boolean(snapshotHtml) || meta.hasSnapshotHtml,
      hasCaptureImage:
        captureTilePaths.length > 0 || Boolean(captureImagePath) || meta.hasCaptureImage,
    },
    contentMd,
    snapshotHtml,
    captureImagePath,
    captureTilePaths,
  };
}

export function writeWebClipBundle(
  vault: VaultPort,
  rawPath: string,
  input: {
    readonly meta: WebClipMeta;
    readonly contentMd: string;
    readonly snapshotHtml?: string | null;
  }
): string {
  const bundlePath = findOwningClipBundlePath(rawPath) ?? normalizeVaultPath(rawPath);
  if (!bundlePath || !isClipBundlePath(bundlePath)) {
    throw new Error(`유효한 .vclip 번들 경로가 아닙니다: ${rawPath}`);
  }
  if (!vault.exists(bundlePath)) {
    vault.createFolder(bundlePath);
  }
  const metaPath = clipBundleFilePath(bundlePath, VCLIP_META_FILE);
  const contentPath = clipBundleFilePath(bundlePath, VCLIP_CONTENT_FILE);
  const snapshotPath = clipBundleFilePath(bundlePath, VCLIP_SNAPSHOT_FILE);

  const nextMeta: WebClipMeta = {
    ...input.meta,
    hasSnapshotHtml:
      input.snapshotHtml !== undefined
        ? Boolean(input.snapshotHtml && input.snapshotHtml.trim())
        : input.meta.hasSnapshotHtml || vault.exists(snapshotPath),
  };

  vault.write(metaPath, serializeWebClipMeta(nextMeta));
  vault.write(contentPath, input.contentMd);
  if (typeof input.snapshotHtml === "string" && input.snapshotHtml.trim()) {
    vault.write(snapshotPath, input.snapshotHtml);
  } else if (input.snapshotHtml === null && vault.exists(snapshotPath)) {
    try {
      vault.delete(snapshotPath);
    } catch {
      // ignore if adapter doesn't allow deletion
    }
  }
  return bundlePath;
}

export function listWebClipBundlesInVault(vault: VaultPort): string[] {
  return vault
    .listAll()
    .filter((node) => node.kind === "folder" && isClipBundlePath(node.path))
    .map((node) => node.path);
}

export function findCachedWebClipInVault(vault: VaultPort, url: string): string | null {
  const needle = normalizeUrlForClipMatch(url);
  if (!needle) return null;
  for (const bundlePath of listWebClipBundlesInVault(vault)) {
    const metaPath = clipBundleFilePath(bundlePath, VCLIP_META_FILE);
    if (!vault.exists(metaPath)) continue;
    if (vault.isLoaded && !vault.isLoaded(metaPath)) continue;
    try {
      const meta = parseWebClipMeta(vault.read(metaPath));
      if (
        (meta.url && normalizeUrlForClipMatch(meta.url) === needle) ||
        (meta.canonicalUrl && normalizeUrlForClipMatch(meta.canonicalUrl) === needle)
      ) {
        return bundlePath;
      }
    } catch {
      // ignore malformed clip.json
    }
  }
  return null;
}

export function findWebClipByIdInVault(vault: VaultPort, clipId: string): string | null {
  const id = clipId.trim();
  if (!id) return null;
  for (const bundlePath of listWebClipBundlesInVault(vault)) {
    const metaPath = clipBundleFilePath(bundlePath, VCLIP_META_FILE);
    if (!vault.exists(metaPath)) continue;
    if (vault.isLoaded && !vault.isLoaded(metaPath)) continue;
    try {
      const meta = parseWebClipMeta(vault.read(metaPath));
      if (meta.clipId === id) return bundlePath;
    } catch {
      // ignore
    }
  }
  return null;
}

export function createVaultClipStore(vault: VaultPort): WebClipStore {
  return {
    read: (bundlePath) => readWebClipBundle(vault, bundlePath),
    write: (bundlePath, bundle) => {
      writeWebClipBundle(vault, bundlePath, bundle);
    },
    findByUrl: (url) => findCachedWebClipInVault(vault, url),
    findByClipId: (clipId) => findWebClipByIdInVault(vault, clipId),
  };
}
