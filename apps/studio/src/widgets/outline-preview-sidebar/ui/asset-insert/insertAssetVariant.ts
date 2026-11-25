import {
  applyPropertyValues,
  buildAssetVariant,
  exposedPropertiesFor,
  useAssetLibraryStore,
  type AssetPropertyValues,
  type AssetSource,
  type AssetVariantId,
} from "@/entities/asset-library";
import { useSlotSelectionStore } from "@/entities/slot";
import { revealCanvasElement } from "@/shared/lib";

/**
 * 에셋을 원본 그대로 · 더미 데이터로 넣는다 (고른 속성 값을 적용해서).
 * 넣은 마지막 블록을 고르고, 화면 밖이면 그 자리로 스크롤하며 잠깐 강조한다.
 */
export function insertAssetVariant(
  source: AssetSource,
  variant: AssetVariantId,
  pageId: string,
  label: string,
  properties?: AssetPropertyValues,
): boolean {
  const built = buildAssetVariant(source, variant);
  if (!built || !pageId) return false;
  const snapshots = applyPropertyValues(built, exposedPropertiesFor(source), properties);
  const ids = useAssetLibraryStore.getState().insertSnapshotsIntoPage(snapshots, pageId, undefined, label);
  const last = ids.at(-1);
  if (!last) return false;
  useSlotSelectionStore.getState().setSelectedBlockId(last);
  revealCanvasElement({ blockId: last, onlyIfHidden: true });
  return true;
}

/** 삽입 버튼 공통 모양 (첫 버튼만 파란 강조). */
export const insertButtonClass = (primary: boolean) =>
  `w-full h-8 rounded-[6px] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-default transition-colors disabled:opacity-40 ${
    primary ? "bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white" : "bg-white border border-[#e6e6e6] hover:bg-[#f5f5f5] text-black/80"
  }`;
