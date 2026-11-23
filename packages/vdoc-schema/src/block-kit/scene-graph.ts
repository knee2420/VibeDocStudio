/**
 * @vibe/vdoc-schema/block-kit — 1:1 `.outline` 태그 대칭 자동 2D Scene Graph 컴파일러.
 *
 * UI 패널(`PAGES & ELEMENTS`)이 개별 블록 종류를 하드코딩하지 않고,
 * 각 `BlockModelDefinition` 의 `sceneNode` / `outlineTag` / `slotIds` 정의와
 * `ElementSyntaxRegistry` 를 읽어 재귀 Scene Graph 트리를 자동 컴파일한다.
 */
import { isBlockLocked } from "../block-ops";
import type { ElementSyntaxRegistry } from "../element-syntax/registry";
import { htmlToPlainText } from "../html-text";
import type { LayoutBlock, VDocPage, VDocSlot } from "../types";
import type { SceneGraphCompileContext, SceneGraphNode } from "./contract";
import { getBlockKind } from "./registry";

export interface CompileSceneGraphOptions {
  readonly selectedBlockId?: string | null;
  readonly selectedSlotId?: string | null;
  readonly hiddenBlockIds?: ReadonlySet<string>;
  readonly registry?: ElementSyntaxRegistry;
}

const EMPTY_HIDDEN: ReadonlySet<string> = new Set();

function resolveOutlineTag<B extends LayoutBlock>(
  block: B,
  slots: Record<string, VDocSlot>
): string | undefined {
  const def = getBlockKind(block.kind);
  if (!def.outlineTag) return undefined;
  return typeof def.outlineTag === "function" ? def.outlineTag(block, slots) : def.outlineTag;
}

function defaultCompileBlockSceneNode(
  block: LayoutBlock,
  ctx: SceneGraphCompileContext
): SceneGraphNode {
  const def = getBlockKind(block.kind);
  const slotIds = def.slotIds(block);
  const locked = isBlockLocked(block, ctx.slots);
  const hidden = ctx.hiddenBlockIds.has(block.blockId);
  const outlineTag = resolveOutlineTag(block, ctx.slots);

  const singleSlotId = slotIds.length === 1 ? slotIds[0] : undefined;
  const firstPlain = singleSlotId ? ctx.plainText(singleSlotId) : "";
  const label = (block.title || firstPlain || def.label || block.kind).slice(0, 64);

  const children: SceneGraphNode[] | undefined =
    slotIds.length > 1
      ? slotIds.map((sid) => {
          const slot = ctx.slots[sid];
          const text = ctx.plainText(sid);
          return {
            id: sid,
            role: "slot" as const,
            label: text ? text.slice(0, 48) : slot?.label || sid,
            icon: "type",
            selectBlockId: block.blockId,
            selectSlotId: sid,
            locked: Boolean(slot?.constraints?.locked),
            active: sid === ctx.selectedSlotId,
          };
        })
      : undefined;

  return {
    id: block.blockId,
    role: "block",
    outlineTag,
    label,
    icon: def.icon,
    badge: block.frame ? "2D" : undefined,
    selectBlockId: block.blockId,
    selectSlotId: singleSlotId,
    sourceNodeId: block.sourceNodeId,
    isBlock: true,
    locked,
    hidden,
    active:
      block.blockId === ctx.selectedBlockId ||
      Boolean(singleSlotId && singleSlotId === ctx.selectedSlotId),
    ...(children && children.length > 0 ? { children } : {}),
  };
}

/**
 * 단일 `LayoutBlock` 을 재귀 2D Scene Graph 노드로 자동 컴파일한다.
 */
export function compileBlockSceneNode(
  block: LayoutBlock,
  slots: Record<string, VDocSlot>,
  options: CompileSceneGraphOptions = {}
): SceneGraphNode {
  const selectedBlockId = options.selectedBlockId ?? null;
  const selectedSlotId = options.selectedSlotId ?? null;
  const hiddenBlockIds = options.hiddenBlockIds ?? EMPTY_HIDDEN;
  const registry = options.registry;

  const ctx: SceneGraphCompileContext = {
    slots,
    selectedBlockId,
    selectedSlotId,
    hiddenBlockIds,
    plainText: (slotId) => {
      if (!slotId) return "";
      const slot = slots[slotId];
      return slot ? htmlToPlainText(slot.content).replace(/\s+/g, " ").trim() : "";
    },
    resolveTag: (elementId, ruleId, fallback) =>
      registry ? registry.resolveSymbol(elementId, ruleId, fallback) : fallback,
    compileBlock: (nested) => {
      const def = getBlockKind(nested.kind);
      return def.sceneNode ? def.sceneNode(nested, ctx) : defaultCompileBlockSceneNode(nested, ctx);
    },
  };

  return ctx.compileBlock(block);
}

/**
 * 페이지/섹션의 모든 블록을 1:1 `.outline` 대칭 2D Scene Graph 트리로 자동 컴파일한다.
 */
export function compilePageSceneGraph(
  page: VDocPage,
  slots: Record<string, VDocSlot>,
  options: CompileSceneGraphOptions = {}
): SceneGraphNode[] {
  return page.blocks.map((block) => compileBlockSceneNode(block, slots, options));
}

/**
 * 현재 캔버스에서 선택된 `blockId` / `slotId` 를 트리에서 자동으로 펼치기 위해
 * 해당 노드의 모든 조상 `SceneGraphNode.id` 목록을 반환한다.
 */
export function findSceneNodeAncestorIds(
  nodes: readonly SceneGraphNode[],
  targetBlockId: string | null,
  targetSlotId: string | null
): string[] {
  if (!targetBlockId && !targetSlotId) return [];

  const search = (list: readonly SceneGraphNode[], ancestors: string[]): string[] | null => {
    for (const node of list) {
      const matchesDirect =
        (targetSlotId && node.selectSlotId === targetSlotId && node.role !== "block") ||
        (targetBlockId && node.isBlock && node.selectBlockId === targetBlockId);
      if (matchesDirect) {
        return ancestors;
      }
      if (node.children && node.children.length > 0) {
        const hit = search(node.children, [...ancestors, node.id]);
        if (hit) return hit;
      }
    }
    return null;
  };

  return search(nodes, []) ?? [];
}
