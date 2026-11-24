import {
  BUILTIN_VDOC_ASSETS,
  compileOutlineToVDoc,
  createElementSyntaxRegistry,
  isValidVDocAsset,
  validateCompiledAssetBlocks,
  type LayoutBlock,
  type OutlineSyntaxNode,
  type VDocAsset,
  type VDocAssetKind,
  type VDocSlot,
} from "@vibe/vdoc-schema";
import { matchesCompoundExtension, type VaultPort } from "@vibe/vault-core";

import { VAULT_SYSTEM_DIR } from "./settings";

export const VAULT_ASSETS_DIR = `${VAULT_SYSTEM_DIR}/assets`;

export function isAssetPath(path: string): boolean {
  return matchesCompoundExtension(path, "vasset") || matchesCompoundExtension(path, "vasset.json");
}

export function assetDefaultVaultPath(assetId: string): string {
  const safe = assetId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${VAULT_ASSETS_DIR}/${safe}.vasset`;
}

export function parseVAssetJson(raw: string): VDocAsset | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValidVDocAsset(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed .vasset JSON safely
  }
  return null;
}

export function serializeVAssetJson(asset: VDocAsset): string {
  return JSON.stringify(
    {
      ...asset,
      origin: {
        ...asset.origin,
        updatedAt: new Date().toISOString(),
      },
    },
    null,
    2
  );
}

/**
 * 들여쓰기 기반 `.outline` DSL 줄 배열을 표준 `OutlineSyntaxNode[]` 트리로 파싱한다.
 */
export function parseIndentedOutlineDsl(
  lines: readonly string[],
  prefix = "asset"
): OutlineSyntaxNode[] {
  const roots: OutlineSyntaxNode[] = [];
  const stack: { indent: number; node: OutlineSyntaxNode }[] = [];
  let seq = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const node: OutlineSyntaxNode = {
      id: `${prefix}_${++seq}`,
      text: rawLine.trim(),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      (stack[stack.length - 1].node.children as OutlineSyntaxNode[]).push(node);
    }
    stack.push({ indent, node });
  }
  return roots;
}

/**
 * 표준 `.outline` DSL 줄 배열을 `compileOutlineToVDoc` + `validateCompiledAssetBlocks` 로
 * 결정적 컴파일·검증해 캔버스 안전 `blocks` 와 `slots` 로 변환한다.
 */
export function compileOutlineDslLinesToAssetBlocks(
  outlineDsl: readonly string[],
  options?: {
    readonly profileId?: "a4" | "blog";
    readonly prefix?: string;
    readonly sectionTitle?: string;
    readonly wrapInSectionIfNeeded?: boolean;
  }
): {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly blocks: LayoutBlock[];
  readonly slots: Record<string, VDocSlot>;
} {
  const nonEmpty = outlineDsl.filter((ln) => ln.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { ok: false, errors: ["빈 outlineDsl"], blocks: [], slots: {} };
  }

  const profileId = options?.profileId ?? "a4";
  const prefix = options?.prefix ?? `ast_${Date.now().toString(36)}`;
  const startsWithSection = /^\s*<<view:section(?::[^>]*)?>>/.test(nonEmpty[0]);
  const effectiveLines =
    options?.wrapInSectionIfNeeded !== false && !startsWithSection
      ? [`<<view:section>> ${options?.sectionTitle ?? "에셋"}`, ...nonEmpty.map((l) => `  ${l}`)]
      : nonEmpty;

  const rootNodes = parseIndentedOutlineDsl(effectiveLines, prefix);
  const registry = createElementSyntaxRegistry();
  const compiled = compileOutlineToVDoc(
    { version: 1, title: options?.sectionTitle ?? "Asset", rootNodes },
    {
      registry,
      profileId,
      docId: `compile-${prefix}`,
    }
  );

  const rawBlocks = compiled.pages.flatMap((p) =>
    p.blocks.map((b) => {
      const copy = structuredClone(b);
      delete copy.sourceNodeId;
      return copy;
    })
  );

  const validated = validateCompiledAssetBlocks(rawBlocks, compiled.slots);
  return {
    ok: validated.ok,
    errors: validated.errors,
    blocks: validated.sanitizedBlocks,
    slots: validated.sanitizedSlots,
  };
}

export interface VaultAssetEntry {
  readonly asset: VDocAsset;
  readonly vaultPath: string | null;
  readonly isBuiltin: boolean;
}

/**
 * Vault 내 `.vasset` 파일과 내장 6종 시드 에셋을 합쳐 반환한다.
 * 같은 `assetId` 가 Vault에 존재하면 사용자가 편집한 Vault 정본을 우선한다.
 */
export function collectVaultAssets(vault: VaultPort): VaultAssetEntry[] {
  const byId = new Map<string, VaultAssetEntry>();

  for (const builtin of BUILTIN_VDOC_ASSETS) {
    byId.set(builtin.assetId, {
      asset: builtin,
      vaultPath: vault.exists(assetDefaultVaultPath(builtin.assetId))
        ? assetDefaultVaultPath(builtin.assetId)
        : null,
      isBuiltin: true,
    });
  }

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isAssetPath(node.path)) continue;
    if (vault.isLoaded && !vault.isLoaded(node.path)) continue;
    try {
      const parsed = parseVAssetJson(vault.read(node.path));
      if (!parsed) continue;
      const prev = byId.get(parsed.assetId);
      byId.set(parsed.assetId, {
        asset: parsed,
        vaultPath: node.path,
        isBuiltin: prev?.isBuiltin ?? parsed.origin.sourceType === "builtin",
      });
    } catch {
      // Ignore transient read errors
    }
  }

  return Array.from(byId.values());
}

/**
 * `.vasset` 파일을 Vault에 저장한다 (지정 경로가 없으면 `.vibedoc/assets/<assetId>.vasset`).
 */
export function saveAssetToVault(
  vault: VaultPort,
  asset: VDocAsset,
  customPath?: string
): string {
  const targetPath = customPath ?? assetDefaultVaultPath(asset.assetId);
  const serialized = serializeVAssetJson(asset);
  if (vault.exists(targetPath)) {
    vault.write(targetPath, serialized);
  } else {
    vault.createFile(targetPath, serialized);
  }
  return targetPath;
}

/**
 * 내장 에셋을 편집 탭으로 열기 위해 Vault 파일이 없으면 `.vibedoc/assets/` 에 실체화한다.
 */
export function ensureAssetFileInVault(
  vault: VaultPort,
  asset: VDocAsset,
  existingPath?: string | null
): string {
  if (existingPath && vault.exists(existingPath)) {
    return existingPath;
  }
  const defaultPath = assetDefaultVaultPath(asset.assetId);
  if (vault.exists(defaultPath)) {
    return defaultPath;
  }
  return saveAssetToVault(vault, asset, defaultPath);
}

export function createDefaultVAssetJson(
  title: string,
  kind: VDocAssetKind = "table"
): string {
  const now = new Date().toISOString();
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || `asset-${Date.now().toString(36)}`;
  const outlineDsl =
    kind === "a4-page"
      ? [
          `<<view:section>> ${title}`,
          `  <<view:title>> {{${title}}}`,
          "  <<view:table>> 기본 정보",
          "    {{항목 1}} | {{값 1}}",
          "    {{항목 2}} | {{값 2}}",
        ]
      : kind === "blog-section"
        ? [
            `<<view:section:spot>> ${title}`,
            `  [img:{{${title} 대표 이미지}}]`,
            `  > {{${title} 요약 카드}}`,
            "    항목 1 :: {{값 1}}",
            "    항목 2 :: {{값 2}}",
          ]
        : [
            `<<view:table:header>> ${title}`,
            "  {{구분}} | {{항목}}",
            "  {{분류 1}} | <<cell>>",
            "    <<view:list>>",
            "      {{세부 내용 1}}",
            "      {{세부 내용 2}}",
          ];

  const compiled = compileOutlineDslLinesToAssetBlocks(outlineDsl, {
    profileId: kind === "blog-section" ? "blog" : "a4",
    prefix: slug,
    sectionTitle: title,
  });

  const asset: VDocAsset = {
    version: "1.0.0",
    assetId: `asset-${kind}-${slug}-${Date.now().toString(36).slice(-4)}`,
    title,
    scope: kind === "table" ? "element" : "section",
    assetKind: kind,
    targetKind:
      kind === "a4-page" ? "page" : kind === "blog-section" ? "section" : "structured-table",
    category:
      kind === "a4-page" ? "A4 서식 페이지" : kind === "blog-section" ? "블로그 섹션" : "표 · 서식",
    tags: [kind, "사용자생성"],
    nuance: {
      summary: `${title} — 표준 .outline 문법으로 정의된 재사용 구조 에셋입니다.`,
      structureRules: ["표준 구조 골격을 유지하되 항목명과 행 수는 현재 문서에 맞게 재구성"],
      adaptationHints: ["사용자 데이터의 항목 수에 따라 자연스럽게 확장·축소"],
    },
    structure: {
      outlineDsl,
      blocks: compiled.blocks,
      slots: compiled.slots,
      ...(kind === "a4-page" || kind === "blog-section"
        ? {
            pageMeta: {
              pageLabel: title,
              unitKind: kind === "a4-page" ? "page" : "section",
              surfaceWidth: kind === "a4-page" ? 794 : 720,
            },
          }
        : {}),
    },
    origin: {
      sourceType: "manual",
      createdAt: now,
      updatedAt: now,
    },
  };
  return serializeVAssetJson(asset);
}

/** 에셋 AI 가 만든 비파괴 미리보기 (적용 전까지 볼트를 바꾸지 않는다). 캔버스 · 아웃라인 · 동기화 엔진이 함께 읽는다. */
export interface StagedAssetPreviewState {
  readonly assetId: string;
  readonly assetPath: string | null;
  readonly assetTitle: string;
  readonly assetKind: string;
  /** Target scope: replace a single block, replace a page's blocks, or insert at end of page. */
  readonly targetScope: "block" | "page";
  readonly mode: "transform" | "insert";
  readonly targetPageId: string;
  readonly targetBlockId: string | null;
  /** Bound `.outline` partner path & sourceNodeId so `.outline` tab shows synced Preview + Apply bar! */
  readonly linkedOutlinePath?: string | null;
  readonly linkedOutlineRootNodeId?: string | null;
  readonly targetSourceNodeId?: string | null;
  readonly status: "loading" | "ready" | "error";
  readonly engine?: "llm" | "fallback";
  readonly rationale: string;
  readonly errorMessage?: string;
  readonly suggestedOutlineDsl: readonly string[];
  readonly previewBlocks: readonly LayoutBlock[];
  readonly previewSlots: Readonly<Record<string, VDocSlot>>;
  readonly userOutlineDsl: readonly string[];
  readonly userPlainText: string;
  readonly feedbackHistory: readonly string[];
  readonly sourceInputHash: string;
}
