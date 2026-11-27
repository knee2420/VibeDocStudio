/**
 * 웹 스크랩(`.vclip/`) 백엔드 수집 클라이언트 및 볼트 번들 저장 헬퍼.
 *
 * `.ref`(형식·구조 참고)와 완전히 분리되어 `/api/webclips/scrape` 만 호출한다.
 */
import {
  joinPath,
  resolveSourcesFolderForPath,
  type SourcesFolderPolicy,
  type VaultPort,
} from "@vibe/vault-core";
import {
  VCLIP_ASSETS_DIR,
  VCLIP_CAPTURES_DIR,
  allocateUniqueClipBundlePath,
  createWebClipMeta,
  writeWebClipBundle,
  type WebClipCaptureMode,
  type WebClipMeta,
  type WebClipSourceMethod,
} from "@vibe/vault-formats";

export interface WebClipAssetPayloadDto {
  readonly id: string;
  readonly file: string;
  readonly mime: string;
  readonly base64: string;
  readonly originUrl?: string;
  readonly caption?: string;
}

export interface WebClipCaptureTilePayloadDto {
  readonly index: number;
  readonly file: string;
  readonly mime: string;
  readonly width?: number;
  readonly height?: number;
  readonly scrollY?: number;
  readonly totalHeight?: number;
  readonly base64: string;
}

export interface WebClipScrapeResponseDto {
  readonly meta: WebClipMeta;
  readonly contentMd: string;
  readonly snapshotHtml?: string | null;
  readonly assets?: readonly WebClipAssetPayloadDto[];
  readonly captureTiles?: readonly WebClipCaptureTilePayloadDto[];
  readonly wordCount: number;
  readonly stageUsed: string;
}

export interface ScrapeWebClipParams {
  readonly url: string;
  readonly mode?: WebClipCaptureMode;
  readonly title?: string;
  readonly sourceMethod?: WebClipSourceMethod;
  readonly snippet?: string;
  readonly clipId?: string;
}

export async function scrapeWebClipFromApi(
  params: ScrapeWebClipParams
): Promise<WebClipScrapeResponseDto> {
  const res = await fetch("/api/webclips/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: params.url,
      mode: params.mode ?? "content",
      title: params.title ?? "",
      sourceMethod: params.sourceMethod ?? "user-url",
      snippet: params.snippet ?? "",
      clipId: params.clipId ?? "",
    }),
  });
  if (!res.ok) {
    let detail = `웹 스크랩 요청 실패 (${res.status})`;
    try {
      const err = (await res.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      // keep default detail
    }
    throw new Error(detail);
  }
  return (await res.json()) as WebClipScrapeResponseDto;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function saveScrapedWebClipToVault(
  vault: VaultPort,
  bundlePath: string,
  scraped: WebClipScrapeResponseDto
): Promise<string> {
  writeWebClipBundle(vault, bundlePath, {
    meta: scraped.meta,
    contentMd: scraped.contentMd,
    snapshotHtml: scraped.snapshotHtml ?? null,
  });

  const captureTiles = scraped.captureTiles ?? [];
  if (captureTiles.length > 0 && vault.importBinaryFiles) {
    const capturesDir = joinPath(bundlePath, VCLIP_CAPTURES_DIR);
    if (vault.exists(capturesDir)) {
      for (const oldNode of vault.listChildren(capturesDir)) {
        if (oldNode.kind === "file") {
          try {
            vault.delete(oldNode.path);
          } catch {
            // overwrite below if deletion fails
          }
        }
      }
    } else {
      vault.createFolder(capturesDir);
    }
    const tileBlobs: Blob[] = [];
    const tileNames: string[] = [];
    for (const tile of captureTiles) {
      if (!tile.base64) continue;
      tileBlobs.push(base64ToBlob(tile.base64, tile.mime || "image/jpeg"));
      tileNames.push(tile.file.split("/").pop() || `shot_${String(tile.index).padStart(2, "0")}.jpg`);
    }
    if (tileBlobs.length > 0) {
      await vault.importBinaryFiles(capturesDir, tileBlobs, tileNames);
    }
  }

  const assets = scraped.assets ?? [];
  if (assets.length > 0 && vault.importBinaryFiles) {
    const assetsDir = joinPath(bundlePath, VCLIP_ASSETS_DIR);
    if (!vault.exists(assetsDir)) {
      vault.createFolder(assetsDir);
    }
    const blobs: Blob[] = [];
    const names: string[] = [];
    for (const asset of assets) {
      if (!asset.base64) continue;
      blobs.push(base64ToBlob(asset.base64, asset.mime || "image/jpeg"));
      names.push(asset.file.split("/").pop() || `${asset.id}.jpg`);
    }
    if (blobs.length > 0) {
      await vault.importBinaryFiles(assetsDir, blobs, names);
    }
  }
  return bundlePath;
}

export function createOfflineFallbackClipBundle(
  url: string,
  opts?: {
    readonly title?: string;
    readonly snippet?: string;
    readonly reason?: string;
    readonly mode?: WebClipCaptureMode;
    readonly sourceMethod?: WebClipSourceMethod;
    readonly clipId?: string;
  }
): { readonly meta: WebClipMeta; readonly contentMd: string } {
  const meta = createWebClipMeta({
    clipId: opts?.clipId,
    url,
    title: opts?.title,
    captureMode: opts?.mode ?? "content",
    sourceMethod: opts?.sourceMethod ?? "user-url",
    captureStatus: "blocked-fallback",
    captureNote:
      opts?.reason ??
      "자동 수집에 연결하지 못했습니다. 본문을 붙여넣고 저장하면 즉시 리소스 정본으로 전환됩니다.",
  });
  const lines = [
    `# ${meta.title}`,
    "",
    `> ${meta.captureNote}`,
    `> 원본 주소: ${meta.canonicalUrl || meta.url}`,
  ];
  if (opts?.snippet?.trim()) {
    lines.push("", "## 인용 / 요약", "", opts.snippet.trim());
  }
  lines.push(
    "",
    "---",
    "",
    "브라우저에서 원문을 복사해 이 탭에 붙여넣고 저장하면 `manual` 정본 리소스로 전환됩니다."
  );
  return { meta, contentMd: `${lines.join("\n")}\n` };
}

export async function scrapeAndSaveWebClipBundle(
  vault: VaultPort,
  options: {
    readonly url: string;
    readonly activePath?: string | null;
    readonly targetFolder?: string;
    readonly sourcesPolicy?: SourcesFolderPolicy;
    readonly mode?: WebClipCaptureMode;
    readonly title?: string;
    readonly sourceMethod?: WebClipSourceMethod;
    readonly snippet?: string;
  }
): Promise<{ readonly bundlePath: string; readonly meta: WebClipMeta }> {
  const folder =
    options.targetFolder !== undefined
      ? options.targetFolder
      : resolveSourcesFolderForPath(options.activePath, options.sourcesPolicy);
  if (folder && !vault.exists(folder)) {
    vault.createFolder(folder);
  }

  try {
    const scraped = await scrapeWebClipFromApi({
      url: options.url,
      mode: options.mode ?? "content",
      title: options.title,
      sourceMethod: options.sourceMethod ?? "user-url",
      snippet: options.snippet,
    });
    const bundlePath = allocateUniqueClipBundlePath(
      vault,
      folder,
      options.title || scraped.meta.title || scraped.meta.domain || "웹스크랩"
    );
    await saveScrapedWebClipToVault(vault, bundlePath, scraped);
    return { bundlePath, meta: scraped.meta };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : "네트워크 또는 서버 연결 실패";
    const fallback = createOfflineFallbackClipBundle(options.url, {
      title: options.title,
      snippet: options.snippet,
      reason,
      mode: options.mode,
      sourceMethod: options.sourceMethod,
    });
    const bundlePath = allocateUniqueClipBundlePath(
      vault,
      folder,
      options.title || fallback.meta.title || fallback.meta.domain || "웹스크랩"
    );
    writeWebClipBundle(vault, bundlePath, fallback);
    return { bundlePath, meta: fallback.meta };
  }
}
