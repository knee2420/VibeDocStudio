import type { LayoutBlock } from "@vibe/vdoc-schema";

import type { AssetSource } from "./assetVariants";
import type { SectionAssetBlockSnapshot } from "./useAssetLibraryStore";

/**
 * 에셋 속성 (피그마 컴포넌트 속성과 같은 개념).
 * 에셋을 만든 사람이 인스펙터 값 가운데 "바꿔 써도 되는 것"만 골라 노출한다.
 * 넣을 때 세부 정보에서 값을 고르면 미리보기와 삽입되는 블록에 그대로 반영된다.
 *
 * 지금은 만든 사람이 고르는 화면이 없어서 블록 종류마다 미리 골라 둔 예시(`DEMO_EXPOSED`)를 쓴다.
 * 나중에 에셋 저장 정보(`SectionAssetItem.exposedProps`)로 옮기면 된다.
 */
export type AssetPropertyValue = string | number;

export interface AssetPropertyOption {
  value: AssetPropertyValue;
  label: string;
}

export interface AssetPropertyDef {
  /** 속성 값 묶음의 키 (`블록종류.필드`). */
  id: string;
  label: string;
  /** 이 블록 종류의 블록에 모두 적용한다. */
  blockKind: string;
  /** 바꿀 블록 필드 (인스펙터 값과 같은 필드). */
  prop: string;
  control: "select" | "text";
  options?: AssetPropertyOption[];
  /** 블록에 값이 없을 때 보여 줄 값. */
  fallback: AssetPropertyValue;
}

export type AssetPropertyValues = Record<string, AssetPropertyValue>;

const def = (
  blockKind: string,
  prop: string,
  label: string,
  fallback: AssetPropertyValue,
  options?: AssetPropertyOption[],
): AssetPropertyDef => ({
  id: `${blockKind}.${prop}`,
  label,
  blockKind,
  prop,
  control: options ? "select" : "text",
  options,
  fallback,
});

/** 예시: 만든 사람이 노출했다고 치는 속성 (블록 종류별). */
const DEMO_EXPOSED: Record<string, AssetPropertyDef[]> = {
  text: [
    def("text", "align", "정렬", "left", [
      { value: "left", label: "왼쪽" },
      { value: "center", label: "가운데" },
      { value: "right", label: "오른쪽" },
    ]),
  ],
  image: [
    def("image", "width", "너비", "100%", [
      { value: "100%", label: "꽉 차게" },
      { value: "70%", label: "70%" },
      { value: "50%", label: "절반" },
    ]),
  ],
  "structured-table": [
    def("structured-table", "tableVariant", "표 모양", "bordered", [
      { value: "bordered", label: "테두리" },
      { value: "clean-invoice", label: "깔끔하게" },
    ]),
  ],
  "columns-grid": [
    def("columns-grid", "cardStyle", "칸 모양", "plain", [
      { value: "plain", label: "평면" },
      { value: "card", label: "카드" },
    ]),
  ],
  "fillable-group": [
    def("fillable-group", "fieldType", "입력 종류", "text-area", [
      { value: "text-area", label: "글 상자" },
      { value: "date", label: "날짜" },
      { value: "signature", label: "서명" },
    ]),
    def("fillable-group", "assigneeName", "담당자", ""),
  ],
  hero: [
    def("hero", "align", "글자 위치", "left", [
      { value: "left", label: "왼쪽" },
      { value: "center", label: "가운데" },
    ]),
    def("hero", "height", "높이", 280, [
      { value: 220, label: "낮게" },
      { value: 280, label: "보통" },
      { value: 360, label: "높게" },
    ]),
  ],
  "link-card": [
    def("link-card", "layout", "썸네일 위치", "thumb-top", [
      { value: "thumb-top", label: "위" },
      { value: "thumb-left", label: "왼쪽" },
    ]),
  ],
  divider: [
    def("divider", "variant", "모양", "line", [
      { value: "line", label: "실선" },
      { value: "short", label: "짧은 선" },
      { value: "dots", label: "점" },
      { value: "space", label: "여백만" },
    ]),
  ],
  "callout-box": [
    def("callout-box", "tone", "상자 색", "neutral", [
      { value: "neutral", label: "회색" },
      { value: "info", label: "파랑" },
      { value: "warning", label: "노랑" },
    ]),
  ],
  heading: [
    def("heading", "decoration", "장식", "none", [
      { value: "none", label: "없음" },
      { value: "bar", label: "왼쪽 막대" },
      { value: "quote", label: "따옴표" },
    ]),
  ],
};

/** 이 에셋이 노출한 속성 (섹션 에셋은 들어 있는 블록 종류의 속성을 모은다). */
export function exposedPropertiesFor(source: AssetSource): AssetPropertyDef[] {
  const kinds =
    source.type === "block"
      ? [source.blockKind]
      : Array.from(new Set(source.section.blocks.map((s) => s.block.kind)));
  return kinds.flatMap((k) => DEMO_EXPOSED[k === "table" ? "structured-table" : k] ?? []);
}

/** 블록 묶음의 지금 값 (첫 블록 기준) — 세부 정보의 처음 값. */
export function readPropertyValues(
  snapshots: readonly SectionAssetBlockSnapshot[],
  defs: readonly AssetPropertyDef[],
): AssetPropertyValues {
  const values: AssetPropertyValues = {};
  for (const d of defs) {
    const block = snapshots.find((s) => kindMatches(s.block, d))?.block as (LayoutBlock & Record<string, unknown>) | undefined;
    const v = block?.[d.prop];
    values[d.id] = typeof v === "string" || typeof v === "number" ? v : d.fallback;
  }
  return values;
}

/** 고른 속성 값을 블록에 적용한 새 묶음 (원본은 건드리지 않는다). */
export function applyPropertyValues(
  snapshots: readonly SectionAssetBlockSnapshot[],
  defs: readonly AssetPropertyDef[],
  values: AssetPropertyValues | undefined,
): SectionAssetBlockSnapshot[] {
  if (!values || defs.length === 0) return snapshots as SectionAssetBlockSnapshot[];
  return snapshots.map((snap) => {
    const patch: Record<string, unknown> = {};
    for (const d of defs) {
      if (!kindMatches(snap.block, d) || !(d.id in values)) continue;
      patch[d.prop] = values[d.id];
    }
    return Object.keys(patch).length ? { ...snap, block: { ...snap.block, ...patch } as LayoutBlock } : snap;
  });
}

function kindMatches(block: LayoutBlock, d: AssetPropertyDef): boolean {
  return block.kind === d.blockKind || (d.blockKind === "structured-table" && block.kind === "table");
}
