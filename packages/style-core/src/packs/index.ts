import type { StylePack } from "../core/token-contract";
import { GOV_RFP_PACK } from "./gov-rfp";
import { NAVER_TRAVEL_BLOG_PACK } from "./naver-travel-blog";
import { YESFORM_OFFICIAL_PACK } from "./yesform-official";
import { YONHAP_NEWS_PACK } from "./yonhap-news";

export { GOV_RFP_PACK, NAVER_TRAVEL_BLOG_PACK, YESFORM_OFFICIAL_PACK, YONHAP_NEWS_PACK };

export const BUILTIN_STYLE_PACKS: readonly StylePack[] = [
  NAVER_TRAVEL_BLOG_PACK,
  YONHAP_NEWS_PACK,
  YESFORM_OFFICIAL_PACK,
  GOV_RFP_PACK,
];

const PACK_MAP = new Map<string, StylePack>(BUILTIN_STYLE_PACKS.map((p) => [p.id, p]));

export function getBuiltinStylePack(packId: string | null | undefined): StylePack | undefined {
  if (!packId) return undefined;
  return PACK_MAP.get(packId);
}

export function resolveDefaultStylePack(viewId?: string | null): StylePack {
  if (viewId === "blog") return NAVER_TRAVEL_BLOG_PACK;
  if (viewId === "web") return YONHAP_NEWS_PACK;
  return GOV_RFP_PACK;
}
