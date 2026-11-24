import { anchorLabel, type AnchorSurface, type ContextRef, type SessionAnchor } from "@vibe/ai-kernel";
import { computeOutlineSubtreeHash } from "@vibe/ai-scope";
import type { FileExplorerStore } from "@vibe/file-explorer/core";
import { getLiveOutlineSession, requestOutlineReveal, watchLiveOutline } from "@vibe/outline-sync";
import type { OutlineNode } from "@vibe/outliner/core";
import { basename, dirname, type VaultEvent } from "@vibe/vault-core";
import { fromVaultUri, isOutlinePath, isVDocPath } from "@vibe/vault-formats";
import { findBlock, getBlockSlotIds, type VDocDocument } from "@vibe/vdoc-schema";

import {
  blockRef,
  canvasSelectionUnits,
  docRef,
  fileRef,
  folderRef,
  readOutline,
  readVDoc,
  selectionRangeRef,
  slotRef,
  type V2AiEnv,
} from "./contexts";
import { imageVaultRef, isImageFilePath } from "./media";

/**
 * v2 화면별 기준점 어댑터 — 다중 선택 + 인라인 AI 가 있는 화면 하나에 하나.
 * 새 화면은 여기 어댑터를 하나 더한다 (커널 · 레지스트리 · UI 는 그대로).
 */

export const OUTLINE_SURFACE = "outline";
export const VDOC_SURFACE = "vdoc";
export const EXPLORER_SURFACE = "explorer";

export interface V2AnchorSurfaceDeps {
  /** 메인 env (화면의 지금 선택을 읽는다) */
  readonly env: V2AiEnv;
  /** 에디터가 보고한 지금 선택 (아웃라인 불릿 id 포함) */
  readonly editorSelection: () => { readonly resourceId: string; readonly kind: string; readonly nodeIds?: readonly string[] } | null;
  readonly openVaultFile: (path: string, mode?: "current" | "new-tab" | "split-right") => void;
  readonly explorer?: FileExplorerStore;
}

const clip = (text: string, n: number) => (text.length <= n ? text : `${text.slice(0, n - 1)}…`);

/** 볼트 이벤트가 이 경로들에 닿는가 */
export function eventTouches(ev: VaultEvent, paths: readonly string[]): boolean {
  if (ev.type === "vault-reset") return true;
  const hit = (p: string) => paths.some((x) => x === p || x.startsWith(`${p}/`));
  if (ev.type === "create") return hit(ev.node.path);
  if (ev.type === "modify") return hit(ev.path);
  if (ev.type === "delete") return hit(ev.path) || ev.affectedPaths.some((p) => paths.includes(p));
  if (ev.type === "rename") return hit(ev.oldPath) || hit(ev.newPath);
  return false;
}

function indexOutline(roots: readonly OutlineNode[]): Map<string, OutlineNode> {
  const map = new Map<string, OutlineNode>();
  const walk = (nodes: readonly OutlineNode[]) => {
    for (const n of nodes) {
      map.set(n.id, n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(roots);
  return map;
}

/** 아웃라인 기준점 → 묶인 `.vdoc` (아웃라인의 문서 바인딩) */
export function boundVDocOfOutline(env: Pick<V2AiEnv, "vault">, outlinePath: string): string | null {
  const ol = readOutline(env, outlinePath);
  for (const binding of Object.values(ol?.docBindings ?? {})) {
    const p = binding?.vdocPath ? fromVaultUri(binding.vdocPath) ?? binding.vdocPath : null;
    if (p && env.vault.exists(p)) return p;
  }
  return null;
}

/** 볼트 경로 하나 → 첨부 (`.vdoc` = @문서, 폴더 = @폴더, 이미지 = @이미지, 그 밖 = @파일) */
export function pathContext(env: V2AiEnv, path: string): ContextRef | null {
  if (!env.vault.exists(path)) return null;
  const node = env.vault.getNode(path);
  if (node?.kind === "folder") return folderRef(env, path);
  const doc = readVDoc(env, path);
  if (doc) return docRef(doc, path);
  if (isVDocPath(path)) return null;
  if (node?.kind === "file" && isImageFilePath(path)) return imageVaultRef(env, path);
  return node?.kind === "file" ? fileRef(path) : null;
}

/** vdoc 기준점 항목 → 칸 · 블록으로 나누기 */
export function splitVDocItems(doc: VDocDocument, itemIds: readonly string[]): { slotIds: string[]; blockIds: string[] } {
  const slotIds: string[] = [];
  const blockIds: string[] = [];
  for (const id of itemIds) {
    if (doc.slots[id]) slotIds.push(id);
    else if (findBlock(doc, id)) blockIds.push(id);
  }
  return { slotIds, blockIds };
}

export function outlineAnchorContext(env: V2AiEnv, anchor: SessionAnchor): ContextRef | null {
  const payload = readOutline(env, anchor.path);
  if (!payload) return null;
  const index = indexOutline(payload.rootNodes);
  const nodes = anchor.itemIds.map((id) => index.get(id)).filter((n): n is OutlineNode => Boolean(n));
  if (!nodes.length) return null;
  const ids = nodes.map((n) => n.id);
  const baseHash = computeOutlineSubtreeHash(payload.rootNodes, ids);
  const lines: string[] = [];
  const walk = (node: OutlineNode, depth: number) => {
    lines.push(`${"  ".repeat(depth)}- [${node.id}] ${node.text.replace(/\s+/g, " ").trim() || "(빈 불릿)"}`);
    if (node.note) lines.push(`${"  ".repeat(depth + 1)}note: ${clip(node.note, 300)}`);
    if (depth < 2) node.children.forEach((c) => walk(c, depth + 1));
  };
  nodes.forEach((n) => walk(n, 0));
  const first = nodes[0].text.trim() || nodes[0].id;
  return {
    kind: "outline-node",
    id: `${anchor.path}#${ids.join(",")}`,
    label: nodes.length === 1 ? clip(first, 36) : `${clip(first, 24)} 외 ${nodes.length - 1}개`,
    hint: `${basename(anchor.path)} · 선택 불릿 ${nodes.length}개`,
    content: `[.outline 선택 불릿] ${anchor.path} (nodeIds=${ids.join(", ")} · baseHash=${baseHash})\n${clip(lines.join("\n"), 6000)}`,
    access: "write",
    role: "target",
    meta: { path: anchor.path, nodeIds: ids, baseHash, entityKind: "node" },
  };
}

export function createOutlineSurface(deps: V2AnchorSurfaceDeps): AnchorSurface {
  const { env } = deps;
  return {
    id: OUTLINE_SURFACE,
    current() {
      const sel = deps.editorSelection();
      if (!sel || sel.kind !== "outline-nodes" || !isOutlinePath(sel.resourceId) || !sel.nodeIds?.length) return null;
      return {
        surface: OUTLINE_SURFACE,
        path: sel.resourceId,
        itemIds: [...sel.nodeIds],
        label: anchorLabel(sel.resourceId, sel.nodeIds.length, "불릿"),
      };
    },
    missing(anchor) {
      if (!env.vault.exists(anchor.path)) return [...anchor.itemIds];
      const payload = readOutline(env, anchor.path);
      if (!payload) return []; // 아직 읽지 않은 파일 (지연 로딩) — 모른다 ≠ 지워졌다
      const index = indexOutline(payload.rootNodes);
      return anchor.itemIds.filter((id) => !index.has(id));
    },
    isCompleted(anchor) {
      const payload = readOutline(env, anchor.path);
      if (!payload) return false;
      const index = indexOutline(payload.rootNodes);
      const present = anchor.itemIds.map((id) => index.get(id)).filter((n): n is OutlineNode => Boolean(n));
      return present.length > 0 && present.every((n) => Boolean(n.isCompleted));
    },
    toContexts(anchor) {
      const ref = outlineAnchorContext(env, anchor);
      return ref ? [ref] : [];
    },
    watch(anchor, onChange) {
      const offLive = watchLiveOutline(anchor.path, onChange);
      const offVault = env.vault.subscribe((ev) => {
        if (eventTouches(ev, [anchor.path])) onChange();
      });
      return () => {
        offLive();
        offVault();
      };
    },
    reveal(anchor) {
      const live = getLiveOutlineSession(anchor.path);
      if (live) {
        deps.openVaultFile(anchor.path, "current");
        live.selectNodes(anchor.itemIds, false);
        return;
      }
      deps.openVaultFile(anchor.path, "current");
      if (anchor.itemIds[0]) requestOutlineReveal(anchor.path, anchor.itemIds[0], { zoom: false });
    },
  };
}

export function createVDocSurface(deps: V2AnchorSurfaceDeps): AnchorSurface {
  const { env } = deps;
  return {
    id: VDOC_SURFACE,
    current() {
      const path = env.activeTabPath();
      if (!path || !isVDocPath(path)) return null;
      const doc = readVDoc(env, path);
      if (!doc) return null;
      const { unitIds } = canvasSelectionUnits(env, doc, path);
      let ids = unitIds;
      if (!ids.length) {
        const ui = env.vdocUiBridge.getState().getForPath(path);
        if (ui.selectedSlotId && doc.slots[ui.selectedSlotId]) ids = [ui.selectedSlotId];
        else if (ui.selectedBlockId && findBlock(doc, ui.selectedBlockId)) ids = [ui.selectedBlockId];
      }
      if (!ids.length) return null;
      return { surface: VDOC_SURFACE, path, itemIds: [...ids], label: anchorLabel(path, ids.length, "칸") };
    },
    missing(anchor) {
      if (!env.vault.exists(anchor.path)) return [...anchor.itemIds];
      const doc = readVDoc(env, anchor.path);
      if (!doc) return []; // 아직 읽지 않은 파일 (지연 로딩)
      return anchor.itemIds.filter((id) => !doc.slots[id] && !findBlock(doc, id));
    },
    isCompleted: () => false,
    toContexts(anchor) {
      const doc = readVDoc(env, anchor.path);
      if (!doc) return [];
      const present = anchor.itemIds.filter((id) => doc.slots[id] || findBlock(doc, id));
      if (!present.length) return [];
      const { slotIds } = splitVDocItems(doc, present);
      if (present.length > 1) return [selectionRangeRef(doc, anchor.path, slotIds, present)];
      const id = present[0];
      if (doc.slots[id]) return [slotRef(doc, anchor.path, doc.slots[id])];
      const loc = findBlock(doc, id);
      const page = loc ? doc.pages.find((p) => p.pageId === loc.pageId) : undefined;
      return loc && page ? [blockRef(doc, anchor.path, page, loc.block)] : [];
    },
    watch(anchor, onChange) {
      if (env.docs) return env.docs.subscribe(anchor.path, () => onChange());
      return env.vault.subscribe((ev) => {
        if (eventTouches(ev, [anchor.path])) onChange();
      });
    },
    reveal(anchor) {
      const doc = readVDoc(env, anchor.path);
      deps.openVaultFile(anchor.path, "current");
      if (!doc) return;
      const items = anchor.itemIds
        .map((id) => {
          if (doc.slots[id]) {
            const page = doc.pages.find((p) => p.blocks.some((b) => getBlockSlotIds(b).includes(id)));
            return { id, kind: "slot" as const, blockId: null, pageId: page?.pageId ?? null };
          }
          const loc = findBlock(doc, id);
          return loc ? { id, kind: "block" as const, blockId: id, pageId: loc.pageId } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (!items.length) return;
      const ui = env.vdocUiBridge.getState();
      ui.setSelection(anchor.path, items, items[0].id);
      ui.requestScrollTo(anchor.path, items[0].id, items[0].pageId ?? undefined);
    },
  };
}

export function createExplorerSurface(deps: V2AnchorSurfaceDeps): AnchorSurface {
  const { env } = deps;
  return {
    id: EXPLORER_SURFACE,
    current() {
      const paths = [...(env.explorerSelection?.() ?? [])].filter((p) => env.vault.exists(p));
      if (!paths.length) return null;
      const first = paths[0];
      const parent = dirname(first);
      const name = basename(first) || env.vault.name;
      return {
        surface: EXPLORER_SURFACE,
        path: parent,
        itemIds: paths,
        label: paths.length > 1 ? `${name} 외 ${paths.length - 1}개` : name,
      };
    },
    missing(anchor) {
      return anchor.itemIds.filter((p) => !env.vault.exists(p));
    },
    isCompleted: () => false,
    toContexts(anchor) {
      return anchor.itemIds.map((p) => pathContext(env, p)).filter((r): r is ContextRef => r !== null);
    },
    watch(anchor, onChange) {
      return env.vault.subscribe((ev) => {
        if (ev.type === "modify") return; // 내용 변경은 기준점과 무관 (있음 · 없음만 본다)
        if (eventTouches(ev, anchor.itemIds)) onChange();
      });
    },
    reveal(anchor) {
      if (anchor.itemIds[0]) deps.explorer?.getState().revealPath(anchor.itemIds[0], { focus: true });
    },
  };
}

export function createV2AnchorSurfaces(deps: V2AnchorSurfaceDeps): AnchorSurface[] {
  return [createOutlineSurface(deps), createVDocSurface(deps), createExplorerSurface(deps)];
}

/** 이름 바꾸기 · 이동 → 기준점 경로를 따라간다 (바뀌지 않았으면 같은 객체) */
export function remapAnchor(anchor: SessionAnchor, oldPath: string, newPath: string): SessionAnchor {
  const move = (p: string) => (p === oldPath ? newPath : p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p);
  const path = move(anchor.path);
  const itemIds = anchor.surface === EXPLORER_SURFACE ? anchor.itemIds.map(move) : anchor.itemIds;
  const changed = path !== anchor.path || itemIds.some((id, i) => id !== anchor.itemIds[i]);
  if (!changed) return anchor;
  const label =
    anchor.surface === EXPLORER_SURFACE
      ? itemIds.length > 1
        ? `${basename(itemIds[0])} 외 ${itemIds.length - 1}개`
        : basename(itemIds[0] ?? path)
      : anchorLabel(path, itemIds.length, anchor.surface === OUTLINE_SURFACE ? "불릿" : "칸");
  return { ...anchor, path, itemIds, label };
}
