import type { SlotConstraints } from "@vibe/vdoc-schema";

/** 인스펙터 타이포그래피 카드의 선택지. 기본값은 슬롯에 제약이 없을 때 캔버스가 쓰는 값과 같다. */
export const SLOT_TYPOGRAPHY_DEFAULTS: Required<
  Pick<SlotConstraints, "fontSize" | "lineHeight" | "align" | "color" | "fontWeight">
> = {
  fontSize: "13px",
  lineHeight: "1.35",
  align: "left",
  color: "#383838",
  fontWeight: "normal",
};

export const FONT_SIZE_OPTIONS = ["9pt", "10pt", "12.5px", "14px", "18px", "22px", "26px"] as const;

export const LINE_HEIGHT_OPTIONS = ["1.0", "1.2", "1.35", "1.5", "1.75"] as const;

export const FONT_WEIGHT_OPTIONS = [
  { value: "normal", label: "Normal (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semibold (600)" },
  { value: "700", label: "Bold (700)" },
] as const;

export const TEXT_COLOR_PRESETS = [
  { label: "블랙", value: "#111111" },
  { label: "차콜", value: "#27272a" },
  { label: "다크 그레이", value: "#52525b" },
  { label: "미드 그레이", value: "#71717a" },
  { label: "라이트 그레이", value: "#a1a1aa" },
] as const;
