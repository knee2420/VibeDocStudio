/**
 * 통합 리소스 페어 하이라이트 & 점프 버스.
 *
 * `.outline`, `.md`, `.vdoc`, 채팅 어디에서든 `<<resource: 대상 위치 | 인용 본문>>` 을 클릭하면
 * 1) 대상 파일(또는 웹 URL 의 `.ref` 스냅샷)을 같은 Chrome 스타일 페어 탭 그룹으로 열고,
 * 2) 열린 뷰어(`.pdf`, `.md`, `.outline`, `.vdoc`, `.ref`, `.png`, `.csv`, 코드)에
 *    정확한 위치·인용문 하이라이트 요청을 전달한다 (마운트 전이면 TTL 큐에 보관).
 */
import { parseRefJson, serializeRefJson, type RefDocument } from "@vibe/ref-canvas/core";
import { basename, normalizeVaultPath, type VaultPort } from "@vibe/vault-core";
import { fromVaultUri } from "@vibe/vault-formats";
import { parseResourceTag, type ParsedResourceTag } from "@vibe/vdoc-schema";

import { importWebUrlAsRefStream } from "./refClient";

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

function createWebFallbackRefDoc(url: string, quoteText?: string, reason?: string): RefDocument {
  const now = Date.now();
  let hostLabel = url;
  try {
    hostLabel = new URL(url).hostname;
  } catch {
    // keep raw url
  }
  const summaryText = quoteText
    ? quoteText
    : `${url} 웹페이지 리소스입니다. 서버 자동 캡처가 차단되었거나 오프라인 상태입니다.`;
  return {
    version: 1,
    refId: `web-fallback-${now}`,
    title: `${hostLabel} — 웹 리소스 스냅샷`,
    status: "structured",
    source: {
      originType: "web",
      uri: url,
      sourceName: hostLabel,
      sourceUrl: url,
      capturedAt: now,
    },
    layerSet: "web",
    enabledLayers: {},
    frames: [
      {
        frameId: "frame-1",
        index: 1,
        surfaceKind: "semantic-canvas",
        width: 960,
        height: 680,
        label: hostLabel,
        title: `${hostLabel} (웹 리소스 폴백)`,
      },
    ],
    blocks: [
      {
        id: "blk-web-quote",
        frameIndex: 1,
        kind: "callout",
        text: summaryText,
        bbox: [120, 60, 420, 940],
      },
      {
        id: "blk-web-notice",
        frameIndex: 1,
        kind: "text",
        text:
          reason ??
          "안티봇/네트워크 제약으로 자동 캡처가 완료되지 않았습니다. 상단 '원본에서 하이라이트 열기'로 브라우저 Text Fragment 점프를 사용하거나 본문을 붙여넣어 스냅샷을 갱신할 수 있습니다.",
        bbox: [450, 60, 650, 940],
      },
    ],
    outline: [{ blockId: "blk-web-quote", title: hostLabel, level: 1, frameIndex: 1 }],
    layers: [],
    metrics: {},
    pins: [],
    consensus: [],
    article: {
      title: `${hostLabel} — 웹 리소스`,
      siteName: hostLabel,
      url,
      html: `<p>${summaryText}</p>`,
      text: `${summaryText}\n\n${reason ?? ""}`.trim(),
    },
    nameSource: "auto",
    createdAt: now,
    updatedAt: now,
  };
}

/** 볼트 파일 경로 해석 (`vault://`, 정확 경로, 같은 폴더, 파일명/stem 일치). */
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
      const inResources = normalizeVaultPath(`${dir}/resources/${candidate}`);
      if (vault.exists(inResources)) return inResources;
    }
  }

  const needle = candidate.toLowerCase();
  const baseNeedle = basename(candidate).toLowerCase();
  const matches = vault
    .listAll()
    .filter((n) => {
      if (n.kind !== "file") return false;
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

    // 캐시된 `.ref` 가 없으면 `.vibedoc/web-cache/<slug>.ref` 에 폴백/진행 카드를 즉시 열어 두고 비동기 캡처 시도
    const cacheDir = ".vibedoc/web-cache";
    const cachePath = `${cacheDir}/${slugifyUrlForCache(parsed.target)}.ref`;
    if (!vault.exists(cachePath)) {
      const placeholder = createWebFallbackRefDoc(
        parsed.target,
        parsed.quote,
        "웹페이지 스냅샷을 백엔드 API(:8090)로 수집 시도 중입니다..."
      );
      vault.write(cachePath, serializeRefJson(placeholder));
    }
    requestResourceHighlight({
      targetPath: cachePath,
      sourceUrl: parsed.target,
      page: parsed.page,
      bbox: parsed.bbox,
      blockId: parsed.blockId,
      quoteText: parsed.quote,
      label: parsed.label,
    });
    openInPair(cachePath);

    void importWebUrlAsRefStream(parsed.target, parsed.label, () => {
      // silent progress stream
    })
      .then((captured) => {
        vault.write(cachePath, serializeRefJson(captured));
        requestResourceHighlight({
          targetPath: cachePath,
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
        const fallback = createWebFallbackRefDoc(
          parsed.target,
          parsed.quote,
          `자동 캡처 불가 (${msg || "안티봇/오프라인"}). 아래 '원본에서 하이라이트 열기' 버튼을 이용하세요.`
        );
        vault.write(cachePath, serializeRefJson(fallback));
        requestResourceHighlight({
          targetPath: cachePath,
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
