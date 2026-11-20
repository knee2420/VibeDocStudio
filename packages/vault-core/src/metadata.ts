import { basename, dirname, extname, normalizeVaultPath, stem } from "./path";
import type { VaultEvent, VaultPort } from "./types";

export interface VaultHeadingRef {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

export interface VaultLinkRef {
  readonly raw: string;
  readonly target: string;
  readonly subpath: string | null;
  readonly alias: string | null;
  readonly embed: boolean;
  readonly line: number;
}

export interface VaultFileMetadata {
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly headings: readonly VaultHeadingRef[];
  readonly links: readonly VaultLinkRef[];
}

export interface WikilinkRewriteSummary {
  readonly updatedFiles: readonly string[];
  readonly totalReplacements: number;
}

/**
 * 파일 이름변경/이동 시 Vault 내 포인터(`.md` [[링크]], `.vdoc` targetPath 등)를
 * 갱신하는 범용 리라이트 훅 계약.
 */
export type VaultRenameRewriter = (
  vault: VaultPort,
  oldPath: string,
  newPath: string
) => WikilinkRewriteSummary;

export function runVaultRenameRewriters(
  vault: VaultPort,
  oldPath: string,
  newPath: string,
  rewriters: readonly VaultRenameRewriter[]
): WikilinkRewriteSummary {
  const updated = new Set<string>();
  let totalReplacements = 0;
  for (const rewriter of rewriters) {
    const res = rewriter(vault, oldPath, newPath);
    for (const filePath of res.updatedFiles) updated.add(filePath);
    totalReplacements += res.totalReplacements;
  }
  return {
    updatedFiles: Array.from(updated),
    totalReplacements,
  };
}

const WIKILINK_RE = /(!)?\[\[([^\]\n]+)\]\]/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;
const INLINE_TAG_RE = /(?:^|[\s(])#([a-zA-Z0-9_\-/\uAC00-\uD7A3]+)/g;

function parseSimpleYamlValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => parseSimpleYamlValue(item))
      .filter((v) => v !== "");
  }
  return trimmed;
}

export function extractFrontmatterBlock(content: string): {
  frontmatter: Record<string, unknown>;
  bodyStartLine: number;
  bodyStartOffset: number;
  hasFrontmatter: boolean;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n") && normalized !== "---") {
    return { frontmatter: {}, bodyStartLine: 0, bodyStartOffset: 0, hasFrontmatter: false };
  }

  const lines = normalized.split("\n");
  let closingLine = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      closingLine = i;
      break;
    }
  }
  if (closingLine === -1) {
    return { frontmatter: {}, bodyStartLine: 0, bodyStartOffset: 0, hasFrontmatter: false };
  }

  const fm: Record<string, unknown> = {};
  let currentListKey: string | null = null;

  for (let i = 1; i < closingLine; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listMatch = /^\s*-\s+(.*)$/.exec(line);
    if (listMatch && currentListKey) {
      const prev = Array.isArray(fm[currentListKey]) ? (fm[currentListKey] as unknown[]) : [];
      prev.push(parseSimpleYamlValue(listMatch[1]));
      fm[currentListKey] = prev;
      continue;
    }

    const kvMatch = /^([A-Za-z0-9_\-\uAC00-\uD7A3]+)\s*:\s*(.*)$/.exec(line);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rest = kvMatch[2].trim();
      if (rest === "") {
        fm[key] = [];
        currentListKey = key;
      } else {
        fm[key] = parseSimpleYamlValue(rest);
        currentListKey = null;
      }
    }
  }

  let offset = 0;
  for (let i = 0; i <= closingLine; i += 1) {
    offset += lines[i].length + 1;
  }

  return {
    frontmatter: fm,
    bodyStartLine: closingLine + 1,
    bodyStartOffset: Math.min(offset, normalized.length),
    hasFrontmatter: true,
  };
}

export function parseWikilinkInner(inner: string): {
  target: string;
  subpath: string | null;
  alias: string | null;
} {
  const pipeIdx = inner.indexOf("|");
  const linkPart = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
  const alias = pipeIdx === -1 ? null : inner.slice(pipeIdx + 1).trim() || null;

  const hashIdx = linkPart.indexOf("#");
  const target = (hashIdx === -1 ? linkPart : linkPart.slice(0, hashIdx)).trim();
  const subpath = hashIdx === -1 ? null : linkPart.slice(hashIdx + 1).trim() || null;

  return { target, subpath, alias };
}

export function extractMarkdownMetadata(path: string, content: string): VaultFileMetadata {
  const normalized = content.replace(/\r\n/g, "\n");
  const { frontmatter, bodyStartLine } = extractFrontmatterBlock(normalized);
  const lines = normalized.split("\n");

  const headings: VaultHeadingRef[] = [];
  const links: VaultLinkRef[] = [];
  const tagSet = new Set<string>();

  // Tags declared in YAML frontmatter (`tags: [a, b]` or `tags: a`)
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) {
    for (const item of fmTags) {
      if (typeof item === "string" && item.trim()) {
        tagSet.add(item.trim().replace(/^#/, ""));
      }
    }
  } else if (typeof fmTags === "string" && fmTags.trim()) {
    for (const part of fmTags.split(/[,\s]+/)) {
      if (part.trim()) tagSet.add(part.trim().replace(/^#/, ""));
    }
  }

  let inFence = false;
  for (let i = bodyStartLine; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const hMatch = HEADING_RE.exec(line);
    if (hMatch) {
      headings.push({
        level: hMatch[1].length,
        text: hMatch[2].trim(),
        line: i + 1,
      });
    }

    WIKILINK_RE.lastIndex = 0;
    let wMatch: RegExpExecArray | null;
    while ((wMatch = WIKILINK_RE.exec(line)) !== null) {
      const parsed = parseWikilinkInner(wMatch[2]);
      if (parsed.target) {
        links.push({
          raw: wMatch[0],
          target: parsed.target,
          subpath: parsed.subpath,
          alias: parsed.alias,
          embed: Boolean(wMatch[1]),
          line: i + 1,
        });
      }
    }

    // Strip inline code spans before scanning #tags
    const withoutCode = line.replace(/`[^`]*`/g, "");
    INLINE_TAG_RE.lastIndex = 0;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = INLINE_TAG_RE.exec(withoutCode)) !== null) {
      tagSet.add(tMatch[1]);
    }
  }

  return {
    path,
    frontmatter,
    tags: Array.from(tagSet).sort(),
    headings,
    links,
  };
}

/**
 * Obsidian 링크 해석 규칙:
 * 1) 정확 경로 매칭 (`folder/note.md` 또는 `folder/note` + `.md`)
 * 2) 같은 폴더 내 상대 파일명 매칭
 * 3) 볼트 전체에서 파일명(basename) 또는 `.md` stem 매칭 (짧은 경로 우선)
 */
export function resolveVaultLinkTarget(
  vault: VaultPort,
  linkTarget: string,
  fromPath = ""
): string | null {
  const cleanTarget = normalizeVaultPath(linkTarget);
  if (!cleanTarget) return null;

  // 1. Exact path match or exact path + .md
  const direct = vault.getNode(cleanTarget);
  if (direct?.kind === "file") return direct.path;
  if (!extname(cleanTarget)) {
    const withMd = vault.getNode(`${cleanTarget}.md`);
    if (withMd?.kind === "file") return withMd.path;
  }

  // 2. Same folder match
  const baseFolder = dirname(fromPath);
  if (baseFolder) {
    const sibling = vault.getNode(`${baseFolder}/${cleanTarget}`);
    if (sibling?.kind === "file") return sibling.path;
    if (!extname(cleanTarget)) {
      const siblingMd = vault.getNode(`${baseFolder}/${cleanTarget}.md`);
      if (siblingMd?.kind === "file") return siblingMd.path;
    }
  }

  // 3. Vault-wide basename or stem match (case-insensitive, shortest path wins)
  const lower = cleanTarget.toLowerCase();
  const candidates = vault
    .listAll()
    .filter((node) => {
      if (node.kind !== "file") return false;
      if (node.path.toLowerCase() === lower) return true;
      if (node.name.toLowerCase() === lower) return true;
      if (node.extension === "md" && node.stem.toLowerCase() === lower) return true;
      return false;
    })
    .sort((a, b) => a.path.length - b.path.length);

  return candidates[0]?.path ?? null;
}

/**
 * Vault 내 파일이 이름변경/이동되었을 때, 모든 마크다운 파일의 `[[wikilink]]` 및 `![[embed]]`를
 * Obsidian과 동일하게 자동 갱신한다 (별칭 `|alias` 및 헤딩 `#subpath` 보존).
 */
export function rewriteWikilinksOnRename(
  vault: VaultPort,
  oldPath: string,
  newPath: string
): WikilinkRewriteSummary {
  const normOld = normalizeVaultPath(oldPath);
  const normNew = normalizeVaultPath(newPath);
  if (!normOld || !normNew || normOld === normNew) {
    return { updatedFiles: [], totalReplacements: 0 };
  }

  const oldName = basename(normOld);
  const oldStem = stem(normOld);
  const oldExt = extname(normOld);
  const newName = basename(normNew);
  const newStem = stem(normNew);
  const newExt = extname(normNew);

  const oldNoExt = oldExt === "md" ? normOld.slice(0, -(oldExt.length + 1)) : normOld;
  const newNoExt = newExt === "md" ? normNew.slice(0, -(newExt.length + 1)) : normNew;

  const updatedFiles: string[] = [];
  let totalReplacements = 0;

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || node.extension !== "md") continue;
    if (vault.isLoaded && !vault.isLoaded(node.path)) continue;
    const raw = vault.read(node.path);
    let fileChanges = 0;

    const rewritten = raw.replace(WIKILINK_RE, (fullMatch, bang: string | undefined, inner: string) => {
      const parsed = parseWikilinkInner(inner);
      const normTarget = normalizeVaultPath(parsed.target);
      const lowerTarget = normTarget.toLowerCase();

      let replacementTarget: string | null = null;
      if (lowerTarget === normOld.toLowerCase()) {
        replacementTarget = normNew;
      } else if (oldExt === "md" && lowerTarget === oldNoExt.toLowerCase()) {
        replacementTarget = newNoExt;
      } else if (lowerTarget === oldName.toLowerCase()) {
        replacementTarget = newName;
      } else if (oldExt === "md" && lowerTarget === oldStem.toLowerCase()) {
        replacementTarget = newExt === "md" ? newStem : newName;
      }

      if (!replacementTarget || replacementTarget === parsed.target) {
        return fullMatch;
      }

      fileChanges += 1;
      const subpathPart = parsed.subpath ? `#${parsed.subpath}` : "";
      const aliasPart = parsed.alias ? `|${parsed.alias}` : "";
      return `${bang ?? ""}[[${replacementTarget}${subpathPart}${aliasPart}]]`;
    });

    if (fileChanges > 0) {
      vault.write(node.path, rewritten);
      updatedFiles.push(node.path);
      totalReplacements += fileChanges;
    }
  }

  return { updatedFiles, totalReplacements };
}

/**
 * Obsidian MetadataCache 경량 구현:
 * Vault 이벤트를 구독해 모든 마크다운 파일의 frontmatter · 헤딩 · 태그 · 링크 · 백링크를 실시간 인덱싱한다.
 */
export class VaultMetadataCache {
  private readonly cache = new Map<string, VaultFileMetadata>();
  private readonly listeners = new Set<() => void>();
  private unsubscribeVault: (() => void) | null = null;

  constructor(private readonly vault: VaultPort) {
    this.rebuildAll();
    this.unsubscribeVault = vault.subscribe((ev) => this.handleVaultEvent(ev));
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private indexPath(path: string): void {
    const node = this.vault.getNode(path);
    if (!node || node.kind !== "file" || node.extension !== "md") {
      this.cache.delete(path);
      return;
    }
    // Skip not-yet-loaded lazy files (they will be indexed automatically when ensureLoaded() fires modify)
    if (this.vault.isLoaded && !this.vault.isLoaded(path)) {
      return;
    }
    try {
      const content = this.vault.read(path);
      this.cache.set(path, extractMarkdownMetadata(path, content));
    } catch {
      this.cache.delete(path);
    }
  }

  private rebuildAll(): void {
    this.cache.clear();
    const mdPaths: string[] = [];
    for (const node of this.vault.listAll()) {
      if (node.kind === "file" && node.extension === "md") {
        if (!this.vault.isLoaded || this.vault.isLoaded(node.path)) {
          mdPaths.push(node.path);
        }
      }
    }
    // Small vaults index synchronously (0ms); large vaults (>250 loaded .md) yield in chunks so UI stays 60fps
    if (mdPaths.length <= 250) {
      for (const p of mdPaths) this.indexPath(p);
      return;
    }
    const chunkSize = 100;
    let cursor = 0;
    const step = () => {
      if (!this.unsubscribeVault) return;
      const end = Math.min(cursor + chunkSize, mdPaths.length);
      for (; cursor < end; cursor += 1) {
        this.indexPath(mdPaths[cursor]);
      }
      this.emit();
      if (cursor < mdPaths.length) {
        setTimeout(step, 0);
      }
    };
    step();
  }

  private handleVaultEvent(ev: VaultEvent): void {
    if (ev.type === "create") {
      if (ev.node.kind === "file") this.indexPath(ev.node.path);
    } else if (ev.type === "modify") {
      this.indexPath(ev.path);
    } else if (ev.type === "delete") {
      for (const p of ev.affectedPaths) this.cache.delete(p);
    } else if (ev.type === "rename") {
      for (const m of ev.affectedMap) {
        this.cache.delete(m.oldPath);
        this.indexPath(m.newPath);
      }
    } else if (ev.type === "vault-reset") {
      this.rebuildAll();
    }
    this.emit();
  }

  getMetadata(path: string): VaultFileMetadata | null {
    return this.cache.get(normalizeVaultPath(path)) ?? null;
  }

  getAllTags(): string[] {
    const set = new Set<string>();
    for (const meta of this.cache.values()) {
      for (const tag of meta.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }

  resolveLink(linkTarget: string, fromPath = ""): string | null {
    return resolveVaultLinkTarget(this.vault, linkTarget, fromPath);
  }

  getBacklinks(targetPath: string): Array<{ sourcePath: string; link: VaultLinkRef }> {
    const normTarget = normalizeVaultPath(targetPath);
    const results: Array<{ sourcePath: string; link: VaultLinkRef }> = [];
    for (const meta of this.cache.values()) {
      for (const link of meta.links) {
        const resolved = this.resolveLink(link.target, meta.path);
        if (resolved === normTarget) {
          results.push({ sourcePath: meta.path, link });
        }
      }
    }
    return results;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.unsubscribeVault) {
      this.unsubscribeVault();
      this.unsubscribeVault = null;
    }
    this.listeners.clear();
  }
}
