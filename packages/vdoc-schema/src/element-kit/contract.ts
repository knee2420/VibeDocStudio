/**
 * element-kit 계약 — Phase 1(Workflowy Outliner) · Phase 2 · Phase 3(.vdoc) · Agent가
 * 공통으로 참조하는 Element 유형(`ElementKind`) 단일 정본.
 */
import type { LayoutBlockKind } from "../base-block";
import type { BlockModelDefinition } from "../block-kit/contract";

export type ElementTier = "container" | "block" | "sub-unit";

export type ElementBadgeTone =
  | "slate"
  | "indigo"
  | "emerald"
  | "blue"
  | "amber"
  | "violet"
  | "rose";

export type ContainerElementKind = "project" | "document" | "page" | "section";

export type SubUnitElementKind = "table-row" | "table-cell" | "grid-col" | "slot" | "media";

export type ElementKind = ContainerElementKind | LayoutBlockKind | SubUnitElementKind;

export interface ElementDefinition {
  kind: ElementKind;
  tier: ElementTier;
  label: string;
  shortLabel?: string;
  icon: string;
  badgeTone: ElementBadgeTone;
  /** Tab(들여쓰기)으로 이 요소 아래에 새 자식을 만들 때 자동 부여할 기본 유형. */
  defaultChildKind: ElementKind;
  /** 허용되는 부모 유형. 생략 시 일반 컨테이너(page/section/document) 아래 배치 가능. */
  allowedParentKinds?: readonly ElementKind[];
  /** `/` 슬래시 커맨드 및 배지 전환 메뉴에 노출할지 여부. */
  turnIntoVisible?: boolean;
  /** `tier === "block"` 인 경우 연결된 block-kit 모델 정의. */
  blockDef?: BlockModelDefinition;
}
