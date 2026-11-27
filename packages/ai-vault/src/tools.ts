import type { ComposerSessionController, ToolRunContext, WorkspaceTool } from "@vibe/ai-kernel";
import editorTools from "@vibe/harness-packs/editor/tools.client.json";
import outlineClientTools from "@vibe/harness-packs/outline/tools.client.json";
import referenceTools from "@vibe/harness-packs/reference/tools.client.json";
import resourceTools from "@vibe/harness-packs/resource/tools.client.json";
import {
  applyOutlinePatchSafely,
  compileOutlineTargetForPreview,
  getLiveOutlineSession,
  loadVaultSyntaxRegistry,
  materializeVDocFromOutlineDirective,
  previewOutlinePatch,
  requestOutlineReveal,
  syncVDocMeaningBackToOutline,
} from "@vibe/outline-sync";
import type { OutlineNode, TreePatchRequest } from "@vibe/outliner/core";
import { createAssetV3Tools } from "./assetV3";
import { createStyleTools, applyStagedStyleChange } from "./styleTools";
import {
  addEvidenceLinks,
  contentHash,
  fillProgress,
  findBlock,
  getActiveAssetDriver,
  getBlockKind,
  getBlockSlotIds,
  getSlotBackdata,
  htmlToSummary,
  newEvidenceLinkId,
  parseResourceTag,
  patchBlockProps,
  rankAssetsForContext,
  resolveDocumentView,
  measureOutlineVDocIsomorphism,
  scanOutlineDirectives,
  setSlotContent,
  validateOutlineHierarchy,
  validateVDocHierarchy,
  slotFillState,
  slotPlainText,
  validateBlockProps,
  withSlotFill,
  type AssetFlowMode,
  type EvidenceLink,
  type EvidenceLocator,
  type EvidencePresentation,
  type EvidenceRelation,
  type OutlineSyntaxNode,
  type SlotFillState,
  type StagedEvidence,
  type VDocDocument,
  type VDocSlot,
  placeAssetBlocks,
} from "@vibe/vdoc-schema";

import {
  buildStyleRefForEntry,
  collectVaultAssets,
  collectVaultStyleEntries,
  fromVaultUri,
  isAssetPath,
  parseOutlineJson,
  parseVAssetJson,
  readVaultEvidenceSettings,
  resolveActiveStyleEntry,
  serializeVDocJson,
} from "@vibe/vault-formats";
import {
  activeOutlinePath,
  activeReferences,
  deserializeScope,
  envTurn,
  listReferences,
  readOutline,
  readVDoc,
  referenceText,
  requireDoc,
  SCOPE_CONTEXT_KIND,
  type V2AiEnv,
} from "./contexts";
import {
  computeOutlineSubtreeHash,
  isRestricted,
  scopeAllowsBlock,
  scopeAllowsPage,
  scopeAllowsSlot,
  scopeHidesBlock,
  scopeHidesPage,
  scopeHidesSlot,
  type ResolvedScope,
} from "@vibe/ai-scope";
import type { V2StagedChange } from "./store";

/**
 * v2 클라이언트 도구 — 명세(이름 · 설명 · 위험도 · 인자)는 하네스 팩이 정본 (studio 와 같은 파일).
 * 실행만 볼트 문서 기준으로 다시 쓴다. 문서를 바꾸는 도구는 **변경안(Staged)** 만 낸다 — 승인 전 볼트 파일은 그대로.
 */
type ClientToolSpec = Pick<WorkspaceTool, "name" | "description" | "risk" | "inputSchema">;
const SPECS = new Map<string, ClientToolSpec>(
  ([...editorTools, ...outlineClientTools, ...resourceTools, ...referenceTools] as ClientToolSpec[]).map((spec) => [spec.name, spec])
);
export function clientTool(name: string): ClientToolSpec {
  const spec = SPECS.get(name);
  if (!spec) throw new Error(`하네스 팩에 클라이언트 도구 명세가 없습니다: ${name}`);
  return spec;
}

const clip = (text: string, n: number) => (text.length <= n ? text : `${text.slice(0, n - 1)}…`);

/** 변경안을 대기열에 올린다 — 기준점 세션 env 면 그 세션 꼬리표를 붙인다 (세션별 검토 · 완료 시 버리기). */
export function stage(env: Pick<V2AiEnv, "store" | "sessionKey">, changes: readonly V2StagedChange[]): void {
  const key = env.sessionKey;
  env.store.getState().enqueue(key ? changes.map((c) => ({ ...c, sessionKey: key })) : [...changes]);
}
let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export interface V2ToolHost {
  readonly controller: ComposerSessionController;
  /** 캔버스 이동 · 선택 (canvas.selectSlot) */
  revealSlot(path: string, slotId: string, pageId: string | null): void;
  /** 캔버스 여러 개 선택 · 첫 항목으로 이동 (canvas.select) */
  revealSelection(path: string, items: readonly { id: string; kind: "slot" | "block"; blockId: string | null; pageId: string | null }[]): void;
  /** 탭 열기 (references.open) */
  openPath(path: string): void;
  /** 통일 리소스 태그(`<<resource:...>>`) 페어 탭 오픈 · 하이라이팅 (resource.reveal) */
  revealResource?(rawTag: string, sourcePath?: string): boolean;
  /** 에셋(assetId)의 AI 느낌 보기(Staged Preview) 를 현재 열린 문서/아웃라인에 실행 (assets.stagePreview) */
  stageAssetPreview?(assetId: string): boolean;
  /** 좌측 패널 (layout.openPanel) */
  showExplorer(): void;
}

// --- 범위: 지금 처리 중인 메시지의 범위 (studio entities/ai-scope/model/current.ts 와 같은 규칙) ----------

function messageScope(host: V2ToolHost): ResolvedScope | null {
  const items = host.controller.getState().items;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== "user") continue;
    const ref = item.contexts.find((c) => c.kind === SCOPE_CONTEXT_KIND);
    return ref ? deserializeScope(ref.meta?.scope) : null;
  }
  return null;
}

function fromOtherSession(host: V2ToolHost, ctx?: ToolRunContext): boolean {
  const mine = host.controller.getState().sessionId;
  return Boolean(ctx && ctx.sessionId && mine && ctx.sessionId !== mine);
}

export function toolScope(env: V2AiEnv, host: V2ToolHost, doc: VDocDocument, ctx?: ToolRunContext): ResolvedScope | null {
  const turn = messageScope(host) ?? envTurn(env);
  if (!turn || turn.docId !== doc.docId || fromOtherSession(host, ctx)) return null;
  if (turn.mode === "off") return turn;
  return isRestricted(turn) ? turn : null;
}

function toolSourcesOff(env: V2AiEnv, host: V2ToolHost, ctx?: ToolRunContext): boolean {
  const turn = messageScope(host) ?? envTurn(env);
  return Boolean(turn?.sourcesOff) && !fromOtherSession(host, ctx);
}

const outOfScope = (what: string, scope: ResolvedScope) =>
  new Error(`범위 밖입니다: ${what} — 지금 범위는 "${scope.label}". 범위를 넓히려면 사용자가 Composer 설정바에서 바꿔야 한다.`);

function requireSlot(doc: VDocDocument, slotId: unknown): VDocSlot {
  if (typeof slotId !== "string" || !slotId) throw new Error("slotId 가 필요합니다.");
  const slot = doc.slots[slotId];
  if (!slot) throw new Error(`슬롯을 찾을 수 없습니다: ${slotId}`);
  return slot;
}

// --- 변경안 ---------------------------------------------------------------------------------------

const EVIDENCE_KINDS = new Set(["backdata", "resource", "sector", "ref-region", "kcard"]);
const EVIDENCE_PRESENTATIONS = new Set<EvidencePresentation>([
  "footnote",
  "inline-rationale",
  "sidenote",
  "quote-embed",
  "matrix",
  "bound-value",
  "hidden",
]);
const EVIDENCE_RELATIONS = new Set<EvidenceRelation>(["supports", "derives", "quotes", "fulfills"]);

function normalizeEvidenceSourcePath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return undefined;
  const unwrapped = trimmed.startsWith("vault://")
    ? trimmed.slice("vault://".length)
    : trimmed.startsWith("vault:")
      ? trimmed.slice("vault:".length)
      : trimmed;
  return unwrapped.replace(/\\/g, "/").replace(/^\/+/, "");
}

function evidenceArg(raw: unknown, defaultPresentation?: EvidencePresentation): StagedEvidence[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: StagedEvidence[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const rawSource = item.sourcePath ?? item.source ?? item.path;
    const url =
      typeof item.url === "string" && /^https?:\/\//i.test(item.url.trim())
        ? item.url.trim()
        : typeof rawSource === "string" && /^https?:\/\//i.test(rawSource.trim())
          ? rawSource.trim()
          : undefined;
    const sourcePath = normalizeEvidenceSourcePath(rawSource);
    const inferredKind = item.cardId
      ? "kcard"
      : item.chunkId
        ? "backdata"
        : sourcePath || url || item.resourceId
          ? "resource"
          : "";
    const kind = String(item.kind ?? inferredKind);
    if (!EVIDENCE_KINDS.has(kind)) continue;
    const refId = String(item.refId ?? item.chunkId ?? item.resourceId ?? item.id ?? sourcePath ?? url ?? "");
    if (!refId) continue;
    const lines =
      Array.isArray(item.lines) && item.lines.length === 2 && item.lines.every((n) => Number.isFinite(Number(n)))
        ? ([Number(item.lines[0]), Number(item.lines[1])] as [number, number])
        : undefined;
    const bbox =
      Array.isArray(item.bbox) && item.bbox.length === 4 && item.bbox.every((n) => Number.isFinite(Number(n)))
        ? ([Number(item.bbox[0]), Number(item.bbox[1]), Number(item.bbox[2]), Number(item.bbox[3])] as [number, number, number, number])
        : undefined;
    const presentation =
      typeof item.presentation === "string" && EVIDENCE_PRESENTATIONS.has(item.presentation as EvidencePresentation)
        ? (item.presentation as EvidencePresentation)
        : defaultPresentation;
    const relation =
      typeof item.relation === "string" && EVIDENCE_RELATIONS.has(item.relation as EvidenceRelation)
        ? (item.relation as EvidenceRelation)
        : undefined;
    const defaultLabel = sourcePath ? sourcePath.split("/").pop() || refId : url || refId;
    out.push({
      citationId: item.citationId != null ? String(item.citationId) : undefined,
      locator: {
        kind: kind as StagedEvidence["locator"]["kind"],
        refId,
        label: String(item.label ?? defaultLabel),
        resourceId: item.resourceId ? String(item.resourceId) : undefined,
        sourcePath,
        url,
        deckId: item.deckId ? String(item.deckId) : undefined,
        cardId: item.cardId ? String(item.cardId) : undefined,
        nodeId: item.nodeId ? String(item.nodeId) : undefined,
        slotId: item.slotId ? String(item.slotId) : undefined,
        blockId: item.blockId ? String(item.blockId) : undefined,
        page: item.page != null && Number.isFinite(Number(item.page)) ? Number(item.page) : undefined,
        lines,
        bbox,
        excerpt: typeof item.excerpt === "string" && item.excerpt.trim() ? item.excerpt.trim() : undefined,
        presentation,
        relation,
        rationale: typeof item.rationale === "string" && item.rationale.trim() ? item.rationale.trim() : undefined,
        boundValue: typeof item.boundValue === "string" && item.boundValue.trim() ? item.boundValue.trim() : undefined,
        boundFormula: typeof item.boundFormula === "string" && item.boundFormula.trim() ? item.boundFormula.trim() : undefined,
        requirementId: typeof item.requirementId === "string" && item.requirementId.trim() ? item.requirementId.trim() : undefined,
      },
    });
  }
  return out.length ? out : undefined;
}

function appendCitationMarkers(html: string, citationIds: readonly string[]): string {
  let next = html;
  const toAppend: string[] = [];
  for (const cid of citationIds) {
    const escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const markerRe = new RegExp(`data-cite=["']${escaped}["']`);
    if (!markerRe.test(next)) {
      toAppend.push(`<sup data-cite="${cid}"></sup>`);
    }
  }
  if (toAppend.length === 0) return next;
  const joined = toAppend.join("");
  if (/<\/(p|li|h[1-6]|div)>\s*$/i.test(next)) {
    next = next.replace(/(<\/(?:p|li|h[1-6]|div)>\s*)$/i, `${joined}$1`);
  } else {
    next = `${next}${joined}`;
  }
  return next;
}

export function buildSlotHtmlChange(
  doc: VDocDocument,
  path: string,
  slot: VDocSlot,
  html: string,
  meta: { reason?: string; evidence?: StagedEvidence[]; runId?: string }
): V2StagedChange {
  return {
    path,
    diffId: newId("stg-composer"),
    phase: "drafting",
    targetKind: "slot-html",
    targetId: slot.slotId,
    title: `[AI Composer] ${slot.label || slot.slotId}${meta.reason ? ` — ${meta.reason}` : ""}`,
    beforeSummary: htmlToSummary(slot.content, 80) || "(빈 슬롯)",
    afterSummary: htmlToSummary(html, 110),
    payload: { slotId: slot.slotId, html },
    sourceReferenceIds: slot.backDataRefs ?? [],
    docId: doc.docId,
    baseHash: contentHash(slot.content),
    runId: meta.runId,
    harnessId: "composer",
    createdAt: new Date().toISOString(),
    evidence: meta.evidence,
  } as V2StagedChange;
}

/** `.outline` TreePatchRequest 제안을 기존 Staged 변경안(StagedOutlinePatchChange)으로 조립한다. */
export function buildOutlinePatchChange(
  env: Pick<V2AiEnv, "vault">,
  path: string,
  params: {
    readonly requests: readonly Record<string, unknown>[];
    readonly targetNodeIds: readonly string[];
    readonly baseHash?: string;
    readonly nodeEvidence?: Record<string, EvidenceLocator[]>;
    readonly summary?: string;
    readonly warnings?: readonly string[];
    readonly runId?: string;
  }
): V2StagedChange {
  const ol = readOutline(env, path);
  const roots = ol?.rootNodes ?? [];
  const preview = previewOutlinePatch(roots, params.requests as unknown as TreePatchRequest[]);
  const baseHash = params.baseHash || computeOutlineSubtreeHash(roots, params.targetNodeIds);
  const allEvidence: StagedEvidence[] = [];
  if (params.nodeEvidence) {
    for (const list of Object.values(params.nodeEvidence)) {
      if (!Array.isArray(list)) continue;
      for (const loc of list) allEvidence.push({ locator: loc });
    }
  }
  const boundVDoc = ol?.docBindings
    ? Object.values(ol.docBindings)[0]?.vdocPath
    : undefined;
  return {
    path,
    diffId: newId("stg-outline"),
    phase: "outlining",
    targetKind: "outline-patch",
    targetId: params.targetNodeIds[0] ?? path,
    title: `[Outline AI] ${params.summary || `아웃라인 패치 (${params.requests.length}건)`}`,
    beforeSummary: preview.beforeSummary,
    afterSummary: preview.afterSummary,
    payload: {
      requests: [...params.requests],
      targetNodeIds: [...params.targetNodeIds],
      ...(params.nodeEvidence && Object.keys(params.nodeEvidence).length > 0 ? { nodeEvidence: params.nodeEvidence } : {}),
      ...(boundVDoc ? { compiledDocPath: fromVaultUri(boundVDoc) ?? boundVDoc } : {}),
    },
    sourceReferenceIds: [],
    docId: ol?.id ?? `outline:${path}`,
    baseHash,
    runId: params.runId,
    harnessId: "outline",
    createdAt: new Date().toISOString(),
    ...(allEvidence.length > 0 ? { evidence: allEvidence } : {}),
    ...(params.warnings && params.warnings.length > 0 ? { warnings: [...params.warnings] } : {}),
  } as V2StagedChange;
}

/** 변경안 승인 → `.vdoc` 은 해당 칸/속성만 쓰고, `.outline` 은 열린 세션 `applyPatch` 를 경유해 무충돌 반영한다. */
export function applyStagedChange(
  env: Pick<V2AiEnv, "vault">,
  change: V2StagedChange,
  options?: { readonly recompileBoundVDocs?: boolean; readonly syncOutline?: boolean }
): VDocDocument | { outlinePath: string; viaLiveSession: boolean; updatedVDocs: readonly string[] } {
  if (change.targetKind === "outline-patch") {
    const res = applyOutlinePatchSafely(
      env.vault,
      change.path,
      change.payload.requests as unknown as TreePatchRequest[],
      change.payload.nodeEvidence,
      { recompileBoundVDocs: options?.recompileBoundVDocs }
    );
    return { outlinePath: change.path, viaLiveSession: res.viaLiveSession, updatedVDocs: res.updatedVDocs };
  }
  const doc = readVDoc(env, change.path);
  if (!doc) throw new Error(`변경안의 대상 문서를 읽지 못했습니다: ${change.path}`);
  let next: VDocDocument;
  let removedSourceNodeIds: Set<string> | undefined;
  if (change.targetKind === "slot-html") {
    const { slotId, html } = change.payload;
    if (!doc.slots[slotId]) throw new Error(`칸이 없어졌습니다: ${slotId}`);
    const now = new Date().toISOString();
    const links: EvidenceLink[] = (change.evidence ?? []).map((e) => ({
      linkId: newEvidenceLinkId(),
      slotId,
      locator: e.locator,
      origin: "ai",
      harnessId: change.harnessId,
      runId: change.runId,
      createdAt: now,
      status: "ok",
      citationIds: e.citationId ? [e.citationId] : [],
      ...(e.locator.relation ? { relation: e.locator.relation } : {}),
      ...(e.locator.presentation ? { presentation: e.locator.presentation } : {}),
      ...(e.locator.rationale ? { rationale: e.locator.rationale } : {}),
    }));
    next = addEvidenceLinks(withSlotFill(setSlotContent(doc, slotId, html), slotId, { author: "ai", harnessId: change.harnessId, runId: change.runId, at: now }), links);
  } else if (change.targetKind === "block-props") {
    next = patchBlockProps(doc, change.payload.blockId, change.payload.props);
  } else if (change.targetKind === "variables") {
    next = { ...doc, variables: { ...doc.variables, ...change.payload.variables } };
  } else if (change.targetKind === "asset-blocks") {
    if (change.payload.mode === "replace" && Array.isArray(change.payload.replaceBlockIds)) {
      removedSourceNodeIds = new Set<string>();
      for (const bid of change.payload.replaceBlockIds) {
        const prev = findBlock(doc, bid);
        if (prev?.block.sourceNodeId) removedSourceNodeIds.add(prev.block.sourceNodeId);
      }
    }
    next = placeAssetBlocks(doc, change.payload);
    // 문서 바로 옆에 단일 동반 `.vstyle` 이 있는데 styleRef 가 비어 있으면 승인 시 자동 보존/연결한다.
    if (!next.styleRef) {
      const styleCatalog = collectVaultStyleEntries(env.vault);
      const companionOrActive = resolveActiveStyleEntry(next, env.vault, styleCatalog, change.path);
      if (companionOrActive?.vaultPath) {
        next = { ...next, styleRef: buildStyleRefForEntry(companionOrActive) };
      }
    }
  } else if (change.targetKind === "style-change") {
    next = applyStagedStyleChange(env.vault, change.path, doc, change.payload);
  } else {
    throw new Error(`v2 에서 아직 적용할 수 없는 변경안입니다: ${change.targetKind}`);
  }
  env.vault.write(change.path, serializeVDocJson(next));
  if (change.targetKind === "asset-blocks" && next.outlineRef && options?.syncOutline !== false) {
    const synced = syncVDocMeaningBackToOutline(env.vault, change.path, next, {
      ...(removedSourceNodeIds && removedSourceNodeIds.size > 0 ? { removedSourceNodeIds } : {}),
    });
    if (synced) {
      const refreshed = readVDoc(env, change.path);
      if (refreshed) return refreshed;
    }
  }
  return next;
}

/** 승인 시점에 대상(슬롯 또는 `.outline` 서브트리)이 그사이 사람 손으로 바뀌었는가. */
export function isStale(env: Pick<V2AiEnv, "vault">, change: V2StagedChange): boolean {
  if (!change.baseHash) return false;
  if (change.targetKind === "outline-patch") {
    const ol = readOutline(env, change.path);
    if (!ol) return true;
    return computeOutlineSubtreeHash(ol.rootNodes, change.payload.targetNodeIds) !== change.baseHash;
  }
  if (change.targetKind !== "slot-html") return false;
  const doc = readVDoc(env, change.path);
  const slot = doc?.slots[change.payload.slotId];
  return !slot || contentHash(slot.content) !== change.baseHash;
}

const stagedSlotIds = (queue: readonly V2StagedChange[], path: string) =>
  new Set(queue.filter((c) => c.path === path && c.targetKind === "slot-html").map((c) => (c.targetKind === "slot-html" ? c.payload.slotId : "")));

// --- 도구 ---------------------------------------------------------------------------------------

export function createV2Tools(env: V2AiEnv, host: V2ToolHost): WorkspaceTool<any>[] {
  const tools: WorkspaceTool<any>[] = [
    {
      ...clientTool("workspace.getState"),
      describe: () => "워크스페이스 상태 읽기",
      run: (_args: unknown, ctx?: ToolRunContext) => {
        const path = env.activeDocPath();
        const doc = readVDoc(env, path);
        const scope = doc ? toolScope(env, host, doc, ctx) : null;
        const ui = path ? env.vdocUiBridge.getState().getForPath(path) : null;
        const workMode = ui?.workMode ?? null;
        const outlineLink = doc?.outlineRef?.outlinePath
          ? {
              linked: true,
              outlinePath: fromVaultUri(doc.outlineRef.outlinePath) ?? doc.outlineRef.outlinePath,
              rootNodeId: doc.outlineRef.rootNodeId ?? null,
            }
          : null;
        const modeGuidance =
          workMode === "Structure"
            ? {
                mode: "Structure" as const,
                strategy: outlineLink
                  ? "구조 모드(아웃라인 연결 문서): 다중 섹션/문서 전체 개편은 .outline 의 <<doc:...>> DSL 을 먼저 수정(ol_propose_patch)→컴파일하고, 국소 블록/이미지 레이아웃 재편은 assets.propose({ dsl, records, replaceBlockIds, styleKey }) 인라인 .vsyntax DSL 선행 변경 후 .vstyle 을 재편하세요(일회성 변경은 assets.register 생략, 승인 시 .outline 자동 동기화)."
                  : "구조 모드: 원시 HTML 직접 수정 대신 assets.propose({ dsl, records, replaceBlockIds, styleKey }) 인라인 .vsyntax DSL 선행 변경 후 style.upsertVariant / style.apply 로 .vstyle 을 재편하세요(반복 재사용 틀만 saveAsset: true 또는 assets.register).",
                preferredTools: outlineLink
                  ? ["schema.inspect", "ol_propose_patch", "assets.propose", "style.upsertVariant", "style.apply"]
                  : ["schema.inspect", "assets.propose", "style.upsertVariant", "style.apply"],
              }
            : workMode === "Design"
              ? {
                  mode: "Design" as const,
                  strategy:
                    "디자인 모드: 기존 구조 골격을 유지하면서 style.inspect → style.upsertVariant / style.apply(.vstyle 4축), blocks.proposeProps(폭·정렬·최대높이·캡션), slots.proposeBatch(문구 다듬기·근거 연결)에 집중하세요. 구조 자체를 바꿔야 할 때만 assets.propose({ dsl }) 를 사용하세요.",
                  preferredTools: ["style.inspect", "style.upsertVariant", "style.apply", "blocks.proposeProps", "slots.proposeBatch"],
                }
              : null;
        return {
          vault: { vaultId: env.vaultId, name: env.vault.name },
          document: doc
            ? scope
              ? { docId: doc.docId, vaultPath: path, scope: scope.label, pageIds: [...(scope.pageIds ?? [])] }
              : { docId: doc.docId, vaultPath: path, title: doc.title, status: doc.status, pageCount: doc.pages.length }
            : null,
          activePageId: ui?.activePageId ?? null,
          workMode,
          outlineLink,
          modeGuidance,
          selectedSlot: ui?.selectedSlotId ? { slotId: ui.selectedSlotId, label: doc?.slots[ui.selectedSlotId]?.label ?? null } : null,
          selectedBlockId: ui?.selectedBlockId ?? null,
          openReferences: activeReferences(env).map((r) => r.refId),
          stagedCount: env.store.getState().queue.length,
        };
      },
    },
    {
      ...clientTool("document.getOutline"),
      describe: (args: { pageId?: string }) => (args.pageId ? `페이지 ${args.pageId} 구조 읽기` : "문서 구조 읽기"),
      run: (args: { pageId?: string; includeLocked?: boolean }, ctx?: ToolRunContext) => {
        const { path, doc } = requireDoc(env);
        const scope = toolScope(env, host, doc, ctx);
        if (scope?.mode === "off") throw new Error("범위가 꺼져 있습니다 — 사용자가 문서를 이 대화에서 뺐다.");
        if (scope && args.pageId && scopeHidesPage(doc, scope, args.pageId)) throw new Error(`사용자가 뺀 페이지입니다: ${args.pageId} — 읽지도 고치지도 않는다`);
        const pages = (args.pageId ? doc.pages.filter((p) => p.pageId === args.pageId) : doc.pages).filter((p) => !scopeHidesPage(doc, scope, p.pageId));
        const lines: string[] = [
          scope
            ? `${doc.title} (docId=${doc.docId} · ${path}) · 고칠 범위: ${scope.label} — 범위 밖은 [범위밖] (읽기만)`
            : `${doc.title} (docId=${doc.docId} · ${path}, ${doc.pages.length}p)`,
        ];
        let hidden = 0;
        for (const page of pages) {
          lines.push(`# ${page.pageId} ${page.pageLabel ?? ""}${scope && !scopeAllowsPage(doc, scope, page.pageId) ? " [범위밖]" : ""}`);
          for (const block of page.blocks) {
            const slots = getBlockSlotIds(block).map((id) => doc.slots[id]).filter((slot): slot is VDocSlot => Boolean(slot) && !scopeHidesSlot(doc, scope, slot.slotId));
            const shown = slots.filter((slot) => args.includeLocked || !slot.constraints?.locked);
            hidden += slots.length - shown.length;
            if (shown.length === 0) continue;
            lines.push(`- ${block.blockId} (${block.kind})`);
            for (const slot of shown) {
              const flags = [slot.role === "fillable-field" ? slot.role : "", slot.constraints?.locked ? "locked" : ""].filter(Boolean).join(",");
              const outside = scope && !scopeAllowsSlot(doc, scope, slot.slotId) ? " [범위밖]" : "";
              lines.push(`  - ${slot.slotId}${flags ? ` [${flags}]` : ""}${outside} ${slot.label} — ${clip(slotPlainText(slot.content), 50)}`);
            }
          }
        }
        if (hidden) lines.push(`(잠긴 슬롯 ${hidden}개 생략 — includeLocked=true 로 포함)`);
        return lines.join("\n");
      },
    },
    {
      ...clientTool("slot.read"),
      describe: (args: { slotId?: string }) => `슬롯 '${args.slotId}' 읽기`,
      run: (args: { slotId: string }) => {
        const { doc } = requireDoc(env);
        const slot = requireSlot(doc, args.slotId);
        return {
          slotId: slot.slotId,
          label: slot.label,
          role: slot.role,
          html: slot.content,
          text: slotPlainText(slot.content),
          constraints: slot.constraints ?? {},
          backdata: getSlotBackdata(doc, slot).map((c) => ({ chunkId: c.chunkId, sourceTitle: c.sourceTitle, excerpt: c.excerpt })),
        };
      },
    },
    {
      ...clientTool("slot.proposeContent"),
      describe: (args: { slotId?: string; reason?: string }) => `슬롯 '${args.slotId}' 변경안 제출${args.reason ? ` — ${args.reason}` : ""}`,
      run: (args: { slotId: string; html: string; reason?: string; evidence?: unknown }, ctx?: ToolRunContext) => {
        const { path, doc } = requireDoc(env);
        const slot = requireSlot(doc, args.slotId);
        if (slot.constraints?.locked) throw new Error(`잠긴 슬롯입니다: ${slot.label}`);
        if (typeof args.html !== "string" || !args.html.trim()) throw new Error("html 이 비어 있습니다.");
        const defaultPres = readVaultEvidenceSettings(env.vault).defaultPresentation;
        const change = buildSlotHtmlChange(doc, path, slot, args.html, { reason: args.reason, evidence: evidenceArg(args.evidence, defaultPres), runId: ctx?.callId });
        stage(env, [change]);
        return { staged: true, diffId: change.diffId, note: "Staged 대기열에 올렸습니다. 사용자가 승인하면 반영됩니다." };
      },
    },
    {
      ...clientTool("slots.proposeBatch"),
      describe: (args: { changes?: unknown[]; reason?: string }) => `슬롯 ${Array.isArray(args.changes) ? args.changes.length : 0}개 변경안 제출${args.reason ? ` — ${args.reason}` : ""}`,
      run: (args: { changes: { slotId: string; html: string; evidence?: unknown }[]; reason?: string }, ctx?: ToolRunContext) => {
        const { path, doc } = requireDoc(env);
        if (!Array.isArray(args.changes) || args.changes.length === 0) throw new Error("changes 가 비어 있습니다.");
        const staged: V2StagedChange[] = [];
        const skipped: { slotId: string; why: string }[] = [];
        const defaultPres = readVaultEvidenceSettings(env.vault).defaultPresentation;
        for (const change of args.changes) {
          const slot = doc.slots[change?.slotId];
          const parsedEvidence = evidenceArg(change?.evidence, defaultPres);
          if (!slot) skipped.push({ slotId: String(change?.slotId), why: "없는 슬롯" });
          else if (slot.constraints?.locked) skipped.push({ slotId: slot.slotId, why: "잠김" });
          else if (typeof change.html !== "string" || !change.html.trim()) skipped.push({ slotId: slot.slotId, why: "빈 html" });
          else if (change.html.trim() === slot.content.trim() && !parsedEvidence?.length) skipped.push({ slotId: slot.slotId, why: "변경 없음" });
          else staged.push(buildSlotHtmlChange(doc, path, slot, change.html, { reason: args.reason, evidence: parsedEvidence, runId: ctx?.callId }));
        }
        if (staged.length) stage(env, staged);
        return {
          staged: staged.length,
          diffIds: staged.map((c) => c.diffId),
          skipped,
          note: staged.length ? `${staged.length}건을 Staged 대기열에 올렸습니다. 사용자가 한꺼번에 승인 · 거절할 수 있습니다.` : "올린 변경안이 없습니다.",
        };
      },
    },
    {
      ...clientTool("slots.attachEvidence"),
      describe: (args: { attachments?: unknown[]; reason?: string }) =>
        `슬롯 ${Array.isArray(args.attachments) ? args.attachments.length : 0}개 리소스 근거 첨부${args.reason ? ` — ${args.reason}` : ""}`,
      run: (
        args: {
          attachments: { slotId: string; evidence: unknown; appendCiteMarker?: boolean }[];
          reason?: string;
        },
        ctx?: ToolRunContext
      ) => {
        const { path, doc } = requireDoc(env);
        if (!Array.isArray(args.attachments) || args.attachments.length === 0) {
          throw new Error("attachments 가 비어 있습니다.");
        }
        const staged: V2StagedChange[] = [];
        const skipped: { slotId: string; why: string }[] = [];
        const defaultPres = readVaultEvidenceSettings(env.vault).defaultPresentation;
        for (const att of args.attachments) {
          const slot = doc.slots[att?.slotId];
          if (!slot) {
            skipped.push({ slotId: String(att?.slotId), why: "없는 슬롯" });
            continue;
          }
          if (slot.constraints?.locked) {
            skipped.push({ slotId: slot.slotId, why: "잠김" });
            continue;
          }
          const parsed = evidenceArg(att.evidence, defaultPres);
          if (!parsed || parsed.length === 0) {
            skipped.push({ slotId: slot.slotId, why: "유효한 evidence 없음 (sourcePath/url 필요)" });
            continue;
          }
          const existingCount = (doc.evidenceLinks ?? []).filter((l) => l.slotId === slot.slotId).length;
          const withCitations: StagedEvidence[] = parsed.map((e, idx) => ({
            ...e,
            citationId: e.citationId ?? String(existingCount + idx + 1),
          }));
          const appendMarker = att.appendCiteMarker !== false;
          const nextHtml = appendMarker
            ? appendCitationMarkers(
                slot.content,
                withCitations.map((e) => e.citationId!).filter(Boolean)
              )
            : slot.content;
          const labels = withCitations.map((e) => e.locator.label).slice(0, 3).join(", ");
          const change = buildSlotHtmlChange(doc, path, slot, nextHtml, {
            reason: args.reason ?? `근거 ${withCitations.length}건 첨부 (${labels})`,
            evidence: withCitations,
            runId: ctx?.callId,
          });
          staged.push({
            ...change,
            afterSummary: `근거 ${withCitations.length}건 첨부 · ${labels}`,
          });
        }
        if (staged.length) stage(env, staged);
        return {
          staged: staged.length,
          diffIds: staged.map((c) => c.diffId),
          skipped,
          note: staged.length
            ? `슬롯 ${staged.length}개에 리소스 근거 첨부 변경안을 Staged 대기열에 올렸습니다. 사용자가 승인하면 문서 근거(evidenceLinks)에 반영됩니다.`
            : "첨부할 유효한 변경안이 없습니다.",
        };
      },
    },
    {
      ...clientTool("blocks.proposeProps"),
      describe: (args: { blockId?: string; props?: Record<string, unknown> }) => `블록 ${args.blockId} 속성 변경안 (${Object.keys(args.props ?? {}).join(", ")})`,
      run: (args: { blockId: string; props: Record<string, unknown>; reason?: string }) => {
        const { path, doc } = requireDoc(env);
        const loc = findBlock(doc, args.blockId);
        if (!loc) throw new Error(`블록을 찾을 수 없습니다: ${args.blockId}`);
        if (loc.block.locked) throw new Error(`잠긴 블록입니다: ${loc.block.title}`);
        const { ok, rejected } = validateBlockProps(loc.block, args.props);
        const allowed = Object.keys(getBlockKind(loc.block.kind).ai?.editableProps ?? {});
        if (Object.keys(ok).length === 0) {
          throw new Error(`바꿀 수 있는 속성이 없습니다. 이 블록에서 허용: ${allowed.join(", ") || "(없음)"} · 거부: ${rejected.map((r) => `${r.key}(${r.why})`).join(", ")}`);
        }
        const change = {
          path,
          diffId: newId("stg-composer"),
          phase: "drafting",
          targetKind: "block-props",
          targetId: loc.block.blockId,
          title: `[AI Composer] ${loc.block.title || getBlockKind(loc.block.kind).label} 속성${args.reason ? ` — ${args.reason}` : ""}`,
          beforeSummary: Object.keys(ok).map((k) => `${k}=${String((loc.block as unknown as Record<string, unknown>)[k] ?? "-")}`).join(", "),
          afterSummary: Object.entries(ok).map(([k, v]) => `${k}=${String(v)}`).join(", "),
          payload: { blockId: loc.block.blockId, props: ok },
          sourceReferenceIds: [],
          docId: doc.docId,
          harnessId: "composer",
          createdAt: new Date().toISOString(),
        } as V2StagedChange;
        stage(env, [change]);
        return { staged: true, diffId: change.diffId, applied: ok, rejected };
      },
    },
    {
      ...clientTool("canvas.selectSlot"),
      describe: (args: { slotId?: string }) => `슬롯 ${args.slotId} 로 이동`,
      run: (args: { slotId: string }) => {
        const { path, doc } = requireDoc(env);
        const slot = requireSlot(doc, args.slotId);
        const page = doc.pages.find((p) => p.blocks.some((b) => getBlockSlotIds(b).includes(slot.slotId)));
        host.revealSlot(path, slot.slotId, page?.pageId ?? null);
        return { selected: slot.slotId, pageId: page?.pageId ?? null };
      },
    },
    {
      ...clientTool("canvas.select"),
      describe: (args: { slotIds?: string[]; blockIds?: string[] }) =>
        `캔버스에서 ${(args.slotIds?.length ?? 0) + (args.blockIds?.length ?? 0)}개 선택`,
      run: (args: { slotIds?: string[]; blockIds?: string[] }, ctx?: ToolRunContext) => {
        const { path, doc } = requireDoc(env);
        const scope = toolScope(env, host, doc, ctx);
        if (scope?.mode === "off") throw new Error("범위가 꺼져 있습니다 — 사용자가 문서를 이 대화에서 뺐다.");
        const items: { id: string; kind: "slot" | "block"; blockId: string | null; pageId: string | null }[] = [];
        const skipped: { id: string; why: string }[] = [];
        for (const sid of Array.isArray(args.slotIds) ? args.slotIds : []) {
          if (!doc.slots[sid]) skipped.push({ id: sid, why: "없는 칸" });
          else if (scope && !scopeAllowsSlot(doc, scope, sid)) skipped.push({ id: sid, why: "범위 밖" });
          else {
            const page = doc.pages.find((p) => p.blocks.some((b) => getBlockSlotIds(b).includes(sid)));
            const owner = page?.blocks.find((b) => getBlockSlotIds(b).includes(sid));
            items.push({ id: sid, kind: "slot", blockId: owner?.blockId ?? null, pageId: page?.pageId ?? null });
          }
        }
        for (const bid of Array.isArray(args.blockIds) ? args.blockIds : []) {
          const loc = findBlock(doc, bid);
          if (!loc) skipped.push({ id: bid, why: "없는 블록" });
          else if (scope && !scopeAllowsBlock(doc, scope, bid)) skipped.push({ id: bid, why: "범위 밖" });
          else items.push({ id: bid, kind: "block", blockId: bid, pageId: loc.pageId });
        }
        if (!items.length) throw new Error(`고를 칸 · 블록이 없습니다${skipped.length ? `: ${skipped.map((x) => `${x.id}(${x.why})`).join(", ")}` : ""}`);
        host.revealSelection(path, items);
        return { selected: items.map((i) => i.id), skipped };
      },
    },
    {
      ...clientTool("slots.listByState"),
      describe: (args: { scope?: string; state?: string }) => `칸 상태 목록 (${args.scope ?? "page"}${args.state ? ` · ${args.state}` : ""})`,
      run: (args: { scope?: "block" | "page" | "document"; id?: string; state?: SlotFillState }, ctx?: ToolRunContext) => {
        const { path, doc } = requireDoc(env);
        const range = toolScope(env, host, doc, ctx);
        const ui = env.vdocUiBridge.getState().getForPath(path);
        const scope = args.scope ?? "page";
        const staged = stagedSlotIds(env.store.getState().queue, path);
        let ids: string[];
        if (scope === "document") ids = Object.keys(doc.slots);
        else if (scope === "block") {
          const blockId = args.id ?? ui.selectedBlockId ?? "";
          const loc = findBlock(doc, blockId);
          if (!loc) throw new Error(`블록을 찾을 수 없습니다: ${blockId}`);
          ids = getBlockSlotIds(loc.block);
        } else {
          const pageId = args.id ?? ui.activePageId;
          const page = doc.pages.find((p) => p.pageId === pageId) ?? doc.pages[0];
          ids = (page?.blocks ?? []).flatMap((b) => getBlockSlotIds(b));
        }
        ids = ids.filter((id) => scopeAllowsSlot(doc, range, id));
        const rows = ids
          .map((id) => doc.slots[id])
          .filter(Boolean)
          .map((slot) => ({ slotId: slot.slotId, label: slot.label, state: slotFillState(slot, staged), maxLines: slot.constraints?.maxLines }))
          .filter((r) => r.state !== "locked" && (!args.state || r.state === args.state));
        return { scope, count: rows.length, progress: fillProgress(ids.map((id) => doc.slots[id]).filter(Boolean), staged), slots: rows.slice(0, 120) };
      },
    },
    {
      ...clientTool("staging.list"),
      describe: () => "Staged 변경안 목록",
      run: () =>
        env.store.getState().queue.map((c) => ({ diffId: c.diffId, path: c.path, targetKind: c.targetKind, targetId: c.targetId, title: c.title, after: c.afterSummary })),
    },
    {
      ...clientTool("layout.openPanel"),
      describe: (args: { panel?: string }) => `${args.panel} 패널 열기`,
      run: (args: { panel: string }) => {
        if (args.panel === "explorer" || args.panel === "source-control") {
          host.showExplorer();
          return { opened: args.panel === "source-control" ? "AI 탭 변경안 목록" : "explorer" };
        }
        if (args.panel === "inspector" || args.panel === "blockbox") {
          return { opened: false, note: `오른쪽 '${args.panel}' 탭은 Composer 와 같은 자리라 사용자에게 안내만 한다.` };
        }
        throw new Error(`알 수 없는 패널: ${args.panel}`);
      },
    },
    {
      ...clientTool("outline.getWorkingTree"),
      describe: () => "연결된 .outline 트리 읽기",
      run: () => {
        const { doc } = requireDoc(env);
        const outlinePath = doc.outlineRef?.outlinePath ? fromVaultUri(doc.outlineRef.outlinePath) ?? doc.outlineRef.outlinePath : null;
        if (!outlinePath || !env.vault.exists(outlinePath)) return { outlinePath: null, nodes: [] };
        const outline = parseOutlineJson(env.vault.read(outlinePath), outlinePath);
        return { outlinePath, rootNodeId: doc.outlineRef?.rootNodeId ?? null, nodes: outline.rootNodes };
      },
    },
    {
      ...clientTool("outline.selectNodes"),
      describe: (args: { nodeIds?: string[] }) => `아웃라인 불릿 ${args?.nodeIds?.length ?? 0}개 선택`,
      run: (args: { path?: string; nodeIds: string[]; zoom?: boolean }) => {
        const targetPath = args.path?.trim() || activeOutlinePath(env);
        if (!targetPath || !env.vault.exists(targetPath)) throw new Error("열린 .outline 파일이 없습니다.");
        const ids = Array.isArray(args.nodeIds) ? args.nodeIds.filter((x) => typeof x === "string" && x) : [];
        if (ids.length === 0) throw new Error("선택할 nodeIds 가 필요합니다.");
        const live = getLiveOutlineSession(targetPath);
        if (live) {
          live.selectNodes(ids, Boolean(args.zoom));
        } else {
          host.openPath(targetPath);
          requestOutlineReveal(targetPath, ids[0], { zoom: Boolean(args.zoom) });
        }
        return { path: targetPath, selectedNodeIds: ids };
      },
    },
    {
      ...clientTool("outline.getSyntax"),
      describe: () => "볼트 ElementSyntaxRegistry · .vasset 문법 조회",
      run: (args: { profileId?: string }) => {
        const registry = loadVaultSyntaxRegistry(env.vault);
        const snap = registry.exportSnapshot();
        const profiles = args?.profileId
          ? snap.profiles.filter((p) => p.id === args.profileId)
          : snap.profiles;
        const activeDriver = getActiveAssetDriver();
        const assets = env.vault
          .listAll()
          .filter((n): n is Extract<typeof n, { kind: "file" }> => n.kind === "file" && isAssetPath(n.path))
          .slice(0, 30)
          .map((n) => {
            try {
              const parsed = parseVAssetJson(env.vault.read(n.path));
              if (!parsed) {
                return { path: n.path, assetId: n.stem, title: n.stem, category: "unknown" };
              }
              const summary = activeDriver.summarizeForSelect(parsed);
              return {
                path: n.path,
                assetId: parsed.assetId,
                title: parsed.title,
                category: parsed.category,
                schemaVersion: summary.schemaVersion,
                flowMode: summary.flowMode,
                badges: summary.badges,
                agentPromptLine: summary.agentPromptLine,
              };
            } catch {
              return { path: n.path, assetId: n.stem, title: n.stem, category: "unknown" };
            }
          });
        return {
          registryVersion: snap.version,
          hierarchy: {
            layers: ["document", "section", "block", "slot", "inline"],
            rule:
              "섹션 먼저: <<doc:프로필>> 바로 아래는 <<view:section:역할>> 만. 블록(글 · 그림 · 표 · 목록 · 제목)은 섹션 안에, 기본은 위에서 아래로 한 단 흐름. " +
              "다단(나란히)은 사용자가 요청했거나 레퍼런스에 다단이 있을 때만 — 그 자리를 <<view:section:column>> 섹션으로 세우고 자식 불릿 하나를 한 단으로 쓴다(둘 이상). " +
              "<<view:columns>> · <<col>> 은 폐기. 인용(<<resource:…>> · <<cite:…>>)은 섹션 · 블록 아래. " +
              "요소마다 parents(담길 곳) · children(담는 것) 를 따른다. 섹션 = 구조 단위, A4 의 쪽은 출력 결과(섹션이 쪽을 넘어 흐른다).",
          },
          profiles: profiles.map((p) => ({
            id: p.id,
            label: p.label,
            unitKind: p.unitKind,
            structureUnit: p.structureUnit ?? "section",
            outputUnit: p.outputUnit ?? (p.surface.kind === "paged" ? "page" : "scroll"),
            allowedElementIds: p.allowedElementIds,
          })),
          elements: snap.elements.map((e) => ({
            id: e.id,
            viewTag: `<<view:${e.viewTag}>>`,
            label: e.label,
            layer: e.layer,
            parents: e.parents,
            allowedInViews: e.allowedInViews,
            rules: e.rules.map((r) => ({
              id: r.id,
              symbol: r.symbol,
              primitive: r.primitive,
              position: r.position,
              ...(r.layer ? { layer: r.layer } : {}),
              ...(r.parents ? { parents: r.parents } : {}),
              ...(r.children ? { children: r.children } : {}),
            })),
          })),
          assets,
        };
      },
    },
    {
      ...clientTool("outline.compileCheck"),
      describe: (args: { path?: string }) => `아웃라인 컴파일 측정 (${args?.path ?? "활성"})`,
      run: (args: { path?: string; rootNodeId?: string; diffId?: string }) => {
        const targetPath = args?.path?.trim() || activeOutlinePath(env);
        const base = readOutline(env, targetPath);
        if (!targetPath || !base) throw new Error("검사할 .outline 파일이 없습니다.");

        let roots: OutlineNode[] = base.rootNodes;
        let nodeEvidence = base.nodeEvidence ?? {};
        let patchFailedOps: readonly { index: number; error: string }[] = [];
        // diffId 를 주면 그 패치만, 안 주면 이 파일에 승인 대기 중인 아웃라인 패치 전부를 가상 적용해 잰다 —
        // 에이전트는 ol_propose_patch 결과의 proposalId(olp-…) 만 알고 화면 대기열의 diffId 는 모르기 때문에.
        const pending = env.store
          .getState()
          .queue.filter(
            (c) =>
              c.targetKind === "outline-patch" &&
              (args?.diffId ? c.diffId === args.diffId : c.path === targetPath)
          );
        const previewedDiffIds: string[] = [];
        for (const staged of pending) {
          if (staged.targetKind !== "outline-patch") continue;
          const preview = previewOutlinePatch(roots, staged.payload.requests as unknown as TreePatchRequest[]);
          roots = preview.afterRoots;
          patchFailedOps = [...patchFailedOps, ...preview.failedOps];
          if (staged.payload.nodeEvidence) nodeEvidence = { ...nodeEvidence, ...staged.payload.nodeEvidence };
          previewedDiffIds.push(staged.diffId);
        }

        // 1) 트리 객관 측정치 + .vsyntax 근거 태그 린트
        let nodeCount = 0;
        let maxDepth = 0;
        let maxBulletChars = 0;
        let ungroundedNumericNodes = 0;
        let resourceTagCount = 0;
        let citeTagCount = 0;
        const lintIssues: Array<{
          code: string;
          severity: "error" | "warning";
          nodeId?: string;
          message: string;
        }> = [];
        const NUM_CLAIM = /\d+(?:[.,]\d+)?\s*(?:원|만원|억원|%|명|건|개|일|개월|년|km|m|kg|px|배)/;
        const RES_TAG_RE = /<<\s*resource\s*:\s*([^>\n]*)\s*>>/gi;
        const CITE_TAG_RE = /<<\s*cite(?:\s*:\s*[^>\n]+)?\s*>>/i;
        const VCLIP_WIKI_RE = /\[\[[^[\]\n]*\.vclip(?:#[^[\]\n]*)?(?:\|[^[\]\n]*)?\]\]/i;

        for (const [nid, locs] of Object.entries(nodeEvidence)) {
          if (Array.isArray(locs) && locs.length > 0) {
            lintIssues.push({
              code: "LINT_LEGACY_NODE_EVIDENCE_SIDECAR",
              severity: "error",
              nodeId: nid,
              message: `노드 ${nid} 에 숨겨진 nodeEvidence 사이드카(${locs.length}건)가 있습니다. 편집 가능한 <<resource:...>> 또는 <<cite:...>> 하위 불릿으로 전환하세요.`,
            });
          }
        }

        const outlineDir = targetPath.includes("/") ? targetPath.slice(0, targetPath.lastIndexOf("/")) : "";
        const vaultExistsTarget = (rawTarget: string): boolean => {
          const clean = (fromVaultUri(rawTarget) ?? rawTarget).replace(/^vault:/i, "").trim();
          if (!clean) return false;
          if (env.vault.exists(clean)) return true;
          if (outlineDir) {
            if (env.vault.exists(`${outlineDir}/${clean}`)) return true;
            if (env.vault.exists(`${outlineDir}/sources/${clean}`)) return true;
            if (env.vault.exists(`${outlineDir}/resources/${clean}`)) return true;
          }
          const needle = clean.toLowerCase();
          const baseNeedle = needle.split("/").pop() ?? needle;
          return env.vault.listAll().some((n) => {
            const p = n.path.toLowerCase();
            const b = p.split("/").pop() ?? p;
            const stem = b.replace(/\.[^.]+$/, "");
            return p === needle || p.endsWith(`/${needle}`) || b === baseNeedle || stem === baseNeedle;
          });
        };

        const walkStats = (nodes: readonly OutlineNode[], depth: number) => {
          for (const n of nodes) {
            nodeCount += 1;
            if (depth > maxDepth) maxDepth = depth;
            if (n.text.length > maxBulletChars) maxBulletChars = n.text.length;

            const fileTarget = n.file?.target?.trim() ?? "";
            if (fileTarget && /\.vclip$/i.test(fileTarget)) {
              lintIssues.push({
                code: "LINT_VCLIP_SET_FILE_ABUSE",
                severity: "error",
                nodeId: n.id,
                message: `노드 ${n.id} 에 .vclip(${fileTarget})이 file 첨부 카드로 걸려 있습니다. <<resource: ${fileTarget} | 실제 발췌문>> 불릿으로 교체하세요.`,
              });
            }

            const opened = (n.text.match(/<<\s*(?:resource|cite)\b/gi) ?? []).length;
            const closed =
              (n.text.match(/<<\s*resource\s*:\s*[^>\n]*\s*>>/gi) ?? []).length +
              (n.text.match(/<<\s*cite(?:\s*:\s*[^>\n]+)?\s*>>/gi) ?? []).length;
            if (opened > closed) {
              lintIssues.push({
                code: "LINT_UNTERMINATED_TAG",
                severity: "error",
                nodeId: n.id,
                message: `노드 ${n.id} 의 근거 태그에 닫는 >> 가 없습니다 — 태그로 인식되지 않아 컴파일에서 인용이 사라집니다.`,
              });
            }
            const hasCite = CITE_TAG_RE.test(n.text);
            if (hasCite) citeTagCount += 1;
            const outsideResource = n.text.replace(RES_TAG_RE, "");
            if (!hasCite && VCLIP_WIKI_RE.test(outsideResource)) {
              lintIssues.push({
                code: "LINT_VCLIP_PLAIN_WIKILINK",
                severity: "error",
                nodeId: n.id,
                message: `노드 ${n.id} 에 일반 [[...vclip]] 위키링크가 있습니다. 하이라이트가 작동하도록 <<resource: 대상.vclip | 실제 발췌문>> 태그를 사용하세요.`,
              });
            }

            RES_TAG_RE.lastIndex = 0;
            let rm: RegExpExecArray | null;
            let nodeHasResource = false;
            while ((rm = RES_TAG_RE.exec(n.text)) !== null) {
              nodeHasResource = true;
              resourceTagCount += 1;
              const parsedRes = parseResourceTag(rm[0]);
              if (!parsedRes) {
                lintIssues.push({
                  code: "LINT_MALFORMED_RESOURCE_TAG",
                  severity: "error",
                  nodeId: n.id,
                  message: `노드 ${n.id} 의 <<resource:...>> 태그 문법이 올바르지 않습니다.`,
                });
                continue;
              }
              if (!parsedRes.isWebUrl && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(parsedRes.target) && !parsedRes.bbox) {
                lintIssues.push({
                  code: "LINT_IMAGE_USE_OUTLINE_FILE",
                  severity: "error",
                  nodeId: n.id,
                  message: `노드 ${n.id} 의 이미지(${parsedRes.target})가 <<resource:...>> 링크로 되어 있습니다. .outline 네이티브 이미지 첨부(set_file / file.target)로 바로 꽂으세요(#bbox 영역 인용만 예외).`,
                });
              }
              if (!parsedRes.isWebUrl && !vaultExistsTarget(parsedRes.target)) {
                lintIssues.push({
                  code: "LINT_MISSING_RESOURCE_TARGET",
                  severity: "error",
                  nodeId: n.id,
                  message: `노드 ${n.id} 의 <<resource: ${parsedRes.target}>> 대상이 볼트에 없습니다.`,
                });
              }
              const hasLoc = Boolean(parsedRes.page || parsedRes.lines || parsedRes.bbox || parsedRes.nodeId || parsedRes.slotId || parsedRes.blockId);
              if (!parsedRes.quote && !hasLoc) {
                lintIssues.push({
                  code: "LINT_RESOURCE_WITHOUT_QUOTE",
                  severity: "warning",
                  nodeId: n.id,
                  message: `노드 ${n.id} 의 <<resource: ${parsedRes.target}>> 에 '| 발췌문' 또는 위치 앵커(#p/#L)가 없습니다.`,
                });
              }
            }

            const hasChildEvidence = n.children.some(
              (c: OutlineNode) => /<<\s*(?:resource|cite)\b/i.test(c.text)
            );
            const isGrounded = nodeHasResource || hasCite || hasChildEvidence || Boolean(nodeEvidence[n.id]?.length);
            if (!nodeHasResource && !hasCite && NUM_CLAIM.test(n.text) && !isGrounded) {
              ungroundedNumericNodes += 1;
            }
            if (n.children.length > 0) walkStats(n.children, depth + 1);
          }
        };
        walkStats(roots, 1);

        // 2) directive-scanner + ir-compiler TS 드라이런
        const scanned = scanOutlineDirectives(roots as OutlineSyntaxNode[]);
        const targetNodeId =
          args?.rootNodeId ||
          scanned.find((d) => d.directive.kind === "doc")?.nodeId ||
          scanned[0]?.nodeId ||
          roots[0]?.id;
        const payloadForCompile = { ...base, rootNodes: roots, nodeEvidence };
        const compiled = targetNodeId
          ? compileOutlineTargetForPreview(env.vault, targetPath, payloadForCompile, targetNodeId)
          : { doc: null, boundVDocPath: null, target: null, assets: {} };

        const unresolvedImages: string[] = [];
        let compiledBlockCount = 0;
        let compiledSlotCount = 0;
        if (compiled.doc) {
          compiledSlotCount = Object.keys(compiled.doc.slots).length;
          for (const page of compiled.doc.pages) {
            for (const blk of page.blocks) {
              compiledBlockCount += 1;
              if (blk.kind === "image" && !blk.src) unresolvedImages.push(blk.alt || blk.title || blk.blockId);
            }
          }
        }

        const missingBindings: string[] = [];
        for (const [nid, binding] of Object.entries(base.docBindings ?? {})) {
          const vdocRel = fromVaultUri(binding.vdocPath) ?? binding.vdocPath;
          if (!env.vault.exists(vdocRel)) missingBindings.push(`${nid}->${vdocRel}`);
        }

        const lintErrorCount = lintIssues.filter((i) => i.severity === "error").length;

        // 3) 계층(담기) 문법 — <<doc>> 가지면 섹션 → 컨테이너 → 블록 순서 · 컴파일 결과와의 동형
        const targetIsDoc = Boolean(
          targetNodeId && scanned.find((d) => d.nodeId === targetNodeId)?.directive.kind === "doc"
        );
        const hierarchy = targetIsDoc && targetNodeId
          ? validateOutlineHierarchy(roots as OutlineSyntaxNode[], targetNodeId, loadVaultSyntaxRegistry(env.vault))
          : null;
        const isomorphism = hierarchy && compiled.doc ? measureOutlineVDocIsomorphism(hierarchy, compiled.doc) : null;

        return {
          path: targetPath,
          targetNodeId: targetNodeId ?? null,
          previewedStagedDiffIds: previewedDiffIds,
          lintPassed: lintErrorCount === 0,
          lintIssues,
          hierarchyPassed: hierarchy ? hierarchy.ok : null,
          hierarchyIssues: hierarchy?.issues ?? [],
          structure: hierarchy
            ? {
                sections: hierarchy.sectionNodeIds.length,
                columnSections: hierarchy.columnSectionNodeIds.length,
                blocks: hierarchy.blockCount,
                citations: hierarchy.citationCount,
                isomorphism: isomorphism
                  ? { expected: isomorphism.expected, matched: isomorphism.matched, missingNodeIds: isomorphism.missingNodeIds }
                  : null,
              }
            : null,
          measurements: {
            nodeCount,
            maxDepth,
            maxBulletChars,
            directiveCount: scanned.length,
            resourceTagCount,
            citeTagCount,
            lintErrorCount,
            lintWarningCount: lintIssues.length - lintErrorCount,
            compiledPageCount: compiled.doc?.pages.length ?? 0,
            compiledBlockCount,
            compiledSlotCount,
            inheritedEvidenceLinks: compiled.doc?.evidenceLinks?.length ?? 0,
            ungroundedNumericNodes,
            unresolvedImages,
            missingBindings,
            patchFailedOps,
          },
        };
      },
    },
    {
      ...clientTool("outline.previewCompile"),
      describe: (args: { path?: string }) => `아웃라인 프리뷰 컴파일 (${args?.path ?? "활성"})`,
      run: (args: { path?: string; rootNodeId?: string }) => {
        const targetPath = args?.path?.trim() || activeOutlinePath(env);
        const base = readOutline(env, targetPath);
        if (!targetPath || !base) throw new Error("프리뷰할 .outline 파일이 없습니다.");
        const scanned = scanOutlineDirectives(base.rootNodes as OutlineSyntaxNode[]);
        const targetNodeId = args?.rootNodeId || scanned.find((d) => d.directive.kind === "doc")?.nodeId || scanned[0]?.nodeId;
        if (!targetNodeId) throw new Error("컴파일할 지시어 노드(<<doc:...>> / <<view:...>>)가 없습니다.");
        const res = compileOutlineTargetForPreview(env.vault, targetPath, base, targetNodeId);
        return {
          path: targetPath,
          targetNodeId,
          boundVDocPath: res.boundVDocPath,
          compiled: Boolean(res.doc),
          pages: res.doc?.pages.length ?? 0,
          blocks: res.doc ? res.doc.pages.reduce((n, p) => n + p.blocks.length, 0) : 0,
          slots: res.doc ? Object.keys(res.doc.slots).length : 0,
        };
      },
    },
    {
      ...clientTool("outline.compileDoc"),
      describe: (args: { docNodeId?: string }) => `<<doc>> 컴파일 · 바인딩 (${args?.docNodeId ?? "?"})`,
      run: (args: { path?: string; docNodeId?: string; open?: boolean }) => {
        const targetPath = args?.path?.trim() || activeOutlinePath(env);
        const base = readOutline(env, targetPath);
        if (!targetPath || !base) throw new Error("컴파일할 .outline 파일이 없습니다.");
        const docNodeId = String(args?.docNodeId ?? "").trim();
        if (!docNodeId) throw new Error("docNodeId(<<doc:…>> 노드 id)가 필요합니다.");

        const scanned = scanOutlineDirectives(base.rootNodes as OutlineSyntaxNode[]);
        const hit = scanned.find((d) => d.nodeId === docNodeId);
        if (!hit) {
          const pending = env.store
            .getState()
            .queue.some((c) => c.targetKind === "outline-patch" && JSON.stringify(c.payload).includes(docNodeId));
          throw new Error(
            pending
              ? `노드 ${docNodeId} 는 아직 승인 대기(Staged) 중입니다 — 사용자가 승인한 뒤 다시 부르세요.`
              : `노드 ${docNodeId} 가 ${targetPath} 에 없습니다. ol_map 으로 <<doc>> 노드 id 를 확인하세요.`
          );
        }
        if (hit.directive.kind !== "doc") throw new Error(`노드 ${docNodeId} 는 <<doc:…>> 가 아닙니다 (${hit.directive.rawToken}).`);

        const registry = loadVaultSyntaxRegistry(env.vault);
        const report = validateOutlineHierarchy(base.rootNodes as OutlineSyntaxNode[], docNodeId, registry);
        if (!report.ok) {
          return {
            compiled: false,
            reason: "계층 문법 오류 — 섹션 · 컨테이너를 먼저 세우도록 ol_propose_patch 로 고친 뒤 다시 부른다.",
            hierarchyIssues: report.issues.filter((i) => i.severity === "error"),
          };
        }

        const res = materializeVDocFromOutlineDirective(
          env.vault,
          targetPath,
          docNodeId,
          args?.open === false ? undefined : (p: string) => host.openPath(p)
        );
        if (!res) throw new Error("컴파일 결과가 없습니다 (읽기 전용 볼트이거나 지시어를 해석하지 못했습니다).");
        const doc = readVDoc(env, res.vdocPath);
        const vreport = doc ? validateVDocHierarchy(doc) : null;
        const iso = doc ? measureOutlineVDocIsomorphism(report, doc) : null;
        return {
          compiled: true,
          created: res.created,
          vdocPath: res.vdocPath,
          docId: doc?.docId ?? null,
          sections: report.sectionNodeIds.length,
          columnSections: report.columnSectionNodeIds.length,
          blocks: report.blockCount,
          citations: report.citationCount,
          evidenceLinks: doc?.evidenceLinks?.length ?? 0,
          isomorphism: iso ? { expected: iso.expected, matched: iso.matched, missingNodeIds: iso.missingNodeIds } : null,
          vdocIssues: vreport?.issues ?? [],
          warnings: report.issues.filter((i) => i.severity === "warning"),
        };
      },
    },
    {
      ...clientTool("backdata.list"),
      describe: () => "백데이터 목록",
      run: (args: { slotId?: string }) => {
        const { doc } = requireDoc(env);
        const chunks = args.slotId ? getSlotBackdata(doc, requireSlot(doc, args.slotId)) : Object.values(doc.backdata ?? {});
        return chunks.map((c) => ({ chunkId: c.chunkId, sourceTitle: c.sourceTitle, sourceType: c.sourceType, excerpt: clip(c.excerpt ?? "", 400) }));
      },
    },
    {
      ...clientTool("evidence.forSlot"),
      describe: (args: { slotId?: string }) => `칸 ${args.slotId} 근거 후보`,
      run: (args: { slotId: string }) => {
        const { doc } = requireDoc(env);
        const slot = requireSlot(doc, args.slotId);
        const direct = getSlotBackdata(doc, slot).map((c) => ({ tier: "direct", kind: "backdata", refId: c.chunkId, label: c.sourceTitle, excerpt: clip(c.excerpt ?? "", 300) }));
        const mount = env.store.getState();
        const pinned = [...mount.resourceFolders.map((f) => `볼트 폴더 ${f || "/"}`), ...mount.externalFolders.map((f) => `외부 폴더 ${f}`)].map((label) => ({
          tier: "inherited",
          kind: "resource",
          refId: label,
          label,
          excerpt: "리소스 작업 공간 — ws_* · read_file 로 찾는다",
        }));
        return [...direct, ...pinned];
      },
    },
    {
      ...clientTool("resources.read"),
      describe: (args: { sectorId?: string }) => `발췌 읽기 ${args.sectorId ?? ""}`,
      run: () => {
        throw new Error("v2 볼트에는 RM 발췌 섹터가 없다. 리소스 파일 원문은 read_file(Path, StartLine, EndLine) 로 읽으세요.");
      },
    },
    {
      ...clientTool("resource.cite"),
      describe: (args: { citations?: unknown[] }) => `원천 근거 ${Array.isArray(args?.citations) ? args.citations.length : 0}건 인용`,
      run: (args: { citations?: Array<{ resourceId: string; label?: string; lines?: [number, number]; snippet?: string }> }) => {
        const list = args.citations ?? [];
        return { ok: true, count: list.length, citations: list.map((c) => ({ resourceId: c.resourceId, title: c.label || c.resourceId, lines: c.lines, snippet: c.snippet ?? "" })) };
      },
    },
    {
      ...clientTool("resource.reveal"),
      describe: (args: { rawTag?: string }) => `리소스 페어 하이라이팅 (${clip(String(args?.rawTag ?? ""), 48)})`,
      run: (args: { rawTag: string }) => {
        const raw = String(args?.rawTag ?? "").trim();
        const normalized = /^<<\s*resource\s*:/i.test(raw) ? raw : `<<resource: ${raw}>>`;
        const parsed = parseResourceTag(normalized);
        if (!parsed) throw new Error(`유효하지 않은 리소스 태그입니다: ${raw}`);
        const opened = host.revealResource
          ? host.revealResource(normalized, env.activeTabPath() ?? undefined)
          : false;
        if (!opened && !parsed.isWebUrl && env.vault.exists(parsed.target)) {
          host.openPath(parsed.target);
        }
        return {
          ok: true,
          opened,
          target: parsed.target,
          isWebUrl: parsed.isWebUrl,
          page: parsed.page ?? null,
          lines: parsed.lines ?? null,
          bbox: parsed.bbox ?? null,
          nodeId: parsed.nodeId ?? null,
          slotId: parsed.slotId ?? null,
          blockId: parsed.blockId ?? null,
          quote: parsed.quote ?? null,
        };
      },
    },
    {
      ...clientTool("assets.search"),
      describe: (args: { query?: string; flowMode?: string }) =>
        `에셋 후보 검색 (${args?.query ? clip(args.query, 32) : args?.flowMode ?? "현재 문맥"})`,
      run: (args: { query?: string; flowMode?: AssetFlowMode | "all"; limit?: number }) => {
        const driver = getActiveAssetDriver();
        const catalogEntries = collectVaultAssets(env.vault, { schemaVersion: driver.version });
        const catalog = catalogEntries.map((e) => e.asset);
        const tab = env.activeTabPath();
        const doc = readVDoc(env, env.activeDocPath());
        const outline = tab ? readOutline(env, tab) : null;
        const contentSample = outline
          ? outline.rootNodes
            .flatMap((n) => [n.text, ...n.children.map((c) => c.text)])
            .join("\n")
            .slice(0, 1200)
          : doc
            ? Object.values(doc.slots)
              .slice(0, 16)
              .map((s) => slotPlainText(s.content))
              .join("\n")
              .slice(0, 1200)
            : "";
        const docView = doc ? resolveDocumentView(doc) : null;
        const buckets = rankAssetsForContext(catalog, driver, {
          activeSurface: outline ? "outline" : doc ? "vdoc" : "other",
          documentView: docView?.id === "blog" ? "blog" : docView?.id === "web" ? "web" : doc ? "a4" : null,
          contentSample,
          searchQuery: args?.query,
          flowModeFilter: args?.flowMode ?? "all",
        });
        const limit = Math.max(1, Math.min(10, Number(args?.limit ?? 5)));
        const merged = [...buckets.recommended, ...buckets.pinnedAndRecent, ...buckets.others].slice(0, limit);
        const items = merged.map((item) => {
          const sum = driver.summarizeForSelect(item.asset);
          return {
            assetId: item.asset.assetId,
            title: item.asset.title,
            assetKind: item.asset.assetKind,
            flowMode: sum.flowMode,
            badges: sum.badges,
            reasons: item.reasons,
            summary: item.asset.nuance.summary,
            fields: (item.asset.v2?.fields ?? []).map((f) => ({
              id: f.id,
              label: f.label,
              required: Boolean(f.required),
              evidenceHint: f.evidenceHint,
            })),
            agentPromptLine: sum.agentPromptLine,
          };
        });
        return {
          schemaVersion: driver.version,
          totalCatalogCount: catalog.length,
          contextSummary: buckets.contextSummary,
          lowConfidence: buckets.lowConfidence,
          candidates: items,
          aguiTokenHint:
            items.length > 0
              ? `<<agui:asset-picks: ${items.slice(0, 3).map((i) => i.assetId).join(",")}>>`
              : null,
        };
      },
    },
    {
      ...clientTool("assets.stagePreview"),
      describe: (args: { assetId?: string }) => `에셋 프리뷰 실행 (${args?.assetId ?? ""})`,
      run: (args: { assetId: string }) => {
        const id = String(args?.assetId ?? "").trim();
        if (!id) throw new Error("assetId 가 필요합니다.");
        const triggered = host.stageAssetPreview ? host.stageAssetPreview(id) : false;
        return { ok: triggered, assetId: id };
      },
    },
    {
      ...clientTool("references.list"),
      describe: () => "레퍼런스 목록",
      run: () =>
        listReferences(env).map((r) => ({
          refId: r.refId,
          number: r.number,
          title: r.title,
          kind: r.kind,
          pageCount: r.pageCount,
          enabled: r.enabled,
          layersOff: r.layersOff,
          pins: r.pins,
          vaultPath: r.path,
          library: Boolean(r.libraryRefId),
        })),
    },
    {
      ...clientTool("references.read"),
      describe: (args: { refId?: string }) => `레퍼런스 ${args.refId} 읽기`,
      run: (args: { refId: string; maxChars?: number }) => {
        const ref = listReferences(env).find((r) => r.refId === args.refId || r.path === args.refId || `ref:${r.refId}` === args.refId);
        if (!ref) throw new Error(`볼트에 없는 레퍼런스입니다: ${args.refId}`);
        const text = referenceText(env.vault, ref.path, args.maxChars ?? 8000);
        return { refId: ref.refId, vaultPath: ref.path, text, truncated: text.endsWith("…") };
      },
    },
    {
      ...clientTool("references.open"),
      describe: (args: { refId?: string }) => `레퍼런스 ${args.refId} 열기`,
      run: (args: { refId: string }) => {
        const ref = listReferences(env).find((r) => r.refId === args.refId || r.path === args.refId);
        if (!ref) throw new Error(`볼트에 없는 레퍼런스입니다: ${args.refId}`);
        host.openPath(ref.path);
        return { opened: ref.path };
      },
    },
    ...createAssetV3Tools(env, { clientTool, stage }),
    ...createStyleTools(env, { clientTool }),
  ];
  return withScopeGuards(env, host, tools);
}

// --- 범위 가드 (studio features/ai-workspace/model/scopeAi.ts 와 같은 규칙) ----------------------------------

const GUARDED = new Set(["slot.proposeContent", "slots.proposeBatch", "blocks.proposeProps", "canvas.selectSlot"]);
const READ_GUARDED = new Set(["slot.read", "backdata.list", "evidence.forSlot"]);

function withScopeGuards(env: V2AiEnv, host: V2ToolHost, tools: WorkspaceTool<any>[]): WorkspaceTool<any>[] {
  return tools.map((tool) => {
    if (GUARDED.has(tool.name)) {
      return {
        ...tool,
        run: (args: any, ctx: ToolRunContext) => {
          const doc = readVDoc(env, env.activeDocPath());
          const scope = doc ? toolScope(env, host, doc, ctx) : null;
          if (doc && scope) {
            if (scope.mode === "off") throw new Error("범위가 꺼져 있습니다 — 사용자가 문서를 이 대화에서 뺐다. 문서를 고치지 마라.");
            if (typeof args?.slotId === "string" && !scopeAllowsSlot(doc, scope, args.slotId)) throw outOfScope(`칸 ${args.slotId}`, scope);
            if (typeof args?.blockId === "string" && !scopeAllowsBlock(doc, scope, args.blockId)) throw outOfScope(`블록 ${args.blockId}`, scope);
            if (Array.isArray(args?.changes)) {
              const outside = args.changes.filter((c: { slotId?: string }) => c?.slotId && !scopeAllowsSlot(doc, scope, c.slotId));
              if (outside.length) {
                const inside = args.changes.filter((c: unknown) => !outside.includes(c));
                const skipped = outside.map((c: { slotId: string }) => ({ slotId: c.slotId, why: "범위 밖" }));
                if (!inside.length) throw outOfScope(`칸 ${outside.map((c: { slotId: string }) => c.slotId).join(", ")}`, scope);
                return Promise.resolve(tool.run({ ...args, changes: inside }, ctx)).then((res: any) => ({ ...res, skipped: [...(res?.skipped ?? []), ...skipped] }));
              }
            }
          }
          return tool.run(args, ctx);
        },
      };
    }
    if (READ_GUARDED.has(tool.name)) {
      return {
        ...tool,
        run: (args: any, ctx: ToolRunContext) => {
          const doc = readVDoc(env, env.activeDocPath());
          const scope = doc ? toolScope(env, host, doc, ctx) : null;
          if (doc && scope) {
            if (scope.mode === "off") throw new Error("범위가 꺼져 있습니다 — 문서를 읽지 않는다.");
            const hidden = (what: string) => new Error(`사용자가 뺀 페이지입니다: ${what} — 읽지도 고치지도 않는다.`);
            if (typeof args?.slotId === "string" && scopeHidesSlot(doc, scope, args.slotId)) throw hidden(`칸 ${args.slotId}`);
            if (typeof args?.blockId === "string" && scopeHidesBlock(doc, scope, args.blockId)) throw hidden(`블록 ${args.blockId}`);
          }
          return tool.run(args, ctx);
        },
      };
    }
    if (tool.name.startsWith("resources.")) {
      return {
        ...tool,
        run: (args: any, ctx: ToolRunContext) => {
          if (toolSourcesOff(env, host, ctx)) throw new Error("자료가 꺼져 있습니다 — 사용자가 Composer 설정바에서 참고 자료를 뺐다. 자료 없이 답하라.");
          return tool.run(args, ctx);
        },
      };
    }
    return tool;
  });
}
