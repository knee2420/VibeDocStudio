import type {
  LegacyReferenceBundleInput,
  ParsedRefAnchor,
  RefBBox,
  RefBlock,
  RefBlockKind,
  RefBlockMedia,
  RefConsensusAdoption,
  RefConsensusCard,
  RefDocument,
  RefDocumentStatus,
  RefFrame,
  RefLayerMetric,
  RefOriginType,
  RefOutlineEntry,
  RefPin,
  RefPinKind,
} from "./types";

const DEFAULT_SEMANTIC_WIDTH = 960;
const DEFAULT_PDF_WIDTH = 595;
const DEFAULT_PDF_HEIGHT = 842;
const SEMANTIC_BLOCKS_PER_FRAME = 22;

export interface RefLayerDefinition {
  readonly id: string;
  readonly name: string;
  readonly question: string;
  readonly qualitative: boolean;
}

export const REF_LAYER_DEFINITIONS: Readonly<Record<string, readonly RefLayerDefinition[]>> = {
  document: [
    { id: "D1", name: "스캐너빌리티·정보 밀도", question: "정독하지 않고 훑는 사람에게 핵심을 어떻게 꽂는가?", qualitative: false },
    { id: "D2", name: "근거·데이터 증명 방식", question: "주장을 어떤 형태의 데이터로 입증하는가?", qualitative: false },
    { id: "D3", name: "격식·메타 규격", question: "형식 자체에서 전문성과 공신력을 어떻게 풍기는가?", qualitative: false },
    { id: "D4", name: "서술 프레임워크", question: "독자의 반론을 잠재우는 논증의 틀은?", qualitative: false },
    { id: "D5", name: "타이포그래피·조판", question: "제목 계층 · 여백 · 다단 · 그리드 · 표 스타일의 규칙은?", qualitative: false },
    { id: "D6", name: "장르 규약", question: "이 장르 독자가 결함으로 느끼지 않을 암묵적 기준은?", qualitative: false },
  ],
  uiux: [
    { id: "U1", name: "설득의 논리와 정보의 위계", question: "어떤 순서로 말을 꺼내고 무엇을 강조했는가?", qualitative: false },
    { id: "U2", name: "문제 해결 패턴", question: "복잡한 상황을 어떻게 우회하거나 단순화했는가?", qualitative: true },
    { id: "U3", name: "인터랙션과 반응의 문법", question: "사용자의 입력에 시스템이 어떻게 호흡하는가?", qualitative: true },
    { id: "U4", name: "톤앤매너와 정서적 질감", question: "어떤 사람(브랜드)처럼 말하고 느껴지는가?", qualitative: false },
    { id: "U5", name: "조형적 토큰과 비례 감각", question: "요소들이 어떤 규칙과 비례로 배치되는가?", qualitative: false },
    { id: "U6", name: "시장의 기대치와 기준선", question: "결함으로 느끼지 않을 최소한의 상식선은?", qualitative: true },
    { id: "U7", name: "협업의 언어를 일치시키는 닻", question: "애매한 기준을 어떤 시각적 증거로 고정하는가?", qualitative: true },
  ],
  blog: [
    { id: "B1", name: "섹션 리듬·반복 단위", question: "글을 어떤 단위로 끊고 무엇을 어떤 순서로 보여 주는가?", qualitative: false },
    { id: "B2", name: "사진 서사", question: "사진을 몇 장, 어떤 묶음으로 글과 배치하는가?", qualitative: false },
    { id: "B3", name: "훑어보기·강조", question: "스크롤로 훑는 독자의 눈을 어디에 멈추게 하는가?", qualitative: false },
    { id: "B4", name: "소제목 문법", question: "소제목을 어떤 말투·형식으로 다는가?", qualitative: false },
    { id: "B5", name: "동선·연결", question: "독자를 다음 글·외부 정보로 어떻게 넘기는가?", qualitative: false },
    { id: "B6", name: "말투·장르 규약", question: "이 장르 독자가 어색해하지 않을 말투는?", qualitative: false },
  ],
};

function clamp1000(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1000, Math.round(value)));
}

export function sanitizeBBox(raw: unknown): RefBBox | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const y0 = clamp1000(Math.min(nums[0], nums[2]));
  const x0 = clamp1000(Math.min(nums[1], nums[3]));
  const y1 = clamp1000(Math.max(nums[0], nums[2]));
  const x1 = clamp1000(Math.max(nums[1], nums[3]));
  return [y0, x0, Math.max(y0 + 1, Math.min(1000, y1)), Math.max(x0 + 1, Math.min(1000, x1))];
}

export function normalizeBlockKind(raw: unknown): RefBlockKind {
  const s = String(raw ?? "").toLowerCase().trim();
  switch (s) {
    case "heading":
    case "form-title":
    case "title":
      return "heading";
    case "list":
    case "bullet-list":
    case "ordered-list":
      return "list";
    case "table":
    case "structured-table":
    case "interactive-table":
      return "table";
    case "callout":
    case "callout-box":
      return "callout";
    case "image":
    case "media":
    case "figure":
      return "media";
    case "gallery":
    case "media-group":
    case "columns-grid":
      return "media-group";
    case "link-card":
      return "link-card";
    case "divider":
    case "hr":
      return "divider";
    case "ui-region":
      return "ui-region";
    case "paragraph":
    case "caption":
    case "text":
    default:
      return "text";
  }
}

export function isRefPath(path: string): boolean {
  return path.toLowerCase().endsWith(".ref");
}

export function generateRefId(prefix = "ref"): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rand}`;
}

export function buildRefAnchor(
  refId: string,
  opts?: {
    readonly frameIndex?: number | null;
    readonly section?: number | null;
    readonly blockId?: string;
    readonly pinId?: string;
  }
): string {
  let out = `ref:${refId}`;
  if (opts?.frameIndex && opts.frameIndex > 0) out += `#f${opts.frameIndex}`;
  if (opts?.section && opts.section > 0) out += `#sec:${opts.section}`;
  if (opts?.blockId) out += `#blk:${opts.blockId}`;
  if (opts?.pinId) out += `#pin:${opts.pinId}`;
  return out;
}

export function parseRefAnchor(raw: string): ParsedRefAnchor | null {
  const text = String(raw ?? "").trim();
  if (!text.startsWith("ref:")) return null;
  const parts = text.slice(4).split("#");
  const refId = parts[0]?.trim();
  if (!refId) return null;
  let frameIndex: number | null = null;
  let section: number | null = null;
  let blockId = "";
  let pinId = "";

  for (const part of parts.slice(1)) {
    if (!part) continue;
    if (/^[pf]\d+$/.test(part)) {
      frameIndex = Number(part.slice(1));
    } else if (part.startsWith("sec:") && /^\d+$/.test(part.slice(4))) {
      section = Number(part.slice(4));
    } else if (part.startsWith("blk:")) {
      blockId = part.slice(4);
    } else if (part.startsWith("pin:")) {
      pinId = part.slice(4);
    }
  }
  return { refId, frameIndex, section, blockId, pinId };
}

function estimateBlockWeight(kind: RefBlockKind, text: string): number {
  if (kind === "divider") return 18;
  if (kind === "heading") return 46;
  if (kind === "media" || kind === "media-group") return 170;
  if (kind === "table") return Math.min(260, Math.max(90, Math.ceil(text.length / 4)));
  if (kind === "link-card") return 72;
  const lines = Math.max(1, Math.ceil(Math.max(text.length, 24) / 48));
  return Math.min(220, 26 + lines * 20);
}

/**
 * Assign sequential 0..1000 vertical bounding boxes to blocks on a semantic-canvas frame
 * when exact pixel geometry is unavailable (e.g. static HTML, layout-only web, Markdown).
 */
function layoutSemanticFramesAndBlocks(
  rawBlocks: readonly Omit<RefBlock, "frameIndex" | "bbox">[],
  title: string
): { frames: RefFrame[]; blocks: RefBlock[] } {
  if (rawBlocks.length === 0) {
    return {
      frames: [
        {
          frameId: "frame-1",
          index: 1,
          surfaceKind: "semantic-canvas",
          width: DEFAULT_SEMANTIC_WIDTH,
          height: 1120,
          label: "Frame 1",
          title,
        },
      ],
      blocks: [],
    };
  }

  const frames: RefFrame[] = [];
  const blocks: RefBlock[] = [];
  const totalChunks = Math.max(1, Math.ceil(rawBlocks.length / SEMANTIC_BLOCKS_PER_FRAME));

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const frameIndex = chunkIdx + 1;
    const slice = rawBlocks.slice(
      chunkIdx * SEMANTIC_BLOCKS_PER_FRAME,
      (chunkIdx + 1) * SEMANTIC_BLOCKS_PER_FRAME
    );
    const weights = slice.map((b) => estimateBlockWeight(b.kind, b.text));
    const padTop = 36;
    const padBottom = 36;
    const gap = 14;
    const contentHeight = weights.reduce((acc, w) => acc + w, 0) + Math.max(0, slice.length - 1) * gap;
    const frameHeight = Math.max(820, padTop + contentHeight + padBottom);

    const firstHeading = slice.find((b) => b.kind === "heading")?.text;
    frames.push({
      frameId: `frame-${frameIndex}`,
      index: frameIndex,
      surfaceKind: "semantic-canvas",
      width: DEFAULT_SEMANTIC_WIDTH,
      height: frameHeight,
      label: `Frame ${frameIndex}`,
      title: firstHeading || (frameIndex === 1 ? title : `Section ${frameIndex}`),
    });

    let cursorY = padTop;
    for (let i = 0; i < slice.length; i++) {
      const b = slice[i];
      const h = weights[i];
      const y0 = clamp1000((cursorY / frameHeight) * 1000);
      const y1 = clamp1000(((cursorY + h) / frameHeight) * 1000);
      const x0 = b.kind === "media" || b.kind === "media-group" ? 80 : 48;
      const x1 = b.kind === "media" || b.kind === "media-group" ? 920 : 952;
      blocks.push({
        ...b,
        frameIndex,
        bbox: [y0, x0, Math.max(y0 + 2, Math.min(1000, y1)), x1],
      });
      cursorY += h + gap;
    }
  }

  return { frames, blocks };
}

function buildDefaultLayers(layerSet: string): RefLayerMetric[] {
  const defs = REF_LAYER_DEFINITIONS[layerSet] ?? REF_LAYER_DEFINITIONS.document;
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    question: d.question,
    values: {},
    qualitative: d.qualitative,
  }));
}

function normalizeLayersFromLegacy(
  rawLayers: LegacyReferenceBundleInput["layers"],
  layerSet: string
): { layers: RefLayerMetric[]; metrics: Record<string, unknown> } {
  const metrics =
    rawLayers?.metrics && typeof rawLayers.metrics === "object"
      ? { ...rawLayers.metrics }
      : {};
  const list = Array.isArray(rawLayers?.layers) ? rawLayers.layers : [];
  if (list.length === 0) {
    return { layers: buildDefaultLayers(layerSet), metrics };
  }
  const defs = REF_LAYER_DEFINITIONS[layerSet] ?? REF_LAYER_DEFINITIONS.document;
  const defMap = new Map(defs.map((d) => [d.id, d]));
  const normalized: RefLayerMetric[] = list
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => {
      const id = String(entry.id ?? "");
      const def = defMap.get(id);
      const values =
        entry.values && typeof entry.values === "object"
          ? { ...(entry.values as Record<string, unknown>) }
          : {};
      return {
        id,
        name: String(entry.name ?? def?.name ?? id),
        question: String(entry.question ?? def?.question ?? ""),
        values,
        qualitative:
          typeof entry.qualitative === "boolean"
            ? entry.qualitative
            : def?.qualitative ?? Object.keys(values).length === 0,
      };
    })
    .filter((l) => Boolean(l.id));
  return { layers: normalized.length > 0 ? normalized : buildDefaultLayers(layerSet), metrics };
}

/**
 * Normalizes ANY legacy `/api/reference` item bundle (PDF, Web with shots, Web with layout-only,
 * Web static HTML, Image, broken/partial artifacts) into a single valid `.ref` v1 `RefDocument`.
 */
export function normalizeLegacyReferenceBundle(bundle: LegacyReferenceBundleInput): RefDocument {
  const ref = bundle.ref;
  const refId = String(ref.refId || generateRefId());
  const originKindRaw = String(ref.kind || "pdf").toLowerCase();
  const originType: RefOriginType =
    originKindRaw === "pdf" || originKindRaw === "web" || originKindRaw === "image"
      ? originKindRaw
      : "unknown";
  const title = String(ref.title || ref.sourceName || ref.sourceUrl || refId).trim();
  const layerSet = String(bundle.layers?.set || ref.layerSet || "document");
  const assetBase = (bundle.assetBaseUrl ?? `/api/reference/items/${encodeURIComponent(refId)}`).replace(
    /\/+$/,
    ""
  );

  const rawBlocks = Array.isArray(bundle.extraction?.blocks) ? bundle.extraction.blocks : [];
  const rawShots = Array.isArray(bundle.shots?.shots) ? bundle.shots.shots : [];
  const rawPages = Array.isArray(bundle.extraction?.pages) ? bundle.extraction.pages : [];

  let frames: RefFrame[] = [];
  let blocks: RefBlock[] = [];

  if (originType === "pdf") {
    const pageCount = Math.max(
      1,
      Number(ref.pageCount) || 0,
      rawPages.length,
      ...rawBlocks.map((b) => Number(b.page) || 0)
    );
    const pageMetaByNo = new Map<number, { width: number; height: number }>();
    for (const p of rawPages) {
      const no = Number(p.page) || 0;
      if (no > 0) {
        pageMetaByNo.set(no, {
          width: Number(p.width) > 0 ? Number(p.width) : DEFAULT_PDF_WIDTH,
          height: Number(p.height) > 0 ? Number(p.height) : DEFAULT_PDF_HEIGHT,
        });
      }
    }
    frames = Array.from({ length: pageCount }, (_, i) => {
      const idx = i + 1;
      const meta = pageMetaByNo.get(idx);
      return {
        frameId: `frame-${idx}`,
        index: idx,
        surfaceKind: "pdf-page" as const,
        width: meta?.width ?? DEFAULT_PDF_WIDTH,
        height: meta?.height ?? DEFAULT_PDF_HEIGHT,
        label: `Page ${idx}`,
        assetUrl: `${assetBase}/source`,
        pageNumber: idx,
      };
    });

    blocks = rawBlocks.map((raw, i) => {
      const page = Math.max(1, Math.min(pageCount, Number(raw.page) || 1));
      return {
        id: String(raw.id || `b${i + 1}`),
        frameIndex: page,
        kind: normalizeBlockKind(raw.kind),
        level: Number(raw.level) || 0,
        text: String(raw.text ?? ""),
        html: typeof raw.html === "string" ? raw.html : undefined,
        bbox: sanitizeBBox(raw.bbox),
        style:
          raw.style && typeof raw.style === "object"
            ? (raw.style as Record<string, unknown>)
            : undefined,
        media:
          raw.media && typeof raw.media === "object"
            ? (raw.media as RefBlockMedia)
            : undefined,
      };
    });
  } else if (originType === "web" && rawShots.length > 0) {
    // Web with captured visual tiles: every shot becomes a first-class 2D Frame,
    // and every block with sourceY/sourceHeight projects onto its matching tile Frame with 0..1000 bbox!
    const viewportW = Number(bundle.shots?.viewportWidth) || 1280;
    const totalH =
      Number(bundle.shots?.totalHeight) ||
      Math.max(
        900,
        ...rawShots.map((s) => (Number(s.scrollY) || 0) + (Number(s.height) || 900))
      );

    frames = rawShots.map((shot, i) => {
      const idx = i + 1;
      const file = String(shot.file || `shot_${String(idx).padStart(2, "0")}.png`);
      return {
        frameId: `frame-${idx}`,
        index: idx,
        surfaceKind: "web-tile" as const,
        width: Number(shot.width) || viewportW,
        height: Number(shot.height) || 900,
        label: `Tile ${idx}`,
        assetUrl: `${assetBase}/shots/${encodeURIComponent(file)}`,
        scrollY: Number(shot.scrollY) || 0,
        sections: Array.isArray(shot.sections) ? shot.sections.map((n: unknown) => Number(n)) : undefined,
        title: typeof shot.title === "string" ? shot.title : undefined,
      };
    });

    let lastMatchedFrame = 1;
    let lastBottomInFrame = 60;
    blocks = rawBlocks.map((raw, i) => {
      const kind = normalizeBlockKind(raw.kind);
      const sourceY =
        typeof raw.sourceY === "number" && Number.isFinite(raw.sourceY) ? raw.sourceY : undefined;
      const sourceHeight =
        typeof raw.sourceHeight === "number" && Number.isFinite(raw.sourceHeight)
          ? Math.max(18, raw.sourceHeight)
          : undefined;
      const existingBBox = sanitizeBBox(raw.bbox);

      let frameIndex = lastMatchedFrame;
      let bbox: RefBBox | null = existingBBox;

      if (sourceY !== undefined) {
        const blockH = sourceHeight ?? 48;
        const blockMid = sourceY + Math.min(blockH / 2, 180);
        // Find tile containing block start or midpoint, or nearest tile by vertical distance
        let bestIdx = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let fi = 0; fi < frames.length; fi++) {
          const f = frames[fi];
          const top = f.scrollY ?? 0;
          const bottom = top + f.height;
          if (sourceY <= bottom && sourceY + blockH >= top) {
            const centerDist = Math.abs((top + bottom) / 2 - blockMid);
            if (centerDist < bestDist) {
              bestDist = centerDist;
              bestIdx = fi;
            }
          } else {
            const edgeDist = Math.min(Math.abs(sourceY - top), Math.abs(sourceY - bottom)) + 5000;
            if (edgeDist < bestDist) {
              bestDist = edgeDist;
              bestIdx = fi;
            }
          }
        }
        const matched = frames[bestIdx];
        frameIndex = matched.index;
        lastMatchedFrame = frameIndex;

        const tileTop = matched.scrollY ?? 0;
        const tileH = Math.max(1, matched.height);
        const relTopRaw = sourceY - tileTop;
        const relBottomRaw = sourceY + blockH - tileTop;
        let y0: number;
        let y1: number;
        if (relTopRaw >= tileH) {
          // Block fell into an uncaptured scroll gap below this tile -> pin cleanly to bottom band
          y0 = 930;
          y1 = 992;
        } else if (relBottomRaw <= 0) {
          // Block fell into an uncaptured scroll gap above this tile -> pin cleanly to top band
          y0 = 8;
          y1 = 70;
        } else {
          const relTop = Math.max(0, Math.min(tileH - 16, relTopRaw));
          const relBottom = Math.min(tileH, Math.max(relTop + 18, relBottomRaw));
          y0 = Math.min(980, clamp1000((relTop / tileH) * 1000));
          y1 = Math.min(1000, Math.max(y0 + 14, clamp1000((relBottom / tileH) * 1000)));
        }
        lastBottomInFrame = y1;

        const mediaObj =
          raw.media && typeof raw.media === "object"
            ? (raw.media as Record<string, unknown>)
            : undefined;
        const widthPx =
          typeof mediaObj?.widthPx === "number" && mediaObj.widthPx > 0
            ? mediaObj.widthPx
            : undefined;
        const halfWidthRatio = widthPx
          ? Math.min(0.46, Math.max(0.12, widthPx / Math.max(1, matched.width) / 2))
          : 0.42;
        const x0 = clamp1000((0.5 - halfWidthRatio) * 1000);
        const x1 = clamp1000((0.5 + halfWidthRatio) * 1000);
        bbox = [y0, x0, Math.min(1000, Math.max(y0 + 10, y1)), Math.min(1000, Math.max(x0 + 10, x1))];
      } else if (!bbox) {
        // Fallback band for blocks lacking sourceY (e.g. captions / dividers between measured blocks)
        const approxRatio = rawBlocks.length > 1 ? i / (rawBlocks.length - 1) : 0;
        const approxY = approxRatio * totalH;
        const approxFrame = frames.find(
          (f) => approxY >= (f.scrollY ?? 0) && approxY <= (f.scrollY ?? 0) + f.height
        );
        frameIndex = approxFrame ? approxFrame.index : lastMatchedFrame;
        const y0 = clamp1000(Math.min(920, lastBottomInFrame));
        const y1 = clamp1000(Math.min(990, y0 + 50));
        lastBottomInFrame = y1;
        bbox = [y0, 80, Math.max(y0 + 10, y1), 920];
      }

      return {
        id: String(raw.id || `b${i + 1}`),
        frameIndex,
        kind,
        level: Number(raw.level) || 0,
        text: String(raw.text ?? ""),
        html: typeof raw.html === "string" ? raw.html : undefined,
        bbox,
        sourceY,
        sourceHeight,
        style:
          raw.style && typeof raw.style === "object"
            ? (raw.style as Record<string, unknown>)
            : undefined,
        media:
          raw.media && typeof raw.media === "object"
            ? (raw.media as RefBlockMedia)
            : undefined,
      };
    });
  } else if (originType === "image") {
    frames = [
      {
        frameId: "frame-1",
        index: 1,
        surfaceKind: "image",
        width: 1200,
        height: 900,
        label: title,
        assetUrl: `${assetBase}/source`,
      },
    ];
    blocks = rawBlocks.map((raw, i) => ({
      id: String(raw.id || `b${i + 1}`),
      frameIndex: 1,
      kind: normalizeBlockKind(raw.kind),
      level: Number(raw.level) || 0,
      text: String(raw.text ?? ""),
      html: typeof raw.html === "string" ? raw.html : undefined,
      bbox: sanitizeBBox(raw.bbox),
    }));
  } else {
    // Web without visual shots (layout.json only OR static HTML only) or unknown:
    // Project all extracted blocks into paginated semantic-canvas frames with crisp 0..1000 bboxes!
    const preBlocks = rawBlocks.map((raw, i) => ({
      id: String(raw.id || `b${i + 1}`),
      kind: normalizeBlockKind(raw.kind),
      level: Number(raw.level) || 0,
      text: String(raw.text ?? ""),
      html: typeof raw.html === "string" ? raw.html : undefined,
      sourceY:
        typeof raw.sourceY === "number" && Number.isFinite(raw.sourceY) ? raw.sourceY : undefined,
      sourceHeight:
        typeof raw.sourceHeight === "number" && Number.isFinite(raw.sourceHeight)
          ? raw.sourceHeight
          : undefined,
      style:
        raw.style && typeof raw.style === "object"
          ? (raw.style as Record<string, unknown>)
          : undefined,
      media:
        raw.media && typeof raw.media === "object"
          ? (raw.media as RefBlockMedia)
          : undefined,
    }));
    const projected = layoutSemanticFramesAndBlocks(preBlocks, title);
    frames = projected.frames;
    blocks = projected.blocks;
  }

  const blockFrameMap = new Map(blocks.map((b) => [b.id, b.frameIndex]));
  const outline: RefOutlineEntry[] = blocks
    .filter((b) => b.kind === "heading" && b.text.trim().length > 0)
    .map((b) => ({
      blockId: b.id,
      title: b.text.trim().slice(0, 120),
      level: b.level && b.level > 0 ? b.level : 1,
      frameIndex: b.frameIndex,
    }));

  const pins: RefPin[] = (Array.isArray(bundle.pins) ? bundle.pins : [])
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object"))
    .map((p, idx) => {
      const pinId = String(p.pinId || `pin_${idx + 1}`);
      const rawKind = String(p.kind || "region");
      const kind: RefPinKind =
        rawKind === "region" || rawKind === "text" || rawKind === "memo" ? rawKind : "region";
      const pageVal = Number(p.page ?? p.frameIndex) || 1;
      const frameIndex = Math.max(1, Math.min(Math.max(1, frames.length), pageVal));
      return {
        pinId,
        kind,
        frameIndex,
        bbox: sanitizeBBox(p.bbox),
        text: String(p.text ?? ""),
        label: String(p.label || `핀 ${idx + 1}`),
        note: String(p.note ?? ""),
        layer: String(p.layer ?? ""),
        anchor: String(p.anchor || buildRefAnchor(refId, { pinId })),
        createdAt: Number(p.createdAt) || Date.now(),
      };
    });

  const consensus: RefConsensusCard[] = (Array.isArray(bundle.consensus) ? bundle.consensus : [])
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object" && c.cardId))
    .map((c) => {
      const adoptionRaw = String(c.adoption || "follow");
      const adoption: RefConsensusAdoption =
        adoptionRaw === "follow" || adoptionRaw === "consult" || adoptionRaw === "exclude"
          ? adoptionRaw
          : "follow";
      const alts = Array.isArray(c.alternatives)
        ? c.alternatives
            .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"))
            .map((a) => ({
              reading: String(a.reading ?? ""),
              evidence: Array.isArray(a.evidence) ? a.evidence.map((e) => String(e)) : undefined,
            }))
        : [];
      return {
        cardId: String(c.cardId),
        layer: String(c.layer ?? "D1"),
        scope: String(c.scope || `ref:${refId}`),
        adoption,
        reading: String(c.reading ?? ""),
        evidence: Array.isArray(c.evidence) ? c.evidence.map((e) => String(e)) : [],
        alternatives: alts,
        status: c.status === "proposed" ? "proposed" : "confirmed",
        by: typeof c.by === "string" ? c.by : "user",
        at: Number(c.at) || Date.now(),
      };
    });

  const { layers, metrics } = normalizeLayersFromLegacy(bundle.layers, layerSet);
  const articleRaw = bundle.extraction?.article;
  const article =
    articleRaw && typeof articleRaw === "object"
      ? {
          title: String(articleRaw.title ?? title),
          siteName: typeof articleRaw.siteName === "string" ? articleRaw.siteName : undefined,
          byline: typeof articleRaw.byline === "string" ? articleRaw.byline : undefined,
          url: typeof articleRaw.url === "string" ? articleRaw.url : ref.sourceUrl || undefined,
          html: String(articleRaw.html ?? ""),
          text: String(articleRaw.text ?? ""),
        }
      : undefined;

  let status: RefDocumentStatus = "framed";
  if (ref.status === "failed" && frames.length === 0) {
    status = "failed";
  } else if (layers.some((l) => Object.keys(l.values).length > 0)) {
    status = "analyzed";
  } else if (blocks.length > 0) {
    status = "structured";
  }

  // Keep unused map referenced if needed for outline parity
  void blockFrameMap;

  const now = Date.now();
  return {
    version: 1,
    refId,
    title,
    status,
    error: ref.error ? String(ref.error) : undefined,
    source: {
      originType,
      uri: ref.sourceUrl || `${assetBase}/source`,
      sourceName: ref.sourceName || undefined,
      sourceUrl: ref.sourceUrl || undefined,
      mimeType: ref.mimeType || undefined,
      sizeBytes: typeof ref.sizeBytes === "number" ? ref.sizeBytes : undefined,
      serverRefId: refId,
      capturedAt: bundle.shots?.capturedAt ?? ref.updatedAt ?? now,
    },
    layerSet,
    enabledLayers: bundle.layerOverrides ? { ...bundle.layerOverrides } : {},
    frames,
    blocks,
    outline,
    layers,
    metrics,
    pins,
    consensus,
    article,
    createdAt: Number(ref.createdAt) || now,
    updatedAt: Number(ref.updatedAt) || now,
  };
}

/**
 * Lightweight parser for Markdown / Plain text into normalized `.ref` blocks.
 */
function parseMarkdownToPreBlocks(content: string): Omit<RefBlock, "frameIndex" | "bbox">[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: Omit<RefBlock, "frameIndex" | "bbox">[] = [];
  let paraBuf: string[] = [];
  let listBuf: string[] = [];
  let tableBuf: string[] = [];
  let inFrontmatter = false;

  const flushPara = () => {
    const text = paraBuf.join("\n").trim();
    if (text) out.push({ id: `b${out.length + 1}`, kind: "text", level: 0, text });
    paraBuf = [];
  };
  const flushList = () => {
    const text = listBuf.join("\n").trim();
    if (text) out.push({ id: `b${out.length + 1}`, kind: "list", level: 0, text });
    listBuf = [];
  };
  const flushTable = () => {
    const text = tableBuf.join("\n").trim();
    if (text) out.push({ id: `b${out.length + 1}`, kind: "table", level: 0, text });
    tableBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      flushPara();
      flushList();
      flushTable();
      out.push({
        id: `b${out.length + 1}`,
        kind: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    if (/^(\*\*\*|---|___)\s*$/.test(line.trim())) {
      flushPara();
      flushList();
      flushTable();
      out.push({ id: `b${out.length + 1}`, kind: "divider", level: 0, text: "" });
      continue;
    }

    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushPara();
      flushList();
      tableBuf.push(line.trim());
      continue;
    }
    flushTable();

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flushPara();
      listBuf.push(line.trim());
      continue;
    }
    flushList();

    if (line.trim().startsWith(">")) {
      flushPara();
      out.push({
        id: `b${out.length + 1}`,
        kind: "callout",
        level: 0,
        text: line.trim().replace(/^>\s?/, ""),
      });
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();
  flushList();
  flushTable();
  return out;
}

/**
 * Lightweight parser for `.vdoc` JSON into normalized `.ref` blocks.
 */
function parseVDocToPreBlocks(content: string): Omit<RefBlock, "frameIndex" | "bbox">[] {
  try {
    const parsed = JSON.parse(content) as {
      pages?: { blocks?: Record<string, unknown>[] }[];
      slots?: Record<string, { content?: string; label?: string }>;
    };
    const slots = parsed.slots ?? {};
    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const out: Omit<RefBlock, "frameIndex" | "bbox">[] = [];
    for (const page of parsed.pages ?? []) {
      for (const blk of page.blocks ?? []) {
        const kind = normalizeBlockKind(blk.kind);
        const slotId = typeof blk.slotId === "string" ? blk.slotId : "";
        const rawText =
          (slotId && slots[slotId]?.content ? stripHtml(slots[slotId].content) : "") ||
          String(blk.title ?? blk.label ?? "");
        out.push({
          id: String(blk.blockId || `b${out.length + 1}`),
          kind,
          level: Number(blk.level) || (kind === "heading" ? 1 : 0),
          text: rawText || `[${String(blk.kind || "block")}]`,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function createEmptyRefDocument(title = "New Reference"): RefDocument {
  const now = Date.now();
  return {
    version: 1,
    refId: generateRefId(),
    title,
    status: "empty",
    source: {
      originType: "unknown",
      uri: "",
    },
    layerSet: "document",
    enabledLayers: {},
    frames: [],
    blocks: [],
    outline: [],
    layers: buildDefaultLayers("document"),
    metrics: {},
    pins: [],
    consensus: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createIngestingRefDocument(input: {
  readonly title: string;
  readonly targetUrl?: string;
  readonly stage?: string;
  readonly message?: string;
  readonly percent?: number;
  readonly refId?: string;
}): RefDocument {
  const now = Date.now();
  const base = createEmptyRefDocument(input.title);
  return {
    ...base,
    refId: input.refId || base.refId,
    status: "ingesting",
    source: {
      originType: input.targetUrl ? "web" : "unknown",
      uri: input.targetUrl ?? "",
      sourceUrl: input.targetUrl,
    },
    ingestProgress: {
      stage: input.stage ?? "init",
      message: input.message ?? "레퍼런스 수집 및 정규화 준비 중...",
      percent: input.percent ?? 5,
      startedAt: now,
      targetUrl: input.targetUrl,
    },
    updatedAt: now,
  };
}

export function createRefFromVaultFile(input: {
  readonly vaultPath: string;
  readonly title?: string;
  readonly content?: string;
  readonly binaryUrl?: string;
  readonly pageCount?: number;
  readonly layerSet?: string;
}): RefDocument {
  const now = Date.now();
  const refId = generateRefId();
  const lower = input.vaultPath.toLowerCase();
  const baseName = input.vaultPath.split("/").pop() ?? input.vaultPath;
  const stemName = baseName.replace(/\.[^.]+$/, "");
  const title = (input.title || stemName || "Reference").trim();

  if (lower.endsWith(".pdf")) {
    const pages = Math.max(1, input.pageCount ?? 1);
    const frames: RefFrame[] = Array.from({ length: pages }, (_, i) => ({
      frameId: `frame-${i + 1}`,
      index: i + 1,
      surfaceKind: "pdf-page",
      width: DEFAULT_PDF_WIDTH,
      height: DEFAULT_PDF_HEIGHT,
      label: `Page ${i + 1}`,
      assetUrl: input.binaryUrl,
      pageNumber: i + 1,
    }));
    const layerSet = input.layerSet ?? "document";
    return {
      version: 1,
      refId,
      title,
      status: "framed",
      source: {
        originType: "pdf",
        uri: `vault://${input.vaultPath}`,
        sourceName: baseName,
        mimeType: "application/pdf",
      },
      layerSet,
      enabledLayers: {},
      frames,
      blocks: [],
      outline: [],
      layers: buildDefaultLayers(layerSet),
      metrics: {},
      pins: [],
      consensus: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  if (/\.(png|jpg|jpeg|webp|gif|svg)$/.test(lower)) {
    const layerSet = input.layerSet ?? "uiux";
    return {
      version: 1,
      refId,
      title,
      status: "framed",
      source: {
        originType: "image",
        uri: `vault://${input.vaultPath}`,
        sourceName: baseName,
      },
      layerSet,
      enabledLayers: {},
      frames: [
        {
          frameId: "frame-1",
          index: 1,
          surfaceKind: "image",
          width: 1200,
          height: 840,
          label: baseName,
          assetUrl: input.binaryUrl,
        },
      ],
      blocks: [],
      outline: [],
      layers: buildDefaultLayers(layerSet),
      metrics: {},
      pins: [],
      consensus: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const originType: RefOriginType = lower.endsWith(".vdoc") || lower.endsWith(".vdoc.json")
    ? "vdoc"
    : lower.endsWith(".html") || lower.endsWith(".htm")
      ? "html"
      : "markdown";
  const preBlocks =
    originType === "vdoc"
      ? parseVDocToPreBlocks(input.content ?? "")
      : parseMarkdownToPreBlocks(input.content ?? "");
  const { frames, blocks } = layoutSemanticFramesAndBlocks(preBlocks, title);
  const outline: RefOutlineEntry[] = blocks
    .filter((b) => b.kind === "heading" && b.text.trim().length > 0)
    .map((b) => ({
      blockId: b.id,
      title: b.text.trim().slice(0, 120),
      level: b.level && b.level > 0 ? b.level : 1,
      frameIndex: b.frameIndex,
    }));
  const layerSet = input.layerSet ?? "document";

  return {
    version: 1,
    refId,
    title,
    status: blocks.length > 0 ? "structured" : "framed",
    source: {
      originType,
      uri: `vault://${input.vaultPath}`,
      sourceName: baseName,
    },
    layerSet,
    enabledLayers: {},
    frames,
    blocks,
    outline,
    layers: buildDefaultLayers(layerSet),
    metrics: {},
    pins: [],
    consensus: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createRefFromImageDataUrl(input: {
  readonly title: string;
  readonly dataUrl: string;
  readonly width?: number;
  readonly height?: number;
  readonly layerSet?: string;
}): RefDocument {
  const now = Date.now();
  const refId = generateRefId();
  const layerSet = input.layerSet ?? "uiux";
  return {
    version: 1,
    refId,
    title: input.title.trim() || "Clipboard Capture",
    status: "framed",
    source: {
      originType: "image",
      uri: input.dataUrl,
      sourceName: `${input.title.trim() || "capture"}.png`,
      mimeType: "image/png",
      capturedAt: now,
    },
    layerSet,
    enabledLayers: {},
    frames: [
      {
        frameId: "frame-1",
        index: 1,
        surfaceKind: "image",
        width: input.width ?? 1280,
        height: input.height ?? 800,
        label: "Frame 1",
        assetUrl: input.dataUrl,
      },
    ],
    blocks: [],
    outline: [],
    layers: buildDefaultLayers(layerSet),
    metrics: {},
    pins: [],
    consensus: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function parseRefJson(raw: string, fallbackTitle = "Reference"): RefDocument {
  if (!raw || !raw.trim()) {
    return createEmptyRefDocument(fallbackTitle);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RefDocument> & { ref?: LegacyReferenceBundleInput["ref"] };
    if (parsed.ref && !parsed.frames) {
      return normalizeLegacyReferenceBundle(parsed as unknown as LegacyReferenceBundleInput);
    }
    const base = createEmptyRefDocument(parsed.title || fallbackTitle);
    const layerSet = String(parsed.layerSet || base.layerSet);
    const frames = Array.isArray(parsed.frames) ? parsed.frames : [];
    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const layers =
      Array.isArray(parsed.layers) && parsed.layers.length > 0
        ? parsed.layers
        : buildDefaultLayers(layerSet);
    return {
      ...base,
      refId: typeof parsed.refId === "string" && parsed.refId ? parsed.refId : base.refId,
      title: typeof parsed.title === "string" && parsed.title ? parsed.title : fallbackTitle,
      status: parsed.status ?? (frames.length > 0 ? "framed" : "empty"),
      error: parsed.error,
      ingestProgress: parsed.ingestProgress,
      source: parsed.source ?? base.source,
      layerSet,
      enabledLayers:
        parsed.enabledLayers && typeof parsed.enabledLayers === "object"
          ? parsed.enabledLayers
          : {},
      frames,
      blocks,
      outline: Array.isArray(parsed.outline) ? parsed.outline : [],
      layers,
      metrics: parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : {},
      pins: Array.isArray(parsed.pins) ? parsed.pins : [],
      consensus: Array.isArray(parsed.consensus) ? parsed.consensus : [],
      article: parsed.article,
      nameSource:
        parsed.nameSource === "auto" || parsed.nameSource === "user" ? parsed.nameSource : undefined,
      createdAt: Number(parsed.createdAt) || base.createdAt,
      updatedAt: Number(parsed.updatedAt) || base.updatedAt,
    };
  } catch {
    return {
      ...createEmptyRefDocument(fallbackTitle),
      status: "failed",
      error: "Invalid .ref JSON format",
    };
  }
}

export function serializeRefJson(doc: RefDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// --- Pure Immutable Mutators ---

export function addRefPin(
  doc: RefDocument,
  input: {
    readonly kind: RefPinKind;
    readonly frameIndex: number;
    readonly bbox?: RefBBox | null;
    readonly text?: string;
    readonly label?: string;
    readonly note?: string;
    readonly layer?: string;
  }
): { doc: RefDocument; pin: RefPin } {
  const pinId = `pin_${Math.random().toString(36).slice(2, 10)}`;
  const frameIndex = Math.max(1, Math.min(Math.max(1, doc.frames.length), input.frameIndex));
  const defaultLabel =
    input.kind === "text" && input.text
      ? `F${frameIndex}: ${input.text.slice(0, 24)}${input.text.length > 24 ? "…" : ""}`
      : input.kind === "memo"
        ? `메모 ${doc.pins.length + 1}`
        : `F${frameIndex} 영역 ${doc.pins.length + 1}`;
  const pin: RefPin = {
    pinId,
    kind: input.kind,
    frameIndex,
    bbox: input.bbox ? sanitizeBBox(input.bbox) : null,
    text: input.text ?? "",
    label: (input.label || defaultLabel).trim(),
    note: input.note ?? "",
    layer: input.layer ?? "",
    anchor: buildRefAnchor(doc.refId, { pinId }),
    createdAt: Date.now(),
  };
  return {
    pin,
    doc: {
      ...doc,
      pins: [...doc.pins, pin],
      updatedAt: Date.now(),
    },
  };
}

export function updateRefPin(
  doc: RefDocument,
  pinId: string,
  patch: Partial<Pick<RefPin, "label" | "note" | "layer" | "text">>
): RefDocument {
  return {
    ...doc,
    pins: doc.pins.map((p) => (p.pinId === pinId ? { ...p, ...patch } : p)),
    updatedAt: Date.now(),
  };
}

export function deleteRefPin(doc: RefDocument, pinId: string): RefDocument {
  return {
    ...doc,
    pins: doc.pins.filter((p) => p.pinId !== pinId),
    updatedAt: Date.now(),
  };
}

export function toggleRefLayer(doc: RefDocument, layerId: string): RefDocument {
  const current = doc.enabledLayers[layerId] !== false;
  return {
    ...doc,
    enabledLayers: {
      ...doc.enabledLayers,
      [layerId]: !current,
    },
    updatedAt: Date.now(),
  };
}

export function addOrConfirmConsensusCard(
  doc: RefDocument,
  input: {
    readonly cardId?: string;
    readonly layer: string;
    readonly scope?: string;
    readonly adoption: RefConsensusAdoption;
    readonly reading: string;
    readonly evidence?: readonly string[];
    readonly alternatives?: RefConsensusCard["alternatives"];
  }
): RefDocument {
  const cardId = input.cardId || `card_${Math.random().toString(36).slice(2, 10)}`;
  const card: RefConsensusCard = {
    cardId,
    layer: input.layer,
    scope: input.scope || `ref:${doc.refId}`,
    adoption: input.adoption,
    reading: input.reading.trim(),
    evidence: input.evidence ?? [input.scope || `ref:${doc.refId}`],
    alternatives: input.alternatives ?? [],
    status: "confirmed",
    by: "user",
    at: Date.now(),
  };
  const rest = doc.consensus.filter((c) => c.cardId !== cardId);
  return {
    ...doc,
    consensus: [...rest, card],
    updatedAt: Date.now(),
  };
}

export function setConsensusCardAdoption(
  doc: RefDocument,
  cardId: string,
  adoption: RefConsensusAdoption
): RefDocument {
  return {
    ...doc,
    consensus: doc.consensus.map((c) =>
      c.cardId === cardId ? { ...c, adoption, status: "confirmed", at: Date.now() } : c
    ),
    updatedAt: Date.now(),
  };
}

export function deleteConsensusCard(doc: RefDocument, cardId: string): RefDocument {
  return {
    ...doc,
    consensus: doc.consensus.filter((c) => c.cardId !== cardId),
    updatedAt: Date.now(),
  };
}

export function appendImageFrameToRef(
  doc: RefDocument,
  input: {
    readonly assetUrl: string;
    readonly label?: string;
    readonly width?: number;
    readonly height?: number;
  }
): RefDocument {
  const nextIndex = doc.frames.length + 1;
  const frame: RefFrame = {
    frameId: `frame-${nextIndex}`,
    index: nextIndex,
    surfaceKind: "image",
    width: input.width ?? 1280,
    height: input.height ?? 800,
    label: input.label || `Frame ${nextIndex}`,
    assetUrl: input.assetUrl,
  };
  return {
    ...doc,
    status: doc.status === "empty" ? "framed" : doc.status,
    source:
      doc.frames.length > 0 && doc.source.originType !== "composite"
        ? { ...doc.source, originType: "composite" }
        : doc.source,
    frames: [...doc.frames, frame],
    updatedAt: Date.now(),
  };
}

/**
 * Rewrites `vault://<oldPath>` pointers inside `.ref` JSON when a Vault file is renamed/moved.
 */
export function rewriteRefPointersOnRename(
  rawJson: string,
  oldPath: string,
  newPath: string
): { content: string; replacements: number } {
  const needle = `vault://${oldPath}`;
  if (!rawJson.includes(needle)) {
    return { content: rawJson, replacements: 0 };
  }
  const replacement = `vault://${newPath}`;
  const parts = rawJson.split(needle);
  return {
    content: parts.join(replacement),
    replacements: parts.length - 1,
  };
}
