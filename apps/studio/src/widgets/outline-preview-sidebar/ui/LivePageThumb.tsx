import React, { memo } from "react";

import { MemoVDocPageSheet } from "@vibe/slot-canvas";
import { documentSurface, type VDocDocument, type VDocPage } from "@vibe/vdoc-schema";

const noop = () => {};
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

/**
 * 실제 A4 페이지를 축소해 보여 주는 라이브 썸네일 (Canva 페이지 썸네일 스타일).
 * `MemoVDocPageSheet` 를 `transform: scale()` 로 줄이고 상호작용을 꺼서 클릭 · 호버가 카드에 그대로 전달된다.
 */
export const LivePageThumb: React.FC<{
  doc: VDocDocument;
  page: VDocPage;
  /** 썸네일 표시 너비(px). 높이는 A4 비율(1:1.414)로 자동 계산된다. */
  width: number;
}> = memo(({ doc, page, width }) => {
  const scale = width / A4_WIDTH;
  const height = Math.round(A4_HEIGHT * scale);
  const seamless = documentSurface(doc).kind === "scroll";

  return (
    <div
      style={{ width, height }}
      className="relative overflow-hidden bg-white select-none pointer-events-none"
    >
      <div
        style={{
          width: A4_WIDTH,
          height: A4_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="pointer-events-none"
      >
        <MemoVDocPageSheet
          seamless={seamless}
          docTitle={doc.title}
          totalPages={doc.pages.length}
          page={page}
          slots={doc.slots}
          backdata={doc.backdata}
          mode="Viewing"
          selectedBlockId={null}
          selectedSlotId={null}
          composerOpenSlotId={null}
          onSelectPage={noop}
          onSelectSlot={noop}
          onToggleComposerForSlot={noop}
          onOpenBackdataDrawer={noop}
          onUpdateSlotContent={noop}
          onMoveBlock={noop}
          onDeleteBlock={noop}
        />
      </div>
    </div>
  );
});

LivePageThumb.displayName = "LivePageThumb";
