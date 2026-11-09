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
  { label: "블랙", value: "#0f172a" },
  { label: "다크그레이", value: "#383838" },
  { label: "인보이스 블루", value: "#336699" },
  { label: "뮤트", value: "#64748b" },
  { label: "에메랄드", value: "#047857" },
] as const;
