import type { BaseLayoutBlock } from "../base-block";

export type CalloutBoxVariant = "default" | "quote" | "info-frame" | "accent-bar" | "disclosure";
export type CalloutAccentColor = "pink" | "yellow" | "emerald" | "sky" | "slate";

export interface CalloutKvItem {
  key: string;
  value: string;
}

/**
 * 안내 · 인용구 · 스팟 정보 프레임 · 하이라이트 바 · 고지 배지.
 * `variant` 를 생략하면 기존 연한 배경 상자(`default`)로 100% 하위 호환 렌더링된다.
 */
export interface CalloutBoxBlockDef extends BaseLayoutBlock {
  kind: "callout-box";
  slotId: string;
  tone?: "neutral" | "info" | "warning";
  /** 블로그/웹 Section IR 프레임 표현 변형. */
  variant?: CalloutBoxVariant;
  /** `info-frame` 등에서 `::` 기호로 추출된 경량 Key-Value 메타 목록. */
  kvItems?: CalloutKvItem[];
  /** 텍스트/프레임 정렬 힌트. */
  align?: "left" | "center" | "right";
  /** `accent-bar` 등에서 사용할 강조 팔레트 키. */
  accentColor?: CalloutAccentColor;
}
