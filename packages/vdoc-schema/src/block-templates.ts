/**
 * @vibe/vdoc-schema — 블록 박스에서 새로 끼워 넣는 기본 블록 틀.
 * 블록과 그 블록이 쓰는 빈 슬롯을 함께 만든다. 틀은 각 블록 종류의 정의(`insertable`)가 가진다.
 */
import { getBlockKind, listBlockKinds, type InsertableBlockDraft, type InsertableBlockOptions } from "./block-kit";

export type { InsertableBlockDraft, InsertableBlockOptions } from "./block-kit";

/** 블록 추가 메뉴에 나오는 종류 (정의에 `insertable` 이 있는 것). */
export type InsertableBlockKind = "columns-grid" | "structured-table" | "section-block" | "fillable-group";

/** 블록 추가 메뉴 항목 (레지스트리 순서). */
export function listInsertableBlocks(): { kind: string; label: string; description: string; icon: string }[] {
  return listBlockKinds().flatMap((def) =>
    def.insertable ? [{ kind: def.kinds[0], label: def.insertable.label, description: def.insertable.description, icon: def.icon }] : []
  );
}

export function createInsertableBlock(kind: InsertableBlockKind | string, options: InsertableBlockOptions): InsertableBlockDraft {
  const def = getBlockKind(kind);
  if (!def.insertable) throw new Error(`새로 끼워 넣을 수 없는 블록 종류입니다: ${kind}`);
  return def.insertable.create(options);
}
