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
import { htmlToPlainText } from "./html-text";
import type { VDocDocument, VDocSlot } from "./types";

export type EvidenceKind = "backdata" | "resource" | "sector" | "ref-region" | "kcard";

/** 근거의 논리적 성격 — 단순 출처 · 산출 근거 · 원문 직접 인용 · 요구사항 충족 매핑. */
export type EvidenceRelation = "supports" | "derives" | "quotes" | "fulfills";

/** 문서/아웃라인에서의 근거 표현 방식 (단일 데이터 모델 → 다중 렌더 모드). */
export type EvidencePresentation =
  | "footnote"
  | "inline-rationale"
  | "sidenote"
  | "quote-embed"
  | "matrix"
  | "bound-value"
  | "hidden";

export interface EvidenceLocator {
  kind: EvidenceKind;
  /** 종류 안에서의 id — chunkId · resourceId · sectorId · regionId · `${deckId}:${cardId}` */
  refId: string;
  label: string;
  /** 원본 파일 경로 / URL (RM `pathOrUrl`, 덱 원본 경로). 원본 뷰어를 여는 열쇠. */
  sourcePath?: string;
  /** 외부 웹 URL (웹페이지 리소스용) */
  url?: string;
  /** 참조 레이어 문서 id (ref-region) */
  docId?: string;
  deckId?: string;
  cardId?: string;
  resourceId?: string;
  /** 아웃라인 노드 앵커 (`#node:<id>`) */
  nodeId?: string;
  /** VDoc 슬롯 앵커 (`#slot:<id>`) */
  slotId?: string;
  /** `.ref` 블록 앵커 (`#block:<id>`) */
  blockId?: string;
  /** 1부터 */
  page?: number | null;
  /** [ymin, xmin, ymax, xmax] 1000분율 (RM 섹터 · 참조 영역과 같은 좌표계) */
  bbox?: [number, number, number, number] | null;
  /** 원문 줄 범위 [시작, 끝] (1부터, 끝 포함) */
  lines?: [number, number] | null;
  /** 근거 발췌 (AI 컨텍스트 · 툴팁 · 원문 직접 인용) */
  excerpt?: string;
  /** 근거를 붙일 때의 원문 지문 — 원문이 바뀌면 링크가 "변경됨(stale)"이 된다 */
  sourceSha?: string;
  /** 근거 성격 (기본 supports) */
  relation?: EvidenceRelation;
  /** 표현 방식 (기본 footnote) */
  presentation?: EvidencePresentation;
  /** 산출 근거 설명 한 줄 (예: "백데이터 참석 설문지 35명 + 추가 신청 메일 3명 합산") */
  rationale?: string;
  /** 근거 바인딩 수치/팩트 값 (Case 6 bound-value 용, 예: "38명") */
  boundValue?: string;
  /** 근거 바인딩 산식/추출 규칙 (Case 6 bound-value 용, 예: "COUNT(참석_설문지.csv#L2-L36) + 3") */
  boundFormula?: string;
  /** 요구사항/항목 추적 ID (Case 5 1:N 매트릭스 용, 예: "REQ-SEC-01") */
  requirementId?: string;
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
  /** 근거 성격 (생략 시 locator.relation 또는 "supports") */
  relation?: EvidenceRelation;
  /** 표현 방식 (생략 시 locator.presentation 또는 "footnote") */
  presentation?: EvidencePresentation;
  /** 산출 근거 설명 한 줄 (생략 시 locator.rationale) */
  rationale?: string;
}

/** 1:N 역추적용 원천 식별 키 (동일 원본 파일 · 페이지 · 줄 범위를 하나의 출처로 묶는다). */
export function evidenceSourceKey(loc: Pick<EvidenceLocator, "kind" | "refId" | "sourcePath" | "page" | "lines">): string {
  const base = loc.sourcePath ? loc.sourcePath.replace(/\\/g, "/").toLowerCase() : `${loc.kind}:${loc.refId}`;
  const pagePart = loc.page ? `#p${loc.page}` : "";
  const linePart = loc.lines && loc.lines.length >= 2 ? `#L${loc.lines[0]}-${loc.lines[1]}` : "";
  return `${base}${pagePart}${linePart}`;
}

export interface EvidenceBacklinkGroup {
  readonly sourceKey: string;
  readonly citationNumber: number;
  readonly locator: EvidenceLocator;
  readonly targets: readonly { readonly id: string; readonly label: string }[];
}

/**
 * 문서/아웃라인의 모든 근거를 출처 단위로 정규화해 각주 번호(1..N)와 1:N 역인덱스를 계산한다.
 * 같은 원본 구간을 여러 슬롯/불릿에서 인용하면 동일한 각주 번호를 공유하고 `targets` 에 N곳이 모인다.
 */
export function buildEvidenceBacklinkIndex(
  entries: readonly { readonly targetId: string; readonly targetLabel: string; readonly locator: EvidenceLocator }[]
): {
  readonly groups: readonly EvidenceBacklinkGroup[];
  readonly citationNumberBySourceKey: ReadonlyMap<string, number>;
} {
  const byKey = new Map<
    string,
    { citationNumber: number; locator: EvidenceLocator; targets: { id: string; label: string }[]; seenTargets: Set<string> }
  >();
  const citationNumberBySourceKey = new Map<string, number>();
  let nextNum = 1;

  for (const entry of entries) {
    const key = evidenceSourceKey(entry.locator);
    let bucket = byKey.get(key);
    if (!bucket) {
      const num = nextNum++;
      bucket = { citationNumber: num, locator: entry.locator, targets: [], seenTargets: new Set() };
      byKey.set(key, bucket);
      citationNumberBySourceKey.set(key, num);
    }
    if (!bucket.seenTargets.has(entry.targetId)) {
      bucket.seenTargets.add(entry.targetId);
      bucket.targets.push({ id: entry.targetId, label: entry.targetLabel });
    }
  }

  const groups: EvidenceBacklinkGroup[] = [...byKey.entries()].map(([sourceKey, b]) => ({
    sourceKey,
    citationNumber: b.citationNumber,
    locator: b.locator,
    targets: b.targets,
  }));

  return { groups, citationNumberBySourceKey };
}

// ============================================================================
// 편집 가능한 하위 불릿 근거 문법 (`<<cite:...>>`) 파서 · 추출기
// ============================================================================

const CITE_DIRECTIVE_RE = /^<<\s*cite(?:\s*:\s*([^>\n]+))?\s*>>(.*)$/i;
const RESOURCE_TAG_RE = /<<\s*resource\s*:\s*([^>\n]+)\s*>>/gi;
const RESOURCE_SINGLE_RE = /^<<\s*resource\s*:\s*([^>\n]+)\s*>>$/i;
const WIKILINK_RE = /\[\[([^\[\]\n]+)\]\]/g;
const PAGE_TAG_RE = /#p(\d+)\b/i;
const LINE_TAG_RE = /#L(\d+)(?:-L?(\d+))?\b/i;
const BBOX_TAG_RE = /[@#]bbox\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/i;
const NODE_TAG_RE = /#node:([^\s|\]>]+)/i;
const SLOT_TAG_RE = /#slot:([^\s|\]>]+)/i;
const BLOCK_TAG_RE = /#block:([^\s|\]>]+)/i;
const HEADING_TAG_RE = /#heading:([^\s|\]>]+)/i;
const REQ_TAG_RE = /@([A-Za-z0-9_-]+)/;
const BOUND_HEADER_RE = /\{([^}]+)\}(?:\s*=\s*(.+))?$/;

export interface ParsedResourceTag {
  /** 원문 `<<resource: ...>>` 토큰 전체 */
  readonly raw: string;
  /** 대상 주소 (외부 `https://...` URL, `vault://...`, 또는 볼트 파일 경로/이름) */
  readonly target: string;
  /** 표시용 짧은 라벨 (파일명 또는 호스트명) */
  readonly label: string;
  /** 외부 웹 URL 여부 */
  readonly isWebUrl: boolean;
  /** 1-based 페이지 번호 (`#p5`) */
  readonly page?: number;
  /** 1-based 줄 범위 (`#L2-L12`) */
  readonly lines?: readonly [number, number];
  /** 0..1000 정규화 사각형 좌표 `[ymin, xmin, ymax, xmax]` (`#bbox(...)`) */
  readonly bbox?: readonly [number, number, number, number];
  /** 아웃라인 불릿 ID (`#node:<id>`) */
  readonly nodeId?: string;
  /** VDoc 슬롯 ID (`#slot:<id>`) */
  readonly slotId?: string;
  /** `.ref` 블록 ID (`#block:<id>`) */
  readonly blockId?: string;
  /** 마크다운 헤딩 앵커 (`#heading:...`) */
  readonly heading?: string;
  /** 직접 인용 본문 (`|` 뒤 내용) */
  readonly quote?: string;
  /** 선택적 컴파일 표현 방식 (`footnote`, `rationale`, `sidenote`, `quote-embed`, `matrix`, `bound-value`) */
  readonly presentation?: EvidencePresentation;
}

function shortenTargetLabel(target: string, isWebUrl: boolean): string {
  if (isWebUrl) {
    try {
      const u = new URL(target);
      const seg = u.pathname.split("/").filter(Boolean).pop();
      return seg && seg.length <= 24 ? `${u.hostname}/${seg}` : u.hostname;
    } catch {
      return target.slice(0, 32);
    }
  }
  const clean = target.replace(/^vault:\/\//i, "");
  return clean.split("/").pop() || clean;
}

/**
 * 통합 리소스 태그 `<<resource: {url 또는 경로} [위치 주소] | {본문 인용}>>` 를 파싱한다.
 * - 웹 URL: `<<resource: https://www.besteleven.com/... | 인용 문장>>`
 * - PDF 5페이지: `<<resource: [[제안요청서.pdf]] #p5 | 보안 요구사항>>` 또는 `<<resource: [[제안요청서.pdf#p5]] | ...>>`
 * - 줄/영역/노드/슬롯/블록: `#L2-L12`, `#bbox(120,80,450,920)`, `#node:id`, `#slot:id`, `#block:id`, `#heading:...`
 */
export function parseResourceTag(
  rawText: string,
  options: ParseCiteBulletOptions = {}
): ParsedResourceTag | null {
  const trimmed = rawText.trim();
  const match = RESOURCE_SINGLE_RE.exec(trimmed);
  if (!match) return null;
  const inner = (match[1] ?? "").trim();
  if (!inner) return null;

  const pipeIdx = inner.indexOf("|");
  const addressPart = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
  const quoteRaw = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : "";
  const quote = quoteRaw.length > 0 ? quoteRaw : undefined;

  // 1. 앵커 메타 추출 (위치 주소가 `[[파일#p5]]` 내부에 있든 바깥에 있든 동일하게 인식)
  const pageM = PAGE_TAG_RE.exec(addressPart);
  const lineM = LINE_TAG_RE.exec(addressPart);
  const bboxM = BBOX_TAG_RE.exec(addressPart);
  const nodeM = NODE_TAG_RE.exec(addressPart);
  const slotM = SLOT_TAG_RE.exec(addressPart);
  const blockM = BLOCK_TAG_RE.exec(addressPart);
  const headingM = HEADING_TAG_RE.exec(addressPart);

  const page = pageM ? Number.parseInt(pageM[1], 10) : undefined;
  const lines: readonly [number, number] | undefined = lineM
    ? [Number.parseInt(lineM[1], 10), Number.parseInt(lineM[2] ?? lineM[1], 10)]
    : undefined;
  const bbox: readonly [number, number, number, number] | undefined = bboxM
    ? [
        Number.parseFloat(bboxM[1]),
        Number.parseFloat(bboxM[2]),
        Number.parseFloat(bboxM[3]),
        Number.parseFloat(bboxM[4]),
      ]
    : undefined;
  const nodeId = nodeM ? nodeM[1].trim() : undefined;
  const slotId = slotM ? slotM[1].trim() : undefined;
  const blockId = blockM ? blockM[1].trim() : undefined;
  const heading = headingM ? headingM[1].trim() : undefined;

  // 2. 대상 주소(target) 추출
  let rawTarget = "";
  let explicitAlias = "";
  WIKILINK_RE.lastIndex = 0;
  const wikiM = WIKILINK_RE.exec(addressPart);
  if (wikiM) {
    const wikiInner = (wikiM[1] ?? "").trim();
    const aliasSep = wikiInner.indexOf("|");
    const linkOnly = aliasSep >= 0 ? wikiInner.slice(0, aliasSep).trim() : wikiInner;
    explicitAlias = aliasSep >= 0 ? wikiInner.slice(aliasSep + 1).trim() : "";
    const hashSep = linkOnly.indexOf("#");
    rawTarget = hashSep >= 0 ? linkOnly.slice(0, hashSep).trim() : linkOnly;
  } else {
    // Strip anchor tokens to isolate URL or vault path (preserve spaces in Korean folder/file names)
    const cleaned = addressPart
      .replace(BBOX_TAG_RE, "")
      .replace(NODE_TAG_RE, "")
      .replace(SLOT_TAG_RE, "")
      .replace(BLOCK_TAG_RE, "")
      .replace(HEADING_TAG_RE, "")
      .replace(LINE_TAG_RE, "")
      .replace(PAGE_TAG_RE, "")
      .trim();
    if (/^https?:\/\//i.test(cleaned)) {
      rawTarget = cleaned.split(/\s+/)[0] ?? "";
    } else {
      // Remove trailing anchor on non-URL paths while preserving internal spaces in paths
      const hashSep = cleaned.indexOf("#");
      rawTarget = (hashSep >= 0 ? cleaned.slice(0, hashSep) : cleaned).trim();
    }
  }

  if (!rawTarget) return null;

  const isWebUrl = /^https?:\/\//i.test(rawTarget);
  const resolved = !isWebUrl ? options.resolveSourcePath?.(rawTarget) : undefined;
  const target = resolved ?? rawTarget;
  const label = explicitAlias || shortenTargetLabel(rawTarget, isWebUrl);

  return {
    raw: trimmed,
    target,
    label,
    isWebUrl,
    ...(page ? { page } : {}),
    ...(lines ? { lines } : {}),
    ...(bbox ? { bbox } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(slotId ? { slotId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(heading ? { heading } : {}),
    ...(quote ? { quote } : {}),
    presentation: quote ? "quote-embed" : "footnote",
  };
}

/** 임의의 본문 문자열(마크다운·아웃라인) 안에 포함된 모든 `<<resource: ...>>` 태그를 위치와 함께 추출한다. */
export function extractResourceTagsInText(
  text: string,
  options: ParseCiteBulletOptions = {}
): Array<{ readonly from: number; readonly to: number; readonly parsed: ParsedResourceTag }> {
  if (!text || !text.includes("<<")) return [];
  const out: Array<{ readonly from: number; readonly to: number; readonly parsed: ParsedResourceTag }> = [];
  RESOURCE_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RESOURCE_TAG_RE.exec(text)) !== null) {
    const parsed = parseResourceTag(m[0], options);
    if (parsed) {
      out.push({ from: m.index, to: m.index + m[0].length, parsed });
    }
  }
  return out;
}

function mapCiteKind(rawKind: string): {
  presentation: EvidencePresentation;
  relation: EvidenceRelation;
} {
  const k = rawKind.trim().toLowerCase();
  if (k === "rationale" || k === "inline-rationale" || k === "산출근거" || k === "근거") {
    return { presentation: "inline-rationale", relation: "derives" };
  }
  if (k === "sidenote" || k === "여백주석" || k === "여백") {
    return { presentation: "sidenote", relation: "supports" };
  }
  if (k === "quote" || k === "quote-embed" || k === "직접인용" || k === "인용") {
    return { presentation: "quote-embed", relation: "quotes" };
  }
  if (k === "matrix" || k === "추적" || k === "매트릭스") {
    return { presentation: "matrix", relation: "fulfills" };
  }
  if (k === "bound" || k === "bound-value" || k === "바인딩" || k === "팩트") {
    return { presentation: "bound-value", relation: "derives" };
  }
  if (k === "hidden" || k === "숨김") {
    return { presentation: "hidden", relation: "supports" };
  }
  return { presentation: "footnote", relation: "supports" };
}

export interface ParseCiteBulletOptions {
  /** `[[파일명]]` 같은 짧은 출처 표기를 `vault://...` 등 정본 경로로 해석하는 선택 리졸버. */
  readonly resolveSourcePath?: (rawTarget: string) => string | undefined;
}

/**
 * 일반 편집 가능한 하위 불릿(`<<cite:...>> ...`)을 1개 이상의 `EvidenceLocator` 로 파싱한다.
 * `<<cite:...>>` 로 시작하지 않으면 `null` 을 반환해 일반 본문 불릿으로 유지한다.
 */
export function parseCiteBullet(
  rawText: string,
  options: ParseCiteBulletOptions = {}
): EvidenceLocator[] | null {
  const trimmed = rawText.trim();
  const parsedRes = parseResourceTag(trimmed, options);
  if (parsedRes) {
    const locKind: EvidenceKind = parsedRes.target.toLowerCase().endsWith(".csv")
      ? "backdata"
      : "resource";
    return [
      {
        kind: locKind,
        refId: `${parsedRes.target}${parsedRes.page ? `#p${parsedRes.page}` : ""}${parsedRes.lines ? `#L${parsedRes.lines[0]}-${parsedRes.lines[1]}` : ""}${parsedRes.nodeId ? `#node:${parsedRes.nodeId}` : ""}${parsedRes.slotId ? `#slot:${parsedRes.slotId}` : ""}${parsedRes.blockId ? `#block:${parsedRes.blockId}` : ""}`,
        label: parsedRes.label,
        sourcePath: parsedRes.target,
        ...(parsedRes.isWebUrl ? { url: parsedRes.target } : {}),
        ...(parsedRes.page ? { page: parsedRes.page } : {}),
        ...(parsedRes.lines ? { lines: [parsedRes.lines[0], parsedRes.lines[1]] as [number, number] } : {}),
        ...(parsedRes.bbox ? { bbox: [parsedRes.bbox[0], parsedRes.bbox[1], parsedRes.bbox[2], parsedRes.bbox[3]] as [number, number, number, number] } : {}),
        ...(parsedRes.nodeId ? { nodeId: parsedRes.nodeId } : {}),
        ...(parsedRes.slotId ? { slotId: parsedRes.slotId } : {}),
        ...(parsedRes.blockId ? { blockId: parsedRes.blockId } : {}),
        ...(parsedRes.quote ? { excerpt: parsedRes.quote } : {}),
        relation: parsedRes.quote ? "quotes" : "supports",
        presentation: parsedRes.quote ? "quote-embed" : "footnote",
      },
    ];
  }
  const match = CITE_DIRECTIVE_RE.exec(trimmed);
  if (!match) return null;

  const headerInner = (match[1] ?? "footnote").trim();
  const body = (match[2] ?? "").trim();

  // 헤더 첫 단어 = 표현 종류 (`footnote`, `rationale`, `sidenote`, `quote`, `matrix`, `bound`)
  const firstSpace = headerInner.search(/\s/);
  const kindToken = firstSpace >= 0 ? headerInner.slice(0, firstSpace) : headerInner;
  const headerRest = firstSpace >= 0 ? headerInner.slice(firstSpace + 1).trim() : "";

  const { presentation, relation } = mapCiteKind(kindToken || "footnote");
  const reqMatch = REQ_TAG_RE.exec(headerRest);
  const requirementId = reqMatch ? reqMatch[1] : undefined;
  const boundMatch = BOUND_HEADER_RE.exec(headerRest);
  const boundValue = boundMatch ? boundMatch[1].trim() : undefined;
  const boundFormula = boundMatch && boundMatch[2] ? boundMatch[2].trim() : undefined;

  const segments = body
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  interface SourceSpec {
    rawTarget: string;
    label: string;
    page?: number;
    lines?: [number, number];
  }

  const sources: SourceSpec[] = [];
  const textNotes: string[] = [];

  for (const seg of segments) {
    WIKILINK_RE.lastIndex = 0;
    const wikiMatches = [...seg.matchAll(WIKILINK_RE)];
    if (wikiMatches.length > 0) {
      const pageM = PAGE_TAG_RE.exec(seg);
      const lineM = LINE_TAG_RE.exec(seg);
      const page = pageM ? Number.parseInt(pageM[1], 10) : undefined;
      const lines: [number, number] | undefined = lineM
        ? [
            Number.parseInt(lineM[1], 10),
            Number.parseInt(lineM[2] ?? lineM[1], 10),
          ]
        : undefined;
      for (const wm of wikiMatches) {
        const inner = (wm[1] ?? "").trim();
        const pipeIdx = inner.indexOf("|");
        const target = pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : inner;
        const label = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : target.split("/").pop() || target;
        if (target) {
          sources.push({ rawTarget: target, label, page, lines });
        }
      }
      // 같은 세그먼트 안에 링크/태그 외에 남은 부연 설명이 있으면 노트에도 보존
      const leftover = seg
        .replace(WIKILINK_RE, "")
        .replace(PAGE_TAG_RE, "")
        .replace(LINE_TAG_RE, "")
        .trim();
      if (leftover) textNotes.push(leftover);
    } else if (/^vault:\/\//i.test(seg)) {
      const urlToken = seg.split(/\s+/)[0];
      const pageM = PAGE_TAG_RE.exec(seg);
      const lineM = LINE_TAG_RE.exec(seg);
      sources.push({
        rawTarget: urlToken,
        label: urlToken.replace(/^vault:\/\//i, "").split("/").pop() || urlToken,
        page: pageM ? Number.parseInt(pageM[1], 10) : undefined,
        lines: lineM
          ? [Number.parseInt(lineM[1], 10), Number.parseInt(lineM[2] ?? lineM[1], 10)]
          : undefined,
      });
    } else {
      textNotes.push(seg);
    }
  }

  const noteText = textNotes.join(" · ").trim() || undefined;
  const rationale =
    presentation === "inline-rationale" || presentation === "bound-value"
      ? noteText
      : undefined;
  const excerpt =
    presentation === "inline-rationale"
      ? undefined
      : noteText;

  if (sources.length === 0) {
    // 출처 링크 없이 산출 근거/메모만 먼저 적은 경우에도 편집 중 깨지지 않게 단일 로케이터로 유지
    return [
      {
        kind: "backdata",
        refId: `cite-note:${(noteText ?? headerInner).slice(0, 32)}`,
        label: noteText ?? headerInner,
        relation,
        presentation,
        ...(rationale ? { rationale } : {}),
        ...(excerpt ? { excerpt } : {}),
        ...(boundValue ? { boundValue } : {}),
        ...(boundFormula ? { boundFormula } : {}),
        ...(requirementId ? { requirementId } : {}),
      },
    ];
  }

  return sources.map((src, idx) => {
    const resolved = options.resolveSourcePath?.(src.rawTarget);
    const sourcePath = resolved ?? src.rawTarget;
    const locKind: EvidenceKind = src.rawTarget.toLowerCase().endsWith(".csv") ? "backdata" : "resource";
    return {
      kind: locKind,
      refId: `${src.rawTarget}${src.page ? `#p${src.page}` : ""}${src.lines ? `#L${src.lines[0]}-${src.lines[1]}` : ""}:${idx}`,
      label: src.label,
      sourcePath,
      ...(src.page ? { page: src.page } : {}),
      ...(src.lines ? { lines: src.lines } : {}),
      relation,
      presentation,
      ...(rationale ? { rationale } : {}),
      ...(excerpt ? { excerpt } : {}),
      ...(boundValue ? { boundValue } : {}),
      ...(boundFormula ? { boundFormula } : {}),
      ...(requirementId ? { requirementId } : {}),
    };
  });
}

export interface OutlineCiteTreeNode {
  readonly id: string;
  readonly text: string;
  readonly children?: readonly OutlineCiteTreeNode[];
}

/**
 * 아웃라인 트리에서 `<<cite:...>>` 하위 불릿을 모두 찾아 부모 불릿 ID 기준 `nodeEvidence` 맵으로 추출하고,
 * 컴파일용 본문 트리에서는 해당 근거 불릿을 제거한 `strippedRoots` 를 반환한다.
 */
export function extractInlineCiteBullets<T extends OutlineCiteTreeNode>(
  roots: readonly T[],
  options: ParseCiteBulletOptions = {}
): {
  readonly strippedRoots: T[];
  readonly nodeEvidence: Record<string, EvidenceLocator[]>;
} {
  const nodeEvidence: Record<string, EvidenceLocator[]> = {};

  const walk = (nodes: readonly T[]): T[] => {
    const out: T[] = [];
    for (const node of nodes) {
      // 최상위(루트) 자체에 `<<cite:...>>` 가 놓이면 본문에서 제외하고 자기 id 에 귀속
      if (parseCiteBullet(node.text, options)) {
        const locs = parseCiteBullet(node.text, options)!;
        nodeEvidence[node.id] = [...(nodeEvidence[node.id] ?? []), ...locs];
        continue;
      }
      const rawChildren = (node.children ?? []) as readonly T[];
      const keptChildren: T[] = [];
      for (const child of rawChildren) {
        const parsed = parseCiteBullet(child.text, options);
        if (parsed) {
          nodeEvidence[node.id] = [...(nodeEvidence[node.id] ?? []), ...parsed];
        } else {
          keptChildren.push(child);
        }
      }
      const nextChildren = keptChildren.length > 0 ? walk(keptChildren) : [];
      out.push({
        ...node,
        children: nextChildren,
      });
    }
    return out;
  };

  return { strippedRoots: walk(roots), nodeEvidence };
}

export interface FormatCiteBulletOptions {
  /** 표현 방식 재정의 (생략 시 `locator.presentation ?? "footnote"`) */
  readonly presentation?: EvidencePresentation;
  /** 산출 근거 설명 재정의 (생략 시 `locator.rationale`) */
  readonly rationale?: string;
  /** `.vsyntax` 레지스트리에서 커스터마이즈된 태그 심볼 조회 (선택) */
  readonly resolveTagSymbol?: (ruleId: string, fallback: string) => string;
}

function sanitizeCiteText(raw: string): string {
  return raw.replace(/\r?\n+/g, " ").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function citeTargetToken(locator: EvidenceLocator): string | null {
  if (locator.url && /^https?:\/\//i.test(locator.url.trim())) {
    return locator.url.trim();
  }
  const raw = (locator.sourcePath ?? locator.resourceId ?? locator.refId ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.replace(/^vault:\/\//i, "").replace(/^vault:/i, "").replace(/\\/g, "/");
  const base = cleaned.split("/").pop()?.trim() || cleaned;
  return base ? `[[${base}]]` : null;
}

/**
 * `EvidenceLocator` 를 `.vsyntax` 표준 규격의 편집 가능한 `<<cite:...>>` 하위 불릿 문자열로 직렬화한다.
 * (`parseCiteBullet` 과 무손실 왕복 호환 — 숨겨진 JSON 사이드카 대신 아웃라인 텍스트 자체가 정본이 된다.)
 */
export function formatEvidenceLocatorToCiteBullet(
  locator: EvidenceLocator,
  options: FormatCiteBulletOptions = {}
): string {
  const pres: EvidencePresentation = options.presentation ?? locator.presentation ?? "footnote";
  const resolveTag = options.resolveTagSymbol ?? ((_ruleId: string, fb: string) => fb);

  let header: string;
  if (pres === "inline-rationale") {
    header = resolveTag("cite-rationale", "<<cite:rationale>>");
  } else if (pres === "sidenote") {
    header = resolveTag("cite-sidenote", "<<cite:sidenote>>");
  } else if (pres === "quote-embed") {
    header = resolveTag("cite-quote", "<<cite:quote>>");
  } else if (pres === "matrix") {
    const baseTag = resolveTag("cite-matrix", "<<cite:matrix>>");
    header =
      locator.requirementId && baseTag.endsWith(">>")
        ? `${baseTag.slice(0, -2)} @${locator.requirementId}>>`
        : baseTag;
  } else if (pres === "bound-value") {
    const baseTag = resolveTag("cite-bound", "<<cite:bound>>");
    if (locator.boundValue && baseTag.endsWith(">>")) {
      const formula = locator.boundFormula ? ` = ${locator.boundFormula}` : "";
      header = `${baseTag.slice(0, -2)} {${locator.boundValue}}${formula}>>`;
    } else {
      header = baseTag;
    }
  } else if (pres === "hidden") {
    header = "<<cite:hidden>>";
  } else {
    header = resolveTag("cite-footnote", "<<cite:footnote>>");
  }

  const targetTok = citeTargetToken(locator);
  const anchors: string[] = [];
  if (locator.page && Number.isFinite(locator.page)) anchors.push(`#p${locator.page}`);
  if (locator.lines && locator.lines.length >= 2) {
    anchors.push(`#L${locator.lines[0]}-L${locator.lines[1]}`);
  }
  const sourceSeg = [targetTok, ...anchors].filter(Boolean).join(" ");
  const rationale = sanitizeCiteText(options.rationale ?? locator.rationale ?? "");
  const excerpt = sanitizeCiteText(locator.excerpt ?? "");

  if (pres === "inline-rationale") {
    const parts = [rationale || excerpt, sourceSeg].filter(Boolean);
    return parts.length > 0 ? `${header} ${parts.join(" | ")}` : header;
  }

  const note = excerpt || rationale;
  const parts = [sourceSeg, note].filter(Boolean);
  return parts.length > 0 ? `${header} ${parts.join(" | ")}` : header;
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
  return htmlToPlainText(html ?? "");
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
