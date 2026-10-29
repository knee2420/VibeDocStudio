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
  }
}

/** yesform-style font size on the `textStyle` mark, stored as `"11pt"`. */
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
            parseHTML: (el) => Math.round((parseFloat(el.style.marginLeft) || 0) / INDENT_STEP_PX),
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

/** Properties other paragraph attributes own; `blockStyle` keeps everything else. */
const OWNED_BLOCK_PROPS = new Set(["text-align", "line-height", "margin-left"]);

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
