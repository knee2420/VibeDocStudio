import {
  createInsertableBlock,
  getBlockSlotIds,
  type LayoutBlock,
  type VDocSlot,
} from "@vibe/vdoc-schema";

import type { SectionAssetBlockSnapshot, SectionAssetItem } from "./useAssetLibraryStore";

/**
 * 에셋을 넣을 때 고를 수 있는 내용 (사용자가 직접 써 보고 하나로 정할 예정 — 하나만 남길 때 여기와
 * 해당 버튼 컴포넌트만 지우면 된다).
 * - `blank`: 빈 칸 (지금까지의 동작 — 기본 블록은 빈 입력칸, 섹션 에셋은 "제목을 입력하세요" 틀)
 * - `sample`: 같은 구조에 예시 문구 · 더미 이미지를 채운다 (캔바 · 미리캔버스처럼 보이는 그대로)
 * - `original`: 섹션 에셋을 만들 때 감싼 영역의 원본 내용 그대로 (섹션 에셋만)
 */
export type AssetVariantId = "blank" | "sample" | "original";

export type AssetSource =
  | { type: "block"; blockKind: string }
  | { type: "section"; section: SectionAssetItem };

/** 더미 사진 (네트워크 없이 쓰는 SVG 풍경 그림). */
const DUMMY_PHOTO = svgDataUri(800, 500);
const DUMMY_PHOTO_WIDE = svgDataUri(1200, 480);

function svgDataUri(w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3ff"/><stop offset="1" stop-color="#eaf6ff"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#s)"/>
<circle cx="${w * 0.78}" cy="${h * 0.28}" r="${h * 0.09}" fill="#ffd36e"/>
<path d="M0 ${h * 0.72} L${w * 0.22} ${h * 0.45} L${w * 0.42} ${h * 0.68} L${w * 0.6} ${h * 0.5} L${w} ${h * 0.78} L${w} ${h} L0 ${h}Z" fill="#7cc4a4"/>
<path d="M0 ${h * 0.85} L${w * 0.3} ${h * 0.66} L${w * 0.55} ${h * 0.86} L${w * 0.8} ${h * 0.7} L${w} ${h * 0.84} L${w} ${h} L0 ${h}Z" fill="#4fa684"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SAMPLE = {
  title: "2026 상반기 신규 서비스 기획 개요",
  subtitle: "핵심 성과와 다음 단계를 한눈에 정리합니다",
  body: "이 영역에는 본문이 들어갑니다. 배경과 목적, 주요 결정 사항을 두세 문장으로 정리해 보세요. 예시 문장은 그대로 고쳐 쓰면 됩니다.",
  columns: [
    "<p><strong>현황</strong></p><p>현재 진행 상황과 주요 수치를 정리합니다. 지난달 대비 변화도 함께 적어 주세요.</p>",
    "<p><strong>다음 단계</strong></p><p>이번 분기 안에 할 일과 담당, 기한을 적습니다.</p>",
    "<p><strong>리스크</strong></p><p>일정 · 비용에 영향을 줄 수 있는 요인을 적습니다.</p>",
  ],
  tableHead: ["항목", "내용", "담당", "기한"],
  tableRows: [
    ["기획", "요구사항 정리 및 범위 확정", "김민지", "11/20"],
    ["디자인", "주요 화면 시안 및 사용성 점검", "이도윤", "11/27"],
    ["개발", "핵심 기능 구현과 내부 테스트", "박서준", "12/11"],
  ],
  field: "홍길동 · 2026. 11. 16.",
  link: "<p><strong>문서 자동화 도입 가이드</strong></p><p>링크를 붙여 넣으면 제목과 설명이 이렇게 카드로 표시됩니다.</p>",
  list: ["첫 번째 핵심 항목", "두 번째 핵심 항목", "세 번째 핵심 항목"],
  short: ["예시 항목", "홍길동", "2026. 11. 16.", "검토 완료", "1,200,000", "기획팀"],
} as const;

type Role = "title" | "subtitle" | "body" | "column" | "cell-head" | "cell" | "field" | "link";

/** 블록 종류로 각 슬롯이 무엇인지(제목 · 본문 · 표 머리 …) 정한다. */
function slotRoles(block: LayoutBlock): Map<string, { role: Role; index: number; col?: number }> {
  const roles = new Map<string, { role: Role; index: number; col?: number }>();
  const b = block as LayoutBlock & Record<string, unknown>;
  switch (block.kind) {
    case "section-block":
      roles.set(b.headingSlotId as string, { role: "title", index: 0 });
      roles.set(b.bodySlotId as string, { role: "body", index: 0 });
      break;
    case "hero":
      roles.set(b.titleSlotId as string, { role: "title", index: 0 });
      if (b.subtitleSlotId) roles.set(b.subtitleSlotId as string, { role: "subtitle", index: 0 });
      break;
    case "heading":
    case "form-title":
      roles.set(b.slotId as string, { role: "title", index: 0 });
      break;
    case "fillable-group":
      roles.set(b.slotId as string, { role: "field", index: 0 });
      break;
    case "link-card":
      roles.set(b.slotId as string, { role: "link", index: 0 });
      break;
    case "columns-grid": {
      const ids = ((b.columns as { slotId?: string }[] | undefined)?.map((c) => c.slotId) ?? (b.slotIds as string[] | undefined) ?? []).filter(
        (id): id is string => Boolean(id)
      );
      ids.forEach((id, i) => roles.set(id, { role: "column", index: i }));
      break;
    }
    case "structured-table":
    case "table": {
      const rows = (b.rows as { cells: { slotId: string }[] }[] | undefined) ?? [];
      rows.forEach((row, r) =>
        row.cells.forEach((cell, c) => roles.set(cell.slotId, { role: r === 0 ? "cell-head" : "cell", index: r - 1, col: c }))
      );
      break;
    }
  }
  return roles;
}

function sampleHtml(role: Role, index: number, col: number, previous: string): string {
  switch (role) {
    case "title":
      return /<h[1-4]/i.test(previous) ? previous.replace(/(<h[1-4][^>]*>)[\s\S]*?(<\/h[1-4]>)/i, `$1${SAMPLE.title}$2`) : `<p><strong>${SAMPLE.title}</strong></p>`;
    case "subtitle":
      return `<p>${SAMPLE.subtitle}</p>`;
    case "column":
      return SAMPLE.columns[index % SAMPLE.columns.length];
    case "cell-head":
      return `<p>${SAMPLE.tableHead[col % SAMPLE.tableHead.length]}</p>`;
    case "cell": {
      const row = SAMPLE.tableRows[Math.max(0, index) % SAMPLE.tableRows.length];
      return `<p>${row[col % row.length]}</p>`;
    }
    case "field":
      return `<p>${SAMPLE.field}</p>`;
    case "link":
      return SAMPLE.link;
    default: {
      // 원래 글이 짧은 칸(표 · 양식 칸)은 짧은 예시로 — 긴 본문을 넣으면 좁은 칸이 넘친다.
      const plain = previous.replace(/<[^>]+>/g, "").trim();
      if (plain && plain.length <= 24 && !/<(ul|ol|h[1-4])/i.test(previous)) {
        return `<p>${SAMPLE.short[index % SAMPLE.short.length]}</p>`;
      }
      return /<(ul|ol)/i.test(previous)
        ? `<ul>${SAMPLE.list.map((t) => `<li>${t}</li>`).join("")}</ul>`
        : /<h[1-4]/i.test(previous)
          ? `<h3>${SAMPLE.title}</h3><p>${SAMPLE.body}</p>`
          : `<p>${SAMPLE.body}</p>`;
    }
  }
}

/** 블록 속성의 이미지 자리에 더미 사진을 넣는다. */
function withDummyImages(block: LayoutBlock): LayoutBlock {
  const b = structuredClone(block) as LayoutBlock & Record<string, unknown>;
  if (b.kind === "image") return { ...b, src: DUMMY_PHOTO, alt: (b.alt as string) || "예시 이미지" } as LayoutBlock;
  if (b.kind === "hero") return { ...b, image: DUMMY_PHOTO_WIDE } as LayoutBlock;
  if (b.kind === "link-card") {
    return { ...b, thumbnail: DUMMY_PHOTO, url: (b.url as string) || "https://example.com/guide", domain: (b.domain as string) || "example.com" } as LayoutBlock;
  }
  if (b.kind === "columns-grid" && Array.isArray(b.columns)) {
    return {
      ...b,
      columns: (b.columns as { image?: { src: string; alt?: string } }[]).map((c) =>
        c.image ? { ...c, image: { ...c.image, src: DUMMY_PHOTO, alt: c.image.alt || "예시 이미지" } } : c
      ),
    } as LayoutBlock;
  }
  return b;
}

/** 같은 구조에 예시 문구 · 더미 이미지를 채운다 (블록 · 슬롯 id 는 그대로). */
export function fillWithSamples(snapshots: readonly SectionAssetBlockSnapshot[]): SectionAssetBlockSnapshot[] {
  let bodyIndex = 0;
  return snapshots.map(({ block, slots }) => {
    const roles = slotRoles(block);
    const filled: Record<string, VDocSlot> = {};
    for (const slotId of getBlockSlotIds(block)) {
      const slot = slots[slotId];
      if (!slot) continue;
      const known = roles.get(slotId);
      const fallbackRole: Role = /제목|title|heading/i.test(slot.label ?? "") ? "title" : "body";
      const role = known?.role ?? fallbackRole;
      const html = sampleHtml(role, known?.index ?? bodyIndex++, known?.col ?? 0, slot.content ?? "");
      filled[slotId] = { ...slot, content: html };
    }
    return { block: withDummyImages(block), slots: { ...slots, ...filled } };
  });
}

/** 기본 블록 하나의 빈 초안 (지금 삽입하면 들어가는 그 모양). 미리보기용이라 id 는 고정 접미사. */
function blankBlockDraft(blockKind: string): SectionAssetBlockSnapshot[] {
  try {
    const draft = createInsertableBlock(blockKind, { suffix: "asset_preview", defaultBackdataRefs: [] });
    return [{ block: draft.block, slots: draft.slots }];
  } catch {
    return [];
  }
}

/**
 * 그 에셋을 넣는 두 가지 방법 (보여 줄 순서대로):
 * 원본 그대로 복사 · 같은 구조에 더미 데이터를 채워서. 원본이 없는 기본 블록은 더미 데이터 하나뿐이다.
 * (`blank` 는 끌어다 놓기 · 예전 삽입 경로에만 남아 있다.)
 */
export function availableVariants(source: AssetSource): AssetVariantId[] {
  if (source.type === "section" && source.section.originalBlocks?.length) return ["original", "sample"];
  return ["sample"];
}

/** 미리보기 · 삽입에 쓸 블록 묶음. 없으면 null (예: 원본이 없는 옛 섹션 에셋). */
export function buildAssetVariant(source: AssetSource, variant: AssetVariantId): SectionAssetBlockSnapshot[] | null {
  if (source.type === "section") {
    if (variant === "original") return source.section.originalBlocks?.length ? source.section.originalBlocks : null;
    if (variant === "sample") return fillWithSamples(source.section.blocks);
    return source.section.blocks;
  }
  const blank = blankBlockDraft(source.blockKind);
  if (blank.length === 0) return null;
  if (variant === "sample") return fillWithSamples(blank);
  if (variant === "blank") return blank;
  return null;
}

export const ASSET_VARIANT_LABEL: Record<AssetVariantId, string> = {
  original: "원본 그대로",
  sample: "더미 데이터",
  blank: "빈 칸",
};
