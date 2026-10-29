/**
 * Formatting presets measured on editor.yesform.com (`_dissections/yesform/01.layout_tokens.json`).
 */

export const FONT_PRESETS: { label: string; family: string }[] = [
  { label: "Pretendard", family: "Pretendard" },
  { label: "나눔명조", family: '"Nanum Myeongjo"' },
  { label: "나눔고딕", family: '"Nanum Gothic"' },
  { label: "맑은 고딕", family: '"Malgun Gothic"' },
  { label: "바탕", family: "Batang" },
  { label: "바탕체", family: "BatangChe" },
  { label: "궁서", family: "Gungsuh" },
  { label: "궁서체", family: "GungsuhChe" },
  { label: "굴림", family: "Gulim" },
  { label: "굴림체", family: "GulimChe" },
  { label: "돋움", family: "Dotum" },
  { label: "돋움체", family: "DotumChe" },
  { label: "Times New Roman", family: '"Times New Roman"' },
  { label: "Courier New", family: '"Courier New"' },
];

/** 7 rows × 10 columns, in yesform's 기본 팔레트 order. */
export const COLOR_PALETTE: string[] = [
  "#000000", "#3d3d3d", "#5c5c5c", "#7a7a7a", "#999999", "#b8b8b8", "#d6d6d6", "#efefef", "#f5f5f5", "#ffffff",
  "#8b0001", "#ff0000", "#ffa500", "#ffff00", "#00ff00", "#00ffff", "#6495ed", "#0000ff", "#8b00ff", "#ff00ff",
  "#ffcccc", "#ffdddd", "#ffe4cc", "#fffacd", "#e8f5e9", "#e0f7fa", "#dbeafe", "#e0e7ff", "#ede9fe", "#fce7f3",
  "#e57373", "#ef9a9a", "#ffab91", "#fff176", "#aed581", "#80cbc4", "#90caf9", "#9fa8da", "#b39ddb", "#ce93d8",
  "#d32f2f", "#e53935", "#f57c00", "#fbc02d", "#7cb342", "#00897b", "#1e88e5", "#3949ab", "#5e35b1", "#8e24aa",
  "#b71c1c", "#c62828", "#e65100", "#f57f17", "#558b2f", "#00695c", "#1565c0", "#283593", "#4527a0", "#6a1b9a",
  "#7f0000", "#8b0000", "#994d00", "#997000", "#33691e", "#004d40", "#0d47a1", "#1a237e", "#311b92", "#4a148c",
];

export const LINE_HEIGHT_PRESETS = ["1.0", "1.5", "2.0"];

export const DEFAULT_FONT_SIZE_PT = 10;
export const MIN_FONT_SIZE_PT = 1;
export const MAX_FONT_SIZE_PT = 200;

/** CSS px → pt at 96 dpi, rounded to 0.5pt like yesform's size box. */
export const pxToPt = (px: number) => Math.round(px * 0.75 * 2) / 2;
