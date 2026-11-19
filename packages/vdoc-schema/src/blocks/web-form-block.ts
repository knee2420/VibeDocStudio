import type { BaseLayoutBlock } from "../base-block";

export type WebFormVariant =
  | "webform-card-google"
  | "webform-minimal-tally"
  | "webform-pill-chips"
  | "webform-step-accent";

export type WebFormFieldInputKind =
  | "text"
  | "multi-input"
  | "single-choice"
  | "multi-choice"
  | "info-kv";

export interface WebFormSubFieldDef {
  id: string;
  label: string;
  placeholder?: string;
  value?: string;
}

export interface WebFormFieldDef {
  fieldId: string;
  label: string;
  inputKind: WebFormFieldInputKind;
  required?: boolean;
  helperText?: string;
  options?: string[];
  subFields?: WebFormSubFieldDef[];
  value?: string;
  placeholder?: string;
}

export interface WebFormBlockDef extends BaseLayoutBlock {
  kind: "web-form";
  variant: WebFormVariant;
  headerSlotId?: string;
  badge?: string;
  fields: WebFormFieldDef[];
}
