import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    lineHeight: {
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
    fontWeight: {
      setFontWeight: (weight: string) => ReturnType;
      unsetFontWeight: () => ReturnType;
    };
    letterSpacing: {
      setLetterSpacing: (value: string) => ReturnType;
      unsetLetterSpacing: () => ReturnType;
    };
    fontFamily: {
      setFontFamily: (font: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
  }
}

/** yesform-style font size on the `textStyle` mark, stored as `"11pt"`. */

/** Custom robust FontFamily on the `textStyle` mark. */
export const FontFamily = Extension.create({
  name: "fontFamily",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el) => el.style.fontFamily?.replace(/['"]+/g, "") || null,
            renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family: "${attrs.fontFamily}"` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontFamily:
        (font) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: font }).run(),
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** Paragraph-level line height (`line-height: 1.5`), like yesform's 줄간격 menu. */
export const LineHeight = Extension.create({
  name: "lineHeight",
  addOptions() {
    return { types: ["paragraph", "heading"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (value) =>
        ({ commands }) =>
          this.options.types.map((t: string) => commands.updateAttributes(t, { lineHeight: value })).some(Boolean),
      unsetLineHeight:
        () =>
        ({ commands }) =>
          this.options.types.map((t: string) => commands.resetAttributes(t, "lineHeight")).some(Boolean),
    };
  },
});

const INDENT_STEP_PX = 32;
const MAX_INDENT = 8;

/** Paragraph indent in 32px steps (yesform `margin-left: 32px` per 들여쓰기). */
export const Indent = Extension.create({
  name: "indent",
  addOptions() {
    return { types: ["paragraph", "heading"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const val = parseFloat(el.style.marginLeft) || 0;
              if (val > 0 && Math.abs(val % INDENT_STEP_PX) < 0.05) {
                return Math.round(val / INDENT_STEP_PX);
              }
              return 0;
            },
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * INDENT_STEP_PX}px` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    const shift =
      (delta: number) =>
      () =>
      ({ tr, state, dispatch }: { tr: import("@tiptap/pm/state").Transaction; state: import("@tiptap/pm/state").EditorState; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
        let changed = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (!this.options.types.includes(node.type.name)) return true;
          const current = node.attrs.indent || 0;
          const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
          if (next !== current) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
          return false;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return {
      indent: shift(1),
      outdent: shift(-1),
    };
  },
});

/** Numeric font weight on the `textStyle` mark (500/600 etc. that `bold` cannot express). */
export const FontWeight = Extension.create({
  name: "fontWeight",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontWeight: {
            default: null,
            parseHTML: (el) => el.style.fontWeight || null,
            renderHTML: (attrs) => (attrs.fontWeight ? { style: `font-weight: ${attrs.fontWeight}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontWeight:
        (weight) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontWeight: weight }).run(),
      unsetFontWeight:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontWeight: null }).removeEmptyTextStyle().run(),
    };
  },
});

/**
 * Letter spacing on the `textStyle` mark (yesform `letterSpacing`). Imported fixed-layout pages use
 * it per word so glyph runs land where the source PDF placed them.
 */
export const LetterSpacing = Extension.create({
  name: "letterSpacing",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (el) => el.style.letterSpacing || null,
            renderHTML: (attrs) => (attrs.letterSpacing ? { style: `letter-spacing: ${attrs.letterSpacing}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLetterSpacing:
        (value) =>
        ({ chain }) =>
          chain().setMark("textStyle", { letterSpacing: value }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { letterSpacing: null }).removeEmptyTextStyle().run(),
    };
  },
});

/**
 * Inline margin-left on the `textStyle` mark (for sub-pixel inter-span coordinate alignment).
 */
export const InlineMargin = Extension.create({
  name: "inlineMargin",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          marginLeft: {
            default: null,
            parseHTML: (el) => el.style.marginLeft || null,
            renderHTML: (attrs) => (attrs.marginLeft ? { style: `margin-left: ${attrs.marginLeft}; display: inline-block` } : {}),
          },
        },
      },
    ];
  },
});

/**
 * Named paragraph style (한글 · 워드 "스타일") — `<p data-style="b1">`. Indent, hanging indent, spacing and size
 * come from the style registry CSS (`paragraphStyleCss`), so the id must survive every edit round-trip.
 */
export const ParagraphStyle = Extension.create({
  name: "paragraphStyle",
  addOptions() {
    return { types: ["paragraph"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          paraStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-style") || null,
            renderHTML: (attrs) => (attrs.paraStyle ? { "data-style": attrs.paraStyle } : {}),
          },
        },
      },
    ];
  },
});

/** Properties other paragraph attributes own; `blockStyle` keeps everything else. */
const OWNED_BLOCK_PROPS = new Set(["text-align", "line-height"]);

/**
 * Free-form paragraph CSS (margins, padding, borders, colour) kept verbatim, like yesform's
 * `blockStyle` attribute. Without it Tiptap drops every paragraph style it has no attribute for.
 */
export const BlockStyle = Extension.create({
  name: "blockStyle",
  addOptions() {
    return { types: ["paragraph", "heading"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          blockStyle: {
            default: null,
            parseHTML: (el) => {
              const kept: string[] = [];
              for (let i = 0; i < el.style.length; i++) {
                const prop = el.style.item(i);
                if (!OWNED_BLOCK_PROPS.has(prop)) kept.push(`${prop}: ${el.style.getPropertyValue(prop)}`);
              }
              return kept.length ? kept.join("; ") : null;
            },
            renderHTML: (attrs) => (attrs.blockStyle ? { style: attrs.blockStyle } : {}),
          },
        },
      },
    ];
  },
});
