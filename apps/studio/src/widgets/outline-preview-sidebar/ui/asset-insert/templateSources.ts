import { getBlockSlotIds, type VDocDocument, type VDocPage, type VDocSlot } from "@vibe/vdoc-schema";

import { buildAssetVariant, type AssetSource, type AssetVariantId, type SectionAssetBlockSnapshot } from "@/entities/asset-library";

/** 템플릿 문서의 한 페이지를 에셋 미리보기 · 넣기 출처로 (원본 = 그 페이지 그대로). */
export function pageAssetSource(doc: VDocDocument, page: VDocPage): AssetSource {
  const snapshots: SectionAssetBlockSnapshot[] = page.blocks.map((block) => {
    const slots: Record<string, VDocSlot> = {};
    for (const sid of getBlockSlotIds(block)) {
      if (doc.slots[sid]) slots[sid] = doc.slots[sid];
    }
    return { block, slots };
  });
  return {
    type: "section",
    section: {
      id: `tpl:${doc.docId}:${page.pageId}`,
      name: page.pageLabel,
      description: "",
      blocks: snapshots,
      originalBlocks: snapshots,
      slotCount: snapshots.reduce((n, s) => n + Object.keys(s.slots).length, 0),
      createdAt: "",
    },
  };
}

/**
 * 고른 방법(원본 그대로 · 더미 데이터)으로 바꾼 템플릿 문서 사본 — 페이지 가져오기(`importTemplatePages`)에 그대로 넘긴다.
 * 블록 · 슬롯 id 는 그대로라 가져오기가 새 id 로 복제한다.
 */
export function templateDocForVariant(doc: VDocDocument, page: VDocPage, variant: AssetVariantId): VDocDocument | null {
  if (variant === "original") return doc;
  const snapshots = buildAssetVariant(pageAssetSource(doc, page), variant);
  if (!snapshots) return null;
  const slots = { ...doc.slots };
  for (const s of snapshots) Object.assign(slots, s.slots);
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.pageId === page.pageId ? { ...p, blocks: snapshots.map((s) => s.block) } : p)),
    slots,
  };
}
