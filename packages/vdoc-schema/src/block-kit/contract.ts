/**
 * 블록 정의 규격 (`@vibe/vdoc-schema` block-kit) — 블록 종류 하나의 "모델" 부분.
 *
 * 블록 종류마다 흩어져 있던 판단(슬롯 목록 · 선택 단위 · 아웃라인 · 새로 끼워 넣기 · 표 구조 · AI 설명)을
 * 이 인터페이스 하나로 모은다. 화면(React) 부분은 `@vibe/slot-canvas` 의 블록 뷰 레지스트리가,
 * 워크스페이스 기능은 Studio 가 이 정의를 읽는다. 새 블록 = 정의 하나 + 뷰 하나 등록.
 *
 * 규격 검사(`tests/block-kit.test.ts`)가 등록된 모든 종류를 같은 기준으로 확인한다.
 */
import type { OutlineName } from "../outline-naming";
import type { OutlinerNode } from "../project-manifest";
import type { TableModel } from "../table-ops";
import type {
  CompositeFormFrameBlockDef,
  LayoutBlock,
  StructuredTableBlockDef,
  TableSummaryItem,
  VDocDocument,
  VDocPage,
  VDocSlot,
} from "../types";

/** 블록 분류 — 블록 추가 메뉴 · 아이콘 묶음에 쓴다. */
export type BlockCategory = "text" | "table" | "layout" | "media" | "form";

/**
 * 선택 단위 — 캔버스에서 사각형으로 고르고, AI 에 첨부하고, 위치 칩으로 가리키는 최소 단위.
 * 슬롯은 `slot` 단위(id = slotId). 슬롯이 없는 내용(이미지 · 구분선 · 차트)은 `media` / `static` 단위
 * (id = blockId 또는 `blockId:부분`). 화면은 단위마다 `data-vdoc-unit="<unitId>"` 를 붙인다.
 */
export interface BlockUnit {
  unitId: string;
  kind: "slot" | "media" | "static";
  /** slot 단위면 그 슬롯. */
  slotId?: string;
  /** 사람이 읽는 이름 (이미지 대체 텍스트 등). */
  label?: string;
}

/** 블록 안의 표 (표 블록은 하나, 복합 서식 프레임은 구역마다 하나). 표 명령 · 표 위치 계산이 쓴다. */
export interface BlockTable {
  /** 구역 id (단일 표 블록은 null). */
  sectionId: string | null;
  title?: string;
  table: TableModel;
}

export interface InsertableBlockDraft {
  block: LayoutBlock;
  slots: Record<string, VDocSlot>;
  /** 끼워 넣은 뒤 바로 편집할 슬롯 (이미지 등 슬롯이 없는 블록은 생략). */
  focusSlotId?: string;
}

export interface InsertableBlockOptions {
  /** 모든 id 에 붙는 고유 접미사. */
  suffix: string;
  /** 본문 슬롯에 미리 연결할 백데이터 청크. */
  defaultBackdataRefs?: string[];
}

/** AI 가 블록 속성을 바꿀 수 있는 필드 (JSON 스키마 일부). 여기 없는 속성은 AI 가 못 바꾼다. */
export interface BlockPropSpec {
  type: "string" | "number" | "boolean";
  description: string;
  enum?: readonly string[];
}

/**
 * 아웃라인 만들기 도구 — 아웃라이너가 블록마다 이 블록 · 페이지에 묶어서 넘긴다.
 * 이름 짓기(라벨 칸 · 표 머리)와 문서 순서는 아웃라이너가 맡고, 블록은 "무엇을 어떤 모양으로" 만 정한다.
 */
export interface BlockOutlineContext {
  doc: VDocDocument;
  page: VDocPage;
  pageNode: OutlinerNode;
  /** 이 블록의 컨테이너 노드 id (`auto-blk-…`). */
  blockNodeId: string;
  /** 정리된 블록 제목 (자동 생성 제목은 빈 문자열). */
  blockTitle: string;
  emitSlot(parent: OutlinerNode, slotId: string, name: OutlineName, isStatic?: boolean): OutlinerNode | undefined;
  emitContainer(parent: OutlinerNode, nodeId: string, title: string, summary: string, needsReview?: boolean): OutlinerNode;
  emitSlotGroup(parent: OutlinerNode, entries: { slotId: string; name: OutlineName; isStatic?: boolean }[]): void;
  /** 슬롯 없는 단위(이미지 등)를 고정 노드 하나로. */
  emitStatic(title: string, summary: string): OutlinerNode;
  /** 표 · 서식 프레임 공용 전략 (라벨 칸 이름 붙이기 · 반복 행 묶기). */
  emitTable(block: StructuredTableBlockDef): void;
  emitFrame(block: CompositeFormFrameBlockDef): void;
  summaryItemEntries(items: TableSummaryItem[]): { slotId: string; name: OutlineName }[];
  nameStandaloneSlot(slot: VDocSlot, blockTitle: string): OutlineName;
  plainText(html: string | undefined): string;
  tidyName(text: string | undefined): string;
}

export interface BlockModelDefinition<B extends LayoutBlock = LayoutBlock> {
  /** 이 정의가 맡는 종류들 (같은 모양의 별칭 포함: `structured-table` · `table`). */
  kinds: readonly string[];
  /** 사람이 읽는 이름 ("표", "이미지"). */
  label: string;
  category: BlockCategory;
  /** lucide 아이콘 이름 힌트 (화면이 해석). */
  icon: string;
  /** 렌더하는 모든 slotId, 읽는 순서대로. */
  slotIds(block: B): string[];
  /** 선택 단위. 생략하면 slotIds 를 slot 단위로. */
  units?(block: B): BlockUnit[];
  /** 아웃라이너 노드. 생략하면 슬롯 하나는 그 슬롯, 여럿이면 컨테이너 + 슬롯들. */
  outline?(block: B, ctx: BlockOutlineContext): void;
  /** 블록 안의 표들 (표 명령 · AI 표 위치). */
  tables?(block: B): BlockTable[];
  /** 구역(sectionId)의 표를 바꾼 새 블록. `tables` 가 있으면 함께 둔다. */
  replaceTable?(block: B, sectionId: string | null, table: TableModel): B;
  /** 블록 추가 메뉴에서 새로 만들 수 있으면. */
  insertable?: {
    label: string;
    description: string;
    order: number;
    shortcut: number;
    defaultFrameHeight?: number;
    create(options: InsertableBlockOptions): InsertableBlockDraft;
  };
  /** 화면 동작 힌트 (블록 테두리 · 핸들). */
  layout?: {
    /** 모서리로 크기 조절 (프레임 없이도). */
    resizable?: boolean;
    /** 블록이 자기 ⋮⋮ 핸들을 그린다 (표). */
    ownGrip?: boolean;
  };
  ai?: {
    /** 슬롯 밖 정보(이미지 주소 · 담당자 · 정렬)를 모델에 알려 줄 한 줄들. 슬롯 본문은 공용 직렬화가 붙인다. */
    describe?(block: B): string[];
    /** AI 가 바꿀 수 있는 블록 속성. */
    editableProps?: Record<string, BlockPropSpec>;
  };
}

/** 정의를 만들 때 타입 추론을 돕는다. */
export function defineBlockKind<B extends LayoutBlock>(definition: BlockModelDefinition<B>): BlockModelDefinition<B> {
  return definition;
}
