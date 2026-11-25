/**
 * @vibe/vdoc-schema — Context-Aware Asset Hub Ranking & Scope Filtering Engine.
 *
 * 에셋이 수십~수백 개로 쌓여도 현재 열려 있는 `.outline` / `.vdoc` 의 컨텍스트(선택 블록 · 문서 뷰 · 본문 텍스트 시그널)에
 * 맞는 에셋만 Top 추천으로 끌어올리고, 무관한 에셋은 자동으로 뒤로 격리한다.
 */
import type { AssetRecommendationHit, AssetSchemaDriver } from "./driver";
import type { AssetFlowMode, VDocAsset, VDocAssetKind } from "./types";

export interface AssetHubContext {
  readonly activeSurface: "outline" | "vdoc" | "other";
  /** `.vdoc` 에서 특정 블록을 선택한 경우 그 블록의 kind (`structured-table`, `text`, `columns-grid`, `callout-box` 등) */
  readonly selectedBlockKind?: string | null;
  /** 문서 뷰 프로파일 (`a4`, `blog`, `web`) */
  readonly documentView?: "a4" | "blog" | "web" | null;
  /** 현재 아웃라인/페이지에서 추출한 대표 텍스트 (자동 추천 시그널) */
  readonly contentSample?: string;
  /** 사용자 명시 검색어 (있으면 검색 의도를 최우선 반영) */
  readonly searchQuery?: string;
  /** 명시적 형태 필터 (`prose-form` | `grid-form` | `hybrid`) */
  readonly flowModeFilter?: AssetFlowMode | "all";
  /** 명시적 종류 필터 */
  readonly kindFilter?: VDocAssetKind | "all";
  /** 사용자가 핀 고정한 assetId 목록 */
  readonly pinnedIds?: readonly string[];
  /** 최근 사용한 assetId 목록 (최신순) */
  readonly recentIds?: readonly string[];
}

export interface RankedAssetItem {
  readonly asset: VDocAsset;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly scopeMatch: "exact" | "compatible" | "mismatch";
  readonly isPinned: boolean;
  readonly isRecent: boolean;
}

export interface AssetHubBuckets {
  /** 현재 작업 컨텍스트 + 본문 시그널 기준 자동 추천 Top 3~4 */
  readonly recommended: readonly RankedAssetItem[];
  /** 핀 고정 · 최근 사용 (현재 컨텍스트 호환 항목 우선) */
  readonly pinnedAndRecent: readonly RankedAssetItem[];
  /** 나머지 에셋 (전체 카탈로그 / 갤러리 모달용) */
  readonly others: readonly RankedAssetItem[];
  /** 현재 컨텍스트 요약 문구 (UI 배지 표시용) */
  readonly contextSummary: string;
  /** 자동 추천 신뢰도 — 낮으면 AG-UI 깔때기 추천 버튼 강조 */
  readonly lowConfidence: boolean;
}

function detectScopeCompatibility(
  asset: VDocAsset,
  ctx: AssetHubContext
): "exact" | "compatible" | "mismatch" {
  // 1) .vdoc 에서 특정 블록이 선택된 경우: 해당 블록 계열과 무관한 전체 페이지 에셋은 mismatch
  if (ctx.activeSurface === "vdoc" && ctx.selectedBlockKind) {
    const bk = ctx.selectedBlockKind;
    if (bk === "structured-table") {
      if (asset.assetKind === "table") return "exact";
      if (asset.v2?.flowMode === "grid-form") return "compatible";
      return "mismatch";
    }
    if (bk === "callout-box") {
      if (asset.assetKind === "callout") return "exact";
      if (asset.scope === "element") return "compatible";
      return "mismatch";
    }
    if (bk === "columns-grid") {
      if (asset.assetKind === "columns") return "exact";
      if (asset.scope === "element") return "compatible";
      return "mismatch";
    }
    if (bk === "text") {
      if (asset.assetKind === "list" || asset.assetKind === "callout" || asset.v2?.flowMode === "prose-form") {
        return "exact";
      }
      return asset.scope === "element" ? "compatible" : "mismatch";
    }
  }

  // 2) 문서 뷰 프로파일(A4 vs 블로그) 기준 호환성
  if (ctx.documentView === "blog") {
    if (asset.assetKind === "blog-section") return "exact";
    if (asset.assetKind === "a4-page") return "mismatch";
    return "compatible";
  }
  if (ctx.documentView === "a4") {
    if (asset.assetKind === "a4-page" || asset.assetKind === "table") return "exact";
    if (asset.assetKind === "blog-section") return "mismatch";
    return "compatible";
  }

  return "compatible";
}

function inferStructuralSignalBonus(
  asset: VDocAsset,
  sample: string
): { readonly bonus: number; readonly reasons: string[] } {
  if (!sample.trim()) return { bonus: 0, reasons: [] };
  let bonus = 0;
  const reasons: string[] = [];
  const flowMode = asset.v2?.flowMode ?? (asset.assetKind === "table" ? "grid-form" : asset.assetKind === "blog-section" ? "hybrid" : "grid-form");

  const pipeLines = (sample.match(/\|/g) ?? []).length;
  const legalClauses = /(?:사\s*건|원\s*고|피\s*고|상고|청구|제\d+조|가\.|나\.|귀중|계약서|내용증명|진술서)/.test(sample);
  const numberedBullets = /(?:^|\n)\s*(?:\d+\.|[가나다라마]\.|①|②)/m.test(sample);
  const mediaOrKv = /\[img:|::|\[cta:|입장료|운영\s*시간|여행|리뷰|후기|맛집/.test(sample);

  if (legalClauses && flowMode === "prose-form") {
    bonus += 5.5;
    reasons.push("작성 내용에 서면·조항 패턴 감지");
  } else if (numberedBullets && flowMode === "prose-form") {
    bonus += 2.5;
    reasons.push("계층 번호 본문 패턴 일치");
  }

  if (pipeLines >= 2 && asset.assetKind === "table") {
    bonus += 5.5;
    reasons.push("표 열 구분(`|`) 데이터 감지");
  } else if (pipeLines >= 2 && flowMode === "grid-form") {
    bonus += 2.5;
    reasons.push("격자형 서식 구조 호환");
  }

  if (mediaOrKv && (flowMode === "hybrid" || asset.assetKind === "blog-section")) {
    bonus += 4.5;
    reasons.push("이미지·속성(`::`) 콘텐츠 패턴 감지");
  }

  return { bonus, reasons };
}

/**
 * 현재 열려 있는 문서/아웃라인 컨텍스트를 분석해 에셋 카탈로그를
 * `[맞춤 추천 Top 3~4] / [고정·최근] / [나머지]` 3단으로 분류한다.
 */
export function rankAssetsForContext(
  catalog: readonly VDocAsset[],
  driver: AssetSchemaDriver,
  ctx: AssetHubContext
): AssetHubBuckets {
  const pinnedSet = new Set(ctx.pinnedIds ?? []);
  const recentOrder = new Map<string, number>();
  (ctx.recentIds ?? []).forEach((id, idx) => recentOrder.set(id, idx));

  const queryText = [ctx.searchQuery ?? "", ctx.contentSample ?? ""].filter(Boolean).join(" ").trim();
  const driverHits: readonly AssetRecommendationHit[] = queryText
    ? driver.recommendForQuery(queryText, catalog)
    : [];
  const driverHitMap = new Map(driverHits.map((h) => [h.asset.assetId, h]));

  const hasExplicitSearch = Boolean(ctx.searchQuery && ctx.searchQuery.trim().length > 0);
  const explicitNeedle = (ctx.searchQuery ?? "").trim().toLowerCase();

  const ranked: RankedAssetItem[] = [];
  for (const asset of catalog) {
    // Explicit facet filters
    if (ctx.kindFilter && ctx.kindFilter !== "all" && asset.assetKind !== ctx.kindFilter) {
      continue;
    }
    if (ctx.flowModeFilter && ctx.flowModeFilter !== "all") {
      const summary = driver.summarizeForSelect(asset);
      if (summary.flowMode !== ctx.flowModeFilter) continue;
    }

    const scopeMatch = detectScopeCompatibility(asset, ctx);
    const hit = driverHitMap.get(asset.assetId);
    const signal = inferStructuralSignalBonus(asset, ctx.contentSample ?? "");

    let score = (hit?.score ?? 0) + signal.bonus;
    const reasons: string[] = [...signal.reasons, ...(hit?.reasons ?? [])];

    if (scopeMatch === "exact") {
      score += ctx.selectedBlockKind ? 5 : 3;
      reasons.unshift("현재 선택 범위와 정확히 일치");
    } else if (scopeMatch === "mismatch") {
      score -= 4;
    }

    if (hasExplicitSearch) {
      const hay = `${asset.title} ${asset.category} ${asset.tags.join(" ")} ${asset.nuance.summary}`.toLowerCase();
      const matched = hay.includes(explicitNeedle) || Boolean(hit && hit.score > 0);
      if (!matched) continue;
      if (asset.title.toLowerCase().includes(explicitNeedle)) score += 4;
    }

    ranked.push({
      asset,
      score,
      reasons: Array.from(new Set(reasons)).slice(0, 3),
      scopeMatch,
      isPinned: pinnedSet.has(asset.assetId),
      isRecent: recentOrder.has(asset.assetId),
    });
  }

  ranked.sort((a, b) => b.score - a.score);

  // 1) 추천 버킷: mismatch 제외 + 점수 > 0 상위 3개 (명시 검색 시 최대 5개)
  const recLimit = hasExplicitSearch ? 6 : 3;
  const recommended = ranked
    .filter((item) => item.scopeMatch !== "mismatch" && item.score >= 2)
    .slice(0, recLimit);
  const recIds = new Set(recommended.map((r) => r.asset.assetId));

  // 2) 고정 · 최근 버킷 (추천과 중복 제거)
  const pinnedAndRecent = ranked
    .filter((item) => !recIds.has(item.asset.assetId) && (item.isPinned || item.isRecent))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (recentOrder.get(a.asset.assetId) ?? 999) - (recentOrder.get(b.asset.assetId) ?? 999);
    })
    .slice(0, 6);
  const prIds = new Set(pinnedAndRecent.map((r) => r.asset.assetId));

  // 3) 나머지 에셋 (호환 먼저, mismatch 는 맨 아래)
  const others = ranked
    .filter((item) => !recIds.has(item.asset.assetId) && !prIds.has(item.asset.assetId))
    .sort((a, b) => {
      const rankScope = (s: RankedAssetItem["scopeMatch"]) => (s === "exact" ? 0 : s === "compatible" ? 1 : 2);
      return rankScope(a.scopeMatch) - rankScope(b.scopeMatch) || b.score - a.score;
    });

  const contextSummary =
    ctx.activeSurface === "vdoc"
      ? ctx.selectedBlockKind
        ? `선택 블록(${ctx.selectedBlockKind}) 맞춤`
        : ctx.documentView === "blog"
          ? "블로그 문서 맞춤"
          : "A4 문서 페이지 맞춤"
      : ctx.activeSurface === "outline"
        ? ctx.contentSample?.trim()
          ? "현재 아웃라인 내용 분석 기반"
          : "빈 아웃라인 · 양식 선택 대기"
        : "전체 에셋 카탈로그";

  const topScore = recommended[0]?.score ?? 0;
  const lowConfidence = !hasExplicitSearch && (recommended.length === 0 || topScore < 4.5);

  return {
    recommended,
    pinnedAndRecent,
    others,
    contextSummary,
    lowConfidence,
  };
}
