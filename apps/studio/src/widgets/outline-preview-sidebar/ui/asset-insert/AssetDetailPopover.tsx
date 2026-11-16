import React, { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { ASSET_VARIANT_LABEL, availableVariants, type AssetSource, type AssetVariantId } from "@/entities/asset-library";

import { AssetPreview, defaultPreviewVariant } from "./AssetPreview";
import { InsertBlankButton } from "./InsertBlankButton";
import { InsertOriginalButton } from "./InsertOriginalButton";
import { InsertSampleButton } from "./InsertSampleButton";

export interface AssetDetailPopoverProps {
  source: AssetSource;
  name: string;
  description: string;
  folderLabel: string;
  /** 세부 정보 아래 한 줄 (예: "기본 블록" · "3개 블록 · 7개 슬롯"). */
  meta?: string;
  pageId: string;
  /** 사이드바 오른쪽 가장자리 · 카드 위치. */
  anchor: { top: number; left: number };
  onClose: () => void;
  /** 빈 칸으로 넣기 — 예전 인스턴스 삽입 경로 그대로. */
  onInsertBlank: () => void;
}

/**
 * 에셋 세부 정보 (피그마 에셋 "세부 정보"와 같은 배치): 큰 미리보기 → 이름 · 설명 → 삽입 버튼.
 * 클릭만으로는 아무것도 넣지 않는다. 미리보기는 실제로 들어갈 내용을 그대로 보여 주고,
 * 버튼에 올리거나 아래 선택지로 원본 · 예시 · 빈 칸을 비교할 수 있다.
 */
export const AssetDetailPopover: React.FC<AssetDetailPopoverProps> = ({
  source,
  name,
  description,
  folderLabel,
  meta,
  pageId,
  anchor,
  onClose,
  onInsertBlank,
}) => {
  const variants = availableVariants(source);
  const [preview, setPreview] = useState<AssetVariantId>(() => defaultPreviewVariant(source));
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);

  // 화면 아래로 넘치지 않게 위로 당긴다 (높이를 잰 뒤).
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(48, Math.min(anchor.top, window.innerHeight - h - 12)));
  }, [anchor.top, preview]);

  const buttonProps = { source, name, pageId, onInserted: onClose, onPreview: setPreview };

  return (
    <div
      ref={ref}
      data-testid="asset-detail-popover"
      style={{ top, left: anchor.left }}
      className="fig-panel fixed z-50 w-[300px] bg-white rounded-[13px] overflow-hidden shadow-[0_5px_17px_rgba(0,0,0,0.2),0_2px_7px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.12)]"
    >
      <div className="h-12 pl-4 pr-2 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">세부 정보</div>
          <div className="text-black/50 truncate">{folderLabel}</div>
        </div>
        <button type="button" onClick={onClose} className="fig-icon-btn" title="닫기">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-[#f5f5f5] px-4 py-4 border-y border-[var(--fig-border)]">
        <div className="rounded-[4px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] p-3">
          <AssetPreview source={source} variant={preview} height={190} />
        </div>
        {variants.length > 1 && (
          <div className="mt-3 fig-seg !bg-white" role="group" aria-label="미리보기 내용">
            {variants.map((v) => (
              <button key={v} type="button" aria-pressed={preview === v} onClick={() => setPreview(v)} data-testid={`asset-preview-variant-${v}`}>
                {ASSET_VARIANT_LABEL[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-3 pb-4">
        <div className="text-[15px] font-semibold leading-5">{name}</div>
        <div className="mt-1 text-black/50 leading-4">{description}</div>
        {meta && <div className="mt-1 text-black/40">{meta}</div>}

        <div className="mt-3 space-y-1.5">
          {variants.map((v, i) =>
            v === "original" ? (
              <InsertOriginalButton key={v} {...buttonProps} primary={i === 0} />
            ) : v === "sample" ? (
              <InsertSampleButton key={v} {...buttonProps} primary={i === 0} />
            ) : (
              <InsertBlankButton key={v} {...buttonProps} primary={i === 0} onInsertBlank={onInsertBlank} />
            )
          )}
        </div>
      </div>
    </div>
  );
};
