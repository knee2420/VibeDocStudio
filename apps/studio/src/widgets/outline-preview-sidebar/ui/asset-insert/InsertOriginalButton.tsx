import React from "react";
import { Copy } from "lucide-react";

import { insertAssetVariant, insertButtonClass, type AssetInsertButtonProps } from "./insertAssetVariant";

/** 섹션 에셋을 만들 때 감싼 영역의 원본 내용 그대로 넣기 (섹션 에셋만). */
export const InsertOriginalButton: React.FC<AssetInsertButtonProps> = ({ source, name, pageId, primary, onInserted, onPreview }) => (
  <button
    type="button"
    data-testid={primary ? "asset-insert-instance-btn" : "asset-insert-original-btn"}
    disabled={!pageId}
    onMouseEnter={() => onPreview("original")}
    onFocus={() => onPreview("original")}
    onClick={() => {
      if (insertAssetVariant(source, "original", pageId, `섹션 에셋 '${name}' 삽입 (원본 그대로)`)) onInserted();
    }}
    title="감싼 영역의 글자 · 이미지를 그대로 넣습니다."
    className={insertButtonClass(primary)}
  >
    <Copy className="w-3.5 h-3.5" />
    원본 그대로 삽입
  </button>
);
