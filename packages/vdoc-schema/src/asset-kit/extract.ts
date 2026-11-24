import { getBlockSlotIds } from "../block-ops";
import { htmlToPlainText } from "../html-text";
import type { LayoutBlock, VDocPage, VDocSlot } from "../types";
import type { VDocAsset, VDocAssetKind } from "./types";

function collectBlockSlots(
  blocks: readonly LayoutBlock[],
  sourceSlots: Readonly<Record<string, VDocSlot>>
): Record<string, VDocSlot> {
  const out: Record<string, VDocSlot> = {};
  for (const blk of blocks) {
    for (const sid of getBlockSlotIds(blk)) {
      if (sourceSlots[sid]) {
        out[sid] = structuredClone(sourceSlots[sid]);
      }
    }
  }
  return out;
}

/**
 * 블록 트리에서 순수 구조 골격 `.outline` DSL 텍스트를 추론한다.
 */
export function deriveOutlineDslFromBlocks(
  blocks: readonly LayoutBlock[],
  slots: Readonly<Record<string, VDocSlot>>
): string[] {
  const lines: string[] = [];

  const emitBlock = (blk: LayoutBlock, indent: string) => {
    if (blk.kind === "form-title") {
      const txt = htmlToPlainText(slots[blk.slotId]?.content ?? "").trim() || blk.title;
      lines.push(`${indent}<<view:title>> ${txt}`);
      return;
    }
    if (blk.kind === "structured-table") {
      const firstRowAllHeader =
        blk.rows.length > 1 && blk.rows[0].cells.every((c) => Boolean(c.isHeader));
      const tag = firstRowAllHeader ? "<<view:table:header>>" : "<<view:table>>";
      lines.push(`${indent}${tag} ${blk.title || "표"}`);
      for (const row of blk.rows) {
        const hasRichCell = row.cells.some((c) => Boolean(c.blocks && c.blocks.length > 0));
        if (hasRichCell && row.cells.length === 2 && !(row.cells[0].blocks?.length)) {
          const leftTxt = htmlToPlainText(slots[row.cells[0].slotId]?.content ?? "").trim() || "분류";
          lines.push(`${indent}  ${leftTxt} | <<cell>>`);
          for (const nested of row.cells[1].blocks ?? []) {
            emitBlock(nested, `${indent}    `);
          }
        } else {
          const cellsText = row.cells
            .map((c) => {
              const t = htmlToPlainText(slots[c.slotId]?.content ?? "").trim();
              return t || "[-]";
            })
            .join(" | ");
          lines.push(`${indent}  ${cellsText}`);
        }
      }
      return;
    }
    if (blk.kind === "image") {
      lines.push(`${indent}[img:${blk.alt || blk.title || "이미지"}]`);
      return;
    }
    if (blk.kind === "columns-grid") {
      const cols = blk.columns ?? [];
      if (cols.some((c) => Boolean(c.blocks?.length))) {
        lines.push(`${indent}<<view:columns>> ${blk.title || ""}`.trim());
        for (const col of cols) {
          lines.push(`${indent}  <<col>>`);
          for (const nested of col.blocks ?? []) {
            emitBlock(nested, `${indent}    `);
          }
        }
      } else {
        const parts = cols.map((c) =>
          c.image
            ? `[img:${c.image.alt || "이미지"}]`
            : htmlToPlainText(slots[c.slotId ?? ""]?.content ?? "").trim() || "항목"
        );
        lines.push(`${indent}${parts.join(" | ")}`);
      }
      return;
    }
    if (blk.kind === "callout-box") {
      const txt = htmlToPlainText(slots[blk.slotId]?.content ?? "").trim() || blk.title;
      if (blk.variant === "disclosure") {
        lines.push(`${indent}[embed:disclosure | ${txt}]`);
      } else if (blk.variant === "accent-bar") {
        lines.push(`${indent}! ${txt}`);
      } else if (blk.variant === "info-frame") {
        lines.push(`${indent}> ${txt}`);
        for (const kv of blk.kvItems ?? []) {
          lines.push(`${indent}  ${kv.key} :: ${kv.value}`);
        }
      } else {
        lines.push(`${indent}> ${txt}`);
      }
      return;
    }
    if (blk.kind === "link-card") {
      const lbl = htmlToPlainText(slots[blk.slotId]?.content ?? "").trim() || blk.title;
      lines.push(`${indent}[cta:${lbl} -> ${blk.url || "#"}]`);
      return;
    }
    if (blk.kind === "divider") {
      lines.push(`${indent}---`);
      return;
    }
    if (blk.kind === "text") {
      const rawHtml = slots[blk.slotId]?.content ?? "";
      const liMatches = Array.from(rawHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) =>
        htmlToPlainText(m[1]).trim()
      );
      if (liMatches.length > 0) {
        lines.push(`${indent}<<view:list>>`);
        for (const item of liMatches) {
          if (item) lines.push(`${indent}  ${item}`);
        }
      } else {
        const plain = htmlToPlainText(rawHtml).trim();
        if (plain) lines.push(`${indent}${plain}`);
      }
      return;
    }
    if ("slotId" in blk && typeof blk.slotId === "string" && slots[blk.slotId]) {
      const plain = htmlToPlainText(slots[blk.slotId].content).trim();
      if (plain) lines.push(`${indent}${plain}`);
    }
  };

  for (const blk of blocks) {
    emitBlock(blk, "");
  }
  return lines;
}

/**
 * 기존 `.vdoc` 블록 1개를 재사용 가능한 `VDocAsset` 초안으로 채집한다 (스타일 중립 구조 중심).
 */
export function extractAssetFromVDocBlock(
  block: LayoutBlock,
  sourceSlots: Readonly<Record<string, VDocSlot>>,
  options?: {
    readonly title?: string;
    readonly sourceRef?: string;
    readonly outlineDsl?: readonly string[];
    readonly category?: string;
    readonly summary?: string;
  }
): VDocAsset {
  const now = new Date().toISOString();
  const assetKind: VDocAssetKind =
    block.kind === "structured-table"
      ? "table"
      : block.kind === "columns-grid"
        ? "columns"
        : block.kind === "callout-box"
          ? "callout"
          : "list";
  const clonedBlock = structuredClone(block);
  delete clonedBlock.sourceNodeId;
  delete clonedBlock.assetRef;
  delete clonedBlock.frame;

  const slots = collectBlockSlots([clonedBlock], sourceSlots);
  const outlineDsl =
    options?.outlineDsl && options.outlineDsl.length > 0
      ? [...options.outlineDsl]
      : deriveOutlineDslFromBlocks([clonedBlock], slots);

  const title = options?.title?.trim() || `${block.title || "구조"} 에셋`;
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `asset-${Date.now().toString(36)}`;

  return {
    version: "1.0.0",
    assetId: `asset-${assetKind}-${slug}-${Date.now().toString(36).slice(-4)}`,
    title,
    scope: "element",
    assetKind,
    targetKind: block.kind,
    category: options?.category ?? (assetKind === "table" ? "표 · 서식" : "구조 요소"),
    tags: [assetKind, block.kind, "사용자등록"],
    nuance: {
      summary:
        options?.summary ??
        `${block.title || "블록"}에서 채집한 재사용 구조 에셋입니다. 항목명·행 수·내용을 현재 문서 맥락에 맞게 재구성해 적용합니다.`,
      structureRules: [
        "원본 구조의 열·계층·복합 셀 배치를 유지하되 항목명과 행 수는 사용자 데이터에 맞춰 유연하게 조정",
      ],
      adaptationHints: [
        "사용자의 데이터 항목 수에 따라 행 또는 목록 항목을 자연스럽게 확장·축소",
      ],
    },
    structure: {
      outlineDsl,
      blocks: [clonedBlock],
      slots,
    },
    origin: {
      sourceType: "vdoc-capture",
      sourceRef: options?.sourceRef,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * 기존 `.vdoc` 페이지/섹션 1장을 `a4-page` 또는 `blog-section` `VDocAsset` 초안으로 채집한다.
 */
export function extractAssetFromVDocPage(
  page: VDocPage,
  sourceSlots: Readonly<Record<string, VDocSlot>>,
  options?: {
    readonly assetKind?: "a4-page" | "blog-section";
    readonly title?: string;
    readonly sourceRef?: string;
    readonly category?: string;
    readonly summary?: string;
  }
): VDocAsset {
  const now = new Date().toISOString();
  const assetKind: "a4-page" | "blog-section" =
    options?.assetKind ?? (page.unitKind === "section" ? "blog-section" : "a4-page");
  const clonedBlocks = structuredClone(page.blocks).map((b) => {
    delete b.sourceNodeId;
    delete b.assetRef;
    return b;
  });
  const slots = collectBlockSlots(clonedBlocks, sourceSlots);
  const outlineDsl =
    page.outlineDsl && page.outlineDsl.length > 0
      ? [...page.outlineDsl]
      : [
          `<<view:section${page.sectionRole ? `:${page.sectionRole}` : ""}>> ${page.pageLabel}`,
          ...deriveOutlineDslFromBlocks(clonedBlocks, slots).map((l) => `  ${l}`),
        ];

  const title = options?.title?.trim() || `${page.pageLabel || "페이지"} 에셋`;
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `page-${Date.now().toString(36)}`;

  return {
    version: "1.0.0",
    assetId: `asset-${assetKind}-${slug}-${Date.now().toString(36).slice(-4)}`,
    title,
    scope: "section",
    assetKind,
    targetKind: assetKind === "a4-page" ? "page" : "section",
    category: options?.category ?? (assetKind === "a4-page" ? "A4 서식 페이지" : "블로그 섹션"),
    tags: [assetKind, page.sectionRole ?? "body", "사용자등록"],
    nuance: {
      summary:
        options?.summary ??
        `${page.pageLabel} 페이지에서 채집한 구조 에셋입니다. 블록 배치 순서와 구성 뉘앙스를 다른 주제에도 그대로 적용할 수 있습니다.`,
      structureRules: [
        "상단에서 하단으로 이어지는 블록 구성 흐름과 각 블록의 역할(제목·표·이미지·목록·강조)을 유지하며 내용을 현재 주제로 치환",
      ],
      adaptationHints: [
        "사용자 데이터에 없는 블록은 빈 슬롯([-]) 또는 간결한 플레이스홀더로 남기거나 생략 가능",
      ],
    },
    structure: {
      outlineDsl,
      blocks: clonedBlocks,
      slots,
      pageMeta: {
        pageLabel: page.pageLabel,
        unitKind: assetKind === "a4-page" ? "page" : "section",
        sectionRole: page.sectionRole,
        surfaceWidth: assetKind === "a4-page" ? 794 : 720,
      },
    },
    origin: {
      sourceType: "vdoc-capture",
      sourceRef: options?.sourceRef,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * 에셋의 `blocks` 와 `slots` 를 충돌 없는 새 ID(`suffix`)로 복제해 캔버스 삽입용 인스턴스를 만든다.
 */
export function instantiateAssetForInsert(
  asset: VDocAsset,
  suffix: string
): { readonly blocks: LayoutBlock[]; readonly slots: Record<string, VDocSlot> } {
  const slotMap = new Map<string, string>();
  const nextSlots: Record<string, VDocSlot> = {};

  const remapSlotId = (oldId: string): string => {
    const existing = slotMap.get(oldId);
    if (existing) return existing;
    const nextId = `${oldId}_${suffix}`;
    slotMap.set(oldId, nextId);
    const srcSlot = asset.structure.slots[oldId];
    if (srcSlot) {
      nextSlots[nextId] = { ...structuredClone(srcSlot), slotId: nextId };
    }
    return nextId;
  };

  const cloneBlock = (blk: LayoutBlock, idx: number): LayoutBlock => {
    const nextBlockId = `${blk.blockId}_${suffix}_${idx}`;
    const copy = structuredClone(blk);
    copy.blockId = nextBlockId;
    delete copy.sourceNodeId;
    copy.assetRef = {
      assetId: asset.assetId,
      appliedAt: new Date().toISOString(),
    };

    if ("slotId" in copy && typeof copy.slotId === "string") {
      copy.slotId = remapSlotId(copy.slotId);
    }
    if (copy.kind === "hero") {
      copy.titleSlotId = remapSlotId(copy.titleSlotId);
      if (copy.subtitleSlotId) copy.subtitleSlotId = remapSlotId(copy.subtitleSlotId);
    } else if (copy.kind === "section-block") {
      copy.headingSlotId = remapSlotId(copy.headingSlotId);
      copy.bodySlotId = remapSlotId(copy.bodySlotId);
    } else if (copy.kind === "structured-table") {
      copy.rows = copy.rows.map((r, rIdx) => ({
        ...r,
        rowId: `${r.rowId}_${suffix}_${rIdx}`,
        cells: r.cells.map((c, cIdx) => ({
          ...c,
          cellId: `${c.cellId}_${suffix}_${rIdx}_${cIdx}`,
          slotId: remapSlotId(c.slotId),
          ...(c.blocks ? { blocks: c.blocks.map((nb, nIdx) => cloneBlock(nb, nIdx)) } : {}),
        })),
      }));
    } else if (copy.kind === "columns-grid" && copy.columns) {
      copy.columns = copy.columns.map((col) => ({
        ...col,
        ...(col.slotId ? { slotId: remapSlotId(col.slotId) } : {}),
        ...(col.blocks ? { blocks: col.blocks.map((nb, nIdx) => cloneBlock(nb, nIdx)) } : {}),
      }));
    }
    return copy;
  };

  const blocks = asset.structure.blocks.map((b, i) => cloneBlock(b, i));
  return { blocks, slots: nextSlots };
}
