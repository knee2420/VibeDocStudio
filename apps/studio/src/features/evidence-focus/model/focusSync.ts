import { useEffect } from "react";

import type { ContextProvider, ContextRef } from "@vibe/ai-kernel";
import { slotsUsingEvidence, type EvidenceLocator, type ResourceItem, type VDocDocument } from "@vibe/vdoc-schema";

import { resolveSlotEvidence, useEvidenceFocusStore, type FocusEvidence } from "@/entities/evidence";
import { useResourceStore } from "@/entities/resource";
import { useSlotSelectionStore } from "@/entities/slot";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { aiRuntime } from "@/shared/ai";

/**
 * 근거 초점 동기화 — 캔버스에서 칸(또는 칸 범위)을 고르면:
 *   1) 그 칸의 근거(direct) + 같은 블록 이웃 칸의 근거(inherited)를 초점으로 잡고
 *   2) RM 트리 · 섹터 · 덱 카드가 그 초점을 칠하고 (auto-highlight)
 *   3) "초점 따라가기"가 켜져 있으면 RM 이 그 자료까지 펼쳐 스크롤한다 (auto-select — 체크는 건드리지 않는다)
 *   4) Composer 에는 "초점 근거"가 첨부 제안으로 뜬다
 */
const MAX_FOCUS = 12;
let followTimer: number | undefined;

function focusFor(doc: VDocDocument | undefined, slotIds: string[]): FocusEvidence[] {
  if (!doc) return [];
  const out: FocusEvidence[] = [];
  const seen = new Set<string>();
  for (const slotId of slotIds) {
    for (const c of resolveSlotEvidence(doc, slotId)) {
      if (c.tier === "suggested") continue;
      const key = `${c.locator.kind}:${c.locator.refId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ locator: c.locator, tier: c.tier });
      if (out.length >= MAX_FOCUS) return out;
    }
  }
  return out;
}

/** 자료까지 가는 폴더 경로 (위에서부터). */
function folderPathTo(items: ResourceItem[], targetId: string, trail: string[] = []): string[] | null {
  for (const it of items) {
    if (it.id === targetId) return trail;
    if (it.children?.length) {
      const found = folderPathTo(it.children, targetId, [...trail, it.id]);
      if (found) return found;
    }
  }
  return null;
}

/** 초점 자료를 RM 에서 보이게 한다 — 접힌 상위 폴더를 펴고, 그 줄로 스크롤. */
function followInRm(resourceIds: ReadonlySet<string>) {
  const first = [...resourceIds][0];
  if (!first || typeof window === "undefined") return;
  const rm = useResourceStore.getState();
  const path = folderPathTo(rm.items, first);
  if (!path) return;
  const collapsed = new Set(rm.collapsedFolderIds);
  for (const folderId of path) if (collapsed.has(folderId)) rm.toggleFolderCollapse(folderId);
  window.clearTimeout(followTimer);
  followTimer = window.setTimeout(() => {
    document.querySelector(`[data-rm-item="${CSS.escape(first)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, 60);
}

/** 스튜디오에서 한 번 건다. */
export function useEvidenceFocusSync(): void {
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const rangeKey = useSlotSelectionStore((s) => s.slotRange?.slotIds.join(",") ?? "");
  // 근거 링크가 바뀔 때만 다시 계산 (본문 타이핑마다 돌지 않게) — 링크 배열은 링크가 바뀔 때만 새로 만들어진다
  const linkKey = useStudioDocumentStore((s) => selectActiveDocument(s)?.evidenceLinks);
  const docId = useStudioDocumentStore((s) => s.activeDocId);

  useEffect(() => {
    const slotIds = rangeKey ? rangeKey.split(",") : selectedSlotId ? [selectedSlotId] : [];
    const current = useStudioDocumentStore.getState();
    const activeDoc = selectActiveDocument(current);
    const evidence = focusFor(activeDoc, slotIds);
    const store = useEvidenceFocusStore.getState();
    store.setFocus(slotIds, evidence);
    if (store.follow && evidence.length) followInRm(useEvidenceFocusStore.getState().focusResourceIds);
  }, [selectedSlotId, rangeKey, linkKey, docId]);
}

// --- 역방향: RM · 덱 항목 → 그 자료를 쓰는 칸 -------------------------------------------

const activeDoc = () => selectActiveDocument(useStudioDocumentStore.getState());

export function slotsUsingResource(item: ResourceItem): string[] {
  const doc = activeDoc();
  if (!doc) return [];
  const sectorIds = new Set((item.sectors ?? []).map((s) => s.sectorId));
  return slotsUsingEvidence(
    doc,
    (l: EvidenceLocator) =>
      l.resourceId === item.id ||
      (l.kind === "resource" && l.refId === item.id) ||
      (l.kind === "sector" && sectorIds.has(l.refId)) ||
      (!!item.pathOrUrl && l.sourcePath === item.pathOrUrl)
  );
}

export function slotsUsingCard(deckId: string, cardId?: string): string[] {
  const doc = activeDoc();
  if (!doc) return [];
  return slotsUsingEvidence(
    doc,
    (l) => l.kind === "kcard" && (cardId ? l.refId === `${deckId}:${cardId}` : (l.deckId ?? l.refId.split(":")[0]) === deckId)
  );
}

// --- Composer: 초점 근거 첨부 제안 ------------------------------------------------------

export const FOCUS_EVIDENCE_KIND = "evidence-focus";

function focusRef(): ContextRef | null {
  const { focusEvidence, focusSlotIds } = useEvidenceFocusStore.getState();
  const usable = focusEvidence.filter((e) => e.locator.excerpt?.trim() || e.locator.kind === "kcard");
  if (!usable.length) return null;
  const lines = usable.map((e, i) => {
    const l = e.locator;
    const where = [l.sourcePath, l.page ? `p.${l.page}` : "", l.lines ? `L${l.lines[0]}-L${l.lines[1]}` : ""].filter(Boolean).join(" ");
    return `<evidence n="${i + 1}" kind="${l.kind}" tier="${e.tier}" ref="${l.refId}"${where ? ` where="${where}"` : ""}>\n${(l.excerpt ?? "").slice(0, 1200)}\n</evidence>`;
  });
  return {
    kind: FOCUS_EVIDENCE_KIND,
    id: `focus:${focusSlotIds.join(",")}`,
    label: `초점 근거 ${usable.length}`,
    hint: usable.map((e) => e.locator.label).join(" · ").slice(0, 160),
    access: "read",
    role: "reference",
    content: [`지금 고른 칸(${focusSlotIds.join(", ")})에 이어진 근거 — direct 는 그 칸의 근거, inherited 는 같은 블록 이웃 칸의 근거다.`, ...lines].join("\n"),
  };
}

export const FOCUS_EVIDENCE_PROVIDER: ContextProvider = {
  id: "evidence-focus",
  label: "초점 근거",
  suggest: true,
  current: () => {
    const ref = focusRef();
    return ref ? [ref] : [];
  },
};

export function registerEvidenceFocusAi(): () => void {
  return aiRuntime.contexts.register(FOCUS_EVIDENCE_PROVIDER);
}
