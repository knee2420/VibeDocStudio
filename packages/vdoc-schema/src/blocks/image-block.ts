import type { BaseLayoutBlock } from "../base-block";

export interface ImageBlockDef extends BaseLayoutBlock {
  kind: "image";
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  maxHeight?: string;
  align?: "left" | "center" | "right";
  objectFit?: "contain" | "cover" | "fill";
  fit?: "contain" | "cover";
  /** 사진 아래 작은 회색 설명. */
  caption?: string;
}
