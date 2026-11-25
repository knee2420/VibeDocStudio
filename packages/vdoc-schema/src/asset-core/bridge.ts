/**
 * 에셋 정본 브리지 — `AssetV3` (`vibe-asset/3`) ↔ `VDocAsset` (허브 UI · 썸네일 · 랭킹 공용 뷰).
 *
 * 사람용 에셋 허브(`VDocAssetPanel`, `AssetHubGalleryModal`)와 AI Composer(`assets.*`)가
 * 서로 다른 저장소로 쪼개지지 않고 **동일한 정본 카탈로그**를 공유하도록 변환한다.
 */
import type { AssetFlowMode, VDocAsset, VDocAssetKind } from "../asset-kit/types";
import { decomposeBlocks } from "./decompose";
import { renderAssetV3ToVsyntaxDsl } from "./dsl";
import { instantiateAssetV3 } from "./instantiate";
import { collectFields, type AssetV3 } from "./skeleton";

function inferKindAndFlow(asset: AssetV3): {
  assetKind: VDocAssetKind;
  flowMode: AssetFlowMode;
  targetKind: VDocAsset["targetKind"];
  category: string;
} {
  const hasTable = asset.nodes.some((n) => n.t === "grid" && n.component === "table");
  const hasKv = asset.nodes.some((n) => n.t === "grid" && n.component === "kv");
  const hasMedia = asset.nodes.some(
    (n) => (n.t === "field" && n.field.type === "image") || (n.t === "container" && n.component === "cover")
  );
  if (asset.scope === "page") {
    return {
      assetKind: "a4-page",
      flowMode: hasTable ? "grid-form" : hasKv ? "prose-form" : "hybrid",
      targetKind: "page",
      category: "A4 문서 · 통합 에셋 (v3)",
    };
  }
  if (asset.scope === "section" && hasMedia) {
    return {
      assetKind: "blog-section",
      flowMode: "hybrid",
      targetKind: "section",
      category: "섹션 · 통합 에셋 (v3)",
    };
  }
  if (hasTable && asset.nodes.length === 1) {
    return {
      assetKind: "table",
      flowMode: "grid-form",
      targetKind: "structured-table",
      category: "표 · 구조+스타일 에셋 (v3)",
    };
  }
  return {
    assetKind: asset.scope === "section" ? "a4-page" : "table",
    flowMode: hasTable ? "grid-form" : "prose-form",
    targetKind: asset.scope === "section" ? "section" : "structured-table",
    category: "통합 에셋 (v3)",
  };
}

/**
 * `AssetV3` (`vibe-asset/3`) → 허브 UI · 썸네일 · 문맥 랭킹용 `VDocAsset` 프로젝션.
 */
export function v3ToVDocAsset(
  asset: AssetV3,
  options?: { readonly lifecycle?: "session" | "saved" }
): VDocAsset {
  const { assetKind, flowMode, targetKind, category } = inferKindAndFlow(asset);
  const dsl = renderAssetV3ToVsyntaxDsl(asset);
  const preview = instantiateAssetV3(asset, {}, {
    idPrefix: `pv_${asset.assetId.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "v3"}`,
  });
  const fields = collectFields(asset.nodes);
  const now = asset.origin?.createdAt ?? new Date().toISOString();

  return {
    version: "2.0.0",
    schemaVersion: "v2",
    assetId: asset.assetId,
    title: asset.title,
    scope: asset.scope === "page" ? "section" : asset.scope,
    assetKind,
    targetKind,
    category,
    tags: Array.from(
      new Set([
        "v3",
        "vsyntax",
        flowMode,
        ...(options?.lifecycle === "session" ? ["세션에셋"] : []),
        ...fields.slice(0, 4).map((f) => f.label ?? f.field.id),
      ])
    ),
    nuance: {
      summary:
        asset.summary ||
        `구조+스타일 통합 에셋(v3) · 채울 자리 ${fields.length}개${asset.style?.selectors?.length ? ` · 스타일 선택자 ${asset.style.selectors.length}개` : ""}`,
      structureRules: [
        `.vsyntax 표준 구조 문법 + 역할 기반 스타일 토큰(${asset.style?.selectors?.slice(0, 4).join(", ") || "기본"})`,
      ],
    },
    structure: {
      outlineDsl: dsl,
      blocks: preview.blocks,
      slots: preview.slots,
      ...(asset.scope !== "element"
        ? {
            pageMeta: {
              pageLabel: asset.title,
              unitKind: asset.scope === "page" ? "page" : "section",
              surfaceWidth: assetKind === "blog-section" ? 720 : 794,
            },
          }
        : {}),
    },
    v2: {
      flowMode,
      zones: {
        body: [
          {
            id: "v3_body",
            type: flowMode === "grid-form" ? "table-grid" : "prose",
            fixedText: asset.title,
          },
        ],
      },
      fields: fields.map((f) => ({
        id: f.field.id,
        label: f.label ?? f.field.hint ?? f.field.id,
        type:
          f.field.type === "currency"
            ? "currency"
            : f.field.type === "date"
              ? "date"
              : f.field.type === "list"
                ? "list"
                : f.field.type === "image"
                  ? "image"
                  : f.field.type === "rich"
                    ? "rich-text"
                    : "string",
        required: Boolean(f.field.required),
      })),
    },
    origin: {
      sourceType:
        asset.origin?.sourceType === "vdoc-capture"
          ? "vdoc-capture"
          : asset.origin?.sourceType === "ref-extract"
            ? "ref-extract"
            : asset.origin?.sourceType === "builtin"
              ? "builtin"
              : "manual",
      ...(asset.origin?.sourceRef ? { sourceRef: asset.origin.sourceRef } : {}),
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * 기존 `.vasset` / 내장 시드 `VDocAsset` → `AssetV3` (`vibe-asset/3`) 프로젝션.
 * AI Composer 의 `assets.propose` / `assets.instantiate` / `assets.apply` 가 모든 볼트 에셋을 다룰 수 있게 한다.
 */
export function vDocAssetToV3(asset: VDocAsset): AssetV3 {
  const decomposed = decomposeBlocks({
    blocks: asset.structure.blocks,
    slots: asset.structure.slots,
  });
  const nodes =
    decomposed.nodes.length > 0
      ? decomposed.nodes
      : [{ t: "field" as const, role: "body", field: { id: "body", type: "rich" as const, hint: asset.title } }];
  const v3: AssetV3 = {
    schema: "vibe-asset/3",
    assetId: asset.assetId,
    title: asset.title,
    scope: asset.scope === "document" ? "page" : asset.scope,
    summary: asset.nuance.summary,
    dsl: asset.structure.outlineDsl.length > 0 ? [...asset.structure.outlineDsl] : undefined,
    nodes,
    style: decomposed.style,
    origin: {
      sourceType:
        asset.origin.sourceType === "builtin"
          ? "builtin"
          : asset.origin.sourceType === "vdoc-capture"
            ? "vdoc-capture"
            : asset.origin.sourceType === "ref-extract"
              ? "ref-extract"
              : "manual",
      ...(asset.origin.sourceRef ? { sourceRef: asset.origin.sourceRef } : {}),
      createdAt: asset.origin.createdAt,
    },
  };
  return {
    ...v3,
    dsl: renderAssetV3ToVsyntaxDsl(v3),
  };
}
