const ILLEGAL_NAME_RE = /[\\/:*?"<>|]/;

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) <= 0x1f) return true;
  }
  return false;
}

/**
 * POSIX 상대 경로로 정규화한다.
 * - `\` → `/`
 * - 선행/후행 `/` 및 중복 `/` 제거
 * - 루트는 `""` 반환
 */
export function normalizeVaultPath(raw: string): string {
  const cleaned = raw
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  if (!cleaned || cleaned === ".") return "";

  const segments = cleaned.split("/");
  const normalized: string[] = [];
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed || trimmed === ".") continue;
    if (trimmed === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(trimmed);
  }
  return normalized.join("/");
}

export function splitPathSegments(path: string): string[] {
  const norm = normalizeVaultPath(path);
  return norm ? norm.split("/") : [];
}

export function joinPath(...parts: readonly string[]): string {
  return normalizeVaultPath(parts.filter((part) => part.length > 0).join("/"));
}

export function dirname(path: string): string {
  const norm = normalizeVaultPath(path);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? "" : norm.slice(0, idx);
}

export function basename(path: string): string {
  const norm = normalizeVaultPath(path);
  if (!norm) return "";
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/**
 * 확장자(점 제외 소문자). `.gitignore`처럼 점으로 시작하고 다른 점이 없으면 `""`.
 */
export function extname(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * 확장자를 제외한 파일명 stem.
 */
export function stem(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return name;
  return name.slice(0, dot);
}

/**
 * 복합 확장자(`.vdoc.json` 등) 매칭 검사.
 * `extSpec`은 선행 점 없이 전달한다 (예: `"vdoc"`, `"vdoc.json"`, `"md"`).
 */
export function matchesCompoundExtension(path: string, extSpec: string): boolean {
  const leaf = basename(path).toLowerCase();
  const clean = extSpec.replace(/^\./, "").toLowerCase();
  if (!clean) return false;
  if (clean === "*") return true;
  return leaf.length > clean.length + 1 && leaf.endsWith(`.${clean}`);
}

/**
 * 폴더 확장자: `<프로젝트명>.vproj/` 폴더를 프로젝트 컨텍스트 경계로 인식한다.
 */
export const PROJECT_FOLDER_EXT = "vproj";

export function isProjectFolderName(name: string): boolean {
  const suffix = `.${PROJECT_FOLDER_EXT}`;
  return name.length > suffix.length && name.toLowerCase().endsWith(suffix);
}

export function isProjectFolderPath(path: string): boolean {
  return isProjectFolderName(basename(path));
}

export function stripProjectFolderExt(name: string): string {
  if (!isProjectFolderName(name)) return name;
  return name.slice(0, -(PROJECT_FOLDER_EXT.length + 1));
}

export function ensureProjectFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return isProjectFolderName(trimmed) ? trimmed : `${trimmed}.${PROJECT_FOLDER_EXT}`;
}

export function toggleProjectFolderName(name: string): {
  nextName: string;
  isProject: boolean;
} {
  const trimmed = name.trim();
  if (isProjectFolderName(trimmed)) {
    return { nextName: stripProjectFolderExt(trimmed), isProject: false };
  }
  return { nextName: `${trimmed}.${PROJECT_FOLDER_EXT}`, isProject: true };
}

/**
 * Nearest Ancestor 프로젝트 리졸버:
 * 임의 파일/폴더 경로에서 위로 올라가며 가장 가까운 `*.vproj/` 프로젝트 폴더 경로를 반환한다.
 * 상위에 프로젝트 폴더가 없으면 `null` (단독 문서).
 */
export function findOwningProjectPath(path: string): string | null {
  const segments = splitPathSegments(path);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isProjectFolderName(segments[i])) {
      return segments.slice(0, i + 1).join("/");
    }
  }
  return null;
}

/**
 * 폴더 확장자: `<제목>.vclip/` 폴더를 웹 스크랩(사실 근거 리소스) 단일 번들로 인식한다.
 * - 내부 구조: `clip.json` · `content.md` · 선택 `snapshot.html` · `capture.png` · `assets/`
 * - 탐색기에서는 단일 항목(`CLIP` 배지)처럼 접어 표시한다.
 */
export const CLIP_BUNDLE_EXT = "vclip";

export function isClipBundleName(name: string): boolean {
  const suffix = `.${CLIP_BUNDLE_EXT}`;
  return name.length > suffix.length && name.toLowerCase().endsWith(suffix);
}

export function isClipBundlePath(path: string): boolean {
  return isClipBundleName(basename(path));
}

export function stripClipBundleExt(name: string): string {
  if (!isClipBundleName(name)) return name;
  return name.slice(0, -(CLIP_BUNDLE_EXT.length + 1));
}

export function ensureClipBundleName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return isClipBundleName(trimmed) ? trimmed : `${trimmed}.${CLIP_BUNDLE_EXT}`;
}

/** 임의 경로가 `*.vclip/` 번들 자신이거나 그 내부 파일이면 해당 번들 폴더 경로를 반환한다. */
export function findOwningClipBundlePath(path: string): string | null {
  const segments = splitPathSegments(path);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isClipBundleName(segments[i])) {
      return segments.slice(0, i + 1).join("/");
    }
  }
  return null;
}

export interface SourcesFolderPolicy {
  /** 기본 `"same-folder-subfolder"` (옵시디언 첨부파일 방식: 현재 파일과 동레이어에 `sources/` 생성). */
  readonly mode?: "same-folder-subfolder" | "fixed-folder";
  /** 동레이어 하위 폴더명 (기본 `"sources"`). */
  readonly folderName?: string;
  /** `mode === "fixed-folder"` 일 때 사용할 볼트 상대 폴더 경로. */
  readonly fixedFolder?: string;
}

/**
 * 옵시디언 첨부파일 관리 규칙과 동일한 `sources/` 폴더 경로 결정기:
 * - 기본값: 현재 편집 중인 파일과 동일 레이어에 `sources` 폴더 (`<dir>/sources`, 루트면 `sources`)
 * - 고정 폴더 설정 시: 지정한 볼트 경로 반환
 */
export function resolveSourcesFolderForPath(
  activePath?: string | null,
  policy?: SourcesFolderPolicy
): string {
  if (policy?.mode === "fixed-folder" && policy.fixedFolder?.trim()) {
    return normalizeVaultPath(policy.fixedFolder);
  }
  const subName = normalizeVaultPath(policy?.folderName || "sources") || "sources";
  const norm = normalizeVaultPath(activePath ?? "");
  if (!norm) return subName;

  // 이미 .vclip 번들 안을 보고 있다면 번들의 부모 폴더를 기준으로 삼는다.
  const clipOwner = findOwningClipBundlePath(norm);
  const basePath = clipOwner ?? norm;
  const parent = dirname(basePath);
  if (!parent) return subName;
  if (basename(parent).toLowerCase() === subName.toLowerCase()) {
    return parent;
  }
  return joinPath(parent, subName);
}

/**
 * Obsidian 표시명 규칙: `.md` 파일은 확장자를 숨기고, 그 외 확장자는 배지로 표시한다.
 * `.vproj` 프로젝트 폴더는 `PROJ`, `.vclip` 웹 스크랩 번들은 `CLIP` 배지를 붙이며,
 * 복합 확장자 `.vdoc.json`도 깔끔하게 `VDOC` 배지로 축약한다.
 */
export function getObsidianDisplayName(name: string, kind: "file" | "folder"): {
  label: string;
  extensionBadge: string | null;
} {
  if (kind === "folder") {
    if (isProjectFolderName(name)) {
      return { label: stripProjectFolderExt(name), extensionBadge: "PROJ" };
    }
    if (isClipBundleName(name)) {
      return { label: stripClipBundleExt(name), extensionBadge: "CLIP" };
    }
    return { label: name, extensionBadge: null };
  }
  const lower = name.toLowerCase();
  if (lower.endsWith(".vdoc.json") && name.length > ".vdoc.json".length) {
    return { label: name.slice(0, -".vdoc.json".length), extensionBadge: "VDOC" };
  }
  const ext = extname(name);
  if (!ext) {
    return { label: name, extensionBadge: null };
  }
  if (ext === "md") {
    return { label: stem(name), extensionBadge: null };
  }
  return { label: stem(name), extensionBadge: ext.toUpperCase() };
}

/**
 * `candidatePath`가 `ancestorPath`와 같거나 그 하위 경로인지 검사한다.
 */
export function isDescendantPath(candidatePath: string, ancestorPath: string): boolean {
  const cand = normalizeVaultPath(candidatePath);
  const anc = normalizeVaultPath(ancestorPath);
  if (!anc) return cand.length > 0;
  return cand === anc || cand.startsWith(`${anc}/`);
}

/**
 * 루트에서 해당 경로 직전 부모까지의 모든 상위 폴더 경로를 최상위→하위 순으로 반환한다.
 */
export function getAncestorPaths(path: string): string[] {
  const segments = splitPathSegments(path);
  if (segments.length <= 1) return [];
  const ancestors: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    ancestors.push(segments.slice(0, i + 1).join("/"));
  }
  return ancestors;
}

/**
 * 단일 파일/폴더명 유효성 검사.
 */
export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "이름을 입력해 주세요.";
  if (trimmed === "." || trimmed === "..") return "사용할 수 없는 이름입니다.";
  if (ILLEGAL_NAME_RE.test(trimmed) || hasControlChar(trimmed)) {
    return '이름에 \\ / : * ? " < > | 문자는 사용할 수 없습니다.';
  }
  return null;
}

export function isValidEntryName(name: string): boolean {
  return validateEntryName(name) === null;
}
