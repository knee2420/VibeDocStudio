/**
 * 통합 리소스 페어 하이라이트 & 점프 버스.
 *
 * `.outline`, `.md`, `.vdoc`, 채팅 어디에서든 `<<resource: 대상 위치 | 인용 본문>>` 을 클릭하면
 * 1) 대상 파일(또는 웹 URL 의 `.ref` 스냅샷)을 같은 Chrome 스타일 페어 탭 그룹으로 열고,
 * 2) 열린 뷰어(`.pdf`, `.md`, `.outline`, `.vdoc`, `.ref`, `.png`, `.csv`, 코드)에
 *    정확한 위치·인용문 하이라이트 요청을 전달한다 (마운트 전이면 TTL 큐에 보관).
 */
import { parseRefJson } from "@vibe/ref-canvas/core";
import {
  basename,
  isClipBundlePath,
  normalizeVaultPath,
  resolveSourcesFolderForPath,
  type VaultPort,
} from "@vibe/vault-core";
import {
  allocateUniqueClipBundlePath,
  findCachedWebClipInVault,
  fromVaultUri,
  writeWebClipBundle,
} from "@vibe/vault-formats";
import { parseResourceTag, type ParsedResourceTag } from "@vibe/vdoc-schema";

import {
  createOfflineFallbackClipBundle,
  saveScrapedWebClipToVault,
  scrapeWebClipFromApi,
} from "./clipClient";

export interface ResourceHighlightRequest {
  readonly id: string;
  readonly targetPath: string;
  readonly sourceUrl?: string;
  readonly page?: number;
  readonly lines?: readonly [number, number];
  readonly bbox?: readonly [number, number, number, number];
  readonly nodeId?: string;
  readonly slotId?: string;
  readonly blockId?: string;
  readonly heading?: string;
  readonly quoteText?: string;
  readonly label?: string;
  readonly createdAt: number;
}

type HighlightListener = (req: ResourceHighlightRequest | null) => void;

const listeners = new Map<string, Set<HighlightListener>>();
const activeHighlights = new Map<string, ResourceHighlightRequest>();
const pendingHighlights = new Map<string, { req: ResourceHighlightRequest; expiresAt: number }>();
const PENDING_TTL_MS = 6000;
let seq = 0;

export function requestResourceHighlight(
  input: Omit<ResourceHighlightRequest, "id" | "createdAt">
): ResourceHighlightRequest {
  seq += 1;
  const normPath = normalizeVaultPath(input.targetPath);
  const req: ResourceHighlightRequest = {
    ...input,
    targetPath: normPath,
    id: `rh-${seq}-${Date.now()}`,
    createdAt: Date.now(),
  };
  activeHighlights.set(normPath, req);

  const subs = listeners.get(normPath);
  if (subs && subs.size > 0) {
    for (const fn of subs) fn(req);
  } else {
    pendingHighlights.set(normPath, { req, expiresAt: Date.now() + PENDING_TTL_MS });
  }
  return req;
}

export function clearResourceHighlight(targetPath: string): void {
  const normPath = normalizeVaultPath(targetPath);
  activeHighlights.delete(normPath);
  pendingHighlights.delete(normPath);
  const subs = listeners.get(normPath);
  if (subs) {
    for (const fn of subs) fn(null);
  }
}

export function getActiveResourceHighlight(targetPath: string): ResourceHighlightRequest | null {
  return activeHighlights.get(normalizeVaultPath(targetPath)) ?? null;
}

export function subscribeResourceHighlight(
  targetPath: string,
  listener: HighlightListener
): () => void {
  const normPath = normalizeVaultPath(targetPath);
  let set = listeners.get(normPath);
  if (!set) {
    set = new Set();
    listeners.set(normPath, set);
  }
  set.add(listener);

  const pending = pendingHighlights.get(normPath);
  if (pending) {
    pendingHighlights.delete(normPath);
    if (pending.expiresAt >= Date.now()) {
      queueMicrotask(() => listener(pending.req));
    }
  } else {
    const existing = activeHighlights.get(normPath);
    if (existing && Date.now() - existing.createdAt < 12000) {
      queueMicrotask(() => listener(existing));
    }
  }

  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(normPath);
  };
}

/** Chrome Text Fragment URL (`url#:~:text=...`) 생성 — 외부 브라우저에서 문구 하이라이트 점프. */
export function buildTextFragmentUrl(url: string, quoteText?: string): string {
  const cleanUrl = url.split("#")[0];
  const quote = (quoteText ?? "").replace(/\s+/g, " ").trim();
  if (!quote) return url;
  // 너무 길면 앞 80자 중심으로 텍스트 프래그먼트 생성
  const snippet = quote.length > 90 ? quote.slice(0, 90).trim() : quote;
  return `${cleanUrl}#:~:text=${encodeURIComponent(snippet)}`;
}

function normalizeUrlForMatch(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
}

/** 볼트 안의 `.ref` 파일 중 `source.sourceUrl` 이 일치하는 캐시 스냅샷을 찾는다. */
export function findCachedWebRefInVault(vault: VaultPort, url: string): string | null {
  const needle = normalizeUrlForMatch(url);
  if (!needle) return null;
  for (const node of vault.listAll()) {
    if (node.kind !== "file" || node.extension !== "ref") continue;
    if (vault.isLoaded && !vault.isLoaded(node.path)) continue;
    try {
      const raw = vault.read(node.path);
      if (!raw.toLowerCase().includes(needle.slice(0, Math.min(needle.length, 32)))) continue;
      const doc = parseRefJson(raw, node.stem);
      const docUrl = doc.source.sourceUrl || doc.article?.url || "";
      if (docUrl && normalizeUrlForMatch(docUrl) === needle) {
        return node.path;
      }
    } catch {
      // Ignore malformed ref files
    }
  }
  return null;
}

function slugifyUrlForCache(url: string): string {
  try {
    const u = new URL(url);
    const raw = `${u.hostname}_${u.pathname}_${u.search}`
      .replace(/[^a-zA-Z0-9가-힣_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64);
    return raw || "web-resource";
  } catch {
    return "web-resource";
  }
}

/** 볼트 파일 및 `.vclip/` 번들 경로 해석 (`vault://`, 정확 경로, 같은 폴더, `sources/`·`resources/`, 파일명/stem 일치). */
export function resolveResourceVaultPath(
  vault: VaultPort,
  rawTarget: string,
  fromPath?: string
): string | null {
  const trimmed = rawTarget.trim();
  if (!trimmed) return null;
  const fromUri = fromVaultUri(trimmed);
  const candidate = normalizeVaultPath(fromUri ?? trimmed);
  if (vault.exists(candidate)) return candidate;

  if (fromPath) {
    const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    if (dir) {
      const sibling = normalizeVaultPath(`${dir}/${candidate}`);
      if (vault.exists(sibling)) return sibling;
      const inSources = normalizeVaultPath(`${dir}/sources/${candidate}`);
      if (vault.exists(inSources)) return inSources;
      const inResources = normalizeVaultPath(`${dir}/resources/${candidate}`);
      if (vault.exists(inResources)) return inResources;
    }
  }

  const needle = candidate.toLowerCase();
  const baseNeedle = basename(candidate).toLowerCase();
  const matches = vault
    .listAll()
    .filter((n) => {
      if (n.kind !== "file" && !isClipBundlePath(n.path)) return false;
      const p = n.path.toLowerCase();
      const b = basename(n.path).toLowerCase();
      const noExt = b.replace(/\.[^.]+$/, "");
      return (
        p === needle ||
        p.endsWith(`/${needle}`) ||
        b === baseNeedle ||
        noExt === baseNeedle
      );
    })
    .sort((a, b) => a.path.length - b.path.length);

  return matches[0]?.path ?? null;
}

export interface OpenResourceInPairOptions {
  readonly vault: VaultPort;
  readonly sourcePath?: string;
  readonly openInPair: (targetPath: string) => void;
}

/**
 * `<<resource: ...>>` 원문 토큰(또는 파싱 결과)을 받아 페어 탭으로 열고 정확히 해당 위치를 하이라이트한다.
 */
export function openResourceTagInPair(
  rawOrParsed: string | ParsedResourceTag,
  options: OpenResourceInPairOptions
): boolean {
  const parsed =
    typeof rawOrParsed === "string" ? parseResourceTag(rawOrParsed) : rawOrParsed;
  if (!parsed) return false;

  const { vault, sourcePath, openInPair } = options;

  if (parsed.isWebUrl) {
    // 1순위: `.vclip/` 웹 스크랩 번들 (사실 근거 1급 리소스)
    const existingClip = findCachedWebClipInVault(vault, parsed.target);
    if (existingClip) {
      requestResourceHighlight({
        targetPath: existingClip,
        sourceUrl: parsed.target,
        page: parsed.page,
        bbox: parsed.bbox,
        blockId: parsed.blockId,
        quoteText: parsed.quote,
        label: parsed.label,
      });
      openInPair(existingClip);
      return true;
    }

    // 2순위(하위 호환): 기존 볼트에 저장된 레거시 웹 `.ref` 스냅샷
    const existingRef = findCachedWebRefInVault(vault, parsed.target);
    if (existingRef) {
      requestResourceHighlight({
        targetPath: existingRef,
        sourceUrl: parsed.target,
        page: parsed.page,
        bbox: parsed.bbox,
        blockId: parsed.blockId,
        quoteText: parsed.quote,
        label: parsed.label,
      });
      openInPair(existingRef);
      return true;
    }

    // 신규 웹 URL 리소스: `.ref` 를 오염시키지 않고 옵시디언 방식 동레이어 `sources/<slug>.vclip/` 번들 생성
    const sourcesFolder = sourcePath
      ? resolveSourcesFolderForPath(sourcePath)
      : ".vibedoc/web-cache";
    if (sourcesFolder && !vault.exists(sourcesFolder)) {
      vault.createFolder(sourcesFolder);
    }
    const bundlePath = allocateUniqueClipBundlePath(
      vault,
      sourcesFolder,
      parsed.label || slugifyUrlForCache(parsed.target)
    );
    const placeholder = createOfflineFallbackClipBundle(parsed.target, {
      title: parsed.label || undefined,
      snippet: parsed.quote,
      reason: "웹 스크랩 본문(content.md)을 백엔드 API(:8090)로 수집 중입니다...",
      mode: "content",
      sourceMethod: "user-url",
    });
    writeWebClipBundle(vault, bundlePath, placeholder);

    requestResourceHighlight({
      targetPath: bundlePath,
      sourceUrl: parsed.target,
      page: parsed.page,
      bbox: parsed.bbox,
      blockId: parsed.blockId,
      quoteText: parsed.quote,
      label: parsed.label,
    });
    openInPair(bundlePath);

    void scrapeWebClipFromApi({
      url: parsed.target,
      mode: "content",
      title: parsed.label,
      sourceMethod: "user-url",
      snippet: parsed.quote,
      clipId: placeholder.meta.clipId,
    })
      .then((scraped) => saveScrapedWebClipToVault(vault, bundlePath, scraped))
      .then(() => {
        requestResourceHighlight({
          targetPath: bundlePath,
          sourceUrl: parsed.target,
          page: parsed.page,
          bbox: parsed.bbox,
          blockId: parsed.blockId,
          quoteText: parsed.quote,
          label: parsed.label,
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        const fallback = createOfflineFallbackClipBundle(parsed.target, {
          title: parsed.label || undefined,
          snippet: parsed.quote,
          reason: `자동 수집 불가 (${msg || "안티봇/오프라인"}). '편집 · 붙여넣기'로 본문을 보강하거나 '원본 하이라이트'를 이용하세요.`,
          mode: "content",
          sourceMethod: "user-url",
          clipId: placeholder.meta.clipId,
        });
        writeWebClipBundle(vault, bundlePath, fallback);
        requestResourceHighlight({
          targetPath: bundlePath,
          sourceUrl: parsed.target,
          page: parsed.page,
          bbox: parsed.bbox,
          blockId: parsed.blockId,
          quoteText: parsed.quote,
          label: parsed.label,
        });
      });

    return true;
  }

  const resolvedPath = resolveResourceVaultPath(vault, parsed.target, sourcePath);
  if (!resolvedPath) return false;

  requestResourceHighlight({
    targetPath: resolvedPath,
    page: parsed.page,
    lines: parsed.lines,
    bbox: parsed.bbox,
    nodeId: parsed.nodeId,
    slotId: parsed.slotId,
    blockId: parsed.blockId,
    heading: parsed.heading,
    quoteText: parsed.quote,
    label: parsed.label,
  });
  openInPair(resolvedPath);
  return true;
}
