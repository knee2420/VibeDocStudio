import type { ResolvedStylePack, StyleOverrideDelta } from "../core/token-contract";
import { resolveMediaGridStyle, type ResolvedMediaGrid } from "./media-grid-kit";

export interface ImageBlockStyleInput {
  readonly styleKey?: string;
  readonly styleOverrides?: StyleOverrideDelta;
  readonly width?: string;
  readonly height?: string;
  readonly maxHeight?: string;
  readonly objectFit?: string;
  readonly frame?: { readonly x?: number; readonly y?: number; readonly w?: number; readonly h?: number };
}

export interface ImageBlockRenderStyle {
  readonly media: ResolvedMediaGrid | null;
  readonly imgStyle: {
    readonly width: string;
    readonly height: string;
    readonly maxHeight?: string;
    readonly objectFit: "contain" | "cover" | "fill" | "none" | "scale-down";
    readonly borderRadius: string;
  };
  readonly wrapperPaddingY?: string;
}

/**
 * 단독 `image` 블록의 `.vstyle` (`media.<styleKey>`) 스타일 해석 (React/DOM 비의존 순수 함수).
 * - `block.styleKey` 가 있으면 해당 `media.<styleKey>` 를, 없으면 기본 `"strip"` 을 조회한다.
 * - `block.maxHeight` 가 명시되지 않았고 자유 프레임(`block.frame`)이 아니면 `.vstyle` 의 `media.maxHeight` 를 상속해
 *   세로가 긴 인물 사진이 한 페이지를 과도하게 점유하는 현상을 막는다.
 */
export function resolveImageBlockRenderStyle(
  block: ImageBlockStyleInput,
  resolvedPack: ResolvedStylePack | null
): ImageBlockRenderStyle {
  const styleKey = block.styleKey?.trim() || "strip";
  const media = resolvedPack
    ? resolveMediaGridStyle(resolvedPack, styleKey, undefined, block.styleOverrides)
    : null;
  const resolvedMaxHeight = block.maxHeight ?? (block.frame ? undefined : media?.maxHeight);
  const resolvedObjectFit =
    (block.objectFit as ImageBlockRenderStyle["imgStyle"]["objectFit"] | undefined) ?? "contain";

  return {
    media,
    imgStyle: {
      width: block.width || "auto",
      height: block.height || "auto",
      ...(resolvedMaxHeight ? { maxHeight: resolvedMaxHeight } : {}),
      objectFit: resolvedObjectFit,
      borderRadius: media?.radius ?? "0px",
    },
    ...(media?.imagePaddingY ? { wrapperPaddingY: media.imagePaddingY } : {}),
  };
}
