/**
 * 볼트 스타일 목록 — 볼트의 `.vstyle` 와 기본 제공 스타일 팩을 모으고, 문서에 묶인 팩을 찾는다.
 * 볼트 팩이 같은 id 의 기본 팩을 덮어써서 편집 중인 값이 이긴다.
 */
import {
  BUILTIN_STYLE_PACKS,
  getBuiltinStylePack,
  isValidStylePack,
  resolveDefaultStylePack,
  type StylePack,
  type VDocStyleRef,
} from "@vibe/style-core";
import { resolveDocumentView, type VDocDocument } from "@vibe/vdoc-schema";
import type { VaultPort } from "@vibe/vault-core";

import { fromVaultUri, toVaultUri } from "./vdoc";

export interface VaultStyleCatalogEntry {
  readonly id: string;
  readonly pack: StylePack;
  readonly vaultPath?: string;
  readonly source: "vault" | "builtin";
}

/**
 * `.vdoc` 문서 바로 옆에 1:1 로 붙는 단일 동반 `.vstyle` 파일 경로를 반환한다.
 * 예: `"05. AI Eval/제안요청서.vdoc"` → `"05. AI Eval/제안요청서.vstyle"`.
 */
export function companionStylePathForVDoc(docPath: string): string {
  const normalized = docPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.endsWith(".vdoc.json")) {
    return `${normalized.slice(0, -".vdoc.json".length)}.vstyle`;
  }
  if (normalized.endsWith(".vdoc")) {
    return `${normalized.slice(0, -".vdoc".length)}.vstyle`;
  }
  return `${normalized}.vstyle`;
}

function readVaultStyleEntryAtPath(
  vault: VaultPort,
  targetPath: string,
  catalog: readonly VaultStyleCatalogEntry[]
): VaultStyleCatalogEntry | null {
  if (!targetPath || !vault.exists(targetPath)) return null;
  const inCatalog = catalog.find((c) => c.vaultPath === targetPath);
  if (inCatalog) return inCatalog;
  try {
    const parsed = JSON.parse(vault.read(targetPath)) as unknown;
    if (isValidStylePack(parsed)) {
      return { id: parsed.id, pack: parsed, vaultPath: targetPath, source: "vault" };
    }
  } catch {
    // Ignore malformed style files
  }
  return null;
}



/**
 * Discovers all `.vstyle` / `.vstyle.json` packs in the vault plus built-in style packs.
 * Vault packs override built-in packs with the same `id` so live edits take precedence.
 */
export function collectVaultStyleEntries(vault: VaultPort): VaultStyleCatalogEntry[] {
  const byId = new Map<string, VaultStyleCatalogEntry>();
  for (const builtin of BUILTIN_STYLE_PACKS) {
    byId.set(builtin.id, {
      id: builtin.id,
      pack: builtin,
      source: "builtin",
    });
  }
  for (const node of vault.listAll()) {
    if (
      node.kind !== "file" ||
      (!node.path.endsWith(".vstyle") && !node.path.endsWith(".vstyle.json"))
    ) {
      continue;
    }
    try {
      const parsed = JSON.parse(vault.read(node.path)) as unknown;
      if (isValidStylePack(parsed)) {
        byId.set(parsed.id, {
          id: parsed.id,
          pack: parsed,
          vaultPath: node.path,
          source: "vault",
        });
      }
    } catch {
      // Ignore malformed style files safely
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.source !== b.source) return a.source === "vault" ? -1 : 1;
    return a.pack.name.localeCompare(b.pack.name, "ko");
  });
}

/** Resolves the active StylePack entry bound to a `.vdoc` document (with single colocated companion `.vstyle` discovery). */
export function resolveActiveStyleEntry(
  doc: VDocDocument,
  vault: VaultPort,
  catalog: readonly VaultStyleCatalogEntry[],
  docPath?: string | null
): VaultStyleCatalogEntry | null {
  // 1) 문서에 명시된 packPath 포인터가 유효하면 최우선
  if (doc.styleRef?.packPath) {
    const targetPath = fromVaultUri(doc.styleRef.packPath);
    const hit = targetPath ? readVaultStyleEntryAtPath(vault, targetPath, catalog) : null;
    if (hit) return hit;
  }

  // 2) 문서 바로 옆에 붙은 단일 동반 `.vstyle` 파일 자동 발견 (styleRef 가 생략/유실되어도 A4 스타일 유지)
  if (docPath) {
    const companionPath = companionStylePathForVDoc(docPath);
    const companionHit = readVaultStyleEntryAtPath(vault, companionPath, catalog);
    if (companionHit) return companionHit;
  }

  // 3) 명시적 packId 폴백
  if (doc.styleRef?.packId) {
    const byId = catalog.find((c) => c.id === doc.styleRef?.packId);
    if (byId) return byId;
    const builtin = getBuiltinStylePack(doc.styleRef.packId);
    if (builtin) return { id: builtin.id, pack: builtin, source: "builtin" };
  }

  // 4) 뷰 기본 팩 (blog / web)
  const view = resolveDocumentView(doc);
  if (view.id === "blog" || view.id === "web") {
    const defPack = resolveDefaultStylePack(view.id);
    return (
      catalog.find((c) => c.id === defPack.id) ?? {
        id: defPack.id,
        pack: defPack,
        source: "builtin",
      }
    );
  }
  return null;
}

/** Builds a clean `VDocStyleRef` pointer when switching packs in the Inspector. */
export function buildStyleRefForEntry(
  entry: VaultStyleCatalogEntry,
  mode?: string
): VDocStyleRef {
  const modeKeys = Object.keys(entry.pack.modes ?? {});
  const resolvedMode =
    mode && modeKeys.includes(mode) ? mode : modeKeys[0] ?? "default";
  return {
    packId: entry.pack.id,
    ...(entry.vaultPath ? { packPath: toVaultUri(entry.vaultPath) } : {}),
    mode: resolvedMode,
    version: entry.pack.version,
  };
}
