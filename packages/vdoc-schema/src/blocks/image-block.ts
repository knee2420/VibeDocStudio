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
}
