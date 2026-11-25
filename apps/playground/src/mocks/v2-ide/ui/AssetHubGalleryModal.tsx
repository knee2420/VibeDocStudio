import React, { useMemo, useState } from "react";
import { Edit3, FilePlus2, Grid, Pin, Search, Sparkles, X } from "lucide-react";
import type {
  AssetFlowMode,
  AssetSchemaDriver,
  VDocAsset,
  VDocAssetKind,
} from "@vibe/vdoc-schema";
import type { VaultAssetEntry } from "@vibe/vault-formats";

import { VDocAssetThumbnail } from "./VDocAssetThumbnail";

export interface AssetHubGalleryModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly assets: readonly VaultAssetEntry[];
  readonly driver: AssetSchemaDriver;
  readonly pinnedIds: readonly string[];
  readonly initialQuery?: string;
  readonly onTogglePin: (assetId: string) => void;
  readonly onApplyPreview: (entry: VaultAssetEntry) => void;
  readonly onInsertSkeleton: (entry: VaultAssetEntry) => void;
  readonly onOpenEditor: (entry: VaultAssetEntry) => void;
  readonly onOpenAiFunnel: () => void;
}

const FLOW_TABS: readonly { readonly id: AssetFlowMode | "all"; readonly label: string }[] = [
  { id: "all", label: "전체 형태" },
  { id: "prose-form", label: "글 · 조항형" },
  { id: "grid-form", label: "표 · 격자형" },
  { id: "hybrid", label: "하이브리드 · 블로그" },
];

const KIND_TABS: readonly { readonly id: VDocAssetKind | "all"; readonly label: string }[] = [
  { id: "all", label: "전체 종류" },
  { id: "a4-page", label: "A4 페이지" },
  { id: "blog-section", label: "블로그 섹션" },
  { id: "table", label: "표" },
];

/**
 * 전체 에셋 카탈로그 갤러리 모달 — 에셋이 수십~수백 개로 누적되어도
 * 3축 패싯(형태 × 종류 × 검색)과 2D 라이브 썸네일로 5초 안에 찾는 전용 허브.
 */
export const AssetHubGalleryModal: React.FC<AssetHubGalleryModalProps> = ({
  open,
  onClose,
  assets,
  driver,
  pinnedIds,
  initialQuery = "",
  onTogglePin,
  onApplyPreview,
  onInsertSkeleton,
  onOpenEditor,
  onOpenAiFunnel,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [flowFilter, setFlowFilter] = useState<AssetFlowMode | "all">("all");
  const [kindFilter, setKindFilter] = useState<VDocAssetKind | "all">("all");

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const recMap = q
      ? new Map(
          driver
            .recommendForQuery(
              q,
              assets.map((e) => e.asset)
            )
            .map((h) => [h.asset.assetId, h])
        )
      : null;

    const list = assets.filter(({ asset }) => {
      if (kindFilter !== "all" && asset.assetKind !== kindFilter) return false;
      if (flowFilter !== "all") {
        const sum = driver.summarizeForSelect(asset);
        if (sum.flowMode !== flowFilter) return false;
      }
      if (!q) return true;
      if (recMap?.has(asset.assetId)) return true;
      const needle = q.toLowerCase();
      return (
        asset.title.toLowerCase().includes(needle) ||
        asset.nuance.summary.toLowerCase().includes(needle) ||
        asset.category.toLowerCase().includes(needle) ||
        asset.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });

    return [...list].sort((a, b) => {
      if (recMap) {
        const diff =
          (recMap.get(b.asset.assetId)?.score ?? 0) -
          (recMap.get(a.asset.assetId)?.score ?? 0);
        if (diff !== 0) return diff;
      }
      const ap = pinnedSet.has(a.asset.assetId) ? 1 : 0;
      const bp = pinnedSet.has(b.asset.assetId) ? 1 : 0;
      return bp - ap;
    });
  }, [assets, driver, flowFilter, kindFilter, pinnedSet, query]);

  if (!open) return null;

  return (
    <div
      data-testid="asset-hub-gallery-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 backdrop-blur-[2px]"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="flex h-[82vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#1b1c20] text-[#e6edf3] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#22242a] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Grid className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="text-[14px] font-semibold text-white">
                전체 에셋 허브 ({assets.length}종 · {driver.label})
              </h2>
              <p className="text-[11px] text-slate-400">
                구조 형태 · 종류 · 자연어 검색으로 원하는 양식을 빠르게 찾고 현재 문서에 즉시 미리보기 합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAiFunnel();
              }}
              className="flex items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-500/20 px-3 py-1.5 text-[11.5px] font-medium text-violet-100 hover:bg-violet-500/30"
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              <span>AI 양식 추천 (AG-UI)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              title="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 3-Axis Facet Filter Bar */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-[#1e2026] px-5 py-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="목적·키워드로 검색 (예: 상고이유서, 무테두리, 복합표, 블로그 리뷰...)"
              className="w-full rounded-md border border-white/15 bg-black/35 py-1.5 pr-3 pl-8 text-[12px] text-white outline-none focus:border-emerald-400"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 p-0.5 text-[11px]">
            {FLOW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFlowFilter(tab.id)}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  flowFilter === tab.id
                    ? "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 p-0.5 text-[11px]">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setKindFilter(tab.id)}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  kindFilter === tab.id
                    ? "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-column Card Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              <p className="text-[13px]">조건에 일치하는 에셋이 없습니다.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFlowFilter("all");
                  setKindFilter("all");
                }}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11.5px] text-white hover:bg-white/10"
              >
                필터 초기화
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((entry) => {
                const { asset } = entry;
                const sum = driver.summarizeForSelect(asset);
                const pinned = pinnedSet.has(asset.assetId);
                return (
                  <article
                    key={asset.assetId}
                    className="flex flex-col rounded-lg border border-white/10 bg-[#23252c] p-3 transition-colors hover:border-emerald-400/45"
                  >
                    <VDocAssetThumbnail asset={asset} height={148} className="mb-2.5" />
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[12.5px] font-semibold text-white">{asset.title}</h3>
                      <button
                        type="button"
                        onClick={() => onTogglePin(asset.assetId)}
                        title={pinned ? "고정 해제" : "자주 쓰는 에셋으로 고정"}
                        className={`shrink-0 rounded p-1 ${
                          pinned
                            ? "bg-amber-500/20 text-amber-300"
                            : "text-slate-500 hover:bg-white/10 hover:text-slate-200"
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {sum.badges.map((b) => (
                        <span
                          key={b}
                          className="rounded border border-cyan-500/30 bg-cyan-500/12 px-1.5 py-0 text-[10px] font-medium text-cyan-200"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-[11px] leading-4 text-slate-400">
                      {asset.nuance.summary}
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreview(entry);
                          onClose();
                        }}
                        className="flex flex-1 items-center justify-center gap-1 rounded bg-violet-500/30 px-2.5 py-1.5 text-[11px] font-medium text-violet-100 ring-1 ring-violet-400/40 hover:bg-violet-500/45"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>내 내용으로 미리보기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertSkeleton(entry);
                          onClose();
                        }}
                        title="빈 뼈대만 즉시 삽입"
                        className="rounded border border-white/15 bg-black/25 px-2 py-1.5 text-[11px] text-slate-300 hover:border-emerald-400/45 hover:text-white"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenEditor(entry);
                          onClose();
                        }}
                        title="에셋 원본 편집"
                        className="rounded border border-white/15 bg-black/25 px-2 py-1.5 text-[11px] text-slate-300 hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
