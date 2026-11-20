/**
 * @vibe/style-core/extractor — `.ref` 문서에서 시각 스타일 DNA(`.vstyle.json`)를 추출하는 추출기.
 */
import { VSTYLE_PROTOCOL, type StylePack } from "../core/token-contract";
import {
  GOV_RFP_PACK,
  NAVER_TRAVEL_BLOG_PACK,
  YESFORM_OFFICIAL_PACK,
  YONHAP_NEWS_PACK,
} from "../packs";

export interface RefStyleInput {
  refId?: string;
  title?: string;
  layerSet?: string;
  source?: {
    originType?: string;
    uri?: string;
    sourceUrl?: string;
    mimeType?: string;
  };
  frames?: Array<{
    surfaceKind?: string;
    width?: number;
    height?: number;
  }>;
  blocks?: Array<{
    kind?: string;
    text?: string;
  }>;
}

export interface ExtractStyleOptions {
  id?: string;
  name?: string;
  sourceRef?: string;
  now?: string;
}

function clonePack(pack: StylePack): StylePack {
  return JSON.parse(JSON.stringify(pack)) as StylePack;
}

function slugifyId(raw: string): string {
  const ascii = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return ascii || "extracted";
}

/**
 * `.ref` 의 원본 매체 유형(web/pdf), 블록 분포(media-group/callout/table/list), 프레임 규격을 분석해
 * `vibe-style/1.0` 표준 `StylePack` 초안을 추출한다.
 */
export function extractStylePackFromRef(
  refDoc: RefStyleInput,
  options: ExtractStyleOptions = {}
): StylePack {
  const originType = (refDoc.source?.originType ?? "").toLowerCase();
  const url = (refDoc.source?.sourceUrl ?? refDoc.source?.uri ?? "").toLowerCase();
  const blocks = refDoc.blocks ?? [];
  const frames = refDoc.frames ?? [];

  const count = (kind: string) => blocks.filter((b) => b.kind === kind).length;
  const mediaGroups = count("media-group");
  const callouts = count("callout");
  const tables = count("table");
  const lists = count("list");

  // Classify base visual DNA from real .ref signals
  let base: StylePack;
  if (originType === "web") {
    const isBlog =
      refDoc.layerSet === "blog" ||
      url.includes("blog.naver.com") ||
      url.includes("tistory.com") ||
      mediaGroups >= 2 ||
      callouts >= 3;
    base = isBlog ? clonePack(NAVER_TRAVEL_BLOG_PACK) : clonePack(YONHAP_NEWS_PACK);
  } else {
    // PDF / Document family: single-page form table vs multi-page RFP/report
    const isSingleForm = frames.length <= 2 && tables >= 1 && lists < 5;
    base = isSingleForm ? clonePack(YESFORM_OFFICIAL_PACK) : clonePack(GOV_RFP_PACK);
  }

  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? `style-${slugifyId(refDoc.refId || refDoc.title || base.id)}`;
  const title = refDoc.title?.trim();

  return {
    ...base,
    protocol: VSTYLE_PROTOCOL,
    id,
    name: options.name ?? (title ? `${title} 스타일 팩` : base.name),
    description: `Extracted from .ref (${originType || "unknown"} · frames=${frames.length} · blocks=${blocks.length} · tables=${tables} · mediaGroups=${mediaGroups})`,
    sourceRef: options.sourceRef ?? base.sourceRef,
    updatedAt: now,
  };
}
