/**
 * 양방향 `.outline` ↔ `.vdoc` 동기화 브리지.
 *
 * 1. Outline → VDoc (정방향):
 *    - 마스터 `.outline` 의 임의 깊이 `<<doc:...>>` / `<<view:...>>` / `<<asset:...>>` 노드를
 *      비파괴 증분 컴파일(`baseDoc` Overlay)하여 인라인 프리뷰 또는 바인딩된 `.vdoc` 파일에 실시간 반영한다.
 * 2. VDoc → Outline (역방향 진입 & 역동기화):
 *    - `.vdoc` 의 `[구조]` 진입 시 `outlineRef` 가 있으면 해당 `.outline` 의 `rootNodeId` 로 즉시 줌인한다.
 *    - `outlineRef` 가 없으면 무손실 `extractBoundOutlineFromVDoc` 으로 `<파일명>.outline` 을 자동 생성하고
 *      양쪽에 `sourceNodeId` + `outlineRef` + `docBindings` 를 대칭 바인딩한 뒤 분할 탭으로 연다.
 *    - `.vdoc` 에서 의미(텍스트/블록 구성)가 바뀌면 바인딩된 `.outline` 의 해당 `rootNodeId` 서브트리만
 *      안전하게 역동기화한다 (형제 메모/Todo/다른 문서 브랜치는 100% 보존, 순수 디자인 변경은 무시).
 * 3. 에코 루프 방지:
 *    - 정규화 시그니처 비교 + 진행 중 경로 락(`syncingPaths`)으로 무한 왕복 및 Undo 히스토리 파괴를 차단한다.
 */
import type { OutlineNode } from "@vibe/outliner/core";
import {
  compileDirectiveSubtreeToVDoc,
  createElementSyntaxRegistry,
  evidenceSourceKey,
  extractBoundOutlineFromVDoc,
  extractOutlineAssets,
  findOutlineNodeChain,
  formatEvidenceLocatorToCiteBullet,
  getBlockSlotIds,
  htmlToPlainText,
  parseCiteBullet,
  parseOutlineDirective,
  resolveDocumentView,
  scanOutlineDirectives,
  type ElementSyntaxRegistry,
  type EvidenceLink,
  type LayoutBlock,
  type OutlineAssetResolver,
  type OutlineSyntaxNode,
  type ParsedOutlineAsset,
  type ScannedOutlineDirective,
  type VDocDocument,
} from "@vibe/vdoc-schema";
import {
  basename,
  dirname,
  findOwningProjectPath,
  joinPath,
  normalizeVaultPath,
  runVaultRenameRewriters,
  stem,
  stripProjectFolderExt,
  type VaultPort,
} from "@vibe/vault-core";

import {
  STANDARD_SYNTAX_PATH,
  fromVaultUri,
  isOutlinePath,
  isVDocPath,
  parseIndentedOutlineDsl,
  parseOutlineJson,
  parseVDocJson,
  rewriteOutlineBindingsOnRename,
  rewriteVDocPointersOnRename,
  serializeOutlineJson,
  serializeVDocJson,
  toVaultUri,
  type OutlineDocBinding,
  type OutlineFilePayload,
  type StagedAssetPreviewState,
} from "@vibe/vault-formats";

import { requestOutlineReveal } from "./reveal";

export type BridgeOpenMode = "current" | "new-tab" | "split-right";
export type BridgeOpenLink = (targetPath: string, mode?: BridgeOpenMode) => void;

const syncingPaths = new Set<string>();

/** 현재 브리지가 자체 동기화 쓰기를 수행 중인 경로인지 확인한다 (에코 방지용). */
export function isPathInBidirectionalSync(path: string): boolean {
  return syncingPaths.has(normalizeVaultPath(path));
}

function runGuardedSync<T>(paths: readonly string[], fn: () => T): T {
  const normalized = paths.map((p) => normalizeVaultPath(p));
  for (const p of normalized) syncingPaths.add(p);
  try {
    return fn();
  } finally {
    for (const p of normalized) syncingPaths.delete(p);
  }
}

/**
 * 볼트의 표준 `.vsyntax` 레지스트리를 로드한다 (없거나 손상 시 기본 시드 레지스트리 반환).
 */
export function loadVaultSyntaxRegistry(vault: VaultPort): ElementSyntaxRegistry {
  try {
    if (vault.exists(STANDARD_SYNTAX_PATH)) {
      return createElementSyntaxRegistry(vault.read(STANDARD_SYNTAX_PATH));
    }
  } catch {
    // Fall back to built-in default registry
  }
  return createElementSyntaxRegistry();
}

/**
 * 아웃라인 이미지 토큰(`[img:라벨]`) 및 첨부 파일(`node.file.target`)을
 * 실제 렌더링 가능한 URL 로 해석하는 Vault 리졸버를 생성한다.
 */
export function buildVaultAssetResolver(
  vault: VaultPort,
  outlinePath: string,
  baseDoc?: VDocDocument
): OutlineAssetResolver {
  const outlineDir = dirname(outlinePath);
  const imageByNodeId = new Map<string, string>();
  const imageByAlt = new Map<string, string>();

  if (baseDoc) {
    for (const page of baseDoc.pages) {
      for (const blk of page.blocks) {
        if (blk.kind === "image" && blk.src) {
          if (blk.sourceNodeId) imageByNodeId.set(blk.sourceNodeId, blk.src);
          if (blk.alt) imageByAlt.set(blk.alt.trim(), blk.src);
          if (blk.title) imageByAlt.set(blk.title.trim(), blk.src);
        } else if (blk.kind === "columns-grid") {
          for (const col of blk.columns ?? []) {
            if (col.image?.src && col.image.alt) {
              imageByAlt.set(col.image.alt.trim(), col.image.src);
            }
          }
        }
      }
    }
  }

  const resolveVaultImageUrl = (candidatePath: string): string | undefined => {
    const normalized = normalizeVaultPath(candidatePath);
    if (!vault.exists(normalized)) return undefined;
    return vault.getBinaryUrl?.(normalized) ?? toVaultUri(normalized);
  };

  const stripResourceVault = (raw: string): string | null =>
    raw.startsWith("resource:vault:") ? raw.slice("resource:vault:".length).trim() : null;

  return ({ label, rawSrc, nodeId, fileTarget }) => {
    // 1. Explicit web/data URL, resource:vault:, or vault:// URI
    if (rawSrc) {
      if (/^(https?:\/\/|data:|blob:|\/)/i.test(rawSrc)) return rawSrc;
      const fromRes = stripResourceVault(rawSrc);
      if (fromRes) return resolveVaultImageUrl(fromRes) ?? rawSrc;
      const fromUri = fromVaultUri(rawSrc);
      if (fromUri) return resolveVaultImageUrl(fromUri) ?? rawSrc;
      const rel = outlineDir ? joinPath(outlineDir, rawSrc) : rawSrc;
      return resolveVaultImageUrl(rel) ?? resolveVaultImageUrl(rawSrc) ?? rawSrc;
    }

    // 2. Outliner attached file bullet (`node.file.target`)
    if (fileTarget) {
      if (/^(https?:\/\/|data:|blob:|\/)/i.test(fileTarget)) return fileTarget;
      const fromRes = stripResourceVault(fileTarget);
      if (fromRes) return resolveVaultImageUrl(fromRes);
      const fromUri = fromVaultUri(fileTarget);
      if (fromUri) return resolveVaultImageUrl(fromUri);
      const direct = resolveVaultImageUrl(fileTarget);
      if (direct) return direct;
      if (outlineDir) {
        const relative = resolveVaultImageUrl(joinPath(outlineDir, fileTarget));
        if (relative) return relative;
      }
    }

    // 3. Preserve existing baseDoc image URL by sourceNodeId or alt/title
    if (nodeId && imageByNodeId.has(nodeId)) {
      return imageByNodeId.get(nodeId);
    }
    const trimmedLabel = label.trim();
    if (trimmedLabel && imageByAlt.has(trimmedLabel)) {
      return imageByAlt.get(trimmedLabel);
    }

    // 4. Match image asset in vault (same folder / attachments / vault-wide by stem or filename)
    if (trimmedLabel) {
      const lower = trimmedLabel.toLowerCase();
      for (const node of vault.listAll()) {
        if (node.kind !== "file") continue;
        if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(node.path)) continue;
        if (node.stem.toLowerCase() === lower || basename(node.path).toLowerCase() === lower) {
          return vault.getBinaryUrl?.(node.path) ?? toVaultUri(node.path);
        }
      }
    }

    return undefined;
  };
}

function sanitizeFileStem(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 64) || fallback;
}

function stableSerializeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSerializeValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = stableSerializeValue(v);
    }
    return out;
  }
  return value;
}

/** `updatedAt` 을 제외한 VDoc 의 키 순서 비의존 시그니처 (미변경 1:N 문서의 중복 쓰기 완전 차단). */
function canonicalVDocSignature(doc: VDocDocument): string {
  const { updatedAt: _ignore, ...rest } = doc;
  void _ignore;
  return JSON.stringify(stableSerializeValue(rest));
}

/**
 * 아웃라인의 UI 전용 상태(`isFolded`, `viewMode` 등)를 제외하고
 * 실제 텍스트·첨부·노트·트리 구조만 추출한 시그니처.
 * 접기/펼치기만 일어났을 때는 시그니처가 동일하므로 `.vdoc` 동기화를 발동하지 않는다.
 */
export function outlineSemanticSignature(nodes: readonly OutlineSyntaxNode[]): string {
  const project = (list: readonly OutlineSyntaxNode[]): unknown[] =>
    list.map((n) => ({
      id: n.id,
      text: n.text,
      ...(n.note ? { note: n.note } : {}),
      ...(n.file?.target ? { file: n.file.target } : {}),
      children: n.children && n.children.length > 0 ? project(n.children) : [],
    }));
  return JSON.stringify(project(nodes));
}

/** 아웃라인 노드의 구조+텍스트 시그니처 (의미가 실제로 바뀐 경우에만 역동기화). */
function canonicalOutlineNodeSignature(node: OutlineSyntaxNode): string {
  return JSON.stringify({
    id: node.id,
    text: node.text.trim(),
    children: (node.children ?? []).map((c) => JSON.parse(canonicalOutlineNodeSignature(c))),
  });
}

function toOutlinerNode(node: OutlineSyntaxNode): OutlineNode {
  return {
    id: node.id,
    text: node.text,
    isFolded: Boolean(node.isFolded),
    ...(node.note ? { note: node.note } : {}),
    ...(node.file ? { file: node.file } : {}),
    children: (node.children ?? []).map(toOutlinerNode),
  };
}

function replaceOutlineNodeById(
  nodes: readonly OutlineNode[],
  targetId: string,
  replacement: OutlineNode
): { next: OutlineNode[]; replaced: boolean } {
  let replaced = false;
  const next = nodes.map((node) => {
    if (node.id === targetId) {
      replaced = true;
      return {
        ...replacement,
        isFolded: node.isFolded,
      };
    }
    if (node.children && node.children.length > 0) {
      const sub = replaceOutlineNodeById(node.children, targetId, replacement);
      if (sub.replaced) {
        replaced = true;
        return { ...node, children: sub.next };
      }
    }
    return node;
  });
  return { next, replaced };
}

export interface ResolvedOutlineTarget {
  readonly outlinePath: string;
  readonly outlineId: string;
  readonly rootNodeId: string;
  readonly payload: OutlineFilePayload;
  readonly healed: boolean;
}

export interface ResolvedVDocTarget {
  readonly vdocPath: string;
  readonly docId: string;
  readonly doc: VDocDocument;
  readonly healed: boolean;
}

export interface OutlineCandidateDirective {
  readonly nodeId: string;
  readonly rawToken: string;
  readonly label: string;
  readonly target: string;
  readonly boundVDocPath: string | null;
}

export interface OutlineCandidateForVDoc {
  readonly outlinePath: string;
  readonly outlineId: string;
  readonly title: string;
  readonly folder: string;
  readonly sameFolder: boolean;
  readonly inScope: boolean;
  readonly projectPath: string | null;
  readonly docDirectives: readonly OutlineCandidateDirective[];
  readonly score: number;
}

export interface VDocCandidateForOutline {
  readonly vdocPath: string;
  readonly docId: string;
  readonly title: string;
  readonly profileId: string;
  readonly folder: string;
  readonly sameFolder: boolean;
  readonly inScope: boolean;
  readonly projectPath: string | null;
  readonly alreadyBound: boolean;
  readonly score: number;
}

export interface OutlineBacklinkEntry {
  readonly vdocPath: string | null;
  readonly rawVDocUri: string;
  readonly docId?: string;
  readonly title: string;
  readonly profileId?: string;
  readonly rootNodeId: string;
  readonly rootDirectiveLabel: string;
  readonly broken: boolean;
  readonly outOfScope: boolean;
  readonly externalVDocPath?: string;
  readonly needsHeal: boolean;
}

export type VDocOutlineLinkStatus =
  | {
      readonly kind: "linked";
      readonly outlinePath: string;
      readonly outlineId: string;
      readonly rootNodeId: string;
      readonly projectPath: string | null;
      readonly healed: boolean;
    }
  | {
      readonly kind: "out-of-scope";
      readonly externalOutlinePath: string;
      readonly externalProjectPath: string | null;
      readonly currentProjectPath: string | null;
      readonly rootNodeId?: string;
    }
  | {
      readonly kind: "broken";
      readonly rawOutlineUri: string;
      readonly currentProjectPath: string | null;
    }
  | {
      readonly kind: "unlinked";
      readonly currentProjectPath: string | null;
    };

export type OutlineNodeVDocLinkStatus =
  | {
      readonly kind: "linked";
      readonly vdocPath: string;
      readonly docId: string;
      readonly title: string;
      readonly projectPath: string | null;
      readonly healed: boolean;
    }
  | {
      readonly kind: "out-of-scope";
      readonly externalVDocPath: string;
      readonly externalProjectPath: string | null;
      readonly currentProjectPath: string | null;
      readonly title: string;
    }
  | {
      readonly kind: "broken";
      readonly rawVDocUri: string;
      readonly currentProjectPath: string | null;
    }
  | {
      readonly kind: "unlinked";
      readonly currentProjectPath: string | null;
    };

/**
 * `.vproj` 프로젝트 경계 판별기:
 * - 두 파일이 같은 `*.vproj/` 폴더 안에 있으면 `true` (하위 폴더 자유 이동 및 자가 치유 허용).
 * - 둘 다 어떤 `.vproj/` 밖의 단독 문서이면 `true` (단독 영역끼리만 허용, 어떤 `.vproj/` 내부도 침범 불가).
 * - 하나만 `.vproj/` 안에 있거나 서로 다른 `.vproj/` 소속이면 `false` (경계 이탈 차단).
 */
export function isInSameProjectScope(pathA: string, pathB: string): boolean {
  return findOwningProjectPath(pathA) === findOwningProjectPath(pathB);
}

export function formatProjectScopeLabel(projectPath: string | null): string {
  if (!projectPath) return "단독 문서 영역";
  return stripProjectFolderExt(basename(projectPath));
}

/**
 * `nodeId` 가 상위 `<<doc:...>>` 안에 중첩된 하위 `<<view:section>>` 등이라면
 * 감싸는 상위 `<<doc:...>>` 의 ID 로 정규화한다 (하위 섹션이 전체 `.vdoc` 을 반토막 덮어쓰는 사고 차단).
 */
function normalizeBindingTargetNodeId(
  roots: readonly OutlineSyntaxNode[],
  nodeId: string
): string {
  if (!nodeId) return nodeId;
  const match = scanOutlineDirectives(roots).find((d) => d.nodeId === nodeId);
  if (match && match.directive.kind === "view" && match.parentDocNodeId) {
    return match.parentDocNodeId;
  }
  return nodeId;
}

function isNestedChildDirective(roots: readonly OutlineSyntaxNode[], nodeId: string): boolean {
  const match = scanOutlineDirectives(roots).find((d) => d.nodeId === nodeId);
  return Boolean(match && match.directive.kind === "view" && match.parentDocNodeId);
}

/**
 * 같은 `.outline` 안에서 동일한 `.vdoc` (`docId` 또는 `vdocPath`) 을 중복으로 가리키는
 * 고아 키나 중첩 `<<view:section>>` 키를 정리한다 (1 `.vdoc` = 1 바인딩 슬롯 불변식).
 */
function deduplicateOutlineBindingsForTarget(
  bindings: Record<string, OutlineDocBinding> | undefined,
  keepNodeId: string,
  docId: string,
  vdocUri: string
): Record<string, OutlineDocBinding> {
  const cleaned: Record<string, OutlineDocBinding> = {};
  for (const [nid, b] of Object.entries(bindings ?? {})) {
    if (nid !== keepNodeId && ((b.docId && b.docId === docId) || b.vdocPath === vdocUri)) {
      continue;
    }
    cleaned[nid] = b;
  }
  return cleaned;
}

function pickDefaultRootNodeId(
  payload: OutlineFilePayload,
  docId: string,
  vdocUri: string,
  preferredNodeId?: string
): string {
  const roots = payload.rootNodes as OutlineSyntaxNode[];
  if (preferredNodeId && findOutlineNodeChain(roots, preferredNodeId)) {
    return normalizeBindingTargetNodeId(roots, preferredNodeId);
  }
  const byDocId = Object.entries(payload.docBindings ?? {}).find(
    ([nid, b]) => b.docId && b.docId === docId && !isNestedChildDirective(roots, nid)
  );
  if (byDocId && findOutlineNodeChain(roots, byDocId[0])) {
    return byDocId[0];
  }
  const byUri = Object.entries(payload.docBindings ?? {}).find(
    ([nid, b]) => b.vdocPath === vdocUri && !isNestedChildDirective(roots, nid)
  );
  if (byUri && findOutlineNodeChain(roots, byUri[0])) {
    return byUri[0];
  }
  const firstDocDir = scanOutlineDirectives(roots).find((d) => d.directive.kind === "doc");
  if (firstDocDir) {
    return firstDocDir.nodeId;
  }
  return payload.rootNodes[0]?.id ?? "";
}

/**
 * [Self-Healing Resolver: VDoc → Outline]
 * 1) `outlineRef.outlinePath` 직접 경로 조회
 * 2) 경로가 깨졌거나 이동된 경우, 볼트 전체 `.outline` 에서 불변 ID(`outlineId` / `docBindings[*].docId` / `vdocPath` / `rootNodeId`)로 역추적
 * 3) `heal !== false` 이면 양쪽 파일의 경로·ID를 제자리 자동 치유(Self-Healing)한다.
 */
export function resolveOutlineForVDoc(
  vault: VaultPort,
  vdocPath: string,
  existingDoc?: VDocDocument,
  options?: { readonly heal?: boolean }
): ResolvedOutlineTarget | null {
  const doc =
    existingDoc ??
    (vault.exists(vdocPath) ? parseVDocJson(vault.read(vdocPath), stem(vdocPath)) : null);
  if (!doc) return null;

  const heal = options?.heal ?? true;
  const vdocUri = toVaultUri(vdocPath);
  const profileId = doc.viewId ?? resolveDocumentView(doc).id;

  const finalize = (
    outlinePath: string,
    payload: OutlineFilePayload,
    rootNodeId: string,
    recoveredByScan: boolean
  ): ResolvedOutlineTarget => {
    const outlineUri = toVaultUri(outlinePath);
    const existingBinding = rootNodeId ? payload.docBindings?.[rootNodeId] : undefined;
    const needsVDocHeal =
      doc.outlineRef?.outlinePath !== outlineUri ||
      doc.outlineRef?.outlineId !== payload.id ||
      (Boolean(rootNodeId) && doc.outlineRef?.rootNodeId !== rootNodeId);
    const needsOutlineHeal =
      Boolean(rootNodeId) &&
      (!existingBinding ||
        existingBinding.vdocPath !== vdocUri ||
        existingBinding.docId !== doc.docId);

    let finalPayload = payload;
    if (heal && !vault.isReadOnly?.() && (needsVDocHeal || needsOutlineHeal)) {
      const now = new Date().toISOString();
      const nextDoc: VDocDocument = {
        ...doc,
        outlineRef: {
          outlinePath: outlineUri,
          outlineId: payload.id,
          ...(rootNodeId ? { rootNodeId } : {}),
        },
      };
      if (needsOutlineHeal && rootNodeId) {
        finalPayload = {
          ...payload,
          docBindings: {
            ...(payload.docBindings ?? {}),
            [rootNodeId]: {
              ...(existingBinding ?? {}),
              docId: doc.docId,
              vdocPath: vdocUri,
              profileId: existingBinding?.profileId ?? profileId,
              lastSyncedAt: existingBinding?.lastSyncedAt ?? now,
            },
          },
        };
      }
      runGuardedSync([outlinePath, vdocPath], () => {
        if (needsVDocHeal && vault.exists(vdocPath)) {
          vault.write(vdocPath, serializeVDocJson(nextDoc));
        }
        if (needsOutlineHeal) {
          vault.write(outlinePath, serializeOutlineJson(finalPayload));
        }
      });
      return {
        outlinePath,
        outlineId: finalPayload.id,
        rootNodeId,
        payload: finalPayload,
        healed: true,
      };
    }

    return {
      outlinePath,
      outlineId: finalPayload.id,
      rootNodeId,
      payload: finalPayload,
      healed: recoveredByScan || needsVDocHeal || needsOutlineHeal,
    };
  };

  // Step 1: Direct path lookup (strictly within the same `.vproj` project boundary)
  if (doc.outlineRef?.outlinePath) {
    const directPath = fromVaultUri(doc.outlineRef.outlinePath);
    if (directPath && vault.exists(directPath) && isInSameProjectScope(vdocPath, directPath)) {
      try {
        const payload = parseOutlineJson(vault.read(directPath), stem(directPath));
        const rootNodeId = pickDefaultRootNodeId(
          payload,
          doc.docId,
          vdocUri,
          doc.outlineRef.rootNodeId
        );
        return finalize(directPath, payload, rootNodeId, false);
      } catch {
        // Fall through to ID-based scan
      }
    }
  }

  // Step 2: Immutable ID / Backlink scan STRICTLY within the same `.vproj` project scope
  let bestMatch: {
    priority: number;
    outlinePath: string;
    payload: OutlineFilePayload;
    rootNodeId: string;
  } | null = null;

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isOutlinePath(node.path)) continue;
    if (!isInSameProjectScope(vdocPath, node.path)) continue;
    try {
      const payload = parseOutlineJson(vault.read(node.path), node.stem);
      const roots = payload.rootNodes as OutlineSyntaxNode[];
      let priority = Number.POSITIVE_INFINITY;
      let matchedRootId = "";

      if (doc.outlineRef?.outlineId && payload.id === doc.outlineRef.outlineId) {
        priority = 1;
        matchedRootId = pickDefaultRootNodeId(
          payload,
          doc.docId,
          vdocUri,
          doc.outlineRef.rootNodeId
        );
      } else {
        const bindingByDocId = Object.entries(payload.docBindings ?? {}).find(
          ([, b]) => b.docId && b.docId === doc.docId
        );
        if (bindingByDocId) {
          priority = 2;
          matchedRootId = bindingByDocId[0];
        } else {
          const bindingByUri = Object.entries(payload.docBindings ?? {}).find(
            ([, b]) => b.vdocPath === vdocUri
          );
          if (bindingByUri) {
            priority = 3;
            matchedRootId = bindingByUri[0];
          } else if (
            doc.outlineRef?.rootNodeId &&
            doc.outlineRef.rootNodeId !== "node-1" &&
            doc.outlineRef.rootNodeId.length >= 4
          ) {
            const chain = findOutlineNodeChain(roots, doc.outlineRef.rootNodeId);
            const matchedNode = chain?.[chain.length - 1];
            if (matchedNode && parseOutlineDirective(matchedNode.text)?.kind === "doc") {
              priority = 4;
              matchedRootId = doc.outlineRef.rootNodeId;
            }
          }
        }
      }

      if (priority < (bestMatch?.priority ?? Number.POSITIVE_INFINITY)) {
        bestMatch = {
          priority,
          outlinePath: node.path,
          payload,
          rootNodeId: matchedRootId,
        };
        if (priority === 1) break;
      }
    } catch {
      // Ignore unparsable outline
    }
  }

  if (bestMatch) {
    return finalize(bestMatch.outlinePath, bestMatch.payload, bestMatch.rootNodeId, true);
  }
  return null;
}

/**
 * [Self-Healing Resolver: Outline Binding → VDoc]
 * 1) `binding.vdocPath` 직접 경로 조회
 * 2) 파일·폴더 이동으로 경로가 깨진 경우, 볼트 전체 `.vdoc` 에서 `docId` / `outlineId` 로 역추적하여 자동 치유한다.
 */
export function resolveVDocForOutlineBinding(
  vault: VaultPort,
  outlinePath: string,
  nodeId: string,
  binding: OutlineDocBinding,
  existingPayload?: OutlineFilePayload,
  options?: { readonly heal?: boolean }
): ResolvedVDocTarget | null {
  const heal = options?.heal ?? true;
  const outlineUri = toVaultUri(outlinePath);
  const payload =
    existingPayload ??
    (vault.exists(outlinePath) ? parseOutlineJson(vault.read(outlinePath), stem(outlinePath)) : undefined);

  const finalize = (
    vdocPath: string,
    doc: VDocDocument,
    recoveredByScan: boolean
  ): ResolvedVDocTarget => {
    const vdocUri = toVaultUri(vdocPath);
    const needsOutlineHeal =
      Boolean(payload) && (binding.vdocPath !== vdocUri || binding.docId !== doc.docId);
    const needsVDocHeal =
      doc.outlineRef?.outlinePath !== outlineUri ||
      (Boolean(payload?.id) && doc.outlineRef?.outlineId !== payload?.id) ||
      doc.outlineRef?.rootNodeId !== nodeId;

    let finalDoc = doc;
    if (heal && !vault.isReadOnly?.() && (needsOutlineHeal || needsVDocHeal)) {
      if (needsVDocHeal) {
        finalDoc = {
          ...doc,
          outlineRef: {
            outlinePath: outlineUri,
            ...(payload?.id ? { outlineId: payload.id } : {}),
            rootNodeId: nodeId,
          },
        };
      }
      runGuardedSync([outlinePath, vdocPath], () => {
        if (needsOutlineHeal && payload && vault.exists(outlinePath)) {
          const nextPayload: OutlineFilePayload = {
            ...payload,
            docBindings: {
              ...(payload.docBindings ?? {}),
              [nodeId]: {
                ...binding,
                docId: doc.docId,
                vdocPath: vdocUri,
              },
            },
          };
          vault.write(outlinePath, serializeOutlineJson(nextPayload));
        }
        if (needsVDocHeal) {
          vault.write(vdocPath, serializeVDocJson(finalDoc));
        }
      });
      return { vdocPath, docId: finalDoc.docId, doc: finalDoc, healed: true };
    }

    return {
      vdocPath,
      docId: finalDoc.docId,
      doc: finalDoc,
      healed: recoveredByScan || needsOutlineHeal || needsVDocHeal,
    };
  };

  // Step 1: Direct path hit (strictly within the same `.vproj` project boundary)
  const directPath = fromVaultUri(binding.vdocPath);
  if (directPath && vault.exists(directPath) && isInSameProjectScope(outlinePath, directPath)) {
    try {
      const doc = parseVDocJson(vault.read(directPath), stem(directPath));
      return finalize(directPath, doc, false);
    } catch {
      // Fall through to scan
    }
  }

  // Step 2: Immutable ID / Backlink scan STRICTLY within the same `.vproj` project scope
  let bestMatch: { priority: number; vdocPath: string; doc: VDocDocument } | null = null;

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isVDocPath(node.path)) continue;
    if (!isInSameProjectScope(outlinePath, node.path)) continue;
    try {
      const candidate = parseVDocJson(vault.read(node.path), node.stem);
      let priority = Number.POSITIVE_INFINITY;

      if (binding.docId && candidate.docId === binding.docId) {
        priority = 1;
      } else if (
        payload?.id &&
        candidate.outlineRef?.outlineId === payload.id &&
        (!candidate.outlineRef.rootNodeId || candidate.outlineRef.rootNodeId === nodeId)
      ) {
        priority = 2;
      } else if (
        candidate.outlineRef?.outlinePath === outlineUri &&
        (!candidate.outlineRef.rootNodeId || candidate.outlineRef.rootNodeId === nodeId)
      ) {
        priority = 3;
      }

      if (priority < (bestMatch?.priority ?? Number.POSITIVE_INFINITY)) {
        bestMatch = { priority, vdocPath: node.path, doc: candidate };
        if (priority === 1) break;
      }
    } catch {
      // Ignore malformed vdoc
    }
  }

  if (bestMatch) {
    return finalize(bestMatch.vdocPath, bestMatch.doc, true);
  }
  return null;
}

/**
 * [명시적 링크 연결] `.vdoc` 을 볼트 내 기존 `.outline` 파일(및 특정 `<<doc>>` 노드)에 대칭 바인딩한다.
 * 기존에 다른 `.outline` 에 연결돼 있었다면 이전 연결의 고아 바인딩도 함께 정리한다.
 */
export function bindVDocToExistingOutline(
  vault: VaultPort,
  vdocPath: string,
  outlinePath: string,
  options?: { readonly rootNodeId?: string; readonly openLink?: BridgeOpenLink }
): { readonly outlinePath: string; readonly outlineId: string; readonly rootNodeId: string } | null {
  if (vault.isReadOnly?.() || !vault.exists(vdocPath) || !vault.exists(outlinePath)) {
    return null;
  }
  // Enforce `.vproj` project boundary: refuse direct cross-project live bindings!
  if (!isInSameProjectScope(vdocPath, outlinePath)) {
    return null;
  }

  const doc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
  const vdocUri = toVaultUri(vdocPath);
  const targetUri = toVaultUri(outlinePath);

  // Clean up previous outline binding if switching to a different outline file
  const prevResolved = resolveOutlineForVDoc(vault, vdocPath, doc, { heal: false });
  const prevOutlinePath =
    prevResolved && normalizeVaultPath(prevResolved.outlinePath) !== normalizeVaultPath(outlinePath)
      ? prevResolved.outlinePath
      : null;

  const payload = parseOutlineJson(vault.read(outlinePath), stem(outlinePath));
  const rootNodeId = pickDefaultRootNodeId(payload, doc.docId, vdocUri, options?.rootNodeId);
  const now = new Date().toISOString();
  const profileId = doc.viewId ?? resolveDocumentView(doc).id;

  const nextDoc: VDocDocument = {
    ...doc,
    outlineRef: {
      outlinePath: targetUri,
      outlineId: payload.id,
      ...(rootNodeId ? { rootNodeId } : {}),
    },
  };

  const dedupedBindings = rootNodeId
    ? deduplicateOutlineBindingsForTarget(payload.docBindings, rootNodeId, doc.docId, vdocUri)
    : payload.docBindings ?? {};

  const nextPayload: OutlineFilePayload = {
    ...payload,
    ...(rootNodeId
      ? {
          docBindings: {
            ...dedupedBindings,
            [rootNodeId]: {
              docId: doc.docId,
              vdocPath: vdocUri,
              profileId,
              lastSyncedAt: now,
            },
          },
        }
      : {}),
    updatedAt: now,
  };

  const guardedPaths = prevOutlinePath ? [prevOutlinePath, outlinePath, vdocPath] : [outlinePath, vdocPath];
  runGuardedSync(guardedPaths, () => {
    if (prevOutlinePath && vault.exists(prevOutlinePath)) {
      try {
        const oldPayload = parseOutlineJson(vault.read(prevOutlinePath), stem(prevOutlinePath));
        if (oldPayload.docBindings) {
          const filtered: Record<string, OutlineDocBinding> = {};
          let removed = false;
          for (const [nid, b] of Object.entries(oldPayload.docBindings)) {
            if (b.docId === doc.docId || b.vdocPath === vdocUri) {
              removed = true;
            } else {
              filtered[nid] = b;
            }
          }
          if (removed) {
            vault.write(
              prevOutlinePath,
              serializeOutlineJson({
                ...oldPayload,
                docBindings: Object.keys(filtered).length > 0 ? filtered : undefined,
              })
            );
          }
        }
      } catch {
        // Ignore stale old outline cleanup errors
      }
    }
    vault.write(vdocPath, serializeVDocJson(nextDoc));
    vault.write(outlinePath, serializeOutlineJson(nextPayload));
  });

  options?.openLink?.(outlinePath, "split-right");
  if (rootNodeId) {
    requestOutlineReveal(outlinePath, rootNodeId, { zoom: false });
  }
  return { outlinePath, outlineId: payload.id, rootNodeId };
}

/**
 * [기존 `.outline`에 새 `<<doc>>` 브랜치로 합류 바인딩]
 * 같은 `.vproj` 안의 기존 마스터 `.outline`에 아직 이 `.vdoc`용 `<<doc:...>>` 노드가 없을 때:
 * 1) 현재 `.vdoc` 내용을 무손실 추출해 고유 `docNodeId`를 가진 새 `<<doc:...>>` 서브트리로 만든다.
 * 2) 선택한 기존 `.outline`의 `rootNodes` 끝에 해당 브랜치를 추가하고 `docBindings`를 기록한다.
 * 3) `.vdoc`에도 `sourceNodeId`와 `outlineRef`를 대칭 저장하고 페어 탭으로 열어 드러낸다.
 */
export function appendVDocBranchToExistingOutline(
  vault: VaultPort,
  vdocPath: string,
  outlinePath: string,
  options?: { readonly openLink?: BridgeOpenLink }
): { readonly outlinePath: string; readonly outlineId: string; readonly rootNodeId: string } | null {
  if (vault.isReadOnly?.() || !vault.exists(vdocPath) || !vault.exists(outlinePath)) {
    return null;
  }
  if (!isInSameProjectScope(vdocPath, outlinePath)) {
    return null;
  }

  const doc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
  const vdocUri = toVaultUri(vdocPath);
  const targetUri = toVaultUri(outlinePath);
  const payload = parseOutlineJson(vault.read(outlinePath), stem(outlinePath));
  const registry = loadVaultSyntaxRegistry(vault);

  const existingIds = new Set<string>();
  const collectIds = (nodes: readonly OutlineNode[]) => {
    for (const n of nodes) {
      existingIds.add(n.id);
      if (n.children.length > 0) collectIds(n.children);
    }
  };
  collectIds(payload.rootNodes);

  let candidateDocNodeId = `doc_${doc.docId.slice(-8)}`;
  let suffix = 1;
  while (existingIds.has(candidateDocNodeId)) {
    candidateDocNodeId = `doc_${doc.docId.slice(-8)}_${++suffix}`;
  }

  // 기존 `.outline`과 ID 충돌을 피하기 위해 임시로 sourceNodeId 충돌 노드만 비우고 추출한다
  const cleanDocForExtract: VDocDocument = {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      sourceNodeId: p.sourceNodeId && !existingIds.has(p.sourceNodeId) ? p.sourceNodeId : undefined,
      blocks: p.blocks.map((b) => ({
        ...b,
        sourceNodeId: b.sourceNodeId && !existingIds.has(b.sourceNodeId) ? b.sourceNodeId : undefined,
      })),
    })),
  };

  const { outline, patchedDoc, docNodeId } = extractBoundOutlineFromVDoc(
    cleanDocForExtract,
    registry,
    { docNodeId: candidateDocNodeId, wrapInDocDirective: true }
  );
  const newRootSyntax = outline.rootNodes[0];
  if (!newRootSyntax) return null;

  // 충돌 방지: 추출된 하위 노드 ID도 기존 트리와 겹치지 않도록 보장
  let remappedSeq = 0;
  const idRemap = new Map<string, string>();
  const ensureUniqueNode = (node: OutlineSyntaxNode): OutlineNode => {
    let nextId = node.id;
    if (existingIds.has(nextId)) {
      do {
        nextId = `nd_${doc.docId.slice(-6)}_m${++remappedSeq}`;
      } while (existingIds.has(nextId));
      idRemap.set(node.id, nextId);
    }
    existingIds.add(nextId);
    return {
      id: nextId,
      text: node.text,
      isFolded: Boolean(node.isFolded),
      ...(node.note ? { note: node.note } : {}),
      ...(node.file ? { file: node.file } : {}),
      children: (node.children ?? []).map(ensureUniqueNode),
    };
  };
  const appendedRoot = ensureUniqueNode(newRootSyntax);
  const finalRootId = appendedRoot.id || docNodeId;

  const remappedDoc: VDocDocument = {
    ...patchedDoc,
    pages: patchedDoc.pages.map((p) => ({
      ...p,
      sourceNodeId: p.sourceNodeId ? (idRemap.get(p.sourceNodeId) ?? p.sourceNodeId) : p.sourceNodeId,
      blocks: p.blocks.map((b) => ({
        ...b,
        sourceNodeId: b.sourceNodeId ? (idRemap.get(b.sourceNodeId) ?? b.sourceNodeId) : b.sourceNodeId,
      })),
    })),
    outlineRef: {
      outlinePath: targetUri,
      outlineId: payload.id,
      rootNodeId: finalRootId,
    },
  };

  const now = new Date().toISOString();
  const profileId = doc.viewId ?? resolveDocumentView(doc).id;
  const dedupedBindings = deduplicateOutlineBindingsForTarget(
    payload.docBindings,
    finalRootId,
    doc.docId,
    vdocUri
  );
  const nextPayload: OutlineFilePayload = {
    ...payload,
    rootNodes: [...payload.rootNodes, appendedRoot],
    docBindings: {
      ...dedupedBindings,
      [finalRootId]: {
        docId: doc.docId,
        vdocPath: vdocUri,
        profileId,
        lastSyncedAt: now,
      },
    },
    updatedAt: now,
  };

  const prevResolved = resolveOutlineForVDoc(vault, vdocPath, doc, { heal: false });
  const prevOutlinePath =
    prevResolved && normalizeVaultPath(prevResolved.outlinePath) !== normalizeVaultPath(outlinePath)
      ? prevResolved.outlinePath
      : null;

  const guardedPaths = prevOutlinePath ? [prevOutlinePath, outlinePath, vdocPath] : [outlinePath, vdocPath];
  runGuardedSync(guardedPaths, () => {
    if (prevOutlinePath && vault.exists(prevOutlinePath)) {
      try {
        const oldPayload = parseOutlineJson(vault.read(prevOutlinePath), stem(prevOutlinePath));
        if (oldPayload.docBindings) {
          const filtered: Record<string, OutlineDocBinding> = {};
          let removed = false;
          for (const [nid, b] of Object.entries(oldPayload.docBindings)) {
            if (b.docId === doc.docId || b.vdocPath === vdocUri) removed = true;
            else filtered[nid] = b;
          }
          if (removed) {
            vault.write(
              prevOutlinePath,
              serializeOutlineJson({
                ...oldPayload,
                docBindings: Object.keys(filtered).length > 0 ? filtered : undefined,
              })
            );
          }
        }
      } catch {
        // Ignore stale old outline cleanup errors
      }
    }
    vault.write(vdocPath, serializeVDocJson(remappedDoc));
    vault.write(outlinePath, serializeOutlineJson(nextPayload));
  });

  options?.openLink?.(outlinePath, "split-right");
  requestOutlineReveal(outlinePath, finalRootId, { zoom: false });
  return { outlinePath, outlineId: payload.id, rootNodeId: finalRootId };
}

/**
 * [읽기 전용 상태 진단: VDoc → Outline]
 * 현재 `.vdoc` 의 `.outline` 연결 상태를 4단계(`linked` / `out-of-scope` / `broken` / `unlinked`)로 진단한다.
 */
export function inspectVDocOutlineLink(
  vault: VaultPort,
  vdocPath: string,
  existingDoc?: VDocDocument
): VDocOutlineLinkStatus {
  const currentProjectPath = findOwningProjectPath(vdocPath);
  const doc =
    existingDoc ??
    (vault.exists(vdocPath) ? parseVDocJson(vault.read(vdocPath), stem(vdocPath)) : null);
  if (!doc) return { kind: "unlinked", currentProjectPath };

  const inScope = resolveOutlineForVDoc(vault, vdocPath, doc, { heal: false });
  if (inScope) {
    return {
      kind: "linked",
      outlinePath: inScope.outlinePath,
      outlineId: inScope.outlineId,
      rootNodeId: inScope.rootNodeId,
      projectPath: currentProjectPath,
      healed: inScope.healed,
    };
  }

  // Check if an outline exists OUTSIDE the current `.vproj` boundary (by path or immutable outlineId)
  if (doc.outlineRef?.outlinePath) {
    const directPath = fromVaultUri(doc.outlineRef.outlinePath);
    if (directPath && vault.exists(directPath) && !isInSameProjectScope(vdocPath, directPath)) {
      return {
        kind: "out-of-scope",
        externalOutlinePath: directPath,
        externalProjectPath: findOwningProjectPath(directPath),
        currentProjectPath,
        rootNodeId: doc.outlineRef.rootNodeId,
      };
    }
  }
  if (doc.outlineRef?.outlineId) {
    for (const node of vault.listAll()) {
      if (node.kind !== "file" || !isOutlinePath(node.path)) continue;
      if (isInSameProjectScope(vdocPath, node.path)) continue;
      try {
        const p = parseOutlineJson(vault.read(node.path), node.stem);
        if (p.id === doc.outlineRef.outlineId) {
          return {
            kind: "out-of-scope",
            externalOutlinePath: node.path,
            externalProjectPath: findOwningProjectPath(node.path),
            currentProjectPath,
            rootNodeId: doc.outlineRef.rootNodeId,
          };
        }
      } catch {
        // Skip malformed outline
      }
    }
  }

  if (doc.outlineRef?.outlinePath) {
    return {
      kind: "broken",
      rawOutlineUri: doc.outlineRef.outlinePath,
      currentProjectPath,
    };
  }
  return { kind: "unlinked", currentProjectPath };
}

/**
 * [읽기 전용 상태 진단: Outline `<<doc>>` 노드 → VDoc]
 * `.outline` 본문 불릿 인라인 칩 및 상단 툴바에 투영할 4단계 상태를 반환한다.
 */
export function inspectOutlineNodeVDocLink(
  vault: VaultPort,
  outlinePath: string,
  nodeId: string,
  existingPayload?: OutlineFilePayload
): OutlineNodeVDocLinkStatus {
  const currentProjectPath = findOwningProjectPath(outlinePath);
  const payload =
    existingPayload ??
    (vault.exists(outlinePath)
      ? parseOutlineJson(vault.read(outlinePath), stem(outlinePath))
      : null);
  if (!payload) return { kind: "unlinked", currentProjectPath };

  const binding = payload.docBindings?.[nodeId];
  if (binding) {
    const resolved = resolveVDocForOutlineBinding(vault, outlinePath, nodeId, binding, payload, {
      heal: false,
    });
    if (resolved) {
      return {
        kind: "linked",
        vdocPath: resolved.vdocPath,
        docId: resolved.docId,
        title: resolved.doc.title || stem(resolved.vdocPath),
        projectPath: currentProjectPath,
        healed: resolved.healed,
      };
    }

    // Check if the bound `.vdoc` exists OUTSIDE the `.vproj` boundary
    const directPath = fromVaultUri(binding.vdocPath);
    if (directPath && vault.exists(directPath) && !isInSameProjectScope(outlinePath, directPath)) {
      let title = stem(directPath);
      try {
        title = parseVDocJson(vault.read(directPath), title).title || title;
      } catch {
        // Use stem fallback
      }
      return {
        kind: "out-of-scope",
        externalVDocPath: directPath,
        externalProjectPath: findOwningProjectPath(directPath),
        currentProjectPath,
        title,
      };
    }
    if (binding.docId) {
      for (const node of vault.listAll()) {
        if (node.kind !== "file" || !isVDocPath(node.path)) continue;
        if (isInSameProjectScope(outlinePath, node.path)) continue;
        try {
          const cand = parseVDocJson(vault.read(node.path), node.stem);
          if (cand.docId === binding.docId) {
            return {
              kind: "out-of-scope",
              externalVDocPath: node.path,
              externalProjectPath: findOwningProjectPath(node.path),
              currentProjectPath,
              title: cand.title || node.stem,
            };
          }
        } catch {
          // Skip malformed vdoc
        }
      }
    }

    return {
      kind: "broken",
      rawVDocUri: binding.vdocPath,
      currentProjectPath,
    };
  }

  // Also check reverse `.vdoc` references inside the SAME project scope
  const outlineUri = toVaultUri(outlinePath);
  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isVDocPath(node.path)) continue;
    if (!isInSameProjectScope(outlinePath, node.path)) continue;
    try {
      const cand = parseVDocJson(vault.read(node.path), node.stem);
      const matchesOutline =
        (cand.outlineRef?.outlineId && cand.outlineRef.outlineId === payload.id) ||
        cand.outlineRef?.outlinePath === outlineUri;
      if (matchesOutline && (!cand.outlineRef?.rootNodeId || cand.outlineRef.rootNodeId === nodeId)) {
        return {
          kind: "linked",
          vdocPath: node.path,
          docId: cand.docId,
          title: cand.title || node.stem,
          projectPath: currentProjectPath,
          healed: true,
        };
      }
    } catch {
      // Skip malformed vdoc
    }
  }

  return { kind: "unlinked", currentProjectPath };
}

/**
 * [명시적 프로젝트 등록 & 바인딩]
 * 프로젝트 경계 외부에 있는 짝 파일(`externalPartnerPath`)을 기준 파일(`anchorPath`)의
 * 소유 `.vproj/` 폴더(또는 단독 문서 폴더)로 이동(등록)한 뒤, 경로 리라이트 + ID 대칭 바인딩까지 한 번에 완료한다.
 */
export function importPartnerIntoProjectAndBind(
  vault: VaultPort,
  anchorPath: string,
  externalPartnerPath: string,
  options?: { readonly rootNodeId?: string; readonly openLink?: BridgeOpenLink }
): { readonly importedPath: string; readonly boundOutlinePath: string; readonly boundVDocPath: string } | null {
  if (vault.isReadOnly?.() || !vault.exists(anchorPath) || !vault.exists(externalPartnerPath)) {
    return null;
  }

  const targetDir = findOwningProjectPath(anchorPath) ?? dirname(anchorPath);
  const partnerIsOutline = isOutlinePath(externalPartnerPath);
  const partnerIsVDoc = isVDocPath(externalPartnerPath);
  if (!partnerIsOutline && !partnerIsVDoc) return null;

  let nextPartnerPath = externalPartnerPath;
  if (!isInSameProjectScope(anchorPath, externalPartnerPath)) {
    const ext = partnerIsOutline ? "outline" : "vdoc";
    const desiredPath = joinPath(targetDir, basename(externalPartnerPath));
    nextPartnerPath = vault.exists(desiredPath)
      ? vault.getUniquePath(targetDir, stem(externalPartnerPath), ext)
      : desiredPath;

    vault.rename(externalPartnerPath, nextPartnerPath);
    runVaultRenameRewriters(vault, externalPartnerPath, nextPartnerPath, [
      rewriteVDocPointersOnRename,
      rewriteOutlineBindingsOnRename,
    ]);
  }

  const vdocPath = partnerIsOutline ? anchorPath : nextPartnerPath;
  const outlinePath = partnerIsOutline ? nextPartnerPath : anchorPath;
  const bound = bindVDocToExistingOutline(vault, vdocPath, outlinePath, {
    rootNodeId: options?.rootNodeId,
    openLink: partnerIsOutline ? options?.openLink : undefined,
  });
  if (!bound) return null;

  if (!partnerIsOutline) {
    options?.openLink?.(vdocPath, "split-right");
  }
  return {
    importedPath: nextPartnerPath,
    boundOutlinePath: outlinePath,
    boundVDocPath: vdocPath,
  };
}

/**
 * [명시적 링크 해제 — Outline 측]
 * `.outline` 의 특정 `nodeId` 바인딩을 제거하고, 같은 프로젝트 내 연결된 `.vdoc` 의 `outlineRef` 도 대칭 제거한다.
 */
export function unlinkOutlineNodeBinding(
  vault: VaultPort,
  outlinePath: string,
  nodeId: string
): boolean {
  if (vault.isReadOnly?.() || !vault.exists(outlinePath)) return false;
  const payload = parseOutlineJson(vault.read(outlinePath), stem(outlinePath));
  const binding = payload.docBindings?.[nodeId];
  const resolved = binding
    ? resolveVDocForOutlineBinding(vault, outlinePath, nodeId, binding, payload, { heal: false })
    : null;
  if (!binding && !resolved) return false;

  const nextBindings: Record<string, OutlineDocBinding> = {};
  for (const [nid, b] of Object.entries(payload.docBindings ?? {})) {
    if (nid !== nodeId) nextBindings[nid] = b;
  }

  const guarded = resolved ? [outlinePath, resolved.vdocPath] : [outlinePath];
  runGuardedSync(guarded, () => {
    vault.write(
      outlinePath,
      serializeOutlineJson({
        ...payload,
        docBindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
        updatedAt: new Date().toISOString(),
      })
    );
    if (resolved && vault.exists(resolved.vdocPath)) {
      const { outlineRef: _removed, ...restDoc } = resolved.doc;
      void _removed;
      vault.write(resolved.vdocPath, serializeVDocJson(restDoc));
    }
  });
  return true;
}

/**
 * [명시적 링크 해제 — VDoc 측] `.vdoc` 의 `outlineRef` 와 대응 `.outline` 의 `docBindings` 를 대칭 제거한다.
 */
export function unlinkVDocFromOutline(vault: VaultPort, vdocPath: string): boolean {
  if (vault.isReadOnly?.() || !vault.exists(vdocPath)) return false;
  const doc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
  const resolved = resolveOutlineForVDoc(vault, vdocPath, doc, { heal: false });
  if (!doc.outlineRef && !resolved) return false;

  const vdocUri = toVaultUri(vdocPath);
  const { outlineRef: _removed, ...restDoc } = doc;
  void _removed;

  const guardedPaths = resolved ? [resolved.outlinePath, vdocPath] : [vdocPath];
  runGuardedSync(guardedPaths, () => {
    vault.write(vdocPath, serializeVDocJson(restDoc));
    if (resolved && vault.exists(resolved.outlinePath)) {
      const payload = parseOutlineJson(vault.read(resolved.outlinePath), stem(resolved.outlinePath));
      if (payload.docBindings) {
        const nextBindings: Record<string, OutlineDocBinding> = {};
        let changed = false;
        for (const [nid, b] of Object.entries(payload.docBindings)) {
          if (
            nid === resolved.rootNodeId ||
            b.docId === doc.docId ||
            b.vdocPath === vdocUri
          ) {
            changed = true;
          } else {
            nextBindings[nid] = b;
          }
        }
        if (changed) {
          vault.write(
            resolved.outlinePath,
            serializeOutlineJson({
              ...payload,
              docBindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
            })
          );
        }
      }
    }
  });
  return true;
}

/**
 * `.vdoc` 문서에 연결할 수 있는 `.outline` 후보 목록을 수집한다.
 * 기본값(`includeExternal: false`)은 같은 `.vproj` 프로젝트 경계 내부만 반환하며,
 * `includeExternal: true` 를 주면 프로젝트 밖 후보(가져와 등록 대상)도 함께 반환한다.
 */
export function collectOutlineCandidatesForVDoc(
  vault: VaultPort,
  vdocPath: string,
  existingDoc?: VDocDocument,
  options?: { readonly includeExternal?: boolean }
): OutlineCandidateForVDoc[] {
  const doc =
    existingDoc ??
    (vault.exists(vdocPath) ? parseVDocJson(vault.read(vdocPath), stem(vdocPath)) : undefined);
  const includeExternal = options?.includeExternal ?? false;
  const vdocDir = dirname(vdocPath);
  const vdocParentDir = dirname(vdocDir);
  const profileId = doc ? doc.viewId ?? resolveDocumentView(doc).id : undefined;
  const keywords = `${stem(vdocPath)} ${doc?.title ?? ""}`
    .toLowerCase()
    .split(/[\s._\-/()[\]]+/)
    .filter((w) => w.length >= 2);

  const candidates: OutlineCandidateForVDoc[] = [];

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isOutlinePath(node.path)) continue;
    const inScope = isInSameProjectScope(vdocPath, node.path);
    if (!inScope && !includeExternal) continue;
    try {
      const payload = parseOutlineJson(vault.read(node.path), node.stem);
      const folder = dirname(node.path);
      const sameFolder = folder === vdocDir;
      const projectPath = findOwningProjectPath(node.path);
      const directives = scanOutlineDirectives(payload.rootNodes as OutlineSyntaxNode[]).filter(
        (d) => d.directive.kind === "doc"
      );

      const docDirectives: OutlineCandidateDirective[] = directives.map((d) => {
        const b = payload.docBindings?.[d.nodeId];
        const bp = b ? fromVaultUri(b.vdocPath) : null;
        return {
          nodeId: d.nodeId,
          rawToken: d.directive.rawToken,
          label: d.directive.label || payload.title,
          target: d.directive.target,
          boundVDocPath: bp && vault.exists(bp) ? bp : null,
        };
      });

      let score = inScope ? 50 : 0;
      if (sameFolder) score += 30;
      else if (folder && (folder === vdocParentDir || vdocDir.startsWith(`${folder}/`))) score += 15;

      const haystack = `${node.stem} ${payload.title} ${docDirectives.map((d) => d.label).join(" ")}`.toLowerCase();
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 8;
      }
      if (profileId && docDirectives.some((d) => d.target === profileId)) {
        score += 10;
      }
      if (docDirectives.length > 0) score += 5;

      candidates.push({
        outlinePath: node.path,
        outlineId: payload.id,
        title: payload.title || node.stem,
        folder,
        sameFolder,
        inScope,
        projectPath,
        docDirectives,
        score,
      });
    } catch {
      // Skip malformed outline
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.outlinePath.localeCompare(b.outlinePath));
  return candidates;
}

/**
 * `.outline` 의 `<<doc:...>>` 노드에 연결할 수 있는 `.vdoc` 후보 목록을 수집한다.
 * 기본값(`includeExternal: false`)은 같은 `.vproj` 프로젝트 경계 내부만 반환한다.
 */
export function collectVDocCandidatesForOutline(
  vault: VaultPort,
  outlinePath: string,
  options?: { readonly includeExternal?: boolean }
): VDocCandidateForOutline[] {
  const includeExternal = options?.includeExternal ?? false;
  const outlineDir = dirname(outlinePath);
  const outlineStem = stem(outlinePath).toLowerCase();
  const keywords = outlineStem.split(/[\s._\-/()[\]]+/).filter((w) => w.length >= 2);
  const candidates: VDocCandidateForOutline[] = [];

  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isVDocPath(node.path)) continue;
    const inScope = isInSameProjectScope(outlinePath, node.path);
    if (!inScope && !includeExternal) continue;
    try {
      const doc = parseVDocJson(vault.read(node.path), node.stem);
      const folder = dirname(node.path);
      const sameFolder = folder === outlineDir;
      const projectPath = findOwningProjectPath(node.path);
      const profileId = doc.viewId ?? resolveDocumentView(doc).id;

      let score = inScope ? 50 : 0;
      if (sameFolder) score += 30;
      const haystack = `${node.stem} ${doc.title}`.toLowerCase();
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 8;
      }

      candidates.push({
        vdocPath: node.path,
        docId: doc.docId,
        title: doc.title || node.stem,
        profileId,
        folder,
        sameFolder,
        inScope,
        projectPath,
        alreadyBound: Boolean(doc.outlineRef?.outlinePath),
        score,
      });
    } catch {
      // Skip malformed vdoc
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.vdocPath.localeCompare(b.vdocPath));
  return candidates;
}

/**
 * [Obsidian Backlinks] 특정 `.outline` 파일을 원천으로 참조하는 같은 `.vproj` 내 모든 `.vdoc` 문서(1:N)를 수집한다.
 * 프로젝트 경계 밖으로 나간 바인딩은 `outOfScope: true` 로 명시해 사용자가 프로젝트 등록/해제를 결정할 수 있게 한다.
 */
export function collectOutlineBacklinks(
  vault: VaultPort,
  outlinePath: string
): OutlineBacklinkEntry[] {
  if (!vault.exists(outlinePath)) return [];
  const payload = parseOutlineJson(vault.read(outlinePath), stem(outlinePath));
  const outlineUri = toVaultUri(outlinePath);
  const roots = payload.rootNodes as OutlineSyntaxNode[];
  const directivesById = new Map<string, string>();
  for (const d of scanOutlineDirectives(roots)) {
    directivesById.set(d.nodeId, d.directive.label || d.directive.rawToken);
  }

  const results: OutlineBacklinkEntry[] = [];
  const seenVDocPaths = new Set<string>();
  const seenDocIds = new Set<string>();

  // 1) Forward entries from `payload.docBindings` (strictly project-scoped)
  for (const [nodeId, binding] of Object.entries(payload.docBindings ?? {})) {
    const status = inspectOutlineNodeVDocLink(vault, outlinePath, nodeId, payload);
    const label =
      directivesById.get(nodeId) ??
      findOutlineNodeChain(roots, nodeId)?.slice(-1)[0]?.text.trim() ??
      nodeId;
    if (status.kind === "linked") {
      seenVDocPaths.add(normalizeVaultPath(status.vdocPath));
      seenDocIds.add(status.docId);
      results.push({
        vdocPath: status.vdocPath,
        rawVDocUri: binding.vdocPath,
        docId: status.docId,
        title: status.title,
        profileId: binding.profileId,
        rootNodeId: nodeId,
        rootDirectiveLabel: label,
        broken: false,
        outOfScope: false,
        needsHeal: status.healed,
      });
    } else if (status.kind === "out-of-scope") {
      results.push({
        vdocPath: null,
        rawVDocUri: binding.vdocPath,
        docId: binding.docId,
        title: status.title,
        profileId: binding.profileId,
        rootNodeId: nodeId,
        rootDirectiveLabel: label,
        broken: false,
        outOfScope: true,
        externalVDocPath: status.externalVDocPath,
        needsHeal: false,
      });
    } else {
      const rawPath = fromVaultUri(binding.vdocPath) ?? binding.vdocPath;
      results.push({
        vdocPath: null,
        rawVDocUri: binding.vdocPath,
        docId: binding.docId,
        title: basename(rawPath),
        profileId: binding.profileId,
        rootNodeId: nodeId,
        rootDirectiveLabel: label,
        broken: true,
        outOfScope: false,
        needsHeal: false,
      });
    }
  }

  // 2) Reverse-scan `.vdoc` files STRICTLY within the same `.vproj` project scope
  for (const node of vault.listAll()) {
    if (node.kind !== "file" || !isVDocPath(node.path)) continue;
    if (!isInSameProjectScope(outlinePath, node.path)) continue;
    const norm = normalizeVaultPath(node.path);
    if (seenVDocPaths.has(norm)) continue;
    try {
      const doc = parseVDocJson(vault.read(node.path), node.stem);
      if (seenDocIds.has(doc.docId)) continue;
      const matchesOutline =
        (doc.outlineRef?.outlineId && doc.outlineRef.outlineId === payload.id) ||
        doc.outlineRef?.outlinePath === outlineUri;
      if (!matchesOutline) continue;

      const rootNodeId = doc.outlineRef?.rootNodeId ?? "";
      const label =
        (rootNodeId ? directivesById.get(rootNodeId) : undefined) ?? payload.title;
      results.push({
        vdocPath: node.path,
        rawVDocUri: toVaultUri(node.path),
        docId: doc.docId,
        title: doc.title || node.stem,
        profileId: doc.viewId ?? resolveDocumentView(doc).id,
        rootNodeId,
        rootDirectiveLabel: label,
        broken: false,
        outOfScope: false,
        needsHeal: doc.outlineRef?.outlinePath !== outlineUri || !payload.docBindings?.[rootNodeId],
      });
    } catch {
      // Ignore malformed vdoc
    }
  }

  return results;
}

export interface CompilePreviewResult {
  readonly doc: VDocDocument | null;
  readonly boundVDocPath: string | null;
  readonly target: ScannedOutlineDirective | null;
  readonly assets: Record<string, ParsedOutlineAsset>;
}

/**
 * `.outline` 의 특정 지시어 노드(`targetNodeId`)를 비파괴 컴파일하여 프리뷰용 `VDocDocument` 를 반환한다.
 * 바인딩된 `.vdoc` 이 존재하면 그 파일을 `baseDoc` 으로 삼아 스킨/이미지/비율 오버레이를 적용한다.
 */
export function compileOutlineTargetForPreview(
  vault: VaultPort,
  outlinePath: string,
  payload: OutlineFilePayload,
  targetNodeId: string,
  options?: { readonly assetHint?: string; readonly registry?: ElementSyntaxRegistry }
): CompilePreviewResult {
  const roots = payload.rootNodes as OutlineSyntaxNode[];
  const assets = extractOutlineAssets(roots);
  const scanned = scanOutlineDirectives(roots);
  const target = scanned.find((d) => d.nodeId === targetNodeId) ?? null;
  if (!target) {
    return { doc: null, boundVDocPath: null, target: null, assets };
  }

  const binding = payload.docBindings?.[targetNodeId];
  const resolvedBound = binding
    ? resolveVDocForOutlineBinding(vault, outlinePath, targetNodeId, binding, payload, {
        heal: false,
      })
    : null;
  const boundPath = resolvedBound?.vdocPath ?? null;
  const baseDoc = resolvedBound?.doc;

  const registry = options?.registry ?? loadVaultSyntaxRegistry(vault);
  const assetResolver = buildVaultAssetResolver(vault, outlinePath, baseDoc);
  const resolveEvidencePath = (rawTarget: string): string | undefined => {
    const trimmed = rawTarget.trim();
    if (!trimmed) return undefined;
    if (/^vault:\/\//i.test(trimmed)) return trimmed;
    if (vault.exists(trimmed)) return toVaultUri(trimmed);
    const needle = trimmed.toLowerCase();
    const hit = vault.listAll().find((n) => {
      if (n.kind !== "file") return false;
      const base = basename(n.path).toLowerCase();
      const noExt = base.replace(/\.[^.]+$/, "");
      return base === needle || noExt === needle || n.path.toLowerCase().endsWith(`/${needle}`);
    });
    return hit ? toVaultUri(hit.path) : undefined;
  };
  const compiled = compileDirectiveSubtreeToVDoc(roots, targetNodeId, {
    registry,
    baseDoc,
    outlineAssets: assets,
    assetHint: options?.assetHint,
    assetResolver,
    nodeEvidence: payload.nodeEvidence,
    resolveEvidencePath,
    registryPath: vault.exists(STANDARD_SYNTAX_PATH) ? toVaultUri(STANDARD_SYNTAX_PATH) : undefined,
    outlineRef: {
      outlinePath: toVaultUri(outlinePath),
      outlineId: payload.id,
      rootNodeId: targetNodeId,
    },
  });

  return {
    doc: compiled,
    boundVDocPath: boundPath,
    target,
    assets,
  };
}

/**
 * `.outline` 변경 시 바인딩된 모든 `.vdoc` 파일에 비파괴 증분 컴파일 결과를 실시간 동기화한다.
 * - 상위 `<<doc>>` 안에 중첩된 하위 `<<view:section>>` 고아 바인딩은 건너뛰어 전체 문서를 반토막 덮어쓰는 사고를 차단한다.
 * - 동일 `.vdoc` 경로는 한 번의 동기화 사이클에서 단 한 번만 기록한다.
 */
export function syncAllBoundVDocsFromOutline(
  vault: VaultPort,
  outlinePath: string,
  payload: OutlineFilePayload,
  options?: { readonly assetHintByNodeId?: Record<string, string> }
): string[] {
  if (vault.isReadOnly?.()) return [];
  if (isPathInBidirectionalSync(outlinePath)) return [];
  const bindings = payload.docBindings;
  if (!bindings || Object.keys(bindings).length === 0) return [];

  const roots = payload.rootNodes as OutlineSyntaxNode[];
  const registry = loadVaultSyntaxRegistry(vault);
  const updatedVDocs: string[] = [];
  const handledVDocPaths = new Set<string>();

  // `<<doc:...>>` 루트 바인딩을 먼저 처리하고, 중첩된 하위 `<<view:...>>` 고아 바인딩은 제외한다.
  const entries = Object.entries(bindings).filter(([nodeId]) => !isNestedChildDirective(roots, nodeId));

  for (const [nodeId, binding] of entries) {
    const resolved = resolveVDocForOutlineBinding(vault, outlinePath, nodeId, binding, payload, {
      heal: true,
    });
    if (!resolved) continue;
    const vdocPath = resolved.vdocPath;
    const normVDoc = normalizeVaultPath(vdocPath);
    if (handledVDocPaths.has(normVDoc)) continue;
    handledVDocPaths.add(normVDoc);

    const chain = findOutlineNodeChain(roots, nodeId);
    if (!chain) continue;

    const prevDoc = resolved.doc;
    const latestPayload = vault.exists(outlinePath)
      ? parseOutlineJson(vault.read(outlinePath), stem(outlinePath))
      : payload;
    const { doc: compiled } = compileOutlineTargetForPreview(
      vault,
      outlinePath,
      latestPayload,
      nodeId,
      {
        registry,
        assetHint: options?.assetHintByNodeId?.[nodeId],
      }
    );
    if (!compiled) continue;

    if (canonicalVDocSignature(prevDoc) === canonicalVDocSignature(compiled)) {
      continue;
    }

    runGuardedSync([outlinePath, vdocPath], () => {
      vault.write(vdocPath, serializeVDocJson(compiled));
    });
    updatedVDocs.push(vdocPath);
  }

  return updatedVDocs;
}

export interface MaterializeVDocResult {
  readonly vdocPath: string;
  readonly created: boolean;
}

/**
 * [Outline → VDoc] 마스터 `.outline` 의 특정 `<<doc:...>>` (또는 독립 `<<view:...>>`) 노드를
 * 실제 `.vdoc` 파일로 구체화(또는 기존 바인딩 파일만 정밀 컴파일 · ID 기반 자가 치유 포함)하고 양방향 바인딩을 기록한다.
 */
export function materializeVDocFromOutlineDirective(
  vault: VaultPort,
  outlinePath: string,
  rawTargetNodeId: string,
  openLink?: BridgeOpenLink,
  options?: { readonly assetHint?: string }
): MaterializeVDocResult | null {
  if (!vault.exists(outlinePath)) return null;
  const payload = parseOutlineJson(vault.read(outlinePath), stem(outlinePath));
  const roots = payload.rootNodes as OutlineSyntaxNode[];
  const targetNodeId = normalizeBindingTargetNodeId(roots, rawTargetNodeId);
  const existingBinding = payload.docBindings?.[targetNodeId];
  const resolvedExisting = existingBinding
    ? resolveVDocForOutlineBinding(vault, outlinePath, targetNodeId, existingBinding, payload, {
        heal: true,
      })
    : null;

  if (resolvedExisting) {
    const vdocPath = resolvedExisting.vdocPath;
    const vdocUri = toVaultUri(vdocPath);
    let refreshedPayload = parseOutlineJson(vault.read(outlinePath), stem(outlinePath));

    // 동일 `.vdoc` 을 중복 가리키는 과거 하위 섹션 고아 키가 남아있다면 자동 정리
    const deduped = deduplicateOutlineBindingsForTarget(
      refreshedPayload.docBindings,
      targetNodeId,
      resolvedExisting.docId,
      vdocUri
    );
    if (
      !vault.isReadOnly?.() &&
      Object.keys(deduped).length !== Object.keys(refreshedPayload.docBindings ?? {}).length
    ) {
      refreshedPayload = { ...refreshedPayload, docBindings: deduped };
      runGuardedSync([outlinePath], () => {
        vault.write(outlinePath, serializeOutlineJson(refreshedPayload));
      });
    }

    // 요청받은 `targetNodeId` 단 하나만 정밀 컴파일 (다른 바인딩 키가 덮어쓰는 사고 완전 차단)
    if (!vault.isReadOnly?.()) {
      const prevDoc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
      const { doc: compiled } = compileOutlineTargetForPreview(
        vault,
        outlinePath,
        refreshedPayload,
        targetNodeId,
        { assetHint: options?.assetHint }
      );
      if (compiled && canonicalVDocSignature(prevDoc) !== canonicalVDocSignature(compiled)) {
        runGuardedSync([outlinePath, vdocPath], () => {
          vault.write(vdocPath, serializeVDocJson(compiled));
        });
      }
    }

    openLink?.(vdocPath, "split-right");
    return { vdocPath, created: false };
  }

  if (vault.isReadOnly?.()) return null;

  const { doc: compiled, target } = compileOutlineTargetForPreview(
    vault,
    outlinePath,
    payload,
    targetNodeId,
    { assetHint: options?.assetHint }
  );
  if (!compiled || !target) return null;

  const fallbackStem = `${stem(outlinePath)}_${target.directive.target}`;
  const docStem = sanitizeFileStem(target.directive.label || compiled.title, fallbackStem);
  const vdocPath = vault.getUniquePath(dirname(outlinePath), docStem, "vdoc");

  const finalDoc: VDocDocument = {
    ...compiled,
    outlineRef: {
      outlinePath: toVaultUri(outlinePath),
      outlineId: payload.id,
      rootNodeId: targetNodeId,
    },
  };

  const nextBinding: OutlineDocBinding = {
    docId: finalDoc.docId,
    vdocPath: toVaultUri(vdocPath),
    profileId: finalDoc.viewId ?? finalDoc.schemaRef?.profileId,
    lastSyncedAt: new Date().toISOString(),
  };

  const nextPayload: OutlineFilePayload = {
    ...payload,
    docBindings: {
      ...(payload.docBindings ?? {}),
      [targetNodeId]: nextBinding,
    },
    updatedAt: new Date().toISOString(),
  };

  runGuardedSync([outlinePath, vdocPath], () => {
    vault.createFile(vdocPath, serializeVDocJson(finalDoc));
    vault.write(outlinePath, serializeOutlineJson(nextPayload));
  });

  openLink?.(vdocPath, "split-right");
  return { vdocPath, created: true };
}

export interface OpenOutlineForVDocResult {
  readonly outlinePath: string;
  readonly rootNodeId: string;
  readonly created: boolean;
  readonly healed?: boolean;
  /** 단독 `.vdoc`을 새 `.vproj` 폴더로 승격 이동한 경우 이동된 `.vdoc` 경로와 프로젝트 폴더 경로 */
  readonly vdocPath?: string;
  readonly projectPath?: string | null;
  readonly promotedToProject?: boolean;
}

/**
 * [VDoc → Outline] `.vdoc` 문서에서 `[구조]` 모드 또는 `[아웃라인으로 작업하기]` 를 눌렀을 때:
 * 1) 연결된 `.outline` 을 직접 경로 또는 불변 ID 자가 치유(`resolveOutlineForVDoc`)로 찾아 즉시 연다.
 * 2) 연결된 `.outline` 이 없을 때:
 *    - `options.allowCreate === false` 이면 몰래 새 파일을 만들지 않고 `null` 을 반환한다 (UI에서 명시적 연결 피커 표시).
 *    - `options.allowCreate !== false` (기본값 `true`) 이면 무손실 역추출로 `<이름>.outline` 을 생성하고 ID+경로 대칭 바인딩한다.
 *    - `options.promoteStandaloneToProject === true` 이고 현재 `.vdoc`이 어떤 `.vproj/` 밖(단독 문서)에 있다면,
 *      새 `<이름>.vproj/` 프로젝트 폴더를 만들고 현재 `.vdoc`을 그 안으로 옮긴 뒤 같은 폴더에 `.outline`을 생성·바인딩한다.
 */
export function openOrCreateOutlineForVDoc(
  vault: VaultPort,
  vdocPath: string,
  openLink?: BridgeOpenLink,
  options?: {
    readonly focusNodeId?: string;
    readonly allowCreate?: boolean;
    readonly outlineName?: string;
    readonly promoteStandaloneToProject?: boolean;
  }
): OpenOutlineForVDocResult | null {
  if (!vault.exists(vdocPath)) return null;
  const doc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));

  // Case A: Bound directly OR recoverable via immutable ID / backlink self-healing
  const resolved = resolveOutlineForVDoc(vault, vdocPath, doc, { heal: true });
  if (resolved) {
    openLink?.(resolved.outlinePath, "split-right");
    const targetRevealId = options?.focusNodeId ?? resolved.rootNodeId;
    if (targetRevealId) {
      requestOutlineReveal(resolved.outlinePath, targetRevealId, { zoom: false });
    }
    return {
      outlinePath: resolved.outlinePath,
      rootNodeId: resolved.rootNodeId,
      created: false,
      healed: resolved.healed,
      vdocPath,
      projectPath: findOwningProjectPath(vdocPath),
      promotedToProject: false,
    };
  }

  // Never silently auto-create when caller asks for explicit-link confirmation
  if (options?.allowCreate === false) return null;

  // Case B: Explicitly requested creation -> promote standalone `.vdoc` into a new `.vproj/` when requested
  if (vault.isReadOnly?.()) return null;

  const customStem = options?.outlineName?.trim()
    ? sanitizeFileStem(options.outlineName.trim().replace(/\.outline$/i, ""), stem(vdocPath))
    : sanitizeFileStem(stem(vdocPath), "outline");

  let effectiveVDocPath = vdocPath;
  let projectPath = findOwningProjectPath(vdocPath);
  let promotedToProject = false;

  if (options?.promoteStandaloneToProject && !projectPath) {
    const parentDir = dirname(vdocPath);
    const projFolderPath = vault.getUniquePath(parentDir, customStem, "vproj");
    vault.createFolder(projFolderPath);
    const moved = vault.move(vdocPath, projFolderPath);
    effectiveVDocPath = moved.newPath;
    projectPath = projFolderPath;
    promotedToProject = true;
  }

  const effectiveDoc = vault.exists(effectiveVDocPath)
    ? parseVDocJson(vault.read(effectiveVDocPath), stem(effectiveVDocPath))
    : doc;
  const vdocUri = toVaultUri(effectiveVDocPath);
  const registry = loadVaultSyntaxRegistry(vault);
  const { outline, patchedDoc, docNodeId } = extractBoundOutlineFromVDoc(effectiveDoc, registry);
  const outlineDir = dirname(effectiveVDocPath);
  const outlinePath = vault.getUniquePath(outlineDir, customStem, "outline");
  const now = new Date().toISOString();
  const outlineId = outline.id ?? `outline-${effectiveDoc.docId}`;

  const outlinePayload: OutlineFilePayload = {
    version: 1,
    id: outlineId,
    title: options?.outlineName?.trim() || outline.title || effectiveDoc.title || customStem,
    defaultView: "bullets",
    createdAt: now,
    updatedAt: now,
    docBindings: {
      [docNodeId]: {
        docId: patchedDoc.docId,
        vdocPath: vdocUri,
        profileId: effectiveDoc.viewId ?? resolveDocumentView(effectiveDoc).id,
        lastSyncedAt: now,
      },
    },
    rootNodes: outline.rootNodes.map(toOutlinerNode),
  };

  const finalDoc: VDocDocument = {
    ...patchedDoc,
    outlineRef: {
      outlinePath: toVaultUri(outlinePath),
      outlineId,
      rootNodeId: docNodeId,
    },
  };

  runGuardedSync([outlinePath, effectiveVDocPath], () => {
    vault.createFile(outlinePath, serializeOutlineJson(outlinePayload));
    vault.write(effectiveVDocPath, serializeVDocJson(finalDoc));
  });

  openLink?.(outlinePath, "split-right");
  requestOutlineReveal(outlinePath, options?.focusNodeId ?? docNodeId, { zoom: false });

  return {
    outlinePath,
    rootNodeId: docNodeId,
    created: true,
    vdocPath: effectiveVDocPath,
    projectPath,
    promotedToProject,
  };
}

/**
 * [VDoc 구조 모드 → Outline에서 컴파일 당겨오기]
 * `.vdoc` 탭에서 `[← 구조에서 컴파일]` 을 눌렀을 때 연결된 `.outline` 의 `rootNodeId` 를
 * 비파괴 증분 컴파일해 현재 `.vdoc` 에 반영한다 (경로가 이동되었으면 ID 자가 치유 수행).
 */
export function compileBoundOutlineIntoVDoc(
  vault: VaultPort,
  vdocPath: string
): boolean {
  if (vault.isReadOnly?.() || !vault.exists(vdocPath)) return false;
  const prevDoc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
  const resolved = resolveOutlineForVDoc(vault, vdocPath, prevDoc, { heal: true });
  if (!resolved || !resolved.rootNodeId) return false;

  const { outlinePath, payload, rootNodeId } = resolved;
  const latestDoc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
  const { doc: compiled } = compileOutlineTargetForPreview(
    vault,
    outlinePath,
    payload,
    rootNodeId
  );
  if (!compiled) return false;
  if (canonicalVDocSignature(latestDoc) === canonicalVDocSignature(compiled)) {
    return false;
  }

  runGuardedSync([outlinePath, vdocPath], () => {
    vault.write(vdocPath, serializeVDocJson(compiled));
  });
  return true;
}

function stripHighlightMarks(text: string, highlightSym: string): string {
  if (!highlightSym) return text;
  const escaped = highlightSym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}(.+?)${escaped}`, "g"), "$1");
}

function hasNestedChildren(nodes: readonly OutlineNode[]): boolean {
  return nodes.some((n) => (n.children?.length ?? 0) > 0);
}

function patchExistingBlockOutlineNode(
  existing: OutlineNode,
  blk: LayoutBlock,
  doc: VDocDocument,
  registry: ElementSyntaxRegistry
): OutlineNode {
  const frameSym = registry.resolveSymbol("section", "frame-box", ">");
  const accentSym = registry.resolveSymbol("section", "accent-bar", "!");
  const kvSym = registry.resolveSymbol("section", "kv-meta", "::");
  const splitSym = registry.resolveSymbol("section", "horizontal-split", "|");
  const highlightSym = registry.resolveSymbol("section", "inline-highlight", "==");
  const ctaTag = registry.resolveSymbol("section", "cta-slot", "[cta]").replace(/^\[|\]$/g, "");
  const embedTag = registry.resolveSymbol("section", "embed-slot", "[embed]").replace(/^\[|\]$/g, "");

  const existingDir = parseOutlineDirective(existing.text);

  // 1. `structured-table`: preserve exact `<<view:table @assetId>>` header, tree-indented rowspan/merge syntax, and `<<cite:...>>` child bullets!
  if (blk.kind === "structured-table") {
    const token = existingDir?.rawToken ?? "<<view:table>>";
    const nextHeader = `${token} ${blk.title || existingDir?.label || ""}`.trim();
    const rowChildren = existing.children.filter((c) => !parseCiteBullet(c.text));
    const citeChildren = existing.children.filter((c) => Boolean(parseCiteBullet(c.text)));
    const hasTreeOrMergeSyntax =
      hasNestedChildren(rowChildren) ||
      rowChildren.some((r) => r.text.includes("[<]") || r.text.includes("[^]"));

    if (hasTreeOrMergeSyntax) {
      // Never flatten a tree-indented or merge-symbol table — preserve its structure verbatim!
      return nextHeader === existing.text ? existing : { ...existing, text: nextHeader };
    }

    const nextRows: OutlineNode[] = blk.rows.map((r, idx) => {
      const rowText = r.cells
        .map((c) => htmlToPlainText(doc.slots[c.slotId]?.content ?? "").trim() || "[-]")
        .join(" | ");
      const prevRow = rowChildren[idx];
      return prevRow
        ? { ...prevRow, text: rowText }
        : { id: `row_${blk.blockId}_${idx + 1}`, text: rowText, isFolded: false, children: [] };
    });
    return { ...existing, text: nextHeader, children: [...nextRows, ...citeChildren] };
  }

  // 2. `<<view:list>>` compiled into a `text` block -> keep `<<view:list>>` directive & `<<cite:...>>` children intact!
  if (existingDir?.kind === "view" && existingDir.target === "list" && blk.kind === "text") {
    const rawHtml = doc.slots[blk.slotId]?.content ?? "";
    const liMatches = Array.from(rawHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) =>
      htmlToPlainText(m[1]).trim()
    );
    if (liMatches.length === 0) return existing;
    const itemChildren = existing.children.filter((c) => !parseCiteBullet(c.text));
    const citeChildren = existing.children.filter((c) => Boolean(parseCiteBullet(c.text)));
    const prevFlat = itemChildren.map((c) => stripHighlightMarks(c.text.trim(), highlightSym));
    if (
      prevFlat.length === liMatches.length &&
      prevFlat.every((t, i) => t === liMatches[i])
    ) {
      return existing;
    }
    const nextItems: OutlineNode[] = liMatches.map((txt, idx) => {
      const prevChild = itemChildren[idx];
      return prevChild
        ? { ...prevChild, text: txt }
        : { id: `li_${blk.blockId}_${idx + 1}`, text: txt, isFolded: false, children: [] };
    });
    return { ...existing, children: [...nextItems, ...citeChildren] };
  }

  // 3. `hero`: preserve `> ` prefix and subtitle child metadata
  if (blk.kind === "hero") {
    const headline = htmlToPlainText(doc.slots[blk.titleSlotId]?.content ?? "").trim();
    const subtitle = blk.subtitleSlotId
      ? htmlToPlainText(doc.slots[blk.subtitleSlotId]?.content ?? "").trim()
      : "";
    const prevHeadline = stripHighlightMarks(
      existing.text.trim().startsWith(frameSym)
        ? existing.text.trim().slice(frameSym.length).trim()
        : existing.text.trim(),
      highlightSym
    );
    const nextText =
      prevHeadline === headline ? existing.text : `${frameSym} ${headline}`.trim();
    const prevSub = existing.children[0];
    const nextChildren = subtitle
      ? [
          prevSub
            ? { ...prevSub, text: subtitle }
            : { id: `sub_${blk.blockId}`, text: subtitle, isFolded: false, children: [] },
          ...existing.children.slice(1),
        ]
      : existing.children;
    return { ...existing, text: nextText, children: nextChildren };
  }

  // 4. `callout-box`: preserve original wrapper (`>`, `!`, `[embed:disclosure | ...]`) and `==` highlights if unchanged
  if (blk.kind === "callout-box") {
    const plain = htmlToPlainText(doc.slots[blk.slotId]?.content ?? "").trim();
    if (blk.variant === "disclosure") {
      const prevBody = existing.text.replace(/^\[[^:|]+:[^|]+\|\s*/, "").replace(/\]$/, "").trim();
      return prevBody === plain
        ? existing
        : { ...existing, text: `[${embedTag}:disclosure | ${plain}]` };
    }
    if (blk.variant === "accent-bar") {
      const prevBody = stripHighlightMarks(
        existing.text.trim().startsWith(accentSym)
          ? existing.text.trim().slice(accentSym.length).trim()
          : existing.text.trim(),
        highlightSym
      );
      return prevBody === plain ? existing : { ...existing, text: `${accentSym} ${plain}` };
    }
    if (blk.variant === "info-frame") {
      const prevTitle = stripHighlightMarks(
        existing.text.trim().startsWith(frameSym)
          ? existing.text.trim().slice(frameSym.length).trim()
          : existing.text.trim(),
        highlightSym
      );
      const nextText = prevTitle === plain ? existing.text : `${frameSym} ${plain}`;
      const kvItems = blk.kvItems ?? [];
      if (kvItems.length === 0) {
        return { ...existing, text: nextText };
      }
      const nextChildren: OutlineNode[] = kvItems.map((kv, idx) => {
        const prevChild = existing.children[idx];
        const line = `${kv.key} ${kvSym} ${kv.value}`;
        return prevChild
          ? { ...prevChild, text: line }
          : { id: `kv_${blk.blockId}_${idx + 1}`, text: line, isFolded: false, children: [] };
      });
      return { ...existing, text: nextText, children: nextChildren };
    }
    const prevBody = stripHighlightMarks(
      existing.text.trim().startsWith(frameSym)
        ? existing.text.trim().slice(frameSym.length).trim()
        : existing.text.trim(),
      highlightSym
    );
    return prevBody === plain ? existing : { ...existing, text: `${frameSym} ${plain}` };
  }

  // 5. `link-card`: update label & url cleanly
  if (blk.kind === "link-card") {
    const label = htmlToPlainText(doc.slots[blk.slotId]?.content ?? "").trim() || blk.title || "링크";
    const nextText = `[${ctaTag}:${label} -> ${blk.url}]`;
    return existing.text.trim() === nextText ? existing : { ...existing, text: nextText };
  }

  // 6. `columns-grid`: preserve `[img:2:...]` image tokens & weights; patch only edited text columns!
  if (blk.kind === "columns-grid") {
    const rawParts = existing.text.split(splitSym).map((p) => p.trim());
    const cols = blk.columns ?? [];
    if (rawParts.length !== cols.length) return existing;
    let changed = false;
    const nextParts = cols.map((col, idx) => {
      if (col.image) return rawParts[idx]; // keep exact `[img:weight:label -> url]` token!
      if (col.slotId && doc.slots[col.slotId]) {
        const plain = htmlToPlainText(doc.slots[col.slotId].content).trim();
        const prevPlain = stripHighlightMarks(rawParts[idx], highlightSym);
        if (prevPlain !== plain) {
          changed = true;
          return plain;
        }
      }
      return rawParts[idx];
    });
    return changed ? { ...existing, text: nextParts.join(` ${splitSym} `) } : existing;
  }

  // 7. `image` & `divider`: preserve original `[img:weight:label -> url]` / `node.file` / `---` verbatim
  if (blk.kind === "image" || blk.kind === "divider") {
    return existing;
  }

  // 8. Regular `text` / `heading` / slotted blocks: preserve `==highlight==` when plain text matches!
  if ("slotId" in blk && typeof blk.slotId === "string" && doc.slots[blk.slotId]) {
    const plain = htmlToPlainText(doc.slots[blk.slotId].content).trim();
    const prevPlain = stripHighlightMarks(existing.text.trim(), highlightSym);
    if (!plain || prevPlain === plain) return existing;
    return { ...existing, text: plain };
  }

  return existing;
}

/**
 * [VDoc → Outline 명시적 구조 동기화 (태그 보존형 부분 패치)]
 * 사용자가 `[구조 동기화]`를 클릭했을 때만 실행된다.
 * - 서브트리를 통째 덮어쓰지 않고, `sourceNodeId` 가 일치하는 기존 불릿의 텍스트만 정밀 패치한다.
 * - 원본 `<<doc>>` / `<<view:... @assetId>>` / `<<view:list>>` / `==강조==` / `[img:2:...]` /
 *   트리 들여쓰기 표(`[ < ]`, `[^]`) / 작업 메모 / `note` / `file` / `isFolded` 를 100% 보존한다.
 * - 디자인 모드에서 새로 추가된 블록/섹션만 안전하게 끝에 추가한다.
 */
export interface SyncVDocMeaningOptions {
  /** `asset-blocks` 교체로 삭제된 블록의 `sourceNodeId` 목록 — 해당 불릿만 정밀 제거하고 작업 메모는 보존한다. */
  readonly removedSourceNodeIds?: ReadonlySet<string>;
}

export function syncVDocMeaningBackToOutline(
  vault: VaultPort,
  vdocPath: string,
  doc: VDocDocument,
  options?: SyncVDocMeaningOptions
): boolean {
  if (vault.isReadOnly?.()) return false;
  if (isPathInBidirectionalSync(vdocPath)) return false;
  const resolved = resolveOutlineForVDoc(vault, vdocPath, doc, { heal: true });
  if (!resolved || !resolved.rootNodeId) return false;

  const { outlinePath, rootNodeId, payload } = resolved;
  if (isPathInBidirectionalSync(outlinePath)) return false;
  const chain = findOutlineNodeChain(payload.rootNodes as OutlineSyntaxNode[], rootNodeId);
  const existingDocNode = chain?.[chain.length - 1] as OutlineNode | undefined;
  if (!existingDocNode) return false;

  const existingDirective = parseOutlineDirective(existingDocNode.text);
  if (existingDirective?.kind !== "doc") return false;

  const registry = loadVaultSyntaxRegistry(vault);
  const extractedFull = extractBoundOutlineFromVDoc(doc, registry, {
    docNodeId: rootNodeId,
    wrapInDocDirective: true,
  });
  const extractedDocChildren = extractedFull.outline.rootNodes[0]?.children ?? [];

  // Index existing nodes inside `existingDocNode` by id for in-place patching
  const existingSectionById = new Map<string, OutlineNode>();
  for (const child of existingDocNode.children) {
    existingSectionById.set(child.id, child);
  }

  // Patch sections & blocks in place while preserving any non-directive memo children inside `<<doc>>`
  const patchedChildren: OutlineNode[] = [];
  const handledSectionIds = new Set<string>();
  const stampedBlockSourceIds = new Map<string, string>();

  for (const existingChild of existingDocNode.children) {
    const matchedPage = doc.pages.find((p) => p.sourceNodeId === existingChild.id);
    if (!matchedPage) {
      // Preserve `문서 메타 :: ...`, brainstorming notes, memos, inline `<<asset>>` untouched!
      patchedChildren.push(existingChild);
      continue;
    }

    handledSectionIds.add(existingChild.id);
    const secDir = parseOutlineDirective(existingChild.text);
    const nextSecText = secDir
      ? `${secDir.rawToken} ${matchedPage.pageLabel}`.trim()
      : existingChild.text;

    const existingBlockById = new Map<string, OutlineNode>();
    for (const bNode of existingChild.children) {
      existingBlockById.set(bNode.id, bNode);
    }

    const handledBlockIds = new Set<string>();
    const nextBlockNodes: OutlineNode[] = [];

    // 1) Patch existing children in place (and keep non-block memo bullets untouched, dropping explicitly replaced nodes)
    for (const bNode of existingChild.children) {
      if (options?.removedSourceNodeIds?.has(bNode.id)) {
        continue;
      }
      const matchedBlk = matchedPage.blocks.find((b) => b.sourceNodeId === bNode.id);
      if (!matchedBlk) {
        nextBlockNodes.push(bNode);
        continue;
      }
      handledBlockIds.add(bNode.id);
      nextBlockNodes.push(patchExistingBlockOutlineNode(bNode, matchedBlk, doc, registry));
    }

    // 2) Append any newly inserted blocks from Design mode / asset insert that didn't exist in `.outline` yet
    //    `extractedFull.patchedDoc` stamps fresh `sourceNodeId`s matching `extractedSec.children`,
    //    so we look up by `blockId` in `patchedPage` and also stamp back into `.vdoc` for 1:1 reveal sync.
    const extractedSec = extractedDocChildren.find((n) => n.id === matchedPage.sourceNodeId);
    const extractedPatchedPage = extractedFull.patchedDoc.pages.find((p) => p.pageId === matchedPage.pageId);
    for (const blk of matchedPage.blocks) {
      if (blk.sourceNodeId && handledBlockIds.has(blk.sourceNodeId)) continue;
      const stampedBlk = extractedPatchedPage?.blocks.find((b) => b.blockId === blk.blockId);
      const targetNodeId = blk.sourceNodeId ?? stampedBlk?.sourceNodeId;
      const extractedBlkNode = extractedSec?.children?.find(
        (c) =>
          (targetNodeId && c.id === targetNodeId) ||
          (blk.sourceNodeId && c.id === existingBlockById.get(blk.sourceNodeId)?.id)
      );
      if (extractedBlkNode) {
        nextBlockNodes.push(toOutlinerNode(extractedBlkNode));
        if (!blk.sourceNodeId && extractedBlkNode.id) {
          stampedBlockSourceIds.set(blk.blockId, extractedBlkNode.id);
        }
      }
    }

    patchedChildren.push({
      ...existingChild,
      text: nextSecText,
      children: nextBlockNodes,
    });
  }

  // 3) Append any newly added pages/sections from Design mode
  for (const page of doc.pages) {
    if (page.sourceNodeId && handledSectionIds.has(page.sourceNodeId)) continue;
    const extractedSec = extractedDocChildren.find(
      (n) => n.id === page.sourceNodeId || n.text.endsWith(page.pageLabel)
    );
    if (extractedSec && !existingSectionById.has(extractedSec.id)) {
      patchedChildren.push(toOutlinerNode(extractedSec));
    }
  }

  // `.vdoc` 의 `evidenceLinks` 를 `.vsyntax` 표준 편집 가능 하위 불릿(`<<cite:...>>`)으로 역동기화한다.
  // (숨겨진 JSON 사이드카 `nodeEvidence` 를 만들지 않고, `.outline` 텍스트 태그 자체를 단일 정본으로 유지한다.)
  const slotToNodeId = new Map<string, string>();
  const syncedBlockNodeIds = new Set<string>();
  const registerBlockSlots = (blk: LayoutBlock, fallbackNodeId: string) => {
    const resolvedId = blk.sourceNodeId ?? stampedBlockSourceIds.get(blk.blockId) ?? fallbackNodeId;
    if (resolvedId) syncedBlockNodeIds.add(resolvedId);
    for (const sid of getBlockSlotIds(blk)) {
      if (resolvedId) slotToNodeId.set(sid, resolvedId);
    }
    if (blk.kind === "columns-grid") {
      for (const col of blk.columns ?? []) {
        for (const nested of col.blocks ?? []) {
          registerBlockSlots(nested, resolvedId);
        }
      }
    } else if (blk.kind === "structured-table") {
      for (const row of blk.rows ?? []) {
        for (const cell of row.cells ?? []) {
          for (const nested of cell.blocks ?? []) {
            registerBlockSlots(nested, resolvedId);
          }
        }
      }
    }
  };
  for (const page of doc.pages) {
    const pageNodeId = page.sourceNodeId ?? rootNodeId;
    if (pageNodeId) syncedBlockNodeIds.add(pageNodeId);
    for (const blk of page.blocks) {
      registerBlockSlots(blk, pageNodeId);
    }
  }

  const linksByNodeId = new Map<string, EvidenceLink[]>();
  const seenKeysByNode = new Map<string, Set<string>>();
  for (const link of doc.evidenceLinks ?? []) {
    const targetNodeId = slotToNodeId.get(link.slotId) ?? rootNodeId;
    if (!targetNodeId) continue;
    const key = evidenceSourceKey(link.locator);
    let seen = seenKeysByNode.get(targetNodeId);
    if (!seen) {
      seen = new Set<string>();
      seenKeysByNode.set(targetNodeId, seen);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const list = linksByNodeId.get(targetNodeId) ?? [];
    list.push(link);
    linksByNodeId.set(targetNodeId, list);
  }

  const resolveCiteTagSymbol = (ruleId: string, fallback: string) =>
    registry.resolveSymbol("resource", ruleId, fallback);

  const syncCiteChildrenOnTree = (node: OutlineNode): OutlineNode => {
    const nextNonCiteChildren = node.children
      .filter((c) => !parseCiteBullet(c.text))
      .map(syncCiteChildrenOnTree);
    const prevCiteChildren = node.children.filter((c) => Boolean(parseCiteBullet(c.text)));

    // 동기화 대상 블록/섹션(또는 evidenceLinks 가 귀속된 노드)이 아니면 기존 `<<cite:...>>` 불릿을 그대로 보존
    const mappedLinks = linksByNodeId.get(node.id);
    if (!syncedBlockNodeIds.has(node.id) && !mappedLinks) {
      return {
        ...node,
        children: [...nextNonCiteChildren, ...prevCiteChildren],
      };
    }

    const nextCiteChildren: OutlineNode[] = (mappedLinks ?? []).map((link, idx) => {
      const text = formatEvidenceLocatorToCiteBullet(link.locator, {
        presentation: link.presentation,
        rationale: link.rationale,
        resolveTagSymbol: resolveCiteTagSymbol,
      });
      const existingSame = prevCiteChildren.find((c) => c.text.trim() === text.trim()) ?? prevCiteChildren[idx];
      return {
        id: existingSame?.id ?? `cite_${node.id}_${idx + 1}`,
        text,
        isFolded: existingSame?.isFolded ?? false,
        children: [],
      };
    });

    return {
      ...node,
      children: [...nextNonCiteChildren, ...nextCiteChildren],
    };
  };

  const nextDocNode: OutlineNode = syncCiteChildrenOnTree({
    ...existingDocNode,
    children: patchedChildren,
  });

  // 동기화된 노드에 남아 있던 구형 사이드카 `payload.nodeEvidence` 가비지는 정리해 중복 표시를 방지한다
  let nextNodeEvidence = payload.nodeEvidence;
  let prunedLegacySidecar = false;
  if (payload.nodeEvidence && Object.keys(payload.nodeEvidence).length > 0) {
    const remaining: Record<string, typeof payload.nodeEvidence[string]> = {};
    for (const [nid, locs] of Object.entries(payload.nodeEvidence)) {
      if (syncedBlockNodeIds.has(nid) || linksByNodeId.has(nid)) {
        prunedLegacySidecar = true;
      } else {
        remaining[nid] = locs;
      }
    }
    if (prunedLegacySidecar) {
      nextNodeEvidence = Object.keys(remaining).length > 0 ? remaining : undefined;
    }
  }

  if (
    !prunedLegacySidecar &&
    canonicalOutlineNodeSignature(existingDocNode as OutlineSyntaxNode) ===
      canonicalOutlineNodeSignature(nextDocNode as OutlineSyntaxNode)
  ) {
    return false;
  }

  const replaced = replaceOutlineNodeById(payload.rootNodes, rootNodeId, nextDocNode);
  if (!replaced.replaced) return false;

  const nextPayload: OutlineFilePayload = {
    ...payload,
    rootNodes: replaced.next,
    nodeEvidence: nextNodeEvidence,
    updatedAt: new Date().toISOString(),
  };

  runGuardedSync([outlinePath, vdocPath], () => {
    vault.write(outlinePath, serializeOutlineJson(nextPayload));
    if (stampedBlockSourceIds.size > 0 && vault.exists(vdocPath)) {
      const updatedDoc: VDocDocument = {
        ...doc,
        pages: doc.pages.map((p) => ({
          ...p,
          blocks: p.blocks.map((b) => {
            const stamped = stampedBlockSourceIds.get(b.blockId);
            return stamped && !b.sourceNodeId ? { ...b, sourceNodeId: stamped } : b;
          }),
        })),
      };
      vault.write(vdocPath, serializeVDocJson(updatedDoc));
    }
  });
  return true;
}

function spliceReplaceOutlineNodeById(
  nodes: readonly OutlineNode[],
  targetId: string,
  replacements: readonly OutlineNode[]
): { readonly next: OutlineNode[]; readonly replaced: boolean } {
  let replaced = false;
  const next: OutlineNode[] = [];
  for (const node of nodes) {
    if (node.id === targetId) {
      replaced = true;
      next.push(...replacements);
      continue;
    }
    if (node.children.length > 0) {
      const sub = spliceReplaceOutlineNodeById(node.children, targetId, replacements);
      if (sub.replaced) {
        replaced = true;
        next.push({ ...node, children: sub.next });
        continue;
      }
    }
    next.push(node);
  }
  return { next, replaced };
}

function syntaxTreeToOutlineNodes(
  nodes: readonly OutlineSyntaxNode[],
  suffix: string
): OutlineNode[] {
  let seq = 0;
  const visit = (n: OutlineSyntaxNode): OutlineNode => ({
    id: `ast_${suffix}_${++seq}`,
    text: n.text,
    isFolded: false,
    children: (n.children ?? []).map(visit),
  });
  return nodes.map(visit);
}

export interface CommitStagedAssetResult {
  readonly updatedVDoc: VDocDocument | null;
  readonly outlineUpdated: boolean;
  readonly outlinePath: string | null;
  readonly firstBlockId: string | null;
}

/**
 * [Atomic Dual-Commit: Staged AI Asset Preview → `.outline` + `.vdoc`]
 * `.vdoc` 또는 `.outline` 어느 쪽에서 `[적용 (Apply)]` 를 눌러도 동일하게 호출된다.
 * 1) 연결된 `.outline` 이 있고 `syncOutline !== false` 이면, AI가 생성한 `suggestedOutlineDsl`로
 *    대상 섹션/블록 서브트리를 실제 교체 저장하고, 그 `.outline` 을 정본으로 `.vdoc` 을 컴파일·동기화한다.
 *    (결과: 재시작하거나 `[구조에서 컴파일]`을 다시 눌러도 바뀐 태그·구조가 100% 유지됨!)
 * 2) 연결된 `.outline` 이 없거나 `syncOutline === false` 이면 `.vdoc` 에 직접 커밋한다.
 */
export function commitStagedAssetToOutlineAndVDoc(
  vault: VaultPort,
  vdocPath: string,
  staged: StagedAssetPreviewState,
  options?: { readonly syncOutline?: boolean }
): CommitStagedAssetResult {
  if (vault.isReadOnly?.() || !vault.exists(vdocPath)) {
    return { updatedVDoc: null, outlineUpdated: false, outlinePath: null, firstBlockId: null };
  }
  const curDoc = parseVDocJson(vault.read(vdocPath), stem(vdocPath));
  const now = new Date().toISOString();
  const assetRefStamp = {
    assetId: staged.assetId,
    ...(staged.assetPath ? { assetPath: staged.assetPath } : {}),
    appliedAt: now,
    sourceInputHash: staged.sourceInputHash,
  };

  const wantOutlineSync = options?.syncOutline !== false;
  const resolvedOutline =
    wantOutlineSync && staged.suggestedOutlineDsl.length > 0
      ? resolveOutlineForVDoc(vault, vdocPath, curDoc, { heal: true })
      : null;

  if (resolvedOutline && resolvedOutline.rootNodeId) {
    const { outlinePath, rootNodeId, payload } = resolvedOutline;
    const chain = findOutlineNodeChain(payload.rootNodes as OutlineSyntaxNode[], rootNodeId);
    const existingDocNode = chain?.[chain.length - 1] as OutlineNode | undefined;

    if (existingDocNode) {
      const uid = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const parsedSyntax = parseIndentedOutlineDsl(staged.suggestedOutlineDsl, `ast_${uid}`);
      const newNodes = syntaxTreeToOutlineNodes(parsedSyntax, uid);

      if (newNodes.length > 0) {
        const targetPage =
          curDoc.pages.find((p) => p.pageId === staged.targetPageId) ?? curDoc.pages[0];
        const targetBlock =
          staged.targetScope === "block" && staged.targetBlockId
            ? targetPage?.blocks.find((b) => b.blockId === staged.targetBlockId)
            : undefined;
        const blockSourceNodeId =
          staged.targetScope === "block"
            ? (staged.targetSourceNodeId ?? targetBlock?.sourceNodeId ?? null)
            : null;
        const sectionSourceNodeId =
          staged.targetScope === "page"
            ? (staged.targetSourceNodeId ?? targetPage?.sourceNodeId ?? null)
            : null;

        let nextDocNode: OutlineNode = existingDocNode;

        // Case 1: Block-level replacement by exact `sourceNodeId`
        if (blockSourceNodeId) {
          const spliced = spliceReplaceOutlineNodeById(
            existingDocNode.children,
            blockSourceNodeId,
            newNodes
          );
          if (spliced.replaced) {
            nextDocNode = { ...existingDocNode, children: spliced.next };
          } else {
            // Fallback: append into matched section or doc root
            const secIdx = existingDocNode.children.findIndex(
              (c) =>
                c.id === targetPage?.sourceNodeId ||
                parseOutlineDirective(c.text)?.target === "section"
            );
            if (secIdx >= 0) {
              nextDocNode = {
                ...existingDocNode,
                children: existingDocNode.children.map((c, idx) =>
                  idx === secIdx ? { ...c, children: [...c.children, ...newNodes] } : c
                ),
              };
            } else {
              nextDocNode = {
                ...existingDocNode,
                children: [...existingDocNode.children, ...newNodes],
              };
            }
          }
        } else {
          // Case 2: Page / Section-level replacement
          const firstNewDir = parseOutlineDirective(newNodes[0].text);
          const newIsSectionWrapped =
            newNodes.length === 1 &&
            firstNewDir?.kind === "view" &&
            firstNewDir.target === "section";

          const matchedSecIdx = existingDocNode.children.findIndex(
            (c) =>
              (sectionSourceNodeId && c.id === sectionSourceNodeId) ||
              (curDoc.pages.length === 1 && parseOutlineDirective(c.text)?.target === "section")
          );

          if (matchedSecIdx >= 0) {
            const existingSec = existingDocNode.children[matchedSecIdx];
            const replacementSec: OutlineNode = newIsSectionWrapped
              ? {
                  ...newNodes[0],
                  id: existingSec.id,
                  isFolded: existingSec.isFolded,
                }
              : staged.mode === "insert"
                ? { ...existingSec, children: [...existingSec.children, ...newNodes] }
                : { ...existingSec, children: newNodes };
            nextDocNode = {
              ...existingDocNode,
              children: existingDocNode.children.map((c, idx) =>
                idx === matchedSecIdx ? replacementSec : c
              ),
            };
          } else {
            // Direct children under `<<doc:...>>` without explicit `<<view:section>>`
            const preservedMeta = existingDocNode.children.filter((c) => {
              const t = c.text.trim();
              return t.includes("::") && !parseOutlineDirective(t);
            });
            nextDocNode = {
              ...existingDocNode,
              children:
                staged.mode === "insert"
                  ? [...existingDocNode.children, ...newNodes]
                  : [...preservedMeta, ...newNodes],
            };
          }
        }

        const replaced = replaceOutlineNodeById(payload.rootNodes, rootNodeId, nextDocNode);
        if (replaced.replaced) {
          const nextPayload: OutlineFilePayload = {
            ...payload,
            rootNodes: replaced.next,
            updatedAt: now,
          };

          // Compile `.vdoc` directly from the newly updated `.outline` so every `sourceNodeId` matches 1:1!
          const { doc: compiledDoc } = compileOutlineTargetForPreview(
            vault,
            outlinePath,
            nextPayload,
            rootNodeId
          );

          let finalDoc: VDocDocument;
          if (compiledDoc) {
            const stampedPages = compiledDoc.pages.map((p, idx) => {
              const isTargetPage =
                p.pageId === staged.targetPageId ||
                (sectionSourceNodeId && p.sourceNodeId === sectionSourceNodeId) ||
                (compiledDoc.pages.length === 1 && idx === 0);
              if (!isTargetPage) return p;
              return {
                ...p,
                blocks: p.blocks.map((b) => ({
                  ...b,
                  assetRef: assetRefStamp,
                })),
              };
            });
            finalDoc = {
              ...compiledDoc,
              docId: curDoc.docId,
              outlineRef: {
                outlinePath: toVaultUri(outlinePath),
                outlineId: nextPayload.id,
                rootNodeId,
              },
              pages: stampedPages,
            };
          } else {
            // Hard fallback if compile returns null
            const stampedBlocks = staged.previewBlocks.map((b) => ({
              ...structuredClone(b),
              assetRef: assetRefStamp,
            }));
            finalDoc = {
              ...curDoc,
              pages: curDoc.pages.map((p) =>
                p.pageId === staged.targetPageId ? { ...p, blocks: stampedBlocks } : p
              ),
              slots: { ...curDoc.slots, ...staged.previewSlots },
            };
          }

          runGuardedSync([outlinePath, vdocPath], () => {
            vault.write(outlinePath, serializeOutlineJson(nextPayload));
            vault.write(vdocPath, serializeVDocJson(finalDoc));
          });

          const firstBlk =
            finalDoc.pages.find((p) => p.pageId === staged.targetPageId)?.blocks[0]?.blockId ??
            finalDoc.pages[0]?.blocks[0]?.blockId ??
            null;
          return {
            updatedVDoc: finalDoc,
            outlineUpdated: true,
            outlinePath,
            firstBlockId: firstBlk,
          };
        }
      }
    }
  }

  // Fallback / Standalone `.vdoc` commit (not bound to `.outline` or `syncOutline === false`)
  const stampedBlocks = staged.previewBlocks.map((b) => ({
    ...structuredClone(b),
    assetRef: assetRefStamp,
  }));
  const nextPages = curDoc.pages.map((p) => {
    if (p.pageId !== staged.targetPageId) return p;
    if (staged.targetScope === "block" && staged.targetBlockId) {
      const idx = p.blocks.findIndex((b) => b.blockId === staged.targetBlockId);
      if (idx >= 0) {
        return {
          ...p,
          blocks: [...p.blocks.slice(0, idx), ...stampedBlocks, ...p.blocks.slice(idx + 1)],
        };
      }
    }
    if (staged.mode === "insert") {
      return { ...p, blocks: [...p.blocks, ...stampedBlocks] };
    }
    return { ...p, blocks: stampedBlocks };
  });
  const nextDoc: VDocDocument = {
    ...curDoc,
    pages: nextPages,
    slots: { ...curDoc.slots, ...staged.previewSlots },
  };
  vault.write(vdocPath, serializeVDocJson(nextDoc));
  return {
    updatedVDoc: nextDoc,
    outlineUpdated: false,
    outlinePath: null,
    firstBlockId: stampedBlocks[0]?.blockId ?? null,
  };
}
