import type { OutlineNode } from "@vibe/outliner/core";
import type { EvidenceLocator } from "@vibe/vdoc-schema";
import { basename, dirname, joinPath, normalizeVaultPath, type VaultPort } from "@vibe/vault-core";
import { fromVaultUri, isOutlinePath, isVDocPath } from "@vibe/vault-formats";

/** 문서 파일(편집 대상 · 레퍼런스)은 사실 리소스에서 제외한다. */
const EXCLUDED_DOC_EXT = /\.(vdoc(\.json)?|outline|ref)$/i;
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const RESOURCE_VAULT_RE = /resource:vault:([^\s)\]"']+)/g;
const IMG_ARROW_RE = /\[img(?::\d+)?:[^\]\n]*->\s*([^\]\n]+)\]/gi;

export interface OutlineCollectedResource {
  readonly path: string;
  readonly kind: "file" | "folder";
  readonly source: "attachment" | "wikilink" | "token" | "evidence";
  readonly nodeId: string;
}

export interface OutlineResourceCollection {
  readonly items: readonly OutlineCollectedResource[];
  /** 수집된 리소스들이 속한 고유 폴더 목록 (옵트인 마운트 제안용) */
  readonly folders: readonly string[];
}

function isExcludedDocumentPath(path: string): boolean {
  return isVDocPath(path) || isOutlinePath(path) || EXCLUDED_DOC_EXT.test(path);
}

function resolveVaultTarget(
  vault: VaultPort,
  outlineDir: string,
  rawTarget: string
): { path: string; kind: "file" | "folder" } | null {
  const trimmed = rawTarget.trim();
  if (!trimmed || /^(https?:\/\/|data:|blob:)/i.test(trimmed)) return null;
  const unwrapped = trimmed.startsWith("resource:vault:")
    ? trimmed.slice("resource:vault:".length)
    : (fromVaultUri(trimmed) ?? trimmed);
  const candidates = [
    normalizeVaultPath(unwrapped),
    outlineDir ? normalizeVaultPath(joinPath(outlineDir, unwrapped)) : "",
  ].filter(Boolean);

  for (const cand of candidates) {
    const node = vault.getNode(cand);
    if (node) return { path: node.path, kind: node.kind };
  }

  // Obsidian-style `[[NoteName]]` stem/basename lookup (files before folders, exact basename before stem)
  const lower = unwrapped.toLowerCase();
  const hasExt = /\.[a-z0-9]+$/i.test(lower);
  const all = vault.listAll().filter((n) => !n.path.split("/").some((seg) => seg.startsWith(".")));
  for (const node of all) {
    if (node.kind !== "file") continue;
    const base = basename(node.path).toLowerCase();
    if (base === lower || node.path.toLowerCase() === lower) {
      return { path: node.path, kind: "file" };
    }
  }
  if (!hasExt) {
    let excludedMatch: { path: string; kind: "file" } | null = null;
    for (const node of all) {
      if (node.kind !== "file") continue;
      const base = basename(node.path).toLowerCase();
      const stem = base.replace(/\.[^.]+$/, "");
      if (stem === lower) {
        if (!isExcludedDocumentPath(node.path)) return { path: node.path, kind: "file" };
        if (!excludedMatch) excludedMatch = { path: node.path, kind: "file" };
      }
    }
    if (excludedMatch) return excludedMatch;
  }
  for (const node of all) {
    if (node.kind !== "folder") continue;
    const base = basename(node.path).toLowerCase();
    if (base === lower || node.path.toLowerCase() === lower) {
      return { path: node.path, kind: "folder" };
    }
  }
  return null;
}

/**
 * `.outline` 트리 안의 첨부(`node.file.target`), 위키링크(`[[...]]`), `[img:... -> 경로]`,
 * `resource:vault:...`, 사이드카 `nodeEvidence` 에서 **순수 리소스(문서 파일 제외)**만 추출한다.
 *
 * 사용자 리소스 설정(`sourcesOn` / `resourceFolders`)을 우회해 강제 마운트하지 않고,
 * 제안 칩이나 설정바 옵트인 목록으로 제공하는 용도다.
 */
export function collectOutlineResources(
  vault: VaultPort,
  outlinePath: string,
  roots: readonly OutlineNode[],
  nodeEvidence?: Record<string, EvidenceLocator[]>
): OutlineResourceCollection {
  const outlineDir = dirname(outlinePath);
  const seen = new Set<string>();
  const items: OutlineCollectedResource[] = [];
  const folderSet = new Set<string>();

  const push = (raw: string, source: OutlineCollectedResource["source"], nodeId: string) => {
    const hit = resolveVaultTarget(vault, outlineDir, raw);
    if (!hit) return;
    if (hit.kind === "file" && isExcludedDocumentPath(hit.path)) return;
    if (seen.has(hit.path)) return;
    seen.add(hit.path);
    items.push({ path: hit.path, kind: hit.kind, source, nodeId });
    const folder = hit.kind === "folder" ? hit.path : dirname(hit.path);
    if (folder) folderSet.add(folder);
  };

  const walk = (nodes: readonly OutlineNode[]) => {
    for (const node of nodes) {
      if (node.file?.target) push(node.file.target, "attachment", node.id);
      const scanText = `${node.text}\n${node.note ?? ""}`;
      for (const m of scanText.matchAll(WIKILINK_RE)) {
        if (m[1]) push(m[1], "wikilink", node.id);
      }
      for (const m of scanText.matchAll(RESOURCE_VAULT_RE)) {
        if (m[1]) push(`resource:vault:${m[1]}`, "token", node.id);
      }
      for (const m of scanText.matchAll(IMG_ARROW_RE)) {
        if (m[1]) push(m[1], "token", node.id);
      }
      const evs = nodeEvidence?.[node.id];
      if (evs) {
        for (const loc of evs) {
          if (loc.sourcePath) push(loc.sourcePath, "evidence", node.id);
        }
      }
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(roots);

  return {
    items,
    folders: [...folderSet].sort((a, b) => a.localeCompare(b)),
  };
}
