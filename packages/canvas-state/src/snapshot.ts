/**
 * 캔버스 선택 → AI · 다른 화면이 읽는 요약 (순수 함수).
 * 여러 블록 · 칸을 골라도 한 묶음으로: 블록 id · 칸 id · 사람이 읽는 요약 · 본문 발췌 · 연결 파일.
 */
import { findBlock, findBlockBySlotId, getBlockSlotIds, type LayoutBlock, type VDocDocument } from "@vibe/vdoc-schema";

import type { CanvasSelection } from "./store";

export interface CanvasSelectionSnapshot {
  readonly pageId: string | undefined;
  /** 고른 블록 + 고른 칸 · 표 노드를 품은 블록 (고른 순서, 중복 없음). */
  readonly blockIds: string[];
  /** 고른 칸 (고른 순서). */
  readonly slotIds: string[];
  readonly summary: string;
  readonly text: string;
  /** 고른 링크 카드가 가리키는 볼트 파일. */
  readonly linkedPaths: string[];
  readonly count: number;
}

const VAULT_PREFIX = "vault://";
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function blockText(doc: VDocDocument, block: LayoutBlock, max: number): string {
  const parts = [block.title ?? ""];
  for (const sid of getBlockSlotIds(block)) {
    const t = plain(doc.slots[sid]?.content ?? "");
    if (t) parts.push(t);
    if (parts.join(" ").length > max) break;
  }
  return parts.filter(Boolean).join(" · ").slice(0, max);
}

export function describeCanvasSelection(
  doc: VDocDocument,
  selection: CanvasSelection,
  fallbackPageId?: string | null,
  opts: { readonly perItemChars?: number; readonly totalChars?: number } = {}
): CanvasSelectionSnapshot | null {
  if (!selection.items.length) return null;
  const perItem = opts.perItemChars ?? 220;
  const total = opts.totalChars ?? 1600;
  const blockIds: string[] = [];
  const slotIds: string[] = [];
  const linkedPaths: string[] = [];
  const texts: string[] = [];
  const labels: string[] = [];
  const pageIds = new Set<string>();
  const pushBlock = (id: string) => {
    if (!blockIds.includes(id)) blockIds.push(id);
  };

  for (const item of selection.items) {
    if (item.kind === "slot") {
      const slot = doc.slots[item.id];
      if (!slot) continue;
      slotIds.push(item.id);
      const owner = item.blockId ?? findBlockBySlotId(doc, item.id)?.block.blockId ?? null;
      const loc = owner ? findBlock(doc, owner) : null;
      if (owner) pushBlock(owner);
      if (loc) pageIds.add(loc.pageId);
      labels.push(slot.label || loc?.block.title || item.id);
      texts.push(plain(slot.content).slice(0, perItem));
      continue;
    }
    const blockId = item.kind === "block" ? item.id : item.blockId;
    if (!blockId) continue;
    const loc = findBlock(doc, blockId);
    if (!loc) continue;
    pushBlock(blockId);
    pageIds.add(loc.pageId);
    labels.push(loc.block.title || blockId);
    texts.push(blockText(doc, loc.block, perItem));
    if (loc.block.kind === "link-card" && typeof loc.block.url === "string" && loc.block.url.startsWith(VAULT_PREFIX)) {
      linkedPaths.push(loc.block.url.slice(VAULT_PREFIX.length));
    }
  }
  const count = blockIds.length + slotIds.length;
  if (!count) return null;

  const pageId = pageIds.size === 1 ? [...pageIds][0] : (fallbackPageId ?? [...pageIds][0]);
  const pageLabel = (pid: string | undefined) => doc.pages.find((p) => p.pageId === pid)?.pageLabel ?? "Page";
  const n = selection.items.length;
  const summary =
    n === 1
      ? `${pageLabel(pageId)} › ${labels[0] ?? "Block"}`
      : `${pageIds.size > 1 ? `${pageIds.size}개 쪽` : pageLabel(pageId)} › ${n}개 선택 (${labels.slice(0, 3).join(", ")}${n > 3 ? " …" : ""})`;
  let text = "";
  for (const [i, t] of texts.entries()) {
    if (!t) continue;
    const line = n === 1 ? t : `[${labels[i]}] ${t}`;
    if (text.length + line.length > total) break;
    text += (text ? "\n" : "") + line;
  }
  return { pageId, blockIds, slotIds, summary, text, linkedPaths, count };
}
