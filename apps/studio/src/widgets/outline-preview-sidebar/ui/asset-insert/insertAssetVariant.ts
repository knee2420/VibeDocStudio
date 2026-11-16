import { buildAssetVariant, useAssetLibraryStore, type AssetSource, type AssetVariantId } from "@/entities/asset-library";
import { useSlotSelectionStore } from "@/entities/slot";
import { revealCanvasElement } from "@/shared/lib";

/**
 * 예시 · 원본 내용으로 넣기 (빈 칸은 예전 삽입 경로 `addBlockToPage` 를 그대로 쓴다).
 * 넣은 마지막 블록을 고르고, 화면 밖이면 그 자리로 스크롤하며 잠깐 강조한다.
 */
export function insertAssetVariant(source: AssetSource, variant: Exclude<AssetVariantId, "blank">, pageId: string, label: string): boolean {
  const snapshots = buildAssetVariant(source, variant);
  if (!snapshots || !pageId) return false;
  const ids = useAssetLibraryStore.getState().insertSnapshotsIntoPage(snapshots, pageId, undefined, label);
  const last = ids.at(-1);
  if (!last) return false;
  useSlotSelectionStore.getState().setSelectedBlockId(last);
  revealCanvasElement({ blockId: last, onlyIfHidden: true });
  return true;
}

/** 삽입 버튼 공통 모양 (첫 버튼만 파란 강조). */
export const insertButtonClass = (primary: boolean) =>
  `w-full h-8 rounded-[6px] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-default transition-colors ${
    primary ? "bg-[#0d99ff] hover:bg-[#0b8ae6] text-white" : "bg-white border border-[#e6e6e6] hover:bg-[#f5f5f5] text-black/80"
  }`;

export interface AssetInsertButtonProps {
  source: AssetSource;
  name: string;
  pageId: string;
  primary: boolean;
  /** 넣은 뒤 (세부 정보 닫기). */
  onInserted: () => void;
  /** 버튼에 올리면 그 내용으로 미리보기를 바꾼다. */
  onPreview: (variant: AssetVariantId) => void;
}
