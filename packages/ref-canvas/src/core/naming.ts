/** Longest file stem derived from a title; long titles are cut at a word boundary. */
export const REF_FILE_STEM_MAX = 60;

/**
 * Turns a source's original title into a usable `.ref` file stem: drops characters that are
 * illegal in file names, collapses whitespace, and trims long titles at a word boundary.
 * Returns `""` when nothing usable is left.
 */
export function refFileStemFromTitle(title: string, maxLength = REF_FILE_STEM_MAX): string {
  const clean = Array.from(title || "", (ch) => (ch.charCodeAt(0) < 0x20 ? " " : ch))
    .join("")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace >= maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}
