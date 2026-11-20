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
 * Obsidian 표시명 규칙: `.md` 파일은 확장자를 숨기고, 그 외 확장자는 배지로 표시한다.
 * `.vproj` 프로젝트 폴더는 확장자를 숨기고 `PROJ` 배지를 붙이며,
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
