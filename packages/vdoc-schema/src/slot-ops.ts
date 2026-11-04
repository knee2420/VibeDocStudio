/**
 * @vibe/vdoc-schema — 슬롯 단위 순수 문서 연산.
 * 모두 새 문서를 돌려주며, 바뀐 것이 없으면 같은 문서 참조를 그대로 돌려준다
 * (스토어가 참조 비교로 "변경 없음"을 판단해 자동 저장 · 이력을 건너뛴다).
 */
import type { BackdataChunk, SlotConstraints, VDocDocument, VDocSlot } from "./types";

/** 슬롯 HTML 을 사람이 읽는 평문으로 (`<br>` 은 줄바꿈으로). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 한 줄 요약용: 태그를 지우고 공백을 하나로 모은다. */
export function htmlToSummary(html: string, maxLength?: number): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return maxLength === undefined ? text : text.slice(0, maxLength);
}

/** 평문 입력을 슬롯 HTML 로 (줄바꿈은 `<br/>`). */
export function plainTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
}

/** 슬롯 하나를 바꾼다. 슬롯이 없거나 `fn` 이 같은 슬롯을 돌려주면 문서도 그대로다. */
export function updateSlot(
  doc: VDocDocument,
  slotId: string,
  fn: (slot: VDocSlot) => VDocSlot,
  opts: { touch?: boolean } = {}
): VDocDocument {
  const slot = doc.slots[slotId];
  if (!slot) return doc;
  const next = fn(slot);
  if (next === slot) return doc;
  return {
    ...doc,
    ...(opts.touch ? { updatedAt: new Date().toISOString() } : null),
    slots: { ...doc.slots, [slotId]: next },
  };
}

/** 본문 교체. 첫 편집 때 원문을 `originalContent` 에 남겨 나중에 되돌릴 수 있게 한다. */
export function setSlotContent(doc: VDocDocument, slotId: string, html: string): VDocDocument {
  return updateSlot(
    doc,
    slotId,
    (slot) =>
      slot.content === html
        ? slot
        : {
            ...slot,
            content: html,
            isEdited: true,
            originalContent: slot.originalContent ?? slot.content,
          },
    { touch: true }
  );
}

/** 첫 편집 이전 원문으로 되돌린다. 남겨 둔 원문이 없으면 편집 표시만 지운다. */
export function restoreSlotOriginal(doc: VDocDocument, slotId: string): VDocDocument {
  return updateSlot(
    doc,
    slotId,
    (slot) => {
      if (!slot.isEdited && slot.originalContent === undefined) return slot;
      const { originalContent, ...rest } = slot;
      return { ...rest, content: originalContent ?? slot.content, isEdited: false };
    },
    { touch: true }
  );
}

export function patchSlotConstraints(
  doc: VDocDocument,
  slotId: string,
  patch: Partial<SlotConstraints>
): VDocDocument {
  return updateSlot(
    doc,
    slotId,
    (slot) => ({ ...slot, constraints: { ...slot.constraints, ...patch } }),
    { touch: true }
  );
}

/** 잠그면 고정 문구(boilerplate)가 되고, 풀면 다시 편집 슬롯이 된다. */
export function toggleSlotLock(doc: VDocDocument, slotId: string): VDocDocument {
  return updateSlot(doc, slotId, (slot) => {
    const locked = Boolean(slot.constraints?.locked);
    return {
      ...slot,
      role: locked ? "editable-slot" : "boilerplate",
      constraints: { ...slot.constraints, locked: !locked },
    };
  });
}

export function toggleSlotBackdataRef(doc: VDocDocument, slotId: string, chunkId: string): VDocDocument {
  return updateSlot(doc, slotId, (slot) => ({
    ...slot,
    backDataRefs: slot.backDataRefs.includes(chunkId)
      ? slot.backDataRefs.filter((id) => id !== chunkId)
      : [...slot.backDataRefs, chunkId],
  }));
}

/** 백데이터 청크를 문서 보관함에 넣고, `bindSlotId` 가 있으면 그 슬롯에 연결한다. */
export function addBackdataChunks(
  doc: VDocDocument,
  chunks: BackdataChunk[],
  bindSlotId?: string | null
): VDocDocument {
  if (chunks.length === 0) return doc;
  const backdata = { ...doc.backdata };
  for (const chunk of chunks) backdata[chunk.chunkId] = chunk;
  const withChunks = { ...doc, backdata };
  if (!bindSlotId) return withChunks;
  const ids = chunks.map((c) => c.chunkId);
  return updateSlot(withChunks, bindSlotId, (slot) => ({
    ...slot,
    backDataRefs: [...slot.backDataRefs, ...ids.filter((id) => !slot.backDataRefs.includes(id))],
  }));
}

/** 슬롯에 연결된 청크 (보관함에서 사라진 참조는 건너뛴다). */
export function getSlotBackdata(doc: VDocDocument, slot: VDocSlot): BackdataChunk[] {
  return slot.backDataRefs.flatMap((id) => (doc.backdata[id] ? [doc.backdata[id]] : []));
}

/** 문서를 열었을 때 먼저 고를 편집 슬롯 (고정 문구가 아닌 첫 슬롯). */
export function findFirstEditableSlotId(doc: VDocDocument | undefined): string | null {
  if (!doc) return null;
  return Object.values(doc.slots).find((s) => s.role !== "boilerplate")?.slotId ?? null;
}
