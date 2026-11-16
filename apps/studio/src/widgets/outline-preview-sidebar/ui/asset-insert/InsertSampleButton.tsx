import React from "react";
import { Sparkles } from "lucide-react";

import { insertAssetVariant, insertButtonClass, type AssetInsertButtonProps } from "./insertAssetVariant";

/** 예시 문구 · 더미 이미지를 채운 그대로 넣기 (캔바 · 미리캔버스처럼 보이는 그대로). */
export const InsertSampleButton: React.FC<AssetInsertButtonProps> = ({ source, name, pageId, primary, onInserted, onPreview }) => (
  <button
    type="button"
    data-testid={primary ? "asset-insert-instance-btn" : "asset-insert-sample-btn"}
    disabled={!pageId}
    onMouseEnter={() => onPreview("sample")}
    onFocus={() => onPreview("sample")}
    onClick={() => {
      if (insertAssetVariant(source, "sample", pageId, `에셋 '${name}' 삽입 (예시 포함)`)) onInserted();
    }}
    title="미리보기에 보이는 예시 문구 · 더미 이미지가 그대로 들어갑니다. 넣은 뒤 고쳐 쓰세요."
    className={insertButtonClass(primary)}
  >
    <Sparkles className="w-3.5 h-3.5" />
    예시 넣어 삽입
  </button>
);
