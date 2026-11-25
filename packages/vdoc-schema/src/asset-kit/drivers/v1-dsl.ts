/**
 * Variant A (`v1-dsl`) — 기존 `.outline` DSL + 자연어 `nuance` 중심 에셋 드라이버.
 * A/B 비교 시 기준선(Baseline) 역할을 수행한다.
 */
import type { AssetRecommendationHit, AssetSchemaDriver, AssetSelectSummary } from "../driver";
import { BUILTIN_VDOC_ASSETS } from "../seed-assets";
import type { VDocAsset } from "../types";

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,./()[\]{}|:;\-_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export const V1_DSL_ASSET_DRIVER: AssetSchemaDriver = {
  version: "v1",
  label: "v1 · DSL 기본형",
  description: "기존 outlineDsl + 자연어 nuance 기반 에셋 스키마 (표/블로그 중심 기준선)",
  vaultSubdir: "",

  getSeeds(): readonly VDocAsset[] {
    return BUILTIN_VDOC_ASSETS;
  },

  compileToPreview(asset: VDocAsset) {
    return {
      blocks: structuredClone(asset.structure.blocks),
      slots: structuredClone(asset.structure.slots),
      outlineDsl: [...asset.structure.outlineDsl],
    };
  },

  summarizeForSelect(asset: VDocAsset): AssetSelectSummary {
    const hasTable = asset.structure.blocks.some((b) => b.kind === "structured-table");
    const hasMedia = asset.structure.blocks.some((b) => b.kind === "image");
    const badges: string[] = ["v1 DSL"];
    if (hasTable) badges.push("표 구조");
    if (hasMedia) badges.push("이미지 포함");
    const placeholderMatches = asset.structure.outlineDsl.join("\n").match(/\{\{[^}]+\}\}/g) ?? [];
    return {
      schemaVersion: "v1",
      flowMode: hasTable && !hasMedia ? "grid-form" : hasMedia ? "hybrid" : "prose-form",
      badges,
      primitiveKinds: hasTable ? ["table-grid"] : ["prose"],
      fieldCount: placeholderMatches.length,
      evidenceHintCount: 0,
      agentPromptLine: `[v1] ${asset.assetId} (${asset.assetKind}) — ${asset.title}: ${asset.nuance.summary}`,
    };
  },

  recommendForQuery(query: string, catalog: readonly VDocAsset[]): readonly AssetRecommendationHit[] {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) {
      return catalog.slice(0, 3).map((asset) => ({ asset, score: 1, reasons: ["기본 추천"] }));
    }
    const scored: AssetRecommendationHit[] = [];
    for (const asset of catalog) {
      const hay = `${asset.title} ${asset.category} ${asset.tags.join(" ")} ${asset.nuance.summary}`.toLowerCase();
      let score = 0;
      const reasons: string[] = [];
      for (const tok of tokens) {
        if (asset.title.toLowerCase().includes(tok)) {
          score += 3;
          reasons.push(`제목 일치('${tok}')`);
        } else if (hay.includes(tok)) {
          score += 1.5;
          reasons.push(`태그/요약 일치('${tok}')`);
        }
      }
      if (score > 0) scored.push({ asset, score, reasons: Array.from(new Set(reasons)).slice(0, 3) });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
  },
};
