/**
 * 블록 뷰 규격 (`@vibe/slot-canvas`) — 블록 종류 하나의 "화면" 부분.
 * 모델 부분(슬롯 · 단위 · 아웃라인 …)은 `@vibe/vdoc-schema` 의 block-kit 정의가 가진다.
 *
 * 뷰는 블록 몸통만 그린다. 테두리 · 핸들 · 드래그 · 잠금 같은 공통 크롬은 페이지 시트가 감싼다.
 * 규칙: 선택 단위마다 `ctx.unitAttrs(unitId, kind)` 를 붙인다 (슬롯은 `ctx.renderSlot` 이 알아서 붙인다).
 */
import type React from "react";

import type { LayoutBlock, TableCommand, TableSummaryItem, VDocPage, VDocSlot } from "@vibe/vdoc-schema";

import type { TableSelectionInfo } from "../InteractiveTable";

export interface SlotBoxOptions {
  /** `cell`: fills a table cell edge to edge, the cell draws focus. `inline`: free-standing slot. */
  variant?: "cell" | "inline";
  className?: string;
  darkTheme?: boolean;
  /** Dense table cells keep the original 12.5px / snug leading. */
  compact?: boolean;
  style?: React.CSSProperties;
}

export interface TableCellLike {
  slotId: string;
  compact?: boolean;
  padding?: string;
  fontSize?: string;
  lineHeight?: string;
  color?: string;
  fontWeight?: string;
  hAlign?: string;
  fontFamily?: string;
}

export interface SummaryLike {
  align?: "left" | "center" | "right";
  width?: string;
  items: TableSummaryItem[];
}

/** 표(또는 서식 구역) 하나를 그릴 때 페이지 시트가 묶어 주는 공통 연결. */
export interface TableBindings {
  editable: boolean;
  selectedSlotId: string | null;
  blockSelected?: boolean;
  onSelectBlock?: () => void;
  isExternalRangeActive?: () => boolean;
  onSelectSlot: (slotId: string) => void;
  onCommand: (cmd: TableCommand) => void;
  onDeleteTable: () => void;
  onSelectionChange: (info: TableSelectionInfo | null) => void;
  gripDragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  renderCell: (cell: TableCellLike, opts: { hAlignClass: string }) => React.ReactNode;
}

export interface BlockRenderContext {
  page: VDocPage;
  slots: Record<string, VDocSlot>;
  editable: boolean;
  selectedBlockId: string | null;
  selectedSlotId: string | null;
  /** 슬롯 하나 (리치텍스트 편집기 + 인라인 AI 작성기). 선택 단위 표시를 함께 붙인다. */
  renderSlot(slotId: string, options?: SlotBoxOptions): React.ReactNode;
  /** 라벨 · 값 요약 줄 (표 아래 합계 · 요약 목록). */
  renderSummary(summary: SummaryLike, spacing: string): React.ReactNode;
  /** 이 블록의 표(sectionId: 구역, 단일 표는 null)에 쓸 연결. */
  tableBindings(sectionId: string | null): TableBindings;
  /** 블록 속성을 바꾼다 (이미지 교체 · 정렬 등). */
  updateBlock(updater: (prev: LayoutBlock) => LayoutBlock): void;
  /** 슬롯이 아닌 선택 단위(이미지 등)에 붙일 표시. */
  unitAttrs(unitId: string, kind: "media" | "static"): { "data-vdoc-unit": string; "data-unit-kind": string };
}

export interface BlockViewProps<B extends LayoutBlock = LayoutBlock> {
  block: B;
  ctx: BlockRenderContext;
}

/**
 * 블록 전용 조작 하나 (이미지 교체 · 정렬, 상자 색 …). 뷰 안에 툴바를 직접 띄우지 않고 이 목록으로 내놓으면
 * 위쪽 서식 툴바의 "블록 도구" 묶음이 모든 블록에 같은 자리 · 같은 모양으로 그린다.
 */
export interface BlockControl {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** 아이콘 옆에 글자도 보인다 (짧은 상태 표시: "담당: 홍길동"). */
  showLabel?: boolean;
  active?: boolean;
  disabled?: boolean;
  /** 같은 묶음끼리 붙여 그리고, 묶음 사이에 구분선을 넣는다. */
  group?: string;
  run(): void | Promise<void>;
}

/** 조작이 쓰는 도구 — 툴바가 넘긴다. */
export interface BlockControlApi {
  updateBlock(updater: (prev: LayoutBlock) => LayoutBlock): void;
  /** 파일 고르기 창 (취소하면 null). */
  pickFile(accept: string): Promise<File | null>;
  /** 한 줄 입력 (취소하면 null). */
  prompt(message: string, initial?: string): string | null;
}

export interface BlockViewDefinition<B extends LayoutBlock = LayoutBlock> {
  kinds: readonly string[];
  View: React.ComponentType<BlockViewProps<B>>;
  /** 블록을 골랐을 때 위쪽 툴바에 나오는 이 종류 전용 조작. 공통 조작(복제 · 잠금 · 삭제)은 ⚙ 메뉴가 맡는다. */
  controls?(block: B, api: BlockControlApi): BlockControl[];
}

export function defineBlockView<B extends LayoutBlock>(definition: BlockViewDefinition<B>): BlockViewDefinition<B> {
  return definition;
}
