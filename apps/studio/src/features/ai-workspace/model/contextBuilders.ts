/**
 * 화면 요소 → AI 첨부(ContextRef). 끌어 놓기 · 우클릭 · Ctrl+L · `@` 멘션 · 답변 속 위치 칩이 모두 여기서 만든다.
 *
 * 칩은 가볍게(본문 없이) 들고 다니다가 보낼 때 `resolveContextContent` 가 본문을 채운다 — 그래서 첨부한 뒤에
 * 사용자가 문서를 고쳐도 보내는 순간의 내용이 간다. 예외: 참조 PDF 영역 · 텍스트 발췌는 만들 때 본문을 담는다.
 */
import type { ContextRef } from "@vibe/ai-kernel";
import {
  getBlockKind,
  getBlockSlotIds,
  getBlockUnits,
  getSlotBackdata,
  getTableCellPlacements,
  type LayoutBlock,
  type OutlinerNode,
  type StagedAiChange,
  type VDocDocument,
  type VDocPage,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { clipText, htmlToPlain } from "@/shared/lib";

import { findReferenceItem, referenceNumber, useReferenceStore } from "@/entities/reference-manager";

/** 블록 종류의 사람 이름 — 블록 정의(`block-kit`)가 정한다. */
export const blockKindLabel = (kind: string) => getBlockKind(kind).label;

// --- 찾기 (문서 객체가 바뀔 때만 색인을 다시 만든다) --------------------------------------

interface DocIndex {
  blocks: Map<string, { page: VDocPage; block: LayoutBlock }>;
  pages: Map<string, VDocPage>;
  slotBlock: Map<string, string>;
}

const indexes = new WeakMap<VDocDocument, DocIndex>();

export function docIndex(doc: VDocDocument): DocIndex {
  let index = indexes.get(doc);
  if (index) return index;
  index = { blocks: new Map(), pages: new Map(), slotBlock: new Map() };
  for (const page of doc.pages) {
    index.pages.set(page.pageId, page);
    for (const block of page.blocks) {
      index.blocks.set(block.blockId, { page, block });
      for (const slotId of getBlockSlotIds(block)) index.slotBlock.set(slotId, block.blockId);
    }
  }
  indexes.set(doc, index);
  return index;
}

/** 열린 문서를 먼저, 그다음 불러온 다른 문서(참조 포함)에서 찾는다. */
export function findInDocs<T>(pick: (doc: VDocDocument) => T | null | undefined): { doc: VDocDocument; value: T } | null {
  const state = useStudioDocumentStore.getState();
  const active = state.docs.find((d) => d.docId === state.activeDocId);
  const ordered = active ? [active, ...state.docs.filter((d) => d !== active)] : state.docs;
  for (const doc of ordered) {
    const value = pick(doc);
    if (value != null) return { doc, value };
  }
  return null;
}

export function findDoc(docId: string): VDocDocument | undefined {
  return useStudioDocumentStore.getState().docs.find((d) => d.docId === docId);
}

const isEditableSlot = (slot: VDocSlot | undefined) =>
  Boolean(slot) && slot!.role !== "boilerplate" && !slot!.constraints?.locked;

// --- 참조(칩) 만들기 ---------------------------------------------------------------------

export function slotRef(doc: VDocDocument, slot: VDocSlot): ContextRef {
  return {
    kind: "slot",
    id: slot.slotId,
    label: slot.label,
    hint: htmlToPlain(slot.content, 60),
    access: isEditableSlot(slot) ? "write" : "read",
    meta: { docId: doc.docId },
  };
}

export function blockRef(doc: VDocDocument, page: VDocPage, block: LayoutBlock): ContextRef {
  const slots = getBlockSlotIds(block).map((id) => doc.slots[id]).filter(Boolean);
  const editable = !block.locked && slots.some(isEditableSlot);
  return {
    kind: "block",
    id: block.blockId,
    label: block.title || `${blockKindLabel(block.kind)} 블록`,
    hint: `${page.pageLabel} · ${blockKindLabel(block.kind)} · 슬롯 ${slots.length}개`,
    access: editable ? "write" : "read",
    meta: { docId: doc.docId, pageId: page.pageId },
  };
}

export function pageRef(doc: VDocDocument, page: VDocPage): ContextRef {
  return {
    kind: "page",
    id: page.pageId,
    label: page.pageLabel || page.pageId,
    hint: `${doc.title} · 블록 ${page.blocks.length}개`,
    access: "write",
    meta: { docId: doc.docId },
  };
}

/**
 * 아웃라인 노드 → 그 노드가 가리키는 실제 요소(슬롯 · 블록 · 페이지)로 첨부한다.
 * 그래서 아웃라이너에서 끈 표와 캔버스에서 끈 표가 같은 칩(@블록1)이 된다. 대상이 없는 노드만 `node`.
 */
export function outlineNodeRef(node: OutlinerNode): ContextRef {
  const docId = node.targetDocId ?? undefined;
  const pick = <T,>(fn: (d: VDocDocument) => T | null | undefined) => {
    const doc = docId ? findDoc(docId) : undefined;
    const value = doc ? fn(doc) : undefined;
    return doc && value != null ? { doc, value } : findInDocs(fn);
  };
  if (node.targetSlotId) {
    const found = pick((d) => d.slots[node.targetSlotId!]);
    if (found) return { ...slotRef(found.doc, found.value), label: node.title || found.value.label };
  }
  if (node.targetBlockId) {
    const found = pick((d) => docIndex(d).blocks.get(node.targetBlockId!));
    if (found) return { ...blockRef(found.doc, found.value.page, found.value.block), label: node.title || found.value.block.title };
  }
  if (node.targetPageId) {
    const found = pick((d) => docIndex(d).pages.get(node.targetPageId!));
    if (found) return { ...pageRef(found.doc, found.value), label: node.title || found.value.pageLabel };
  }
  return outlineNodeOnlyRef(node);
}

function outlineNodeOnlyRef(node: OutlinerNode): ContextRef {
  const hasTarget = Boolean(node.targetSlotId || node.targetBlockId || node.targetPageId || node.targetDocId);
  return {
    kind: "node",
    id: node.nodeId,
    label: node.title || node.nodeId,
    hint: node.summary || undefined,
    access: hasTarget && !node.isStatic ? "write" : "read",
    meta: {
      docId: node.targetDocId ?? null,
      pageId: node.targetPageId ?? null,
      blockId: node.targetBlockId ?? null,
      slotId: node.targetSlotId ?? null,
      entityId: node.targetSlotId || node.targetBlockId || node.targetPageId || node.nodeId,
    },
  };
}

export function referenceRef(refId: string, label?: string): ContextRef {
  const item = findReferenceItem(refId);
  const number = referenceNumber(refId);
  return {
    kind: "reference",
    id: refId,
    label: label ?? (item ? `${number ? `참조${number}: ` : ""}${item.title}` : refId),
    hint: item ? `레퍼런스 · ${item.kind}${item.pageCount ? ` · ${item.pageCount}쪽` : ""}` : "레퍼런스",
    access: "read",
    meta: { entityId: refId, entityKind: "reference" },
  };
}

export function backdataRef(doc: VDocDocument, chunkId: string): ContextRef | null {
  const chunk = doc.backdata[chunkId];
  if (!chunk) return null;
  return {
    kind: "backdata",
    id: chunkId,
    label: chunk.sourceTitle,
    hint: clipText(chunk.excerpt, 60),
    access: "read",
    content: `[${chunk.sourceTitle}] (${chunk.sourceType})\n${chunk.excerpt}`,
  };
}

export function stagedRef(change: StagedAiChange): ContextRef {
  return {
    kind: "staged",
    id: change.diffId,
    label: change.title,
    hint: change.afterSummary,
    access: "read",
    content: [
      `diffId: ${change.diffId}`,
      `target: ${change.targetKind} ${change.targetId}`,
      `before: ${change.beforeSummary}`,
      `after: ${change.afterSummary}`,
      "payload:",
      clipText(JSON.stringify(change.payload), 4000),
    ].join("\n"),
    meta: { entityId: change.targetId },
  };
}

export function variableRef(doc: VDocDocument, name: string): ContextRef {
  return {
    kind: "variable",
    id: `${doc.docId}:${name}`,
    label: name,
    hint: doc.variables?.[name] || "(값 없음)",
    access: "write",
    content: `문서 변수 ${name} = ${doc.variables?.[name] || "(비어 있음)"}\n(본문에서는 [${name}] 칩으로 들어간다)`,
  };
}

/** 슬롯 안의 텍스트 선택 — 그 범위만 고치라는 첨부. */
export function textRangeRef(doc: VDocDocument, slot: VDocSlot, range: { from: number; to: number; text: string }): ContextRef {
  return {
    kind: "text-range",
    id: `${slot.slotId}:${range.from}-${range.to}`,
    label: `"${clipText(range.text, 18)}${range.text.length > 18 ? "…" : ""}"`,
    hint: `${slot.label} 안의 선택 영역`,
    access: isEditableSlot(slot) ? "write" : "read",
    content: [
      `slotId: ${slot.slotId} (${slot.label}) 안의 선택한 텍스트:`,
      `"""${range.text}"""`,
      "슬롯 전체 본문 (선택 부분만 바꾸고 나머지는 그대로 둔 새 본문을 제안한다):",
      slot.content,
    ].join("\n"),
    meta: { entityId: slot.slotId, entityKind: "slot", docId: doc.docId, ...range },
  };
}

/** 레퍼런스 원본에서 긁은 텍스트 (PDF 텍스트 모드 · 웹 리더). */
export function referenceTextRef(refId: string, text: string): ContextRef {
  const title = referenceRef(refId).label;
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return {
    kind: "ref-text",
    id: `${refId}:t${hash(clean)}`,
    label: `${clipText(title, 12)} 발췌`,
    hint: clipText(clean, 80),
    access: "read",
    content: `레퍼런스 "${title}" (ref:${refId}) 에서 사용자가 고른 부분 — 결정 방식만 참고하고 문장은 옮기지 않는다:\n${clipText(clean, 8000)}`,
    meta: { entityId: refId, entityKind: "reference" },
  };
}

/** 레퍼런스 PDF 에서 사각형으로 고른 영역 (텍스트는 미리 뽑아 담는다). */
export function referenceRegionRef(
  refId: string,
  region: { page: number; box: [number, number, number, number]; text: string }
): ContextRef {
  const title = referenceRef(refId).label;
  const number = referenceNumber(refId);
  const prefix = number ? `참조${number}` : clipText(title, 10);
  return {
    kind: "ref-region",
    id: `${refId}:p${region.page}:${region.box.map((v) => Math.round(v)).join(",")}`,
    label: `${prefix} p${region.page} 영역`,
    hint: region.text ? clipText(region.text, 80) : "(텍스트를 찾지 못한 영역 — 스캔 이미지일 수 있음)",
    access: "read",
    content: [
      `레퍼런스 "${title}" (ref:${refId}) ${region.page}쪽에서 사용자가 사각형으로 고른 영역`,
      `(좌표 [ymin,xmin,ymax,xmax] 0~1000: ${region.box.map((v) => Math.round(v)).join(", ")})`,
      region.text ? region.text : "(이 영역에서 텍스트 레이어를 찾지 못했다. 스캔 이미지일 가능성이 높다.)",
    ].join("\n"),
    meta: { entityId: refId, entityKind: "reference", page: region.page, box: region.box },
  };
}

/**
 * 캔버스에서 드래그로 고른 여러 선택 단위 (표 구역 · 블록을 넘는 범위).
 * `unitIds` 는 슬롯 · 이미지 같은 단위 전부, `slotIds` 는 그중 글을 고칠 수 있는 슬롯 단위.
 */
export function slotRangeRef(doc: VDocDocument, slotIds: string[], unitIds: string[] = slotIds): ContextRef {
  const slots = slotIds.map((id) => doc.slots[id]).filter(Boolean);
  const editable = slots.filter(isEditableSlot).length;
  const others = unitIds.length - slotIds.length;
  const first = slots[0]?.label ?? unitLabel(doc, unitIds[0]) ?? "";
  return {
    kind: "slot-range",
    id: `range:${hash(unitIds.join("|"))}`,
    label: `${unitIds.length}개 요소 · ${first}${unitIds.length > 1 ? " …" : ""}`,
    hint: `${unitIds.map((id) => doc.slots[id]?.label ?? unitLabel(doc, id) ?? id).slice(0, 8).join(", ")}${unitIds.length > 8 ? " …" : ""}${
      editable < slots.length ? ` (잠김 · 고정 ${slots.length - editable}개는 바꿀 수 없음)` : ""
    }${others > 0 ? ` · 슬롯 아닌 요소 ${others}개(이미지 등)` : ""}`,
    access: editable ? "write" : "read",
    meta: { docId: doc.docId, slotIds, unitIds, entityId: unitIds[0], entityKind: slotIds.includes(unitIds[0]) ? "slot" : "block" },
  };
}

/** 슬롯이 아닌 선택 단위(이미지 등)의 이름. */
function unitLabel(doc: VDocDocument, unitId: string | undefined): string | undefined {
  if (!unitId) return undefined;
  for (const { block } of docIndex(doc).blocks.values()) {
    const unit = getBlockUnits(block).find((u) => u.unitId === unitId);
    if (unit) return unit.label ?? getBlockKind(block.kind).label;
  }
  return undefined;
}

/** 블록 안 슬롯의 표 위치 (`구역2 r1c3`). 표가 없는 블록은 비어 있다 — 표 목록은 블록 정의가 준다. */
function gridPositions(block: LayoutBlock): Map<string, string> {
  const out = new Map<string, string>();
  const list = getBlockKind(block.kind).tables?.(block) ?? [];
  const tables = list.map((t, i) => ({ prefix: list.length > 1 ? `구역${i + 1} ` : "", table: t.table }));
  for (const { prefix, table } of tables) {
    for (const p of getTableCellPlacements(table)) {
      const span = p.rowSpan > 1 || p.colSpan > 1 ? ` (span ${p.rowSpan}x${p.colSpan})` : "";
      out.set(p.cell.slotId, `${prefix}r${p.row + 1}c${p.col + 1}${span}${p.cell.isHeader ? " 머리칸" : ""}`);
    }
  }
  return out;
}

/** 범위 → 블록별로 묶은 선택 단위 목록 (표 위치 · 잠금 · 현재 본문, 이미지 등은 블록 정의의 설명). */
export function slotRangeContent(doc: VDocDocument, slotIds: string[], unitIds: string[] = slotIds): string {
  const wanted = new Set(unitIds);
  const lines = [
    `사용자가 캔버스에서 함께 고른 요소 ${unitIds.length}개 (블록별 · 읽는 순서). [locked] · [boilerplate] 는 바꾸지 않는다.`,
  ];
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const units = getBlockUnits(block).filter((u) => wanted.has(u.unitId));
      if (units.length === 0) continue;
      const def = getBlockKind(block.kind);
      const pos = gridPositions(block);
      lines.push(`## ${block.blockId} (${def.label}) "${block.title}" · ${page.pageLabel}`);
      for (const unit of units) {
        if (unit.kind !== "slot") {
          // 슬롯이 아닌 요소: 블록 정의가 알려 주는 속성 (바꾸려면 blocks.proposeProps).
          lines.push(`- [${def.label}] ${unit.unitId} "${unit.label ?? def.label}": ${(def.ai?.describe?.(block) ?? []).join(" · ") || "(설명 없음)"}`);
          continue;
        }
        const slot = doc.slots[unit.slotId ?? unit.unitId];
        if (!slot) continue;
        const flags = [slot.role === "boilerplate" ? "boilerplate" : "", slot.constraints?.locked || block.locked ? "locked" : ""].filter(Boolean).join(",");
        const html = slot.content.length > 1200 ? `${clipText(slot.content, 1200)}…` : slot.content;
        lines.push(`- ${pos.get(slot.slotId) ? `[${pos.get(slot.slotId)}] ` : ""}${slot.slotId}${flags ? ` [${flags}]` : ""} "${slot.label}": ${html || "(비어 있음)"}`);
      }
    }
  }
  return clipText(lines.join("\n"), 20000);
}

/** 범위 중 실제로 바꿀 수 있는 슬롯. */
export function editableSlotIds(doc: VDocDocument, slotIds: string[]): string[] {
  const index = docIndex(doc);
  return slotIds.filter((id) => {
    const slot = doc.slots[id];
    const blockId = index.slotBlock.get(id);
    const block = blockId ? index.blocks.get(blockId)?.block : undefined;
    return isEditableSlot(slot) && !block?.locked;
  });
}

// --- 본문 채우기 (보내기 직전) --------------------------------------------------------------

function slotLine(slot: VDocSlot, maxHtml = 1500): string {
  const flags = [slot.role !== "editable-slot" ? slot.role : "", slot.constraints?.locked ? "locked" : "", slot.constraints?.maxLines ? `maxLines=${slot.constraints.maxLines}` : ""]
    .filter(Boolean)
    .join(",");
  const html = slot.content.length > maxHtml ? `${clipText(slot.content, maxHtml)}…` : slot.content;
  return `- ${slot.slotId}${flags ? ` [${flags}]` : ""} "${slot.label}": ${html || "(비어 있음)"}`;
}

/** 블록 구조 + 슬롯별 현재 내용. 표는 행 · 열 배치를 그대로 보여준다 (어느 칸이 어디인지 모델이 알게). */
export function blockContent(doc: VDocDocument, page: VDocPage, block: LayoutBlock): string {
  const def = getBlockKind(block.kind);
  const lines = [`blockId: ${block.blockId} (${block.kind} · ${def.label}) · page ${page.pageId} "${page.pageLabel}"`, `title: ${block.title}`];
  if (block.locked) lines.push("locked: true (블록 전체 잠김 — 변경 불가)");
  // 블록 정의가 아는 슬롯 밖 정보 (이미지 주소 · 담당자 · 정렬 …)와 AI 가 바꿀 수 있는 속성.
  lines.push(...(def.ai?.describe?.(block) ?? []));
  const props = Object.keys(def.ai?.editableProps ?? {});
  if (props.length) lines.push(`바꿀 수 있는 블록 속성 (blocks.proposeProps): ${props.join(", ")}`);
  const tables = def.tables?.(block) ?? [];
  tables.forEach((t, i) => {
    lines.push(`${tables.length > 1 ? `구역${i + 1} "${t.title ?? ""}" ` : "표 "}배치 (행마다 셀 slotId 순서):`);
    t.table.rows.forEach((row, r) => {
      const cells = row.cells.map((cell) => {
        const slot = doc.slots[cell.slotId];
        const text = slot ? htmlToPlain(slot.content, 40) : "";
        return `${cell.isHeader ? "H:" : ""}${cell.slotId}${cell.colSpan && cell.colSpan > 1 ? `(colspan ${cell.colSpan})` : ""}=${JSON.stringify(text)}`;
      });
      lines.push(`  r${r + 1}: ${cells.join(" | ")}`);
    });
  });
  lines.push("슬롯 (편집 가능한 것만 바꿀 수 있다):");
  for (const slotId of getBlockSlotIds(block)) {
    const slot = doc.slots[slotId];
    if (slot) lines.push(slotLine(slot));
  }
  return lines.join("\n");
}

export function pageContent(doc: VDocDocument, page: VDocPage): string {
  const parts = [`pageId: ${page.pageId} "${page.pageLabel}" (문서 ${doc.title})`];
  for (const block of page.blocks) parts.push(blockContent(doc, page, block));
  return clipText(parts.join("\n\n"), 16000);
}

function slotContent(doc: VDocDocument, slot: VDocSlot): string {
  const lines = [slotLine(slot, 6000)];
  const blockId = docIndex(doc).slotBlock.get(slot.slotId);
  if (blockId) lines.push(`(소속 블록 ${blockId})`);
  const chunks = getSlotBackdata(doc, slot);
  if (chunks.length) {
    lines.push("연결된 백데이터:");
    for (const c of chunks) lines.push(`- [${c.sourceTitle}] ${c.excerpt}`);
  }
  return lines.join("\n");
}

function referenceContent(refId: string): string | null {
  const item = findReferenceItem(refId);
  if (!item) return null;
  const extraction = useReferenceStore.getState().extraction[refId];
  const outline = extraction?.outline.map((o) => `${"#".repeat(Math.max(1, o.level))} ${o.title} (p${o.page})`).join("\n");
  return [
    `레퍼런스: ${item.title} (ref:${refId}) — 결정 방식만 참고하고 문장 · 고유명사 · 수치는 옮기지 않는다.`,
    outline ? `목차:\n${clipText(outline, 4000)}` : "",
    "원문은 wb_read(ref:" + refId + "…) 로 읽는다.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 칩 → 모델에 보낼 본문. 모르는 종류는 null (다른 제공자가 채운다). */
export function resolveContextContent(ref: ContextRef): string | null {
  const meta = ref.meta ?? {};
  const docId = typeof meta.docId === "string" ? meta.docId : null;
  const pickDoc = <T,>(pick: (doc: VDocDocument) => T | null | undefined) => {
    const doc = docId ? findDoc(docId) : undefined;
    if (doc) {
      const value = pick(doc);
      if (value != null) return { doc, value };
    }
    return findInDocs(pick);
  };
  switch (ref.kind) {
    case "slot": {
      const found = pickDoc((d) => d.slots[ref.id]);
      return found ? slotContent(found.doc, found.value) : null;
    }
    case "block": {
      const found = pickDoc((d) => docIndex(d).blocks.get(ref.id));
      return found ? blockContent(found.doc, found.value.page, found.value.block) : null;
    }
    case "page": {
      const found = pickDoc((d) => docIndex(d).pages.get(ref.id));
      return found ? pageContent(found.doc, found.value) : null;
    }
    case "node": {
      const slotId = meta.slotId as string | null;
      const blockId = meta.blockId as string | null;
      const pageId = meta.pageId as string | null;
      const head = `아웃라인 노드 "${ref.label}"${ref.hint ? ` — ${ref.hint}` : ""}`;
      if (slotId) {
        const found = pickDoc((d) => d.slots[slotId]);
        if (found) return `${head}\n${slotContent(found.doc, found.value)}`;
      }
      if (blockId) {
        const found = pickDoc((d) => docIndex(d).blocks.get(blockId));
        if (found) return `${head}\n${blockContent(found.doc, found.value.page, found.value.block)}`;
      }
      if (pageId) {
        const found = pickDoc((d) => docIndex(d).pages.get(pageId));
        if (found) return `${head}\n${pageContent(found.doc, found.value)}`;
      }
      if (docId) {
        const d = findDoc(docId);
        if (d) return `${head}\n문서 ${d.title} (${d.pages.length}페이지) — 구조는 document.getOutline 으로 읽는다`;
      }
      return head;
    }
    case "reference":
      return referenceContent(ref.id);
    case "slot-range": {
      const ids = Array.isArray(meta.slotIds) ? (meta.slotIds as string[]) : [];
      const units = Array.isArray(meta.unitIds) ? (meta.unitIds as string[]) : ids;
      const doc = docId ? findDoc(docId) : undefined;
      return doc && units.length ? slotRangeContent(doc, ids, units) : null;
    }
    default:
      return null;
  }
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
