import React, { useMemo } from "react";
import type { VDocAsset, VDocPage } from "@vibe/vdoc-schema";
import { resolveDefaultStylePack } from "@vibe/style-core";
import { VDocPageSheet, VDocStyleProvider } from "@vibe/slot-canvas";

export interface VDocAssetThumbnailProps {
  readonly asset: VDocAsset;
  /** Preview box height in CSS pixels. Defaults to 132 for right-dock cards. */
  readonly height?: number;
  /** Render scale override. If omitted, automatically fits width cleanly. */
  readonly scale?: number;
  readonly className?: string;
}

const NOOP = () => {};

/**
 * Live 2D Thumbnail Renderer for `.vasset` cards & editor preview.
 * Renders the REAL `VDocPageSheet` directly from `asset.structure.blocks` + `slots`
 * (zero hardcoded SVGs — any newly captured asset gets an instant authentic 2D preview).
 */
export const VDocAssetThumbnail: React.FC<VDocAssetThumbnailProps> = React.memo(
  ({ asset, height = 132, scale, className = "" }) => {
    const isBlog = asset.assetKind === "blog-section";
    const sheetWidth = asset.structure.pageMeta?.surfaceWidth ?? (isBlog ? 720 : 794);
    const computedScale = scale ?? (isBlog ? 0.34 : 0.31);

    const previewPage: VDocPage = useMemo(
      () => ({
        pageId: `thumb-${asset.assetId}`,
        pageNumber: 1,
        pageLabel: asset.structure.pageMeta?.pageLabel ?? asset.title,
        unitKind: asset.structure.pageMeta?.unitKind ?? (isBlog ? "section" : "page"),
        sectionRole: asset.structure.pageMeta?.sectionRole,
        headerSlotId: "__thumb_hdr__",
        footerSlotId: "__thumb_ftr__",
        hideHeaderFooter: true,
        pageRect: { width: sheetWidth, height: 1123, unit: "px" },
        blocks: asset.structure.blocks,
      }),
      [asset, isBlog, sheetWidth]
    );

    const previewSlots = useMemo(
      () => ({
        __thumb_hdr__: {
          slotId: "__thumb_hdr__",
          label: "Header",
          role: "editable-slot" as const,
          content: "",
          backDataRefs: [],
        },
        __thumb_ftr__: {
          slotId: "__thumb_ftr__",
          label: "Footer",
          role: "editable-slot" as const,
          content: "",
          backDataRefs: [],
        },
        ...asset.structure.slots,
      }),
      [asset.structure.slots]
    );

    const stylePack = useMemo(
      () => (isBlog ? resolveDefaultStylePack("blog") : null),
      [isBlog]
    );

    return (
      <div
        className={`relative w-full overflow-hidden rounded border border-[var(--obs-border-subtle,#323232)] bg-[#f4f5f7] ${className}`}
        style={{ height: `${height}px` }}
      >
        <div
          className="pointer-events-none select-none text-slate-900"
          style={{
            width: `${sheetWidth}px`,
            transform: `scale(${computedScale})`,
            transformOrigin: "top left",
          }}
        >
          <VDocStyleProvider pack={stylePack} viewKey={isBlog ? "blog" : "a4"}>
            <VDocPageSheet
              docTitle={asset.title}
              totalPages={1}
              seamless={isBlog}
              page={previewPage}
              slots={previewSlots}
              backdata={{}}
              mode="Viewing"
              selectedBlockId={null}
              selectedSlotId={null}
              composerOpenSlotId={null}
              onSelectPage={NOOP}
              onSelectBlock={NOOP}
              onSelectSlot={NOOP}
              onToggleComposerForSlot={NOOP}
              onOpenBackdataDrawer={NOOP}
              onUpdateSlotContent={NOOP}
              onMoveBlock={NOOP}
              onDeleteBlock={NOOP}
            />
          </VDocStyleProvider>
        </div>
        {/* Subtle bottom fade so tall pages cleanly indicate continuation */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
    );
  }
);
