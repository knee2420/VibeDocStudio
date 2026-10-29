/**
 * Catalog slot HTML was authored with Tailwind classes (`<p class="text-[13px] text-[#336699]">`).
 * Tiptap keeps no `class` attributes, so those styles vanished on load. This converts the class
 * vocabulary used in `catalog/` into inline styles the editor schema does keep:
 * text styles go onto a `<span style>` (textStyle mark), block styles onto the paragraph
 * (`blockStyle`, `lineHeight`, `textAlign`), and wrapper `<div>`s are unwrapped.
 */

const SIZE_PX: Record<string, string> = { xs: "12px", sm: "14px", base: "16px", lg: "18px", xl: "20px", "2xl": "24px", "3xl": "30px" };
const SLATE: Record<string, string> = {
  "100": "#f1f5f9", "200": "#e2e8f0", "300": "#cbd5e1", "400": "#94a3b8", "500": "#64748b",
  "600": "#475569", "700": "#334155", "800": "#1e293b", "900": "#0f172a",
};
const WEIGHT: Record<string, string> = { normal: "400", medium: "500", semibold: "600", bold: "700" };
const LEADING: Record<string, string> = { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" };
const SPACE = (n: string) => `${parseFloat(n) * 4}px`;

interface Parsed {
  text: Record<string, string>;
  block: Record<string, string>;
  spaceY?: string;
  underline: boolean;
}

function parseClasses(classList: string[]): Parsed {
  const text: Record<string, string> = {};
  const block: Record<string, string> = {};
  let spaceY: string | undefined;
  let underline = false;
  for (const c of classList) {
    let m: RegExpMatchArray | null;
    if ((m = c.match(/^text-\[(\d+(?:\.\d+)?px)\]$/))) text["font-size"] = m[1];
    else if ((m = c.match(/^text-(xs|sm|base|lg|xl|2xl|3xl)$/))) text["font-size"] = SIZE_PX[m[1]];
    else if ((m = c.match(/^text-\[(#[0-9a-fA-F]{3,8})\]$/))) text.color = m[1];
    else if ((m = c.match(/^text-slate-(\d{3})$/))) text.color = SLATE[m[1]];
    else if ((m = c.match(/^font-(normal|medium|semibold|bold)$/))) text["font-weight"] = WEIGHT[m[1]];
    else if ((m = c.match(/^leading-(none|tight|snug|normal|relaxed|loose)$/))) block["line-height"] = LEADING[m[1]];
    else if ((m = c.match(/^text-(left|center|right)$/))) block["text-align"] = m[1];
    else if ((m = c.match(/^m([tby])-(\d+(?:\.\d+)?)$/))) {
      if (m[1] !== "b") block["margin-top"] = SPACE(m[2]);
      if (m[1] !== "t") block["margin-bottom"] = SPACE(m[2]);
    } else if ((m = c.match(/^p([tb])-(\d+(?:\.\d+)?)$/))) block[m[1] === "t" ? "padding-top" : "padding-bottom"] = SPACE(m[2]);
    else if ((m = c.match(/^space-y-(\d+(?:\.\d+)?)$/))) spaceY = SPACE(m[1]);
    else if (c === "border-t") block["border-top"] = block["border-top"] ?? "1px solid #e5e7eb";
    else if ((m = c.match(/^border-slate-(\d{3})$/))) block["border-top-color"] = SLATE[m[1]];
    else if (c === "underline") underline = true;
  }
  if (block["border-top-color"] && block["border-top"]) {
    block["border-top"] = `1px solid ${block["border-top-color"]}`;
    delete block["border-top-color"];
  }
  return { text, block, spaceY, underline };
}

const toStyle = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

const mergeStyle = (el: HTMLElement, o: Record<string, string>) => {
  for (const [k, v] of Object.entries(o)) if (!el.style.getPropertyValue(k)) el.style.setProperty(k, v);
};

/** Wraps an element's children in a styled span (text styles cannot live on a paragraph). */
function wrapChildren(doc: Document, el: HTMLElement, text: Record<string, string>, underline: boolean) {
  if (!Object.keys(text).length && !underline) return;
  const span = doc.createElement("span");
  span.setAttribute("style", toStyle(text));
  while (el.firstChild) span.appendChild(el.firstChild);
  if (underline) {
    const u = doc.createElement("u");
    u.appendChild(span);
    el.appendChild(u);
  } else {
    el.appendChild(span);
  }
}

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "LI"]);

export function hasLegacyClasses(html: string): boolean {
  return /\sclass="[^"]*(text-|font-|leading-|m[tby]-|p[tb]-|space-y-|underline|border-)/.test(html);
}

export function normalizeLegacyHtml(html: string): string {
  if (typeof DOMParser === "undefined" || !hasLegacyClasses(html)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;

  // Inherited text styles from wrappers flow down to their blocks.
  const visit = (el: HTMLElement, inherited: Record<string, string>, inheritedBlock: Record<string, string>) => {
    const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    const parsed = parseClasses(classes);
    el.removeAttribute("class");

    if (el.tagName === "DIV") {
      const text = { ...inherited, ...parsed.text };
      const align: Record<string, string> = parsed.block["text-align"] ? { "text-align": parsed.block["text-align"] } : {};
      const children = [...el.children] as HTMLElement[];
      children.forEach((child, i) => {
        const extra: Record<string, string> = { ...inheritedBlock, ...align };
        if (i === 0 && parsed.block["padding-top"]) extra["margin-top"] = parsed.block["padding-top"];
        if (i > 0 && parsed.spaceY) extra["margin-top"] = parsed.spaceY;
        if (i === children.length - 1 && parsed.block["padding-bottom"]) extra["margin-bottom"] = parsed.block["padding-bottom"];
        visit(child, text, extra);
      });
      el.replaceWith(...[...el.childNodes]);
      return;
    }

    if (BLOCK_TAGS.has(el.tagName)) {
      mergeStyle(el, { ...parsed.block, ...inheritedBlock });
      [...el.children].forEach((child) => visit(child as HTMLElement, {}, {}));
      wrapChildren(doc, el, { ...inherited, ...parsed.text }, parsed.underline);
      return;
    }

    // Inline element (span, a, strong, …): text styles go on the element itself or a span inside.
    [...el.children].forEach((child) => visit(child as HTMLElement, {}, {}));
    const text = { ...inherited, ...parsed.text };
    if (el.tagName === "SPAN") {
      mergeStyle(el, text);
      if (parsed.underline) {
        const u = doc.createElement("u");
        el.replaceWith(u);
        u.appendChild(el);
      }
    } else {
      wrapChildren(doc, el, text, parsed.underline);
    }
  };

  [...body.children].forEach((child) => visit(child as HTMLElement, {}, {}));
  return body.innerHTML;
}
