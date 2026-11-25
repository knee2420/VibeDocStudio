import React, { useMemo, useState } from "react";
import { Blocks, LayoutGrid, Sparkles, Wand2, X } from "lucide-react";
import {
  getActiveAssetDriver,
  rankAssetsForContext,
  resolveDocumentView,
  slotPlainText,
  type AssetHubContext,
} from "@vibe/vdoc-schema";
import {
  collectVaultAssets,
  isOutlinePath,
  isVDocPath,
  parseOutlineJson,
  parseVDocJson,
} from "@vibe/vault-formats";
import type { VaultPort } from "@vibe/vault-core";

import {
  dispatchAssetHubCommand,
  getPinnedAssetIds,
  getRecentAssetIds,
  type AguiAssetFunnelRequest,
} from "../../model/assetActionBus";

type PurposeChoice = "all" | "legal" | "proposal" | "blog" | "table";
type ShapeChoice = "all" | "prose" | "grid" | "hybrid";

const PURPOSE_OPTIONS: readonly {
  readonly id: PurposeChoice;
  readonly label: string;
  readonly query: string;
}[] = [
  { id: "all", label: "전체", query: "" },
  { id: "legal", label: "법률·공문", query: "법률 상고이유서 신청서 공문 사건 청구" },
  { id: "proposal", label: "제안·보고", query: "보고서 제안서 요약 KPI 평가" },
  { id: "blog", label: "블로그·아티클", query: "블로그 아티클 카드 콘텐츠" },
  { id: "table", label: "표·데이터", query: "표 테이블 예산 일정 비교 매트릭스" },
];

const SHAPE_OPTIONS: readonly {
  readonly id: ShapeChoice;
  readonly label: string;
  readonly query: string;
}[] = [
  { id: "all", label: "전체 형태", query: "" },
  { id: "prose", label: "글·조항 중심", query: "문단 서술 조항 prose-form" },
  { id: "grid", label: "표·격자 중심", query: "표 격자 열 행 structured-table" },
  { id: "hybrid", label: "하이브리드", query: "하이브리드 섹션 카드 hybrid" },
];

function extractActiveTextSample(vault: VaultPort, activePath: string | null): {
  sample: string;
  docTitle?: string;
  documentView?: "a4" | "blog" | "web" | null;
} {
  if (!activePath || !vault.exists(activePath)) return { sample: "" };
  try {
    const raw = vault.read(activePath);
    if (isOutlinePath(activePath)) {
      const parsed = parseOutlineJson(raw, activePath);
      const chunks: string[] = [parsed.title];
      const walk = (nodes: typeof parsed.rootNodes) => {
        for (const n of nodes) {
          if (chunks.join(" ").length > 1400) break;
          if (n.text.trim()) chunks.push(n.text.trim());
          if (n.children.length > 0) walk(n.children);
        }
      };
      walk(parsed.rootNodes);
      return { sample: chunks.join("\n"), docTitle: parsed.title };
    }
    if (isVDocPath(activePath)) {
      const doc = parseVDocJson(raw, activePath);
      const texts: string[] = [doc.title ?? ""];
      for (const slot of Object.values(doc.slots)) {
        if (texts.join(" ").length > 1400) break;
        const plain = slotPlainText(slot.content);
        if (plain.trim()) texts.push(plain.trim());
      }
      const view = resolveDocumentView(doc);
      const documentView = view.id === "blog" ? "blog" : view.id === "web" ? "web" : "a4";
      return {
        sample: texts.filter(Boolean).join("\n"),
        docTitle: doc.title,
        documentView,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { sample: "" };
}

export interface AguiAssetFunnelCardProps {
  readonly vault: VaultPort;
  readonly activeResourceId: string | null;
  readonly request?: AguiAssetFunnelRequest | null;
  readonly onClose: () => void;
  readonly onSendAiPrompt: (prompt: string) => void;
}

/**
 * AG-UI 2-클릭 양식 추천 깔때기 카드.
 * - 타이핑 없이 [목적] x [구조 형태] 칩만 눌러 현재 볼트에 등록된 실제 v1/v2 에셋 중 Top 3를 즉시 좁힌다.
 * - 선택한 카드는 [내 내용으로 미리보기], [뼈대 꽂기], [AI 에게 작성 맡기기] 로 바로 실행된다.
 */
export const AguiAssetFunnelCard: React.FC<AguiAssetFunnelCardProps> = ({
  vault,
  activeResourceId,
  request,
  onClose,
  onSendAiPrompt,
}) => {
  const [purpose, setPurpose] = useState<PurposeChoice>("all");
  const [shape, setShape] = useState<ShapeChoice>("all");

  const effectiveSourcePath = request?.sourcePath ?? activeResourceId;
  const driver = getActiveAssetDriver();

  const { rankedTop3, totalCount, docTitle } = useMemo(() => {
    const entries = collectVaultAssets(vault, { schemaVersion: driver.version });
    const activeInfo = extractActiveTextSample(vault, effectiveSourcePath);
    const purposeQuery = PURPOSE_OPTIONS.find((p) => p.id === purpose)?.query ?? "";
    const shapeQuery = SHAPE_OPTIONS.find((s) => s.id === shape)?.query ?? "";
    const combinedQuery = [request?.seedQuery ?? "", purposeQuery, shapeQuery]
      .filter(Boolean)
      .join(" ")
      .trim();

    const ctx: AssetHubContext = {
      activeSurface: effectiveSourcePath
        ? isOutlinePath(effectiveSourcePath)
          ? "outline"
          : isVDocPath(effectiveSourcePath)
            ? "vdoc"
            : "other"
        : "other",
      documentView: activeInfo.documentView ?? null,
      contentSample: activeInfo.sample,
      searchQuery: combinedQuery || undefined,
      flowModeFilter:
        shape === "prose"
          ? "prose-form"
          : shape === "grid"
            ? "grid-form"
            : shape === "hybrid"
              ? "hybrid"
              : "all",
      pinnedIds: getPinnedAssetIds(),
      recentIds: getRecentAssetIds(),
    };

    const buckets = rankAssetsForContext(
      entries.map((e) => e.asset),
      driver,
      ctx
    );
    const merged = [
      ...buckets.recommended,
      ...buckets.pinnedAndRecent,
      ...buckets.others,
    ];
    return {
      rankedTop3: merged.slice(0, 3),
      totalCount: entries.length,
      docTitle: activeInfo.docTitle,
    };
  }, [vault, effectiveSourcePath, purpose, shape, request?.seedQuery, driver]);

  return (
    <div
      data-testid="agui-asset-funnel-card"
      className="shrink-0 border-b border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-white px-3 py-2.5 text-[11.5px] text-slate-800"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
            <Sparkles className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11.5px] font-bold text-slate-900">
              AG-UI 양식 추천 깔때기
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {docTitle ? `현재 대상: ${docTitle}` : "현재 열린 문서 기준"} · 등록 에셋 {totalCount}개 중 Top {rankedTop3.length}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => dispatchAssetHubCommand({ type: "open-gallery" })}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
            title="넓은 전체 에셋 허브 갤러리 열기"
          >
            <LayoutGrid className="h-3 w-3" />
            <span>전체 허브</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 cursor-pointer"
            title="양식 추천 닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Step 1: Purpose */}
      <div className="mt-2 space-y-1">
        <div className="text-[10px] font-semibold text-slate-500">1. 문서 목적</div>
        <div className="flex flex-wrap gap-1">
          {PURPOSE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`agui-funnel-purpose-${opt.id}`}
              onClick={() => setPurpose(opt.id)}
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                purpose === opt.id
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Structure Shape */}
      <div className="mt-1.5 space-y-1">
        <div className="text-[10px] font-semibold text-slate-500">2. 표현 형태</div>
        <div className="flex flex-wrap gap-1">
          {SHAPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`agui-funnel-shape-${opt.id}`}
              onClick={() => setShape(opt.id)}
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                shape === opt.id
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Live Top 3 Matches */}
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
          <span>3. 바로 적용할 후보 ({rankedTop3.length})</span>
          <span className="font-mono text-[9.5px] text-emerald-700">driver:{driver.version}</span>
        </div>
        {rankedTop3.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2.5 text-center text-[11px] text-slate-500">
            조건에 맞는 에셋이 없습니다. 필터를 완화하거나 에셋을 새로 등록해 주세요.
          </div>
        ) : (
          rankedTop3.map((item) => {
            const selectMeta = driver.summarizeForSelect(item.asset);
            return (
              <div
                key={item.asset.assetId}
                data-testid={`agui-funnel-card-${item.asset.assetId}`}
                className="rounded-lg border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <Blocks className="h-3 w-3 shrink-0 text-emerald-600" />
                      <span className="truncate text-[11.5px] font-semibold text-slate-900">
                        {item.asset.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {selectMeta.badges.slice(0, 3).map((b) => (
                        <span
                          key={b}
                          className="rounded bg-slate-100 px-1 py-px text-[9.5px] text-slate-600"
                        >
                          {b}
                        </span>
                      ))}
                      {item.reasons[0] && (
                        <span className="rounded bg-emerald-50 px-1 py-px text-[9.5px] font-medium text-emerald-700">
                          {item.reasons[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    data-testid={`agui-funnel-preview-${item.asset.assetId}`}
                    onClick={() =>
                      dispatchAssetHubCommand({
                        type: "stage-preview",
                        assetId: item.asset.assetId,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    <span>내 내용으로 미리보기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatchAssetHubCommand({
                        type: "insert-skeleton",
                        assetId: item.asset.assetId,
                      })
                    }
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    뼈대 꽂기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSendAiPrompt(
                        `현재 열린 문서/아웃라인의 내용을 "${item.asset.title}" (assetId: ${item.asset.assetId}) 양식 패턴에 맞춰 구조화하고, assets.stagePreview 로 미리보기를 띄워줘.`
                      );
                      onClose();
                    }}
                    className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 cursor-pointer"
                  >
                    <Wand2 className="h-2.5 w-2.5" />
                    <span>AI 작성</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
