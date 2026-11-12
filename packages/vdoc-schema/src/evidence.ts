/**
 * 근거(Evidence) — 슬롯 내용이 "어디서 왔는가"의 단일 모델.
 *
 * 스튜디오에는 근거가 될 수 있는 자료 체계가 넷 있다. 서로 모르던 이 넷을 하나의 위치(locator)로 묶는다.
 *   backdata   문서에 붙은 백데이터 청크 (`doc.backdata`)
 *   resource   Resource Manager 원본 파일 · 웹 문서 (+ 섹터: PDF 영역 · 발췌)
 *   ref-region 참조 레이어 문서의 PDF 영역
 *   kcard      지식 덱(Auto-Index) 카드
 *
 * 슬롯 ↔ 근거 연결(`EvidenceLink`)은 문서에 저장된다 (`doc.evidenceLinks`). 사람이 붙이든, AI 가 채우면서
 * 인용하든 같은 링크가 남고, RM 강조 · 자동 선택 · 인용 이동 · 무효화 표시가 모두 이 링크를 읽는다.
 */
import type { VDocDocument, VDocSlot } from "./types";

export type EvidenceKind = "backdata" | "resource" | "sector" | "ref-region" | "kcard";

export interface EvidenceLocator {
  kind: EvidenceKind;
  /** 종류 안에서의 id — chunkId · resourceId · sectorId · regionId · `${deckId}:${cardId}` */
  refId: string;
  label: string;
  /** 원본 파일 경로 / URL (RM `pathOrUrl`, 덱 원본 경로). 원본 뷰어를 여는 열쇠. */
  sourcePath?: string;
  /** 참조 레이어 문서 id (ref-region) */
  docId?: string;
  deckId?: string;
  cardId?: string;
  resourceId?: string;
  /** 1부터 */
  page?: number | null;
  /** [ymin, xmin, ymax, xmax] 1000분율 (RM 섹터 · 참조 영역과 같은 좌표계) */
  bbox?: [number, number, number, number] | null;
  /** 원문 줄 범위 [시작, 끝] (1부터, 끝 포함) */
  lines?: [number, number] | null;
  /** 근거 발췌 (AI 컨텍스트 · 툴팁) */
  excerpt?: string;
  /** 근거를 붙일 때의 원문 지문 — 원문이 바뀌면 링크가 "변경됨(stale)"이 된다 */
  sourceSha?: string;
}

export type EvidenceTier = "direct" | "inherited" | "suggested";
export type EvidenceStatus = "ok" | "stale" | "missing";

export interface EvidenceLink {
  linkId: string;
  slotId: string;
  locator: EvidenceLocator;
  origin: "human" | "ai";
  harnessId?: string;
  runId?: string;
  createdAt: string;
  status?: EvidenceStatus;
  /** 본문 속 인용 표식 id (`<sup data-cite="…">`) — 인용 번호와 링크를 잇는다 */
  citationIds?: string[];
}

/** 근거 하나의 정체 — 같은 자료를 두 번 붙이지 않게 비교할 때 쓴다. */
export const evidenceKey = (loc: Pick<EvidenceLocator, "kind" | "refId">): string => `${loc.kind}:${loc.refId}`;

let seq = 0;
export const newEvidenceLinkId = (): string => `ev-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** 슬롯의 근거: 저장된 링크 + 예전 방식 백데이터 참조(`backDataRefs`)를 같은 모양으로. */
export function evidenceForSlot(doc: VDocDocument, slotId: string): EvidenceLink[] {
  const out: EvidenceLink[] = (doc.evidenceLinks ?? []).filter((l) => l.slotId === slotId);
  const seen = new Set(out.map((l) => evidenceKey(l.locator)));
  const slot = doc.slots[slotId];
  for (const chunkId of slot?.backDataRefs ?? []) {
    const chunk = doc.backdata[chunkId];
    if (!chunk) continue;
    const locator = backdataLocator(chunk);
    if (seen.has(evidenceKey(locator))) continue;
    seen.add(evidenceKey(locator));
    out.push({ linkId: `bd-${chunkId}`, slotId, locator, origin: "human", createdAt: chunk.updatedAt });
  }
  return out;
}

export function backdataLocator(chunk: VDocDocument["backdata"][string]): EvidenceLocator {
  return {
    ...(chunk.locator ?? {}),
    kind: "backdata",
    refId: chunk.chunkId,
    label: chunk.sourceTitle,
    excerpt: chunk.excerpt,
  };
}

/** 링크를 더한다 (같은 슬롯 · 같은 자료는 하나로 합치고 인용 id 만 모은다). */
export function addEvidenceLinks(doc: VDocDocument, links: EvidenceLink[]): VDocDocument {
  if (links.length === 0) return doc;
  const current = [...(doc.evidenceLinks ?? [])];
  for (const link of links) {
    const idx = current.findIndex((l) => l.slotId === link.slotId && evidenceKey(l.locator) === evidenceKey(link.locator));
    if (idx >= 0) {
      const prev = current[idx];
      current[idx] = {
        ...prev,
        locator: { ...prev.locator, ...link.locator },
        status: link.status ?? "ok",
        citationIds: [...new Set([...(prev.citationIds ?? []), ...(link.citationIds ?? [])])],
      };
    } else {
      current.push(link);
    }
  }
  return { ...doc, evidenceLinks: current };
}

export function removeEvidenceLink(doc: VDocDocument, linkId: string): VDocDocument {
  const next = (doc.evidenceLinks ?? []).filter((l) => l.linkId !== linkId);
  return next.length === (doc.evidenceLinks ?? []).length ? doc : { ...doc, evidenceLinks: next };
}

/** 원문 지문이 바뀐 근거를 `stale` 로 표시한다 (`currentSha(locator)` 가 undefined 면 판단하지 않는다). */
export function markStaleEvidence(
  doc: VDocDocument,
  currentSha: (loc: EvidenceLocator) => string | undefined
): VDocDocument {
  let changed = false;
  const next = (doc.evidenceLinks ?? []).map((l) => {
    const sha = currentSha(l.locator);
    if (!sha || !l.locator.sourceSha) return l;
    const status: EvidenceStatus = sha === l.locator.sourceSha ? "ok" : "stale";
    if (status === (l.status ?? "ok")) return l;
    changed = true;
    return { ...l, status };
  });
  return changed ? { ...doc, evidenceLinks: next } : doc;
}

/** 이 자료를 근거로 쓰는 슬롯들 (RM 항목 → 캔버스 역방향 강조). */
export function slotsUsingEvidence(doc: VDocDocument, match: (loc: EvidenceLocator) => boolean): string[] {
  const ids = new Set<string>();
  for (const link of doc.evidenceLinks ?? []) if (match(link.locator)) ids.add(link.slotId);
  for (const [slotId, slot] of Object.entries(doc.slots)) {
    for (const chunkId of slot.backDataRefs ?? []) {
      const chunk = doc.backdata[chunkId];
      if (chunk && match(backdataLocator(chunk))) ids.add(slotId);
    }
  }
  return [...ids];
}

/** 슬롯의 채움 메타를 바꾼다 (AI 적용 · 사람 편집 · 검증). */
export function withSlotFill(doc: VDocDocument, slotId: string, fill: VDocSlot["fill"]): VDocDocument {
  const slot = doc.slots[slotId];
  if (!slot) return doc;
  return { ...doc, slots: { ...doc.slots, [slotId]: { ...slot, fill } } };
}

// --- 내용 지문 · 채움 상태 ----------------------------------------------------------------

/** 슬롯 HTML 의 짧은 지문 (djb2). 변경안의 기준 버전 · 무효화 판단에 쓴다. */
export function contentHash(html: string): string {
  let h = 5381;
  const text = html ?? "";
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function slotPlainText(html: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** 비어 있는가: 글자가 없거나, 자리표시(placeholder) · 안내 문구(`[…]`, `○○○`, `내용 입력`)만 있다. */
export function isSlotEmpty(slot: Pick<VDocSlot, "content" | "constraints">): boolean {
  const text = slotPlainText(slot.content).replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (slot.constraints?.placeholder && text === slot.constraints.placeholder.trim()) return true;
  if (/^[○◯□_\-·.…\s]+$/.test(text)) return true;
  if (/^\(?\s*(내용|여기에|입력|작성)[^)]{0,20}\)?$/.test(text)) return true;
  return false;
}

export type SlotFillState = "locked" | "empty" | "staged" | "ai-draft" | "filled" | "verified";

/**
 * 슬롯의 채움 상태 (Phase 3 진행률 · 빈 칸 지도의 단위).
 * - locked: 잠긴 칸 · empty: 비어 있음
 * - staged: 승인 대기 변경안이 있다 · ai-draft: AI 가 쓴 뒤 사람이 검증하지 않았다
 * - verified: 사람이 확인했다 (AI 가 썼어도)
 */
export function slotFillState(slot: VDocSlot, stagedSlotIds?: ReadonlySet<string>): SlotFillState {
  if (slot.constraints?.locked) return "locked";
  if (stagedSlotIds?.has(slot.slotId)) return "staged";
  if (isSlotEmpty(slot)) return "empty";
  if (slot.fill?.verifiedAt) return "verified";
  if (slot.fill?.author === "ai") return "ai-draft";
  return "filled";
}

export interface FillProgress {
  total: number;
  empty: number;
  staged: number;
  aiDraft: number;
  filled: number;
  verified: number;
}

/** 채울 대상 슬롯들(고정 · 잠금 제외)의 진행률. */
export function fillProgress(slots: VDocSlot[], stagedSlotIds?: ReadonlySet<string>): FillProgress {
  const out: FillProgress = { total: 0, empty: 0, staged: 0, aiDraft: 0, filled: 0, verified: 0 };
  for (const slot of slots) {
    const state = slotFillState(slot, stagedSlotIds);
    if (state === "locked") continue;
    out.total++;
    if (state === "empty") out.empty++;
    else if (state === "staged") out.staged++;
    else if (state === "ai-draft") out.aiDraft++;
    else if (state === "verified") out.verified++;
    else out.filled++;
  }
  return out;
}

// --- 줄 수 제약 실측 (근사) -----------------------------------------------------------------

/**
 * 슬롯 너비 · 글꼴 크기로 한 줄에 들어가는 글자 수를 어림하고, 내용이 몇 줄이 될지 센다.
 * 화면 실측(DOM)이 정본이지만, 서버 게이트 · 일괄 채우기처럼 화면 없이 판단할 때 쓴다.
 */
export function estimateLines(html: string, opts: { widthPx?: number; fontSizePx?: number }): number {
  const width = opts.widthPx && opts.widthPx > 0 ? opts.widthPx : 520;
  const font = opts.fontSizePx && opts.fontSizePx > 0 ? opts.fontSizePx : 14;
  // 한글은 거의 정사각(1em), 영문 · 숫자는 약 0.55em
  const paragraphs = slotPlainText(html).split("\n").filter((p) => p.trim().length > 0);
  let lines = 0;
  for (const p of paragraphs) {
    let em = 0;
    for (const ch of p) em += /[ㄱ-힝一-鿿]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.55;
    lines += Math.max(1, Math.ceil((em * font) / width));
  }
  return lines;
}
