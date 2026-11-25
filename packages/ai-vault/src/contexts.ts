import type { ContextProvider, ContextRef } from "@vibe/ai-kernel";
import { isRefPath, parseRefJson, type RefDocument } from "@vibe/ref-canvas/core";
import {
  basename,
  dirname,
  findOwningProjectPath,
  stripProjectFolderExt,
  type VaultPort,
} from "@vibe/vault-core";
import {
  findBlock,
  getBlockKind,
  getBlockSlotIds,
  slotPlainText,
  type LayoutBlock,
  type VDocDocument,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { isVDocPath, parseOutlineJson, parseVDocJson, type OutlineFilePayload, type VDocStore } from "@vibe/vault-formats";
import { isOutlinePath, fromVaultUri } from "@vibe/vault-formats";
import type { VDocUiBridgeStore } from "@vibe/canvas-state";
import {
  computeOutlineSubtreeHash,
  isRestricted,
  pageTitle,
  resolveOutlineScope,
  resolveScope,
  targetFromBlock,
  targetFromSlots,
  type ResolvedOutlineScope,
  type ResolvedScope,
  type ScopeTarget,
} from "@vibe/ai-scope";
import { collectOutlineResources, getLiveOutlineSession } from "@vibe/outline-sync";
import type { OutlineNode } from "@vibe/outliner/core";
import type { V2AiStore } from "./store";
import { imageVaultRef, isImageFilePath } from "./media";

/**
 * v2 AI 컨텍스트 — studio `features/ai-workspace/model/workspaceContexts.ts` 의 제공자를 볼트 모델로 옮긴 것.
 * 서버 계약(`workbench` · `resource-mount` · `reference` · `scope` 첨부)은 그대로, 출처만 볼트 파일이다.
 */
export const SCOPE_CONTEXT_KIND = "scope";
const clip = (text: string, n: number) => (text.length <= n ? text : `${text.slice(0, n - 1)}…`);
const stem = (path: string) => basename(path).replace(/\.vdoc(\.json)?$/i, "").replace(/\.[^.]+$/, "");

export interface V2AiEnv {
  readonly vault: VaultPort;
  readonly vaultId: string;
  /** 볼트 루트 절대 경로 (로컬 볼트). 메모리 볼트면 null — 리소스 마운트 · 서버 작업대가 볼트 파일을 못 본다 */
  readonly vaultRootPath: string | null;
  readonly vdocUiBridge: VDocUiBridgeStore;
  readonly store: V2AiStore;
  /** 지금 AI 가 보는 `.vdoc` (활성 탭, 다른 탭이면 마지막으로 본 `.vdoc`) */
  activeDocPath(): string | null;
  /** 지금 활성 탭 (`.md` 선택 등 — 문서 아닐 수 있다) */
  activeTabPath(): string | null;
  /** 에디터가 보고한 텍스트 선택 (`.md` · `.ref` · `.outline` 불릿) */
  textSelection(): { resourceId: string; text?: string; summary: string; nodeIds?: readonly string[] } | null;
  /** 탐색기에서 고른 파일 · 폴더 (여러 개 가능). */
  explorerSelection?(): readonly string[];
  /** 경로별 `.vdoc` 캐시 — 있으면 다시 파싱하지 않는다. */
  readonly docs?: VDocStore;
  /** API 베이스 URL (이미지 미리보기 · 업로드용). */
  readonly apiBaseUrl?: string;
  /** 로그 기록기. */
  readonly pushLog: (level: "info" | "ok" | "warn", message: string) => void;
  /**
   * 기준점 세션의 env 면 그 세션 키 (메인은 없음). 범위(`turn`) · 변경안 꼬리표가 이 값을 따른다.
   * 기준점 세션 env 는 화면(활성 탭 · 현재 선택)이 아니라 기준점을 본다.
   */
  readonly sessionKey?: string;
  /** 캔버스 "지금 선택" 대신 쓸 선택 (기준점 세션: 기준점 칸 · 블록). 없으면 화면 선택 */
  selectionFor?(path: string): { readonly slotIds: readonly string[]; readonly blockIds: readonly string[] } | null;
}

/** 이 env 의 이번 메시지 범위 (메인 = `turn`, 기준점 세션 = `turnBySession[key]`) */
export function envTurn(env: Pick<V2AiEnv, "store" | "sessionKey">): (ResolvedScope & { readonly path: string }) | null {
  const s = env.store.getState();
  return env.sessionKey ? s.turnBySession[env.sessionKey] ?? null : s.turn;
}

// --- 문서 읽기 ----------------------------------------------------------------------------

export function readVDoc(env: Pick<V2AiEnv, "vault"> & { readonly docs?: VDocStore }, path: string | null): VDocDocument | null {
  if (!path || !isVDocPath(path) || !env.vault.exists(path)) return null;
  if (env.vault.isLoaded && !env.vault.isLoaded(path)) return null;
  if (env.docs) return env.docs.get(path);
  try {
    return parseVDocJson(env.vault.read(path), stem(path));
  } catch {
    return null;
  }
}

export function requireDoc(env: V2AiEnv): { path: string; doc: VDocDocument } {
  const path = env.activeDocPath();
  const doc = readVDoc(env, path);
  if (!path || !doc) throw new Error("열린 .vdoc 문서가 없습니다. 탐색기에서 문서를 열어 주세요.");
  return { path, doc };
}

/** 현재 활성 `.outline` 경로: 활성 탭이 `.outline` 이면 그것, 아니면 활성 `.vdoc` 에 바인딩된 `.outline`. */
export function activeOutlinePath(env: Pick<V2AiEnv, "vault" | "activeTabPath" | "activeDocPath"> & { readonly docs?: VDocStore }): string | null {
  const tab = env.activeTabPath();
  if (tab && isOutlinePath(tab) && env.vault.exists(tab)) return tab;
  const doc = readVDoc(env, env.activeDocPath());
  const linked = doc?.outlineRef?.outlinePath ? (fromVaultUri(doc.outlineRef.outlinePath) ?? doc.outlineRef.outlinePath) : null;
  if (linked && env.vault.exists(linked)) return linked;
  return null;
}

/** `.outline` 읽기 — 열린 실시간 세션 스냅샷을 우선한다 (저장 전 편집분 포함). */
export function readOutline(env: Pick<V2AiEnv, "vault">, path: string | null): OutlineFilePayload | null {
  if (!path || !isOutlinePath(path) || !env.vault.exists(path)) return null;
  const live = getLiveOutlineSession(path);
  if (live) return live.getSnapshot();
  if (env.vault.isLoaded && !env.vault.isLoaded(path)) return null;
  try {
    return parseOutlineJson(env.vault.read(path), stem(path));
  } catch {
    return null;
  }
}

export function currentOutlineScope(env: V2AiEnv, path: string, payload?: OutlineFilePayload | null): ResolvedOutlineScope | null {
  const ol = payload ?? readOutline(env, path);
  if (!ol) return null;
  const s = env.store.getState();
  const sel = env.textSelection();
  const selectedNodeIds = sel?.resourceId === path && Array.isArray(sel.nodeIds) ? sel.nodeIds : [];
  return resolveOutlineScope(path, ol.rootNodes, s.outlineSettingFor(path), { selectedNodeIds }, s.scopeOn);
}

/** raw JSON 덤프 대신 모델 친화적인 압축 `.outline` 트리 지도를 생성한다. */
export function renderCompactOutlineMap(path: string, payload: OutlineFilePayload, maxDepth = 4): string {
  const bindings = payload.docBindings ?? {};
  const ev = payload.nodeEvidence ?? {};
  const lines: string[] = [`[.outline 압축 지도] ${path} · 제목=${payload.title} · 바인딩=${Object.keys(bindings).length}건`];
  const walk = (nodes: readonly OutlineNode[], depth: number) => {
    for (const n of nodes) {
      const badges: string[] = [];
      if (n.file?.target) badges.push(`file:${n.file.target}`);
      if (bindings[n.id]) badges.push(`doc:${bindings[n.id].vdocPath}`);
      if (ev[n.id]?.length) badges.push(`ev:${ev[n.id].length}`);
      if (n.children.length > 0 && depth >= maxDepth) badges.push(`+하위 ${n.children.length}`);
      const b = badges.length ? ` (${badges.join(", ")})` : "";
      lines.push(`${"  ".repeat(depth)}- [${n.id}] ${clip(n.text.replace(/\s+/g, " ").trim() || "(빈 불릿)", 80)}${b}`);
      if (n.children.length > 0 && depth < maxDepth) walk(n.children, depth + 1);
      if (lines.length >= 160) return;
    }
  };
  walk(payload.rootNodes, 0);
  return lines.join("\n");
}

export function outlineNodeRef(path: string, payload: OutlineFilePayload, node: OutlineNode): ContextRef {
  const baseHash = computeOutlineSubtreeHash(payload.rootNodes, [node.id]);
  return {
    kind: "outline-node",
    id: `${path}#${node.id}`,
    label: clip(node.text.trim() || node.id, 36),
    hint: `${basename(path)} · [${node.id}]${node.children.length ? ` · 하위 ${node.children.length}` : ""}`,
    content: [
      `[.outline 노드] ${path}#${node.id} · baseHash=${baseHash}`,
      node.text,
      node.note ? `note: ${clip(node.note, 400)}` : "",
      node.file?.target ? `file: ${node.file.target}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    access: "write",
    role: "target",
    meta: { path, nodeId: node.id, baseHash, entityKind: "node" },
  };
}

/** 활성 문서와 같은 프로젝트(`.vproj`) — 없으면 같은 폴더의 `.vdoc` 들. */
export function projectDocPaths(vault: VaultPort, activePath: string | null): string[] {
  if (!activePath) return [];
  const project = findOwningProjectPath(activePath);
  const folder = dirname(activePath);
  return vault
    .listAll()
    .filter((n) => n.kind === "file" && isVDocPath(n.path))
    .map((n) => n.path)
    .filter((p) => (project ? p.startsWith(`${project}/`) : dirname(p) === folder))
    .sort((a, b) => a.localeCompare(b));
}

export function projectLabel(activePath: string | null): string {
  if (!activePath) return "볼트";
  const project = findOwningProjectPath(activePath);
  return project ? stripProjectFolderExt(basename(project)) : dirname(activePath) || "볼트";
}

// --- 레퍼런스 (.ref) ------------------------------------------------------------------------

export interface V2ReferenceView {
  readonly path: string;
  readonly number: number;
  readonly title: string;
  /** 서버 레퍼런스 라이브러리 refId (`.ref` 의 `source.serverRefId`) — 있으면 wb_read · rf_* 가 원문을 본다 */
  readonly libraryRefId: string | null;
  readonly refId: string;
  readonly kind: string;
  readonly pageCount: number;
  readonly pins: number;
  readonly layersOff: string[];
  readonly enabled: boolean;
}

function readRef(vault: VaultPort, path: string): RefDocument | null {
  if (!vault.exists(path) || (vault.isLoaded && !vault.isLoaded(path))) return null;
  try {
    return parseRefJson(vault.read(path), stem(path));
  } catch {
    return null;
  }
}

/** 볼트의 모든 `.ref` (설정바 목록). 켠 것이 앞에 온다. 번호는 경로 순서로 고정. */
export function listReferences(env: Pick<V2AiEnv, "vault" | "store">): V2ReferenceView[] {
  const enabled = new Set(env.store.getState().referencePaths);
  const paths = env.vault
    .listAll()
    .filter((n) => n.kind === "file" && isRefPath(n.path))
    .map((n) => n.path)
    .sort((a, b) => a.localeCompare(b));
  return paths.map((path, i) => {
    const ref = readRef(env.vault, path);
    const frames = ref?.frames.length ?? 0;
    return {
      path,
      number: i + 1,
      title: ref?.title || stem(path),
      libraryRefId: ref?.source.serverRefId || null,
      refId: ref?.source.serverRefId || ref?.refId || path,
      kind: ref?.source.originType ?? "ref",
      pageCount: frames,
      pins: ref?.pins.length ?? 0,
      layersOff: Object.entries(ref?.enabledLayers ?? {})
        .filter(([, on]) => on === false)
        .map(([id]) => id),
      enabled: enabled.has(path),
    };
  });
}

export const activeReferences = (env: Pick<V2AiEnv, "vault" | "store">) => listReferences(env).filter((r) => r.enabled);

/** 레퍼런스 원문 (라이브러리에 없는 `.ref` — 서버가 못 읽으므로 앱이 블록 글을 싣는다). */
export function referenceText(vault: VaultPort, path: string, maxChars = 8000): string {
  const ref = readRef(vault, path);
  if (!ref) return "";
  const text = ref.blocks.map((b) => `[ref:${ref.refId}#blk:${b.id} · ${b.kind} · p${b.frameIndex}] ${b.text}`).join("\n");
  return clip(text, Math.max(500, Math.min(maxChars, 30000)));
}

// --- 첨부 만들기 (칸 · 블록 · 페이지 · 문서 · 파일) ----------------------------------------------

function pageOfBlock(doc: VDocDocument, blockId: string): VDocPage | undefined {
  return doc.pages.find((p) => p.blocks.some((b) => b.blockId === blockId));
}

export function slotRef(doc: VDocDocument, path: string, slot: VDocSlot): ContextRef {
  const page = doc.pages.find((p) => p.blocks.some((b) => getBlockSlotIds(b).includes(slot.slotId)));
  return {
    kind: "slot",
    id: slot.slotId,
    label: slot.label || slot.slotId,
    content: [
      `[칸] ${slot.label || slot.slotId} (slotId=${slot.slotId}${page ? ` · ${pageTitle(doc, page.pageId)}` : ""}${slot.constraints?.locked ? " · 잠김" : ""})`,
      slotPlainText(slot.content) || "(빈 칸)",
    ].join("\n"),
    hint: clip(slotPlainText(slot.content), 60) || "빈 칸",
    access: slot.constraints?.locked ? "read" : "write",
    meta: { docId: doc.docId, path, entityKind: "slot", pageId: page?.pageId },
  };
}

export function blockRef(doc: VDocDocument, path: string, page: VDocPage, block: LayoutBlock): ContextRef {
  const slots = getBlockSlotIds(block).map((id) => doc.slots[id]).filter(Boolean);
  const editable = Object.keys(getBlockKind(block.kind).ai?.editableProps ?? {});
  return {
    kind: "block",
    id: block.blockId,
    label: block.title || getBlockKind(block.kind).label || block.kind,
    content: [
      `[블록] ${block.blockId} (${block.kind}) · ${pageTitle(doc, page.pageId)}${block.title ? ` · ${block.title}` : ""}`,
      ...slots.map((s) => `- ${s.slotId} ${s.label}: ${clip(slotPlainText(s.content), 300) || "(빈 칸)"}`),
      editable.length ? `바꿀 수 있는 블록 속성: ${editable.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    hint: `${getBlockKind(block.kind).label ?? block.kind} · 칸 ${slots.length}`,
    access: "write",
    meta: { docId: doc.docId, path, entityKind: "block", pageId: page.pageId, slotIds: slots.map((s) => s.slotId) },
  };
}

/**
 * 캔버스에서 여러 개를 고른 것 (칸 · 블록 섞임) → 한 첨부. 범위 규칙은 studio `slot-range` 와 같다:
 * `slotIds` = 고른 칸, `unitIds` = 고른 블록 + 칸 전부 (범위가 이 단위들로 좁혀진다).
 */
export function selectionRangeRef(doc: VDocDocument, path: string, slotIds: string[], unitIds: string[]): ContextRef {
  const lines: string[] = [`[선택 ${unitIds.length}개] ${path}`];
  const labels: string[] = [];
  let writable = 0;
  for (const id of unitIds) {
    const slot = doc.slots[id];
    if (slot) {
      labels.push(slot.label || id);
      if (!slot.constraints?.locked) writable++;
      lines.push(`- 칸 ${id} ${slot.label || ""}${slot.constraints?.locked ? " (잠김)" : ""}: ${clip(slotPlainText(slot.content), 300) || "(빈 칸)"}`);
      continue;
    }
    const loc = findBlock(doc, id);
    if (!loc) continue;
    labels.push(loc.block.title || getBlockKind(loc.block.kind).label || loc.block.kind);
    if (!loc.block.locked) writable++;
    lines.push(`- 블록 ${id} (${loc.block.kind}) · ${pageTitle(doc, loc.pageId)}${loc.block.title ? ` · ${loc.block.title}` : ""}`);
    for (const sid of getBlockSlotIds(loc.block)) {
      const sl = doc.slots[sid];
      if (sl) lines.push(`  - ${sid} ${sl.label}: ${clip(slotPlainText(sl.content), 200) || "(빈 칸)"}`);
    }
  }
  return {
    kind: "slot-range",
    id: `range:${[...unitIds].sort().join("|")}`,
    label: `${unitIds.length}개 선택 · ${labels[0] ?? ""}${unitIds.length > 1 ? " …" : ""}`,
    hint: `${labels.slice(0, 6).join(", ")}${labels.length > 6 ? " …" : ""}`,
    content: lines.join("\n"),
    access: writable ? "write" : "read",
    meta: { docId: doc.docId, path, slotIds, unitIds, entityId: unitIds[0], entityKind: doc.slots[unitIds[0]] ? "slot" : "block" },
  };
}

/** 지금 캔버스 선택 → 칸 id · 단위 id (고른 순서). 표 하위 노드는 그 블록으로 친다. */
export function canvasSelectionUnits(env: Pick<V2AiEnv, "vdocUiBridge">, doc: VDocDocument, path: string): { slotIds: string[]; unitIds: string[] } {
  const slotIds: string[] = [];
  const unitIds: string[] = [];
  for (const item of env.vdocUiBridge.getState().getForPath(path).selection.items) {
    if (item.kind === "slot") {
      if (!doc.slots[item.id]) continue;
      slotIds.push(item.id);
      unitIds.push(item.id);
    } else {
      const bid = item.kind === "block" ? item.id : item.blockId;
      if (bid && findBlock(doc, bid) && !unitIds.includes(bid)) unitIds.push(bid);
    }
  }
  return { slotIds, unitIds };
}

export function pageRef(doc: VDocDocument, path: string, page: VDocPage): ContextRef {
  return {
    kind: "page",
    id: page.pageId,
    label: pageTitle(doc, page.pageId),
    content: `[페이지] ${pageTitle(doc, page.pageId)} (pageId=${page.pageId}) · 블록 ${page.blocks.length}`,
    access: "write",
    meta: { docId: doc.docId, path, entityKind: "page" },
  };
}

export function docRef(doc: VDocDocument, path: string): ContextRef {
  return {
    kind: "doc",
    id: doc.docId,
    label: doc.title || stem(path),
    content: `[문서] ${doc.title} (docId=${doc.docId}) · 볼트 파일 ${path} · ${doc.pages.length}쪽`,
    hint: path,
    access: "write",
    role: "target",
    meta: { docId: doc.docId, path, entityKind: "doc" },
  };
}

const TEXT_EXT = /\.(md|markdown|txt|outline|json|vsyntax|vstyle|csv|ya?ml|html?)$/i;

export function fileRef(path: string): ContextRef {
  return {
    kind: "file",
    id: path,
    label: basename(path),
    hint: dirname(path) || "볼트",
    access: "read",
    role: "reference",
    meta: { path, entityKind: "file" },
  };
}

function isHiddenVaultPath(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith("."));
}

/** 볼트 폴더 한 곳의 트리 요약 (파일 · 하위 폴더 수). */
export function describeFolder(vault: VaultPort, folderPath: string, limit = 40): { summary: string; fileCount: number; dirCount: number } {
  const prefix = folderPath ? `${folderPath}/` : "";
  const all = vault.listAll().filter((n) => !isHiddenVaultPath(n.path));
  const inside = folderPath ? all.filter((n) => n.path.startsWith(prefix)) : all;
  const files = inside.filter((n) => n.kind === "file");
  const dirs = inside.filter((n) => n.kind === "folder");
  const directDirs = dirs.filter((n) => (folderPath ? dirname(n.path) === folderPath : !n.path.includes("/")));
  const directFiles = files.filter((n) => (folderPath ? dirname(n.path) === folderPath : !n.path.includes("/")));
  const lines: string[] = [
    `[볼트 폴더] ${folderPath || "/ (볼트 전체)"} · 하위 폴더 ${dirs.length}개 · 파일 ${files.length}개`,
  ];
  if (directDirs.length) lines.push(`직속 폴더: ${directDirs.slice(0, 20).map((d) => basename(d.path) + "/").join(", ")}`);
  if (directFiles.length) lines.push(`직속 파일: ${directFiles.slice(0, limit).map((f) => basename(f.path)).join(", ")}${directFiles.length > limit ? ` 외 ${directFiles.length - limit}개` : ""}`);
  if (files.length > directFiles.length) {
    const nested = files.filter((f) => !directFiles.includes(f)).slice(0, 20);
    lines.push(`하위 파일 예시: ${nested.map((f) => f.path.slice(prefix.length)).join(", ")}`);
  }
  return { summary: lines.join("\n"), fileCount: files.length, dirCount: dirs.length };
}

/** 볼트 폴더 컨텍스트 — 기본은 참고자료(read/reference), 칩에서 `대상`으로 바꾸면 vf_* · dc_new 쓰기 범위로 지정된다.
 * 본문(`content`)은 보내기 직전 `folders` 제공자의 `resolve` 가 최신 폴더 트리와 역할에 맞춰 채운다.
 */
export function folderRef(env: Pick<V2AiEnv, "vault">, folderPath: string): ContextRef {
  const clean = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const info = describeFolder(env.vault, clean, 20);
  return {
    kind: "folder",
    id: `folder:${clean || "/"}`,
    label: clean ? basename(clean) : env.vault.name,
    hint: `${clean || "볼트 전체"} · 폴더 ${info.dirCount} · 파일 ${info.fileCount}`,
    access: "write",
    role: "reference",
    meta: { path: clean, entityKind: "folder" },
  };
}

// --- 범위 ------------------------------------------------------------------------------------

export function liveTarget(env: V2AiEnv, doc: VDocDocument, path: string): ScopeTarget | null {
  const pinned = env.selectionFor?.(path);
  if (pinned) {
    // 기준점 세션: 화면 선택이 아니라 기준점 칸 · 블록
    const slotIds = pinned.slotIds.filter((id) => doc.slots[id]);
    const unitIds = [...slotIds, ...pinned.blockIds.filter((id) => findBlock(doc, id))];
    if (unitIds.length > 1) return targetFromSlots(doc, slotIds, unitIds);
    if (slotIds[0]) return targetFromSlots(doc, [slotIds[0]]);
    if (unitIds[0]) return targetFromBlock(doc, unitIds[0]);
    return null;
  }
  const ui = env.vdocUiBridge.getState().getForPath(path);
  if (ui.selection.items.length > 1) {
    const { slotIds, unitIds } = canvasSelectionUnits(env, doc, path);
    if (unitIds.length > 1) return targetFromSlots(doc, slotIds, unitIds);
  }
  if (ui.selectedSlotId && doc.slots[ui.selectedSlotId]) return targetFromSlots(doc, [ui.selectedSlotId]);
  if (ui.selectedBlockId) return targetFromBlock(doc, ui.selectedBlockId);
  return null;
}

export function activePageId(env: V2AiEnv, doc: VDocDocument, path: string): string | null {
  return env.vdocUiBridge.getState().getForPath(path).activePageId ?? doc.pages[0]?.pageId ?? null;
}

/** 설정바 기준 지금 범위 (이번 메시지 @선택 반영 전). 범위를 껐으면 off. */
export function currentScope(env: V2AiEnv, doc: VDocDocument, path: string): ResolvedScope {
  const s = env.store.getState();
  if (!s.scopeOn) return { docId: doc.docId, mode: "off", label: "문서 끔", pageIds: new Set(), slotIds: new Set(), blockIds: new Set(), oneOff: false };
  return resolveScope(doc, s.settingFor(path), { target: liveTarget(env, doc, path), pageId: activePageId(env, doc, path) });
}

export function scopeContextRef(doc: VDocDocument, path: string, scope: ResolvedScope, pageId: string | null): ContextRef {
  const lines: string[] = [];
  if (scope.mode === "off") {
    lines.push("범위: 문서 끔 — 사용자가 문서를 이 대화에서 뺐다. 문서를 읽거나 고치지 말고, 문서 내용을 추측하지 마라. 문서 도구는 모두 거부된다.");
  } else if (!isRestricted(scope)) {
    lines.push("고칠 범위: 문서 전체", `docId: ${doc.docId}`, `title: ${doc.title}`, `볼트 파일: ${path}`, `pages: ${doc.pages.length}`);
    if (pageId) lines.push(`activePage: ${pageTitle(doc, pageId)}`);
  } else {
    lines.push(
      `고칠 범위: ${scope.label}`,
      scope.mode === "document"
        ? "바꾸는 것은 이 범위 안만 된다. 사용자가 뺀 페이지는 읽지도 고치지도 않는다 (문서 도구가 거부한다)."
        : "바꾸는 것은 이 범위 안만 된다 (밖을 바꾸는 변경안은 거부된다). 읽기는 문서 전체를 볼 수 있다 — 맥락 · 일관성 확인에 쓰고, 밖의 내용을 범위 안에 지어 넣지는 마라.",
      `docId: ${doc.docId}`,
      `페이지: ${[...(scope.pageIds ?? [])].map((p) => `${pageTitle(doc, p)} (${p})`).join(", ")}`
    );
    if (scope.slotIds) lines.push(`칸: ${[...scope.slotIds].slice(0, 60).map((s) => `${s} ${doc.slots[s]?.label ?? ""}`.trim()).join(" · ")}`);
  }
  if (scope.mode !== "off") lines.push("(구조는 document.getOutline 으로 읽는다 — 고칠 범위 밖은 [범위밖] 으로 표시된다)");
  if (scope.sourcesOff) lines.push("자료 끔: 사용자가 이번 대화에서 참고 자료(리소스)를 뺐다. 자료 도구를 쓰지 마라.");
  return {
    kind: SCOPE_CONTEXT_KIND,
    id: `scope:${doc.docId}`,
    label: scope.label,
    content: lines.join("\n"),
    hint: scope.oneOff ? "이번 메시지만 좁힌 범위 (프롬프트의 @선택)" : "설정바의 범위 — 매 메시지에 포함",
    access: "read",
    role: "reference",
    meta: { docId: doc.docId, path, scopeMode: scope.mode, oneOff: scope.oneOff, scope: serializeScope(scope) },
  };
}

interface SerializedScope {
  docId: string;
  mode: ResolvedScope["mode"];
  label: string;
  pageIds: string[] | null;
  slotIds: string[] | null;
  blockIds: string[] | null;
  oneOff: boolean;
  sourcesOff?: boolean;
}

export const serializeScope = (s: ResolvedScope): SerializedScope => ({
  docId: s.docId,
  mode: s.mode,
  label: s.label,
  pageIds: s.pageIds ? [...s.pageIds] : null,
  slotIds: s.slotIds ? [...s.slotIds] : null,
  blockIds: s.blockIds ? [...s.blockIds] : null,
  oneOff: s.oneOff,
  sourcesOff: s.sourcesOff,
});

export function deserializeScope(raw: unknown): ResolvedScope | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as SerializedScope;
  if (typeof s.docId !== "string") return null;
  const set = (v: string[] | null) => (Array.isArray(v) ? new Set(v) : null);
  return { docId: s.docId, mode: s.mode, label: s.label, pageIds: set(s.pageIds), slotIds: set(s.slotIds), blockIds: set(s.blockIds), oneOff: !!s.oneOff, sourcesOff: !!s.sourcesOff };
}

// --- 서버 첨부: 작업대 · 리소스 마운트 ------------------------------------------------------------

const joinAbs = (root: string, rel: string) => (rel ? `${root.replace(/[\\/]+$/, "")}/${rel}` : root.replace(/[\\/]+$/, ""));

/**
 * 작업대 상태 — 서버가 agy 의 wb_* · dc_* 도구에 넘긴다. 본문은 싣지 않는다 (서버가 볼트 파일을 직접 읽는다).
 * studio 와 같은 모양에 `vaultId` · `docVaultPath` · 문서별 `vaultPath` 를 더한다.
 */
export function workbenchPayload(env: V2AiEnv): Record<string, unknown> | null {
  const path = env.activeDocPath();
  const doc = readVDoc(env, path);
  const turn = envTurn(env);
  const scope = doc && path ? (turn && turn.path === path ? turn : currentScope(env, doc, path)) : null;
  const ui = path ? env.vdocUiBridge.getState().getForPath(path) : null;
  const pinnedSelection = path && env.selectionFor ? env.selectionFor(path) : null;
  const references = activeReferences(env)
    .filter((r) => r.libraryRefId)
    .map((r) => ({ refId: r.libraryRefId, title: r.title, pinIds: null, layers: Object.fromEntries(r.layersOff.map((id) => [id, false])) }));
  const projectDocs = projectDocPaths(env.vault, path).map((p) => {
    const d = readVDoc(env, p);
    return {
      docId: d?.docId ?? `vault:${p}`,
      title: d?.title || stem(p),
      surface: d?.surface?.kind ?? "paged",
      pages: d?.pages.length ?? 0,
      blocks: d ? d.pages.reduce((n, pg) => n + pg.blocks.length, 0) : 0,
      vaultPath: p,
    };
  });
  const outlinePath = activeOutlinePath(env);
  const outlinePayload = readOutline(env, outlinePath);
  const outlineScope = outlinePath && outlinePayload ? currentOutlineScope(env, outlinePath, outlinePayload) : null;
  const sel = env.textSelection();
  const selectedOutlineNodeIds =
    outlinePath && sel?.resourceId === outlinePath && Array.isArray(sel.nodeIds) ? [...sel.nodeIds] : [];
  const activeStagedChanges = env.store
    .getState()
    .queue.filter((c) => {
      const sameTarget = (path && c.path === path) || (outlinePath && c.path === outlinePath);
      if (!sameTarget) return false;
      return env.sessionKey ? c.sessionKey === env.sessionKey : !c.sessionKey;
    })
    .slice(-12)
    .map((c) => ({
      diffId: c.diffId,
      targetKind: c.targetKind,
      title: c.title,
      ...(c.targetKind === "asset-blocks"
        ? {
            assetId: c.payload.assetId,
            mode: c.payload.mode,
            targetBlockIds:
              c.payload.mode === "replace"
                ? (c.payload.replaceBlockIds ?? [])
                : c.payload.anchorBlockId
                  ? [c.payload.anchorBlockId]
                  : [],
            report: c.payload.report,
          }
        : { targetId: c.targetId }),
    }));

  if (!doc && !outlinePayload && references.length === 0 && projectDocs.length === 0 && !env.vaultRootPath) return null;
  return {
    vaultId: env.vaultId,
    // 화면의 RW/RO — 서버의 에이전트 쓰기(dc_* · rs_* · vf_* · ol_*)와 웹 검색 게이트가 따른다
    readOnly: Boolean(env.vault.isReadOnly?.()),
    projectId: projectLabel(path ?? outlinePath),
    docId: doc?.docId ?? null,
    docVaultPath: path,
    activeOutlinePath: outlinePath,
    selectedOutlineNodeIds,
    outlineScope: outlineScope
      ? {
          mode: outlineScope.mode,
          label: outlineScope.label,
          rootNodeIds: [...outlineScope.rootNodeIds],
          allowedNodeIds: outlineScope.allowedNodeIds ? [...outlineScope.allowedNodeIds] : null,
        }
      : null,
    draftFolder: (path ?? outlinePath) ? dirname((path ?? outlinePath)!) : "AI Drafts",
    projectDocs,
    scope: scope
      ? {
        mode: scope.mode === "off" ? "off" : scope.mode,
        label: scope.label,
        pageIds: scope.pageIds ? [...scope.pageIds] : undefined,
        slotIds: scope.slotIds ? [...scope.slotIds] : undefined,
      }
      : { mode: "off" },
    // 고른 칸 (여러 개 가능) · 고른 블록 — 서버 작업대 지도가 "지금 선택"으로 보여 준다
    selection: pinnedSelection
      ? [...pinnedSelection.slotIds]
      : ui && ui.selection.items.length > 1
        ? ui.selection.items.filter((i) => i.kind === "slot").map((i) => i.id)
        : [ui?.selectedSlotId].filter((x): x is string => Boolean(x)),
    selectionBlocks: pinnedSelection
      ? [...pinnedSelection.blockIds]
      : ui
        ? ui.selection.items.filter((i) => i.kind === "block").map((i) => i.id)
        : [],
    stagedChanges: activeStagedChanges,
    references,
  };
}

/** 고른 볼트 폴더 · 외부 폴더(+ 이번 턴 명시 `@폴더`) → studio `resource-mount` 와 같은 페이로드. */
export function resourceMountPayload(
  env: V2AiEnv,
  extraVaultFolders: readonly string[] = []
): { roots: Array<{ id: string; path: string; title: string; kind: "dir" }>; label: string } | null {
  const s = env.store.getState();
  const roots: Array<{ id: string; path: string; title: string; kind: "dir" }> = [];
  const seen = new Set<string>();
  const addVaultFolder = (rel: string) => {
    if (!env.vaultRootPath) return;
    const clean = rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (clean && !env.vault.exists(clean)) return;
    const id = `vault:${clean || "/"}`;
    if (seen.has(id)) return;
    seen.add(id);
    roots.push({ id, path: joinAbs(env.vaultRootPath, clean), title: clean ? basename(clean) : env.vault.name, kind: "dir" });
  };
  if (s.sourcesOn) {
    for (const rel of s.resourceFolders) addVaultFolder(rel);
    for (const abs of s.externalFolders) {
      const id = `ext:${abs}`;
      if (seen.has(id)) continue;
      seen.add(id);
      roots.push({ id, path: abs, title: basename(abs.replace(/\\/g, "/")) || abs, kind: "dir" });
    }
  }
  for (const rel of extraVaultFolders) addVaultFolder(rel);
  if (roots.length === 0) return null;
  const names = roots.map((r) => r.title);
  return { roots, label: `${names.slice(0, 2).join(" · ")}${names.length > 2 ? ` 외 ${names.length - 2}곳` : ""}` };
}

// --- 제공자 -----------------------------------------------------------------------------------

function fuzzyIncludes(haystack: string, needle: string): boolean {
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  let hi = 0;
  for (let ni = 0; ni < needle.length; ni++) {
    const idx = haystack.indexOf(needle[ni], hi);
    if (idx < 0) return false;
    hi = idx + 1;
  }
  return true;
}

function parseCategoryQuery(query: string): { category: string | null; term: string } {
  const trimmed = query.trim().toLowerCase();
  const m = /^(folder|dir|폴더|file|파일|doc|문서|ref|참조|img|image|이미지):(.*)$/.exec(trimmed);
  if (!m) return { category: null, term: trimmed };
  const raw = m[1];
  const category =
    raw === "folder" || raw === "dir" || raw === "폴더"
      ? "folder"
      : raw === "file" || raw === "파일"
        ? "file"
        : raw === "doc" || raw === "문서"
          ? "doc"
          : raw === "ref" || raw === "참조"
            ? "ref"
            : "image";
  return { category, term: m[2].trim() };
}

function matches(query: string, ...fields: string[]): boolean {
  const { term } = parseCategoryQuery(query);
  if (!term) return true;
  return fields.some((f) => fuzzyIncludes(f.toLowerCase(), term));
}

function categoryAllowed(query: string, kind: "folder" | "file" | "doc" | "ref" | "image" | "other"): boolean {
  const { category } = parseCategoryQuery(query);
  return !category || category === kind;
}

export function createV2ContextProviders(env: V2AiEnv): ContextProvider[] {
  const active = () => {
    const path = env.activeDocPath();
    const doc = readVDoc(env, path);
    return path && doc ? { path, doc } : null;
  };
  return [
    {
      id: "workbench",
      label: "작업대",
      auto: true,
      current: () => {
        const payload = workbenchPayload(env);
        if (!payload) return [];
        const a = active();
        return [
          {
            kind: "workbench",
            id: "wb:state",
            label: "작업대",
            content: JSON.stringify(payload),
            hint: `${a?.doc.title ?? "문서 없음"} · 문서 ${(payload.projectDocs as unknown[]).length} · 레퍼런스 ${(payload.references as unknown[]).length}`,
            access: "read",
            role: "reference",
          },
        ];
      },
    },
    {
      id: "references",
      label: "레퍼런스",
      auto: true,
      current: () =>
        activeReferences(env).map((r) => {
          const sections = [
            `[레퍼런스 ${r.number}] ${r.title} — ${r.libraryRefId ? `ref:${r.libraryRefId}` : `볼트 파일 ${r.path}`} (${r.kind}${r.pageCount ? ` · ${r.pageCount}쪽` : ""})`,
            "남이 비슷한 문제를 풀며 내린 결정의 궤적이다. 층위별 패턴만 옮기고, 문장 · 고유명사 · 수치는 내 문서로 가져오지 않는다." +
            (r.libraryRefId ? ` 원문은 wb_read(ref:${r.libraryRefId}…) 로 읽는다.` : " 원문은 references.read 로 읽는다."),
          ];
          if (r.layersOff.length) sections.push(`따르지 않을 층위: ${r.layersOff.join(", ")}`);
          return {
            kind: "reference",
            id: `ref:${r.refId}`,
            label: `참조${r.number}: ${r.title}`,
            content: sections.join("\n"),
            hint: r.pins ? `핀 ${r.pins}건` : "패턴 참고",
            access: "read",
            role: "reference",
            meta: { path: r.path, entityKind: "reference" },
          } satisfies ContextRef;
        }),
      search: (q) =>
        !categoryAllowed(q, "ref")
          ? []
          : listReferences(env)
            .filter((r) => matches(q, r.title, r.path))
            .slice(0, 8)
            .map((r) => ({
              kind: "reference",
              id: `ref:${r.refId}`,
              label: r.title,
              content: r.libraryRefId ? `[레퍼런스] ${r.title} — ref:${r.libraryRefId} (원문은 wb_read)` : `[레퍼런스] ${r.title}\n${referenceText(env.vault, r.path, 6000)}`,
              hint: `${r.kind}${r.pageCount ? ` · ${r.pageCount}쪽` : ""}`,
              access: "read",
              role: "reference",
              meta: { path: r.path, entityKind: "reference" },
            })),
    },
    {
      id: "resources",
      label: "리소스",
      auto: true,
      current: () => {
        const s = env.store.getState();
        if (!s.sourcesOn) return [];
        const mount = resourceMountPayload(env);
        if (!mount) return [];
        return [
          {
            kind: "resource-mount",
            id: "rm:checked-resources",
            label: mount.label,
            content: JSON.stringify({ roots: mount.roots, files: [], idMap: {}, items: mount.roots }),
            hint: `고른 폴더 ${mount.roots.length}곳 — AI 가 직접 찾아 읽음`,
            access: "read",
            role: "reference",
          },
        ];
      },
    },
    {
      id: "ai-scope",
      label: "작업 범위",
      auto: true,
      current: () => {
        const a = active();
        if (!a) return [];
        const scope = { ...currentScope(env, a.doc, a.path), sourcesOff: !env.store.getState().sourcesOn };
        return [scopeContextRef(a.doc, a.path, scope, activePageId(env, a.doc, a.path))];
      },
    },
    {
      // 캔버스 · 텍스트 선택은 자동으로 붙이지 않는다 — "첨부 제안"으로만 (studio 와 같다)
      id: "selection",
      label: "현재 선택",
      suggest: true,
      current: () => {
        const a = active();
        const tab = env.activeTabPath();
        if (a && tab === a.path) {
          const ui = env.vdocUiBridge.getState().getForPath(a.path);
          if (ui.selection.items.length > 1) {
            const { slotIds, unitIds } = canvasSelectionUnits(env, a.doc, a.path);
            if (unitIds.length > 1) return [selectionRangeRef(a.doc, a.path, slotIds, unitIds)];
          }
          if (ui.selectedSlotId && a.doc.slots[ui.selectedSlotId]) return [slotRef(a.doc, a.path, a.doc.slots[ui.selectedSlotId])];
          const loc = ui.selectedBlockId ? findBlock(a.doc, ui.selectedBlockId) : null;
          const page = loc ? a.doc.pages.find((p) => p.pageId === loc.pageId) : undefined;
          return loc && page ? [blockRef(a.doc, a.path, page, loc.block)] : [];
        }
        const sel = env.textSelection();
        if (sel?.text && sel.resourceId === tab) {
          if (tab && isOutlinePath(tab) && Array.isArray(sel.nodeIds) && sel.nodeIds.length > 0) {
            const ol = readOutline(env, tab);
            const baseHash = ol ? computeOutlineSubtreeHash(ol.rootNodes, sel.nodeIds) : "";
            return [
              {
                kind: "outline-node",
                id: `${tab}#${sel.nodeIds.join(",")}`,
                label: sel.summary,
                hint: `${basename(tab)} · 선택 불릿 ${sel.nodeIds.length}개`,
                content: `[.outline 선택 불릿] ${tab} (nodeIds=${sel.nodeIds.join(", ")}${baseHash ? ` · baseHash=${baseHash}` : ""})\n${clip(sel.text, 6000)}`,
                access: "write",
                role: "target",
                meta: { path: tab, nodeIds: [...sel.nodeIds], baseHash, entityKind: "node" },
              },
            ];
          }
          return [{ kind: "text-selection", id: `sel:${sel.resourceId}`, label: sel.summary, content: `[선택한 글] ${sel.summary}\n${clip(sel.text, 6000)}`, access: "read", role: "reference", meta: { path: sel.resourceId } }];
        }
        return [];
      },
    },
    {
      // `.outline` 에 첨부·링크된 순수 리소스(문서 파일 제외)를 자동 강제 마운트하지 않고 제안 칩으로만 노출 (`sourcesOn` 준수)
      id: "outline-linked-resources",
      label: "아웃라인 연결 리소스",
      suggest: true,
      current: () => {
        if (!env.store.getState().sourcesOn) return [];
        const olPath = activeOutlinePath(env);
        const ol = readOutline(env, olPath);
        if (!olPath || !ol) return [];
        const collected = collectOutlineResources(env.vault, olPath, ol.rootNodes, ol.nodeEvidence);
        return collected.items.slice(0, 6).map((item) => {
          if (item.kind === "folder") return folderRef(env, item.path);
          if (isImageFilePath(item.path)) return imageVaultRef(env, item.path);
          return fileRef(item.path);
        });
      },
    },
    {
      // 탐색기에서 여러 개 고르면 그 파일 · 폴더들을 첨부 후보로 (자동으로 붙이지는 않는다)
      id: "explorer-selection",
      label: "탐색기에서 고른 항목",
      suggest: true,
      current: () => {
        const paths = env.explorerSelection?.() ?? [];
        if (paths.length < 2) return [];
        const refs: ContextRef[] = [];
        for (const p of paths.slice(0, 12)) {
          const node = env.vault.getNode(p);
          if (!node) continue;
          if (node.kind === "folder") {
            refs.push(folderRef(env, p));
            continue;
          }
          if (isImageFilePath(p)) {
            refs.push(imageVaultRef(env, p));
            continue;
          }
          const doc = isVDocPath(p) ? readVDoc(env, p) : null;
          refs.push(doc ? docRef(doc, p) : fileRef(p));
        }
        return refs;
      },
    },
    {
      id: "folders",
      label: "볼트 폴더",
      search: (q) => {
        if (!categoryAllowed(q, "folder")) return [];
        const folders = env.vault
          .listAll()
          .filter((n) => n.kind === "folder" && !isHiddenVaultPath(n.path))
          .map((n) => n.path)
          .sort((a, b) => a.localeCompare(b));
        const hits: ContextRef[] = [];
        if (matches(q, "볼트 전체", env.vault.name, "root", "/")) {
          hits.push(folderRef(env, ""));
        }
        for (const fp of folders) {
          if (matches(q, fp, basename(fp))) hits.push(folderRef(env, fp));
          if (hits.length >= 12) break;
        }
        return hits;
      },
      resolve: (ref) => {
        if (ref.kind !== "folder" || typeof ref.meta?.path !== "string") return ref;
        const p = ref.meta.path;
        const info = describeFolder(env.vault, p, 40);
        const roleNote =
          ref.role === "target"
            ? "\n[역할: 대상 폴더 — 새 파일·폴더 생성 및 vf_* 정리 작업의 허용 쓰기 범위]"
            : "\n[역할: 참조 폴더 — ws_tree · ws_glob · read_file · vf_stat 로 탐색 가능]";
        return { ...ref, content: `${info.summary}${roleNote}` };
      },
    },
    {
      id: "documents",
      label: "문서",
      search: (q) =>
        !categoryAllowed(q, "doc")
          ? []
          : env.vault
            .listAll()
            .filter((n) => n.kind === "file" && isVDocPath(n.path) && matches(q, n.path))
            .slice(0, 8)
            .map((n) => {
              const d = readVDoc(env, n.path);
              return d ? docRef(d, n.path) : { ...fileRef(n.path), kind: "doc", id: `vault:${n.path}`, role: "target" as const };
            }),
    },
    {
      id: "images",
      label: "볼트 이미지",
      search: (q) =>
        !categoryAllowed(q, "image")
          ? []
          : env.vault
            .listAll()
            .filter((n) => n.kind === "file" && !isHiddenVaultPath(n.path) && isImageFilePath(n.path) && matches(q, n.path, basename(n.path)))
            .slice(0, 8)
            .map((n) => imageVaultRef(env, n.path)),
    },
    {
      id: "files",
      label: "볼트 파일",
      search: (q) =>
        !categoryAllowed(q, "file")
          ? []
          : env.vault
            .listAll()
            .filter((n) => n.kind === "file" && !isHiddenVaultPath(n.path) && TEXT_EXT.test(n.path) && !isVDocPath(n.path) && !isRefPath(n.path) && matches(q, n.path))
            .slice(0, 8)
            .map((n) => fileRef(n.path)),
      resolve: (ref) => {
        if (ref.kind !== "file" || typeof ref.meta?.path !== "string") return ref;
        const p = ref.meta.path;
        if (isOutlinePath(p)) {
          const ol = readOutline(env, p);
          if (ol) return { ...ref, content: renderCompactOutlineMap(p, ol, 5) };
        }
        let body = "";
        try {
          body = env.vault.exists(p) ? env.vault.read(p) : "";
        } catch {
          body = "";
        }
        return { ...ref, content: `[볼트 파일] ${p}\n${clip(body, 16000) || "(읽지 못했거나 아직 내려받지 않은 파일)"}` };
      },
    },
    {
      id: "outline-nodes",
      label: "아웃라인 불릿",
      search: (q) => {
        if (!categoryAllowed(q, "other")) return [];
        const olPath = activeOutlinePath(env);
        const ol = readOutline(env, olPath);
        if (!olPath || !ol) return [];
        const hits: ContextRef[] = [];
        const walk = (nodes: readonly OutlineNode[]) => {
          for (const n of nodes) {
            if (hits.length >= 10) return;
            if (matches(q, n.text, n.id, n.note ?? "")) hits.push(outlineNodeRef(olPath, ol, n));
            if (n.children.length > 0) walk(n.children);
          }
        };
        walk(ol.rootNodes);
        return hits;
      },
    },
    {
      id: "slots",
      label: "슬롯",
      search: (q) => {
        if (!categoryAllowed(q, "other")) return [];
        const a = active();
        if (!a) return [];
        return Object.values(a.doc.slots)
          .filter((s) => matches(q, s.label ?? "", s.slotId))
          .slice(0, 10)
          .map((s) => slotRef(a.doc, a.path, s));
      },
    },
    {
      id: "blocks",
      label: "블록",
      search: (q) => {
        if (!categoryAllowed(q, "other")) return [];
        const a = active();
        if (!a) return [];
        const out: ContextRef[] = [];
        for (const page of a.doc.pages) {
          for (const block of page.blocks) {
            if (matches(q, block.title ?? "", block.blockId, block.kind)) out.push(blockRef(a.doc, a.path, page, block));
            if (out.length >= 8) return out;
          }
        }
        return out;
      },
    },
    {
      id: "pages",
      label: "페이지",
      search: (q) => {
        if (!categoryAllowed(q, "other")) return [];
        const a = active();
        if (!a) return [];
        return a.doc.pages
          .filter((p) => matches(q, p.pageLabel ?? "", p.pageId))
          .slice(0, 6)
          .map((p) => pageRef(a.doc, a.path, p));
      },
    },
    {
      // 칩(슬롯 · 블록)은 가볍게 들고 있다가 보내기 직전에 최신 본문으로 다시 채운다
      id: "workspace-elements",
      label: "워크스페이스 요소",
      resolve: (ref) => {
        const path = typeof ref.meta?.path === "string" ? ref.meta.path : null;
        const doc = readVDoc(env, path);
        if (!doc || !path) return ref;
        if (ref.kind === "slot" && doc.slots[ref.id]) return { ...ref, content: slotRef(doc, path, doc.slots[ref.id]).content };
        if (ref.kind === "block") {
          const page = pageOfBlock(doc, ref.id);
          const block = page?.blocks.find((b) => b.blockId === ref.id);
          if (page && block) return { ...ref, content: blockRef(doc, path, page, block).content };
        }
        return ref;
      },
    },
  ];
}
