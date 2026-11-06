import {
  evidenceForSlot,
  evidenceKey,
  getBlockSlotIds,
  slotPlainText,
  type EvidenceLocator,
  type EvidenceTier,
  type LayoutBlock,
  type VDocDocument,
  type VDocPage,
} from "@vibe/vdoc-schema";

/** 하네스 · RM 이 함께 쓰는 근거 후보 (등급 포함). */
export interface EvidenceCandidate {
  locator: EvidenceLocator;
  tier: EvidenceTier;
}

export interface SlotPlace {
  page: VDocPage;
  block: LayoutBlock;
  /** 같은 블록의 다른 칸 (표의 이웃 칸 · 그리드의 짝 칸) */
  siblings: string[];
}

/** 슬롯이 어느 페이지 · 블록에 있는가 (한 번 훑는다). */
export function locateSlot(doc: VDocDocument, slotId: string): SlotPlace | null {
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const ids = getBlockSlotIds(block);
      if (ids.includes(slotId)) return { page, block, siblings: ids.filter((id) => id !== slotId) };
    }
  }
  return null;
}

export interface EvidenceExtras {
  /** 사용자가 RM 에서 고정(핀)한 자료 — 모든 칸의 inherited 근거 */
  pinned?: EvidenceLocator[];
  /** 지금 열어 둔 참조 문서 본문 (분할보기) */
  references?: { docId: string; label: string; text: string }[];
  /** 사용자가 집은 1순위 근거 (참조 영역 선택 · RM 항목 끌어 놓기 — "이 자료로") */
  primary?: EvidenceLocator[];
}

/**
 * 칸 하나의 근거 후보 — 등급 순서로:
 *   direct     그 칸에 이미 연결된 근거 (사람이 붙였거나 AI 가 인용해 승인된 것) · 사용자가 집은 1순위 자료
 *   inherited  같은 블록 이웃 칸들의 근거 · RM 고정 자료 · 열어 둔 참조 문서
 * suggested(지식 덱 추천)는 서버 하네스가 근거가 약할 때 스스로 더한다.
 */
export function resolveSlotEvidence(doc: VDocDocument, slotId: string, extras: EvidenceExtras = {}): EvidenceCandidate[] {
  const out: EvidenceCandidate[] = [];
  const seen = new Set<string>();
  const add = (locator: EvidenceLocator, tier: EvidenceTier) => {
    const key = evidenceKey(locator);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ locator, tier });
  };
  for (const loc of extras.primary ?? []) add(loc, "direct");
  for (const link of evidenceForSlot(doc, slotId)) if (link.status !== "missing") add(link.locator, "direct");
  const place = locateSlot(doc, slotId);
  for (const sib of place?.siblings ?? []) for (const link of evidenceForSlot(doc, sib)) add(link.locator, "inherited");
  for (const loc of extras.pinned ?? []) add(loc, "inherited");
  for (const ref of extras.references ?? []) {
    add({ kind: "ref-region", refId: ref.docId, docId: ref.docId, label: ref.label, excerpt: ref.text.slice(0, 2400) }, "inherited");
  }
  return out;
}

/** 하네스 대상 정보: 칸 · 제목 경로 · 이웃 칸 글 (짧게). */
export function slotTarget(doc: VDocDocument, slotId: string, measured?: { widthPx?: number; fontSizePx?: number }) {
  const slot = doc.slots[slotId];
  const place = locateSlot(doc, slotId);
  const neighbors = (place?.siblings ?? [])
    .map((id) => doc.slots[id])
    .filter(Boolean)
    .map((s) => `${s.label}: ${slotPlainText(s.content).slice(0, 120)}`)
    .join(" | ")
    .slice(0, 900);
  return {
    slotId,
    label: slot?.label ?? slotId,
    currentHtml: slot?.content ?? "",
    currentText: slotPlainText(slot?.content ?? ""),
    constraints: slot?.constraints ?? {},
    headingPath: [doc.title, place?.page.pageLabel, place?.block.title].filter(Boolean).join(" > "),
    neighbors,
    widthPx: measured?.widthPx,
    fontSizePx: measured?.fontSizePx,
  };
}
