/**
 * 블록 종류 레지스트리 — `kind` → 정의. 기본 종류는 `index.ts` 가 등록하고, 앱이 새 종류를 더할 수 있다.
 * 등록되지 않은 종류(이전 버전 문서 등)는 `slotId` · `slotIds` 를 읽는 일반 정의로 다룬다.
 */
import type { LayoutBlock } from "../types";
import type { BlockModelDefinition, BlockUnit } from "./contract";
import { outlineSlotGroup } from "./kinds/shared";

const definitions = new Map<string, BlockModelDefinition>();
const ordered: BlockModelDefinition[] = [];

export function registerBlockKind<B extends LayoutBlock>(definition: BlockModelDefinition<B>): void {
  const def = definition as unknown as BlockModelDefinition;
  for (const kind of def.kinds) definitions.set(kind, def);
  const at = ordered.findIndex((d) => d.kinds.some((k) => def.kinds.includes(k)));
  if (at === -1) ordered.push(def);
  else ordered[at] = def;
}

/** 모르는 종류: 흔한 모양(`slotId` · `slotIds`)을 읽는다. */
export const genericBlockKind: BlockModelDefinition = {
  kinds: [],
  label: "블록",
  category: "layout",
  icon: "square",
  slotIds: (block) => {
    const b = block as unknown as Record<string, unknown>;
    if (typeof b.slotId === "string") return [b.slotId];
    if (Array.isArray(b.slotIds)) return b.slotIds.filter((s): s is string => typeof s === "string");
    return [];
  },
  outline: (block, ctx) => outlineSlotGroup(genericBlockKind.slotIds(block), ctx, "블록", (n) => `블록 · ${n}칸`),
};

export function getBlockKind(kind: string): BlockModelDefinition {
  return definitions.get(kind) ?? genericBlockKind;
}

export function hasBlockKind(kind: string): boolean {
  return definitions.has(kind);
}

/** 등록된 정의들 (등록 순서, 별칭은 한 번만). */
export function listBlockKinds(): BlockModelDefinition[] {
  return [...ordered];
}

/** 블록의 선택 단위 (정의가 없으면 슬롯마다 하나). */
export function getBlockUnits(block: LayoutBlock): BlockUnit[] {
  const def = getBlockKind(block.kind);
  return def.units ? def.units(block) : def.slotIds(block).map((slotId) => ({ unitId: slotId, kind: "slot", slotId }));
}
