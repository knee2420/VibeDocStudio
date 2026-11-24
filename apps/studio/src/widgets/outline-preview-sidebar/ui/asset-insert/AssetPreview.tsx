import React, { useMemo } from "react";

import { BlockStaticPreview } from "@vibe/slot-canvas";

import {
  applyPropertyValues,
  availableVariants,
  buildAssetVariant,
  exposedPropertiesFor,
  type AssetPropertyValues,
  type AssetSource,
  type AssetVariantId,
} from "@/entities/asset-library";

/** 그 에셋을 처음 보여 줄 내용: 원본이 있으면 원본, 아니면 예시. */
export const defaultPreviewVariant = (source: AssetSource): AssetVariantId => availableVariants(source)[0];

/**
 * 에셋 미리보기 — 캔버스와 같은 블록 뷰로 그린 실제 내용 (예시 문구 · 더미 이미지 · 원본).
 * 타일(`height` 고정, 통째로 맞춤)과 세부 정보(큰 미리보기) 모두 이것을 쓴다.
 */
export const AssetPreview: React.FC<{
  source: AssetSource;
  variant?: AssetVariantId;
  height: number;
  /** 그리는 폭 — 좁게 그릴수록 줄였을 때 글자가 크게 보인다 (타일 340 · 세부 정보 440). 섹션 에셋은 600. */
  contentWidth?: number;
  /** 세부 정보에서 고른 속성 값 (없으면 저장된 값 그대로). */
  properties?: AssetPropertyValues;
  /** contain: 통째로 맞춤 (에셋) · width: 폭에 맞추고 아래는 잘림 (페이지). */
  fit?: "contain" | "width";
  className?: string;
}> = ({
  source,
  variant,
  height,
  contentWidth,
  properties,
  fit = "contain",
  className = "",
}) => {
  const v = variant ?? defaultPreviewVariant(source);
  const blocks = useMemo(
    () => applyPropertyValues(buildAssetVariant(source, v) ?? [], exposedPropertiesFor(source), properties),
    [source, v, properties],
  );
  if (blocks.length === 0) {
    return <div className={`flex items-center justify-center text-[11px] text-black/40 ${className}`} style={{ height }}>미리보기 없음</div>;
  }
  // 섹션 에셋은 문서 본문에서 잡은 것이라 조금 넓게 (그래도 A4 본문 714px 보다는 좁혀 글자가 보이게).
  const width = source.type === "section" && fit === "contain" ? 600 : (contentWidth ?? 440);
  if (fit === "width") {
    return (
      <div className={`overflow-hidden ${className}`} style={{ height }}>
        <BlockStaticPreview blocks={blocks} fit="width" contentWidth={width} />
      </div>
    );
  }
  return <BlockStaticPreview blocks={blocks} fit="contain" height={height} contentWidth={width} className={className} />;
};
