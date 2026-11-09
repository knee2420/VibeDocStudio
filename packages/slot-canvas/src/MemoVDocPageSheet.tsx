import React from "react";

import { iterPageSlotIds, type VDocPage } from "@vibe/vdoc-schema";

import { VDocPageSheet, type VDocPageSheetProps } from "./VDocPageSheet";

const slotIdsCache = new WeakMap<VDocPage, ReadonlySet<string>>();

/** 이 페이지가 참조하는 슬롯 ID (페이지 객체가 같으면 다시 계산하지 않는다). */
function pageSlotIds(page: VDocPage): ReadonlySet<string> {
  let ids = slotIdsCache.get(page);
  if (!ids) {
    ids = new Set(iterPageSlotIds(page));
    slotIdsCache.set(page, ids);
  }
  return ids;
}

/** 선택값 변화가 이 페이지와 관계있는지 (이전 · 다음 값 중 하나라도 이 페이지 안에 있으면). */
function selectionUnchangedForPage(
  prev: string | null | undefined,
  next: string | null | undefined,
  ids: ReadonlySet<string>
): boolean {
  if (prev === next) return true;
  return !(prev && ids.has(prev)) && !(next && ids.has(next));
}

function blockSelectionUnchanged(prev: VDocPageSheetProps, next: VDocPageSheetProps): boolean {
  if (prev.selectedBlockId === next.selectedBlockId) return true;
  const blockIds = new Set(next.page.blocks.map((b) => b.blockId));
  return !(prev.selectedBlockId && blockIds.has(prev.selectedBlockId)) &&
    !(next.selectedBlockId && blockIds.has(next.selectedBlockId));
}

const SELECTION_KEYS = new Set<keyof VDocPageSheetProps>([
  "slots",
  "backdata",
  "selectedSlotId",
  "composerOpenSlotId",
  "selectedBlockId",
]);

/**
 * 슬롯 한 칸을 고칠 때 문서의 모든 페이지가 다시 그려지지 않도록 하는 비교 함수.
 * - `slots` 는 이 페이지가 참조하는 슬롯 객체가 모두 같으면 같은 것으로 본다
 *   (`updateCurrentDoc` 은 바뀐 슬롯만 새 객체로 만든다).
 * - 선택 상태는 이 페이지와 관계있을 때만 비교한다.
 * - 나머지 prop 은 참조 비교한다 — 콜백은 호출하는 쪽에서 고정 참조로 넘겨야 한다.
 */
export function arePageSheetPropsEqual(prev: VDocPageSheetProps, next: VDocPageSheetProps): boolean {
  if (prev.page !== next.page) return false;
  for (const key of Object.keys(next) as (keyof VDocPageSheetProps)[]) {
    if (!SELECTION_KEYS.has(key) && prev[key] !== next[key]) return false;
  }
  const ids = pageSlotIds(next.page);
  if (prev.slots !== next.slots) {
    for (const id of ids) if (prev.slots[id] !== next.slots[id]) return false;
  }
  if (prev.backdata !== next.backdata) {
    for (const id of ids) {
      for (const ref of next.slots[id]?.backDataRefs ?? []) {
        if (prev.backdata[ref] !== next.backdata[ref]) return false;
      }
    }
  }
  return (
    selectionUnchangedForPage(prev.selectedSlotId, next.selectedSlotId, ids) &&
    selectionUnchangedForPage(prev.composerOpenSlotId, next.composerOpenSlotId, ids) &&
    blockSelectionUnchanged(prev, next)
  );
}

export const MemoVDocPageSheet = React.memo(VDocPageSheet, arePageSheetPropsEqual);
