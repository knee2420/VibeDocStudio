import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  FolderKanban,
  Layers,
  Loader2,
  Lock,
  MousePointerClick,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import {
  BLOCK_ASSET_CATALOG,
  BLOCK_ROLE_LABELS,
  buildAssetTemplatePreviewTable,
  FORM_ASSET_CATALOG,
  TOTAL_BLOCK_ASSET_COUNT,
  type BlockAssetMeta,
  type FormAssetMeta,
} from "../model/formAssets";
import type { WebFormVariant } from "@vibe/vdoc-schema";
import type {
  AiCompileStatus,
  BlockVariantId,
  FormAssetCategory,
  FormAssetId,
  LinkedDocumentSpec,
  PlaygroundBlockMeta,
  TableViewCacheEntry,
} from "../model/types";

export interface FormAssetHubSidebarProps {
  linkedDocs: readonly LinkedDocumentSpec[];
  activeLinkedDocId: string | null;
  activeLinkedPageId: string | null;
  activeAssetId: FormAssetId;
  sheetElements: readonly PlaygroundBlockMeta[];
  selectedBlockMeta: PlaygroundBlockMeta | null;
  blockVariants: Record<string, BlockVariantId>;
  viewCache?: Record<string, TableViewCacheEntry>;
  dirtyViewBlocks?: Record<string, boolean>;
  aiCompileStatus?: AiCompileStatus;
  webFormTheme: WebFormVariant;
  locked: boolean;
  onSelectAsset: (assetId: FormAssetId) => void;
  onSelectElementBlock: (blockId: string) => void;
  onSelectBlockVariant: (blockId: string, variantId: BlockVariantId) => void;
  onApplyTableView?: (blockId: string) => void;
  onRevertTableView?: (blockId: string) => void;
  onRegenerateTableAi?: (
    blockId: string,
    variantId: BlockVariantId,
    userFeedback?: string
  ) => void;
  onCancelAiCompile?: () => void;
  onSelectWebFormTheme: (theme: WebFormVariant) => void;
  onClearBlockSelection: () => void;
  onSelectLinkedDoc: (docId: string) => void;
  onSelectLinkedPage: (pageId: string) => void;
  onUnlockToWysiwym: () => void;
  onEnterPhase3Edit: () => void;
}

const CATEGORY_TABS: ReadonlyArray<{ id: FormAssetCategory; label: string }> = [
  { id: "all", label: "전체" },
  { id: "survey", label: "조사·수합" },
  { id: "approval", label: "품의·결재" },
  { id: "ops", label: "일정·운영" },
  { id: "budget", label: "견적·비교" },
  { id: "standard", label: "표준·RFP" },
];

const AssetWireframeThumb: React.FC<{ kind: FormAssetMeta["wireframe"] }> = ({ kind }) => {
  if (kind === "approval-official") {
    return (
      <div className="w-12 h-14 rounded border border-slate-300 bg-white p-1 flex flex-col gap-0.5 shrink-0">
        <div className="flex justify-between items-center gap-1">
          <div className="h-1.5 w-4 bg-slate-800 rounded-2xs" />
          <div className="grid grid-cols-3 gap-px border border-slate-400 bg-slate-400">
            <div className="w-1.5 h-2 bg-slate-100" />
            <div className="w-1.5 h-2 bg-slate-100" />
            <div className="w-1.5 h-2 bg-slate-100" />
          </div>
        </div>
        <div className="h-3 border border-slate-400 grid grid-cols-2 gap-px bg-slate-300">
          <div className="bg-slate-200" />
          <div className="bg-white" />
        </div>
        <div className="flex-1 space-y-0.5 pt-0.5">
          <div className="h-1 w-full bg-slate-300" />
          <div className="h-1 w-4/5 bg-slate-200" />
          <div className="h-1 w-3/4 bg-slate-200" />
        </div>
      </div>
    );
  }
  if (kind === "survey-grid") {
    return (
      <div className="w-12 h-14 rounded border border-slate-300 bg-white p-1 flex flex-col gap-0.5 shrink-0">
        <div className="h-1.5 w-3/4 mx-auto bg-slate-800 rounded-2xs" />
        <div className="h-3.5 border border-slate-400 grid grid-cols-3 gap-px bg-slate-300">
          <div className="bg-slate-200" />
          <div className="bg-white col-span-2" />
          <div className="bg-slate-200" />
          <div className="bg-white col-span-2" />
        </div>
        <div className="flex-1 border border-slate-400 grid grid-cols-4 gap-px bg-slate-300">
          <div className="bg-slate-200 col-span-4 h-1.5" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "merged-timetable") {
    return (
      <div className="w-12 h-14 rounded border border-slate-300 bg-white p-1 flex flex-col gap-0.5 shrink-0">
        <div className="h-1.5 w-4/5 mx-auto bg-slate-800 rounded-2xs" />
        <div className="flex-1 border border-slate-400 flex flex-col gap-px bg-slate-300">
          <div className="h-2 bg-slate-200" />
          <div className="h-2.5 bg-slate-50" />
          <div className="flex-1 grid grid-cols-3 gap-px bg-slate-300">
            <div className="bg-white" />
            <div className="bg-white" />
            <div className="bg-white" />
          </div>
          <div className="h-2.5 bg-slate-50" />
        </div>
      </div>
    );
  }
  if (kind === "compare-dual-header") {
    return (
      <div className="w-12 h-14 rounded border border-slate-300 bg-white p-1 flex flex-col gap-0.5 shrink-0">
        <div className="h-1.5 w-4/5 mx-auto bg-slate-800 rounded-2xs" />
        <div className="h-3 border border-slate-400 grid grid-cols-5 gap-px bg-slate-400">
          <div className="bg-slate-200 row-span-2" />
          <div className="bg-slate-200 col-span-2" />
          <div className="bg-slate-200 col-span-2" />
          <div className="bg-slate-100" />
          <div className="bg-slate-100" />
          <div className="bg-slate-100" />
          <div className="bg-slate-100" />
        </div>
        <div className="flex-1 border border-slate-400 grid grid-cols-3 gap-px bg-slate-300">
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
        </div>
      </div>
    );
  }
  return (
    <div className="w-12 h-14 rounded border border-slate-300 bg-white p-1 flex flex-col gap-1 shrink-0">
      <div className="h-2 w-full bg-slate-700 rounded-2xs" />
      <div className="h-1 w-4/5 bg-slate-300" />
      <div className="h-1 w-full bg-slate-200" />
      <div className="h-1 w-3/4 bg-slate-200" />
      <div className="h-3 border border-slate-300 bg-slate-50" />
    </div>
  );
};

const BlockVariantThumb: React.FC<{ kind: BlockAssetMeta["wireframe"] }> = ({ kind }) => {
  if (kind === "wf-google") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-slate-50 p-1 flex flex-col gap-0.5 shrink-0">
        <div className="h-1 bg-indigo-600 rounded-t-2xs" />
        <div className="bg-white border border-slate-200 rounded-2xs p-0.5 flex flex-col gap-0.5">
          <div className="h-1 w-3/4 bg-slate-600" />
          <div className="h-1 w-1/2 bg-slate-300" />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xs h-2.5 flex items-center gap-0.5 px-0.5">
          <div className="w-1.5 h-1.5 rounded-full border border-indigo-600" />
          <div className="h-1 flex-1 bg-slate-300" />
        </div>
      </div>
    );
  }
  if (kind === "wf-tally") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1.5 flex flex-col justify-center gap-1 shrink-0">
        <div className="h-1.5 w-3/4 bg-slate-800 rounded-2xs" />
        <div className="h-2 w-full bg-slate-100 rounded-2xs" />
        <div className="h-1.5 w-4/5 bg-slate-100 rounded-2xs" />
      </div>
    );
  }
  if (kind === "wf-chips") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-slate-50 p-1 flex flex-col justify-center gap-0.5 shrink-0">
        <div className="grid grid-cols-2 gap-0.5">
          <div className="h-2.5 rounded-2xs bg-indigo-100 border border-indigo-500" />
          <div className="h-2.5 rounded-2xs bg-white border border-slate-300" />
          <div className="h-2.5 rounded-2xs bg-white border border-slate-300" />
          <div className="h-2.5 rounded-2xs bg-white border border-slate-300" />
        </div>
      </div>
    );
  }
  if (kind === "wf-step") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 border-l-4 border-l-indigo-600 bg-white p-1 flex flex-col gap-0.5 justify-center shrink-0">
        <div className="h-1.5 w-1/2 bg-indigo-600 rounded-2xs" />
        <div className="grid grid-cols-[10px_1fr] gap-0.5 items-center">
          <div className="h-1 bg-slate-500" />
          <div className="h-2 bg-slate-100 border border-slate-200 rounded-2xs" />
        </div>
        <div className="grid grid-cols-[10px_1fr] gap-0.5 items-center">
          <div className="h-1 bg-slate-500" />
          <div className="h-2 bg-slate-100 border border-slate-200 rounded-2xs" />
        </div>
      </div>
    );
  }
  if (kind === "tbl-header-below") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border border-slate-500 grid grid-cols-3 gap-px bg-slate-400">
          <div className="bg-slate-200" />
          <div className="bg-slate-200" />
          <div className="bg-slate-200" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "tbl-choice-matrix") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border border-slate-500 grid grid-cols-4 gap-px bg-slate-400">
          <div className="bg-slate-200" />
          <div className="bg-white flex items-center justify-center"><div className="w-1 h-1 border border-slate-600" /></div>
          <div className="bg-white flex items-center justify-center"><div className="w-1 h-1 border border-slate-600" /></div>
          <div className="bg-white flex items-center justify-center"><div className="w-1 h-1 border border-slate-600" /></div>
          <div className="bg-slate-200" />
          <div className="bg-white flex items-center justify-center"><div className="w-1 h-1 border border-slate-600" /></div>
          <div className="bg-white flex items-center justify-center"><div className="w-1 h-1 border border-slate-600" /></div>
          <div className="bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "tbl-banner-rows") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border border-slate-600 flex flex-col gap-px bg-slate-400">
          <div className="h-2 bg-slate-200" />
          <div className="flex-1 grid grid-cols-2 gap-px bg-slate-400">
            <div className="bg-white" />
            <div className="bg-white" />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-px bg-slate-400">
            <div className="bg-white" />
            <div className="bg-white" />
          </div>
        </div>
      </div>
    );
  }
  if (kind === "tbl-stacked-box") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center gap-0.5 shrink-0">
        <div className="border border-slate-500 flex flex-col">
          <div className="h-1.5 bg-slate-200 border-b border-slate-400" />
          <div className="h-2 bg-white" />
        </div>
        <div className="border border-slate-500 flex flex-col">
          <div className="h-1.5 bg-slate-200 border-b border-slate-400" />
          <div className="h-2 bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "tbl-grouped-compare") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border border-slate-500 grid grid-cols-[12px_1fr] gap-px bg-slate-400">
          <div className="bg-slate-200" />
          <div className="grid grid-rows-2 gap-px bg-slate-400">
            <div className="grid grid-cols-3 gap-px bg-slate-400">
              <div className="bg-white" /><div className="bg-white" /><div className="bg-white" />
            </div>
            <div className="grid grid-cols-3 gap-px bg-slate-400">
              <div className="bg-white" /><div className="bg-white" /><div className="bg-white" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "tbl-modern-flat") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border-y border-slate-400 flex flex-col">
          <div className="h-2 bg-slate-100 border-b border-slate-300" />
          <div className="flex-1 border-b border-slate-200 bg-white" />
          <div className="flex-1 bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "tbl-roster-ledger") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border-2 border-slate-700 grid grid-cols-5 gap-px bg-slate-400">
          <div className="bg-slate-200" /><div className="bg-slate-200" /><div className="bg-slate-200" /><div className="bg-slate-200" /><div className="bg-slate-200" />
          <div className="bg-white" /><div className="bg-white" /><div className="bg-white" /><div className="bg-slate-50" /><div className="bg-slate-50" />
          <div className="bg-white" /><div className="bg-white" /><div className="bg-white" /><div className="bg-slate-50" /><div className="bg-slate-50" />
        </div>
      </div>
    );
  }
  if (kind === "tbl-roster-pivot") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border border-slate-500 grid grid-cols-4 gap-px bg-slate-400">
          <div className="bg-slate-200" />
          <div className="bg-slate-200" />
          <div className="bg-slate-200" />
          <div className="bg-slate-200" />
          <div className="bg-white" /><div className="bg-white" /><div className="bg-white" /><div className="bg-white" />
          <div className="bg-white" /><div className="bg-white" /><div className="bg-white" /><div className="bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "grid-approval") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex items-center gap-1 shrink-0">
        <div className="flex-1 h-4 bg-slate-200 border border-slate-300" />
        <div className="w-5 h-6 grid grid-cols-2 gap-px border border-slate-400 bg-slate-300">
          <div className="bg-slate-200" />
          <div className="bg-slate-200" />
          <div className="bg-white" />
          <div className="bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "grid-2x4" || kind === "grid-3col") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center shrink-0">
        <div className="h-6 border border-slate-400 grid grid-cols-3 gap-px bg-slate-300">
          <div className="bg-slate-200" />
          <div className="bg-white" />
          <div className="bg-white" />
          <div className="bg-slate-200" />
          <div className="bg-white" />
          <div className="bg-white" />
        </div>
      </div>
    );
  }
  if (kind === "checkbox") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1 flex flex-col justify-center gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 border border-slate-500" />
          <div className="h-1 flex-1 bg-slate-300" />
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 border border-slate-500" />
          <div className="h-1 flex-1 bg-slate-300" />
        </div>
      </div>
    );
  }
  if (kind === "bullets") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1.5 flex flex-col justify-center gap-1 shrink-0">
        <div className="h-1.5 w-3/4 bg-slate-700" />
        <div className="h-1 w-full bg-slate-300 ml-1" />
        <div className="h-1 w-4/5 bg-slate-300 ml-1" />
      </div>
    );
  }
  if (kind === "box") {
    return (
      <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1.5 flex items-center shrink-0">
        <div className="w-full h-6 border-2 border-slate-600 bg-slate-100" />
      </div>
    );
  }
  return (
    <div className="w-11 h-10 rounded border border-slate-300 bg-white p-1.5 flex flex-col justify-center gap-1 shrink-0">
      <div className="h-2 w-4/5 mx-auto bg-slate-700" />
      <div className="h-0.5 w-full bg-slate-800" />
    </div>
  );
};

const TableAssetTemplatePreview: React.FC<{ asset: BlockAssetMeta }> = ({
  asset,
}) => {
  const preview = useMemo(() => buildAssetTemplatePreviewTable(asset), [asset]);
  if (!preview) return null;

  const { block, slots } = preview;
  const rules = block.borderRules;
  const rowCount = block.rows.length;

  return (
    <div className="w-full rounded border border-slate-200 bg-white p-1.5 overflow-hidden">
      <table
        className="w-full border-collapse table-fixed"
        style={{
          borderTop: rules?.outer && rules.outer !== "none" ? rules.outer : undefined,
          borderBottom: rules?.outer && rules.outer !== "none" ? rules.outer : undefined,
          borderLeft: rules?.outer && rules.outer !== "none" ? rules.outer : undefined,
          borderRight: rules?.outer && rules.outer !== "none" ? rules.outer : undefined,
        }}
      >
        <colgroup>
          {block.columnWidths.map((w, idx) => (
            <col key={idx} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {block.rows.map((row, rIdx) => {
            const isFirst = rIdx === 0;
            const isLast = rIdx === rowCount - 1;
            return (
              <tr key={row.rowId}>
                {row.cells.map((cell, cIdx) => {
                  const rawHtml = slots[cell.slotId]?.content ?? "";
                  const text = rawHtml.replace(/<[^>]+>/g, "").trim();
                  const isBlank = text.length === 0;
                  const isLastCol = cIdx === row.cells.length - 1;

                  return (
                    <td
                      key={cell.cellId}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      style={{
                        backgroundColor: cell.backgroundColor ?? "#ffffff",
                        fontWeight: cell.fontWeight,
                        textAlign: cell.hAlign ?? "left",
                        verticalAlign: "middle",
                        fontSize: "8px",
                        lineHeight: "1.25",
                        padding: "2px 3px",
                        height: isBlank ? "15px" : undefined,
                        borderTop: isFirst ? rules?.headerTop : undefined,
                        borderBottom:
                          isFirst && rules?.headerBottom
                            ? rules.headerBottom
                            : isLast && rules?.outer === "none"
                              ? rules.rowBottom
                              : rules?.rowBottom,
                        borderLeft:
                          cIdx === 0 || rules?.vertical === "none" ? "none" : rules?.vertical,
                        borderRight:
                          isLastCol || rules?.vertical === "none" ? "none" : rules?.vertical,
                      }}
                      className="text-slate-700 truncate"
                    >
                      {isBlank ? "\u00A0" : text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const FormAssetHubSidebar: React.FC<FormAssetHubSidebarProps> = ({
  linkedDocs,
  activeLinkedDocId,
  activeLinkedPageId,
  activeAssetId,
  sheetElements,
  selectedBlockMeta,
  blockVariants,
  viewCache = {},
  dirtyViewBlocks = {},
  aiCompileStatus,
  webFormTheme,
  locked,
  onSelectAsset,
  onSelectElementBlock,
  onSelectBlockVariant,
  onApplyTableView,
  onRevertTableView,
  onRegenerateTableAi,
  onCancelAiCompile,
  onSelectWebFormTheme,
  onClearBlockSelection,
  onSelectLinkedDoc,
  onSelectLinkedPage,
  onUnlockToWysiwym,
  onEnterPhase3Edit,
}) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FormAssetCategory>("all");
  const [aiFeedback, setAiFeedback] = useState("");

  const activeDoc = linkedDocs.find((d) => d.id === activeLinkedDocId) ?? linkedDocs[0];
  const isWebFormDoc = Boolean(activeDoc?.docFormat?.toLowerCase().includes("web"));

  const visibleSheetElements = useMemo(() => {
    if (!activeLinkedPageId) return sheetElements;
    const scoped = sheetElements.filter((el) => el.pageId === activeLinkedPageId);
    return scoped.length > 0 ? scoped : sheetElements;
  }, [sheetElements, activeLinkedPageId]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FORM_ASSET_CATALOG.filter((item) => {
      const catOk = category === "all" || item.category === category;
      const queryOk =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.slotsSummary.some((s) => s.toLowerCase().includes(q));
      return catOk && queryOk;
    });
  }, [query, category]);

  const blockRoleAssets = selectedBlockMeta
    ? BLOCK_ASSET_CATALOG[selectedBlockMeta.role]
    : null;
  const activeBlockVariant = selectedBlockMeta
    ? blockVariants[selectedBlockMeta.blockId] ?? selectedBlockMeta.defaultVariant
    : null;

  return (
    <aside className="w-[354px] shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
      {/* 허브 헤더 */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/80 space-y-2 shrink-0">
        {selectedBlockMeta ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClearBlockSelection}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                전체 양식 에셋
              </button>
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                {BLOCK_ROLE_LABELS[selectedBlockMeta.role]}
              </span>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">선택 블록 전용 에셋 교체</div>
              <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                {selectedBlockMeta.label}
              </div>
            </div>
            {selectedBlockMeta.role === "table" &&
            dirtyViewBlocks[selectedBlockMeta.blockId] ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 space-y-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-bold text-amber-950">
                    미확정 수정 (느낌 보기 중)
                  </div>
                  <p className="text-[10.5px] text-amber-800 leading-snug">
                    에셋 캐시는 아직 변경되지 않았습니다. 확정하려면 Apply를 누르세요.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {onApplyTableView ? (
                    <button
                      type="button"
                      onClick={() => onApplyTableView(selectedBlockMeta.blockId)}
                      className="py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Apply (캐시 확정)
                    </button>
                  ) : null}
                  {onRevertTableView ? (
                    <button
                      type="button"
                      onClick={() => onRevertTableView(selectedBlockMeta.blockId)}
                      className="py-1.5 px-2 rounded-lg bg-white hover:bg-amber-100/70 border border-amber-300 text-amber-900 text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      캐시로 복원
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <FolderKanban className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isWebFormDoc ? "웹 설문 UI 에셋 허브" : "에셋 허브 (회사 한글 서식)"}</span>
              </div>
              {locked ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                  <Lock className="w-2.5 h-2.5" />
                  마감 중
                </span>
              ) : isWebFormDoc ? (
                <span className="text-[10px] font-mono text-indigo-600 font-semibold">
                  웹 UI {BLOCK_ASSET_CATALOG["web-form"].length}종
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-500">
                  양식 {FORM_ASSET_CATALOG.length} · 에셋 {TOTAL_BLOCK_ASSET_COUNT}종
                </span>
              )}
            </div>

            {locked ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-900 space-y-1.5">
                <p>본문·표 마감(Phase 3) 중에는 서식 에셋 교체가 잠겨 있습니다.</p>
                <button
                  type="button"
                  onClick={onUnlockToWysiwym}
                  className="w-full py-1 rounded-md bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100/60 cursor-pointer transition"
                >
                  구조·에셋 모드로 돌아가기
                </button>
              </div>
            ) : isWebFormDoc ? (
              <div className="rounded-lg bg-indigo-50/70 border border-indigo-200 px-2.5 py-1.5 text-[11px] text-indigo-900 leading-snug">
                아래에서 <strong>웹 설문 UI 테마</strong>를 고르면 전체 페이지에 일괄 적용됩니다. 개별 문항 클릭 시 섹션별 UI도 따로 고를 수 있습니다.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="품의서, 수요조사표, 일정표 검색..."
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {CATEGORY_TABS.map((tab) => {
                    const active = category === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCategory(tab.id)}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] whitespace-nowrap border cursor-pointer transition ${active
                          ? "bg-slate-900 text-white border-slate-900 font-semibold"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 본문: 블록 선택 시 해당 블록 전용 에셋 목록 / 미선택 시 전체 문서 에셋 허브 */}
      <div
        className={`flex-1 overflow-y-auto p-3 space-y-2.5 ${locked ? "opacity-45 pointer-events-none select-none" : ""
          }`}
      >
        {selectedBlockMeta && blockRoleAssets ? (
          <>
            <div className="rounded-lg bg-indigo-50/70 border border-indigo-200 px-2.5 py-2 text-[11px] text-indigo-900 flex items-start gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                {selectedBlockMeta.role === "table" ? (
                  <>
                    <strong>실험용 에셋 5종</strong> 레퍼런스로 <strong>AI 컴파일</strong>하여{" "}
                    <code>&lt;&lt;view:table&gt;&gt;</code>에 캐싱합니다. (원문 보존)
                  </>
                ) : (
                  <>
                    선택한 <strong>{BLOCK_ROLE_LABELS[selectedBlockMeta.role]}</strong> 위치만 아래
                    한글 에셋으로 즉시 갈아끼웁니다.
                  </>
                )}
              </span>
            </div>

            {selectedBlockMeta.role === "table" &&
            aiCompileStatus?.runningBlockId === selectedBlockMeta.blockId ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-900">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                    AI 컴파일 실행 중
                    {aiCompileStatus.activeEngineLabel
                      ? ` (${aiCompileStatus.activeEngineLabel})`
                      : "..."}
                  </span>
                  {onCancelAiCompile ? (
                    <button
                      type="button"
                      onClick={onCancelAiCompile}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-amber-300 bg-white text-[10px] text-amber-800 hover:bg-amber-100 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      중단
                    </button>
                  ) : null}
                </div>
                {aiCompileStatus.streamPreview ? (
                  <pre className="text-[10px] leading-snug text-amber-950/90 bg-white/80 border border-amber-200 rounded-lg p-2 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">
                    {aiCompileStatus.streamPreview}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {selectedBlockMeta.role === "table" && aiCompileStatus?.error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10.5px] text-rose-800">
                AI 컴파일 실패(규칙 폴백 유지): {aiCompileStatus.error}
              </div>
            ) : null}

            {blockRoleAssets.map((variant) => {
              const selected = activeBlockVariant === variant.id;
              const isTableBlock = selectedBlockMeta.role === "table";
              const cacheEntry = isTableBlock
                ? viewCache[`${selectedBlockMeta.blockId}::${variant.id}`]
                : undefined;
              const isCompilingThis =
                aiCompileStatus?.runningBlockId === selectedBlockMeta.blockId &&
                aiCompileStatus?.runningVariantId === variant.id;

              if (isTableBlock) {
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() =>
                      onSelectBlockVariant(selectedBlockMeta.blockId, variant.id)
                    }
                    className={`w-full rounded-xl border p-2.5 text-left transition cursor-pointer space-y-2 ${
                      selected
                        ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-2xs"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1 min-w-0 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[9.5px] font-bold leading-none shrink-0">
                            {variant.badge}
                          </span>
                          {cacheEntry ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none shrink-0 ${
                                cacheEntry.generatedBy === "ai"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : cacheEntry.generatedBy === "manual"
                                    ? "bg-sky-100 text-sky-800 border border-sky-200"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {cacheEntry.generatedBy === "ai"
                                ? "AI 캐시"
                                : cacheEntry.generatedBy === "manual"
                                  ? "수동 편집"
                                  : "초기 뷰"}
                            </span>
                          ) : null}
                        </div>
                        {isCompilingThis ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 shrink-0 whitespace-nowrap">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            생성중
                          </span>
                        ) : selected ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 shrink-0 whitespace-nowrap">
                            <Check className="w-3 h-3" />
                            적용됨
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs font-bold text-slate-900 leading-snug">
                        {variant.title}
                      </div>
                    </div>

                    <TableAssetTemplatePreview asset={variant} />

                    <p className="text-[10px] text-slate-500 leading-snug">
                      {variant.description}
                    </p>
                  </button>
                );
              }

              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() =>
                    onSelectBlockVariant(selectedBlockMeta.blockId, variant.id)
                  }
                  className={`w-full rounded-xl border p-2.5 text-left transition cursor-pointer flex items-start gap-2.5 ${selected
                    ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-2xs"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                >
                  <BlockVariantThumb kind={variant.wireframe} />

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[9.5px] font-bold leading-none">
                        {variant.badge}
                      </span>
                      {selected ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700">
                          <Check className="w-3 h-3" />
                          적용됨
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      {variant.title}
                    </div>
                    <p className="text-[10.5px] text-slate-500 leading-snug">
                      {variant.description}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {variant.slotsSummary.map((slotLabel) => (
                        <span
                          key={slotLabel}
                          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9.5px] font-medium"
                        >
                          {slotLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}

            {selectedBlockMeta.role === "table" && onRegenerateTableAi && activeBlockVariant ? (
              <div className="rounded-xl border border-indigo-200 bg-white p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AI 부분 조정 · 재생성</span>
                </div>
                <textarea
                  rows={2}
                  value={aiFeedback}
                  onChange={(e) => setAiFeedback(e.target.value)}
                  placeholder="예: 참석 구분을 3칸으로 쪼개고 비고 열을 우측에 붙여줘 (비워두면 선택 에셋으로 새로 컴파일)"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
                <button
                  type="button"
                  disabled={aiCompileStatus?.runningBlockId === selectedBlockMeta.blockId}
                  onClick={() =>
                    onRegenerateTableAi(
                      selectedBlockMeta.blockId,
                      activeBlockVariant,
                      aiFeedback.trim() || undefined
                    )
                  }
                  className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  이 표만 AI 재생성 실행
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onEnterPhase3Edit}
              className="w-full py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 text-emerald-900 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              이 블록 내용·셀 직접 편집 (Phase 3)
            </button>
          </>
        ) : (
          <>
            {visibleSheetElements.length > 0 ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-indigo-950">
                    현재 페이지 구성 엘리먼트 ({visibleSheetElements.length}개)
                  </span>
                  <span className="text-[10px] text-indigo-700 font-medium">
                    항목별 3~4종 에셋
                  </span>
                </div>
                <div className="space-y-1">
                  {visibleSheetElements.map((el) => {
                    const candidateCount = BLOCK_ASSET_CATALOG[el.role].length;
                    return (
                      <button
                        key={el.blockId}
                        type="button"
                        onClick={() => onSelectElementBlock(el.blockId)}
                        className="w-full px-2 py-1.5 rounded-lg bg-white border border-indigo-200/80 hover:border-indigo-400 hover:bg-indigo-50/50 flex items-center justify-between gap-2 text-left cursor-pointer transition"
                      >
                        <span className="text-[11px] font-semibold text-slate-800 truncate">
                          {el.label}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold shrink-0">
                          에셋 {candidateCount}종 →
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-100/80 border border-slate-200 px-2.5 py-2 text-[11px] text-slate-600 leading-snug">
                💡 중앙 A4 시트에서 <strong>제목 · 안내 · 개요표 · 문항표 블록</strong>을 클릭하면
                그 블록에 맞는 전용 에셋 목록으로 바뀝니다.
              </div>
            )}

            {isWebFormDoc ? (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-700 px-0.5">
                  웹 설문 UI 전체 테마 ({BLOCK_ASSET_CATALOG["web-form"].length}종)
                </div>
                {BLOCK_ASSET_CATALOG["web-form"].map((variant) => {
                  const selected = webFormTheme === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => onSelectWebFormTheme(variant.id as WebFormVariant)}
                      className={`w-full rounded-xl border p-2.5 text-left transition cursor-pointer flex items-start gap-2.5 ${
                        selected
                          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-2xs"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <BlockVariantThumb kind={variant.wireframe} />

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9.5px] font-bold leading-none">
                            {variant.badge}
                          </span>
                          {selected ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700">
                              <Check className="w-3 h-3" />
                              적용됨
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs font-bold text-slate-900 leading-snug">
                          {variant.title}
                        </div>
                        <p className="text-[10.5px] text-slate-500 leading-snug">
                          {variant.description}
                        </p>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {variant.slotsSummary.map((slotLabel) => (
                            <span
                              key={slotLabel}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9.5px] font-medium"
                            >
                              {slotLabel}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                {filteredAssets.map((asset) => {
                  const selected = activeAssetId === asset.id;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onSelectAsset(asset.id)}
                      className={`w-full rounded-xl border p-2.5 text-left transition cursor-pointer flex items-start gap-2.5 ${selected
                        ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500 shadow-2xs"
                        : "border-slate-200 bg-white hover:bg-slate-50/80"
                        }`}
                    >
                      <AssetWireframeThumb kind={asset.wireframe} />

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border leading-none ${asset.badgeColor}`}
                          >
                            {asset.categoryLabel}
                          </span>
                          {selected ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700">
                              <Check className="w-3 h-3" />
                              적용됨
                            </span>
                          ) : null}
                        </div>

                        <div className="text-xs font-bold text-slate-900 leading-snug">
                          {asset.title}
                        </div>
                        <p className="text-[10.5px] text-slate-500 leading-snug line-clamp-2">
                          {asset.description}
                        </p>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {asset.slotsSummary.map((slotLabel) => (
                            <span
                              key={slotLabel}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9.5px] font-medium"
                            >
                              {slotLabel}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredAssets.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                    검색 조건에 맞는 서식 에셋이 없습니다.
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>

      {/* 하단: 블록 미선택 시에만 Phase 1 <<document:유형>> / <<page:유형>> 연계 현황 노출 */}
      {!selectedBlockMeta ? (
        <div className="p-3 border-t border-slate-200 bg-slate-50/90 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-700 inline-flex items-center gap-1">
              <Tag className="w-3 h-3 text-indigo-600" />
              Phase 1 &lt;&lt;document&gt;&gt; · &lt;&lt;page&gt;&gt; 연계
            </span>
            <span className="text-[10px] text-slate-400">{linkedDocs.length}개 문서 연결</span>
          </div>

          {linkedDocs.length === 0 ? (
            <p className="text-[11px] text-slate-500 leading-snug">
              좌측 아웃라이너 항목 끝에{" "}
              <code className="text-indigo-700">&lt;&lt;document:hwp&gt;&gt;</code> 또는{" "}
              <code className="text-emerald-700">&lt;&lt;page:유형&gt;&gt;</code>를 입력하면 이
              에셋으로 내용이 유입됩니다.
            </p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {linkedDocs.map((doc) => {
                  const isSelected = doc.id === activeDoc?.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onSelectLinkedDoc(doc.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] border cursor-pointer max-w-full transition ${isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      title={doc.title}
                    >
                      {doc.docFormat ? (
                        <span
                          className={`px-1 rounded text-[9px] font-bold uppercase shrink-0 ${isSelected ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-700"
                            }`}
                        >
                          {doc.docFormat}
                        </span>
                      ) : null}
                      <span className="truncate">{doc.title}</span>
                    </button>
                  );
                })}
              </div>

              {activeDoc && activeDoc.pages.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {activeDoc.pages.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectLinkedPage(p.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer truncate max-w-full transition ${activeLinkedPageId === p.id
                        ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                        : "bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                        }`}
                      title={p.title}
                    >
                      P{idx + 1}
                      {p.assetHint ? `·${p.assetHint}` : `. ${p.title}`}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
};
