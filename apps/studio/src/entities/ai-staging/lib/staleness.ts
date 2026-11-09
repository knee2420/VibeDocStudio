import { contentHash, type StagedAiChange, type VDocDocument } from "@vibe/vdoc-schema";

/**
 * 변경안이 "오래됐는가" — 변경안을 만든 뒤 사람이 그 칸을 고쳤다.
 * 그대로 승인하면 사람이 고친 내용을 덮어쓰므로, 검토 화면이 경고하고 승인 전에 확인을 받는다.
 * 기준 지문(baseHash)이 없는 예전 변경안은 판단하지 않는다.
 */
export function isStagedChangeStale(change: StagedAiChange, doc: VDocDocument | undefined): boolean {
  if (!doc || !change.baseHash) return false;
  if (change.targetKind === "slot-html") {
    const slot = doc.slots[change.payload.slotId];
    return !slot || contentHash(slot.content) !== change.baseHash;
  }
  if (change.targetKind === "variables") {
    return contentHash(JSON.stringify(doc.variables ?? {})) !== change.baseHash;
  }
  return false;
}
