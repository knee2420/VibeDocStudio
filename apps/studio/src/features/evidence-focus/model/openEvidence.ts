import { setCitationClickHandler } from "@vibe/slot-editor";
import { evidenceForSlot, type EvidenceLink, type EvidenceLocator, type ResourceItem } from "@vibe/vdoc-schema";

import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { flattenResourceItems, useResourceStore } from "@/entities/resource";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceSessionStore } from "@/entities/workspace-session";
import { aiRuntime } from "@/shared/ai";

import { useEvidenceFocusStore } from "@/entities/evidence";

/**
 * 근거 위치(locator) → 그 자리를 화면에 연다 (헵타베이스식 "원본 위치로 점프").
 *
 *   kcard       지식 덱 카드 미리보기 + 원문(근거 줄) 펼침
 *   sector      RM 원본 뷰어 — 그 페이지로 스크롤하고 영역 상자를 그린다
 *   resource    RM 원본 뷰어 — 줄 범위가 있으면 그 줄을 칠한다
 *   ref-region  참조 작업창 + 영역 상자 (작업대 엔티티 해석기)
 *   backdata    백데이터를 쓰는 칸으로 이동 (작업대 엔티티 해석기)
 *
 * 열 수 없으면 false — 부르는 쪽이 "원본을 찾지 못함"을 알린다.
 */
export function openEvidence(locator: EvidenceLocator): boolean {
  switch (locator.kind) {
    case "kcard": {
      const [deckId, cardId] = locator.deckId && locator.cardId ? [locator.deckId, locator.cardId] : splitCardRef(locator.refId);
      if (!deckId || !cardId) return false;
      useKnowledgeDeckStore.getState().openCardPreview(deckId, cardId, { showSource: true });
      return true;
    }
    case "sector":
    case "resource":
      return openResource(locator);
    case "ref-region": {
      const entity = aiRuntime.entities.lookup(locator.refId, "ref-region");
      if (entity?.reveal) {
        entity.reveal();
        return true;
      }
      const docId = locator.docId ?? locator.refId;
      if (!useStudioDocumentStore.getState().docs.some((d) => d.docId === docId)) return false;
      useWorkspaceSessionStore.getState().openReferenceDoc(docId);
      return true;
    }
    case "backdata": {
      const entity = aiRuntime.entities.lookup(locator.refId, "backdata");
      if (!entity?.reveal) return false;
      entity.reveal();
      return true;
    }
    default:
      return false;
  }
}

function splitCardRef(refId: string): [string | undefined, string | undefined] {
  const i = refId.lastIndexOf(":");
  return i > 0 ? [refId.slice(0, i), refId.slice(i + 1)] : [undefined, undefined];
}

/** RM 트리에서 자료를 찾고, 없으면(RM 을 아직 안 열었거나 지운 자료) 경로만으로 뷰어를 연다. */
function openResource(locator: EvidenceLocator): boolean {
  const items = flattenResourceItems(useResourceStore.getState().items);
  let item: ResourceItem | undefined;
  let page = locator.page ?? null;
  let bbox = locator.bbox ?? null;
  if (locator.kind === "sector") {
    for (const it of items) {
      const sector = it.sectors?.find((s) => s.sectorId === locator.refId);
      if (sector) {
        item = it;
        page = page ?? sector.page ?? null;
        bbox = bbox ?? sector.bbox ?? null;
        break;
      }
    }
  }
  item ??= items.find((it) => it.id === (locator.resourceId ?? locator.refId));
  item ??= locator.sourcePath ? items.find((it) => it.pathOrUrl === locator.sourcePath) : undefined;
  if (!item && locator.sourcePath) item = syntheticItem(locator);
  if (!item) return false;
  useResourceStore.getState().openPreview(item, { page, bbox, lines: locator.lines ?? null, label: locator.label });
  return true;
}

function syntheticItem(locator: EvidenceLocator): ResourceItem {
  const path = locator.sourcePath ?? "";
  const dot = path.lastIndexOf(".");
  const isWeb = /^https?:\/\//.test(path);
  return {
    id: `evidence:${locator.kind}:${locator.refId}`,
    type: isWeb ? "web" : "file",
    title: locator.label || path,
    pathOrUrl: path,
    extension: !isWeb && dot > 0 ? path.slice(dot).toLowerCase() : undefined,
    isChecked: false,
    sectors: [],
  };
}

/** 칸 안 인용 번호 `[n]` → 그 칸의 근거 링크. 번호가 링크에 없으면(예전 데이터) n 번째 AI 근거로 본다. */
export function findCitationLink(slotId: string, citeId: string): EvidenceLink | null {
  const doc = useStudioDocumentStore.getState().docs.find((d) => d.slots[slotId]);
  if (!doc) return null;
  const links = evidenceForSlot(doc, slotId);
  const exact = links.find((l) => l.citationIds?.includes(citeId));
  if (exact) return exact;
  const n = Number(citeId);
  const cited = links.filter((l) => l.origin === "ai");
  return Number.isInteger(n) && n >= 1 ? cited[n - 1] ?? null : null;
}

/** 근거 링크를 열고, 그 근거를 쓰는 칸을 잠깐 빛낸다. */
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

export function openEvidenceLink(link: EvidenceLink): boolean {
  const focus = useEvidenceFocusStore.getState();
  focus.setHighlightedSlots([link.slotId]);
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    // 그사이 다른 강조(RM 호버 등)로 바뀌었으면 건드리지 않는다
    const now = useEvidenceFocusStore.getState().highlightedSlotIds;
    if (now.size === 1 && now.has(link.slotId)) useEvidenceFocusStore.getState().clearHighlightedSlots();
  }, 2500);
  return openEvidence(link.locator);
}

/** 편집기 인용 표식 클릭을 근거 열기에 잇는다 (스튜디오에서 한 번). */
export function registerCitationNavigation(): () => void {
  setCitationClickHandler((slotId, citeId, anchor) => {
    const link = findCitationLink(slotId, citeId);
    if (link && openEvidenceLink(link)) return;
    anchor.setAttribute("title", "이 인용의 근거를 찾지 못했습니다 (근거 링크가 지워졌거나 원본이 없음)");
    anchor.animate?.([{ background: "#fee2e2" }, { background: "transparent" }], { duration: 900 });
  });
  return () => setCitationClickHandler(null);
}
