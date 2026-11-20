import type { VaultNode, VaultSortOrder } from "./types";

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const VAULT_SORT_LABELS: Record<VaultSortOrder, string> = {
  "name-asc": "File name (A to Z)",
  "name-desc": "File name (Z to A)",
  "mtime-desc": "Modified time (new to old)",
  "mtime-asc": "Modified time (old to new)",
  "ctime-desc": "Created time (new to old)",
  "ctime-asc": "Created time (old to new)",
};

/**
 * Obsidian File Explorer 정렬 규칙:
 * 1) 항상 폴더가 파일보다 먼저 온다.
 * 2) 동일 kind 내에서는 선택된 정렬 기준(자연수 숫자 비교 포함)을 적용한다.
 */
export function compareVaultNodes(
  a: VaultNode,
  b: VaultNode,
  order: VaultSortOrder = "name-asc"
): number {
  if (a.kind !== b.kind) {
    return a.kind === "folder" ? -1 : 1;
  }

  let diff = 0;
  switch (order) {
    case "name-asc":
      diff = naturalCollator.compare(a.name, b.name);
      break;
    case "name-desc":
      diff = naturalCollator.compare(b.name, a.name);
      break;
    case "mtime-desc":
      diff = b.mtime - a.mtime;
      break;
    case "mtime-asc":
      diff = a.mtime - b.mtime;
      break;
    case "ctime-desc":
      diff = b.ctime - a.ctime;
      break;
    case "ctime-asc":
      diff = a.ctime - b.ctime;
      break;
  }

  if (diff !== 0) return diff;
  return naturalCollator.compare(a.name, b.name);
}
