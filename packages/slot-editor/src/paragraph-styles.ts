/**
 * Named paragraph styles (`<p data-style="id">`) → CSS. The registry is data (`@vibe/harness-packs/editor/paragraph-styles.json`);
 * the app passes it in once. Markers stay as text; indent · hanging indent · spacing · size come from here,
 * the same in the editor, read-only slots and print.
 */

export interface ParagraphStyleSpec {
  label?: string;
  marker?: string;
  match?: string[];
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  color?: string;
  align?: "left" | "center" | "right";
  indent?: string;
  hanging?: string;
  spaceBefore?: string;
  spaceAfter?: string;
}

export interface ParagraphStyleRegistry {
  default?: string;
  sets: Record<string, { label?: string; styles: Record<string, ParagraphStyleSpec> }>;
}

const LENGTH = /^\d+(\.\d+)?(px|em)$/;
const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const NUMBER = /^\d+(\.\d+)?$/;

function len(v: string | undefined): string | null {
  return v && LENGTH.test(v) ? v : null;
}

/** One rule per style id. Unknown or malformed values are skipped, never passed through. */
export function paragraphStyleCss(registry: ParagraphStyleRegistry): string {
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const set of Object.values(registry.sets ?? {})) {
    for (const [id, s] of Object.entries(set.styles ?? {})) {
      if (seen.has(id) || !/^[a-z][a-z0-9-]*$/.test(id)) continue;
      seen.add(id);
      const decl: string[] = [];
      const indent = len(s.indent) ?? "0px";
      const hanging = len(s.hanging);
      if (hanging) {
        decl.push(`padding-left: calc(${indent} + ${hanging})`, `text-indent: calc(-1 * ${hanging})`);
      } else if (len(s.indent)) {
        decl.push(`padding-left: ${indent}`);
      }
      if (len(s.fontSize)) decl.push(`font-size: ${s.fontSize}`);
      if (s.fontWeight && /^(normal|bold|[1-9]00)$/.test(s.fontWeight)) decl.push(`font-weight: ${s.fontWeight}`);
      if (s.lineHeight && NUMBER.test(s.lineHeight)) decl.push(`line-height: ${s.lineHeight}`);
      if (s.color && COLOR.test(s.color)) decl.push(`color: ${s.color}`);
      if (s.align) decl.push(`text-align: ${s.align}`);
      if (len(s.spaceBefore)) decl.push(`margin-top: ${s.spaceBefore}`);
      if (len(s.spaceAfter)) decl.push(`margin-bottom: ${s.spaceAfter}`);
      if (decl.length) rules.push(`p[data-style="${id}"] { ${decl.join("; ")}; }`);
    }
  }
  return rules.join("\n");
}

const STYLE_TAG = "data-paragraph-styles";

/** Inject (or refresh) the paragraph style sheet once per document. */
export function ensureParagraphStyles(registry: ParagraphStyleRegistry): void {
  if (typeof document === "undefined") return;
  const css = paragraphStyleCss(registry);
  let tag = document.head.querySelector<HTMLStyleElement>(`style[${STYLE_TAG}]`);
  if (!tag) {
    tag = document.createElement("style");
    tag.setAttribute(STYLE_TAG, "");
    document.head.appendChild(tag);
  }
  if (tag.textContent !== css) tag.textContent = css;
}
