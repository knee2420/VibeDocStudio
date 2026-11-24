import { LAYOUT_BLOCK_KINDS } from "../base-block";
import { getBlockSlotIds } from "../block-ops";
import type { LayoutBlock, VDocSlot } from "../types";
import type { AssetCompileValidationResult, VDocAsset } from "./types";

const VALID_KINDS = new Set<string>(LAYOUT_BLOCK_KINDS);

/** Fast deterministic FNV-1a hex hash for `.outline` input staleness detection. */
export function hashOutlineSourceInput(raw: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function isValidVDocAsset(value: unknown): value is VDocAsset {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<VDocAsset>;
  return (
    v.version === "1.0.0" &&
    typeof v.assetId === "string" &&
    v.assetId.trim().length > 0 &&
    typeof v.title === "string" &&
    typeof v.assetKind === "string" &&
    typeof v.scope === "string" &&
    Boolean(v.nuance && typeof v.nuance.summary === "string" && Array.isArray(v.nuance.structureRules)) &&
    Boolean(
      v.structure &&
        Array.isArray(v.structure.outlineDsl) &&
        Array.isArray(v.structure.blocks) &&
        v.structure.slots &&
        typeof v.structure.slots === "object"
    )
  );
}

/**
 * 결정적 스키마 검증 & 자가 보정 게이트 (AI 출력이 캔버스를 절대 깨뜨리지 않도록 보장).
 * - 유효한 `LayoutBlockKind` 여부 확인
 * - `blockId` 중복 자동 해소
 * - 모든 참조 `slotId` 존재 확인 (누락 시 안전한 빈 `editable-slot` 자동 보충)
 * - `structured-table` 의 `rowSpan`/`colSpan` 양수 보정 및 셀 중첩 블록 재귀 검증
 */
export function validateCompiledAssetBlocks(
  blocks: readonly LayoutBlock[],
  slots: Readonly<Record<string, VDocSlot>>
): AssetCompileValidationResult {
  const errors: string[] = [];
  const sanitizedSlots: Record<string, VDocSlot> = {};
  for (const [sid, slot] of Object.entries(slots ?? {})) {
    if (!slot || typeof slot !== "object") continue;
    sanitizedSlots[sid] = {
      slotId: slot.slotId || sid,
      label: typeof slot.label === "string" ? slot.label : sid,
      role: slot.role === "fillable-field" ? "fillable-field" : "editable-slot",
      content: typeof slot.content === "string" ? slot.content : "<p></p>",
      backDataRefs: Array.isArray(slot.backDataRefs) ? slot.backDataRefs : [],
      ...(slot.constraints ? { constraints: slot.constraints } : {}),
      ...(slot.fill ? { fill: slot.fill } : {}),
      ...(slot.rect ? { rect: slot.rect } : {}),
      ...(slot.assignee ? { assignee: slot.assignee } : {}),
    };
  }

  const usedBlockIds = new Set<string>();
  let seq = 0;

  const ensureSlot = (slotId: string, fallbackLabel: string) => {
    if (!slotId) return;
    if (!sanitizedSlots[slotId]) {
      errors.push(`Missing slot "${slotId}" auto-repaired`);
      sanitizedSlots[slotId] = {
        slotId,
        label: fallbackLabel,
        role: "editable-slot",
        content: "<p></p>",
        backDataRefs: [],
      };
    }
  };

  const sanitizeList = (list: readonly LayoutBlock[]): LayoutBlock[] => {
    const out: LayoutBlock[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object" || !VALID_KINDS.has(raw.kind)) {
        errors.push(`Invalid block kind "${String((raw as { kind?: unknown })?.kind)}" dropped`);
        continue;
      }
      let blockId = typeof raw.blockId === "string" && raw.blockId.trim() ? raw.blockId.trim() : `blk_${++seq}`;
      while (usedBlockIds.has(blockId)) {
        blockId = `${blockId}_${++seq}`;
      }
      usedBlockIds.add(blockId);

      let nextBlock: LayoutBlock = { ...raw, blockId };

      if (nextBlock.kind === "structured-table") {
        const sanitizedRows = (nextBlock.rows ?? []).map((row, rIdx) => ({
          ...row,
          rowId: row.rowId || `${blockId}_r${rIdx + 1}`,
          cells: (row.cells ?? []).map((cell, cIdx) => {
            const cellId = cell.cellId || `${blockId}_r${rIdx + 1}_c${cIdx + 1}`;
            const slotId = cell.slotId || `slot_${cellId}`;
            ensureSlot(slotId, `셀 (${rIdx + 1},${cIdx + 1})`);
            return {
              ...cell,
              cellId,
              slotId,
              ...(cell.rowSpan !== undefined ? { rowSpan: Math.max(1, Math.floor(cell.rowSpan)) } : {}),
              ...(cell.colSpan !== undefined ? { colSpan: Math.max(1, Math.floor(cell.colSpan)) } : {}),
              ...(cell.blocks && cell.blocks.length > 0 ? { blocks: sanitizeList(cell.blocks) } : {}),
            };
          }),
        }));
        const maxCols = Math.max(
          1,
          ...sanitizedRows.map((r) =>
            r.cells.reduce((sum, c) => sum + (c.colSpan ?? 1), 0)
          )
        );
        const colWidths =
          Array.isArray(nextBlock.columnWidths) && nextBlock.columnWidths.length > 0
            ? nextBlock.columnWidths
            : Array.from({ length: maxCols }, () => `${Math.floor(100 / maxCols)}%`);
        nextBlock = {
          ...nextBlock,
          columnWidths: colWidths,
          rows: sanitizedRows,
        };
      } else if (nextBlock.kind === "columns-grid" && nextBlock.columns) {
        nextBlock = {
          ...nextBlock,
          columns: nextBlock.columns.map((col, idx) => {
            if (col.slotId) ensureSlot(col.slotId, `칼럼 ${idx + 1}`);
            return {
              ...col,
              ...(col.blocks && col.blocks.length > 0 ? { blocks: sanitizeList(col.blocks) } : {}),
            };
          }),
        };
      }

      for (const sid of getBlockSlotIds(nextBlock)) {
        ensureSlot(sid, nextBlock.title || "슬롯");
      }

      out.push(nextBlock);
    }
    return out;
  };

  const sanitizedBlocks = sanitizeList(blocks ?? []);
  return {
    ok: sanitizedBlocks.length > 0 && errors.length === 0,
    errors,
    sanitizedBlocks,
    sanitizedSlots,
  };
}
