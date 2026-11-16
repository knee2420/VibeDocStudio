import React from "react";
import { Square } from "lucide-react";

import { insertButtonClass, type AssetInsertButtonProps } from "./insertAssetVariant";

/**
 * 빈 칸으로 넣기 — 지금까지의 "인스턴스 삽입" 동작 그대로 (기본 블록은 빈 입력칸,
 * 섹션 에셋은 "제목을 입력하세요" 틀). 넣기는 예전 경로(`onInsertBlank` = `addBlockToPage`)를 쓴다.
 */
export const InsertBlankButton: React.FC<AssetInsertButtonProps & { onInsertBlank: () => void }> = ({
  pageId,
  primary,
  onInserted,
  onPreview,
  onInsertBlank,
}) => (
  <button
    type="button"
    data-testid={primary ? "asset-insert-instance-btn" : "asset-insert-blank-btn"}
    disabled={!pageId}
    onMouseEnter={() => onPreview("blank")}
    onFocus={() => onPreview("blank")}
    onClick={() => {
      onInsertBlank();
      onInserted();
    }}
    title="빈 입력칸으로 넣습니다 (예전 인스턴스 삽입과 같음)."
    className={insertButtonClass(primary)}
  >
    <Square className="w-3.5 h-3.5" />
    빈 칸으로 삽입
  </button>
);
