import React from "react";

export type SlotTone = "amber" | "violet" | "blue";

export type SlotSummaryState = "on" | "off" | "empty" | "waiting";

export interface SlotSummary {
  primary: string;
  secondary?: string;
  state: SlotSummaryState;
  /** 고정 핀 등 요약 앞에 붙는 커스텀 아이콘/배지 */
  prefixIcon?: React.ReactNode;
  /** 칩 우측 끝에 붙는 배너/알림 액션 (예: 초점 제안 칩) */
  extraBadge?: React.ReactNode;
  /** 요약 영역 data-testid (예: scope-current) */
  testId?: string;
}

export interface CheckItem {
  id: string;
  title: string;
  detail?: React.ReactNode;
  checked?: boolean;
  hint?: string;
  testId?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  extraAction?: React.ReactNode;
  indent?: boolean;
  expand?: { open: boolean; onToggle(): void };
  onClick(): void;
  onCheck?(): void;
}

export interface TriNode {
  id: string;
  title: string;
  state: "checked" | "unchecked" | "indeterminate";
  meta?: string;
  hint?: string;
  testId?: string;
  children?: TriNode[];
  depth: number;
  isFolder: boolean;
  onClick(): void;
}

export interface RadioOption {
  id: string;
  label: string;
  detail?: React.ReactNode;
  hint?: string;
  testId?: string;
}

export interface ActionItem {
  id: string;
  title: string;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  checked?: boolean;
  radio?: boolean;
  testId?: string;
  onClick(): void;
}

export type SlotSection =
  | {
      kind: "check-list";
      title?: string;
      headerAction?: React.ReactNode;
      items: CheckItem[];
      emptyText?: string;
    }
  | {
      kind: "tri-tree";
      title?: string;
      headerAction?: React.ReactNode;
      nodes: TriNode[];
      maxDepth?: number;
      emptyText?: string;
    }
  | {
      kind: "radio";
      title?: string;
      headerAction?: React.ReactNode;
      value: string;
      options: RadioOption[];
      onChange(val: string): void;
    }
  | {
      kind: "note";
      text: React.ReactNode;
      testId?: string;
    }
  | {
      kind: "action";
      item: ActionItem;
    }
  | {
      kind: "custom";
      content: React.ReactNode;
    };

export interface SlotState {
  on: boolean;
  setOn(v: boolean): void;
  summary: SlotSummary;
  tooltip: string;
  header?: {
    allOn?(): void;
    allOff?(): void;
    extra?: React.ReactNode;
  };
  sections: SlotSection[];
  footer?: {
    hint?: string;
    manage?: { label: string; onClick(): void };
  };
  banner?: React.ReactNode;
}

export interface ContextSlot {
  id: string;
  label: string;
  icon: React.ReactNode;
  tone: SlotTone;
  testIds: { switch: string; button: string; menu: string };
  useSlot(): SlotState;
}
